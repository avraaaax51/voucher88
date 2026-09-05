"""Iteration 8: Bulk delete & my_redemptions_today.

Covers:
- POST /api/vouchers/bulk-delete: admin deletes given ids, ignores invalid ids; kasir gets 403.
- GET /api/redemptions/mine: returns today's redemptions for the current user; empty for other users; 401 unauthenticated.
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://promo-redemption-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_NAME = "Admin"
ADMIN_PW = "123456"


def _login(name, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"name": name, "password": pw}, timeout=15)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_NAME, ADMIN_PW)


@pytest.fixture(scope="module")
def kasir(admin):
    # Create a temporary kasir user
    uname = f"TESTKasir{uuid.uuid4().hex[:6]}"
    pw = "654321"
    r = admin.post(f"{API}/auth/register", json={"name": uname, "password": pw, "role": "kasir"})
    assert r.status_code == 200, r.text
    uid = r.json()["_id"]
    s = _login(uname, pw)
    yield {"session": s, "id": uid, "name": uname}
    # Cleanup
    admin.delete(f"{API}/users/{uid}")


def _create_voucher(admin, qty=1, prefix="TST"):
    exp = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    r = admin.post(
        f"{API}/vouchers",
        json={"title": "Test Bulk", "nominal": 10000, "terms": "t", "expires_at": exp, "quantity": qty, "prefix": prefix},
    )
    assert r.status_code == 200, r.text
    return r.json()["vouchers"]


class TestBulkDelete:
    def test_bulk_delete_admin_ok(self, admin):
        vs = _create_voucher(admin, qty=3, prefix="BD")
        codes = [v["code"] for v in vs]
        # Fetch to get ids (create endpoint may not return _id)
        r = admin.get(f"{API}/vouchers")
        assert r.status_code == 200
        all_v = r.json()["vouchers"]
        ids = [v["_id"] for v in all_v if v["code"] in codes]
        assert len(ids) == 3
        # Include one bogus id (valid ObjectId format)
        bogus = "507f1f77bcf86cd799439011"
        payload_ids = ids + [bogus, "not-an-oid"]
        r = admin.post(f"{API}/vouchers/bulk-delete", json={"ids": payload_ids})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["deleted"] == 3
        # Verify removed
        r2 = admin.get(f"{API}/vouchers")
        remaining_codes = [v["code"] for v in r2.json()["vouchers"]]
        for c in codes:
            assert c not in remaining_codes

    def test_bulk_delete_kasir_forbidden(self, admin, kasir):
        vs = _create_voucher(admin, qty=1, prefix="KF")
        r = admin.get(f"{API}/vouchers")
        ids = [v["_id"] for v in r.json()["vouchers"] if v["code"] == vs[0]["code"]]
        r = kasir["session"].post(f"{API}/vouchers/bulk-delete", json={"ids": ids})
        assert r.status_code == 403
        # cleanup
        admin.post(f"{API}/vouchers/bulk-delete", json={"ids": ids})

    def test_bulk_delete_unauth(self):
        r = requests.post(f"{API}/vouchers/bulk-delete", json={"ids": []})
        assert r.status_code == 401


class TestMyRedemptions:
    def test_unauth_401(self):
        r = requests.get(f"{API}/redemptions/mine")
        assert r.status_code == 401

    def test_mine_reflects_own_redemption(self, admin, kasir):
        # Create + activate + redeem 1 voucher as admin
        vs = _create_voucher(admin, qty=1, prefix="MR")
        code = vs[0]["code"]
        r = admin.post(f"{API}/vouchers/mark-printed", json={"codes": [code]})
        assert r.status_code == 200
        # Snapshot mine before
        r_before = admin.get(f"{API}/redemptions/mine")
        assert r_before.status_code == 200
        before = r_before.json()
        # Redeem
        r = admin.post(f"{API}/vouchers/redeem", json={"code": code})
        assert r.status_code == 200, r.text
        nominal = r.json()["voucher"]["nominal"]
        # After
        r_after = admin.get(f"{API}/redemptions/mine")
        assert r_after.status_code == 200
        after = r_after.json()
        assert after["count"] == before["count"] + 1
        assert after["total_nominal"] == before["total_nominal"] + nominal
        codes = [i["voucher_code"] for i in after["items"]]
        assert code in codes

        # Kasir's /mine should NOT include this admin-redeemed code
        r_kasir = kasir["session"].get(f"{API}/redemptions/mine")
        assert r_kasir.status_code == 200
        k_codes = [i["voucher_code"] for i in r_kasir.json()["items"]]
        assert code not in k_codes
