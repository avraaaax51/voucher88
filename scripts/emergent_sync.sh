#!/usr/bin/env bash
# =============================================================================
# emergent_sync.sh — menarik kode terbaru dari GitHub (branch main) ke
# workspace Emergent (/app) dengan aman. Satu perintah:
#
#   bash /app/scripts/emergent_sync.sh
#
# Opsi lain:
#   --check              lihat apa yang akan berubah (tidak mengubah apa pun)
#   --status             versi sekarang + riwayat sinkron
#   --services           cek izin supervisorctl (hanya membaca)
#   --rollback <commit>  kembalikan KODE workspace ke versi tertentu dari main
#   --confirm-deps       tandai dependensi sudah di-install manual
#   --restart            restart backend + frontend lalu cek kesehatan
#   --no-restart         (tambahan untuk mode lain) jangan restart layanan
#
# Jaminan:
#   - hanya fast-forward; tidak pernah merge/rebase/force/reset --hard;
#   - berhenti tanpa mengubah apa pun bila: ada file terlacak yang diubah lokal,
#     ada file lokal (tak terlacak/di-ignore) yang akan tertimpa, ada perubahan
#     file .env dari GitHub, workspace bercabang, atau fetch gagal;
#   - cek kode setelah pull (semua .py backend, skrip .sh, package.json);
#     bila gagal, kode dikembalikan ke versi sebelumnya dengan `git reset --keep`
#     (tidak menyentuh file tak terlacak);
#   - cek dependensi dan kesehatan layanan; bila gagal: status BELUM SIAP,
#     kode TIDAK di-reset;
#   - setelah kode baru lulus cek dan dependensinya cocok, me-restart HANYA
#     layanan aplikasi yang kodenya berubah (backend dan/atau frontend) lewat
#     supervisorctl. MongoDB dan layanan internal Emergent tidak pernah disentuh.
#     Restart gagal => BELUM SIAP, kode tidak di-reset;
#   - tidak meng-install paket, tidak menyentuh database atau .env, tidak
#     melakukan Re-publish;
#   - log di /app/.sync-logs/ dengan token/sandi/connection string disamarkan.
#
# Kode keluar: 0 = SIAP DICEK, 1 = berhenti/gagal (lihat pesan),
#              2 = salah pemakaian, 3 = kode berubah tetapi BELUM SIAP.
#
# Variabel opsional: APP_DIR (/app), SYNC_BRANCH (main), SYNC_REMOTE (origin),
#   BACKEND_HEALTH_URL (http://localhost:8001/api/),
#   FRONTEND_HEALTH_URL (http://localhost:3000/), SYNC_HEALTH_TIMEOUT (120 detik),
#   SYNC_PYTHON (python3), SYNC_YARN (yarn), SYNC_RESTART (1; 0 = jangan restart),
#   SYNC_SUPERVISORCTL (perintah supervisorctl; default dideteksi otomatis).
# =============================================================================

# Seluruh isi dibungkus fungsi dan main dipanggil di baris terakhir, supaya bash
# sudah membaca skrip secara utuh sebelum git memperbarui file ini sendiri.

