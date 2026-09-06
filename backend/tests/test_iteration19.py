"""Iteration 19: login activities audit, voucher scan URL, /kasir?scan redemption flow."""
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
SUPER_NAME = os.environ["V88_TEST_SUPER_NAME"]
SUPER_PW = os.environ["V88_TEST_SUPER_PASSWORD"]


def _login(session, name, pw):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"name": name, "password": pw}, timeout=15)
    return r


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = _login(s, SUPER_NAME, SUPER_PW)
    assert r.status_code == 200, f"Super login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_session(super_session):
    """Create a temp admin (role=admin) and log them in."""
    uniq = f"TESTAdmin{int(time.time())}"
    pw = "222222"
    r = super_session.post(
        f"{BASE_URL}/api/auth/register",
        json={"name": uniq, "password": pw, "role": "admin"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    user_id = r.json()["_id"]
    s = requests.Session()
    lr = _login(s, uniq, pw)
    assert lr.status_code == 200, lr.text
    yield s
    try:
        super_session.delete(f"{BASE_URL}/api/users/{user_id}", timeout=10)
    except Exception:
        pass


@pytest.fixture(scope="module")
def kasir_session(super_session):
    """Create a temp kasir, login as kasir, return session + user_id."""
    uniq = f"TESTKasir{int(time.time())}"
    pw = "111111"
    r = super_session.post(
        f"{BASE_URL}/api/auth/register",
        json={"name": uniq, "password": pw, "role": "kasir"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    user_id = r.json()["_id"]
    s = requests.Session()
    lr = _login(s, uniq, pw)
    assert lr.status_code == 200, lr.text
    yield s, user_id, uniq
    # cleanup
    try:
        super_session.delete(f"{BASE_URL}/api/users/{user_id}", timeout=10)
    except Exception:
        pass


# --- Login activity ---

def test_super_login_recorded(super_session):
    r = super_session.get(f"{BASE_URL}/api/users/login-activities", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body and isinstance(body["items"], list)
    assert len(body["items"]) > 0
    top = body["items"][0]
    # safe fields only
    assert set(top.keys()) <= {"user_id", "name", "role", "status", "logged_at"}
    assert "password_hash" not in top and "email" not in top
    # recent super login should be present near top
    names_recent = [it["name"] for it in body["items"][:20]]
    assert SUPER_NAME in names_recent


def test_kasir_forbidden_login_activities(kasir_session):
    s, _uid, _name = kasir_session
    r = s.get(f"{BASE_URL}/api/users/login-activities", timeout=15)
    assert r.status_code == 403, f"Expected 403 for kasir, got {r.status_code}: {r.text}"


def test_admin_forbidden_login_activities(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/users/login-activities", timeout=15)
    # Only superadmin allowed
    assert r.status_code == 403


# --- Voucher scan URL ---

@pytest.fixture(scope="module")
def created_voucher(super_session):
    payload = {
        "title": "TEST Iter19",
        "nominal": 1000,
        "terms": "test",
        "expires_at": "2099-12-31T23:59:59Z",
        "quantity": 1,
        "prefix": "TS",
    }
    r = super_session.post(f"{BASE_URL}/api/vouchers", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    v = r.json()["vouchers"][0]
    yield v
    try:
        lst = super_session.get(f"{BASE_URL}/api/vouchers", params={"limit": 200}, timeout=15).json()
        for item in lst.get("vouchers", []):
            if item["code"] == v["code"]:
                super_session.delete(f"{BASE_URL}/api/vouchers/{item['_id']}", timeout=10)
                break
    except Exception:
        pass


def test_voucher_has_scan_url(created_voucher):
    v = created_voucher
    assert "scan_url" in v and v["scan_url"], f"Missing scan_url: {v}"
    assert v["scan_url"].endswith(f"/kasir?scan={v['code']}"), v["scan_url"]
    # QR base64 present
    assert v.get("qr_code") and len(v["qr_code"]) > 100


# --- Redemption via scan flow ---

def test_scan_redeem_once(super_session, created_voucher, kasir_session):
    # activate voucher (mark printed)
    mp = super_session.post(
        f"{BASE_URL}/api/vouchers/mark-printed",
        json={"codes": [created_voucher["code"]]},
        timeout=15,
    )
    assert mp.status_code == 200, mp.text

    s, _uid, _n = kasir_session
    r1 = s.post(
        f"{BASE_URL}/api/vouchers/redeem",
        json={"code": created_voucher["code"]},
        timeout=15,
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["success"] is True

    # second attempt should fail
    r2 = s.post(
        f"{BASE_URL}/api/vouchers/redeem",
        json={"code": created_voucher["code"]},
        timeout=15,
    )
    assert r2.status_code == 400
    assert "sudah" in r2.json().get("detail", "").lower()


def test_unauthenticated_redeem_401():
    r = requests.post(
        f"{BASE_URL}/api/vouchers/redeem",
        json={"code": "ANY"},
        timeout=15,
    )
    assert r.status_code == 401
