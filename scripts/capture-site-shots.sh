#!/bin/bash
# Captures REAL app screenshots on an iPhone and an iPad simulator with the current build, for the
# website and the App Store. Mac only (Xcode + iOS Simulator). See marketing/screenshots/RESHOOT.md.
#
#   scripts/capture-site-shots.sh                 # both devices, ZIP 60618
#   ZIP=53211 scripts/capture-site-shots.sh
#
# Drives ios/UITests/SubmissionSet.swift (search, deal detail, trip plan, watch) against live store
# data, one request at a time per store site, with a clean 9:41 status bar. Frames land in
# marketing/screenshots/<date>-<device>/. It never edits the site; make-device-shots.py does that.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="${ZIP:-60618}"
DATE="$(date +%Y-%m-%d)"
DERIVED="$ROOT/ios/build/shots"
# A simulator name or UDID. By default Apple's own Pro Max and iPad Pro 13" on the newest runtime:
# the pattern is anchored so a renamed copy ("CRQA iPhone 17 Pro Max") is never picked, and
# `shoot` takes the last match because `simctl list` orders runtimes oldest first.
IPHONE="${IPHONE:-$(xcrun simctl list devices available | grep -E '^ +iPhone [0-9]+ Pro Max \(' | tail -1 | sed -E 's/^ *([^()]+) \(.*/\1/' | sed 's/ *$//')}"
IPAD="${IPAD:-$(xcrun simctl list devices available | grep -E '^ +iPad Pro 13' | tail -1 | sed -E 's/^ *([^()]+) \(.*/\1/' | sed 's/ *$//')}"

echo "== building for testing"
xcodebuild build-for-testing -project "$ROOT/ios/Cartworth.xcodeproj" -scheme App \
  -destination "generic/platform=iOS Simulator" -derivedDataPath "$DERIVED" -quiet
XCTESTRUN="$(ls "$DERIVED"/Build/Products/*.xctestrun | head -1)"

shoot() {
  local name="$1" out="$2"
  local udid
  if [[ "$name" =~ ^[0-9A-F-]{36}$ ]]; then udid="$name"
  else udid="$(xcrun simctl list devices available | grep -E "^ +" | grep -F "    $name (" | tail -1 | grep -oE '[0-9A-F-]{36}')"; fi
  [ -n "$udid" ] || { echo "no simulator named '$name'"; return 1; }
  echo "== $name ($udid) -> $out"
  xcrun simctl boot "$udid" 2>/dev/null || true
  xcrun simctl bootstatus "$udid" -b >/dev/null
  xcrun simctl ui "$udid" appearance light
  xcrun simctl status_bar "$udid" override --time 9:41 --dataNetwork wifi --wifiBars 3 --cellularBars 4 \
    --batteryState charged --batteryLevel 100
  # Only this run's frames are copied: the runner's tmp/shots keeps every earlier run's frames too,
  # under names that no longer match the current set.
  local stamp
  stamp="$(mktemp)"
  # xcodebuild hands TEST_RUNNER_<NAME> to the UI-test runner as <NAME> (see SubmissionSet.env).
  TEST_RUNNER_QA_ZIP="$ZIP" TEST_RUNNER_MARKETING=1 xcodebuild test-without-building -xctestrun "$XCTESTRUN" \
    -destination "platform=iOS Simulator,id=$udid" \
    -only-testing:AppUITests/SubmissionSet/testSubmissionSet | tee "$out.log" | grep -E "^SHOT |SKIP|ADS_PRESENT|error:" || true
  local data
  data="$(xcrun simctl get_app_container "$udid" app.cartworth.AppUITests.xctrunner data)"
  mkdir -p "$out"
  find "$data/tmp/shots" -name '*.png' -newer "$stamp" -exec cp {} "$out"/ \;
  rm -f "$stamp"
  echo "   $(ls "$out" | wc -l | tr -d ' ') frames"
}

shoot "$IPHONE" "$ROOT/marketing/screenshots/$DATE-iphone"
shoot "$IPAD" "$ROOT/marketing/screenshots/$DATE-ipad"

echo
echo "Next: look at every frame (a wrong price must not be published), then:"
echo "  python3 site/tools/make-device-shots.py --real <iphone search frame> <iphone deal or trip frame> <ipad frame>"
echo "  python3 site/tools/version-assets.py"
