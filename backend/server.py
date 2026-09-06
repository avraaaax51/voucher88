from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import FileResponse
import ipaddress
import re
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import quote, urlparse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import bcrypt
import jwt
import secrets
import string
import qrcode
import io
import base64
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Optional, Annotated
from contextlib import asynccontextmanager

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url, tz_aware=True)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_ALGORITHM = "HS256"

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

# Password hashing
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

# JWT Token Management
def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
        "type": "access"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

# Auth Helper
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Tidak terautentikasi")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token tidak valid")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User tidak ditemukan")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        user.pop("pin_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token sudah kadaluarsa")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")

# Role checker
def require_role(allowed_roles: list):
    async def role_checker(request: Request):
        user = await get_current_user(request)
        if user["role"] != "superadmin" and user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Akses ditolak")
        return user
    return role_checker


# ==================== EMAIL (Emergent managed) ====================
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
OWNER_EMAIL = os.environ["OWNER_EMAIL"]

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)

def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)

def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)

class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []
    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []
    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)
    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []

def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")

async def send_email(*, to: str, subject: str, html: str) -> str | None:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send", headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logging.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="Gagal mengirim email")
    except Exception as e:
        logging.error(f"Email send error: {e}")
        raise HTTPException(status_code=500, detail="Gagal mengirim email")

def reset_code_email_html(name: str, code: str) -> str:
    return (
        '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#111">'
        f'<h2 style="margin:0 0 12px">{escape(EMAIL_FROM_NAME)} - Kode Reset Sandi</h2>'
        f'<p>Permintaan reset sandi untuk akun <strong>{escape(name)}</strong>.</p>'
        f'<p style="font-size:32px;letter-spacing:8px;font-weight:bold;margin:16px 0">{escape(code)}</p>'
        '<p>Masukkan kode ini di halaman login aplikasi (menu "Lupa sandi") bersama sandi baru Anda. Kode berlaku 10 menit dan hanya bisa dipakai sekali.</p>'
        '<p>Jika Anda tidak meminta reset, abaikan email ini.</p>'
        f'<p style="font-size:12px;color:#888">Dikirim oleh {escape(EMAIL_FROM_NAME)}. Kami tidak pernah meminta sandi Anda melalui email.</p>'
        '</td></tr></table>'
    )

# Pydantic Models
class UserCreate(BaseModel):
    name: str
    password: str
    role: str = "kasir"
    email: Optional[str] = None

class UserLogin(BaseModel):
    name: str
    password: str

class ResetData(BaseModel):
    confirm: str

def validate_numeric_password(pw: str):
    if not (pw.isdigit() and len(pw) == 6):
        raise HTTPException(status_code=400, detail="Sandi harus 6 angka")

class VoucherCreate(BaseModel):
    title: str
    nominal: int
    terms: str = ""
    expires_at: str
    quantity: int = 1
    prefix: str = ""

class StoreSettings(BaseModel):
    store_prefix: str = "Toko"
    store_name: str = "ANEKA 88"
    store_branch: str = "MANGON"
    promo_line1: str = "BELANJA LEBIH HEMAT"
    promo_line2: str = "DI TOKO ANEKA 88 MANGON"
    expiry_warning_days: int = 7
    print_paper_mm: int = 80
    print_width_mm: int = 72
    print_offset_mm: float = 0
    print_scale: int = 100
    print_feed_mm: int = 6
    print_page_height_mm: int = 150
    print_method: str = "browser"
    print_agent_url: str = "http://localhost:9100"
    print_printer_name: str = ""

DEFAULT_SETTINGS = StoreSettings().model_dump()

async def get_settings_doc() -> dict:
    doc = await db.settings.find_one({"_id": "store"}, {"_id": 0})
    return {**DEFAULT_SETTINGS, **(doc or {})}

class UserReset(BaseModel):
    password: str

class ChangePassword(BaseModel):
    current_password: str
    new_password: str

class ForgotPassword(BaseModel):
    name: str

class ResetWithCode(BaseModel):
    name: str
    code: str
    new_password: str

class VoucherRedeem(BaseModel):
    code: str

class MarkPrinted(BaseModel):
    codes: list[str]

class BulkIds(BaseModel):
    ids: list[str]

class UserResponse(BaseModel):
    id: str = Field(alias="_id")
    email: str
    name: str
    role: str
    
    class Config:
        populate_by_name = True

