# Price-data permission requests (drafts, not sent)

Drafted Sept 24, 2026 for Nicholas Soderstrom to review and send from his own address. Nothing here has
been sent. Each draft is short on purpose: a first contact asks one clear question.

## Where each source stands (research, Sept 2026)

| Source | What it offers | Blocking terms | Odds | Send |
|---|---|---|---|---|
| **Kroger Developer API** (developer.kroger.com) | Store-level regular + promo (card) price, free public tier, ~10,000 product calls/day | Sec. 4 bars "competitive, comparative ... analysis to develop marketing or business strategies targeting Kroger customers"; Sec. 5 bars publicly displaying content "unless expressly permitted"; cache only as long as the cache header says; show Kroger's required attribution; no implied endorsement | **Good**: the API exists for apps like this; the clauses need a written reading | 1st |
| **Flipp** (corp.flipp.com/contact-us) | Weekly-ad data via partner-only FlyerKit; NativeX embeds for media partners | No public data licence found; terms not verifiable | **Possible** | 2nd |
| **Instacart** (Developer Platform) | Shopping-list and recipe links only; no prices | Developer terms 3.5: may not "display priced items from multiple retailers on the same screen", no scraping | **Low**: the terms forbid exactly this; a written exception is the only route | 3rd |
| **Trader Joe's** | Nothing public; blocks automated access | Terms: no reproduction or commercial use without "express written permission" | **Low**, but the terms name the route | 4th |

What this means for the product, whatever the answers: until a source says yes, its prices should not be
shown publicly or in a paid app. Kroger (Mariano's, Pick 'n Save, Metro Market) is the realistic first
licensed source. Walmart's and Target's affiliate programs give links, not shelf prices.

---

## 1. Kroger Developer Marketplace

**To:** Kroger Developer Marketplace support (the contact/support link at developer.kroger.com, after registering the app)
**Subject:** Terms question before launch: showing Kroger store prices in a price-comparison app

Hello,

I'm building Cartworth (cartworth.app), a small grocery price-comparison app for shoppers in the
Chicago and Milwaukee areas. I've registered for the Kroger public API and would like to use the
Products and Locations APIs to show shoppers the price of an item at their nearest Mariano's, Pick 'n
Save or Metro Market, next to prices at other nearby stores, labelled as coming from Kroger with any
attribution you require.

Before I launch I want to be sure I'm within the API Terms of Use, and two clauses aren't clear to me
for this use:

1. Section 4, which prohibits using the APIs "to perform competitive, comparative or any other type of
   analysis to develop marketing or business strategies ... targeting Kroger customers." Cartworth
   shows a shopper prices so they can choose where to shop; it does not build marketing strategies.
   Is showing Kroger prices alongside other stores' prices permitted?
2. Section 5, on publicly displaying content "unless expressly permitted." Is displaying an item's
   current price to the shopper who searched for it permitted?

The iPhone app will have an optional paid tier. I will follow your cache headers, not store prices
beyond them, and not suggest any partnership with or endorsement by Kroger.

Could you confirm whether this use is allowed, or tell me what would need to change? I'm happy to
share screenshots or a test build.

Thank you,
Nicholas Soderstrom
Cartworth · support@cartworth.app · cartworth.app

---

## 2. Flipp

**To:** https://corp.flipp.com/contact-us/ (partnerships / business development)
**Subject:** Weekly-ad data licensing or NativeX for a grocery price-comparison app

Hello,

I run Cartworth (cartworth.app), a small grocery price-comparison website and iPhone app for the
Chicago and Milwaukee areas. Shoppers type an item and see its price at nearby stores; this week's
circular deals are a big part of what they want to see.

I'd like to include weekly-ad deals in a way Flipp permits, and I'd rather ask than guess. Is there a
licensing arrangement, API access (such as FlyerKit), or a NativeX or media-partner option that would
let Cartworth show current circular items and prices for the stores near a shopper, with Flipp
credited? I'd be glad to learn what the terms and costs would be.

Cartworth is early and small, so a pilot on a limited set of stores or ZIP codes would suit us well.

Thank you,
Nicholas Soderstrom
Cartworth · support@cartworth.app · cartworth.app

---

## 3. Instacart

**To:** Instacart Developer Platform (the contact route in the Developer Dashboard; there is no public business-development email)
**Subject:** Question about showing Instacart-listed prices in a price-comparison app

Hello,

I'm building Cartworth (cartworth.app), a small grocery price-comparison app. I've read the Instacart
Developer Platform terms, including section 3.5 on displaying priced items from multiple retailers on
the same screen, and I understand the platform doesn't support that today.

I wanted to ask directly whether Instacart offers any arrangement (a partnership, a data licence, or a
different program) under which an app could show a shopper the price Instacart lists for an item at
their nearby stores, with a clear link to buy it on Instacart. Cartworth would send shoppers to
Instacart to order; it does not sell groceries itself.

If there's no such path, I'd also be glad to add a "Shop this list on Instacart" button through the
Developer Platform as it stands.

Thank you,
Nicholas Soderstrom
Cartworth · support@cartworth.app · cartworth.app

---

## 4. Trader Joe's

**To:** https://www.traderjoes.com/home/contact-us (the media-requests form, or general contact)
**Subject:** Permission request: showing Trader Joe's shelf prices in a grocery price-comparison app

Hello,

I run Cartworth (cartworth.app), a small grocery price-comparison app for shoppers in the Chicago and
Milwaukee areas. Your Terms of Use say content may be used with Trader Joe's express written
permission, so I'm writing to ask rather than assume.

Would Trader Joe's permit Cartworth to show shoppers the shelf price of Trader Joe's items at their
nearest store, clearly labelled as Trader Joe's prices and with a link to your site? If there's a
preferred way to receive that information, or it's something you don't allow, I'd be grateful to know
either way.

Thank you,
Nicholas Soderstrom
Cartworth · support@cartworth.app · cartworth.app

---

## Sources (for your own reading before sending)

- Kroger API Terms of Use: developer.kroger.com (Terms, sections 4 and 5; quoted above from the terms text).
- Instacart Developer Platform terms: docs.instacart.com/developer_platform_api/guide/terms_and_policies/developer_terms (section 3.5).
- Flipp contact: corp.flipp.com/contact-us.
- Trader Joe's terms of use: traderjoes.com/home/terms-of-use ("express written permission").
- Not verified from Kroger's own documentation: that Mariano's is covered by the public API (a third-party
  client lists it; test with the Locations API and a Chicago ZIP), and the exact daily limits.
