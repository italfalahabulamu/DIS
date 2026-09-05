-- ============================================================
-- seed.sql — Data mock untuk smoke test & akun demo (BUKAN migrasi
-- skema, jangan diberi nomor schema_xxx). Jalankan SETELAH 24
-- migrasi di supabase/migrations/ selesai, lewat:
--   supabase db execute --file supabase/seed.sql
-- atau tempel manual di SQL Editor Dashboard.
--
-- UUID di bawah SENGAJA di-hardcode (bukan gen_random_uuid()) supaya
-- bisa dirujuk balik dari script pembuatan akun auth
-- (scripts/seed-mock-accounts.mjs) tanpa perlu query balik dulu.
-- Aman dijalankan berkali-kali (ON CONFLICT DO NOTHING) — tidak akan
-- duplikat kalau sengaja/tidak sengaja dijalankan ulang.
--
-- CATATAN: script ini HANYA mengisi tabel data (wali, santri,
-- santri_wali, kelas) — TIDAK menyentuh auth.users/public.users.
-- Akun login dibuat terpisah lewat scripts/seed-mock-accounts.mjs
-- (butuh service_role key, tidak aman dijalankan lewat SQL biasa).
-- ============================================================

-- --------------------------------------------------------------
-- Kelas
-- --------------------------------------------------------------
insert into public.kelas (id, nama_kelas, tahun_ajaran)
values ('00000000-0000-0000-0000-000000000101', 'Kelas 1A', '2026/2027')
on conflict (id) do nothing;

-- --------------------------------------------------------------
-- Wali (2 baris — satu dipakai akun demo wali, satu untuk uji
-- negatif "wali A coba akses anak wali B")
-- --------------------------------------------------------------
insert into public.wali (id, nama_lengkap, no_telepon, hubungan)
values
  ('00000000-0000-0000-0000-000000000201', 'Bapak Ahmad (Wali Demo)', '081200000001', 'ayah'),
  ('00000000-0000-0000-0000-000000000202', 'Ibu Siti (Wali Lain)',    '081200000002', 'ibu')
on conflict (id) do nothing;

-- --------------------------------------------------------------
-- Santri (2 baris — masing-masing anak dari wali yang berbeda,
-- supaya smoke test 7.6/7.9 dkk bisa menguji isolasi wali)
--
-- CATATAN: santri TIDAK PUNYA kolom kelas_id -- kolom itu di-DROP
-- di schema_002 (digantikan santri_kelas_riwayat). Penempatan kelas
-- diisi lewat INSERT terpisah ke santri_kelas_riwayat di bawah.
-- --------------------------------------------------------------
insert into public.santri (id, nis, nama_lengkap, tanggal_lahir, jenis_kelamin, status, tanggal_masuk)
values
  ('00000000-0000-0000-0000-000000000301', 'DEMO-0001', 'Fulan bin Ahmad', '2015-01-01', 'L', 'aktif', '2024-07-01'),
  ('00000000-0000-0000-0000-000000000302', 'DEMO-0002', 'Fulanah binti Siti', '2015-02-02', 'P', 'aktif', '2024-07-01')
on conflict (id) do nothing;

insert into public.santri_wali (santri_id, wali_id)
values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000202')
on conflict do nothing;

-- --------------------------------------------------------------
-- Penempatan kelas (santri_kelas_riwayat, schema_002) --
-- tanggal_selesai NULL = penempatan masih aktif sekarang.
-- --------------------------------------------------------------
insert into public.santri_kelas_riwayat (santri_id, kelas_id, tanggal_mulai, tanggal_selesai)
values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', '2024-07-01', null),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000101', '2024-07-01', null)
on conflict do nothing;

-- Sesudah ini jalan, cek scripts/seed-mock-accounts.mjs untuk
-- membuat akun login yang cocok dengan wali_id di atas.
