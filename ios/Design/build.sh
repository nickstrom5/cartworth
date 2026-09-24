#!/bin/bash
# Rebuild the Cartworth app-icon PNGs from the SVG source in this directory.
#
#   ./build.sh
#
# Pipeline: make_appicon_svg.py writes the three SVG variants -> qlmanage (the
# only SVG rasteriser present on this machine; rsvg-convert / ImageMagick /
# Pillow are all absent) renders each at 1024x1024 -> png_flatten.py drops the
# alpha channel and re-encodes as 8-bit RGB, which is what the App Store
# requires. Output goes straight into the asset catalog.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../App/Resources/Assets.xcassets/AppIcon.appiconset"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

python3 "$HERE/make_appicon_svg.py"

render() {  # <variant> <output filename> <flatten background> [--gray]
  qlmanage -t -s 1024 -o "$TMP" "$HERE/AppIcon-$1.svg" >/dev/null 2>&1
  python3 "$HERE/png_flatten.py" "$TMP/AppIcon-$1.svg.png" "$OUT/$2" "$3" ${4:-}
}

render light  AppIcon-1024.png        '#0B5A32'
render dark   AppIcon-1024-dark.png   '#05090B'
render tinted AppIcon-1024-tinted.png '#060606' --gray

for f in AppIcon-1024.png AppIcon-1024-dark.png AppIcon-1024-tinted.png; do
  echo "--- $f"
  sips -g pixelWidth -g pixelHeight -g samplesPerPixel -g hasAlpha -g space "$OUT/$f" | tail -n +2
done
