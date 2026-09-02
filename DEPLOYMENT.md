# Deployment — HRIS Al-Falah

Dokumen ini asumsi Anda memutuskan: **frontend di Cloudflare (lewat
Workers Builds/Wrangler — lihat catatan di bagian 3 soal ini berbeda
dari "Cloudflare Pages" klasik), backend di Supabase Cloud (Pro plan
direkomendasikan, lihat catatan biaya di bawah)**. Kalau keputusan platform belum final, baca dulu
diskusi di riwayat percakapan sebelum mengikuti langkah ini.

**Update Agustus 2026:** sejak koneksi Supabase MCP tersedia di sesi
kerja, Claude BISA menjalankan migration SQL dan men-deploy Edge
Function langsung ke project "Dataku2026" (project_id
`sjpsexkdllnlxbvnnypk`) tanpa perlu Anda menjalankan manual — sudah
dipakai untuk `schema_23`, `schema_24`, dan deploy `register-employee`.
Cloudflare (frontend) TETAP perlu langkah manual Anda — tidak ada
koneksi MCP ke Cloudflare di sesi-sesi tersebut. Kalau di sesi Anda
sekarang tidak ada tool Supabase yang tersedia, anggap paragraf di
bawah ini (versi lama) berlaku:

~~**Saya (Claude) tidak bisa mengeksekusi langkah-langkah di bawah untuk
Anda** — environment saya tidak punya akses jaringan ke
supabase.com/cloudflare.com dan tidak punya kredensial akun Anda. Semua
langkah ini perlu dijalankan manual oleh Anda (atau siapa pun yang pegang
akses akun Cloudflare/Supabase organisasi Anda).~~

---

## 0. Prasyarat sekali jalan

- [ ] Repo GitHub ini **di-private-kan** kalau belum (Settings > General
      > Danger Zone > Change visibility). Repo ini memuat skema RLS dan
      logic permission — bukan data pegawai, tapi cetak biru keamanan
      sistem yang sebaiknya tidak publik untuk institusi sungguhan.
- [ ] Anda punya akun Cloudflare dan akun Supabase.
- [ ] Domain (kalau sudah punya domain institusi, mis. `hris.alfalah...`)
      — kalau belum, Cloudflare tetap kasih subdomain gratis
      `*.workers.dev` sebagai awal (lihat contoh URL di bagian 3).

## 1. Siapkan project Supabase

