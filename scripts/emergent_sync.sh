#!/usr/bin/env bash
# =============================================================================
# emergent_sync.sh — menarik kode terbaru dari GitHub (branch main) ke
# workspace Emergent (/app) dengan aman.
#
# Yang dilakukan:
#   - hanya fast-forward (git merge --ff-only), tidak pernah merge/rebase/force;
#   - berhenti bila ada file terlacak yang diubah di workspace;
#   - berhenti bila workspace punya commit yang belum ada di GitHub;
#   - mencatat versi sebelum & sesudah ke /app/.sync-logs/;
#   - cek sintaks backend setelah pull, otomatis kembali ke versi lama bila gagal;
#   - TIDAK me-restart layanan, TIDAK meng-install paket, TIDAK menyentuh
#     database maupun file .env, TIDAK melakukan Re-publish.
#
# Pemakaian (di terminal Emergent):
#   bash /app/scripts/emergent_sync.sh             # sinkronkan ke origin/main
#   bash /app/scripts/emergent_sync.sh --check     # lihat apa yang akan berubah (tanpa mengubah)
#   bash /app/scripts/emergent_sync.sh --status    # status workspace & riwayat sinkron
#   bash /app/scripts/emergent_sync.sh --services  # cek izin layanan (hanya membaca)
#   bash /app/scripts/emergent_sync.sh --rollback <commit|tag>
#                                                  # kembalikan kode workspace ke versi tertentu
#
# Variabel opsional: APP_DIR (default /app), SYNC_BRANCH (default main),
#                    SYNC_REMOTE (default origin).
# =============================================================================

# Seluruh isi dibungkus fungsi main dan dipanggil di baris terakhir, supaya bash
# sudah membaca skrip secara utuh sebelum git pull memperbarui file ini sendiri.
main() {
  set -euo pipefail
  export GIT_TERMINAL_PROMPT=0 LC_ALL=C

  local APP_DIR="${APP_DIR:-/app}"
  local BRANCH="${SYNC_BRANCH:-main}"
  local REMOTE="${SYNC_REMOTE:-origin}"
  local LOG_DIR="$APP_DIR/.sync-logs"
  local HISTORY="$LOG_DIR/history.tsv"
  local LOCK_FILE="$LOG_DIR/.lock"
  local LOG_FILE="$LOG_DIR/sync-$(date -u +%Y%m%d).log"
  local MODE="${1:-sync}"

  case "$MODE" in
    sync|--sync) MODE=sync ;;
    --check|--status|--services|--rollback) MODE="${MODE#--}" ;;
    -h|--help) sed -n '2,27p' "${BASH_SOURCE[0]}"; return 0 ;;
    *) echo "Opsi tidak dikenal: $MODE (lihat --help)"; return 2 ;;
  esac

  cd "$APP_DIR" 2>/dev/null || { echo "GAGAL: folder $APP_DIR tidak ada"; return 1; }
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "GAGAL: $APP_DIR bukan repository git"; return 1; }
  mkdir -p "$LOG_DIR"

  # Log ke layar dan file. Semua keluaran disaring agar token/sandi tidak tercatat.
  exec > >(redact | tee -a "$LOG_FILE") 2>&1

  # Cegah dua proses sinkron berjalan bersamaan.
  exec 9>"$LOCK_FILE"
  if command -v flock >/dev/null 2>&1 && ! flock -n 9; then
    echo "GAGAL: proses sinkron lain sedang berjalan."
    return 1
  fi

  echo "===== $(date -u '+%Y-%m-%d %H:%M:%S UTC') | mode: $MODE ====="

  case "$MODE" in
    status)   do_status ;;
    services) do_services ;;
    check)    do_fetch && do_preview ;;
    sync)     do_sync ;;
    rollback) do_rollback "${2:-}" ;;
  esac
}

redact() {
  sed -u -E \
    -e 's#(https?://)[^/@[:space:]]+@#\1***@#g' \
    -e 's#gh[pousr]_[A-Za-z0-9]{20,}#***#g' \
    -e 's#github_pat_[A-Za-z0-9_]{20,}#***#g' \
    -e 's#(mongodb(\+srv)?://)[^[:space:]]+#\1***#g' \
    -e 's#((PASSWORD|SECRET|TOKEN|KEY)[A-Z_]*[=:][[:space:]]*)[^[:space:]]+#\1***#Ig'
}

short() { git rev-parse --short "$1" 2>/dev/null || echo "-"; }

record() { # record <aksi> <dari> <ke> <hasil>
  printf '%s\t%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "$3" "$4" >> "$HISTORY"
}

require_on_branch() {
  local current
  current="$(git symbolic-ref --short -q HEAD || echo "(detached)")"
  if [ "$current" != "$BRANCH" ]; then
    echo "GAGAL: workspace sedang di branch '$current', bukan '$BRANCH'."
    echo "       Hubungi Claude sebelum melanjutkan."
    return 1
  fi
}

