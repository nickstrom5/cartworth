import Foundation

/// The file the app and the widget share: `WidgetSnapshot` as JSON in the App Group container.
/// Compiled into both targets (project.yml). Neither side fails when the group is missing (a build
/// signed without it): the app skips the write, and the widget shows its "open Cartworth" state.
enum WidgetStore {
    static let appGroup = "group.app.cartworth.ios"
    static let widgetKind = "CartworthWatchWidget"
    private static let fileName = "watch-widget.json"

    static var url: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?.appendingPathComponent(fileName)
    }

    static func read() -> WidgetSnapshot {
        guard let url, let data = try? Data(contentsOf: url) else { return .empty }
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        return (try? dec.decode(WidgetSnapshot.self, from: data)) ?? .empty
    }

    /// True when the file changed (so the caller knows whether to reload the widget's timelines).
    @discardableResult
    static func write(_ snapshot: WidgetSnapshot) -> Bool {
        guard let url else { return false }
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        enc.outputFormatting = [.sortedKeys]
        guard let data = try? enc.encode(snapshot) else { return false }
        if let old = try? Data(contentsOf: url), old == data { return false }
        return (try? data.write(to: url, options: .atomic)) != nil
    }
}
