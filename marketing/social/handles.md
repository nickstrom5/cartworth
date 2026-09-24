# Cartworth social handles: availability check

Checked 2026-09-23, 19:20 to 19:23 UTC. I made 54 plain, unauthenticated GET requests of public
profile URLs and public APIs. Every request used curl's default user agent (`curl/8.7.1`), with no
cookies and no login. I did not follow redirects. Requests went one at a time, at least 1 second
apart. No host returned HTTP 429.

When a platform showed a login wall or blocked the request, I recorded the handle as **unknown**
and did not try another route. Raw per-request records are in `handles-evidence.json` next to this
file.

**Legend.** **available**: the platform says no account has this name. **likely available**: no
profile came back, but the response is an app page or error code, not a plain 404. **taken**: a
real profile came back. **unknown**: blocked or login-walled, so check by hand. **n/a**: the
platform doesn't allow this handle format.

"Available" only means no public profile existed at check time. Platforms also hold back names
from recently deactivated or suspended accounts, and those look the same from outside. The signup
form is the final word.

## Summary

| Platform | cartworth | cartworthapp | cartworth_app | getcartworth | trycartworth |
|---|---|---|---|---|---|
| Bluesky (`.bsky.social`) | available | available | n/a (no `_`) | available | available |
| Reddit `u/` | unknown | unknown | unknown | unknown | unknown |
| Reddit `r/` | unknown | unknown | unknown | unknown | unknown |
| YouTube `@` | **taken** (new, near empty) | available | available | available | available |
| TikTok | **taken** (dormant) | likely available | likely available | likely available | likely available |
| Instagram | **taken** (empty) | likely available | likely available | likely available | likely available |
| Threads | unknown (see note) | unknown | unknown | unknown | unknown |
| X | **taken** (dormant since 2012) | available | available | available | available |
| Facebook | unknown | unknown | n/a (no `_`) | unknown | unknown |
| Pinterest | **taken** (dormant) | available | available | available | available |
| LinkedIn (company) | unknown | unknown | unknown | unknown | unknown |

**Bottom line.** Bare `cartworth` is taken on five of the platforms I could read: YouTube, TikTok,
Instagram, X and Pinterest. None of those accounts is a grocery or pricing business. Four have zero
or near-zero activity. `getcartworth` and `cartworthapp` came back clean everywhere a clear answer
was possible. Both contain only letters, so they're valid on every platform, including Bluesky and
Facebook.

**Recommendation.** Use **`getcartworth`** everywhere. It matches `getcartworth.com`, which
`../TRADEMARK_RESEARCH.md` found unregistered (no RDAP record). `cartworthapp` is the backup. Drop
`cartworth_app`: Bluesky and Facebook reject the underscore, and underscores are hard to say out
loud in a video.

## The taken `cartworth` accounts, and whether they look active

| Platform | Who holds it | Activity (evidence) | Dormant? |
|---|---|---|---|
| X `@cartworth` | "Cartworth moor cc", a cricket club | HTTP 200. Page title "Cartworth moor cc (@cartworth) / X". Joined February 2012. 3 posts, 7 followers, 0 following. Latest visible post Feb 17, 2012. | **Yes**, about 14.5 years without a visible post. |
| TikTok `@cartworth` | Default auto-generated name `user9564818046694` | HTTP 200. Embedded page data: `statusCode 0`, account created 2021-01-13, 0 followers, 3 following, 0 videos, 0 likes. | **Yes**, never posted. |
| Instagram `@cartworth` | No display name | HTTP 200. og:description: "0 Followers, 0 Following, 0 Posts". Creation date not shown. | **Yes**, empty account. |
| Pinterest `/cartworth` | "lucy cartworth", a personal account | HTTP 200. Page title "lucy cartworth (cartworth) - Profile". `created_at` Wed, 11 Feb 2015. 0 followers, 0 pins, 0 boards, `last_pin_save_time: null`. | **Yes**, never used. |
| YouTube `@cartworth` | "CartWorth" (vanity URL `@Cartworth`), channel ID `UCxT0_rcUStRPiV54ez88PRA` | HTTP 200. Page title "CartWorth - YouTube". The description says it reviews products "worth buying". 1 subscriber, 1 video. The public channel feed shows the channel published 2026-06-12 and the one video 2026-07-14, with 2 views. | **No, but new and nearly empty.** Created three months ago, last upload about 10 weeks ago. |

A dormant account still holds its handle. None of these platforms offers a dependable way for a
business to take over a name from an inactive personal account. Trademark complaint routes usually
expect a registered mark, and Cartworth doesn't have one yet. Don't plan launch around getting
any of these names back.

