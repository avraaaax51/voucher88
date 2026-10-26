# Alur Pengembangan Aneka 88 Voucher

Panduan singkat untuk pemilik. Hosting, database, dan domain tetap di Emergent.

## Gambaran alur

```
Anda minta fitur ke Claude
   ↓  (otomatis) Claude: coding → tes → push → Pull Request
   ↓  (otomatis) GitHub Actions: tes backend + build frontend
Anda setujui merge PR            ← 1 klik / 1 kalimat
   ↓
Terminal Emergent: 1 perintah    ← bash /app/scripts/emergent_sync.sh
   ↓
Cek Preview                      ← Anda
   ↓
Klik Re-publish                  ← Anda (website produksi berubah di sini)
```

`git pull` hanya mengubah kode di workspace/preview. **Website produksi baru
berubah setelah Anda klik Re-publish.**

## 1. Meminta fitur

Tulis permintaan ke Claude Code, misalnya: *"Tambahkan tombol senter kamera di
halaman Kasir."* Claude akan membalas dengan link PR, daftar file yang berubah,
hasil tes, dan langkah penerapan.

## 2. Menyetujui merge

- Buka link PR. Pastikan tanda centang **CI hijau** (Backend dan Frontend).
- Klik **Merge pull request**, atau balas ke Claude: *"setuju merge PR #N"*.
- Bila CI merah, jangan merge. Claude akan memperbaikinya.

## 3. Menyinkronkan workspace Emergent

Buka terminal VS Code di Emergent, jalankan:

```bash
bash /app/scripts/emergent_sync.sh
```

Arti hasilnya:

| Pesan | Arti | Yang perlu dilakukan |
|---|---|---|
| `SIAP DICEK: ... dependensi & layanan OK` | Kode terbaru, dependensi cocok, backend & frontend merespons | Cek Preview, lalu Re-publish |
| `BELUM SIAP — JANGAN Re-publish` | Kode sudah diperbarui, tetapi dependensi belum terpasang atau layanan tidak merespons | Ikuti petunjuk di atas pesan itu, lalu jalankan skrip lagi |
| `Dependensi Python/frontend: BELUM TERPASANG` | Ada paket baru | Jalankan perintah install yang ditampilkan, lalu jalankan skrip lagi |
| `Restart layanan: backend/frontend` | Kode backend/frontend berubah, layanannya di-restart otomatis | Tidak ada; tunggu hasil cek kesehatan |
| `Restart ... GAGAL` / status `RESTART_FAIL` | Layanan gagal di-restart | **Jangan Re-publish**. Coba `--restart`; bila tetap gagal, laporkan ke Claude. Kode **tidak** di-reset |
| `Restart ditunda sampai dependensi terpasang` | Ada paket baru yang belum di-install | Install paket sesuai petunjuk, lalu `bash /app/scripts/emergent_sync.sh --restart` |
| `Kesehatan backend/frontend: GAGAL` | Layanan preview tidak merespons dalam 120 detik | Coba `--restart`, lalu jalankan skrip lagi. Kode **tidak** di-reset |
| `GAGAL: ada file terlacak yang diubah langsung...` | Ada file yang diubah langsung di Emergent | Kirim pesan itu ke Claude. Tidak ada yang diubah |
| `GAGAL: file lokal berikut akan tertimpa...` | Ada file milik Anda (tidak dilacak git) di lokasi yang akan diisi file dari GitHub | Backup/pindahkan file itu atau tanya Claude. Tidak ada yang diubah |
| `GAGAL: perubahan berisi file .env` | Ada perubahan file rahasia dari GitHub | Ditolak demi keamanan. Laporkan ke Claude |
| `DIHENTIKAN: workspace dan GitHub bercabang` | Ada commit di Emergent yang belum ada di GitHub (mis. dari agent Emergent) | Kirim pesan itu ke Claude. Tidak ada yang diubah |
| `GAGAL: git fetch tidak berhasil` | Gangguan jaringan/izin GitHub | Coba lagi nanti. Tidak ada yang diubah |
| `Cek kode gagal -> mengembalikan kode...` | Kode baru error (sintaks), otomatis dikembalikan ke versi sebelumnya | **Jangan Re-publish**. Laporkan ke Claude |
| `Tidak ada perubahan baru dari GitHub.` | Sudah terbaru | Tidak ada |

