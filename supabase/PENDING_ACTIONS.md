# PENDING_ACTIONS.md — DIS

Dokumen ini adalah **satu-satunya sumber kebenaran** untuk pekerjaan
yang harus dilakukan tim Supabase (di luar sandbox Claude — tidak ada
akses jaringan ke `*.supabase.co` dari lingkungan kerja Claude). Kalau
dokumen ini bertentangan dengan README atau catatan lain, **dokumen
ini yang menang** — pola sama seperti `PENDING_ACTIONS.md` di
dataku2026.

Status per 2026-09-04. Update tanggal + centang setiap kali satu item
selesai.

**Update sejak 2026-09-02:** UI SPP dan Kesehatan sudah disambung ke
dashboard (lihat commit `c9c2fe4`) — modul ini kini punya status yang
sama seperti 5 modul lain: kode lengkap, **belum diuji ke Postgres
asli**. Checklist smoke test manual lengkap sekarang ada di
`docs/SMOKE_TEST_CHECKLIST.md` — jalankan setelah blocker di bawah
selesai, jangan anggap modul mana pun "siap pakai" sebelum semua baris
di checklist itu tercentang.

**Update 2026-09-04 — Security Audit (skill `security-engineer`):**
Audit statis atas 23 migrasi menemukan 2 temuan nyata, sudah
diperbaiki di `schema_024_fix_attribution_spoofing.sql` (migrasi #24,
sekarang total **24 migrasi**, bukan 23):
- **S-02 (High)** — 9 kolom atribusi (`dicatat_oleh`/`input_oleh`/
  `updated_oleh`/`diubah_oleh`) diisi dari nilai kiriman client tanpa
  validasi server, bisa dipalsukan. Ditutup lewat trigger yang
  memaksa kolom tsb = `auth.uid()`, mengabaikan kiriman client.
- **S-05 (Medium)** — `wali_update_kesehatan` sekarang punya
  `WITH CHECK` eksplisit (perilaku sama, cuma tidak lagi implisit).
- Detail lengkap (termasuk yang sengaja TIDAK di-auto-fix:
  `perizinan.disetujui_oleh`, `pelanggaran.pelapor_dis_user_id`, dan
  alasan masing-masing) ada di komentar header
  `schema_024_fix_attribution_spoofing.sql`.
- **Verdict audit: masih No-Go** — S-03 (RLS belum pernah diuji ke
  Postgres asli) tetap blocker utama, tidak berubah oleh perbaikan
  ini. Migrasi #24 wajib ikut smoke test yang sama seperti 23 migrasi
  lain, bukan pengecualian.

---

## 🔴 BLOCKER — harus selesai sebelum apa pun di bawah bisa jalan

### 1. Buat project Supabase baru untuk DIS ✅ SELESAI (2026-09-05)

Project dibuat: `ovekmgylzofdxwptqbla`. Ini **project terpisah** dari
dataku2026 (`sjpsexkdllnlxbvnnypk`) — populasi akun/auth berbeda,
sesuai yang ditegaskan di `schema_017_users_auth.sql`.

