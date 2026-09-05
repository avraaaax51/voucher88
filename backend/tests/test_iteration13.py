"""Iteration 13: direct print agent + settings.print_method/url/printer_name backend tests."""
import base64
import os
import time
import requests
import pytest
from pathlib import Path

def _load_env():
    for line in (Path(__file__).resolve().parents[2] / "frontend" / ".env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError("no url")

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_env()).rstrip("/")
API = f"{BASE_URL}/api"
AGENT = "http://127.0.0.1:9100"
OUT = "/tmp/escpos_out.bin"


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"name": "Admin", "password": "123456"})
    assert r.status_code == 200, r.text
    return s


def _save(sess, patch):
    cur = sess.get(f"{API}/settings").json()
    cur.pop("_id", None)
    cur.update(patch)
    r = sess.put(f"{API}/settings", json=cur)
    return r


# --- Settings defaults / validation ---
def test_defaults(admin):
    r = admin.get(f"{API}/settings")
    assert r.status_code == 200
    d = r.json()
    assert "print_method" in d and d["print_method"] in ("browser", "agent")
    assert "print_agent_url" in d
    assert "print_printer_name" in d


def test_invalid_method(admin):
    r = _save(admin, {"print_method": "xyz"})
    assert r.status_code == 400


def test_set_agent_then_restore(admin):
    r = _save(admin, {"print_method": "agent"})
    assert r.status_code == 200
    assert admin.get(f"{API}/settings").json()["print_method"] == "agent"
    r = _save(admin, {"print_method": "browser"})
    assert r.status_code == 200
    assert admin.get(f"{API}/settings").json()["print_method"] == "browser"


# --- Download endpoints ---
def test_download_py(admin):
    r = admin.get(f"{API}/print-agent/download/voucher_print_agent.py")
    assert r.status_code == 200
    assert "win32print" in r.text


def test_download_bat(admin):
    r = admin.get(f"{API}/print-agent/download/jalankan_print_agent.bat")
    assert r.status_code == 200
    assert len(r.content) > 0


def test_download_bad(admin):
    r = admin.get(f"{API}/print-agent/download/other.txt")
    assert r.status_code == 404


# --- Local agent smoke tests ---
def test_agent_status():
    r = requests.get(f"{AGENT}/status", timeout=5)
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_agent_print_writes_file():
    payload = {"data": base64.b64encode(b"abc").decode()}
    r = requests.post(f"{AGENT}/print", json=payload, timeout=5)
    assert r.status_code == 200
    assert r.json().get("ok") is True
    time.sleep(0.2)
    with open(OUT, "rb") as f:
        assert f.read() == b"abc"
