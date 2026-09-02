-- ============================================================
-- schema_020_penugasan_ustadz.sql
-- Modul: Penugasan ustadz per kelas/mapel + RLS ustadz SUNGGUHAN (Tahap 22)
--
-- MENUTUP gap R1 dari Business Requirement Brief (2026-09-02):
-- sebelum migrasi ini, ustadz punya SELECT tanpa batas (bisa baca
-- nilai/kehadiran/pelanggaran/prestasi SEMUA kelas, bukan cuma yang
-- diampu) dan TIDAK PUNYA policy INSERT/UPDATE sama sekali (jadi
-- secara RLS ustadz sebenarnya tidak bisa input nilai/kehadiran --
-- read-all tapi write-none, dua-duanya salah untuk kebutuhan bisnis).
--
-- `musyrif` SENGAJA TIDAK dimasukkan di migrasi ini -- peran ini baru
-- disebut di percakapan 2026-09-02 tapi hak aksesnya belum
-- didefinisikan dan bertentangan dengan pembagian peran lama (Portal
-- Santri). Ditambahkan lewat migrasi terpisah setelah dikonfirmasi.
--
-- CATATAN SAMA SEPERTI schema_019: RLS di sini BELUM diuji terhadap
-- Postgres asli. WAJIB smoke-test sebelum production.
-- ============================================================

-- --------------------------------------------------------------
-- Tabel: penugasan_ustadz
--
-- mata_pelajaran_id NULLABLE:
--   - diisi -> ustadz diampu mapel spesifik itu di kelas tsb (dipakai
--     untuk scoping modul Nilai).
--   - NULL -> ustadz adalah wali kelas / pengampu umum kelas itu
--     (dipakai untuk scoping modul Kehadiran, yang tidak granular
--     per mapel).
-- Satu ustadz bisa punya banyak baris (banyak kelas, banyak mapel).
-- --------------------------------------------------------------
create table if not exists public.penugasan_ustadz (
  id                 uuid primary key default gen_random_uuid(),
  ustadz_id          uuid not null references public.users(id) on delete restrict,
  kelas_id           uuid not null references public.kelas(id) on delete restrict,
  mata_pelajaran_id  uuid references public.mata_pelajaran(id) on delete restrict,
  tahun_ajaran       text not null,
  created_at         timestamptz not null default now(),

  unique (ustadz_id, kelas_id, mata_pelajaran_id, tahun_ajaran)
);

comment on table public.penugasan_ustadz is
  'Penugasan ustadz per kelas (+ opsional per mapel) per tahun ajaran. Dasar scoping RLS ustadz di seluruh modul -- tanpa baris di sini, ustadz TIDAK punya akses baca/tulis ke kelas manapun (default deny, bukan default allow).';

comment on column public.penugasan_ustadz.mata_pelajaran_id is
  'NULL = penugasan wali kelas/umum (dipakai scoping Kehadiran). Diisi = penugasan mapel spesifik (dipakai scoping Nilai).';

comment on column public.penugasan_ustadz.ustadz_id is
  'FK ke users.id -- TIDAK di-enforce di level constraint bahwa role user tsb harus role=''ustadz'' (Postgres CHECK antar-tabel tidak bisa langsung), divalidasi lewat trigger di bawah.';

create index if not exists idx_penugasan_ustadz_ustadz_id on public.penugasan_ustadz (ustadz_id);
create index if not exists idx_penugasan_ustadz_kelas_id  on public.penugasan_ustadz (kelas_id);

-- --------------------------------------------------------------
-- Trigger: pastikan ustadz_id memang berrole 'ustadz' di public.users
-- --------------------------------------------------------------
create or replace function public.validasi_role_ustadz()
returns trigger as $$
begin
  if not exists (
    select 1 from public.users where id = new.ustadz_id and role = 'ustadz'
  ) then
    raise exception 'ustadz_id % bukan akun dengan role ustadz', new.ustadz_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_validasi_role_ustadz on public.penugasan_ustadz;
