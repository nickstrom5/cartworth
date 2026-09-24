import CoreGraphics
import Foundation

/// How to recognise a broken price *from its frame*, for the automated screen guards.
///
/// This exists because the obvious check does not work. A `Text` wrapped across two lines still
/// reports its whole string as its accessibility label — "$6.17" reads back as "$6.17" even while
/// the screen shows "$6.1" over "7" — so no string comparison can ever see the defect that
/// matters most. The geometry can, and these are the rules that say how.
///
/// ## Why this file lives in UITests and is compiled into two targets
///
/// The rules are *used* by the UI tests (`DuoTests`, `IPadLandscapeTests`), which walk the real
/// screen and hand every price they find to `defects(label:frame:window:)`. A UI-test target
/// cannot import the app module, so this used to exist twice: a copy in the app target that only
/// `AppTests` ever called, and a hand-kept mirror in `DuoTests` that was the guard actually
/// running — and that nothing pinned. Editing the mirror's 1.2 threshold, or its four-glyph
/// exemption, failed no test anywhere, so the guard on the app's highest-severity defect class
/// could drift silently while the unit tests stayed green against a copy nobody used.
///
/// Now there is one copy. `project.yml` compiles this file into **both** `AppUITests` (where the
/// guards run it) and `AppTests` (where `PriceLabelGeometryTests` pins it against the exact frames
/// from the sweep). Change a threshold here and the unit tests fail; there is no second copy left
/// to forget.
enum PriceLabelGeometry {
    /// Below this width-to-height ratio a price is being drawn on more than one line.
    ///
    /// A price of four or more glyphs set on one line is always markedly wider than it is tall —
    /// even in a condensed face the ratio is comfortably past 1.5 — and the same string broken in
    /// two roughly doubles in height while losing width. 1.2 is deliberately lenient: an ordinary
    /// single-line price can never trip it, and a genuine break lands far below.
    static let minSingleLineAspect: CGFloat = 1.2

    /// Shorter than this and a price is legitimately close to square ("99¢" is three glyphs), so
    /// the shape rule is not applied to it.
    static let minGlyphsForAspectCheck = 4

    /// SwiftUI rounds frames and a shadow may bleed a point; anything past this is really outside.
    static let edgeSlack: CGFloat = 1

    /// A money label as this app renders one. `Money.full` gives "$2.99"; `Money.unit` gives
    /// "16.5¢" as often as "$1.20", and a guard gated on a leading "$" skipped every cent-
    /// formatted unit price in the app while they were visibly being split on screen.
    static func isPriceLabel(_ label: String) -> Bool {
        guard label.count <= 24 else { return false }   // prose that mentions a price is not one
        guard label.first == "$" || label.hasSuffix("¢") else { return false }
        return label.contains(where: \.isNumber)
    }

    /// Is this price laid out on more than one line? See `minSingleLineAspect`.
    static func looksWrapped(label: String, frame: CGRect) -> Bool {
        guard label.count >= minGlyphsForAspectCheck, frame.width > 0, frame.height > 0 else { return false }
        return frame.width / frame.height < minSingleLineAspect
    }

    /// Everything wrong with one price as it sits on screen, in words a failure message can carry.
    /// Empty means the price is drawn whole.
    ///
    ///   * **clipped** — an ellipsis. `Money` never emits one, so any "…" was added by layout
    ///     ("$1.…" for $11.38 has shipped).
    ///   * **wrapped** — see `looksWrapped`; the label is intact, the drawing is not.
    ///   * **off the panel** — part of the number is past the window's leading or trailing edge.
    ///     No screen in this app scrolls sideways at the page level, so those digits are simply
    ///     not on the device.
    static func defects(label: String, frame: CGRect, window: CGRect) -> [String] {
        var out: [String] = []
        if label.contains("…") || label.hasSuffix("...") { out.append("clipped") }
        if looksWrapped(label: label, frame: frame) { out.append("wrapped") }
        if frame.width > 0, window.width > 0,
           frame.minX < window.minX - edgeSlack || frame.maxX > window.maxX + edgeSlack {
            out.append("off the panel")
        }
        return out
    }

    /// Does this piece of content sit under a floating bar (the iPad tab bar, which iPadOS 18+
    /// draws over the top of the content)? Judged at rest, before anything is scrolled: once a
    /// page scrolls, content passing under a translucent bar is what the bar is designed for.
    ///
    /// A zero-area overlap along a shared edge is not "under".
    static func isUnder(bar: CGRect, frame: CGRect) -> Bool {
        guard !bar.isEmpty, frame.width > 0, frame.height > 0 else { return false }
        let i = bar.intersection(frame)
        return !i.isNull && i.width > edgeSlack && i.height > edgeSlack
    }
}
