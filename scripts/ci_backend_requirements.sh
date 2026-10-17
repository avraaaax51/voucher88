#!/usr/bin/env bash
# Mencetak daftar paket Python yang dibutuhkan pengujian CI backend.
#
# Versi diambil langsung dari backend/requirements.txt supaya CI selalu memakai
# versi yang sama dengan workspace Emergent. Paket khusus Emergent
# (emergentintegrations, litellm dari server Emergent) sengaja tidak ikut karena
# tidak dipakai server.py dan tidak bisa diunduh di luar Emergent.
#
# Pemakaian: bash scripts/ci_backend_requirements.sh > /tmp/req-ci.txt
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REQ="$ROOT/backend/requirements.txt"

PACKAGES='fastapi|starlette|pydantic|pydantic_core|annotated-types|typing_extensions|typing-inspection|anyio|sniffio|idna|motor|pymongo|dnspython|bcrypt|PyJWT|qrcode|pillow|python-dotenv|httpx|httpcore|h11|certifi|email-validator|pytest|iniconfig|pluggy|packaging|Pygments'

grep -iE "^(${PACKAGES})==" "$REQ"
