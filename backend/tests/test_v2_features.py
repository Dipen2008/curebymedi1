"""
CureByMedi v2 backend tests:
  - User-scoped /api/me/* (favorites, recents, reminders)
  - AI: /api/ai/interactions, /api/ai/suggest
  - Auth additions: change-password, set-language, delete me, forgot/reset password
  - Medicines slug lookups: GET /api/medicines/by-slug/:slug and slug in /:id
"""
import os
import re
import time
import pytest
import requests
from pathlib import Path

BASE = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip()
BASE = BASE.rstrip("/")

ADMIN_EMAIL = "admin@curebymedi.com"
ADMIN_PASSWORD = "admin123"
RUN = str(int(time.time()))

def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def user_creds():
    """Create a per-module isolated regular user."""
    email = f"qa+v2u{RUN}@curebymedi.com"
    pwd = "test1234"
    r = requests.post(f"{BASE}/api/auth/signup", json={"email": email, "password": pwd})
    if r.status_code in (200, 201):
        token = r.json()["token"]
    else:
        rl = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pwd})
        assert rl.status_code == 200, rl.text
        token = rl.json()["token"]
    return {"email": email, "password": pwd, "token": token}


@pytest.fixture(scope="module")
def sample_medicine_ids():
    r = requests.get(f"{BASE}/api/medicines", params={"limit": 5})
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) >= 2, "need at least 2 medicines seeded"
    return [it.get("id") or it.get("_id") for it in items]


# ---------------- /api/me/favorites ----------------
class TestFavorites:
    def test_unauth(self):
        r = requests.get(f"{BASE}/api/me/favorites")
        assert r.status_code == 401

    def test_empty_then_add_then_duplicate_then_delete(self, user_creds, sample_medicine_ids):
        tok = user_creds["token"]
        # empty
        r = requests.get(f"{BASE}/api/me/favorites", headers=H(tok))
        assert r.status_code == 200, r.text
        assert isinstance(r.json().get("items"), list)

        mid = sample_medicine_ids[0]
        # add
        r1 = requests.post(f"{BASE}/api/me/favorites/{mid}", headers=H(tok))
        assert r1.status_code == 200, r1.text
        c1 = r1.json().get("count")
        assert c1 >= 1

        # duplicate add (no double count)
        r2 = requests.post(f"{BASE}/api/me/favorites/{mid}", headers=H(tok))
        assert r2.status_code == 200, r2.text
        assert r2.json().get("count") == c1, "Duplicate add should not increment count"

        # listed
        rl = requests.get(f"{BASE}/api/me/favorites", headers=H(tok))
        items = rl.json()["items"]
        assert any(it["id"] == mid for it in items)

        # delete
        rd = requests.delete(f"{BASE}/api/me/favorites/{mid}", headers=H(tok))
        assert rd.status_code == 200, rd.text
        assert rd.json().get("count") == c1 - 1


# ---------------- /api/me/recents ----------------
class TestRecents:
    def test_unauth(self):
        r = requests.get(f"{BASE}/api/me/recents")
        assert r.status_code == 401

    def test_record_and_cap(self, user_creds, sample_medicine_ids):
        tok = user_creds["token"]
        # use up to 3 ids
        ids = sample_medicine_ids[:3]
        for mid in ids:
            r = requests.post(f"{BASE}/api/me/recents/{mid}", headers=H(tok))
            assert r.status_code == 200, r.text
        # re-view first one — should move it to the front, still <= 12
        r = requests.post(f"{BASE}/api/me/recents/{ids[0]}", headers=H(tok))
        assert r.status_code == 200
        assert r.json()["count"] <= 12

        rl = requests.get(f"{BASE}/api/me/recents", headers=H(tok))
        assert rl.status_code == 200
        items = rl.json()["items"]
        assert items
        assert items[0]["id"] == ids[0], "Most recent should be first"


