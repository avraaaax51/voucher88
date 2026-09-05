"""Iteration 11: Print settings backend tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://promo-redemption-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"name": "Admin", "password": "123456"}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


def _get_settings(sess):
    r = sess.get(f"{API}/settings", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_get_settings_has_print_defaults(admin_session):
    data = _get_settings(admin_session)
    for k in ["print_paper_mm", "print_width_mm", "print_offset_mm", "print_scale", "print_feed_mm"]:
        assert k in data, f"Missing key: {k}"
    # Types
    assert isinstance(data["print_paper_mm"], int)
    assert isinstance(data["print_width_mm"], int)


def test_put_invalid_width_gt_paper(admin_session):
    base = _get_settings(admin_session)
    payload = {**base, "print_paper_mm": 80, "print_width_mm": 90}
    r = admin_session.put(f"{API}/settings", json=payload, timeout=30)
    assert r.status_code == 400, f"Expected 400 got {r.status_code}: {r.text}"


def test_put_invalid_offset_out_of_range(admin_session):
    base = _get_settings(admin_session)
    payload = {**base, "print_paper_mm": 80, "print_width_mm": 72, "print_offset_mm": 25}
    r = admin_session.put(f"{API}/settings", json=payload, timeout=30)
    assert r.status_code == 400, r.text


def test_put_invalid_scale_out_of_range(admin_session):
    base = _get_settings(admin_session)
    payload = {**base, "print_paper_mm": 80, "print_width_mm": 72, "print_offset_mm": 0, "print_scale": 30}
    r = admin_session.put(f"{API}/settings", json=payload, timeout=30)
    assert r.status_code == 400, r.text


def test_put_invalid_feed_out_of_range(admin_session):
    base = _get_settings(admin_session)
    payload = {**base, "print_paper_mm": 80, "print_width_mm": 72, "print_offset_mm": 0, "print_scale": 100, "print_feed_mm": 50}
    r = admin_session.put(f"{API}/settings", json=payload, timeout=30)
    assert r.status_code == 400, r.text


def test_put_valid_and_persist(admin_session):
    base = _get_settings(admin_session)
    payload = {
        **base,
        "print_paper_mm": 80,
        "print_width_mm": 68,
        "print_offset_mm": 2,
        "print_scale": 90,
        "print_feed_mm": 8,
    }
    r = admin_session.put(f"{API}/settings", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["print_width_mm"] == 68
    assert body["print_offset_mm"] == 2
    assert body["print_scale"] == 90
    assert body["print_feed_mm"] == 8
    # Verify via GET
    got = _get_settings(admin_session)
    assert got["print_width_mm"] == 68
    assert got["print_offset_mm"] == 2
    assert got["print_scale"] == 90
    assert got["print_feed_mm"] == 8
    assert got["print_paper_mm"] == 80


def test_restore_defaults(admin_session):
    """Restore original defaults for other iterations."""
    base = _get_settings(admin_session)
    payload = {
        **base,
        "print_paper_mm": 80,
        "print_width_mm": 72,
        "print_offset_mm": 0,
        "print_scale": 100,
        "print_feed_mm": 6,
    }
    r = admin_session.put(f"{API}/settings", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    got = _get_settings(admin_session)
    assert got["print_width_mm"] == 72
    assert got["print_offset_mm"] == 0
    assert got["print_scale"] == 100
    assert got["print_feed_mm"] == 6
