# Hacker News: Show HN

**Status: draft. Not submitted.** Posting is the owner's action from the owner's own HN account.

## Rule check (news.ycombinator.com/showhn.html, read 10 Nov 2026)

- "Show HN is for something you've made that other people can play with." The web app qualifies.
- "Please make it easy for users to try your thing out, ideally without barriers such as signups
  or emails." The web app has no account at all. **Link the web app, not the marketing site or the
  guide**: "blog posts, sign-up pages, newsletters, lists, and other reading material" are off
  topic for Show HN, and the guide is reading material.
- "Please don't ask friends to upvote or comment." Don't share the HN link anywhere with a
  request, and don't have anyone you know comment.
- The title begins with "Show HN". HN's general guidelines ask for plain titles with no
  superlatives or exclamation marks.
- One Show HN per project is the norm. This is the only one; don't repost if it sinks.

## Submission

**Title** (67 characters; HN's limit is 80):

```
Show HN: Cartworth – Compare grocery unit prices at stores near you
```

**URL:**

```
https://app.cartworth.app
```

**Text** (HN shows this as the first comment when a URL is given; post it as a comment right
after submitting if the form drops it):

```
I make Cartworth. You enter a US ZIP and an item, and it prices that item at the grocery stores near that ZIP at the same time, converts everything to one unit (per lb, per gal, per dozen, per count), and ranks the closest real match from each store. No account, no sign-up, and the web version is free with no search limit.

Things that turned out to be most of the work:

- Matching. "Milk" must not return milk chocolate. "Pie crust" returned a whole apple pie at six stores in one test city, and "canned pumpkin" returned nothing at 23 stores because no can says "canned". Each of those is now a test.

- Units. A "12 ct, 15 oz" pack of rolls is 15 oz in total. A turkey is sold per pound at most stores and per bird at some, with no weight given. Loose produce priced "each" needs an assumed weight, so those results are marked as estimates and never used for a claimed saving.

- Being honest about what kind of price it is. Some stores publish shelf prices. Most publish only a delivery or pickup listing, which can run above the shelf. One large chain publishes a single chain-wide price. Every result is labelled, and if the best and second-best prices are different kinds, it says "less than the next-best store" and gives no number. If they are within the error of their kinds, it says "≈ same".

- Weekly ad fine print. "$0.59/lb with $25 purchase", "limit 1", "with card", "must buy 5". In QA last week an ad that said "$1 off" a $16.99 item was being read as a $1.00 price, 94% off. Fixed, with a test. The ad conditions are shown next to the price.

Where prices come from: what each retailer publishes online for the store nearest the ZIP. A few chains have their own catalogue; most publish through their Instacart storefront; weekly ads come from the circular service the stores use. Nothing is crowdsourced. Published prices can be wrong or stale, so it is a guide, not a guarantee, and it makes no claim about how much anyone will save.

There is a Thanksgiving list in it right now (14 items, add your own sizes, then a trip plan: cheapest single store, best two-store and three-store split). There is also an iPhone app with a free tier and a paid tier; the web app is not a demo of it.

It is US only. Some chains block lookups or publish no prices; for those it shows the weekly ad and says so. I would like to hear about wrong matches and wrong units most of all. A ZIP and the search term is enough for me to reproduce one.
```

**Image:** none. HN has no images.

**Best time:** a weekday morning US Eastern, roughly 8 to 10 am ET, Tuesday to Thursday. That is
common advice from launch write-ups, not an HN rule. Suggested: **Wed 11 Nov or Thu 12 Nov**.
Pick a morning when you can stay in the thread for three to four hours; unanswered questions hurt
more than the hour does.

## Before submitting

- Re-read the text against the app that morning. The 94% example is from 3 Nov
  (`facts.md` #3); the pie crust and canned pumpkin examples are #7.
- Make sure the web app can take the traffic. A front-page Show HN can bring thousands of visits
  in an hour, and each search fans out to retailer sites. The 20-minute cache helps repeated
  searches, not new ZIPs. The QA notes record retailers answering 429 when five sessions ran at
  once. Decide beforehand what the app shows when a retailer refuses.
- Read "Two things to decide" in [README.md](README.md). The questions below will come.

## Questions to expect, with honest answers

These are drafts in the owner's voice. Answer in your own words; don't paste.

- **"Is this scraping? Do the retailers allow it?"** "It reads the same public pages a browser
  loads for that store, one request at a time, with a cache so repeat searches don't hit the
  retailer again. I have no agreement with any retailer and I say so on the site." Do not go
  beyond that, and do not argue the law in the thread (`compliance.md` rule 47 and finding 3.4).
- **"Online listings aren't shelf prices."** "Right, which is why each one is labelled and why it
  won't put a number on a comparison between a shelf price and an online one."
- **"Why is the iPhone app paid if the web is free?"** "The web app does the comparison, ads, list
  and trip planning free. The paid part of the iPhone app is what needs the phone: alerts,
  location, recipe photos. Three searches a day are free there."
- **"What do you log?"** "There's no account and no visitor id. The web server caches results by
  store, ZIP and search term for twenty minutes. The iPhone app has no server; requests go from
  the phone to the retailer."
- **"It got X wrong in my ZIP."** Thank them, ask for the ZIP and term, and fix it. This is the
  most useful thing the thread can produce.
