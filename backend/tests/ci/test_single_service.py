"""Tes mode satu service (Railway): frontend disajikan backend, JWT secret otomatis."""
import asyncio

from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

import server


def _frontend_app(tmp_path):
    build = tmp_path / "build"
    (build / "static" / "js").mkdir(parents=True)
    (build / "index.html").write_text('<div id="root"></div>')
    (build / "static" / "js" / "main.js").write_text("console.log(1)")
    (build / "manifest.json").write_text("{}")
    (tmp_path / "rahasia.txt").write_text("JANGAN TERBACA")

    app = FastAPI()
    api = APIRouter(prefix="/api")

    @api.get("/")
    async def root():
        return {"message": "ok"}

    app.include_router(api)
    server.mount_frontend(app, str(build))
    return TestClient(app)


def test_frontend_routes(tmp_path):
    client = _frontend_app(tmp_path)
    assert client.get("/api/").json() == {"message": "ok"}
    for path in ("/", "/admin/vouchers", "/kasir", "/?s=ABCDEFG001"):
        res = client.get(path)
        assert res.status_code == 200 and 'id="root"' in res.text, path
        assert res.headers["cache-control"] == "no-cache"
    js = client.get("/static/js/main.js")
    assert js.text == "console.log(1)" and "immutable" in js.headers["cache-control"]
    assert client.get("/manifest.json").text == "{}"


def test_unknown_api_is_404_not_index(tmp_path):
    client = _frontend_app(tmp_path)
    res = client.get("/api/tidak-ada")
    assert res.status_code == 404 and 'id="root"' not in res.text


def test_no_path_traversal(tmp_path):
    client = _frontend_app(tmp_path)
    for path in ("/../rahasia.txt", "/static/../../rahasia.txt", "/%2e%2e/rahasia.txt"):
        assert "JANGAN TERBACA" not in client.get(path).text, path


class _FakeCollection:
    def __init__(self):
        self.docs = {}

    async def find_one(self, query):
        return self.docs.get(query["_id"])

    async def insert_one(self, doc):
        if doc["_id"] in self.docs:
            raise RuntimeError("duplicate")
        self.docs[doc["_id"]] = doc


class _FakeDb:
    def __init__(self):
        self.app_secrets = _FakeCollection()


def test_jwt_secret_generated_once_and_reused(monkeypatch):
    fake = _FakeDb()
    monkeypatch.setattr(server, "db", fake)
    monkeypatch.setattr(server, "JWT_SECRET_VALUE", "")
    asyncio.run(server.ensure_jwt_secret())
    first = server.JWT_SECRET_VALUE
    assert len(first) >= 40 and fake.app_secrets.docs["jwt"]["value"] == first

    # "Restart": nilai di memori hilang, tetapi kunci yang sama dimuat dari database.
    monkeypatch.setattr(server, "JWT_SECRET_VALUE", "")
    asyncio.run(server.ensure_jwt_secret())
    assert server.JWT_SECRET_VALUE == first


def test_jwt_secret_from_env_is_not_replaced(monkeypatch):
    fake = _FakeDb()
    monkeypatch.setattr(server, "db", fake)
    monkeypatch.setattr(server, "JWT_SECRET_VALUE", "dari-env")
    asyncio.run(server.ensure_jwt_secret())
    assert server.JWT_SECRET_VALUE == "dari-env" and not fake.app_secrets.docs


def test_backup_never_contains_jwt_secret():
    assert "app_secrets" in server.BACKUP_SKIP_COLLECTIONS
    assert "app_secrets" in server.RESTORE_SKIP_COLLECTIONS
