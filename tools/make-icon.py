#!/usr/bin/env python3
"""FLIP 10 のアプリアイコン（1024×1024 / RGB / 透過なし）。

青いタイルの「1」とピンクのタイルの「0」を少し傾けて重ね、FLIP 10 の
「表＝青・裏＝ピンク」と「10」を一度に見せる。App Store の要件どおり
アルファ無しの RGB PNG で書き出す。

  python3 tools/make-icon.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "flip10-appicon-1024.png"
IOS = ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "AppIcon.appiconset" / "AppIcon-512@2x.png"

SIZE = 1024
FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"


def vertical_gradient(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    image = Image.new("RGB", (1, size))
    pixels = image.load()
    for y in range(size):
        t = y / max(1, size - 1)
        pixels[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return image.resize((size, size))


def radial_glow(size: int, center: tuple[float, float], radius: float, color: tuple[int, int, int]) -> Image.Image:
    layer = Image.new("RGB", (size, size), (0, 0, 0))
    draw = ImageDraw.Draw(layer)
    steps = 48
    for step in range(steps, 0, -1):
        r = radius * step / steps
        alpha = int(90 * (1 - step / steps) ** 1.6)
        box = [center[0] - r, center[1] - r, center[0] + r, center[1] + r]
        draw.ellipse(box, fill=tuple(int(c * alpha / 255) for c in color))
    return layer.filter(ImageFilter.GaussianBlur(radius / 6))


def tile(size: int, color_top: str, color_bottom: str) -> Image.Image:
    """角丸のタイル1枚（RGBA）。上に光沢、下に落ち影の色を入れる。"""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    radius = int(size * 0.20)
    draw = ImageDraw.Draw(layer)
    # 本体（縦グラデーション）
    grad = vertical_gradient(size, hex_to_rgb(color_top), hex_to_rgb(color_bottom))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    layer.paste(grad, (0, 0), mask)
    # 上辺のハイライト
    highlight = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hd = ImageDraw.Draw(highlight)
    hd.rounded_rectangle(
        [size * 0.055, size * 0.045, size * 0.945, size * 0.45],
        radius=int(size * 0.16),
        fill=(255, 255, 255, 46),
    )
    layer = Image.alpha_composite(layer, highlight.filter(ImageFilter.GaussianBlur(size * 0.02)))
    # 内側のふち
    edge = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle(
        [2, 2, size - 3, size - 3], radius=radius, outline=(255, 255, 255, 120), width=max(2, size // 220)
    )
    return Image.alpha_composite(layer, edge)


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def number(size: int, text: str) -> Image.Image:
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    font = ImageFont.truetype(FONT_BOLD, int(size * 0.62))
    box = draw.textbbox((0, 0), text, font=font)
    w = box[2] - box[0]
    h = box[3] - box[1]
    x = (size - w) / 2 - box[0]
    y = (size - h) / 2 - box[1] + size * 0.015
    # 影
    draw.text((x, y + size * 0.012), text, font=font, fill=(4, 10, 36, 110))
    draw.text((x, y), text, font=font, fill=(255, 255, 255, 255))
    return layer


def main() -> None:
    base = vertical_gradient(SIZE, (18, 30, 74), (6, 9, 22))
    base = Image.composite(
        radial_glow(SIZE, (SIZE * 0.25, SIZE * 0.18), SIZE * 0.55, (60, 110, 255)),
        base,
        Image.new("L", (SIZE, SIZE), 255),
    )
    # ピンクの光（右下）
    glow = radial_glow(SIZE, (SIZE * 0.78, SIZE * 0.82), SIZE * 0.42, (255, 70, 140))
    glow_mask = glow.convert("L").point(lambda v: min(255, int(v * 1.5)))
    base = Image.composite(glow, base, glow_mask)

    canvas = base.convert("RGBA")

    # 2枚のタイル
    tile_size = int(SIZE * 0.52)
    pink = tile(tile_size, "#ffa6c9", "#c2185b")
    pink = pink.rotate(9, expand=True, resample=Image.BICUBIC)
    blue = tile(tile_size, "#7fb0ff", "#1637a8")
    blue = blue.rotate(-7, expand=True, resample=Image.BICUBIC)

    def paste_center(sprite: Image.Image, cx: float, cy: float, shadow: bool = True) -> None:
        nonlocal canvas
        x = int(cx - sprite.width / 2)
        y = int(cy - sprite.height / 2)
        if shadow:
            alpha = sprite.split()[3].point(lambda v: int(v * 0.55))
            shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            black = Image.new("RGBA", sprite.size, (2, 4, 14, 255))
            black.putalpha(alpha)
            shadow_layer.paste(black, (x, y + int(SIZE * 0.035)), black)
            canvas = Image.alpha_composite(canvas, shadow_layer.filter(ImageFilter.GaussianBlur(SIZE * 0.03)))
        canvas.paste(sprite, (x, y), sprite)

    paste_center(pink, SIZE * 0.60, SIZE * 0.52)
    paste_center(blue, SIZE * 0.40, SIZE * 0.480)

    # 数字（タイルに沿って少し回す）
    def stamp_number(text: str, cx: float, cy: float, angle: float) -> None:
        nonlocal canvas
        sprite = number(tile_size, text).rotate(angle, expand=True, resample=Image.BICUBIC)
        canvas.alpha_composite(sprite, (int(cx - sprite.width / 2), int(cy - sprite.height / 2)))

    stamp_number("1", SIZE * 0.40, SIZE * 0.475, -7)
    stamp_number("0", SIZE * 0.60, SIZE * 0.515, 9)

    # 下に金色のライン（10で消える合図）
    line = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(line)
    ld.rounded_rectangle(
        [SIZE * 0.30, SIZE * 0.845, SIZE * 0.70, SIZE * 0.845 + SIZE * 0.026],
        radius=SIZE * 0.013,
        fill=(255, 210, 74, 235),
    )
    canvas = Image.alpha_composite(canvas, line.filter(ImageFilter.GaussianBlur(1.2)))

    final = canvas.convert("RGB")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    final.save(OUT, "PNG", optimize=True)
    IOS.parent.mkdir(parents=True, exist_ok=True)
    final.save(IOS, "PNG", optimize=True)
    print(f"{OUT} ({final.size[0]}x{final.size[1]})")
    print(f"{IOS}")


if __name__ == "__main__":
    main()
