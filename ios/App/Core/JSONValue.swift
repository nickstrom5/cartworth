import Foundation

/// Lightweight dynamic JSON for large, loosely specified third-party responses
/// (store search APIs change shape often; decoding them into rigid Codable structs is brittle).
enum J: Equatable {
    case obj([String: J])
    case arr([J])
    case str(String)
    case num(Double)
    case bool(Bool)
    case null

    init(_ any: Any?) {
        switch any {
        case let d as [String: Any]:
            self = .obj(d.mapValues { J($0) })
        case let a as [Any]:
            self = .arr(a.map { J($0) })
        case let s as String:
            self = .str(s)
        case let n as NSNumber:
            // JSON true/false arrive as NSNumber; only CoreFoundation's type ID tells a boolean from
            // 0/1 on Apple platforms. The #else lets the Core logic build and run its tests on Linux.
            #if canImport(Darwin)
            let isBool = CFGetTypeID(n) == CFBooleanGetTypeID()
            #else
            let isBool = String(cString: n.objCType) == "c"
            #endif
            if isBool {
                self = .bool(n.boolValue)
            } else {
                self = .num(n.doubleValue)
            }
        default:
            self = .null
        }
    }

    static func parse(_ data: Data) throws -> J {
        J(try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]))
    }

    subscript(_ key: String) -> J {
        if case .obj(let d) = self { return d[key] ?? .null }
        return .null
    }

    subscript(_ index: Int) -> J {
        if case .arr(let a) = self, index >= 0, index < a.count { return a[index] }
        return .null
    }

    var string: String? {
        switch self {
        case .str(let s): return s
        case .num(let n): return n == n.rounded() && abs(n) < 1e15 ? String(Int64(n)) : String(n)
        default: return nil
        }
    }

    /// Non-empty trimmed string.
    var text: String? {
        guard let s = string?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
        return s
    }

    var double: Double? {
        switch self {
        case .num(let n): return n
        case .str(let s): return Double(s.trimmingCharacters(in: .whitespaces))
        default: return nil
        }
    }

    var int: Int? { double.map { Int($0) } }

    var bool: Bool? {
        switch self {
        case .bool(let b): return b
        case .num(let n): return n != 0
        case .str(let s): return s == "1" || s.lowercased() == "true"
        default: return nil
        }
    }

    var array: [J] {
        if case .arr(let a) = self { return a }
        return []
    }

    var object: [String: J] {
        if case .obj(let d) = self { return d }
        return [:]
    }

    var isNull: Bool {
        if case .null = self { return true }
        return false
    }

    /// Depth-first search for the first value stored under `key` anywhere in the tree.
    func first(_ key: String) -> J? {
        switch self {
        case .obj(let d):
            if let v = d[key], !v.isNull { return v }
            for v in d.values { if let f = v.first(key) { return f } }
        case .arr(let a):
            for v in a { if let f = v.first(key) { return f } }
        default:
            break
        }
        return nil
    }

    /// Visit every object in the tree.
    func forEachObject(_ visit: ([String: J]) -> Void) {
        switch self {
        case .obj(let d):
            visit(d)
            for v in d.values { v.forEachObject(visit) }
        case .arr(let a):
            for v in a { v.forEachObject(visit) }
        default:
            break
        }
    }

    /// Back to Foundation types (for JSONSerialization).
    var any: Any {
        switch self {
        case .obj(let d): return d.mapValues { $0.any }
        case .arr(let a): return a.map { $0.any }
        case .str(let s): return s
        case .num(let n): return n
        case .bool(let b): return b
        case .null: return NSNull()
        }
    }
}

// MARK: - Regex helper

/// Thin NSRegularExpression wrapper (patterns ported from the web version).
struct Rx {
    let re: NSRegularExpression

    init(_ pattern: String, caseInsensitive: Bool = true) {
        var opts: NSRegularExpression.Options = []
        if caseInsensitive { opts.insert(.caseInsensitive) }
        // Patterns are compile-time constants; a failure here is a programming error.
        re = try! NSRegularExpression(pattern: pattern, options: opts)
    }

    func test(_ s: String) -> Bool {
        re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }

    /// Capture groups of the first match (index 0 = whole match). Missing groups are nil.
    func match(_ s: String) -> [String?]? {
        guard let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { return nil }
        return (0..<m.numberOfRanges).map { i in
            let r = m.range(at: i)
            guard r.location != NSNotFound, let rr = Range(r, in: s) else { return nil }
            return String(s[rr])
        }
    }

    func matches(_ s: String) -> [[String?]] {
        re.matches(in: s, range: NSRange(s.startIndex..., in: s)).map { m in
            (0..<m.numberOfRanges).map { i in
                let r = m.range(at: i)
                guard r.location != NSNotFound, let rr = Range(r, in: s) else { return nil }
                return String(s[rr])
            }
        }
    }

    func replace(_ s: String, with template: String) -> String {
        re.stringByReplacingMatches(in: s, range: NSRange(s.startIndex..., in: s), withTemplate: template)
    }
}
