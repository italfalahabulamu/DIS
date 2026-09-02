-- ============================================================
-- schema_019_rls_riil.sql
-- Aktifkan RLS SUNGGUHAN untuk wali/ustadz/keuangan_spp (Tahap 21)
--
-- Menggantikan/melengkapi placeholder admin-only di schema_001-016.
-- SEMUA policy admin_full_access_* SEBELUMNYA TETAP ADA (tidak
-- dihapus) -- migrasi ini HANYA MENAMBAH policy baru untuk role lain.
--
-- CATATAN PENTING -- INI BELUM TERUJI: seluruh RLS proyek ini
-- (dataku2026 maupun DIS) diketahui TIDAK PERNAH diuji terhadap
-- Postgres asli -- prinsip proyek yang sudah tercatat berulang kali
-- sebagai risiko. Migrasi ini SAMA -- policy di bawah masuk akal
-- secara logika SQL, tapi belum divalidasi lewat query nyata
-- (mis. apakah subquery di USING clause benar-benar efisien/benar
-- untuk semua kasus, apakah ada celah policy yang saling tumpang
-- tindih secara tidak sengaja). WAJIB diuji sebelum produksi.
--
-- CAKUPAN YANG DIKERJAKAN di migrasi ini:
-- - wali: SELECT (dan kadang INSERT) hanya untuk santri miliknya
--   sendiri, di semua tabel yang relevan.
-- - ustadz: BELUM dikerjakan penuh -- perlu tabel penugasan
--   ustadz<->kelas/mapel yang BELUM ADA di skema manapun (disebutkan
--   sebagai gap sejak schema_004/nilai: "penugasan ustadz per
--   kelas+mapel belum dimodelkan"). TANPA tabel itu, "ustadz hanya
--   boleh input nilai/kehadiran untuk kelas yang diampu" TIDAK BISA
--   diimplementasikan dengan benar -- policy ustadz di bawah untuk
--   sementara HANYA read-only umum (SELECT semua, TANPA batasan
--   kelas), BUKAN pembatasan penuh -- ditandai eksplisit sebagai
--   sementara, bukan final.
-- - keuangan_spp: CRUD penuh spp_tagihan + spp_pembayaran (role ini
--   memang untuk itu, tidak perlu pembatasan per-santri).
-- ============================================================

-- --------------------------------------------------------------
-- santri, wali, santri_wali (schema_001)
-- --------------------------------------------------------------
create policy wali_select_own_santri on public.santri
  for select using (public.is_wali_of_santri(id));

create policy wali_select_own_wali_row on public.wali
  for select using (id = public.current_user_wali_id());

create policy wali_select_own_santri_wali on public.santri_wali
  for select using (wali_id = public.current_user_wali_id());

create policy ustadz_select_santri on public.santri
  for select using (public.current_user_role() = 'ustadz');

-- --------------------------------------------------------------
-- kelas, santri_kelas_riwayat, kehadiran (schema_002)
-- --------------------------------------------------------------
create policy ustadz_select_kehadiran on public.kehadiran
  for select using (public.current_user_role() = 'ustadz');

create policy wali_select_kehadiran on public.kehadiran
  for select using (public.is_wali_of_santri(santri_id));

create policy wali_select_santri_kelas_riwayat on public.santri_kelas_riwayat
  for select using (public.is_wali_of_santri(santri_id));

-- --------------------------------------------------------------
-- nilai (schema_004)
-- --------------------------------------------------------------
create policy ustadz_select_nilai on public.nilai
  for select using (public.current_user_role() = 'ustadz');

create policy wali_select_nilai on public.nilai
  for select using (public.is_wali_of_santri(santri_id));

-- --------------------------------------------------------------
-- spp_tagihan, spp_pembayaran (schema_005)
-- --------------------------------------------------------------
create policy keuangan_full_access_spp_tagihan on public.spp_tagihan
  for all using (public.current_user_role() = 'keuangan_spp');

create policy keuangan_full_access_spp_pembayaran on public.spp_pembayaran
  for all using (public.current_user_role() = 'keuangan_spp');

create policy wali_select_spp_tagihan on public.spp_tagihan
  for select using (public.is_wali_of_santri(santri_id));

create policy wali_select_spp_pembayaran on public.spp_pembayaran
  for select using (
    exists (
      select 1 from public.spp_tagihan t
      where t.id = spp_pembayaran.tagihan_id
        and public.is_wali_of_santri(t.santri_id)
    )
  );

-- --------------------------------------------------------------
-- pelanggaran, prestasi, jenis_pelanggaran (schema_006/009)
-- --------------------------------------------------------------
create policy ustadz_select_pelanggaran on public.pelanggaran
  for select using (public.current_user_role() = 'ustadz');

create policy wali_select_pelanggaran on public.pelanggaran
  for select using (public.is_wali_of_santri(santri_id));

create policy ustadz_select_prestasi on public.prestasi
  for select using (public.current_user_role() = 'ustadz');

create policy wali_select_prestasi on public.prestasi
  for select using (public.is_wali_of_santri(santri_id));

-- jenis_pelanggaran + pengaturan_ambang_pelanggaran: SELECT terbuka
-- untuk semua role yang sudah login (ustadz/wali perlu lihat daftar
-- ini saat memahami status disiplin), TAPI HANYA admin yang boleh
-- ubah -- policy admin_full_access_* (schema_009/013) sudah mencakup
-- CRUD admin, di sini hanya tambah SELECT untuk role lain.
create policy semua_role_select_jenis_pelanggaran on public.jenis_pelanggaran
  for select using (public.current_user_role() is not null);

create policy semua_role_select_pengaturan_ambang on public.pengaturan_ambang_pelanggaran
  for select using (public.current_user_role() is not null);

-- --------------------------------------------------------------
-- perizinan (schema_007)
-- --------------------------------------------------------------
create policy wali_select_insert_perizinan on public.perizinan
  for select using (public.is_wali_of_santri(santri_id));

create policy wali_insert_perizinan on public.perizinan
  for insert with check (
    diajukan_oleh = public.current_user_wali_id()
    and public.is_wali_of_santri(santri_id)
  );

-- Wali SENGAJA TIDAK diberi policy UPDATE -- tidak boleh mengubah
-- status pengajuannya sendiri (menunggu -> disetujui/ditolak), itu
-- wewenang admin (via admin_full_access_perizinan yang sudah ada).

-- --------------------------------------------------------------
-- kesehatan, kesehatan_riwayat (schema_008/010) -- DATA SENSITIF,
-- ustadz SENGAJA TIDAK diberi policy apapun di sini (CONFIRMED
-- sebelumnya) -- hanya admin + wali.
-- --------------------------------------------------------------
create policy wali_select_kesehatan on public.kesehatan
  for select using (public.is_wali_of_santri(santri_id));

create policy wali_update_kesehatan on public.kesehatan
  for update using (public.is_wali_of_santri(santri_id));

create policy wali_select_kesehatan_riwayat on public.kesehatan_riwayat
  for select using (public.is_wali_of_santri(santri_id));

create policy wali_insert_kesehatan_riwayat on public.kesehatan_riwayat
  for insert with check (public.is_wali_of_santri(santri_id));

-- --------------------------------------------------------------
-- pegawai_hris_referensi (schema_014) -- SELECT read-only untuk
-- role yang butuh memilih pelapor saat mencatat pelanggaran.
-- --------------------------------------------------------------
create policy semua_role_select_pegawai_hris on public.pegawai_hris_referensi
  for select using (public.current_user_role() is not null);
