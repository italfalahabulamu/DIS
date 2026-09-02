-- ============================================================
-- schema_013_pelanggaran_model_b_akumulasi.sql
-- Modul: Pelanggaran -- Model B poin akumulatif (Tahap 14)
--
-- Menjawab instruksi eksplisit 2026-09-02: "gunakan model B yang
-- dapat dimodifikasi di setting sistem".
--
-- KONSEP: setiap baris `pelanggaran` (schema_009) TETAP punya
-- `kategori`+`poin` sendiri (snapshot dari jenis_pelanggaran saat
-- dicatat -- itu levelnya KEJADIAN ini sendiri, tidak berubah).
-- YANG BARU di sini adalah STATUS AKUMULASI per santri: dihitung
-- dari TOTAL poin seluruh pelanggaran santri itu, dibandingkan
-- terhadap ambang batas yang BISA DIUBAH lewat "pengaturan sistem"
-- (tabel `pengaturan_ambang_pelanggaran` di bawah) -- BUKAN angka
-- hardcode di kode aplikasi atau migrasi.
--
-- Contoh konkret: santri A pernah dapat 2 pelanggaran ringan
-- (masing2 kategori teguran_lisan, 5 poin) -- total 10 poin. Kalau
-- admin mengatur ambang sp1 = 10 poin di pengaturan sistem, status
-- akumulasi santri A otomatis jadi 'sp1' walau tidak ada satupun
-- pelanggaran individunya yang berkategori sp1 -- itulah bedanya
-- dari Model A (gradasi tetap per-kejadian).
--
-- SENGAJA TIDAK DIISI dengan angka ambang batas contoh -- sama
-- prinsip dengan jenis_pelanggaran (schema_009): angka ambang batas
-- adalah kebijakan tata tertib pesantren yang harus diisi oleh
-- pengguna via aplikasi ("setting sistem"), bukan dikarang di sini.
-- Tabel dibuat KOSONG; fungsi di bawah menangani kasus "belum ada
-- pengaturan" dengan mengembalikan NULL, bukan error atau tebakan.
--
-- ASUMSI BELUM DIKONFIRMASI (di luar cakupan instruksi ini, dicatat
-- supaya tidak hilang): akumulasi di bawah bersifat ALL-TIME (semua
-- pelanggaran santri sepanjang masa dijumlahkan), TIDAK direset per
-- semester/tahun ajaran, karena `pelanggaran` (schema_009) tidak
-- punya kolom tahun_ajaran/semester. Kalau kebijakan pesantren
-- adalah "poin direset tiap tahun ajaran baru", ini perlu revisi
-- struktur tambahan (kolom tahun_ajaran di pelanggaran + filter di
-- view/fungsi di bawah) -- BELUM dikerjakan, perlu konfirmasi dulu.
-- ============================================================

-- --------------------------------------------------------------
-- Tabel: pengaturan_ambang_pelanggaran ("setting sistem" untuk
-- Model B -- admin bisa ubah angka ini lewat UI aplikasi tanpa
-- perlu migrasi SQL baru setiap kali kebijakan berubah)
-- --------------------------------------------------------------
create table if not exists public.pengaturan_ambang_pelanggaran (
  id                     uuid primary key default gen_random_uuid(),
  kategori               text not null unique
                           check (kategori in ('teguran_lisan','teguran_tertulis','sp1','sp2','sp3')),
  ambang_poin_minimum    integer not null check (ambang_poin_minimum >= 0),
  keterangan             text,
  updated_at             timestamptz not null default now(),
  -- diubah_oleh: FK ke users.id BELUM diaktifkan.
  diubah_oleh            uuid
);

comment on table public.pengaturan_ambang_pelanggaran is
  'Pengaturan sistem (dapat diubah admin via UI aplikasi) -- ambang batas total poin akumulatif untuk tiap tingkat status disiplin. SENGAJA KOSONG saat migrasi dibuat -- angka ambang batas adalah kebijakan pesantren yang harus diisi pengguna, tidak dikarang di sini. Selama tabel ini kosong, hitung_status_akumulasi_pelanggaran() mengembalikan NULL untuk semua santri (belum ada aturan yang bisa dipakai).';

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_pengaturan_ambang_set_updated_at on public.pengaturan_ambang_pelanggaran;
create trigger trg_pengaturan_ambang_set_updated_at
  before update on public.pengaturan_ambang_pelanggaran
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------
-- Fungsi: hitung status akumulasi dari total poin, berdasarkan
-- ambang batas TERKINI di pengaturan_ambang_pelanggaran (bukan
-- hardcode). Mengembalikan kategori TERTINGGI yang ambangnya
-- terlampaui, atau NULL kalau belum ada pengaturan / poin di bawah
-- semua ambang.
-- --------------------------------------------------------------
create or replace function public.hitung_status_akumulasi_pelanggaran(p_total_poin integer)
returns text as $$
  select kategori
  from public.pengaturan_ambang_pelanggaran
  where ambang_poin_minimum <= p_total_poin
  order by ambang_poin_minimum desc
  limit 1;
$$ language sql stable;

comment on function public.hitung_status_akumulasi_pelanggaran(integer) is
  'Model B: mengembalikan kategori status disiplin tertinggi yang tercapai berdasarkan total poin, dibaca dari pengaturan_ambang_pelanggaran (dapat diubah admin, TIDAK hardcode). NULL kalau pengaturan belum diisi atau poin di bawah semua ambang.';

-- --------------------------------------------------------------
-- View: akumulasi poin + status per santri, dihitung LANGSUNG dari
-- data pelanggaran + pengaturan terkini -- bukan kolom tersimpan
-- yang bisa basi (stale). Setiap kali pengaturan ambang diubah atau
-- pelanggaran baru ditambah, view ini otomatis mencerminkan hasil
-- terbaru tanpa perlu migrasi/trigger tambahan.
-- --------------------------------------------------------------
create or replace view public.v_akumulasi_poin_santri as
select
  s.id as santri_id,
  s.nis,
  s.nama_lengkap,
  coalesce(sum(p.poin), 0) as total_poin,
  public.hitung_status_akumulasi_pelanggaran(coalesce(sum(p.poin), 0)::integer) as status_akumulasi
from public.santri s
left join public.pelanggaran p on p.santri_id = s.id
group by s.id, s.nis, s.nama_lengkap;

comment on view public.v_akumulasi_poin_santri is
  'Model B: total poin pelanggaran per santri (ALL-TIME, belum ada logika reset per tahun ajaran -- lihat catatan Assumption di header migrasi ini) + status akumulasi hasil hitung_status_akumulasi_pelanggaran(). Dihitung real-time dari data terkini, bukan kolom cache yang bisa basi.';

-- --------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------
alter table public.pengaturan_ambang_pelanggaran enable row level security;

create policy admin_full_access_pengaturan_ambang on public.pengaturan_ambang_pelanggaran
  for all using (auth.jwt() ->> 'role' = 'admin');

-- Catatan: RLS pada view v_akumulasi_poin_santri mengikuti RLS tabel
-- dasarnya (santri, pelanggaran) secara otomatis di Postgres --
-- tidak perlu policy terpisah untuk view ini.

-- TODO (menunggu tabel users + auth):
-- - hanya admin yang boleh mengubah pengaturan_ambang_pelanggaran
--   (SELECT boleh lebih luas -- ustadz/wali mungkin perlu lihat
--   ambang batas yang berlaku, tapi TIDAK boleh mengubahnya)
