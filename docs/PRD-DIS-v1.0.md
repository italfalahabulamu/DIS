---
project: DIS (Data Induk Santri — Pesantren Modern Al-Falah Abu Lam U)
document: PRD
skill: Product Manager
version: 1.0
status: draft
depends_on: "docs/database-design.md v0.1 (Database Engineer), riwayat 23 migrasi supabase/, supabase/PENDING_ACTIONS.md, INTEGRATION_NOTES.md — TIDAK ADA Business Requirement Brief formal; brief v0.2 disebut di repo tapi belum di-commit"
---

## Catatan status (baca dulu)

Tidak ada Business Requirement Brief formal yang bisa saya rujuk — hanya
skema database v0.1 (draft, belum divalidasi ke Postgres), 23 migrasi SQL,
dan implementasi UI parsial untuk 7 modul. PRD ini disusun **mundur** dari
apa yang sudah dibangun, bukan maju dari requirement bisnis yang
terdokumentasi. Artinya: bagian *Objectives*, *Target Users*, dan sebagian
*User Stories* di bawah adalah **rekonstruksi**, bukan keputusan bisnis
yang sudah dikonfirmasi. Setiap asumsi ditandai eksplisit — tugas Anda
sebagai pemilik produk adalah mengoreksi asumsi yang salah, bukan menerima
semuanya begitu saja.

---

## Executive Summary

DIS adalah sistem informasi manajemen santri untuk Pesantren Modern
Al-Falah Abu Lam U, dibangun di atas Supabase (Postgres + RLS) dan
Cloudflare Workers, mengadopsi sebagian pola arsitektur dari proyek
HRIS internal (`dataku2026`). Cakupan: 7 modul (Data Induk Santri, Nilai,
Kehadiran, SPP, Pelanggaran/Prestasi, Perizinan, Kesehatan) untuk 5 peran
(`admin`, `ustadz`, `musyrif`, `wali`, `keuangan_spp`). Backend/skema
sudah ditulis lengkap; **belum pernah dijalankan ke Postgres sungguhan**
dan RLS belum diuji. Frontend selesai untuk Kehadiran, Nilai,
Pelanggaran/Prestasi, Perizinan, Catatan Perkembangan; SPP dan Kesehatan
baru data-layer.

## Background

Proyek ini kelanjutan dari `dataku2026` (HRIS pegawai) — sebagian aset
kode (constants, state management, service layer, PWA shell) diadopsi
ke DIS. Sebagian pola bisa dipakai ulang; sebagian lain (shell UI lama,
service kepegawaian) sengaja **tidak** diadopsi mentah karena isinya
spesifik domain HRIS (lihat `INTEGRATION_NOTES.md`). Belum ada dokumen
requirement bisnis yang menjelaskan mengapa 7 modul ini dipilih, KPI apa
yang dikejar, atau siapa sponsor/pengguna utama di lapangan.

## Objectives *(rekonstruksi dari cakupan modul — perlu konfirmasi)*

1. Digitalisasi pencatatan data akademik & non-akademik santri (nilai,
   kehadiran, pelanggaran/prestasi) yang sebelumnya manual.
2. Transparansi ke wali santri atas perizinan, kesehatan, dan SPP anak
   asuhnya.
3. Kontrol akses berbasis peran (RLS) agar ustadz/musyrif hanya melihat
   santri yang menjadi tanggung jawabnya.

> ⚠️ Tidak ada North Star Metric atau target kuantitatif yang
> terdokumentasi. Ini perlu diisi bersama sponsor bisnis sebelum PRD ini
> bisa berstatus `approved`.

## Target Users / Personas

