/* ============================================================
   constants.js — Konstanta & label peran/status untuk seluruh app.
   Dipindahkan dari puncak app.js (P3.1 — pemecahan ES Modules).
   Isi dan komentar dipertahankan APA ADANYA dari app.js lama,
   hanya bentuknya yang berubah dari `const` global menjadi
   `export const` modul agar bisa di-import eksplisit.
   ============================================================ */

export const ROLE_LABEL = {
  super_admin: "Super Admin", hrd: "HRD", pimpinan: "Pimpinan", bendahara_umum: "Bendahara Umum",
  kepala_bagian: "Kepala Bagian", guru: "Guru", pegawai: "Pegawai", tendik: "Tenaga Kependidikan",
  kepala_sekolah: "Kepala Sekolah", sekretaris: "Sekretaris"
};

export const STATUS_LABEL = { active: "Aktif", pending: "Menunggu", inactive: "Nonaktif" };
export const STATUS_BADGE = { active: "success", pending: "warning", inactive: "danger" };

// Beda dari STATUS_LABEL/STATUS_BADGE di atas (itu untuk status AKUN
// login profiles.status) — ini untuk status KEPEGAWAIAN employees.employment_status.
// DIPERBARUI (schema_29): 'contract' dihapus dari status (sekarang murni
// tanggung jawab CONTRACT_TYPE_LABEL di bawah), 'leave' (Cuti) ditambahkan.
export const EMPLOYMENT_STATUS_LABEL = { active: "Aktif", inactive: "Non-Aktif", leave: "Cuti" };
export const EMPLOYMENT_STATUS_BADGE = { active: "success", inactive: "danger", leave: "info" };

// Tipe Kontrak Kepegawaian (schema_29) — SEBELUMNYA teks bebas
// (contract_type), sekarang 5 kode tetap. Kode pendek disimpan di
// database, label lengkap (dengan singkatan resmi) cuma untuk tampilan.
export const CONTRACT_TYPE_LABEL = {
  tetap: "Pegawai Tetap (PT)",
  kontrak: "Pegawai Kontrak (PK)",
  honorer: "Pegawai Honorer (PH)",
  paruh_waktu: "Tenaga Paruh Waktu (TPW)",
  sukarela_magang: "Tenaga Sukarela / Magang",
};

// ADMIN_ROLES: kelola pengguna (create-user/reset-password) — hanya super_admin
// per keputusan set role saat ini (lihat schema.sql bagian role_permissions).
export const ADMIN_ROLES = ["super_admin"];

// REGISTRATION_APPROVAL_ROLES (schema_23): siapa yang boleh menyetujui/
// menolak PENDAFTARAN MANDIRI pegawai (status 'pending', bukan tindakan
// admin lain seperti Tambah Pengguna/Ubah Peran/Reset Password — itu
// TETAP ADMIN_ROLES/super_admin saja, sengaja tidak disatukan).
export const REGISTRATION_APPROVAL_ROLES = ["super_admin", "hrd", "pimpinan"];

// DMS_ACCESS_ROLES: siapa yang boleh membuka menu "Manajemen Dokumen"
// (browser institusi-lebar untuk surat/slip yang sudah di-generate).
// Beda dari REGISTRATION_APPROVAL_ROLES (bendahara_umum ikut di sini,
// tidak di situ) -- lihat RLS generated_documents_select (schema_36).
// 'sekretaris' ditambahkan (schema_91) -- role ini wewenangnya KHUSUS
// kelola DMS (lihat is_sekretaris() & generated_documents_select di
// schema_91), jadi menu ini justru menu UTAMA-nya, bukan sekadar ikut
// nebeng seperti bendahara_umum/pimpinan yang aksesnya cuma lihat.
export const DMS_ACCESS_ROLES = ["super_admin", "hrd", "pimpinan", "bendahara_umum", "sekretaris"];

// STUDENT_DB_ACCESS_ROLES (schema_110, 2026-09-01): siapa yang boleh
// membuka menu "Database Santri". Modul ini SENGAJA dibuat TERPISAH
// dari domain data pegawai (bukan bagian SISAF/Portal Santri) --
// tabel `student_database_records` berdiri sendiri, tidak berelasi FK
// ke `employees` atau tabel santri manapun. Dibatasi super_admin/hrd
// (staf administrasi) sebagai default -- BUKAN permintaan eksplisit
// pengguna, pilih pola paling dekat dengan DMS_ACCESS_ROLES/
// REGISTRATION_APPROVAL_ROLES karena sifatnya sama-sama data
// administratif institusi. Longgarkan/persempit di sini kalau perlu.
export const STUDENT_DB_ACCESS_ROLES = ["super_admin", "hrd"];

