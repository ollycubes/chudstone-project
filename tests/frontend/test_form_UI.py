import pytest
from playwright.sync_api import Page, expect

BASE = "http://localhost:8000" # server needs to run on this

# runs before every test automatically for a fake backend
@pytest.fixture(autouse=True)
def mock_api(page: Page):
    """Fake the backend so UI tests don't depend on the database."""
    page.route("**/categories", lambda r: r.fulfill(json={
        "Travel": ["Self-owned car", "Bus"],
        "Food": ["Groceries", "Takeaway"],
        "Energy": ["Electricity"],
    }))
    page.route("**/personas", lambda r: r.fulfill(json=[
        {"customerId": 1, "persona": "Single Professional"},
        {"customerId": 2, "persona": "Family"},
    ]))
    # no one signed in yet, so the form starts a session for the first persona
    page.route("**/session", lambda r: r.fulfill(status=401, json={"detail": "Pick a persona first."})
               if r.request.method == "GET" else
               r.fulfill(json={"customerId": 1, "persona": "Single Professional"}))

# test 1: checks the first persona name shows up in the header button
def test_persona_loads_in_header(page: Page):
    page.goto(f"{BASE}/spending-form/form.html")
    expect(page.locator("#persona-btn")).to_have_text("Example: Single Professional")

# test 2: checks the page starts with one category section and Travel is selected
def test_first_category_section_is_added(page: Page):
    page.goto(f"{BASE}/spending-form/form.html")
    expect(page.locator(".section")).to_have_count(1)
    expect(page.locator(".cat.active")).to_have_text("Travel")

# test 3: checks "Next category" adds a second section and greys out Travel in it
def test_next_category_adds_section_and_disables_used(page: Page):
    page.goto(f"{BASE}/spending-form/form.html")
    page.click("#next")
    expect(page.locator(".section")).to_have_count(2)
    # Travel is already used, so it's disabled in the second section
    second = page.locator(".section").nth(1)
    expect(second.locator('.cat[data-cat="Travel"]')).to_be_disabled()

# test 4: checks "Add another" creates a new expense row and the bin icon removes one
def test_add_and_delete_expense_row(page: Page):
    page.goto(f"{BASE}/spending-form/form.html")
    page.click(".add")
    expect(page.locator(".exp")).to_have_count(2)
    page.locator(".del").first.click()
    expect(page.locator(".exp")).to_have_count(1)

# test 5: checks submitting an empty form shows the error message
def test_empty_submit_shows_error(page: Page):
    page.goto(f"{BASE}/spending-form/form.html")
    page.click(".btn-confirm")
    expect(page.locator("#msg")).to_contain_text("Add at least one expense")

# test 6: checks the month picker doesn't let you go forward to a future year
def test_future_months_are_disabled(page: Page):
    page.goto(f"{BASE}/spending-form/form.html")
    page.click("#month-btn")
    expect(page.locator("#mp-next")).to_be_disabled()

# test 7: checks a valid submit goes to the dashboard with the new submission id
def test_successful_submit_redirects(page: Page):
    # fake a successful save so nothing is written to the real database
    page.route("**/submit", lambda r: r.fulfill(
        status=201, json={"status": "saved", "submissionId": 7, "entries": 1}))
    page.goto(f"{BASE}/spending-form/form.html")
    page.select_option("select[name=expense_type]", "Self-owned car")
    page.fill("input[name=amount]", "280")
    page.click(".btn-confirm")
    page.wait_for_url("**/dashboard/dash.html?submission=7")