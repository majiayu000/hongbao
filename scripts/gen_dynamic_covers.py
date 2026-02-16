"""
红包封面动态效果生成
Pillow 逐帧渲染 + FFmpeg H.264 编码
输出: 957×1278 MP4, 2秒 25fps, ≤3000kbps
"""

import math
import os
import random
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SOURCE_DIR = Path(__file__).resolve().parent.parent / "output" / "anime_covers_v2"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output" / "anime_covers_dynamic"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# 微信红包封面视频规格
DURATION = 2.5  # 秒
FPS = 25
TOTAL_FRAMES = int(DURATION * FPS)
OUT_W, OUT_H = 960, 1280  # H.264 需要偶数尺寸，3:4 比例
BITRATE = "2800k"


def ease_in_out(t: float) -> float:
    """平滑缓入缓出"""
    return t * t * (3 - 2 * t)


# ── 粒子系统 ──────────────────────────────────────────


class Petal:
    """梅花花瓣 (03 水墨骑马)"""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.reset(init=True)

    def reset(self, init=False):
        self.x = random.uniform(-20, self.w + 20)
        self.y = random.uniform(-60, -10) if not init else random.uniform(0, self.h)
        self.size = random.uniform(3, 8)
        self.vy = random.uniform(1.2, 3.0)
        self.vx = random.uniform(0.5, 2.0)  # 随风右飘
        self.alpha = random.randint(140, 220)
        self.wobble_phase = random.uniform(0, math.pi * 2)
        self.wobble_amp = random.uniform(0.3, 1.0)

    def update(self):
        self.y += self.vy
        self.wobble_phase += 0.08
        self.x += self.vx + math.sin(self.wobble_phase) * self.wobble_amp
        if self.y > self.h + 20 or self.x > self.w + 30:
            self.reset()

    def draw(self, draw: ImageDraw.ImageDraw):
        s = self.size
        # 椭圆花瓣，红粉色
        r = random.randint(200, 240)
        g = random.randint(80, 130)
        b = random.randint(100, 140)
        draw.ellipse(
            [self.x - s, self.y - s * 0.5, self.x + s, self.y + s * 0.5],
            fill=(r, g, b, self.alpha),
        )


class Snowflake:
    """雪花粒子 (04 新中式庭院)"""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.reset(init=True)

    def reset(self, init=False):
        self.x = random.uniform(0, self.w)
        self.y = random.uniform(-80, -5) if not init else random.uniform(0, self.h)
        self.size = random.uniform(1.5, 5.0)
        self.vy = random.uniform(1.0, 3.5)
        self.vx = random.uniform(-0.8, 0.8)
        self.alpha = random.randint(100, 220)
        self.wobble_phase = random.uniform(0, math.pi * 2)

    def update(self):
        self.y += self.vy
        self.wobble_phase += 0.06
        self.x += self.vx + math.sin(self.wobble_phase) * 0.6
        if self.y > self.h + 10:
            self.reset()

    def draw(self, draw: ImageDraw.ImageDraw):
        s = self.size
        draw.ellipse(
            [self.x - s, self.y - s, self.x + s, self.y + s],
            fill=(255, 255, 255, self.alpha),
        )


class Sparkle:
    """金色闪烁粒子 (05c 仙女御马)"""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.reset(init=True)

    def reset(self, init=False):
        self.x = random.uniform(0, self.w)
        self.y = random.uniform(0, self.h)
        self.size = random.uniform(1.5, 4.5)
        self.phase = random.uniform(0, math.pi * 2)
        self.speed = random.uniform(0.06, 0.14)
        self.max_alpha = random.randint(150, 255)
        self.vx = random.uniform(-0.2, 0.2)
        self.vy = random.uniform(-0.8, -0.2)  # 缓慢上飘

    def update(self):
        self.phase += self.speed
        self.x += self.vx
        self.y += self.vy
        if self.phase > math.pi * 2:
            self.phase -= math.pi * 2
            # 小概率重新定位
            if random.random() < 0.15:
                self.x = random.uniform(0, self.w)
                self.y = random.uniform(0, self.h)
        if self.y < -10:
            self.y = self.h + 5
            self.x = random.uniform(0, self.w)

    def draw(self, draw: ImageDraw.ImageDraw):
        brightness = max(0, math.sin(self.phase))
        alpha = int(self.max_alpha * brightness)
        if alpha < 15:
            return
        s = self.size * (0.5 + 0.5 * brightness)
        # 金色光点
        draw.ellipse(
            [self.x - s, self.y - s, self.x + s, self.y + s],
            fill=(255, 215, 80, alpha),
        )
        # 十字光芒
        if brightness > 0.6:
            line_len = s * 2.5
            line_alpha = int(alpha * 0.5)
            draw.line(
                [self.x - line_len, self.y, self.x + line_len, self.y],
                fill=(255, 230, 120, line_alpha),
                width=1,
            )
            draw.line(
                [self.x, self.y - line_len, self.x, self.y + line_len],
                fill=(255, 230, 120, line_alpha),
                width=1,
            )


class Bokeh:
    """暖色光斑 (04 庭院补充)"""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.reset(init=True)

    def reset(self, init=False):
        self.x = random.uniform(0, self.w)
        self.y = random.uniform(0, self.h)
        self.size = random.uniform(8, 25)
        self.phase = random.uniform(0, math.pi * 2)
        self.speed = random.uniform(0.03, 0.08)
        self.max_alpha = random.randint(30, 70)
        self.vy = random.uniform(-0.3, 0.3)

    def update(self):
        self.phase += self.speed
        self.y += self.vy

    def draw(self, draw: ImageDraw.ImageDraw):
        brightness = 0.5 + 0.5 * math.sin(self.phase)
        alpha = int(self.max_alpha * brightness)
        s = self.size
        draw.ellipse(
            [self.x - s, self.y - s, self.x + s, self.y + s],
            fill=(255, 200, 80, alpha),
        )


