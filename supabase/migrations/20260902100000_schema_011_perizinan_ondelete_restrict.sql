-- ============================================================
-- schema_011_perizinan_ondelete_restrict.sql
-- Modul: Perizinan -- REVISI kebijakan ON DELETE (Tahap 12)
--
-- Menjawab poin #1 diskusi 2026-09-02: menyeragamkan ON DELETE untuk
-- FK ke entitas "aktor/wadah" yang punya riwayat administratif --
-- BUKAN untuk semua FK santri_id (itu tetap CASCADE, lihat penjelasan
-- di bawah, koreksi atas pernyataan saya sebelumnya yang terlalu luas).
--
-- PRINSIP YANG DIPAKAI (final untuk migrasi ini):
-- - FK -> santri.id: TETAP CASCADE di semua tabel (nilai, kehadiran,
--   pelanggaran, prestasi, perizinan.santri_id, kesehatan, dst).
--   Alasan: santri adalah SUBJEK UTAMA yang didokumentasikan setiap
--   tabel itu -- kalau baris santri itu sendiri benar-benar dihapus
--   (bukan cuma ganti status jadi 'keluar'/'lulus'), wajar semua
--   data yang mendokumentasikan dia ikut hilang.
-- - FK -> wali.id atau -> spp_tagihan.id (entitas AKTOR/WADAH yang
--   BUKAN subjek utama tabel itu, tapi py riwayat administratif
--   sendiri): RESTRICT. Alasan: menghapus wali TIDAK seharusnya
--   diam-diam menghapus riwayat pengajuan izin yang pernah dia buat
--   -- itu jejak audit yang berdiri sendiri dari keberadaan wali-nya.
--
-- Migrasi ini mengubah perizinan.diajukan_oleh (schema_007, CASCADE)
-- menjadi RESTRICT supaya konsisten dengan spp_pembayaran.tagihan_id
-- (schema_005, sudah RESTRICT sejak awal).
--
-- KONSEKUENSI PRAKTIS: kalau aplikasi nanti butuh "hapus data wali",
-- operasi itu akan GAGAL selama wali itu masih py baris di
-- `perizinan`. Aplikasi perlu fitur arsip/soft-delete (mis. kolom
-- status pada wali) untuk kasus itu, BUKAN hard delete langsung --
-- ini belum ada strukturnya di schema_001 (wali), dicatat sebagai
-- gap terpisah, bukan diselesaikan di migrasi ini.
-- ============================================================

alter table public.perizinan
  drop constraint if exists perizinan_diajukan_oleh_fkey;

alter table public.perizinan
  add constraint perizinan_diajukan_oleh_fkey
  foreign key (diajukan_oleh) references public.wali(id) on delete restrict;

comment on column public.perizinan.diajukan_oleh is
  'NOT NULL (CONFIRMED 2026-09-02, konsekuensi wali optional). ON DELETE RESTRICT (direvisi di schema_011, sebelumnya CASCADE di schema_007) -- konsisten dengan spp_pembayaran.tagihan_id: mencegah riwayat perizinan terhapus diam-diam kalau data wali dihapus. Aplikasi perlu fitur arsip/soft-delete untuk wali kalau operasi hapus dibutuhkan -- belum ada strukturnya.';
