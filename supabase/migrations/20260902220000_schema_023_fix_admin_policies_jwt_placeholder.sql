-- ============================================================
-- schema_023_fix_admin_policies_jwt_placeholder.sql
-- Perbaikan BESAR: 20 policy admin_full_access_* di 12 tabel masih
-- pakai placeholder `auth.jwt() ->> 'role' = 'admin'` sejak
-- schema_001-014, PADAHAL schema_017 menulis komentar eksplisit
-- bahwa placeholder ini "HARUS direvisi begitu skema users+auth
-- ditulis" dan current_user_role() dibuat justru untuk
-- MENGGANTIKANNYA. schema_019 (RLS sungguhan) HANYA menambah policy
-- role lain, TIDAK PERNAH mengganti policy admin lama -- revisi yang
-- dijanjikan tidak pernah benar-benar dilakukan sampai migrasi ini.
--
-- DAMPAK KALAU TIDAK DIPERBAIKI: `auth.jwt() ->> 'role'` membaca klaim
-- JWT bawaan Supabase Auth (biasanya 'authenticated'/'anon'), BUKAN
-- role aplikasi dari public.users -- kecuali ada custom access token
-- hook yang menyuntikkan klaim 'role' custom (TIDAK ADA bukti hook
-- semacam itu dikonfigurasi di proyek ini). Akibatnya: admin
-- KEMUNGKINAN BESAR TIDAK PUNYA akses tulis sungguhan ke 12 tabel ini
-- lewat RLS, walau UI aplikasi mengizinkan aksi tsb -- baru ketahuan
-- saat testing sungguhan (Phase 6), yang belum pernah terjadi.
--
-- Ditemukan 2026-09-02 saat membangun UI Rilis 2 (Nilai/SPP/
-- Pelanggaran/Perizinan/Kesehatan) -- WAJIB dijalankan SEBELUM smoke
-- test RLS di PENDING_ACTIONS.md #4, atau hasil tes admin akan salah.
-- ============================================================

-- --- santri, wali, santri_wali (schema_001) ---
drop policy if exists admin_full_access_santri on public.santri;
create policy admin_full_access_santri on public.santri
  for all using (public.current_user_role() = 'admin');

drop policy if exists admin_full_access_wali on public.wali;
create policy admin_full_access_wali on public.wali
  for all using (public.current_user_role() = 'admin');

drop policy if exists admin_full_access_santri_wali on public.santri_wali;
create policy admin_full_access_santri_wali on public.santri_wali
  for all using (public.current_user_role() = 'admin');

-- --- kelas, santri_kelas_riwayat, kehadiran (schema_002) ---
drop policy if exists admin_full_access_kelas on public.kelas;
create policy admin_full_access_kelas on public.kelas
  for all using (public.current_user_role() = 'admin');

drop policy if exists admin_full_access_riwayat on public.santri_kelas_riwayat;
create policy admin_full_access_riwayat on public.santri_kelas_riwayat
  for all using (public.current_user_role() = 'admin');

drop policy if exists admin_full_access_kehadiran on public.kehadiran;
create policy admin_full_access_kehadiran on public.kehadiran
  for all using (public.current_user_role() = 'admin');

-- --- mata_pelajaran (schema_003) -- 3 policy terpisah per aksi ---
drop policy if exists admin_write_mata_pelajaran on public.mata_pelajaran;
create policy admin_write_mata_pelajaran on public.mata_pelajaran
  for insert with check (public.current_user_role() = 'admin');

drop policy if exists admin_update_mata_pelajaran on public.mata_pelajaran;
create policy admin_update_mata_pelajaran on public.mata_pelajaran
  for update using (public.current_user_role() = 'admin');

drop policy if exists admin_delete_mata_pelajaran on public.mata_pelajaran;
create policy admin_delete_mata_pelajaran on public.mata_pelajaran
  for delete using (public.current_user_role() = 'admin');

-- --- nilai (schema_004) ---
drop policy if exists admin_full_access_nilai on public.nilai;
create policy admin_full_access_nilai on public.nilai
  for all using (public.current_user_role() = 'admin');

-- --- spp_tagihan, spp_pembayaran (schema_005) ---
drop policy if exists admin_full_access_spp_tagihan on public.spp_tagihan;
create policy admin_full_access_spp_tagihan on public.spp_tagihan
  for all using (public.current_user_role() = 'admin');

drop policy if exists admin_full_access_spp_pembayaran on public.spp_pembayaran;
create policy admin_full_access_spp_pembayaran on public.spp_pembayaran
  for all using (public.current_user_role() = 'admin');

-- --- prestasi (schema_006 -- pelanggaran sendiri di-drop+create ulang
-- oleh schema_009, jadi policy pelanggaran LAMA dari schema_006 sudah
-- tidak ada, tidak perlu di-drop di sini) ---
drop policy if exists admin_full_access_prestasi on public.prestasi;
create policy admin_full_access_prestasi on public.prestasi
  for all using (public.current_user_role() = 'admin');

-- --- perizinan (schema_007) ---
drop policy if exists admin_full_access_perizinan on public.perizinan;
create policy admin_full_access_perizinan on public.perizinan
  for all using (public.current_user_role() = 'admin');

-- --- kesehatan (schema_008) ---
drop policy if exists admin_full_access_kesehatan on public.kesehatan;
create policy admin_full_access_kesehatan on public.kesehatan
  for all using (public.current_user_role() = 'admin');

-- --- jenis_pelanggaran, pelanggaran (schema_009 -- versi final
-- setelah drop+create ulang) ---
drop policy if exists admin_full_access_jenis_pelanggaran on public.jenis_pelanggaran;
create policy admin_full_access_jenis_pelanggaran on public.jenis_pelanggaran
  for all using (public.current_user_role() = 'admin');

drop policy if exists admin_full_access_pelanggaran on public.pelanggaran;
create policy admin_full_access_pelanggaran on public.pelanggaran
  for all using (public.current_user_role() = 'admin');

-- --- kesehatan_riwayat (schema_010) ---
drop policy if exists admin_full_access_kesehatan_riwayat on public.kesehatan_riwayat;
create policy admin_full_access_kesehatan_riwayat on public.kesehatan_riwayat
  for all using (public.current_user_role() = 'admin');

-- --- pengaturan_ambang_pelanggaran (schema_013) ---
drop policy if exists admin_full_access_pengaturan_ambang on public.pengaturan_ambang_pelanggaran;
create policy admin_full_access_pengaturan_ambang on public.pengaturan_ambang_pelanggaran
  for all using (public.current_user_role() = 'admin');

-- --- pegawai_hris_referensi (schema_014) ---
drop policy if exists admin_full_access_pegawai_hris on public.pegawai_hris_referensi;
create policy admin_full_access_pegawai_hris on public.pegawai_hris_referensi
  for all using (public.current_user_role() = 'admin');