require_clean() {
  local dirty
  dirty="$(git status --porcelain --untracked-files=no)"
  if [ -n "$dirty" ]; then
    echo "GAGAL: ada file terlacak yang diubah langsung di workspace Emergent:"
    echo "$dirty" | sed 's/^/   /'
    echo "Tidak ada yang diubah. Kirim daftar di atas ke Claude untuk diputuskan"
    echo "(disimpan ke GitHub dulu, atau dibuang)."
    return 1
  fi
  local untracked
  untracked="$(git status --porcelain | grep -c '^??' || true)"
  if [ "$untracked" -gt 0 ]; then
    echo "Info: ada $untracked file baru yang tidak dilacak git (dibiarkan apa adanya)."
  fi
}

do_fetch() {
  require_on_branch
  echo "Mengambil info terbaru dari GitHub ($REMOTE/$BRANCH)..."
  if ! git fetch --quiet "$REMOTE" "$BRANCH"; then
    echo "GAGAL: git fetch tidak berhasil (cek koneksi/izin GitHub di workspace)."
    return 1
  fi
}

# Mengisi variabel global AHEAD dan BEHIND.
count_divergence() {
  read -r AHEAD BEHIND < <(git rev-list --left-right --count "HEAD...$REMOTE/$BRANCH")
}

do_preview() {
  count_divergence
  echo "Workspace : $(short HEAD)  |  GitHub $REMOTE/$BRANCH : $(short "$REMOTE/$BRANCH")"
  if [ "$AHEAD" -gt 0 ]; then
    echo "PERHATIAN: workspace punya $AHEAD commit yang belum ada di GitHub (mis. dibuat agent Emergent):"
    git log --oneline "$REMOTE/$BRANCH..HEAD" | sed 's/^/   /'
  fi
  if [ "$BEHIND" -eq 0 ]; then
    echo "Tidak ada perubahan baru dari GitHub."
    return 0
  fi
  echo "Commit baru dari GitHub ($BEHIND):"
  git log --oneline "HEAD..$REMOTE/$BRANCH" | sed 's/^/   /'
  echo "File yang akan berubah:"
  git diff --stat "HEAD" "$REMOTE/$BRANCH" | sed 's/^/   /'
  warn_special_files "HEAD" "$REMOTE/$BRANCH"
}

warn_special_files() {
  local changed
  changed="$(git diff --name-only "$1" "$2")"
  if echo "$changed" | grep -qE '^backend/requirements\.txt$'; then
    echo "PERHATIAN: backend/requirements.txt berubah -> paket Python baru perlu di-install"
    echo "           (ikuti petunjuk di PR / tanya Claude). Skrip ini tidak meng-install otomatis."
  fi
  if echo "$changed" | grep -qE '^frontend/(package\.json|yarn\.lock)$'; then
    echo "PERHATIAN: dependensi frontend berubah -> 'yarn install' perlu dijalankan"
    echo "           (ikuti petunjuk di PR / tanya Claude). Skrip ini tidak meng-install otomatis."
  fi
  if echo "$changed" | grep -qE '^\.emergent/'; then
    echo "PERHATIAN: ada perubahan di folder .emergent/ (konfigurasi Emergent)."
  fi
}

post_checks() {
  local ok=0
  if command -v python3 >/dev/null 2>&1; then
    if python3 -m py_compile backend/server.py 2>/tmp/emergent_sync_pycompile.txt; then
      echo "Cek sintaks backend/server.py: OK"
    else
      echo "Cek sintaks backend/server.py: GAGAL"
      sed 's/^/   /' /tmp/emergent_sync_pycompile.txt
      ok=1
    fi
  else
    echo "Info: python3 tidak ditemukan, cek sintaks dilewati."
  fi
  return $ok
}

health_report() {
  # Hanya melapor; tidak me-restart apa pun. Backend preview Emergent biasanya
  # memuat ulang sendiri saat file berubah, jadi beri jeda beberapa detik.
  command -v curl >/dev/null 2>&1 || { echo "Info: curl tidak ada, cek kesehatan dilewati."; return 0; }
  local code i
  for i in 1 2 3 4; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:8001/api/ || true)"
    [ "$code" = "200" ] && break
    sleep 5
  done
  echo "Backend lokal (http://localhost:8001/api/): HTTP ${code:-000}"
  if [ "$code" != "200" ]; then
    echo "PERHATIAN: backend belum merespons normal. Cek Preview dulu; bila error, JANGAN Re-publish"
    echo "           dan jalankan perintah rollback di bawah, lalu laporkan ke Claude."
  fi
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000/ || true)"
  echo "Frontend lokal (http://localhost:3000/): HTTP ${code:-000}"
}

