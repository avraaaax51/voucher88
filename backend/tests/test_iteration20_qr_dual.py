"""Iteration 20: dual-scan QR (compact /?s=CODE) coverage.

Verifies:
- POST /api/vouchers returns scan_url ending with `/?s=<code>` and a valid QR
  base64 that decodes to that exact URL (using pyzbar).
- GET /api/vouchers refreshes stored qr for legacy scan_url payloads to the
  compact form and does not leak Mongo _id ObjectId types.
- GET /api/vouchers/{id} same refresh + no _id leak.
- POST /api/vouchers/redeem with the compact code succeeds exactly once.
- Auth: unauthenticated redeem -> 401.
"""
import base64
import io
import os
import secrets
from urllib.parse import urlparse, parse_qs

import pytest
import requests
from PIL import Image
from pyzbar.pyzbar import decode as qr_decode

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

SUPER_NAME = os.environ["V88_TEST_SUPER_NAME"]
SUPER_PASS = os.environ["V88_TEST_SUPER_PASSWORD"]


# --------- fixtures ---------

@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"name": SUPER_NAME, "password": SUPER_PASS})
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text}"
    body = r.json()
    assert body["role"] == "superadmin"
    return s


@pytest.fixture(scope="module")
def kasir_session(super_session):
    """Create a temp kasir via super session and login as them."""
    name = f"TESTKasirQR{secrets.token_hex(3)}"
    pw = "112233"
    r = super_session.post(f"{BASE_URL}/api/auth/register",
                           json={"name": name, "password": pw, "role": "kasir"})
    assert r.status_code == 200, r.text
    kasir_id = r.json()["_id"]
    ks = requests.Session()
    lr = ks.post(f"{BASE_URL}/api/auth/login", json={"name": name, "password": pw})
    assert lr.status_code == 200
    yield ks
    # cleanup
    try:
        super_session.delete(f"{BASE_URL}/api/users/{kasir_id}")
    except Exception:
        pass


@pytest.fixture(scope="module")
def created_voucher(super_session):
    """Create + mark-printed (activate) one voucher; cleanup after."""
    payload = {
        "title": "TEST QR Dual",
        "nominal": 5000,
        "terms": "TEST voucher",
        "expires_at": "2099-01-01T00:00:00Z",
        "quantity": 1,
        "prefix": "TQ",
    }
    r = super_session.post(f"{BASE_URL}/api/vouchers", json=payload)
    assert r.status_code == 200, r.text
    v = r.json()["vouchers"][0]
    code = v["code"]
    # activate
    mp = super_session.post(f"{BASE_URL}/api/vouchers/mark-printed",
                            json={"codes": [code]})
    assert mp.status_code == 200
    yield v
    # cleanup: find id and delete
    lst = super_session.get(f"{BASE_URL}/api/vouchers",
                            params={"status": "redeemed", "limit": 200}).json()
    for item in lst.get("vouchers", []):
        if item["code"] == code:
            super_session.delete(f"{BASE_URL}/api/vouchers/{item['_id']}")
            return
    lst2 = super_session.get(f"{BASE_URL}/api/vouchers",
                             params={"status": "active", "limit": 200}).json()
    for item in lst2.get("vouchers", []):
        if item["code"] == code:
            super_session.delete(f"{BASE_URL}/api/vouchers/{item['_id']}")


# --------- helpers ---------

def _decode_qr(b64: str) -> str:
    img = Image.open(io.BytesIO(base64.b64decode(b64)))
    res = qr_decode(img)
    assert res, "QR decode returned nothing"
    return res[0].data.decode("utf-8")


# --------- tests ---------

class TestVoucherCompactQR:

    def test_scan_url_shape(self, created_voucher):
        scan_url = created_voucher["scan_url"]
        assert isinstance(scan_url, str) and scan_url
        parsed = urlparse(scan_url)
        assert parsed.scheme in ("http", "https")
        assert parsed.netloc, "absolute URL required"
        assert parsed.path in ("/", ""), f"expected root path, got {parsed.path!r}"
        qs = parse_qs(parsed.query)
        assert qs.get("s") == [created_voucher["code"]], f"?s must equal code, got {qs}"

    def test_qr_base64_decodes_to_scan_url(self, created_voucher):
        decoded = _decode_qr(created_voucher["qr_code"])
        assert decoded == created_voucher["scan_url"], (
            f"QR payload mismatch: decoded={decoded!r} scan_url={created_voucher['scan_url']!r}"
        )

    def test_qr_payload_is_compact(self, created_voucher):
        # Compact payload must not contain the old /kasir?scan= form
        assert "/kasir?scan=" not in created_voucher["scan_url"]
        assert created_voucher["scan_url"].endswith(f"/?s={created_voucher['code']}")


class TestVoucherListDetailRefresh:

    def test_list_returns_compact_and_no_objectid(self, super_session, created_voucher):
        r = super_session.get(f"{BASE_URL}/api/vouchers",
                              params={"limit": 200})
        assert r.status_code == 200
        body = r.json()
        # No ObjectId leak: response must be valid JSON already, and _id is str
        found = None
        for v in body["vouchers"]:
            assert isinstance(v["_id"], str)
            assert "$oid" not in str(v)
            if v["code"] == created_voucher["code"]:
                found = v
        assert found is not None
        assert found["scan_url"].endswith(f"/?s={created_voucher['code']}")
        decoded = _decode_qr(found["qr_code"])
        assert decoded == found["scan_url"]

    def test_detail_returns_compact_and_no_objectid(self, super_session, created_voucher):
        # need id -> from list
        r = super_session.get(f"{BASE_URL}/api/vouchers", params={"limit": 200}).json()
        vid = next(v["_id"] for v in r["vouchers"] if v["code"] == created_voucher["code"])
        d = super_session.get(f"{BASE_URL}/api/vouchers/{vid}")
        assert d.status_code == 200
        item = d.json()
        assert isinstance(item["_id"], str)
        assert "$oid" not in str(item)
        assert item["scan_url"].endswith(f"/?s={created_voucher['code']}")
        decoded = _decode_qr(item["qr_code"])
        assert decoded == item["scan_url"]


class TestRedeemFlow:

    def test_unauth_redeem_401(self, created_voucher):
        r = requests.post(f"{BASE_URL}/api/vouchers/redeem",
                          json={"code": created_voucher["code"]})
        assert r.status_code == 401

    def test_redeem_success_then_reuse_400(self, kasir_session, created_voucher):
        code = created_voucher["code"]
        r1 = kasir_session.post(f"{BASE_URL}/api/vouchers/redeem", json={"code": code})
        assert r1.status_code == 200, r1.text
        body = r1.json()
        assert body["success"] is True
        assert body["voucher"]["code"] == code
        r2 = kasir_session.post(f"{BASE_URL}/api/vouchers/redeem", json={"code": code})
        assert r2.status_code == 400
        assert "sudah pernah" in r2.json().get("detail", "").lower()
