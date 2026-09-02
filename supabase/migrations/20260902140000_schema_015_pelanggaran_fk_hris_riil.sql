-- ============================================================
-- schema_015_pelanggaran_fk_hris_riil.sql
-- Pelanggaran -- pelapor HRIS sekarang FK sungguhan (Tahap 16)
--
-- Sebelumnya (schema_009): pelapor_hris_employee_id adalah text
-- BEBAS tanpa validasi -- disebut eksplisit sebagai "referensi
-- lunak, TANPA FK asli" karena saat itu belum ada tabel replika
-- lokal. SEKARANG, dengan pegawai_hris_referensi ada (schema_014),
-- kolom ini bisa punya FK NYATA -- database akan MENOLAK input
-- pelapor_hris_employee_id yang tidak ada di tabel replika,
-- bukan cuma dipercaya begitu saja seperti sebelumnya.
--
-- ON DELETE RESTRICT (bukan CASCADE) -- konsisten dengan kebijakan
-- RESTRICT universal (schema_012, CONFIRMED 2026-09-02): pelanggaran
-- yang pernah dilaporkan seorang pegawai HRIS tidak boleh kehilangan
-- referensinya kalau baris replika pegawai itu dihapus. Dalam
-- praktiknya baris pegawai_hris_referensi memang TIDAK BOLEH dihapus
-- job sinkronisasi (job seharusnya UPDATE status_aktif=false, bukan
-- DELETE) -- tapi RESTRICT tetap dipasang sebagai jaring pengaman
-- level-database, bukan cuma mengandalkan job sinkronisasi ditulis
-- benar.
--
-- KONSEKUENSI PRAKTIS: selama pegawai_hris_referensi masih kosong
-- (job sinkronisasi belum jalan -- lihat schema_014), pelanggaran
-- dengan pelapor_sumber='hris' TIDAK BISA dicatat sama sekali --
-- FK akan menolak semua nilai. Ini KEPUTUSAN YANG DISENGAJA: lebih
-- baik gagal jelas (constraint violation) daripada diam-diam
-- menyimpan ID pegawai yang tidak tervalidasi seperti sebelumnya.
-- Sampai job sinkronisasi (bagian b+c di schema_014) berjalan,
-- pencatatan pelanggaran HANYA bisa pakai pelapor_sumber='dis'.
-- ============================================================

alter table public.pelanggaran
  add constraint pelanggaran_pelapor_hris_fkey
  foreign key (pelapor_hris_employee_id)
  references public.pegawai_hris_referensi(hris_employee_id)
  on delete restrict;

comment on column public.pelanggaran.pelapor_hris_employee_id is
  'FK NYATA (schema_015, direvisi dari referensi lunak di schema_009) ke pegawai_hris_referensi.hris_employee_id -- tabel replika lokal yang disinkron berkala dari dataku2026 (job sinkronisasi belum dibuat, lihat schema_014). ON DELETE RESTRICT. SELAMA tabel replika kosong, pelanggaran dengan pelapor_sumber=''hris'' akan DITOLAK database -- ini disengaja, bukan bug.';
