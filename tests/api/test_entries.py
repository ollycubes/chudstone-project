"""Tests for GET /entries and editing or deleting saved entries."""
import pytest

from api.seed import CATEGORIESSEED

FACTOR = {subcategory: factor for _category, subcategory, factor in CATEGORIESSEED}


def create_submission(client):
    response = client.post(
        "/submit",
        data={
            "month": "2026-11",
            "customer_id": "2",
            "subcategory_id": ["Bus"],
            "amount": ["12.50"],
            "note": ["commute"],
        },
    )
    assert response.status_code == 201
    return response.json()["submissionId"]


def get_created_entry(client, submission_id):
    entries = client.get("/entries", params={"customer_id": 2}).json()
    return next(entry for entry in entries if entry["submissionId"] == submission_id)


def test_entries_returns_expected_response_and_filters_by_customer(client):
    submission_id = create_submission(client)

    response = client.get("/entries", params={"customer_id": 2})

    assert response.status_code == 200
    entry = next(row for row in response.json() if row["submissionId"] == submission_id)
    assert set(entry) == {
        "entryId",
        "submissionId",
        "month",
        "category",
        "subcategory",
        "amount",
        "carbonKg",
        "note",
    }
    assert entry["month"] == "2026-11"
    assert entry["category"] == "Travel"
    assert entry["subcategory"] == "Bus"
    assert entry["amount"] == 12.5
    assert entry["carbonKg"] == pytest.approx(12.5 * FACTOR["Bus"])
    assert entry["note"] == "commute"

    customer_one_ids = {
        row["submissionId"]
        for row in client.get("/entries", params={"customer_id": 1}).json()
    }
    assert submission_id not in customer_one_ids


def test_entry_update_recalculates_and_persists_category_carbon_and_note(client):
    submission_id = create_submission(client)
    entry_id = get_created_entry(client, submission_id)["entryId"]

    response = client.put(
        f"/entries/{entry_id}",
        data={"subcategory": "Groceries", "amount": "25.50", "note": "  weekly shop  "},
    )

    assert response.status_code == 200
    assert response.json() == {
        "entryId": entry_id,
        "submissionId": submission_id,
        "month": "2026-11",
        "category": "Food",
        "subcategory": "Groceries",
        "amount": 25.5,
        "carbonKg": pytest.approx(25.5 * FACTOR["Groceries"]),
        "note": "weekly shop",
    }

    saved = get_created_entry(client, submission_id)
    assert saved["category"] == "Food"
    assert saved["subcategory"] == "Groceries"
    assert saved["amount"] == 25.5
    assert saved["carbonKg"] == pytest.approx(25.5 * FACTOR["Groceries"])
    assert saved["note"] == "weekly shop"


@pytest.mark.parametrize(
    "form_data",
    [
        {"subcategory": "Not a category", "amount": "25"},
        {"subcategory": "Groceries", "amount": "0"},
        {"subcategory": "Groceries", "amount": "25.999"},
    ],
)
def test_invalid_entry_update_is_rejected_without_changing_saved_data(client, form_data):
    submission_id = create_submission(client)
    original = get_created_entry(client, submission_id)

    response = client.put(f"/entries/{original['entryId']}", data=form_data)

    assert response.status_code == 422
    assert get_created_entry(client, submission_id) == original


def test_entry_delete_persists_and_missing_entry_returns_404(client):
    submission_id = create_submission(client)
    entry_id = get_created_entry(client, submission_id)["entryId"]

    response = client.delete(f"/entries/{entry_id}")

    assert response.status_code == 200
    assert response.json() == {"status": "deleted", "entryId": entry_id}
    assert all(
        row["entryId"] != entry_id
        for row in client.get("/entries", params={"customer_id": 2}).json()
    )

    missing = client.delete(f"/entries/{entry_id}")
    assert missing.status_code == 404
    assert missing.json()["detail"] == "Entry not found."


def test_entry_delete_only_removes_the_requested_entry(client):
    response = client.post(
        "/submit",
        data={
            "month": "2026-11",
            "customer_id": "2",
            "subcategory_id": ["Bus", "Bus"],
            "amount": ["12.50", "25.00"],
            "note": ["first", "second"],
        },
    )
    assert response.status_code == 201
    submission_id = response.json()["submissionId"]
    entries = [
        row
        for row in client.get("/entries", params={"customer_id": 2}).json()
        if row["submissionId"] == submission_id
    ]
    deleted_entry, remaining_entry = entries

    response = client.delete(f"/entries/{deleted_entry['entryId']}")

    assert response.status_code == 200
    assert response.json() == {"status": "deleted", "entryId": deleted_entry["entryId"]}
    remaining_entries = client.get("/entries", params={"customer_id": 2}).json()
    assert any(row["entryId"] == remaining_entry["entryId"] for row in remaining_entries)


def test_entries_validates_customer_id_and_unknown_customer_is_empty(client):
    assert client.get("/entries", params={"customer_id": 0}).status_code == 422
    assert client.get("/entries", params={"customer_id": 9999}).json() == []
