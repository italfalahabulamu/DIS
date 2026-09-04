# Akun Mock/Demo — DIS

Dokumen ini melengkapi `PENDING_ACTIONS.md` dan `docs/SMOKE_TEST_CHECKLIST.md`.
**Tidak ada akun bawaan** di database manapun — ini panduan MEMBUATNYA,
bukan daftar akun yang sudah aktif.

## Prasyarat
1. Project Supabase DIS sudah dibuat (`PENDING_ACTIONS.md` blocker #1)
2. 24 migrasi sudah dijalankan (blocker #2)
3. `public/js/config.js` sudah diisi kredensial asli (blocker #3)

## Langkah

```bash
# 1. Isi data pendukung (kelas, santri, wali) -- via Dashboard SQL Editor
#    atau CLI, jalankan file ini APA ADANYA (aman diulang):
supabase/seed.sql

# 2. Buat akun login -- BEDA mekanisme, butuh Admin API bukan SQL biasa:
npm install @supabase/supabase-js
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role_key_dari_dashboard> \
node scripts/seed-mock-accounts.mjs
```

## Akun yang dibuat

| Email | Role | Password | Catatan |
|---|---|---|---|
| `admin.demo@dis.local` | admin | `DemoDIS!2026` | Akses penuh semua tabel |
| `ustadz.demo@dis.local` | ustadz | `DemoDIS!2026` | Belum dibatasi per kelas (temuan S-04, lihat audit) |
| `musyrif.demo@dis.local` | musyrif | `DemoDIS!2026` | Belum ditugaskan ke asrama manapun — perlu insert manual ke `penugasan_musyrif` untuk uji modul asrama |
| `keuangan.demo@dis.local` | keuangan_spp | `DemoDIS!2026` | Akses modul SPP |
| `wali.demo@dis.local` | wali | `DemoDIS!2026` | Wali dari santri **DEMO-0001** (Fulan bin Ahmad) |
| `wali.lain.demo@dis.local` | wali | `DemoDIS!2026` | Wali dari santri **DEMO-0002** (Fulanah binti Siti) — dipakai khusus uji **negatif**: pastikan akun ini **ditolak** saat mencoba akses data DEMO-0001 |

**Password sama untuk semua** (`DemoDIS!2026`) — ini akun demo/testing,
bukan pola yang boleh dipakai untuk akun staf/wali sungguhan. Hapus
atau ganti seluruh akun ini sebelum aplikasi dipakai pengguna asli.

## Kenapa dua langkah terpisah (seed.sql vs script Node)?

`auth.users` (akun login sungguhan: email, password hash) dikelola
internal oleh Supabase Auth (GoTrue) — tidak bisa diisi lewat `INSERT`
SQL biasa dengan aman. `public.wali`/`public.santri`/dst adalah tabel
data aplikasi biasa, bisa lewat SQL. Urutannya wajib: data dulu
(`seed.sql`, termasuk baris `wali` dengan UUID tetap), baru akun
(`seed-mock-accounts.mjs` mengaitkan akun wali ke UUID `wali` yang
sudah ada lewat `user_metadata.wali_id`) — trigger `handle_new_auth_user`
(schema_017) yang menyambungkan keduanya otomatis saat akun dibuat.