# ---------------- /api/me/reminders ----------------
class TestReminders:
    def test_full_flow(self, user_creds):
        tok = user_creds["token"]
        # missing times -> 400
        r0 = requests.post(f"{BASE}/api/me/reminders", json={"name": "X", "times": []}, headers=H(tok))
        assert r0.status_code == 400

        # bad time format -> 400
        rb = requests.post(f"{BASE}/api/me/reminders", json={"name": "X", "times": ["nope"]}, headers=H(tok))
        assert rb.status_code == 400

        # create
        payload = {"name": f"TEST_rem_{RUN}", "times": ["08:00", "20:00"], "notes": "after food"}
        r1 = requests.post(f"{BASE}/api/me/reminders", json=payload, headers=H(tok))
        assert r1.status_code == 200, r1.text
        items = r1.json()["items"]
        assert any(it["name"] == payload["name"] for it in items)
        rem = [it for it in items if it["name"] == payload["name"]][-1]
        rid = rem.get("_id") or rem.get("id")
        assert rid
        assert rem["times"] == ["08:00", "20:00"]
        assert rem.get("active") is True

        # list
        rl = requests.get(f"{BASE}/api/me/reminders", headers=H(tok))
        assert rl.status_code == 200
        assert any((it.get("_id") or it.get("id")) == rid for it in rl.json()["items"])

        # patch toggle active
        rp = requests.patch(f"{BASE}/api/me/reminders/{rid}", json={"active": False}, headers=H(tok))
        assert rp.status_code == 200, rp.text
        rem2 = [it for it in rp.json()["items"] if (it.get("_id") or it.get("id")) == rid][0]
        assert rem2["active"] is False

        # delete
        rd = requests.delete(f"{BASE}/api/me/reminders/{rid}", headers=H(tok))
        assert rd.status_code == 200, rd.text
        assert not any((it.get("_id") or it.get("id")) == rid for it in rd.json()["items"])