# Generate unique voucher code: 7 alfanumerik campuran + 3 digit urutan (tanpa tanda hubung)
def generate_voucher_code(sequence: int, prefix: str = "") -> str:
    chars = string.ascii_uppercase + string.digits
    random_part = ''.join(secrets.choice(chars) for _ in range(7 - len(prefix)))
    sequence_part = str(sequence).zfill(3)
    return f"{prefix}{random_part}{sequence_part}"

# Generate QR Code as base64
def generate_qr_base64(data: str) -> str:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=12,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return base64.b64encode(buffer.getvalue()).decode()


def build_voucher_scan_url(request: Request, code: str) -> str:
    forwarded_scheme = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    forwarded_host = request.headers.get("x-forwarded-host", "").split(",")[0].strip()
    scheme = forwarded_scheme if forwarded_scheme in {"http", "https"} else request.url.scheme
    host = forwarded_host or request.headers.get("host", "")
    base_url = f"{scheme}://{host}" if host else str(request.base_url).rstrip("/")
    return f"{base_url}/?s={quote(code, safe='')}"


async def refresh_voucher_qr(voucher: dict, request: Request) -> None:
    scan_url = build_voucher_scan_url(request, voucher["code"])
    if voucher.get("scan_url") == scan_url:
        return

    qr_code = generate_qr_base64(scan_url)
    await db.vouchers.update_one(
        {"_id": voucher["_id"]},
        {"$set": {"scan_url": scan_url, "qr_code": qr_code}},
    )
    voucher["scan_url"] = scan_url
    voucher["qr_code"] = qr_code


async def record_login_activity(user: dict) -> None:
    await db.login_activities.insert_one(
        {
            "user_id": str(user["_id"]),
            "name": user["name"],
            "role": user["role"],
            "status": "success",
            "logged_at": datetime.now(timezone.utc),
        }
    )

# Startup event
async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    
    if await db.users.count_documents({"role": "superadmin"}) == 0:
        existing = await db.users.find_one({"name_lower": "admin"}) or await db.users.find_one({"email": admin_email})
        if existing:
            await db.users.update_one({"_id": existing["_id"]}, {"$set": {"role": "superadmin"}})
            logging.info("Existing admin promoted to superadmin")
        else:
            await db.users.insert_one({
                "email": admin_email,
                "password_hash": hash_password(admin_password),
                "name": "Admin",
                "name_lower": "admin",
                "role": "superadmin",
                "created_at": datetime.now(timezone.utc)
            })
            logging.info("Super admin created")
    async for u in db.users.find({"name_lower": {"$exists": False}}):
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"name_lower": u["name"].strip().lower()}})

async def create_indexes():
    try:
        await db.users.drop_index("email_1")
    except Exception:
        pass
    await db.users.create_index("email", unique=True, sparse=True)
    await db.users.create_index("name_lower", unique=True)
    await db.vouchers.create_index("code", unique=True)
    await db.vouchers.create_index("expires_at")
    await db.login_attempts.create_index("identifier")
    await db.login_activities.create_index("logged_at")

