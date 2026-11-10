# Launch kit: App Store launch and the Thanksgiving guide, 10–26 Nov 2026

Prepared 10 Nov 2026. Thanksgiving is Thursday 26 Nov. Everything here is a draft for the owner:
**nothing in this folder has been posted, sent or submitted, and no account was created or used.**
Each item goes out only when the owner posts it or approves it, one item at a time.

| File | What it holds |
|---|---|
| [facts.md](facts.md) | Every checkable claim the posts use, with its source in the repo. Read first. |
| [checklist.md](checklist.md) | What to do on which day, 10–27 Nov. |
| [app-store-promo-text.md](app-store-promo-text.md) | Thanksgiving Promotional Text (170 max) and the text to go back to. |
| [reddit.md](reddit.md) | r/iosapps, r/apple, r/Thanksgiving, r/budgetfood, city subs. Where not to post. |
| [hacker-news.md](hacker-news.md) | Show HN title, first comment, prepared answers. |
| [product-hunt.md](product-hunt.md) | Tagline, description, maker comment, gallery. |
| [facebook-groups.md](facebook-groups.md) | Admin request and the group post. |
| [social-short.md](social-short.md) | X, Threads and Bluesky posts, with character counts. |
| [press-pitch.md](press-pitch.md) | Pitch for consumer desks, and outlets with public tip routes. |
| [img/thanksgiving-share.png](img/thanksgiving-share.png) | 1200x630 share image, no prices or store names. |

## Rules every post in this kit follows

These come from `marketing/social/compliance.md` (23 Sep 2026) and the site's own wording. They are
why the posts read the way they do.

1. **Say who you are first.** Every post off the brand account opens with "I make Cartworth"
   (compliance rule 37).
2. **No savings promise, no user counts, no reviews, no testimonials.** The site says "Anyone who
   promises you a guaranteed saving on groceries is guessing". The posts say the same.
3. **No store is named next to a price.** Compliance rules 12, 34 and "Low-risk defaults": a
   comparison that names a retailer and rests on Instacart or circular data waits for a lawyer.
   The posts describe what the tool does and tell people to enter their own ZIP. Where a number
   appears it is dated, placed, labelled with its basis, and has no store name.
4. **Numbers go stale.** The QA figures in [facts.md](facts.md) are from 3 and 9 Nov. Re-check
   any number in the app within 24 hours before it goes out (rule 10), or cut the sentence. Every
   post still works with its number removed.
5. **"Independent. Not affiliated with any store."** goes on anything that mentions stores.
6. **Never ask for upvotes, reviews or ratings**, and never post from a second account
   (rule 40; also against Hacker News, Product Hunt and Reddit rules).

## Two things to decide before posting anything

- **How much attention you want on where the prices come from.** Hacker News and r/apple readers
  will ask how Cartworth gets prices, and the honest answer (retailers' public sites, mostly
  Instacart storefronts, plus a circular service) is already on the home page. `compliance.md`
  finding 3.4 calls publishing that data an open legal question and lists "book a lawyer" as
  step 1. A Show HN is the one item here that could put that question in front of a large,
  technical audience. It is still the best fit for the product. It is the owner's call.
- **Which accounts post.** This kit assumes the owner's personal Reddit, HN and Facebook accounts
  (with the disclosure line), and `getcartworth` brand accounts on X, Threads and Bluesky if they
  exist (`marketing/social/handles.md` recommended that handle on 23 Sep; whether they were
  registered is not recorded in the repo).

## Channel summary

Reddit refused automated reads on 10 Nov, so every Reddit rule below comes from a third-party
snapshot with the date shown. **Open each sub's own Rules tab before posting**; mods have the
last word.

