# VoucherKu - Product Requirements Document

## Ringkasan Produk
VoucherKu adalah sistem manajemen voucher berbahasa Indonesia untuk toko tunggal dengan fitur pembuatan, pengelolaan, dan penukaran voucher.

## Tech Stack
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Authentication**: JWT-based dengan PIN cepat untuk kasir

## Fitur Utama

### 1. Autentikasi
- [x] Login admin dengan email/password
- [x] Login kasir dengan PIN cepat
- [x] Role-based access (admin/kasir)
- [x] Brute force protection (5 percobaan, lockout 15 menit)
- [x] JWT token management

### 2. Manajemen Voucher
- [x] Buat voucher tunggal
- [x] Buat voucher massal (bulk)
- [x] Format kode: **7 alfanumerik campuran + 3 digit urutan** (contoh: ABC1D2E001)
- [x] QR code unik per voucher
- [x] Status tracking: aktif, terpakai, kadaluarsa
- [x] Filter dan pencarian voucher

### 3. Penukaran Voucher (Redemption)
- [x] Scan QR code
- [x] Input kode manual
- [x] Atomic one-time redemption
- [x] Validasi: kode tidak valid, sudah terpakai, kadaluarsa
- [x] Logging penukaran

### 4. Dashboard & Laporan
- [x] Statistik voucher (total, aktif, terpakai, kadaluarsa)
- [x] Total nominal terpakai
- [x] Penukaran hari ini
- [x] Riwayat penukaran terbaru
- [x] Laporan harian dengan filter tanggal

### 5. Manajemen User
- [x] CRUD user (admin only)
- [x] Assign role dan PIN

### 6. Cetak Voucher
- [x] Print preview untuk thermal printer 80mm
- [x] Template print style "Toko Aneka 88 Mangon" sesuai gambar referensi user
- [x] Arrow shapes pada banner VOUCHER BELANJA
- [x] Dynamic data: nominal, QR, syarat ketentuan, tanggal berlaku
- [ ] Validasi fisik Epson TM-T82II (user device)

## Format Kode Voucher
```
[7 karakter alfanumerik campuran][3 digit urutan]
Contoh: ABC1D2E001, XY5Z8PQ002, 3XBI88W003
```

## API Endpoints
### Auth
- `POST /api/auth/login` - Login email/password
- `POST /api/auth/pin-login` - Login PIN kasir
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout
- `POST /api/auth/register` - Register user (admin only)

### Vouchers
- `POST /api/vouchers` - Create vouchers (admin only)
- `GET /api/vouchers` - List vouchers
- `GET /api/vouchers/{id}` - Get voucher detail
- `POST /api/vouchers/redeem` - Redeem voucher
- `GET /api/vouchers/check/{code}` - Check voucher status

### Users
- `GET /api/users` - List users (admin only)

### Reports
- `GET /api/stats` - Get statistics (admin only)
- `GET /api/reports/daily` - Get daily report (admin only)

## Changelog

### 2026-09-05
- Changed voucher code format from `6 alphanumeric + hyphen + 4 digits` to `7 alphanumeric + 3 digits` (no hyphen)
- Fixed timezone comparison bug in redemption and check voucher endpoints
- Updated print template to match "Toko Aneka 88 Mangon" design reference
- Added arrow shapes (triangles) to VOUCHER BELANJA banner
- Template now displays dynamic data: nominal, QR code, terms, expiry date with calendar icon

## Status: MVP Complete
Semua fitur inti sudah diimplementasi dan diuji.

## Backlog (P1 - User Approved)
- [ ] Bulk voucher dengan prefix kustom
- [ ] Export laporan CSV/PDF
- [ ] Peringatan voucher kedaluwarsa/segera expired

## Backlog (P2)
- [ ] Audit CSS untuk printer Epson TM-T82II 80mm (validasi fisik user)
- [ ] Penambahan data-testid ke semua elemen interaktif
- [ ] Validasi kamera scanner di browser
- [ ] Refactor: Extract PrintVoucher component (menghilangkan duplikasi template)


## Update 2026-09-05 — Print template v3 (shared component)
- Template print dipindah ke komponen shared `frontend/src/components/PrintVoucher.js`, dipakai oleh VoucherManagement (cetak individual) dan CreateVoucher (cetak massal, page-break per voucher).
- Desain mengikuti gambar referensi terbaru: border rounded, header Toko/ANEKA88/MANGON, ribbon hitam "VOUCHER BELANJA" dengan ujung berlekuk, NILAI VOUCHER + nominal besar, QR 40mm, banner hitam rounded untuk syarat/promo (baris pertama lebih besar), kotak tanggal berlaku dengan ikon kalender.
- Konten dinamis: nominal, QR, syarat (fallback "BELANJA LEBIH HEMAT / DI TOKO ANEKA 88 MANGON"), tanggal expired.
- Testing agent iteration_3: PASS (print media render, window.print terpanggil, bulk 2 voucher). Belum dikonfirmasi user pada printer fisik.

## Update 2026-09-05 — Code review fixes
- useCallback + deps lengkap di AdminDashboard, VoucherManagement, UserManagement, Reports, CashierMode (scanner memakai ref untuk handleScan).
- AuthContext: getAuthHeaders useCallback, context value useMemo, console.error dihapus. App.js: konstanta ADMIN_ROLES/CASHIER_ROLES.
- Ditolak/ditunda: pindah token ke httpOnly cookie (perubahan auth, butuh persetujuan user + playbook); temuan Python `is` adalah false positive (`is None`); refactor komponen besar ditunda.
