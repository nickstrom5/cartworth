import Foundation

struct HTTPError: LocalizedError {
    var status: Int
    var message: String
    var errorDescription: String? { message }
}

struct HTTPResponse {
    var status: Int
    var data: Data
    var url: URL?
    var headers: [AnyHashable: Any]

    var ok: Bool { (200..<300).contains(status) }
    var text: String { String(decoding: data, as: UTF8.self) }

    func json() throws -> J {
        do {
            return try J.parse(data)
        } catch {
            let snippet = text.prefix(80).replacingOccurrences(of: "\n", with: " ")
            throw HTTPError(status: status, message: "Unexpected response from \(url?.host ?? "store") (\(snippet)…)")
        }
    }
}

/// The owner's rule for every store site, same as the server's src/http.js DEFAULT_HOST_POLICY:
/// one request in flight per host, at least 700 ms between requests, and stop on HTTP 429.
actor HostGate {
    private var active: [String: Int] = [:]
    private var waiters: [String: [CheckedContinuation<Void, Never>]] = [:]
    private var lastStart: [String: Date] = [:]
    private var blocked: Set<String> = []
    private var answered: [String: Date] = [:]
    private let maxPerHost: Int
    /// Minimum gap between two requests to the same host.
    private let minGap: TimeInterval

    init(maxPerHost: Int = 1, minGap: TimeInterval = 0.7) {
        self.maxPerHost = maxPerHost
        self.minGap = minGap
    }

    /// A host that has answered 429. Nothing more is sent to it for the life of the process.
    func isBlocked(_ host: String) -> Bool { blocked.contains(host) }

    func block(_ host: String) { blocked.insert(host) }

    /// The host gave a real answer (not a 5xx or a 429). `withStallTimeout` reads this.
    func noteAnswer(_ host: String) { answered[host] = Date() }

    /// When any of `hosts` last answered, or nil if none has.
    func lastAnswer(_ hosts: [String]) -> Date? { hosts.compactMap { answered[$0] }.max() }

    func acquire(_ host: String) async {
        if active[host, default: 0] < maxPerHost {
            active[host, default: 0] += 1
        } else {
            await withCheckedContinuation { cont in waiters[host, default: []].append(cont) }
        }
        guard minGap > 0 else { return }
        if let last = lastStart[host] {
            let wait = minGap - Date().timeIntervalSince(last)
            if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
        }
        lastStart[host] = Date()
    }

    func release(_ host: String) {
        if var w = waiters[host], !w.isEmpty {
            let next = w.removeFirst()
            waiters[host] = w
            next.resume()
        } else {
            active[host, default: 1] -= 1
        }
    }
}

/// Shared HTTP client. Uses the app's shared cookie storage so store guest sessions persist.
final class HTTP {
    static let shared = HTTP()

    let session: URLSession
    // One request at a time per host, 700 ms apart, and a host that answers 429 is not asked
    // again. This used to be `-qaPolite` only, with four at once and no gap in the shipping app;
    // the owner made the rule apply everywhere (Sept 2026). Long queues are handled by
    // `withStallTimeout`, not by asking faster.
    private let gate = HostGate()

    /// When any of `hosts` last gave a real answer. See `withStallTimeout`.
    func lastAnswer(_ hosts: [String]) async -> Date? { await gate.lastAnswer(hosts) }

    init() {
        let c = URLSessionConfiguration.default
        c.httpCookieStorage = HTTPCookieStorage.shared
        c.httpCookieAcceptPolicy = .always
        c.httpShouldSetCookies = true
        c.timeoutIntervalForRequest = 20
        c.timeoutIntervalForResource = 40
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.urlCache = nil
        c.waitsForConnectivity = false
        session = URLSession(configuration: c)
    }

    func request(_ url: URL, method: String = "GET", headers: [String: String] = [:], body: Data? = nil, timeout: TimeInterval = 20, retries: Int = 1) async throws -> HTTPResponse {
        var attempt = 0
        var lastError: Error?
        while attempt <= retries {
            do {
                let r = try await once(url, method: method, headers: headers, body: body, timeout: timeout)
                if r.status >= 500 && attempt < retries {
                    attempt += 1
                    try await Task.sleep(nanoseconds: UInt64(400_000_000 * attempt))
                    continue
                }
                return r
            } catch {
                if Task.isCancelled { throw CancellationError() }
                lastError = error
                if attempt >= retries { break }
                attempt += 1
                try await Task.sleep(nanoseconds: UInt64(500_000_000 * attempt))
            }
        }
        throw friendly(lastError, host: url.host ?? "")
    }

    private func once(_ url: URL, method: String, headers: [String: String], body: Data?, timeout: TimeInterval) async throws -> HTTPResponse {
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        req.httpMethod = method
        req.setValue("application/json, text/plain, */*", forHTTPHeaderField: "Accept")
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        req.httpBody = body
        let host = url.host ?? ""
        if await gate.isBlocked(host) { throw HTTPError(status: 429, message: "\(host) asked us to slow down — not asking again") }
        await gate.acquire(host)
        defer { Task { await gate.release(host) } }
        // Checked again after the wait: a request queued behind the one that got the 429 must not go out.
        if await gate.isBlocked(host) { throw HTTPError(status: 429, message: "\(host) asked us to slow down — not asking again") }
        let (data, resp) = try await session.data(for: req)
        let http = resp as? HTTPURLResponse
        let status = http?.statusCode ?? 0
        if status == 429 { await gate.block(host) } else if status > 0 && status < 500 { await gate.noteAnswer(host) }
        return HTTPResponse(status: status, data: data, url: http?.url ?? url, headers: http?.allHeaderFields ?? [:])
    }

    func getJSON(_ url: URL, headers: [String: String] = [:], timeout: TimeInterval = 20) async throws -> J {
        let r = try await request(url, headers: headers, timeout: timeout)
        guard r.ok else { throw HTTPError(status: r.status, message: "HTTP \(r.status) from \(url.host ?? "store")") }
        return try r.json()
    }

    func postJSON(_ url: URL, body: Any, headers: [String: String] = [:], timeout: TimeInterval = 20) async throws -> HTTPResponse {
        let data = try JSONSerialization.data(withJSONObject: body)
        var h = headers
        h["Content-Type"] = "application/json"
        return try await request(url, method: "POST", headers: h, body: data, timeout: timeout)
    }

    private func friendly(_ error: Error?, host: String) -> Error {
        guard let error else { return HTTPError(status: 0, message: "Request to \(host) failed") }
        if let u = error as? URLError {
            switch u.code {
            case .timedOut: return HTTPError(status: 0, message: "\(host) took too long to answer")
            case .notConnectedToInternet, .networkConnectionLost: return HTTPError(status: 0, message: "You’re offline")
            case .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed: return HTTPError(status: 0, message: "Couldn’t reach \(host)")
            default: return HTTPError(status: 0, message: u.localizedDescription)
            }
        }
        return error
    }

    func hasCookie(_ name: String, for url: URL) -> Bool {
        (HTTPCookieStorage.shared.cookies(for: url) ?? []).contains { $0.name == name }
    }

    func clearCookies(for host: String) {
        for c in HTTPCookieStorage.shared.cookies ?? [] where c.domain.contains(host) {
            HTTPCookieStorage.shared.deleteCookie(c)
        }
    }
}

extension URL {
    static func from(_ string: String?) -> URL? {
        guard let string, !string.isEmpty else { return nil }
        return URL(string: string)
    }
}

extension String {
    var urlQueryEncoded: String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return addingPercentEncoding(withAllowedCharacters: allowed) ?? self
    }
}
