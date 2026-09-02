-- ============================================================
-- schema_008_kesehatan.sql
-- Modul: Kesehatan (Tahap 9) -- DATA SENSITIF
--
-- Akses dibatasi admin + wali santri bersangkutan SAJA (ustadz TIDAK
-- otomatis punya akses) -- CONFIRMED 2026-09-02, keputusan #2 di
-- database-design.md. Ini beda dari modul lain yang biasanya juga
-- membuka akses ustadz.
--
-- santri_id dipakai sebagai PRIMARY KEY (bukan uuid id terpisah) --
-- relasi 1:1 santri<->kesehatan sesuai draft (satu baris per santri).
-- Ini konsekuensi struktural dari draft ERD ("SANTRI ||--|| KESEHATAN"),
-- BUKAN keputusan baru saya.
--
-- CATATAN PENTING (belum dikonfirmasi): draft TIDAK menyebutkan
-- riwayat perubahan (history) untuk data kesehatan -- tabel ini hanya
-- menyimpan kondisi TERKINI (updated_at menimpa nilai lama). Kalau
-- pesantren butuh riwayat perubahan data kesehatan dari waktu ke
-- waktu (bukan cuma snapshot terakhir), struktur ini perlu tabel
-- riwayat terpisah -- saya TIDAK menambahkannya karena tidak ada
-- indikasi kebutuhan itu di draft manapun, tapi ini kemungkinan gap.
--
-- RLS masih rangka awal/placeholder seperti modul lain, TAPI catatan
-- di sini WAJIB diingat saat ditulis final: ustadz TIDAK termasuk,
-- beda dari pola modul lain yang lebih longgar.
-- ============================================================

create table if not exists public.kesehatan (
  santri_id         uuid primary key references public.santri(id) on delete cascade,
  golongan_darah    text,
  alergi            text,
  riwayat_penyakit  text,
  kontak_darurat    text,
  updated_at        timestamptz not null default now(),
  -- updated_oleh: FK ke users.id BELUM diaktifkan.
  updated_oleh      uuid
);

comment on table public.kesehatan is
  'DATA SENSITIF. Akses dibatasi admin + wali santri bersangkutan SAJA (ustadz TIDAK otomatis punya akses) -- CONFIRMED 2026-09-02. Hanya menyimpan kondisi TERKINI (1 baris per santri, ditimpa saat update) -- TIDAK ada riwayat perubahan, lihat catatan di atas file ini soal kemungkinan gap.';

comment on column public.kesehatan.updated_oleh is
  'FK ke users.id BELUM diaktifkan -- tabel users belum dimigrasikan.';

-- --------------------------------------------------------------
-- updated_at auto-update trigger (reuse fungsi dari schema_004 --
-- fungsi public.set_updated_at() sudah dibuat di migrasi Nilai,
-- CREATE OR REPLACE di sini aman/idempotent kalau dijalankan ulang)
-- --------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_kesehatan_set_updated_at on public.kesehatan;
create trigger trg_kesehatan_set_updated_at
  before update on public.kesehatan
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------
-- Row Level Security
--
-- BEDA dari modul lain: ustadz TIDAK termasuk dalam TODO akses
-- default (CONFIRMED). Hanya admin (placeholder di bawah) + wali
-- santri bersangkutan (TODO, menunggu tabel users) yang seharusnya
-- bisa akses.
-- --------------------------------------------------------------
alter table public.kesehatan enable row level security;

create policy admin_full_access_kesehatan on public.kesehatan
  for all using (auth.jwt() ->> 'role' = 'admin');

-- TODO (menunggu tabel users + auth):
-- - wali: SELECT + UPDATE hanya untuk santri miliknya (via santri_wali)
-- - ustadz: SENGAJA TIDAK diberi akses default (CONFIRMED 2026-09-02)
--   -- kalau kebutuhan berubah (mis. ustadz pembina asrama perlu tahu
--   alergi santri), ini keputusan bisnis baru yang perlu dikonfirmasi
--   ulang, bukan ditambahkan diam-diam.
