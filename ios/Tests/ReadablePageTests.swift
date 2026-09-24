import XCTest
import SwiftUI
@testable import Cartworth

/// I7: on a wide iPad a tab's large title and the content under it share one leading edge.
///
/// Round 1 claimed Search had been "opted into .leading" readableWidth; Search never called
/// readableWidth at all. What the tabs actually did was cap their *content* and leave the large
/// navigation title pinned to the window's margin — "Settings" sat 338pt left of the form it
/// introduced on a 13" iPad in landscape, "Tracking" some 200pt left of its list in portrait.
/// Every tab root now caps its whole `NavigationStack` with `readablePage`, which is what moves
/// the title. This hosts that modifier around a real navigation stack at a 13" landscape width
/// with a regular size class and measures where the title and the first row land.
@MainActor
final class ReadablePageTests: XCTestCase {

    private func frames(capped: Bool) -> (title: CGRect, row: CGRect)? {
        let stack = NavigationStack {
            List { Text("First row of the page") }
                .navigationTitle("Tracking")
        }
        let page: AnyView = capped ? AnyView(stack.readablePage(780, background: Color(.systemGroupedBackground))) : AnyView(stack)
        let screen = HostedScreen(page.environment(\.horizontalSizeClass, .regular), size: CGSize(width: 1376, height: 1032))
        defer { screen.tearDown() }
        screen.pump(0.8)
        let els = screen.elements
        guard let title = els.first(where: { $0.0 == "Tracking" })?.1,
              let row = els.first(where: { $0.0 == "First row of the page" })?.1 else { return nil }
        return (title, row)
    }

    /// DEFECT I7: the title heads its own column. Within the list's inset (~20pt) of the row's
    /// leading edge, and the column itself is centred rather than hugging the window's left.
    func testDEFECTI7TheLargeTitleSharesTheContentsLeadingEdge() throws {
        let f = try XCTUnwrap(frames(capped: true), "title or row not found on screen")
        XCTAssertLessThan(abs(f.title.minX - f.row.minX), 40,
                          "the title starts at x=\(Int(f.title.minX)) and the content at x=\(Int(f.row.minX)): the heading overhangs its page")
        XCTAssertGreaterThan(f.title.minX, 200, "the column is centred in a 1376pt window, not pinned to its left edge (title x=\(Int(f.title.minX)))")
    }

    /// control: uncapped, the title sits at the window margin — the measurement above is really
    /// measuring the cap, not a layout that is always aligned.
    func testControlUncappedTitleSitsAtTheWindowMargin() throws {
        let f = try XCTUnwrap(frames(capped: false), "title or row not found on screen")
        XCTAssertLessThan(f.title.minX, 80, "title x=\(Int(f.title.minX))")
    }
}
