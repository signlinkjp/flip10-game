#!/usr/bin/env python3
"""LINEZAP のアプリアイコンを各サイズに書き出す（1024 が正）。

`assets/linezap-appicon-1024.png`（1024×1024 / RGB / 透過なし）を元にして、
iOS の AppIcon と、ストア掲載・確認用の各サイズを作り直す。

  python3 tools/make-icon.py

App Store の要件どおり、出す PNG はすべてアルファ無しの RGB。
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "linezap-appicon-1024.png"
IOS = ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "AppIcon.appiconset" / "AppIcon-512@2x.png"
SET = ROOT / "assets" / "appicon"

SIZE = 1024
# iPhone / iPad の代表サイズ（ストア掲載・確認用。iOS は 1024 から自動で作る）
SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 192, 512]


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    if source.size != (SIZE, SIZE):
        source = source.resize((SIZE, SIZE), Image.LANCZOS)
        source.save(SOURCE, "PNG", optimize=True)

    IOS.parent.mkdir(parents=True, exist_ok=True)
    source.save(IOS, "PNG", optimize=True)

    SET.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        source.resize((size, size), Image.LANCZOS).save(SET / f"icon-{size}.png", "PNG", optimize=True)

    print(f"{SOURCE} ({SIZE}x{SIZE} RGB)")
    print(f"{IOS}")
    print(f"{SET} ({', '.join(str(size) for size in SIZES)})")


if __name__ == "__main__":
    main()
