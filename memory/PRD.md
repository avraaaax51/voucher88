# Voucher88 — Product Requirements

## Overview
Sistem voucher toko (Indonesia) berbasis React + FastAPI + MongoDB dengan role Super Admin, Admin, Kasir. Fitur: buat/cetak/aktifkan/scan/redeem voucher QR, dashboard, kelola user, laporan, pengaturan, thermal printing, audit login.

## Latest change (Feb 2026)
- **Optimasi QR** agar cepat di-scan kamera HP & tajam di thermal print:
  - `box_size=20` (dari 14) → 740×740 px PNG, sangat tajam.
  - `border=4` (dari 2) → quiet zone sesuai spec QR.
  - `.convert("1")` → pure black/white 1-bit, kontras maksimum.
  - `error_correction=L` dipertahankan (modul besar, scan tercepat).
  - Field `qr_gen: "v2"` ditandai; voucher lama auto-regen saat GET list/redeem.
- Pengaturan **Ukuran QR cetak (mm)** ditambahkan di Settings (default 46mm, range 30-80mm) → mempengaruhi voucher cetak dan PNG unduhan.
- Nama Pemilik Voucher opsional & pindah ke bawah form.
- Kamera scanner Kasir dipercepat (fps 25, videoConstraints 1280×720, focusMode continuous).

## Prior features shipped
- Unduh gambar voucher (PNG) di Kelola Voucher.
- Owner name privat: hanya tampil di Laporan + CSV.
- Audit aktivitas login (Super Admin only).
- QR dual-mode (kamera ponsel + scanner web + QR lama).
- Voucher lifecycle: draft → cetak → aktif → redeem.
- Auth cookie httpOnly, PIN 6 digit, forgot password via Resend.
- Bulk print/delete, filter/sort, riwayat kasir, sound, ESC/POS agent.

## Backlog
### P1
- Konfirmasi user: kualitas QR baru di thermal & kecepatan scan.
- Validasi Epson auto-cut via ESC/POS agent.
- Brand "Voucher88" pada Login & Cashier header.
- Pencarian nama pemilik di Laporan.

### P2
- Auto-start Windows print agent, packaging `.exe`.
- Redemption undo, dashboard target/chart kasir.
- Torch/flash toggle di Kasir scanner.

## Constraints
- Preview only; user harus Deploy/Publish untuk production.
- Backend routes prefix `/api`; frontend pakai `REACT_APP_BACKEND_URL`.
- Auth changes wajib via `integration_playbook_expert_v2`.
