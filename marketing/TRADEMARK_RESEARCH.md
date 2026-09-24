# Cartworth: preliminary name research

**Date of research:** 2026-09-22
**Researcher:** automated research pass, not a person and not a lawyer

---

## Read this first

**I am not a lawyer, and this is not a trademark clearance opinion.** Nothing here tells you the
name is available, safe, or clear to use. A real clearance opinion can only come from a licensed
trademark attorney who has run a proper search and put their name on the advice.

The purpose of this document is narrow: surface obvious conflicts cheaply, so you know whether it
is worth paying for a real clearance search, and so that when you do hire an attorney they have a
head start instead of starting from zero.

There is also a significant limitation on this particular pass. **I was not able to search the USPTO
register itself.** Details are in "What I could not check" below. Everything in the tables comes from
third-party mirrors read through search results, which can be stale or incomplete. Treat every status
in this document as unconfirmed until you or your attorney looks it up on tmsearch.uspto.gov.

---

## What I could not check

This matters more than usual, so it goes near the top rather than buried at the end.

| Source | What happened | Consequence |
|---|---|---|
| tmsearch.uspto.gov (the current USPTO search, TESS was retired in Nov 2023) | The site is a static front end behind an AWS WAF challenge script. No scriptable search endpoint exists on that origin: `/api-v1-0-0/tmsearch`, `/api/v1/tmsearch` and `/assets/config.json` all return S3 "NoSuchKey" 404s. | **The primary register was never searched.** This is the single biggest gap. |
| data.uspto.gov (USPTO Open Data Portal) | Also loads an AWS WAF challenge. Its APIs require an API key, and getting one requires creating an account, which I do not do. | Not checked. |
| tsdr.uspto.gov status API | `/ts/cd/casestatus/sn88951098/info.json` returned 404 for a serial number that is known to exist, so that open JSON path is not currently serving. | Could not verify individual serials authoritatively. |
| trademarks.justia.com | HTTP 403 to automated fetch. | Only reachable through search engine snippets. |
| uspto.report | Cloudflare interactive challenge, HTTP 403. | Same. |
| WIPO Global Brand Database (branddb.wipo.int) | Gated behind an Altcha CAPTCHA. | Not checked. Solving CAPTCHAs is off limits. |
| TMview (tmdn.org) | Connection closed without a response. | Not checked. |
| Google Play | Bot protected, not queried directly. | Play store presence not confirmed either way. |
| X, Instagram, TikTok, YouTube handles | Bot protected. Not checked. | Handle availability unknown on those platforms. |
| Reddit handle `u/cartworth` | HTTP 403. | Undetermined. |
| atom.com listing price for cartworth.com | Cloudflare challenge, HTTP 403. | The asking price is unknown. |

I did not spoof user agents, solve challenges, or work around any of these. A browser pane was
available but every tab in it was in active use by other agents working in this repository, and
taking one over would have disrupted their work.

**Net effect:** the searches below are decent negative evidence, gathered several different ways, but
they are not a register search. Step 1 in the action list fixes this in about 30 minutes for $0.

---

## Bottom line

The exact string "Cartworth" did not surface anywhere: no federal mark in any mirror I could reach,
no App Store app, no GitHub user or organization, no npm package, no company using the name.

The risk I did find is not the exact string. It is twofold. First, "cart" is a crowded, weak formative
in exactly the classes this app would file in, and Instacart sits in the middle of that field with
registrations in both class 9 and class 35. Second, cartworth.com is already registered and listed
for sale on a brandable-name marketplace, and cartworth.app was registered by somebody today.

Whether an examiner or a competitor would read CARTWORTH as confusingly similar to INSTACART or to
another cart-formative mark is a judgment call. That judgment is exactly what a clearance search and
an attorney are for, and I am not making it here.

---

## Marks found

Columns are as reported by third-party mirrors. Where I write "not confirmed" I mean I genuinely do
not know, not that the mark is dead. I did not guess at any status.

### Direct hits on CARTWORTH or close spellings

| Mark | Owner | Class | Status | Filed | Registered | Why it matters |
|---|---|---|---|---|---|---|
| CARTWORTH | none found | n/a | No record found | n/a | n/a | Searched four different query formulations across Justia, Trademarkia, TrademarkElite and uspto.report indexes. Nothing surfaced. Negative evidence only. |
| CART WORTH | none found | n/a | No record found | n/a | n/a | Same. |
| KARTWORTH | none found | n/a | No record found | n/a | n/a | Same. |
| CARTWORTHY | Cartworthy Creative Studio (cartworthy.co) | No federal record found | Unregistered common-law use, apparently active | n/a | n/a | Operating branding and packaging design studio. Nearest real-world name collision. Different services, but see "Would worry me" below. |

### Live registrations in or near the lane

