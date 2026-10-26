#!/usr/bin/env bash
# RC, LOGS, CODE_LINES, SUP_CALLS dipakai di dalam ekspresi `check` (lewat eval).
# shellcheck disable=SC2034
# Pengujian scripts/emergent_sync.sh dengan repository git tiruan.
# Tidak memakai jaringan luar, database, atau workspace Emergent sungguhan.
#
# Pemakaian: bash scripts/tests/test_emergent_sync.sh
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/emergent_sync.sh"
WORK="$(mktemp -d)"
PASS=0
FAIL=0
SERVER_PID=""

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

ok() { PASS=$((PASS + 1)); echo "  ok   - $1"; }
ko() { FAIL=$((FAIL + 1)); echo "  GAGAL- $1"; }
check() { if eval "$1"; then ok "$2"; else ko "$2"; echo "         kondisi: $1"; sed 's/^/         | /' "$OUT" | tail -n 25; fi; }
out_has() { grep -qF -- "$1" "$OUT"; }

# ---------------------------------------------------------------- fixture ----

# Server kesehatan tiruan: /api/ -> {"message":...}, / -> <div id="root">
mkdir -p "$WORK/www/api"
echo '{"message":"VoucherKu API","version":"1.0.0"}' > "$WORK/www/api/index.html"
echo '<html><body><div id="root"></div></body></html>' > "$WORK/www/index.html"
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$WORK/www" >/dev/null 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.1; done
GOOD_BACKEND="http://127.0.0.1:$PORT/api/"
GOOD_FRONTEND="http://127.0.0.1:$PORT/"
DEAD_URL="http://127.0.0.1:1/"

# Paket Python tiruan untuk cek dependensi (dibaca lewat importlib.metadata).
SITE="$WORK/site"
set_fake_pkg_version() {
  rm -rf "$SITE" && mkdir -p "$SITE/fakepkg-$1.dist-info"
  printf 'Metadata-Version: 2.1\nName: fakepkg\nVersion: %s\n' "$1" > "$SITE/fakepkg-$1.dist-info/METADATA"
}

# yarn tiruan: hasil `yarn check --integrity` diatur lewat FAKE_YARN_RC.
FAKE_YARN="$WORK/fake-yarn"
printf '#!/bin/sh\nexit "${FAKE_YARN_RC:-0}"\n' > "$FAKE_YARN"
chmod +x "$FAKE_YARN"

# supervisorctl tiruan: mencatat setiap perintah; hasil restart diatur FAKE_SUP_RC.
FAKE_SUP="$WORK/fake-supervisorctl"
SUP_ALL="$WORK/sup-all.log"
cat > "$FAKE_SUP" <<'SUP'
#!/bin/sh
echo "$*" >> "$FAKE_SUP_LOG"
echo "$*" >> "$FAKE_SUP_ALL"
case "$1" in
  status) echo "$2                          RUNNING   pid 1"; exit 0 ;;
  restart)
    if [ "${FAKE_SUP_RC:-0}" = 0 ]; then echo "$2: stopped"; echo "$2: started"; exit 0; fi
    echo "$2: ERROR (spawn error)"; exit "$FAKE_SUP_RC" ;;
esac
exit 1
SUP
chmod +x "$FAKE_SUP"
export FAKE_SUP_ALL="$SUP_ALL"

git_q() { git -c user.email=ci@example.invalid -c user.name=ci -c init.defaultBranch=main "$@"; }

setup_repo() {
  local name="$1"
  T="$WORK/$name"
  mkdir -p "$T"
  git_q init -q --bare "$T/remote.git"
  git_q clone -q "$T/remote.git" "$T/dev" 2>/dev/null
  (
    cd "$T/dev" || exit 1
    git_q checkout -q -b main
    mkdir -p backend frontend scripts
    echo 'print("v1")' > backend/server.py
    echo 'X = 1' > backend/helper.py
    echo 'fakepkg==1.0' > backend/requirements.txt
    echo '{"name": "frontend"}' > frontend/package.json
    echo '# yarn lockfile v1' > frontend/yarn.lock
    printf '#!/bin/sh\necho ok\n' > scripts/tool.sh
    echo 'lama' > old.txt
    printf '.sync-logs/\nlocal.cfg\n.env\n' > .gitignore
    git_q add -A && git_q commit -q -m v1 && git_q push -q origin main 2>/dev/null
  )
  git_q clone -q -b main "$T/remote.git" "$T/app" 2>/dev/null
  APP="$T/app"
  OUT="$T/out.txt"
  set_fake_pkg_version 1.0
  export FAKE_YARN_RC=0 FAKE_SUP_RC=0 FAKE_SUP_LOG="$T/sup.log"
  : > "$FAKE_SUP_LOG"
}

