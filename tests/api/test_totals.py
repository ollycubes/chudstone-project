"""Tests for GET /totals (spend and carbon per category)."""
import pytest

from api.seed import CATEGORIESSEED, SPENDSUBMISSIONSSEED

FACTOR = {sub: factor for _cat, sub, factor in CATEGORIESSEED}


def expected_totals(customer_id, month=None):
    totals = {}
    for _sid, cid, m, cat, sub, _notes, amount in SPENDSUBMISSIONSSEED:
        if cid == customer_id and (month is None or m == month):
            spend, carbon = totals.get(cat, (0, 0))
            totals[cat] = (spend + amount, carbon + amount * FACTOR[sub])
    return totals


def test_totals_returns_200(client):
    assert client.get("/totals").status_code == 200


def test_totals_structure(client):
    for row in client.get("/totals").json():
        assert set(row) == {"category", "spend", "carbon"}


def test_totals_add_up_per_category(client):
    # the client fixture is signed in as persona 1
    data = {r["category"]: r for r in client.get("/totals").json()}
    expected = expected_totals(customer_id=1)

    assert set(data) == set(expected)
    for cat, (spend, carbon) in expected.items():
        assert data[cat]["spend"] == pytest.approx(spend, abs=0.01)
        assert data[cat]["carbon"] == pytest.approx(carbon, abs=0.01)


def test_totals_are_sorted_by_carbon_highest_first(client):
    carbons = [r["carbon"] for r in client.get("/totals").json()]
    assert carbons == sorted(carbons, reverse=True)


def test_totals_month_filter(client):
    assert client.get("/totals", params={"month": "2026-10"}).json() != []
    assert client.get("/totals", params={"month": "2020-01"}).json() == []


def test_totals_month_filter_adds_up_per_category(client):
    data = {r["category"]: r for r in client.get("/totals", params={"month": "2026-10"}).json()}
    expected = expected_totals(customer_id=1, month="2026-10")

    assert set(data) == set(expected)
    for cat, (spend, carbon) in expected.items():
        assert data[cat]["spend"] == pytest.approx(spend, abs=0.01)
        assert data[cat]["carbon"] == pytest.approx(carbon, abs=0.01)


def test_totals_follow_the_signed_in_persona(client, sign_in):
    sign_in(2)
    data = {r["category"]: r for r in client.get("/totals").json()}
    expected = expected_totals(customer_id=2)

    assert set(data) == set(expected)
    for cat, (spend, carbon) in expected.items():
        assert data[cat]["spend"] == pytest.approx(spend, abs=0.01)
        assert data[cat]["carbon"] == pytest.approx(carbon, abs=0.01)


def test_totals_ignore_a_customer_id_in_the_url(client):
    # the old ?customer_id= no longer picks whose totals you get
    assert client.get("/totals", params={"customer_id": 2}).json() == client.get("/totals").json()


@pytest.mark.parametrize("params", [{"month": "2026-13"}, {"month": "Oct"}])
def test_totals_rejects_bad_params(client, params):
    assert client.get("/totals", params=params).status_code == 422
