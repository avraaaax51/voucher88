"""Tes backup & pemulihan data (jalur pindah database Emergent -> Railway).

Pemulihan diuji ke database CI kedua yang masih baru (berawalan ci_test_),
bukan ke database utama tes.
"""
import asyncio
import os

import pytest
from bson import json_util

import conftest
import server
from conftest import ADMIN_PASSWORD

FRESH_DB = os.environ["DB_NAME"] + "_restore"


def _insert(db_name, collection, doc):
    if conftest.USE_MONGOMOCK:
        asyncio.run(server.client[db_name][collection].insert_one(doc))
    else:
        from pymongo import MongoClient

        MongoClient(os.environ["MONGO_URL"])[db_name][collection].insert_one(doc)


def _drop(db_name):
    if not conftest.USE_MONGOMOCK:
        from pymongo import MongoClient

        MongoClient(os.environ["MONGO_URL"]).drop_database(db_name)


@pytest.fixture
def backup(client, login):
    login("Admin", ADMIN_PASSWORD)
    payload = {"title": "Backup CI", "nominal": 15000, "expires_at": "2099-01-01T00:00:00Z", "quantity": 2}
    assert client.post("/api/vouchers", json=payload).status_code == 200
    res = client.get("/api/admin/backup")
    assert res.status_code == 200, res.text
    assert "attachment" in res.headers["content-disposition"]
    return json_util.loads(res.content)


def test_backup_contents(backup):
    assert backup["format"] == "voucher88-backup" and backup["version"] == 1
    cols = backup["collections"]
    assert "login_attempts" not in cols
    assert backup["counts"]["vouchers"] == len(cols["vouchers"]) >= 2
    voucher = cols["vouchers"][0]
    assert voucher["qr_code"] and voucher["scan_url"].endswith(voucher["code"])
    assert any(u["role"] == "superadmin" and u.get("password_hash") for u in cols["users"])


def test_backup_only_superadmin(client, login):
    login("Admin", ADMIN_PASSWORD)
    res = client.post("/api/auth/register", json={"name": "Admin Biasa CI", "password": "112233", "role": "admin"})
    assert res.status_code == 200, res.text
    login("admin biasa ci", "112233")
    assert client.get("/api/admin/backup").status_code == 403
    assert client.get("/api/admin/restore-status").status_code == 403
    client.cookies.clear()
    assert client.get("/api/admin/backup").status_code == 401


def test_restore_blocked_on_existing_data(client, login, monkeypatch):
    login("Admin", ADMIN_PASSWORD)
    status = client.get("/api/admin/restore-status").json()
    assert status["allowed"] is False
    assert any("ALLOW_RESTORE" in r for r in status["reasons"])
    monkeypatch.setattr(server, "ALLOW_RESTORE", True)
    status = client.get("/api/admin/restore-status").json()
    assert status["allowed"] is False and any("voucher" in r for r in status["reasons"])
    res = client.post("/api/admin/restore?confirm=PULIHKAN", content=b"{}")
    assert res.status_code == 409


def test_restore_into_fresh_database(client, login, backup, monkeypatch):
    admin = next(u for u in backup["collections"]["users"] if u["role"] == "superadmin")
    raw = json_util.dumps(backup, json_options=json_util.CANONICAL_JSON_OPTIONS).encode()
    monkeypatch.setattr(server, "ALLOW_RESTORE", True)
    monkeypatch.setattr(server, "db", server.client[FRESH_DB])
    try:
        # Database baru: hanya berisi akun hasil seed (sama dengan sesi login saat ini).
        _insert(FRESH_DB, "users", dict(admin))
        assert client.get("/api/admin/restore-status").json() == {"allowed": True, "reasons": []}

        assert client.post("/api/admin/restore?confirm=salah", content=raw).status_code == 400
        assert client.post("/api/admin/restore?confirm=PULIHKAN", content=b"bukan json").status_code == 400
        bad = json_util.dumps({"format": "lain", "version": 1, "collections": {}}).encode()
        assert client.post("/api/admin/restore?confirm=PULIHKAN", content=bad).status_code == 400

        res = client.post("/api/admin/restore?confirm=PULIHKAN", content=raw)
        assert res.status_code == 200, res.text
        counts = res.json()["counts"]
        assert counts["vouchers"] == backup["counts"]["vouchers"]
        assert counts["users"] == backup["counts"]["users"]

        # Data hasil pemulihan sama persis: kode, QR, status, tanggal.
        login("Admin", ADMIN_PASSWORD)
        listed = client.get("/api/vouchers?limit=500").json()
        assert listed["total"] == backup["counts"]["vouchers"]
        original = {v["code"]: v for v in backup["collections"]["vouchers"]}
        for v in listed["vouchers"]:
            assert v["code"] in original
            assert v["status"] == original[v["code"]]["status"]

        again = client.post("/api/admin/restore?confirm=PULIHKAN", content=raw)
        assert again.status_code == 409
    finally:
        _drop(FRESH_DB)
