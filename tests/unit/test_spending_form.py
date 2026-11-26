"""Unit tests for the SpendingForm model that validates what the form sends to /submit."""
from decimal import Decimal

import pytest
from pydantic import ValidationError

from api.main import SpendingForm

VALID = {"month": "2026-11", "subcategory_id": ["Bus"], "amount": ["12.50"]}


def form(**changes):
    return SpendingForm(**{**VALID, **changes})


def test_valid_form_is_accepted_and_converted():
    f = form(note=["commute"])
    assert f.month == "2026-11"
    assert f.subcategory_id == ["Bus"]
    assert f.amount == [Decimal("12.50")]
    assert f.note == ["commute"]


def test_notes_default_to_an_empty_list():
    assert form().note == []


@pytest.mark.parametrize("month", ["2026-01", "2026-09", "2026-10", "2026-12", "1999-06"])
def test_good_months(month):
    assert form(month=month).month == month


@pytest.mark.parametrize(
    "month", ["2026-00", "2026-13", "2026-1", "26-11", "2026/11", "2026-11-01", "", "Nov 2026"]
)
def test_bad_months_are_rejected(month):
    with pytest.raises(ValidationError):
        form(month=month)


@pytest.mark.parametrize("amount", ["0.01", "1", "999.99", "1000000000"])
def test_good_amounts(amount):
    assert form(amount=[amount]).amount == [Decimal(amount)]


@pytest.mark.parametrize(
    "amount", ["0", "-1", "0.001", "1000000000.01", "abc", "NaN", "inf", ""]
)
def test_bad_amounts_are_rejected(amount):
    with pytest.raises(ValidationError):
        form(amount=[amount])


def test_a_note_of_exactly_200_chars_is_allowed():
    assert len(form(note=["x" * 200]).note[0]) == 200


def test_a_note_over_200_chars_is_rejected():
    with pytest.raises(ValidationError):
        form(note=["x" * 201])


@pytest.mark.parametrize("field", ["subcategory_id", "amount"])
def test_at_least_one_entry_is_needed(field):
    with pytest.raises(ValidationError):
        form(**{field: []})


def test_50_entries_is_the_limit():
    form(subcategory_id=["Bus"] * 50, amount=["1"] * 50, note=[""] * 50)
    for field, value in [("subcategory_id", "Bus"), ("amount", "1"), ("note", "")]:
        with pytest.raises(ValidationError):
            form(**{field: [value] * 51})


@pytest.mark.parametrize("missing", ["month", "subcategory_id", "amount"])
def test_required_fields(missing):
    data = {k: v for k, v in VALID.items() if k != missing}
    with pytest.raises(ValidationError):
        SpendingForm(**data)