do_sync() {
  require_clean
  do_fetch
  do_preview
  if [ "$AHEAD" -gt 0 ]; then
    echo "DIHENTIKAN: workspace dan GitHub bercabang. Tidak ada yang diubah."
    echo "           Kirim keluaran ini ke Claude untuk diselesaikan lewat GitHub."
    record sync "$(short HEAD)" "$(short "$REMOTE/$BRANCH")" "STOP_DIVERGED"
    return 1
  fi
  if [ "$BEHIND" -eq 0 ]; then
    record sync "$(short HEAD)" "$(short HEAD)" "UP_TO_DATE"
    final_banner
    return 0
  fi

  local before after
  before="$(git rev-parse HEAD)"
  echo "Versi sebelum sinkron: $(short "$before") (dipakai untuk rollback)"

  if ! git merge --ff-only --quiet "$REMOTE/$BRANCH"; then
    echo "GAGAL: fast-forward tidak bisa dilakukan. Tidak ada yang diubah."
    record sync "$(short "$before")" "$(short "$REMOTE/$BRANCH")" "FAIL_FF"
    return 1
  fi
  after="$(git rev-parse HEAD)"
  echo "Kode diperbarui: $(short "$before") -> $(short "$after")"

  if ! post_checks; then
    echo "Pengecekan gagal -> mengembalikan kode ke $(short "$before") secara otomatis..."
    git reset --quiet --hard "$before"
    record sync "$(short "$before")" "$(short "$after")" "AUTO_ROLLBACK"
    echo "Kode sudah kembali ke $(short "$before"). JANGAN Re-publish. Laporkan ke Claude."
    return 1
  fi

  record sync "$(short "$before")" "$(short "$after")" "OK"
  health_report
  echo "Rollback bila perlu: bash $APP_DIR/scripts/emergent_sync.sh --rollback $(short "$before")"
  final_banner
}

final_banner() {
  count_divergence
  if [ -z "$(git status --porcelain --untracked-files=no)" ] && [ "$AHEAD" -eq 0 ] && [ "$BEHIND" -eq 0 ]; then
    echo "------------------------------------------------------------------"
    echo "SIAP DICEK: workspace = GitHub $BRANCH ($(short HEAD))."
    echo "1) Cek aplikasi di Preview.  2) Bila sudah benar, klik Re-publish."
    echo "------------------------------------------------------------------"
  fi
}

do_rollback() {
  local target="$1"
  if [ -z "$target" ]; then
    echo "Pemakaian: --rollback <commit|tag>   (lihat --status untuk riwayat)"
    return 2
  fi
  require_on_branch
  require_clean
  git fetch --quiet --tags "$REMOTE" "$BRANCH" 2>/dev/null || echo "Info: fetch gagal, memakai data lokal."
  local sha
  if ! sha="$(git rev-parse --verify --quiet "${target}^{commit}")"; then
    echo "GAGAL: versi '$target' tidak ditemukan."
    return 1
  fi
  if ! git merge-base --is-ancestor "$sha" "$REMOTE/$BRANCH"; then
    echo "GAGAL: versi '$target' bukan bagian dari riwayat $REMOTE/$BRANCH. Ditolak demi keamanan."
    return 1
  fi
  local before
  before="$(git rev-parse HEAD)"
  git reset --quiet --hard "$sha"
  record rollback "$(short "$before")" "$(short "$sha")" "OK"
  echo "Kode workspace dikembalikan: $(short "$before") -> $(short "$sha")"
  echo "Database tidak diubah. Produksi baru berubah bila Anda klik Re-publish."
  echo "Catatan: sinkron berikutnya akan kembali menarik versi terbaru dari GitHub."
  echo "         Untuk membatalkan perubahan secara permanen, minta Claude membuat PR revert."
}

do_status() {
  echo "Folder    : $APP_DIR"
  echo "Branch    : $(git symbolic-ref --short -q HEAD || echo '(detached)')"
  echo "Workspace : $(git log -1 --format='%h %ad %s' --date=format:'%Y-%m-%d %H:%M' | cut -c1-100)"
  if git rev-parse --verify --quiet "$REMOTE/$BRANCH" >/dev/null; then
    echo "GitHub    : $(git log -1 --format='%h %ad' --date=format:'%Y-%m-%d %H:%M' "$REMOTE/$BRANCH") (data fetch terakhir)"
  fi
  local dirty
  dirty="$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ')"
  echo "File terlacak yang diubah lokal: $dirty"
  if [ -f "$HISTORY" ]; then
    echo "Riwayat sinkron terakhir (waktu, aksi, dari, ke, hasil):"
    tail -n 10 "$HISTORY" | sed 's/^/   /'
  fi
}

do_services() {
  # Hanya membaca: tidak ada perintah start/stop/restart di sini.
  echo "User: $(id -un 2>/dev/null || echo '?')"
  if command -v supervisorctl >/dev/null 2>&1; then
    echo "supervisorctl ditemukan: $(command -v supervisorctl)"
    if supervisorctl status 2>&1 | sed 's/^/   /'; then :; fi
    if command -v sudo >/dev/null 2>&1; then
      echo "Mencoba 'sudo -n supervisorctl status' (tanpa meminta sandi):"
      sudo -n supervisorctl status 2>&1 | sed 's/^/   /' || true
    fi
  else
    echo "supervisorctl tidak ditemukan."
  fi
  echo "Kirim keluaran ini ke Claude untuk memutuskan apakah restart otomatis aman diaktifkan."
}

main "$@"
exit $?
