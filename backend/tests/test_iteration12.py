"""Iteration 12: print_page_height_mm setting validation & persistence"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"name": "Admin", "password": "123456"})
    assert r.status_code == 200, r.text
    return s


def _get(client):
    r = client.get(f"{BASE_URL}/api/settings")
    assert r.status_code == 200
    return r.json()


def _put(client, settings, override):
    payload = {**settings, **override}
    return client.put(f"{BASE_URL}/api/settings", json=payload)


def test_default_has_150(client):
    s = _get(client)
    assert "print_page_height_mm" in s
    # Ensure known baseline
    r = _put(client, s, {"print_page_height_mm": 150})
    assert r.status_code == 200
    assert _get(client)["print_page_height_mm"] == 150


def test_below_min_rejected(client):
    s = _get(client)
    r = _put(client, s, {"print_page_height_mm": 30})
    assert r.status_code == 400
    assert _get(client)["print_page_height_mm"] == 150


def test_above_max_rejected(client):
    s = _get(client)
    r = _put(client, s, {"print_page_height_mm": 500})
    assert r.status_code == 400
    assert _get(client)["print_page_height_mm"] == 150


def test_zero_accepted(client):
    s = _get(client)
    r = _put(client, s, {"print_page_height_mm": 0})
    assert r.status_code == 200
    assert _get(client)["print_page_height_mm"] == 0


def test_valid_160_persisted(client):
    s = _get(client)
    r = _put(client, s, {"print_page_height_mm": 160})
    assert r.status_code == 200
    assert _get(client)["print_page_height_mm"] == 160


def test_restore_150(client):
    s = _get(client)
    r = _put(client, s, {"print_page_height_mm": 150})
    assert r.status_code == 200
    assert _get(client)["print_page_height_mm"] == 150
