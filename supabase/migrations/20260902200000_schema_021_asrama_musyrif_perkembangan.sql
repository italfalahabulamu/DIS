-- ============================================================
-- schema_021_asrama_musyrif_perkembangan.sql
-- Modul: Asrama + role musyrif + Catatan Perkembangan (Tahap 23)
--
-- Menjawab 2 keputusan 2026-09-02:
-- 1. Musyrif = kepengasuhan/asrama (BUKAN Musyrif Qur'an Portal
--    Santri) -- peran baru, sumbu penugasan ASRAMA, bukan kelas.
-- 2. Santri BISA pindah asrama sewaktu-waktu dalam tahun berjalan,
--    perlu riwayat detail -- pola sama persis dengan
--    santri_kelas_riwayat (schema_002), termasuk exclude constraint
--    anti-tumpang-tindih.
--
-- INTERPRETASI YANG PERLU DIKONFIRMASI, bukan fakta pasti:
-- Jawaban Anda soal akses Kesehatan musyrif ("musyrif boleh mengisi
-- informasi perkembangan wali") saya baca sebagai: musyrif TIDAK
-- diberi akses ke tabel `kesehatan`/`kesehatan_riwayat` klinis (tetap
-- admin+wali saja seperti sebelumnya, TIDAK DIUBAH di migrasi ini) --
-- melainkan musyrif butuh kanal TERPISAH untuk mencatat perkembangan
-- umum santri (bukan data medis) yang bisa dipantau wali. Kalau
-- maksud Anda sebenarnya musyrif MEMANG perlu baca/tulis data medis
-- klinis juga, ini keliru dan perlu migrasi tambahan -- jangan
-- dianggap sudah benar tanpa dicek.
-- ============================================================

-- --------------------------------------------------------------
-- Role musyrif: perluas CHECK constraint users.role
-- --------------------------------------------------------------
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('admin','ustadz','keuangan_spp','wali','musyrif'));

-- --------------------------------------------------------------
-- Tabel: asrama
-- --------------------------------------------------------------
create table if not exists public.asrama (
  id          uuid primary key default gen_random_uuid(),
  nama        text not null unique,
  kapasitas   integer check (kapasitas > 0),
  created_at  timestamptz not null default now()
);

comment on column public.asrama.kapasitas is
  'NULLABLE -- kapasitas maksimum belum tentu relevan/diketahui saat migrasi ditulis, diisi nanti kalau pesantren perlu validasi over-kapasitas.';

-- --------------------------------------------------------------
-- Tabel: santri_asrama_riwayat -- pola identik santri_kelas_riwayat
-- (schema_002): tanggal_selesai NULL = penempatan aktif, exclude
-- constraint mencegah dua penempatan aktif tumpang tindih untuk
-- santri yang sama.
-- --------------------------------------------------------------
create extension if not exists btree_gist;

create table if not exists public.santri_asrama_riwayat (
  id               uuid primary key default gen_random_uuid(),
  santri_id        uuid not null references public.santri(id) on delete cascade,
  asrama_id        uuid not null references public.asrama(id) on delete restrict,
  tahun_ajaran     text not null,
  tanggal_mulai    date not null,
  tanggal_selesai  date,  -- NULL = penempatan masih aktif
  created_at       timestamptz not null default now(),

  check (tanggal_selesai is null or tanggal_selesai >= tanggal_mulai),

  exclude using gist (
    santri_id with =,
    daterange(tanggal_mulai, coalesce(tanggal_selesai, 'infinity'::date), '[]') with &&
  )
);

comment on table public.santri_asrama_riwayat is
  'Riwayat penempatan asrama per santri per periode, mendukung pindah asrama sewaktu-waktu dalam tahun berjalan (CONFIRMED 2026-09-02). tanggal_selesai NULL = masih di asrama ini saat ini.';

create index if not exists idx_santri_asrama_riwayat_santri_id on public.santri_asrama_riwayat (santri_id);
create index if not exists idx_santri_asrama_riwayat_asrama_id on public.santri_asrama_riwayat (asrama_id);

-- --------------------------------------------------------------
-- Tabel: penugasan_musyrif -- pola identik penugasan_ustadz
-- (schema_020), sumbu asrama bukan kelas.
-- --------------------------------------------------------------
create table if not exists public.penugasan_musyrif (
  id            uuid primary key default gen_random_uuid(),
  musyrif_id    uuid not null references public.users(id) on delete restrict,
  asrama_id     uuid not null references public.asrama(id) on delete restrict,
  tahun_ajaran  text not null,
  created_at    timestamptz not null default now(),

  unique (musyrif_id, asrama_id, tahun_ajaran)
);

create or replace function public.validasi_role_musyrif()
returns trigger as $$
begin
  if not exists (
    select 1 from public.users where id = new.musyrif_id and role = 'musyrif'
  ) then
    raise exception 'musyrif_id % bukan akun dengan role musyrif', new.musyrif_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_validasi_role_musyrif on public.penugasan_musyrif;
create trigger trg_validasi_role_musyrif
  before insert or update on public.penugasan_musyrif
  for each row execute function public.validasi_role_musyrif();

create index if not exists idx_penugasan_musyrif_musyrif_id on public.penugasan_musyrif (musyrif_id);

