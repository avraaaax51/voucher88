"""Iteration 9: Cache-Control headers + delete consistency (voucher delete removes redemption_logs)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://promo-redemption-3.preview.emergentagent.com").rstrip("/")
ADMIN_NAME = "Admin"
ADMIN_PASS = "123456"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"name": ADMIN_NAME, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


# ---------- Cache-Control headers on every /api response ----------
@pytest.mark.parametrize("path", ["/api/settings", "/api/vouchers", "/api/stats", "/api/auth/me", "/api/reports/daily"])
def test_no_cache_headers(admin_session, path):
    r = admin_session.get(f"{BASE_URL}{path}", timeout=15)
    assert r.status_code == 200, f"{path} -> {r.status_code}"
    cc = r.headers.get("Cache-Control", "")
    pragma = r.headers.get("Pragma", "")
    assert "no-store" in cc.lower(), f"{path} missing no-store: {cc!r}"
    assert "no-cache" in pragma.lower(), f"{path} missing pragma no-cache: {pragma!r}"


# ---------- Delete consistency: single voucher delete removes redemption log ----------
def _create_and_redeem(admin_session, prefix):
    from datetime import datetime, timezone, timedelta
    exp = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    r = admin_session.post(
        f"{BASE_URL}/api/vouchers",
        json={"quantity": 1, "nominal": 12345, "prefix": prefix, "title": "IT9 Test", "expires_at": exp},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    v = r.json()["vouchers"][0]
    code = v["code"]
    _id = v["_id"]
    mp = admin_session.post(f"{BASE_URL}/api/vouchers/mark-printed", json={"codes": [code]}, timeout=15)
    assert mp.status_code == 200, mp.text
    rd = admin_session.post(f"{BASE_URL}/api/vouchers/redeem", json={"code": code}, timeout=15)
    assert rd.status_code == 200, rd.text
    return _id, code


def test_single_delete_reduces_stats_and_daily(admin_session):
    # baseline
    s0 = admin_session.get(f"{BASE_URL}/api/stats", timeout=15).json()
    d0 = admin_session.get(f"{BASE_URL}/api/reports/daily", timeout=15).json()
    base_today = s0.get("today_redeemed", 0)
    base_recent_len = len(s0.get("recent_redemptions", []))
    base_daily_total = sum(r["count"] for r in d0.get("report", []))

    vid, code = _create_and_redeem(admin_session, "IT9A")

    s1 = admin_session.get(f"{BASE_URL}/api/stats", timeout=15).json()
    d1 = admin_session.get(f"{BASE_URL}/api/reports/daily", timeout=15).json()
    assert s1["today_redeemed"] == base_today + 1
    assert any(r.get("voucher_code") == code for r in s1.get("recent_redemptions", []))
    assert sum(r["count"] for r in d1.get("report", [])) == base_daily_total + 1

    # Delete voucher -> redemption log should be gone too
    dr = admin_session.delete(f"{BASE_URL}/api/vouchers/{vid}", timeout=15)
    assert dr.status_code == 200, dr.text

    s2 = admin_session.get(f"{BASE_URL}/api/stats", timeout=15).json()
    d2 = admin_session.get(f"{BASE_URL}/api/reports/daily", timeout=15).json()
    assert s2["today_redeemed"] == base_today, f"stats today_redeemed did not decrease: {s2['today_redeemed']} vs base {base_today}"
    assert not any(r.get("voucher_code") == code for r in s2.get("recent_redemptions", [])), "redeemed voucher still in recent after delete"
    assert sum(r["count"] for r in d2.get("report", [])) == base_daily_total, "daily report count did not decrease after delete"


def test_bulk_delete_reduces_stats_and_daily(admin_session):
    s0 = admin_session.get(f"{BASE_URL}/api/stats", timeout=15).json()
    d0 = admin_session.get(f"{BASE_URL}/api/reports/daily", timeout=15).json()
    base_today = s0.get("today_redeemed", 0)
    base_daily = sum(r["count"] for r in d0.get("report", []))

    id1, c1 = _create_and_redeem(admin_session, "IT9B")
    id2, c2 = _create_and_redeem(admin_session, "IT9C")

    s1 = admin_session.get(f"{BASE_URL}/api/stats", timeout=15).json()
    assert s1["today_redeemed"] == base_today + 2

    br = admin_session.post(f"{BASE_URL}/api/vouchers/bulk-delete", json={"ids": [id1, id2]}, timeout=15)
    assert br.status_code == 200, br.text
    assert br.json().get("deleted") == 2

    s2 = admin_session.get(f"{BASE_URL}/api/stats", timeout=15).json()
    d2 = admin_session.get(f"{BASE_URL}/api/reports/daily", timeout=15).json()
    assert s2["today_redeemed"] == base_today
    assert sum(r["count"] for r in d2.get("report", [])) == base_daily
    codes_in_recent = {r.get("voucher_code") for r in s2.get("recent_redemptions", [])}
    assert c1 not in codes_in_recent and c2 not in codes_in_recent
