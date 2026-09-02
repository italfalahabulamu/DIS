-- ============================================================
-- schema_005_spp.sql
-- Modul: SPP -- spp_tagihan, spp_pembayaran (Tahap 6)
--
-- Sesuai draft docs/database-design.md: SPP dicatat manual, TANPA
-- integrasi payment gateway (CONFIRMED 2026-09-02, keputusan #3).
-- Skema di bawah menulis draft itu jadi SQL -- struktur kolom SAMA
-- dengan draft, TIDAK ada kolom yang ditambah/dikurangi diam-diam.
--
-- DUA KEPUTUSAN BARU di migrasi ini yang BELUM pernah dikonfirmasi
-- eksplisit oleh pengguna (ditulis di sini supaya terlihat, bukan
-- disembunyikan sebagai "sudah pasti"):
--
-- 1. spp_pembayaran.tagihan_id pakai ON DELETE RESTRICT, BUKAN
--    CASCADE -- beda dari pola santri_id di tabel lain (nilai,
--    kehadiran, santri_wali semua CASCADE). Alasan: tagihan yang
--    sudah punya riwayat pembayaran adalah jejak audit keuangan;
--    menghapus tagihan sampai menghapus pembayaran otomatis (CASCADE)
--    berisiko menghilangkan bukti transaksi. Ini pilihan saya
--    berdasarkan praktik umum audit keuangan, BUKAN keputusan bisnis
--    yang sudah dikonfirmasi pengguna -- perlu direview.
--
-- 2. status pada spp_tagihan ('belum_bayar'/'lunas'/'sebagian') TIDAK
--    dihitung otomatis dari total spp_pembayaran di migrasi ini --
--    tidak ada trigger. Aturan kapan status berubah jadi 'sebagian'
--    vs 'lunas' (mis. toleransi pembulatan, pembayaran lebih besar
--    dari tagihan) belum didefinisikan di draft manapun. Status
--    tetap kolom yang diisi manual/oleh aplikasi untuk sekarang --
--    TODO eksplisit, bukan diasumsikan selesai.
--
-- Sama seperti modul lain: RLS masih rangka awal/placeholder,
-- policy untuk wali dan keuangan_spp menunggu tabel users+auth.
-- ============================================================

create table if not exists public.spp_tagihan (
  id            uuid primary key default gen_random_uuid(),
  santri_id     uuid not null references public.santri(id) on delete cascade,
  periode       text not null,
  jenis         text not null check (jenis in ('spp_bulanan','uang_gedung','seragam','lainnya')),
  jumlah        numeric(12,2) not null check (jumlah > 0),
  jatuh_tempo   date,
  -- status: diisi manual/aplikasi untuk sekarang -- lihat catatan
  -- keputusan #2 di atas, belum ada perhitungan otomatis dari
  -- spp_pembayaran.
  status        text not null default 'belum_bayar'
                  check (status in ('belum_bayar','lunas','sebagian')),
  created_at    timestamptz not null default now(),

  unique (santri_id, periode, jenis)
);

comment on column public.spp_tagihan.status is
  'Diisi manual/aplikasi -- BELUM ada trigger yang menghitung otomatis dari total spp_pembayaran. Aturan ambang "sebagian" vs "lunas" belum didefinisikan.';

create table if not exists public.spp_pembayaran (
  id               uuid primary key default gen_random_uuid(),
  -- ON DELETE RESTRICT (bukan CASCADE seperti pola FK santri_id di
  -- tabel lain) -- lihat catatan keputusan #1 di atas.
  tagihan_id       uuid not null references public.spp_tagihan(id) on delete restrict,
  jumlah_dibayar   numeric(12,2) not null check (jumlah_dibayar > 0),
  tanggal_bayar    timestamptz not null default now(),
  metode           text not null check (metode in ('tunai','transfer','lainnya')),
  -- dicatat_oleh: FK ke users.id BELUM diaktifkan, pola sama seperti
  -- input_oleh/dicatat_oleh di modul Nilai/Kehadiran -- menunggu
  -- tabel users.
  dicatat_oleh     uuid,
  created_at       timestamptz not null default now()
);

comment on column public.spp_pembayaran.tagihan_id is
  'ON DELETE RESTRICT -- pilihan saya (belum dikonfirmasi pengguna) supaya tagihan yang sudah punya pembayaran tidak bisa terhapus diam-diam. Beda dari pola CASCADE di FK santri_id tabel lain.';

comment on column public.spp_pembayaran.dicatat_oleh is
  'FK ke users.id BELUM diaktifkan -- tabel users belum dimigrasikan.';

-- --------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------
create index if not exists idx_spp_tagihan_santri_status
  on public.spp_tagihan (santri_id, status);
create index if not exists idx_spp_tagihan_periode
  on public.spp_tagihan (periode);
create index if not exists idx_spp_pembayaran_tagihan_id
  on public.spp_pembayaran (tagihan_id);

-- --------------------------------------------------------------
-- Row Level Security
--
-- Sama seperti schema_001/002/004: rangka awal/placeholder. Policy
-- untuk keuangan_spp (CRUD penuh -- ini role utamanya) dan wali
-- (SELECT tagihan+pembayaran hanya untuk santri miliknya) BELUM bisa
-- ditulis benar tanpa tabel users -- ditandai TODO eksplisit.
-- --------------------------------------------------------------
alter table public.spp_tagihan enable row level security;
alter table public.spp_pembayaran enable row level security;

create policy admin_full_access_spp_tagihan on public.spp_tagihan
  for all using (auth.jwt() ->> 'role' = 'admin');

create policy admin_full_access_spp_pembayaran on public.spp_pembayaran
  for all using (auth.jwt() ->> 'role' = 'admin');

-- TODO (menunggu tabel users + auth):
-- - keuangan_spp: CRUD penuh spp_tagihan + spp_pembayaran
-- - wali: SELECT spp_tagihan + spp_pembayaran hanya untuk santri
--   yang terhubung via santri_wali
