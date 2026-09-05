"""
Iteration 6 backend tests for VoucherKu:
- Vouchers created as 'draft', printed=False
- Redeem draft -> 400 'belum dicetak / belum aktif'
- POST /api/vouchers/mark-printed activates drafts, increments print_count
- kasir cannot call mark-printed (403)
- GET /api/vouchers?status=draft lists only drafts
- GET /api/stats includes 'draft'
"""
import os
import re
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            m = re.match(r"REACT_APP_BACKEND_URL=(.+)", line.strip())
            if m:
                BASE_URL = m.group(1).rstrip("/")

ADMIN_EMAIL = "avraaaax51@gmail.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def kasir_session(admin_session):
    email = "TEST_kasir_draft@example.com"
    pwd = "kasir123"
    # cleanup preexisting
    users = admin_session.get(f"{BASE_URL}/api/users").json()
    for u in users:
        if u["email"] == email:
            admin_session.delete(f"{BASE_URL}/api/users/{u['_id']}")
    r = admin_session.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": pwd, "name": "TEST Kasir Draft", "role": "kasir", "pin": "8765"
    })
    assert r.status_code == 200, r.text
    uid = r.json()["_id"]
    ks = requests.Session()
    lr = ks.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd})
    assert lr.status_code == 200
    yield ks
    admin_session.delete(f"{BASE_URL}/api/users/{uid}")


def _create_voucher(session, prefix, days=30):
    exp = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    r = session.post(f"{BASE_URL}/api/vouchers", json={
        "title": f"TEST_draft_{prefix}", "nominal": 15000, "terms": "",
        "expires_at": exp, "quantity": 1, "prefix": prefix,
    })
    assert r.status_code == 200, r.text
    return r.json()["vouchers"][0]


class TestDraftLifecycle:
    def test_create_voucher_is_draft_and_unprinted(self, admin_session):
        v = _create_voucher(admin_session, "DA")
        assert v["status"] == "draft"
        assert v["printed"] is False

    def test_redeem_draft_returns_400_with_message(self, admin_session):
        v = _create_voucher(admin_session, "DB")
        r = admin_session.post(f"{BASE_URL}/api/vouchers/redeem", json={"code": v["code"]})
        assert r.status_code == 400
        assert "belum dicetak" in r.json().get("detail", "").lower() or \
               "belum aktif" in r.json().get("detail", "").lower()

    def test_mark_printed_activates_draft(self, admin_session):
        v = _create_voucher(admin_session, "DC")
        r = admin_session.post(f"{BASE_URL}/api/vouchers/mark-printed", json={"codes": [v["code"]]})
        assert r.status_code == 200
        body = r.json()
        assert body["activated"] == 1

        # verify via GET /api/vouchers
        got = admin_session.get(f"{BASE_URL}/api/vouchers?limit=200").json()
        found = next((x for x in got["vouchers"] if x["code"] == v["code"]), None)
        assert found is not None
        assert found["status"] == "active"
        assert found["printed"] is True
        assert found.get("printed_at") is not None
        assert found.get("print_count") == 1

    def test_redeem_after_mark_printed_succeeds(self, admin_session):
        v = _create_voucher(admin_session, "DD")
        r = admin_session.post(f"{BASE_URL}/api/vouchers/mark-printed", json={"codes": [v["code"]]})
        assert r.status_code == 200
        rr = admin_session.post(f"{BASE_URL}/api/vouchers/redeem", json={"code": v["code"]})
        assert rr.status_code == 200
        assert rr.json()["success"] is True

    def test_mark_printed_again_increments_print_count_no_status_change(self, admin_session):
        v = _create_voucher(admin_session, "DE")
        admin_session.post(f"{BASE_URL}/api/vouchers/mark-printed", json={"codes": [v["code"]]})
        # second print
        r2 = admin_session.post(f"{BASE_URL}/api/vouchers/mark-printed", json={"codes": [v["code"]]})
        assert r2.status_code == 200
        # activated count should be 0 second time
        assert r2.json()["activated"] == 0

        got = admin_session.get(f"{BASE_URL}/api/vouchers?limit=200").json()
        found = next((x for x in got["vouchers"] if x["code"] == v["code"]), None)
        assert found["status"] == "active"
        assert found.get("print_count") == 2

    def test_kasir_cannot_mark_printed(self, admin_session, kasir_session):
        v = _create_voucher(admin_session, "DF")
        r = kasir_session.post(f"{BASE_URL}/api/vouchers/mark-printed", json={"codes": [v["code"]]})
        assert r.status_code == 403


class TestDraftListingAndStats:
    def test_list_status_draft(self, admin_session):
        # ensure at least one draft exists
        v = _create_voucher(admin_session, "DG")
        r = admin_session.get(f"{BASE_URL}/api/vouchers?status=draft&limit=200")
        assert r.status_code == 200
        vs = r.json()["vouchers"]
        assert len(vs) >= 1
        for x in vs:
            assert x["status"] == "draft"
        assert any(x["code"] == v["code"] for x in vs)

    def test_stats_includes_draft(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/stats")
        assert r.status_code == 200
        s = r.json()
        assert "draft" in s
        assert isinstance(s["draft"], int)
        assert s["draft"] >= 0
