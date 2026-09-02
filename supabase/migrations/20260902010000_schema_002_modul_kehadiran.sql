-- ============================================================
-- schema_002_modul_kehadiran.sql
-- Modul: Kehadiran (Tahap 4)
--
-- PERUBAHAN KEPUTUSAN: santri.kelas_id (ditambahkan di
-- schema_001, FK belum diaktifkan) DIHAPUS di sini. Keputusan baru
-- (2026-09-02): santri PERLU riwayat pindah kelas, bukan satu kelas
-- tetap -- satu kolom di santri tidak cukup merepresentasikan itu.
-- Digantikan oleh santri_kelas_riwayat di bawah.
--
-- Tabel di migrasi ini: kelas, santri_kelas_riwayat, kehadiran.
-- Modul lain (nilai, spp_*, pelanggaran, prestasi, perizinan,
-- kesehatan) masih belum digarap -- sesuai kesepakatan bertahap.
-- ============================================================

-- Dibutuhkan untuk exclusion constraint pada rentang tanggal di bawah
create extension if not exists btree_gist;

-- --------------------------------------------------------------
-- Hapus kolom yang sudah usang (belum pernah dipakai/diaktifkan FK-nya)
-- --------------------------------------------------------------
alter table public.santri drop column if exists kelas_id;

-- --------------------------------------------------------------
-- Tabel: kelas
-- --------------------------------------------------------------
create table if not exists public.kelas (
  id             uuid primary key default gen_random_uuid(),
  nama_kelas     text not null,
  tahun_ajaran   text not null,  -- mis. '2026/2027'
  -- wali_kelas_id: FK ke users.id BELUM diaktifkan, sama seperti pola
  -- di schema_001 -- tabel users (akun login) belum dimigrasikan.
  wali_kelas_id  uuid,
  created_at     timestamptz not null default now(),
  unique (nama_kelas, tahun_ajaran)
);

comment on column public.kelas.wali_kelas_id is
  'FK ke users.id BELUM diaktifkan -- tabel users belum dimigrasikan.';

-- --------------------------------------------------------------
-- Tabel: santri_kelas_riwayat
-- Riwayat penempatan kelas per santri. tanggal_selesai NULL berarti
-- penempatan masih berlaku (kelas saat ini).
--
-- Exclusion constraint mencegah dua penempatan kelas untuk santri
-- yang sama saling tumpang tindih periode tanggalnya -- integritas
-- ini dijaga di level database, bukan cuma di aplikasi.
-- --------------------------------------------------------------
create table if not exists public.santri_kelas_riwayat (
  id               uuid primary key default gen_random_uuid(),
  santri_id        uuid not null references public.santri(id) on delete cascade,
  kelas_id         uuid not null references public.kelas(id) on delete restrict,
  tanggal_mulai    date not null,
  tanggal_selesai  date,  -- NULL = penempatan masih aktif
  created_at       timestamptz not null default now(),

  check (tanggal_selesai is null or tanggal_selesai >= tanggal_mulai),

  exclude using gist (
    santri_id with =,
    daterange(tanggal_mulai, coalesce(tanggal_selesai, 'infinity'::date), '[]') with &&
  )
);

comment on table public.santri_kelas_riwayat is
  'Riwayat penempatan kelas per santri per periode. tanggal_selesai NULL = masih di kelas ini saat ini.';

-- --------------------------------------------------------------
-- Tabel: kehadiran
--
-- kelas_id disimpan LANGSUNG di baris kehadiran (bukan di-derive
-- dari santri_kelas_riwayat saat query), supaya catatan kehadiran
-- historis tetap akurat walau santri kemudian pindah kelas -- dan
-- supaya rekap harian per kelas tidak perlu join tanggal-range.
-- --------------------------------------------------------------
create table if not exists public.kehadiran (
  id             uuid primary key default gen_random_uuid(),
  santri_id      uuid not null references public.santri(id) on delete cascade,
  kelas_id       uuid not null references public.kelas(id) on delete restrict,
  tanggal        date not null,
  status         text not null check (status in ('hadir','sakit','izin','alpa')),
  -- dicatat_oleh: FK ke users.id BELUM diaktifkan, pola sama seperti
  -- wali_kelas_id di atas -- menunggu migrasi tabel users.
  dicatat_oleh   uuid,
  catatan        text,
  created_at     timestamptz not null default now(),

  unique (santri_id, tanggal)
);

comment on column public.kehadiran.dicatat_oleh is
  'FK ke users.id BELUM diaktifkan -- tabel users belum dimigrasikan.';

-- --------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------
create index if not exists idx_riwayat_santri_id on public.santri_kelas_riwayat (santri_id);
create index if not exists idx_riwayat_kelas_id  on public.santri_kelas_riwayat (kelas_id);
create index if not exists idx_kehadiran_santri_tanggal on public.kehadiran (santri_id, tanggal);
create index if not exists idx_kehadiran_kelas_tanggal  on public.kehadiran (kelas_id, tanggal);
create index if not exists idx_kelas_tahun_ajaran on public.kelas (tahun_ajaran);

-- --------------------------------------------------------------
-- Row Level Security
--
-- Sama seperti schema_001: ini rangka awal/placeholder. Role check
-- pakai auth.jwt() langsung karena tabel users+auth belum ada.
-- Policy untuk role 'ustadz' (hanya CRUD kehadiran kelas yang diampu)
-- BELUM bisa ditulis benar tanpa tabel users -- ditandai TODO,
-- bukan ditulis asal supaya terlihat lengkap.
-- --------------------------------------------------------------
alter table public.kelas enable row level security;
alter table public.santri_kelas_riwayat enable row level security;
alter table public.kehadiran enable row level security;

create policy admin_full_access_kelas on public.kelas
  for all using (auth.jwt() ->> 'role' = 'admin');

create policy admin_full_access_riwayat on public.santri_kelas_riwayat
  for all using (auth.jwt() ->> 'role' = 'admin');

create policy admin_full_access_kehadiran on public.kehadiran
  for all using (auth.jwt() ->> 'role' = 'admin');

-- TODO (menunggu tabel users):
-- - ustadz: CRUD kehadiran hanya untuk kelas_id yang wali_kelas_id-nya = dirinya
-- - wali: SELECT kehadiran hanya untuk santri yang terhubung via santri_wali