-- --------------------------------------------------------------
-- Tabel: catatan_perkembangan -- KANAL BARU, bukan modul Kesehatan.
-- Tempat ustadz/musyrif mencatat perkembangan umum santri (akademik,
-- perilaku, kepengasuhan, dst -- non-medis) yang bisa dipantau wali
-- secara realtime (menjawab problem statement inti: "guru/ustadz/
-- musyrif dapat mengupdate semua perkembangan santri, orang tua
-- dapat memantau secara realtime").
--
-- "realtime" DI SINI = data selalu up-to-date saat wali membuka
-- halaman (query biasa). BUKAN push notification/WebSocket --
-- definisi teknis "realtime" belum dikonfirmasi eksplisit (lihat BRB
-- v0.2), ini asumsi paling sederhana yang saya pilih sampai
-- dikoreksi. Kalau yang dimaksud adalah push notification sungguhan,
-- perlu Supabase Realtime channel + kerja frontend tambahan yang
-- signifikan, belum tercakup di sini.
-- --------------------------------------------------------------
create table if not exists public.catatan_perkembangan (
  id             uuid primary key default gen_random_uuid(),
  santri_id      uuid not null references public.santri(id) on delete cascade,
  dicatat_oleh   uuid not null references public.users(id) on delete restrict,
  tanggal        date not null default current_date,
  kategori       text not null
                   check (kategori in ('akademik','ibadah','perilaku','kepengasuhan','kesehatan_umum','lainnya')),
  isi            text not null,
  created_at     timestamptz not null default now()
);

comment on table public.catatan_perkembangan is
  'Log perkembangan santri non-medis, diisi ustadz (kelas yang diampu) atau musyrif (asrama yang diampu), dibaca wali. TERPISAH dari kesehatan/kesehatan_riwayat (data klinis, tetap admin+wali saja, TIDAK diubah migrasi ini).';

comment on column public.catatan_perkembangan.kategori is
  'kesehatan_umum di sini = observasi non-klinis (mis. "kelihatan kurang fit hari ini"), BUKAN pengganti modul Kesehatan klinis -- penamaan berpotensi rancu, perlu diperjelas ke pengguna aplikasi supaya tidak dikira data medis resmi.';

create index if not exists idx_catatan_perkembangan_santri_id on public.catatan_perkembangan (santri_id);
create index if not exists idx_catatan_perkembangan_tanggal on public.catatan_perkembangan (tanggal);

-- --------------------------------------------------------------
-- RLS: asrama, santri_asrama_riwayat, penugasan_musyrif,
-- catatan_perkembangan
-- --------------------------------------------------------------
alter table public.asrama enable row level security;
alter table public.santri_asrama_riwayat enable row level security;
alter table public.penugasan_musyrif enable row level security;
alter table public.catatan_perkembangan enable row level security;

create policy admin_full_access_asrama on public.asrama
  for all using (public.current_user_role() = 'admin');
create policy admin_full_access_santri_asrama_riwayat on public.santri_asrama_riwayat
  for all using (public.current_user_role() = 'admin');
create policy admin_full_access_penugasan_musyrif on public.penugasan_musyrif
  for all using (public.current_user_role() = 'admin');
create policy admin_full_access_catatan_perkembangan on public.catatan_perkembangan
  for all using (public.current_user_role() = 'admin');

-- semua role login boleh lihat daftar asrama (perlu untuk dropdown UI dst)
create policy semua_role_select_asrama on public.asrama
  for select using (public.current_user_role() is not null);

create policy musyrif_select_own_penugasan on public.penugasan_musyrif
  for select using (musyrif_id = auth.uid());

-- wali: lihat riwayat asrama & catatan perkembangan anaknya sendiri
create policy wali_select_santri_asrama_riwayat on public.santri_asrama_riwayat
  for select using (public.is_wali_of_santri(santri_id));

create policy wali_select_catatan_perkembangan on public.catatan_perkembangan
  for select using (public.is_wali_of_santri(santri_id));

-- Helper: apakah user saat ini musyrif yang mengampu asrama tsb pada
-- tahun ajaran tsb (dicek lewat penempatan aktif santri).
create or replace function public.is_musyrif_pengasuh_santri(p_santri_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.santri_asrama_riwayat sar
    join public.penugasan_musyrif pm on pm.asrama_id = sar.asrama_id
    where sar.santri_id = p_santri_id
      and sar.tanggal_selesai is null
      and pm.musyrif_id = auth.uid()
  );
$$ language sql stable security definer;

-- musyrif: baca riwayat asrama & catatan perkembangan santri di
-- asrama yang diampu, tulis catatan perkembangan
create policy musyrif_select_santri_asrama_riwayat on public.santri_asrama_riwayat
  for select using (public.is_musyrif_pengasuh_santri(santri_id));

create policy musyrif_select_catatan_perkembangan on public.catatan_perkembangan
  for select using (public.is_musyrif_pengasuh_santri(santri_id));

create policy musyrif_insert_catatan_perkembangan on public.catatan_perkembangan
  for insert with check (
    dicatat_oleh = auth.uid()
    and public.is_musyrif_pengasuh_santri(santri_id)
  );

-- ustadz: baca & tulis catatan perkembangan santri di kelas yang
-- diampu (pola sama seperti pelanggaran/prestasi di schema_020)
create policy ustadz_select_catatan_perkembangan on public.catatan_perkembangan
  for select using (
    exists (
      select 1 from public.santri_kelas_riwayat skr
      where skr.santri_id = catatan_perkembangan.santri_id
        and skr.tanggal_selesai is null
        and exists (
          select 1 from public.penugasan_ustadz pu
          where pu.ustadz_id = auth.uid() and pu.kelas_id = skr.kelas_id
        )
    )
  );

create policy ustadz_insert_catatan_perkembangan on public.catatan_perkembangan
  for insert with check (
    dicatat_oleh = auth.uid()
    and exists (
      select 1 from public.santri_kelas_riwayat skr
      where skr.santri_id = catatan_perkembangan.santri_id
        and skr.tanggal_selesai is null
        and exists (
          select 1 from public.penugasan_ustadz pu
          where pu.ustadz_id = auth.uid() and pu.kelas_id = skr.kelas_id
        )
    )
  );
