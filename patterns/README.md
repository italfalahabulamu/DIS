# Aset Kategori A — Layak Diadopsi Langsung (Domain-Agnostic)

Diambil dari `firdausaiasisten/dataku2026`, branch main, commit `6517c99`, 2026-09-02.

Ini adalah aset yang dinilai **layak diadopsi langsung** ke sistem akademik
santri karena sifatnya domain-agnostic (tidak spesifik ke logika bisnis
kepegawaian). Enam kategori:

## 1. Arsitektur ES-modules (skeleton)
File "tulang punggung" pola modular: entry point (main.js), state global
(state.js), shell UI/navigasi (ui-shell.js), util umum (utils.js), konstanta
(constants.js), auth/role gating (auth.js), auto-logout (idle-timeout.js).
**Ini pola, bukan kode siap pakai** — masih penuh referensi ke modul-modul
domain kepegawaian (payroll, attendance, dst.) yang perlu dilepas/diganti
kalau dipakai untuk sistem lain.

## 2. PWA + Offline Sync Queue
`attendanceSyncQueue.js` adalah pola paling bernilai untuk konteks pesantren
(area lemah sinyal: asrama, lapangan). Nama file & sebagian logikanya masih
spesifik ke "attendance pegawai" — untuk presensi santri, struktur queue-nya
reusable tapi skema datanya perlu ditulis ulang.

## 3. Dual Data Layer (mock + Supabase, cermin satu sama lain)
`mockDataService.js` dan `supabaseDataService.js` — pola arsitektur testable
tanpa perlu Postgres asli untuk unit test. **PERINGATAN**: proyek asal
mendokumentasikan bahwa `mockDataService.js` TIDAK selalu mencerminkan
perilaku RLS asli dengan akurat (celah pengujian yang sudah diketahui,
belum ditambal). Kalau Anda adopsi pola ini, jangan warisi celah itu —
wajibkan sejak awal bahwa RLS diuji terhadap Postgres asli, bukan hanya mock.

## 4. Pola Document Management (DMS)
`dms.js` — pola jenis dokumen, retensi, dan referensi berkas. Relevan untuk
rapor/ijazah/surat keterangan santri, tapi konten domain (jenis dokumen
pegawai) perlu diganti total.

## 5. Modul Kalender
`calendarFeature.js` — masih pola lama (pre-ES-modules, `window.fn` global),
BUKAN contoh arsitektur yang ingin ditiru dari segi teknis. Nilainya di
struktur data event/kalender, bukan implementasinya.

## 6. Konfigurasi Deployment
`wrangler.jsonc` (Cloudflare Workers), `DEPLOYMENT.md`, `package.json` —
sepenuhnya netral domain, bisa dipakai langsung sebagai starting point
project baru.

---

**Yang TIDAK saya sertakan (sengaja):** modul kategori B/C dari analisis
sebelumnya (attendance.js, disciplinaryFeature.js, performance.js, payroll,
org-chart, model role HRIS) — itu butuh redesain substansial atau memang
tidak relevan untuk domain santri, bukan "aset siap adopsi".

**Yang wajib Anda perbaiki, BUKAN warisi, saat mengadopsi pola-pola ini:**
- RLS harus diuji terhadap Postgres asli sejak awal (gap ini di kategori 3
  di atas belum ditambal di proyek asal).
- `CACHE_NAME` di `sw.js` wajib dibump setiap kali `SHELL_ASSETS` berubah —
  kegagalan ini berulang kali menyebabkan bug cache-staleness di proyek asal.