| Peran | Kebutuhan utama | Bukti di kode |
|---|---|---|
| **Admin** | Kelola data induk santri, kelas, penugasan ustadz/musyrif, akun pengguna | `schema_001`, `schema_017`–`019` |
| **Ustadz** | Input nilai & kehadiran, catatan perkembangan untuk santri di kelas yang ditugaskan | `schema_020_penugasan_ustadz`, modul `nilai.js`/`kehadiran.js` |
| **Musyrif** (pembina asrama) | Catatan perkembangan & pengawasan santri di asramanya | `schema_021_asrama_musyrif` |
| **Wali** (orang tua) | Lihat nilai/kehadiran/pelanggaran-prestasi anak, ajukan perizinan, lihat tagihan SPP | Kolom `wali_id`, tabel `santri_wali` |
| **Keuangan SPP** | Kelola tagihan & pembayaran SPP | `schema_005`, modul `spp.js` (data-layer saja) |

> ⚠️ Tidak ada persona santri sendiri (tanpa akun login) — ini asumsi
> eksplisit dari `docs/database-design.md` (Assumption #1), belum
> dikonfirmasi ke bisnis.

## User Stories & Acceptance Criteria (per modul, status implementasi disertakan)

### 1. Data Induk Santri — ✅ UI selesai
- **Sebagai admin**, saya ingin mendaftarkan santri baru beserta wali dan
  kelasnya, agar data induk lengkap sejak awal.
  - AC: Form validasi field wajib (nama, NIS, kelas); relasi santri↔wali
    tersimpan di `santri_wali`; riwayat kelas tercatat di
    `santri_kelas_riwayat` tanpa tumpang tindih periode (exclude
    constraint `btree_gist`).

### 2. Kehadiran — ✅ UI selesai
- **Sebagai ustadz**, saya ingin mencatat kehadiran harian santri di
  kelas yang saya ampu, agar rekap kehadiran akurat per santri.
  - AC: Ustadz hanya bisa input untuk santri di kelas yang tercatat di
    `penugasan_ustadz`; santri di luar kelasnya ditolak RLS (**belum
    diuji ke Postgres asli**).

### 3. Nilai — ✅ UI selesai
- **Sebagai ustadz**, saya ingin input nilai santri per mapel per
  semester, agar leger nilai bisa dicetak.
  - AC: Daftar mapel mengikuti sumber final (`blanko_ijazah.xlsm` sheet
    "Leger 2026"); nilai tersimpan per `santri × mapel × semester`.

### 4. Pelanggaran & Prestasi — ✅ UI selesai
- **Sebagai ustadz/musyrif**, saya ingin mencatat pelanggaran atau
  prestasi santri dengan akumulasi poin per tahun ajaran, agar bisa jadi
  dasar evaluasi.
  - AC: Poin terakumulasi per santri per tahun ajaran ("Model B"),
    direset otomatis di pergantian tahun ajaran (`schema_016`); pelapor
    tercatat lintas sistem HRIS (`schema_009`, `schema_015`).

### 5. Perizinan — ✅ UI selesai
- **Sebagai wali**, saya ingin mengajukan izin/cuti untuk anak saya, dan
  admin/ustadz menyetujuinya, agar tercatat resmi.
  - AC: Status pengajuan (`diajukan/disetujui/ditolak`) tercatat dengan
    approver; `ON DELETE RESTRICT` mencegah data terkait santri terhapus
    tanpa sengaja (`schema_011`).

### 6. SPP — ⚠️ hanya data-layer, UI belum ada
- **Sebagai keuangan_spp**, saya ingin melihat & mencatat pembayaran SPP
  per santri per periode.
  - AC: *belum bisa diverifikasi* — UI belum disambung. Skema tagihan +
    pembayaran ada (`schema_005`) tapi menurut `docs/database-design.md`
    ada **2 keputusan bisnis belum dikonfirmasi** terkait SPP.

### 7. Kesehatan — ⚠️ hanya data-layer, UI belum ada
- **Sebagai admin/musyrif**, saya ingin mencatat profil kesehatan statis
  dan riwayat medik per-episode santri (data sensitif).
  - AC: *belum bisa diverifikasi* — UI belum ada. Status "riwayat medik
    per-episode" masih asumsi belum dikonfirmasi (`schema_010`).

## Feature Prioritization (MoSCoW, terhadap rilis berikutnya)

| Fitur | Prioritas | Alasan |
|---|---|---|
| Validasi 23 migrasi ke Postgres asli | **Must** | Blocker keras — tidak ada yang bisa dipakai pengguna nyata sebelum ini |
| Uji RLS per role (5 peran, termasuk kasus ditolak) | **Must** | Risiko keamanan data santri/kesehatan/keuangan jika bocor |
| Sambungkan UI SPP ke data-layer yang sudah ada | **Should** | Fungsional sudah 80% jalan (skema ada), sisa UI |
| Sambungkan UI Kesehatan | **Should** | Sama seperti SPP, tapi data lebih sensitif → perlu keputusan akses ekstra sebelum expose ke UI |
| Konfirmasi 2 keputusan bisnis SPP yang tertunda | **Must** (blocker untuk item di atasnya) | Tanpa ini, UI SPP bisa salah asumsi |
| Deploy Edge Function `sync-pegawai-hris` | **Could** | Sudah ada kode, belum dideploy — tidak mem-block rilis pengguna akhir |
| Refactor shell frontend lama (`patterns/`) jadi skeleton DIS asli | **Won't (rilis ini)** | Butuh keputusan daftar modul final terlebih dahulu — di luar cakupan rilis berikutnya |

## MVP Scope (Rilis 3 — "Siap Pengguna Nyata")

- Migrasi 001–023 tervalidasi jalan bersih di Postgres asli.
- RLS teruji untuk 5 peran, termasuk uji tolak-akses.
- Modul SPP: UI lengkap (tagihan + pembayaran), dengan 2 keputusan
  bisnis SPP dikonfirmasi lebih dulu.
- Modul Kesehatan: UI lengkap, dengan kebijakan akses data sensitif
  eksplisit (siapa boleh lihat riwayat medik).
- 1 akun admin pertama berhasil dibuat dan login.

## Out of Scope (rilis ini)

- Refactor total shell frontend (`main.js`/`ui-shell.js`/`auth.js`/
  `sw.js`) — menunggu keputusan daftar modul/menu final DIS.
- Deploy & aktifkan sinkronisasi HRIS (`sync-pegawai-hris`).
- Alur signup/invite otomatis untuk wali (masih manual via Dashboard).
- Penentuan nama final produk & branding (`manifest.json` masih
  placeholder "DIS").

## Success Metrics

> ⚠️ Belum ada North Star Metric yang dikonfirmasi bisnis. Usulan
> sementara untuk didiskusikan:
- **North Star (usulan):** % santri dengan data nilai+kehadiran lengkap
  ter-input tepat waktu per bulan.
- **Supporting:** jumlah insiden RLS gagal saat smoke test (target 0
  sebelum go-live), waktu rata-rata approve perizinan, % tagihan SPP
  tercatat vs. dibayar.

## Release Roadmap

| Rilis | Isi | Status |
|---|---|---|
| Rilis 1 | Auth + Catatan Perkembangan (MVP skeleton) | ✅ selesai |
| Rilis 2 | UI Nilai, Pelanggaran/Prestasi, Perizinan | ✅ selesai (kode) |
| Rilis 3 (usulan) | Validasi migrasi + uji RLS + UI SPP & Kesehatan | 🔜 berikutnya |
| Rilis 4 (usulan) | Refactor shell frontend final + deploy sync HRIS | Menunggu keputusan modul |

## Assumptions

1. Santri tidak punya akun login sendiri di rilis ini (hanya lewat wali).
2. 5 peran (`admin`, `ustadz`, `musyrif`, `wali`, `keuangan_spp`) adalah
   daftar final — belum dikonfirmasi ada/tidaknya peran lain.
3. Daftar mapel di `mata_pelajaran` sudah final dari sumber leger 2026.

## Dependencies

- Project Supabase DIS baru harus dibuat (belum ada) sebelum migrasi
  bisa dijalankan — di luar akses sandbox Claude.
- 2 keputusan bisnis SPP yang tertunda (rincian di
  `docs/database-design.md`, bagian catatan `schema_005`).
- Konfirmasi kebijakan akses data kesehatan (siapa yang berhak lihat).

## Risks

- **Tinggi:** RLS belum pernah diuji ke Postgres asli — risiko kebocoran
  data lintas peran/santri kalau langsung dipakai produksi.
- **Sedang:** Data kesehatan sensitif tanpa kebijakan akses eksplisit
  bisa ter-expose ke peran yang salah begitu UI dibangun.
- **Sedang:** Tidak ada Business Requirement Brief resmi — risiko PRD
  ini salah menerka prioritas bisnis sesungguhnya.

## Recommendations

1. Sebelum apa pun lain: jalankan blocker di `supabase/PENDING_ACTIONS.md`
   (buat project Supabase, jalankan migrasi, uji RLS).
2. Jadwalkan sesi singkat dengan sponsor bisnis untuk mengonfirmasi 2
   keputusan SPP dan kebijakan akses data kesehatan — dua hal ini
   memblokir UI Rilis 3.
3. Setelah Rilis 3 stabil, baru putuskan daftar modul/menu final untuk
   membenahi shell frontend lama.

## Next Actions

- [ ] Konfirmasi/koreksi Objectives & asumsi persona di atas dengan
      pemilik bisnis.
- [ ] Jalankan blocker teknis (lihat `PENDING_ACTIONS.md`).
- [ ] Serahkan PRD ini (setelah dikoreksi) ke `database-engineer`/
      `backend-engineer` untuk validasi migrasi, dan ke
      `frontend-engineer` untuk UI SPP/Kesehatan.

---

# Sprint Plan — MVP Rilis 3

**Sprint Goal:** Sistem tervalidasi jalan di Postgres asli dengan RLS
teruji, dan modul SPP + Kesehatan punya UI fungsional.
**Duration:** 2 minggu (usulan, sesuaikan kapasitas tim)

## Task Breakdown

| Task | Owning skill | Depends on | Estimate | Status |
|---|---|---|---|---|
| Buat project Supabase DIS + isi `config.js` | DevOps/Admin (manual) | — | 0.5 hari | Not started |
| Jalankan 23 migrasi berurutan | database-engineer | Project Supabase dibuat | 0.5 hari | Not started |
| Uji RLS 5 peran (jalur sukses + tolak) | database-engineer / QA | Migrasi jalan | 1.5 hari | Not started |
| Konfirmasi 2 keputusan bisnis SPP | Product Manager (Anda) | — | 0.5 hari | Not started |
| Bangun UI SPP (tagihan + pembayaran) | frontend-engineer | Keputusan SPP dikonfirmasi | 2 hari | Not started |
| Konfirmasi kebijakan akses data Kesehatan | Product Manager (Anda) | — | 0.5 hari | Not started |
| Bangun UI Kesehatan | frontend-engineer | Kebijakan akses dikonfirmasi | 2 hari | Not started |
| Buat akun admin pertama + smoke test end-to-end | admin/QA | Semua di atas | 0.5 hari | Not started |

## Sprint Backlog
Urutan eksekusi: buat project → jalankan migrasi → uji RLS (paralel
dengan konfirmasi keputusan SPP & Kesehatan) → bangun UI SPP & Kesehatan
→ smoke test akun admin.

## Cross-Skill Dependencies
- `frontend-engineer` menunggu keputusan Product Manager sebelum mulai
  UI SPP/Kesehatan — jangan mulai coding dengan asumsi sendiri.
- `database-engineer` memblokir semua task lain sampai migrasi +RLS
  tervalidasi.

## Definition of Done
- 23 migrasi jalan tanpa error di Postgres asli.
- RLS lulus uji jalur sukses **dan** jalur tolak untuk 5 peran.
- UI SPP & Kesehatan bisa dipakai end-to-end oleh akun test per peran
  terkait.
- 1 akun admin nyata berhasil login dan mengelola data induk santri.

## Next Actions
- [ ] Bawa PRD ini ke sponsor bisnis untuk koreksi asumsi.
- [ ] Setelah disetujui, serahkan ke `orchestrator` untuk eksekusi
      lintas-peran (database → backend → frontend → QA).
