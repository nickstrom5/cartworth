# Images this site uses

All seven files referenced by the markup now exist. `node scripts/check-seo.js site` is clean.

Regenerate every one of them with:

    site/tools/make-site-images.sh          # or: ... brand   /   ... phones

Nothing here is hand-edited. If you change a file in this folder without changing its source in
`site/tools/`, the next build silently throws your change away.

## What is here

| File | Size (px) | Source | What it is |
|---|---|---|---|
| `og-cartworth.png` | 1200 x 630 | `tools/src/og-cartworth.svg` | Open Graph / Twitter card. Artwork. |
| `icon-180.png` | 180 x 180 | the built app icon | `apple-touch-icon`. Square, opaque, not pre-rounded. |
| `cartworth-logo.png` | 512 x 512 | the built app icon | Organization JSON-LD logo. |
| `iphone-duo.png` | 1600 x 1000 | `tools/make-duo.py` | The two phone images on a brand field. |
| `iphone-max-search.png` | 1290 x 2322 | `tools/make-phone-svg.py` | Search results for milk. |
| `iphone-max-deal.png` | 1290 x 2322 | `tools/make-phone-svg.py` | A weekly-ad deal with its conditions. |
| `iphone-max-trip.png` | 1290 x 2322 | `tools/make-phone-svg.py` | Trip-plan totals. |
| `devices-ipad-duo.png` | 1600 x 1000 | `tools/make-device-shots.py` | REAL screenshots (iPad search home; iPhone Duo search home and shopping list) in drawn device outlines. Only frames with no prices, retailer names or flyer art; see that script's header. |

Every file is 8-bit RGB with **no alpha channel** and an sRGB chunk, and every one is under 300 KB.
The alpha matters: several social scrapers composite an alpha channel onto black, and
`.shot-frame::after` in `styles.css` paints a placeholder cart glyph *underneath* the `<img>`, so a
transparent PNG would show that glyph through its gaps.

The two icons are resampled from
`ios/App/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`, so the site and the app
ship the same mark by construction. Rebuild the app icon first (`ios/Design/build.sh`) if you change
the mark.

## The four phone images are ILLUSTRATIONS, not screenshots

This is the one thing to carry away from this file.

`marketing/screenshots/` holds real simulator frames, and they were preferred. None of the four
screens this page asks for could be used:

- **Search results.** The real frame (`02-search-results-milk.png`) renders the weekly-ad carousel,
  whose tiles are retailer **flyer images** carrying brand wordmarks and in-ad pricing typography —
  forbidden by rule 1 below and by `marketing/APP_STORE_LISTING.md`. The same frame also shows
  defect D1: a mis-parsed **$29.84/gal attributed by name to a real retailer**, which flattens every
  other bar in the chart. Publishing a wrong price against a named third party is not a cosmetic
  problem.
- **Weekly-ad deal detail.** Never captured. The UI test's selector lands on the sort menu instead;
  `DealDetailView` is never reached. See `marketing/screenshots/README.md`.
- **Completed trip plan.** Never captured. Nothing taps "Plan the cheapest trip".
- The captures also carry a dirty simulator status bar, which is why 1290 x 2322 crops it off.

So the four images are drawn, in the same visual language as the hero illustration already in
`index.html`. They follow these rules:

1. **No retailer is named.** Store names are stand-ins, "Store A" through "Store F", exactly as the
   hero illustration does.
2. **Every price is a real observed Chicago price** from the 2026-09-22 capture (ZIP 60618), with
   the store name replaced by a stand-in. Nothing was invented to look good. The mis-parsed outlier
   is absent because it was a bug, not a price.
3. **No dollar amount of saving anywhere** — the trip screen shows three totals and never a delta.
4. No free-tier counter, no paywall, no retailer logos, no flyer artwork.

### Open item for whoever owns the HTML

`index.html` currently says, under the shot row:

> Requires iOS 17 or later. Screenshots shown are of the app in development.

That line is now wrong. It needs to say **illustrations, not screenshots** — for example
"Illustrations of the app in development, not screenshots. Example prices, September 2026. Varies by
location." The site-wide disclaimer in the legal section already covers the prices; the word
"screenshots" is the part that is false.

The `alt` text on the four `<img>` tags matches what the illustrations show and does not need to
change.

**Swap these out for real frames as soon as clean ones exist.** The path is: fix D1 and D2, curate
which deals are on screen so no flyer artwork is in shot, extend the UI tests to reach
`DealDetailView` and the trip plan, and re-shoot with
`xcrun simctl status_bar <udid> override --time 9:41 --cellularBars 4 --batteryState charged
--batteryLevel 100`.

## Rules for every image on this site

These are not style preferences. They come from `marketing/APP_STORE_LISTING.md` and
`marketing/SOCIAL_MEDIA_BRIEF.md` and they exist to keep the product out of trouble.

1. **No retailer logos, wordmarks, brand colours used as branding, signage or mascots.** The app
   itself never renders a retailer logo, so the only risk is product and flyer imagery inside a
   screenshot. Pick items whose artwork is a plain product photo, or crop so it is incidental.
   Retailer names as plain text next to a neutral colour dot are fine.
2. **Nothing that implies a partnership.** Never place a retailer's brand next to Cartworth's in a
   way that suggests a relationship.
3. **Every price visible in an image must be real, and must be dated as an example.** The page must
   carry the label "Example prices, [month year]. Varies by location." Do not mock up prices in a
   design tool and do not reuse a price image older than a few weeks without re-dating it.
4. **Never show a dollar amount of savings.** No "save $40 a week" anywhere, in an image or a
   caption. It is unprovable and invites both an App Review problem and an advertising-claims
   problem.
5. **Do not show the free-tier counter** ("You have 2 free searches today") in any screenshot.
6. **Keep the shelf and online labels visible.** Do not crop them out, and never present an online
   or delivery price as a shelf price.
7. Use a device with a clean status bar: full signal, full battery.

## Build notes, so the next person does not rediscover them

- `qlmanage` is the only SVG rasteriser on this machine (`rsvg-convert`, ImageMagick and Pillow are
  all absent) and it **only honours `-s` on a square canvas**. Every SVG source here is authored
  square with the real artwork in a centred band, and `sips` crops the band out afterwards.
- Backgrounds are **vertical** gradients, never diagonal and never with a radial glow over the top.
  The renderer dithers gradients; one that varies along both axes leaves no two neighbouring pixels
  alike and PNG's per-row filters have nothing to work with. The first cut of the social card was
  490 KB that way and 55 KB as a vertical ramp.
- `tools/png-rgb.py` drops the alpha channel. It hands the decode to `sips` (via an uncompressed
  BMP) and does the channel work with whole-buffer slice assignments, so a megapixel image takes
  well under a second. `ios/Design/png_flatten.py` does the same job in a per-pixel Python loop and
  takes over two minutes on the social card; use it only for the app icons, where it is the proven
  path.
- There is no image optimiser installed (`oxipng`, `pngquant`, ImageOptim are all absent). If you
  add one, run it over this folder — `cartworth-logo.png` and `iphone-duo.png` have the most to
  give back.

## Optional, only if you add it

| File | Size (px) | Note |
|---|---|---|
| `favicon.ico` | 32 x 32, 48 x 48 | The pages use an inline SVG favicon, which every modern browser supports. Only add this for very old clients, and add the `<link>` yourself. |
