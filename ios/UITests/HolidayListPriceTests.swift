import XCTest

/// The owner, 13 Nov 2026: after "Add all to my list" on a holiday screen "I expected at least a
/// button to easily see the pricing of those items". The button turned into a greyed-out "Added 14
/// items" and that was the end of it. Now the screen offers "See prices for my list", which opens
/// the List tab and plans the trip there (Router.priceList). Live network: the plan asks the stores.
final class HolidayListPriceTests: XCTestCase {
    func testAddAllThenSeePricesPlansTheList() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-qaZip", ProcessInfo.processInfo.environment["QA_ZIP"] ?? "60618", "-proUnlocked", "-qaClearList"]
        app.launch()

        let card = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Thanksgiving' OR label CONTAINS 'Thanksgiving in'")).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 120), "no Thanksgiving card on the Search tab")
        card.tap()

        let addAll = app.buttons["Add all to my list"]
        XCTAssertTrue(addAll.waitForExistence(timeout: 10))
        addAll.tap()

        let price = app.buttons["priceOccasion"]
        XCTAssertTrue(price.waitForExistence(timeout: 5), "no way on to the prices after adding the list")
        XCTAssertTrue(price.label.hasPrefix("See prices for my list"), price.label)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Added '")).firstMatch.exists)
        price.tap()

        // The List tab, planning or planned: the plan button says it is busy, or the plan is there.
        let planned = app.staticTexts["Trip plan"]
        let busy = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Plan the cheapest trip' OR label CONTAINS 'Re-plan'")).firstMatch
        XCTAssertTrue(busy.waitForExistence(timeout: 10) || planned.exists, "the List tab did not open on the plan")
        XCTAssertTrue(app.descendants(matching: .any)["planningNote"].waitForExistence(timeout: 20), "no progress shown while planning")
        XCTAssertTrue(planned.waitForExistence(timeout: 900), "the list was not priced")
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = "holiday-list-priced"
        shot.lifetime = .keepAlways
        add(shot)
    }
}
