# DIS — Data Induk Santri

Sistem informasi manajemen santri untuk Pesantren Modern Al-Falah Abu
Lam U. Dibangun di atas Supabase (Postgres + Row-Level Security) dan
di-serve sebagai static PWA sederhana (vanilla JS, tanpa framework
frontend). Mengadopsi sebagian pola arsitektur dari proyek saudara,
`dataku2026` (HRIS pegawai) — lihat `INTEGRATION_NOTES.md` untuk detail
apa yang diadopsi dan apa yang sengaja tidak.

> **Status per 2026-09-04: belum siap dipakai pengguna nyata.**
> Kode (skema DB + frontend) sudah lengkap untuk 7 modul, tapi
> **belum pernah dijalankan ke Postgres asli** dan RLS **belum pernah
> diuji**. Baca `supabase/PENDING_ACTIONS.md` sebelum menyentuh apa pun
> di produksi.

## Dokumen ini untuk siapa

Kalau Anda melanjutkan pekerjaan ini di sesi/percakapan baru (dengan
Claude atau siapa pun), baca urutan ini dulu:

1. **`supabase/PENDING_ACTIONS.md`** — satu-satunya sumber kebenaran
   untuk blocker teknis yang harus diselesaikan di luar sandbox Claude
   (buat project Supabase, jalankan migrasi, isi kredensial).
2. **`docs/PRD-DIS-v1.0.md`** — requirement produk (direkonstruksi dari
   kode, karena Business Requirement Brief formal belum di-commit ke
   repo), termasuk asumsi yang masih perlu dikonfirmasi bisnis.
3. **`docs/SMOKE_TEST_CHECKLIST.md`** — checklist manual yang harus
   dijalankan setelah blocker di poin 1 selesai, sebelum modul apa pun
   dianggap siap pakai.
4. **`INTEGRATION_NOTES.md`** — kenapa sebagian kode `dataku2026`
   diadopsi dan sebagian lain sengaja tidak (shell frontend lama,
   service HRIS spesifik).
5. **`docs/database-design.md`** — desain skema per modul beserta
   catatan keputusan bisnis yang masih tertunda.

Jika dokumen-dokumen ini saling bertentangan, `PENDING_ACTIONS.md`
yang menang untuk hal teknis, dan `docs/PRD-DIS-v1.0.md` yang menang
untuk hal keputusan produk — **tapi keduanya bisa jadi sudah usang**
kalau Anda membaca ini jauh setelah 2026-09-04. Cek riwayat commit
untuk konteks terbaru.

## Cakupan modul (7)

| Modul | Skema DB | UI Frontend | Diuji ke Postgres asli |
|---|---|---|---|
| Data Induk Santri | ✅ | ✅ | ❌ |
| Kehadiran | ✅ | ✅ | ❌ |
| Nilai | ✅ | ✅ | ❌ |
| Pelanggaran & Prestasi | ✅ | ✅ | ❌ |
| Perizinan | ✅ | ✅ | ❌ |
| SPP | ✅ | ✅ (baru disambung) | ❌ |
| Kesehatan | ✅ | ✅ (baru disambung) | ❌ |

5 peran: `admin`, `ustadz`, `musyrif`, `wali`, `keuangan_spp`. Akses
per modul diatur lewat RLS Postgres (lihat migrasi `schema_017`–`023`
untuk auth & RLS), bukan hanya disembunyikan di UI.

## Struktur repo (ringkas)

```
public/js/modules/     -- 1 file per modul domain (santri.js, spp.js, dst)
                           + uiShell.js (render dashboard, delegasi event)
supabase/migrations/    -- 23 file SQL berurutan (schema_001..023)
supabase/PENDING_ACTIONS.md -- blocker teknis, baca dulu
docs/                   -- PRD, desain database, checklist smoke test
patterns/               -- aset lama dari dataku2026, TIDAK dipakai langsung
                           (butuh keputusan daftar modul final DIS dulu)
```

## Menjalankan secara lokal

Belum ada instruksi build/serve — proyek ini static PWA murni. Buka
`public/index.html` lewat static server apa pun **setelah**
`public/js/config.js` diisi kredensial Supabase asli (lihat
`PENDING_ACTIONS.md` poin 3). Tanpa itu, login akan gagal karena
`config.js` masih placeholder.

## Kontribusi / lanjutan pekerjaan

Riwayat kerja sejauh ini mengikuti pola: 1 commit = 1 unit kerja jelas
(migrasi skema per modul, lalu UI per modul menyusul). Pertahankan
pola itu — jangan gabungkan perubahan skema dan UI beberapa modul
sekaligus dalam 1 commit, supaya riwayat tetap bisa ditelusuri kalau
ada bug regresi.
