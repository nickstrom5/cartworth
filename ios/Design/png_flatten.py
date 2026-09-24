#!/usr/bin/env python3
"""Flatten an RGBA PNG onto an opaque background and re-encode as 8-bit RGB.

Pure stdlib (zlib + struct) because Pillow is not installed on this machine.
Handles non-interlaced 8-bit PNGs of colour type 2 (RGB) and 6 (RGBA), which is
what `qlmanage -t` produces. Output is colour type 2 (no alpha channel) with an
sRGB chunk, which is what the App Store requires for app icons.

Pass --gray to force every pixel to R==G==B, which the tinted app-icon
variant requires (iOS multiplies the user's tint through it, so any residual
colour cast renders wrong).

Usage: png_flatten.py <in.png> <out.png> [#RRGGBB] [--gray]
"""
import sys
import zlib
import struct


def read_chunks(data):
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    pos = 8
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        ctype = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length          # length + type + body + crc
        yield ctype, body


def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def unfilter(raw, width, height, bpp):
    stride = width * bpp
    out = bytearray(stride * height)
    prev = bytearray(stride)
    pos = 0
    for y in range(height):
        ft = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        if ft == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif ft == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ft == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ft == 4:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                upleft = prev[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + paeth(left, prev[i], upleft)) & 0xFF
        elif ft != 0:
            raise ValueError("unsupported filter type %d" % ft)
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return out


def chunk(ctype, body):
    return (struct.pack(">I", len(body)) + ctype + body
            + struct.pack(">I", zlib.crc32(ctype + body) & 0xFFFFFFFF))


def filter_scanlines(rows, stride):
    """Adaptive PNG row filtering (None/Sub/Up), chosen per row by the standard
    minimum-sum-of-absolute-differences heuristic.

    The caller compares this against unfiltered output and keeps whichever
    compresses smaller: the SVG renderer dithers its gradients, and on dithered
    pixels the heuristic reliably picks a filter that makes things worse."""
    out = bytearray()
    prev = bytearray(stride)
    for line in rows:
        sub = bytearray(stride)
        up = bytearray(stride)
        for i in range(stride):
            sub[i] = (line[i] - (line[i - 3] if i >= 3 else 0)) & 0xFF
            up[i] = (line[i] - prev[i]) & 0xFF

        def cost(buf):
            return sum(b if b < 128 else 256 - b for b in buf)

        best = min(((cost(line), 0, line), (cost(sub), 1, sub), (cost(up), 2, up)),
                   key=lambda t: t[0])
        out.append(best[1])
        out += best[2]
        prev = line
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    gray = "--gray" in sys.argv
    src, dst = args[0], args[1]
    bg = args[2] if len(args) > 2 else "#000000"
    br, bgn, bb = (int(bg[1:3], 16), int(bg[3:5], 16), int(bg[5:7], 16))

    with open(src, "rb") as fh:
        data = fh.read()
    idat = b""
    width = height = depth = ctype_n = None
    for ctype, body in read_chunks(data):
        if ctype == b"IHDR":
            width, height, depth, ctype_n, comp, filt, interlace = struct.unpack(">IIBBBBB", body)
            assert depth == 8, "only 8-bit input supported, got %d" % depth
            assert interlace == 0, "interlaced PNG not supported"
            assert ctype_n in (2, 6), "unsupported colour type %d" % ctype_n
        elif ctype == b"IDAT":
            idat += body
        elif ctype == b"IEND":
            break

    bpp = 4 if ctype_n == 6 else 3
    pixels = unfilter(zlib.decompress(idat), width, height, bpp)

    stride_out = width * 3
    rows = []
    for y in range(height):
        row = pixels[y * width * bpp:(y + 1) * width * bpp]
        line = bytearray(stride_out)
        for x in range(width):
            if bpp == 3:
                r, g, b = row[x * 3:x * 3 + 3]
            else:
                r, g, b, a = row[x * 4:x * 4 + 4]
                if a != 255:
                    ia = 255 - a
                    r = (r * a + br * ia + 127) // 255
                    g = (g * a + bgn * ia + 127) // 255
                    b = (b * a + bb * ia + 127) // 255
            if gray:
                r = g = b = (r + g + b + 1) // 3
            line[x * 3], line[x * 3 + 1], line[x * 3 + 2] = r, g, b
        rows.append(line)

    plain = bytearray()
    for line in rows:
        plain.append(0)
        plain += line
    candidates = [zlib.compress(bytes(plain), 9),
                  zlib.compress(bytes(filter_scanlines(rows, stride_out)), 9)]
    idat_out = min(candidates, key=len)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"sRGB", b"\x00")
    png += chunk(b"IDAT", idat_out)
    png += chunk(b"IEND", b"")
    open(dst, "wb").write(png)
    print("wrote %s  %dx%d RGB (no alpha)%s" % (dst, width, height,
                                                 ", forced greyscale" if gray else ""))


if __name__ == "__main__":
    main()