# ---------------- /api/ai/interactions ----------------
class TestInteractionsAI:
    def test_unauth(self):
        r = requests.post(f"{BASE}/api/ai/interactions", json={"medicineNames": ["A", "B"]})
        assert r.status_code == 401

    def test_too_few(self, user_creds):
        r = requests.post(f"{BASE}/api/ai/interactions", json={"medicineNames": ["A"]}, headers=H(user_creds["token"]))
        assert r.status_code == 400

    def test_too_many(self, user_creds):
        r = requests.post(f"{BASE}/api/ai/interactions",
                          json={"medicineNames": ["a","b","c","d","e","f","g"]},
                          headers=H(user_creds["token"]))
        assert r.status_code == 400

    def test_contract(self, user_creds):
        r = requests.post(f"{BASE}/api/ai/interactions",
                          json={"medicineNames": ["Paracetamol", "Ibuprofen", "Cetirizine"]},
                          headers=H(user_creds["token"]),
                          timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("riskLevel") in ("safe", "caution", "avoid"), f"riskLevel={d.get('riskLevel')}"
        assert "summary" in d
        assert "pairs" in d and isinstance(d["pairs"], list)
        if d["pairs"]:
            p = d["pairs"][0]
            for k in ("a", "b", "level", "explanation"):
                assert k in p, f"missing pair key {k}"
        assert "advice" in d


# ---------------- /api/ai/suggest ----------------
class TestSuggestAI:
    def test_unauth(self):
        r = requests.post(f"{BASE}/api/ai/suggest", json={"symptoms": "headache and fever"})
        assert r.status_code == 401

    def test_too_short(self, user_creds):
        r = requests.post(f"{BASE}/api/ai/suggest", json={"symptoms": "a"}, headers=H(user_creds["token"]))
        assert r.status_code == 400
        r2 = requests.post(f"{BASE}/api/ai/suggest", json={"symptoms": ""}, headers=H(user_creds["token"]))
        assert r2.status_code == 400

    def test_contract(self, user_creds):
        r = requests.post(f"{BASE}/api/ai/suggest",
                          json={"symptoms": "headache and fever"},
                          headers=H(user_creds["token"]),
                          timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "disclaimer" in d
        assert "suggestions" in d and isinstance(d["suggestions"], list)
        assert "redFlags" in d
        if d["suggestions"]:
            s = d["suggestions"][0]
            for k in ("name", "composition", "reason", "dosage"):
                assert k in s, f"missing suggestion key {k}"


# ---------------- /api/auth additions ----------------
class TestAuthAdditions:
    def test_change_password(self):
        # Make a throwaway user
        email = f"qa+chpw{RUN}@curebymedi.com"
        pwd = "test1234"
        r = requests.post(f"{BASE}/api/auth/signup", json={"email": email, "password": pwd})
        assert r.status_code in (200, 201), r.text
        tok = r.json()["token"]

        # wrong old
        r1 = requests.post(f"{BASE}/api/auth/change-password",
                           json={"oldPassword": "WRONG", "newPassword": "newpass1"},
                           headers=H(tok))
        assert r1.status_code == 401, r1.text

        # short new
        r2 = requests.post(f"{BASE}/api/auth/change-password",
                           json={"oldPassword": pwd, "newPassword": "abc"},
                           headers=H(tok))
        assert r2.status_code == 400, r2.text

        # success
        r3 = requests.post(f"{BASE}/api/auth/change-password",
                           json={"oldPassword": pwd, "newPassword": "newpass1"},
                           headers=H(tok))
        assert r3.status_code == 200, r3.text

        # verify login with new password
        rl = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": "newpass1"})
        assert rl.status_code == 200, rl.text

    def test_set_language(self, user_creds):
        tok = user_creds["token"]
        r1 = requests.post(f"{BASE}/api/auth/set-language", json={"language": "hi"}, headers=H(tok))
        assert r1.status_code == 200, r1.text
        assert r1.json().get("language") == "hi"

        r2 = requests.post(f"{BASE}/api/auth/set-language", json={"language": "en"}, headers=H(tok))
        assert r2.status_code == 200
        assert r2.json().get("language") == "en"

        # persistence via /me
        rm = requests.get(f"{BASE}/api/auth/me", headers=H(tok))
        assert rm.status_code == 200
        user = rm.json().get("user", rm.json())
        assert user.get("language") == "en"

    def test_admin_cannot_self_delete(self, admin_token):
        r = requests.delete(f"{BASE}/api/auth/me", headers=H(admin_token))
        assert r.status_code == 400, r.text

    def test_user_delete_me(self):
        email = f"qa+del{RUN}@curebymedi.com"
        r = requests.post(f"{BASE}/api/auth/signup", json={"email": email, "password": "test1234"})
        assert r.status_code in (200, 201), r.text
        tok = r.json()["token"]
        rd = requests.delete(f"{BASE}/api/auth/me", headers=H(tok))
        assert rd.status_code == 200, rd.text
        # login should now fail
        rl = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": "test1234"})
        assert rl.status_code == 401, rl.text

    def test_forgot_and_reset_password(self):
        # Use a fresh user
        email = f"qa+rst{RUN}@curebymedi.com"
        pwd = "test1234"
        r = requests.post(f"{BASE}/api/auth/signup", json={"email": email, "password": pwd})
        assert r.status_code in (200, 201)

        # forgot for unknown — still 200, no token
        r0 = requests.post(f"{BASE}/api/auth/forgot-password", json={"email": "nobody@nowhere.invalid"})
        assert r0.status_code == 200, r0.text
        assert r0.json().get("token") in (None, "")

        # forgot for real — returns token + resetUrl (mocked email)
        r1 = requests.post(f"{BASE}/api/auth/forgot-password", json={"email": email})
        assert r1.status_code == 200, r1.text
        d = r1.json()
        token = d.get("token")
        assert token and isinstance(token, str), f"missing token: {d}"
        assert d.get("resetUrl", "").endswith(token)

        # invalid token
        rbad = requests.post(f"{BASE}/api/auth/reset-password",
                             json={"token": "nope-not-real", "newPassword": "brandnew1"})
        assert rbad.status_code == 400, rbad.text

        # valid reset
        rok = requests.post(f"{BASE}/api/auth/reset-password",
                            json={"token": token, "newPassword": "brandnew1"})
        assert rok.status_code == 200, rok.text

        # login with new password works
        rl = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": "brandnew1"})
        assert rl.status_code == 200, rl.text


# ---------------- medicines slug ----------------
class TestMedicineSlug:
    def test_get_by_id_returns_slug(self, sample_medicine_ids):
        mid = sample_medicine_ids[0]
        r = requests.get(f"{BASE}/api/medicines/{mid}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "slug" in d
        assert d["slug"], f"slug empty for {d.get('name')}"
        # slug pattern
        assert re.match(r"^[a-z0-9\-]+$", d["slug"]), f"unexpected slug: {d['slug']}"

    def test_by_slug_lookup_roundtrip(self, sample_medicine_ids):
        mid = sample_medicine_ids[0]
        d = requests.get(f"{BASE}/api/medicines/{mid}").json()
        slug = d["slug"]
        r = requests.get(f"{BASE}/api/medicines/by-slug/{slug}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["id"] == mid
        assert body["slug"] == slug

    def test_by_slug_404(self):
        r = requests.get(f"{BASE}/api/medicines/by-slug/this-slug-does-not-exist-xyz-12345")
        assert r.status_code == 404, r.text
