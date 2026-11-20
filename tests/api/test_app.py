"""Checks the API builds and starts."""
import importlib


def test_api_builds():
    # if there's a syntax error or a missing package this import fails
    module = importlib.import_module("api.main")
    assert module.app is not None


def test_api_starts(client):
    # the client fixture starts the app (runs the startup code), so if we get here it started
    res = client.get("/openapi.json")
    assert res.status_code == 200
    assert res.json()["info"]["title"] == "Carbon Footprint & Savings Advisor"


def test_home_redirects_to_form(client):
    res = client.get("/", follow_redirects=False)
    assert res.status_code == 307
    assert res.headers["location"] == "/spending-form/form.html"


def test_form_page_is_served(client):
    res = client.get("/spending-form/form.html")
    assert res.status_code == 200
    assert "Add your monthly spending" in res.text


def test_unknown_route_is_404(client):
    assert client.get("/does-not-exist").status_code == 404
