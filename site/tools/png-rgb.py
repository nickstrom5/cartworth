#!/usr/bin/env python3
"""Re-encode a PNG as opaque 8-bit RGB (colour type 2, sRGB, no alpha channel).

Why this exists: several social-card scrapers composite an alpha channel onto
black, so og-cartworth.png must not have one, and the App Store wants the same
for icons. Pillow, ImageMagick and rsvg-convert are all absent on this machine.

ios/Design/png_flatten.py already does this in pure stdlib, but it walks every
pixel in a Python loop, which costs minutes on a megapixel image. This version
hands the decode to `sips` (convert to a 32-bit top-down BMP, which is flat
uncompressed BGRX) and does the channel work with whole-buffer slice
assignments, so it is C-speed throughout. A 1600x1000 image takes well under a
second.

Any pixel that is not fully opaque is composited onto --bg first (default
white). The SVG sources here paint an opaque background rect, so in practice
nothing is composited and this is a pure channel drop.

Usage: png-rgb.py <in.png> <out.png> [--bg '#RRGGBB']
"""
import struct
import subprocess
import sys
import tempfile
import zlib


def chunk(ctype, body):
    return (struct.pack(">I", len(body)) + ctype + body
            + struct.pack(">I", zlib.crc32(ctype + body) & 0xFFFFFFFF))


def read_bmp(path):
    """Return (width, height, bytearray of BGRX rows, top-down) for a 32bpp BMP."""
    with open(path, "rb") as fh:
        data = fh.read()
    if data[:2] != b"BM":
        raise SystemExit("sips did not produce a BMP")
    offset = struct.unpack("<I", data[10:14])[0]
    width, height = struct.unpack("<ii", data[18:26])
    planes, bpp = struct.unpack("<HH", data[26:30])
    if bpp not in (24, 32):
        raise SystemExit("unsupported BMP depth %d" % bpp)
    top_down = height < 0
    height = abs(height)
    stride = ((width * bpp + 31) // 32) * 4
    return width, height, bpp, stride, top_down, data[offset:]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    bg = "#ffffff"
    if "--bg" in sys.argv:
        bg = sys.argv[sys.argv.index("--bg") + 1]
    src, dst = args[0], args[1]
    br, bgn, bb = int(bg[1:3], 16), int(bg[3:5], 16), int(bg[5:7], 16)

    with tempfile.NamedTemporaryFile(suffix=".bmp", delete=True) as tmp:
        subprocess.run(["sips", "-s", "format", "bmp", src, "--out", tmp.name],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        width, height, bpp, stride, top_down, body = read_bmp(tmp.name)

    px = 4 if bpp == 32 else 3
    out_stride = width * 3
    raw = bytearray()
    order = range(height) if top_down else range(height - 1, -1, -1)
    for y in order:
        row = bytearray(body[y * stride:y * stride + width * px])
        if px == 4:
            # sips writes BGRX with X = alpha. Composite anything not opaque,
            # then drop the channel. The slice compare is a single C memcmp.
            alpha = bytes(row[3::4])
            if alpha != b"\xff" * width:
                for x in range(width):
                    a = row[x * 4 + 3]
                    if a != 255:
                        ia = 255 - a
                        row[x * 4] = (row[x * 4] * a + bb * ia + 127) // 255
                        row[x * 4 + 1] = (row[x * 4 + 1] * a + bgn * ia + 127) // 255
                        row[x * 4 + 2] = (row[x * 4 + 2] * a + br * ia + 127) // 255
            del row[3::4]
        # BGR -> RGB, two slice assignments, no Python-level loop.
        blue, red = row[0::3], row[2::3]
        row[0::3], row[2::3] = red, blue
        raw.append(0)                       # filter type None
        raw += row

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"sRGB", b"\x00")
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(dst, "wb") as fh:
        fh.write(png)
    print("wrote %s  %dx%d RGB (no alpha)" % (dst, width, height))


if __name__ == "__main__":
    main()
