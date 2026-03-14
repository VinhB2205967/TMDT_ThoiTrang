import json
import os
import sys
from pathlib import Path


def ensure_local_hf_cache(root_dir):
    cache_root = root_dir / 'AI' / 'huggingface_cache'
    cache_root.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault('HF_HOME', str(cache_root))
    os.environ.setdefault('HUGGINGFACE_HUB_CACHE', str(cache_root / 'hub'))
    os.environ.setdefault('TRANSFORMERS_CACHE', str(cache_root / 'transformers'))


def main():
    model_name = os.getenv('OPENCLIP_MODEL_NAME', 'ViT-B-32')
    pretrained = os.getenv('OPENCLIP_PRETRAINED', 'laion2b_s34b_b79k')

    root_dir = Path(__file__).resolve().parents[1]
    ensure_local_hf_cache(root_dir)
    open_clip_src = root_dir / 'AI' / 'open_clip' / 'src'
    if open_clip_src.exists():
        sys.path.insert(0, str(open_clip_src))

    try:
        import torch
        import open_clip

        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        open_clip.create_model_and_transforms(model_name, pretrained=pretrained, device=device)
        print(json.dumps({
            'success': True,
            'model': model_name,
            'pretrained': pretrained,
            'device': device,
            'message': 'OpenCLIP model downloaded and initialized successfully.'
        }, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({
            'success': False,
            'model': model_name,
            'pretrained': pretrained,
            'error': str(exc)
        }, ensure_ascii=False))
        sys.exit(1)


if __name__ == '__main__':
    main()
