"""Unit tests for the database helpers in api.main: current_customer, own_entry, category_totals."""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from api.main import category_totals, current_customer, own_entry
from api.models import Customers, MonthlySpendSubmissions as M


def fake_request(session):
    # current_customer only reads request.session, so a plain object is enough
    return SimpleNamespace(session=session)


def add_entry(db, customer_id, category="Travel", amount=10.0, carbon=2.0, month="2030-01"):
    row = M(
        submission_id=9999, customer_id=customer_id, month=month, category=category,
        subcategory="Bus", amount=amount, carbon_impact=carbon,
        date_submitted=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    return row


# ---------- current_customer ----------

def test_current_customer_returns_the_session_persona(db):
    customer = current_customer(fake_request({"customer_id": 3}), db)
    assert (customer.customer_id, customer.persona) == (3, "Family Household")


@pytest.mark.parametrize(
    "session",
    [
        {},                        # never picked a persona
        {"customer_id": 999},      # persona that doesn't exist (e.g. deleted)
        {"customer_id": "2"},      # wrong type: only ints are trusted
        {"customer_id": None},
    ],
)
def test_current_customer_rejects_a_bad_session_and_clears_it(db, session):
    session = {**session, "other": "junk"}
    with pytest.raises(HTTPException) as err:
        current_customer(fake_request(session), db)
    assert err.value.status_code == 401
    assert session == {}  # the bad session is wiped so the user has to pick again


# ---------- own_entry ----------

def test_own_entry_returns_the_customers_entry(db):
    row = add_entry(db, customer_id=2)
    customer = db.get(Customers, 2)
    assert own_entry(db, row.entry_id, customer).entry_id == row.entry_id


def test_own_entry_hides_another_customers_entry(db):
    row = add_entry(db, customer_id=2)
    other = db.get(Customers, 3)
    with pytest.raises(HTTPException) as err:
        own_entry(db, row.entry_id, other)
    assert err.value.status_code == 404


def test_own_entry_missing_entry_is_404(db):
    with pytest.raises(HTTPException) as err:
        own_entry(db, 2_000_000_000, db.get(Customers, 1))
    assert err.value.status_code == 404
    assert err.value.detail == "Entry not found."


# ---------- category_totals ----------

def test_totals_add_up_per_category(empty_db):
    db = empty_db
    add_entry(db, 1, "Travel", amount=10, carbon=2)
    add_entry(db, 1, "Travel", amount=5, carbon=1)
    add_entry(db, 1, "Food", amount=100, carbon=20)

    rows = {r.category: (r.spend, r.carbon) for r in category_totals(db, customer_id=1)}
    assert rows == {"Travel": (15, 3), "Food": (100, 20)}


def test_totals_are_sorted_by_carbon_highest_first(empty_db):
    db = empty_db
    add_entry(db, 1, "Travel", carbon=5)
    add_entry(db, 1, "Food", carbon=50)
    add_entry(db, 1, "Utilities", carbon=20)
    assert [r.category for r in category_totals(db, 1)] == ["Food", "Utilities", "Travel"]


def test_totals_only_count_the_given_customer(empty_db):
    db = empty_db
    add_entry(db, 1, "Travel", amount=10)
    add_entry(db, 2, "Travel", amount=999)
    [row] = category_totals(db, 1)
    assert row.spend == 10


def test_totals_month_filter(empty_db):
    db = empty_db
    add_entry(db, 1, "Travel", amount=10, month="2030-01")
    add_entry(db, 1, "Travel", amount=20, month="2030-02")
    assert [r.spend for r in category_totals(db, 1, month="2030-02")] == [20]
    assert [r.spend for r in category_totals(db, 1)] == [30]


def test_totals_empty_when_nothing_matches(db):
    assert category_totals(db, customer_id=999) == []
    assert category_totals(db, customer_id=1, month="1900-01") == []


def test_totals_match_the_seeded_data(db):
    expected = dict(
        db.execute(select(M.category, func.sum(M.amount)).where(M.customer_id == 2).group_by(M.category)).all()
    )
    assert {r.category: r.spend for r in category_totals(db, 2)} == pytest.approx(expected)
