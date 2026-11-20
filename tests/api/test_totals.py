"""Tests for GET /totals (spend and carbon per category)."""
import pytest

from api.seed import CATEGORIESSEED, SENDSUBMISSIONSSEED

FACTOR = {sub: factor for _cat, sub, factor in CATEGORIESSEED}


def expected_totals(customer_id, month=None):
    totals = {}
    for _sid, cid, m, cat, sub, _notes, amount in SENDSUBMISSIONSSEED:
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
    # /totals is always for customer 1 at the moment (see backlog)
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
