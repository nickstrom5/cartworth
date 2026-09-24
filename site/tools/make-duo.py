#!/usr/bin/env python3
"""Build img/iphone-duo.png: the two phone images side by side on a brand field.

Takes the already-built site/img/iphone-max-search.png and iphone-max-deal.png,
embeds them as data URIs in an SVG, and lets the renderer do the downscale and
the rounded corners. Nothing is redrawn here.

The background is opaque on purpose. styles.css paints a placeholder cart glyph
inside .shot-frame::after, underneath the <img>, so a transparent PNG would
show that glyph through its gaps. A flat brand field also reads the same in the
light and the dark theme, which img/README.md asks for.

Usage: make-duo.py <out.svg>
"""
import base64
import os
import sys

W, H = 1600, 1000
CANVAS = 1600
DY = (CANVAS - H) // 2          # the shipped band is the centre 1600x1000

SCREEN_W, SCREEN_H = 560, 1008  # 5:9, same as the source frames
TOP = 96
BEZEL = 16
GAP = 52
LEFT_X = (W - (2 * SCREEN_W + GAP)) // 2
RIGHT_X = LEFT_X + SCREEN_W + GAP


def data_uri(path):
    with open(path, "rb") as fh:
        return "data:image/png;base64," + base64.b64encode(fh.read()).decode("ascii")


def phone(x, uri, idx):
    bx, by = x - BEZEL, TOP - BEZEL
    bw, bh = SCREEN_W + 2 * BEZEL, SCREEN_H + 2 * BEZEL
    return (
        '<rect x="%g" y="%g" width="%g" height="%g" rx="66" fill="#0A1710" '
        'fill-opacity="0.28" transform="translate(0,14)"/>'
        '<rect x="%g" y="%g" width="%g" height="%g" rx="66" fill="#13221A"/>'
        '<g clip-path="url(#screen%d)"><image x="%g" y="%g" width="%g" height="%g" '
        'preserveAspectRatio="xMidYMid slice" href="%s"/></g>'
        % (bx, by, bw, bh, bx, by, bw, bh, idx, x, TOP, SCREEN_W, SCREEN_H, uri))


def main():
    out = sys.argv[1]
    img = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "img")
    left = data_uri(os.path.join(img, "iphone-max-search.png"))
    right = data_uri(os.path.join(img, "iphone-max-deal.png"))

    clips = "".join(
        '<clipPath id="screen%d"><rect x="%g" y="%g" width="%g" height="%g" rx="52"/></clipPath>'
        % (i, x, TOP, SCREEN_W, SCREEN_H) for i, x in ((0, LEFT_X), (1, RIGHT_X)))

    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">\n'
        '<title>Cartworth on iPhone</title>\n'
        '<desc>Two illustrations of the Cartworth iPhone app side by side: search '
        'results on the left, a weekly-ad deal with its conditions on the right. '
        'Illustrations, not screenshots. Store names are stand-ins. Example '
        'prices, September 2026. Square working canvas; the shipped image is the '
        'centre %dx%d band.</desc>\n'
        '<defs>'
        # Vertical only, no radial glow: a gradient that varies along both axes
        # dithers and stops the PNG compressing. See tools/make-site-images.sh.
        '<linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="800" y1="%d" x2="800" y2="%d">'
        '<stop offset="0" stop-color="#2AB266"/>'
        '<stop offset="0.6" stop-color="#15874A"/>'
        '<stop offset="1" stop-color="#0B5A32"/>'
        '</linearGradient>%s</defs>\n'
        '<rect width="%d" height="%d" fill="url(#bg)"/>\n'
        '<g transform="translate(0,%d)">%s%s</g>\n'
        '</svg>\n'
        % (CANVAS, CANVAS, CANVAS, CANVAS, W, H, DY, DY + H, clips,
           CANVAS, CANVAS, DY, phone(LEFT_X, left, 0), phone(RIGHT_X, right, 1)))

    with open(out, "w") as fh:
        fh.write(svg)
    print("wrote %s  (%.1f MB of embedded PNG)" % (out, len(svg) / 1e6))


if __name__ == "__main__":
    main()
