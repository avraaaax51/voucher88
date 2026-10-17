# CLAUDE.md — Aturan proyek Aneka 88 Voucher (Voucher88)

Aplikasi voucher belanja Toko Aneka 88 Mangon. **Sudah dipakai di produksi**
(aneka88voucher.com) dengan data pelanggan, voucher, dan transaksi sungguhan.
Pemilik berkomunikasi dalam **Bahasa Indonesia**; jawab dan tulis dokumentasi
dalam Bahasa Indonesia.

## Hosting & alur rilis (jangan diubah)

- Hosting, database (MongoDB), dan domain dikelola **Emergent**. Tidak ada
  migrasi hosting/database.
- Alur: Claude Code → branch pengembangan → Pull Request → (pemilik setuju) →
  merge ke `main` → di terminal Emergent: `bash /app/scripts/emergent_sync.sh`
  → cek Preview → pemilik klik **Re-publish**.
- `git pull` ke workspace ≠ deployment. Produksi hanya berubah saat Re-publish,
  dan Re-publish selalu dilakukan manual oleh pemilik.
- Panduan untuk pemilik: `docs/ALUR_PENGEMBANGAN.md`.

## Aturan wajib

1. Selalu mulai dari `main` terbaru (`git fetch origin main`), kerjakan di
   branch pengembangan, buat PR ke `main`.
2. **Jangan merge PR tanpa persetujuan eksplisit pemilik** di percakapan.
3. Jangan melakukan deployment / Re-publish, dan jangan mengubah domain.
4. Jangan menyentuh database produksi/preview, file `.env`, atau secret.
   Jangan pernah menulis token, sandi, atau URL database ke kode, log, PR, atau commit.
5. Jangan mengubah tanpa instruksi khusus dari pemilik:
   - **sistem voucher**: `generate_voucher_code` (10 karakter = prefix + acak + 3 digit urut),
     alur status draft → aktif (setelah dicetak) → terpakai, penukaran atomik sekali pakai;
   - **QR**: isi QR adalah `https://<domain>/?s=<KODE>` (`build_voucher_scan_url`),
     `generate_qr_base64`, `QR_GEN_VERSION`, pembacaan `?s=` / `?scan=` di `App.js`
     dan `getVoucherCode` di `CashierMode.js`. Voucher yang sudah dicetak (QR berisi
     kode saja maupun tautan `?s=`) harus tetap bisa di-scan;
   - **autentikasi**: login nama + sandi 6 angka, cookie httpOnly, peran
     superadmin/admin/kasir, `seed_admin`, lupa sandi via email;
   - **printer**: `PrintVoucher.js`, `lib/escpos.js`, agen cetak di `backend/static/`.
6. Perubahan data harus kompatibel ke belakang: hanya menambah field dengan
   nilai default. Tidak ada hapus/rename field, migrasi massal, atau operasi
   tulis baru saat startup.
7. Pertahankan file khusus Emergent: folder `.emergent/`, `emergentintegrations`
   dan `litellm` di `requirements.txt`, `@emergentbase/visual-edits` +
   `craco.config.js`, skrip di `frontend/public/index.html`, `backend/pytest.ini`.
8. Hindari menambah dependensi. Bila terpaksa, perbarui `requirements.txt` atau
   `package.json` + `yarn.lock`, dan tulis langkah install di PR (skrip sinkron
   tidak meng-install otomatis).
9. Jangan mengaktifkan restart layanan otomatis di `emergent_sync.sh` sebelum
   izin `supervisorctl` di Emergent terverifikasi pemilik (`--services`).

## Struktur

- `backend/server.py` — seluruh API FastAPI (prefix `/api`, port 8001), MongoDB via Motor.
  Env wajib: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `EMERGENT_EMAIL_KEY`,
  `EMAIL_FROM_NAME`, `OWNER_EMAIL` (opsional: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CORS_ORIGINS`).
- `frontend/` — React 19 (CRA + CRACO), Tailwind, shadcn/ui, yarn. Memakai
  `REACT_APP_BACKEND_URL`. Halaman di `src/pages/`.
- `backend/tests/test_*.py` — tes lama buatan Emergent yang memanggil server
  preview sungguhan. **Jangan dijalankan** dari Claude/CI.
- `backend/tests/ci/` — tes CI terisolasi (MongoDB sementara/tiruan, env palsu).
- `scripts/emergent_sync.sh` — sinkron aman GitHub → workspace Emergent.
- `.github/workflows/ci.yml` — CI: tes backend + build frontend.

## Pengujian sebelum push

Backend (Python 3.11, sama dengan CI):

```bash
python3.11 -m venv /tmp/venv && \
bash scripts/ci_backend_requirements.sh > /tmp/req-ci.txt && \
/tmp/venv/bin/pip install --only-binary :all: -r /tmp/req-ci.txt mongomock-motor && \
/tmp/venv/bin/python -m pytest -c backend/tests/ci/pytest.ini backend/tests/ci -q
```

Tanpa `CI_MONGO_URL`, tes memakai MongoDB tiruan di memori. Di CI dipakai
MongoDB sementara (`CI_MONGO_URL=mongodb://127.0.0.1:27017`).

Frontend: `cd frontend && yarn install --frozen-lockfile && CI=false REACT_APP_BACKEND_URL=https://ci.example.invalid yarn build`.
Bila `assets.emergent.sh` tidak bisa diakses, build di salinan sementara tanpa
devDependency `@emergentbase/visual-edits` (jangan commit perubahan itu).

Skrip sinkron: `shellcheck -S warning scripts/*.sh scripts/tests/*.sh` (bisa via
`pip install shellcheck-py`) dan `bash scripts/tests/test_emergent_sync.sh`.
Setiap perubahan `emergent_sync.sh` wajib disertai tes di file itu.

Tambahkan/ubah tes di `backend/tests/ci/` untuk setiap perubahan perilaku backend.

## Laporan setiap fitur (wajib)

Setiap selesai, laporkan ke pemilik:
1. Ringkasan perubahan dan alasannya.
2. **Daftar file yang berubah.**
3. Hasil pengujian (lokal + status CI di PR) — tulis apa adanya bila ada yang gagal.
4. Link PR.
5. Langkah penerapan: setelah merge → `bash /app/scripts/emergent_sync.sh` di
   terminal Emergent → hal yang perlu dicek di Preview → Re-publish (oleh pemilik).
6. Langkah tambahan bila ada (install paket, variabel env baru) dan cara rollback.
