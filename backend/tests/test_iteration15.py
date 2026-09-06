"""Iteration 15: Print agent downloads + admin recovery code flow."""
import os
import re
import time
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_NAME = "Admin"
ADMIN_PASS = "123456"

RECOVERY_RE = re.compile(r"^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$")


def _login(session, name, password):
    r = session.post(f"{API}/auth/login", json={"name": name, "password": password})
    return r


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = _login(s, ADMIN_NAME, ADMIN_PASS)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    yield s
    # ensure logout not required


# ---------------- Print agent downloads ----------------
class TestPrintAgentDownloads:
    def test_ps1(self):
        r = requests.get(f"{API}/print-agent/download/Voucher88PrintAgent.ps1")
        assert r.status_code == 200
        assert "winspool.drv" in r.text

    def test_bat(self):
        r = requests.get(f"{API}/print-agent/download/Voucher88PrintAgent.bat")
        assert r.status_code == 200
        assert len(r.content) > 0

    def test_py_fallback(self):
        r = requests.get(f"{API}/print-agent/download/voucher_print_agent.py")
        assert r.status_code == 200

    def test_bat_fallback(self):
        r = requests.get(f"{API}/print-agent/download/jalankan_print_agent.bat")
        assert r.status_code == 200

    def test_unknown_404(self):
        r = requests.get(f"{API}/print-agent/download/nope.exe")
        assert r.status_code == 404


# ---------------- Recovery code (admin only) ----------------
class TestRecoveryCodeFlow:
    recovery_code = None
    temp_kasir_id = None

    def test_kasir_forbidden(self, admin_session):
        # create temp kasir
        import uuid
        name = f"TESTKasir_{uuid.uuid4().hex[:6]}"
        r = admin_session.post(f"{API}/auth/register", json={"name": name, "password": "111111", "role": "kasir"})
        assert r.status_code in (200, 201), r.text
        TestRecoveryCodeFlow.temp_kasir_id = r.json().get("id") or r.json().get("_id")

        ks = requests.Session()
        r = _login(ks, name, "111111")
        assert r.status_code == 200
        r = ks.post(f"{API}/auth/recovery-code")
        assert r.status_code == 403

        # cleanup kasir
        if TestRecoveryCodeFlow.temp_kasir_id:
            admin_session.delete(f"{API}/users/{TestRecoveryCodeFlow.temp_kasir_id}")

    def test_admin_generate_code(self, admin_session):
        r = admin_session.post(f"{API}/auth/recovery-code")
        assert r.status_code == 200, r.text
        data = r.json()
        code = data.get("recovery_code")
        assert code and RECOVERY_RE.match(code), f"Bad code format: {code}"
        TestRecoveryCodeFlow.recovery_code = code

    def test_status_has_code(self, admin_session):
        r = admin_session.get(f"{API}/auth/recovery-code/status")
        assert r.status_code == 200
        assert r.json().get("has_code") is True

    def test_recover_wrong_code(self):
        r = requests.post(f"{API}/auth/recover", json={
            "name": ADMIN_NAME, "recovery_code": "AAAA-BBBB-CCCC", "new_password": "654321"
        })
        assert r.status_code == 400

    def test_recover_short_password(self):
        code = TestRecoveryCodeFlow.recovery_code
        r = requests.post(f"{API}/auth/recover", json={
            "name": ADMIN_NAME, "recovery_code": code, "new_password": "12"
        })
        assert r.status_code == 400

    def test_recover_success(self):
        code = TestRecoveryCodeFlow.recovery_code
        r = requests.post(f"{API}/auth/recover", json={
            "name": ADMIN_NAME, "recovery_code": code, "new_password": "654321"
        })
        assert r.status_code == 200, r.text

    def test_login_with_new_password(self):
        s = requests.Session()
        r = _login(s, ADMIN_NAME, "654321")
        assert r.status_code == 200

    def test_reuse_code_fails(self):
        code = TestRecoveryCodeFlow.recovery_code
        r = requests.post(f"{API}/auth/recover", json={
            "name": ADMIN_NAME, "recovery_code": code, "new_password": "999999"
        })
        assert r.status_code == 400

    def test_status_no_code_after_use(self):
        s = requests.Session()
        _login(s, ADMIN_NAME, "654321")
        r = s.get(f"{API}/auth/recovery-code/status")
        assert r.status_code == 200
        assert r.json().get("has_code") is False

    def test_restore_admin_password(self):
        s = requests.Session()
        r = _login(s, ADMIN_NAME, "654321")
        assert r.status_code == 200
        r = s.post(f"{API}/auth/change-password", json={
            "current_password": "654321", "new_password": ADMIN_PASS
        })
        assert r.status_code == 200, r.text
        # verify
        s2 = requests.Session()
        assert _login(s2, ADMIN_NAME, ADMIN_PASS).status_code == 200


# ---------------- Brute force lockout (use fake name to not block admin) ----------------
class TestBruteForce:
    def test_lockout_on_fake_name(self):
        name = "nobody_test_bf"
        for i in range(5):
            r = requests.post(f"{API}/auth/recover", json={
                "name": name, "recovery_code": "ZZZZ-ZZZZ-ZZZZ", "new_password": "654321"
            })
            assert r.status_code == 400, f"attempt {i}: {r.status_code}"
        r = requests.post(f"{API}/auth/recover", json={
            "name": name, "recovery_code": "ZZZZ-ZZZZ-ZZZZ", "new_password": "654321"
        })
        assert r.status_code == 429, f"expected 429, got {r.status_code}"


# ---------------- Regression ----------------
class TestRegression:
    def test_login_and_me(self):
        s = requests.Session()
        r = _login(s, ADMIN_NAME, ADMIN_PASS)
        assert r.status_code == 200
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json().get("role") == "admin"