# ── 动效配置 ──────────────────────────────────────────

EFFECTS = {
    "03_国风_水墨仙侠骑马": {
        "zoom": (1.0, 1.06),
        "pan_x": (0.0, 0.015),  # 微右移 (骑马方向感)
        "pan_y": (0.0, 0.008),
        "particles": lambda w, h: [Petal(w, h) for _ in range(20)],
    },
    "05c_游戏CG_仙女御马": {
        "zoom": (1.07, 1.0),  # 缩放出 (展现全景)
        "pan_x": (0.0, 0.0),
        "pan_y": (0.01, -0.01),  # 微上移 (飞行感)
        "particles": lambda w, h: [Sparkle(w, h) for _ in range(35)],
    },
    "04_国风_新中式庭院": {
        "zoom": (1.0, 1.04),
        "pan_x": (0.0, 0.0),
        "pan_y": (0.0, 0.005),
        "particles": lambda w, h: (
            [Snowflake(w, h) for _ in range(35)]
            + [Bokeh(w, h) for _ in range(8)]
        ),
    },
}


# ── 帧生成 ────────────────────────────────────────────


def render_frame(
    src: Image.Image, frame_idx: int, config: dict, particles: list
) -> Image.Image:
    sw, sh = src.size
    t = ease_in_out(frame_idx / (TOTAL_FRAMES - 1))

    # 插值 zoom
    z0, z1 = config["zoom"]
    zoom = z0 + (z1 - z0) * t

    # 插值 pan
    px0, px1 = config["pan_x"]
    py0, py1 = config["pan_y"]
    pan_x = (px0 + (px1 - px0) * t) * sw
    pan_y = (py0 + (py1 - py0) * t) * sh

    # 裁剪区域
    crop_w = sw / zoom
    crop_h = sh / zoom
    cx = sw / 2 + pan_x
    cy = sh / 2 + pan_y

    left = cx - crop_w / 2
    top = cy - crop_h / 2
    right = cx + crop_w / 2
    bottom = cy + crop_h / 2

    # 边界钳制
    if left < 0:
        right -= left
        left = 0
    if top < 0:
        bottom -= top
        top = 0
    if right > sw:
        left -= right - sw
        right = sw
    if bottom > sh:
        top -= bottom - sh
        bottom = sh

    frame = src.crop((int(left), int(top), int(right), int(bottom)))
    frame = frame.resize((OUT_W, OUT_H), Image.Resampling.LANCZOS)

    # 粒子覆盖层
    overlay = Image.new("RGBA", (OUT_W, OUT_H), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    for p in particles:
        p.update()
        p.draw(odraw)

    # 粒子轻微模糊使其更柔和
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=0.6))

    frame = frame.convert("RGBA")
    frame = Image.alpha_composite(frame, overlay)
    return frame.convert("RGB")


# ── 主流程 ────────────────────────────────────────────


def process_one(name: str, config: dict) -> str | None:
    src_path = SOURCE_DIR / f"{name}.png"
    out_path = OUTPUT_DIR / f"{name}_dynamic.mp4"

    if out_path.exists():
        print(f"  ⏭️  已存在，跳过: {name}")
        return str(out_path)

    if not src_path.exists():
        print(f"  ❌ 源图不存在: {src_path}")
        return None

    print(f"  🎬 {name}")
    src = Image.open(src_path).convert("RGBA")
    particles = config["particles"](OUT_W, OUT_H)

    with tempfile.TemporaryDirectory() as tmpdir:
        # 渲染帧
        for i in range(TOTAL_FRAMES):
            frame = render_frame(src, i, config, particles)
            frame.save(os.path.join(tmpdir, f"f_{i:04d}.png"))
            if (i + 1) % 15 == 0 or i == TOTAL_FRAMES - 1:
                print(f"    ⏳ 帧 {i + 1}/{TOTAL_FRAMES}")

        # FFmpeg 编码
        print("    🎞️  编码 MP4...")
        cmd = [
            "ffmpeg",
            "-y",
            "-framerate", str(FPS),
            "-i", os.path.join(tmpdir, "f_%04d.png"),
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "18",
            "-maxrate", BITRATE,
            "-bufsize", "5600k",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            str(out_path),
        ]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            print(f"  ❌ 编码失败: {r.stderr[-300:]}")
            return None

    size_kb = out_path.stat().st_size / 1024
    print(f"  ✅ {out_path.name}  ({size_kb:.0f}KB)")
    return str(out_path)


def main():
    print("=" * 55)
    print("红包封面动态效果生成")
    print(f"规格: {OUT_W}×{OUT_H}  {DURATION}s  {FPS}fps")
    print(f"输出: {OUTPUT_DIR}")
    print("=" * 55)

    results = {}
    for name, config in EFFECTS.items():
        print(f"\n📌 {name}")
        path = process_one(name, config)
        results[name] = path

    print("\n" + "=" * 55)
    ok = sum(1 for v in results.values() if v)
    print(f"完成: {ok}/{len(results)} 个视频")
    for name, path in results.items():
        tag = "✅" if path else "❌"
        print(f"  {tag} {name}")


if __name__ == "__main__":
    main()
