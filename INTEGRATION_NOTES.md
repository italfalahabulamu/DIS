# Catatan Integrasi — Aset Kategori A (dari dataku2026, commit 6517c99)

Sumber: `aset-kategori-A-dataku2026.zip`, dinilai "layak diadopsi langsung"
oleh analisis sebelumnya karena domain-agnostic. Catatan ini menjelaskan
**apa yang benar-benar terintegrasi (fungsional)** vs **apa yang hanya
disimpan sebagai referensi pola** — dan kenapa dibedakan begitu.

## Terintegrasi ke `public/` (self-contained, `node --check` lolos)

| File | Lokasi | Catatan |
|---|---|---|
| `constants.js`, `state.js`, `utils.js`, `idle-timeout.js` | `public/js/modules/` | Tidak punya import ke file yang hilang. Masih berisi label/komentar bernuansa kepegawaian (mis. status "Cuti", komentar "foto pegawai") — aman secara sintaks, tapi kontennya perlu disesuaikan ke domain santri saat dipakai. |
| `mockDataService.js`, `supabaseDataService.js`, `loadDataService.js`, `attendanceSyncQueue.js` | `public/js/` | Path disamakan ke `js/...` (bukan `js/services/...`) supaya cocok dengan pemanggilan di `loadDataService.js`. Mode mock (`mockDataService.js`) mandiri. Mode supabase butuh `js/supabaseClient.js` — **file ini TIDAK ada di bundel**, harus dibuat baru dengan kredensial project Supabase milik DIS. |
| `manifest.json` | `public/` | `name`/`short_name`/`description` sudah diganti dari "HRIS Al-Falah" ke placeholder generik "DIS" — **nama final belum ditentukan**, tolong diganti sebelum production. Ikon (`assets/favicon-192.png`, dst.) direferensikan tapi belum ada di repo ini. |
| `wrangler.jsonc`, `DEPLOYMENT.md`, `package.json` | root | Sepenuhnya netral domain (Cloudflare Workers config), dipakai apa adanya. |
| `dms.js`, `calendarFeature.js` | *(sudah ada dari push sebelumnya)* | Isinya identik dengan yang di zip ini (dibandingkan lewat `diff`, hanya beda baris kosong di akhir file) — tidak digandakan. |

## SENGAJA TIDAK diintegrasikan sebagai kode aktif — disimpan di `patterns/`

`main.js`, `ui-shell.js`, `auth.js`, `sw.js` **tidak bisa jalan berdiri
sendiri**. Ini bukan penilaian gaya, tapi fakta struktural: ketiganya
mengimpor total **15 modul yang tidak ada di bundel ini maupun di repo
DIS** — `employees.js`, `org-chart.js`, `daily-tasks.js`,
`employee-profile.js`, `settings.js`, `performance.js`, `payroll.js`,
`attendance.js`, `reports.js`, `users-admin.js`, `audit-log.js`,
`documents-print.js`, `dashboard.js`, `leave.js`, `student-database.js`
(daftar lengkap dari `grep` atas semua `import ... from './...'` di
ketiga file). `sw.js` punya masalah yang sama di `SHELL_ASSETS` (daftar
cache-nya berisi ~20 path, sebagian besar merujuk file yang sama yang
hilang itu).

Saya tidak menghapus/menambal ke-15 import itu secara diam-diam karena:
- Menghapus 2-3 baris saja (mis. hanya `payroll.js`/`attendance.js`)
  dan menyebutnya "sudah diintegrasikan" akan menyesatkan — sisanya
  tetap patah.
- Menambal semuanya berarti saya harus memutuskan sendiri modul apa
  saja yang dimiliki DIS (menu apa, peran apa selain santri/wali/ustadz,
  dst.) — itu keputusan produk yang belum ada jawabannya, bukan sekadar
  refactor mekanis.

**Rekomendasi langkah berikutnya (perlu keputusan Anda dulu):**
1. Tentukan daftar modul/menu nyata untuk DIS (mis. lewat skill
   `product-manager` atau `software-architect` yang sudah ada di
   katalog Anda).
2. Baru setelah itu, `main.js`/`ui-shell.js`/`auth.js`/`sw.js` bisa
   di-refactor jadi skeleton yang benar-benar jalan — hanya
   mengimpor modul yang memang akan dibangun, sisanya diberi
   placeholder `// TODO(DIS): modul X belum dibuat`.

## Belum ditambal (di luar cakupan sesi ini)

- `constants.js` masih berisi ~106 referensi istilah kepegawaian
  (role label, dst.) — strukturnya (pola konstanta per-role) bisa
  dipakai ulang, tapi isinya perlu didesain ulang untuk peran di DIS.
- `mockDataService.js`/`supabaseDataService.js` (336 KB gabungan,
  702+183 referensi istilah kepegawaian) adalah bisnis-logic HRIS
  hampir seluruhnya. Pola arsitekturnya (mock + supabase yang saling
  mencerminkan) reusable, tapi isinya bukan sesuatu yang aman
  ditulis-ulang otomatis tanpa skema data santri yang sudah final.
  **Peringatan yang diwariskan dari proyek asal (jangan diulang):**
  `mockDataService.js` di sana diketahui TIDAK selalu mencerminkan
  perilaku RLS Postgres asli secara akurat — kalau pola ini diadopsi,
  RLS wajib diuji terhadap Postgres asli sejak awal, bukan cuma mock.