Kode keluar (untuk Claude): `0` siap, `1` berhenti/gagal tanpa perubahan atau sudah dikembalikan,
`2` salah perintah, `3` kode berubah tetapi belum siap.

Bila kode backend dan/atau frontend berubah, skrip **me-restart hanya layanan
itu** (`backend`, `frontend`) lewat `sudo -n supervisorctl`, lalu mengecek
kesehatannya. MongoDB dan layanan internal Emergent (`code-server`,
`nginx-code-proxy`, `webhook-crond`) **tidak pernah** disentuh. Skrip **tidak**
meng-install paket, **tidak** menyentuh database atau `.env`, dan **tidak**
melakukan Re-publish.

Perintah lain:

```bash
bash /app/scripts/emergent_sync.sh --check         # lihat apa yang akan berubah, tanpa mengubah
bash /app/scripts/emergent_sync.sh --status        # versi sekarang + riwayat sinkron
bash /app/scripts/emergent_sync.sh --services      # cek izin restart layanan (hanya membaca)
bash /app/scripts/emergent_sync.sh --restart       # restart backend + frontend lalu cek kesehatan
bash /app/scripts/emergent_sync.sh --no-restart    # sinkron tanpa restart otomatis
bash /app/scripts/emergent_sync.sh --confirm-deps  # bila paket sudah di-install tetapi tetap terbaca belum
```

## 4. Cek Preview, lalu Re-publish

Buka Preview, coba bagian yang diubah (Claude menuliskan apa yang perlu dicek).
Bila sudah benar, klik **Re-publish** di Emergent. Opsional: beri tahu Claude
*"sudah publish"* agar versi itu ditandai sebagai titik rollback.

## 5. Bila terjadi masalah (rollback)

- **Preview error setelah sinkron:** jalankan perintah rollback yang dicetak
  skrip, contoh `bash /app/scripts/emergent_sync.sh --rollback 906d38e`.
  Rollback hanya mengembalikan **kode**: database **tidak** dipulihkan, paket
  yang sudah ter-install **tidak** dikembalikan, `.env` dan file yang tidak
  dilacak git tidak disentuh. Rollback ditolak bila ada file yang diubah lokal
  atau ada file Anda yang akan tertimpa.
- **Produksi sudah terlanjur di-Re-publish:** gunakan fitur rollback/riwayat
  deploy Emergent bila tersedia, atau jalankan rollback di atas lalu Re-publish lagi.
- **Membatalkan permanen:** minta Claude membuat PR *revert*. Tanpa itu,
  sinkron berikutnya akan menarik lagi versi terbaru dari GitHub.

Log tersimpan di `/app/.sync-logs/` (tidak ikut ke GitHub, token/sandi disamarkan).

## 6. Hal yang sebaiknya dihindari

- Mengedit kode langsung di Emergent atau memakai agent Emergent untuk coding
  (membuat workspace bercabang dari GitHub). Bila terpaksa, beri tahu Claude.
- Menempelkan token, sandi, atau isi `.env` ke chat atau GitHub.

## Pengaturan satu kali (disarankan)

Lindungi branch `main` agar hanya bisa diubah lewat PR dengan CI hijau:

1. GitHub → repo **voucher88** → **Settings** → **Branches** (atau **Rules → Rulesets**).
2. **Add branch protection rule** / **New ruleset** untuk branch `main`.
3. Centang **Require a pull request before merging**.
4. Centang **Require status checks to pass** lalu pilih
   `Backend (tes API terisolasi)` dan `Frontend (build produksi)`
   (muncul setelah CI berjalan sekali).
5. Simpan.

Catatan keamanan untuk workspace Emergent: akses GitHub di terminal cukup
**hanya-baca**. Bila memakai token, gunakan *fine-grained token* khusus repo
ini dengan izin *Contents: Read-only*, dan jangan menaruh token di URL remote.