main() {
  set -Eeuo pipefail
  export GIT_TERMINAL_PROMPT=0 LC_ALL=C

  APP_DIR="${APP_DIR:-/app}"
  BRANCH="${SYNC_BRANCH:-main}"
  REMOTE="${SYNC_REMOTE:-origin}"
  UPSTREAM="$REMOTE/$BRANCH"
  BACKEND_URL="${BACKEND_HEALTH_URL:-http://localhost:8001/api/}"
  FRONTEND_URL="${FRONTEND_HEALTH_URL:-http://localhost:3000/}"
  HEALTH_TIMEOUT="${SYNC_HEALTH_TIMEOUT:-120}"
  PYTHON_BIN="${SYNC_PYTHON:-python3}"
  YARN_BIN="${SYNC_YARN:-yarn}"
  LOG_DIR="$APP_DIR/.sync-logs"
  HISTORY="$LOG_DIR/history.tsv"
  DEPS_STATE="$LOG_DIR/deps.state"
  DEP_FILES="backend/requirements.txt frontend/package.json frontend/yarn.lock"
  # Satu-satunya layanan yang boleh di-restart skrip ini.
  ALLOWED_SERVICES="backend frontend"
  RESTART_ENABLED=1
  [ "${SYNC_RESTART:-1}" = "0" ] && RESTART_ENABLED=0

  local args=() arg
  for arg in "$@"; do
    if [ "$arg" = "--no-restart" ]; then RESTART_ENABLED=0; else args+=("$arg"); fi
  done
  set -- "${args[@]+"${args[@]}"}"

  local mode="${1:-sync}"
  case "$mode" in
    sync|--sync) mode=sync ;;
    --check|--status|--services|--rollback|--confirm-deps|--restart) mode="${mode#--}" ;;
    -h|--help) sed -n '2,46p' "${BASH_SOURCE[0]}"; return 0 ;;
    *) echo "Opsi tidak dikenal: $mode (lihat --help)"; return 2 ;;
  esac

  cd "$APP_DIR" 2>/dev/null || { echo "GAGAL: folder $APP_DIR tidak ada"; return 1; }
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "GAGAL: $APP_DIR bukan repository git"; return 1; }
  mkdir -p "$LOG_DIR" && chmod 700 "$LOG_DIR"

  start_logging
  trap 'on_error $LINENO' ERR

  exec 9>"$LOG_DIR/.lock"
  if ! command -v flock >/dev/null 2>&1; then
    echo "Info: 'flock' tidak tersedia; pastikan skrip tidak dijalankan dua kali bersamaan."
  elif ! flock -n 9; then
    echo "GAGAL: proses sinkron lain sedang berjalan."
    STOPPED=1; return 1
  fi

  echo "===== $(date -u '+%Y-%m-%d %H:%M:%S UTC') | mode: $mode ====="
  case "$mode" in
    status)       do_status ;;
    services)     do_services ;;
    check)        do_fetch && show_incoming ;;
    sync)         do_sync ;;
    rollback)     do_rollback "${2:-}" ;;
    confirm-deps) do_confirm_deps ;;
    restart)      do_restart ;;
  esac
}

# ---------------------------------------------------------------- logging ----

start_logging() {
  local log_file
  log_file="$LOG_DIR/sync-$(date -u +%Y%m%d).log"
  touch "$log_file" && chmod 600 "$log_file"
  # Semua keluaran (layar + file) melewati redact terlebih dahulu.
  exec > >(redact | tee -a "$log_file") 2>&1
  LOG_PID=$!
  trap finish_logging EXIT
}

finish_logging() {
  local rc=$?
  exec 1>&- 2>&-
  wait "$LOG_PID" 2>/dev/null || true
  exit "$rc"
}

# Setiap kegagalan yang disengaja menyetel STOPPED=1 sebelum `return`, sehingga
# trap ERR hanya melapor untuk kegagalan yang benar-benar tak terduga.

on_error() {
  [ "${STOPPED:-0}" = 1 ] && return 0
  STOPPED=1
  echo "GAGAL tak terduga di baris $1 skrip. Proses dihentikan; tidak ada langkah lanjutan."
  echo "Bila ini terjadi setelah 'Kode diperbarui', JANGAN Re-publish dan laporkan ke Claude."
  record "error" "$(short HEAD)" "-" "ERROR_LINE_$1"
}

