# Staging Railway — Aneka 88 Voucher

Panduan menjalankan **staging** di Railway (proyek `aneka88voucher-staging`,
environment `staging`). Produksi tetap di **Emergent** dengan domain
**aneka88voucher.com**. Tidak ada yang dipindahkan dari produksi.

## Arsitektur

```
Browser ── https://<domain-staging>.up.railway.app
              │
        [service: frontend]  Caddy: sajikan React + teruskan /api/* ──┐
                                                                     │ jaringan privat Railway
        [service: backend]   FastAPI (tanpa domain publik)  ◄────────┘
              │
        [service: MongoDB]   database staging khusus (kosong, terpisah dari produksi)
```

- Browser hanya melihat **satu domain** (frontend). Panggilan `/api/...`
  diteruskan Caddy ke backend, jadi cookie login tetap *first-party*: tidak
  diblokir Safari/Chrome dan tidak perlu mengubah pengaturan cookie.
- Backend tidak perlu domain publik.
- Tautan QR voucher dibuat dari domain yang dibuka (`https://<domain>/?s=KODE`),
  diteruskan Caddy lewat header `X-Forwarded-Host/Proto`.

## Langkah di Railway (sekali)

1. **MongoDB:** di proyek `aneka88voucher-staging` → *New* → *Database* →
   *MongoDB*. Database ini baru dan kosong, terpisah total dari database Emergent.
2. **Backend:** *New* → *GitHub Repo* → `avraaaax51/voucher88`, lalu di *Settings*:
   - Service name: `backend`
   - Branch: `claude/railway-staging` (sesudah PR di-merge, ganti ke `main`)
   - Root Directory: `backend`
   - Config file path: `/backend/railway.json`
   - **Jangan** buat domain publik.
   - Isi variabel (tabel di bawah).
3. **Frontend:** *New* → *GitHub Repo* → repo yang sama:
   - Service name: `frontend`
   - Branch: sama dengan backend
   - Root Directory: `frontend`
   - Config file path: `/frontend/railway.json`
   - *Networking* → *Generate Domain* (domain `*.up.railway.app`). **Jangan**
     memasang aneka88voucher.com.
   - Isi variabel (tabel di bawah).
4. Tunggu kedua deploy hijau, lalu jalankan uji asap (bagian bawah).

## Environment variable

Nilai rahasia **diisi langsung di Railway**, tidak pernah ditulis di repo atau chat.

### Service `backend`

| Variabel | Wajib | Contoh / nilai | Keterangan |
|---|---|---|---|
| `MONGO_URL` | ya | `${{MongoDB.MONGO_URL}}` | Referensi ke service MongoDB staging. **Jangan** pernah memakai URL database Emergent |
| `DB_NAME` | ya | `voucher88_staging` | Nama database staging |
| `JWT_SECRET` | ya | *(acak, ≥ 32 karakter)* | Buat baru khusus staging. Jangan pakai nilai Emergent |
| `ADMIN_PASSWORD` | ya | *(6 angka, khusus staging)* | Sandi awal Super Admin "Admin" di database staging yang kosong |
| `ADMIN_EMAIL` | tidak | `admin@example.com` | Info saja |
| `PORT` | ya | `8001` | Harus sama dengan port di `BACKEND_INTERNAL_URL` |
| `CORS_ORIGINS` | ya | `https://<domain-frontend>.up.railway.app` | Domain frontend staging (tanpa `/` di akhir) |
| `EMAIL_PROVIDER` | ya | `disabled` | Lihat bagian Email. `disabled` = fitur lupa sandi menjawab "belum dikonfigurasi" |
| `OWNER_EMAIL` | bila email aktif | *(email pemilik)* | Penerima kode reset sandi |
| `EMAIL_FROM_NAME` | tidak | `Voucher88 Staging` | Nama pengirim |
| `EMAIL_FROM_ADDRESS` | bila resend/smtp | `onboarding@resend.dev` | Alamat pengirim |
| `RESEND_API_KEY` | bila resend | *(rahasia)* | Kunci API Resend khusus staging |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` | bila smtp | *(rahasia)* | Port 587 (STARTTLS) atau 465 (SSL) |

Variabel Emergent (`EMERGENT_EMAIL_KEY`) **tidak** dipakai di Railway.

### Service `frontend`

| Variabel | Wajib | Contoh / nilai | Keterangan |
|---|---|---|---|
| `BACKEND_INTERNAL_URL` | ya | `http://backend.railway.internal:8001` | Alamat privat backend (`<nama-service>.railway.internal:<PORT>`) |
| `PUBLIC_SCHEME` | tidak | `https` | Skema yang dipakai untuk tautan QR (default https) |
| `REACT_APP_BACKEND_URL` | tidak | *(kosongkan / jangan diisi)* | Kosong = API di domain yang sama |

