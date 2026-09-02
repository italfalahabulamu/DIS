-- ============================================================
-- schema_014_pegawai_hris_referensi.sql
-- Sinkronisasi HRIS -- tabel replika lokal (Tahap 15)
--
-- Menjawab instruksi eksplisit 2026-09-02: "sinkron nyata secara
-- berkala" untuk field pelapor (schema_009) yang merujuk pegawai
-- HRIS (dataku2026).
--
-- KENAPA PERLU TABEL REPLIKA (bukan FK langsung lintas-database):
-- Postgres TIDAK mendukung foreign key lintas database/project --
-- DIS dan dataku2026 tetap dua project Supabase terpisah (sesuai
-- rekomendasi docs/database-design.md). Satu-satunya cara punya
-- REFERENTIAL INTEGRITY nyata (bukan cuma snapshot text bebas
-- seperti sebelumnya) adalah menyimpan SALINAN data pegawai yang
-- relevan di database DIS sendiri, lalu FK mengacu ke salinan itu.
--
-- INI HANYA BAGIAN (a) DARI 3 BAGIAN YANG DIBUTUHKAN:
-- (a) Tabel replika lokal ini -- SELESAI di migrasi ini.
-- (b) Job sinkronisasi terjadwal (Supabase Edge Function + Cron
--     Trigger) yang menarik data dari dataku2026 secara berkala dan
--     meng-upsert ke tabel ini -- BELUM DIKERJAKAN, ini kode
--     aplikasi (JS), bukan migrasi SQL. Di luar cakupan sesi ini.
-- (c) Endpoint di sisi dataku2026 yang bisa dipanggil job itu --
--     BELUM ADA/BELUM DIKONFIRMASI. Kemungkinan bisa memanfaatkan
--     RPC get_team_contacts()/search_employee_contacts() yang sudah
--     ada di dataku2026 (catatan: get_team_contacts() sendiri
--     sedang punya bug produksi aktif per riwayat proyek -- 42702
--     ambiguous column, menunggu fix schema_89b -- jangan
--     disandarkan sampai itu diperbaiki).
--
-- Setup Cron Trigger via Dashboard Supabase ADALAH salah satu dari
-- 3 kategori tugas yang selalu perlu tim Supabase (di luar sandbox
-- ini) -- konsisten dengan pola kerja proyek dataku2026.
--
-- status_aktif (bukan penghapusan baris) dipakai untuk pegawai yang
-- sudah tidak aktif di HRIS -- SAMA prinsipnya dengan kebijakan
-- RESTRICT/audit-trail di modul lain: pelanggaran yang pernah
-- dilaporkan pegawai itu TIDAK BOLEH kehilangan referensinya hanya
-- karena pegawainya sudah resign/pindah tugas.
-- ============================================================

create table if not exists public.pegawai_hris_referensi (
  -- hris_employee_id: format ID dari dataku2026, mis.
  -- "REG-20260824-4DB8ED" (terlihat di dashboard HRIS) -- text,
  -- BUKAN uuid, karena format aslinya bukan UUID.
  hris_employee_id  text primary key,
  nama_lengkap      text not null,
  unit_kerja        text,
  jabatan           text,
  -- status_aktif: false kalau pegawai sudah tidak aktif di HRIS
  -- (resign/pindah) -- baris TETAP disimpan (bukan dihapus) supaya
  -- referensi historis (pelanggaran yang dia laporkan) tetap valid.
  status_aktif      boolean not null default true,
  -- synced_at: kapan baris ini terakhir diperbarui oleh job
  -- sinkronisasi -- kalau kolom ini "basi" (jauh dari sekarang),
  -- berarti job sinkronisasi (bagian b) bermasalah/belum berjalan.
  synced_at         timestamptz not null default now()
);

comment on table public.pegawai_hris_referensi is
  'Replika lokal SEBAGIAN data pegawai dari dataku2026 (HRIS), disinkron berkala oleh job terpisah (BELUM dibuat -- lihat catatan header migrasi ini). Tabel ini KOSONG sampai job sinkronisasi (bagian b+c) benar-benar berjalan -- FK yang mengacu ke sini (lihat schema_015) akan menolak semua pelapor_hris_employee_id yang belum ada baris replikanya di sini.';

comment on column public.pegawai_hris_referensi.synced_at is
  'Kapan baris ini terakhir disinkron. Kalau jauh dari waktu sekarang, indikasi job sinkronisasi bermasalah -- cocok dipakai untuk alert monitoring (lihat prinsip proyek: tidak ada monitoring untuk kegagalan silent, ini celah yang sama, jangan diulang di DIS).';

create index if not exists idx_pegawai_hris_status_aktif
  on public.pegawai_hris_referensi (status_aktif);

-- --------------------------------------------------------------
-- Row Level Security
--
-- Job sinkronisasi (bagian b) akan jalan pakai service_role key,
-- yang BYPASS RLS -- policy di bawah ini untuk akses manusia/aplikasi
-- biasa saja, bukan untuk job sinkronisasi itu sendiri.
-- --------------------------------------------------------------
alter table public.pegawai_hris_referensi enable row level security;

create policy admin_full_access_pegawai_hris on public.pegawai_hris_referensi
  for all using (auth.jwt() ->> 'role' = 'admin');

-- TODO: role lain (ustadz/wali) mungkin perlu SELECT read-only untuk
-- memilih pelapor saat mencatat pelanggaran -- menunggu tabel users.
