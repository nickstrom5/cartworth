#!/usr/bin/env python3
"""Emit the SVG sources for the three landing-page phone images.

READ THIS BEFORE CHANGING THE NUMBERS IN HERE.

These are ILLUSTRATIONS of the app, not screenshots, and they are built that way
deliberately. marketing/screenshots/ holds real simulator frames, but as of the
2026-09-22 capture none of the four screens the landing page asks for can ship:

  * search results  - the real frame renders the weekly-ad carousel, whose tiles
    are retailer FLYER images carrying brand wordmarks and in-ad pricing
    typography. img/README.md rule 1 and APP_STORE_LISTING.md both forbid that.
    The same frame also shows defect D1: a mis-parsed $29.84/gal attributed by
    name to a real retailer, which flattens every other bar in the chart.
  * weekly-ad deal detail - never captured; the UI test's selector lands on the
    sort menu instead (see marketing/screenshots/README.md).
  * completed trip plan   - never captured; nothing taps "Plan the cheapest trip".

So these are drawn. The rules they follow:

  1. No retailer is named. Store names are stand-ins ("Store A".."Store F"),
     matching the illustration already in the hero of index.html.
  2. Every price is a real observed Chicago price from the 2026-09-22 capture
     (ZIP 60618), with the store name replaced by a stand-in. Nothing is
     invented to look good, and the mis-parsed outlier is simply absent because
     it was a bug, not a price.
  3. No dollar amount of saving anywhere - only totals, never a delta.
  4. No free-tier counter, no paywall, no "save $X" copy.

Because they are illustrations, index.html must not call them screenshots. The
"Screenshots shown are of the app in development." note under the shot row has
to say "Illustrations of the app in development, not screenshots." for the page
to stay honest. That edit is owned by whoever owns the HTML.

Output: three square SVGs in tools/src/. qlmanage only honours the requested
size on a square canvas, so each 1290x2322 screen is drawn inside a 2322x2322
canvas and cropped back by make-site-images.sh.
"""
import os

W, H = 1290, 2322                 # iPhone 6.9" screen, status bar and home indicator cropped off
CANVAS = 2322
DX = (CANVAS - W) // 2            # centre the screen in the square working canvas

FONT = "-apple-system, system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif"

PAGE = "#F1F2F4"
CARD = "#FFFFFF"
INK = "#101A13"
INK2 = "#3D5247"
MUTED = "#6E7C73"
FAINT = "#8E9A93"
LINE = "#E8EAEC"
GREEN = "#168F4A"                  # the app's accent
GREEN_DEEP = "#0F6B37"
GREEN_SOFT = "#E9F5EC"
GREEN_BAND = "#DCEFE0"
GOOD_BG, GOOD_INK = "#E1F1E2", "#1C5B33"
INFO_BG, INFO_INK = "#E7EFFA", "#1C5CAB"
DEAL_BG, DEAL_INK = "#FFEDE2", "#A8390C"

# Okabe-Ito, the same set styles.css uses for --store-1..5: colour-blind safe and
# deliberately not any retailer's brand colour.
DOTS = ["#009e73", "#0072b2", "#e69f00", "#d55e00", "#cc79a7", "#56b4e9"]


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def text(x, y, s, size=44, weight=400, fill=INK, anchor="start", spacing=None):
    sp = ' letter-spacing="%s"' % spacing if spacing is not None else ""
    return ('<text x="%g" y="%g" font-family="%s" font-size="%g" font-weight="%d" '
            'fill="%s" text-anchor="%s"%s>%s</text>'
            % (x, y, FONT, size, weight, fill, anchor, sp, esc(s)))


def rect(x, y, w, h, r=0, fill=CARD, stroke=None, sw=2):
    st = ' stroke="%s" stroke-width="%g"' % (stroke, sw) if stroke else ""
    return '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="%s"%s/>' % (x, y, w, h, r, fill, st)


def dot(cx, cy, colour, r=15):
    return '<circle cx="%g" cy="%g" r="%g" fill="%s"/>' % (cx, cy, r, colour)


def pill(x, y, w, h, label, bg, ink, size=32):
    return (rect(x, y, w, h, h / 2, bg)
            + text(x + w / 2, y + h / 2 + size * 0.36, label, size, 600, ink, "middle"))


def hairline(x1, x2, y):
    return '<line x1="%g" y1="%g" x2="%g" y2="%g" stroke="%s" stroke-width="2"/>' % (x1, y, x2, y, LINE)


