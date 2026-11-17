from playwright.sync_api import Page, expect

# localhost URL for the form.html page
URL = "http://127.0.0.1:5500/Website%20dir/form.html"

# 1. Clicking Add another expense creates a new input row
def test_add_expense(page: Page):
    page.goto(URL)
    rows = page.locator(".exp")
    expect(rows).to_have_count(1)

    page.get_by_role(
        "button",
        name="Add another travel expense"
    ).click()
    expect(rows).to_have_count(2)

# 2. Entering valid spending produces the correct confirmation
def test_confirm_spending(page: Page):
    page.goto(URL)
    page.locator(
        '[name="expense_type"]'
    ).first.select_option(label="Trains")
    page.locator(
        '[name="amount"]'
    ).first.fill("50")

    page.get_by_role(
        "button",
        name="Confirm spending"
    ).click()

    expect(page.locator("#msg")).to_contain_text(
        "£50.00"
    )

# 3. Rejects the negative amount
def test_negative_amount(page: Page):
    page.goto(URL)

    page.locator('[name="expense_type"]').first.select_option(
        label="Trains"
    )

    amount = page.locator('[name="amount"]').first
    amount.fill("-50")

    page.get_by_role(
        "button",
        name="Confirm spending"
    ).click()

    assert amount.evaluate(
        "(el) => el.checkValidity()"
    ) is False
 
    expect(page.locator("#msg")).not_to_contain_text(
        "Spending confirmed"
    )

# 4. Reject empty spending submission  
def test_empty_submission(page: Page):
    page.goto(URL)

    page.get_by_role(
        "button",
        name="Confirm spending"
    ).click()

    # Check for an error message
    message = page.locator("#msg")

    expect(message).to_be_visible()
    expect(message).to_contain_text(
        "Add at least one expense before confirming."
    )

    expect(message).not_to_contain_text(
        "Spending confirmed"
    )
