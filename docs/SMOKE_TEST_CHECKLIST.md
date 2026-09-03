# SMOKE_TEST_CHECKLIST.md — DIS

Checklist manual untuk dijalankan **setelah** blocker di
`supabase/PENDING_ACTIONS.md` selesai (project Supabase dibuat, 23
migrasi jalan bersih, kredensial terisi). Tidak bisa dijalankan dari
sandbox Claude — tidak ada akses jaringan ke `*.supabase.co`.

Isi centang + tanggal setiap kali satu baris selesai diuji. Kalau ada
yang gagal, catat di kolom "Hasil" — itu jadi input migrasi
perbaikan, bukan sesuatu yang ditambal manual di Dashboard.

Status per 2026-09-04. Belum ada satupun baris di bawah ini yang
pernah dijalankan.

---

## 0. Prasyarat sebelum mulai

- [ ] Migrasi 001–023 sudah jalan tanpa error (`supabase db push` atau manual berurutan)
- [ ] `public/js/config.js` sudah diisi `SUPABASE_URL` + `SUPABASE_ANON_KEY` asli
- [ ] 5 akun test dibuat via Supabase Auth, satu per role: `admin`, `ustadz`, `musyrif`, `wali`, `keuangan_spp`
- [ ] Trigger `handle_new_auth_user` (schema_017) berhasil membuat baris `public.users` dengan `role` yang benar untuk tiap akun test — verifikasi manual di Table Editor
- [ ] Minimal 2 santri test dibuat (untuk uji kasus "di dalam" vs "di luar" tanggung jawab)
- [ ] 1 baris `penugasan_ustadz` dan 1 baris `penugasan_musyrif` diisi untuk akun test, hanya mencakup salah satu dari 2 santri test itu

## 1. Login & sesi dasar

| # | Langkah | Role | Hasil diharapkan | Hasil |
|---|---|---|---|---|
| 1.1 | Login dengan email/password akun test | semua 5 role | Masuk ke dashboard sesuai role, nama+role tampil di topbar | ☐ |
| 1.2 | Refresh halaman setelah login | admin | Sesi bertahan (`restoreSession`), tidak dilempar ke login | ☐ |
| 1.3 | Klik "Keluar" | admin | Kembali ke form login | ☐ |

## 2. Data Induk Santri (admin only)

| # | Langkah | Hasil diharapkan | Hasil |
|---|---|---|---|
| 2.1 | Login admin, tambah santri baru lewat form | Santri tersimpan, muncul di daftar | ☐ |
| 2.2 | Login role lain (mis. ustadz) | Form/section "Data Induk Santri" **tidak tampil** (bukan cuma disembunyikan tapi juga ditolak kalau dipaksa lewat API) | ☐ |

## 3. Kehadiran, Nilai — batas kelas ustadz

**Ini yang paling penting diuji — jalur GAGAL, bukan cuma jalur berhasil.**

| # | Langkah | Role | Hasil diharapkan | Hasil |
|---|---|---|---|---|
| 3.1 | Catat kehadiran untuk santri di kelas yang ditugaskan | ustadz | Berhasil tersimpan | ☐ |
| 3.2 | Coba catat kehadiran untuk santri **di kelas lain** (bukan tanggung jawabnya) | ustadz | **Ditolak** oleh RLS — pesan error, bukan silent success | ☐ |
| 3.3 | Input nilai untuk santri di kelasnya | ustadz | Berhasil | ☐ |
| 3.4 | Coba input nilai untuk santri di luar kelasnya | ustadz | **Ditolak** | ☐ |

## 4. Pelanggaran & Prestasi

| # | Langkah | Role | Hasil diharapkan | Hasil |
|---|---|---|---|---|
| 4.1 | Catat pelanggaran untuk santri di tanggung jawabnya | ustadz/musyrif | Berhasil, poin tersimpan | ☐ |
| 4.2 | Catat prestasi | ustadz/musyrif | Berhasil | ☐ |
| 4.3 | Cek akumulasi poin tahun ajaran berjalan sesuai "Model B" (schema_016) | admin | Poin terakumulasi benar, belum direset kalau masih tahun ajaran sama | ☐ |

