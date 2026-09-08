# Voucher88 — Product Requirements

## Overview
Sistem voucher toko (Indonesia) berbasis React + FastAPI + MongoDB dengan role Super Admin, Admin, Kasir. Fitur: buat/cetak/aktifkan/scan/redeem voucher QR, dashboard, kelola user, laporan, pengaturan, thermal printing, audit login.

## Latest change (Feb 2026)
- Kolom **Nama Pemilik Voucher** dipindahkan ke bagian bawah form Buat Voucher dan dijadikan **opsional** (label "Opsional", tanpa `required`).
- Kamera scanner Kasir dipercepat: `fps: 25`, `videoConstraints` 1280×720 + `focusMode: continuous`, `qrbox` 260×260.
- Build frontend berhasil.

## Prior features shipped (agent-tested, awaiting user confirmation)
- Unduh gambar voucher (PNG) di Kelola Voucher.
- Owner name privat: hanya tampil di Laporan + CSV, tidak dicetak.
- Audit aktivitas login (Super Admin only, 403 untuk role lain).
- QR dual-mode (kamera ponsel biasa + scanner web, kompatibilitas QR lama).
- Voucher lifecycle: draft → cetak → aktif → redeem; status badge warna kontras.
- Auth cookie httpOnly, PIN 6 digit, Super Admin, forgot password via Resend.
- Bulk print/delete, filter/sort, riwayat kasir, sound feedback, ESC/POS agent Windows.

## Backlog
### P1
- Konfirmasi user: unduh PNG, owner name di laporan, kecepatan scanner baru.
- Validasi QR scan di kamera perangkat toko nyata.
- Validasi Epson auto-cut via ESC/POS agent di Windows.
- Brand "Voucher88" pada Login header dan Cashier header (konsistensi).
- Pencarian nama pemilik di Laporan.
- Opsi ukuran QR cetak.

### P2
- Auto-start Windows print agent, packaging `.exe`.
- Redemption undo, dashboard target/chart kasir.
- Bulk print concurrency & atomic redemption improvements.

## Constraints
- Preview only; user harus Deploy/Publish untuk production.
- Backend routes prefix `/api`; frontend pakai `REACT_APP_BACKEND_URL`.
- Auth changes wajib via `integration_playbook_expert_v2`.
