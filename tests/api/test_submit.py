"""Tests for POST /submit and GET /submissions/{id}."""
import pytest

from api.seed import CATEGORIESSEED

FACTOR = {sub: factor for _cat, sub, factor in CATEGORIESSEED}
CATEGORY = {sub: cat for cat, sub, _factor in CATEGORIESSEED}

# a valid request, the same shape the form sends
VALID = {
    "month": "2026-10",
    "customer_id": "2",
    "subcategory_id": ["Bus", "Groceries"],
    "amount": ["10.00", "20.50"],
}


def submit(client, **changes):
    return client.post("/submit", data={**VALID, **changes})


# ---------- valid requests ----------

def test_valid_submission_returns_201(client):
    assert submit(client).status_code == 201


def test_valid_submission_response_structure(client):
    body = submit(client).json()
    assert body["status"] == "saved"
    assert isinstance(body["submissionId"], int)
    assert body["entries"] == 2


def test_each_submission_gets_a_new_id(client):
    first = submit(client).json()["submissionId"]
    second = submit(client).json()["submissionId"]
    assert second == first + 1


def test_customer_id_defaults_to_1(client):
    data = {k: v for k, v in VALID.items() if k != "customer_id"}
    assert client.post("/submit", data=data).status_code == 201


def test_saved_submission_can_be_read_back(client):
    sid = submit(client).json()["submissionId"]

    res = client.get(f"/submissions/{sid}")
    assert res.status_code == 200

    body = res.json()
    assert body["submissionId"] == sid
    assert body["month"] == "2026-10"
    assert body["totalSpend"] == 30.50
    assert [e["subcategory"] for e in body["entries"]] == ["Bus", "Groceries"]
    assert [e["amount"] for e in body["entries"]] == [10.00, 20.50]


def test_category_is_looked_up_from_the_database(client):
    sid = submit(client).json()["submissionId"]
    entries = client.get(f"/submissions/{sid}").json()["entries"]
    for e in entries:
        assert e["category"] == CATEGORY[e["subcategory"]]


def test_carbon_is_amount_times_emission_factor(client):
    sid = submit(client).json()["submissionId"]
    body = client.get(f"/submissions/{sid}").json()

    for e in body["entries"]:
        assert e["carbonKg"] == pytest.approx(e["amount"] * FACTOR[e["subcategory"]], abs=0.01)

    expected_total = 10.00 * FACTOR["Bus"] + 20.50 * FACTOR["Groceries"]
    assert body["totalCarbonKg"] == pytest.approx(expected_total, abs=0.01)


def test_unknown_submission_is_404(client):
    res = client.get("/submissions/9999")
    assert res.status_code == 404
    assert res.json()["detail"] == "Submission not found."


# ---------- notes ----------

def test_notes_are_saved(client):
    sid = submit(client, note=["  commute to work ", ""]).json()["submissionId"]
    notes = [e["note"] for e in client.get(f"/submissions/{sid}").json()["entries"]]
    # trimmed, and blank notes are saved as null
    assert notes == ["commute to work", None]


def test_notes_can_be_left_out(client):
    sid = submit(client).json()["submissionId"]
    notes = [e["note"] for e in client.get(f"/submissions/{sid}").json()["entries"]]
    assert notes == [None, None]


def test_notes_are_stored_as_plain_text(client):
    sid = submit(client, note=["<script>alert(1)</script>", ""]).json()["submissionId"]
    entry = client.get(f"/submissions/{sid}").json()["entries"][0]
    assert entry["note"] == "<script>alert(1)</script>"


# ---------- input validation (should all be 422, nothing saved) ----------

@pytest.mark.parametrize(
    "changes",
    [
        pytest.param({"month": "2026-13"}, id="month 13"),
        pytest.param({"month": "Oct 2026"}, id="month wrong format"),
        pytest.param({"month": ""}, id="month blank"),
        pytest.param({"amount": ["-5", "20"]}, id="negative amount"),
        pytest.param({"amount": ["0", "20"]}, id="zero amount"),
        pytest.param({"amount": ["10.999", "20"]}, id="3 decimal places"),
        pytest.param({"amount": ["1000000001", "20"]}, id="amount over max"),
        pytest.param({"amount": ["abc", "20"]}, id="amount not a number"),
        pytest.param({"amount": ["NaN", "20"]}, id="amount NaN"),
        pytest.param({"amount": ["10"]}, id="fewer amounts than types"),
        pytest.param({"subcategory_id": ["Plane", "Bus"]}, id="unknown subcategory"),
        pytest.param({"subcategory_id": ["Bus' OR '1'='1", "Bus"]}, id="sql injection in subcategory"),
        pytest.param({"customer_id": "999"}, id="unknown persona"),
        pytest.param({"customer_id": "0"}, id="persona 0"),
        pytest.param({"customer_id": "abc"}, id="persona not a number"),
        pytest.param({"note": ["x" * 201, ""]}, id="note over 200 chars"),
        pytest.param({"note": ["only one"]}, id="fewer notes than entries"),
    ],
)
def test_invalid_input_is_rejected(client, changes):
    res = submit(client, **changes)
    assert res.status_code == 422
    assert "detail" in res.json()


def test_missing_fields_are_rejected(client):
    res = client.post("/submit", data={})
    assert res.status_code == 422


def test_more_than_50_entries_is_rejected(client):
    res = submit(client, subcategory_id=["Bus"] * 51, amount=["1"] * 51)
    assert res.status_code == 422


def test_rejected_submission_saves_nothing(client):
    before = submit(client).json()["submissionId"]
    submit(client, subcategory_id=["Bus", "Plane"])  # rejected
    after = submit(client).json()["submissionId"]
    assert after == before + 1


def test_validation_errors_dont_leak_technical_details(client):
    body = submit(client, subcategory_id=["Plane", "Bus"]).text
    assert "Traceback" not in body
    assert "sqlalchemy" not in body.lower()


# ---------- known bugs ----------

@pytest.mark.xfail(strict=True, reason="Known bug: ids too big for SQLite cause a 500 instead of a 422/404")
@pytest.mark.parametrize(
    "request_",
    [
        pytest.param(("post", "/submit", {"customer_id": "99999999999999999999999"}), id="huge customer_id"),
        pytest.param(("get", "/submissions/99999999999999999999999", None), id="huge submission id"),
    ],
)
def test_huge_ids_dont_crash(client, request_):
    method, url, changes = request_
    res = submit(client, **changes) if method == "post" else client.get(url)
    assert res.status_code < 500
