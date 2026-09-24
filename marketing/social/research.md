# Cartworth social: what actually works

Research date: Wednesday 2026-09-23. Thanksgiving 2026 is Thursday November 26 (64 days away).

How this was gathered: web searches, plus single, sequential page reads of public sources. I never
sent parallel requests to one host. Where a host refused (HTTP 403, timeout, or the fetch tool
declined the domain), I recorded the item as **unknown** and did not retry by another route. That
list is in section 8. I did not start the Cartworth server or run price searches. The only Cartworth
data used is what was already captured in `stats/` (week of 2026-09-21).

Labels used below:
- **Evidence:** a primary or reputable secondary source, cited with a URL.
- **Secondhand:** a vendor blog, stats aggregator or search snippet I could not confirm at the
  primary source. Treat it as a lead.
- **Opinion:** my judgement or inference. It is not a finding.

Sibling files cover the rest: `compliance.md` has the posting rules and legal risk, and `handles.md`
has the account names. This file does not repeat them.

---

## 0. What you need to do (the short list)

1. **Start with two platforms: Instagram and TikTok.** Make each piece once and post it to both.
   Put the same vertical videos on YouTube Shorts, and let Meta cross-post to Threads and your
   Facebook Page automatically. Skip X, Bluesky, Nextdoor and Pinterest for now. (Section 1.)
2. **Use Reddit and local Facebook groups to take part, not to broadcast.** Post as yourself,
   answer grocery price questions with sourced facts, say you build Cartworth whenever you mention
   it, and never post a promotional link. Read each group's rules first. (Section 3.)
