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

## Update 2026-09-05 — 4 fitur baru (testing iteration_4: PASS 17/17 backend + frontend)
- Cookie-only auth: token dihapus dari respons login/pin-login, Bearer fallback dihapus, localStorage tidak dipakai.
- Pengaturan toko (/admin/settings, GET/PUT /api/settings, koleksi `settings` _id "store"): store_prefix, store_name, store_branch, promo_line1/2, expiry_warning_days. PrintVoucher membaca settings (hook useStoreSettings), preview live di halaman Pengaturan.
- Peringatan kedaluwarsa: stats.expiring_soon + kartu dashboard, badge amber "Segera Kadaluarsa · N hari" di Kelola Voucher.
- Prefix kode massal: field `prefix` (maks 4 alnum), kode tetap 10 karakter = prefix + acak + 3 digit serial.

## Backlog
- P1 Export laporan CSV/PDF (tombol Export CSV sudah ada di Laporan — cek fungsinya)
- P2 Refactor komponen besar (CashierMode, Reports, UserManagement), uji atomicity redemption

## Update 2026-09-05 — Tema comic-lite
- Kartu "Segera Kadaluarsa" dihapus dari Dashboard (badge di Kelola Voucher tetap).
- Tema global via index.css: font Comic Neue 300 (body) + Patrick Hand (heading), background krem, border tinta 1.5px + offset shadow tipis pada Card/Button/Input/Badge. Template print tidak terpengaruh (inline Arial).

## Update 2026-09-05 — 4 fitur (iteration_5 PASS 27/27 backend + UI)
- Export CSV Laporan: BOM UTF-8, delimiter ";", judul+periode, baris TOTAL (Excel-friendly).
- Filter "Segera Kadaluarsa" (status=expiring) di Kelola Voucher, dihitung backend dari expiry_warning_days.
- Mode Kasir: stempel komik besar BERHASIL!/DITOLAK! (.comic-stamp, animasi stamp-in).
- Kelola User: DELETE /api/users/{id} (tak bisa hapus diri/admin terakhir), PUT /api/users/{id}/reset (password/PIN). Akun uji TEST_kasir dihapus.

## Update 2026-09-05 — Rapikan mobile + hapus voucher + laporan
- Kartu voucher: slot status (150px) & slot cetak tetap, badge "Belum Aktif" dihapus (draft hanya tampil "Belum dicetak"), teks Exp disembunyikan dari list, tombol hapus (DELETE /api/vouchers/{id}, admin, confirm).
- Laporan: kartu Total Nominal dipindah ke atas, besar & kuning menonjol.
- Voucher baru status draft → aktif setelah dicetak (mark-printed). Header sort kolom di Kelola Voucher (desktop).

## Update 2026-09-05 — Auth nama+sandi 6 angka, hapus semua data, fix QR scan (iteration_7 PASS 16/16 + UI)
- Login: nama (case-insensitive) + sandi 6 angka untuk admin & kasir; pin-login dihapus; register/reset wajib 6 digit; index unik users.name_lower; email opsional. Admin: nama "Admin", sandi 123456 (ADMIN_PASSWORD di backend/.env).
- POST /api/admin/reset-data {confirm:"HAPUS SEMUA"} → hapus voucher, riwayat, counter (user & pengaturan tetap). UI Zona Bahaya di Pengaturan.
- Kasir QR: scanner tetap ter-mount (hidden) saat hasil tampil, debounce scan ganda (busyRef + 4s), decode trim/uppercase, pause/resume aman.
- Visual: avatar sidebar → ikon monitor gaya komik; kartu Total Nominal warna amber-100 lebih lembut.

## Update 2026-09-05 — Suara kasir, riwayat kasir, aksi massal (iteration_8)
- useSound.js (Web Audio chime/buzzer, toggle btn-toggle-sound, localStorage voucherku_sound).
- GET /api/redemptions/mine → riwayat hari ini per user; kartu "Riwayat Hari Ini" di /kasir.
- Kelola Voucher: checkbox per voucher, pilih semua, bar aksi massal Cetak/Hapus; POST /api/vouchers/bulk-delete.

## Update 2026-09-05 — Laporan Per Kasir
- /api/reports/daily kini juga mengembalikan by_cashier (agregasi redemption_logs per redeemed_by). Tabel "Laporan Per Kasir" di Laporan (mengikuti filter tanggal) + ikut diekspor ke CSV. Self-tested (curl + screenshot).