def magnifier(cx, cy, s=1.0, colour=FAINT):
    return ('<g transform="translate(%g,%g) scale(%g)" fill="none" stroke="%s" '
            'stroke-width="5" stroke-linecap="round">'
            '<circle cx="0" cy="0" r="16"/><path d="M12 12 L24 24"/></g>' % (cx, cy, s, colour))


# Tab-bar glyphs, drawn in a 24x24 box in the same stroked style index.html uses
# for its own inline icons, then scaled up. Keeping one icon language across the
# site and these illustrations is the point.
GLYPHS = {
    "search": 'M11 11 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 M16.6 16.6 L21 21',
    "deals": 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4a1 1 0 0 1 1-1h8'
             'a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8Z M7.6 7.6h.01',
    "list": 'M9 6h12 M9 12h12 M9 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
    "tracking": 'M12 3.5 14.6 9l5.9.7-4.4 4 1.2 5.8L12 16.6 6.7 19.5l1.2-5.8-4.4-4L9.4 9Z',
    "settings": 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 '
                'M12 2.5v3 M12 18.5v3 M2.5 12h3 M18.5 12h3 '
                'M5.2 5.2l2.1 2.1 M16.7 16.7l2.1 2.1 M18.8 5.2l-2.1 2.1 M7.3 16.7l-2.1 2.1',
}


def glyph(name, cx, cy, size, colour, weight=2.1):
    s = size / 24.0
    return ('<g transform="translate(%g,%g) scale(%g)" fill="none" stroke="%s" '
            'stroke-width="%g" stroke-linecap="round" stroke-linejoin="round">'
            '<path d="%s"/></g>' % (cx - size / 2.0, cy - size / 2.0, s, colour, weight, GLYPHS[name]))


def tab_bar(active=0):
    """The five-tab bar. Labels are 30px, which is about 8px at the size the
    landing page shows these - decoration, not information."""
    tabs = [("search", "Search"), ("deals", "Deals"), ("list", "List"),
            ("tracking", "Tracking"), ("settings", "Settings")]
    out = [rect(0, 2140, W, H - 2140, 0, "#FBFBFC"), hairline(0, W, 2140)]
    step = W / 5.0
    for i, (icon, lab) in enumerate(tabs):
        cx = step * (i + 0.5)
        col = GREEN if i == active else "#98A29C"
        out.append(glyph(icon, cx, 2204, 58, col, 2.3 if i == active else 2.0))
        out.append(text(cx, 2268, lab, 30, 600 if i == active else 500, col, "middle"))
    return "".join(out)


def search_field(query):
    out = [rect(48, 40, 1080, 130, 65, "#EAEBED"),
           magnifier(112, 105, 1.1),
           text(160, 122, query, 50, 500, INK),
           '<circle cx="1062" cy="105" r="27" fill="#BFC4C7"/>',
           '<path d="M1052 95 L1072 115 M1072 95 L1052 115" stroke="#EAEBED" '
           'stroke-width="7" stroke-linecap="round"/>',
           '<path d="M1178 84 L1222 128 M1222 84 L1178 128" stroke="#3D5247" '
           'stroke-width="8" stroke-linecap="round"/>']
    return "".join(out)