upstream() { # upstream <pesan commit> <perintah...>
  local msg="$1"; shift
  (cd "$T/dev" && eval "$*" && git_q add -A && git_q commit -q -m "$msg" && git_q push -q origin main 2>/dev/null)
}

run() { # run [args] -> RC, OUT
  APP_DIR="$APP" BACKEND_HEALTH_URL="${BACKEND:-$GOOD_BACKEND}" FRONTEND_HEALTH_URL="${FRONTEND:-$GOOD_FRONTEND}" \
    SYNC_HEALTH_TIMEOUT=1 SYNC_YARN="$FAKE_YARN" SYNC_PYTHON=python3 PYTHONPATH="$SITE" \
    SYNC_SUPERVISORCTL="$FAKE_SUP" \
    bash "$SCRIPT" "$@" > "$OUT" 2>&1
  RC=$?
  # Kegagalan yang disengaja tidak boleh dilaporkan sebagai error tak terduga.
  if grep -q "tak terduga" "$OUT"; then ko "pesan 'GAGAL tak terduga' muncul ($(basename "$T") $*)"; sed 's/^/         | /' "$OUT"; fi
}

head_msg() { git -C "$APP" log -1 --format=%s; }
restarts() { grep '^restart ' "$FAKE_SUP_LOG" | sort | tr '\n' ' ' | sed 's/ $//'; }

# ------------------------------------------------------------------ tests ----

echo "# Sinkron normal"
setup_repo t01
run
check '[ $RC -eq 0 ] && out_has "SIAP DICEK"' "sudah terbaru -> SIAP (exit 0)"
upstream v2 'echo "print(\"v2\")" > backend/server.py'
run
check '[ $RC -eq 0 ] && [ "$(head_msg)" = v2 ] && out_has "SIAP DICEK"' "pembaruan normal -> fast-forward ke v2, SIAP"
check 'grep -q "	sync	.*	OK$" "$APP/.sync-logs/history.tsv"' "riwayat sinkron tercatat"
check '[ "$(stat -c %a "$APP/.sync-logs")" = 700 ]' "folder log hanya bisa dibaca pemilik (700)"

echo "# Pemeriksaan perubahan lokal"
setup_repo t02
upstream v2 'echo "print(2)" > backend/server.py'
echo '# edit lokal' >> "$APP/backend/server.py"
run
check '[ $RC -eq 1 ] && [ "$(head_msg)" = v1 ] && out_has "file terlacak yang diubah" && grep -q "edit lokal" "$APP/backend/server.py"' "file terlacak diubah lokal -> berhenti, tidak ada yang berubah"

setup_repo t03
upstream "tambah notes" 'echo "dari github" > notes.txt'
echo "catatan pengguna" > "$APP/notes.txt"
run
check '[ $RC -eq 1 ] && [ "$(head_msg)" = v1 ] && out_has "akan tertimpa" && [ "$(cat "$APP/notes.txt")" = "catatan pengguna" ]' "file baru tak terlacak tidak tertimpa"

setup_repo t04
upstream "tambah local.cfg" 'echo "dari github" > local.cfg && git add -f local.cfg'
echo "konfigurasi lokal" > "$APP/local.cfg"
run
check '[ $RC -eq 1 ] && [ "$(head_msg)" = v1 ] && [ "$(cat "$APP/local.cfg")" = "konfigurasi lokal" ]' "file lokal yang di-ignore tidak tertimpa"

setup_repo t05
upstream "env" 'echo "SECRET=1" > backend/.env && git add -f backend/.env'
run
check '[ $RC -eq 1 ] && [ "$(head_msg)" = v1 ] && out_has "file .env" && [ ! -e "$APP/backend/.env" ]' "perubahan file .env dari GitHub ditolak"

setup_repo t06
upstream v2 'echo "print(2)" > backend/server.py'
git_q -C "$APP" commit -q --allow-empty -m "Auto-generated changes"
run
check '[ $RC -eq 1 ] && [ "$(head_msg)" = "Auto-generated changes" ] && out_has "bercabang"' "workspace bercabang -> berhenti, commit lokal tetap ada"

