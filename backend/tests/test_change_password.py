"""Test change-password endpoint (iteration 14)"""
import os
import pytest
import requests
import subprocess
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://promo-redemption-3.preview.emergentagent.com').rstrip('/')
ADMIN_NAME = "Admin"
ADMIN_PW_ORIG = "123456"
ADMIN_PW_NEW = "654321"


def _login(name, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"name": name, "password": password})
    return s, r


def _ensure_admin_pw(target):
    """Force admin password to target using either current password (try common values)."""
    for cand in [target, "123456", "654321"]:
        s, r = _login(ADMIN_NAME, cand)
        if r.status_code == 200:
            if cand == target:
                return
            r2 = s.post(f"{BASE_URL}/api/auth/change-password",
                        json={"current_password": cand, "new_password": target})
            assert r2.status_code == 200, f"reset failed: {r2.text}"
            return
    pytest.fail("Cannot login as admin with any known password")


@pytest.fixture(scope="module", autouse=True)
def restore_admin():
    _ensure_admin_pw(ADMIN_PW_ORIG)
    yield
    _ensure_admin_pw(ADMIN_PW_ORIG)


class TestChangePasswordAdmin:
    def test_login_admin_ok(self):
        s, r = _login(ADMIN_NAME, ADMIN_PW_ORIG)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_unauthenticated_returns_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/change-password",
                          json={"current_password": "123456", "new_password": "654321"})
        assert r.status_code == 401

    def test_wrong_current(self):
        s, _ = _login(ADMIN_NAME, ADMIN_PW_ORIG)
        r = s.post(f"{BASE_URL}/api/auth/change-password",
                   json={"current_password": "000000", "new_password": "654321"})
        assert r.status_code == 400
        assert "salah" in r.json()["detail"].lower()

    def test_invalid_new_not_6_digits(self):
        s, _ = _login(ADMIN_NAME, ADMIN_PW_ORIG)
        r = s.post(f"{BASE_URL}/api/auth/change-password",
                   json={"current_password": ADMIN_PW_ORIG, "new_password": "12ab56"})
        assert r.status_code == 400
        assert "6 angka" in r.json()["detail"]

    def test_new_equals_current(self):
        s, _ = _login(ADMIN_NAME, ADMIN_PW_ORIG)
        r = s.post(f"{BASE_URL}/api/auth/change-password",
                   json={"current_password": ADMIN_PW_ORIG, "new_password": ADMIN_PW_ORIG})
        assert r.status_code == 400

    def test_valid_change_and_relogin(self):
        s, _ = _login(ADMIN_NAME, ADMIN_PW_ORIG)
        r = s.post(f"{BASE_URL}/api/auth/change-password",
                   json={"current_password": ADMIN_PW_ORIG, "new_password": ADMIN_PW_NEW})
        assert r.status_code == 200
        assert r.json()["message"] == "Sandi berhasil diganti"

        # old fails
        _, r_old = _login(ADMIN_NAME, ADMIN_PW_ORIG)
        assert r_old.status_code == 401
        # new works
        _, r_new = _login(ADMIN_NAME, ADMIN_PW_NEW)
        assert r_new.status_code == 200

        # change back
        s2, _ = _login(ADMIN_NAME, ADMIN_PW_NEW)
        r = s2.post(f"{BASE_URL}/api/auth/change-password",
                    json={"current_password": ADMIN_PW_NEW, "new_password": ADMIN_PW_ORIG})
        assert r.status_code == 200

    def test_seed_admin_does_not_reset_after_restart(self):
        # Change to new
        s, _ = _login(ADMIN_NAME, ADMIN_PW_ORIG)
        r = s.post(f"{BASE_URL}/api/auth/change-password",
                   json={"current_password": ADMIN_PW_ORIG, "new_password": ADMIN_PW_NEW})
        assert r.status_code == 200

        # Restart backend
        subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=True)
        # Wait for backend to come back up
        for _ in range(30):
            try:
                if requests.get(f"{BASE_URL}/api/", timeout=3).status_code == 200:
                    break
            except Exception:
                pass
            time.sleep(1)

        # New still works, old fails
        _, r_new = _login(ADMIN_NAME, ADMIN_PW_NEW)
        assert r_new.status_code == 200, "New password should persist after restart"
        # Clear lockout by successful login already; but ensure old fails
        _, r_old = _login(ADMIN_NAME, ADMIN_PW_ORIG)
        assert r_old.status_code == 401

        # restore
        s2, _ = _login(ADMIN_NAME, ADMIN_PW_NEW)
        r = s2.post(f"{BASE_URL}/api/auth/change-password",
                    json={"current_password": ADMIN_PW_NEW, "new_password": ADMIN_PW_ORIG})
        assert r.status_code == 200


class TestChangePasswordKasir:
    KASIR_NAME = "TESTKASIR14"
    KASIR_PW = "111111"
    KASIR_PW_NEW = "222222"

    @pytest.fixture(scope="class", autouse=True)
    def setup_kasir(self):
        s, _ = _login(ADMIN_NAME, ADMIN_PW_ORIG)
        # Cleanup pre-existing
        users = s.get(f"{BASE_URL}/api/users").json()
        for u in users:
            if u.get("name") == self.KASIR_NAME:
                s.delete(f"{BASE_URL}/api/users/{u['_id']}")
        r = s.post(f"{BASE_URL}/api/auth/register",
                   json={"name": self.KASIR_NAME, "password": self.KASIR_PW, "role": "kasir"})
        assert r.status_code == 200, r.text
        kid = r.json()["_id"]
        yield kid
        # Delete kasir
        s2, _ = _login(ADMIN_NAME, ADMIN_PW_ORIG)
        s2.delete(f"{BASE_URL}/api/users/{kid}")

    def test_kasir_change_password_flow(self, setup_kasir):
        s, r = _login(self.KASIR_NAME, self.KASIR_PW)
        assert r.status_code == 200

        # wrong current
        r = s.post(f"{BASE_URL}/api/auth/change-password",
                   json={"current_password": "999999", "new_password": self.KASIR_PW_NEW})
        assert r.status_code == 400

        # not 6 digits
        r = s.post(f"{BASE_URL}/api/auth/change-password",
                   json={"current_password": self.KASIR_PW, "new_password": "abc"})
        assert r.status_code == 400

        # same
        r = s.post(f"{BASE_URL}/api/auth/change-password",
                   json={"current_password": self.KASIR_PW, "new_password": self.KASIR_PW})
        assert r.status_code == 400

        # valid
        r = s.post(f"{BASE_URL}/api/auth/change-password",
                   json={"current_password": self.KASIR_PW, "new_password": self.KASIR_PW_NEW})
        assert r.status_code == 200

        # relogin new
        _, r = _login(self.KASIR_NAME, self.KASIR_PW_NEW)
        assert r.status_code == 200