> **Status per commit terbaru:** project Supabase **"Dataku2026" sudah
> dibuat**, dan **schema 01-14 sudah dijalankan** ke project ini
> (project_id `sjpsexkdllnlxbvnnypk`), termasuk:
> - `schema_04`/`schema_05` — hardening keamanan fungsi lama
> - `schema_06`-`schema_12` — Storage dokumen, approval cuti 2 tahap,
>   Kinerja, Data Pribadi/Pendidikan, DMS Cetak Surat, akses Penggajian,
>   Pengaturan Institusi
> - `schema_13` — **perbaikan bug self-approval** (ditemukan lewat audit
>   langsung ke instance Postgres, bukan cuma dibaca dari file):
>   kepala_bagian/pimpinan sebelumnya bisa memproses pengajuan cuti/
>   review kinerja MILIK SENDIRI karena guard tidak mengecualikan kasus
>   is_self — sekarang tersangkut di tahap itu sampai HRD/super_admin
>   turun tangan.
> - `schema_14` — perbaikan default privileges: beberapa fungsi
>   trigger-only dari schema_08/10 ternyata masih EXECUTE-able oleh
>   anon/authenticated meski sudah "direvoke dari PUBLIC" — revoke
>   PUBLIC tidak otomatis mencakup grant eksplisit ke role lain.
>
> Diverifikasi lewat `has_function_privilege()` langsung ke `pg_proc`
> (bukan hanya Security Advisor, yang sempat memberi hasil basi/cache
> saat memvalidasi schema_04 sebelum schema_05 dijalankan). Lihat pesan
> commit `ff3caee` untuk detail audit lengkap.
>
> **TEMUAN TAMBAHAN (schema_16, belum dijalankan):** saat memverifikasi
> ulang perbaikan `schema_13` lewat simulasi, ditemukan bug KEDUA yang
> arahnya justru berlawanan — bukan kelonggaran berlebih, tapi
> pemblokiran berlebih: kepala_bagian TIDAK PERNAH bisa mengisi tahap
> **penilaian diri sendiri** (bukan tahap atasan) untuk Kinerja, karena
> kondisi lama salah mengecualikan `is_atasan` di cabang yang seharusnya
> hanya mensyaratkan `is_self`. Akibatnya siklus Kinerja kepala_bagian
> macet permanen di 'draft' sejak `schema_08` — bug ini sudah ada sejak
> awal dan LOLOS dari audit `schema_13` karena fokus audit itu ke arah
> kelonggaran, bukan pemblokiran. Lihat komentar lengkap di
> `schema_16_fix_self_assessment_blocked.sql`.
>
> **`schema_15` s/d `schema_22` SUDAH DIJALANKAN** ke project "Dataku2026"
> per sesi terbaru — termasuk `schema_19` (perbaikan bug ketiga:
> kepala_bagian/pimpinan sebelumnya tidak bisa membatalkan cuti
> miliknya sendiri — ini kemungkinan besar penyebab laporan pengguna
> "perubahan tidak bisa disimpan"), `schema_20`/`schema_21` (Notifikasi
> In-App, baru berfungsi penuh), dan `schema_22` (perbaikan privilege
> `log_supervisor_change` dari `schema_17` yang ternyata belum efektif
> saat pertama dijalankan — diverifikasi ulang lewat `pg_proc` langsung,
> bukan cuma Security Advisor).
>
> Semua diverifikasi fungsional nyata di database (bukan cuma dibaca
> kodenya): simulasi insert leave_request tanpa error trigger
> notifikasi, `has_function_privilege()` ke `pg_proc` untuk 6 fungsi
> notifikasi + `log_supervisor_change`, dan 22/22 test frontend lulus.
>
> Yang masih perlu dipastikan manual: **langkah 3-6 di bawah**
> (Edge Functions, secret, ambil URL/anon key, buat user pertama)
> sebelum lanjut ke Cloudflare — dan environment variable Cloudflare
> (`APP_MODE`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`) di bagian 3.

1. Buat project baru di [supabase.com/dashboard](https://supabase.com/dashboard).
   **Pilih region terdekat ke pengguna** (mis. Singapore untuk Indonesia)
   supaya latensi rendah.
2. Buka **SQL Editor**, jalankan **berurutan, satu per satu, tunggu
   selesai sebelum lanjut ke berikutnya**:
   - `supabase/schema.sql`
   - `supabase/schema_02_employee_details.sql`
   - `supabase/schema_03_attendance_leave_payroll.sql`
   - `supabase/schema_04_harden_function_security.sql`
   - `supabase/schema_05_fix_execute_grants.sql`
   - `supabase/schema_06_documents_storage.sql`
   - `supabase/schema_07_leave_two_stage_approval.sql`
   - `supabase/schema_08_performance_reviews.sql`
   - `supabase/schema_09_personal_details_extension.sql`
   - `supabase/schema_10_document_management_system.sql`
   - `supabase/schema_11_payroll_access_update.sql`
   - `supabase/schema_12_institution_settings.sql`
   - `supabase/schema_13_fix_self_approval_loophole.sql`
   - `supabase/schema_14_fix_new_function_default_privileges.sql`
   - `supabase/schema_15_competency_document_link.sql`
   - `supabase/schema_16_fix_self_assessment_blocked.sql`
   - `supabase/schema_17_log_supervisor_change.sql`
   - `supabase/schema_19_fix_self_cancel_blocked.sql`
   - `supabase/schema_20_notifications.sql`
   - `supabase/schema_21_user_approval_notification.sql`
   - `supabase/schema_22_fix_log_supervisor_change_privileges.sql`
   - `supabase/schema_23_self_registration.sql`
   - `supabase/schema_24_master_salary_components.sql`
   - `supabase/schema_25_employees_edit_permissions.sql`
   - `supabase/schema_26_attendance_location.sql`
   - `supabase/schema_27_dms_payslip_type.sql`
   - `supabase/schema_28_document_templates.sql`
   - `supabase/schema_29_employee_classification.sql`

   > **`schema_23` dan `schema_24` SUDAH DIJALANKAN** (Agustus 2026) ke
   > project "Dataku2026" — masing-masing untuk fitur Pendaftaran
   > Mandiri Pegawai dan struktur gaji master (Tunjangan/Bonus/Potongan
   > tetap). Diverifikasi lewat query langsung ke `information_schema`
   > dan `pg_policies`, bukan hanya dibaca dari file. Kedua fitur ini
   > SUDAH BISA dipakai di production sekarang.
   >
   > **`schema_25` dan `schema_26` SUDAH DIJALANKAN** (Agustus 2026) ke
   > project "Dataku2026", menyusul `schema_23`/`schema_24` di atas.
   > `schema_25`: RLS `employees_update` + trigger
   > `employees_protect_privileged_fields` diperbarui — hanya Super
   > Admin/HRD/Pimpinan yang bisa mengubah field kepegawaian
   > (kepala_bagian dicabut, Pimpinan ditambahkan). `schema_26`: 6
   > kolom lokasi GPS ditambahkan ke `employee_attendance`, memperbaiki
   > bug blocking yang membuat check-in/out mandiri gagal total di mode
   > `supabase`. Keduanya diverifikasi lewat query langsung ke
   > `pg_policies`/`information_schema`, bukan hanya dibaca dari file.
   >
   > **Insiden yang ditemukan & diperbaiki saat menjalankan `schema_25`:**
   > fungsi `protect_role_status` (dari `schema_23`) kedapatan
   > kehilangan `search_path` yang sebelumnya sudah diperbaiki di sesi
   > lain — kemungkinan besar karena isi `CREATE OR REPLACE FUNCTION`
   > sempat ditempel ulang manual di SQL Editor (di luar migrasi
   > terlacak), yang menghapus proconfig-nya lagi. **Perbaikan kali ini
   > dibuat permanen**: `search_path` sekarang dibenamkan langsung di
   > klausa `LANGUAGE` fungsi (`... security definer set search_path =
   > public, pg_temp;`), bukan `ALTER FUNCTION` terpisah — berlaku juga
   > untuk `employees_protect_privileged_fields` yang baru. Siapa pun
   > yang mengubah kedua fungsi ini di masa depan WAJIB mempertahankan
   > klausa itu.
   >
   > **`schema_27`, `schema_28`, dan `schema_29` SUDAH DIJALANKAN**
   > (Agustus 2026), menyusul `schema_25`/`schema_26` di atas.
   > `schema_27`: constraint `generated_documents_document_type_check`
   > diverifikasi mencakup `'slip_gaji'` — cetak slip gaji dari tab
   > Penggajian profil sekarang tercatat ke DMS dengan nomor resmi.
   > `schema_28`: tabel `document_templates` + bucket Storage privat
   > `document-templates` (verified `public: false`, limit 10MB)
   > terverifikasi dibuat, 3 policy (`select`/`insert`/`delete`) aktif
   > — menu "Template Dokumen" di Pengaturan sudah berfungsi.
   > `schema_29` (migrasi yang MENGUBAH DATA): dijalankan setelah
   > pengecekan pratinjau (`select employment_status, count(*) from
   > employees group by 1` — database live baru punya 2 baris pegawai
   > saat migrasi dijalankan, dampaknya minim). Query verifikasi
   > pasca-migrasi dari file itu sendiri dijalankan: tidak ada lagi
   > `employment_status = 'contract'` tersisa, dan daftar pegawai
   > dengan `contract_type is null` (perlu dipilih ulang manual lewat
   > aplikasi) sudah diidentifikasi — jalankan query berikut kapan saja
   > untuk melihat daftar terbarunya:
   > ```sql
   > select full_name, employee_code from public.employees where contract_type is null;
   > ```

   > Urutan ini WAJIB — file 02-05 bergantung pada tabel/fungsi dari file
   > sebelumnya (lihat komentar KETERGANTUNGAN di masing-masing file).
   > **Status: SEMUA file di atas (schema.sql s/d schema_22) SUDAH
   > dijalankan ke project "Dataku2026"** (lihat catatan di awal bagian
   > ini) — TIDAK ada nomor 18 dalam urutan ini secara sengaja, lompat
   > dari 17 ke 19
   > karena penomoran sempat bentrok antara dua sesi kerja paralel dan
   > diselesaikan dengan me-renumber, bukan kesalahan pengetikan).
3. Deploy 4 Edge Function lewat [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```bash
   supabase login
   supabase link --project-ref <project-ref-anda>
   supabase functions deploy create-user
   supabase functions deploy login-lookup
   supabase functions deploy reset-password
   supabase functions deploy register-employee --no-verify-jwt
   ```
   > **Status (Agustus 2026): SEMUA 4 fungsi `ACTIVE`.** `create-user`
   > sudah DI-DEPLOY ULANG (`version: 2`) — dukungan `employee_id`
   > opsional saat admin membuat akun untuk pegawai yang datanya sudah
   > ada kini aktif di production; field "Tautkan ke Data Pegawai" di
   > modal Tambah Pengguna tidak lagi diabaikan server. `verify_jwt:
   > true` (benar, wajib JWT admin) — sama seperti `reset-password`.
   > `login-lookup` & `register-employee` dengan `verify_jwt: false`
   > (benar, keduanya memang harus bisa dipanggil tanpa sesi login).
   > Diverifikasi lewat `list_edge_functions` + `get_edge_function`
   > langsung ke project, dan log `edge-function` dicek — tidak ada
   > error 500/crash pada riwayat pemanggilan.
   > **`--no-verify-jwt` WAJIB khusus untuk `register-employee`** — ini
   > satu-satunya Edge Function di proyek ini yang memang harus bisa
   > dipanggil TANPA sesi login (pemanggilnya belum punya akun sama
   > sekali, itu justru tujuan fitur Pendaftaran Mandiri). 3 fungsi
   > lainnya TETAP pakai default (verify_jwt aktif) — jangan tambahkan
   > flag ini ke mereka, itu akan membuka celah keamanan besar (siapa pun
   > bisa memanggil create-user tanpa login sama sekali).
4. Set secret `SUPABASE_SERVICE_ROLE_KEY` untuk Edge Function (Dashboard
   > Edge Functions > Secrets, atau `supabase secrets set`). **Jangan
   > pernah** taruh service_role key ini di file mana pun di repo.
5. Ambil dari **Project Settings > API**:
   - `Project URL` → ini nilai `SUPABASE_URL`
   - `anon public` key → ini nilai `SUPABASE_ANON_KEY`

   Simpan dua nilai ini, dipakai di langkah 3.

6. Buat user pertama (super_admin) manual lewat SQL Editor atau
   Supabase Auth dashboard — belum ada mekanisme self-signup di app ini
   sesuai desain (lihat `schema.sql`).

   > **Untuk pengujian menyeluruh:** RLS/trigger di seluruh migrasi SUDAH
   > memberi `super_admin` wewenang penuh di HAMPIR SEMUA hal (pola
   > `is_super_admin() or ...` konsisten di setiap policy — lihat
   > `schema.sql`, `schema_02`–`schema_23`). SATU pengecualian yang BUKAN
   > soal wewenang tapi soal DATA: fitur "milik saya sendiri" (check-in/
   > out Kehadiran, ajukan Cuti, lihat Slip Gaji sendiri, isi Penilaian
   > Diri di Kinerja) butuh `profiles.employee_id` yang tertaut ke baris
   > `employees` — kalau `null`, fitur-fitur itu terkunci di UI apa pun
   > role-nya. Tautkan manual lewat SQL Editor:
   > ```sql
   > update public.profiles
   > set employee_id = (select id from public.employees limit 1)
   > where id = (select id from auth.users where email = 'EMAIL_AKUN_ANDA');
   > ```
   > (Ganti dengan `employees.id` pilihan Anda kalau ingin menguji dengan
   > data pegawai tertentu.)
   >
   > **Rekomendasi tautan per role** (Pimpinan/HRD/Bendahara Umum/Kepala
   > Bagian/Guru/Pegawai semua BISA jadi pegawai institusi yang menerima
   > gaji — bukan cuma "Pegawai" secara harfiah): tautkan `employee_id`
   > untuk SEMUA role **kecuali Super Admin** (kecuali dia memang juga
   > pegawai aktif) **dan HRD** (murni peran administratif sistem,
   > biasanya bukan pegawai yang digaji lewat modul Penggajian institusi
   > ini). Pola ini yang dipakai di seed data mode `mock`
   > (`mockDataService.js`) — lihat di sana untuk contoh lengkapnya.

## 2. (Rekomendasi) Buat project Supabase KEDUA untuk staging

Kalau memungkinkan secara biaya, buat satu project Supabase terpisah
untuk staging/testing, ulangi langkah 1 dengan region sama. Ini yang
memungkinkan deployment Preview (tiap PR, kalau dikonfigurasi) nunjuk ke
data staging, sementara `main` nunjuk ke data produksi asli — supaya
testing fitur baru tidak pernah menyentuh data pegawai sungguhan.

## 3. Hubungkan repo ke Cloudflare

> **Koreksi dari versi dokumen sebelumnya:** bagian ini awalnya ditulis
> mengasumsikan dashboard "Cloudflare Pages" klasik. Setelah melihat log
> deploy sungguhan, project ini ternyata jalan lewat **Cloudflare Workers
> Builds** (pakai Wrangler, deploy command `npx wrangler deploy`) —
> konsepnya mirip tapi field dan istilahnya beda. Instruksi di bawah ini
> sudah disesuaikan dengan bukti dari log deploy asli, bukan asumsi lagi.

1. Di Cloudflare Dashboard, buka project Workers (`dataku2026` atau nama
   yang Anda pakai) > **Settings**.
2. **Build command** — pastikan diisi `npm run build`. Ini WAJIB ada
   dan berjalan SEBELUM `npx wrangler deploy` (yang jadi "deploy
   command", biasanya sudah terisi otomatis). Kalau field ini kosong,
   Wrangler langsung upload isi `public/` mentah — `scripts/build.js`
   tidak pernah jalan, dan hasilnya persis banner "MODE DEMO" yang
   Anda lihat sebelumnya.
3. `wrangler.jsonc` di root repo ini sudah mengunci
   `assets.directory` ke `dist` (hasil build), BUKAN `public`. Tanpa
   file ini, Wrangler auto-detect balik ke `public` setiap deploy —
   itu penyebab pasti masalah sebelumnya (lihat log: `Output Directory:
   public`, padahal seharusnya `dist`).
4. **Environment variables** (cari bagian "Environment Variables" atau
   "Build variables" di Settings — field ini yang dipakai SAAT build
   berjalan, bukan runtime Worker) — isi:
   | Nama | Nilai |
   |---|---|
   | `APP_MODE` | `supabase` |
   | `SUPABASE_URL` | Project URL dari langkah 1.5 |
   | `SUPABASE_ANON_KEY` | anon public key dari langkah 1.5 |
   | `VAPID_PUBLIC_KEY` | *(opsional)* publicKey hasil `npx web-push generate-vapid-keys` — isi ini kalau ingin fitur push notification aktif. Kosongkan/lewati kalau belum siap; build tetap sukses dan tombol "Aktifkan Notifikasi" otomatis disembunyikan (bukan error). **Penting:** env var ini TIDAK otomatis terisi hanya karena backend push (`schema_68`, Edge Function `send-push-notification`) sudah live di Supabase — lihat `supabase/PENDING_ACTIONS.md`. Kunci publik VAPID aman terlihat publik (bukan rahasia); yang harus tetap rahasia adalah `privateKey`-nya, di-set lewat `supabase secrets set VAPID_PRIVATE_KEY=...`, BUKAN di sini.
5. Trigger deploy baru (env var yang ditambah SETELAH deploy sebelumnya
   TIDAK otomatis berlaku ke deployment yang sudah tayang — harus ada
   build baru, mis. lewat "Retry deployment" atau push commit apa pun).
6. **Verifikasi dari log build itu sendiri**, bukan cuma dari tampilan
   situs — cari baris ini di log deploy yang baru:
   ```
   ✓ Disalin public/ -> dist/
   ✓ APP_MODE diset ke 'supabase'
   ✓ VAPID_PUBLIC_KEY disuntik ke dist/js/config.js — push notification aktif
   ✓ Kredensial Supabase disuntik ke dist/js/supabaseClient.js
   ```
   Kalau baris-baris ini TIDAK muncul sama sekali di log, berarti Build
   command di langkah 2 masih belum tersimpan/tereksekusi — bukan
   masalah kredensial lagi di titik itu. Baris `VAPID_PUBLIC_KEY` akan
   berbunyi "ℹ ... tidak diisi" (bukan tanda `✓`) kalau env var itu
   sengaja/belum diisi — ini NORMAL selama fitur push memang belum mau
   diaktifkan, bukan tanda build gagal.
7. Setelah deploy sukses, tambahkan domain kustom kalau institusi
   punya domain sendiri (Settings > Domains & Routes — istilahnya beda
   dari "Custom domains" di Pages klasik, sama-sama ada di Workers).

## 4. Verifikasi pasca-deploy (checklist manual)

- [ ] Buka URL yang di-deploy, pastikan **tidak** muncul banner "MODE
      DEMO" (itu tanda `APP_MODE` masih salah ke `mock`).
- [ ] Login pakai akun super_admin yang dibuat di langkah 1.6.
- [ ] Coba tambah satu pegawai uji coba, pastikan tersimpan (menandakan
      RLS `employees_insert` bekerja untuk role Anda).
- [ ] Buka DevTools > Network, cari request ke `*.supabase.co` — pastikan
      tidak ada key/token yang terlihat aneh di luar anon key yang memang
      seharusnya publik.
- [ ] Cek header response (mis. lewat curl atau DevTools) memuat
      `Content-Security-Policy`, `X-Frame-Options: DENY`, dst — menandakan
      `public/_headers` terbaca Cloudflare dengan benar.
- [ ] Hapus pegawai uji coba tadi (atau catat sebagai data uji, jangan
      biarkan tercampur data sungguhan).

## 5. Yang SENGAJA belum dikerjakan di tahap ini (tech debt tercatat)

- ~~CSP masih pakai `'unsafe-inline'` untuk script~~ — **SELESAI**: 65
  `onclick` inline di `app.js` sudah dikonversi ke pola `data-onclick` +
  event delegation (lihat README.md § tabel migrasi, commit e6121aa/
  4d8300e/48b0b60). `script-src` di `public/_headers` sekarang tanpa
  `'unsafe-inline'` (hanya `style-src` yang masih memakainya, risiko jauh
  lebih rendah dan wajar untuk banyak app tanpa build step).
  **CATATAN (2026-08-16, `schema_54`):** konversi di atas cuma menyasar
  `onclick`, TIDAK menyentuh `onchange`/`oninput` mentah sama sekali —
  58 atribut (12 `onchange`, 46 `oninput`) diam-diam diblokir CSP tanpa
  ada yang sadar, sampai ditemukan lewat laporan bug "logo tidak bisa
  diupload". Sudah diperbaiki dengan pola delegasi yang sama
  (`data-onchange`/`data-oninput`), lihat `schema_54` di README. Kalau
  ada penambahan `onclick=`/`onchange=`/`oninput=` INLINE baru di masa
  depan (bukan lewat `data-onclick`/`data-onchange`/`data-oninput`),
  `npm test` akan gagal (`tests/no_inline_event_handlers.test.js`,
  ditambahkan bersamaan dengan `schema_54`) -- guard otomatis ini TIDAK
  ADA sebelum sesi ini, makanya 58 atribut mentah tadi bisa lolos tanpa
  terdeteksi sampai dilaporkan pengguna.
- **⚠️ RLS BELUM diuji otomatis (CI) terhadap instance Postgres
  sungguhan — risiko Tinggi.** 160 smoke test (per 2026-08-23: 125
  `mockDataService` + 33 `attendanceSyncQueue` + 1
  `no_inline_event_handlers` + 1 `csp_connect_src`) yang jalan di CI
  (`npm test`) 100% menguji tiruan JS-nya (`mockDataService.js`),
  BUKAN policy/trigger Postgres yang sesungguhnya — lulus di CI bukan
  bukti RLS di database produksi benar. Angka ini naik tiap fitur baru
  menambah test — jangan hardcode ulang tanpa mengecek `npm test`
  langsung, ini sudah kedua kalinya angka di file ini basi.

  **Yang SUDAH ada** (tapi TIDAK menutup risiko di atas): 2 test e2e
  yang menyentuh Postgres/RLS asli —
  `tests/e2e-supabase-self-registration.test.js` (alur registrasi
  mandiri, menyentuh RLS `profiles_update_admin`) dan
  `tests/e2e-supabase-leave-approval.test.js` (alur approval cuti
  lintas peran pegawai → kepala bagian → pimpinan + trigger cascading
  attendance). Jalankan manual dengan
  `npm run test:e2e-self-registration` /
  `npm run test:e2e-leave-approval` (butuh kredensial project asli
  via environment variable, lihat komentar di kepala masing-masing
  file).

  **Kenapa risiko tetap Tinggi meski 2 test itu ada:**
  1. **Tidak jalan otomatis di CI (sebelum 2026-08-23)** —
     `.github/workflows/test.yml` cuma menjalankan `npm test` (mock).
     Kedua e2e test di atas HARUS dipicu manual oleh manusia; gampang
     terlewat/lupa sebelum deploy, terutama setelah migrasi RLS baru
     (`schema_67`–`69` belum pernah dilewati kedua test ini sama
     sekali). **Update 2026-08-23:** workflow baru
     `.github/workflows/e2e-rls-staging.yml` sudah dibuat untuk
     menutup celah ini — jalan otomatis di setiap push/PR yang
     menyentuh `supabase/**`, tapi masih *ter-skip dengan warning*
     sampai tim Supabase mengisi 10 secret staging (lihat
     `supabase/PENDING_ACTIONS.md` § "Setup staging Supabase untuk CI
     e2e" untuk daftar lengkap & langkahnya).
  2. **Cakupan sangat sempit** — cuma 2 dari puluhan
     tabel/policy RLS di seluruh skema (payroll, kinerja, dokumen,
     shift kerja, push subscription, dll. semuanya TIDAK punya e2e
     test RLS sama sekali).

  **WAJIB, bukan sekadar rekomendasi, sampai workflow CI di atas aktif
  penuh:** jalankan kedua `npm run test:e2e-*` manual terhadap project
  staging SEBELUM merge migrasi apa pun yang menyentuh RLS/fungsi
  privileged (termasuk fungsi `SECURITY DEFINER`, policy baru/diubah,
  atau trigger yang menegakkan otorisasi) — jangan menunggu sampai
  setelah deploy produksi. Tambahkan juga minimal skenario "role X coba
  akses data role Y, harus ditolak" untuk modul-modul berisiko tinggi
  lain (Payroll, Kinerja) sebagai e2e test baru — bukan cuma smoke test
  mock.
- **Tidak ada monitoring/alerting** — kalau Edge Function error atau
  quota Supabase mendekati limit, saat ini tidak ada yang memberi tahu
  otomatis. Di luar cakupan "persiapan deploy", masuk fase Observability
  terpisah kalau dibutuhkan nanti.