setup_repo t07
git_q -C "$APP" checkout -q -b fitur
run
check '[ $RC -eq 1 ] && out_has "bukan '"'"'main'"'"'"' "bukan di branch main -> berhenti"

echo "# Kegagalan jaringan"
setup_repo t08
upstream v2 'echo "print(2)" > backend/server.py'
git -C "$APP" remote set-url origin "$T/tidak-ada.git"
run
check '[ $RC -eq 1 ] && [ "$(head_msg)" = v1 ] && out_has "git fetch tidak berhasil" && grep -q "FAIL_FETCH" "$APP/.sync-logs/history.tsv"' "fetch gagal -> berhenti tanpa reset"

echo "# Pemeriksaan kode setelah pull"
setup_repo t09
echo "file pengguna" > "$APP/catatan-pengguna.txt"
upstream "rusak" 'echo "def (" > backend/server.py && echo "baru" > backend/baru.py'
run
check '[ $RC -eq 1 ] && [ "$(head_msg)" = v1 ] && out_has "Kode kembali ke"' "server.py rusak -> kode dikembalikan (exit 1)"
check 'grep -q "v1" "$APP/backend/server.py" && [ ! -e "$APP/backend/baru.py" ] && [ "$(cat "$APP/catatan-pengguna.txt")" = "file pengguna" ]' "pengembalian otomatis tidak menghapus file tak terlacak pengguna"
check 'grep -q "AUTO_REVERTED" "$APP/.sync-logs/history.tsv" && ! out_has "SIAP DICEK"' "tercatat AUTO_REVERTED, tidak ada pesan SIAP"

setup_repo t10
upstream "helper rusak" 'echo "def (" > backend/helper.py'
run
check '[ $RC -eq 1 ] && [ "$(head_msg)" = v1 ] && out_has "backend/helper.py"' "modul Python lain yang rusak juga terdeteksi"

setup_repo t11
upstream "skrip rusak" 'printf "if then\n" > scripts/tool.sh'
run
check '[ $RC -eq 1 ] && [ "$(head_msg)" = v1 ] && out_has "scripts/tool.sh"' "skrip .sh rusak terdeteksi"

setup_repo t12
upstream "package rusak" 'echo "{tidak json" > frontend/package.json'
run
check '[ $RC -eq 1 ] && [ "$(head_msg)" = v1 ] && out_has "package.json GAGAL"' "package.json tidak valid terdeteksi"

echo "# Pemeriksaan kesehatan"
setup_repo t13
upstream v2 'echo "print(2)" > backend/server.py'
BACKEND="$DEAD_URL" run
check '[ $RC -eq 3 ] && [ "$(head_msg)" = v2 ] && out_has "Kesehatan backend" && out_has "GAGAL" && out_has "JANGAN Re-publish" && ! out_has "SIAP DICEK"' "backend tidak merespons -> GAGAL, BELUM SIAP, kode tidak di-reset"

setup_repo t14
FRONTEND="$DEAD_URL" run
check '[ $RC -eq 3 ] && out_has "Kesehatan frontend" && ! out_has "SIAP DICEK"' "frontend tidak merespons -> BELUM SIAP"

setup_repo t15
BACKEND="$GOOD_FRONTEND" run
check '[ $RC -eq 3 ] && ! out_has "SIAP DICEK"' "backend merespons tanpa isi API yang benar -> GAGAL"

echo "# Dependensi"
setup_repo t16
upstream "naik versi" 'echo "fakepkg==2.0" > backend/requirements.txt'
run
check '[ $RC -eq 3 ] && [ "$(head_msg)" = "naik versi" ] && out_has "Dependensi Python: BELUM TERPASANG" && out_has "dibutuhkan 2.0" && ! out_has "SIAP DICEK"' "dependensi Python baru belum terpasang -> BELUM SIAP"
set_fake_pkg_version 2.0
run
check '[ $RC -eq 0 ] && out_has "Dependensi Python: sesuai" && out_has "SIAP DICEK"' "setelah paket terpasang, jalankan ulang -> SIAP"

