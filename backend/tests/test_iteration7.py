"""Iteration 7: Name-based auth, reset-data, and QR redemption regressions.

Covers:
- Auth: login (case-insensitive), wrong password, /api/auth/pin-login removed
- Register/reset: 6-digit numeric password validation + duplicate name (different case)
- Reset data (/api/admin/reset-data): confirm string check, RBAC, actual wipe + counter reset
- QR flow: redeem returns success message & BERHASIL condition (server-side); double-redeem returns 'Voucher sudah pernah digunakan'
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://promo-redemption-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_NAME = "Admin"
ADMIN_PW = "123456"


def _admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"name": ADMIN_NAME, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin():
    return _admin_session()


# --- Auth ---
class TestAuth:
    def test_login_ok(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"name": ADMIN_NAME, "password": ADMIN_PW})
        assert r.status_code == 200
        # cookie set
        assert "access_token" in s.cookies

    def test_login_case_insensitive(self):
        r = requests.post(f"{API}/auth/login", json={"name": "ADMIN", "password": ADMIN_PW})
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_login_wrong_password(self):
        # use a different identifier to avoid brute force lockout on admin
        r = requests.post(f"{API}/auth/login", json={"name": "Admin", "password": "000000"})
        assert r.status_code in (401, 429)
        if r.status_code == 401:
            assert "Nama atau sandi salah" in r.json().get("detail", "")

    def test_pin_login_removed(self):
        r = requests.post(f"{API}/auth/pin-login", json={"pin": "1234"})
        assert r.status_code in (404, 405)


# --- Register + reset kasir ---
class TestRegisterResetKasir:
    kasir_name = "TEST_KasirUji7"
    kasir_id = None

    def test_register_invalid_alpha_password(self, admin):
        r = admin.post(f"{API}/auth/register", json={"name": self.kasir_name, "password": "abc123", "role": "kasir"})
        assert r.status_code == 400
        assert "Sandi harus 6 angka" in r.json()["detail"]

    def test_register_invalid_short_password(self, admin):
        r = admin.post(f"{API}/auth/register", json={"name": self.kasir_name, "password": "12345", "role": "kasir"})
        assert r.status_code == 400

    def test_register_ok(self, admin):
        r = admin.post(f"{API}/auth/register", json={"name": self.kasir_name, "password": "654321", "role": "kasir"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["role"] == "kasir"
        assert body["name"] == self.kasir_name
        TestRegisterResetKasir.kasir_id = body["_id"]

    def test_register_duplicate_case(self, admin):
        r = admin.post(f"{API}/auth/register", json={"name": self.kasir_name.upper(), "password": "654321", "role": "kasir"})
        assert r.status_code == 400
        assert "Nama sudah digunakan" in r.json()["detail"]

    def test_kasir_can_login(self):
        r = requests.post(f"{API}/auth/login", json={"name": self.kasir_name, "password": "654321"})
        assert r.status_code == 200
        assert r.json()["role"] == "kasir"

    def test_reset_invalid_password(self, admin):
        assert self.kasir_id
        r = admin.put(f"{API}/users/{self.kasir_id}/reset", json={"password": "12ab56"})
        assert r.status_code == 400

    def test_reset_ok_and_new_login(self, admin):
        assert self.kasir_id
        r = admin.put(f"{API}/users/{self.kasir_id}/reset", json={"password": "999999"})
        assert r.status_code == 200
        # new works
        r2 = requests.post(f"{API}/auth/login", json={"name": self.kasir_name, "password": "999999"})
        assert r2.status_code == 200
        # old fails
        r3 = requests.post(f"{API}/auth/login", json={"name": self.kasir_name, "password": "654321"})
        assert r3.status_code in (401, 429)

    def test_kasir_cannot_reset_data(self):
        # login as kasir
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"name": self.kasir_name, "password": "999999"})
        assert r.status_code == 200
        r2 = s.post(f"{API}/admin/reset-data", json={"confirm": "HAPUS SEMUA"})
        assert r2.status_code == 403

    def test_cleanup_kasir(self, admin):
        if self.kasir_id:
            r = admin.delete(f"{API}/users/{self.kasir_id}")
            assert r.status_code == 200


# --- Voucher redeem regression + reset-data (LAST) ---
class TestVoucherAndReset:
    def test_create_and_redeem_flow(self, admin):
        # Create 2 vouchers
        payload = {
            "title": "TEST_iter7",
            "nominal": 10000,
            "expires_at": "2099-12-31T23:59:59Z",
            "quantity": 2,
            "prefix": "T7",
        }
        r = admin.post(f"{API}/vouchers", json=payload)
        assert r.status_code == 200, r.text
        vouchers = r.json()["vouchers"]
        codes = [v["code"] for v in vouchers]
        # mark printed to activate
        rp = admin.post(f"{API}/vouchers/mark-printed", json={"codes": codes})
        assert rp.status_code == 200

        # Redeem first
        r1 = admin.post(f"{API}/vouchers/redeem", json={"code": codes[0]})
        assert r1.status_code == 200
        body = r1.json()
        assert body["success"] is True
        assert body["message"] == "Voucher berhasil digunakan!"
        assert body["voucher"]["code"] == codes[0]

        # Double redeem -> 400 sudah pernah
        r2 = admin.post(f"{API}/vouchers/redeem", json={"code": codes[0]})
        assert r2.status_code == 400
        assert "Voucher sudah pernah digunakan" in r2.json()["detail"]

        # Case-insensitive + whitespace tolerated
        r3 = admin.post(f"{API}/vouchers/redeem", json={"code": f"  {codes[1].lower()}  "})
        assert r3.status_code == 200

    def test_reset_data_bad_confirm(self, admin):
        r = admin.post(f"{API}/admin/reset-data", json={"confirm": "x"})
        assert r.status_code == 400

    def test_reset_data_ok_and_wipe(self, admin):
        # count current vouchers to verify wipe
        r_before = admin.get(f"{API}/vouchers")
        total_before = r_before.json()["total"]
        assert total_before > 0

        r = admin.post(f"{API}/admin/reset-data", json={"confirm": "HAPUS SEMUA"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["vouchers_deleted"] >= total_before

        # verify counts
        r_after = admin.get(f"{API}/vouchers")
        assert r_after.json()["total"] == 0
        rs = admin.get(f"{API}/stats")
        s = rs.json()
        assert s["total"] == 0
        assert s["redeemed"] == 0

        # users still exist
        ru = admin.get(f"{API}/users")
        assert ru.status_code == 200
        assert any(u["name"].lower() == "admin" for u in ru.json())

        # settings unchanged (returns default or previously saved)
        rst = admin.get(f"{API}/settings")
        assert rst.status_code == 200

        # new voucher gets serial 001
        r_new = admin.post(f"{API}/vouchers", json={
            "title": "TEST_afterreset",
            "nominal": 5000,
            "expires_at": "2099-12-31T23:59:59Z",
            "quantity": 1,
            "prefix": "AR",
        })
        assert r_new.status_code == 200
        code = r_new.json()["vouchers"][0]["code"]
        assert code.endswith("001"), f"expected ...001 got {code}"