| Mark | Owner | Class | Status | Filed | Registered | Why it matters |
|---|---|---|---|---|---|---|
| INSTACART | Maplebear Inc. | 9 (downloadable software for browsing and purchasing consumer goods, recipes, coordinating shopper and delivery services) | Registered | n/a | Reg. 4903628, serial 86323403 | The dominant mark in this exact space, containing "cart". |
| INSTACART | Maplebear Inc. | 9 and 35 | Registered | n/a | Reg. 6233504, serial 88951098 | Same family. |
| INSTACART | Maplebear Inc. | 9 / 35 | Registered | 2022-02-16 | Reg. 7671941, serial 97268893, reg. 2025-01-28 | Recent, so the family is actively maintained and extended. |
| INSTACART EXPRESS | Maplebear Inc. | 35 (online retail store services, online grocery, pharmacy, home goods) | Not confirmed | 2020-08-05 | serial 90095719 | Shows the breadth of their class 35 coverage. |
| SMARTCART | Hungryroot, Inc. | 35 and 42 (subscription grocery order fulfillment; non-downloadable AI software predicting grocery cart) | Not confirmed | 2021-07 | serial 90842588; related serial 98575079 | **The closest analogue found:** grocery, plus software, plus a cart formative. Useful precedent either way. |

### Same formative, different lane (found, relevance low)

| Mark | Owner | Class | Status | Filed | Registered | Why it matters |
|---|---|---|---|---|---|---|
| CARTWHEEL | Cartwheel Robotics Inc. | Not confirmed | Not confirmed | n/a | serial 98771444 | Robotics, not grocery retail. |
| CARTWHEEL | GR Dispatch, Inc. | Not confirmed | Not confirmed | n/a | serial 90608236 | Dispatch and logistics. |
| CARTWHEEL REGISTER | Not captured | Not confirmed | Not confirmed | n/a | Reg. 4573529, serial 85981723 | Name noted for completeness. |
| CARTWHEEL KITCHEN | Golden Platter Foods Inc. | Food | Not confirmed | n/a | Reg. 5991970, serial 88065742 | Food products, not software. |
| CARTABLE | Cartable, Inc. | Carts for sports equipment | Not confirmed | n/a | n/a | Physical carts. Not relevant. |
| CART SAFE | Not captured | Not confirmed | Not confirmed | n/a | serial 88979108 | Not relevant. |
| CARTENER | Not captured | Not confirmed | Not confirmed | n/a | serial 88861830 | Not relevant. |
| CARTWIRE | Unilever IP Holdings B.V. | UK mark UK00912746681 | Not confirmed | n/a | n/a | Not a US registration. |
| CART | CART, Inc. | Not confirmed | Not confirmed | n/a | serial 78186283 | Old, unrelated field. |
| CART | MINITAB, LLC | Not confirmed | Not confirmed | n/a | serial 75322737 | Statistics software. Old. |

### Abandoned or dead (useful context, not obstacles)

Abandoned marks do not block a new application by themselves, but they are worth knowing because
they show the field has been tried before and, occasionally, because an abandoned mark's owner still
has common-law rights from actual use.

| Mark | Owner | Class | Status | Filed | Why it matters |
|---|---|---|---|---|---|
| CARTWISE | Not captured | 42 (non-downloadable e-commerce shopping cart software) | Abandoned, no statement of use, 2004-09-10 | 2002-09-17 | Closest dead analogue on the software side. Dead for over 20 years. |
| SMARTCART | BASF Corporation | Not confirmed | Abandoned, no statement of use, 2006-04-16 | 2001-12-14 | Dead. |
| SMARTCART | Smart Cart, LLC | Electronic cigarettes | Not confirmed | 2020-09-08, serial 90165911 | Different goods entirely. |
| CARTWHEEL | Not captured (footwear and clothing) | 25 | Abandoned, failure to respond, 2014-10-16 | serial 79141434 | Not relevant. |
| CARTWHEEL | Not captured (toys) | 28 | Abandoned, failure to respond | 2013-07-25, serial 86020389 | Not relevant. |
| CARTWHEELS / CARTWHEELS USA | Cartwheels, Inc. and Cartwheels USA, LLC | Apparel and undergarments | Several abandoned, incl. 1996-03-15 | serials 74625512, 73832231, 77512924, 74576447 | Not relevant. |

### Competitors I was asked to check and could not resolve

