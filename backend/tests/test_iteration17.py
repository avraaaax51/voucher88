"""Iteration 17: Super Admin role + forgot password via email flow."""
import os
import time
import pytest
import requests
import bcrypt
from datetime import datetime, timezone
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path("/app/backend/.env"))

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://promo-redemption-3.preview.emergentagent.com"
API = f"{BASE}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

SUPER_NAME = "Admin"
SUPER_PW = "123321"


def login(name, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"name": name, "password": pw})
    assert r.status_code == 200, f"login {name} failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def super_session():
    return login(SUPER_NAME, SUPER_PW)


@pytest.fixture(scope="module")
def mongo():
    client = AsyncIOMotorClient(MONGO_URL, tz_aware=True)
    yield client[DB_NAME]
    client.close()


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ---------- Roles ----------
def test_super_admin_role_on_login():
    r = requests.post(f"{API}/auth/login", json={"name": SUPER_NAME, "password": SUPER_PW})
    assert r.status_code == 200
    assert r.json()["role"] == "superadmin"


def test_public_names_endpoint():
    r = requests.get(f"{API}/auth/names")
    assert r.status_code == 200
    users = r.json()["users"]
    assert len(users) > 0
    for u in users:
        assert set(u.keys()) == {"name", "role"}
    # superadmin should exist
    assert any(u["role"] == "superadmin" for u in users)


def test_superadmin_creates_admin_and_admin_permissions(super_session):
    # Cleanup possibly leftover
    for n in ("TEST_admin2", "TEST_kasir9"):
        run(mongo_cleanup(n))

    r = super_session.post(f"{API}/auth/register", json={"name": "TEST_admin2", "password": "222222", "role": "admin"})
    assert r.status_code == 200, r.text
    admin_id = r.json()["_id"]

    # Login as TEST_admin2
    admin_sess = login("TEST_admin2", "222222")

    # Admin cannot register another admin
    r2 = admin_sess.post(f"{API}/auth/register", json={"name": "TEST_admin3", "password": "444444", "role": "admin"})
    assert r2.status_code == 403

    # Admin can create kasir
    r3 = admin_sess.post(f"{API}/auth/register", json={"name": "TEST_kasir9", "password": "333333", "role": "kasir"})
    assert r3.status_code == 200
    kasir_id = r3.json()["_id"]

    # DELETE superadmin -> 400
    sa_id = super_session.post(f"{API}/auth/login", json={"name": SUPER_NAME, "password": SUPER_PW}).json()["_id"]
    r4 = admin_sess.delete(f"{API}/users/{sa_id}")
    assert r4.status_code == 400

    # Create another admin (via super) to test admin-cannot-delete-admin
    r5 = super_session.post(f"{API}/auth/register", json={"name": "TEST_admin4", "password": "555555", "role": "admin"})
    assert r5.status_code == 200
    admin4_id = r5.json()["_id"]

    r6 = admin_sess.delete(f"{API}/users/{admin4_id}")
    assert r6.status_code == 403

    # Admin resets superadmin password -> 403
    r7 = admin_sess.put(f"{API}/users/{sa_id}/reset", json={"password": "999999"})
    assert r7.status_code == 403

    # Admin resets own kasir -> 200
    r8 = admin_sess.put(f"{API}/users/{kasir_id}/reset", json={"password": "334455"})
    assert r8.status_code == 200

    # Super cleanup
    r9 = super_session.delete(f"{API}/users/{admin_id}")
    assert r9.status_code == 200
    r10 = super_session.delete(f"{API}/users/{admin4_id}")
    assert r10.status_code == 200
    r11 = super_session.delete(f"{API}/users/{kasir_id}")
    assert r11.status_code == 200


async def mongo_cleanup(name):
    client = AsyncIOMotorClient(MONGO_URL, tz_aware=True)
    db = client[DB_NAME]
    await db.users.delete_many({"name_lower": name.lower()})
    client.close()


# ---------- Forgot flow ----------
def test_forgot_password_rejects_kasir():
    # Clear rate limit first
    run(_clear_forgot_rate("kasir 1"))
    r = requests.post(f"{API}/auth/forgot-password", json={"name": "Kasir 1"})
    assert r.status_code == 400


async def _clear_forgot_rate(name):
    client = AsyncIOMotorClient(MONGO_URL, tz_aware=True)
    db = client[DB_NAME]
    await db.login_attempts.delete_many({"identifier": {"$regex": f"^forgot:{name.lower()}"}})
    await db.login_attempts.delete_many({"identifier": {"$regex": f"^reset:{name.lower()}"}})
    await db.login_attempts.delete_many({"identifier": name.lower()})
    client.close()


