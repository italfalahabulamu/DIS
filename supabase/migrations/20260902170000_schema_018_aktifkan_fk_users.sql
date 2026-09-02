-- ============================================================
-- schema_018_aktifkan_fk_users.sql
-- Aktifkan semua FK ke users.id yang sebelumnya "BELUM diaktifkan"
-- (Tahap 20) -- sekarang tabel users (schema_017) sudah ada.
--
-- SEMUA pakai ON DELETE RESTRICT -- konsisten kebijakan universal
-- (schema_012, CONFIRMED "gunakan RESTRICT"). KONSEKUENSI PENTING
-- yang berantai dari ini: users.id sendiri adalah FK ke auth.users.id
-- ON DELETE CASCADE (schema_017) -- kalau seorang user PERNAH
-- mencatat/melaporkan/menyetujui apapun (baris apapun yang RESTRICT
-- ke id-nya di bawah), maka baris public.users dia TIDAK BISA
-- dihapus, yang berarti CASCADE dari auth.users JUGA TIDAK BISA
-- jalan -- artinya AKUN LOGIN (auth.users) staf yang pernah aktif
-- input data TIDAK BISA dihapus permanen sama sekali. Ini KONSISTEN
-- dengan filosofi audit-trail proyek ini, TAPI perlu disadari:
-- "nonaktifkan akun" harus lewat mekanisme lain (auth.users punya
-- kolom banned_until bawaan Supabase, atau tambahan kolom aktif di
-- public.users) -- BUKAN hard delete. Belum ada strukturnya,
-- dicatat sebagai gap, sama pola dengan gap serupa di wali/santri.
-- ============================================================

alter table public.nilai
  add constraint nilai_input_oleh_fkey
  foreign key (input_oleh) references public.users(id) on delete restrict;

alter table public.kehadiran
  add constraint kehadiran_dicatat_oleh_fkey
  foreign key (dicatat_oleh) references public.users(id) on delete restrict;

alter table public.spp_pembayaran
  add constraint spp_pembayaran_dicatat_oleh_fkey
  foreign key (dicatat_oleh) references public.users(id) on delete restrict;

alter table public.pelanggaran
  add constraint pelanggaran_dicatat_oleh_fkey
  foreign key (dicatat_oleh) references public.users(id) on delete restrict,
  add constraint pelanggaran_pelapor_dis_user_id_fkey
  foreign key (pelapor_dis_user_id) references public.users(id) on delete restrict;

alter table public.prestasi
  add constraint prestasi_dicatat_oleh_fkey
  foreign key (dicatat_oleh) references public.users(id) on delete restrict;

alter table public.perizinan
  add constraint perizinan_disetujui_oleh_fkey
  foreign key (disetujui_oleh) references public.users(id) on delete restrict;

alter table public.kesehatan
  add constraint kesehatan_updated_oleh_fkey
  foreign key (updated_oleh) references public.users(id) on delete restrict;

alter table public.kesehatan_riwayat
  add constraint kesehatan_riwayat_dicatat_oleh_fkey
  foreign key (dicatat_oleh) references public.users(id) on delete restrict;

alter table public.pengaturan_ambang_pelanggaran
  add constraint pengaturan_ambang_pelanggaran_diubah_oleh_fkey
  foreign key (diubah_oleh) references public.users(id) on delete restrict;

comment on table public.users is
  'Profil aplikasi DIS, 1:1 dengan auth.users. PERINGATAN (sejak schema_018): banyak tabel RESTRICT ke users.id (siapa mencatat/menyetujui) -- akun staf yang pernah input data TIDAK BISA dihapus permanen (hard delete akan gagal berantai sampai ke auth.users). "Nonaktifkan akun" harus lewat mekanisme terpisah (belum ada strukturnya), BUKAN delete.';
