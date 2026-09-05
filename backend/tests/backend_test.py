"""
Backend tests for VoucherKu new features:
- Cookie-only auth (no token in login response, /me needs cookie, logout clears cookies)
- Store settings (GET/PUT, role gating, validation)
- Expiry warning stats (expiring_soon count with settings.expiry_warning_days)
- Bulk prefix (validation, prefix respected in generated codes, length always 10)
- Regression: voucher CRUD, redeem flow
"""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Try reading frontend .env
    import re
    with open("/app/frontend/.env") as f:
        for line in f:
            m = re.match(r"REACT_APP_BACKEND_URL=(.+)", line.strip())
            if m:
                BASE_URL = m.group(1).rstrip("/")

ADMIN_EMAIL = "avraaaax51@gmail.com"
ADMIN_PASSWORD = "admin123"

# --- Fixtures ---

@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s

@pytest.fixture(scope="module")
def original_settings(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/settings")
    assert r.status_code == 200
    return r.json()

@pytest.fixture(scope="module", autouse=True)
def restore_settings(admin_session, original_settings):
    yield
    # restore after all tests
    admin_session.put(f"{BASE_URL}/api/settings", json={
        "store_prefix": "Toko",
        "store_name": "ANEKA 88",
        "store_branch": "MANGON",
        "promo_line1": "BELANJA LEBIH HEMAT",
        "promo_line2": "DI TOKO ANEKA 88 MANGON",
        "expiry_warning_days": 7,
    })

# --- Auth: cookie-only ---

class TestAuthCookies:
    def test_login_returns_cookies_no_token(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert "token" not in data, f"login response must not contain token, got: {list(data.keys())}"
        assert "access_token" not in data
        # cookies set
        assert s.cookies.get("access_token"), "access_token cookie missing"
        assert s.cookies.get("refresh_token"), "refresh_token cookie missing"
        # user fields
        assert data.get("email", "").lower() == ADMIN_EMAIL.lower()
        assert data.get("role") == "admin"

    def test_me_with_cookie_works(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        assert r.json().get("email", "").lower() == ADMIN_EMAIL.lower()

    def test_me_with_bearer_only_returns_401(self):
        # Login to get a token via cookie, then use its value as bearer header without cookie
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        token = s.cookies.get("access_token")
        assert token
        # New session, no cookies
        r2 = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 401, f"expected 401 with bearer only, got {r2.status_code}"

    def test_logout_clears_cookies(self):
        s = requests.Session()
        s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        r = s.post(f"{BASE_URL}/api/auth/logout")
        assert r.status_code == 200
        # After logout, /me should 401
        r2 = s.get(f"{BASE_URL}/api/auth/me")
        assert r2.status_code == 401

    def test_me_without_auth(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401


# --- Settings ---

class TestSettings:
    def test_get_settings(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/settings")
        assert r.status_code == 200
        d = r.json()
        for k in ["store_prefix", "store_name", "store_branch", "promo_line1", "promo_line2", "expiry_warning_days"]:
            assert k in d
        assert isinstance(d["expiry_warning_days"], int)

    def test_put_settings_persists(self, admin_session):
        payload = {
            "store_prefix": "TokoTest",
            "store_name": "TOKO MAJU 99",
            "store_branch": "PUSAT",
            "promo_line1": "PROMO 1 TEST",
            "promo_line2": "PROMO 2 TEST",
            "expiry_warning_days": 14,
        }
        r = admin_session.put(f"{BASE_URL}/api/settings", json=payload)
        assert r.status_code == 200, r.text
        # verify persisted
        r2 = admin_session.get(f"{BASE_URL}/api/settings")
        assert r2.status_code == 200
        got = r2.json()
        for k, v in payload.items():
            assert got[k] == v, f"{k}: expected {v}, got {got[k]}"

    def test_put_settings_zero_days_rejected(self, admin_session):
        payload = {
            "store_prefix": "T", "store_name": "N", "store_branch": "B",
            "promo_line1": "A", "promo_line2": "B", "expiry_warning_days": 0,
        }
        r = admin_session.put(f"{BASE_URL}/api/settings", json=payload)
        assert r.status_code == 400

    def test_put_settings_400_days_rejected(self, admin_session):
        payload = {
            "store_prefix": "T", "store_name": "N", "store_branch": "B",
            "promo_line1": "A", "promo_line2": "B", "expiry_warning_days": 400,
        }
        r = admin_session.put(f"{BASE_URL}/api/settings", json=payload)
        assert r.status_code == 400

    def test_kasir_can_get_but_not_put(self, admin_session):
        # Create a kasir user
        kasir_email = "TEST_kasir_settings@example.com"
        kasir_pwd = "kasir123"
        kasir_pin = "9182"
        # try to create; if exists, ignore
        admin_session.post(f"{BASE_URL}/api/auth/register", json={
            "email": kasir_email, "password": kasir_pwd, "name": "Test Kasir", "role": "kasir", "pin": kasir_pin
        })
        ks = requests.Session()
        r = ks.post(f"{BASE_URL}/api/auth/login", json={"email": kasir_email, "password": kasir_pwd})
        assert r.status_code == 200, r.text
        # GET allowed
        rg = ks.get(f"{BASE_URL}/api/settings")
        assert rg.status_code == 200
        # PUT denied 403
        rp = ks.put(f"{BASE_URL}/api/settings", json={
            "store_prefix": "X", "store_name": "Y", "store_branch": "Z",
            "promo_line1": "A", "promo_line2": "B", "expiry_warning_days": 5,
        })
        assert rp.status_code == 403


# --- Bulk prefix ---

class TestBulkPrefix:
    def test_prefix_lowercase_two_chars(self, admin_session):
        exp = (datetime.now(timezone.utc) + timedelta(days=60)).isoformat()
        r = admin_session.post(f"{BASE_URL}/api/vouchers", json={
            "title": "TEST prefix rm", "nominal": 10000, "terms": "", "expires_at": exp, "quantity": 2, "prefix": "rm"
        })
        assert r.status_code == 200, r.text
        vs = r.json()["vouchers"]
        assert len(vs) == 2
        seqs = []
        for v in vs:
            assert len(v["code"]) == 10, f"code length: {v['code']}"
            assert v["code"].startswith("RM"), v["code"]
            # last 3 digits numeric
            assert v["code"][-3:].isdigit()
            seqs.append(int(v["code"][-3:]))
        # incrementing serial
        assert seqs[1] == seqs[0] + 1

    def test_prefix_too_long_rejected(self, admin_session):
        exp = (datetime.now(timezone.utc) + timedelta(days=60)).isoformat()
        r = admin_session.post(f"{BASE_URL}/api/vouchers", json={
            "title": "TEST bad prefix", "nominal": 10000, "terms": "", "expires_at": exp, "quantity": 1, "prefix": "ABCDE"
        })
        assert r.status_code == 400

    def test_prefix_non_alnum_rejected(self, admin_session):
        exp = (datetime.now(timezone.utc) + timedelta(days=60)).isoformat()
        r = admin_session.post(f"{BASE_URL}/api/vouchers", json={
            "title": "TEST bad prefix2", "nominal": 10000, "terms": "", "expires_at": exp, "quantity": 1, "prefix": "A-B"
        })
        assert r.status_code == 400

    def test_empty_prefix_ten_chars(self, admin_session):
        exp = (datetime.now(timezone.utc) + timedelta(days=60)).isoformat()
        r = admin_session.post(f"{BASE_URL}/api/vouchers", json={
            "title": "TEST no prefix", "nominal": 10000, "terms": "", "expires_at": exp, "quantity": 1, "prefix": ""
        })
        assert r.status_code == 200
        v = r.json()["vouchers"][0]
        assert len(v["code"]) == 10


# --- Expiry warning ---

class TestExpiryWarning:
    def test_stats_expiring_soon(self, admin_session):
        # set threshold to 10 days
        admin_session.put(f"{BASE_URL}/api/settings", json={
            "store_prefix": "Toko", "store_name": "ANEKA 88", "store_branch": "MANGON",
            "promo_line1": "BELANJA LEBIH HEMAT", "promo_line2": "DI TOKO ANEKA 88 MANGON",
            "expiry_warning_days": 10,
        })
        # create voucher expiring in 5 days
        exp5 = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
        r = admin_session.post(f"{BASE_URL}/api/vouchers", json={
            "title": "TEST expiring 5d", "nominal": 5000, "terms": "", "expires_at": exp5, "quantity": 1, "prefix": "EX"
        })
        assert r.status_code == 200
        code5 = r.json()["vouchers"][0]["code"]

        # create voucher expiring in 30 days (should NOT be soon)
        exp30 = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        r2 = admin_session.post(f"{BASE_URL}/api/vouchers", json={
            "title": "TEST expiring 30d", "nominal": 5000, "terms": "", "expires_at": exp30, "quantity": 1, "prefix": "FA"
        })
        assert r2.status_code == 200

        s = admin_session.get(f"{BASE_URL}/api/stats").json()
        assert s["expiry_warning_days"] == 10
        assert s["expiring_soon"] >= 1


# --- Redeem regression ---

class TestRedeemRegression:
    def test_admin_can_redeem_with_cookie(self, admin_session):
        exp = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        r = admin_session.post(f"{BASE_URL}/api/vouchers", json={
            "title": "TEST redeem", "nominal": 1000, "terms": "", "expires_at": exp, "quantity": 1, "prefix": "RD"
        })
        code = r.json()["vouchers"][0]["code"]
        rr = admin_session.post(f"{BASE_URL}/api/vouchers/redeem", json={"code": code})
        assert rr.status_code == 200
        assert rr.json()["success"] is True

    def test_vouchers_list_and_reports(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/vouchers")
        assert r.status_code == 200
        r2 = admin_session.get(f"{BASE_URL}/api/reports/daily")
        assert r2.status_code == 200


# ==================== Iteration 5: New features ====================

# --- GET /api/vouchers?status=expiring filters correctly ---

class TestVoucherStatusExpiring:
    def test_status_expiring_returns_only_within_threshold(self, admin_session):
        # Ensure expiry_warning_days=7 (default)
        admin_session.put(f"{BASE_URL}/api/settings", json={
            "store_prefix": "Toko", "store_name": "ANEKA 88", "store_branch": "MANGON",
            "promo_line1": "BELANJA LEBIH HEMAT", "promo_line2": "DI TOKO ANEKA 88 MANGON",
            "expiry_warning_days": 7,
        })
        # Create one expiring in 3 days (should be in list)
        exp3 = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        r1 = admin_session.post(f"{BASE_URL}/api/vouchers", json={
            "title": "TEST_expiring_3d", "nominal": 1000, "terms": "", "expires_at": exp3, "quantity": 1, "prefix": "E3"
        })
        assert r1.status_code == 200
        code_in = r1.json()["vouchers"][0]["code"]

        # One expiring in 60 days (should NOT be in list)
        exp60 = (datetime.now(timezone.utc) + timedelta(days=60)).isoformat()
        r2 = admin_session.post(f"{BASE_URL}/api/vouchers", json={
            "title": "TEST_expiring_60d", "nominal": 1000, "terms": "", "expires_at": exp60, "quantity": 1, "prefix": "E6"
        })
        assert r2.status_code == 200
        code_out = r2.json()["vouchers"][0]["code"]

        r = admin_session.get(f"{BASE_URL}/api/vouchers?status=expiring&limit=200")
        assert r.status_code == 200
        codes = [v["code"] for v in r.json()["vouchers"]]
        assert code_in in codes
        assert code_out not in codes

        # All returned vouchers must be active + expires within 7 days
        now = datetime.now(timezone.utc)
        for v in r.json()["vouchers"]:
            assert v["status"] == "active"
            ea = datetime.fromisoformat(v["expires_at"].replace("Z", "+00:00"))
            if ea.tzinfo is None:
                ea = ea.replace(tzinfo=timezone.utc)
            assert now < ea <= now + timedelta(days=7)

    def test_status_active_unchanged(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/vouchers?status=active&limit=5")
        assert r.status_code == 200
        for v in r.json()["vouchers"]:
            assert v["status"] == "active"


# --- User management: reset + delete ---

@pytest.fixture(scope="class")
def test_kasir(admin_session):
    """Create a kasir user for management tests"""
    email = "test_kasir_mgmt@example.com"
    # cleanup preexisting
    users = admin_session.get(f"{BASE_URL}/api/users").json()
    for u in users:
        if u["email"] == email:
            admin_session.delete(f"{BASE_URL}/api/users/{u['_id']}")
    r = admin_session.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": "kasir123", "name": "TEST Kasir Mgmt", "role": "kasir", "pin": "4321"
    })
    assert r.status_code == 200, r.text
    uid = r.json()["_id"]
    yield {"id": uid, "email": email}
    # teardown - ensure gone
    admin_session.delete(f"{BASE_URL}/api/users/{uid}")


class TestUserManagement:
    def test_reset_password_and_pin_success(self, admin_session, test_kasir):
        r = admin_session.put(f"{BASE_URL}/api/users/{test_kasir['id']}/reset",
                              json={"password": "newpass123", "pin": "5566"})
        assert r.status_code == 200

        # login with new password
        s2 = requests.Session()
        lr = s2.post(f"{BASE_URL}/api/auth/login",
                     json={"email": test_kasir["email"], "password": "newpass123"})
        assert lr.status_code == 200

        # old pin fails
        s3 = requests.Session()
        old = s3.post(f"{BASE_URL}/api/auth/pin-login", json={"pin": "4321"})
        assert old.status_code == 401

        # new pin works
        s4 = requests.Session()
        new = s4.post(f"{BASE_URL}/api/auth/pin-login", json={"pin": "5566"})
        assert new.status_code == 200

    def test_reset_empty_body_returns_400(self, admin_session, test_kasir):
        r = admin_session.put(f"{BASE_URL}/api/users/{test_kasir['id']}/reset", json={})
        assert r.status_code == 400

    def test_reset_short_pin_returns_400(self, admin_session, test_kasir):
        r = admin_session.put(f"{BASE_URL}/api/users/{test_kasir['id']}/reset", json={"pin": "12"})
        assert r.status_code == 400

    def test_reset_short_password_returns_400(self, admin_session, test_kasir):
        r = admin_session.put(f"{BASE_URL}/api/users/{test_kasir['id']}/reset", json={"password": "abc"})
        assert r.status_code == 400

    def test_delete_self_returns_400(self, admin_session):
        me = admin_session.get(f"{BASE_URL}/api/auth/me").json()
        r = admin_session.delete(f"{BASE_URL}/api/users/{me['_id']}")
        assert r.status_code == 400

    def test_delete_unknown_returns_404(self, admin_session):
        r = admin_session.delete(f"{BASE_URL}/api/users/507f1f77bcf86cd799439011")
        assert r.status_code == 404

    def test_kasir_role_cannot_reset_or_delete(self, admin_session, test_kasir):
        # login as kasir with current password (was reset above to newpass123)
        ks = requests.Session()
        lr = ks.post(f"{BASE_URL}/api/auth/login",
                     json={"email": test_kasir["email"], "password": "newpass123"})
        assert lr.status_code == 200
        # kasir attempts DELETE and PUT reset
        me = admin_session.get(f"{BASE_URL}/api/auth/me").json()
        d = ks.delete(f"{BASE_URL}/api/users/{me['_id']}")
        assert d.status_code == 403
        p = ks.put(f"{BASE_URL}/api/users/{test_kasir['id']}/reset", json={"password": "abcdef"})
        assert p.status_code == 403

    def test_delete_kasir_success_and_removed(self, admin_session, test_kasir):
        r = admin_session.delete(f"{BASE_URL}/api/users/{test_kasir['id']}")
        assert r.status_code == 200
        users = admin_session.get(f"{BASE_URL}/api/users").json()
        assert not any(u["_id"] == test_kasir["id"] for u in users)