3. **Base every "trend" post on government data until Cartworth has its own history:**
   - BLS average prices show price levels.
   - The BLS CPI (including Chicago's) shows price changes.
   - USDA ERS forecasts show what's expected next.
   - USDA AMS advertised-feature reports cover turkey and produce ads.

   Cite each one by name and give its date. (Section 4.)
4. **Don't publish a Cartworth-data comparison yet.** The captured data can't support one honestly:
   Chicago has one shelf-price store (ALDI), and Jewel-Osco, Mariano's and Target have online
   prices only. Every item is rated confidence "low". There are no Milwaukee or Kenosha samples.
   (Section 6.)
5. **Hit these dates** (details in section 5):
   - Fri Sep 25: USDA food price forecast.
   - Wed Oct 14: September CPI, including Chicago.
   - Mid-to-late October: retailers announce their Thanksgiving meal deals.
   - Fridays: USDA turkey ad report.
   - Tue Nov 10: October CPI.
   - About Wed Nov 18 or Thu Nov 19: Farm Bureau Thanksgiving survey.
   - Fri Nov 20: turkey ads for Thanksgiving week.
6. **Build three things before the first post:**
   - a reusable chart template that always shows the source, date, place and price basis
   - a one-page "where our numbers come from" explainer to link from every bio
   - the pre-publish checklist in `compliance.md`
7. **Pause the "Cheapest State for [staple]" weekly series** in `../SOCIAL_MEDIA_BRIEF.md`. The
   captured data covers 6 states and 44 stores, mixes shelf and online prices, and rates every item
   confidence "low". A "cheapest state" claim would imply precision the data doesn't have.

---

## 1. Platforms

### 1.1 What the evidence says about each platform

| Platform | Format that fits grocery price content | Discovery mechanics | Welcomes promotional accounts? | Key facts |
|---|---|---|---|---|
| **TikTok** | 15 to 60 second vertical video: a screen recording or a shelf shot with a voiceover and burned-in text. Photo carousels work for charts. | The For You feed is driven by interests, not followers, so a new account with zero followers can reach people. Search matters too. | Yes, with conditions. A Business Account can only use the Commercial Music Library (**Secondhand:** [Soundstripe](https://www.soundstripe.com/blogs/why-can-i-only-use-commercial-sounds-on-tiktok); TikTok's own [CML terms](https://www.tiktok.com/legal/page/global/commercial-music-library-user-terms/en)). Promoting your own product needs the "Your brand" content disclosure toggle ([TikTok ads help](https://ads.tiktok.com/help/article/about-the-content-disclosure-setting-for-creators)). | **Evidence:** 37% of US adults use TikTok, and about half of those aged 18 to 29 ([Pew, Nov 2025](https://www.pewresearch.org/internet/2025/11/20/americans-social-media-use-2025/)). The US joint venture closed in January 2026, and Oracle is retraining the recommendation algorithm on US data ([NPR](https://www.npr.org/2026/01/22/nx-s1-5685456/tiktok-finalizes-deal-to-form-new-american-entity), [TikTok newsroom](https://newsroom.tiktok.com/announcement-from-the-new-tiktok-usds-joint-venture-llc)). |
| **Instagram Reels** | The same vertical video as TikTok. | Reels are recommended to non-followers. **Trial Reels** show a Reel to non-followers first, then you decide whether to share it with followers ([Instagram, Dec 10 2024](https://creators.instagram.com/blog/instagram-trial-reels)). Adam Mosseri has named watch time, likes per reach and sends (DM shares) per reach as the main ranking signals (**Secondhand:** reported by [Dataslayer](https://www.dataslayer.ai/blog/instagram-algorithm-2025-complete-guide-for-marketers) and others). | Yes. | **Evidence:** 50% of US adults use Instagram ([Pew](https://www.pewresearch.org/internet/2025/11/20/americans-social-media-use-2025/)). |
| **Instagram carousels** | 4:5 chart slides: the hook on slide 1, one number per slide, the source on the last slide. This is the natural home for official-data trend posts. | Shown in feed and Explore. Saves and sends drive reach. | Yes. | **Evidence:** Across 872,075 posts (Jan 2025 to Aug 2026), carousels had the highest Instagram reach rate: 4.50%, against 4.10% for Reels and 4.00% for images. Accounts with 1K to 5K followers reached 6.65% of followers, against 3.50% for accounts with 100K to 1M ([Socialinsider, Sep 3 2026](https://www.socialinsider.io/blog/social-media-reach/)). |
| **YouTube Shorts** | The same vertical video. Shorts can run up to 3 minutes. | The Shorts feed, YouTube search, and increasingly Google results. Titles carry the hook. | Yes. | **Evidence:** 84% of US adults use YouTube, the most of any platform ([Pew](https://www.pewresearch.org/internet/2025/11/20/americans-social-media-use-2025/)). Shorts have allowed up to 3 minutes since Oct 15, 2024 ([YouTube blog](https://blog.youtube/news-and-events/tall-updates-coming-to-shorts/)). |
| **Facebook Page** | Cross-posted Reels, chart images, the odd link. | Recommendations plus followers. Organic Page reach is very low. | Yes, but links may be rationed. | **Evidence:** 71% of US adults use Facebook, and it skews older ([Pew](https://www.pewresearch.org/internet/2025/11/20/americans-social-media-use-2025/)). The average Facebook reach rate is 1.25% of followers ([Socialinsider](https://www.socialinsider.io/blog/social-media-reach/)). Meta tested limiting Pages and professional-mode accounts to 2 link posts a month unless they pay for Meta Verified, and called it "a limited test" ([TechCrunch, Dec 17 2025](https://techcrunch.com/2025/12/17/facebook-is-testing-a-link-posting-limit-for-professional-accounts-and-pages)). |
| **Facebook local groups** | Answers and text posts from a personal profile. | Group feed and member notifications. This is where many suburban shoppers talk. | Mostly **no**. Each group sets its own rules, and most ban self-promotion (**Secondhand:** [roundup](https://multiplegroupposter.com/blog/facebook-group-promotion-rules/)). | Group rules are behind a login, so they're **unknown** to me. You have to read them yourself. |
| **Threads** | Short text plus a chart image. Auto cross-post from Instagram. | For You feed, topics, and Communities (out of beta June 2026). Links are no longer suppressed, per Mosseri (**Secondhand:** [Influencer Marketing Hub](https://influencermarketinghub.com/adam-mosseri-links-on-threads-are-performing-better/)). | Yes. | **Evidence:** 500 million monthly users (Meta, [June 2026](https://about.fb.com/news/2026/06/meta-launching-new-features-500-million-monthly-threads-users/)). |
| **X** | Text plus a chart image. The "BREAKING: record price" style travels. | For You feed plus followers. | Yes. | **Secondhand:** X said in October 2025 that it was testing a change so link posts wouldn't lose reach ([Social Media Today](https://www.socialmediatoday.com/news/x-formerly-twitter-testing-links-in-app-link-post-penalties/803176/), [Nieman Lab](https://www.niemanlab.org/2025/10/x-makes-overtures-to-journalists-with-new-feature-designed-to-improve-reach-for-links/)). Daily users fell year over year as of January 2026 (reported by [Forbes](https://www.forbes.com/sites/conormurray/2026/01/16/threads-widens-lead-over-musks-x-zuckerbergs-platform-adds-millions/), not read). |
| **Bluesky** | Text plus a chart. The economics and data community is there. | Mostly the chronological feed of people you follow, plus custom feeds and starter packs. Little algorithmic push. | Tolerated, but the audience is sceptical of brands (**Opinion**). | **Evidence:** Similarweb estimates about 10.4 million monthly users (June 2026, down 27.2% year over year) and about 3 million daily users; about 46 million accounts are registered ([TechCrunch, Aug 11 2026](https://techcrunch.com/2026/08/11/blueskys-active-user-base-is-shrinking-as-its-focus-expands-beyond-the-app/)). |
| **Reddit** | Text first. Data posts only where the rules allow them. Helpful comments. | Subreddit votes, and Reddit threads rank well in Google search. | Mostly **no**. Reddit's help centre reportedly defines spam as users who "contribute primarily with links to businesses they own or benefit from" (**Secondhand:** from a search snippet; the page returned 403). | **Evidence:** 26% of US adults use Reddit ([Pew](https://www.pewresearch.org/internet/2025/11/20/americans-social-media-use-2025/)). See section 3 for local subreddits. |
| **Nextdoor** | Posts from a Business Page. | Your neighbourhood feed. | **Restricted as of Aug 19, 2026.** Promotion must come from a free Business Page, not a personal account ([Nextdoor](https://blog.nextdoor.com/self-promotion-update)). | **Secondhand:** "Only local businesses can post into the newsfeed. National brands and e-commerce companies are excluded" (a [third-party summary](https://climbtheladder.com/how-to-use-nextdoor-for-business-pages-posts-ads/); Nextdoor's own post doesn't address app-only businesses). An app company probably doesn't qualify, so this is **unknown**. |
| **Pinterest** | 2:3 infographic pins: unit-price explainers, a price-book template, Thanksgiving planning. | Search plus the home feed. Pins stay findable for a long time. People plan seasonal content early. | Yes. | **Evidence:** Pinterest tells marketers to be ready "a couple months ahead of calendar moments" ([Pinterest Business](https://business.pinterest.com/insights/change-your-plans-your-audience-already-did/)). It is only worth doing once the website is live, because its job is sending traffic to a site. |

### 1.2 Realistic effort per post

**Opinion:** these are estimates for one person using templates. They include the price
verification that the no-wrong-prices rule demands.

| Format | First few | Once practised | Of which is verification |
|---|---|---|---|
| Chart carousel from BLS/USDA data (4 to 6 slides) | 2 to 3 h | 45 to 75 min | 15 to 20 min (re-pull the series, check the date, units and region) |
| Short vertical video (screen recording or shelf shot, voiceover, captions) | 2 to 4 h | 60 to 90 min | 15 to 30 min |
| Repurposing a finished video to Shorts, Threads and Facebook | 15 min | 5 to 10 min | 0 (same asset) |
| Text post with one chart (X, Threads or Bluesky) | 30 min | 10 to 15 min | 5 to 10 min |
| Helpful Reddit or Facebook-group comment | 20 min | 10 min | 5 min |

A sustainable solo cadence (**Opinion**):
- 2 carousels and 2 or 3 short videos a week, each posted to both platforms
- automatic cross-posts to the other channels
- about 30 minutes a day of comments and replies

That's roughly 6 to 9 hours a week. The existing brief's plan of 5 to 7 TikToks a week on eight
channels is agency scale. One person can't sustain it and still verify every price.

### 1.3 Recommendation: two to start, and one more for free

**1. Instagram, with carousels and Reels.** (**Opinion**, backed by the evidence above.)
- Carousels are exactly the format for trend charts, and they had the highest reach rate of any
  Instagram format in the 2026 data ([Socialinsider](https://www.socialinsider.io/blog/social-media-reach/)).
- Trial Reels let a zero-follower account test hooks on strangers without cluttering its profile
  ([Instagram](https://creators.instagram.com/blog/instagram-trial-reels)).
- Meta cross-posting sends the same work to Threads (500M monthly users) and a Facebook Page, which
  reaches older suburban shoppers at almost no extra effort.

**2. TikTok, with the same vertical videos plus photo-mode charts.** (**Opinion.**)
- The For You feed is where a brand-new account has the best chance of reaching people who don't
  follow it.
- "Same list, three stores" and "is Aldi really cheaper" videos are already a genre there (see
  section 2).
- The constraints: a Business Account is limited to commercial music, and your own-brand content
  needs the disclosure toggle.

**3. Free add-on: YouTube Shorts.** Upload the same file. YouTube has the widest US reach (84% of
adults), and Shorts are findable in search.

**Participation, not a broadcast channel: Reddit and two or three local Facebook groups.** This is
listening and helpfulness under your own name, with disclosure. Section 3 covers it.

**Not now:**
- **X:** its audience is shrinking, and the genre that performs there (sensational "record price"
  charts) is exactly what Cartworth must not become.
- **Bluesky:** it's small and shrinking.
- **Nextdoor:** under the August 2026 policy, an app business probably can't post to the newsfeed.
- **Pinterest:** revisit when the website is live and it's time to set up the next seasonal moment
  (Christmas baking, or Super Bowl).

The strongest counter-argument is that suburban shoppers over 45 live on Facebook. That's true, but
organic Page reach averages 1.25%, so Facebook's value is the groups, and groups are participation.

---

## 2. Precedent: who already does this, and what works

### 2.1 Formats and hooks that get engagement

| Precedent | What it is | Why it works | Source |
|---|---|---|---|
| **"Same list at 2 or 3 stores"** videos: Aldi vs Walmart, Meijer vs Walmart vs Aldi | A creator buys, or prices, one list at several stores and reveals the totals. | A simple reveal that viewers repeat themselves. Examples range from about 5.6K to 18.4K likes (**Secondhand:** search snippets). Bobby Parrish (FlavCity) ran a "Walmart vs Aldi, which is actually cheaper?" video. | [@ohemmygeee](https://www.tiktok.com/@ohemmygeee/video/7464339459736079646), [@wildboymamax2](https://www.tiktok.com/@wildboymamax2/video/7363684294339956014), [@bobbyparrish](https://www.tiktok.com/@bobbyparrish/video/7506520741660085534), [TikTok topic page](https://www.tiktok.com/discover/meijer-vs-walmart-vs-aldi) |
| **Chain fan and "finds" accounts** | Accounts devoted to a single chain (Aldi, Costco, Trader Joe's) posting new products and deals. | Belonging and fandom. The "ALDI Aisle of Shame Community" Facebook group reportedly has about 3.6M members. Aldi fan Instagram accounts reportedly run from about 88K to 281K followers. | **Secondhand:** [Medium](https://medium.com/@johnnystip1/the-surprising-success-of-the-aldi-aisle-of-shame-3508f6e37c75), [Mashed](https://www.mashed.com/421134/die-hard-aldi-fans-need-to-follow-this-quirky-instagram-account/), [IZEA](https://izea.com/resources/aldi-influencers/) |
| **Shrinkflation before-and-after photos** | Old pack next to new pack, with the size change called out. | Visual proof, and a sense of unfairness. r/shrinkflation grew from about 37K members in 2022 to about 206K. Edgar Dworsky (Consumer World and Mouseprint.org) is the go-to source for the press. | [Modern Retail 2022](https://www.modernretail.co/marketing/its-dishonest-how-shrinkflation-took-over-shoppers-minds-and-social-media-accounts/), [Consumer World](https://www.consumerworld.org/pages/edgar.htm), **Secondhand:** [GummySearch](https://gummysearch.com/r/shrinkflation/) for the current count |
| **Fairness investigations** | Consumer Reports, Groundwork Collaborative and More Perfect Union had 437 shoppers in four cities price the same Instacart carts. They found per-user price differences of up to 23%, and Instacart ended the tests on Dec 22, 2025. | Unfairness plus proof gets shared and changes company behaviour. More Perfect Union posts short videos on grocery pricing across TikTok and X. | [Consumer Reports](https://www.consumerreports.org/media-room/press-releases/2025/12/instacart-ends-ai-driven-pricing-practice-following-a-joint-consumer-reports-investigation-with-groundwork-collaborative-and-more-perfect-union/), [CNBC](https://www.cnbc.com/2025/12/22/instacart-ai-pricing-tests-increased-costs.html), [More Perfect Union on TikTok](https://www.tiktok.com/@moreperfectunion/video/7512104040231128351) |
| **A tracked basket, repeated monthly** | The Chicago Sun-Times Watchdogs price 35 items on the first Tuesday of each month: Jewel-Osco in person, Mariano's, Target and Walmart online. They started in December 2024. | Consistency and a local angle. Their November 2025 basket was $282.95 at Jewel against $262.45 the December before. | [Sun-Times, Nov 7 2025](https://chicago.suntimes.com/the-watchdogs/2025/11/07/grocery-prices-holidays-thanksgiving-christmas-trump-inflation-chicagoans) |
| **Metro store rankings** | Consumer Reports priced 56-item baskets in person, over 48 hours, in six metros including Chicago (late summer 2025). Against Walmart: Jewel-Osco +29.7%, Mariano's +27.6%, Aldi −7.7%, Costco −28.5%. | Authority, plus a named local store. Local papers syndicated it into spring 2026. | [Consumer Reports](https://www.consumerreports.org/money/prices-price-comparison/most-and-least-expensive-supermarkets-a3157951568/), [Journal Star via Yahoo, Apr 10 2026](https://finance.yahoo.com/economy/articles/want-cheaper-groceries-see-prices-185735097.html) |
| **Thanksgiving cost** | The Farm Bureau's "classic feast for 10" survey, plus retailers' meal-deal baskets (2025: Aldi $40 for 10, Walmart under $40 for 10, Lidl $36). | An annual ritual the news covers widely, so it's easy to hang a post on. | [AFBF 2025](https://www.fb.org/news-release/cost-of-thanksgiving-dinner-declines), [Grocery Dive](https://www.grocerydive.com/news/thanksgiving-meals-grocery-walmart-target-lidl-aldi-2025/805440/) |
| **"BREAKING: record price" charts on X** | For example, The Kobeissi Letter: "average price of ground beef ... record $6.67 per pound ... +72% since January 2020". | Big number, record framing, one chart. Very high reach. | [Kobeissi Letter on X](https://x.com/KobeissiLetter/status/2012953132582461859) |

**Direct competitor already doing Chicago content:** GroceryChop publishes "The 22 Best (and Worst)
Grocery Stores in Chicago, Ranked by Price and Value (2026)". It uses a 50-item basket, says it
draws on a live price database with "most prices less than 24 hours old", and publishes its
method. It also runs comparisons against Basket and Flipp
([GroceryChop](https://grocerychop.com/blog/best-grocery-stores-chicago),
[comparison](https://grocerychop.com/blog/basket-vs-flipp-vs-grocerychop)). Chicago Consumers'
Checkbook has long rated area supermarkets on price and quality
([Checkbook Chicago](https://www.checkbook.org/chicago-area/supermarkets/articles/Which-Grocery-Stores-Offer-the-Best-Prices-and-Quality-2055)).

### 2.2 What gets criticised, and the rule each case teaches

| Case | What went wrong | Rule for Cartworth |
|---|---|---|
| **Walmart's 2025 Thanksgiving basket** was cited as "25% less than last year" | It had 15 products against 21 in 2024. Fact-checkers found the drop came from a smaller basket, not lower prices ([CNN](https://www.cnn.com/2025/11/06/politics/walmart-thanksgiving-trump-fact-check), [PolitiFact](https://politifact.com/factchecks/2025/nov/14/donald-trump/walmart-thanksgiving-grocery-prices-inflation/), [Poynter](https://www.poynter.org/fact-checking/2025/trump-walmart-thanksgiving-price-claim-fact-check/)). | Compare baskets year on year only if the contents are identical. Show the item count and sizes on the graphic. |
| **"Turkey prices at lowest since 2000"** | Rated **False**. The Farm Bureau had said turkey's **share** of the meal (39%) was the lowest since 2000. The price itself was higher than in 2019 and 2020 ([PolitiFact, Nov 26 2025](https://www.politifact.com/factchecks/2025/nov/26/richard-hudson/no-turkey-prices-arent-at-their-lowest-in-25-years/)). | Quote the source's exact claim. A share is not a price. |
| **"Egg prices are down" in spring 2025** | The claims used wholesale prices. Retail prices lag: the BLS retail average hit a record $6.23 a dozen in March 2025 ([FactCheck.org](https://www.factcheck.org/2025/03/qa-on-egg-prices/), [ERS chart](http://www.ers.usda.gov/data-products/charts-of-note/chart-detail?chartId=112677)). | Say wholesale, retail, advertised or survey every time. |
| **"Up 72% since 2020" from BLS average prices** | BLS says its average prices "are best used to measure the price level in a particular month, not to measure price change over time". It says to use the CPI for change ([BLS factsheet](https://www.bls.gov/cpi/factsheets/average-prices.htm)). | Use the average price for "what it costs now" and the CPI index for "how much it rose". |
| **Aldi vs Walmart comparisons** | Commenters say they're not like for like: Aldi is about 90% store brand, Walmart mostly national brands, and prices vary by location and season ([Tasting Table](https://www.tastingtable.com/2082484/aldi-cheaper-walmart-explained/), [Retail Dive](https://www.retaildive.com/news/aldi-says-its-beating-everyone-on-price-including-wal-mart/442634)). | State the brand tier ("store brand vs store brand") and the store location and date on screen. |
| **Consumer Reports' own supermarket study** | CR had to add a clarification that its baskets "were significantly larger for mainstream supermarkets ... than for retailers that focus on private-label brands" ([CR](https://www.consumerreports.org/money/prices-price-comparison/most-and-least-expensive-supermarkets-a3157951568/)). | Publish the method before the post, not after the complaints. |
| **Instacart per-user prices** | The same eggs at the same Safeway showed five different prices to different users, from $3.99 to $4.79 ([CR/Groundwork, via 11Alive](https://www.11alive.com/article/money/consumer/consumer-reports/same-groceries-different-prices-consumer-reports-examines-instacart-pricing-tests/85-7d9f4816-7182-46af-b7c1-cefc19099b7f)). Instacart says it stopped. | An "online" price is one shopper's quote at one moment. Never use it to call a chain expensive against another chain's shelf price. |
| **"Free turkey" and loss-leader deals** | Retailers sold turkey at or below cost to pull shoppers in, with conditions attached ([PBS, Nov 24 2025](https://www.pbs.org/newshour/nation/stores-offer-discounted-turkeys-to-get-customers-in-the-door-but-other-thanksgiving-foods-may-cost-more)). | Show the conditions (minimum spend, loyalty card, limit) in the same frame as the price. |

---

## 3. Local angle: Chicago, the suburbs, Milwaukee and Kenosha

### 3.1 Where local shoppers talk about grocery prices

| Place | Size (as reported) | Self-promotion rule | Status |
|---|---|---|---|
| r/chicago | not verified | Reportedly aggressive about removing links and self-promotion (**Secondhand:** [Built In Chicago](https://www.builtinchicago.org/articles/reddit-deep-dive-5-great-subreddits-chicago-startups)) | **Unknown.** The fetch tool declined old.reddit.com, so read the sidebar yourself. |
| r/chicagosuburbs | not verified | not verified | **Unknown** |
| r/chicagofood | about 183K subscribers | Rule 5: "No buying, selling, promoting, crowdfunding" ([WBEZ, Dec 17 2025](https://www.wbez.org/food-drink/2025/12/17/reddit-chicago-food-subreddit-restaurants)) | Evidence. It's about restaurants, so it's off topic for Cartworth anyway. |
| r/milwaukee | about 155K (**Secondhand:** [GummySearch](https://gummysearch.com/r/milwaukee/)) | not verified | **Unknown** |
| r/Kenosha | about 13K (**Secondhand:** [GummySearch](https://gummysearch.com/r/Kenosha/)) | not verified | **Unknown** |
| r/aldi | not verified | not verified | **Unknown** |
| r/Frugal | about 6.8M | Reportedly bans self-promotion, referral links, market research and commercial links (**Secondhand:** [Nichory](https://nichory.com/r/Frugal)) | Unverified |
| "ALDI Aisle of Shame Community" (Facebook) | about 3.6M (**Secondhand**) | Rules pinned inside the group | **Unknown** (login wall) |
| Local Facebook groups (suburb moms groups, "Chicago deals", town groups) | n/a | Each group's pinned rules decide | **Unknown** (login wall) |
| Nextdoor | n/a | Promotion only from Business Pages as of Aug 19, 2026. Personal accounts may still recommend businesses and ask questions ([Nextdoor](https://blog.nextdoor.com/self-promotion-update)). | Evidence. Business Page eligibility for an app is **unknown.** |

### 3.2 What participation is actually acceptable

- **Evidence (platform rules and law):**
  - Reddit's own guidance is summed up in its self-promotion wiki as "It's fine to be a redditor
    with a website; it's not fine to be a website with a reddit account" (**Secondhand:** quoted by
    [Redship](https://redship.io/blog/reddit-self-promotion-rules)).
  - The FTC's Endorsement Guides FAQ says someone promoting their own company's product must
    disclose the connection **in the post itself**. A profile bio isn't enough
    ([FTC](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking)).
  - Nextdoor now reduces the reach of promotional posts from personal accounts and looks at
    patterns of behaviour, not single posts ([Nextdoor](https://blog.nextdoor.com/self-promotion-update)).
- **Opinion (how to behave):**
  1. Use one personal account (Nick) everywhere. Never create a second account to agree with
     yourself.
  2. Spend the first 4 to 6 weeks only answering questions. Examples: "Is $X a good price for eggs
     right now?" (answer with the BLS average and its date), "Why is Jewel so expensive?" (cite
     Consumer Reports), or "Does my town still charge grocery tax?" (point to the Illinois
     Department of Revenue list). Don't mention Cartworth.
  3. Mention Cartworth only when someone asks what tool you use, or when it directly answers the
     question. Say "I'm building this" in the same comment, and don't make the link the whole
     comment.
  4. Before any standalone data post, such as a monthly Chicago CPI chart, message the moderators
     and ask. Post it without a link, with the source named on the image.
  5. Never paste the same copy into several groups or subreddits.
  6. Take a price complaint as a gift. Answer it publicly with the source. Never delete it.

### 3.3 Local facts worth posting (all public, all checkable)

- **Chicago has its own monthly CPI, and it covers Kenosha.** The BLS Chicago-Naperville-Elgin area
  includes Cook, DeKalb, DuPage, Grundy, Kane, Kendall, Lake, McHenry and Will counties in
  Illinois, four counties in Indiana, and **Kenosha County, Wisconsin**. The August 2026 food at
  home index rose 0.3% on the month and 0.9% on the year. The next release is Wed Oct 14, 2026
  ([BLS Chicago CPI](https://www.bls.gov/regions/midwest/news-release/consumerpriceindex_chicago.htm)).
  FRED series `CUURA207SAF11` stood at 309.741 for August 2026
  ([FRED](https://fred.stlouisfed.org/series/CUURA207SAF11)).
- **Milwaukee has no CPI of its own.** BLS stopped publishing Milwaukee-Racine after 2017 data
  ([BLS notice](https://www.bls.gov/regions/midwest/notices/2017/cpi-2018-revision.htm)). Use the
  Midwest region or the national figures, and say so.
- **The Illinois grocery tax.** The state's 1% grocery tax ended on Jan 1, 2026, and more than 600
  localities adopted their own 1% local grocery tax
  ([IDOR bulletin FY 2026-03](https://tax.illinois.gov/research/publications/bulletins/fy-2026-03.html),
  [FY 2026-11](https://tax.illinois.gov/research/publications/bulletins/fy-2026-11.html),
  **Secondhand** for the count: [TaxCloud](https://taxcloud.com/sales-tax-radar/illinois-grocery-tax-repeal-2026/)).
  Chicago missed the Oct 1, 2025 filing deadline, so the city charged no grocery tax from Jan 1,
  2026 ([WTTW headline](https://news.wttw.com/2025/12/31/chicago-s-2026-budget-takes-effect-forcing-chicagoans-pay-more-shopping-bags-uber-rides),
  page returned 403; [Illinois Policy](https://www.illinoispolicy.org/chicago-misses-grocery-tax-deadline-saving-shoppers-40m/)).
  A second wave of local taxes took effect on July 1, 2026. **Check the current IDOR list or the
  MyTax Illinois rate finder before posting** a "does your town tax groceries?" post. It's highly
  useful to suburban shoppers and names no retailer.
- **Consumer Reports' Chicago-area results** and the **Sun-Times monthly basket** (section 2.1)
  are citable local reference points. Credit them. Don't copy their graphics.

---

## 4. Official trend data (until Cartworth has its own history)

### 4.1 BLS CPI Average Price Data (the "APU" series): price levels

- **What it is.** Average prices collected monthly by BLS staff in the 75 urban areas used for the
  CPI. The sample is built for the index, not for averages. The data includes sale prices. Some
  items are broad: eggs include organic, cage-free and conventional
  ([BLS factsheet](https://www.bls.gov/cpi/factsheets/average-prices.htm)).
- **When it comes out.** The same morning as the CPI. The remaining 2026 dates are
  **Wed Oct 14** (September data), **Tue Nov 10** (October) and **Thu Dec 10** (November)
  ([release schedule](https://www.usinflationcalculator.com/inflation/consumer-price-index-release-schedule/);
  the Chicago release confirms Oct 14). For reference: after the autumn 2025 shutdown, BLS
  cancelled the October 2025 release and delayed November's.
- **How to use it.** Post it as "the U.S. city average price in [month]". It's a national figure,
  never your store's price. For "how much did it rise", use the CPI index for that item.
- **Series checked on FRED on 2026-09-23.** All are U.S. city average, and the next update for
  every one is Oct 14, 2026.

| Item | Series | Aug 2026 | Source |
|---|---|---|---|
| Eggs, grade A, large, per dozen | `APU0000708111` | $2.272 | [FRED](https://fred.stlouisfed.org/series/APU0000708111) |
| Milk, whole, per gallon | `APU0000709112` | $4.229 | [FRED](https://fred.stlouisfed.org/series/APU0000709112) |
| Ground beef, 100% beef, per lb | `APU0000703112` | $6.923 | [FRED](https://fred.stlouisfed.org/series/APU0000703112) |
| Bread, white, pan, per lb | `APU0000702111` | $1.823 | [FRED](https://fred.stlouisfed.org/series/APU0000702111) |
| Chicken breast, boneless, per lb | `APU0000FF1101` | $4.173 | [FRED](https://fred.stlouisfed.org/series/APU0000FF1101) |
| Butter, stick, per lb | `APU0000FS1101` | $4.021 | [FRED](https://fred.stlouisfed.org/series/APU0000FS1101) |
| Coffee, 100% ground roast, per lb | `APU0000717311` | $9.299 | [FRED](https://fred.stlouisfed.org/series/APU0000717311) |

- **Traps found while checking:**
  - **Frozen whole turkey, `APU0000706311`, has no data after February 2020** ($1.639/lb)
    ([FRED](https://fred.stlouisfed.org/series/APU0000706311)). Don't use BLS for turkey. Use
    USDA AMS and the Farm Bureau instead.
  - **Midwest regional series have gaps.** Eggs, `APU0200708111`, shows no observation after
    September 2025 ($3.626) ([FRED data](https://fred.stlouisfed.org/data/APU0200708111)). Whole
    milk, `APU0200709112`, stops at April 2020
    ([FRED](https://fred.stlouisfed.org/series/APU0200709112)). **Before any regional post,
    confirm the latest observation is the month you're about to name.**
- **Change measures.** Use the national CPI "food at home" index and the item indexes, such as
  eggs (confirm the exact series ID in BLS Data Finder before publishing), and the Chicago food at
  home index `CUURA207SAF11`.
- **Terms.** Everything BLS publishes is in the public domain, apart from previously copyrighted
  photographs and illustrations. BLS asks to be cited as the source. The BLS emblem is a registered
  trademark and can't be used ([BLS copyright](https://www.bls.gov/opub/copyright-information.htm)).
  Build your own charts, and credit "Source: U.S. Bureau of Labor Statistics".

### 4.2 USDA ERS Food Price Outlook: forecasts

- **What it is.** Forecasts of the annual percentage change in CPI food categories, and in producer
  prices, up to 18 months ahead. From each July it includes the following year
  ([ERS](https://ers.usda.gov/data-products/food-price-outlook)).
- **When it comes out.** "ERS typically releases its monthly CPI and PPI forecast updates on the
  25th of the month; however, if the 25th falls on a weekend or a holiday, the monthly update will
  be published earlier."
  - **Next: Fri Sep 25, 2026.**
  - Then about **Fri Oct 23** (Oct 25 is a Sunday; this is my inference, so confirm on the page).
  - Then **Wed Nov 25**, and before Dec 25.
- **The August 25, 2026 release, which will be superseded on Sep 25:**
  - All food +3.0% in 2026 (range 2.4 to 3.5%)
  - Food at home +2.5%
  - Eggs −30.8%
  - Beef and veal +9.8%
  - Poultry +0.5%
  - All food +2.4% in 2027

  Source: [ERS summary](https://ers.usda.gov/data-products/food-price-outlook/summary-findings).
- **How to use it.** Frame these as "USDA expects", with the prediction interval. They're
  forecasts, not prices.
- **Terms.** Information on USDA websites is generally in the public domain, and USDA asks for the
  credit "U.S. Department of Agriculture". Some items are marked as copyrighted
  ([USDA policies](https://www.usda.gov/about-usda/policies-and-links)).

### 4.3 USDA AMS retail feature reports: advertised prices (the turkey one is on theme)

- **Weekly Retail Turkey Feature Activity (report 2867), released Fridays.**
  - It covers advertised turkey prices at major retailers: the number of stores and the weighted
    average advertised price per lb for each item, with national and regional tables.
  - The Midwest region is IA, IL, IN, KY, MI, MN, ND, NE, OH, SD and WI.
  - A May 2025 issue sampled 24,824 outlets for "Report for 4/26/2025 - 5/2/2025", which is a
    Saturday-to-Friday window.
  - Sources: [ESMIS listing](https://esmis.nal.usda.gov/publication/turkey-usda-weekly-retail-turkey-feature-activity-report-fri),
    [sample PDF](https://esmis.nal.usda.gov/sites/default/release-files/wp98bb45f/s4657c35z/rj432272p/AMS_2867.PDF).
  - AMS's own report pages returned 403 and My Market News timed out, so the **exact Thanksgiving
    2026 release days are unconfirmed.** Watch whether the Friday after Thanksgiving (Nov 27) ships.
- **Other AMS retail reports.** Beef, chicken, dairy, eggs, pork and specialty crops (fruits and
  vegetables) all come out weekly. They're "gathered from publicly available sources that primarily
  include retailer websites" ([AMS retail reports](https://www.ams.usda.gov/market-news/retail),
  via search). The specialty crops report surveys more than 270 retailers and over 29,000 stores
  (**Secondhand**, via search).
- **How to use it.** "Average **advertised** price this week across U.S. grocery ads was $X/lb for
  [item]." It's the ad price, not the price paid, and it's national or regional, not your store.
  Ads often carry conditions.
- **Terms.** A work of the US government, so in the public domain. Credit "USDA Agricultural
  Marketing Service".

### 4.4 American Farm Bureau Federation Thanksgiving dinner survey

- **What it is.** An informal survey. Volunteer shoppers in all 50 states and Puerto Rico check
  prices "in person and online using grocery store apps and websites", looking for "the best
  possible prices without taking advantage of special promotional coupons or combined purchase
  deals".
- **The 2025 results** ([AFBF, Nov 19 2025](https://www.fb.org/news-release/cost-of-thanksgiving-dinner-declines)):
  - Classic feast for 10: **$55.18**, or $5.52 a person.
  - A 16-lb turkey: $21.50, which is $1.34/lb, down 16%.
  - Regional: South $50.01, **Midwest $54.38**, Northeast $60.82, West $61.75.
  - The expanded meal: $77.09.
  - Prices were collected in the first week of November.
- **Release dates.** The survey comes out on the Wednesday or Thursday about a week before
  Thanksgiving:

  | Year | Released | Shopping window | Headline |
  |---|---|---|---|
  | 2025 | Nov 19 | first week of November | $55.18 |
  | 2024 | Nov 20 | Nov 1 to 7 | $58.08 ([AFBF](https://www.fb.org/news-release/cost-of-thanksgiving-dinner-declines-remains-higher-than-pre-pandemic-levels)) |
  | 2023 | about Nov 15 | not stated | $61.17 ([KFGO, Nov 15 2023](https://kfgo.com/2023/11/15/afbf-survey-cost-of-thanksgiving-dinner-down-slightly-from-record-high-in-2022/)) |

  **Expect 2026 on about Wed Nov 18 or Thu Nov 19, with shopping in about Nov 1 to 7.** That's an
  inference from the pattern, not an announced date.
- **Terms.** fb.org grants a "personal, revocable, nontransferable, nonexclusive license ... for
  personal, non-commercial purposes", and says you may not "modify, sell or create derivative
  works" without permission. The permission contact is info@fb.org, (202) 406-3600
  ([AFBF legal](https://www.fb.org/about/legal)).
  - **Opinion (not legal advice):** reporting the headline numbers as facts, with attribution and a
    link, is how news outlets cover the survey. Don't reproduce AFBF's infographics or full item
    tables. Draw your own chart of the few numbers you cite, and email info@fb.org if you want
    more. `compliance.md` covers this further.

### 4.5 How to label official data on a post (**Opinion**, drawn from the rule and the sources)

| Source | Label on the graphic |
|---|---|
| BLS average price | "U.S. city average, [Month YYYY], BLS. Not a price at any one store." |
| BLS CPI | "Change in the [Chicago-area / U.S.] food-at-home price index, [period], BLS." |
| ERS | "USDA forecast, [release date]. Range: X to Y%." |
| AMS | "Average advertised (ad) price, week of [dates], USDA AMS. Ads may have conditions." |
| AFBF | "Farm Bureau volunteer survey, prices checked [dates]. Informal survey, no coupons." |

---

## 5. Timing: Sep 23 to Dec 10, 2026

**Evidence on when Thanksgiving attention peaks:**
- Google reports that Thanksgiving recipe searches peak on Thanksgiving Day itself, and that
  searches for "Thanksgiving side recipes" rise about 400% during November
  ([Google Trends and Maps blog](https://blog.google/products/maps/thanksgiving-turkey-and-traffic-tips-google-trends-and-maps/)).
- Pinterest users plan months ahead ([Pinterest Business](https://business.pinterest.com/insights/change-your-plans-your-audience-already-did/)).
- News coverage of prices clusters in two windows:
  - when retailers announce their meal deals (2025: Aldi about Oct 15, Walmart Oct 21, Lidl by
    Oct 29; [Grocery Dive](https://www.grocerydive.com/news/thanksgiving-meals-grocery-walmart-target-lidl-aldi-2025/805440/),
    via search)
  - the week of the Farm Bureau survey and the turkey ads (the fact-checks cited above are dated
    Nov 6 to 26, 2025)

**Opinion:** Thanksgiving price content peaks in the roughly 10 days before the holiday (about
Nov 16 to 25). There's a smaller earlier bump when the meal deals land in mid-to-late October.
Recipe and cooking content peaks later, on the day itself, and isn't Cartworth's lane.

| Date (2026) | What lands | What to post (**Opinion**) |
|---|---|---|
| Wed Sep 23 to Fri Oct 2 | Nothing new. Setup window. | Grab handles (see `handles.md`). Build the chart template and the "where our numbers come from" page. Make 3 or 4 evergreen posts with no live prices, such as "How to read a unit price tag" and "Shelf vs online vs ad price: why they differ". Try Trial Reels. |
| **Fri Sep 25** | ERS Food Price Outlook | Carousel: "What USDA expects grocery prices to do in 2026 and 2027". Eggs and beef are the story; show the ranges. |
| Fri Oct 2, 9, 16, 23, 30 | AMS turkey reports (turkey features are light before November) | Optional. Save the data to show the ramp-up later. |
| **Wed Oct 14** | September CPI and average prices, and the Chicago CPI | "Chicago-area grocery prices, September: +x% on the year (BLS)." Plus "What a dozen eggs, a gallon of milk and a pound of ground beef cost on average in September" (U.S. city average). |
| Mid-to-late October | Retailers announce Thanksgiving meal deals | The fine-print post: servings, item count, sizes, per-person math, and whether this year's basket matches last year's (the Walmart 2025 lesson). Name the retailers in plain text; no logos (`compliance.md`). |
| Fri Oct 23 (to confirm) | ERS update | Only if the forecast moved materially. |
| Nov 1 to 7 (approx.) | Farm Bureau volunteers price the meal | Nothing to post yet. Prepare the survey-day template. |
| Fri Nov 6, 13 | AMS turkey features increasing | "How often turkey is showing up in grocery ads, and the average advertised price per lb (national, Midwest)." |
| **Tue Nov 10** | October CPI and the Chicago CPI | The monthly Chicago chart, plus any turkey-meal items in the CPI. |
| **About Wed Nov 18 or Thu Nov 19** | Farm Bureau survey | Same-day carousel: the national and **Midwest** totals, the turkey price per lb, and what changed. Carry the survey caveats. Be precise about share vs price. |
| **Fri Nov 20** | AMS turkey report covering the week's ads | "Turkey ads this week: average advertised price, and what 'free turkey' conditions really cost." This is the peak-attention post. |
| Sat Nov 21 to Wed Nov 25 | Peak shopping. ERS update Wed Nov 25. | Short, practical posts: "Turkey per lb: what counts as a good ad price this year" (AMS range), and "Store brand vs name brand for the five sides". Reply to comments fast. |
| Thu Nov 26 | Thanksgiving | No price posts. A light thank-you at most. |
| Fri Nov 27 | Possible AMS report (check) | Optional look back. |
| **Thu Dec 10** | November CPI | "How Thanksgiving-season prices came in", then pivot to Christmas baking: butter (BLS `APU0000FS1101`), flour and sugar. |

**If Cartworth is still pre-launch** (**Opinion**):
- The account can run as a useful price-data account without claiming app features.
- Bio: "Grocery prices, checked honestly. Chicago, Milwaukee and suburbs. App coming."
- No "download" call to action until the site or app is live.
- Link to the methodology page, not to a product page.

---

## 6. Honesty rules specific to social posts (and what the captured data allows today)

**Opinion, derived from the owner's rule and the precedents in section 2.2. `compliance.md` is the
authority on legal wording.**

1. **Every price on a graphic carries four things: basis, date, place, source.** The basis is one
   of shelf, online (Instacart), national listing, weekly ad, advertised-feature average, survey
   average, or government average.
2. **Never compare across bases as if comparing stores.** An Instacart price at one chain against
   a shelf price at another is not a store comparison. Instacart prices have also differed between
   users.
3. **Level vs change.** Use the BLS average price for "costs now" and the CPI index for "rose by".
4. **National or regional figures are never "your store".**
5. **Compare like with like:** the same size, unit and brand tier. Year on year, the basket must
   be identical.
6. **Quote sources exactly.** Share is not price, wholesale is not retail, and an advertised price
   is not the price paid.
7. **Show deal conditions in the same frame as the price.**
8. **Never call a named retailer "most expensive" on one store or one online quote.**
9. **Corrections:** fix the caption, pin a correction comment, and don't delete. The draft policy is
   in `compliance.md`.

**What the captured `stats/` data (week of 2026-09-21) can honestly support today: nothing
comparative.**
- **Coverage:** 6 states, 12 ZIPs, 44 stores, 15 of them with shelf prices. `stats.json` rates
  every one of the 14 items confidence **"low"**.
- **Chicago:** ALDI has shelf prices. Jewel-Osco, Mariano's and Target are online (Instacart)
  only. Walmart failed to return data.
- **Also:** Peoria has ALDI and Hy-Vee shelf prices, and Kroger and Target online. There are **no
  Milwaukee or Kenosha samples.**
- **The trap in plain view:** milk shows a Jewel-Osco median of **$6.99 (online, 1 store)** against
  an ALDI shelf median of **$2.91 across 9 stores**. "Jewel milk costs 2.4× ALDI" would break
  rules 2 and 8 at once. Don't post it.
- **Before any Cartworth-data post** (**Opinion**), require all of the following:
  - every compared price is **shelf** basis
  - at least 3 stores per chain named
  - the same normalized unit and brand tier
  - store addresses or ZIPs on the graphic
  - a second capture within 24 hours that agrees
  - no `flagImplausible` flags

  Until then, the account runs on the official data in section 4.

---

## 7. Changes this implies for `../SOCIAL_MEDIA_BRIEF.md` (for the owner to decide)

- **Channel count.** The brief puts TikTok and Reels first and runs eight channels plus email, at
  5 to 7 TikToks a week. For a solo founder: Instagram and TikTok, Shorts and Meta cross-posts for
  free, and participation on Reddit and in Facebook groups. That comes to about 6 to 9 hours a week.
- **"Cheapest State for [staple]" (Monday series).** Suspend it until coverage supports it (see
  section 6). Replace it with a monthly "Chicago-area grocery prices (BLS)" post on CPI day.
- **"Weekly nationwide staple price data, delivered every Friday"** (the handoff table). Not
  honest to publish at the current confidence level.
- **Store names.** The brief defaults to "Store A / Store B". Local comparisons lose their value
  without names. `compliance.md` sets the rule for naming retailers in plain text: factual, with
  the basis, no logos.

---

## 8. Unknowns and blocked sources (recorded, not worked around)

| Item | What happened | What to do |
|---|---|---|
| Subreddit rules: r/chicago, r/chicagosuburbs, r/milwaukee, r/Kenosha, r/aldi | The fetch tool declined old.reddit.com. Search results didn't show the rule text. | Read each sidebar and the pinned posts yourself before your first comment. |
| Reddit help centre, "What constitutes spam?" | HTTP 403 | The quoted definition is secondhand. Read it yourself. |
| Facebook group rules | Login wall, not attempted | Read the pinned rules and ask the admins. |
| Nextdoor Business Page eligibility for an app-only business | Not addressed in Nextdoor's Aug 2026 post | Assume not eligible for the newsfeed unless Nextdoor says otherwise. |
| USDA AMS turkey market news page, and My Market News report 2867 | ams.usda.gov returned 403; mymarketnews timed out | Used an ESMIS copy of a 2025 AMS 2867 report. Confirm the 2026 Friday dates on ESMIS. |
| Axios (turkey price war), Quartz (meal-deal roundup), WTTW (Chicago budget) | HTTP 403 | Used other outlets and search snippets. Their claims are marked secondhand. |
| Google Trends 2026 curves for "turkey price" and "Thanksgiving dinner cost" | Not queried (interactive app) | Check trends.google.com yourself if you want the curve. The timing above rests on AFBF, AMS and news dates plus Google's published observations. |
| Current Chicago grocery tax status after the July 1, 2026 wave | Not confirmed at IDOR | Check the IDOR list or the MyTax Illinois rate finder before posting. |
| CPI eggs item index series ID | Not confirmed on FRED | Confirm in BLS Data Finder. |
| TikTok Business Account music limits and "Your brand" toggle | Details come from third-party guides, and TikTok's help pages weren't read in full | Confirm in the app when setting up the account. |

---

## 9. Sources

**Platforms**
- Pew Research Center, Americans' Social Media Use 2025 (Nov 20, 2025): https://www.pewresearch.org/internet/2025/11/20/americans-social-media-use-2025/
- Socialinsider, Social Media Reach Statistics 2026 (Sep 3, 2026): https://www.socialinsider.io/blog/social-media-reach/
- Instagram, Trial reels (Dec 10, 2024): https://creators.instagram.com/blog/instagram-trial-reels
- YouTube, "Tall updates coming to Shorts": https://blog.youtube/news-and-events/tall-updates-coming-to-shorts/
- NPR, TikTok finalizes deal (Jan 22, 2026): https://www.npr.org/2026/01/22/nx-s1-5685456/tiktok-finalizes-deal-to-form-new-american-entity
- TikTok USDS Joint Venture announcement: https://newsroom.tiktok.com/announcement-from-the-new-tiktok-usds-joint-venture-llc
- TikTok Commercial Music Library user terms: https://www.tiktok.com/legal/page/global/commercial-music-library-user-terms/en
- TikTok, Commercial content disclosure for creators: https://ads.tiktok.com/help/article/about-the-content-disclosure-setting-for-creators
- Soundstripe on business-account music (secondhand): https://www.soundstripe.com/blogs/why-can-i-only-use-commercial-sounds-on-tiktok
- Meta, Threads 500 million monthly users (June 2026): https://about.fb.com/news/2026/06/meta-launching-new-features-500-million-monthly-threads-users/
- TechCrunch, Bluesky active users shrinking (Aug 11, 2026): https://techcrunch.com/2026/08/11/blueskys-active-user-base-is-shrinking-as-its-focus-expands-beyond-the-app/
- TechCrunch, Facebook link-posting limit test (Dec 17, 2025): https://techcrunch.com/2025/12/17/facebook-is-testing-a-link-posting-limit-for-professional-accounts-and-pages
- Social Media Today, X link handling test: https://www.socialmediatoday.com/news/x-formerly-twitter-testing-links-in-app-link-post-penalties/803176/
- Nieman Lab, X links (Oct 2025): https://www.niemanlab.org/2025/10/x-makes-overtures-to-journalists-with-new-feature-designed-to-improve-reach-for-links/
- Influencer Marketing Hub, Mosseri on Threads links (secondhand): https://influencermarketinghub.com/adam-mosseri-links-on-threads-are-performing-better/
- Nextdoor, self-promotion policy change (Aug 19, 2026): https://blog.nextdoor.com/self-promotion-update
- Pinterest Business, "The Holidays Are Earlier Than Ever": https://business.pinterest.com/insights/change-your-plans-your-audience-already-did/
- FTC, Endorsement Guides: What People Are Asking: https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking

**Precedent and criticism**
- Consumer Reports, Instacart ends AI pricing tests (Dec 2025): https://www.consumerreports.org/media-room/press-releases/2025/12/instacart-ends-ai-driven-pricing-practice-following-a-joint-consumer-reports-investigation-with-groundwork-collaborative-and-more-perfect-union/
- CNBC, Instacart (Dec 22, 2025): https://www.cnbc.com/2025/12/22/instacart-ai-pricing-tests-increased-costs.html
- 11Alive, egg price example: https://www.11alive.com/article/money/consumer/consumer-reports/same-groceries-different-prices-consumer-reports-examines-instacart-pricing-tests/85-7d9f4816-7182-46af-b7c1-cefc19099b7f
- Consumer Reports, Most and least expensive supermarkets: https://www.consumerreports.org/money/prices-price-comparison/most-and-least-expensive-supermarkets-a3157951568/
- Peoria Journal Star via Yahoo, Chicago metro results (Apr 10, 2026): https://finance.yahoo.com/economy/articles/want-cheaper-groceries-see-prices-185735097.html
- Chicago Sun-Times Watchdogs basket (Nov 7, 2025): https://chicago.suntimes.com/the-watchdogs/2025/11/07/grocery-prices-holidays-thanksgiving-christmas-trump-inflation-chicagoans
- GroceryChop Chicago rankings: https://grocerychop.com/blog/best-grocery-stores-chicago
- Checkbook Chicago supermarkets: https://www.checkbook.org/chicago-area/supermarkets/articles/Which-Grocery-Stores-Offer-the-Best-Prices-and-Quality-2055
- CNN fact check, Walmart basket (Nov 6, 2025): https://www.cnn.com/2025/11/06/politics/walmart-thanksgiving-trump-fact-check
- PolitiFact, Walmart basket: https://politifact.com/factchecks/2025/nov/14/donald-trump/walmart-thanksgiving-grocery-prices-inflation/
- Poynter, Walmart basket: https://www.poynter.org/fact-checking/2025/trump-walmart-thanksgiving-price-claim-fact-check/
- PolitiFact, turkey "lowest since 2000" rated False (Nov 26, 2025): https://www.politifact.com/factchecks/2025/nov/26/richard-hudson/no-turkey-prices-arent-at-their-lowest-in-25-years/
- FactCheck.org, egg prices Q&A (Mar 2025): https://www.factcheck.org/2025/03/qa-on-egg-prices/
- USDA ERS chart, retail vs wholesale eggs: http://www.ers.usda.gov/data-products/charts-of-note/chart-detail?chartId=112677
- PBS NewsHour, discounted turkeys (Nov 24, 2025): https://www.pbs.org/newshour/nation/stores-offer-discounted-turkeys-to-get-customers-in-the-door-but-other-thanksgiving-foods-may-cost-more
- Grocery Dive, 2025 Thanksgiving meal deals: https://www.grocerydive.com/news/thanksgiving-meals-grocery-walmart-target-lidl-aldi-2025/805440/
- Tasting Table, Aldi vs Walmart: https://www.tastingtable.com/2082484/aldi-cheaper-walmart-explained/
- Modern Retail, shrinkflation on social (Aug 2022): https://www.modernretail.co/marketing/its-dishonest-how-shrinkflation-took-over-shoppers-minds-and-social-media-accounts/
- Consumer World, Edgar Dworsky: https://www.consumerworld.org/pages/edgar.htm
- The Kobeissi Letter on X, ground beef post: https://x.com/KobeissiLetter/status/2012953132582461859
- TikTok examples: https://www.tiktok.com/@ohemmygeee/video/7464339459736079646 , https://www.tiktok.com/@wildboymamax2/video/7363684294339956014 , https://www.tiktok.com/@bobbyparrish/video/7506520741660085534

**Local**
- BLS Chicago-Naperville-Elgin CPI (August 2026 release, area definition): https://www.bls.gov/regions/midwest/news-release/consumerpriceindex_chicago.htm
- FRED, Chicago food at home CPI: https://fred.stlouisfed.org/series/CUURA207SAF11
- BLS notice, Milwaukee CPI discontinued after 2017: https://www.bls.gov/regions/midwest/notices/2017/cpi-2018-revision.htm
- IDOR bulletins FY 2026-03 and FY 2026-11: https://tax.illinois.gov/research/publications/bulletins/fy-2026-03.html , https://tax.illinois.gov/research/publications/bulletins/fy-2026-11.html
- Illinois Policy, Chicago misses grocery tax deadline: https://www.illinoispolicy.org/chicago-misses-grocery-tax-deadline-saving-shoppers-40m/
- WBEZ, r/chicagofood rules (Dec 17, 2025): https://www.wbez.org/food-drink/2025/12/17/reddit-chicago-food-subreddit-restaurants

**Official data and terms**
- BLS, Average Price Data factsheet: https://www.bls.gov/cpi/factsheets/average-prices.htm
- BLS, copyright information: https://www.bls.gov/opub/copyright-information.htm
- CPI release schedule: https://www.usinflationcalculator.com/inflation/consumer-price-index-release-schedule/
- FRED series pages: APU0000708111, APU0000709112, APU0000703112, APU0000702111, APU0000FF1101, APU0000FS1101, APU0000717311, APU0000706311, APU0200708111, APU0200709112 (https://fred.stlouisfed.org/series/<ID>)
- USDA ERS Food Price Outlook: https://ers.usda.gov/data-products/food-price-outlook and https://ers.usda.gov/data-products/food-price-outlook/summary-findings
- USDA website policies (public domain): https://www.usda.gov/about-usda/policies-and-links
- USDA AMS, Weekly Retail Turkey Feature Activity (ESMIS): https://esmis.nal.usda.gov/publication/turkey-usda-weekly-retail-turkey-feature-activity-report-fri
- USDA AMS, sample report 2867 PDF: https://esmis.nal.usda.gov/sites/default/release-files/wp98bb45f/s4657c35z/rj432272p/AMS_2867.PDF
- USDA AMS, Grocery Store Feature Reports: https://www.ams.usda.gov/market-news/retail
- AFBF 2025 release (Nov 19, 2025): https://www.fb.org/news-release/cost-of-thanksgiving-dinner-declines
- AFBF 2024 release (Nov 20, 2024): https://www.fb.org/news-release/cost-of-thanksgiving-dinner-declines-remains-higher-than-pre-pandemic-levels
- AFBF legal and terms: https://www.fb.org/about/legal
- KFGO, 2023 survey (Nov 15, 2023): https://kfgo.com/2023/11/15/afbf-survey-cost-of-thanksgiving-dinner-down-slightly-from-record-high-in-2022/
- Google, Thanksgiving Trends and Maps: https://blog.google/products/maps/thanksgiving-turkey-and-traffic-tips-google-trends-and-maps/