async def write_test_credentials():
    """Write test credentials to memory file"""
    credentials_content = f"""# Voucher88 Test Credentials

## Admin Account
- Nama (username): Admin  (role: superadmin)
- Sandi aktif: dikelola pemilik dan tidak disimpan di berkas proyek.
- Lupa sandi: kode 6 digit dikirim ke OWNER_EMAIL ({os.environ.get("OWNER_EMAIL", "")}) via POST /api/auth/forgot-password
- Email (info only, not used for login): {os.environ.get("ADMIN_EMAIL", "admin@example.com")}
- Role: superadmin

## Auth Notes
- Login uses name + 6-digit numeric password (case-insensitive name). Cookie-only (httpOnly), no Bearer.
- Kasir accounts: create via Kelola User (name + 6-digit sandi).

## Auth Endpoints
- POST /api/auth/login - {{"name","password"}}
- GET /api/auth/me - Get current user
- POST /api/auth/logout - Logout

## Voucher Endpoints
- POST /api/vouchers - Create vouchers (admin)
- GET /api/vouchers - List all vouchers (admin)
- POST /api/vouchers/redeem - Redeem voucher (kasir/admin)
- GET /api/vouchers/stats - Get statistics (admin)
"""
    try:
        with open("/app/memory/test_credentials.md", "w") as f:
            f.write(credentials_content)
    except Exception as e:
        logging.error(f"Failed to write test credentials: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_indexes()
    await seed_admin()
    await write_test_credentials()
    yield
    client.close()

# Create FastAPI app
app = FastAPI(lifespan=lifespan)

# Create router with /api prefix
api_router = APIRouter(prefix="/api")

@app.middleware("http")
async def no_cache_api(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response

# CORS (credentials + cookies: "*" must be expressed as a regex so the origin is echoed back)
_cors = os.environ.get("CORS_ORIGINS", "*").strip()
_cors_kwargs = {"allow_origin_regex": ".*"} if _cors == "*" else {"allow_origins": [o.strip() for o in _cors.split(",") if o.strip()]}
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    **_cors_kwargs,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/login")
async def login(data: UserLogin, response: Response):
    name_lower = data.name.strip().lower()
    
    # Check brute force
    identifier = name_lower
    attempts = await db.login_attempts.find_one({"identifier": identifier})
    if attempts and attempts.get("count", 0) >= 5:
        lockout_until = attempts.get("lockout_until")
        if lockout_until and datetime.now(timezone.utc) < lockout_until:
            raise HTTPException(status_code=429, detail="Terlalu banyak percobaan. Coba lagi dalam 15 menit.")
        else:
            await db.login_attempts.delete_one({"identifier": identifier})
    
    user = await db.users.find_one({"name_lower": name_lower})
    if not user or not verify_password(data.password, user["password_hash"]):
        # Record failed attempt
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {
                "$inc": {"count": 1},
                "$set": {"lockout_until": datetime.now(timezone.utc) + timedelta(minutes=15)}
            },
            upsert=True
        )
        raise HTTPException(status_code=401, detail="Nama atau sandi salah")
    
    # Clear failed attempts
    await db.login_attempts.delete_one({"identifier": identifier})

    try:
        await record_login_activity(user)
    except Exception as error:
        logger.error("Failed to record login activity: %s", error)
    
    access_token = create_access_token(str(user["_id"]), user.get("email") or "", user["role"])
    refresh_token = create_refresh_token(str(user["_id"]))
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=28800, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    
    return {
        "_id": str(user["_id"]),
        "email": user.get("email"),
        "name": user["name"],
        "role": user["role"]
    }

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return user

@api_router.get("/auth/names")
async def public_login_names():
    """Names shown on the login page for quick selection"""
    users = await db.users.find({}, {"name": 1, "role": 1}).sort([("role", 1), ("name", 1)]).to_list(100)
    order = {"superadmin": 0, "admin": 1, "kasir": 2}
    users.sort(key=lambda u: (order.get(u["role"], 9), u["name"].lower()))
    return {"users": [{"name": u["name"], "role": u["role"]} for u in users]}

async def _check_rate(identifier: str, max_attempts: int = 5):
    attempts = await db.login_attempts.find_one({"identifier": identifier})
    if attempts and attempts.get("count", 0) >= max_attempts:
        if attempts.get("lockout_until") and datetime.now(timezone.utc) < attempts["lockout_until"]:
            raise HTTPException(status_code=429, detail="Terlalu banyak percobaan. Coba lagi dalam 15 menit.")
        await db.login_attempts.delete_one({"identifier": identifier})

async def _bump_rate(identifier: str):
    await db.login_attempts.update_one(
        {"identifier": identifier},
        {"$inc": {"count": 1}, "$set": {"lockout_until": datetime.now(timezone.utc) + timedelta(minutes=15)}},
        upsert=True,
    )

@api_router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPassword):
    """Send a 6-digit reset code to the fixed owner email (admin/superadmin accounts only)"""
    name_lower = data.name.strip().lower()
    identifier = f"forgot:{name_lower}"
    await _check_rate(identifier, max_attempts=3)
    await _bump_rate(identifier)
    user = await db.users.find_one({"name_lower": name_lower, "role": {"$in": ["admin", "superadmin"]}})
    masked = OWNER_EMAIL[:3] + "***" + OWNER_EMAIL[OWNER_EMAIL.index("@"):]
    if not user:
        raise HTTPException(status_code=400, detail="Akun admin dengan nama tersebut tidak ditemukan")
    code = f"{secrets.randbelow(1000000):06d}"
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"reset_code_hash": hash_password(code), "reset_code_expires": datetime.now(timezone.utc) + timedelta(minutes=10)}}
    )
    await send_email(to=OWNER_EMAIL, subject=f"{EMAIL_FROM_NAME} - Kode reset sandi {user['name']}", html=reset_code_email_html(user["name"], code))
    return {"message": f"Kode reset dikirim ke {masked}. Berlaku 10 menit.", "email_hint": masked}

