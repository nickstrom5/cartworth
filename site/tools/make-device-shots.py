#!/usr/bin/env python3
"""Builds site/img/devices-ipad-duo.png: REAL app screenshots on iPad and on iPhone Duo.

Unlike the four phone illustrations (make-phone-svg.py), these are unretouched simulator frames
from marketing/screenshots/, placed in a drawn device outline on the site's brand field. Only
frames with no prices, no retailer names and no flyer artwork are used, because the captures
predate the round-3 pricing fixes and the site names no retailer (see site/img/README.md):

    iPad-13in/extra-search-home.png          the search home: staples, produce in season, how it compares
    iPhone-Duo-folded/01-search-idle.png     the same screen on the Duo's cover display
    iPhone-Duo-folded/06-shopping-list.png   the shopping list

When the price screens are re-shot on the fixed build, swap them in here.

    python3 site/tools/make-device-shots.py      (needs Pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / 'marketing' / 'screenshots'
OUT = ROOT / 'site' / 'img' / 'devices-ipad-duo.png'

W, H = 1600, 1000
TOP, BOTTOM = (42, 178, 102), (11, 90, 50)  # the brand field of iphone-duo.png, top to bottom
BEZEL = (22, 26, 24)


def field():
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):  # vertical only: see make-site-images.sh on gradients and file size
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)))
    return im


def device(shot, width, bezel, radius):
    """A screenshot scaled to `width`, inside a plain rounded outline with a soft shadow."""
    src = Image.open(shot).convert('RGB')
    h = round(src.height * width / src.width)
    screen = src.resize((width, h), Image.LANCZOS)
    ow, oh = width + 2 * bezel, h + 2 * bezel
    body = Image.new('RGBA', (ow, oh), (0, 0, 0, 0))
    ImageDraw.Draw(body).rounded_rectangle([0, 0, ow - 1, oh - 1], radius=radius, fill=BEZEL + (255,))
    mask = Image.new('L', (width, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, width - 1, h - 1], radius=max(4, radius - bezel), fill=255)
    body.paste(screen, (bezel, bezel), mask)
    shadow = Image.new('RGBA', (ow + 80, oh + 80), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([40, 52, ow + 39, oh + 51], radius=radius, fill=(0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    shadow.alpha_composite(body, (40, 40))
    return shadow


def main():
    im = field().convert('RGBA')
    ipad = device(SHOTS / 'iPad-13in' / 'extra-search-home.png', 560, 22, 44)
    duo_a = device(SHOTS / 'iPhone-Duo-folded' / '01-search-idle.png', 300, 14, 46)
    duo_b = device(SHOTS / 'iPhone-Duo-folded' / '06-shopping-list.png', 300, 14, 46)
    y_ipad = (H - ipad.height) // 2
    im.alpha_composite(ipad, (150, y_ipad))
    y_duo = (H - duo_a.height) // 2
    im.alpha_composite(duo_a, (840, y_duo + 40))
    im.alpha_composite(duo_b, (1170, y_duo - 20))
    out = im.convert('RGB')
    # Brand-field PNGs stay under ~300 KB: a 256-colour palette is invisible at this size.
    out = out.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    out.save(OUT, optimize=True)
    print(f'wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
