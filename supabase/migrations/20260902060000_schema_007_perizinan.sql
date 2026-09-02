-- ============================================================
-- schema_007_perizinan.sql
-- Modul: Perizinan (Tahap 8)
--
-- STATUS: DRAFT->SQL. Konsekuensi dari keputusan CONFIRMED #4
-- (2026-09-02, lihat schema_001 + database-design.md): wali OPTIONAL
-- per santri, TAPI diajukan_oleh di sini NOT NULL FK -> wali.id.
-- Artinya santri TANPA data wali tidak bisa punya proses perizinan
-- sampai wali diisi -- itu memang aturan bisnis yang disengaja
-- (CONFIRMED), bukan bug baru di migrasi ini.
--
-- KEPUTUSAN BARU yang BELUM dikonfirmasi (sama pola dengan SPP):
-- diajukan_oleh (FK -> wali.id) pakai ON DELETE CASCADE, MENGIKUTI
-- pola wali_id di santri_wali (schema_001), BUKAN pola RESTRICT yang
-- saya pakai di spp_pembayaran.tagihan_id (schema_005). Konsekuensi:
-- kalau data wali dihapus, riwayat pengajuan izinnya ikut terhapus.
-- Ini saya biarkan CASCADE demi konsistensi dengan pola yang sudah
-- ada di repo untuk FK wali_id -- TAPI ini punya trade-off yang sama
-- persis dengan alasan saya pakai RESTRICT di SPP (kehilangan jejak
-- riwayat/audit). Saya TIDAK punya dasar kuat untuk memutuskan salah
-- satu secara sepihak untuk kedua kasus -- keduanya perlu direview
-- bersama, bukan diasumsikan benar karena "sudah ditulis begitu".
--
-- disetujui_oleh (FK -> users.id) BELUM diaktifkan, sama seperti
-- kolom users.id lain yang menunggu tabel users.
--
-- RLS masih rangka awal/placeholder.
-- ============================================================

create table if not exists public.perizinan (
  id               uuid primary key default gen_random_uuid(),
  santri_id        uuid not null references public.santri(id) on delete cascade,
  -- Lihat catatan di atas soal ON DELETE CASCADE vs RESTRICT --
  -- belum diputuskan final.
  diajukan_oleh    uuid not null references public.wali(id) on delete cascade,
  jenis            text not null check (jenis in ('pulang','sakit','keperluan_lain')),
  tanggal_mulai    date not null,
  tanggal_selesai  date not null,
  alasan           text,
  status           text not null default 'menunggu'
                     check (status in ('menunggu','disetujui','ditolak')),
  -- disetujui_oleh: FK ke users.id BELUM diaktifkan.
  disetujui_oleh   uuid,
  created_at       timestamptz not null default now(),

  check (tanggal_selesai >= tanggal_mulai)
);

comment on column public.perizinan.diajukan_oleh is
  'NOT NULL (CONFIRMED 2026-09-02) -- santri tanpa data wali tidak bisa punya proses perizinan, ini disengaja. ON DELETE CASCADE mengikuti pola wali_id di santri_wali (schema_001), TAPI belum direview terhadap trade-off kehilangan riwayat izin kalau wali dihapus -- lihat catatan di atas file ini.';

comment on column public.perizinan.disetujui_oleh is
  'FK ke users.id BELUM diaktifkan -- tabel users belum dimigrasikan.';

-- --------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------
create index if not exists idx_perizinan_santri_id      on public.perizinan (santri_id);
create index if not exists idx_perizinan_diajukan_oleh  on public.perizinan (diajukan_oleh);
create index if not exists idx_perizinan_status         on public.perizinan (status);

-- --------------------------------------------------------------
-- Row Level Security
--
-- Rangka awal/placeholder. Policy wali (CRUD pengajuan untuk santri
-- miliknya sendiri) dan admin/ustadz (approve/reject) BELUM bisa
-- ditulis benar tanpa tabel users -- TODO.
-- --------------------------------------------------------------
alter table public.perizinan enable row level security;

create policy admin_full_access_perizinan on public.perizinan
  for all using (auth.jwt() ->> 'role' = 'admin');

-- TODO (menunggu tabel users + auth):
-- - wali: INSERT + SELECT pengajuan hanya untuk santri miliknya
--   (via santri_wali); TIDAK boleh UPDATE status (itu wewenang
--   admin/pihak yang menyetujui)
-- - role penyetuju (admin? kepala bagian pengasuhan? belum
--   diputuskan) : UPDATE status (menunggu -> disetujui/ditolak)
