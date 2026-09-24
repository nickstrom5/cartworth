# Cartworth on the iPhone Duo

Written 2026-09-23 against Xcode 27.1 (build 27A9269), runtime iOS 27.1, from the `App` scheme
driving the real app with `-qaZip 60618 -proUnlocked` against live store data.

## The short answer

**The folded (cover) state is genuinely supported. The unfolded state is still entirely
unverified, and nothing in this round changed that — not because it was skipped, but because
this machine cannot put an app on the inner panel at all.**

The previous round reported the same conclusion about unfolding. That conclusion was correct, but
it was reached without trying `simctl io … screenConfig`, and the test file it left behind
(`ios/UITests/DuoTests.swift`) had **never executed even once** — the file existed on disk but was
not in the Xcode project, so `xcodebuild` silently ran zero tests. Both points are fixed here: the
fold mechanism was probed properly, and the project has been regenerated so the tests actually run.

One real, shipping-blocking defect was found and fixed in the folded state. See
[What was broken](#what-was-broken).

---

## The two simulators are the same device

`xcrun simctl list devices available | grep -i duo` lists what look like a folded/unfolded pair:

```
Duo Open   (30B30A59-99B0-4557-A3FE-65A240388AB2)
iPhone Duo (24CC9005-95E8-4963-8609-756941B40517)
```

They are not a pair. Both carry
`deviceTypeIdentifier = com.apple.CoreSimulator.SimDeviceType.iPhone-Duo`, and their `device.plist`
files are identical apart from `name`. `Duo Open` is a rename of the same device type.

Booted and measured, `Duo Open`'s screen 1 is **1398×2034px — the cover geometry**, exactly the same
as `iPhone Duo`. It does not boot unfolded. Any result attributed to "the unfolded device" because
it came from the simulator named `Duo Open` is a result from the cover panel.

This is confirmed from inside the running app, not just by screenshot dimensions. `DuoTests` prints
the window it was handed, and on `Duo Open` it prints:

```
DUO GEOMETRY tab bar: 466x678pt, type size default
```

466 × 678pt is the cover panel. `XCUIApplication` itself says so.

## The inner panel exists but never receives a scene

The device profile
(`/Library/Developer/CoreSimulator/Profiles/DeviceTypes/iPhone Duo.simdevicetype`, model
`iPhone19,4`) genuinely declares two integrated displays:

| screenID | name | pixels | points @3x | role |
|---|---|---|---|---|
| 1 | `LCD` | 1398 × 2034 | **466 × 678** | cover panel |
| 3 | `LCD-1` | 2007 × 2853 | **669 × 951** | inner panel |

`ScreenDimensionsCapability` names 1398×2034 as the main screen, so the cover is what the app gets.
There are also two framebuffer mask PDFs in the profile (466×678 and 1252×1780), which is what first
suggested a second usable geometry.

`xcrun simctl io <udid> enumerate` on a booted Duo shows both integrated displays powered on, each
with an allocated `IOSurface`. But screen 3 captures **pure black, byte-for-byte identical**
(md5 `56e2786878619e2d2c71a71b567d95d5`) on both devices, in every state we could produce.
SpringBoard never attaches a scene to it.

Everything tried, and what it did:

| Attempt | Result |
|---|---|
| `screenshot --display 3` on either device | pure black, identical md5 |
| `screenConfig --display 1 power off` (fold the cover away) | reports success, but the scene does **not** migrate — both framebuffers lose their `IOSurface` and `screenshot --display 1` then fails with "Timeout waiting for screen surfaces". It blanks the device; it does not unfold it. |
| `screenConfig --display 1 geometry 2007x2853@3` | rejected: "No mode found with scale factor 3.0 that supports size 2007x2853" — the cover has no inner-panel mode |
| `screenConfig --display 3 geometry 2007x2853@3` | accepted, still renders black |
| `strings` over Simulator.app and CoreSimulator.framework for `fold`/`unfold` | no matches (only `folderName` substrings) |
| a Resizable device type to reproduce 669×951pt | none exists — 131 device types, zero matching "resizable" |

There is no fold verb in `simctl`, no fold control in Simulator.app, and no fold symbol in
CoreSimulator. **Unfolded cannot be exercised on this setup.** Anything claiming otherwise is
describing the cover panel.

### A trap worth knowing

`xcrun simctl io <udid> screenshot <file>` with **no `--display`** captures screen 3 — the black
one. The command as usually written produces a perfectly valid, perfectly black PNG. Every manual
capture needs `--display 1`; the UI tests go through `XCUIScreen.main` and are unaffected.

---

## Folded / cover panel — 466 × 678pt

All five tabs reach, render and are usable. The tab bar is not a bottom bar here: it is a vertical
floating strip pinned to the trailing edge, which leaves roughly 400pt of usable width.

Measured behaviour:

- **Size class is compact.** The Deals grid draws 2 columns from its `adaptive(minimum: 150)`
  branch, not the `220` one, so `isWide` is false. `readableWidth()` is therefore a no-op on this
  panel, and SearchView's two-column split does not engage. The cover panel takes the phone paths,
  which are the well-tested ones.
- **Search** — single column: best-price card, weekly-ad carousel, then the per-store bar chart.
  Correct at the default type size.
- **Deals** — 2-column card grid. Renders correctly.
- **List**, **Tracking**, **Settings** — all render; Tracking is empty until a watch is added.
- Nothing important sits under a system inset, and no content is lost across the trailing tab bar.

### What was broken

At `UICTContentSizeCategoryAccessibilityXXXL` on this panel the per-store chart failed badly, and
the worst part of the failure was the numbers.

`BestPerStoreChart` laid each row out as a flat 92pt store-name column, then a bar, then the price,
all on one line, with a flat 96pt reserved for the price. Neither constant scaled with the type
size. At AX XXXL on a 466pt panel the result was:

- every store name cut to an initial — `To…`, `M…`, `Je…`, `Fo…`, `C…`, `W…`, `Tr…`. The colour dot
  does not identify a store; the name does. The shopper could not tell whose price they were
  looking at.
- **prices themselves clipped** — `$9.…` and `$1.…`.

The second one is the serious one. The row showing `$1.…` was **Trader Joe's at $11.38**. Clipped,
it reads as roughly one dollar: an order-of-magnitude error on the exact number this app exists to
report, presented with full confidence. That is a wrong price, which is worse than no price.

**Fixed** in `ios/App/UI/Components/Components.swift`:

- the name column, price slot and row height are now `@ScaledMetric`, so they grow with the type
  size instead of staying at 92/96/18pt;
- the price label is `fixedSize(horizontal:)` with a raised layout priority — if a row runs out of
  room the **bar** shortens, never the number;
- at accessibility type sizes the row stops sharing a line at all: store name, then price and
  badges, then the bar on its own full-width line. Every bar still measures against the same track
  (the full row width), so the comparison the chart exists to make is preserved.

Verified on the panel after the change: `ALDI $2.41 (Best)`, `Cermak $5.69`, `Food City $5.09`,
`Whole Foods $9.49`, `Trader Joe's $11.38` — all names and all numbers complete.

Also fixed, same class of problem:

| File | Was | Now |
|---|---|---|
| `Components.swift` — `StoreTag` | `lineLimit(1)`, no shrink → `Maria…` | wraps to 2 lines at accessibility sizes, `minimumScaleFactor(0.8)` |
| `Tracking/TrackingView.swift` | unit price could be squeezed by the store name beside it | price is `fixedSize` with layout priority |
| `Deals/DealsView.swift` | deal price `lineLimit(1)` (a multi-buy like "2 for $5.00" could lose its tail) | `lineLimit(2)` + `minimumScaleFactor(0.7)` on both the grid card and the mini card |
| `Settings/SettingsView.swift` | ZIP field capped at a flat 110pt → `60618` rendered as `60…` | width is `@ScaledMetric`; at accessibility sizes the ZIP field, Update and use-my-location stack instead of sharing a line |

---

## Unfolded / inner panel — 669 × 951pt

**Not verified. Not verifiable here.** No screenshot in this repo shows Cartworth on the inner
panel, and none can be produced on this machine.

What can be said without running it:

- The panel would be **669 × 951pt** (2007 × 2853px at 3x).
- All five `readableWidth()` call sites are **safe by arithmetic** whatever the size class turns out
  to be: the caps are 700, 760, 780 and 1000pt, all wider than 669pt, so the modifier is a no-op at
  this width and cannot mis-lay-out a 669pt scene.
- **The one real risk is `SearchView.resultsContent`.** If the inner panel reports a *regular*
  horizontal size class — plausible, and the reason this was flagged in the first place — the
  two-column branch engages and hands the aside a **hard-coded `frame(width: 340)`**. On 669pt,
  minus padding and the 20pt gutter, that leaves roughly **277pt** for the product rows, each of
  which carries a 54pt thumbnail plus name, store tag and badges. That layout was written and
  checked for a 13" iPad at 1024pt+, not for 277pt.
- The Deals grid would be fine either way (`adaptive(minimum: 220)` gives 2 columns of ~310pt at
  669pt).

I deliberately did **not** pre-emptively rewrite the SearchView split to guard against this. The
condition is unobservable here, the iPad layout it would touch is verified-working and owned
elsewhere, and a speculative change to a working layout that cannot be tested is how regressions get
shipped. The recommendation instead:

> Gate the two-column branch on a measured container width (≈820pt or more), not on the size class
> alone, so a narrow-but-regular scene falls back to the phone stack, which is known good. Then
> verify on real hardware or a runtime that can actually unfold.

Until someone runs it on a device that unfolds, the honest status of the unfolded state is
**unknown**, not "works".

---

## Continuity across the fold

Also **not directly verifiable** — there is no fold to cross.

`DuoTests` exercises the nearest real equivalent the simulator can perform: a live rotation, which
changes the scene's geometry underneath a running app without restarting the process. That covers
the two failure modes a fold would share — `@State` being recreated and the scene `.task` in
`CartworthApp.swift` re-running — and the tests assert that typed-but-unsubmitted search text, the
selected tab, scroll position and an open sheet all survive it.

It is a proxy and is labelled as one in the test file. It would not catch anything specific to a
display handoff, which is exactly the part that cannot be reached here.

---

## Tests

`ios/UITests/DuoTests.swift` runs against *whatever* geometry it is handed and prints the size it
measured, so the same binary is meaningful on either simulator and stays meaningful if a future
Xcode ever unfolds one. Nothing in it asserts "this is the folded state".

The two that matter:

- `testNoPriceIsEverTruncated` — walks the whole results screen and fails if any label beginning
  with `$` contains an ellipsis. This is the direct regression guard for the bug above.
- `testStoreNamesAreNotClippedToInitials` — fails if a short label (≤16 chars, i.e. a store name
  rather than a product name) is clipped.

Verified runs after the fix:

| Test | Device | Type size | Result |
|---|---|---|---|
| `testNoPriceIsEverTruncated` | iPhone Duo | AX XXXL | **pass** — `checked 96 price labels at 466x678-ax`, none clipped |
| `testStoreNamesAreNotClippedToInitials` | iPhone Duo | AX XXXL | **pass** — `flagged 0 clipped labels` |
| `testTabBarFitsThePanel` | Duo Open | default | **pass** — measured 466x678pt |

Both truncation tests scan several screenfuls but capture only one frame each, and a second only on
failure. That is deliberate: the screenshot service is the slowest and flakiest part of a UI test,
and an earlier version that captured every pass took 819s and died on
"Timed out while requesting screenshot" while other work shared the machine.

The simulator refused to launch the test runner once during this round
("Simulator device failed to launch … the system shell probably crashed"). `xcrun simctl shutdown
all`, boot, wait, retry cleared it on the first attempt.

Run them:

```sh
xcodebuild test -scheme App -only-testing:AppUITests/DuoTests \
  -destination 'platform=iOS Simulator,name=iPhone Duo'

TEST_RUNNER_QA_CONTENT_SIZE=ax xcodebuild test -scheme App -only-testing:AppUITests/DuoTests \
  -destination 'platform=iOS Simulator,name=iPhone Duo'
```

`TEST_RUNNER_QA_CONTENT_SIZE=ax` is what puts the runner at AccessibilityXXXL; a bare
`QA_CONTENT_SIZE=ax` in the shell does **not** reach the test runner.

Note: `ios/Cartworth.xcodeproj` is generated by XcodeGen from `ios/project.yml`. A new file under
`ios/UITests/` does not exist as far as `xcodebuild` is concerned until `xcodegen generate` is run —
which is why the previous round's tests silently executed zero times. Re-run it after adding files.

---

## Still imperfect on the cover panel

Things seen and judged not worth changing, or not fixed here:

- The store-filter chip row on **Deals** clips its last chip (`Cost…`) at the panel edge. It is a
  horizontal scroller, so the content is reachable; cosmetic.
- The weekly-ads carousel on **Search** likewise shows a partial card at the trailing edge. Same
  reasoning.
- The **Tracking** watch field's placeholder truncates (`"large e…"`) at accessibility sizes. It is
  a `TextField` placeholder, not data.
- At AX XXXL, **Settings** hyphenates "Location" across two lines. Ugly, not wrong.
- The Duo simulators log `Data Migration Failed` on every boot. It appears harmless — the app
  installs and runs — but it is noise worth knowing about when a boot looks slow.

## Baselines

- `xcodebuild test -only-testing:AppTests` — **149 tests, 0 failures.** The brief quoted 146; the
  count is higher, not lower, and none of the three extra tests are mine (no unit tests were added
  in this round). Most likely another agent's additions landed in the same tree. Nothing regressed.
- `ios/Cartworth.xcodeproj` was regenerated with `xcodegen generate` so the UI tests exist. The
  previous `project.pbxproj` is backed up in this session's scratchpad.