# --------------------------------------------------------------------------- 1
def screen_search():
    """Search results for milk. Prices are the real per-gallon spread observed in
    ZIP 60618 on 2026-09-22 ($2.41 .. $3.99); the stores are stand-ins."""
    rows = [
        # stand-in store, dot, match text, distance, price, source badge
        ("Store C", 0, "Whole milk, 1 gal", "0.7 mi", "$2.41", "shelf price", GOOD_BG, GOOD_INK),
        ("Store A", 1, "2% reduced fat milk, 1 gal", "1.8 mi", "$3.23", "shelf price", GOOD_BG, GOOD_INK),
        ("Store B", 2, "Whole milk, 1 gal", "2.1 mi", "$3.49", "online price", INFO_BG, INFO_INK),
        ("Store D", 3, "2% reduced fat milk, 1 gal", "0.3 mi", "$3.59", "shelf price", GOOD_BG, GOOD_INK),
        ("Store E", 4, "Whole milk, 128 fl oz", "4.6 mi", "$3.99", "online price", INFO_BG, INFO_INK),
        ("Store F", 5, "2% reduced fat milk, 1 gal", "3.2 mi", "$4.29", "shelf price", GOOD_BG, GOOD_INK),
    ]
    o = [rect(0, 0, W, H, 0, PAGE), search_field("milk")]

    # best-price card
    o.append(rect(48, 210, 1194, 490, 54, GREEN_SOFT))
    o.append(text(96, 292, "BEST PRICE", 34, 700, "#3F6A50", spacing=5))
    o.append(text(96, 430, "$2.41", 128, 800, "#0B1F14", spacing=-3))
    o.append(text(470, 430, "/gal", 54, 600, "#4C6B58"))
    o.append(dot(112, 492, DOTS[0]))
    o.append(text(146, 508, "Store C", 46, 650, "#16321F"))
    o.append(pill(348, 470, 214, 54, "shelf price", GOOD_BG, GOOD_INK))
    o.append(text(590, 508, "0.7 mi", 40, 500, MUTED))
    o.append(text(96, 580, "Whole milk, 1 gal · $2.41 on the shelf", 42, 500, INK2))
    o.append(text(96, 646, "Cheapest per gallon of the six stores you follow.", 36, 400, MUTED))

    # per-store list
    top = 760
    row_h = 176
    card_h = 96 + len(rows) * row_h + 86
    o.append(rect(48, top, 1194, card_h, 54, CARD))
    o.append(text(96, top + 80, "Cheapest match per store", 50, 700, INK))
    o.append(text(1194, top + 80, "per gal", 38, 500, FAINT, "end"))
    for i, (name, di, match, dist, price, badge, bbg, bink) in enumerate(rows):
        ry = top + 96 + i * row_h
        o.append(dot(112, ry + 46, DOTS[di]))
        o.append(text(146, ry + 62, name, 46, 650, INK))
        bw = 214 if badge == "shelf price" else 224
        o.append(pill(346, ry + 24, bw, 52, badge, bbg, bink, 30))
        o.append(text(96, ry + 132, "%s · %s" % (match, dist), 38, 400, MUTED))
        o.append(text(1194, ry + 66, price, 58, 700, INK if i else GREEN_DEEP, "end"))
        o.append(text(1194, ry + 130, "per gal", 34, 400, FAINT, "end"))
        if i:
            o.append(hairline(96, 1194, ry - 8))
    note_y = top + 96 + len(rows) * row_h + 52
    o.append(text(96, note_y, "Online prices can run higher than the shelf tag.", 34, 400, FAINT))

    # sort / filter chips
    cy = top + card_h + 62
    chips = [("Unit price", True), ("per gal", False), ("Matches only", False), ("In stock", False)]
    x = 48
    for label, on in chips:
        w = 44 + len(label) * 21
        o.append(pill(x, cy, w, 74, label, GREEN_SOFT if on else "#E6E8EA",
                      GREEN_DEEP if on else INK2, 36))
        x += w + 20

    o.append(tab_bar(0))
    return "".join(o)


# --------------------------------------------------------------------------- 2
def screen_deal():
    """A weekly-ad deal opened, with the conditions the ad actually carries."""
    o = [rect(0, 0, W, H, 0, CARD)]
    # sheet grabber + title row
    o.append(rect(585, 34, 120, 12, 6, "#D6D9DC"))
    o.append(text(96, 190, "2% reduced fat milk, 1 gal", 54, 700, INK))
    o.append(rect(1042, 130, 200, 84, 42, "#EFF0F2"))
    o.append(text(1142, 186, "Done", 40, 600, INK2, "middle"))

    o.append(dot(112, 262, DOTS[1]))
    o.append(text(146, 278, "Store B", 46, 650, INK))
    o.append(pill(348, 240, 208, 54, "weekly ad", DEAL_BG, DEAL_INK))
    o.append(text(584, 278, "2.1 mi", 40, 500, MUTED))

    # headline price
    o.append(text(96, 430, "$2.99", 136, 800, INK, spacing=-3))
    o.append(text(482, 430, "/gal", 56, 600, MUTED))
    o.append(text(96, 500, "with the store's digital coupon", 40, 500, DEAL_INK))

    # the fine print, which is the whole point of this screen
    o.append(rect(48, 560, 1194, 560, 54, "#F7F8F9"))
    o.append(text(96, 640, "Conditions", 44, 700, INK))
    conditions = [
        ("Must buy", "4 participating items"),
        ("Limit", "2 per household, per day"),
        ("Without the coupon", "$4.29 / gal"),
        ("Ad runs", "Wed 17 Sep – Tue 23 Sep"),
    ]
    for i, (k, v) in enumerate(conditions):
        ry = 706 + i * 98
        o.append(text(96, ry, k, 40, 500, MUTED))
        o.append(text(1194, ry, v, 40, 650, INK, "end"))
        if i < len(conditions) - 1:
            o.append(hairline(96, 1194, ry + 32))

    # unit price
    o.append(rect(48, 1166, 1194, 250, 54, "#F7F8F9"))
    o.append(text(96, 1246, "Unit price", 44, 700, INK))
    o.append(text(96, 1310, "Per volume", 38, 400, MUTED))
    o.append(text(1194, 1310, "2.34¢/fl oz · 74.8¢/qt", 38, 500, INK, "end"))
    o.append(text(1194, 1372, "$2.99/gal · 79.0¢/L", 38, 500, INK, "end"))

    # actions
    o.append(rect(48, 1478, 1194, 118, 59, GREEN))
    o.append(text(645, 1552, "Add to list", 46, 650, "#FFFFFF", "middle"))
    o.append(rect(48, 1626, 580, 118, 59, "#EFF0F2"))
    o.append(text(338, 1700, "Watch price", 44, 600, INK2, "middle"))
    o.append(rect(662, 1626, 580, 118, 59, "#EFF0F2"))
    o.append(text(952, 1700, "Open the ad", 44, 600, INK2, "middle"))

    o.append(text(96, 1836, "Ad prices come from the store's own weekly ad and", 36, 400, FAINT))
    o.append(text(96, 1890, "can differ from the shelf tag. Always check the tag.", 36, 400, FAINT))

    o.append(tab_bar(1))
    return "".join(o)


