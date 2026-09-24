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

/// Limits concurrent requests per host so we stay polite to store sites.
actor HostGate {
    private var active: [String: Int] = [:]
    private var waiters: [String: [CheckedContinuation<Void, Never>]] = [:]
    private var lastStart: [String: Date] = [:]
    private var blocked: Set<String> = []
    private let maxPerHost: Int
    /// Minimum gap between two requests to the same host. Zero in the shipping app, which relies
    /// on `maxPerHost` alone; set for a screenshot capture run by `-qaPolite`.
    private let minGap: TimeInterval

    init(maxPerHost: Int = 4, minGap: TimeInterval = 0) {
        self.maxPerHost = maxPerHost
        self.minGap = minGap
    }

    /// A host that has answered 429. Nothing more is sent to it for the life of the process.
    func isBlocked(_ host: String) -> Bool { blocked.contains(host) }

    func block(_ host: String) { blocked.insert(host) }

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
    // `-qaPolite` (debug builds only, and only when the argument is passed) drops a capture run
    // to one request at a time per host with a 700 ms gap, and stops talking to a host that
    // answers 429. The shipping app keeps the four-at-once behaviour it has always had.
    private let gate = QAShot.politeNetworking ? HostGate(maxPerHost: 1, minGap: 0.7) : HostGate(maxPerHost: 4)

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
        await gate.acquire(host)
        defer { Task { await gate.release(host) } }
        let (data, resp) = try await session.data(for: req)
        let http = resp as? HTTPURLResponse
        return HTTPResponse(status: http?.statusCode ?? 0, data: data, url: http?.url ?? url, headers: http?.allHeaderFields ?? [:])
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