`REACT_APP_DISABLE_EMERGENT_SCRIPTS=true` sudah menjadi default di
`frontend/Dockerfile`, sehingga skrip analitik/editor Emergent tidak dimuat di Railway.

### Service `MongoDB`

Dibuat oleh template Railway; tidak perlu diubah.

## Email (pengganti layanan Emergent)

Backend kini mendukung `EMAIL_PROVIDER`:

| Nilai | Kegunaan |
|---|---|
| `emergent` | Perilaku lama. Otomatis dipakai bila `EMERGENT_EMAIL_KEY` ada (workspace Emergent) |
| `disabled` | **Disarankan untuk staging awal.** Tidak ada email terkirim; lupa sandi menjawab 503 dan tidak membuat kode reset |
| `resend` | Layanan Resend (HTTPS API). Untuk uji: akun Resend gratis + pengirim `onboarding@resend.dev`, hanya ke email pemilik akun |
| `smtp` | Server SMTP mana pun (mis. Gmail App Password, Brevo, Mailgun) |

Belum ada layanan email produksi yang dipakai.

## Menguji staging

Dari komputer mana pun yang punya bash dan curl:

```bash
# Hanya membaca, aman:
bash scripts/railway_smoke_test.sh https://<domain-frontend>.up.railway.app

# Membuat & menghapus 1 voucher uji di database STAGING (memakai sandi admin staging):
SMOKE_ADMIN_PASSWORD='<sandi admin staging>' bash scripts/railway_smoke_test.sh https://<domain-frontend>.up.railway.app --write
```

Mode `--write` ditolak bila domain berisi `aneka88voucher.com`.

Uji manual yang disarankan di browser: login Admin, buat voucher, cetak tes,
login kasir di HP, scan QR voucher staging, laporan dan export CSV.

## Hal penting

- Database staging **kosong**. Menyalin data produksi ke staging adalah
  langkah terpisah yang butuh persetujuan pemilik (hanya-baca dari produksi).
- Saat voucher dibuka di staging, gambar QR-nya dibuat ulang memakai domain
  staging (perilaku aplikasi yang sudah ada). Karena itu **jangan pernah
  menyalin database staging ke produksi**.
- Voucher yang sudah dicetak dengan QR `https://aneka88voucher.com/?s=KODE`
  tetap valid: format tautan tidak berubah, dan scanner kasir membaca kodenya
  dari domain mana pun.
- Railway men-deploy otomatis setiap ada push ke branch yang dihubungkan. Itu
  hanya staging; produksi tetap Emergent dan tidak tersentuh.
- Biaya: Railway menagih pemakaian (3 service kecil). Pantau di *Usage*.

## Kompatibilitas dengan Emergent

Semua perubahan bersifat tambahan:
- `server.py`: tanpa variabel email baru, perilaku sama (`EMERGENT_EMAIL_KEY` ada
  → penyedia `emergent`).
- `frontend/public/index.html`: skrip Emergent tetap dimuat kecuali build
  disetel `REACT_APP_DISABLE_EMERGENT_SCRIPTS=true` (hanya di Dockerfile Railway).
- File baru (`Dockerfile`, `Caddyfile`, `railway.json`, `requirements-railway.txt`)
  tidak dipakai Emergent.
