# External TestFlight: what to enter in App Store Connect

External testers (anyone with the public link, up to 10,000) need one Beta App Review pass per
version; later builds of the same version usually go straight out. Fill these in under
**TestFlight > Test Information**, then add the build to an external group. Every field below is
ready to paste. Limits are App Store Connect's: 4,000 characters for the long fields.

## Beta App Description

```
Cartworth compares grocery prices at the stores near you. Search for an item once and see what it costs at every nearby grocer, converted to the same unit so a 64 oz jug and a gallon compare fairly. Every price says where it came from: the store's shelf price, its online price, a chain-wide price, or this week's ad.

Build a shopping list and Cartworth plans the cheapest trip across one, two or three stores. Watch an item and it tells you when the price drops. Holiday lists (Thanksgiving is ready now) price a whole meal in one go.
```

## What to Test

```
Thanks for testing Cartworth. Please try:

1. Setup: allow location, or type your ZIP. Check that the stores it finds are ones you actually shop at.
2. Search a few things you buy every week (milk, eggs, bananas, chicken). Is the cheapest price right, and is it the product you meant? Tell us about any wrong match, with the store and item.
3. Holiday lists: open Thanksgiving and price the whole list.
4. Make a list and plan a trip.
5. Pro: in TestFlight, purchases are free test purchases. You will not be charged. Try monthly, yearly or lifetime, then Restore Purchases.

Some stores priced through Instacart can be slow or briefly unavailable. The app shows them as unavailable rather than guessing a price.

Send feedback with a screenshot from TestFlight (take a screenshot in the app and tap Share Beta Feedback), or email support@cartworth.app.
```

## Other fields

| Field | Value |
|---|---|
| Feedback email | `support@cartworth.app` (Cloudflare forwards it; send it a test first) |
| Marketing URL | `https://cartworth.app` |
| Privacy Policy URL | `https://cartworth.app/privacy` |
| Beta App Review: contact | your name, phone and email |
| Beta App Review: sign-in required | **No** (the app has no accounts) |
| Beta App Review: notes | paste section 10 of `APP_STORE_LISTING.md` (the App Review notes) |

## Build 4

Build 4 (1.0.0) carries everything since build 3: the Thanksgiving fixes (pumpkin puree,
scallions, celery root) and the other matcher changes. Archive it with the **release** Xcode, as
for build 3 (`APP_STORE_CHECKLIST.md` item 12: `/Applications/Xcode 1.app`, SDK `iphoneos27.0`).

## Then

1. TestFlight > External Testing > **+** to create a group (e.g. `Public beta`).
2. Add build 4 to it and submit it for review. Beta App Review usually takes a day or less.
3. Once it's approved, turn on **Public Link** in the group and share the link. Anyone with an iPhone opens it, installs TestFlight, and installs Cartworth.
