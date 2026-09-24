// Linux-only stand-ins for the few Apple-framework types the Core's files reach for, so the Core and
// its XCTests build on Linux (ios/linux/run-core-tests.sh). Never part of the iOS app.
import Foundation

/// StoreKit lives here on iOS (Services/Entitlements.swift). The tests exercise the free tier.
final class Entitlements {
    static let shared = Entitlements()
    var isPro = false
}

/// CoreLocation's distance on iOS (Networking/Geo.swift); great-circle miles here.
enum Geo {
    static func miles(_ a: (Double, Double)?, _ b: (Double, Double)?) -> Double? {
        guard let a, let b else { return nil }
        let r = 3958.8, rad = Double.pi / 180
        let h = pow(sin((b.0 - a.0) * rad / 2), 2) + cos(a.0 * rad) * cos(b.0 * rad) * pow(sin((b.1 - a.1) * rad / 2), 2)
        return (2 * r * asin(sqrt(h)) * 10).rounded() / 10
    }
}
