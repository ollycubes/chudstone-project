"""Dashboard trend and savings-estimate behavior using mocked API responses."""
import os

from playwright.sync_api import Page, expect

BASE = os.environ.get("DASHBOARD_TEST_BASE", "http://localhost:8000")


def load_dashboard(page: Page, entries: list[dict]):
    page.route("**/entries*", lambda route: route.fulfill(json=entries))
    page.goto(f"{BASE}/dashboard/dash.html")
    expect(page.locator("#month-title")).not_to_have_text("\u00a0")


def test_dashboard_summaries_trends_and_savings_estimate(page: Page):
    entries = [
        {
            "entryId": 1,
            "submissionId": 1,
            "month": "2026-09",
            "category": "Food",
            "subcategory": "Groceries",
            "amount": 100,
            "carbonKg": 10,
            "note": None,
        },
        {
            "entryId": 2,
            "submissionId": 2,
            "month": "2026-09",
            "category": "Travel",
            "subcategory": "Bus",
            "amount": 40,
            "carbonKg": 20,
            "note": None,
        },
        {
            "entryId": 3,
            "submissionId": 3,
            "month": "2026-10",
            "category": "Food",
            "subcategory": "Groceries",
            "amount": 150,
            "carbonKg": 15,
            "note": None,
        },
        {
            "entryId": 4,
            "submissionId": 4,
            "month": "2026-10",
            "category": "Travel",
            "subcategory": "Bus",
            "amount": 20,
            "carbonKg": 6,
            "note": None,
        },
    ]
    load_dashboard(page, entries)

    expect(page.locator("#total-spend")).to_have_text("\u00a3170.00")
    expect(page.locator("#total-carbon")).to_have_text("21.0 kg CO\u2082e")
    expect(page.locator("#spend-delta")).to_contain_text("\u00a330.00 more than September")
    expect(page.locator("#carbon-delta")).to_contain_text("9.0 kg CO\u2082e less than September")
    expect(page.locator("#top-spend")).to_have_text("Food")
    expect(page.locator("#top-carbon")).to_have_text("Food")
    expect(page.locator("#save-value")).to_have_text("\u00a350.00")

    page.get_by_role("button", name="Carbon", exact=True).click()
    expect(page.locator("#save-value")).to_have_text("5.0 kg CO\u2082e")
    expect(page.locator("#save-sub")).to_contain_text("if each category matched your lowest month")


def test_dashboard_keeps_empty_months_out_of_trend_comparisons(page: Page):
    entries = [
        {
            "entryId": 1,
            "submissionId": 1,
            "month": "2026-01",
            "category": "Food",
            "subcategory": "Groceries",
            "amount": 50,
            "carbonKg": 5,
            "note": None,
        },
        {
            "entryId": 2,
            "submissionId": 2,
            "month": "2026-03",
            "category": "Food",
            "subcategory": "Groceries",
            "amount": 70,
            "carbonKg": 7,
            "note": None,
        },
    ]
    load_dashboard(page, entries)

    expect(page.locator(".bar-col")).to_have_count(3)
    expect(page.locator("#spend-delta")).to_be_empty()
    expect(page.locator("#carbon-delta")).to_be_empty()

    page.locator("#month-prev").click()
    expect(page.locator("#month-title")).to_contain_text("February 2026")
    expect(page.locator("#entry-count")).to_have_text("No spending recorded this month")
    expect(page.locator("#total-spend")).to_have_text("\u2013")
