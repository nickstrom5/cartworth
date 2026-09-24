#!/usr/bin/env python3
"""Builds the guide pages in site/guides/ from the text below, inside the site's own header and footer
(taken from site/support.html, so the chrome can never drift from the other pages).

Every figure in a guide is one Cartworth measured itself, with where it came from:
  - Instacart vs shelf: the round-2 pairs recorded in shared/compare.js (BASIS_SPREAD).
  - The unit-price traps: defects found and fixed in the price engine (test/qa-pricing-round2.test.js,
    DEFECT P1, P21, P22; shared/units.js; src/normalize.js), each on a real listing.
Nothing here is a live price. Dates are stated so a reader knows how old a figure is.

    python3 site/tools/make-guides.py
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / 'site'
BASE = 'https://cartworth.app'
UPDATED = '2026-09-24'

SUPPORT = (SITE / 'support.html').read_text()
HEADER = SUPPORT[SUPPORT.index('<a class="skip"'):SUPPORT.index('<main')]
FOOTER = SUPPORT[SUPPORT.index('<footer'):SUPPORT.index('</footer>') + len('</footer>')]
FOOTER = FOOTER.replace('<a href="/support" aria-current="page">Support</a>', '<a href="/support">Support</a>')
ICON_LINES = [l for l in SUPPORT.split('\n') if 'rel="icon"' in l or 'apple-touch-icon' in l or 'theme-color' in l]
ICONS = '\n'.join(l.replace('href="img/', 'href="/img/') for l in ICON_LINES)


def page(path, title, description, h1, eyebrow, lede, body, crumbs, article=None):
    url = f'{BASE}/{path}' if path else BASE + '/'  # 'guides/' keeps its slash: the server's canonical form
    graph = [
        {'@type': 'Organization', '@id': f'{BASE}/#organization', 'name': 'Cartworth', 'url': f'{BASE}/'},
        {'@type': 'BreadcrumbList', '@id': f'{url}#breadcrumb', 'itemListElement': [
            {'@type': 'ListItem', 'position': i + 1, 'name': n, **({'item': u} if u else {})} for i, (n, u) in enumerate(crumbs)]},
    ]
    if article:
        graph.append({
            '@type': 'Article', '@id': f'{url}#article', 'headline': h1, 'description': description, 'url': url,
            'inLanguage': 'en-US', 'datePublished': article, 'dateModified': UPDATED, 'image': f'{BASE}/img/og-cartworth.png',
            'author': {'@id': f'{BASE}/#organization'}, 'publisher': {'@id': f'{BASE}/#organization'},
            'mainEntityOfPage': url, 'breadcrumb': {'@id': f'{url}#breadcrumb'},
        })
    else:
        graph.append({'@type': 'CollectionPage', '@id': f'{url}#webpage', 'url': url, 'name': title, 'description': description,
                      'inLanguage': 'en-US', 'dateModified': UPDATED, 'isPartOf': {'@id': f'{BASE}/#website'},
                      'breadcrumb': {'@id': f'{url}#breadcrumb'}})
    t, d = html.escape(title), html.escape(description)
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{t}</title>
<meta name="description" content="{d}">
<link rel="canonical" href="{url}">
{ICONS}

<meta property="og:type" content="{'article' if article else 'website'}">
<meta property="og:site_name" content="Cartworth">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:image" content="{BASE}/img/og-cartworth.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The Cartworth mark, three price bars over a shopping basket, above the wordmark and the line Compare grocery prices.">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="{BASE}/img/og-cartworth.png">

<link rel="stylesheet" href="/styles.css">
</head>
<body>
{HEADER}<main id="main" tabindex="-1">
  <div class="wrap wrap-narrow doc-header">
    <p class="eyebrow">{eyebrow}</p>
    <h1 class="h-section">{h1}</h1>
    <p class="doc-meta">{lede}</p>
  </div>

  <div class="wrap wrap-narrow doc-body prose">
{body}
{NOTE if article else ''}
  </div>
</main>

{FOOTER}

<script type="application/ld+json">
{json.dumps({'@context': 'https://schema.org', '@graph': graph}, indent=2)}
</script>
</body>
</html>
'''


INSTACART = dict(
    path='guides/instacart-vs-in-store-prices',
    title='Instacart vs in-store prices: what we measured | Cartworth',
    description='Same product, same store, same week: Instacart ran a median 13.3% above the shelf price, up to 20%. Some stores match the shelf to the cent. Our measurements.',
    h1='Are Instacart prices higher than in store?',
    eyebrow='Guide · What we measured',
    lede='Usually, yes: a median of 13.3% in our checks, and up to 20%. But not everywhere. Some stores sell on Instacart at exactly their shelf price. Measured by hand in the Chicago and Milwaukee areas, September 2026.',
    article='2026-09-24',
    body='''
    <h2 id="short-answer" style="margin-top: 26px">The short answer</h2>
    <p>For most stores, the price on Instacart is higher than the price on the shelf of the same store, for the same product in the same package, in the same week. In the pairs we checked by hand it ran from <b>0% to 20% higher, with a median of 13.3%</b> and a mean of 10.7%. It was never meaningfully lower.</p>
    <p>Instacart says so itself: many storefronts carry the line <i>"Prices vary from in-store"</i>. What that line does not tell you is by how much. That is what we measured.</p>

    <h2 id="how">How we checked</h2>
    <p>A fair comparison needs the same product, the same package size, the same store and the same week, or it is not measuring the markup at all. So each pair was:</p>
    <ul>
      <li>a chain's own printed weekly ad price (its shelf price that week), and</li>
      <li>the same chain's Instacart listing of the same product and package, for the same ZIP code, in the same week.</li>
    </ul>
    <p>We checked 24 such pairs by hand, plus an in-store check at Jewel-Osco against Jewel's own app. Pairs we could not match exactly were kept apart: three less certain ones (a "2 for" deal, an ad that printed no package size) came out 34% and 43% higher, and they are not in the figures above.</p>

    <h2 id="results">What we found</h2>
    <dl class="keyvals">
      <div><dt>Range, 24 pairs</dt><dd>0% to 20.0% above the shelf</dd></div>
      <div><dt>Median</dt><dd>13.3% above</dd></div>
      <div><dt>Mean</dt><dd>10.7% above</dd></div>
      <div><dt>Jewel-Osco, 13 pairs</dt><dd>median 14.3%, highest 20.0%</dd></div>
      <div><dt>Lowest</dt><dd>0.2% below, once (a $4.99 listing against a $5.00 card price)</dd></div>
    </dl>
    <p>Three examples from Jewel-Osco, checked against Jewel's own app:</p>
    <ul>
      <li>A pound of Lucerne butter on sale: <b>$4.99</b> on Instacart, <b>$4.49</b> in Jewel's app.</li>
      <li>The same pound at its regular price: <b>$6.99</b> on Instacart, <b>$5.99</b> in Jewel's app.</li>
      <li>Kerrygold butter: <b>$7.99</b> on Instacart, <b>$6.99</b> in Jewel's app.</li>
    </ul>

    <h2 id="exceptions">The stores that match the shelf</h2>
    <p>Not every store marks up. Some grocers run their own online storefront on Instacart's platform and sell at their in-store prices. In our checks, Woodman's, Tony's Fresh Market and ALDI matched their printed ad <b>to the cent</b>. ALDI's own storefront says it shows in-store shelf prices.</p>
    <p>So "Instacart is always more expensive" is not quite right either. It depends on the store, and the listing usually tells you, if you read the small print under the store name.</p>

    <h2 id="what-to-do">What this means when you compare prices</h2>
    <ul>
      <li><b>Do not compare an online price with a shelf price as if they were the same thing.</b> A store that looks 10% dearer on Instacart may be cheaper on its own shelf.</li>
      <li><b>Check the store's own app for card and loyalty prices.</b> Those are often lower again, and they are not always on Instacart.</li>
      <li><b>If you shop in person, the shelf price is the one that matters.</b> Delivery prices plus fees and a tip are a different purchase.</li>
    </ul>

    <h2 id="cartworth">How Cartworth handles it</h2>
    <p>Every price in Cartworth carries a label saying what kind of price it is: <b>shelf price</b>, <b>online price</b> (a store's Instacart listing), <b>chain-wide</b> (one listing for the whole chain), or <b>weekly ad</b>. When the best price is a shelf price and the next store only has an online price, Cartworth does not claim an exact saving between them. It allows an online price to be up to 25% above the shelf, which covers every pair above, and only says one store is cheaper when it still is after that allowance.</p>
    <p><a href="/#how">See how Cartworth compares prices</a>, or read the <a href="/guides/unit-prices">guide to unit prices</a>.</p>
''',
)

UNIT = dict(
    path='guides/unit-prices',
    title='How to compare grocery prices by unit price | Cartworth',
    description='Unit price is the only fair way to compare package sizes. How to work it out, and six real label traps that make a grocery price look far cheaper than it is.',
    h1='How to compare grocery prices by unit price',
    eyebrow='Guide · Unit prices',
    lede='The price per ounce, pound, gallon or item is the only fair way to compare a 12 oz box with a 42 oz canister. It is also where most grocery price mistakes hide. Here are the six traps we found in real store listings.',
    article='2026-09-24',
    body='''
    <h2 id="what" style="margin-top: 26px">What a unit price is</h2>
    <p>A unit price is the package price divided by how much is in the package. A $3.49 carton of 64 fl oz orange juice is 5.5&cent; per fluid ounce, or $6.98 a gallon. A $5.99 gallon is $5.99 a gallon. The gallon is cheaper even though its price is higher.</p>
    <p>Grocery unit prices come in three kinds, and you can only compare within one kind:</p>
    <ul>
      <li><b>By weight</b>: per ounce or per pound. Meat, cheese, coffee, rice, most dry food.</li>
      <li><b>By volume</b>: per fluid ounce, quart or gallon. Milk, juice, broth, oil.</li>
      <li><b>By count</b>: per item or per dozen. Eggs, rolls, pods.</li>
    </ul>
    <p>Pick the unit that makes the numbers readable: per pound for meat, per gallon for milk, per dozen for eggs. The shelf tag in most US stores prints a unit price already, but not always in the same unit from one store to the next.</p>

    <h2 id="traps">Six label traps, all from real listings</h2>
    <p>Each of these made a price look far cheaper than it was, in a real store listing, until we taught Cartworth to read it correctly.</p>

    <h3 id="count-then-weight">1. "12 ct, 15 oz" is not twelve 15 oz bags</h3>
    <p>A bag of Hawaiian rolls listed as <i>"12 ct, 15 oz"</i> is twelve rolls weighing 15 oz <b>in total</b>. Read as twelve 15 oz packs, a $2.69 bag works out to 24&cent; a pound. The real figure is $2.87 a pound. In US labelling, a piece count followed by a weight almost always means pieces, with the weight being the whole package.</p>

    <h3 id="weight-then-count">2. "8oz, 9ct" is nine slices, not nine packs</h3>
    <p>Sliced cheese listed as <i>"8oz, 9ct"</i> is nine slices in one 8 oz pack. Read as nine packs, $5.49 looks like $1.22 a pound. It is $10.98 a pound. When the name counts containers ("Yogurt Cups, 5.3 oz, 12 Count"), it really is twelve cups; when it counts pieces, it is one package.</p>

    <h3 id="multipack">3. Warehouse clubs state one unit's size and charge for the pack</h3>
    <p><i>"Kerrygold Pure Irish Butter, 8 oz, 4-count"</i> is four 8 oz blocks, 2 lb in all. Warehouse clubs write the size of one unit and the count after it, hyphenated. Divide the price by one block and the butter looks four times dearer than it is.</p>

    <h3 id="per-pound">4. A price per pound shown as a package price</h3>
    <p>A listing reading <i>"Ground Chuck, 10 lb, $7.99"</i> looks like 80&cent; a pound. The small print under it said <i>"$0.50/oz"</i>, which is $7.99 for <b>one</b> pound. Stores that sell meat and cheese by weight sometimes publish the per-pound price against a typical package size. If a big package looks impossibly cheap, check the per-ounce line.</p>

    <h3 id="fluid-ounces">5. "32 oz" of broth is a quart, and "10.5 oz" of soup is not</h3>
    <p>Drinks and broth are sold by volume, so a "32 oz" carton of broth means 32 <b>fluid</b> ounces, a quart. A can of condensed soup is sold by <b>weight</b>: 10.5 oz of food, not 10.5 fluid ounces. Comparing a weight with a volume gives a number that means nothing.</p>

    <h3 id="each-vs-pound">6. "Each" against "per pound"</h3>
    <p>Bananas are sold per pound in one store and at so much each in the next; avocados, peppers and melons too. You can only compare them by assuming a typical weight for one piece, which makes the result an estimate. Treat it as one.</p>

    <h2 id="habits">Habits that avoid all six</h2>
    <ul>
      <li>Compare unit prices, never package prices, and only in the same kind of unit.</li>
      <li>When a price looks far better than every other store's, read the size line and the per-unit line before you believe it.</li>
      <li>For multi-buy deals ("2 for $5"), check whether you have to buy two to get the price.</li>
      <li>Remember that an online price is a different number from the shelf price (see <a href="/guides/instacart-vs-in-store-prices">Instacart vs in-store prices</a>).</li>
    </ul>

    <h2 id="cartworth">How Cartworth does it</h2>
    <p>Cartworth converts every price it finds to one unit per search, reads each of the traps above, and when a listing contradicts itself (its size says one thing and its own per-ounce line another) it keeps the package price but refuses to use the listing as the best price. <a href="/#how">See how it works</a>.</p>
''',
)

GUIDES = [INSTACART, UNIT]

# The site's rule for any page that shows a grocery price (scripts/check-seo.js): say that it is an example.
NOTE = '''    <p class="doc-meta" style="margin-top: 30px">Prices on this page are examples measured in September 2026. Prices change, and they vary by store and location. Cartworth is independent and not affiliated with any retailer named here.</p>'''


def index_page():
    items = '\n'.join(
        f'''    <h2 id="{g['path'].split('/')[-1]}" style="margin-top: 26px"><a href="/{g['path']}">{g['h1']}</a></h2>
    <p>{g['description']}</p>''' for g in GUIDES)
    return page('guides/', 'Grocery price guides | Cartworth',
                'Plain guides to grocery prices, built on what Cartworth measured: Instacart against the shelf, and how to compare by unit price without falling for label traps.',
                'Grocery price guides', 'Guides',
                'Short, plain guides to reading grocery prices, each built on something Cartworth measured rather than guessed.',
                items, [('Cartworth', f'{BASE}/'), ('Guides', None)])


def main():
    out = SITE / 'guides'
    out.mkdir(exist_ok=True)
    (out / 'index.html').write_text(index_page())
    for g in GUIDES:
        name = g['path'].split('/')[-1]
        (out / f'{name}.html').write_text(page(g['path'], g['title'], g['description'], g['h1'], g['eyebrow'], g['lede'], g['body'],
                                               [('Cartworth', f'{BASE}/'), ('Guides', f'{BASE}/guides/'), (re.sub(r'\?$', '', g['h1']), None)],
                                               article=g['article']))
        print(f'wrote site/guides/{name}.html')
    print('wrote site/guides/index.html')


if __name__ == '__main__':
    main()
