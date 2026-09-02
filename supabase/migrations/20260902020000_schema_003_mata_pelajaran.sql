-- ============================================================
-- schema_003_mata_pelajaran.sql
-- Modul: Data referensi Mata Pelajaran
-- Sumber: blanko_ijazah.xlsm, sheet "Leger 2026" (baris header +
-- baris KKM). 39 mata pelajaran, urutan & KKM diambil PERSIS dari
-- file tersebut -- bukan tebakan.
--
-- CATATAN: kolom `kategori` ('agama'/'umum') adalah INFERENSI saya
-- dari pengelompokan KKM (60 vs 75) di sumber, BUKAN label eksplisit
-- yang ada di file. Perlu dikonfirmasi user sebelum dianggap final.
-- Bahasa Jerman KKM=65 tidak mengikuti pola 60/75 manapun -- dicatat
-- apa adanya, tidak dipaksakan masuk salah satu kategori tanpa dasar
-- (kolom kategori untuk baris ini diisi NULL).
-- ============================================================

create table if not exists public.mata_pelajaran (
  id           uuid primary key default gen_random_uuid(),
  urutan       integer not null unique,
  nama_mapel   text not null unique,
  kkm          integer not null check (kkm between 0 and 100),
  kategori     text check (kategori in ('agama','umum')),
  created_at   timestamptz not null default now()
);

comment on table public.mata_pelajaran is
  'Daftar mata pelajaran, urutan & KKM sumber: blanko_ijazah.xlsm sheet Leger 2026. kategori adalah inferensi, perlu konfirmasi.';

comment on column public.mata_pelajaran.kategori is
  'INFERENSI dari pengelompokan KKM (60=agama, 75=umum) di sumber -- bukan label eksplisit. Bahasa Jerman (KKM 65) diisi NULL karena tidak mengikuti pola manapun.';

insert into public.mata_pelajaran (urutan, nama_mapel, kkm, kategori) values
  (1,  'Al-Qur''an',                60, 'agama'),
  (2,  'Bahasa Arab',                60, 'agama'),
  (3,  'Imla''',                     60, 'agama'),
  (4,  'Khat',                       60, 'agama'),
  (5,  'Mahfudhat',                  60, 'agama'),
  (6,  'Muthalaah',                  60, 'agama'),
  (7,  'Sharf',                      60, 'agama'),
  (8,  'Sejarah Kebudayaan Islam',   60, 'agama'),
  (9,  'Tajwid',                     60, 'agama'),
  (10, 'Balaghah',                   60, 'agama'),
  (11, 'Fiqh',                       60, 'agama'),
  (12, 'Hadits',                     60, 'agama'),
  (13, 'Musthalahul Hadits',         60, 'agama'),
  (14, 'Nahwu',                      60, 'agama'),
  (15, 'Tafsir',                     60, 'agama'),
  (16, 'Tauhid',                     60, 'agama'),
  (17, 'Ulumul Qur''an',             60, 'agama'),
  (18, 'Ushul Fiqh',                 60, 'agama'),
  (19, 'Fathul Kutub',               60, 'agama'),
  (20, 'Kasyful Mu''jam',            60, 'agama'),
  (21, 'Tajhiz Mayat',               60, 'agama'),
  (22, 'Samadiyah',                  60, 'agama'),
  (23, 'Grammar',                    60, 'agama'),
  (24, 'Bahasa Jerman',              65, null),
  (25, 'Bahasa Indonesia',           75, 'umum'),
  (26, 'Bahasa Inggris',             75, 'umum'),
  (27, 'Bahasa Arab (TL)',           75, 'umum'),
  (28, 'Bahasa Inggris (TL)',        75, 'umum'),
  (29, 'Biologi',                    75, 'umum'),
  (30, 'Fisika',                     75, 'umum'),
  (31, 'Kimia',                      75, 'umum'),
  (32, 'Ekonomi',                    75, 'umum'),
  (33, 'Sosiologi',                  75, 'umum'),
  (34, 'Matematika',                 75, 'umum'),
  (35, 'PAI',                        75, 'umum'),
  (36, 'PJOK',                       75, 'umum'),
  (37, 'PKN',                        75, 'umum'),
  (38, 'Sejarah',                    75, 'umum'),
  (39, 'Seni Budaya',                75, 'umum')
on conflict (urutan) do nothing;

-- --------------------------------------------------------------
-- RLS: tabel referensi, semua role login boleh baca; hanya admin
-- yang boleh ubah. Placeholder sama seperti migrasi sebelumnya --
-- auth.jwt() role-check, BELUM diuji terhadap Postgres asli.
-- --------------------------------------------------------------
alter table public.mata_pelajaran enable row level security;

create policy read_all_authenticated_mata_pelajaran on public.mata_pelajaran
  for select using (auth.role() = 'authenticated');

create policy admin_write_mata_pelajaran on public.mata_pelajaran
  for insert with check (auth.jwt() ->> 'role' = 'admin');

create policy admin_update_mata_pelajaran on public.mata_pelajaran
  for update using (auth.jwt() ->> 'role' = 'admin');

create policy admin_delete_mata_pelajaran on public.mata_pelajaran
  for delete using (auth.jwt() ->> 'role' = 'admin');
