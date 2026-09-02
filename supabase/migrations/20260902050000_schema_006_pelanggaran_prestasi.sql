-- ============================================================
-- schema_006_pelanggaran_prestasi.sql
-- Modul: Pelanggaran & Prestasi (Tahap 7)
--
-- STATUS: DRAFT->SQL, sama seperti SPP (schema_005) -- BUKAN FINAL.
-- Struktur kolom sesuai draft docs/database-design.md, tapi ada
-- Assumption #3 yang BELUM dikonfirmasi (dikutip dari database-design.md):
--
--   "Pelanggaran pakai gradasi mirip sistem lama (Teguran Lisan ->
--   SP-3) -- kalau DIS mau sistem poin akumulatif yang beda, kolom
--   `poin` + `kategori` perlu didesain ulang."
--
-- Migrasi ini MENULIS asumsi itu apa adanya (5 kategori gradasi tetap
-- + kolom poin bebas integer) -- BUKAN konfirmasi baru. Kalau sistem
-- poin akumulatif yang dimaksud pengguna berbeda (mis. rentang poin
-- per kategori yang sudah ditentukan, atau ambang otomatis SP1/2/3
-- dari akumulasi poin), tabel ini perlu revisi migrasi, bukan cuma
-- update data.
--
-- Tidak ada trigger/logika yang menghitung SP1/SP2/SP3 otomatis dari
-- akumulasi poin -- itu keputusan bisnis yang belum ada, dicatat
-- sebagai TODO, bukan diasumsikan.
--
-- RLS masih rangka awal/placeholder, sama seperti modul lain.
-- ============================================================

create table if not exists public.pelanggaran (
  id            uuid primary key default gen_random_uuid(),
  santri_id     uuid not null references public.santri(id) on delete cascade,
  tanggal       date not null,
  kategori      text not null
                  check (kategori in ('teguran_lisan','teguran_tertulis','sp1','sp2','sp3')),
  poin          integer not null check (poin >= 0),
  deskripsi     text,
  -- dicatat_oleh: FK ke users.id BELUM diaktifkan, pola sama seperti
  -- modul lain -- menunggu tabel users.
  dicatat_oleh  uuid,
  created_at    timestamptz not null default now()
);

comment on column public.pelanggaran.kategori is
  'Gradasi tetap (teguran_lisan -> sp3) sesuai Assumption #3 di database-design.md -- BELUM dikonfirmasi pengguna. Kalau DIS butuh sistem poin akumulatif yang beda, kolom ini perlu didesain ulang, bukan sekadar diisi data baru.';

comment on column public.pelanggaran.poin is
  'Integer bebas, TIDAK ada validasi rentang per kategori dan TIDAK ada trigger yang menghitung kenaikan SP1->SP2->SP3 otomatis dari akumulasi poin -- itu keputusan bisnis yang belum ada.';

comment on column public.pelanggaran.dicatat_oleh is
  'FK ke users.id BELUM diaktifkan -- tabel users belum dimigrasikan.';

create table if not exists public.prestasi (
  id            uuid primary key default gen_random_uuid(),
  santri_id     uuid not null references public.santri(id) on delete cascade,
  tanggal       date not null,
  kategori      text not null check (kategori in ('akademik','non_akademik')),
  deskripsi     text not null,
  tingkat       text check (tingkat in ('sekolah','kabupaten','provinsi','nasional')),
  -- dicatat_oleh: FK ke users.id BELUM diaktifkan.
  dicatat_oleh  uuid,
  created_at    timestamptz not null default now()
);

comment on column public.prestasi.tingkat is
  'CHECK constraint 4 tingkat (sekolah/kabupaten/provinsi/nasional) -- ini ASUMSI saya dari draft, bukan daftar yang pernah dikonfirmasi eksplisit. Draft docs/database-design.md juga menyebut kategori "tahfizh" (Lulus KEMMAS) dari blanko_ijazah.xlsm yang belum dipetakan ke sini -- lihat "Temuan tambahan" di dokumen tsb.';

comment on column public.prestasi.dicatat_oleh is
  'FK ke users.id BELUM diaktifkan -- tabel users belum dimigrasikan.';

-- --------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------
create index if not exists idx_pelanggaran_santri_id on public.pelanggaran (santri_id);
create index if not exists idx_pelanggaran_tanggal    on public.pelanggaran (tanggal);
create index if not exists idx_prestasi_santri_id     on public.prestasi (santri_id);
create index if not exists idx_prestasi_tanggal       on public.prestasi (tanggal);

-- --------------------------------------------------------------
-- Row Level Security
--
-- Rangka awal/placeholder. Policy ustadz (CRUD pelanggaran/prestasi
-- untuk santri di kelas yang diampu) dan wali (SELECT untuk santri
-- miliknya) BELUM bisa ditulis benar tanpa tabel users -- TODO.
-- --------------------------------------------------------------
alter table public.pelanggaran enable row level security;
alter table public.prestasi enable row level security;

create policy admin_full_access_pelanggaran on public.pelanggaran
  for all using (auth.jwt() ->> 'role' = 'admin');

create policy admin_full_access_prestasi on public.prestasi
  for all using (auth.jwt() ->> 'role' = 'admin');

-- TODO (menunggu tabel users + auth):
-- - ustadz: CRUD pelanggaran/prestasi untuk santri di kelas yang diampu
-- - wali: SELECT pelanggaran/prestasi hanya untuk santri miliknya
--   (via santri_wali)
