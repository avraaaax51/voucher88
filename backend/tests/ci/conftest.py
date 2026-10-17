"""Fixture pengujian CI yang terisolasi dari database produksi maupun preview.

Pengaman yang dipasang SEBELUM server.py diimpor:
- MONGO_URL wajib menunjuk ke localhost/127.0.0.1 (MongoDB sementara di CI).
  Bila MONGO_URL kosong, dipakai MongoDB tiruan di memori (mongomock-motor).
- DB_NAME wajib berawalan "ci_test_".
- Semua variabel env diisi nilai palsu, sehingga isi backend/.env (bila ada,
  mis. saat dijalankan di workspace Emergent) tidak pernah dipakai: load_dotenv
  tidak menimpa variabel yang sudah diset.
- Pengiriman email diganti stub; tidak ada request keluar ke layanan Emergent.
"""
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import pytest

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

ADMIN_PASSWORD = "135790"

_real_mongo_url = os.environ.get("CI_MONGO_URL", "").strip()
USE_MONGOMOCK = not _real_mongo_url

if USE_MONGOMOCK:
    # Alamat tak terpakai: koneksi tidak pernah dibuka karena db diganti mongomock.
    os.environ["MONGO_URL"] = "mongodb://127.0.0.1:1"
else:
    host = urlparse(_real_mongo_url).hostname or ""
    if host not in LOCAL_HOSTS:
        raise RuntimeError(f"CI_MONGO_URL harus ke MongoDB lokal/sementara, bukan '{host}'")
    os.environ["MONGO_URL"] = _real_mongo_url

os.environ["DB_NAME"] = os.environ.get("CI_DB_NAME", "ci_test_voucher88")
if not os.environ["DB_NAME"].startswith("ci_test_"):
    raise RuntimeError("DB_NAME untuk CI wajib berawalan 'ci_test_'")

os.environ.update({
    "JWT_SECRET": "ci-only-jwt-secret-not-used-anywhere-else",
    "ADMIN_EMAIL": "admin@example.invalid",
    "ADMIN_PASSWORD": ADMIN_PASSWORD,
    "EMERGENT_EMAIL_KEY": "ci-dummy-key",
    "EMAIL_FROM_NAME": "Voucher88 CI",
    "OWNER_EMAIL": "owner@example.invalid",
    "CORS_ORIGINS": "*",
})

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import server  # noqa: E402

if USE_MONGOMOCK:
    from mongomock_motor import AsyncMongoMockClient

    server.client = AsyncMongoMockClient()
    server.db = server.client[os.environ["DB_NAME"]]

assert server.db.name.startswith("ci_test_"), "Database CI tidak terisolasi"


@pytest.fixture(scope="session")
def sent_emails():
    return []


@pytest.fixture(scope="session")
def client(sent_emails):
    from fastapi.testclient import TestClient

    async def fake_send_email(*, to, subject, html):
        sent_emails.append({"to": to, "subject": subject})
        return "ci-fake-id"

    async def skip_write_test_credentials():
        return None

    server.send_email = fake_send_email
    # Jangan menimpa /app/memory/test_credentials.md bila tes dijalankan di workspace Emergent.
    server.write_test_credentials = skip_write_test_credentials

    # https agar cookie "secure" dari endpoint login ikut terkirim.
    with TestClient(server.app, base_url="https://testserver") as c:
        yield c

    if not USE_MONGOMOCK:
        from pymongo import MongoClient

        MongoClient(os.environ["MONGO_URL"]).drop_database(os.environ["DB_NAME"])


@pytest.fixture
def login(client):
    def _login(name, password):
        client.cookies.clear()
        res = client.post("/api/auth/login", json={"name": name, "password": password})
        assert res.status_code == 200, res.text
        return res.json()

    return _login
