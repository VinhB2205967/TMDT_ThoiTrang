import json
import logging
import os
import sys
import warnings
from collections import OrderedDict
from pathlib import Path


_TORCH = None
_OPEN_CLIP = None
_PIL_IMAGE = None
_MODEL_CACHE = {}
_OPEN_CLIP_PATHS = set()
_SIGNATURE_CACHE = OrderedDict()
_FEATURE_CACHE = OrderedDict()
_SIGNATURE_CACHE_MAX = max(200, int(os.getenv("OPENCLIP_SIGNATURE_CACHE_MAX", "2200")))
_FEATURE_CACHE_MAX = max(200, int(os.getenv("OPENCLIP_FEATURE_CACHE_MAX", "2600")))


def _silence_known_warnings():
    warnings.filterwarnings(
        "ignore",
        message=r".*You are sending unauthenticated requests to the HF Hub.*",
    )
    # Keep worker stderr clean so Node timeout errors are actionable.
    logging.getLogger("huggingface_hub.utils._http").setLevel(logging.ERROR)


def _get_flattened_pixels(image):
    getter = getattr(image, "get_flattened_data", None)
    if callable(getter):
        return list(getter())
    return list(image.getdata())


def _grayscale_signature(image, size=32):
    thumb = image.resize((size, size)).convert("L")
    return [px / 255.0 for px in _get_flattened_pixels(thumb)]


def _average_hash_bits(image, size=16):
    thumb = image.resize((size, size)).convert("L")
    pixels = _get_flattened_pixels(thumb)
    if not pixels:
        return []
    avg = sum(pixels) / len(pixels)
    return [1 if px >= avg else 0 for px in pixels]


def _sequence_similarity(a, b):
    if not a or not b or len(a) != len(b):
        return 0.0
    diff = sum(abs(x - y) for x, y in zip(a, b)) / len(a)
    return max(0.0, 1.0 - diff)


def _hash_similarity(a, b):
    if not a or not b or len(a) != len(b):
        return 0.0
    mismatches = sum(1 for x, y in zip(a, b) if x != y)
    return max(0.0, 1.0 - (mismatches / len(a)))


def _direct_image_similarity(ref_gray, ref_hash, image):
    cand_gray = _grayscale_signature(image)
    cand_hash = _average_hash_bits(image)
    return _direct_image_similarity_from_signatures(ref_gray, ref_hash, cand_gray, cand_hash)


def _direct_image_similarity_from_signatures(ref_gray, ref_hash, cand_gray, cand_hash):
    gray_score = _sequence_similarity(ref_gray, cand_gray)
    hash_score = _hash_similarity(ref_hash, cand_hash)
    return (gray_score * 0.55) + (hash_score * 0.45)


def _ensure_local_hf_cache(root_dir):
    cache_root = Path(root_dir) / "AI" / "huggingface_cache"
    cache_root.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(cache_root))
    os.environ.setdefault("HUGGINGFACE_HUB_CACHE", str(cache_root / "hub"))