| Channel | Self-promotion | Plan |
|---|---|---|
| r/Frugal | **Not allowed.** "No self-promotion, solicitation, or market research", "No commercial links" (nichory.com, data 1 Nov 2026) | Do not post. |
| r/EatCheapAndHealthy | **Not allowed without mod permission.** Link posts need a formatted recipe; no external links except imgur/youtube (threadotter.com, Aug 2026; nichory.com, 1 Nov 2026) | Do not post. Optional modmail in [reddit.md](reddit.md). |
| r/budgetfood | Rules take no clear position, "which is NOT permission" (threadotter.com, Oct 2026) | Ask the mods first. Text post, no link, only if they say yes. |
| r/Thanksgiving | Same: no clear position, no link policy (threadotter.com, Oct 2026) | Ask the mods first. Text post. |
| r/iosapps | Allowed with conditions: developer flair, disclose, about once per 30 days; one source says 10 karma earned in the sub first (leadsrover.io, replyhey.com; sources disagree on details) | Post once. |
| r/apple | Developers only, Sundays California time, self-post; account must be active in the sub (several third-party readings, Sep 2026) | Sunday 15 Nov, if the account qualifies. |
| City subs | Not checked one by one. Most big-city subs remove app promotion | Default no. Template and test in [reddit.md](reddit.md). |
| Hacker News | Show HN allowed for something people can try, "ideally without barriers such as signups"; "don't ask friends to upvote or comment" (news.ycombinator.com/showhn.html, read 10 Nov 2026) | Post once, link the web app. |
| Product Hunt | Posting your own product is encouraged; new accounts wait one week; no paid hunters (help.producthunt.com, producthunt.com/launch) | Launch 17 or 18 Nov. |
| Facebook groups | Set by each group's admins; most ban promotion or keep it to one day | Ask the admin first. |
| X, Threads, Bluesky | Your own accounts | Short posts through 27 Nov. |
| Press | Public tip forms and newsroom pages only | Pitch by 12 Nov. |

## Open Graph check of the guide page (10 Nov, live site)

`https://cartworth.app/guides/thanksgiving-dinner-prices` returns 200 and already carries a full
set: `og:type` article, `og:title`, `og:description`, `og:url`, `og:image` with width 1200, height
630 and alt text, and `twitter:card` summary_large_image. The image is the general brand card,
`/img/og-cartworth.png` (200, image/png, 55 KB). So a link to the guide already unfurls correctly
everywhere; it just looks the same as a link to the home page.

**Share image.** [img/thanksgiving-share.png](img/thanksgiving-share.png) is a Thanksgiving
version of that card (1200x630, RGB, no alpha, 74 KB), drawn from the same mark and gradient as
`site/tools/src/og-cartworth.svg`. Attach it to posts that allow an image. It is **not** wired
into the site: making it the guide's `og:image` means a change to `site/tools/make-guides.py` and
`make-site-images.sh` plus a deploy, which is a follow-up for the owner to decide, not part of
this kit. To re-render after editing the SVG:

```bash
T=$(mktemp -d); qlmanage -t -s 1200 -o "$T" marketing/launch-2026-11/img/thanksgiving-share.svg && sips -c 630 1200 "$T/thanksgiving-share.svg.png" && python3 site/tools/png-rgb.py "$T/thanksgiving-share.svg.png" marketing/launch-2026-11/img/thanksgiving-share.png --bg '#FFFFFF'
```

## Links used in the posts

- Web app (free, no account): `https://app.cartworth.app`
- Thanksgiving guide: `https://cartworth.app/guides/thanksgiving-dinner-prices`
- App Store: `https://apps.apple.com/us/app/cartworth-grocery-prices/id6816954374`
- How prices are read: `https://cartworth.app/#sources` is **not** confirmed as an anchor; link
  the home page, `https://cartworth.app`, unless you check it.

No tracking parameters are added. The site says it runs no analytics, and a `utm_` link in a post
that says "no tracking" reads badly.

## Sources for the rule checks

- https://news.ycombinator.com/showhn.html
- https://help.producthunt.com/posting/how-to-post-a-product and https://www.producthunt.com/launch/before-launch
- https://nichory.com/r/Frugal and https://nichory.com/r/EatCheapAndHealthy
- https://www.threadotter.com/subreddit-rules/eatcheapandhealthy, `/budgetfood`, `/thanksgiving`
- https://leadsrover.io/subreddits/r/iosapps and https://www.replyhey.com/subreddits/iosapps
- https://pulsefox.io/subreddits/apple and https://www.replyhey.com/subreddits/apple
