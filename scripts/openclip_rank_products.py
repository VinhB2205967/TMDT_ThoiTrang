import json
import os
import sys
from pathlib import Path


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
    # Keep model cache inside project folder when env vars are not explicitly set.
    cache_root = Path(root_dir) / "AI" / "huggingface_cache"
    cache_root.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(cache_root))
    os.environ.setdefault("HUGGINGFACE_HUB_CACHE", str(cache_root / "hub"))
    os.environ.setdefault("TRANSFORMERS_CACHE", str(cache_root / "transformers"))


def _write_output(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


def _normalize_path(raw):
    if not raw:
        return ""
    return str(Path(raw).expanduser())


def _load_open_clip_module(root_dir):
    _ensure_local_hf_cache(root_dir)

    # Support local source checkout at AI/open_clip/src without requiring pip install.
    open_clip_src = Path(root_dir) / "AI" / "open_clip" / "src"
    if open_clip_src.exists():
        sys.path.insert(0, str(open_clip_src))

    import torch  # noqa: F401
    import open_clip  # noqa: F401
    from PIL import Image  # noqa: F401

    return torch, open_clip, Image


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except Exception as exc:
        _write_output({"success": False, "error": f"INVALID_JSON: {exc}", "matches": []})
        return

    query = str(payload.get("query") or "").strip()
    image_query_path = _normalize_path(payload.get("imageQueryPath"))
    candidates = payload.get("candidates") or []
    top_k = int(payload.get("topK") or 6)
    model_name = str(payload.get("modelName") or "ViT-B-32").strip() or "ViT-B-32"
    pretrained = str(payload.get("pretrained") or "laion2b_s34b_b79k").strip() or "laion2b_s34b_b79k"
    root_dir = str(payload.get("rootDir") or os.getcwd())

    if not query and not image_query_path:
        _write_output({"success": True, "matches": [], "model": model_name, "pretrained": pretrained})
        return

    if not isinstance(candidates, list) or len(candidates) == 0:
        _write_output({"success": True, "matches": [], "model": model_name, "pretrained": pretrained})
        return

    try:
        torch, open_clip, Image = _load_open_clip_module(root_dir)
    except Exception as exc:
        _write_output({"success": False, "error": f"IMPORT_ERROR: {exc}", "matches": []})
        return

    device = "cuda" if torch.cuda.is_available() else "cpu"

    try:
        model, _, preprocess = open_clip.create_model_and_transforms(model_name, pretrained=pretrained, device=device)
        tokenizer = open_clip.get_tokenizer(model_name)
    except Exception as exc:
        _write_output({"success": False, "error": f"MODEL_INIT_ERROR: {exc}", "matches": []})
        return

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

    if len(valid_rows) == 0:
        _write_output({"success": True, "matches": [], "model": model_name, "pretrained": pretrained})
        return

    if image_query_path and not os.path.exists(image_query_path):
        _write_output({"success": False, "error": "IMAGE_QUERY_NOT_FOUND", "matches": []})
        return

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
                # Portrait photo → likely a person wearing clothes.
                # Add an upper-body crop (top 72%) so the query embedding
                # focuses on the clothing area rather than legs / background.
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
            for row in valid_rows:
                try:
                    image = Image.open(row["imagePath"]).convert("RGB")
                    image_tensor = preprocess(image).unsqueeze(0).to(device)
                    image_features = model.encode_image(image_tensor)
                    image_features = image_features / image_features.norm(dim=-1, keepdim=True)
                    clip_score = float((image_features @ target_features.T).squeeze().item())
                    score = clip_score
                    if image_query_path:
                        direct_similarity = _direct_image_similarity(query_direct_gray, query_direct_hash, image)
                        score = clip_score + (direct_similarity * 0.65)
                    scored.append({"id": row["id"], "score": score, "source": row.get("source", "main")})
                except Exception:
                    # Skip invalid/corrupt images silently.
                    continue

            scored.sort(key=lambda x: x["score"], reverse=True)
            _write_output({
                "success": True,
                "model": model_name,
                "pretrained": pretrained,
                "device": device,
                "mode": mode,
                "matches": scored[: max(1, top_k)]
            })
    except Exception as exc:
        _write_output({"success": False, "error": f"INFERENCE_ERROR: {exc}", "matches": []})


if __name__ == "__main__":
    main()