// HR_COST_ACCESS_ROLES: siapa yang boleh membuka "Analisis Biaya SDM" —
// sama persis dengan DMS_ACCESS_ROLES (super_admin/hrd/pimpinan/
// bendahara_umum), konsisten dengan RLS getHrCostAnalysis() dan filter
// is_bendahara()/is_pimpinan()/is_hrd()/is_super_admin() di schema_40.
export const HR_COST_ACCESS_ROLES = ["super_admin", "hrd", "pimpinan", "bendahara_umum"];

// EXEC_DASHBOARD_ROLES: siapa yang boleh membuka "Ringkasan Eksekutif" --
// satu halaman lintas-modul (kehadiran+cuti+kinerja+biaya SDM) khusus
// Pimpinan untuk pengambilan keputusan cepat. super_admin ikut diberi akses
// (pola konsisten dengan menu "khusus" lain di sidebar -- selalu
// super_admin + peran fungsionalnya, bukan peran fungsional sendirian).
export const EXEC_DASHBOARD_ROLES = ["super_admin", "pimpinan"];

// AUDIT_ROLES: yang boleh membuka halaman Audit Log (permission audit_logs.view
// di schema.sql — hanya super_admin & pimpinan).
export const AUDIT_ROLES = ["super_admin", "pimpinan"];

// SYSTEM_HEALTH_ROLES (schema_100, R4 audit 2026-08-30): yang boleh
// melihat kartu "Kesehatan Sistem" (monitoring Edge Function) di
// Dashboard. SENGAJA super_admin+hrd, BUKAN sama dengan EXEC_DASHBOARD_
// ROLES (pimpinan) -- ini masalah teknis operasional (siapa yang akan
// menindaklanjuti error Edge Function), bukan info eksekutif strategis.
// Konsisten dengan RLS SELECT edge_function_invocation_log & pengecekan
// role internal get_edge_function_health() di migrasi yang sama.
export const SYSTEM_HEALTH_ROLES = ["super_admin", "hrd"];

// ADD_EMPLOYEE_ROLES (klien): role yang boleh melihat/memakai tombol
// "＋ Tambah Pegawai" (membuat baris pegawai BARU). Ini HANYA kenyamanan
// UI (sembunyikan tombol yang toh akan ditolak server) — otoritas
// sesungguhnya ada di RLS employees_insert di schema.sql: HANYA
// super_admin & hrd (kepala_bagian SENGAJA tidak diikutkan — keputusan
// eksplisit, kepala_bagian tidak lagi boleh menambah pegawai baru sama
// sekali, bahkan di departemennya sendiri).
export const ADD_EMPLOYEE_ROLES = ["super_admin", "hrd"];

// EDIT_EMPLOYEE_ROLES (klien): role yang boleh mengubah field kepegawaian
// (position/unit/department_id/supervisor_id/employment_status/
// contract_type/join_date — persis field di tab "Kepegawaian"). KEPUTUSAN
// DIPERBARUI (sebelumnya kepala_bagian ikut, pimpinan tidak): sekarang
// HANYA super_admin, hrd, pimpinan. kepala_bagian tetap lolos RLS
// employees_update untuk baris departemennya (field LAIN seperti
// personal_info/contact_info tidak terpengaruh), TAPI trigger
// employees_protect_privileged_fields di database (lihat schema_25)
// sekarang menolak kepala_bagian kalau field kepegawaian yang diubah —
// otoritas sesungguhnya selalu di trigger itu, array ini cuma
// menentukan kapan field ditampilkan aktif/disabled di UI.
export const EDIT_EMPLOYEE_ROLES = ["super_admin", "hrd", "pimpinan"];

// SELF_SERVICE_ROLES: role yang HANYA boleh melihat halaman profil diri
// sendiri setelah login — tanpa nav aplikasi (Dashboard, Pegawai,
// Struktur Organisasi, dst sama sekali tidak ditampilkan), sesuai
// keputusan eksplisit (bukan cuma kenyamanan UI — lihat guard di
// goto() dan applyLoggedInProfile). 'guru' disertakan karena statusnya
// sama seperti 'pegawai': terhubung employee_id, menerima gaji, tidak
// punya tanggung jawab administratif lintas-pegawai. 'tendik' (Tenaga
// Kependidikan, schema_82) ditambahkan dengan wewenang IDENTIK dengan
// 'pegawai'/'guru' -- role terpisah supaya bisa dibedakan pelaporan,
// tapi bukan role administratif, jadi tetap mode swalayan.
export const SELF_SERVICE_ROLES = ["pegawai", "guru", "tendik"];

