-- ============================================================
-- schema_024_fix_attribution_spoofing.sql
-- Perbaikan dari Security Audit (skill security-engineer, 2026-09-04)
--
-- TEMUAN S-02 (High): kolom "siapa yang mencatat/mengubah"
-- (dicatat_oleh/input_oleh/updated_oleh/diubah_oleh) di 9 tabel
-- SEMUANYA diisi dari nilai yang dikirim client (lihat
-- public/js/modules/*.js -- semua langsung .insert({..._oleh: X})
-- dari state aplikasi), TANPA ada RLS WITH CHECK atau trigger yang
-- memaksa nilainya = auth.uid() milik sesi yang sedang login.
--
-- DAMPAK: user mana pun yang punya akses INSERT/UPDATE ke tabel ini
-- (mis. wali ke kesehatan, ustadz ke nilai/kehadiran) bisa memalsukan
-- kolom atribusi lewat request langsung ke Supabase (bukan lewat UI
-- aplikasi) -- misalnya wali menimpa rekam kesehatan lalu mengisi
-- updated_oleh dengan id staf kesehatan, membuat log terlihat seolah
-- staf yang mengubah, padahal wali. Ini merusak integritas jejak
-- audit (ASVS V16 -- Security Logging), krusial untuk data sensitif
-- (kesehatan) dan data yang dipakai sebagai bukti (pelanggaran/nilai).
--
-- PERBAIKAN: trigger BEFORE INSERT OR UPDATE per kolom yang MEMAKSA
-- nilainya = auth.uid(), mengabaikan apa pun yang dikirim client.
-- Pola ini SENGAJA diterapkan lewat trigger (bukan hanya WITH CHECK),
-- supaya frontend tidak perlu lagi mengirim kolom ini sama sekali --
-- satu kelas bug (frontend lupa isi kolom) otomatis tertutup juga.
--
-- CAKUPAN: hanya kolom "siapa melakukan aksi tulis ini" (aktor =
-- auth.uid() pada saat itu juga). SENGAJA TIDAK termasuk:
-- - perizinan.disetujui_oleh -- diisi saat admin MENYETUJUI
--   pengajuan wali, bukan saat baris dibuat; auto-force di sini akan
--   salah kalau alur approval-nya beda (mis. dua tahap). Perlu
--   migrasi terpisah setelah alur approval final dikonfirmasi.
-- - pelanggaran.pelapor_dis_user_id -- ini "siapa yang MELAPORKAN",
--   bisa beda orang dari yang menginput (mis. admin menginput
--   laporan dari ustadz lain) -- memaksa = auth.uid() di sini akan
--   merusak use case transkripsi laporan pihak lain, CONFIRMED
--   berbeda semantik dari dicatat_oleh di tabel yang sama.
--
-- TEMUAN S-05 (Medium): wali_update_kesehatan (schema_019) hanya
-- punya USING, tidak ada WITH CHECK eksplisit. Postgres MEMANG
-- otomatis memakai USING sebagai WITH CHECK kalau tidak dituliskan
-- (bukan bug fungsional), tapi ini rawan disalahpahami saat migrasi
-- berikutnya ditulis orang/sesi lain -- dibuat eksplisit di sini.
-- ============================================================

-- --------------------------------------------------------------
-- Trigger generik: paksa satu kolom uuid = auth.uid() pada setiap
-- INSERT/UPDATE, mengabaikan nilai yang dikirim client. Nama kolom
-- diberikan lewat argumen trigger (TG_ARGV[0]) supaya satu fungsi
-- dipakai ulang untuk kolom bernama berbeda (dicatat_oleh,
-- input_oleh, dst) tanpa duplikasi fungsi per nama kolom.
-- --------------------------------------------------------------
create or replace function public.force_actor_column()
returns trigger as $$
declare
  col_name text := TG_ARGV[0];
begin
  new := jsonb_populate_record(new, jsonb_build_object(col_name, auth.uid()));
  return new;
end;
$$ language plpgsql security definer;

comment on function public.force_actor_column() is
  'Trigger generik: paksa kolom uuid (nama lewat TG_ARGV[0]) = auth.uid() sebelum insert/update, mengabaikan nilai dari client. Dipakai untuk menutup celah pemalsuan kolom atribusi (siapa mencatat/mengubah) -- lihat schema_024.';

-- --------------------------------------------------------------
-- Pasang trigger di setiap kolom atribusi "aktor menulis baris ini"
-- --------------------------------------------------------------
drop trigger if exists trg_force_kesehatan_updated_oleh on public.kesehatan;
create trigger trg_force_kesehatan_updated_oleh
  before insert or update on public.kesehatan
  for each row execute function public.force_actor_column('updated_oleh');

drop trigger if exists trg_force_kesehatan_riwayat_dicatat_oleh on public.kesehatan_riwayat;
create trigger trg_force_kesehatan_riwayat_dicatat_oleh
  before insert or update on public.kesehatan_riwayat
  for each row execute function public.force_actor_column('dicatat_oleh');

drop trigger if exists trg_force_nilai_input_oleh on public.nilai;
create trigger trg_force_nilai_input_oleh
  before insert or update on public.nilai
  for each row execute function public.force_actor_column('input_oleh');

drop trigger if exists trg_force_kehadiran_dicatat_oleh on public.kehadiran;
create trigger trg_force_kehadiran_dicatat_oleh
  before insert or update on public.kehadiran
  for each row execute function public.force_actor_column('dicatat_oleh');

drop trigger if exists trg_force_spp_pembayaran_dicatat_oleh on public.spp_pembayaran;
create trigger trg_force_spp_pembayaran_dicatat_oleh
  before insert or update on public.spp_pembayaran
  for each row execute function public.force_actor_column('dicatat_oleh');

drop trigger if exists trg_force_pelanggaran_dicatat_oleh on public.pelanggaran;
create trigger trg_force_pelanggaran_dicatat_oleh
  before insert or update on public.pelanggaran
  for each row execute function public.force_actor_column('dicatat_oleh');

drop trigger if exists trg_force_prestasi_dicatat_oleh on public.prestasi;
create trigger trg_force_prestasi_dicatat_oleh
  before insert or update on public.prestasi
  for each row execute function public.force_actor_column('dicatat_oleh');

drop trigger if exists trg_force_pengaturan_ambang_diubah_oleh on public.pengaturan_ambang_pelanggaran;
create trigger trg_force_pengaturan_ambang_diubah_oleh
  before insert or update on public.pengaturan_ambang_pelanggaran
  for each row execute function public.force_actor_column('diubah_oleh');

drop trigger if exists trg_force_catatan_perkembangan_dicatat_oleh on public.catatan_perkembangan;
create trigger trg_force_catatan_perkembangan_dicatat_oleh
  before insert or update on public.catatan_perkembangan
  for each row execute function public.force_actor_column('dicatat_oleh');

-- --------------------------------------------------------------
-- S-05: WITH CHECK eksplisit untuk wali_update_kesehatan (perilaku
-- tidak berubah -- USING dan WITH CHECK sekarang identik secara
-- eksplisit, bukan lagi implisit dari default Postgres).
-- --------------------------------------------------------------
drop policy if exists wali_update_kesehatan on public.kesehatan;
create policy wali_update_kesehatan on public.kesehatan
  for update
  using (public.is_wali_of_santri(santri_id))
  with check (public.is_wali_of_santri(santri_id));

-- --------------------------------------------------------------
-- PENTING UNTUK FRONTEND (belum dikerjakan di migrasi ini --
-- perubahan kode, bukan skema): setelah migrasi ini jalan, frontend
-- BOLEH TERUS mengirim kolom *_oleh seperti sekarang (trigger akan
-- menimpanya dengan auth.uid() yang benar, tidak error) -- TAPI
-- idealnya baris `dicatat_oleh: dicatatOleh` dkk di
-- public/js/modules/*.js dihapus/disederhanakan karena sudah tidak
-- perlu, supaya kode tidak menyiratkan client yang menentukan
-- atribusi. Tidak mendesak (tidak ada risiko keamanan kalau
-- dibiarkan, trigger sudah menutup celahnya), TODO pembersihan kode.
-- ============================================================