**Brand note for the trademark attorney, not a handle problem.** The YouTube "CartWorth" channel is
a product-recommendation channel started in June 2026 under the same name, in a nearby consumer
shopping space. It's small (1 video, 2 views), but it's a same-name user in a related field, so it
belongs in the same conversation as the items in `../TRADEMARK_RESEARCH.md`.

## Evidence by platform

**Bluesky.** Public API
`public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=<h>.bsky.social`.
- `cartworth`, `cartworthapp`, `getcartworth`, `trycartworth`: all returned HTTP 400
  `{"error":"InvalidRequest","message":"Unable to resolve handle"}`, meaning no account has that
  handle. **Available.**
- `cartworth_app`: not requested. `.bsky.social` handles allow only letters, digits and hyphens.
- Option: Bluesky can use a domain you control as the handle, for example `@cartworth.app` or
  `@getcartworth.com`. Per `../TRADEMARK_RESEARCH.md`, `cartworth.app` was registered on
  2026-09-22, and it's not confirmed whether Nick registered it. If he did, `@cartworth.app` is the
  strongest Bluesky handle.

**Reddit.** `/user/<h>/about.json` and `/r/<h>/about.json` on `www.reddit.com`. All 10 requests
returned HTTP 403 with the page "You've been blocked by network security." **Unknown for every
handle.** I did not try other Reddit endpoints. This matches the earlier 403 in
`../TRADEMARK_RESEARCH.md`.

**YouTube.** `www.youtube.com/@<h>`.
- `cartworth`: HTTP 200, taken. Details are in the table above.
- The other four handles: HTTP 404 "404 Not Found". **Available.**

**TikTok.** `www.tiktok.com/@<h>`. Every handle returned HTTP 200 with the TikTok app page, so I
read the page's embedded `webapp.user-detail` data.
- `cartworth`: `statusCode 0` with a full user record. Taken.
- The other four: `statusCode 10221` with no user record. **Likely available.** TikTok doesn't
  publicly document what that code means, so confirm at signup.

**Instagram.** `www.instagram.com/<h>/`. Every handle returned HTTP 200.
- `cartworth`: the full profile page came back, with og tags and a profile ID. Taken.
- The other four: title "Instagram", no profile og tags, and Instagram's error-page component
  (`PolarisErrorRoot`) in the page. **Likely available.**

**Threads.** `www.threads.com/@<h>`. Every handle returned HTTP 302 to `/login/?next=...`, a login
wall. **Unknown.** A Threads profile uses the owner's Instagram username. So Threads `@cartworth`
can only belong to whoever holds Instagram `@cartworth`, and it's effectively unavailable (an
inference, not something observed). Once Nick holds a handle on Instagram, the same Threads handle
comes with it.

**X.** `x.com/<h>`.
- `cartworth`: HTTP 200, profile served. Taken, details above.
- The other four: HTTP 404, page title "User Profile Not Found - X | 404 Error". **Available.**

**Facebook.** `www.facebook.com/<h>`. Every handle returned HTTP 200 with the same generic page:
title "Facebook", no og tags, and near-identical page size. That response can't tell an existing
page apart from a missing one. **Unknown.** `cartworth_app` was not requested, because Facebook
usernames allow only letters, numbers and periods.

**Pinterest.** `www.pinterest.com/<h>/`.
- `cartworth`: HTTP 200 with a full profile record. Taken, details above.
- The other four: HTTP 200, but the page data contains "User not found". **Available.**

**LinkedIn.** `www.linkedin.com/company/<h>/`. Every handle returned HTTP 999, LinkedIn's
bot-block response. **Unknown for every handle.**

## What Nick needs to do (about 15 minutes, logged in as himself)

1. **Pick the handle.** Recommended: `getcartworth`, with `cartworthapp` as the fallback.
2. **Check the unknowns by hand in a normal browser:**
   - **Reddit:** open `reddit.com/user/getcartworth` and `reddit.com/r/getcartworth`. The signup
     form also says whether a username is free.
   - **Facebook:** the page username is set after the Page is created. Settings will say whether
     `getcartworth` is free.
   - **LinkedIn:** the company page URL is chosen when the page is created. The form checks it.
   - **Threads:** comes automatically with the Instagram handle.
3. **Register every platform the same day,** once he decides to go ahead. A clean result today
   doesn't reserve anything, and `cartworth.app` shows a name can be taken within a day.
4. **Optional:** register `getcartworth.com` so the domain matches the handle.
5. **Give the trademark attorney the YouTube "CartWorth" channel** along with the other items in
   `../TRADEMARK_RESEARCH.md`.

I did not create, claim or reserve any account. This file is planning only.