redact() {
  sed -u -E \
    -e 's#([a-zA-Z][a-zA-Z0-9+.-]*://)[^/@[:space:]]+@#\1***@#g' \
    -e 's#(gh[pousr]_|github_pat_)[A-Za-z0-9_]{10,}#***#g' \
    -e 's#(mongodb(\+srv)?|postgres(ql)?|mysql|redis)://[^[:space:]]+#\1://***#g' \
    -e 's#([Aa]uthorization:|[Bb]earer)[[:space:]]+[^[:space:]]+#\1 ***#g' \
    -e 's#([A-Za-z_]*(PASSWORD|PASSWD|SECRET|TOKEN|KEY)[A-Za-z_]*[[:space:]]*[=:][[:space:]]*)[^[:space:]]+#\1***#Ig'
}

record() { # record <aksi> <dari> <ke> <hasil>
  printf '%s\t%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "$3" "$4" >> "$HISTORY"
}

short() { git rev-parse --short "$1" 2>/dev/null || echo "-"; }

# ------------------------------------------------------------ pre-checks -----

require_on_branch() {
  local current
  current="$(git symbolic-ref --short -q HEAD || echo "(detached)")"
  if [ "$current" != "$BRANCH" ]; then
    echo "GAGAL: workspace sedang di branch '$current', bukan '$BRANCH'. Hubungi Claude."
    STOPPED=1; return 1
  fi
}

require_clean() {
  local dirty
  dirty="$(git status --porcelain --untracked-files=no)"
  if [ -n "$dirty" ]; then
    echo "GAGAL: ada file terlacak yang diubah langsung di workspace Emergent:"
    echo "$dirty" | sed 's/^/   /'
    echo "Tidak ada yang diubah. Kirim daftar di atas ke Claude untuk diputuskan."
    STOPPED=1; return 1
  fi
}

# Berhenti bila perpindahan dari <dari> ke <ke> akan menulis ke path yang saat
# ini berisi file lokal yang tidak dilacak git (termasuk file yang di-ignore).
require_no_overwrite() {
  local from="$1" to="$2" path hits=""
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    if [ -e "$path" ] || [ -L "$path" ]; then
      if ! git cat-file -e "$from:$path" 2>/dev/null; then
        hits="$hits   $path"$'\n'
      fi
    fi
  done < <(git diff --name-only --no-renames --diff-filter=AM "$from" "$to")
  if [ -n "$hits" ]; then
    echo "GAGAL: file lokal berikut akan tertimpa oleh versi dari GitHub:"
    printf '%s' "$hits"
    echo "Tidak ada yang diubah. Pindahkan/backup file itu dulu, atau tanyakan ke Claude."
    STOPPED=1; return 1
  fi
}

require_no_env_changes() {
  local env_paths
  env_paths="$(git diff --name-only --no-renames "$1" "$2" | grep -E '(^|/)\.env($|\.)' || true)"
  if [ -n "$env_paths" ]; then
    echo "GAGAL: perubahan berisi file .env (konfigurasi rahasia) — ditolak demi keamanan:"
    echo "$env_paths" | sed 's/^/   /'
    STOPPED=1; return 1
  fi
}

do_fetch() {
  require_on_branch || return 1
  echo "Mengambil info terbaru dari GitHub ($UPSTREAM)..."
  if ! timeout 120 git fetch --quiet "$REMOTE" "$BRANCH"; then
    echo "GAGAL: git fetch tidak berhasil (jaringan/izin GitHub). Tidak ada yang diubah; coba lagi nanti."
    record fetch "$(short HEAD)" "-" "FAIL_FETCH"
    STOPPED=1; return 1
  fi
}

count_divergence() { # mengisi AHEAD dan BEHIND
  local counts
  counts="$(git rev-list --left-right --count "HEAD...$UPSTREAM")" || return 1
  AHEAD="${counts%%[[:space:]]*}"
  BEHIND="${counts##*[[:space:]]}"
}

