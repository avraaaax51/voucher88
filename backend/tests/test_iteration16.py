"""Iteration 16: regression after tz_aware=True Motor fix.

Focus:
- Brute-force lockout returns 429 (not 500) on /api/auth/recover and /api/auth/login.
- Datetime regression across voucher flows: create, mark-printed, redeem, redeem-again,
  stats, reports/daily, redemptions/mine, vouchers?status=expiring/active.
- Expired voucher path (create with past expires_at) also returns 400 "kadaluarsa".
"""
import os
import re
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_NAME = "Admin"
ADMIN_PASS = "123456"

ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")


# --------- shared helpers / fixtures ----------
def _clear_login_attempts(identifiers):
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    c = MongoClient(mongo_url)
    c[db_name].login_attempts.delete_many({"identifier": {"$in": identifiers}})
    c.close()


# Unique identifiers per run so parallel xdist workers can't clobber each other.
_RUN = uuid.uuid4().hex[:8]
BF_RECOVER_NAME = f"nobody2_{_RUN}"
BF_LOGIN_NAME = f"ghost2_{_RUN}"


@pytest.fixture(scope="session", autouse=True)
def _cleanup_lockouts():
    yield
    _clear_login_attempts([
        BF_RECOVER_NAME,
        f"recovery:{BF_RECOVER_NAME}",
        BF_LOGIN_NAME,
    ])


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"name": ADMIN_NAME, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


# --------- 1. Brute-force lockout regression ----------
class TestLockoutRegression:
    def test_recover_lockout_returns_429_not_500(self):
        name = BF_RECOVER_NAME
        for i in range(5):
            r = requests.post(f"{API}/auth/recover", json={
                "name": name, "recovery_code": "ZZZZ-ZZZZ-ZZZZ", "new_password": "654321"
            })
            assert r.status_code == 400, f"attempt {i+1} expected 400, got {r.status_code}: {r.text}"
        # 6th attempt must be 429 (not 500)
        r = requests.post(f"{API}/auth/recover", json={
            "name": name, "recovery_code": "ZZZZ-ZZZZ-ZZZZ", "new_password": "654321"
        })
        assert r.status_code == 429, f"expected 429, got {r.status_code}: {r.text}"

    def test_login_lockout_returns_429_not_500(self):
        name = BF_LOGIN_NAME
        for i in range(5):
            r = requests.post(f"{API}/auth/login", json={"name": name, "password": "000000"})
            assert r.status_code == 401, f"attempt {i+1} expected 401, got {r.status_code}: {r.text}"
        r = requests.post(f"{API}/auth/login", json={"name": name, "password": "000000"})
        assert r.status_code == 429, f"expected 429, got {r.status_code}: {r.text}"


# --------- 2. Datetime regression through voucher flows ----------
class TestDatetimeRegression:
    created_ids = []

    @staticmethod
    def _iso(dt):
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    def test_create_voucher(self, admin_session):
        expires = datetime.now(timezone.utc) + timedelta(days=30)
        payload = {
            "title": "TEST_iter16",
            "nominal": 5000,
            "terms": "test",
            "expires_at": self._iso(expires),
            "quantity": 1,
            "prefix": "T16"
        }
        r = admin_session.post(f"{API}/vouchers", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        v = data["vouchers"][0]
        assert ISO_RE.match(v["created_at"])
        assert ISO_RE.match(v["expires_at"])
        TestDatetimeRegression.code = v["code"]
        # look up the id via list
        lst = admin_session.get(f"{API}/vouchers?status=draft&limit=200").json()
        vid = next(x["_id"] for x in lst["vouchers"] if x["code"] == v["code"])
        TestDatetimeRegression.created_ids.append(vid)

    def test_mark_printed(self, admin_session):
        r = admin_session.post(f"{API}/vouchers/mark-printed", json={"codes": [TestDatetimeRegression.code]})
        assert r.status_code == 200, r.text
        # verify status became active
        lst = admin_session.get(f"{API}/vouchers?status=active&limit=200").json()
        codes = [v["code"] for v in lst["vouchers"]]
        assert TestDatetimeRegression.code in codes

    def test_redeem_success(self, admin_session):
        r = admin_session.post(f"{API}/vouchers/redeem", json={"code": TestDatetimeRegression.code})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True
        assert ISO_RE.match(body["voucher"]["redeemed_at"])

    def test_redeem_again_returns_400_sudah_digunakan(self, admin_session):
        r = admin_session.post(f"{API}/vouchers/redeem", json={"code": TestDatetimeRegression.code})
        assert r.status_code == 400
        assert "sudah" in r.json().get("detail", "").lower()

    def test_stats_ok(self, admin_session):
        r = admin_session.get(f"{API}/stats")
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ["total", "draft", "active", "redeemed", "expired", "expiring_soon", "today_redeemed"]:
            assert k in data
        for rec in data.get("recent_redemptions", []):
            assert ISO_RE.match(rec["redeemed_at"]), rec

    def test_reports_daily_ok(self, admin_session):
        r = admin_session.get(f"{API}/reports/daily")
        assert r.status_code == 200, r.text
        data = r.json()
        assert ISO_RE.match(data["start_date"])
        assert ISO_RE.match(data["end_date"])
        for c in data.get("by_cashier", []):
            if c.get("last_redeemed_at"):
                assert ISO_RE.match(c["last_redeemed_at"])

    def test_redemptions_mine_ok(self, admin_session):
        r = admin_session.get(f"{API}/redemptions/mine")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data
        for it in data["items"]:
            assert ISO_RE.match(it["redeemed_at"])

    def test_vouchers_expiring_filter(self, admin_session):
        r = admin_session.get(f"{API}/vouchers?status=expiring&limit=10")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "vouchers" in data
        for v in data["vouchers"]:
            assert ISO_RE.match(v["expires_at"])

    def test_vouchers_active_filter(self, admin_session):
        r = admin_session.get(f"{API}/vouchers?status=active&limit=10")
        assert r.status_code == 200, r.text
        for v in r.json()["vouchers"]:
            assert ISO_RE.match(v["expires_at"])

    def test_expired_voucher_redeem_returns_kadaluarsa(self, admin_session):
        # create with past expires_at, then mark-printed (activates), then redeem -> 400 kadaluarsa
        past = datetime.now(timezone.utc) - timedelta(days=1)
        payload = {
            "title": "TEST_iter16_expired",
            "nominal": 1000,
            "terms": "expired-test",
            "expires_at": self._iso(past),
            "quantity": 1,
            "prefix": "EXP"
        }
        r = admin_session.post(f"{API}/vouchers", json=payload)
        assert r.status_code == 200, r.text
        code = r.json()["vouchers"][0]["code"]
        lst = admin_session.get(f"{API}/vouchers?status=draft&limit=200").json()
        vid = next(x["_id"] for x in lst["vouchers"] if x["code"] == code)
        TestDatetimeRegression.created_ids.append(vid)

        r = admin_session.post(f"{API}/vouchers/mark-printed", json={"codes": [code]})
        assert r.status_code == 200

        r = admin_session.post(f"{API}/vouchers/redeem", json={"code": code})
        assert r.status_code == 400
        assert "kadaluarsa" in r.json().get("detail", "").lower()

    def test_cleanup(self, admin_session):
        for vid in TestDatetimeRegression.created_ids:
            r = admin_session.delete(f"{API}/vouchers/{vid}")
            assert r.status_code in (200, 404), r.text