# --------------------------------------------------------------------------- 3
def screen_trip():
    """A completed trip plan: one store, a two-store split, and the cherry-pick.
    Totals only - never a saving, per img/README.md rule 4."""
    o = [rect(0, 0, W, H, 0, PAGE)]
    o.append(text(96, 150, "Trip plan", 66, 800, INK, spacing=-1))
    o.append(text(96, 218, "12 items · 6 stores near 60618", 40, 500, MUTED))

    # The cheapest plan is not the one with the fewest stops. Saying that plainly
    # is more useful than pretending one option wins on everything.
    cards = [
        ("One store", "Store C", "$48.12", "12 of 12 items · 0.7 mi", "Fewest stops", 272, False),
        ("Two stores", "Store C + Store A", "$45.86", "8 + 4 items · 2.9 mi total", None, 0, False),
        ("Cherry-pick", "Store C, A, D and F", "$43.90", "12 items · 9.4 mi total", "Lowest total", 268, True),
    ]
    y = 300
    h, gap = 380, 40
    for title, sub, total, meta, badge, bw, best in cards:
        o.append(rect(48, y, 1194, h, 54, CARD, GREEN if best else None, 5))
        o.append(text(96, y + 96, title, 52, 700, INK))
        if badge:
            o.append(pill(400, y + 54, bw, 58, badge, GREEN_SOFT, GREEN_DEEP, 32))
        o.append(text(96, y + 190, sub, 44, 500, INK2))
        o.append(text(96, y + 276, meta, 38, 400, MUTED))
        o.append(text(1194, y + 116, total, 78, 800, GREEN_DEEP if best else INK, "end"))
        o.append(text(1194, y + 180, "list total", 34, 400, FAINT, "end"))
        y += h + gap

    # what the plan covers, stated plainly
    o.append(rect(48, y + 20, 1194, 360, 54, "#EAF2EC"))
    o.append(text(96, y + 110, "What these totals cover", 46, 700, INK))
    for i, line in enumerate([
            "Every item on your list, priced at each store",
            "for the same size, on the same day.",
            "Driving is not priced in, and a store that is",
            "missing an item is never counted as cheapest."]):
        o.append(text(96, y + 182 + i * 56, line, 38, 400, INK2))

    o.append(tab_bar(2))
    return "".join(o)


SCREENS = {
    "phone-search.svg": ("Cartworth search results, illustrated", screen_search),
    "phone-deal.svg": ("Cartworth weekly-ad deal with its conditions, illustrated", screen_deal),
    "phone-trip.svg": ("Cartworth trip plan totals, illustrated", screen_trip),
}


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(here, "src")
    os.makedirs(out_dir, exist_ok=True)
    for name, (title, fn) in SCREENS.items():
        body = fn()
        svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
               'viewBox="0 0 %d %d">\n'
               '<title>%s</title>\n'
               '<desc>Illustration of the Cartworth iPhone app, not a screenshot. '
               'Store names are stand-ins. Example prices, September 2026. '
               'Square working canvas; the shipped image is the centre %dx%d band.</desc>\n'
               '<rect width="%d" height="%d" fill="%s"/>\n'
               '<g transform="translate(%d,0)">%s</g>\n</svg>\n'
               % (CANVAS, CANVAS, CANVAS, CANVAS, esc(title), W, H,
                  CANVAS, CANVAS, PAGE, DX, body))
        path = os.path.join(out_dir, name)
        with open(path, "w") as fh:
            fh.write(svg)
        print("wrote %s" % path)


if __name__ == "__main__":
    main()