show_incoming() {
  count_divergence
  echo "Workspace : $(short HEAD)  |  GitHub $UPSTREAM : $(short "$UPSTREAM")"
  if [ "$AHEAD" -gt 0 ]; then
    echo "PERHATIAN: workspace punya $AHEAD commit yang belum ada di GitHub:"
    git log --oneline "$UPSTREAM..HEAD" | sed 's/^/   /'
  fi
  if [ "$BEHIND" -eq 0 ]; then
    echo "Tidak ada perubahan baru dari GitHub."
    return 0
  fi
  echo "Commit baru dari GitHub ($BEHIND):"
  git log --oneline "HEAD..$UPSTREAM" | sed 's/^/   /'
  echo "File yang akan berubah:"
  git diff --stat "HEAD" "$UPSTREAM" | sed 's/^/   /'
  local changed
  changed="$(git diff --name-only HEAD "$UPSTREAM")"
  if grep -qxF "backend/requirements.txt" <<<"$changed"; then
    echo "PERHATIAN: dependensi Python (backend/requirements.txt) berubah."
  fi
  if grep -qE '^frontend/(package\.json|yarn\.lock)$' <<<"$changed"; then
    echo "PERHATIAN: dependensi frontend (package.json/yarn.lock) berubah."
  fi
  if grep -q '^\.emergent/' <<<"$changed"; then
    echo "PERHATIAN: ada perubahan di folder .emergent/ (konfigurasi Emergent)."
  fi
}

# --------------------------------------------------------------- checks ------

# Pemeriksaan kode yang hasilnya pasti (bukan jaringan). Gagal => kode dikembalikan.
code_checks() {
  local failed=0 f out
  if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    echo "Cek kode: GAGAL — '$PYTHON_BIN' tidak ditemukan, kode tidak bisa diperiksa."
    return 1
  fi
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if ! out="$("$PYTHON_BIN" -c 'import sys; compile(open(sys.argv[1], "rb").read(), sys.argv[1], "exec")' "$f" 2>&1)"; then
      echo "Cek sintaks Python GAGAL: $f"
      echo "$out" | tail -n 5 | sed 's/^/   /'
      failed=1
    fi
  done < <(git ls-files 'backend/*.py')
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if ! out="$(bash -n "$f" 2>&1)"; then
      echo "Cek sintaks skrip GAGAL: $f"
      echo "$out" | tail -n 5 | sed 's/^/   /'
      failed=1
    fi
  done < <(git ls-files 'scripts/*.sh')
  if [ -f frontend/package.json ] && ! "$PYTHON_BIN" -c 'import json,sys; json.load(open(sys.argv[1]))' frontend/package.json 2>/dev/null; then
    echo "Cek frontend/package.json GAGAL: bukan JSON yang valid."
    failed=1
  fi
  if [ "$failed" -eq 0 ]; then
    echo "Cek kode (sintaks semua .py backend, skrip .sh, package.json): OK"
  fi
  return "$failed"
}

dep_blob() { git rev-parse --verify --quiet "$1:$2" 2>/dev/null || echo "none"; }

deps_baseline_init() {
  # Pertama kali dipakai: anggap dependensi versi saat ini sudah terpasang
  # (aplikasi sedang berjalan dengan versi ini).
  [ -f "$DEPS_STATE" ] && return 0
  local f
  for f in $DEP_FILES; do printf '%s %s\n' "$f" "$(dep_blob HEAD "$f")"; done > "$DEPS_STATE"
}

deps_baseline_of() { awk -v f="$1" '$1 == f {print $2}' "$DEPS_STATE"; }

deps_baseline_set() { # deps_baseline_set <file...> : tandai versi HEAD sebagai terpasang
  local f tmp
  tmp="$(mktemp)"
  cp "$DEPS_STATE" "$tmp"
  for f in "$@"; do
    awk -v f="$f" '$1 != f' "$tmp" > "$tmp.n" && mv "$tmp.n" "$tmp"
    printf '%s %s\n' "$f" "$(dep_blob HEAD "$f")" >> "$tmp"
  done
  mv "$tmp" "$DEPS_STATE"
}

