-- ============================================================
-- schema_016_akumulasi_reset_tahun_ajaran.sql
-- Pelanggaran -- akumulasi poin RESET per tahun ajaran (Tahap 17)
--
-- Menjawab instruksi eksplisit 2026-09-02: "reset tiap tahun".
--
-- Menambah kolom tahun_ajaran ke pelanggaran (schema_009 belum
-- punya ini -- akumulasi sebelumnya ALL-TIME/seumur santri, sudah
-- ditandai sebagai gap terbuka di schema_013). Format text mengikuti
-- pola kelas.tahun_ajaran (schema_002), mis. '2026/2027'.
--
-- CATATAN EKSEKUSI: ALTER ... ADD COLUMN ... NOT NULL di bawah akan
-- GAGAL kalau dijalankan pada tabel pelanggaran yang SUDAH punya
-- baris data (constraint NOT NULL tanpa DEFAULT butuh tabel kosong).
-- Karena migrasi ini ditulis SEBELUM ada data produksi apapun (belum
-- pernah dieksekusi ke Postgres asli manapun), ini aman untuk
-- SEKARANG -- tapi kalau urutan eksekusi migrasi berubah (mis.
-- schema_009 sempat dijalankan dan sudah ada data sebelum schema_016
-- menyusul), migrasi ini PERLU direvisi jadi dua langkah (ADD COLUMN
-- nullable dulu, backfill data lama, baru SET NOT NULL) -- dicatat
-- eksplisit supaya tidak jadi kegagalan silen saat dieksekusi nyata.
--
-- View v_akumulasi_poin_santri (schema_013) TIDAK DIHAPUS -- tetap
-- ada sebagai ringkasan ALL-TIME/seumur santri (berguna untuk
-- laporan riwayat menyeluruh), tapi TIDAK LAGI dipakai untuk
-- menentukan status disiplin AKTIF -- itu sekarang tugas fungsi baru
-- di bawah yang menghitung PER TAHUN AJARAN.
-- ============================================================

alter table public.pelanggaran
  add column tahun_ajaran text not null;

comment on column public.pelanggaran.tahun_ajaran is
  'CONFIRMED 2026-09-02: akumulasi poin pelanggaran RESET tiap tahun ajaran. Format sama seperti kelas.tahun_ajaran, mis. "2026/2027". WAJIB diisi aplikasi saat mencatat pelanggaran -- tidak ada default otomatis dari tanggal (batas tahun ajaran tidak murni kalender, tidak bisa di-derive otomatis).';

create index if not exists idx_pelanggaran_tahun_ajaran
  on public.pelanggaran (tahun_ajaran);

-- --------------------------------------------------------------
-- Fungsi: akumulasi poin + status per santri, DIBATASI SATU tahun
-- ajaran (reset tiap tahun) -- INI yang dipakai aplikasi untuk
-- menentukan status disiplin AKTIF seorang santri, BUKAN
-- v_akumulasi_poin_santri (yang tetap all-time/riwayat menyeluruh).
-- --------------------------------------------------------------
create or replace function public.hitung_akumulasi_poin_santri_tahun(p_tahun_ajaran text)
returns table (
  santri_id         uuid,
  nis               text,
  nama_lengkap      text,
  total_poin        integer,
  status_akumulasi  text
) as $$
  select
    s.id,
    s.nis,
    s.nama_lengkap,
    coalesce(sum(p.poin), 0)::integer as total_poin,
    public.hitung_status_akumulasi_pelanggaran(coalesce(sum(p.poin), 0)::integer)
  from public.santri s
  left join public.pelanggaran p
    on p.santri_id = s.id and p.tahun_ajaran = p_tahun_ajaran
  group by s.id, s.nis, s.nama_lengkap;
$$ language sql stable;

comment on function public.hitung_akumulasi_poin_santri_tahun(text) is
  'CONFIRMED 2026-09-02: status disiplin AKTIF santri, dihitung dari poin pelanggaran HANYA di satu tahun_ajaran (reset tiap tahun) -- ini yang dipakai aplikasi, BEDA dari v_akumulasi_poin_santri (schema_013) yang tetap all-time untuk keperluan riwayat/laporan menyeluruh. Panggil dengan tahun ajaran berjalan, mis. select * from hitung_akumulasi_poin_santri_tahun(''2026/2027'').';

comment on view public.v_akumulasi_poin_santri is
  'DIPERTAHANKAN sebagai ringkasan ALL-TIME/riwayat seumur santri (berguna untuk laporan menyeluruh) -- SEJAK schema_016 (CONFIRMED reset per tahun ajaran), view ini TIDAK LAGI dipakai untuk menentukan status disiplin AKTIF. Untuk itu pakai hitung_akumulasi_poin_santri_tahun(tahun_ajaran) sebagai gantinya.';
