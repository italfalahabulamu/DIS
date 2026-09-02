-- ============================================================
-- schema_022_fix_kelas_select_policy.sql
-- Perbaikan: kelas hanya punya admin_full_access, TIDAK ADA SELECT
-- untuk role lain -- ditemukan saat membangun UI form Kehadiran
-- (ustadz butuh lihat daftar kelas untuk dropdown, RLS menolak diam-
-- diam sehingga dropdown akan kosong tanpa error yang jelas).
--
-- Pola sama seperti semua_role_select_jenis_pelanggaran (schema_019):
-- SELECT terbuka untuk semua role yang sudah login, CRUD tetap admin
-- saja.
-- ============================================================

create policy semua_role_select_kelas on public.kelas
  for select using (public.current_user_role() is not null);