verify_python_deps() {
  "$PYTHON_BIN" - backend/requirements.txt <<'PY'
import re
import sys
from importlib import metadata

missing = []
for raw in open(sys.argv[1], encoding="utf-8"):
    line = raw.strip()
    if not line or line.startswith(("#", "-")):
        continue
    m = re.match(r"^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*(==\s*([^\s;#]+))?", line)
    if not m:
        continue
    name, wanted = m.group(1), m.group(4)
    installed = None
    for candidate in {name, name.replace("_", "-"), name.replace("-", "_")}:
        try:
            installed = metadata.version(candidate)
            break
        except metadata.PackageNotFoundError:
            pass
    if installed is None:
        missing.append(f"{name} (belum terpasang)")
    elif wanted and installed.lower() != wanted.lower():
        missing.append(f"{name} (terpasang {installed}, dibutuhkan {wanted})")
for item in missing:
    print("   " + item)
sys.exit(1 if missing else 0)
PY
}

verify_frontend_deps() {
  command -v "$YARN_BIN" >/dev/null 2>&1 || { echo "   '$YARN_BIN' tidak ditemukan"; return 1; }
  (cd frontend && "$YARN_BIN" check --integrity >/dev/null 2>&1)
}

# Mengisi DEPS_OK=1/0. Hanya memeriksa file dependensi yang berbeda dari versi
# yang terakhir tercatat terpasang.
check_deps() {
  DEPS_OK=1
  deps_baseline_init
  local py_changed=0 fe_changed=0 f
  [ "$(dep_blob HEAD backend/requirements.txt)" != "$(deps_baseline_of backend/requirements.txt)" ] && py_changed=1
  for f in frontend/package.json frontend/yarn.lock; do
    [ "$(dep_blob HEAD "$f")" != "$(deps_baseline_of "$f")" ] && fe_changed=1
  done
  if [ "$py_changed" -eq 0 ] && [ "$fe_changed" -eq 0 ]; then
    echo "Dependensi: tidak ada perubahan."
    return 0
  fi
  if [ "$py_changed" -eq 1 ]; then
    if verify_python_deps; then
      echo "Dependensi Python: sesuai requirements.txt."
      deps_baseline_set backend/requirements.txt
    else
      echo "Dependensi Python: BELUM TERPASANG (daftar di atas). Jalankan:"
      echo "   cd $APP_DIR/backend && pip install -r requirements.txt"
      DEPS_OK=0
    fi
  fi
  if [ "$fe_changed" -eq 1 ]; then
    if verify_frontend_deps; then
      echo "Dependensi frontend: sesuai yarn.lock."
      deps_baseline_set frontend/package.json frontend/yarn.lock
    else
      echo "Dependensi frontend: BELUM TERPASANG. Jalankan:"
      echo "   cd $APP_DIR/frontend && yarn install --frozen-lockfile"
      DEPS_OK=0
    fi
  fi
  if [ "$DEPS_OK" -eq 0 ]; then
    echo "Setelah install, jalankan lagi: bash $APP_DIR/scripts/emergent_sync.sh"
    echo "(bila sudah di-install tetapi tetap terbaca belum: --confirm-deps)"
  fi
}

check_url() { # check_url <nama> <url> <pola isi>
  local name="$1" url="$2" pattern="$3" deadline response code body
  deadline=$((SECONDS + HEALTH_TIMEOUT))
  while :; do
    response="$(curl -sS --max-time 5 -w $'\n%{http_code}' "$url" 2>/dev/null)" || response=$'\n000'
    code="${response##*$'\n'}"
    body="${response%$'\n'*}"
    if [ "$code" = "200" ] && grep -qF -- "$pattern" <<<"$body"; then
      echo "Kesehatan $name ($url): OK"
      return 0
    fi
    [ "$SECONDS" -ge "$deadline" ] && break
    sleep 3
  done
  echo "Kesehatan $name ($url): GAGAL (HTTP $code setelah ${HEALTH_TIMEOUT} detik)"
  return 1
}

