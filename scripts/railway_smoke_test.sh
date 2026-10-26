#!/usr/bin/env bash
# Uji asap (smoke test) deployment Railway/Docker: frontend + proxy /api + backend.
#
# Pemakaian:
#   bash scripts/railway_smoke_test.sh https://<domain-staging>
#       -> hanya membaca (tidak mengubah data).
#   SMOKE_ADMIN_PASSWORD=<sandi admin STAGING> bash scripts/railway_smoke_test.sh https://<domain-staging> --write
#       -> juga login, membuat 1 voucher uji, memeriksa tautan QR, lalu menghapusnya.
#
# Opsi env: SMOKE_ADMIN_NAME (default Admin), SMOKE_HOST_HEADER (mengirim header
# Host lain, dipakai CI untuk meniru domain baru), SMOKE_FORWARDED_PROTO (mengirim
# X-Forwarded-Proto, dipakai CI untuk meniru proxy depan Railway yang selalu https).
# Mode --write ditolak untuk domain produksi.
set -euo pipefail

BASE="${1:-}"
MODE="${2:-}"
[ -n "$BASE" ] || { echo "Pemakaian: $0 <base-url> [--write]"; exit 2; }
BASE="${BASE%/}"
ADMIN_NAME="${SMOKE_ADMIN_NAME:-Admin}"
HOST_HEADER="${SMOKE_HOST_HEADER:-}"
FORWARDED_PROTO="${SMOKE_FORWARDED_PROTO:-}"
PUBLIC_HOST="${HOST_HEADER:-$(printf '%s' "$BASE" | sed -E 's#^[a-z]+://##; s#/.*$##')}"

case "$BASE" in
  *aneka88voucher.com*)
    if [ "$MODE" = "--write" ]; then echo "DITOLAK: mode --write tidak boleh dipakai pada domain produksi."; exit 2; fi ;;
esac

PASS=0
FAIL=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ok() { PASS=$((PASS + 1)); echo "  ok    - $1"; }
ko() { FAIL=$((FAIL + 1)); echo "  GAGAL - $1"; }

req() { # req <method> <path> [data] -> body di $TMP/body, header di $TMP/head, kode di CODE
  local method="$1" path="$2" data="${3:-}"
  local args=(-sS -o "$TMP/body" -D "$TMP/head" -w '%{http_code}' -X "$method" --max-time 20)
  [ -n "$HOST_HEADER" ] && args+=(-H "Host: $HOST_HEADER")
  [ -n "$FORWARDED_PROTO" ] && args+=(-H "X-Forwarded-Proto: $FORWARDED_PROTO")
  [ -n "${COOKIE:-}" ] && args+=(-H "Cookie: $COOKIE")
  if [ -n "$data" ]; then
    printf '%s' "$data" > "$TMP/data"
    args+=(-H "Content-Type: application/json" --data-binary "@$TMP/data")
  fi
  CODE="$(curl "${args[@]}" "$BASE$path" || echo 000)"
}

body_has() { grep -qF -- "$1" "$TMP/body"; }

echo "# Uji baca ($BASE)"
req GET /api/
if [ "$CODE" = 200 ] && body_has '"message"'; then ok "backend lewat proxy: GET /api/ -> 200"; else ko "GET /api/ -> $CODE"; fi

req GET /
if [ "$CODE" = 200 ] && body_has 'id="root"'; then ok "frontend: GET / -> 200"; else ko "GET / -> $CODE"; fi
if ! body_has 'assets.emergent.sh' && ! body_has 'ap.emergent.sh'; then ok "tidak memuat skrip Emergent"; else ko "index.html masih memuat skrip Emergent"; fi

req GET /admin/vouchers
if [ "$CODE" = 200 ] && body_has 'id="root"'; then ok "rute aplikasi (/admin/vouchers) disajikan index.html"; else ko "GET /admin/vouchers -> $CODE"; fi

req GET "/?s=SMOKE00001"
if [ "$CODE" = 200 ] && body_has 'id="root"'; then ok "tautan QR /?s=KODE membuka aplikasi"; else ko "GET /?s=... -> $CODE"; fi

req GET /api/auth/me
if [ "$CODE" = 401 ]; then ok "tanpa login: /api/auth/me -> 401"; else ko "/api/auth/me tanpa login -> $CODE"; fi

if [ "$MODE" = "--write" ]; then
  echo "# Uji tulis (data staging)"
  : "${SMOKE_ADMIN_PASSWORD:?isi SMOKE_ADMIN_PASSWORD dengan sandi admin STAGING}"
  req POST /api/auth/login "{\"name\":\"$ADMIN_NAME\",\"password\":\"$SMOKE_ADMIN_PASSWORD\"}"
  COOKIE="$(grep -i '^set-cookie: access_token=' "$TMP/head" | head -1 | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]*).*/\1/' | tr -d '\r' || true)"
  if [ "$CODE" = 200 ] && [ -n "$COOKIE" ]; then ok "login berhasil, cookie access_token diterima"; else ko "login -> $CODE"; fi
  if grep -i '^set-cookie: access_token=' "$TMP/head" | grep -qi 'httponly' && grep -i '^set-cookie: access_token=' "$TMP/head" | grep -qi 'secure'; then
    ok "cookie login HttpOnly + Secure"
  else
    ko "cookie login tidak HttpOnly/Secure"
  fi

  req GET /api/auth/me
  if [ "$CODE" = 200 ]; then ok "dengan cookie: /api/auth/me -> 200"; else ko "/api/auth/me dengan cookie -> $CODE"; fi

  EXP="$(date -u -d '+1 day' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+1d +%Y-%m-%dT%H:%M:%SZ)"
  req POST /api/vouchers "{\"title\":\"SMOKE TEST\",\"nominal\":1000,\"expires_at\":\"$EXP\",\"quantity\":1}"
  if [ "$CODE" = 200 ]; then
    read -r VID VCODE SCAN < <(python3 -c 'import json,sys; v=json.load(open(sys.argv[1]))["vouchers"][0]; print(v["_id"], v["code"], v["scan_url"])' "$TMP/body")
    if [ "$SCAN" = "https://$PUBLIC_HOST/?s=$VCODE" ]; then ok "tautan QR memakai domain baru: $SCAN"; else ko "tautan QR salah: $SCAN (harap https://$PUBLIC_HOST/?s=$VCODE)"; fi
    req DELETE "/api/vouchers/$VID"
    if [ "$CODE" = 200 ]; then ok "voucher uji dihapus kembali"; else ko "hapus voucher uji -> $CODE"; fi
  else
    ko "buat voucher uji -> $CODE"
  fi
fi

echo
echo "Hasil: $PASS lulus, $FAIL gagal"
[ "$FAIL" -eq 0 ]
