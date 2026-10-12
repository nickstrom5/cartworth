import Foundation
import CryptoKit

/// Two-level cache (memory + Caches directory) with TTLs, in-flight de-duplication, and
/// stale-if-error: when a source fails, an expired copy (up to `maxStale` old) is returned instead.
actor Cache {
    static let shared = Cache()

    private struct Entry: Codable {
        var expires: Date
        var stored: Date
        var payload: Data
    }

    private var memory: [String: Entry] = [:]
    private var inflight: [String: Task<Data, Error>] = [:]
    private let dir: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init() {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        dir = base.appendingPathComponent("price-cache", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    struct Result<T> {
        var value: T
        /// Set when the value is an expired copy served because the source failed
        var staleError: Error?
        var fromCache: Bool
        /// When a stale copy was fetched from the source ("saved 5 hr ago"); nil for a fresh value
        var storedAt: Date? = nil
    }

    func value<T: Codable>(_ key: String, ttl: TimeInterval, fresh: Bool = false, maxStale: TimeInterval = 7 * 86400, fetch: @escaping @Sendable () async throws -> T) async throws -> Result<T> {
        if !fresh, let e = entry(key), e.expires > Date(), let v = try? decoder.decode(T.self, from: e.payload) {
            return Result(value: v, staleError: nil, fromCache: true)
        }
        let task: Task<Data, Error>
        if let running = inflight[key] {
            task = running
        } else {
            let enc = encoder
            task = Task { try enc.encode(try await fetch()) }
            inflight[key] = task
        }
        do {
            let data = try await task.value
            inflight[key] = nil
            let e = Entry(expires: Date().addingTimeInterval(ttl), stored: Date(), payload: data)
            save(key, e)
            return Result(value: try decoder.decode(T.self, from: data), staleError: nil, fromCache: false)
        } catch {
            inflight[key] = nil
            if error is CancellationError { throw error }
            if let e = entry(key), e.expires > Date().addingTimeInterval(-maxStale), let v = try? decoder.decode(T.self, from: e.payload) {
                return Result(value: v, staleError: error, fromCache: true, storedAt: e.stored)
            }
            throw error
        }
    }

    /// Cached value regardless of expiry (for "last known" displays).
    func peek<T: Codable>(_ key: String, as: T.Type) -> T? {
        guard let e = entry(key) else { return nil }
        return try? decoder.decode(T.self, from: e.payload)
    }

    func isFresh(_ key: String) -> Bool {
        guard let e = entry(key) else { return false }
        return e.expires > Date()
    }

    func put<T: Codable>(_ key: String, _ value: T, ttl: TimeInterval) {
        guard let data = try? encoder.encode(value) else { return }
        save(key, Entry(expires: Date().addingTimeInterval(ttl), stored: Date(), payload: data))
    }

    func remove(prefix: String) {
        for k in memory.keys where k.hasPrefix(prefix) { memory[k] = nil }
        // Disk files are hashed; walk the index file to find matching keys
        var idx = index()
        for k in idx.keys where k.hasPrefix(prefix) {
            try? FileManager.default.removeItem(at: file(k))
            idx[k] = nil
        }
        writeIndex(idx)
    }

    func clearAll() {
        memory.removeAll()
        try? FileManager.default.removeItem(at: dir)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    /// Delete disk entries that expired more than two weeks ago.
    func purge() {
        let cutoff = Date().addingTimeInterval(-14 * 86400)
        var idx = index()
        for (k, exp) in idx where exp < cutoff {
            try? FileManager.default.removeItem(at: file(k))
            idx[k] = nil
        }
        writeIndex(idx)
    }

    // MARK: storage

    private func entry(_ key: String) -> Entry? {
        if let m = memory[key] { return m }
        guard let data = try? Data(contentsOf: file(key)), let e = try? decoder.decode(Entry.self, from: data) else { return nil }
        memory[key] = e
        return e
    }

    private func save(_ key: String, _ e: Entry) {
        memory[key] = e
        if memory.count > 600 { memory.removeAll(keepingCapacity: true) }
        if let data = try? encoder.encode(e) {
            try? data.write(to: file(key), options: .atomic)
            var idx = index()
            idx[key] = e.expires
            writeIndex(idx)
        }
    }

    private func file(_ key: String) -> URL {
        let digest = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        return dir.appendingPathComponent(digest.prefix(40) + ".json")
    }

    private var indexCache: [String: Date]?

    private func index() -> [String: Date] {
        if let i = indexCache { return i }
        let url = dir.appendingPathComponent("index.plist")
        let i = (try? PropertyListDecoder().decode([String: Date].self, from: Data(contentsOf: url))) ?? [:]
        indexCache = i
        return i
    }

    private func writeIndex(_ i: [String: Date]) {
        indexCache = i
        if let data = try? PropertyListEncoder().encode(i) {
            try? data.write(to: dir.appendingPathComponent("index.plist"), options: .atomic)
        }
    }
}

enum TTL {
    static let minute: TimeInterval = 60
    static let hour: TimeInterval = 3600
    static let day: TimeInterval = 86400
}
