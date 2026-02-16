"""
二次元动态红包封面 - AI 底图生成脚本
使用 AtlasCloud API (Imagen 4) 生成底图
"""

import os
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env.local")

API_KEY = os.environ["AI_IMAGE_API_KEY"]
API_BASE = "https://api.atlascloud.ai"
MODEL = "google/imagen4"
OUTPUT_DIR = Path(__file__).parent.parent / "output" / "anime_covers_v3"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# 红包封面 3:4 竖版，2K 分辨率
ASPECT_RATIO = "3:4"
RESOLUTION = "2k"

PROMPTS = {
    # === 方案一：原创萌系 ===
    "01_萌系_Q版少女拜年": (
        "Adorable chibi anime girl with big sparkling eyes and rosy cheeks, "
        "wearing a red Chinese New Year hanfu dress with golden horse-ear hair accessories, "
        "holding a glowing golden red envelope (hongbao) with both hands, "
        "fireworks bursting in the warm night sky behind her, "
        "red lanterns and golden auspicious clouds surrounding her, "
        "golden confetti and sparkle particles floating everywhere, "
        "warm red and gold gradient background, "
        "festive joyful spring festival atmosphere, "
        "cel-shaded kawaii illustration style, vibrant saturated colors, "
        "highly detailed anime art"
    ),
    "02_萌系_萌马贺岁": (
        "Super cute chibi white horse character with big round anime eyes, "
        "anthropomorphic kawaii style, wearing a luxurious red Chinese New Year silk cape "
        "with intricate golden embroidery and tassels, "
        "a shiny golden bell hanging from its neck, "
        "hugging a large red fortune bag overflowing with gold coins, "
        "surrounded by floating golden confetti, red flower petals, and sparkles, "
        "warm tangerine-red bokeh background with soft glow, "
        "Japanese kawaii illustration style, round soft linework, "
        "extremely cute and charming, year of the horse 2026 spring festival"
    ),
    "02b_萌系_萌马舞狮": (
        "Super cute chibi white horse character with big round anime eyes and pink blush, "
        "wearing a tiny red and gold lion dance costume head on top, "
        "prancing happily with little golden hooves, "
        "surrounded by red firecrackers popping and golden confetti exploding, "
        "traditional Chinese festival street background with red banners, "
        "kawaii Japanese illustration style, warm red and gold colors, "
        "extremely adorable, festive energy, spring festival celebration"
    ),
    "02c_萌系_萌马送红包": (
        "Extremely cute chibi horse character with fluffy cream-colored mane, "
        "big sparkling anime eyes with star reflections, "
        "wearing a red scarf with golden tassels around its neck, "
        "holding out a golden-trimmed red envelope toward the viewer with a warm smile, "
        "background of falling red envelopes and golden coins in soft bokeh, "
        "cherry blossom petals floating gently, "
        "warm golden hour lighting, kawaii anime art style, "
        "heartwarming and inviting composition"
    ),

    # === 方案二：国风融合 ===
    "03_国风_水墨仙侠骑马": (
        "Elegant anime girl with long flowing black hair riding a majestic white horse, "
        "Chinese ink wash painting style blended with anime aesthetics, "
        "wearing a flowing white silk hanfu with a crimson red sash billowing in the wind, "
        "misty mountain landscape background with ink wash textures, "
        "red plum blossom branches in the foreground with scattered petals, "
        "golden auspicious clouds rising from below the composition, "
        "negative space composition with elegant restraint, "
        "ethereal and dreamlike eastern mythology atmosphere, "
        "ink splatter and brush stroke texture details, "
        "red and gold accent colors on monochrome ink base"
    ),
    "03b_国风_水墨白马独立": (
        "Majestic white horse standing alone on a cliff edge, "
        "Chinese ink wash painting style with anime-influenced details, "
        "long flowing mane blowing in the wind like silk ribbons, "
        "misty mountains and pine trees in the ink wash background, "
        "red plum blossom tree beside the horse with scattered petals, "
        "golden sunrise light breaking through clouds at the horizon, "
        "calligraphic brush stroke textures, elegant negative space composition, "
        "oriental aesthetic with subtle anime refinement, red and gold accents"
    ),
    "04_国风_新中式庭院": (
        "New Chinese style anime illustration, "
        "beautiful young character in a modernized black and red hanfu outfit "
        "holding a glowing red paper lantern with golden calligraphy writing, "
        "accompanied by a tiny adorable golden horse mascot standing beside them, "
        "traditional Chinese courtyard setting at night with red lanterns hanging from wooden eaves, "
        "spectacular fireworks lighting up the dark sky above, "
        "light snowfall creating a magical atmosphere, "
        "warm golden bokeh lights scattered throughout the scene, "
        "detailed ornamental patterns on architecture, "
        "guochao contemporary Chinese aesthetic with anime coloring"
    ),

    # === 方案三：游戏CG风 ===
    "05_游戏CG_金发战姬": (
        "Stunning anime game character illustration, "
        "girl with flowing golden hair and crystalline detailed eyes, "
        "wearing an ornate red and gold Chinese New Year limited edition ceremonial gown "
        "with intricate golden embroidery and flowing ribbons, "
        "conjuring a brilliant glowing golden sphere of elemental light in her palm, "
        "spectacular fireworks exploding in the night sky behind her, "
        "luminous golden particles orbiting her figure creating magical trails, "
        "a warmly lit festive fantasy town with paper lanterns in the background, "
        "game promotional CG art style, rich saturated colors, "
        "dramatic cinematic lighting with rim light, highly detailed"
    ),
    "05c_游戏CG_仙女御马": (
        "Breathtaking anime game character art, "
        "ethereal goddess-like girl with long flowing silver-white hair and blue eyes, "
        "wearing an elegant red and gold celestial robe with flowing ribbons, "
        "floating gracefully in the sky riding a magnificent golden horse with wings, "
        "trail of golden stardust and red flower petals behind them, "
        "a full moon and spectacular fireworks illuminating the night sky, "
        "celestial clouds and floating lanterns in the background, "
        "game CG illustration style, dreamy atmosphere, "
        "luminous ethereal lighting, highly detailed fantasy art"
    ),
}


