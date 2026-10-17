"""Pengujian asap (smoke test) backend untuk CI.

Fokus: alur utama tetap bekerja dan hal yang TIDAK BOLEH berubah tetap sama
(format kode voucher, isi QR `/?s=KODE`, penukaran sekali pakai, peran user).
Semua berjalan di database sementara; lihat conftest.py.
"""
import re
from datetime import datetime, timedelta, timezone

import server
from conftest import ADMIN_PASSWORD

KASIR_NAME = "Kasir CI"
KASIR_PASSWORD = "246802"


def _expiry(days=30):
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def _create_vouchers(client, **overrides):
    payload = {"title": "Voucher CI", "nominal": 50000, "expires_at": _expiry(), "quantity": 1}
    payload.update(overrides)
    res = client.post("/api/vouchers", json=payload)
    assert res.status_code == 200, res.text
    return res.json()["vouchers"]


def test_root_endpoint(client):
    res = client.get("/api/")
    assert res.status_code == 200


def test_isolated_database():
    assert server.db.name.startswith("ci_test_")


def test_requires_login(client):
    client.cookies.clear()
    assert client.get("/api/vouchers").status_code == 401
    assert client.get("/api/stats").status_code == 401


def test_superadmin_seeded_and_can_login(client, login):
    user = login("Admin", ADMIN_PASSWORD)
    assert user["role"] == "superadmin"
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert "password_hash" not in me.json()


def test_wrong_password_rejected(client):
    client.cookies.clear()
    res = client.post("/api/auth/login", json={"name": "Admin", "password": "000000"})
    assert res.status_code == 401


def test_voucher_code_format_unchanged():
    for prefix in ("", "AB", "ABCD"):
        code = server.generate_voucher_code(7, prefix)
        assert len(code) == 10
        assert re.fullmatch(rf"{prefix}[A-Z0-9]{{{7 - len(prefix)}}}007", code)


def test_create_voucher_qr_payload_unchanged(client, login):
    login("Admin", ADMIN_PASSWORD)
    [voucher] = _create_vouchers(client, prefix="ci")
    code = voucher["code"]

    assert len(code) == 10 and code.startswith("CI")
    assert voucher["status"] == "draft"
    # Isi QR = tautan cepat ke kasir dengan format /?s=KODE (dipakai voucher yang sudah dicetak).
    assert voucher["scan_url"] == f"https://testserver/?s={code}"
    assert voucher["qr_code"] == server.generate_qr_base64(voucher["scan_url"])


def test_expiry_required(client, login):
    login("Admin", ADMIN_PASSWORD)
    res = client.post("/api/vouchers", json={"title": "x", "nominal": 1000, "expires_at": ""})
    assert res.status_code == 400


def test_redeem_flow_is_single_use(client, login):
    login("Admin", ADMIN_PASSWORD)
    [voucher] = _create_vouchers(client, nominal=25000)
    code = voucher["code"]

    res = client.post("/api/vouchers/redeem", json={"code": code})
    assert res.status_code == 400, "voucher draft (belum dicetak) tidak boleh bisa ditukar"

    res = client.post("/api/vouchers/mark-printed", json={"codes": [code]})
    assert res.status_code == 200 and res.json()["activated"] == 1

    check = client.get(f"/api/vouchers/check/{code}")
    assert check.status_code == 200 and check.json()["can_redeem"] is True

    res = client.post("/api/vouchers/redeem", json={"code": code.lower()})
    assert res.status_code == 200, res.text
    assert res.json()["voucher"]["status"] == "redeemed"

    again = client.post("/api/vouchers/redeem", json={"code": code})
    assert again.status_code == 400

    mine = client.get("/api/redemptions/mine").json()
    assert any(item["voucher_code"] == code for item in mine["items"])


def test_unknown_code_rejected(client, login):
    login("Admin", ADMIN_PASSWORD)
    res = client.post("/api/vouchers/redeem", json={"code": "TIDAKADA00"})
    assert res.status_code == 404


def test_kasir_role_limits(client, login):
    login("Admin", ADMIN_PASSWORD)
    res = client.post("/api/auth/register", json={"name": KASIR_NAME, "password": KASIR_PASSWORD, "role": "kasir"})
    assert res.status_code == 200, res.text
    [voucher] = _create_vouchers(client)
    client.post("/api/vouchers/mark-printed", json={"codes": [voucher["code"]]})

    user = login(KASIR_NAME.lower(), KASIR_PASSWORD)
    assert user["role"] == "kasir"
    assert client.get("/api/stats").status_code == 403
    assert client.post("/api/vouchers", json={"title": "x", "nominal": 1, "expires_at": _expiry()}).status_code == 403
    res = client.post("/api/vouchers/redeem", json={"code": voucher["code"]})
    assert res.status_code == 200, res.text


def test_reports_and_stats(client, login):
    login("Admin", ADMIN_PASSWORD)
    stats = client.get("/api/stats")
    assert stats.status_code == 200
    assert stats.json()["redeemed"] >= 1
    report = client.get("/api/reports/daily")
    assert report.status_code == 200
    assert sum(day["count"] for day in report.json()["report"]) >= 1


def test_settings_roundtrip(client, login):
    login("Admin", ADMIN_PASSWORD)
    settings = client.get("/api/settings")
    assert settings.status_code == 200
    data = settings.json()
    res = client.put("/api/settings", json=data)
    assert res.status_code == 200, res.text


def test_print_agent_downloads(client):
    for name in ("voucher_print_agent.py", "jalankan_print_agent.bat", "Voucher88PrintAgent.ps1"):
        assert client.get(f"/api/print-agent/download/{name}").status_code == 200
    assert client.get("/api/print-agent/download/server.py").status_code == 404


def test_no_real_email_sent(sent_emails):
    assert all(mail["to"].endswith(".invalid") for mail in sent_emails)
