"""Tests for GET /categories and GET /personas."""
from api.seed import CATEGORIESSEED, CUSTOMERSSEED


def test_categories_returns_200(client):
    assert client.get("/categories").status_code == 200


def test_categories_match_the_database(client):
    data = client.get("/categories").json()

    expected = {}
    for cat, sub, _factor in CATEGORIESSEED:
        expected.setdefault(cat, []).append(sub)

    assert set(data) == set(expected)
    for cat, subs in expected.items():
        assert sorted(data[cat]) == sorted(subs)


def test_categories_cover_travel_food_and_utilities(client):
    data = client.get("/categories").json()
    assert {"Travel", "Food", "Utilities"} <= set(data)


def test_personas_returns_200(client):
    assert client.get("/personas").status_code == 200


def test_personas_match_the_database(client):
    data = client.get("/personas").json()
    assert data == [{"customerId": cid, "persona": name} for cid, name in CUSTOMERSSEED]