# Mengisi HEALTH_OK=1/0. Hanya melapor: tidak me-restart dan tidak me-reset kode.
check_health() {
  HEALTH_OK=1
  if ! command -v curl >/dev/null 2>&1; then
    echo "Kesehatan layanan: GAGAL — curl tidak tersedia."
    HEALTH_OK=0
    return 0
  fi
  check_url "backend" "$BACKEND_URL" '"message"' || HEALTH_OK=0
  check_url "frontend" "$FRONTEND_URL" 'id="root"' || HEALTH_OK=0
  if [ "$HEALTH_OK" -eq 0 ]; then
    echo "Skrip ini tidak me-restart layanan. Cek Preview/restart lewat Emergent, lalu jalankan skrip lagi."
  fi
}

# ---------------------------------------------------------------- restart ----

# Layanan yang kodenya berubah antara dua versi (hanya backend/frontend).
changed_services() { # changed_services <dari> <ke>
  local changed services=""
  changed="$(git diff --name-only "$1" "$2")"
  grep -q '^backend/' <<<"$changed" && services="backend"
  grep -q '^frontend/' <<<"$changed" && services="${services:+$services }frontend"
  printf '%s' "$services"
}

# Menentukan perintah supervisorctl yang benar-benar mengelola layanan aplikasi.
# Di Emergent, `supervisorctl` tanpa sudo tidak melihat backend/frontend.
pick_supervisorctl() {
  if [ -n "${SYNC_SUPERVISORCTL:-}" ]; then
    SUPERVISOR_CMD="$SYNC_SUPERVISORCTL"
    return 0
  fi
  local candidate
  for candidate in "sudo -n supervisorctl" "supervisorctl"; do
    # shellcheck disable=SC2086
    if $candidate status backend 2>/dev/null | grep -q '^backend[[:space:]]'; then
      SUPERVISOR_CMD="$candidate"
      return 0
    fi
  done
  return 1
}

# Restart layanan dari daftar izin saja. Mengisi RESTART_OK=1/0.
restart_services() { # restart_services <layanan...>
  RESTART_OK=1
  [ "$#" -gt 0 ] || return 0
  if [ "$RESTART_ENABLED" -ne 1 ]; then
    echo "Restart dilewati (--no-restart). Restart manual: $*"
    return 0
  fi
  local name output
  for name in "$@"; do
    case " $ALLOWED_SERVICES " in
      *" $name "*) ;;
      *) echo "DITOLAK: '$name' bukan layanan aplikasi yang boleh di-restart."; RESTART_OK=0; return 0 ;;
    esac
  done
  if ! pick_supervisorctl; then
    echo "Restart GAGAL: supervisorctl untuk layanan aplikasi tidak ditemukan. Restart lewat Emergent."
    RESTART_OK=0
    return 0
  fi
  for name in "$@"; do
    echo "Restart layanan: $name"
    # shellcheck disable=SC2086
    if output="$($SUPERVISOR_CMD restart "$name" 2>&1)" && ! grep -qiE 'error|fatal|no such' <<<"$output"; then
      echo "$output" | sed 's/^/   /'
    else
      echo "$output" | sed 's/^/   /'
      echo "Restart $name GAGAL."
      RESTART_OK=0
    fi
  done
}