| Name | What I found | What I could not find |
|---|---|---|
| Target CARTWHEEL | The program is real: launched 2013-05-08, folded into the main Target app in 2017, over 27 million downloads. Target Brands, Inc. is the brand-holding entity. | **No Target Brands registration for CARTWHEEL surfaced in any mirror.** Do not read that as "unregistered". It is far more likely my sources are incomplete. Have your attorney pull Target Brands' portfolio directly. |
| BASKET (basketsavings.com) | Grocery price-comparison app, founded 2014, Arlington VA, founders Andy Ellwood and Neil Kataria. Clearly in active use, so common-law rights almost certainly exist. | No federal registration record surfaced. |
| FLIPP | Owned by Wishabi Inc., Toronto, formerly Wishabi, pivoted to digital circulars in 2013. Active in the US. | No registration detail surfaced. |
| IBOTTA | Ibotta, Inc. Active US cashback and grocery savings app. | No registration detail surfaced. |

---

## Would worry me

**1. Instacart.** They hold registrations in class 9 and class 35 covering downloadable software for
browsing and purchasing consumer goods and online grocery retail services. That is your exact lane,
and the shared element is "cart". The strongest argument in your favor is that "cart" is weak and
close to descriptive for shopping software, so nobody gets to own it, and crowded fields tolerate
close neighbors. The problem is that Instacart has the budget to file an opposition regardless of
whether they would ultimately win. An opposition is expensive to defend even when you are right, and
it arrives after you have already built the brand. This is the single item most worth an attorney's
opinion.

**2. The "cart" field is crowded in classes 9, 35 and 42.** SMARTCART by Hungryroot is the closest
live-looking example: grocery, software, cart formative. A crowded field cuts both ways. It weakens
everyone's claim to exclusivity, which helps you, but it also raises the odds that an examiner finds
something to cite, which costs you time and an office action response.

**3. cartworth.com is taken and for sale.** It was registered 2014-12-29 through NameSilo, expires
2026-12-29, and the record was updated 2026-09-11. It currently redirects to
`https://www.atom.com/name/CartWorth`, which is a listing on Atom.com, a brandable-name marketplace
formerly called Squadhelp. This is not a trademark problem. It is a cost and credibility problem. A
US consumer app that cannot get its matching .com pays for that forever in lost typo traffic and
confused support email. I could not retrieve the asking price because the page is behind a Cloudflare
challenge. Names listed on Atom are priced as brandables, which usually means four figures or more.

**4. cartworth.app was registered today.** RDAP shows a registration event at
2026-09-22T20:23:27 UTC through Cloudflare Registrar, with Cloudflare nameservers, expiring
2027-09-22. My lookup ran roughly five minutes later. If you or someone on your side registered it
just now, ignore this. If not, a third party took your most natural fallback domain today, and you
should find out who before you commit.

**5. CARTWORTHY.** An operating design and branding studio at cartworthy.co uses a name one letter
away from yours. Their services are different enough that consumer confusion is unlikely, and I found
no federal registration for them. But it muddies your search results, it costs you the top organic
slot for near-miss queries, and if you ever file in class 35 touching marketing or branding services
it becomes a live question rather than a footnote.

---

## Probably fine

- **The CARTWHEEL marks in robotics, dispatch, toys, footwear, food and apparel.** Different goods
  and services, and several are already abandoned. Target's own CARTWHEEL remains an open question
  only because I could not confirm it, not because I found a problem.
- **CARTWISE.** Abandoned in 2004 with no statement of use. Over 20 years dead.
- **SMARTCART by BASF.** Abandoned 2006. **SMARTCART by Smart Cart, LLC.** Electronic cigarettes.
- **CARTABLE, CART SAFE, CARTENER, CARTWIRE, and the older CART marks.** Unrelated goods, or not US
  registrations.
- **The second element "worth".** This is the genuinely good news. "Worth" is distinctive in this
  context, it carries the meaning you want (what the cart is worth), and I found no evidence of
  anyone combining it with "cart" in commerce. Whatever the risk here is, it comes from "cart", not
  from the mark as a whole.

---

## Common-law and digital footprint

Unregistered prior use can block you even with a clean register, so this section matters.

| Check | Method | Result |
|---|---|---|
| US App Store | iTunes Search API, `term=cartworth`, `entity=software`, US store | 5 results, all fuzzy "-worth" matches (Petworth Places, Goodstead, Ackworth, Magna Park Lutterworth, Bombay Spice Bedworth). **No Cartworth app.** |
| Google Play | Not queried, bot protected | Unknown |
| GitHub user `cartworth` | api.github.com | 404, does not exist |
| GitHub org `cartworth` | api.github.com | 404, does not exist |
| GitHub repo search | api.github.com | 2 results, both fuzzy matches on "cartworthy-assets". No Cartworth project. |
| npm package `cartworth` | registry.npmjs.org | 404, does not exist |
| Company using the name | Multiple web searches | None found. Nearest is Cartworthy Creative Studio, a different name and different business. |
| Reddit `u/cartworth` | HTTP 403 | Undetermined |
| X, Instagram, TikTok, YouTube | Not checked, bot protected | Unknown |