setup_repo t17
upstream "tambah komentar" 'printf "fakepkg==1.0\n# catatan\n" > backend/requirements.txt'
run
check '[ $RC -eq 0 ] && out_has "Dependensi Python: sesuai"' "requirements berubah tetapi sudah terpenuhi -> SIAP"

setup_repo t18
upstream "yarn" 'echo "# yarn lockfile v1 baru" > frontend/yarn.lock'
FAKE_YARN_RC=1 run
check '[ $RC -eq 3 ] && out_has "Dependensi frontend: BELUM TERPASANG" && ! out_has "SIAP DICEK"' "dependensi frontend belum terpasang -> BELUM SIAP"
FAKE_YARN_RC=0 run
check '[ $RC -eq 0 ] && out_has "Dependensi frontend: sesuai"' "setelah yarn install -> SIAP"

setup_repo t19
upstream "naik versi" 'echo "fakepkg==3.0" > backend/requirements.txt'
run
run --confirm-deps
run
check '[ $RC -eq 0 ] && out_has "Dependensi: tidak ada perubahan"' "--confirm-deps menandai dependensi terpasang"

echo "# Rollback"
setup_repo t20
upstream v2 'echo "print(2)" > backend/server.py && git rm -q old.txt'
run
V1="$(git -C "$APP" rev-parse HEAD~1)"
echo "data pengguna" > "$APP/data-pengguna.txt"
run --rollback "$V1"
check '[ $RC -eq 0 ] && [ "$(head_msg)" = v1 ] && [ -e "$APP/old.txt" ] && [ "$(cat "$APP/data-pengguna.txt")" = "data pengguna" ]' "rollback ke v1, file tak terlacak pengguna tetap ada"
check 'out_has "Database TIDAK dipulihkan" && out_has "TIDAK dikembalikan"' "rollback menegaskan database & dependensi tidak dipulihkan"

setup_repo t21
upstream v2 'echo "print(2)" > backend/server.py'
run
V1="$(git -C "$APP" rev-parse HEAD~1)"
echo "# edit" >> "$APP/backend/server.py"
run --rollback "$V1"
check '[ $RC -eq 1 ] && [ "$(head_msg)" = v2 ] && grep -q "# edit" "$APP/backend/server.py"' "rollback ditolak bila ada file terlacak yang diubah"

setup_repo t22
upstream v2 'git rm -q old.txt'
run
V1="$(git -C "$APP" rev-parse HEAD~1)"
echo "milik pengguna" > "$APP/old.txt"
run --rollback "$V1"
check '[ $RC -eq 1 ] && [ "$(head_msg)" = v2 ] && [ "$(cat "$APP/old.txt")" = "milik pengguna" ]' "rollback tidak menimpa file tak terlacak pengguna"

setup_repo t23
run --rollback deadbeefdeadbeef
check '[ $RC -eq 1 ] && out_has "tidak ditemukan"' "rollback ke versi tak dikenal ditolak"
(cd "$T/dev" && git_q checkout -q -b asing && git_q commit -q --allow-empty -m asing && git_q push -q origin asing 2>/dev/null)
git -C "$APP" fetch -q origin asing
run --rollback "$(git -C "$APP" rev-parse FETCH_HEAD)"
check '[ $RC -eq 1 ] && out_has "bukan bagian dari riwayat"' "rollback ke commit di luar main ditolak"

echo "# Keamanan log"
setup_repo t24
# Sengaja: rahasia palsu di pesan commit muncul di keluaran `git log`.
upstream "MONGO_URL=mongodb://user:sandi@db.example.invalid/x token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 https://u:p4ss@github.com/x" 'echo "print(2)" > backend/server.py'
run
LOGS="$(cat "$APP"/.sync-logs/*.log "$APP/.sync-logs/history.tsv")"
check '! grep -qE "sandi@|ghp_ABCDEF|p4ss" "$OUT" && ! grep -qE "sandi@|ghp_ABCDEF|p4ss" <<<"$LOGS"' "token/sandi/connection string disamarkan di layar dan log"
check '[ "$(stat -c %a "$(ls "$APP"/.sync-logs/sync-*.log | head -1)")" = 600 ]' "file log hanya bisa dibaca pemilik (600)"

echo "# Lain-lain"
setup_repo t25
mkdir -p "$APP/.sync-logs"
flock "$APP/.sync-logs/.lock" sleep 5 &
LOCKER=$!
sleep 0.3
run
check '[ $RC -eq 1 ] && out_has "proses sinkron lain"' "dua proses sinkron bersamaan ditolak"
kill "$LOCKER" 2>/dev/null; wait "$LOCKER" 2>/dev/null

