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
| `SIAP DICEK: workspace = GitHub main (...)` | Kode sudah terbaru | Cek Preview, lalu Re-publish |
| `Tidak ada perubahan baru dari GitHub.` | Sudah terbaru sebelumnya | Tidak ada |
| `GAGAL: ada file terlacak yang diubah langsung...` | Ada file yang diubah langsung di Emergent | Kirim pesan itu ke Claude. Tidak ada yang diubah |
| `DIHENTIKAN: workspace dan GitHub bercabang` | Ada commit di Emergent yang belum di GitHub (mis. dari agent Emergent) | Kirim pesan itu ke Claude. Tidak ada yang diubah |
| `Pengecekan gagal -> mengembalikan kode...` | Kode baru error, otomatis dikembalikan | **Jangan Re-publish**. Laporkan ke Claude |
| `PERHATIAN: ... requirements.txt / yarn ...` | Ada paket baru | Ikuti petunjuk di PR sebelum Re-publish |
| `PERHATIAN: backend belum merespons normal` | Backend preview belum jalan | Cek Preview; bila error, jalankan rollback |

Skrip ini **tidak** me-restart layanan, **tidak** meng-install paket, **tidak**
menyentuh database atau `.env`, dan **tidak** melakukan Re-publish.

Perintah lain:

```bash
bash /app/scripts/emergent_sync.sh --check     # lihat apa yang akan berubah, tanpa mengubah
bash /app/scripts/emergent_sync.sh --status    # versi sekarang + riwayat sinkron
bash /app/scripts/emergent_sync.sh --services  # cek izin restart layanan (hanya membaca)
```

## 4. Cek Preview, lalu Re-publish

Buka Preview, coba bagian yang diubah (Claude menuliskan apa yang perlu dicek).
Bila sudah benar, klik **Re-publish** di Emergent. Opsional: beri tahu Claude
*"sudah publish"* agar versi itu ditandai sebagai titik rollback.

## 5. Bila terjadi masalah (rollback)

- **Preview error setelah sinkron:** jalankan perintah rollback yang dicetak
  skrip, contoh `bash /app/scripts/emergent_sync.sh --rollback 906d38e`. Kode
  workspace kembali ke versi itu; database tidak diubah.
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
