#!/bin/bash
# Archive the iPhone app in Release with the RELEASE Xcode and upload it to App Store Connect
# (TestFlight). One command per build: bump CURRENT_PROJECT_VERSION in ios/project.yml and the
# project first (test/qa-appstore.test.js checks they agree); every upload needs a new number.
#
# Builds 1 and 2 came from a beta Xcode (its iOS 27.1 SDK): TestFlight would not install them on
# iOS 27.0, and the App Store rejects beta-built apps. Nothing in a build's SDK name says "beta"
# (the beta's was plain iphoneos27.1), so the script defaults to the release Xcode found on the
# build Mac (APP_STORE_CHECKLIST.md item 12) and prints the Xcode and SDK before uploading.
#
#   scripts/ios-upload.sh                      # uses /Applications/Xcode 1.app, the release Xcode
#   XCODE="/Applications/Xcode.app" scripts/ios-upload.sh
set -euo pipefail
cd "$(dirname "$0")/../ios"
XCODE="${XCODE:-/Applications/Xcode 1.app}"
export DEVELOPER_DIR="$XCODE/Contents/Developer"
[ -d "$DEVELOPER_DIR" ] || { echo "no Xcode at $XCODE (set XCODE=...)"; exit 1; }
# Read the whole answer first: `xcodebuild -version | head -1` lets head exit early, xcodebuild
# dies of SIGPIPE, and pipefail ends the script silently with 141 before anything is printed.
xv=$(xcodebuild -version); version=${xv%%$'\n'*}; build=${xv##*$'\n'}
echo "Using $version ($build) from $XCODE"
[[ "$XCODE" == *[Bb]eta* ]] && { echo "$XCODE is a beta Xcode: use the release one"; exit 1; }

number=$(grep -m1 'CURRENT_PROJECT_VERSION:' project.yml | grep -oE '[0-9]+')
marketing=$(grep -m1 'MARKETING_VERSION:' project.yml | grep -oE '[0-9]+(\.[0-9]+)+')
echo "Archiving $marketing ($number)"
rm -rf build/Cartworth.xcarchive build/export
xcodebuild -project Cartworth.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/Cartworth.xcarchive \
  -allowProvisioningUpdates clean archive | tail -3

sdk=$(/usr/libexec/PlistBuddy -c 'Print :DTSDKName' build/Cartworth.xcarchive/Products/Applications/*.app/Info.plist)
echo "Built against $sdk"
[[ "$sdk" == iphoneos* ]] || { echo "unexpected SDK $sdk: not uploading"; exit 1; }
echo "(Builds must use an SDK no newer than the iOS your testers run: build 3 used iphoneos27.0.)"

opts="$(mktemp -d)/ExportOptions.plist"
trap 'rm -rf "$(dirname "$opts")"' EXIT
cat > "$opts" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>4C8TU6U7MQ</string>
</dict></plist>
PLIST
xcodebuild -exportArchive -archivePath build/Cartworth.xcarchive -exportOptionsPlist "$opts" \
  -exportPath build/export -allowProvisioningUpdates | tail -3
echo "Uploaded $marketing ($number). It appears in App Store Connect > TestFlight after processing (10-30 min)."
