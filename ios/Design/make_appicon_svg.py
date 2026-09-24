#!/usr/bin/env python3
"""Generate the three Cartworth app-icon SVG variants from one shared geometry.

The SVGs are the editable design source. They are kept in sync by being emitted
from this single description so a tweak to the basket never has to be repeated
three times. Run ./build.sh after editing to re-rasterise the PNGs.

Concept
-------
A grocery basket whose contents are three price bars stepping DOWN to the right.
The short rightmost bar is the cheapest store and is picked out in amber. The
silhouette is one connected mass so it survives the 40 px home-screen size; the
comparison reading only has to arrive at larger sizes.
"""
import math
import os

W = 1024

# ---------------------------------------------------------------- geometry ---
BAR_W = 125
BAR_GAP = 48                      # tight enough to read as one chart
BAR_X0 = 284                      # leftmost bar left edge
BAR_R = 20                        # nearly flat tops: chart bars, not bottles
BAR_TOPS = [187, 283, 379]        # even steps down: dearest -> cheapest
BAR_BOTTOM = 581                  # runs down behind the rim

# The basket is ONE silhouette (lip + tapered bowl) so the join can't show a
# seam or leave tabs under the lip.
RIM_X0, RIM_X1 = 172, 852
RIM_TOP_Y, RIM_BOT_Y = 514, 604
RIM_R = 38
BODY_TOP_X0, BODY_TOP_X1 = 240, 784     # where the taper starts, under the lip
BODY_BOT_Y = 846
BODY_BOT_X0, BODY_BOT_X1 = 299, 725
LIP_FILLET = 18
BODY_R_BOT = 86

# ----------------------------------------------------------------- palettes ---
# brand green = AccentColor light (#168F4A); dark accent (#33C76B) drives dark.
VARIANTS = {
    "light": dict(
        bg0="#26AC61", bg1="#0B5A32",
        glow="#FFFFFF", glow_a=0.16,
        mark0="#FFFFFF", mark1="#E8F2EA",
        best0="#FFD24A", best1="#F5A81F",
        flatten_bg="#0B5A32",
    ),
    "dark": dict(
        bg0="#12251A", bg1="#05090B",
        glow="#35C46F", glow_a=0.18,
        mark0="#3ACE78", mark1="#179149",
        best0="#FFD24A", best1="#EFA017",
        flatten_bg="#05090B",
    ),
    # Tinted MUST be greyscale: iOS multiplies the user's tint through it.
    "tinted": dict(
        bg0="#171717", bg1="#060606",
        glow="#FFFFFF", glow_a=0.10,
        mark0="#CACACA", mark1="#A6A6A6",
        best0="#FFFFFF", best1="#EDEDED",
        flatten_bg="#050505",
    ),
}


def rounded_polygon(points, radii):
    """Path data for a polygon with a circular fillet at each vertex."""
    n = len(points)
    out = []
    for i in range(n):
        prev = points[(i - 1) % n]
        cur = points[i]
        nxt = points[(i + 1) % n]
        r = radii[i]

        v1 = (prev[0] - cur[0], prev[1] - cur[1])
        v2 = (nxt[0] - cur[0], nxt[1] - cur[1])
        l1 = math.hypot(*v1)
        l2 = math.hypot(*v2)
        u1 = (v1[0] / l1, v1[1] / l1)
        u2 = (v2[0] / l2, v2[1] / l2)

        theta = math.acos(max(-1.0, min(1.0, u1[0] * u2[0] + u1[1] * u2[1])))
        t = r / math.tan(theta / 2.0)
        t = min(t, l1 / 2.0, l2 / 2.0)
        r_eff = t * math.tan(theta / 2.0)

        p1 = (cur[0] + u1[0] * t, cur[1] + u1[1] * t)
        p2 = (cur[0] + u2[0] * t, cur[1] + u2[1] * t)
        cross = u1[0] * u2[1] - u1[1] * u2[0]
        sweep = 1 if cross < 0 else 0

        out.append(("M %.2f %.2f" if i == 0 else "L %.2f %.2f") % p1)
        out.append("A %.2f %.2f 0 0 %d %.2f %.2f" % (r_eff, r_eff, sweep, p2[0], p2[1]))
    out.append("Z")
    return " ".join(out)


# Clockwise from the top-left of the lip. The two vertices where the lip meets
# the bowl are concave, so rounded_polygon fillets them inwards.
BASKET_PATH = rounded_polygon(
    [(RIM_X0, RIM_TOP_Y), (RIM_X1, RIM_TOP_Y),
     (RIM_X1, RIM_BOT_Y), (BODY_TOP_X1, RIM_BOT_Y),
     (BODY_BOT_X1, BODY_BOT_Y), (BODY_BOT_X0, BODY_BOT_Y),
     (BODY_TOP_X0, RIM_BOT_Y), (RIM_X0, RIM_BOT_Y)],
    [RIM_R, RIM_R, 18, LIP_FILLET, BODY_R_BOT, BODY_R_BOT, LIP_FILLET, 18],
)


def svg(v):
    p = VARIANTS[v]
    bars = []
    for i, top in enumerate(BAR_TOPS):
        x = BAR_X0 + i * (BAR_W + BAR_GAP)
        fill = "url(#best)" if i == len(BAR_TOPS) - 1 else "url(#mark)"
        bars.append(
            '  <rect x="%d" y="%d" width="%d" height="%d" rx="%d" fill="%s"/>'
            % (x, top, BAR_W, BAR_BOTTOM - top, BAR_R, fill)
        )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{W}" viewBox="0 0 {W} {W}">
  <title>Cartworth app icon ({v})</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="{p['bg0']}"/>
      <stop offset="1" stop-color="{p['bg1']}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.33" r="0.74">
      <stop offset="0" stop-color="{p['glow']}" stop-opacity="{p['glow_a']}"/>
      <stop offset="1" stop-color="{p['glow']}" stop-opacity="0"/>
    </radialGradient>
    <!-- userSpaceOnUse so the rim and the body sample one continuous ramp -->
    <linearGradient id="mark" gradientUnits="userSpaceOnUse" x1="0" y1="{BAR_TOPS[0]}" x2="0" y2="{BODY_BOT_Y}">
      <stop offset="0" stop-color="{p['mark0']}"/>
      <stop offset="1" stop-color="{p['mark1']}"/>
    </linearGradient>
    <linearGradient id="best" gradientUnits="userSpaceOnUse" x1="0" y1="{BAR_TOPS[-1]}" x2="0" y2="{RIM_BOT_Y}">
      <stop offset="0" stop-color="{p['best0']}"/>
      <stop offset="1" stop-color="{p['best1']}"/>
    </linearGradient>
  </defs>

  <rect width="{W}" height="{W}" fill="url(#bg)"/>
  <rect width="{W}" height="{W}" fill="url(#glow)"/>

{chr(10).join(bars)}

  <path d="{BASKET_PATH}" fill="url(#mark)"/>
</svg>
"""


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    for v in VARIANTS:
        path = os.path.join(here, "AppIcon-%s.svg" % v)
        with open(path, "w") as fh:
            fh.write(svg(v))
        print("wrote", path)
