import json
import os
import sys
from pathlib import Path


_TORCH = None
_OPEN_CLIP = None
_PIL_IMAGE = None
_MODEL_CACHE = {}
_OPEN_CLIP_PATHS = set()


def _grayscale_signature(image, size=32):
    thumb = image.resize((size, size)).convert("L")
    return [px / 255.0 for px in thumb.getdata()]


def _average_hash_bits(image, size=16):
    thumb = image.resize((size, size)).convert("L")
    pixels = list(thumb.getdata())
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
    gray_score = _sequence_similarity(ref_gray, cand_gray)
    hash_score = _hash_similarity(ref_hash, cand_hash)
    return (gray_score * 0.55) + (hash_score * 0.45)


def _ensure_local_hf_cache(root_dir):
    cache_root = Path(root_dir) / "AI" / "huggingface_cache"
    cache_root.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(cache_root))
    os.environ.setdefault("HUGGINGFACE_HUB_CACHE", str(cache_root / "hub"))
    os.environ.setdefault("TRANSFORMERS_CACHE", str(cache_root / "transformers"))


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

    batch_size = 24 if device == "cuda" else 10
    max_clip_eval_cpu = 160

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
                        image = Image.open(row["imagePath"]).convert("RGB")
                        direct_similarity = _direct_image_similarity(query_direct_gray, query_direct_hash, image)
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
                tensors = []
                metas = []
                for row in chunk:
                    try:
                        image = Image.open(row["imagePath"]).convert("RGB")
                        tensors.append(preprocess(image))
                        metas.append(row)
                    except Exception:
                        continue

                if not tensors:
                    continue

                image_batch = torch.stack(tensors, dim=0).to(device)
                image_features = model.encode_image(image_batch)
                image_features = image_features / image_features.norm(dim=-1, keepdim=True)
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


def _handle_command(payload):
    command = str(payload.get("command") or "rank").strip().lower()
    if command == "shutdown":
        return {"success": True, "shuttingDown": True}
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
