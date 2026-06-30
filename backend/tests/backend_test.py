"""
CureByMedi Backend Tests (Node.js via FastAPI proxy)
Covers: health, auth, medicines CRUD + role gating, admin endpoints, scan.
"""
import os
import io
import time
import json
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE:
    # fall back to the frontend env file
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE = line.split("=", 1)[1].strip()
BASE = BASE.rstrip("/")

ADMIN_EMAIL = "admin@curebymedi.com"
ADMIN_PASSWORD = "admin123"

# Unique-ish suffix for the per-run regular user
RUN = str(int(time.time()))
USER_EMAIL = f"qa+nodetest{RUN}@curebymedi.com"
USER_PASSWORD = "test1234"


# -------------------- fixtures --------------------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(session):
    r = session.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def user_token(session):
    # signup new; fallback to login if already exists (xdist workers race)
    r = session.post(f"{BASE}/api/auth/signup", json={"email": USER_EMAIL, "password": USER_PASSWORD})
    if r.status_code in (200, 201):
        return r.json()["token"]
    # already registered — log in instead
    rl = session.post(f"{BASE}/api/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD})
    assert rl.status_code == 200, f"signup={r.status_code} {r.text} | login={rl.status_code} {rl.text}"
    return rl.json()["token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# -------------------- health --------------------
class TestHealth:
    def test_health(self, session):
        r = session.get(f"{BASE}/api/health")
        assert r.status_code == 200
        assert r.json().get("ok") is True


# -------------------- auth --------------------
class TestAuth:
    def test_signup_then_duplicate_then_short_password(self, session):
        email = f"qa+dup{RUN}@curebymedi.com"
        r1 = session.post(f"{BASE}/api/auth/signup", json={"email": email, "password": "test1234"})
        assert r1.status_code in (200, 201), r1.text
        d = r1.json()
        assert d.get("user", {}).get("role") == "user"
        assert d.get("token")

        # duplicate
        r2 = session.post(f"{BASE}/api/auth/signup", json={"email": email, "password": "test1234"})
        assert r2.status_code == 400, r2.text

        # short password
        r3 = session.post(f"{BASE}/api/auth/signup", json={"email": f"qa+short{RUN}@curebymedi.com", "password": "abc"})
        assert r3.status_code == 400, r3.text

    def test_login_admin_and_wrong_password(self, session):
        r = session.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["role"] == "admin"
        assert isinstance(d.get("token"), str) and len(d["token"]) > 10

        r2 = session.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong-pw"})
        assert r2.status_code == 401, r2.text

    def test_me_with_and_without_token(self, session, admin_token):
        r = session.get(f"{BASE}/api/auth/me", headers=H(admin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        # API returns flat user object (or wrapped {user:{...}})
        user = body.get("user", body)
        assert user.get("email") == ADMIN_EMAIL

        r2 = requests.get(f"{BASE}/api/auth/me")  # no auth
        assert r2.status_code == 401, r2.text

    def test_logout(self, session, admin_token):
        r = session.post(f"{BASE}/api/auth/logout", headers=H(admin_token))
        assert r.status_code in (200, 204), r.text


# -------------------- medicines --------------------
class TestMedicines:
    def test_list_paginated(self, session):
        r = session.get(f"{BASE}/api/medicines")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("items", "total", "limit", "skip"):
            assert k in d, f"missing {k}"
        assert d["limit"] == 30
        assert isinstance(d["items"], list)
        # Allow some tolerance — claim is "around 253,973"
        assert d["total"] > 100000, f"total too low: {d['total']}"

    def test_search_dolo(self, session):
        r = session.get(f"{BASE}/api/medicines", params={"search": "dolo"})
        assert r.status_code == 200
        d = r.json()
        assert d["total"] > 0
        if d["items"]:
            sample = d["items"][0]
            assert "id" in sample or "_id" in sample

    def test_category_tablets(self, session):
        r = session.get(f"{BASE}/api/medicines", params={"category": "Tablets"})
        assert r.status_code == 200
        d = r.json()
        # might be small if category has no exact matches
        for item in d["items"][:10]:
            assert item.get("category") == "Tablets" or "tablet" in (item.get("category") or "").lower()

    def test_get_single_and_invalid_id(self, session):
        r = session.get(f"{BASE}/api/medicines", params={"limit": 1})
        assert r.status_code == 200
        items = r.json()["items"]
        assert items
        mid = items[0].get("id") or items[0].get("_id")
        assert mid
        r2 = session.get(f"{BASE}/api/medicines/{mid}")
        assert r2.status_code == 200

        r3 = session.get(f"{BASE}/api/medicines/000000000000000000000000")
        assert r3.status_code == 404, r3.text

    def test_crud_roles(self, session, admin_token, user_token):
        payload = {
            "name": f"TEST_med_{RUN}",
            "category": "Tablets",
            "manufacturer": "TestPharma",
            "composition": "Test 100mg",
        }
        # no auth
        r0 = requests.post(f"{BASE}/api/medicines", json=payload)
        assert r0.status_code == 401, r0.text
        # user
        r1 = requests.post(f"{BASE}/api/medicines", json=payload, headers=H(user_token))
        assert r1.status_code == 403, r1.text
        # admin
        r2 = requests.post(f"{BASE}/api/medicines", json=payload, headers=H(admin_token))
        assert r2.status_code in (200, 201), r2.text
        created = r2.json()
        mid = created.get("id") or created.get("_id")
        assert mid

        # PUT user -> 403, admin -> 200
        upd = {"name": f"TEST_med_{RUN}_upd"}
        ru = requests.put(f"{BASE}/api/medicines/{mid}", json=upd, headers=H(user_token))
        assert ru.status_code == 403, ru.text
        ra = requests.put(f"{BASE}/api/medicines/{mid}", json=upd, headers=H(admin_token))
        assert ra.status_code == 200, ra.text
        # verify persistence
        r_get = session.get(f"{BASE}/api/medicines/{mid}")
        assert r_get.status_code == 200
        assert r_get.json().get("name") == f"TEST_med_{RUN}_upd"

        # DELETE user -> 403, admin -> 200
        rdu = requests.delete(f"{BASE}/api/medicines/{mid}", headers=H(user_token))
        assert rdu.status_code == 403
        rda = requests.delete(f"{BASE}/api/medicines/{mid}", headers=H(admin_token))
        assert rda.status_code in (200, 204)
        # verify gone
        r_g2 = session.get(f"{BASE}/api/medicines/{mid}")
        assert r_g2.status_code == 404


# -------------------- admin --------------------
class TestAdmin:
    def test_stats(self, admin_token, user_token):
        r0 = requests.get(f"{BASE}/api/admin/stats")
        assert r0.status_code == 401
        r1 = requests.get(f"{BASE}/api/admin/stats", headers=H(user_token))
        assert r1.status_code == 403
        r2 = requests.get(f"{BASE}/api/admin/stats", headers=H(admin_token))
        assert r2.status_code == 200, r2.text
        d = r2.json()
        for k in ("totalMedicines", "totalUsers", "totalAdmins", "scansTotal", "scansToday", "byCategory"):
            assert k in d, f"missing key {k}"
        assert d["totalMedicines"] > 100000

    def test_users_list_and_role_and_delete(self, admin_token, user_token):
        # forbidden for normal user
        rf = requests.get(f"{BASE}/api/admin/users", headers=H(user_token))
        assert rf.status_code == 403
        # admin
        r = requests.get(f"{BASE}/api/admin/users", headers=H(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d
        assert "total" in d

        # Create a throwaway user to promote/demote/delete
        throw_email = f"qa+throw{RUN}@curebymedi.com"
        rs = requests.post(f"{BASE}/api/auth/signup", json={"email": throw_email, "password": "test1234"})
        assert rs.status_code in (200, 201), rs.text
        # find id
        r2 = requests.get(f"{BASE}/api/admin/users", params={"search": throw_email}, headers=H(admin_token))
        assert r2.status_code == 200
        items = r2.json()["items"]
        assert items, "throwaway user not found"
        uid = items[0].get("id") or items[0].get("_id")
        assert uid

        # promote
        rp = requests.post(f"{BASE}/api/admin/users/{uid}/role", json={"role": "admin"}, headers=H(admin_token))
        assert rp.status_code == 200, rp.text
        # demote
        rd = requests.post(f"{BASE}/api/admin/users/{uid}/role", json={"role": "user"}, headers=H(admin_token))
        assert rd.status_code == 200, rd.text
        # delete
        rdel = requests.delete(f"{BASE}/api/admin/users/{uid}", headers=H(admin_token))
        assert rdel.status_code in (200, 204), rdel.text

    def test_scans_list(self, admin_token, user_token):
        rf = requests.get(f"{BASE}/api/admin/scans", headers=H(user_token))
        assert rf.status_code == 403
        r = requests.get(f"{BASE}/api/admin/scans", headers=H(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d

    def test_bulk_import(self, admin_token, user_token):
        items = [
            {"name": f"TEST_bulk_{RUN}_a", "category": "Tablets", "manufacturer": "BulkCo", "composition": "A"},
            {"name": f"TEST_bulk_{RUN}_b", "category": "Tablets", "manufacturer": "BulkCo", "composition": "B"},
        ]
        rf = requests.post(f"{BASE}/api/admin/medicines/bulk", json={"items": items}, headers=H(user_token))
        assert rf.status_code == 403
        r = requests.post(f"{BASE}/api/admin/medicines/bulk", json={"items": items}, headers=H(admin_token))
        assert r.status_code in (200, 201), r.text


# -------------------- scan --------------------
class TestScan:
    def _tiny_jpeg(self) -> bytes:
        # Generate a real, decodable JPEG using PIL (the LLM may respond UNKNOWN — that is fine).
        from PIL import Image
        import io as _io
        buf = _io.BytesIO()
        Image.new("RGB", (64, 64), "white").save(buf, "JPEG", quality=80)
        return buf.getvalue()

    def test_scan_no_auth(self):
        files = {"image": ("t.jpg", self._tiny_jpeg(), "image/jpeg")}
        r = requests.post(f"{BASE}/api/scan", files=files)
        assert r.status_code == 401, r.text

    def test_scan_invalid_mime(self, user_token):
        files = {"image": ("t.txt", b"hello", "text/plain")}
        r = requests.post(f"{BASE}/api/scan", files=files, headers=H(user_token))
        assert r.status_code == 400, r.text

    def test_scan_contract(self, user_token):
        files = {"image": ("t.jpg", self._tiny_jpeg(), "image/jpeg")}
        r = requests.post(f"{BASE}/api/scan", files=files, headers=H(user_token), timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "scanId" in d
        assert "detected" in d and "name" in d["detected"] and "summary" in d["detected"]
        assert "matched" in d  # may be None