---

## Domains

Checked by RDAP (authoritative registry data) and whois.

| Domain | Status | Detail |
|---|---|---|
| cartworth.com | **Registered, and for sale** | Created 2014-12-29, registrar NameSilo LLC, expires 2026-12-29, record updated 2026-09-11. Redirects to an Atom.com brandable listing at `/name/CartWorth`. Price unknown, page behind Cloudflare. |
| cartworth.app | **Registered today** | Registration event 2026-09-22T20:23:27 UTC, registrar Cloudflare Inc., Cloudflare nameservers, expires 2027-09-22. |
| cartworth.io | Appears available | No RDAP record (404) |
| cartworth.co | Appears available | No RDAP record (404) |
| cartworth.net | Appears available | No RDAP record (404) |
| getcartworth.com | Appears available | No RDAP record (404) |

"Appears available" means no registry record existed at the time of the lookup. Confirm at a
registrar before relying on it, and register the same day you decide.

---

## What to do next, and what it costs

Ordered so that the cheap steps eliminate the expensive ones where possible.

**1. Search the USPTO register yourself. Cost: $0, about 30 minutes.**
This is the gap in this document and you can close it today. Open tmsearch.uspto.gov in a normal
browser and search: `CARTWORTH`, `CART WORTH`, `KARTWORTH`, `CARTWORTHY`, and a wildcard `CART*`
filtered to classes 9, 35 and 42. Also pull the portfolios of Maplebear Inc. and Target Brands, Inc.
Screenshot everything, including the empty result screens. Those screenshots are what your attorney
will want first.

**2. Check Google Play and the social handles by hand. Cost: $0, about 15 minutes.**
Search Play for "Cartworth", and check the handle on X, Instagram, TikTok and YouTube.

**3. Get a price on cartworth.com. Cost: $0 to ask.**
Ask through the Atom.com listing. Brandable listings there commonly run from roughly $2,000 to $5,000
and sometimes considerably more, and many offer lease-to-own. Do this before you spend money on legal
work, because if the .com is out of reach that is a reason to reconsider the name, and it is cheaper
to learn that now.

**4. Find out who registered cartworth.app today. Cost: $0.**
Check with anyone on your side who might have grabbed it. If nobody did, treat the .app fallback as
gone and factor that in.

**5. Attorney knockout search. Cost: roughly $300 to $800, often flat fee, sometimes bundled free
into a filing package.**
A trademark attorney spends an hour on the register and tells you whether there is an obvious
problem. This is the right next spend once steps 1 through 4 come back without a showstopper, and it
should happen **before** you pay for logo design, packaging, App Store art, or anything else that
becomes sunk cost if the name changes.

**6. Full attorney-run clearance search. Cost: roughly $1,500 to $3,500 all in.**
This is a comprehensive vendor search covering the federal register, state registers, common-law use
and domain use, plus a written opinion from the attorney. It is worth paying for when **any** of
these is true:
- Step 1 turns up any hit at all on a cart-formative mark in classes 9, 35 or 42.
- You are about to spend real money on the brand, or you already have.
- You plan to raise outside money, because diligence will ask and "we did a web search" is not an
  answer.
- You intend to file in class 35, which is where Instacart's coverage is broadest.
- You plan to go beyond the US.

If none of those are true and you are testing the idea cheaply, step 5 alone is a defensible place to
stop for now.

**7. Federal application, when you get there. Cost: USPTO fee plus attorney fee, per class.**
The USPTO base application fee is approximately $350 per class, but the fee structure changed in
January 2025 and there are surcharges that depend on how you write your goods and services, so
confirm the current schedule at uspto.gov rather than budgeting from this number. Attorney fees are
commonly $500 to $1,500 per class on top. For an app like this the usual pairing is class 9
(downloadable software) and class 35 (retail and price comparison services), adding class 42 if you
offer a hosted service.

**One more thing worth saying plainly:** if you are still early enough that changing the name is
cheap, the crowded "cart" field is itself an argument worth weighing. Every cart-formative mark you
pick fights for distinctiveness in a space where Instacart is the anchor tenant. A name that does not
contain "cart" would have a shorter path through the USPTO and a cheaper trip through clearance. That
is a business judgment, not a legal one, and it is yours to make.

---

## Closing disclaimer

**I am not a lawyer. This is not legal advice and it is not a trademark clearance opinion.** It is a
cheap first pass assembled from public sources, and it has a known and significant gap: the USPTO
register itself was not searched, because the search system is behind bot protection that I will not
work around. Every status in this document is unconfirmed. Several marks I was specifically asked to
check, including Target's CARTWHEEL, I could not resolve at all.

Nothing here says the name is available. Nothing here says you should proceed. Before you commit money
to this name, have a licensed trademark attorney do the work properly.
