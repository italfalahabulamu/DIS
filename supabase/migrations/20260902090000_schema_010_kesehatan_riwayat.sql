-- ============================================================
-- schema_010_kesehatan_riwayat.sql
-- Modul: Kesehatan -- rekam medik (Tahap 11)
--
-- `kesehatan` (schema_008) TETAP ADA sebagai PROFIL STATIS (golongan
-- darah, alergi, kontak darurat -- 1 baris per santri, ditimpa saat
-- update). Tabel BARU `kesehatan_riwayat` di bawah menyimpan
-- KEJADIAN/EPISODE (sakit + penanganan dari waktu ke waktu) --
-- menjawab permintaan "riwayat sakit dan penanganan, semacam rekam
-- medik". Dua tabel ini melengkapi, bukan menggantikan satu sama
-- lain: `kesehatan` = "siapa dia" (kondisi tetap/alergi), 
-- `kesehatan_riwayat` = "apa yang terjadi kapan" (episode sakit).
--
-- SAMA seperti kesehatan (schema_008): DATA SENSITIF, akses
-- dibatasi admin + wali santri bersangkutan SAJA (ustadz TIDAK
-- otomatis dapat akses) -- mengikuti keputusan CONFIRMED #2 yang
-- sama, karena ini modul kesehatan yang sama, bukan modul baru.
--
-- ASUMSI BELUM DIKONFIRMASI: daftar nilai `status` di bawah
-- ('ditangani','dirujuk','rawat_inap','dalam_pemantauan','sembuh')
-- adalah tebakan saya berdasarkan alur umum UKS/klinik sekolah --
-- BUKAN daftar yang diverifikasi dari dokumen/kebijakan Al-Falah.
-- Perlu dikonfirmasi/dikoreksi sebelum modul ini dianggap final.
-- ============================================================

create table if not exists public.kesehatan_riwayat (
  id            uuid primary key default gen_random_uuid(),
  santri_id     uuid not null references public.santri(id) on delete cascade,
  tanggal       date not null,
  -- keluhan: gejala/keluhan awal atau diagnosa -- field WAJIB,
  -- karena setiap baris riwayat harus punya alasan kenapa dicatat.
  keluhan       text not null,
  -- penanganan: tindakan yang diberikan (nullable -- kejadian baru
  -- dicatat, penanganan belum tentu langsung diisi bersamaan).
  penanganan    text,
  -- status: lihat catatan ASUMSI di atas -- belum dikonfirmasi.
  status        text not null default 'ditangani'
                  check (status in ('ditangani','dirujuk','rawat_inap','dalam_pemantauan','sembuh')),
  -- dicatat_oleh: FK ke users.id BELUM diaktifkan, pola sama seperti
  -- modul lain.
  dicatat_oleh  uuid,
  created_at    timestamptz not null default now()
);

comment on table public.kesehatan_riwayat is
  'DATA SENSITIF. Rekam medik per-episode (riwayat sakit + penanganan dari waktu ke waktu), melengkapi profil statis di tabel kesehatan (schema_008). Akses dibatasi admin + wali santri bersangkutan SAJA, sama seperti kesehatan.';

comment on column public.kesehatan_riwayat.status is
  'ASUMSI belum dikonfirmasi -- daftar nilai berdasarkan alur umum UKS/klinik sekolah, bukan kebijakan Al-Falah yang terverifikasi.';

comment on column public.kesehatan_riwayat.dicatat_oleh is
  'FK ke users.id BELUM diaktifkan -- tabel users belum dimigrasikan.';

-- --------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------
create index if not exists idx_kesehatan_riwayat_santri_tanggal
  on public.kesehatan_riwayat (santri_id, tanggal);
create index if not exists idx_kesehatan_riwayat_status
  on public.kesehatan_riwayat (status);

-- --------------------------------------------------------------
-- Row Level Security -- sama persis pola kesehatan (schema_008):
-- ustadz SENGAJA TIDAK termasuk akses default.
-- --------------------------------------------------------------
alter table public.kesehatan_riwayat enable row level security;

create policy admin_full_access_kesehatan_riwayat on public.kesehatan_riwayat
  for all using (auth.jwt() ->> 'role' = 'admin');

-- TODO (menunggu tabel users + auth):
-- - wali: SELECT + INSERT (lapor sakit) hanya untuk santri miliknya
-- - ustadz: SENGAJA TIDAK diberi akses default (CONFIRMED 2026-09-02,
--   sama seperti kesehatan/schema_008) -- kalau kebutuhan berubah
--   (mis. ustadz pembina asrama/UKS perlu akses), itu keputusan bisnis
--   baru yang perlu dikonfirmasi ulang.

comment on table public.kesehatan is
  'DATA SENSITIF. PROFIL STATIS kesehatan santri (golongan darah, alergi, kontak darurat) -- 1 baris per santri, ditimpa saat update. Untuk riwayat kejadian sakit + penanganan dari waktu ke waktu (rekam medik per-episode), lihat kesehatan_riwayat (schema_010).';