def generate_image(name: str, prompt: str) -> str | None:
    output_path = OUTPUT_DIR / f"{name}.png"
    if output_path.exists():
        print(f"  ⏭️  已存在，跳过: {name}")
        return str(output_path)

    print(f"  🎨 生成中: {name}")
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        # 1. 提交生成请求
        resp = httpx.post(
            f"{API_BASE}/api/v1/model/generateImage",
            headers=headers,
            json={
                "model": MODEL,
                "prompt": prompt,
                "aspect_ratio": ASPECT_RATIO,
                "resolution": RESOLUTION,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        # 响应在 data 字段里
        inner = data.get("data", data)
        prediction_id = inner.get("id")
        poll_url = inner.get("urls", {}).get("get")

        # 检查是否已直接完成
        outputs = inner.get("outputs")
        if outputs and len(outputs) > 0:
            return _download_and_save(outputs[0], output_path, name)

        # 2. 轮询等待结果
        if prediction_id and poll_url:
            print(f"    ⏳ 等待生成...")
            for i in range(90):  # 最多等 3 分钟
                time.sleep(2)
                poll = httpx.get(poll_url, headers=headers, timeout=30)
                poll.raise_for_status()
                result = poll.json()
                inner_r = result.get("data", result)
                status = inner_r.get("status", "")

                if status in ("succeeded", "completed"):
                    outputs = inner_r.get("outputs")
                    if outputs and len(outputs) > 0:
                        return _download_and_save(outputs[0], output_path, name)
                    print(f"  ❌ 完成但无图片: {inner_r}")
                    return None

                if status in ("failed", "error", "canceled"):
                    print(f"  ❌ 生成失败: {inner_r.get('error', status)}")
                    return None

                if i % 5 == 4:
                    print(f"    ⏳ 仍在生成... ({(i+1)*2}s)")

            print(f"  ❌ 超时")
            return None

        print(f"  ❓ 未知响应: {data}")
        return None

    except Exception as e:
        print(f"  ❌ 失败: {name} - {e}")
        return None


def _download_and_save(url: str, output_path: Path, name: str) -> str | None:
    try:
        img_resp = httpx.get(url, timeout=60)
        output_path.write_bytes(img_resp.content)
        print(f"  ✅ 已保存: {output_path}")
        return str(output_path)
    except Exception as e:
        print(f"  ❌ 下载失败: {name} - {e}")
        return None


def main():
    print("=" * 60)
    print("二次元红包封面底图生成 (AtlasCloud Imagen 4)")
    print(f"模型: {MODEL}")
    print(f"比例: {ASPECT_RATIO}  分辨率: {RESOLUTION}")
    print(f"输出: {OUTPUT_DIR}")
    print("=" * 60)

    results = {}
    for name, prompt in PROMPTS.items():
        print(f"\n📌 {name}")
        path = generate_image(name, prompt)
        results[name] = path

    print("\n" + "=" * 60)
    success = sum(1 for p in results.values() if p)
    print(f"完成: {success}/{len(results)} 张")


if __name__ == "__main__":
    main()
