"""Iteration 21 - Voucher owner_name field & download-image endpoint verification.

Covers review points 1, 3, 6:
  1. POST /api/vouchers accepts owner_name and persists+returns it (also backward-compat when omitted).
  3. Mark printed + redeem snapshots owner_name into redemption_logs and
     GET /api/reports/daily returns it in redemptions without ObjectId leakage.
  6. Legacy redemption_logs without owner_name render as "-".
"""
import os
import time
import json
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
SUPER_NAME = os.environ["V88_TEST_SUPER_NAME"]
SUPER_PASS = os.environ["V88_TEST_SUPER_PASSWORD"]


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"name": SUPER_NAME, "password": SUPER_PASS}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Cannot login temp admin: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def created_ids():
    """Track voucher ids created by this test module for teardown."""
    return {"voucher_ids": [], "redemption_voucher_ids": []}


def _create_voucher(session, owner_name=None, title="TEST_OwnerNameVoucher", prefix="TON"):
    body = {
        "title": title,
        "nominal": 12345,
        "terms": "TEST",
        "expires_at": "2099-12-31T23:59:59+00:00",
        "quantity": 1,
        "prefix": prefix,
    }
    if owner_name is not None:
        body["owner_name"] = owner_name
    r = session.post(f"{BASE_URL}/api/vouchers", json=body, timeout=30)
    assert r.status_code == 200, r.text
    v = r.json()["vouchers"][0]
    return v


# --- 1. Backend accepts + persists owner_name; backward compatible when omitted ---
class TestCreateWithOwnerName:
    def test_create_persists_owner_name(self, admin_session, created_ids):
        v = _create_voucher(admin_session, owner_name="Budi Santoso")
        assert v["owner_name"] == "Budi Santoso"
        # Verify persistence via GET
        r = admin_session.get(f"{BASE_URL}/api/vouchers/{v['_id']}", timeout=30)
        assert r.status_code == 200
        fetched = r.json()
        assert fetched["owner_name"] == "Budi Santoso"
        # No ObjectId leakage
        assert "$oid" not in json.dumps(fetched)
        assert isinstance(fetched["_id"], str)
        created_ids["voucher_ids"].append(v["_id"])

    def test_create_backward_compat_no_owner_name(self, admin_session, created_ids):
        v = _create_voucher(admin_session, owner_name=None, prefix="TOB")
        # Default is empty string in Pydantic model
        assert v.get("owner_name", "") == ""
        created_ids["voucher_ids"].append(v["_id"])

    def test_create_empty_owner_name_ok(self, admin_session, created_ids):
        v = _create_voucher(admin_session, owner_name="", prefix="TOE")
        assert v.get("owner_name") == ""
        created_ids["voucher_ids"].append(v["_id"])


# --- 3. Mark printed + redeem records owner_name; reports/daily returns it ---
class TestRedeemAndReport:
    def test_mark_printed_redeem_and_report_snapshot(self, admin_session, created_ids):
        owner = "Siti Test Owner"
        v = _create_voucher(admin_session, owner_name=owner, prefix="TOR")
        code = v["code"]
        created_ids["voucher_ids"].append(v["_id"])
        created_ids["redemption_voucher_ids"].append(v["_id"])

        # Mark printed (activates draft)
        r = admin_session.post(f"{BASE_URL}/api/vouchers/mark-printed", json={"codes": [code]}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["activated"] >= 1

        # Redeem
        r = admin_session.post(f"{BASE_URL}/api/vouchers/redeem", json={"code": code}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["voucher"]["status"] == "redeemed"

        # Reports/daily returns owner_name, safely serialized
        r = admin_session.get(f"{BASE_URL}/api/reports/daily", timeout=30)
        assert r.status_code == 200
        raw = r.text
        assert "$oid" not in raw, "ObjectId leaked into report"
        data = r.json()
        assert "redemptions" in data
        match = [x for x in data["redemptions"] if x["voucher_code"] == code]
        assert len(match) == 1, f"Redemption for {code} not found"
        assert match[0]["owner_name"] == owner
        assert "_id" not in match[0]

    def test_report_legacy_missing_owner_name_renders_dash(self, admin_session):
        """Simulate a legacy redemption doc without owner_name via mongo direct insert.

        This uses PyMongo to insert a synthetic legacy log then verifies the API
        renders '-'. We clean it up at the end.
        """
        try:
            from pymongo import MongoClient
        except ImportError:
            pytest.skip("pymongo not available")
        from datetime import datetime, timezone
        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")
        mongo_url = env["MONGO_URL"]
        db_name = env["DB_NAME"]
        client = MongoClient(mongo_url)
        db = client[db_name]
        legacy_code = "TESTLEGACY00"
        doc = {
            "voucher_id": "legacy_test",
            "voucher_code": legacy_code,
            # NOTE: intentionally NO owner_name
            "nominal": 1,
            "redeemed_by": "legacy",
            "redeemed_by_name": "LegacyKasir",
            "redeemed_at": datetime.now(timezone.utc),
        }
        ins = db.redemption_logs.insert_one(doc)
        try:
            r = admin_session.get(f"{BASE_URL}/api/reports/daily", timeout=30)
            assert r.status_code == 200
            data = r.json()
            match = [x for x in data["redemptions"] if x["voucher_code"] == legacy_code]
            assert len(match) == 1
            assert match[0]["owner_name"] == "-"
        finally:
            db.redemption_logs.delete_one({"_id": ins.inserted_id})
            client.close()

    def test_report_date_filter_respects_range(self, admin_session):
        # Very old range should return no redemptions
        r = admin_session.get(
            f"{BASE_URL}/api/reports/daily",
            params={"start_date": "1990-01-01T00:00:00+00:00", "end_date": "1990-12-31T23:59:59+00:00"},
            timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["redemptions"] == []
        assert data["report"] == []


# --- teardown module: delete all test vouchers + their redemption logs ---
@pytest.fixture(scope="module", autouse=True)
def _cleanup(admin_session, created_ids):
    yield
    if created_ids["voucher_ids"]:
        try:
            admin_session.post(
                f"{BASE_URL}/api/vouchers/bulk-delete",
                json={"ids": created_ids["voucher_ids"]},
                timeout=30,
            )
        except Exception:
            pass