def _write_output_line(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _iter_chunks(seq, size):
    chunk_size = max(1, int(size or 1))
    for i in range(0, len(seq), chunk_size):
        yield seq[i : i + chunk_size]


def _normalize_path(raw):
    if not raw:
        return ""
    return str(Path(raw).expanduser())


def _lru_get(cache, key):
    if not key or key not in cache:
        return None
    value = cache.pop(key)
    cache[key] = value
    return value


def _lru_set(cache, key, value, max_size):
    if not key:
        return
    if key in cache:
        cache.pop(key)
    cache[key] = value
    while len(cache) > max(10, int(max_size or 10)):
        cache.popitem(last=False)


def _file_version_key(image_path):
    try:
        stat = os.stat(image_path)
        return f"{str(Path(image_path).resolve())}:{int(stat.st_mtime_ns)}:{int(stat.st_size)}"
    except Exception:
        return ""


def _signature_cache_key(image_path):
    return _file_version_key(image_path)


def _feature_cache_key(image_path, model_name, pretrained):
    base = _file_version_key(image_path)
    if not base:
        return ""
    return f"{base}:{model_name}:{pretrained}"


def _get_or_build_signature(image_path, Image):
    cache_key = _signature_cache_key(image_path)
    cached = _lru_get(_SIGNATURE_CACHE, cache_key)
    if cached is not None:
        return cached

    with Image.open(image_path) as image_file:
        image = image_file.convert("RGB")
        gray = _grayscale_signature(image)
        ahash = _average_hash_bits(image)

    value = (gray, ahash)
    _lru_set(_SIGNATURE_CACHE, cache_key, value, _SIGNATURE_CACHE_MAX)
    return value


def _get_or_build_image_feature(image_path, bundle, model_name, pretrained):
    torch = bundle["torch"]
    Image = bundle["Image"]
    model = bundle["model"]
    preprocess = bundle["preprocess"]
    device = bundle["device"]

    cache_key = _feature_cache_key(image_path, model_name, pretrained)
    cached_cpu = _lru_get(_FEATURE_CACHE, cache_key)
    if cached_cpu is not None:
        return cached_cpu.to(device)

    with Image.open(image_path) as image_file:
        image = image_file.convert("RGB")
        tensor = preprocess(image).unsqueeze(0).to(device)

    feature = model.encode_image(tensor)
    feature = feature / feature.norm(dim=-1, keepdim=True)
    feature_cpu = feature.squeeze(0).detach().to("cpu")
    _lru_set(_FEATURE_CACHE, cache_key, feature_cpu, _FEATURE_CACHE_MAX)
    return feature_cpu.to(device)


def _load_open_clip_module(root_dir):
    global _TORCH, _OPEN_CLIP, _PIL_IMAGE

    _ensure_local_hf_cache(root_dir)

    open_clip_src = Path(root_dir) / "AI" / "open_clip" / "src"
    if open_clip_src.exists():
        open_clip_src_str = str(open_clip_src)
        if open_clip_src_str not in _OPEN_CLIP_PATHS:
            sys.path.insert(0, open_clip_src_str)
            _OPEN_CLIP_PATHS.add(open_clip_src_str)

    if _TORCH is None or _OPEN_CLIP is None or _PIL_IMAGE is None:
        import torch
        import open_clip
        from PIL import Image

        _TORCH = torch
        _OPEN_CLIP = open_clip
        _PIL_IMAGE = Image

    return _TORCH, _OPEN_CLIP, _PIL_IMAGE


def _get_model_bundle(root_dir, model_name, pretrained):
    torch, open_clip, Image = _load_open_clip_module(root_dir)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    cache_key = (str(Path(root_dir).resolve()), model_name, pretrained, device)

    bundle = _MODEL_CACHE.get(cache_key)
    if bundle is None:
        model, _, preprocess = open_clip.create_model_and_transforms(model_name, pretrained=pretrained, device=device)
        tokenizer = open_clip.get_tokenizer(model_name)
        model.eval()
        bundle = {
            "torch": torch,
            "Image": Image,
            "model": model,
            "preprocess": preprocess,
            "tokenizer": tokenizer,
            "device": device,
        }
        _MODEL_CACHE[cache_key] = bundle

    return bundle


def _prepare_valid_rows(candidates):
    valid_rows = []
    for item in candidates:
        item_id = str((item or {}).get("id") or "").strip()
        image_path = _normalize_path((item or {}).get("imagePath"))
        source = str((item or {}).get("source") or "main").strip() or "main"
        if not item_id or not image_path:
            continue
        if not os.path.exists(image_path):
            continue
        valid_rows.append({"id": item_id, "imagePath": image_path, "source": source})
    return valid_rows


def _rank_payload(payload):
    query = str(payload.get("query") or "").strip()
    image_query_path = _normalize_path(payload.get("imageQueryPath"))
    candidates = payload.get("candidates") or []
    top_k = int(payload.get("topK") or 6)
    model_name = str(payload.get("modelName") or "ViT-B-32").strip() or "ViT-B-32"
    pretrained = str(payload.get("pretrained") or "laion2b_s34b_b79k").strip() or "laion2b_s34b_b79k"
    root_dir = str(payload.get("rootDir") or os.getcwd())

    if not query and not image_query_path:
        return {"success": True, "matches": [], "model": model_name, "pretrained": pretrained}

    if not isinstance(candidates, list) or len(candidates) == 0:
        return {"success": True, "matches": [], "model": model_name, "pretrained": pretrained}

    try:
        bundle = _get_model_bundle(root_dir, model_name, pretrained)
    except Exception as exc:
        return {"success": False, "error": f"MODEL_INIT_ERROR: {exc}", "matches": []}

    torch = bundle["torch"]
    Image = bundle["Image"]
    model = bundle["model"]
    preprocess = bundle["preprocess"]
    tokenizer = bundle["tokenizer"]
    device = bundle["device"]

    batch_size = 24 if device == "cuda" else 12
    max_clip_eval_cpu = max(40, int(os.getenv("OPENCLIP_MAX_CLIP_EVAL_CPU", "96")))

    valid_rows = _prepare_valid_rows(candidates)
    if len(valid_rows) == 0:
        return {"success": True, "matches": [], "model": model_name, "pretrained": pretrained, "device": device}

    if image_query_path and not os.path.exists(image_query_path):
        return {"success": False, "error": "IMAGE_QUERY_NOT_FOUND", "matches": []}

    try:
        with torch.no_grad():
            target_features = None
            mode = "text"
            query_direct_gray = []
            query_direct_hash = []

            if image_query_path:
                mode = "image"
                image_query = Image.open(image_query_path).convert("RGB")
                w, h = image_query.size
                query_direct_gray = _grayscale_signature(image_query)
                query_direct_hash = _average_hash_bits(image_query)
                crop_tensors = [preprocess(image_query).unsqueeze(0).to(device)]
                if h > w:
                    upper = image_query.crop((0, 0, w, int(h * 0.72)))
                    crop_tensors.append(preprocess(upper).unsqueeze(0).to(device))
                stacked = torch.cat(crop_tensors, dim=0)
                target_features = model.encode_image(stacked).mean(dim=0, keepdim=True)
            else:
                text_tokens = tokenizer([query]).to(device)
                target_features = model.encode_text(text_tokens)

            target_features = target_features / target_features.norm(dim=-1, keepdim=True)

            scored = []
            rows_for_clip = valid_rows
            direct_sim_map = {}

            if image_query_path:
                pre_scored = []
                for row in valid_rows:
                    try:
                        cand_gray, cand_hash = _get_or_build_signature(row["imagePath"], Image)
                        direct_similarity = _direct_image_similarity_from_signatures(
                            query_direct_gray,
                            query_direct_hash,
                            cand_gray,
                            cand_hash,
                        )
                        key = f"{row['id']}|{row['imagePath']}|{row.get('source', 'main')}"
                        direct_sim_map[key] = direct_similarity
                        pre_scored.append((direct_similarity, row))
                    except Exception:
                        continue

                pre_scored.sort(key=lambda x: x[0], reverse=True)
                if device == "cpu":
                    pre_scored = pre_scored[: max(1, min(max_clip_eval_cpu, len(pre_scored)))]
                rows_for_clip = [row for _, row in pre_scored]

            for chunk in _iter_chunks(rows_for_clip, batch_size):
                features = []
                metas = []
                for row in chunk:
                    try:
                        feature = _get_or_build_image_feature(row["imagePath"], bundle, model_name, pretrained)
                        features.append(feature)
                        metas.append(row)
                    except Exception:
                        continue

                if not features:
                    continue

                image_features = torch.stack(features, dim=0).to(device)
                clip_scores = (image_features @ target_features.T).squeeze(-1).tolist()

                if not isinstance(clip_scores, list):
                    clip_scores = [float(clip_scores)]

                for row, clip_score in zip(metas, clip_scores):
                    final_score = float(clip_score)
                    if image_query_path:
                        key = f"{row['id']}|{row['imagePath']}|{row.get('source', 'main')}"
                        direct_similarity = float(direct_sim_map.get(key, 0.0))
                        final_score = final_score + (direct_similarity * 0.65)
                    scored.append({"id": row["id"], "score": final_score, "source": row.get("source", "main")})

            collapsed = {}
            for item in scored:
                item_id = str((item or {}).get("id") or "").strip()
                source = str((item or {}).get("source") or "main").strip() or "main"
                if not item_id:
                    continue
                key = f"{item_id}|{source}"
                current = collapsed.get(key)
                value = float((item or {}).get("score") or 0.0)
                if current is None or value > float(current.get("score") or 0.0):
                    collapsed[key] = {"id": item_id, "score": value, "source": source}

            scored = list(collapsed.values())
            scored.sort(key=lambda x: x["score"], reverse=True)
            return {
                "success": True,
                "model": model_name,
                "pretrained": pretrained,
                "device": device,
                "mode": mode,
                "matches": scored[: max(1, top_k)]
            }
    except Exception as exc:
        return {"success": False, "error": f"INFERENCE_ERROR: {exc}", "matches": []}


def _normalize_label_entries(raw_labels):
    entries = []
    if not isinstance(raw_labels, list):
        return entries

    for item in raw_labels:
        if isinstance(item, dict):
            key = str(item.get("key") or "").strip()
            prompts_raw = item.get("prompts")
            prompts = []
            if isinstance(prompts_raw, list):
                prompts = [str(p).strip() for p in prompts_raw if str(p).strip()]
            if not key and prompts:
                key = prompts[0]
            if key and prompts:
                entries.append({"key": key, "prompts": prompts})
            continue

        text = str(item or "").strip()
        if text:
            entries.append({"key": text, "prompts": [text]})

    return entries


def _classify_payload(payload):
    image_query_path = _normalize_path(payload.get("imageQueryPath"))
    labels = _normalize_label_entries(payload.get("labels") or [])
    model_name = str(payload.get("modelName") or "ViT-B-32").strip() or "ViT-B-32"
    pretrained = str(payload.get("pretrained") or "laion2b_s34b_b79k").strip() or "laion2b_s34b_b79k"
    root_dir = str(payload.get("rootDir") or os.getcwd())

    if not image_query_path or not os.path.exists(image_query_path):
        return {"success": False, "error": "IMAGE_QUERY_NOT_FOUND", "labels": []}

    if not labels:
        return {
            "success": True,
            "predictedKey": "",
            "labels": [],
            "model": model_name,
            "pretrained": pretrained,
        }

    try:
        bundle = _get_model_bundle(root_dir, model_name, pretrained)
    except Exception as exc:
        return {"success": False, "error": f"MODEL_INIT_ERROR: {exc}", "labels": []}

    torch = bundle["torch"]
    Image = bundle["Image"]
    model = bundle["model"]
    preprocess = bundle["preprocess"]
    tokenizer = bundle["tokenizer"]
    device = bundle["device"]

    try:
        with torch.no_grad():
            image = Image.open(image_query_path).convert("RGB")
            image_tensor = preprocess(image).unsqueeze(0).to(device)
            image_features = model.encode_image(image_tensor)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)

            prompt_list = []
            prompt_to_label = []
            for entry in labels:
                key = str(entry.get("key") or "").strip()
                prompts = entry.get("prompts") or []
                if not key:
                    continue
                for prompt in prompts:
                    text = str(prompt or "").strip()
                    if not text:
                        continue
                    prompt_list.append(text)
                    prompt_to_label.append(key)

            if not prompt_list:
                return {
                    "success": True,
                    "predictedKey": "",
                    "labels": [],
                    "model": model_name,
                    "pretrained": pretrained,
                    "device": device,
                    "mode": "classify",
                }

            text_tokens = tokenizer(prompt_list).to(device)
            text_features = model.encode_text(text_tokens)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            scores = (image_features @ text_features.T).squeeze(0).tolist()
            if not isinstance(scores, list):
                scores = [float(scores)]

            best_by_key = {}
            for idx, score in enumerate(scores):
                key = prompt_to_label[idx]
                prompt = prompt_list[idx]
                value = float(score)
                current = best_by_key.get(key)
                if current is None or value > current["score"]:
                    best_by_key[key] = {"key": key, "score": value, "prompt": prompt}

            labels_scored = sorted(best_by_key.values(), key=lambda x: x["score"], reverse=True)
            predicted_key = labels_scored[0]["key"] if labels_scored else ""

            return {
                "success": True,
                "predictedKey": predicted_key,
                "labels": labels_scored,
                "model": model_name,
                "pretrained": pretrained,
                "device": device,
                "mode": "classify",
            }
    except Exception as exc:
        return {"success": False, "error": f"CLASSIFY_ERROR: {exc}", "labels": []}