@api_router.post("/auth/reset-with-code")
async def reset_with_code(data: ResetWithCode):
    name_lower = data.name.strip().lower()
    identifier = f"reset:{name_lower}"
    await _check_rate(identifier)
    validate_numeric_password(data.new_password)
    user = await db.users.find_one({"name_lower": name_lower, "role": {"$in": ["admin", "superadmin"]}})
    ok = (
        user and user.get("reset_code_hash") and user.get("reset_code_expires")
        and datetime.now(timezone.utc) <= user["reset_code_expires"]
        and verify_password(data.code.strip(), user["reset_code_hash"])
    )
    if not ok:
        await _bump_rate(identifier)
        raise HTTPException(status_code=400, detail="Kode salah atau sudah kedaluwarsa")
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password_hash": hash_password(data.new_password)}, "$unset": {"reset_code_hash": "", "reset_code_expires": ""}}
    )
    await db.login_attempts.delete_many({"identifier": {"$in": [identifier, f"forgot:{name_lower}", name_lower]}})
    return {"message": "Sandi berhasil direset. Silakan login dengan sandi baru."}

@api_router.post("/auth/change-password")
async def change_password(data: ChangePassword, user: dict = Depends(get_current_user)):
    validate_numeric_password(data.new_password)
    doc = await db.users.find_one({"_id": ObjectId(user["_id"])})
    if not doc or not verify_password(data.current_password, doc["password_hash"]):
        raise HTTPException(status_code=400, detail="Sandi saat ini salah")
    if data.new_password == data.current_password:
        raise HTTPException(status_code=400, detail="Sandi baru harus berbeda dari sandi lama")
    await db.users.update_one({"_id": doc["_id"]}, {"$set": {"password_hash": hash_password(data.new_password)}})
    return {"message": "Sandi berhasil diganti"}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Berhasil logout"}

@api_router.post("/auth/register")
async def register(data: UserCreate, response: Response, admin: dict = Depends(require_role(["admin"]))):
    """Only admin can create new users"""
    name = data.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Nama minimal 2 karakter")
    validate_numeric_password(data.password)
    if data.role not in ("admin", "kasir"):
        raise HTTPException(status_code=400, detail="Role tidak valid")
    if data.role == "admin" and admin["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Hanya Super Admin yang dapat membuat akun admin")
    
    if await db.users.find_one({"name_lower": name.lower()}):
        raise HTTPException(status_code=400, detail="Nama sudah digunakan")
    
    user_doc = {
        "password_hash": hash_password(data.password),
        "name": name,
        "name_lower": name.lower(),
        "role": data.role,
        "created_at": datetime.now(timezone.utc)
    }
    email = data.email.strip().lower() if data.email else None
    if email:
        user_doc["email"] = email
    
    result = await db.users.insert_one(user_doc)
    
    return {
        "_id": str(result.inserted_id),
        "email": email,
        "name": data.name,
        "role": data.role
    }

@api_router.get("/users")
async def get_users(admin: dict = Depends(require_role(["admin"]))):
    """Get all users (admin only)"""
    users = await db.users.find({}, {"password_hash": 0, "pin_hash": 0}).to_list(1000)
    for u in users:
        u["_id"] = str(u["_id"])
    return users


@api_router.get("/users/login-activities")
async def get_login_activities(
    limit: int = 50,
    admin: dict = Depends(require_role(["superadmin"])),
):
    safe_limit = min(max(limit, 1), 100)
    activities = await db.login_activities.find(
        {},
        {"_id": 0},
    ).sort("logged_at", -1).limit(safe_limit).to_list(safe_limit)
    items = [
        {
            "user_id": activity["user_id"],
            "name": activity["name"],
            "role": activity["role"],
            "status": activity["status"],
            "logged_at": (
                activity["logged_at"].isoformat()
                if isinstance(activity["logged_at"], datetime)
                else activity["logged_at"]
            ),
        }
        for activity in activities
    ]
    return {"items": items}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_role(["admin"]))):
    if user_id == admin["_id"]:
        raise HTTPException(status_code=400, detail="Tidak bisa menghapus akun sendiri")
    target = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if target["role"] == "superadmin":
        raise HTTPException(status_code=400, detail="Akun Super Admin tidak bisa dihapus")
    if target["role"] == "admin" and admin["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Hanya Super Admin yang dapat menghapus admin")
    await db.users.delete_one({"_id": ObjectId(user_id)})
    return {"message": "User berhasil dihapus"}