# Ringkasan akhir. Kembali 0 bila siap, 3 bila belum.
finalize() { # finalize <aksi> <dari> [layanan yang perlu di-restart...]
  local action="$1" from="$2"
  shift 2
  check_deps
  RESTART_OK=1
  if [ "$#" -gt 0 ]; then
    if [ "$DEPS_OK" -eq 1 ]; then
      restart_services "$@"
    else
      echo "Restart ditunda sampai dependensi terpasang."
    fi
  fi
  check_health
  local state=""
  [ "$DEPS_OK" -eq 1 ] || state="DEPS_PENDING"
  [ "$RESTART_OK" -eq 1 ] || state="${state:+$state+}RESTART_FAIL"
  [ "$HEALTH_OK" -eq 1 ] || state="${state:+$state+}HEALTH_FAIL"
  [ -n "$state" ] || state="OK"
  record "$action" "$from" "$(short HEAD)" "$state"
  echo "------------------------------------------------------------------"
  if [ "$state" = "OK" ]; then
    echo "SIAP DICEK: workspace $(short HEAD); dependensi & layanan OK."
    echo "1) Cek aplikasi di Preview.  2) Bila sudah benar, pemilik klik Re-publish."
    echo "------------------------------------------------------------------"
    return 0
  fi
  echo "BELUM SIAP — JANGAN Re-publish. Status: $state"
  echo "Perbaiki hal di atas lalu jalankan skrip lagi, atau laporkan ke Claude."
  echo "------------------------------------------------------------------"
  STOPPED=1; return 3
}

# ---------------------------------------------------------------- actions ----

do_sync() {
  require_clean || return 1
  do_fetch || return 1
  show_incoming || return 1
  if [ "$AHEAD" -gt 0 ]; then
    echo "DIHENTIKAN: workspace dan GitHub bercabang. Tidak ada yang diubah. Kirim keluaran ini ke Claude."
    record sync "$(short HEAD)" "$(short "$UPSTREAM")" "STOP_DIVERGED"
    STOPPED=1; return 1
  fi
  if [ "$BEHIND" -eq 0 ]; then
    finalize sync "$(short HEAD)"
    return $?
  fi

  local before
  before="$(git rev-parse HEAD)"
  if ! require_no_env_changes HEAD "$UPSTREAM" || ! require_no_overwrite HEAD "$UPSTREAM"; then
    record sync "$(short HEAD)" "$(short "$UPSTREAM")" "STOP_UNSAFE"
    STOPPED=1; return 1
  fi
  deps_baseline_init

  echo "Versi sebelum sinkron: $(short "$before") (titik rollback)"
  if ! git merge --ff-only --quiet "$UPSTREAM"; then
    echo "GAGAL: fast-forward tidak bisa dilakukan. Tidak ada yang diubah."
    record sync "$(short "$before")" "$(short "$UPSTREAM")" "FAIL_FF"
    STOPPED=1; return 1
  fi
  echo "Kode diperbarui: $(short "$before") -> $(short HEAD)"

  if ! code_checks; then
    local bad
    bad="$(git rev-parse HEAD)"
    echo "Cek kode gagal -> mengembalikan kode ke $(short "$before")..."
    if git reset --quiet --keep "$before"; then
      record sync "$(short "$before")" "$(short "$bad")" "AUTO_REVERTED"
      echo "Kode kembali ke $(short "$before"). JANGAN Re-publish. Laporkan ke Claude."
    else
      record sync "$(short "$before")" "$(short "$bad")" "REVERT_FAILED"
      echo "GAGAL mengembalikan otomatis. JANGAN Re-publish. Laporkan keluaran ini ke Claude."
    fi
    STOPPED=1; return 1
  fi

  echo "Rollback kode bila perlu: bash $APP_DIR/scripts/emergent_sync.sh --rollback $(short "$before")"
  local services
  services="$(changed_services "$before" HEAD)"
  # shellcheck disable=SC2086
  finalize sync "$(short "$before")" $services
}