## Update 2026-09-05 — Fix data beda antar perangkat (iteration_9)
- Middleware Cache-Control no-store untuk /api; hook useAutoRefresh (focus/visibility + 30s) di Dashboard, Kelola Voucher, Laporan, Kasir.
- Hapus voucher (single/bulk) juga menghapus redemption_logs terkait; orphan logs dibersihkan.
- Catatan: URL preview vs domain publish = database berbeda (bukan bug).

## Update 2026-09-05 — Fix print TM-T82 (iteration_10)
- Print via React portal ke #print-root (di luar #root); @media print: #root none, @page 72mm auto margin 0, kartu 72mm, break-before page per voucher (1 voucher = 1 halaman = 1 cut). PDF 5 voucher = 5 halaman terverifikasi.
- Catatan driver Epson: set paper 80mm, "Paper Cut: cut per page / at end of document page", margin 0 di dialog print browser.

## Update 2026-09-05 — Pengaturan Cetak (iteration_11)
- Settings print_paper_mm/print_width_mm/print_offset_mm/print_scale/print_feed_mm (validasi backend). PrintPortal inject @page size dinamis; PrintVoucher marginLeft=(paper-width)/2+offset, zoom=scale, padding bawah=feed. Pratinjau kertas + garis tengah + tombol Cetak Tes di Pengaturan.

## Update 2026-09-05 — Auto cut fix (iteration_12)
- Setting print_page_height_mm (default 150, 0=auto). @page size tetap WxH → tiap voucher 1 halaman berukuran pasti → driver cut per halaman. PDF 4 voucher = 4 halaman 80x150mm terverifikasi. Preview garis potong di Pengaturan.

## Update 2026-09-05 — Cetak langsung ESC/POS + auto cut (iteration_13 PASS)
- lib/escpos.js: render voucher ke canvas 576px, raster GS v 0, cut 1D 56 42 00 per voucher, kirim base64 ke agen lokal (default http://localhost:9100). Agen: backend/static/voucher_print_agent.py (+ .bat), download via /api/print-agent/download/{file}.
- Settings print_method (browser|agent), print_agent_url, print_printer_name; UI kartu "Cetak Langsung + Auto Cut" (tes koneksi, unduh agen, pratinjau bitmap). Semua tombol cetak memakai agen bila print_method=agent.
- Catatan Chrome: fetch https→localhost butuh izin Local Network Access (prompt "Izinkan"); fetch memakai targetAddressSpace loopback.

## Update 2026-09-05 — Ganti Sandi Sendiri (iteration_14)
- POST /api/auth/change-password; dialog ChangePasswordDialog di menu user admin (btn-change-password) & header kasir (btn-change-password-kasir).
- seed_admin tidak lagi mereset sandi admin dari env saat restart (ADMIN_PASSWORD hanya untuk pembuatan awal).

## Update 2026-09-06 — Agen PowerShell + Kode Pemulihan (iteration_15)
- backend/static/Voucher88PrintAgent.ps1/.bat: agen ESC/POS tanpa Python (TcpListener + winspool RAW), unduh dari Pengaturan.
- Kode pemulihan admin: POST /auth/recovery-code (sekali tampil, hash disimpan di user), GET status, POST /auth/recover publik (single-use, brute-force 5x/15m). UI: kartu di Pengaturan + "Lupa sandi admin?" di login.

## Update 2026-09-06 — Super Admin + Lupa sandi via email (iteration_17 PASS)
- Role superadmin: akun pertama "Admin" (sandi awal 123321, ADMIN_PASSWORD). require_role: superadmin lolos semua. Hanya superadmin buat/hapus admin & reset sandi admin; superadmin tak bisa dihapus. GET /api/auth/names publik → chip nama di login (preselect nama terakhir).
- Lupa sandi: POST /auth/forgot-password {name} → kode 6 digit (bcrypt, 10 mnt) dikirim via Emergent managed email ke OWNER_EMAIL=avraaaax51@gmail.com (EMERGENT_EMAIL_KEY, EMAIL_FROM_NAME=Voucher88); POST /auth/reset-with-code. Rate limit 3/15m & 5/15m. Endpoint recovery-code lama dihapus.
- Kredensial preview: Admin / 123321.

## Update 2026-09-06 — Badge status voucher (iteration_18)
- Voucher belum dicetak/draft → status "Belum Aktif" (abu-abu). Badge cetak: Sudah dicetak hijau solid, Belum dicetak oranye putus-putus.