- [x] Buat project baru di [supabase.com/dashboard](https://supabase.com/dashboard)
- [x] Catat **Project URL** dan **anon public key** (Settings → API) — sudah diisi di `config.js` (langkah 3)
- [ ] Aktifkan extension `btree_gist` kalau belum default (dipakai `santri_kelas_riwayat` dan `santri_asrama_riwayat` untuk exclude constraint anti-tumpang-tindih periode) — biasanya sudah tersedia, tapi migrasi `schema_021` memanggil `create extension if not exists btree_gist;` sendiri jadi ini seharusnya otomatis. **BELUM diverifikasi** — cek saat menjalankan migrasi #2 di bawah.

### 2. Jalankan 24 migrasi SQL

Folder `supabase/migrations/` sudah berurutan secara kronologis
(nama file diawali timestamp) — jalankan **berurutan**, jangan
diacak.

- [ ] `supabase db push` (kalau pakai Supabase CLI, direkomendasikan — otomatis urut)
- [ ] **Atau** manual lewat SQL Editor Dashboard, file demi file sesuai urutan nama
- [ ] Verifikasi 24 file berhasil jalan tanpa error (`schema_001` s.d. `schema_024`)

**Catatan tervalidasi terhadap Postgres asli — TIDAK ADA.** Seluruh
24 migrasi ini logically masuk akal secara SQL tapi **belum pernah
dijalankan ke Postgres sungguhan**. Kalau ada error urutan dependency
(FK ke tabel yang belum ada, dst), laporkan balik — itu bug di migrasi
yang perlu diperbaiki, bukan sesuatu yang aman dilewati/diubah manual
di Dashboard tanpa migrasi baru.

### 3. Isi kredensial di `public/js/config.js` ✅ SELESAI (2026-09-05)

- [x] Ganti `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di `public/js/config.js` dengan nilai asli dari langkah 1 (commit `3ae7648`)
- [x] Commit + push ke `main`

**PENTING — urutan sebenarnya terbalik dari rencana:** kredensial ini
diisi **sebelum** migrasi #2 diverifikasi jalan (project baru dibuat,
belum dikonfirmasi 24 migrasi + seed sudah dieksekusi). Ini AMAN
(anon/publishable key memang didesain publik, lihat komentar di
`config.js`) tapi **jangan asumsikan aplikasi sudah bisa dipakai** --
kalau migrasi belum jalan, `config.js` menunjuk ke project yang
tabelnya masih kosong/belum ada, aplikasi akan error saat fetch,
BUKAN tanda ada yang salah dengan langkah ini. Langkah 2 di atas
tetap wajib dikerjakan sebelum smoke test punya arti.

---

## 🟡 SETELAH blocker di atas selesai — smoke test wajib sebelum dipakai pengguna nyata

### 4. Uji RLS terhadap Postgres asli

**Ini prioritas tertinggi begitu blocker selesai.** RLS proyek ini
(DIS maupun dataku2026) **tidak pernah** diuji terhadap Postgres
sungguhan — risiko yang sudah berulang tercatat sebagai gap proyek.

Checklist langkah-demi-langkah lengkap (semua 7 modul, termasuk kasus
"harus ditolak" bukan cuma "harus berhasil") sekarang ada di
**`docs/SMOKE_TEST_CHECKLIST.md`** — pakai itu, bukan ringkasan di
bawah ini:

- [ ] Buat 1 akun test per role (`admin`, `ustadz`, `musyrif`, `wali`, `keuangan_spp`) via Supabase Auth
- [ ] Isi 1 baris `penugasan_ustadz` dan 1 baris `penugasan_musyrif` untuk akun test
- [ ] Jalankan seluruh baris di `docs/SMOKE_TEST_CHECKLIST.md`, termasuk bagian SPP dan Kesehatan yang UI-nya baru disambung
- [ ] Laporkan hasil balik ke Claude — kalau ada RLS yang bocor/salah, itu perlu migrasi perbaikan, bukan ditambal di aplikasi

### 5. Buat akun DIS pertama (admin)

Alur signup/invite **belum diputuskan** (dicatat di `schema_017`).
Sementara, cara tercepat: buat 1 akun admin manual lewat Dashboard →
Authentication → Add user, lalu pastikan trigger `handle_new_auth_user`
berhasil membuat baris `public.users` dengan `role='admin'` (perlu
`raw_user_meta_data.role` diisi saat create user — cek dokumentasi
trigger di `schema_017_users_auth.sql` kalau baris `public.users`
tidak muncul otomatis).

---

## 📋 Referensi

- **Mulai dari sini kalau baru pindah sesi kerja:** `README.md` di root repo
- Requirement produk (rekonstruksi, perlu koreksi bisnis): `docs/PRD-DIS-v1.0.md`
- Checklist smoke test manual lengkap: `docs/SMOKE_TEST_CHECKLIST.md`
- Keputusan bisnis & KPI asli: `DIS-business-requirement-brief-v0.2.md` (dibagikan terpisah, belum di-commit ke repo — pertimbangkan pindahkan ke `docs/` kalau ingin jadi bagian repo)
- Kode migrasi terurut: `supabase/migrations/`
- Gap frontend yang masih terbuka: lihat commit message `MVP skeleton: auth + Catatan Perkembangan` di `main`
