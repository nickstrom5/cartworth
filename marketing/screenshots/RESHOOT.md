# Re-shooting real iPhone and iPad screenshots (for the website and the App Store)

For a Claude Code session running **on the owner's Mac**, in this repo, on the `fix-round-3` branch
(or `main` once it is merged). The cloud sessions cannot do this: there is no iOS Simulator there.

## Decided by the owner (Sept 2026)

- The website's phone and iPad images become **real renders** of the app, replacing the drawn
  illustrations and the price-free frames used so far.
- **Real store names are shown** (ALDI, Jewel-Osco, ...), exactly as the app shows them. The site's
  footer already says Cartworth is independent and not affiliated with any retailer.
- Still hidden in marketing frames: paid placements and other companies' packaging photos
  (`-qaHideSponsored`, `-qaHideRemoteImages`, passed when `MARKETING=1`).

## Steps

1. `git pull`, then run the iOS tests first (Cmd+U in Xcode, or
   `xcodebuild test -project ios/Cartworth.xcodeproj -scheme App -destination 'platform=iOS Simulator,name=iPhone 17 Pro'`).
   This round's Swift changes (store catalog, request pacing, matching, "8oz, 9ct", the per-pound
   check, packText) have never been compiled. Fix anything that fails before capturing.
2. `scripts/capture-site-shots.sh` (optionally `ZIP=53211`). It builds, boots an iPhone Pro Max and an
   iPad Pro 13" simulator, sets a clean 9:41 status bar, runs `SubmissionSet` against live prices
   and copies the frames into `marketing/screenshots/<date>-iphone/` and `<date>-ipad/`.
3. **Read every frame.** A price on the website is a published price. Reject any frame with a
   figure you cannot confirm on the store's own listing, a "price looks wrong" badge, flyer artwork,
   or a savings claim across price types. Re-run with another `SHOT_QUERY` if needed.
4. `python3 site/tools/make-device-shots.py --real <iphone search frame> <iphone deal or trip frame> <ipad frame>`
   rebuilds `site/img/iphone-duo.png` and `site/img/devices-ipad-duo.png`. The three single-phone
   illustrations (`iphone-max-*.png`) can be replaced by real frames the same way.
5. Update the note under the phone row in `site/index.html` (it says the iPhone pictures are
   illustrations), then `python3 site/tools/version-assets.py` and `node scripts/check-seo.js site`.
6. Publish: the site deploys from `main` (Cloudflare Workers Builds, `wrangler.jsonc`), so only
   `site/` changes need to reach `main`.

Frames that include real prices also serve the App Store set: see `README.md` in this folder.