def _handle_command(payload):
    command = str(payload.get("command") or "rank").strip().lower()
    if command == "shutdown":
        return {"success": True, "shuttingDown": True}
    if command == "classify":
        return _classify_payload(payload)
    if command == "ping":
        warm = bool(payload.get("warm"))
        model_name = str(payload.get("modelName") or "ViT-B-32").strip() or "ViT-B-32"
        pretrained = str(payload.get("pretrained") or "laion2b_s34b_b79k").strip() or "laion2b_s34b_b79k"
        root_dir = str(payload.get("rootDir") or os.getcwd())
        response = {"success": True, "ready": True}
        if warm:
            try:
                bundle = _get_model_bundle(root_dir, model_name, pretrained)
                response.update({
                    "model": model_name,
                    "pretrained": pretrained,
                    "device": bundle["device"],
                    "warmed": True
                })
            except Exception as exc:
                return {"success": False, "error": f"MODEL_INIT_ERROR: {exc}", "matches": []}
        return response
    return _rank_payload(payload)


def main():
    _silence_known_warnings()
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            payload = json.loads(line)
        except Exception as exc:
            _write_output_line({"success": False, "error": f"INVALID_JSON: {exc}", "matches": []})
            continue

        request_id = str(payload.get("requestId") or "").strip()
        response = _handle_command(payload)
        if request_id:
            response["requestId"] = request_id
        _write_output_line(response)

        if bool(response.get("shuttingDown")):
            break


if __name__ == "__main__":
    main()
