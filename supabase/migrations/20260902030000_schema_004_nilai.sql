-- ============================================================
-- schema_004_nilai.sql
-- Modul: Nilai (Tahap 5)
--
-- KEPUTUSAN (CONFIRMED 2026-09-02): kalau santri pindah kelas di
-- tengah semester, nilai semester itu dicatat di KELAS TERBARU
-- santri, bukan dipecah per kelas lama/baru. `nilai.kelas_id` di
-- bawah adalah snapshot kelas santri pada saat nilai disimpan --
-- aplikasi bertanggung jawab mengisi ini dari kelas aktif santri
-- di santri_kelas_riwayat (tanggal_selesai IS NULL) saat itu, sama
-- seperti pola denormalisasi kelas_id di kehadiran (schema_002).
--
-- BELUM DIAKTIFKAN: FK nilai.kelas_id -> kelas.id TIDAK divalidasi
-- terhadap santri_kelas_riwayat (mis. tidak ada trigger yang
-- memastikan kelas_id benar-benar salah satu kelas santri itu
-- pernah/sedang ditempati). Ini validasi level-aplikasi untuk
-- sekarang, bukan level-database -- dicatat sebagai risiko, bukan
-- disembunyikan.
--
-- Penugasan ustadz per kelas+mapel (siapa yang boleh input nilai
-- apa) BELUM dimodelkan -- menunggu tabel users (akun login).
-- ============================================================

create table if not exists public.nilai (
  id                 uuid primary key default gen_random_uuid(),
  santri_id          uuid not null references public.santri(id) on delete cascade,
  mata_pelajaran_id  uuid not null references public.mata_pelajaran(id) on delete restrict,
  semester           text not null check (semester in ('ganjil','genap')),
  tahun_ajaran       text not null,
  -- kelas_id: snapshot kelas TERBARU santri saat nilai disimpan
  -- (CONFIRMED 2026-09-02) -- lihat catatan di atas.
  kelas_id           uuid not null references public.kelas(id) on delete restrict,
  nilai_angka        numeric(5,2) not null check (nilai_angka between 0 and 100),
  predikat           text,
  catatan            text,
  -- input_oleh: FK ke users.id BELUM diaktifkan, pola sama seperti
  -- dicatat_oleh di kehadiran (schema_002) -- menunggu tabel users.
  input_oleh         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (santri_id, mata_pelajaran_id, semester, tahun_ajaran)
);

comment on column public.nilai.kelas_id is
  'Snapshot kelas TERBARU santri saat nilai disimpan (CONFIRMED 2026-09-02) -- bukan kelas saat mapel diajarkan kalau santri sempat pindah kelas di tengah semester. Diisi aplikasi dari santri_kelas_riwayat, belum ada validasi level-database.';

comment on column public.nilai.input_oleh is
  'FK ke users.id BELUM diaktifkan -- tabel users belum dimigrasikan.';

-- --------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------
create index if not exists idx_nilai_santri_tahun_semester
  on public.nilai (santri_id, tahun_ajaran, semester);
create index if not exists idx_nilai_kelas_mapel
  on public.nilai (kelas_id, mata_pelajaran_id);
create index if not exists idx_nilai_mata_pelajaran_id
  on public.nilai (mata_pelajaran_id);

-- --------------------------------------------------------------
-- updated_at auto-update trigger
-- --------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_nilai_set_updated_at on public.nilai;
create trigger trg_nilai_set_updated_at
  before update on public.nilai
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------
-- Row Level Security
--
-- Sama seperti schema_001/schema_002: rangka awal/placeholder.
-- Policy untuk ustadz (hanya CRUD nilai mapel+kelas yang diampu)
-- dan wali (SELECT nilai santri miliknya) BELUM bisa ditulis benar
-- tanpa tabel users+penugasan ustadz -- ditandai TODO eksplisit.
-- --------------------------------------------------------------
alter table public.nilai enable row level security;

create policy admin_full_access_nilai on public.nilai
  for all using (auth.jwt() ->> 'role' = 'admin');

-- TODO (menunggu tabel users + tabel penugasan ustadz per kelas/mapel):
-- - ustadz: CRUD nilai hanya untuk (kelas_id, mata_pelajaran_id) yang diampu
-- - wali: SELECT nilai hanya untuk santri yang terhubung via santri_wali
