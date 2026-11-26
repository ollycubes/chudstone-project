"""Tests for persona sessions: the server decides whose data you see, not the URL or form.

Covers the IDOR (insecure direct object reference) fix: changing an id in a request
must not let one persona read, edit or delete another persona's spending.
"""
import pytest

SUBMISSION = {"month": "2026-10", "subcategory_id": ["Bus"], "amount": ["10.00"]}


def entry_of(client, submission_id):
    return next(e for e in client.get("/entries").json() if e["submissionId"] == submission_id)


@pytest.fixture
def persona_2_entry(client, sign_in):
    # persona 2 saves a submission, then the client switches to persona 3 (the "attacker")
    sign_in(2)
    sid = client.post("/submit", data=SUBMISSION).json()["submissionId"]
    entry = entry_of(client, sid)
    sign_in(3)
    return sid, entry


# ---------- picking a persona ----------

def test_session_starts_as_the_picked_persona(client, sign_in):
    assert sign_in(4) == {"customerId": 4, "persona": "Student"}
    assert client.get("/session").json() == {"customerId": 4, "persona": "Student"}


@pytest.mark.parametrize("customer_id", ["999", "0", "abc", "99999999999999999999999"])
def test_unknown_persona_is_rejected(client, customer_id):
    res = client.post("/session", data={"customer_id": customer_id})
    assert res.status_code == 422
    assert client.get("/session").json()["customerId"] == 1  # still signed in as before


def test_sign_out(client):
    assert client.delete("/session").status_code == 200
    assert client.get("/session").status_code == 401


# ---------- no session ----------

@pytest.mark.parametrize(
    "method, url, data",
    [
        ("get", "/session", None),
        ("get", "/entries", None),
        ("get", "/totals", None),
        ("get", "/submissions/1", None),
        ("post", "/submit", SUBMISSION),
        ("put", "/entries/1", {"subcategory": "Bus", "amount": "1"}),
        ("delete", "/entries/1", None),
    ],
)
def test_no_session_is_401(anon_client, method, url, data):
    kwargs = {"data": data} if data else {}
    assert getattr(anon_client, method)(url, **kwargs).status_code == 401


def test_tampered_cookie_is_401(anon_client):
    anon_client.cookies.set("chudstone_session", "eyJjdXN0b21lcl9pZCI6IDJ9.forged.signature")
    assert anon_client.get("/entries").status_code == 401


# ---------- one persona can't touch another's data ----------

def test_entries_only_show_the_signed_in_persona(client, persona_2_entry):
    sid, _ = persona_2_entry
    assert all(e["submissionId"] != sid for e in client.get("/entries").json())


def test_url_customer_id_is_ignored(client, persona_2_entry):
    sid, _ = persona_2_entry
    ids = {e["submissionId"] for e in client.get("/entries", params={"customer_id": 2}).json()}
    assert sid not in ids


def test_cant_read_another_personas_submission(client, persona_2_entry):
    sid, _ = persona_2_entry
    assert client.get(f"/submissions/{sid}").status_code == 404


def test_cant_edit_another_personas_entry(client, sign_in, persona_2_entry):
    sid, entry = persona_2_entry
    res = client.put(f"/entries/{entry['entryId']}", data={"subcategory": "Airplane", "amount": "999"})
    assert res.status_code == 404
    sign_in(2)
    assert entry_of(client, sid) == entry  # unchanged


def test_cant_delete_another_personas_entry(client, sign_in, persona_2_entry):
    sid, entry = persona_2_entry
    assert client.delete(f"/entries/{entry['entryId']}").status_code == 404
    sign_in(2)
    assert entry_of(client, sid) == entry  # still there


def test_owner_can_still_edit_and_delete(client, sign_in, persona_2_entry):
    sid, entry = persona_2_entry
    sign_in(2)
    res = client.put(f"/entries/{entry['entryId']}", data={"subcategory": "Train", "amount": "5"})
    assert res.status_code == 200 and res.json()["subcategory"] == "Train"
    assert client.delete(f"/entries/{entry['entryId']}").status_code == 200
    assert client.get(f"/submissions/{sid}").status_code == 404