create trigger trg_validasi_role_ustadz
  before insert or update on public.penugasan_ustadz
  for each row execute function public.validasi_role_ustadz();

-- --------------------------------------------------------------
-- RLS: penugasan_ustadz sendiri -- admin kelola, ustadz baca milik sendiri
-- --------------------------------------------------------------
alter table public.penugasan_ustadz enable row level security;

create policy admin_full_access_penugasan_ustadz on public.penugasan_ustadz
  for all using (public.current_user_role() = 'admin');

create policy ustadz_select_own_penugasan on public.penugasan_ustadz
  for select using (ustadz_id = auth.uid());

-- --------------------------------------------------------------
-- Helper: apakah user saat ini ustadz yang diampu kelas (+ opsional
-- mapel) tertentu, di tahun ajaran tertentu.
-- --------------------------------------------------------------
create or replace function public.is_ustadz_pengampu(
  p_kelas_id uuid,
  p_mata_pelajaran_id uuid,
  p_tahun_ajaran text
) returns boolean as $$
  select exists (
    select 1 from public.penugasan_ustadz pu
    where pu.ustadz_id = auth.uid()
      and pu.kelas_id = p_kelas_id
      and pu.tahun_ajaran = p_tahun_ajaran
      and (pu.mata_pelajaran_id = p_mata_pelajaran_id or pu.mata_pelajaran_id is null)
  );
$$ language sql stable security definer;

-- Varian untuk Kehadiran: tidak peduli mapel, cukup ada baris
-- penugasan apa pun ke kelas itu (wali kelas ATAU pengampu mapel apa
-- pun dianggap boleh mencatat kehadiran kelasnya).
create or replace function public.is_ustadz_di_kelas(
  p_kelas_id uuid,
  p_tahun_ajaran text
) returns boolean as $$
  select exists (
    select 1 from public.penugasan_ustadz pu
    where pu.ustadz_id = auth.uid()
      and pu.kelas_id = p_kelas_id
      and pu.tahun_ajaran = p_tahun_ajaran
  );
$$ language sql stable security definer;

-- ================================================================
-- GANTI policy ustadz lama (SELECT tanpa batas) dengan yang di-scope
-- ================================================================

-- --- nilai (schema_004) ---
drop policy if exists ustadz_select_nilai on public.nilai;

create policy ustadz_select_nilai on public.nilai
  for select using (
    public.is_ustadz_pengampu(kelas_id, mata_pelajaran_id, tahun_ajaran)
  );

create policy ustadz_insert_nilai on public.nilai
  for insert with check (
    public.is_ustadz_pengampu(kelas_id, mata_pelajaran_id, tahun_ajaran)
  );

create policy ustadz_update_nilai on public.nilai
  for update using (
    public.is_ustadz_pengampu(kelas_id, mata_pelajaran_id, tahun_ajaran)
  );

-- --- kehadiran (schema_002) ---
drop policy if exists ustadz_select_kehadiran on public.kehadiran;

-- kehadiran tidak punya kolom tahun_ajaran langsung -- diturunkan dari
-- tanggal (asumsi: tahun ajaran = tahun kalender saat tanggal dicatat,
-- format sama dengan text tahun_ajaran modul lain, mis. '2026/2027').
-- INI ASUMSI, belum dikonfirmasi -- kalau format tahun_ajaran modul
-- lain berbeda pola (mis. genap/ganjil terpisah), fungsi ini perlu
-- direvisi. Ditandai eksplisit supaya tidak diam-diam salah.
create policy ustadz_select_kehadiran on public.kehadiran
  for select using (
    public.is_ustadz_di_kelas(kelas_id, extract(year from tanggal)::text || '/' || (extract(year from tanggal)::int + 1)::text)
    or public.is_ustadz_di_kelas(kelas_id, (extract(year from tanggal)::int - 1)::text || '/' || extract(year from tanggal)::text)
  );

