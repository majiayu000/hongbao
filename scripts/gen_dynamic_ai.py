"""
红包封面 AI 动态视频生成
使用 AtlasCloud Kling v3.0 Pro 图生视频
生成后用 FFmpeg 裁剪到红包封面规格
"""

import base64
import os
import subprocess
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

API_KEY = os.environ["AI_IMAGE_API_KEY"]
API_BASE = "https://api.atlascloud.ai"
MODEL = "kwaivgi/kling-v3.0-pro/image-to-video"

SOURCE_DIR = Path(__file__).resolve().parent.parent / "output" / "anime_covers"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output" / "anime_dynamic_ai"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# 目标图和动效 prompt
TARGETS = {
    "03_国风_水墨仙侠骑马": (
        "The girl's long black hair and crimson red sash are flowing gracefully in the wind. "
        "The white horse is trotting forward with gentle hoof movements. "
        "Red plum blossom petals are falling and drifting slowly from the branches above. "
        "The golden auspicious clouds at the bottom are slowly swirling and shifting. "
        "Subtle ink wash mist is drifting through the mountain background. "
        "Gentle, elegant, continuous motion. Smooth camera."
    ),
    "03c_国风_水墨少女抚琴": (
        "The girl's fingers are gracefully plucking the guqin strings with subtle hand movements. "
        "Her long black hair and white hanfu sleeves are swaying gently in a soft breeze. "
        "Red plum blossom petals are slowly falling from the tree branches. "
        "The golden koi fish are swimming and turning gracefully in the water below. "
        "Gentle ripples on the water surface. "
        "Serene, peaceful, continuous motion. Smooth camera."
    ),
    "04b_国风_新中式少女窗前": (
        "Snow is falling gently outside the window. "
        "Spectacular fireworks are bursting and blooming in the night sky through the window. "
        "The girl is slowly raising her hand toward a falling snowflake with wonder. "
        "Candle flames are flickering warmly on the table. "
        "Red lanterns are swaying slightly in the breeze. "
        "Warm, magical, festive atmosphere. Smooth camera."
    ),
}


def image_to_base64_uri(path: Path) -> str:
    data = path.read_bytes()
    b64 = base64.b64encode(data).decode()
    suffix = path.suffix.lower().lstrip(".")
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg"}.get(
        suffix, "image/png"
    )
    return f"data:{mime};base64,{b64}"


def generate_video(name: str, prompt: str) -> str | None:
    src_path = SOURCE_DIR / f"{name}.png"
    raw_path = OUTPUT_DIR / f"{name}_raw.mp4"
    final_path = OUTPUT_DIR / f"{name}_dynamic.mp4"

    if final_path.exists():
        print(f"  ⏭️  已存在: {final_path.name}")
        return str(final_path)

    if not src_path.exists():
        print(f"  ❌ 源图不存在: {src_path}")
        return None

    print(f"  🎬 提交图生视频: {name}")
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }

    image_uri = image_to_base64_uri(src_path)

    try:
        resp = httpx.post(
            f"{API_BASE}/api/v1/model/generateVideo",
            headers=headers,
            json={
                "model": MODEL,
                "prompt": prompt,
                "image": image_uri,
                "duration": 5,
                "cfg_scale": 0.5,
            },
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()

        inner = data.get("data", data)
        prediction_id = inner.get("id")
        poll_url = inner.get("urls", {}).get("get")

        # 检查是否直接完成
        outputs = inner.get("outputs")
        if outputs and len(outputs) > 0:
            return _download_and_process(outputs[0], raw_path, final_path, name)

        if not (prediction_id and poll_url):
            print(f"  ❓ 未知响应: {data}")
            return None

        # 轮询等待 (视频生成较慢，最多等 10 分钟)
        print(f"    ⏳ 等待生成... (ID: {prediction_id[:12]}...)")
        for i in range(150):
            time.sleep(4)
            poll = httpx.get(poll_url, headers=headers, timeout=30)
            poll.raise_for_status()
            result = poll.json()
            inner_r = result.get("data", result)
            status = inner_r.get("status", "")

            if status in ("succeeded", "completed"):
                outputs = inner_r.get("outputs")
                if outputs and len(outputs) > 0:
                    return _download_and_process(
                        outputs[0], raw_path, final_path, name
                    )
                print(f"  ❌ 完成但无视频: {inner_r}")
                return None

            if status in ("failed", "error", "canceled"):
                err = inner_r.get("error", status)
                print(f"  ❌ 生成失败: {err}")
                return None

            if i % 10 == 9:
                elapsed = (i + 1) * 4
                print(f"    ⏳ 仍在生成... ({elapsed}s, 状态: {status})")

        print(f"  ❌ 超时 (10分钟)")
        return None

    except Exception as e:
        print(f"  ❌ 失败: {name} - {e}")
        return None


def _download_and_process(
    url: str, raw_path: Path, final_path: Path, name: str
) -> str | None:
    # 1. 下载原始视频
    try:
        print(f"    📥 下载视频...")
        vid_resp = httpx.get(url, timeout=120)
        raw_path.write_bytes(vid_resp.content)
        size_mb = raw_path.stat().st_size / (1024 * 1024)
        print(f"    📦 原始: {size_mb:.1f}MB")
    except Exception as e:
        print(f"  ❌ 下载失败: {name} - {e}")
        return None

    # 2. 裁剪到 2.5 秒 + 红包封面规格编码
    print(f"    ✂️  裁剪编码...")
    cmd = [
        "ffmpeg", "-y",
        "-i", str(raw_path),
        "-t", "2.5",
        "-vf", "scale=960:1280:force_original_aspect_ratio=decrease,pad=960:1280:(ow-iw)/2:(oh-ih)/2",
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "18",
        "-maxrate", "2800k",
        "-bufsize", "5600k",
        "-pix_fmt", "yuv420p",
        "-an",
        "-movflags", "+faststart",
        str(final_path),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  ❌ 编码失败: {r.stderr[-300:]}")
        return None

    final_kb = final_path.stat().st_size / 1024
    print(f"  ✅ {final_path.name} ({final_kb:.0f}KB)")
    return str(final_path)


def main():
    print("=" * 60)
    print("红包封面 AI 动态视频 (Kling v3.0 Pro)")
    print(f"模型: {MODEL}")
    print(f"输出: {OUTPUT_DIR}")
    print("=" * 60)

    results = {}
    for name, prompt in TARGETS.items():
        print(f"\n📌 {name}")
        path = generate_video(name, prompt)
        results[name] = path

    print("\n" + "=" * 60)
    ok = sum(1 for v in results.values() if v)
    print(f"完成: {ok}/{len(results)} 个视频")
    for name, path in results.items():
        tag = "✅" if path else "❌"
        print(f"  {tag} {name}")


if __name__ == "__main__":
    main()