// --- Ditambahkan di Tahap 2 (P3.1) ---
// PENTING soal duplikasi yang DISENGAJA di bawah ini: app.js LAMA masih
// mendeklarasikan HISTORY_TYPE_LABEL (baris ~2737) dan
// PAYROLL_WRITER_ROLES (baris ~4805) sendiri sebagai `const` level-atas.
// Karena app.js masih berupa <script> klasik (bukan module) selama masa
// transisi, `const`/`let` level-atasnya TIDAK menjadi properti `window`
// (beda dengan `function`, yang otomatis jadi window.namaFungsi) --
// jadi modul ES baru (mis. employees.js) tidak bisa membacanya lewat
// `window.HISTORY_TYPE_LABEL`. Solusinya: definisi kanonis untuk modul
// BARU ada di sini, sedangkan app.js LAMA sengaja TIDAK diubah/dihapus
// agar kode lama yang belum sempat dimigrasi (mis. employee-profile.js
// tahap berikutnya) tetap berjalan dari salinannya sendiri. Kedua
// salinan ini HARUS dihapus salah satunya (yang di app.js) begitu
// seluruh pemakainya sudah pindah ke modul ES -- lihat
// docs/MIGRATION_ES_MODULES.md.
export const HISTORY_TYPE_LABEL = { promosi: 'Promosi', mutasi: 'Mutasi', reward: 'Penghargaan', punishment: 'Sanksi' };
export const PAYROLL_WRITER_ROLES = ['super_admin', 'pimpinan', 'bendahara_umum'];

// --- Ditambahkan di Tahap 4 (P3.1) ---
// Duplikasi DISENGAJA yang SAMA seperti HISTORY_TYPE_LABEL/PAYROLL_WRITER_ROLES
// di atas (alasan identik: const level-atas tidak jadi properti window di
// script klasik). Masing-masing masih punya definisi kanonis LAMA di app.js
// yang dipertahankan untuk modul yang BELUM dimigrasi:
//   ATTENDANCE_STATUS_LABEL/BADGE  -- app.js ~baris 3481 -- dipakai attendance.js
//   LEAVE_STATUS_LABEL/BADGE       -- app.js ~baris 6262 -- dipakai leave.js
//   PAYROLL_VIEWER_ROLES           -- app.js ~baris 4808 -- dipakai payroll.js
//   PAYSLIP_STATUS_LABEL/BADGE     -- app.js ~baris 4814 -- dipakai payroll.js
//   PERF_STATUS_LABEL/BADGE        -- app.js ~baris 3658 -- dipakai performance.js
// employee-profile.js (Tahap 4) butuh semuanya lebih awal (ditampilkan di
// tab Absensi/Cuti/Kinerja/Payroll profil pegawai) sebelum modul aslinya
// masing-masing dimigrasi. JANGAN hapus salinan di app.js sampai modul
// terkait (attendance.js/leave.js/payroll.js/performance.js) selesai.
export const ATTENDANCE_STATUS_LABEL = {
  present: 'Hadir', late: 'Terlambat', absent: 'Tanpa Keterangan',
  sick: 'Sakit', permit: 'Izin', leave: 'Cuti', holiday: 'Libur',
};
export const ATTENDANCE_STATUS_BADGE = {
  present: 'success', late: 'warning', absent: 'danger',
  sick: 'neutral', permit: 'neutral', leave: 'info', holiday: 'neutral',
};
export const LEAVE_STATUS_LABEL = {
  pending_kabag: 'Menunggu Kepala Bagian', pending_pimpinan: 'Menunggu Pimpinan',
  approved: 'Disetujui', rejected: 'Ditolak', cancelled: 'Dibatalkan',
};
export const LEAVE_STATUS_BADGE = {
  pending_kabag: 'warning', pending_pimpinan: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral',
};
export const PAYROLL_VIEWER_ROLES = ['super_admin', 'hrd', 'pimpinan', 'bendahara_umum'];
export const PAYSLIP_STATUS_LABEL = { draft: 'Draft', finalized: 'Difinalisasi', paid: 'Dibayar' };
export const PAYSLIP_STATUS_BADGE = { draft: 'neutral', finalized: 'warning', paid: 'success' };
export const PERF_STATUS_LABEL = {
  draft: 'Menunggu Penilaian Diri', self_done: 'Menunggu Atasan',
  atasan_done: 'Menunggu Finalisasi HRD', finalized: 'Selesai',
};
export const PERF_STATUS_BADGE = { draft: 'warning', self_done: 'warning', atasan_done: 'warning', finalized: 'success' };

