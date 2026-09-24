#!/usr/bin/env bash
# Build the iOS app's Foundation-only core (pricing, matching, units, comparison, catalog, sources,
# cache) and run its XCTests on Linux, with no Mac. The UI, maps, StoreKit and SwiftData still need
# Xcode (see ops/appstore-testing.md); this covers the logic that decides every price.
#
#   SWIFT=/path/to/swift-6.1+/usr/bin ios/linux/run-core-tests.sh
#
# Needs Swift 6.1 or newer (the app uses trailing commas in argument lists, SE-0439).
set -euo pipefail
IOS="$(cd "$(dirname "$0")/.." && pwd)"
PKG="${PKG:-$(mktemp -d)}"
[ -n "${SWIFT:-}" ] && export PATH="$SWIFT:$PATH"
rm -rf "$PKG/Sources" "$PKG/Tests" && mkdir -p "$PKG/Sources/Cartworth" "$PKG/Sources/CryptoKit" "$PKG/Tests/CartworthTests"
for f in Core/*.swift Sources/*.swift Networking/HTTP.swift Networking/Cache.swift Services/Seasonal.swift Services/NationalStats.swift \
         UI/Components/OutboundLink.swift; do
  cp $IOS/App/$f "$PKG/Sources/Cartworth/"  # unquoted: $f may be a glob
done
# Types that live in files importing Apple-only frameworks, lifted out of the real files unchanged.
awk '/^final class UsageMeter/{f=1} f{print} f&&/^}/{exit}' "$IOS/App/Services/Entitlements.swift" | sed '1i import Foundation' > "$PKG/Sources/Cartworth/UsageMeter.swift"
awk '/^actor StoreDirectory/{exit} {print}' "$IOS/App/Services/StoreDirectory.swift" | grep -v '^import MapKit' > "$PKG/Sources/Cartworth/DirectoryModels.swift"
cp "$IOS/linux/CryptoKitShim.swift" "$PKG/Sources/CryptoKit/"
cp "$IOS/linux/LinuxShims.swift" "$PKG/Sources/Cartworth/"
# Settable only on Apple platforms, and irrelevant to the logic under test.
sed -i '/waitsForConnectivity/s|^|// linux: |' "$PKG/Sources/Cartworth/HTTP.swift"
# On Linux, URLSession lives in FoundationNetworking and @Observable needs Observation (SwiftUI
# re-exports it on iOS). Added to the copies only; the app's files are not changed.
for f in "$PKG"/Sources/Cartworth/*.swift; do
  printf '#if canImport(FoundationNetworking)\nimport FoundationNetworking\n#endif\n#if canImport(Observation)\nimport Observation\n#endif\n' | cat - "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done
for t in CoreTests PricingRound2Tests ThanksgivingPricingTests; do cp "$IOS/Tests/$t.swift" "$PKG/Tests/CartworthTests/"; done
# XCTest on Linux cannot discover @MainActor test methods (a dynamic-cast failure at launch); the
# compiler still checks the isolation of what those methods call.
sed -i '/^    @MainActor$/d' "$PKG/Tests/CartworthTests/CoreTests.swift"
cat > "$PKG/Package.swift" <<'SWIFT'
// swift-tools-version:5.10
import PackageDescription
let package = Package(
  name: "Cartworth",
  targets: [
    .target(name: "CryptoKit", path: "Sources/CryptoKit"),
    .target(name: "Cartworth", dependencies: ["CryptoKit"], path: "Sources/Cartworth"),
    .testTarget(name: "CartworthTests", dependencies: ["Cartworth"], path: "Tests/CartworthTests"),
  ]
)
SWIFT
# NationalStatsTests read stats.json from the app bundle, which only Xcode builds.
cd "$PKG" && swift test --skip NationalStatsTests "$@"
