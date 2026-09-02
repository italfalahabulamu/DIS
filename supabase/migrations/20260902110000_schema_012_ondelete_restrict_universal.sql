-- ============================================================
-- schema_012_ondelete_restrict_universal.sql
-- REVISI kebijakan ON DELETE -- universal RESTRICT (Tahap 13)
--
-- Menjawab instruksi eksplisit 2026-09-02: "gunakan RESTRICT".
-- INI MENGGANTI prinsip yang saya tulis sendiri di schema_011
-- ("FK -> santri.id tetap CASCADE, hanya FK -> wali/tagihan yang
-- RESTRICT") -- pengguna meminta RESTRICT diterapkan lebih luas.
-- ASUMSI SAYA (perlu dikoreksi kalau keliru): "gunakan RESTRICT"
-- berarti SEMUA FK ke santri.id juga ikut RESTRICT, bukan cuma
-- FK ke wali.id/spp_tagihan.id yang sudah RESTRICT sejak schema_011.
--
-- KONSEKUENSI PRAKTIS PENTING: dengan RESTRICT universal, baris
-- `santri` TIDAK BISA dihapus (hard delete) SELAMA santri itu masih
-- punya baris di tabel manapun yang mengacu padanya (nilai,
-- kehadiran, spp_tagihan, pelanggaran, prestasi, perizinan,
-- kesehatan, kesehatan_riwayat, santri_kelas_riwayat). Dalam praktik
-- ini berarti santri yang sudah pernah beraktivitas di sistem TIDAK
-- BISA di-hard-delete sama sekali -- satu-satunya cara "menghapus"
-- santri adalah mengubah status jadi 'keluar'/'lulus'/'pindah'
-- (kolom status sudah ada di schema_001). Ini konsisten dengan
-- prinsip rekam jejak institusi, TAPI berarti aplikasi TIDAK BOLEH
-- menyediakan tombol "hapus santri" yang sungguhan menghapus baris --
-- hanya boleh ubah status. Dicatat eksplisit supaya tidak jadi bug
-- tersembunyi nanti ("kenapa santri tidak bisa dihapus?").
--
-- PENGECUALIAN: santri_wali (schema_001) TETAP CASCADE di kedua sisi
-- (santri_id DAN wali_id) -- tabel ini murni tabel relasi/tautan
-- (junction table), baris di dalamnya TIDAK punya nilai historis
-- sendiri (cuma penanda "santri X terhubung wali Y"). Menghapus
-- tautan bukan kehilangan data, beda dari menghapus baris pelanggaran
-- atau pembayaran. Kalau ini juga perlu RESTRICT, beri tahu saya --
-- saya pilih CASCADE di sini atas pertimbangan sendiri (bukan
-- instruksi eksplisit), jadi bisa dikoreksi.
--
-- CATATAN TEKNIS: nama constraint di bawah pakai pola default
-- penamaan Postgres (<table>_<column>_fkey) karena semua FK di
-- migrasi sebelumnya dideklarasikan inline TANPA nama constraint
-- eksplisit. Ini BELUM diverifikasi terhadap Postgres asli manapun
-- (belum pernah dieksekusi) -- kalau nama constraint ternyata beda
-- saat dijalankan nyata, ALTER di bawah akan gagal dengan pesan
-- error yang jelas (constraint tidak ditemukan), bukan silent-fail.
-- ============================================================

alter table public.santri_kelas_riwayat
  drop constraint if exists santri_kelas_riwayat_santri_id_fkey,
  add constraint santri_kelas_riwayat_santri_id_fkey
    foreign key (santri_id) references public.santri(id) on delete restrict;

alter table public.kehadiran
  drop constraint if exists kehadiran_santri_id_fkey,
  add constraint kehadiran_santri_id_fkey
    foreign key (santri_id) references public.santri(id) on delete restrict;

alter table public.nilai
  drop constraint if exists nilai_santri_id_fkey,
  add constraint nilai_santri_id_fkey
    foreign key (santri_id) references public.santri(id) on delete restrict;

alter table public.spp_tagihan
  drop constraint if exists spp_tagihan_santri_id_fkey,
  add constraint spp_tagihan_santri_id_fkey
    foreign key (santri_id) references public.santri(id) on delete restrict;

alter table public.pelanggaran
  drop constraint if exists pelanggaran_santri_id_fkey,
  add constraint pelanggaran_santri_id_fkey
    foreign key (santri_id) references public.santri(id) on delete restrict;

alter table public.prestasi
  drop constraint if exists prestasi_santri_id_fkey,
  add constraint prestasi_santri_id_fkey
    foreign key (santri_id) references public.santri(id) on delete restrict;

alter table public.perizinan
  drop constraint if exists perizinan_santri_id_fkey,
  add constraint perizinan_santri_id_fkey
    foreign key (santri_id) references public.santri(id) on delete restrict;

alter table public.kesehatan
  drop constraint if exists kesehatan_santri_id_fkey,
  add constraint kesehatan_santri_id_fkey
    foreign key (santri_id) references public.santri(id) on delete restrict;

alter table public.kesehatan_riwayat
  drop constraint if exists kesehatan_riwayat_santri_id_fkey,
  add constraint kesehatan_riwayat_santri_id_fkey
    foreign key (santri_id) references public.santri(id) on delete restrict;

-- santri_wali.santri_id dan santri_wali.wali_id SENGAJA TIDAK diubah
-- -- tetap CASCADE, lihat catatan "PENGECUALIAN" di atas.

comment on column public.santri.status is
  'Dengan RESTRICT universal (schema_012), status adalah SATU-SATUNYA cara "menghapus" santri secara praktis -- baris santri tidak bisa di-hard-delete selama masih punya data terkait di tabel manapun. Aplikasi tidak boleh menyediakan hard-delete santri, hanya perubahan status.';