@api_router.put("/users/{user_id}/reset")
async def reset_user_credentials(user_id: str, data: UserReset, admin: dict = Depends(require_role(["admin"]))):
    validate_numeric_password(data.password)
    target = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if target["role"] in ("admin", "superadmin") and admin["role"] != "superadmin" and str(target["_id"]) != admin["_id"]:
        raise HTTPException(status_code=403, detail="Hanya Super Admin yang dapat mereset sandi admin")
    update = {"password_hash": hash_password(data.password)}
    result = await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    return {"message": "Sandi berhasil direset"}

@api_router.post("/admin/reset-data")
async def reset_all_data(data: ResetData, admin: dict = Depends(require_role(["admin"]))):
    """Delete all vouchers, redemption logs and counters (users & settings kept)"""
    if data.confirm != "HAPUS SEMUA":
        raise HTTPException(status_code=400, detail='Ketik "HAPUS SEMUA" untuk konfirmasi')
    v = await db.vouchers.delete_many({})
    r = await db.redemption_logs.delete_many({})
    await db.counters.delete_many({})
    await db.login_attempts.delete_many({})
    return {"message": "Semua data voucher berhasil dihapus", "vouchers_deleted": v.deleted_count, "redemptions_deleted": r.deleted_count}

# ==================== VOUCHER ROUTES ====================

@api_router.post("/vouchers")
async def create_vouchers(
    data: VoucherCreate,
    request: Request,
    admin: dict = Depends(require_role(["admin"])),
):
    """Create vouchers (admin only)"""
    prefix = data.prefix.strip().upper()
    if prefix and (not prefix.isalnum() or not prefix.isascii()):
        raise HTTPException(status_code=400, detail="Prefix hanya boleh huruf dan angka")
    if len(prefix) > 4:
        raise HTTPException(status_code=400, detail="Prefix maksimal 4 karakter (kode tetap 10 karakter)")
    
    # Get current sequence
    counter = await db.counters.find_one_and_update(
        {"_id": "voucher_sequence"},
        {"$inc": {"seq": data.quantity}},
        upsert=True,
        return_document=True
    )
    start_seq = counter.get("seq", data.quantity) - data.quantity + 1
    
    expires_at = datetime.fromisoformat(data.expires_at.replace("Z", "+00:00"))
    
    vouchers = []
    for i in range(data.quantity):
        code = generate_voucher_code(start_seq + i, prefix)
        scan_url = build_voucher_scan_url(request, code)
        qr_base64 = generate_qr_base64(scan_url)
        
        voucher = {
            "code": code,
            "title": data.title,
            "nominal": data.nominal,
            "terms": data.terms,
            "qr_code": qr_base64,
            "scan_url": scan_url,
            "status": "draft",
            "printed": False,
            "printed_at": None,
            "created_at": datetime.now(timezone.utc),
            "expires_at": expires_at,
            "created_by": admin["_id"],
            "redeemed_at": None,
            "redeemed_by": None
        }
        vouchers.append(voucher)
    
    await db.vouchers.insert_many(vouchers)
    
    # Return created vouchers
    for v in vouchers:
        v["_id"] = str(v.get("_id", ""))
        v["created_at"] = v["created_at"].isoformat()
        v["expires_at"] = v["expires_at"].isoformat()
    
    return {"message": f"Berhasil membuat {data.quantity} voucher", "vouchers": vouchers}