// --- Ditambahkan di Tahap 9 (P3.1) ---
// MONTH_NAMES & PERIOD_STATUS_LABEL: BEDA dari duplikasi lain di atas --
// ini PERTAMA KALI dibuat kanonis di sini (bukan sekadar menyalin
// duplikat yang sudah ada sejak Tahap 4). Definisi asli tetap di app.js
// baris ~4836-4837 dengan komentar penanda baru (P3.1 Tahap 9), karena
// reports.js & modul lain yang belum dimigrasi (lihat app.js ~5623,
// ~6490, ~6557, ~6565, ~6596, ~6730 untuk MONTH_NAMES; ~5623, ~8130
// untuk PERIOD_STATUS_LABEL) masih membacanya sebagai const global
// classic-script. JANGAN hapus salinan app.js sampai SEMUA pemakai itu
// juga selesai dimigrasi.
export const MONTH_NAMES = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const PERIOD_STATUS_LABEL = { open: 'Terbuka', processing: 'Diproses', finalized: 'Difinalisasi', paid: 'Dibayar' };

// --- Ditambahkan di Tahap 12 (P3.1) ---
// PAYROLL_PERIOD_STATUS_LABEL: pola SAMA seperti MONTH_NAMES/
// PERIOD_STATUS_LABEL di atas (pertama kali dibuat kanonis di sini,
// bukan duplikat lama sejak Tahap 4) -- DAN bukan sekadar alias
// PERIOD_STATUS_LABEL: label teksnya SENGAJA BEDA untuk status
// 'open' ("Belum Dihitung" di sini vs "Terbuka" di PERIOD_STATUS_LABEL),
// ditemukan sebagai 2 const terpisah yang sudah ada sejak sebelum
// migrasi P3.1, BUKAN kesalahan migrasi -- tidak disatukan di sini,
// murni dipindah apa adanya. Definisi asli tetap di app.js baris
// ~8133 dengan komentar penanda baru (P3.1 Tahap 12), karena
// renderPayrollReportCard() (app.js ~5615-5631, kandidat reports.js,
// belum dimigrasi) masih membacanya sebagai const global classic-
// script. JANGAN hapus salinan app.js sampai reports.js selesai.
export const PAYROLL_PERIOD_STATUS_LABEL = { open: 'Belum Dihitung', processing: 'Diproses', finalized: 'Terkunci', paid: 'Dibayar' };

// --- Ditambahkan di Tahap 15 (P3.1) ---
// COMPETENCY_TYPE_LABEL: BEDA dari pola promosi lain di atas -- ini
// BUKAN duplikat app.js-vs-modul-ES (yang lama tetap di app.js untuk
// kompatibilitas kode belum-dimigrasi). Ini duplikat ANTAR-MODUL ES:
// employee-profile.js (Tahap 4) sudah lama punya salinan lokal TIDAK
// diekspor (`const COMPETENCY_TYPE_LABEL` di dalam modul itu sendiri,
// dipakai `renderCompetenciesList()`). documents-print.js (Tahap 15)
// butuh objek yang SAMA PERSIS untuk `printEmployeeProfile()`.
// Daripada documents-print.js membuat salinan ketiga (app.js ~baris
// 2510 tetap salinan asli untuk kode belum-dimigrasi seperti fungsi
// ekspor xlsx Backup Bulanan ~baris 6676), dipromosikan jadi kanonis
// di sini SATU KALI -- employee-profile.js JUGA diperbarui untuk
// `import` dari sini alih-alih menyimpan salinan lokalnya sendiri
// (perubahan kecil ke modul yang sudah selesai, aman: nilai objek
// identik, tidak mengubah perilaku apa pun, murni dedup internal
// antar modul ES -- BEDA dari kebijakan "jangan hapus salinan app.js"
// yang berlaku untuk kompatibilitas classic-script, bukan untuk
// modul ES yang sudah saling `import`).
export const COMPETENCY_TYPE_LABEL = { skill: 'Keahlian', bahasa: 'Bahasa', pelatihan: 'Pelatihan' };