setup_repo t26
run --opsi-ngawur
check '[ $RC -eq 2 ]' "opsi tidak dikenal -> exit 2"
run --check
check '[ $RC -eq 0 ] && out_has "Tidak ada perubahan baru"' "--check berjalan tanpa mengubah"

echo "# Restart layanan"
setup_repo t27
upstream "ubah backend" 'echo "print(2)" > backend/server.py'
run
check '[ $RC -eq 0 ] && [ "$(restarts)" = "restart backend" ] && out_has "SIAP DICEK"' "perubahan backend -> hanya backend di-restart"

setup_repo t28
upstream "ubah frontend" 'echo "{\"name\": \"fe2\"}" > frontend/package.json'
run
check '[ $RC -eq 0 ] && [ "$(restarts)" = "restart frontend" ]' "perubahan frontend -> hanya frontend di-restart"

setup_repo t29
upstream "ubah dokumen" 'echo "catatan" > old.txt'
run
check '[ $RC -eq 0 ] && [ -z "$(restarts)" ]' "perubahan di luar backend/frontend -> tidak ada restart"

setup_repo t30
upstream "ubah backend" 'echo "print(2)" > backend/server.py'
run --no-restart
check '[ $RC -eq 0 ] && [ -z "$(restarts)" ] && out_has "Restart dilewati"' "--no-restart -> tidak ada restart"

setup_repo t31
upstream "ubah backend" 'echo "print(2)" > backend/server.py'
FAKE_SUP_RC=7 run
check '[ $RC -eq 3 ] && [ "$(head_msg)" = "ubah backend" ] && out_has "RESTART_FAIL" && out_has "JANGAN Re-publish" && ! out_has "SIAP DICEK"' "restart gagal -> BELUM SIAP, kode tidak di-reset"

setup_repo t32
upstream "naik versi" 'echo "fakepkg==2.0" > backend/requirements.txt'
run
check '[ $RC -eq 3 ] && [ -z "$(restarts)" ] && out_has "Restart ditunda"' "dependensi belum terpasang -> restart ditunda"
set_fake_pkg_version 2.0
run
check '[ $RC -eq 0 ] && [ -z "$(restarts)" ]' "jalankan ulang setelah install: sudah terbaru, tidak restart otomatis (pakai --restart)"
run --restart
check '[ $RC -eq 0 ] && [ "$(restarts)" = "restart backend restart frontend" ]' "--restart -> restart backend dan frontend saja"

setup_repo t33
upstream "rusak" 'echo "def (" > backend/server.py'
run
check '[ $RC -eq 1 ] && [ -z "$(restarts)" ]' "cek kode gagal -> tidak ada restart"

setup_repo t34
upstream v2 'echo "print(2)" > backend/server.py'
run
: > "$FAKE_SUP_LOG"
run --rollback "$(git -C "$APP" rev-parse HEAD~1)"
check '[ $RC -eq 0 ] && [ "$(restarts)" = "restart backend" ]' "rollback kode backend -> backend di-restart"

check '! grep -qvE "^(status backend|restart backend|restart frontend)$" "$SUP_ALL"' "supervisorctl hanya dipakai untuk status/restart backend & frontend (tidak pernah MongoDB)"

CODE_LINES="$(grep -vE '^[[:space:]]*(#|echo )' "$SCRIPT")"
SUP_CALLS="$(grep -E 'SUPERVISOR_CMD[^=]|supervisorctl ' <<<"$CODE_LINES" | grep -vE 'status|restart "\$name"|for candidate in|command -v supervisorctl' || true)"
check '[ -z "$SUP_CALLS" ] && grep -q "ALLOWED_SERVICES=\"backend frontend\"" "$SCRIPT"' "supervisorctl di skrip hanya untuk status dan restart dari daftar izin backend/frontend"
check '! grep -qE "systemctl|service [a-z]|(^|[^a-z])mongod([^a-z]|$)|reset --hard|pip install|yarn install|rm -rf" <<<"$CODE_LINES"' "skrip tidak menyentuh MongoDB, tidak install paket, tidak reset --hard"

echo
echo "Hasil: $PASS lulus, $FAIL gagal"
[ "$FAIL" -eq 0 ]