def test_forgot_password_admin_sends_and_stores_hash():
    run(_clear_forgot_rate(SUPER_NAME))
    r = requests.post(f"{API}/auth/forgot-password", json={"name": SUPER_NAME})
    if r.status_code == 502:
        pytest.skip("Managed email provider failed (502)")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email_hint"].startswith("avr") and "***" in body["email_hint"] and "@gmail.com" in body["email_hint"]
    # Verify DB
    doc = run(_get_user(SUPER_NAME))
    assert doc.get("reset_code_hash")
    assert doc.get("reset_code_expires")
    exp = doc["reset_code_expires"]
    now = datetime.now(timezone.utc)
    delta = (exp - now).total_seconds()
    assert 8 * 60 < delta < 12 * 60


async def _get_user(name):
    client = AsyncIOMotorClient(MONGO_URL, tz_aware=True)
    db = client[DB_NAME]
    doc = await db.users.find_one({"name_lower": name.lower()})
    client.close()
    return doc


def test_reset_with_wrong_code_and_brute_force_lockout():
    run(_clear_forgot_rate(SUPER_NAME))
    # Ensure reset hash exists (issue a forgot request first)
    r = requests.post(f"{API}/auth/forgot-password", json={"name": SUPER_NAME})
    if r.status_code == 502:
        pytest.skip("email 502")
    assert r.status_code == 200
    # 5 wrong attempts -> 400s; 6th -> 429
    codes_seen = []
    for i in range(5):
        rr = requests.post(f"{API}/auth/reset-with-code", json={"name": SUPER_NAME, "code": "000000", "new_password": "111111"})
        codes_seen.append(rr.status_code)
        assert rr.status_code == 400
    rr = requests.post(f"{API}/auth/reset-with-code", json={"name": SUPER_NAME, "code": "000000", "new_password": "111111"})
    assert rr.status_code == 429, f"expected 429 got {rr.status_code} {rr.text}"
    # Clear
    run(_clear_forgot_rate(SUPER_NAME))


def test_forgot_rate_limit_3_per_15min():
    run(_clear_forgot_rate(SUPER_NAME))
    statuses = []
    for i in range(3):
        r = requests.post(f"{API}/auth/forgot-password", json={"name": SUPER_NAME})
        statuses.append(r.status_code)
    # allow 502 skip
    if 502 in statuses:
        pytest.skip("email provider 502")
    assert all(s == 200 for s in statuses), statuses
    r4 = requests.post(f"{API}/auth/forgot-password", json={"name": SUPER_NAME})
    assert r4.status_code == 429
    run(_clear_forgot_rate(SUPER_NAME))


def test_reset_with_code_end_to_end_via_direct_hash():
    """Simulate: set known code hash directly, then reset -> login with new pw, then restore."""
    run(_clear_forgot_rate(SUPER_NAME))
    from datetime import timedelta
    code = "654321"
    code_hash = bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()
    exp = datetime.now(timezone.utc) + timedelta(minutes=10)
    run(_set_reset(SUPER_NAME, code_hash, exp))
    r = requests.post(f"{API}/auth/reset-with-code", json={"name": SUPER_NAME, "code": code, "new_password": "654321"})
    assert r.status_code == 200, r.text
    # Login with new
    s = login(SUPER_NAME, "654321")
    # Change back to 123321
    r2 = s.post(f"{API}/auth/change-password", json={"current_password": "654321", "new_password": SUPER_PW})
    assert r2.status_code == 200, r2.text
    # Verify old pw works
    login(SUPER_NAME, SUPER_PW)
    run(_clear_forgot_rate(SUPER_NAME))


async def _set_reset(name, code_hash, exp):
    client = AsyncIOMotorClient(MONGO_URL, tz_aware=True)
    db = client[DB_NAME]
    await db.users.update_one({"name_lower": name.lower()}, {"$set": {"reset_code_hash": code_hash, "reset_code_expires": exp}})
    client.close()


# ---------- Old endpoints removed ----------
def test_old_endpoints_removed():
    for path in ("/auth/recovery-code", "/auth/recover"):
        r = requests.post(f"{API}{path}", json={})
        assert r.status_code in (404, 405), f"{path} -> {r.status_code}"


# ---------- Final cleanup ----------
def test_zzz_final_cleanup():
    """Ensure admin pw is 123321 and login_attempts collection is cleared."""
    login(SUPER_NAME, SUPER_PW)
    run(_final_cleanup())


async def _final_cleanup():
    client = AsyncIOMotorClient(MONGO_URL, tz_aware=True)
    db = client[DB_NAME]
    await db.login_attempts.delete_many({})
    await db.users.delete_many({"name_lower": {"$in": ["test_admin2", "test_admin3", "test_admin4", "test_kasir9"]}})
    client.close()
