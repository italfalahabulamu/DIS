# PENDING_ACTIONS.md — DIS

Dokumen ini adalah **satu-satunya sumber kebenaran** untuk pekerjaan
yang harus dilakukan tim Supabase (di luar sandbox Claude — tidak ada
akses jaringan ke `*.supabase.co` dari lingkungan kerja Claude). Kalau
dokumen ini bertentangan dengan README atau catatan lain, **dokumen
ini yang menang** — pola sama seperti `PENDING_ACTIONS.md` di
dataku2026.

Status per 2026-09-02. Update tanggal + centang setiap kali satu item
selesai.

---

## 🔴 BLOCKER — harus selesai sebelum apa pun di bawah bisa jalan

### 1. Buat project Supabase baru untuk DIS

DIS **belum pernah** punya project Supabase. Ini **project terpisah**
dari dataku2026 (`sjpsexkdllnlxbvnnypk`) — jangan pakai project yang
sama, populasi akun/auth harus berbeda (sudah ditegaskan eksplisit di
`schema_017_users_auth.sql`).

- [ ] Buat project baru di [supabase.com/dashboard](https://supabase.com/dashboard)
- [ ] Catat **Project URL** dan **anon public key** (Settings → API) — dibutuhkan di langkah 3
- [ ] Aktifkan extension `btree_gist` kalau belum default (dipakai `santri_kelas_riwayat` dan `santri_asrama_riwayat` untuk exclude constraint anti-tumpang-tindih periode) — biasanya sudah tersedia, tapi migrasi `schema_021` memanggil `create extension if not exists btree_gist;` sendiri jadi ini seharusnya otomatis.

### 2. Jalankan 21 migrasi SQL

Folder `supabase/migrations/` sudah berurutan secara kronologis
(nama file diawali timestamp) — jalankan **berurutan**, jangan
diacak.

- [ ] `supabase db push` (kalau pakai Supabase CLI, direkomendasikan — otomatis urut)
- [ ] **Atau** manual lewat SQL Editor Dashboard, file demi file sesuai urutan nama
- [ ] Verifikasi 21 file berhasil jalan tanpa error (`schema_001` s.d. `schema_021`)

**Catatan tervalidasi terhadap Postgres asli — TIDAK ADA.** Seluruh
21 migrasi ini logically masuk akal secara SQL tapi **belum pernah
dijalankan ke Postgres sungguhan**. Kalau ada error urutan dependency
(FK ke tabel yang belum ada, dst), laporkan balik — itu bug di migrasi
yang perlu diperbaiki, bukan sesuatu yang aman dilewati/diubah manual
di Dashboard tanpa migrasi baru.

### 3. Isi kredensial di `public/js/config.js`

Setelah project ada dan migrasi jalan:

- [ ] Ganti `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di `public/js/config.js` dengan nilai asli dari langkah 1
- [ ] Commit + push ke `main` (anon key **aman** ditaruh di file yang di-serve browser — batas keamanan sungguhan ada di RLS tabel, bukan kerahasiaan key ini, lihat komentar di file tsb)

---

## 🟡 SETELAH blocker di atas selesai — smoke test wajib sebelum dipakai pengguna nyata

### 4. Uji RLS terhadap Postgres asli

**Ini prioritas tertinggi begitu blocker selesai.** RLS proyek ini
(DIS maupun dataku2026) **tidak pernah** diuji terhadap Postgres
sungguhan — risiko yang sudah berulang tercatat sebagai gap proyek.
Minimal, uji manual dengan akun test per role:

- [ ] Buat 1 akun test per role (`admin`, `ustadz`, `musyrif`, `wali`, `keuangan_spp`) via Supabase Auth
- [ ] Isi 1 baris `penugasan_ustadz` dan 1 baris `penugasan_musyrif` untuk akun test
- [ ] Verifikasi: ustadz test **hanya** bisa lihat/tulis `nilai`/`kehadiran`/`catatan_perkembangan` untuk santri di kelas yang ditugaskan — **coba juga santri DI LUAR kelasnya, pastikan ditolak** (bukan cuma tes jalur "berhasil")
- [ ] Verifikasi serupa untuk musyrif (sumbu asrama) dan wali (sumbu santri miliknya)
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

- Keputusan bisnis & KPI: `DIS-business-requirement-brief-v0.2.md` (dibagikan terpisah, belum di-commit ke repo — pertimbangkan pindahkan ke `docs/` kalau ingin jadi bagian repo)
- Kode migrasi terurut: `supabase/migrations/`
- Gap frontend yang masih terbuka: lihat commit message `MVP skeleton: auth + Catatan Perkembangan` di `main`
