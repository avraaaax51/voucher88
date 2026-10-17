"""Tes kesiapan Railway: daftar paket, penyedia email, dan tautan QR di balik proxy.

Tidak ada email sungguhan yang dikirim: pemanggilan HTTP/SMTP diganti tiruan.
"""
import asyncio
from pathlib import Path

import pytest
from fastapi import HTTPException

import server
from conftest import ADMIN_PASSWORD

REAL_SEND_EMAIL = server.send_email  # disimpan sebelum fixture `client` memasang stub
BACKEND = Path(__file__).resolve().parents[2]


def _requirements(name):
    lines = (BACKEND / name).read_text().splitlines()
    return [ln.strip() for ln in lines if ln.strip() and not ln.startswith("#")]


def test_railway_requirements_match_emergent_versions():
    emergent = set(_requirements("requirements.txt"))
    railway = _requirements("requirements-railway.txt")
    assert railway, "requirements-railway.txt kosong"
    for line in railway:
        assert line in emergent, f"{line} tidak sama persis dengan requirements.txt"
    joined = "\n".join(railway).lower()
    assert "emergentintegrations" not in joined and "litellm" not in joined


@pytest.fixture
def email_env(monkeypatch):
    def configure(provider, **values):
        monkeypatch.setattr(server, "EMAIL_PROVIDER", provider)
        monkeypatch.setattr(server, "OWNER_EMAIL", values.pop("owner", "owner@example.invalid"))
        for key, value in values.items():
            monkeypatch.setattr(server, key, value)

    return configure


def _send():
    return asyncio.run(REAL_SEND_EMAIL(to="owner@example.invalid", subject="Tes", html="<p>Kode 123456</p>"))


def test_email_disabled_returns_503(email_env):
    email_env("disabled")
    with pytest.raises(HTTPException) as err:
        _send()
    assert err.value.status_code == 503


def test_email_missing_owner_returns_503(email_env):
    email_env("resend", owner="", RESEND_API_KEY="re_test", EMAIL_FROM_ADDRESS="noreply@example.invalid")
    assert server.email_config_error() == "OWNER_EMAIL belum diisi"


def test_email_unknown_provider_reported(email_env):
    email_env("pos-merpati")
    assert "tidak dikenal" in server.email_config_error()


def test_email_resend_payload(email_env, monkeypatch):
    calls = []

    async def fake_post(url, headers, payload):
        calls.append((url, headers, payload))
        return {"id": "re-1"}

    email_env("resend", RESEND_API_KEY="re_test_key", EMAIL_FROM_ADDRESS="noreply@example.invalid", EMAIL_FROM_NAME="Voucher88")
    monkeypatch.setattr(server, "_email_http_post", fake_post)
    assert _send() == "re-1"
    url, headers, payload = calls[0]
    assert url == "https://api.resend.com/emails"
    assert headers == {"Authorization": "Bearer re_test_key"}
    assert payload["from"] == "Voucher88 <noreply@example.invalid>"
    assert payload["to"] == ["owner@example.invalid"]


def test_email_emergent_payload_unchanged(email_env, monkeypatch):
    calls = []

    async def fake_post(url, headers, payload):
        calls.append((url, headers, payload))
        return {"id": "em-1"}

    email_env("emergent", EMAIL_KEY="em_key", EMAIL_FROM_NAME="Voucher88")
    monkeypatch.setattr(server, "_email_http_post", fake_post)
    assert _send() == "em-1"
    url, headers, payload = calls[0]
    assert url == "https://integrations.emergentagent.com/api/v1/email/send"
    assert headers == {"X-Email-Key": "em_key"}
    assert payload == {"to": ["owner@example.invalid"], "subject": "Tes", "html": "<p>Kode 123456</p>", "from_name": "Voucher88"}


def test_email_smtp_message(email_env, monkeypatch):
    sent = []
    email_env("smtp", SMTP_HOST="smtp.example.invalid", EMAIL_FROM_ADDRESS="noreply@example.invalid", EMAIL_FROM_NAME="Voucher88")
    monkeypatch.setattr(server, "_smtp_send", sent.append)
    _send()
    message = sent[0]
    assert message["To"] == "owner@example.invalid"
    assert message["From"] == "Voucher88 <noreply@example.invalid>"
    assert "123456" in message.get_body(("html",)).get_content()


def test_email_provider_error_is_not_leaked(email_env, monkeypatch):
    async def failing_post(url, headers, payload):
        raise RuntimeError("koneksi gagal ke re_test_key")

    email_env("resend", RESEND_API_KEY="re_test_key", EMAIL_FROM_ADDRESS="noreply@example.invalid")
    monkeypatch.setattr(server, "_email_http_post", failing_post)
    with pytest.raises(HTTPException) as err:
        _send()
    assert err.value.status_code == 500 and "re_test_key" not in err.value.detail


def test_forgot_password_disabled_does_not_store_code(client, monkeypatch):
    monkeypatch.setattr(server, "EMAIL_PROVIDER", "disabled")
    client.cookies.clear()
    res = client.post("/api/auth/forgot-password", json={"name": "Admin"})
    assert res.status_code == 503
    user = _find_admin()
    assert "reset_code_hash" not in user


async def _find_admin_async():
    return await server.db.users.find_one({"name_lower": "admin"})


def _find_admin():
    import conftest

    if conftest.USE_MONGOMOCK:
        return asyncio.run(_find_admin_async())
    import os

    from pymongo import MongoClient

    return MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]].users.find_one({"name_lower": "admin"})


def test_qr_link_uses_public_domain_behind_proxy(client, login):
    login("Admin", ADMIN_PASSWORD)
    headers = {"X-Forwarded-Host": "staging.example.invalid", "X-Forwarded-Proto": "https"}
    payload = {"title": "Proxy", "nominal": 1000, "expires_at": "2099-01-01T00:00:00Z"}
    res = client.post("/api/vouchers", json=payload, headers=headers)
    assert res.status_code == 200, res.text
    voucher = res.json()["vouchers"][0]
    assert voucher["scan_url"] == f"https://staging.example.invalid/?s={voucher['code']}"
