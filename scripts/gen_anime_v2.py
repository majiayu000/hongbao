"""
二次元红包封面 - 第二轮变体生成
针对方案 01-05 各生成 2 个变体
"""

import os
from pathlib import Path

from google import genai
from google.genai import types

API_KEY = os.environ["GEMINI_API_KEY"]
OUTPUT_DIR = Path(__file__).parent.parent / "output" / "anime_covers"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

client = genai.Client(api_key=API_KEY)
ASPECT_RATIO = "3:4"

PROMPTS = {
    # === 01 萌系少女变体 ===
    "01b_萌系_少女举灯笼": (
        "Adorable chibi anime girl with twin tails and big sparkling golden eyes, "
        "wearing a fluffy red Chinese New Year qipao with golden horse embroidery, "
        "joyfully lifting a glowing red lantern above her head with both hands, "
        "standing on golden clouds, red and gold fireworks in a warm sunset sky, "
        "golden sparkles and red flower petals swirling around her, "
        "cel-shaded kawaii illustration, warm red-orange palette, highly detailed"
    ),
    "01c_萌系_少女放烟花": (
        "Cute chibi anime girl with short pink hair and rosy cheeks, "
        "wearing a red fur-trimmed New Year coat with golden buttons, "
        "excitedly watching a sparkler she holds in her hand, "
        "her eyes reflecting the golden sparks, "
        "night sky filled with colorful fireworks behind her, "
        "snow gently falling, red lanterns hanging on both sides, "
        "kawaii anime illustration style, warm festive glow, soft lighting"
    ),

    # === 02 萌马变体 ===
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

    # === 03 水墨仙侠变体 ===
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
    "03c_国风_水墨少女抚琴": (
        "Beautiful anime girl in flowing white hanfu sitting gracefully, "
        "playing a guqin (Chinese zither) under a red plum blossom tree, "
        "a white horse resting peacefully behind her, "
        "Chinese ink wash painting style background with misty mountains, "
        "red plum petals falling like snow around the scene, "
        "golden koi fish swimming in a pond in the foreground, "
        "serene and ethereal atmosphere, ink splatter textures, "
        "elegant composition with generous negative space, eastern aesthetics"
    ),

    # === 04 新中式变体 ===
    "04b_国风_新中式少女窗前": (
        "New Chinese style anime illustration, "
        "beautiful girl in elegant red and black modern hanfu "
        "leaning against an ornate wooden window frame of a traditional Chinese building, "
        "looking at fireworks through the window with wonder in her eyes, "
        "a small golden horse figurine on the windowsill beside her, "
        "red lanterns glowing warmly outside, light snow falling, "
        "interior lit by warm candlelight, "
        "rich architectural details with red and gold decorations, "
        "guochao aesthetic, atmospheric anime lighting, cinematic composition"
    ),
    "04c_国风_新中式双人舞龙": (
        "New Chinese style anime illustration of two young characters, "
        "a boy and a girl in coordinating red and gold festival outfits, "
        "playfully holding a small cute dragon puppet between them, "
        "a golden chibi horse mascot running at their feet, "
        "traditional Chinese festival night market background with glowing stalls, "
        "fireworks and floating sky lanterns in the dark sky above, "
        "warm golden street lighting, red and gold color scheme, "
        "joyful energetic atmosphere, detailed anime art with guochao elements"
    ),

    # === 05 游戏CG变体 ===
    "05b_游戏CG_红甲女将": (
        "Epic anime game character illustration, "
        "fierce female warrior with long crimson hair tied in a high ponytail, "
        "wearing ornate red and gold Chinese-style battle armor with horse motifs, "
        "wielding a golden spear with red tassels, striking a dynamic combat pose, "
        "a spectral golden war horse materializing behind her in flames, "
        "fireworks and embers filling the dramatic night sky, "
        "golden energy waves radiating outward from her stance, "
        "game promotional CG art style, cinematic dramatic lighting, "
        "rich saturated colors, highly detailed rendering"
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
    try:
        response = client.models.generate_images(
            model="imagen-4.0-generate-001",
            prompt=prompt,
            config=types.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio=ASPECT_RATIO,
                safety_filter_level="BLOCK_LOW_AND_ABOVE",
            ),
        )
        if response.generated_images:
            image_data = response.generated_images[0].image.image_bytes
            output_path.write_bytes(image_data)
            print(f"  ✅ 已保存: {output_path}")
            return str(output_path)
        else:
            print(f"  ❌ 未返回图片: {name}")
            return None
    except Exception as e:
        print(f"  ❌ 生成失败: {name} - {e}")
        return None


def main():
    print("=" * 60)
    print("二次元红包封面 - 第二轮变体")
    print(f"输出目录: {OUTPUT_DIR}")
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