create policy ustadz_insert_kehadiran on public.kehadiran
  for insert with check (
    public.is_ustadz_di_kelas(kelas_id, extract(year from tanggal)::text || '/' || (extract(year from tanggal)::int + 1)::text)
    or public.is_ustadz_di_kelas(kelas_id, (extract(year from tanggal)::int - 1)::text || '/' || extract(year from tanggal)::text)
  );

create policy ustadz_update_kehadiran on public.kehadiran
  for update using (
    public.is_ustadz_di_kelas(kelas_id, extract(year from tanggal)::text || '/' || (extract(year from tanggal)::int + 1)::text)
    or public.is_ustadz_di_kelas(kelas_id, (extract(year from tanggal)::int - 1)::text || '/' || extract(year from tanggal)::text)
  );

comment on policy ustadz_select_kehadiran on public.kehadiran is
  'Rumus tahun-ajaran-dari-tanggal ini TEBAKAN, bukan format yang dikonfirmasi -- perlu divalidasi terhadap format tahun_ajaran nyata yang dipakai modul Nilai/SPP sebelum production.';

-- --- pelanggaran, prestasi (schema_006/009) ---
-- Kedua tabel ini TIDAK punya kelas_id/tahun_ajaran langsung, hanya
-- santri_id -- discope lewat kelas AKTIF santri saat ini
-- (santri_kelas_riwayat, tanggal_selesai IS NULL). Ini berarti ustadz
-- bisa lapor pelanggaran/prestasi untuk santri di kelas yang diampu
-- SEKARANG, terlepas dari kelas santri saat kejadian tercatat --
-- batasan yang wajar untuk kasus ini (siapa yang paling mengenal
-- santri sekarang), tapi patut diketahui sebagai keputusan desain.
drop policy if exists ustadz_select_pelanggaran on public.pelanggaran;
drop policy if exists ustadz_select_prestasi on public.prestasi;

create policy ustadz_select_pelanggaran on public.pelanggaran
  for select using (
    exists (
      select 1 from public.santri_kelas_riwayat skr
      where skr.santri_id = pelanggaran.santri_id
        and skr.tanggal_selesai is null
        and exists (
          select 1 from public.penugasan_ustadz pu
          where pu.ustadz_id = auth.uid() and pu.kelas_id = skr.kelas_id
        )
    )
  );

create policy ustadz_insert_pelanggaran on public.pelanggaran
  for insert with check (
    exists (
      select 1 from public.santri_kelas_riwayat skr
      where skr.santri_id = pelanggaran.santri_id
        and skr.tanggal_selesai is null
        and exists (
          select 1 from public.penugasan_ustadz pu
          where pu.ustadz_id = auth.uid() and pu.kelas_id = skr.kelas_id
        )
    )
  );

create policy ustadz_select_prestasi on public.prestasi
  for select using (
    exists (
      select 1 from public.santri_kelas_riwayat skr
      where skr.santri_id = prestasi.santri_id
        and skr.tanggal_selesai is null
        and exists (
          select 1 from public.penugasan_ustadz pu
          where pu.ustadz_id = auth.uid() and pu.kelas_id = skr.kelas_id
        )
    )
  );

create policy ustadz_insert_prestasi on public.prestasi
  for insert with check (
    exists (
      select 1 from public.santri_kelas_riwayat skr
      where skr.santri_id = prestasi.santri_id
        and skr.tanggal_selesai is null
        and exists (
          select 1 from public.penugasan_ustadz pu
          where pu.ustadz_id = auth.uid() and pu.kelas_id = skr.kelas_id
        )
    )
  );

-- --- santri (schema_001) -- baca-saja, dibatasi ke santri di kelas
-- yang diampu, menggantikan select-semua sebelumnya ---
drop policy if exists ustadz_select_santri on public.santri;

create policy ustadz_select_santri on public.santri
  for select using (
    exists (
      select 1 from public.santri_kelas_riwayat skr
      where skr.santri_id = santri.id
        and skr.tanggal_selesai is null
        and exists (
          select 1 from public.penugasan_ustadz pu
          where pu.ustadz_id = auth.uid() and pu.kelas_id = skr.kelas_id
        )
    )
  );