do_rollback() {
  local target="$1" sha before
  if [ -z "$target" ]; then
    echo "Pemakaian: --rollback <commit|tag>   (lihat --status untuk riwayat)"
    STOPPED=1; return 2
  fi
  require_on_branch || return 1
  require_clean || return 1
  timeout 120 git fetch --quiet --tags "$REMOTE" "$BRANCH" 2>/dev/null || echo "Info: fetch gagal, memakai data lokal."
  if ! sha="$(git rev-parse --verify --quiet "${target}^{commit}")"; then
    echo "GAGAL: versi '$target' tidak ditemukan."
    STOPPED=1; return 1
  fi
  if ! git merge-base --is-ancestor "$sha" "$UPSTREAM"; then
    echo "GAGAL: versi '$target' bukan bagian dari riwayat $UPSTREAM. Ditolak demi keamanan."
    STOPPED=1; return 1
  fi
  before="$(git rev-parse HEAD)"
  require_no_env_changes HEAD "$sha" || return 1
  require_no_overwrite HEAD "$sha" || return 1
  deps_baseline_init
  if ! git reset --quiet --keep "$sha"; then
    echo "GAGAL: rollback tidak bisa dilakukan dengan aman. Tidak ada yang diubah."
    record rollback "$(short "$before")" "$(short "$sha")" "FAIL"
    STOPPED=1; return 1
  fi
  echo "Kode workspace dikembalikan: $(short "$before") -> $(short "$sha")"
  echo "PENTING: rollback hanya mengembalikan KODE. Database TIDAK dipulihkan,"
  echo "         paket/dependensi yang sudah ter-install TIDAK dikembalikan, dan .env tidak disentuh."
  echo "         File yang tidak dilacak git dibiarkan apa adanya."
  echo "         Sinkron berikutnya akan menarik lagi versi terbaru; untuk membatalkan permanen minta Claude membuat PR revert."
  local services
  services="$(changed_services "$before" HEAD)"
  # shellcheck disable=SC2086
  finalize rollback "$(short "$before")" $services
}

do_restart() {
  RESTART_ENABLED=1
  # shellcheck disable=SC2086
  finalize restart "$(short HEAD)" $ALLOWED_SERVICES
}

do_confirm_deps() {
  deps_baseline_init
  deps_baseline_set $DEP_FILES
  record confirm-deps "$(short HEAD)" "$(short HEAD)" "OK"
  echo "Dependensi untuk versi $(short HEAD) ditandai sudah terpasang (atas konfirmasi Anda)."
}

do_status() {
  echo "Folder    : $APP_DIR"
  echo "Branch    : $(git symbolic-ref --short -q HEAD || echo '(detached)')"
  echo "Workspace : $(git log -1 --format='%h %ad %s' --date=format:'%Y-%m-%d %H:%M' | cut -c1-100)"
  if git rev-parse --verify --quiet "$UPSTREAM" >/dev/null; then
    echo "GitHub    : $(git log -1 --format='%h %ad' --date=format:'%Y-%m-%d %H:%M' "$UPSTREAM") (data fetch terakhir)"
  fi
  echo "File terlacak yang diubah lokal: $(git status --porcelain --untracked-files=no | wc -l | tr -d ' ')"
  if [ -f "$HISTORY" ]; then
    echo "Riwayat terakhir (waktu, aksi, dari, ke, hasil):"
    tail -n 10 "$HISTORY" | sed 's/^/   /'
  fi
}

do_services() {
  # Hanya membaca status. Restart hanya lewat restart_services (backend/frontend).
  echo "User: $(id -un 2>/dev/null || echo '?')"
  if command -v supervisorctl >/dev/null 2>&1; then
    echo "supervisorctl ditemukan: $(command -v supervisorctl)"
    supervisorctl status 2>&1 | sed 's/^/   /' || true
    if command -v sudo >/dev/null 2>&1; then
      echo "Mencoba 'sudo -n supervisorctl status' (tanpa meminta sandi):"
      sudo -n supervisorctl status 2>&1 | sed 's/^/   /' || true
    fi
  else
    echo "supervisorctl tidak ditemukan."
  fi
  if pick_supervisorctl; then
    echo "Restart otomatis aktif memakai: $SUPERVISOR_CMD (hanya: $ALLOWED_SERVICES)"
  else
    echo "Restart otomatis TIDAK bisa dipakai: supervisorctl tidak melihat layanan 'backend'."
  fi
}

main "$@"
