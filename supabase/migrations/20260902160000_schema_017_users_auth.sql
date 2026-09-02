-- ============================================================
-- schema_017_users_auth.sql
-- Modul: users + auth DIS (Tahap 19)
--
-- Blocker untuk hampir semua RLS placeholder di schema_001-016.
-- Mengikuti POLA STANDAR Supabase Auth: akun login sungguhan (email,
-- password, dst) dikelola Supabase di skema `auth.users` (di luar
-- kendali migrasi ini) -- `public.users` di bawah adalah tabel PROFIL
-- APLIKASI, 1:1 dengan auth.users lewat FK id yang SAMA persis.
--
-- users DIS ini TERPISAH dari users/auth di dataku2026 (HRIS) --
-- dua project Supabase berbeda, dua populasi akun berbeda. Ustadz
-- yang jadi "pelapor" lewat pegawai_hris_referensi (schema_014)
-- TIDAK otomatis punya akun login DIS -- itu 2 hal berbeda (jadi
-- SUMBER data pelapor vs BISA LOGIN ke DIS), sudah disebutkan di
-- TODO schema_009 sebelumnya, dipertegas lagi di sini.
-- ============================================================

-- --------------------------------------------------------------
-- Tabel: users (profil aplikasi, 1:1 dengan auth.users)
-- --------------------------------------------------------------
create table if not exists public.users (
  -- id: SAMA dengan auth.users.id -- BUKAN uuid baru yang di-generate
  -- sendiri. Baris di sini dibuat lewat trigger saat akun auth.users
  -- baru dibuat (lihat trigger di bawah), bukan insert manual biasa.
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  role          text not null check (role in ('admin','ustadz','keuangan_spp','wali')),
  nama_lengkap  text not null,
  -- wali_id: WAJIB diisi kalau role='wali', WAJIB NULL kalau bukan --
  -- dijaga CHECK constraint di bawah, bukan cuma konvensi aplikasi.
  wali_id       uuid references public.wali(id) on delete restrict,
  created_at    timestamptz not null default now(),

  check (
    (role = 'wali' and wali_id is not null) or
    (role != 'wali' and wali_id is null)
  )
);

comment on table public.users is
  'Profil aplikasi DIS, 1:1 dengan auth.users (Supabase Auth). TERPISAH dari users/auth di dataku2026 (HRIS) -- dua project, dua populasi akun berbeda. Pegawai HRIS yang jadi pelapor pelanggaran (pegawai_hris_referensi, schema_014) TIDAK otomatis dapat akun login DIS.';

comment on column public.users.wali_id is
  'WAJIB diisi kalau role=''wali'' (satu akun wali = satu baris wali.id), WAJIB NULL kalau bukan -- dijaga CHECK constraint level-database. ON DELETE RESTRICT ke wali.id -- konsisten kebijakan RESTRICT universal (schema_012): tidak boleh diam-diam kehilangan tautan akun kalau data wali dihapus.';

create index if not exists idx_users_role     on public.users (role);
create index if not exists idx_users_wali_id  on public.users (wali_id) where wali_id is not null;

-- --------------------------------------------------------------
-- Trigger: buat baris public.users otomatis saat akun auth.users
-- baru dibuat -- pola standar Supabase Auth.
--
-- BELUM DIPUTUSKAN (di luar cakupan migrasi ini): role apa yang
-- diberikan ke akun baru secara default, dan alur pendaftaran akun
-- DIS itu sendiri (siapa yang boleh membuat akun -- admin invite?
-- self-signup dengan approval? khusus wali lewat token undangan
-- terkait santri?). Trigger di bawah SENGAJA mengambil role dari
-- raw_user_meta_data (harus disuplai aplikasi saat signUp) TANPA
-- default -- kalau tidak disuplai, insert akan GAGAL (NOT NULL
-- check role) -- ini disengaja supaya tidak ada akun "tanpa role"
-- yang lolos diam-diam, tapi berarti alur signup aplikasi WAJIB
-- mengirim role saat itu, belum ada spesifikasinya.
-- --------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger as $$
begin
  insert into public.users (id, email, role, nama_lengkap, wali_id)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'role',
    coalesce(new.raw_user_meta_data ->> 'nama_lengkap', new.email),
    nullif(new.raw_user_meta_data ->> 'wali_id', '')::uuid
  );
  return new;
end;
$$ language plpgsql security definer;

comment on function public.handle_new_auth_user() is
  'Trigger: buat baris public.users otomatis saat auth.users baru dibuat. WAJIB raw_user_meta_data berisi role (dan wali_id kalau role=wali) saat signUp -- kalau tidak, insert GAGAL (disengaja, bukan bug). Alur signup aplikasi (siapa boleh buat akun apa) BELUM diputuskan -- di luar cakupan migrasi database.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- --------------------------------------------------------------
-- Fungsi helper -- dipakai di RLS policy seluruh tabel (menggantikan
-- placeholder auth.jwt() ->> 'role' yang dipakai di semua migrasi
-- sebelumnya). SECURITY DEFINER supaya bisa dipanggil dari policy
-- tabel lain tanpa masalah RLS berlapis pada tabel users itu sendiri.
-- --------------------------------------------------------------
create or replace function public.current_user_role()
returns text as $$
  select role from public.users where id = auth.uid();
$$ language sql stable security definer;

create or replace function public.current_user_wali_id()
returns uuid as $$
  select wali_id from public.users where id = auth.uid();
$$ language sql stable security definer;

create or replace function public.is_wali_of_santri(p_santri_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.santri_wali sw
    where sw.santri_id = p_santri_id
      and sw.wali_id = public.current_user_wali_id()
  );
$$ language sql stable security definer;

comment on function public.current_user_role() is
  'Ganti pola auth.jwt() ->> ''role'' placeholder yang dipakai di semua policy sebelumnya -- baca role SUNGGUHAN dari public.users berdasarkan auth.uid() (user yang sedang login).';

comment on function public.is_wali_of_santri(uuid) is
  'True kalau user yang sedang login adalah wali (role=wali) DAN terhubung ke santri_id yang diberikan lewat santri_wali. Dipakai policy SELECT wali di semua tabel modul (nilai, kehadiran, dst).';

-- --------------------------------------------------------------
-- Row Level Security -- users
-- --------------------------------------------------------------
alter table public.users enable row level security;

create policy admin_full_access_users on public.users
  for all using (public.current_user_role() = 'admin');

create policy user_read_own_profile on public.users
  for select using (id = auth.uid());

-- TODO: policy UPDATE untuk user mengubah profil sendiri (nama, dst)
-- -- BELUM ditulis, field apa yang boleh diubah sendiri (role/wali_id
-- jelas TIDAK boleh diubah user biasa) perlu keputusan terpisah.
