import Foundation
import CoreLocation

enum GeoError: LocalizedError {
    case badZip(String)
    case notFound(String)
    case denied
    case unavailable

    var errorDescription: String? {
        switch self {
        case .badZip(let z): return "“\(z)” isn’t a 5-digit US ZIP code"
        case .notFound(let z): return "Couldn’t find ZIP \(z)"
        case .denied: return "Location access is off. Enter your ZIP instead, or allow location in Settings."
        case .unavailable: return "Couldn’t get your location right now. Enter your ZIP instead."
        }
    }
}

enum Geo {
    static func isValidZip(_ s: String) -> Bool {
        s.count == 5 && s.allSatisfy(\.isNumber)
    }

    /// ZIP -> coordinates, city and state, via Apple's geocoder (cached forever).
    static func place(forZip zip: String) async throws -> UserPlace {
        let z = zip.trimmingCharacters(in: .whitespaces)
        guard isValidZip(z) else { throw GeoError.badZip(zip) }
        let r = try await Cache.shared.value("geo:zip:\(z)", ttl: 365 * TTL.day) {
            let marks = try await CLGeocoder().geocodeAddressString("\(z), United States")
            guard let m = marks.first(where: { $0.isoCountryCode == "US" }) ?? marks.first, let loc = m.location else { throw GeoError.notFound(z) }
            return UserPlace(zip: z, latitude: loc.coordinate.latitude, longitude: loc.coordinate.longitude, city: m.locality, state: m.administrativeArea)
        }
        return r.value
    }

    /// Coordinates -> ZIP/city/state.
    static func place(for location: CLLocation) async throws -> UserPlace {
        let marks = try await CLGeocoder().reverseGeocodeLocation(location)
        guard let m = marks.first, let zip = m.postalCode else { throw GeoError.unavailable }
        return UserPlace(zip: String(zip.prefix(5)), latitude: location.coordinate.latitude, longitude: location.coordinate.longitude, city: m.locality, state: m.administrativeArea)
    }

    static func miles(_ a: (Double, Double)?, _ b: (Double, Double)?) -> Double? {
        guard let a, let b else { return nil }
        let d = CLLocation(latitude: a.0, longitude: a.1).distance(from: CLLocation(latitude: b.0, longitude: b.1)) / 1609.344
        return (d * 10).rounded() / 10
    }
}

/// One-shot current location with async/await.
@MainActor
final class LocationFetcher: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation, Error>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func current() async throws -> CLLocation {
        switch manager.authorizationStatus {
        case .denied, .restricted: throw GeoError.denied
        default: break
        }
        return try await withCheckedThrowingContinuation { cont in
            continuation = cont
            if manager.authorizationStatus == .notDetermined {
                manager.requestWhenInUseAuthorization()
            } else {
                manager.requestLocation()
            }
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            switch manager.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways:
                if self.continuation != nil { manager.requestLocation() }
            case .denied, .restricted:
                self.finish(.failure(GeoError.denied))
            default:
                break
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            if let l = locations.last { self.finish(.success(l)) }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.finish(.failure(GeoError.unavailable)) }
    }

    private func finish(_ r: Swift.Result<CLLocation, Error>) {
        guard let c = continuation else { return }
        continuation = nil
        c.resume(with: r)
    }
}
