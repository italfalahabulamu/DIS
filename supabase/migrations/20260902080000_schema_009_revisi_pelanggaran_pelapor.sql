-- ============================================================
-- schema_009_revisi_pelanggaran_pelapor.sql
-- Modul: Pelanggaran -- REVISI (Tahap 10)
--
-- Menyempurnakan tabel `pelanggaran` dari schema_006 dengan:
-- 1. Tabel referensi `jenis_pelanggaran` -- katalog bentuk
--    pelanggaran + gradasi default + poin default (menjawab
--    permintaan "keterangan bentuk pelanggaran").
-- 2. Kolom pelapor -- menjawab permintaan "pelapor (rencana
--    dihubungkan HRIS)".
--
-- DROP + CREATE ULANG tabel `pelanggaran` (bukan ALTER incremental)
-- karena tabel ini belum pernah dieksekusi ke Postgres manapun --
-- tidak ada data produksi yang berisiko hilang. Kalau migrasi
-- schema_006 SUDAH sempat dijalankan di suatu environment sebelum
-- migrasi ini dijalankan, JANGAN jalankan DROP ini -- tulis migrasi
-- ALTER TABLE yang aman-data sebagai gantinya.
--
-- ------------------------------------------------------------
-- KETERBATASAN TEKNIS PENTING -- pelapor lintas sistem (HRIS):
-- ------------------------------------------------------------
-- DIS dan dataku2026 (HRIS) adalah DUA project Supabase/Postgres
-- TERPISAH (rekomendasi docs/database-design.md bagian Dependencies).
-- Foreign key Postgres HANYA bisa mengacu ke tabel di database yang
-- SAMA -- jadi kolom pelapor di bawah TIDAK bisa punya FK asli ke
-- tabel pegawai di dataku2026. Yang ditulis di sini adalah
-- REFERENSI LUNAK (snapshot id + nama saat pelaporan dibuat), BUKAN
-- integrasi real-time. Kalau pegawai itu nanti ganti nama/keluar
-- dari HRIS, data pelapor di sini TIDAK ikut berubah -- itu memang
-- sifat snapshot, bukan bug.
--
-- Integrasi nyata (validasi ID pegawai HRIS saat input, atau sinkron
-- berkala daftar pegawai ke DIS) adalah KEPUTUSAN ARSITEKTUR
-- TERPISAH yang belum ada -- opsinya antara lain: (a) API call ke
-- dataku2026 saat pelanggaran dicatat untuk validasi ID pegawai,
-- (b) tabel referensi pegawai di DIS yang disinkron berkala dari
-- dataku2026, (c) dibiarkan free-text tanpa validasi sampai ada
-- kebutuhan lebih kuat. TODO -- perlu keputusan Software Architect,
-- bukan sesuatu yang bisa saya putuskan sepihak di migrasi SQL.
-- ============================================================

