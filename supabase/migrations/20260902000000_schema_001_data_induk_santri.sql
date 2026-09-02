-- ============================================================
-- schema_001_data_induk_santri.sql
-- Modul: Data Induk Santri (Tahap 3)
-- Status tabel: santri, wali, santri_wali = FINAL v1.0 (dikonfirmasi
-- di percakapan 2026-09-02). Tabel lain di database-design.md
-- (kelas, nilai, kehadiran, spp_*, pelanggaran, prestasi, perizinan,
-- kesehatan) BELUM ditulis di sini -- masih draft/assumptions,
-- ditulis modul-per-modul sesuai keputusan "kerjakan bertahap".
--
-- kelas.id direferensikan oleh santri.kelas_id tapi tabel kelas
-- belum dibuat -- FK tersebut SENGAJA belum diaktifkan (lihat
-- catatan di kolom kelas_id) sampai modul Kehadiran/Nilai digarap
-- dan pertanyaan "riwayat pindah kelas" (Assumptions #4 di
-- database-design.md) terjawab.
-- ============================================================

-- --------------------------------------------------------------
-- Tabel: wali
-- --------------------------------------------------------------
create table if not exists public.wali (
  id            uuid primary key default gen_random_uuid(),
  nama_lengkap  text not null,
  no_telepon    text,
  hubungan      text check (hubungan in ('ayah','ibu','wali_lain')),
  created_at    timestamptz not null default now()
);

comment on table public.wali is
  'Data wali/orang tua santri. Satu wali bisa terhubung ke banyak santri via santri_wali (many-to-many).';

-- --------------------------------------------------------------
-- Tabel: santri
-- --------------------------------------------------------------
create table if not exists public.santri (
  id             uuid primary key default gen_random_uuid(),
  nis            text not null unique,
  nama_lengkap   text not null,
  tanggal_lahir  date,
  jenis_kelamin  text check (jenis_kelamin in ('L','P')),
  -- kelas_id: kolom disiapkan tapi FK belum diaktifkan -- tabel
  -- `kelas` belum ada di migrasi manapun. Referential integrity
  -- ditambahkan lewat migrasi terpisah begitu modul Kehadiran/Nilai
  -- digarap dan model "riwayat pindah kelas" sudah diputuskan.
  kelas_id       uuid,
  status         text not null default 'aktif'
                   check (status in ('aktif','lulus','keluar','pindah')),
  tanggal_masuk  date not null,
  created_at     timestamptz not null default now()
);

comment on column public.santri.kelas_id is
  'FK ke kelas.id BELUM diaktifkan -- tabel kelas belum dimigrasikan. Jangan asumsikan integritas referensial di kolom ini sampai migrasi kelas dibuat.';

-- --------------------------------------------------------------
-- Tabel: santri_wali (junction, many-to-many)
-- Wali bersifat OPTIONAL per santri -- CONFIRMED 2026-09-02.
-- Santri boleh punya 0 baris di sini. Konsekuensi: modul Perizinan
-- (diajukan_oleh FK -> wali.id, NOT NULL) tidak bisa dipakai untuk
-- santri yang belum py wali -- itu aturan bisnis yang disengaja,
-- bukan bug (CONFIRMED).
-- --------------------------------------------------------------
create table if not exists public.santri_wali (
  santri_id  uuid not null references public.santri(id) on delete cascade,
  wali_id    uuid not null references public.wali(id) on delete cascade,
  primary key (santri_id, wali_id)
);

-- --------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------
create index if not exists idx_santri_status   on public.santri (status);
create index if not exists idx_santri_kelas_id on public.santri (kelas_id);
create index if not exists idx_santri_wali_wali_id on public.santri_wali (wali_id);

-- --------------------------------------------------------------
-- Row Level Security
--
-- CATATAN PENTING: policy di bawah ini adalah RANGKA AWAL saja.
-- Belum ada tabel `users` (akun login: admin/ustadz/keuangan_spp/wali)
-- yang dimigrasikan di sini -- jadi role checking di bawah masih
-- placeholder (memakai auth.jwt() ->> 'role' langsung) dan HARUS
-- direvisi begitu skema `users`+auth ditulis. Jangan anggap RLS ini
-- final atau sudah diuji terhadap Postgres asli -- ikuti prinsip
-- proyek: RLS wajib diuji terhadap Postgres asli, bukan cuma
-- diasumsikan benar dari mock.
-- --------------------------------------------------------------
alter table public.santri enable row level security;
alter table public.wali enable row level security;
alter table public.santri_wali enable row level security;

-- Admin: akses penuh (placeholder -- ganti begitu tabel users ada)
create policy admin_full_access_santri on public.santri
  for all using (auth.jwt() ->> 'role' = 'admin');

create policy admin_full_access_wali on public.wali
  for all using (auth.jwt() ->> 'role' = 'admin');

create policy admin_full_access_santri_wali on public.santri_wali
  for all using (auth.jwt() ->> 'role' = 'admin');

-- TODO: policy untuk role 'wali' (baca hanya santri miliknya sendiri,
-- via join ke santri_wali) belum ditulis -- butuh tabel `users` dulu
-- untuk tahu wali_id mana yang sedang login. Lihat docs/database-design.md
-- "Next Actions".
