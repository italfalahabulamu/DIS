# Sinkronisasi Pegawai HRIS → DIS

Job ini mengisi tabel `pegawai_hris_referensi` (schema_014) di project
**DIS** dengan salinan data pegawai dari project **dataku2026** (HRIS),
supaya `pelanggaran.pelapor_hris_employee_id` (schema_015) bisa punya
foreign key yang benar-benar tervalidasi.

**Status: KODE DITULIS, BELUM DIDEPLOY, BELUM DIVERIFIKASI.** Bagian
ini di luar kemampuan sandbox Claude (tidak ada akses Dashboard
Supabase, tidak ada akses network ke `*.supabase.co`) — **wajib
dikerjakan tim Supabase**, sama seperti 3 kategori tugas yang selalu
perlu eksekusi manual di proyek dataku2026 (migrasi SQL, deploy Edge
Function, setup Cron Trigger).

## Sebelum deploy — WAJIB diverifikasi dulu

`index.ts` menandai eksplisit bagian mana yang **tebakan**, bukan fakta
terverifikasi:

1. **Nama tabel & kolom sumber di dataku2026** (`SUMBER_TABEL`,
   `SUMBER_KOLOM_*` di `index.ts`) — saya tebak dari field yang
   terlihat di dashboard HRIS ("ID pegawai", "Unit kerja", dst), BUKAN
   dari skema Postgres asli. Cek `public/js/modules/
   supabaseDataService.js` di repo `dataku2026`, atau langsung ke
   Supabase Dashboard project `sjpsexkdllnlxbvnnypk`, untuk nama tabel
   dan kolom yang benar sebelum deploy.
2. **Tipe kolom status pegawai** — kode menebak boolean/`'aktif'`, bisa
   saja beda di data asli.
3. **Apakah tabel sumber bisa diakses langsung via `service_role` key
   lintas project** — ini asumsi teknis (PostgREST via REST API
   mendukung ini dengan service role key project HRIS), belum
   diverifikasi terhadap konfigurasi RLS/keamanan dataku2026 yang
   sebenarnya.

## Setup (tim Supabase)

1. **Deploy function** ke project DIS:
   ```
   supabase functions deploy sync-pegawai-hris --project-ref <ref-project-DIS>
   ```
2. **Set secrets** (kredensial LINTAS project — project dataku2026,
   bukan DIS):
   ```
   supabase secrets set HRIS_SUPABASE_URL=https://sjpsexkdllnlxbvnnypk.supabase.co --project-ref <ref-project-DIS>
   supabase secrets set HRIS_SERVICE_ROLE_KEY=<service-role-key-project-dataku2026> --project-ref <ref-project-DIS>
   ```
   `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` (untuk project DIS
   sendiri) sudah otomatis tersedia di runtime Edge Function, tidak
   perlu diset manual.

   **Catatan keamanan:** `HRIS_SERVICE_ROLE_KEY` adalah kunci dengan
   akses penuh (bypass RLS) ke project dataku2026 — memberikan kunci
   ini ke project DIS berarti DIS punya akses baca penuh ke seluruh
   database HRIS, bukan cuma tabel pegawai. Kalau ini dianggap risiko
   berlebihan, pertimbangkan alternatif: buat Postgres role terbatas
   di dataku2026 yang HANYA bisa SELECT kolom-kolom yang dibutuhkan,
   lalu buat API key/JWT khusus role itu — TIDAK saya buat di sesi ini
   karena itu perubahan di sisi dataku2026, bukan DIS.

3. **Setup Cron Trigger** via Supabase Dashboard project DIS
   (Database → Cron Jobs, atau `pg_cron` kalau tersedia):
   ```sql
   select cron.schedule(
     'sync-pegawai-hris-harian',
     '0 3 * * *',  -- setiap hari jam 03:00 -- FREKUENSI INI TEBAKAN,
                    -- sesuaikan kebutuhan (data pegawai HRIS jarang
                    -- berubah, harian kemungkinan cukup)
     $$
     select net.http_post(
       url := '<url-function-sync-pegawai-hris>',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || '<service-role-key-project-DIS>',
         'Content-Type', 'application/json'
       )
     );
     $$
   );
   ```

4. **Verifikasi manual pertama kali** (jangan langsung percaya Cron
   jalan benar): panggil endpoint function secara manual, cek response
   `{"status":"ok","ditarik":N,"diupsert":N}`, lalu cek isi tabel
   `pegawai_hris_referensi` di DIS.

## Belum diputuskan (di luar cakupan kode ini)

- **Pegawai yang hilang dari sumber** (resign, dan query tidak lagi
  mengembalikannya): kode saat ini **tidak mengubah apa pun** pada
  baris lama yang tidak muncul lagi — `status_aktif` lama tetap
  tersimpan apa adanya, bisa jadi basi (pegawai sudah resign tapi
  `status_aktif` masih `true` di replika). Idealnya butuh logika
  tambahan: bandingkan daftar ID yang ditarik vs yang ada di replika,
  set `status_aktif = false` untuk yang hilang — **belum
  diimplementasikan**, perlu keputusan (apakah dataku2026 memang tidak
  pernah menghapus/menonaktifkan pegawai keluar dari query, atau perlu
  penanganan eksplisit).
- **Monitoring kegagalan job**: function ini mengembalikan HTTP 500
  saat gagal (supaya terdeteksi), TAPI proyek dataku2026 sendiri
  punya catatan "tidak ada monitoring/alerting untuk Edge Function
  error" sebagai risiko yang belum ditutup — kalau pola itu belum
  diperbaiki di dataku2026, kemungkinan besar job sinkronisasi ini
  juga akan gagal diam-diam tanpa terdeteksi kalau tidak ada alerting
  terpisah yang disiapkan.
- **Ketergantungan pada bug `get_team_contacts()`**: kode ini SENGAJA
  tidak memakai RPC itu (lihat catatan di `index.ts`) supaya tidak
  ikut terdampak bug `42702` yang sedang aktif — tapi ini berarti kode
  ini query tabel dasar langsung, yang mungkin butuh izin RLS/role
  berbeda dari yang diasumsikan RPC tersebut. Perlu dicek ulang begitu
  `schema_89b` (fix `get_team_contacts()`) selesai dieksekusi — apakah
  lebih baik pindah ke RPC itu nanti untuk konsistensi logika bisnis.