@api_router.delete("/vouchers/{voucher_id}")
async def delete_voucher(voucher_id: str, admin: dict = Depends(require_role(["admin"]))):
    result = await db.vouchers.delete_one({"_id": ObjectId(voucher_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Voucher tidak ditemukan")
    await db.redemption_logs.delete_many({"voucher_id": voucher_id})
    return {"message": "Voucher berhasil dihapus"}

@api_router.post("/vouchers/bulk-delete")
async def bulk_delete_vouchers(data: BulkIds, admin: dict = Depends(require_role(["admin"]))):
    oids = [ObjectId(i) for i in data.ids if ObjectId.is_valid(i)]
    result = await db.vouchers.delete_many({"_id": {"$in": oids}})
    await db.redemption_logs.delete_many({"voucher_id": {"$in": [str(o) for o in oids]}})
    return {"message": f"{result.deleted_count} voucher dihapus", "deleted": result.deleted_count}

@api_router.get("/redemptions/mine")
async def my_redemptions_today(user: dict = Depends(get_current_user)):
    """Today's redemptions by the current user"""
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(hours=7)
    logs = await db.redemption_logs.find(
        {"redeemed_by": user["_id"], "redeemed_at": {"$gte": start}}
    ).sort("redeemed_at", -1).limit(50).to_list(50)
    items = [{
        "voucher_code": l["voucher_code"],
        "nominal": l["nominal"],
        "redeemed_at": l["redeemed_at"].isoformat() if isinstance(l["redeemed_at"], datetime) else l["redeemed_at"],
    } for l in logs]
    return {"items": items, "count": len(items), "total_nominal": sum(i["nominal"] for i in items)}

@api_router.post("/vouchers/mark-printed")
async def mark_printed(data: MarkPrinted, admin: dict = Depends(require_role(["admin"]))):
    """Mark vouchers as printed; draft vouchers become active"""
    codes = [c.upper().strip() for c in data.codes if c]
    now = datetime.now(timezone.utc)
    activated = await db.vouchers.update_many(
        {"code": {"$in": codes}, "status": "draft"},
        {"$set": {"status": "active", "printed": True, "printed_at": now}}
    )
    await db.vouchers.update_many(
        {"code": {"$in": codes}, "printed": {"$ne": True}},
        {"$set": {"printed": True, "printed_at": now}}
    )
    await db.vouchers.update_many({"code": {"$in": codes}}, {"$inc": {"print_count": 1}})
    return {"message": f"{len(codes)} voucher ditandai tercetak", "activated": activated.modified_count}

@api_router.get("/vouchers")
async def get_vouchers(
    request: Request,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    user: dict = Depends(get_current_user)
):
    """Get all vouchers with optional filtering"""
    query = {}
    if status == "expiring":
        settings = await get_settings_doc()
        now = datetime.now(timezone.utc)
        query["status"] = "active"
        query["expires_at"] = {"$gt": now, "$lte": now + timedelta(days=settings["expiry_warning_days"])}
    elif status:
        query["status"] = status
    
    skip = (page - 1) * limit
    vouchers = await db.vouchers.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.vouchers.count_documents(query)
    
    for v in vouchers:
        await refresh_voucher_qr(v, request)
        v["_id"] = str(v["_id"])
        if v.get("created_at"):
            v["created_at"] = v["created_at"].isoformat() if isinstance(v["created_at"], datetime) else v["created_at"]
        if v.get("expires_at"):
            v["expires_at"] = v["expires_at"].isoformat() if isinstance(v["expires_at"], datetime) else v["expires_at"]
        if v.get("redeemed_at"):
            v["redeemed_at"] = v["redeemed_at"].isoformat() if isinstance(v["redeemed_at"], datetime) else v["redeemed_at"]
        if isinstance(v.get("printed_at"), datetime):
            v["printed_at"] = v["printed_at"].isoformat()
        v.setdefault("printed", True)
    
    return {"vouchers": vouchers, "total": total, "page": page, "limit": limit}

@api_router.get("/vouchers/{voucher_id}")
async def get_voucher(
    voucher_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Get single voucher by ID"""
    voucher = await db.vouchers.find_one({"_id": ObjectId(voucher_id)})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher tidak ditemukan")
    
    await refresh_voucher_qr(voucher, request)
    voucher["_id"] = str(voucher["_id"])
    if voucher.get("created_at"):
        voucher["created_at"] = voucher["created_at"].isoformat() if isinstance(voucher["created_at"], datetime) else voucher["created_at"]
    if voucher.get("expires_at"):
        voucher["expires_at"] = voucher["expires_at"].isoformat() if isinstance(voucher["expires_at"], datetime) else voucher["expires_at"]
    
    return voucher

@api_router.post("/vouchers/redeem")
async def redeem_voucher(data: VoucherRedeem, request: Request, user: dict = Depends(get_current_user)):
    """Redeem a voucher - atomic operation to prevent double redemption"""
    code = data.code.upper().strip()
    
    # Atomic find and update - only update if status is active
    result = await db.vouchers.find_one_and_update(
        {
            "code": code,
            "status": "active"
        },
        {
            "$set": {
                "status": "redeemed",
                "redeemed_at": datetime.now(timezone.utc),
                "redeemed_by": user["_id"]
            }
        },
        return_document=True
    )
    
    if not result:
        # Check why it failed
        voucher = await db.vouchers.find_one({"code": code})
        if not voucher:
            raise HTTPException(status_code=404, detail="Kode voucher tidak ditemukan")
        if voucher["status"] == "redeemed":
            raise HTTPException(status_code=400, detail="Voucher sudah pernah digunakan")
        if voucher["status"] == "expired":
            raise HTTPException(status_code=400, detail="Voucher sudah kadaluarsa")
        if voucher["status"] == "draft":
            raise HTTPException(status_code=400, detail="Voucher belum dicetak / belum aktif")
        raise HTTPException(status_code=400, detail="Voucher tidak dapat digunakan")
    
    # Check expiration
    expires_at = result["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    # Ensure timezone-aware comparison
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if datetime.now(timezone.utc) > expires_at:
        # Revert and mark as expired
        await db.vouchers.update_one(
            {"_id": result["_id"]},
            {"$set": {"status": "expired", "redeemed_at": None, "redeemed_by": None}}
        )
        raise HTTPException(status_code=400, detail="Voucher sudah kadaluarsa")
    
    # Log redemption
    await db.redemption_logs.insert_one({
        "voucher_id": str(result["_id"]),
        "voucher_code": code,
        "nominal": result["nominal"],
        "redeemed_by": user["_id"],
        "redeemed_by_name": user["name"],
        "redeemed_at": datetime.now(timezone.utc)
    })
    
    result["_id"] = str(result["_id"])
    result["created_at"] = result["created_at"].isoformat() if isinstance(result["created_at"], datetime) else result["created_at"]
    result["expires_at"] = result["expires_at"].isoformat() if isinstance(result["expires_at"], datetime) else result["expires_at"]
    result["redeemed_at"] = result["redeemed_at"].isoformat() if isinstance(result["redeemed_at"], datetime) else result["redeemed_at"]
    
    return {
        "success": True,
        "message": "Voucher berhasil digunakan!",
        "voucher": result
    }

@api_router.get("/vouchers/check/{code}")
async def check_voucher(code: str, user: dict = Depends(get_current_user)):
    """Check voucher status without redeeming"""
    code = code.upper().strip()
    voucher = await db.vouchers.find_one({"code": code})
    
    if not voucher:
        raise HTTPException(status_code=404, detail="Kode voucher tidak ditemukan")
    
    # Check expiration
    expires_at = voucher["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    # Ensure timezone-aware comparison
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    is_expired = datetime.now(timezone.utc) > expires_at
    
    voucher["_id"] = str(voucher["_id"])
    voucher["created_at"] = voucher["created_at"].isoformat() if isinstance(voucher["created_at"], datetime) else voucher["created_at"]
    voucher["expires_at"] = voucher["expires_at"].isoformat() if isinstance(voucher["expires_at"], datetime) else voucher["expires_at"]
    if voucher.get("redeemed_at"):
        voucher["redeemed_at"] = voucher["redeemed_at"].isoformat() if isinstance(voucher["redeemed_at"], datetime) else voucher["redeemed_at"]
    
    voucher["is_expired"] = is_expired
    voucher["can_redeem"] = voucher["status"] == "active" and not is_expired
    
    return voucher

@api_router.get("/stats")
async def get_stats(admin: dict = Depends(require_role(["admin"]))):
    """Get voucher statistics"""
    now = datetime.now(timezone.utc)
    
    total = await db.vouchers.count_documents({})
    draft = await db.vouchers.count_documents({"status": "draft"})
    active = await db.vouchers.count_documents({"status": "active", "expires_at": {"$gt": now}})
    redeemed = await db.vouchers.count_documents({"status": "redeemed"})
    expired = await db.vouchers.count_documents({
        "$or": [
            {"status": "expired"},
            {"status": "active", "expires_at": {"$lte": now}}
        ]
    })
    
    settings = await get_settings_doc()
    warn_until = now + timedelta(days=settings["expiry_warning_days"])
    expiring_soon = await db.vouchers.count_documents({
        "status": "active", "expires_at": {"$gt": now, "$lte": warn_until}
    })
    
    # Total nominal redeemed
    pipeline = [
        {"$match": {"status": "redeemed"}},
        {"$group": {"_id": None, "total": {"$sum": "$nominal"}}}
    ]
    result = await db.vouchers.aggregate(pipeline).to_list(1)
    total_nominal_redeemed = result[0]["total"] if result else 0
    
    # Today's redemptions
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_redeemed = await db.redemption_logs.count_documents({
        "redeemed_at": {"$gte": today_start}
    })
    
    # Recent redemptions
    recent = await db.redemption_logs.find().sort("redeemed_at", -1).limit(10).to_list(10)
    for r in recent:
        r["_id"] = str(r["_id"])
        r["redeemed_at"] = r["redeemed_at"].isoformat() if isinstance(r["redeemed_at"], datetime) else r["redeemed_at"]
    
    return {
        "total": total,
        "draft": draft,
        "active": active,
        "redeemed": redeemed,
        "expired": expired,
        "expiring_soon": expiring_soon,
        "expiry_warning_days": settings["expiry_warning_days"],
        "total_nominal_redeemed": total_nominal_redeemed,
        "today_redeemed": today_redeemed,
        "recent_redemptions": recent
    }

@api_router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    return await get_settings_doc()

@api_router.put("/settings")
async def update_settings(data: StoreSettings, admin: dict = Depends(require_role(["admin"]))):
    if data.expiry_warning_days < 1 or data.expiry_warning_days > 365:
        raise HTTPException(status_code=400, detail="Ambang peringatan harus 1-365 hari")
    if not 50 <= data.print_paper_mm <= 120 or not 40 <= data.print_width_mm <= data.print_paper_mm:
        raise HTTPException(status_code=400, detail="Lebar cetak harus 40mm s/d lebar kertas (50-120mm)")
    if data.print_method not in ("browser", "agent"):
        raise HTTPException(status_code=400, detail="Metode cetak tidak valid")
    if data.print_page_height_mm != 0 and not 60 <= data.print_page_height_mm <= 400:
        raise HTTPException(status_code=400, detail="Tinggi halaman harus 0 (otomatis) atau 60-400mm")
    if not -20 <= data.print_offset_mm <= 20 or not 50 <= data.print_scale <= 150 or not 0 <= data.print_feed_mm <= 40:
        raise HTTPException(status_code=400, detail="Nilai geser (-20..20mm), skala (50-150%) atau feed (0-40mm) tidak valid")
    payload = data.model_dump()
    await db.settings.update_one({"_id": "store"}, {"$set": payload}, upsert=True)
    return payload

@api_router.get("/print-agent/download/{filename}")
async def download_print_agent(filename: str):
    allowed = {
        "voucher_print_agent.py": "text/x-python",
        "jalankan_print_agent.bat": "application/x-bat",
        "Voucher88PrintAgent.ps1": "text/plain",
        "Voucher88PrintAgent.bat": "application/x-bat",
    }
    if filename not in allowed:
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    return FileResponse(ROOT_DIR / "static" / filename, media_type=allowed[filename], filename=filename)

@api_router.get("/reports/daily")
async def get_daily_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    admin: dict = Depends(require_role(["admin"]))
):
    """Get daily redemption report"""
    now = datetime.now(timezone.utc)
    
    if not start_date:
        start = now - timedelta(days=30)
    else:
        start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
    
    if not end_date:
        end = now
    else:
        end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
    
    pipeline = [
        {"$match": {"redeemed_at": {"$gte": start, "$lte": end}}},
        {
            "$group": {
                "_id": {
                    "$dateToString": {"format": "%Y-%m-%d", "date": "$redeemed_at"}
                },
                "count": {"$sum": 1},
                "total_nominal": {"$sum": "$nominal"}
            }
        },
        {"$sort": {"_id": -1}}
    ]
    
    result = await db.redemption_logs.aggregate(pipeline).to_list(100)
    
    cashier_pipeline = [
        {"$match": {"redeemed_at": {"$gte": start, "$lte": end}}},
        {"$group": {
            "_id": "$redeemed_by",
            "name": {"$last": "$redeemed_by_name"},
            "count": {"$sum": 1},
            "total_nominal": {"$sum": "$nominal"},
            "last_redeemed_at": {"$max": "$redeemed_at"},
        }},
        {"$sort": {"count": -1, "total_nominal": -1}},
    ]
    by_cashier = await db.redemption_logs.aggregate(cashier_pipeline).to_list(100)
    
    return {
        "report": [{"date": r["_id"], "count": r["count"], "total_nominal": r["total_nominal"]} for r in result],
        "by_cashier": [{
            "user_id": str(c["_id"]),
            "name": c.get("name") or "-",
            "count": c["count"],
            "total_nominal": c["total_nominal"],
            "last_redeemed_at": c["last_redeemed_at"].isoformat() if isinstance(c["last_redeemed_at"], datetime) else c["last_redeemed_at"],
        } for c in by_cashier],
        "start_date": start.isoformat(),
        "end_date": end.isoformat()
    }

@api_router.get("/")
async def root():
    return {"message": "VoucherKu API", "version": "1.0.0"}

# Include router
app.include_router(api_router)