-- --------------------------------------------------------------
-- Tabel: jenis_pelanggaran (katalog bentuk pelanggaran)
--
-- KOSONG SENGAJA -- saya TIDAK mengisi data contoh (mis. "terlambat
-- = teguran lisan, poin 5") karena itu keputusan tata tertib
-- pesantren yang harus Anda berikan, sama seperti mata_pelajaran
-- yang datanya diambil PERSIS dari blanko_ijazah.xlsm (bukan
-- dikarang). Mengarang daftar pelanggaran + poin akan menyesatkan.
-- --------------------------------------------------------------
create table if not exists public.jenis_pelanggaran (
  id             uuid primary key default gen_random_uuid(),
  nama           text not null unique,
  deskripsi      text,
  kategori       text not null
                   check (kategori in ('teguran_lisan','teguran_tertulis','sp1','sp2','sp3')),
  poin_default   integer not null check (poin_default >= 0),
  aktif          boolean not null default true,
  created_at     timestamptz not null default now()
);

comment on table public.jenis_pelanggaran is
  'Katalog referensi bentuk pelanggaran + gradasi default + poin default. Tabel ini KOSONG saat migrasi dibuat -- isinya (daftar pelanggaran nyata pesantren beserta poin) perlu diisi terpisah, TIDAK dikarang di migrasi ini.';

create index if not exists idx_jenis_pelanggaran_aktif on public.jenis_pelanggaran (aktif);

-- --------------------------------------------------------------
-- Tabel: pelanggaran (REVISI dari schema_006)
-- --------------------------------------------------------------
drop table if exists public.pelanggaran cascade;

create table public.pelanggaran (
  id                    uuid primary key default gen_random_uuid(),
  santri_id             uuid not null references public.santri(id) on delete cascade,
  jenis_pelanggaran_id  uuid not null references public.jenis_pelanggaran(id) on delete restrict,
  tanggal               date not null,
  -- kategori & poin: SNAPSHOT dari jenis_pelanggaran saat baris ini
  -- dibuat (diisi aplikasi), disimpan independen supaya kalau
  -- jenis_pelanggaran.kategori/poin_default diedit di kemudian hari,
  -- catatan pelanggaran historis tidak ikut berubah makna -- pola
  -- sama seperti nilai.kelas_id (snapshot) di schema_004.
  kategori              text not null
                          check (kategori in ('teguran_lisan','teguran_tertulis','sp1','sp2','sp3')),
  poin                  integer not null check (poin >= 0),
  deskripsi             text,

  -- ------------------------------------------------------------
  -- Pelapor -- lihat catatan keterbatasan lintas-sistem di header
  -- file ini. TIDAK ada FK asli ke tabel pegawai HRIS (dataku2026).
  -- ------------------------------------------------------------
  pelapor_sumber        text not null check (pelapor_sumber in ('dis','hris')),
  -- pelapor_nama: snapshot nama pelapor saat pelaporan dibuat, WAJIB
  -- diisi terlepas dari sumbernya (dis atau hris) supaya nama tetap
  -- terbaca walau data sumbernya berubah/hilang.
  pelapor_nama          text not null,
  -- pelapor_dis_user_id: dipakai kalau pelapor_sumber='dis' -- FK ke
  -- users.id DIS sendiri, BELUM diaktifkan (tabel users DIS belum ada).
  pelapor_dis_user_id   uuid,
  -- pelapor_hris_employee_id: dipakai kalau pelapor_sumber='hris' --
  -- ID pegawai dari dataku2026 (mis. format "REG-20260824-4DB8ED"
  -- yang terlihat di dashboard HRIS). TIDAK ADA FK -- referensi lunak
  -- lintas-database, lihat catatan header file.
  pelapor_hris_employee_id  text,

  -- dicatat_oleh: tetap ada, terpisah dari pelapor -- dicatat_oleh
  -- adalah siapa yang MENGINPUT data ini ke DIS (biasanya admin/tata
  -- usaha), pelapor adalah siapa yang MELAPORKAN kejadiannya (bisa
  -- ustadz dari HRIS). Dua peran berbeda, disengaja dipisah.
  dicatat_oleh          uuid,
  created_at            timestamptz not null default now(),

  -- Konsistensi pelapor: kalau sumbernya 'dis', id HRIS harus kosong
  -- dan sebaliknya -- dijaga di level database, bukan cuma aplikasi.
  check (
    (pelapor_sumber = 'dis'  and pelapor_hris_employee_id is null) or
    (pelapor_sumber = 'hris' and pelapor_dis_user_id is null)
  )
);

comment on column public.pelanggaran.kategori is
  'Snapshot dari jenis_pelanggaran.kategori saat baris dibuat -- lihat catatan di atas kolom ini di file migrasi.';

comment on column public.pelanggaran.pelapor_hris_employee_id is
  'Referensi LUNAK ke ID pegawai dataku2026 (HRIS) -- TIDAK ADA FK asli karena beda database/project Supabase. Snapshot, tidak otomatis sinkron kalau data pegawai berubah. Integrasi nyata (validasi/sinkron) belum diputuskan -- lihat catatan header file.';

comment on column public.pelanggaran.pelapor_dis_user_id is
  'FK ke users.id DIS BELUM diaktifkan -- tabel users DIS belum dimigrasikan.';

comment on column public.pelanggaran.dicatat_oleh is
  'FK ke users.id BELUM diaktifkan -- tabel users belum dimigrasikan. Beda dari pelapor: dicatat_oleh = siapa yang input ke sistem, pelapor = siapa yang melaporkan kejadian.';

-- --------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------
create index if not exists idx_pelanggaran_santri_id     on public.pelanggaran (santri_id);
create index if not exists idx_pelanggaran_tanggal       on public.pelanggaran (tanggal);
create index if not exists idx_pelanggaran_jenis_id      on public.pelanggaran (jenis_pelanggaran_id);
create index if not exists idx_pelanggaran_pelapor_hris  on public.pelanggaran (pelapor_hris_employee_id)
  where pelapor_hris_employee_id is not null;

-- --------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------
alter table public.jenis_pelanggaran enable row level security;
alter table public.pelanggaran enable row level security;

create policy admin_full_access_jenis_pelanggaran on public.jenis_pelanggaran
  for all using (auth.jwt() ->> 'role' = 'admin');

create policy admin_full_access_pelanggaran on public.pelanggaran
  for all using (auth.jwt() ->> 'role' = 'admin');

-- TODO (menunggu tabel users + auth + keputusan integrasi HRIS):
-- - ustadz (DIS): CRUD pelanggaran untuk santri di kelas yang diampu
-- - wali: SELECT pelanggaran hanya untuk santri miliknya
-- - Kalau ustadz/guru HRIS nanti dapat akses LANGSUNG ke DIS (bukan
--   cuma jadi "pelapor" pasif), itu perlu identity federation antara
--   dataku2026 dan DIS -- di luar cakupan RLS placeholder ini.