## 5. Perizinan — sumbu wali

| # | Langkah | Role | Hasil diharapkan | Hasil |
|---|---|---|---|---|
| 5.1 | Ajukan izin untuk anak sendiri | wali | Berhasil, status "Menunggu" | ☐ |
| 5.2 | Coba ajukan izin untuk santri **yang bukan anaknya** | wali | **Ditolak** RLS | ☐ |
| 5.3 | Approve/tolak pengajuan | admin | Tombol muncul, status berubah | ☐ |
| 5.4 | Coba approve/tolak lewat akun wali | wali | Tombol **tidak tampil** (RLS admin-only untuk update status) | ☐ |

## 6. SPP — **belum pernah diuji sama sekali, prioritas tinggi**

| # | Langkah | Role | Hasil diharapkan | Hasil |
|---|---|---|---|---|
| 6.1 | Buat tagihan untuk 1 santri | admin/keuangan_spp | Tersimpan, muncul di daftar | ☐ |
| 6.2 | Coba buat tagihan lewat akun ustadz/wali | ustadz atau wali | **Ditolak** RLS | ☐ |
| 6.3 | Catat pembayaran (pakai ID tagihan dari daftar) | admin/keuangan_spp | Tersimpan | ☐ |
| 6.4 | Cek status tagihan setelah pembayaran | admin | Status **TIDAK** otomatis berubah jadi lunas (gap terdokumentasi di schema_005) — update manual lewat dropdown | ☐ |
| 6.5 | Login sebagai wali, lihat tagihan | wali | Hanya tagihan anaknya sendiri yang tampil | ☐ |
| 6.6 | ⚠️ Konfirmasi 2 keputusan bisnis SPP yang tertunda (`docs/database-design.md`, catatan schema_005) sudah dipenuhi sebelum modul ini dianggap "siap pakai" | product owner | — | ☐ |

## 7. Kesehatan — data sensitif, **belum pernah diuji**

| # | Langkah | Role | Hasil diharapkan | Hasil |
|---|---|---|---|---|
| 7.1 | Buat profil kesehatan baru untuk santri | admin | Tersimpan | ☐ |
| 7.2 | Login wali, update profil kesehatan anaknya (yang sudah ada) | wali | Berhasil update | ☐ |
| 7.3 | Login wali, coba buat profil untuk santri yang **belum punya baris** | wali | **Ditolak** (wali hanya bisa UPDATE, bukan INSERT — disengaja, lihat komentar `kesehatan.js`) | ☐ |
| 7.4 | Login ustadz atau musyrif, cek section Kesehatan | ustadz/musyrif | Section **tidak tampil sama sekali** (gate role di uiShell.js) — kalau dipaksa lewat API, harus ditolak RLS juga | ☐ |
| 7.5 | Tambah riwayat kesehatan (episodik) | admin dan wali | Keduanya berhasil insert | ☐ |
| 7.6 | Login wali, coba lihat/update profil kesehatan santri **yang bukan anaknya** | wali | **Ditolak** | ☐ |

## 8. Known limitation yang harus diverifikasi, bukan dianggap bug

- [ ] Role tanpa akses SELECT ke suatu tabel menampilkan "Belum ada data" — **ini bukan bug**, itu perilaku UI yang sudah dicatat (RLS menolak diam-diam). Pastikan tidak disalahartikan sebagai kegagalan saat smoke test.
- [ ] Katalog `jenis_pelanggaran` masih kosong — form Pelanggaran pakai input manual kategori+poin. Ini keterbatasan diketahui, bukan hal yang perlu diperbaiki di smoke test ini.

---

## Setelah semua baris tercentang

- [ ] Laporkan hasil ke Claude (terutama baris yang gagal) — kegagalan RLS perlu migrasi perbaikan baru, bukan patch manual di Dashboard.
- [ ] Update `supabase/PENDING_ACTIONS.md` — pindahkan item yang sudah selesai ke bagian "Selesai".
- [ ] Baru setelah semua ✅, DIS bisa dianggap siap dipakai pengguna nyata (Rilis 3, lihat `docs/PRD-DIS-v1.0.md`).
