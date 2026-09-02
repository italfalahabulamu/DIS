/* ============================================================
   mockDataService.js
   Implementasi dataService untuk MODE DEMO — seluruh data ada di
   memori browser (hilang saat refresh), tidak ada request jaringan
   sama sekali. Tujuannya: menguji tampilan & alur kerja tanpa perlu
   project Supabase siap dulu.

   PENTING: password di sini disimpan sebagai teks biasa dan hanya
   dicocokkan langsung di browser. Ini SAMA SEKALI TIDAK AMAN dan
   hanya boleh ada di mode demo — jangan pernah meniru pola ini saat
   menyambungkan ke backend sungguhan (lihat supabaseDataService.js
   untuk pola yang benar: hash password dikelola oleh Supabase Auth,
   tidak pernah terlihat di kode aplikasi).

   PENTING #2: scoping departemen (kepala_bagian hanya lihat departemen
   sendiri, guru/pegawai hanya lihat data sendiri) DITIRU secara manual
   di sini lewat filter JS, murni supaya mode demo terasa sama seperti
   mode Supabase. Ini BUKAN kontrol keamanan nyata — di mode Supabase,
   scoping yang sesungguhnya ditegakkan oleh RLS di database (lihat
   schema.sql), bukan oleh kode ini. Kalau logika di sini dan RLS di
   schema.sql suatu saat berbeda, RLS yang benar; ini cuma tiruannya.
   ============================================================ */

const MOCK_DELAY_MS = 250; // simulasi latensi jaringan agar terasa realistis di UI

function delay(value) {
  return new Promise(resolve => setTimeout(() => resolve(value), MOCK_DELAY_MS));
}
function uid(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 10);
}

let mockDepartments = [
  { id: uid('dept'), code: 'YAYASAN', name: 'Yayasan' },
  { id: uid('dept'), code: 'PIMPINAN', name: 'Pimpinan Pesantren' },
  { id: uid('dept'), code: 'SMP', name: 'SMP' },
  { id: uid('dept'), code: 'SMA', name: 'SMA' },
  { id: uid('dept'), code: 'KEUANGAN', name: 'Keuangan' },
  { id: uid('dept'), code: 'SDM', name: 'SDM' },
  { id: uid('dept'), code: 'HUMAS', name: 'Humas' },
  { id: uid('dept'), code: 'SARPRAS', name: 'Sarana Prasarana' },
  { id: uid('dept'), code: 'IT', name: 'IT' },
  { id: uid('dept'), code: 'UNIT_USAHA', name: 'Unit Usaha' },
];
const deptId = (code) => mockDepartments.find(d => d.code === code).id;

// Shift kerja (schema_67) — meniru RLS shifts_select/insert/update/delete:
// semua profil login boleh baca, hanya super_admin/hrd boleh tulis, hanya
// super_admin boleh hapus.
let mockShifts = [
  {
    id: uid('shift'), name: 'Shift Reguler', start_time: '07:30', end_time: '16:00',
    late_grace_minutes: 15, early_out_grace_minutes: 15, earliest_check_in: '06:00',
    working_days: ['senin', 'selasa', 'rabu', 'kamis', 'jumat'], is_default: true,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
];

// Struktur Jabatan (mock, offline demo) — cerminan ringan dari tabel
// `positions` produksi (schema_46). Dipakai supaya mode demo tidak error
// saat memuat dropdown Jabatan/Atasan Langsung, BUKAN untuk akurasi penuh
// bagan organisasi (lihat orgReferenceData.js untuk itu).
let mockPositions = (() => {
  const mk = (code, name, parentCode) => ({ id: uid('pos'), code, name, parent_position_id: null, _parentCode: parentCode });
  const list = [
    mk('PIMPINAN_PESANTREN', 'Pimpinan Pesantren', null),
    mk('SEKRETARIAT_PESANTREN', 'Sekretariat Pesantren', 'PIMPINAN_PESANTREN'),
    mk('BENDAHARA_UMUM', 'Bendahara Umum Pesantren', 'PIMPINAN_PESANTREN'),
    mk('KEPALA_SEKOLAH', 'Kepala Sekolah', 'PIMPINAN_PESANTREN'),
    mk('PENGASUHAN_SANTRI', 'Pengasuhan Santri', 'PIMPINAN_PESANTREN'),
    mk('WAKASEK_AKADEMIK', 'Wakil Kepala Sekolah Bidang Akademik', 'KEPALA_SEKOLAH'),
    mk('WAKASEK_KESISWAAN', 'Wakil Kepala Sekolah Bidang Kesiswaan', 'KEPALA_SEKOLAH'),
    mk('WAKASEK_SARPRAS', 'Wakil Kepala Sekolah Bidang Sarana Prasarana', 'KEPALA_SEKOLAH'),
    mk('WALI_KELAS', 'Wali Kelas', 'WAKASEK_KESISWAAN'),
  ];
  const byCode = new Map(list.map(p => [p.code, p]));
  list.forEach(p => { if (p._parentCode) p.parent_position_id = byCode.get(p._parentCode).id; delete p._parentCode; });
  return list;
})();

let mockEmployees = [
  { id: uid('emp'), employee_code: 'AF-2019-014', full_name: 'Ahmad Fauzi, S.Pd.I', position: 'Kepala Bidang Tahfidz', unit: 'Tahfidz Putra', department_id: deptId('SMA'), employment_status: 'active', contract_type: 'tetap', join_date: '2019-07-14', created_at: '2024-01-10T00:00:00Z',
    personal_info: { full_name: 'Ahmad Fauzi', title: 'S.Pd.I', nik: '1108019905900001', birth_place_date: 'Banda Aceh, 03 Mei 1990', npwp: '', gender: 'Laki-laki' },
    emergency_contact: { name: 'Fitri Rahmawati', relation: 'Istri', phone: '0813-9001-9014' },
    contact_info: { phone: '0812-6001-0014', personal_email: 'ahmad.fauzi@gmail.com', office_email: 'ahmad.fauzi@alfalahabulamu.sch.id', address: 'Jl. Abu Lam U, Gampong Lambaro, Aceh Besar' } },
  { id: uid('emp'), employee_code: 'AF-2021-027', full_name: 'Siti Hardiyanti', position: 'Kepala Bagian SDM', unit: 'Administrasi', department_id: deptId('SDM'), employment_status: 'active', contract_type: 'tetap', join_date: '2021-03-02', created_at: '2024-01-09T00:00:00Z',
    personal_info: { full_name: 'Siti Hardiyanti', title: '', nik: '1108026503960002', birth_place_date: 'Sigli, 25 Maret 1996', npwp: '', gender: 'Perempuan' },
    emergency_contact: { name: 'Budi Hardiyanto', relation: 'Ayah', phone: '0813-6002-9027' },
    contact_info: { phone: '0813-6002-0027', personal_email: 'siti.hardiyanti@gmail.com', office_email: 'siti.hardiyanti@alfalahabulamu.sch.id', address: 'Banda Aceh' } },
  { id: uid('emp'), employee_code: 'AF-2022-041', full_name: 'Muhammad Rizki, S.Pd', position: 'Guru Akademik', unit: 'Akademik', department_id: deptId('SMA'), employment_status: 'active', contract_type: 'kontrak', join_date: '2022-08-15', created_at: '2024-01-08T00:00:00Z' },
  { id: uid('emp'), employee_code: 'AF-2020-019', full_name: 'Nurul Huda, S.E', position: 'Staff Keuangan', unit: 'Finance', department_id: deptId('KEUANGAN'), employment_status: 'active', contract_type: 'tetap', join_date: '2020-05-20', created_at: '2024-01-07T00:00:00Z',
    personal_info: { full_name: 'Nurul Huda', title: 'S.E', nik: '1108036801880004', birth_place_date: 'Meulaboh, 18 Januari 1988', npwp: '', gender: 'Perempuan' },
    emergency_contact: { name: 'Ilham Fadli', relation: 'Suami', phone: '0815-6004-9019' },
    contact_info: { phone: '0815-6004-0019', personal_email: 'nurul.huda@gmail.com', office_email: 'nurul.huda@alfalahabulamu.sch.id', address: 'Banda Aceh' } },
  { id: uid('emp'), employee_code: 'AF-2023-055', full_name: 'Dedi Kurniawan', position: 'Guru Tahfidz', unit: 'Tahfidz Putra', department_id: deptId('SMP'), employment_status: 'active', contract_type: 'kontrak', join_date: '2023-11-01', created_at: '2024-01-06T00:00:00Z' },
  { id: uid('emp'), employee_code: 'AF-2018-006', full_name: 'Ust. H. Muhammad Yusuf, Lc', position: 'Pimpinan Yayasan', unit: 'Pimpinan', department_id: deptId('PIMPINAN'), employment_status: 'active', contract_type: 'tetap', join_date: '2018-01-10', created_at: '2024-01-05T00:00:00Z',
    personal_info: { full_name: 'Muhammad Yusuf', title: 'Lc', nik: '1108014502750006', birth_place_date: 'Banda Aceh, 05 Februari 1975', npwp: '', gender: 'Laki-laki' },
    emergency_contact: { name: 'Ainul Mardhiah', relation: 'Istri', phone: '0817-6006-9006' },
    contact_info: { phone: '0817-6006-0006', personal_email: 'm.yusuf@gmail.com', office_email: 'm.yusuf@alfalahabulamu.sch.id', address: 'Banda Aceh' } },
];

// Akun login demo. `employee_id` menghubungkan akun guru/pegawai ke baris
// employees miliknya sendiri (dipakai untuk scoping "lihat data sendiri").
let mockProfiles = [
  // employee_id DITAUTKAN (bukan null) supaya akun admin bisa menguji
  // SEMUA fitur "layanan diri" (check-in/out Kehadiran, ajukan Cuti, lihat
  // Slip Gaji sendiri, isi Penilaian Diri di Kinerja, dst.) — sebelumnya
  // employee_id:null MEMBLOKIR TOTAL fitur-fitur ini di app.js (lihat
  // renderTodayAttendance/dst: "Akun Anda tidak tertaut ke data pegawai")
  // walau role super_admin SUDAH melewati semua RLS/trigger lain. RLS
  // sendiri sudah memberi super_admin wewenang penuh di HAMPIR SEMUA
  // policy (lihat schema.sql/schema_02/03/07/08/11/23 — pola
  // "is_super_admin() or ..." konsisten di seluruh migrasi) — satu-satunya
  // yang bukan soal wewenang tapi soal DATA: fitur "milik saya sendiri"
  // butuh employee_id yang valid, terlepas dari role setinggi apa pun.
  // Dipilih employee mockEmployees[0] (Ahmad Fauzi) karena satu-satunya
  // yang belum tertaut ke akun demo mana pun dan datanya paling lengkap.
  { id: uid('usr'), username: 'admin', email: 'admin@alfalahabulamu.sch.id', full_name: 'Super Admin', role: 'super_admin', department_id: null, employee_id: mockEmployees[0].id, status: 'active', two_factor_enabled: false, last_login_at: null, created_at: '2024-01-01T00:00:00Z', _password: 'admin123' },
  { id: uid('usr'), username: 'hrd.demo', email: 'hrd.demo@alfalahabulamu.sch.id', full_name: 'Staff HRD', role: 'hrd', department_id: null, employee_id: null, status: 'active', two_factor_enabled: false, last_login_at: null, created_at: '2024-01-02T00:00:00Z', _password: 'password123' },
  { id: uid('usr'), username: 'yusuf.pimpinan', email: 'yusuf.pimpinan@alfalahabulamu.sch.id', full_name: 'Ust. H. Muhammad Yusuf, Lc', role: 'pimpinan', department_id: null, employee_id: mockEmployees[5].id, status: 'active', two_factor_enabled: false, last_login_at: null, created_at: '2024-01-02T00:00:00Z', _password: 'password123' },
  { id: uid('usr'), username: 'nurul.huda', email: 'nurul.huda@alfalahabulamu.sch.id', full_name: 'Nurul Huda, S.E', role: 'bendahara_umum', department_id: null, employee_id: mockEmployees[3].id, status: 'active', two_factor_enabled: false, last_login_at: null, created_at: '2024-01-03T00:00:00Z', _password: 'password123' },
  { id: uid('usr'), username: 'siti.hardiyanti', email: 'siti.hardiyanti@alfalahabulamu.sch.id', full_name: 'Siti Hardiyanti', role: 'kepala_bagian', department_id: deptId('SDM'), employee_id: mockEmployees[1].id, status: 'active', two_factor_enabled: false, last_login_at: null, created_at: '2024-01-04T00:00:00Z', _password: 'password123' },
  { id: uid('usr'), username: 'dedi.kurniawan', email: 'dedi.kurniawan@alfalahabulamu.sch.id', full_name: 'Dedi Kurniawan', role: 'guru', department_id: null, employee_id: mockEmployees[4].id, status: 'active', two_factor_enabled: false, last_login_at: null, created_at: '2024-01-05T00:00:00Z', _password: 'password123' },
  // employee_id ditautkan (bukan null) karena pegawai TETAP menerima gaji
  // seperti role lain — konsisten dengan yusuf.pimpinan/nurul.huda/
  // siti.hardiyanti/dedi.kurniawan yang sudah tertaut sejak awal. Hanya
  // admin (khusus untuk pengujian) dan hrd.demo yang sengaja TIDAK
  // ditautkan — HRD murni peran administratif sistem, tidak mewakili
  // pegawai yang menerima gaji di institusi ini.
  { id: uid('usr'), username: 'pegawai.demo', email: 'pegawai.demo@alfalahabulamu.sch.id', full_name: 'Akun Pegawai Demo', role: 'pegawai', department_id: null, employee_id: mockEmployees[2].id, status: 'pending', two_factor_enabled: false, last_login_at: null, created_at: '2024-01-06T00:00:00Z', _password: 'password123' },
];

let mockSessionProfileId = null;
let mockAuditLogs = [];
// Dokumen mode demo — file sungguhan TIDAK disimpan (browser tidak boleh
// menyimpan Blob besar tanpa batas di memori tab), cuma metadata + Object
// URL sementara (hilang begitu tab ditutup/refresh, sama seperti data mock
// lain). Cukup untuk menguji alur UI, bukan pengganti test upload sungguhan
// ke Supabase Storage.
let mockDocuments = [];

// Seed sama persis dengan insert di schema_03_attendance_leave_payroll.sql
// supaya mode demo dan mode Supabase konsisten.
let mockLeaveTypes = [
  { id: uid('lt'), code: 'tahunan', name: 'Cuti Tahunan', default_days_per_year: 12, is_paid: true, max_days_per_request: 6, notes: 'Sisa hari cuti hangus di akhir tahun. Wajib masa kerja minimal 1 tahun.' },
  { id: uid('lt'), code: 'sakit', name: 'Cuti Sakit', default_days_per_year: null, is_paid: true, max_days_per_request: null, notes: 'Wajib surat dokter jika lebih dari 2 hari.' },
  { id: uid('lt'), code: 'melahirkan', name: 'Cuti Melahirkan', default_days_per_year: null, is_paid: true, max_days_per_request: 90, notes: 'Termasuk cuti sebelum melahirkan, maksimal 1,5 bulan dari total 90 hari. Khusus SDM perempuan yang sudah menikah sah.' },
  { id: uid('lt'), code: 'besar', name: 'Cuti Besar/Ibadah', default_days_per_year: null, is_paid: true, max_days_per_request: null, notes: null },
  { id: uid('lt'), code: 'tanpa_gaji', name: 'Cuti Tanpa Gaji', default_days_per_year: null, is_paid: false, max_days_per_request: null, notes: 'Maksimal 6 bulan tanpa gaji. Wajib persetujuan Pimpinan, untuk alasan mendesak, khusus Pegawai Tetap dengan masa kerja minimal 5 tahun.' },
  // BARU (schema_31, langkah 1 dari 4 penyelarasan Tabel Peraturan Cuti
  // resmi institusi — lihat percakapan): 3 jenis Pasal 1 yang sebelumnya
  // tidak ada sama sekali.
  { id: uid('lt'), code: 'keguguran', name: 'Cuti Keguguran', default_days_per_year: null, is_paid: true, max_days_per_request: 45, notes: 'Wajib surat dokter/bidan. Khusus SDM perempuan.' },
  { id: uid('lt'), code: 'ayah', name: 'Cuti Ayah (Paternity)', default_days_per_year: null, is_paid: true, max_days_per_request: 15, notes: 'Untuk SDM laki-laki yang istrinya melahirkan. Harus diajukan sebelum kelahiran jika memungkinkan.' },
  { id: uid('lt'), code: 'iddah', name: 'Cuti Iddah', default_days_per_year: null, is_paid: true, max_days_per_request: 90, notes: 'Diberikan atas meninggalnya suami. Khusus pegawai perempuan.' },
  // BARU (schema_31): 8 sub-jenis Pasal 2 "Cuti Khusus" — dipecah jadi
  // jenis tersendiri, bukan ditumpuk ke 'besar'.
  { id: uid('lt'), code: 'khusus_nikah_sendiri', name: 'Cuti Khusus: Pernikahan Sendiri', default_days_per_year: null, is_paid: true, max_days_per_request: 3, notes: 'Bukti: undangan / surat nikah.' },
  { id: uid('lt'), code: 'khusus_nikah_anak', name: 'Cuti Khusus: Pernikahan Anak Kandung', default_days_per_year: null, is_paid: true, max_days_per_request: 2, notes: 'Bukti: undangan pernikahan.' },
  { id: uid('lt'), code: 'khusus_duka_inti', name: 'Cuti Khusus: Kematian Pasangan/Anak/Orang Tua', default_days_per_year: null, is_paid: true, max_days_per_request: 3, notes: 'Bukti: surat keterangan kematian.' },
  { id: uid('lt'), code: 'khusus_duka_lain', name: 'Cuti Khusus: Kematian Mertua/Saudara Kandung', default_days_per_year: null, is_paid: true, max_days_per_request: 2, notes: 'Bukti: surat keterangan kematian.' },
  { id: uid('lt'), code: 'khusus_haji', name: 'Cuti Khusus: Ibadah Haji (Pertama Kali)', default_days_per_year: null, is_paid: true, max_days_per_request: 40, notes: 'Bukti: bukti ONH/BPIH + dokumen keberangkatan.' },
  { id: uid('lt'), code: 'khusus_umrah', name: 'Cuti Khusus: Ibadah Umrah', default_days_per_year: null, is_paid: true, max_days_per_request: 7, notes: 'Bukti: tiket + visa umrah.' },
  { id: uid('lt'), code: 'khusus_ujian', name: 'Cuti Khusus: Ujian Resmi (S1/S2/S3)', default_days_per_year: null, is_paid: true, max_days_per_request: null, notes: 'Hak cuti = hari ujian + 1 hari, sesuai jadwal ujian resmi dari institusi pendidikan.' },
  { id: uid('lt'), code: 'khusus_khitan_nikah_dekat', name: 'Cuti Khusus: Khitanan/Pernikahan Saudara Dekat', default_days_per_year: null, is_paid: true, max_days_per_request: 1, notes: 'Bukti: informasi resmi dari pemohon.' },
];
const leaveTypeId = (code) => mockLeaveTypes.find(t => t.code === code).id;

// Saldo awal tahun berjalan — hanya cuti tahunan yang berbasis kuota.
const CURRENT_YEAR = new Date().getFullYear();
let mockLeaveBalances = mockEmployees.map(e => ({
  id: uid('lb'), employee_id: e.id, leave_type_id: leaveTypeId('tahunan'), year: CURRENT_YEAR,
  allocated_days: 12, used_days: 0,
}));

let mockLeaveRequests = [];
let mockAttendance = []; // { id, employee_id, attendance_date, check_in, check_out, status, notes, corrected_by_profile_id }

// Kegiatan Lembaga (mock, meniru tabel institutional_events schema_70).
// Sedikit data contoh supaya kalender di mode demo tidak kosong.
let mockInstitutionalEvents = [
  {
    id: uid('event'), title: 'Rapat Koordinasi Bulanan', description: 'Seluruh kepala bagian & pimpinan',
    category: 'umum', start_date: `${CURRENT_YEAR}-${String(new Date().getMonth() + 1).padStart(2, '0')}-05`,
    end_date: `${CURRENT_YEAR}-${String(new Date().getMonth() + 1).padStart(2, '0')}-05`,
    created_by_profile_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: uid('event'), title: 'Ujian Tengah Semester', description: null,
    category: 'akademik', start_date: `${CURRENT_YEAR}-${String(new Date().getMonth() + 1).padStart(2, '0')}-12`,
    end_date: `${CURRENT_YEAR}-${String(new Date().getMonth() + 1).padStart(2, '0')}-16`,
    created_by_profile_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
];

// Seed sama persis dengan insert di schema_08_performance_reviews.sql.
let mockPerfCriteria = [
  { id: uid('pc'), code: 'kedisiplinan', name: 'Kedisiplinan', description: 'Ketepatan waktu, kehadiran, kepatuhan pada aturan lembaga', is_active: true },
  { id: uid('pc'), code: 'kualitas_kerja', name: 'Kualitas Kerja', description: 'Ketelitian, hasil kerja sesuai standar yang diharapkan', is_active: true },
  { id: uid('pc'), code: 'kerjasama', name: 'Kerjasama Tim', description: 'Kolaborasi dengan rekan kerja dan unit lain', is_active: true },
  { id: uid('pc'), code: 'inisiatif', name: 'Inisiatif & Tanggung Jawab', description: 'Proaktif menyelesaikan masalah tanpa selalu diarahkan', is_active: true },
  { id: uid('pc'), code: 'nilai_pesantren', name: 'Keteladanan & Nilai Pesantren', description: 'Kesesuaian sikap dengan nilai-nilai yang dijunjung lembaga', is_active: true },
];
let mockPerfPeriods = [
  { id: uid('pp'), code: '2026-Q1', name: 'Triwulan 1 2026', start_date: '2026-01-01', end_date: '2026-03-31', status: 'open' },
];
let mockPerfReviews = [];
let mockPerfScores = [];
// schema_46 — Capaian & Output / Tingkat Keberhasilan disimpan langsung
// di objek review (achievement_output, success_level, default null).
// Pekerjaan Belum Selesai adalah tabel anak terpisah:
// { id, review_id, task_name, initial_target, progress, obstacle,
//   follow_up_plan, new_deadline, status, created_at, updated_at,
//   created_by, updated_by }
let mockPerfPendingTasks = [];

// ---- Indeks Beban vs Kompensasi (schema_77) ----
// task_weight_categories: { id, department_id (null=umum), name, base_weight (1-5),
//   description, is_active, created_at, updated_at, created_by, updated_by }
let mockTaskWeightCategories = [
  { id: uid('twc'), department_id: null, name: 'Administrasi rutin', base_weight: 1, description: 'Tugas administratif harian, contoh: absensi, jurnal.', is_active: true, created_at: '2026-08-22T00:00:00Z', updated_at: '2026-08-22T00:00:00Z' },
  { id: uid('twc'), department_id: null, name: 'Koordinasi lintas unit', base_weight: 2, description: 'Rapat koordinasi, komunikasi antar bagian.', is_active: true, created_at: '2026-08-22T00:00:00Z', updated_at: '2026-08-22T00:00:00Z' },
  { id: uid('twc'), department_id: null, name: 'Proyek/program baru', base_weight: 4, description: 'Merancang atau menjalankan program yang belum pernah ada.', is_active: true, created_at: '2026-08-22T00:00:00Z', updated_at: '2026-08-22T00:00:00Z' },
];
// performance_review_completed_tasks: { id, review_id, category_id, task_name,
//   completed_date, weight_base, weight_adjustment, adjustment_reason,
//   adjusted_by, adjusted_at, created_at, updated_at, created_by, updated_by }
let mockPerfCompletedTasks = [];

// ---- Laporan Kinerja Bulanan (schema_94) ----
let mockMonthlyReports = [];
let mockMonthlyReportCompleted = [];
let mockMonthlyReportPending = [];
let mockMonthlyReportSeq = 1;
const PERF_SUCCESS_LEVELS = [
  'selesai_sesuai_target', 'hampir_seluruh_target', 'sebagian_besar_tercapai',
  'sebagian_kecil_tercapai', 'belum_memenuhi_target',
];
// Status "Pekerjaan Belum Selesai" -- kolom sudah ada di DB sejak
// schema_46 (default 'berjalan' + CHECK constraint), baru dipaparkan
// ke UI sekarang. Daftar ini harus PERSIS sama dengan CHECK constraint
// performance_review_pending_tasks_status_check.
const PERF_TASK_STATUSES = ['selesai', 'berjalan', 'tertunda', 'terhambat', 'dibatalkan'];
let mockEducation = [];
let mockCertifications = [];
let mockCompetencies = [];
let mockGeneratedDocuments = [];
let mockDocNumberCounters = {};
let mockDocumentTemplates = [];
// numbering_format (schema_85): 'type_only' = format lama (urut/KODE/
// romawi/tahun, TIDAK butuh issuing_unit_id) -- SENGAJA cuma dua jenis
// bawaan ini yang begitu (auto-generate dari alur Pengajuan Cuti/
// Payroll sendiri, bukan lewat "Generate Dokumen dari Template").
// Jenis surat lain (dibuat lewat UI, lihat createDocumentLetterType)
// defaultnya 'unit_type' (format urut/KODE_UNIT-KODE_JENIS/romawi/
// tahun, WAJIB issuing_unit_id) -- ini keputusan produk, bukan pilihan
// sistem yang bisa diubah lewat UI (v1).
let mockDocumentLetterTypes = [
  { id: uid('dlt'), type_key: 'surat_cuti', type_code: 'SC', name: 'Surat Cuti', numbering_format: 'type_only', is_active: true, created_at: '2025-01-01T00:00:00Z' },
  { id: uid('dlt'), type_key: 'slip_gaji', type_code: 'SG', name: 'Slip Gaji', numbering_format: 'type_only', is_active: true, created_at: '2025-01-01T00:00:00Z' },
];
// Unit Pengeluar Surat (schema_85) -- 2 unit riil (Pimpinan Pesantren
// & Unit Yayasan) dibuat sebagai master data. Entitas KETIGA (surat
// Cuti/Slip Gaji) SENGAJA TIDAK punya baris di sini -- lihat komentar
// numbering_format di seed mockDocumentLetterTypes, keduanya
// 'type_only' dan tidak pernah menyentuh issuing_unit_id sama sekali.
let mockDocumentIssuingUnits = [
  { id: uid('diu'), code: 'Pimp', name: 'Pimpinan Pesantren', is_active: true, created_at: '2025-01-01T00:00:00Z' },
  { id: uid('diu'), code: 'YAL', name: 'Unit Yayasan', is_active: true, created_at: '2025-01-01T00:00:00Z' },
];

// Database Santri (schema_110, 2026-09-01) -- modul BERDIRI SENDIRI,
// TIDAK berelasi ke employees atau tabel santri manapun. Seed KOSONG
// sengaja -- ini data induk yang harus diinput manual/import, tidak
// ada data contoh yang masuk akal untuk di-hardcode di sini.
let mockStudentDbRecords = [];
// path (string) -> File object, meniru penyimpanan storage privat di
// memori sesi mock -- HILANG saat reload halaman (mock TIDAK persisten
// lintas sesi, sama seperti seluruh mockDataService.js lainnya).
let mockStudentDbAttachmentBlobs = new Map();
let mockPayrollInfo = []; // employee_payroll: { employee_id, bank_name, ..., base_salary }
// Rujukan gaji dasar + tunjangan risiko per amanah (schema_82). Diseed
// meniru contoh skenario asli dari user: Pengasuhan 1.700.000, Bagian
// Bahasa 1.400.000 -- supaya bisa langsung diuji tanpa setup manual.
let mockPositionCompensationReference = [
  { id: uid('pcr'), nama_amanah: 'Pengasuhan', gaji_dasar: 1700000, risk_conflict_care: 0, risk_financial: 0, risk_physical_technical: 0, is_active: true, notes: null, created_at: '2026-08-23T00:00:00Z', updated_at: '2026-08-23T00:00:00Z' },
  { id: uid('pcr'), nama_amanah: 'Bagian Bahasa', gaji_dasar: 1400000, risk_conflict_care: 0, risk_financial: 0, risk_physical_technical: 0, is_active: true, notes: null, created_at: '2026-08-23T00:00:00Z', updated_at: '2026-08-23T00:00:00Z' },
];
// Meniru apply_amanah_compensation() (schema_82) di sisi mock -- SATU
// fungsi dipakai dua arah (pegawai pindah amanah, ATAU nominal rujukan
// berubah) supaya logikanya tidak diduplikasi, sama seperti versi SQL.
function mockApplyAmanahCompensation(employeeId, amanahId) {
  const ref = mockPositionCompensationReference.find(r => r.id === amanahId && r.is_active);
  if (!ref) return; // rujukan tidak ada/nonaktif -- jangan sentuh data gaji yang sudah ada
  let row = mockPayrollInfo.find(p => p.employee_id === employeeId);
  const patch = {
    base_salary: ref.gaji_dasar,
    risk_conflict_care: ref.risk_conflict_care,
    risk_financial: ref.risk_financial,
    risk_physical_technical: ref.risk_physical_technical,
  };
  if (row) {
    Object.assign(row, patch);
    row.total_net_monthly = mockComputeTotalNetMonthly(row);
  } else {
    const newRow = { id: uid('pr'), employee_id: employeeId, fixed_allowance: 0, fixed_bonus: 0, fixed_deduction: 0, ...patch };
    newRow.total_net_monthly = mockComputeTotalNetMonthly(newRow);
    mockPayrollInfo.push(newRow);
  }
}
// Meniru rumus generated column total_net_monthly (schema_43) di sisi
// mock — HARUS tetap sinkron dengan SQL kalau salah satu berubah.
function mockComputeTotalNetMonthly(info) {
  if (!info) return 0;
  return Number(info.base_salary || 0)
    + Number(info.fixed_allowance || 0) + Number(info.fixed_bonus || 0)
    + Number(info.allowance_dual_mandate || 0)
    + Number(info.risk_conflict_care || 0) + Number(info.risk_financial || 0)
    + Number(info.risk_physical_technical || 0) + Number(info.allowance_muqim || 0)
    + Number(info.skill_quran || 0) + Number(info.skill_foreign_language || 0)
    + Number(info.skill_technical_medical_it || 0)
    + Number(info.allowance_spouse || 0) + Number(info.allowance_children || 0)
    - Number(info.fixed_deduction || 0) - Number(info.social_fund_deduction || 0);
}
let mockPayrollPeriods = [];
let mockPayslips = [];
let mockPayslipItems = [];
let mockEmployeeHistory = [];
// Riwayat TERSTRUKTUR (schema_42) — di production diisi otomatis oleh
// trigger DB saat employees/employee_payroll berubah; di mode mock kita
// seed beberapa baris histori supaya grafik analitik di profil pegawai
// tidak kosong saat didemokan, plus dua entri "riwayat" per employee
// dengan end_date terisi (baris lama yang sudah ditutup) supaya bentuk
// datanya representatif terhadap production, bukan cuma satu baris
// "berlaku saat ini".
let mockPositionHistory = [
  { id: uid('poshist'), employee_id: mockEmployees[0].id, position: 'Guru Tahfidz', department_id: deptId('SMA'), unit: 'Tahfidz Putra', employment_status: 'active', contract_type: 'kontrak', effective_date: '2019-07-14', end_date: '2022-01-01', decree_number: null, change_reason: null, created_at: '2019-07-14T00:00:00Z' },
  { id: uid('poshist'), employee_id: mockEmployees[0].id, position: 'Kepala Bidang Tahfidz', department_id: deptId('SMA'), unit: 'Tahfidz Putra', employment_status: 'active', contract_type: 'tetap', effective_date: '2022-01-01', end_date: null, decree_number: 'SK-014/AF/2022', change_reason: 'Promosi jabatan', created_at: '2022-01-01T00:00:00Z' },
];
let mockSalaryHistory = [
  { id: uid('salhist'), employee_id: mockEmployees[0].id, base_salary: 4200000, fixed_allowance: 300000, fixed_bonus: 0, fixed_deduction: 0, effective_date: '2019-07-14', end_date: '2022-01-01', decree_number: null, change_reason: null, created_at: '2019-07-14T00:00:00Z' },
  { id: uid('salhist'), employee_id: mockEmployees[0].id, base_salary: 5500000, fixed_allowance: 500000, fixed_bonus: 0, fixed_deduction: 0, effective_date: '2022-01-01', end_date: '2024-01-01', decree_number: 'SK-014/AF/2022', change_reason: 'Menyertai promosi jabatan', created_at: '2022-01-01T00:00:00Z' },
  { id: uid('salhist'), employee_id: mockEmployees[0].id, base_salary: 6200000, fixed_allowance: 600000, fixed_bonus: 200000, fixed_deduction: 0, effective_date: '2024-01-01', end_date: null, decree_number: null, change_reason: 'Penyesuaian tahunan', created_at: '2024-01-01T00:00:00Z' },
];
let mockNotifications = [];

// Meniru send_notification() (schema_18) — dipanggil di titik yang SAMA
// PERSIS dengan trigger SQL (INSERT/UPDATE status pada leave_requests dan
// performance_reviews), supaya perilaku mode demo konsisten dengan
// production. Diam-diam lewati kalau penerima null (mis. departemen
// belum punya kepala_bagian) — sama seperti guard di fungsi SQL-nya.
function pushNotification(recipientProfileId, type, title, message, linkScreen, relatedTable, relatedId) {
  if (!recipientProfileId) return;
  mockNotifications.unshift({
    id: uid('notif'), recipient_profile_id: recipientProfileId, type, title, message,
    link_screen: linkScreen, related_table: relatedTable, related_id: relatedId,
    is_read: false, created_at: new Date().toISOString(),
  });
}
function findKabagProfileId(departmentId) {
  const p = mockProfiles.find(x => x.role === 'kepala_bagian' && x.department_id === departmentId);
  return p ? p.id : null;
}
function findProfileIdsByRole(role) {
  return mockProfiles.filter(x => x.role === role).map(x => x.id);
}
function findProfileIdByEmployeeId(employeeId) {
  const p = mockProfiles.find(x => x.employee_id === employeeId);
  return p ? p.id : null;
}
let mockInstitutionSettings = {
  id: uid('inst'), name: 'Pesantren Modern Al-Falah Abu Lam U',
  address: 'Jl. Lubuk - Seuneulop, Komplek Masjid Al-Falah, Kemukiman Lamjampok, Kec. Ingin Jaya, Aceh Besar, Aceh - Indonesia',
  logo_url: null, whatsapp_group_url: null,
}; // { 'surat_cuti-2026': 3 } — meniru trigger generate_document_number

let mockLoginQuotes = [
  { id: uid('lq'), quote_text: 'Sebaik-baik manusia adalah yang paling bermanfaat bagi orang lain.', quote_source: 'HR. Ahmad, Ath-Thabrani, Ad-Daruqutni', is_active: true, display_order: 0 },
];

// ---- Struktur Ideal (MUSYKER 2026) — sejak schema_52 tabel Supabase
// org_structure_reference, DI MODE MOCK ditiru dengan array in-memory
// ini. SENGAJA di-seed LAZY (di dalam fungsi, bukan langsung di top-level
// array literal) karena loadDataService.js (yang memuat file ini) jalan
// SEBELUM orgReferenceData.js dimuat di index.html — kalau seed dibaca
// langsung saat file ini pertama dieksekusi, ORG_REFERENCE_STRUCTURE dan
// ORG_REFERENCE_JOBDESC_KPI belum ada (ReferenceError). Dipanggil sekali
// saat listOrgStructure() pertama kali diakses (jauh setelah semua
// script termuat), lalu di-cache di mockOrgStructure.
let mockOrgStructure = null; // null = belum di-seed
function seedMockOrgStructureIfNeeded() {
  if (mockOrgStructure !== null) return;
  mockOrgStructure = [];
  const jobdescByKode = new Map((typeof ORG_REFERENCE_JOBDESC_KPI !== 'undefined' ? ORG_REFERENCE_JOBDESC_KPI.jabatan : []).map(j => [j.kode, j]));
  const idByKode = new Map();
  let urutanCounter = 0;
  function walk(node, parentKode) {
    const jd = jobdescByKode.get(node.kode) || {};
    const id = uid('orgref');
    idByKode.set(node.kode, id);
    mockOrgStructure.push({
      id, kode: node.kode, nama: node.nama,
      parent_id: null, // di-resolve di pass kedua di bawah
      _parent_kode: parentKode,
      urutan: urutanCounter++,
      atasan_label: jd.atasan || null,
      membawahi_label: jd.membawahi || null,
      tujuan: jd.tujuan || null,
      tugas_pokok: jd.tugas_pokok ? [...jd.tugas_pokok] : [],
      wewenang: jd.wewenang ? [...jd.wewenang] : [],
      kualifikasi: jd.kualifikasi ? [...jd.kualifikasi] : [],
      kpi: jd.kpi ? jd.kpi.map(k => ({ ...k })) : [],
      updated_at: new Date().toISOString(), updated_by: null,
    });
    (node.children || []).forEach(c => walk(c, node.kode));
  }
  if (typeof ORG_REFERENCE_STRUCTURE !== 'undefined' && ORG_REFERENCE_STRUCTURE.struktur) walk(ORG_REFERENCE_STRUCTURE.struktur, null);
  mockOrgStructure.forEach(row => {
    row.parent_id = row._parent_kode ? (idByKode.get(row._parent_kode) || null) : null;
    delete row._parent_kode;
  });
}
// Meniru RLS insert/update/delete org_structure_reference (schema_52):
// super_admin, hrd, pimpinan saja — SAMA PERSIS dengan EDIT_EMPLOYEE_ROLES
// di app.js, dipilih user secara eksplisit untuk konsistensi hak edit.
function canEditOrgStructure(profile) {
  return !!profile && ['super_admin', 'hrd', 'pimpinan'].includes(profile.role);
}
// Meniru guard FK ON DELETE RESTRICT (schema_52): true kalau kode masih
// punya minimal satu anak, supaya tidak bisa dihapus begitu saja.
function orgStructureHasChildren(id) {
  return mockOrgStructure.some(r => r.parent_id === id);
}
// Meniru trigger org_structure_reference_prevent_cycle (schema_52):
// susuri rantai parent_id BARU dari candidateParentId ke atas; kalau
// ketemu id (baris yang sedang diubah) sebelum mentok null, berarti
// perubahan ini akan membuat baris tsb jadi leluhur dirinya sendiri.
function orgStructureWouldCycle(id, candidateParentId) {
  if (!candidateParentId) return false;
  if (candidateParentId === id) return true;
  let cur = candidateParentId, hops = 0;
  while (cur) {
    if (cur === id) return true;
    const row = mockOrgStructure.find(r => r.id === cur);
    cur = row ? row.parent_id : null;
    if (++hops > mockOrgStructure.length + 1) return true; // pengaman ekstra
  }
  return false;
}

function pushAuditLog(action, record, tableName) {
  const profile = currentMockProfile();
  mockAuditLogs.unshift({
    id: uid('log'), actor_profile_id: profile?.id ?? null,
    profiles: profile ? { full_name: profile.full_name, username: profile.username } : null,
    action, table_name: tableName || 'employees', record_id: record.id,
    old_data: null, new_data: record, created_at: new Date().toISOString(),
  });
}

function stripPassword(p) { const { _password, ...rest } = p; return rest; }
function currentMockProfile() {
  return mockSessionProfileId ? mockProfiles.find(p => p.id === mockSessionProfileId) : null;
}

// Catatan Disiplin (mode demo) -- struktur meniru tabel disciplinary_records
// (schema_80) apa adanya supaya UI yang sama bisa dipakai tanpa cabang
// kode terpisah untuk mode mock vs supabase.
// Kartu "Tugas" tab Cek (schema_108, 2026-09-01) -- SEBELUMNYA
// localStorage per-device di daily-tasks.js (fitur 2026-08-25), sekarang
// ditiru sebagai array in-memory bersama di sini, sama seperti tabel
// mock lainnya, supaya mode demo BENAR-BENAR memperlihatkan sifat
// server-side-nya (mis. admin tambah tugas -> langsung terlihat kalau
// "device lain" disimulasikan lewat tab browser kedua yang share memori
// module ini -- localStorage lama tidak bisa mendemonstrasikan ini sama
// sekali karena selalu per-tab/per-origin).
let mockEmployeeTasks = [];
// Meniru RLS employee_tasks_select/insert/update/delete (schema_108):
// pemilik data sendiri, super_admin/hrd, atau atasan langsung
// person-based (employees.supervisor_id) -- SAMA PERSIS dengan
// canManageCekTugas() di daily-tasks.js (frontend), supaya otorisasi
// baca/tulis konsisten dengan yang sudah ditegakkan di UI.
function canAccessEmployeeTasks(profile, employeeId) {
  if (!profile) return false;
  if (profile.employee_id === employeeId) return true;
  if (['super_admin', 'hrd'].includes(profile.role)) return true;
  const emp = mockEmployees.find(e => e.id === employeeId);
  return !!(emp && emp.supervisor_id && profile.employee_id === emp.supervisor_id);
}

let mockDisciplinaryRecords = [];
function scopeDisciplinaryForCurrentUser(list) {
  const profile = currentMockProfile();
  if (!profile) return [];
  if (['super_admin', 'hrd', 'pimpinan'].includes(profile.role)) return list;
  if (profile.role === 'kepala_bagian') {
    return list.filter(r => mockEmployees.find(e => e.id === r.employee_id)?.department_id === profile.department_id);
  }
  return list.filter(r => r.employee_id === profile.employee_id);
}

// Meniru RLS employees_select di schema.sql — lihat catatan keamanan di
// header file ini soal kenapa ini bukan pengganti RLS sesungguhnya.
function scopeEmployeesForCurrentUser(list) {
  const profile = currentMockProfile();
  if (!profile) return [];
  if (['super_admin', 'hrd', 'pimpinan', 'bendahara_umum'].includes(profile.role)) return list;
  if (profile.role === 'kepala_bagian') return list.filter(e => e.department_id === profile.department_id);
  // guru/pegawai: hanya baris miliknya sendiri (lewat employee_id)
  return list.filter(e => e.id === profile.employee_id);
}

// Pegawai hasil pendaftaran mandiri yang akun login-nya masih
// "Menunggu" persetujuan (Manajemen Akses Pengguna) SENGAJA belum
// ditampilkan di Menu Pegawai (listEmployees) sama sekali — supaya
// HRD tidak melihat status "Aktif"/"Non-Aktif" untuk data yang belum
// diverifikasi/disetujui. Begitu disetujui, employment_status otomatis
// jadi 'active' (lihat approveUser) dan baris ini otomatis muncul di
// sini tanpa tindakan tambahan.
// SENGAJA TIDAK diterapkan ke getEmployee (akses per-id langsung) —
// HRD/Super Admin masih perlu bisa membuka data pegawai ini satu-per-satu
// (mis. saat meninjau pendaftaran sebelum menyetujui).
function excludePendingSelfRegistrations(list) {
  const pendingSelfRegEmployeeIds = new Set(
    mockProfiles
      .filter(p => p.status === 'pending' && p.registration_source === 'self' && p.employee_id)
      .map(p => p.employee_id)
  );
  return list.filter(e => !pendingSelfRegEmployeeIds.has(e.id));
}

window.dataService = {
  mode: 'mock',

  async getSession() {
    const p = currentMockProfile();
    return delay(p ? stripPassword(p) : null);
  },

  async signIn({ idValue, password, mode }) {
    const p = mode === 'username'
      ? mockProfiles.find(p => p.username === idValue)
      : mockProfiles.find(p => p.email.toLowerCase() === idValue.toLowerCase());

    if (!p || p._password !== password) {
      return delay({ ok: false, error: 'Username/email atau kata sandi salah' });
    }
    if (p.status !== 'active') {
      return delay({ ok: false, error: `Akun ${p.status === 'pending' ? 'menunggu aktivasi' : 'nonaktif'} — hubungi admin` });
    }
    mockSessionProfileId = p.id;
    p.last_login_at = new Date().toISOString();
    return delay({ ok: true, profile: stripPassword(p) });
  },

  async signOut() {
    mockSessionProfileId = null;
    return delay({ ok: true });
  },

  // Paritas dengan supabaseDataService.js — lihat komentar di sana untuk
  // konteks lengkap kenapa dua fungsi ini ada.
  async verifyCurrentPassword(password) {
    const profile = currentMockProfile();
    if (!profile) return delay({ ok: false, error: 'Sesi tidak valid, silakan login ulang' });
    if (profile._password !== password) return delay({ ok: false, error: 'Kata sandi salah' });
    return delay({ ok: true });
  },
  async deletePayrollPeriod(periodId) {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'bendahara_umum'].includes(profile.role)) {
      return delay({ ok: false, error: 'Anda tidak berwenang menghapus periode payroll' });
    }
    const period = mockPayrollPeriods.find(p => p.id === periodId);
    if (!period) return delay({ ok: false, error: 'Periode tidak ditemukan' });
    // Meniru trigger payroll_periods_protect_delete (schema_32) — otoritas
    // yang sama harus berlaku persis di kedua data layer, bukan cuma di
    // Supabase asli.
    if (['finalized', 'paid'].includes(period.status)) {
      return delay({ ok: false, error: 'Periode yang sudah difinalisasi/dibayar tidak dapat dihapus — buka kembali statusnya dulu (khusus Super Admin) sebelum menghapus' });
    }
    mockPayrollPeriods = mockPayrollPeriods.filter(p => p.id !== periodId);
    // Mock tidak punya FK on delete cascade sungguhan — hapus manual
    // slip & item-nya supaya konsisten dengan perilaku Supabase asli.
    const slipIds = mockPayslips.filter(s => s.payroll_period_id === periodId).map(s => s.id);
    mockPayslips = mockPayslips.filter(s => s.payroll_period_id !== periodId);
    mockPayslipItems = mockPayslipItems.filter(i => !slipIds.includes(i.payslip_id));
    return delay({ ok: true });
  },

  // Meniru supabaseDataService.changePassword() — di mode demo, cukup
  // update _password di sesi mock yang sedang login, tidak ada re-auth
  // password lama (sama seperti perilaku Supabase Auth updateUser()).
  async changePassword(newPassword) {
    const profile = currentMockProfile();
    if (!profile) return delay({ ok: false, error: 'Sesi tidak ditemukan — silakan masuk ulang' });
    if (!newPassword || newPassword.length < 8) return delay({ ok: false, error: 'Kata sandi minimal 8 karakter' });
    const p = mockProfiles.find(p => p.id === profile.id);
    if (p) p._password = newPassword;
    return delay({ ok: true });
  },

  async listDepartments() {
    return delay([...mockDepartments]);
  },

  async listPositions() {
    return delay([...mockPositions]);
  },

  async listShifts() {
    return delay([...mockShifts].sort((a, b) => a.name.localeCompare(b.name, 'id')));
  },

  async createShift(payload) {
    const profile = currentMockProfile();
    // Meniru RLS shifts_insert (schema_67): hanya super_admin & hrd.
    const allowed = profile && ['super_admin', 'hrd'].includes(profile.role);
    if (!allowed) return delay({ ok: false, error: 'Hanya Super Admin dan HRD yang dapat menambah shift' });
    if (!payload.name || !payload.name.trim()) return delay({ ok: false, error: 'Nama shift wajib diisi' });
    if (!payload.start_time || !payload.end_time) return delay({ ok: false, error: 'Jam masuk dan jam pulang wajib diisi' });
    if (payload.is_default) mockShifts.forEach(s => { s.is_default = false; });
    const newShift = {
      id: uid('shift'),
      name: payload.name.trim(),
      start_time: payload.start_time,
      end_time: payload.end_time,
      late_grace_minutes: payload.late_grace_minutes ?? 15,
      early_out_grace_minutes: payload.early_out_grace_minutes ?? 15,
      earliest_check_in: payload.earliest_check_in || '06:00',
      working_days: payload.working_days ?? ['senin', 'selasa', 'rabu', 'kamis', 'jumat'],
      is_default: payload.is_default ?? false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockShifts.unshift(newShift);
    pushAuditLog('insert', newShift, 'shifts');
    return delay({ ok: true, shift: newShift });
  },

  async updateShift(id, payload) {
    const profile = currentMockProfile();
    const allowed = profile && ['super_admin', 'hrd'].includes(profile.role);
    if (!allowed) return delay({ ok: false, error: 'Hanya Super Admin dan HRD yang dapat mengubah shift' });
    const shift = mockShifts.find(s => s.id === id);
    if (!shift) return delay({ ok: false, error: 'Shift tidak ditemukan' });
    if (payload.is_default) mockShifts.forEach(s => { if (s.id !== id) s.is_default = false; });
    Object.assign(shift, payload, { updated_at: new Date().toISOString() });
    pushAuditLog('update', shift, 'shifts');
    return delay({ ok: true });
  },

  async deleteShift(id) {
    const profile = currentMockProfile();
    // Meniru RLS shifts_delete (schema_67): sengaja hanya super_admin,
    // bukan hrd — beda dari write/edit biasa.
    if (!profile || profile.role !== 'super_admin') {
      return delay({ ok: false, error: 'Hanya Super Admin yang dapat menghapus shift' });
    }
    const idx = mockShifts.findIndex(s => s.id === id);
    if (idx === -1) return delay({ ok: false, error: 'Shift tidak ditemukan' });
    const wasDefault = mockShifts[idx].is_default;
    mockShifts.splice(idx, 1);
    mockEmployees.forEach(e => { if (e.shift_id === id) e.shift_id = null; });
    if (wasDefault && mockShifts.length > 0) mockShifts[0].is_default = true;
    pushAuditLog('delete', { id }, 'shifts');
    return delay({ ok: true });
  },

  // Resolusi shift efektif seorang pegawai pada tanggal tertentu: shift
  // yang ditugaskan langsung ke pegawai, jatuh ke shift default kalau
  // tidak ada penugasan. (Tidak ada tabel override tanggal-per-tanggal
  // di Fase 1 — lingkup sengaja dijaga kecil, beda dari shift_overrides
  // di OpenHRApp yang jadi rujukan awal.)
  async resolveShiftForEmployee(employeeId) {
    const emp = mockEmployees.find(e => e.id === employeeId);
    if (emp?.shift_id) {
      const assigned = mockShifts.find(s => s.id === emp.shift_id);
      if (assigned) return delay(assigned);
    }
    return delay(mockShifts.find(s => s.is_default) || null);
  },

  async listEmployees() {
    const sorted = [...mockEmployees].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return delay(excludePendingSelfRegistrations(scopeEmployeesForCurrentUser(sorted)));
  },

  async getEmployee(id) {
    const [emp] = scopeEmployeesForCurrentUser(mockEmployees.filter(e => e.id === id));
    return delay(emp || null);
  },

  async createEmployee(payload) {
    if (mockEmployees.some(e => e.employee_code === payload.employee_code)) {
      return delay({ ok: false, error: 'ID Pegawai sudah dipakai' });
    }
    const profile = currentMockProfile();
    // Meniru RLS employees_insert di schema.sql: HANYA super_admin & hrd.
    // kepala_bagian SENGAJA tidak lagi diikutkan di sini (dulu dibatasi
    // departemennya sendiri, sekarang dicabut sepenuhnya) — kepala_bagian
    // tetap boleh melihat/mengubah pegawai departemennya (lihat updateEmployee),
    // hanya tidak boleh membuat pegawai baru.
    const allowed = profile && ['super_admin', 'hrd'].includes(profile.role);
    if (!allowed) return delay({ ok: false, error: 'Anda tidak memiliki izin menambah pegawai — hanya Super Admin dan HRD' });
    // amanah_id (schema_82) menentukan gaji dasar otomatis -- SENGAJA
    // dijaga TERPISAH dari guard kepegawaian umum di atas (yang
    // meloloskan hrd) karena ini pada dasarnya menyetel gaji, dan HRD
    // sengaja dikunci dari employee_payroll (schema_11, read-only by
    // design). Kalau tidak dijaga di sini, HRD bisa membuat pegawai
    // baru dengan amanah_id terisi -> backdoor mengatur base_salary
    // padahal tidak boleh menyentuh employee_payroll secara langsung.
    if (payload.amanah_id && !['super_admin', 'pimpinan', 'bendahara_umum'].includes(profile.role)) {
      return delay({ ok: false, error: 'Hanya Super Admin, Pimpinan, atau Bendahara Umum yang dapat menautkan amanah (menentukan gaji dasar)' });
    }
    const newEmp = { id: uid('emp'), created_at: new Date().toISOString(), ...payload };
    mockEmployees.unshift(newEmp);
    // Meniru trg_sync_employee_position_text_from_amanah + trg_sync_payroll_on_amanah_change
    // (schema_82): kalau amanah_id sudah diisi sejak pembuatan pegawai,
    // langsung sinkronkan teks position + gaji dasar dari rujukan.
    if (newEmp.amanah_id) {
      const ref = mockPositionCompensationReference.find(r => r.id === newEmp.amanah_id && r.is_active);
      if (ref) newEmp.position = ref.nama_amanah;
      mockApplyAmanahCompensation(newEmp.id, newEmp.amanah_id);
    }
    pushAuditLog('insert', newEmp);
    return delay({ ok: true });
  },

  async updateEmployee(id, payload) {
    const emp = mockEmployees.find(e => e.id === id);
    if (!emp) return delay({ ok: false, error: 'Pegawai tidak ditemukan' });
    const profile = currentMockProfile();
    // Dua lapis, meniru schema_25: RLS employees_update (baris mana yang
    // boleh disentuh sama sekali) TERPISAH dari trigger
    // employees_protect_privileged_fields (kolom kepegawaian spesifik).
    // kepala_bagian tetap lolos lapis pertama (baris departemennya) tapi
    // TIDAK lagi lolos lapis kedua — hanya super_admin/hrd/pimpinan.
    const canAccessRow = profile && (
      ['super_admin', 'hrd', 'pimpinan'].includes(profile.role) ||
      (profile.role === 'kepala_bagian' && profile.department_id === emp.department_id)
    );
    const isSelf = profile && profile.employee_id === id;
    if (!canAccessRow && !isSelf) return delay({ ok: false, error: 'Anda tidak memiliki izin mengubah data ini' });
    const canEditKepegawaian = profile && ['super_admin', 'hrd', 'pimpinan'].includes(profile.role);
    if (!canEditKepegawaian) {
      const forbiddenKeys = ['position', 'unit', 'department_id', 'supervisor_id', 'employment_status', 'contract_type', 'join_date', 'employee_code',
        'contract_start_date', 'contract_end_date', 'probation_end_date',
        'additional_position_1', 'additional_unit_1', 'additional_supervisor_id_1',
        'additional_position_2', 'additional_unit_2', 'additional_supervisor_id_2'];
      if (Object.keys(payload).some(k => forbiddenKeys.includes(k))) {
        return delay({ ok: false, error: 'Hanya Super Admin, HRD, atau Pimpinan yang dapat mengubah data kepegawaian' });
      }
    }
    // Meniru "employee_code text unique not null" (schema.sql) — tanpa
    // ini, mode demo akan diam-diam mengizinkan dua pegawai punya ID
    // yang sama, padahal di database asli akan ditolak.
    if (payload.employee_code && mockEmployees.some(e => e.id !== id && e.employee_code === payload.employee_code)) {
      return delay({ ok: false, error: `ID Pegawai "${payload.employee_code}" sudah dipakai pegawai lain` });
    }
    // amanah_id (schema_82) SENGAJA dijaga role set LEBIH SEMPIT
    // (super_admin/pimpinan/bendahara_umum) daripada canEditKepegawaian
    // di atas (yang meloloskan hrd) -- lihat alasan lengkap di
    // createEmployee. Tanpa guard terpisah ini, kepala_bagian departemen
    // sendiri atau bahkan pegawai itu sendiri (isSelf) bisa mengubah
    // amanah_id-nya sendiri lewat form biasa dan diam-diam menaikkan
    // gajinya sendiri -- celah otorisasi nyata, bukan teoretis.
    if (Object.prototype.hasOwnProperty.call(payload, 'amanah_id') && !['super_admin', 'pimpinan', 'bendahara_umum'].includes(profile.role)) {
      return delay({ ok: false, error: 'Hanya Super Admin, Pimpinan, atau Bendahara Umum yang dapat mengubah amanah (menentukan gaji dasar)' });
    }
    // Meniru trg_sync_employee_position_text_from_amanah + trg_sync_payroll_on_amanah_change
    // (schema_82) -- deteksi SEBELUM Object.assign supaya bisa
    // dibandingkan dengan nilai lama. amanah_id harus eksplisit ada di
    // payload dan BERBEDA dari yang lama (is_distinct semantics: null
    // -> null bukan perubahan, pola sama seperti versi SQL).
    const amanahChanged = Object.prototype.hasOwnProperty.call(payload, 'amanah_id') && payload.amanah_id !== emp.amanah_id;
    Object.assign(emp, payload);
    if (amanahChanged && emp.amanah_id) {
      const ref = mockPositionCompensationReference.find(r => r.id === emp.amanah_id && r.is_active);
      if (ref) emp.position = ref.nama_amanah;
      mockApplyAmanahCompensation(emp.id, emp.amanah_id);
    }
    pushAuditLog('update', emp);
    return delay({ ok: true });
  },

  // Meniru RLS audit_logs_select (schema.sql): HANYA super_admin/
  // pimpinan — sebelumnya mock mengembalikan SEMUA log ke siapa pun yang
  // login, tidak meniru pembatasan RLS asli sama sekali (gap ditemukan
  // lewat audit lanjutan).
  async listAuditLogs() {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'pimpinan'].includes(profile.role)) return delay([]);
    return delay([...mockAuditLogs]);
  },

  // Kartu "Kesehatan Sistem" Dashboard (schema_100, R4 audit
  // 2026-08-30) -- meniru RLS/pengecekan role RPC get_edge_function_health()
  // asli (SECURITY DEFINER: hanya super_admin/hrd). Data contoh statis
  // (bukan log sungguhan -- mode mock tidak punya Edge Function
  // berjalan) supaya UI kartu tetap bisa didemokan/di-review tanpa
  // Supabase live, SEMUA berstatus 'ok' (tidak ada insiden simulasi)
  // supaya tidak menyesatkan seolah ada masalah nyata di demo.
  async getEdgeFunctionHealth() {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd'].includes(profile.role)) return delay([]);
    const now = new Date();
    const fns = [
      ['cleanup-generated-documents', 'admin_gated'],
      ['create-user', 'admin_gated'],
      ['reset-password', 'admin_gated'],
      ['sync-konten-harian', 'scheduled_daily'],
      ['login-lookup', 'general'],
      ['register-employee', 'general'],
      ['generate-document', 'general'],
      ['send-push-notification', 'general'],
      ['seed-konten-islami', 'general'],
    ];
    return delay(fns.map(([function_name, category]) => ({
      function_name, category,
      last_invocation_at: now.toISOString(),
      last_success_at: now.toISOString(),
      invocations_24h: category === 'general' ? 12 : 1,
      errors_24h: 0,
      error_rate_24h_pct: 0,
      consecutive_errors: 0,
      alert_level: 'ok',
    })));
  },

  // Dipakai modal "Akun Login" di halaman Detail Pegawai — SENGAJA
  // tidak menyertakan _password sama sekali dalam objek yang
  // dikembalikan, konsisten dengan stripPassword() di listProfiles.
  // Meniru RLS profiles_select_admin (schema.sql): HANYA super_admin
  // boleh lihat baris profiles milik orang lain.
  async getAccountByEmployee(employeeId) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay(null);
    const p = mockProfiles.find(x => x.employee_id === employeeId);
    if (!p) return delay(null);
    return delay(stripPassword(p));
  },

  // Meniru RLS profiles_select_self + profiles_select_admin +
  // profiles_select_registration_reviewers (schema_35) — SEBELUMNYA
  // fungsi ini mengembalikan SEMUA profil tanpa syarat, tidak meniru
  // RLS produksi sama sekali. Itu membuat bug nyata (Pimpinan/HRD
  // hanya bisa SELECT baris sendiri di Supabase asli, akibat
  // profiles_select_admin yang belum diperluas schema_23) LOLOS TAK
  // TERDETEKSI di sini — mode demo terlihat baik-baik saja padahal
  // fitur "Manajemen Akses Pengguna" rusak total di production untuk
  // kedua role itu. Sekarang scoping-nya harus PERSIS sama seperti RLS.
  async listProfiles() {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    let rows;
    if (profile.role === 'super_admin') {
      rows = mockProfiles;
    } else if (['hrd', 'pimpinan'].includes(profile.role)) {
      rows = mockProfiles.filter(p => p.status === 'pending' || p.id === profile.id);
    } else {
      rows = mockProfiles.filter(p => p.id === profile.id);
    }
    return delay(rows.map(stripPassword).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
  },

  // Meniru Edge Function register-employee (publik, tanpa sesi login) +
  // trigger handle_new_user (schema.sql): role SELALU 'pegawai', status
  // SELALU 'pending' — TIDAK diambil dari payload sama sekali, supaya
  // konsisten dengan mode Supabase (di sana pun keduanya default trigger,
  // bukan dari input Edge Function).
  async registerEmployee(payload) {
    const { username, email, password, full_name, nik } = payload;
    if (!username || !email || !password || password.length < 8 || !full_name || !nik || nik.length !== 16) {
      return delay({ ok: false, error: 'Field wajib belum lengkap/valid' });
    }
    if (mockProfiles.some(p => p.username === username)) return delay({ ok: false, error: 'Username sudah dipakai' });
    if (mockProfiles.some(p => p.email.toLowerCase() === email.toLowerCase())) return delay({ ok: false, error: 'Email sudah terdaftar' });
    if (mockEmployees.some(e => e.personal_info?.nik === nik)) {
      return delay({ ok: false, error: 'NIK ini sudah terdaftar di sistem. Kalau Anda merasa sudah pernah didata, hubungi HRD alih-alih mendaftar ulang.' });
    }

    const employeeCode = `REG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uid('').slice(0, 6).toUpperCase()}`;
    const newEmployee = {
      id: uid('emp'), employee_code: employeeCode, full_name, position: '', unit: '', department_id: null,
      // Sengaja BUKAN 'active' -- pegawai hasil pendaftaran mandiri baru
      // boleh "Aktif" setelah akun login-nya disetujui HRD/Super Admin
      // (lihat approveUser di atas + schema_74 untuk versi Supabase).
      employment_status: 'inactive', contract_type: null, join_date: null, created_at: new Date().toISOString(),
      personal_info: {
        full_name, title: payload.title || '', nik, birth_place_date: payload.birth_place_date || '',
        npwp: payload.npwp || '', gender: payload.gender || '', religion: payload.religion || '',
        marital_status: payload.marital_status || '', nationality: payload.nationality || 'WNI',
        blood_type: payload.blood_type || '',
        ktp_address: {
          address: payload.ktp_address || '', province: payload.ktp_province || '',
          regency: payload.ktp_regency || '', district: payload.ktp_district || '', village: payload.ktp_village || '',
        },
        spouse_name: payload.spouse_name || '', children_count: payload.children_count ?? null, dependents_count: payload.dependents_count ?? null,
      },
      emergency_contact: { name: payload.emergency_name || '', relation: payload.emergency_relation || '', phone: payload.emergency_phone || '' },
      contact_info: {},
    };
    mockEmployees.push(newEmployee);

    mockProfiles.unshift({
      id: uid('usr'), username, email, full_name, role: 'pegawai', department_id: null, employee_id: newEmployee.id,
      status: 'pending', registration_source: 'self', two_factor_enabled: false, last_login_at: null,
      created_at: new Date().toISOString(), _password: password,
    });
    return delay({ ok: true });
  },

  async createUser({ email, username, full_name, role, department_id, employee_id }) {
    // Meniru pembatasan Edge Function create-user asli: hanya super_admin
    // yang boleh membuat user baru. Tanpa guard ini, mode demo memberi rasa
    // aman palsu — tampak seolah HRD/kepala_bagian tidak bisa buat user,
    // padahal itu cuma karena tombolnya disembunyikan di app.js
    // (ADMIN_ROLES), bukan karena ditolak di lapisan data ini.
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') {
      return delay({ ok: false, error: 'Forbidden: hanya Super Admin yang dapat membuat pengguna' });
    }
    if (mockProfiles.some(p => p.username === username)) {
      return delay({ ok: false, error: 'Username sudah dipakai' });
    }
    if (mockProfiles.some(p => p.email.toLowerCase() === email.toLowerCase())) {
      return delay({ ok: false, error: 'Email sudah terdaftar' });
    }
    if (role === 'kepala_bagian' && !department_id) {
      return delay({ ok: false, error: 'Role kepala_bagian wajib menyertakan department_id' });
    }
    // Cegah satu data pegawai tertaut ke lebih dari satu akun — celah yang
    // sama yang menyebabkan akun tanpa employee_id sebelumnya (tidak ada
    // pengecekan sama sekali). employee_id sengaja opsional (bisa null,
    // untuk pegawai yang datanya memang belum ada di sistem).
    if (employee_id && mockProfiles.some(p => p.employee_id === employee_id)) {
      return delay({ ok: false, error: 'Data pegawai ini sudah tertaut ke akun lain' });
    }
    mockProfiles.unshift({
      id: uid('usr'), username, email, full_name, role, department_id: department_id || null, employee_id: employee_id || null,
      status: 'active', two_factor_enabled: false, last_login_at: null, created_at: new Date().toISOString(),
      _password: 'demo1234', // di mode nyata: password sementara acak + email reset, lihat supabaseDataService.js
    });
    return delay({ ok: true });
  },

  // Perbaikan retroaktif untuk akun yang terlanjur dibuat TANPA employee_id
  // — lihat linkEmployeeToProfile di supabaseDataService.js untuk konteks
  // lengkap kenapa aksi ini diperlukan.
  async linkEmployeeToProfile(profileId, employeeId) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') {
      return delay({ ok: false, error: 'Forbidden: hanya Super Admin yang dapat mengubah tautan data pegawai' });
    }
    const p = mockProfiles.find(x => x.id === profileId);
    if (!p) return delay({ ok: false, error: 'Pengguna tidak ditemukan' });
    if (mockProfiles.some(x => x.id !== profileId && x.employee_id === employeeId)) {
      return delay({ ok: false, error: 'Data pegawai ini sudah tertaut ke akun lain' });
    }
    p.employee_id = employeeId;
    return delay({ ok: true });
  },

  // Meniru RLS profiles_update_admin + trigger protect_role_status
  // (schema.sql): HANYA super_admin boleh ubah role_id — sama alasan
  // dengan approveUser/rejectUser di atas.
  async updateUserRole(profileId, role, department_id) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') {
      return delay({ ok: false, error: 'Forbidden: hanya Super Admin yang dapat mengubah peran pengguna' });
    }
    const p = mockProfiles.find(x => x.id === profileId);
    if (!p) return delay({ ok: false, error: 'Pengguna tidak ditemukan' });
    if (!['super_admin', 'hrd', 'pimpinan', 'bendahara_umum', 'kepala_bagian', 'guru', 'pegawai', 'tendik'].includes(role)) {
      return delay({ ok: false, error: `Role "${role}" tidak dikenali` });
    }
    if (role === 'kepala_bagian' && !department_id) {
      return delay({ ok: false, error: 'Role kepala_bagian wajib menyertakan department_id' });
    }
    p.role = role;
    p.department_id = role === 'kepala_bagian' ? department_id : null;
    return delay({ ok: true });
  },

  async resetPassword(profileId) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') {
      return delay({ ok: false, error: 'Forbidden: hanya Super Admin yang dapat memicu reset password' });
    }
    const p = mockProfiles.find(p => p.id === profileId);
    if (!p) return delay({ ok: false, error: 'Pengguna tidak ditemukan' });
    return delay({ ok: true, sentTo: p.email + ' (simulasi — tidak ada email sungguhan terkirim di mode demo)' });
  },

  // Meniru RLS profiles_update_admin + trigger protect_role_status
  // (schema.sql + schema_23): super_admin/hrd/pimpinan boleh ubah status
  // HANYA dari 'pending' (alur persetujuan pendaftaran) — perubahan
  // status akun aktif/nonaktif lainnya tetap eksklusif super_admin,
  // konsisten dengan REGISTRATION_APPROVAL_ROLES di app.js.
  async approveUser(profileId) {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd', 'pimpinan'].includes(profile.role)) return delay({ ok: false, error: 'Hanya Super Admin, HRD, atau Pimpinan yang dapat menyetujui akun' });
    const p = mockProfiles.find(x => x.id === profileId);
    if (!p) return delay({ ok: false, error: 'Pengguna tidak ditemukan' });
    if (p.status !== 'pending') return delay({ ok: false, error: 'Hanya akun berstatus Menunggu yang dapat disetujui' });
    p.status = 'active';
    // Meniru trigger notify_user_status_change AFTER UPDATE (schema_21).
    pushNotification(p.id, 'system', 'Akun disetujui', 'Akun Anda telah disetujui dan dapat digunakan untuk masuk ke sistem.', null, 'profiles', p.id);
    // Meniru trigger sync_employee_status_on_profile_approval (schema_74):
    // employment_status ikut otomatis jadi 'active' begitu akun disetujui
    // (hanya kalau masih 'inactive', supaya tidak menimpa perubahan manual HRD).
    if (p.employee_id) {
      const emp = mockEmployees.find(e => e.id === p.employee_id);
      if (emp && emp.employment_status === 'inactive') emp.employment_status = 'active';
    }
    return delay({ ok: true });
  },
  async rejectUser(profileId) {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd', 'pimpinan'].includes(profile.role)) return delay({ ok: false, error: 'Hanya Super Admin, HRD, atau Pimpinan yang dapat menolak akun' });
    const p = mockProfiles.find(x => x.id === profileId);
    if (!p) return delay({ ok: false, error: 'Pengguna tidak ditemukan' });
    if (p.status !== 'pending') return delay({ ok: false, error: 'Hanya akun berstatus Menunggu yang dapat ditolak' });
    p.status = 'inactive';
    pushNotification(p.id, 'system', 'Pendaftaran akun ditolak', 'Permintaan akun Anda tidak disetujui. Hubungi HRD/Super Admin untuk informasi lebih lanjut.', null, 'profiles', p.id);
    return delay({ ok: true });
  },
  // Menonaktifkan/mengaktifkan kembali akun yang SUDAH aktif — beda dari
  // rejectUser (itu untuk pendaftaran yang masih 'pending'). Dibatasi
  // super_admin saja (meniru profiles_update_admin RLS, schema.sql),
  // BUKAN termasuk hrd/pimpinan seperti approveUser/rejectUser — kedua
  // itu wewenang persetujuan pendaftaran, ini wewenang administrasi akun.
  async deactivateUser(profileId) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat menonaktifkan akun' });
    if (profile.id === profileId) return delay({ ok: false, error: 'Anda tidak dapat menonaktifkan akun Anda sendiri' });
    const p = mockProfiles.find(x => x.id === profileId);
    if (!p) return delay({ ok: false, error: 'Pengguna tidak ditemukan' });
    if (p.status !== 'active') return delay({ ok: false, error: 'Hanya akun berstatus Aktif yang dapat dinonaktifkan' });
    p.status = 'inactive';
    return delay({ ok: true });
  },
  async reactivateUser(profileId) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat mengaktifkan kembali akun' });
    const p = mockProfiles.find(x => x.id === profileId);
    if (!p) return delay({ ok: false, error: 'Pengguna tidak ditemukan' });
    if (p.status !== 'inactive') return delay({ ok: false, error: 'Hanya akun berstatus Nonaktif yang dapat diaktifkan kembali' });
    p.status = 'active';
    return delay({ ok: true });
  },
  // "Hapus Akun" (schema_105) -- lihat komentar lengkap di
  // supabaseDataService.js, versi mock ini meniru perilaku yang sama:
  // status dipaksa 'inactive' + deleted_at diisi, TIDAK menghapus baris
  // mockProfiles sama sekali (trash, bukan hapus sungguhan).
  async deleteUser(profileId) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat menghapus akun' });
    if (profile.id === profileId) return delay({ ok: false, error: 'Anda tidak dapat menghapus akun Anda sendiri' });
    const p = mockProfiles.find(x => x.id === profileId);
    if (!p) return delay({ ok: false, error: 'Pengguna tidak ditemukan' });
    if (p.deleted_at) return delay({ ok: false, error: 'Akun ini sudah dihapus sebelumnya — mungkin sudah ditangani admin lain' });
    p.status = 'inactive';
    p.deleted_at = new Date().toISOString();
    p.deleted_by_profile_id = profile.id;
    return delay({ ok: true });
  },
  async restoreUser(profileId) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat memulihkan akun' });
    const p = mockProfiles.find(x => x.id === profileId);
    if (!p) return delay({ ok: false, error: 'Pengguna tidak ditemukan' });
    if (!p.deleted_at) return delay({ ok: false, error: 'Akun ini tidak sedang dalam masa trash — mungkin sudah dipulihkan admin lain' });
    p.deleted_at = null;
    p.deleted_by_profile_id = null;
    return delay({ ok: true });
  },

  // Meniru RLS employee_documents_select di schema_02: super_admin/hrd
  // lihat semua, selain itu hanya pemilik data sendiri (employee_id cocok
  // dengan employee_id milik profile yang login).
  async listDocuments(employeeId) {
    const profile = currentMockProfile();
    const allowed = profile && (['super_admin', 'hrd'].includes(profile.role) || profile.employee_id === employeeId);
    if (!allowed) return delay([]);
    const docs = mockDocuments.filter(d => d.employee_id === employeeId).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return delay(docs);
  },

  // file: objek File dari <input type="file"> — di mode demo cuma dibuatkan
  // Object URL sementara (URL.createObjectURL), TIDAK benar-benar diunggah
  // ke mana pun.
  async uploadDocument({ employeeId, documentType, file }) {
    const profile = currentMockProfile();
    const allowed = profile && (['super_admin', 'hrd'].includes(profile.role) || profile.employee_id === employeeId);
    if (!allowed) return delay({ ok: false, error: 'Anda tidak memiliki izin mengunggah dokumen untuk pegawai ini' });
    if (!file) return delay({ ok: false, error: 'Pilih file terlebih dahulu' });
    if (file.size > 10 * 1024 * 1024) return delay({ ok: false, error: 'Ukuran file maksimal 10MB' });

    const doc = {
      id: uid('doc'), employee_id: employeeId, document_type: documentType,
      file_url: URL.createObjectURL(file), // hanya berlaku selama tab ini terbuka
      file_name: file.name, expiry_date: null,
      uploaded_by_profile_id: profile.id, created_at: new Date().toISOString(),
    };
    mockDocuments.unshift(doc);
    return delay({ ok: true, document: doc });
  },

  async deleteDocument(documentId) {
    const profile = currentMockProfile();
    const doc = mockDocuments.find(d => d.id === documentId);
    if (!doc) return delay({ ok: false, error: 'Dokumen tidak ditemukan' });
    const allowed = profile && (['super_admin', 'hrd'].includes(profile.role) || profile.employee_id === doc.employee_id);
    if (!allowed) return delay({ ok: false, error: 'Anda tidak memiliki izin menghapus dokumen ini' });
    mockDocuments = mockDocuments.filter(d => d.id !== documentId);
    return delay({ ok: true });
  },

  // Di mode demo, employee_documents.file_url SUDAH berupa Object URL yang
  // langsung bisa dipakai (lihat uploadDocument) — tidak ada proses
  // "signing" sungguhan, cuma dikembalikan apa adanya supaya app.js tidak
  // perlu tahu bedanya (interface sama seperti supabaseDataService).
  async getDocumentSignedUrl(filePath) {
    return delay(filePath);
  },

  async listLeaveTypes() {
    return delay([...mockLeaveTypes]);
  },

  // Meniru RLS employee_leave_requests_select (schema_03): super_admin/hrd/
  // pimpinan lihat semua, kepala_bagian lihat departemennya, selain itu
  // hanya milik sendiri.
  async listLeaveRequests(employeeId) {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    const emp = mockEmployees.find(e => e.id === employeeId);
    const allowed = ['super_admin', 'hrd', 'pimpinan'].includes(profile.role)
      || (profile.role === 'kepala_bagian' && emp && emp.department_id === profile.department_id)
      || profile.employee_id === employeeId;
    if (!allowed) return delay([]);
    const rows = mockLeaveRequests
      .filter(r => r.employee_id === employeeId)
      .map(r => ({ ...r, leave_types: mockLeaveTypes.find(t => t.id === r.leave_type_id) }))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return delay(rows);
  },

  async getLeaveBalance(employeeId) {
    const rows = mockLeaveBalances
      .filter(b => b.employee_id === employeeId && b.year === CURRENT_YEAR)
      .map(b => ({ ...b, leave_types: mockLeaveTypes.find(t => t.id === b.leave_type_id) }));
    return delay(rows);
  },

  // Meniru trigger leave_requests_enforce_pending_on_self (schema_07):
  // status awal selalu 'pending_kabag' untuk pengajuan mandiri.
  async createLeaveRequest({ employeeId, leaveTypeId, startDate, endDate, daysCount, reason }) {
    const profile = currentMockProfile();
    const allowed = profile && (['super_admin', 'hrd'].includes(profile.role) || profile.employee_id === employeeId);
    if (!allowed) return delay({ ok: false, error: 'Anda tidak memiliki izin mengajukan cuti untuk pegawai ini' });
    const req = {
      id: uid('leave'), employee_id: employeeId, leave_type_id: leaveTypeId,
      start_date: startDate, end_date: endDate, days_count: daysCount, reason: reason || null,
      status: 'pending_kabag',
      requested_by_profile_id: profile.id,
      kabag_decided_by_profile_id: null, kabag_decided_at: null, kabag_notes: null,
      decided_by_profile_id: null, decided_at: null, decision_notes: null,
      created_at: new Date().toISOString(),
    };
    mockLeaveRequests.unshift(req);
    // Meniru trigger notify_leave_request_changes AFTER INSERT (schema_18).
    const emp = mockEmployees.find(e => e.id === employeeId);
    pushNotification(
      findKabagProfileId(emp?.department_id), 'leave_request', 'Pengajuan cuti baru',
      `${emp?.full_name || 'Pegawai'} mengajukan cuti, menunggu persetujuan Anda.`,
      'app-leave', 'employee_leave_requests', req.id
    );
    return delay({ ok: true, request: req });
  },

  // Meniru RLS employee_leave_requests_select gabungan is_pimpinan()/
  // is_department_head_of() (schema_03/schema_07) — dikembalikan mentah,
  // app.js yang memfilter tampilan sesuai tahap yang relevan untuk role.
  async listPendingLeaveApprovals() {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    let rows = mockLeaveRequests.filter(r => ['pending_kabag', 'pending_pimpinan'].includes(r.status));
    if (!['super_admin', 'hrd', 'pimpinan'].includes(profile.role)) {
      if (profile.role === 'kepala_bagian') {
        rows = rows.filter(r => {
          const emp = mockEmployees.find(e => e.id === r.employee_id);
          return emp && emp.department_id === profile.department_id;
        });
      } else {
        rows = [];
      }
    }
    rows = rows
      .map(r => ({
        ...r,
        leave_types: mockLeaveTypes.find(t => t.id === r.leave_type_id),
        employees: mockEmployees.find(e => e.id === r.employee_id),
      }))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return delay(rows);
  },

  // Meniru RLS employee_leave_requests_select persis sama seperti
  // listPendingLeaveApprovals, hanya beda filter status — riwayat yang
  // sudah disetujui, dibatasi 50 terbaru urut decided_at.
  async listApprovedLeaveRequests() {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    let rows = mockLeaveRequests.filter(r => r.status === 'approved');
    if (!['super_admin', 'hrd', 'pimpinan'].includes(profile.role)) {
      if (profile.role === 'kepala_bagian') {
        rows = rows.filter(r => {
          const emp = mockEmployees.find(e => e.id === r.employee_id);
          return emp && emp.department_id === profile.department_id;
        });
      } else {
        rows = rows.filter(r => r.employee_id === profile.employee_id);
      }
    }
    rows = rows
      .map(r => ({
        ...r,
        leave_types: mockLeaveTypes.find(t => t.id === r.leave_type_id),
        employees: mockEmployees.find(e => e.id === r.employee_id),
      }))
      .sort((a, b) => (a.decided_at < b.decided_at ? 1 : -1))
      .slice(0, 50);
    return delay(rows);
  },

  // Meniru trigger leave_requests_protect_fields (schema_07): siapa boleh
  // pindah ke status apa, tergantung role & status saat ini.
  // Laporan lengkap pengajuan cuti (untuk export .xlsx) — SEMUA status,
  // tanpa limit 50. Meniru RLS employee_leave_requests_select persis sama
  // scoping seperti listApprovedLeaveRequests di atas, hanya tanpa filter
  // status dan tanpa slice(0, 50).
  async listAllLeaveRequestsForReport() {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    let rows = mockLeaveRequests.slice();
    if (!['super_admin', 'hrd', 'pimpinan'].includes(profile.role)) {
      if (profile.role === 'kepala_bagian') {
        rows = rows.filter(r => {
          const emp = mockEmployees.find(e => e.id === r.employee_id);
          return emp && emp.department_id === profile.department_id;
        });
      } else {
        rows = rows.filter(r => r.employee_id === profile.employee_id);
      }
    }
    rows = rows
      .map(r => {
        const emp = mockEmployees.find(e => e.id === r.employee_id);
        const dept = emp && mockDepartments.find(d => d.id === emp.department_id);
        return {
          ...r,
          leave_types: mockLeaveTypes.find(t => t.id === r.leave_type_id),
          employees: emp ? { ...emp, departments: dept ? { name: dept.name } : null } : null,
        };
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return delay(rows);
  },

  // ---- Kegiatan Lembaga (mock, meniru RLS institutional_events schema_70) ----
  async listInstitutionalEvents() {
    const rows = mockInstitutionalEvents.slice().sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
      .map(row => ({ ...row, departments: row.department_id ? { name: (mockDepartments.find(d => d.id === row.department_id) || {}).name || null } : null }));
    return delay(rows);
  },
  async createInstitutionalEvent(payload) {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd', 'pimpinan'].includes(profile.role)) {
      return delay({ ok: false, error: 'Anda tidak memiliki izin menambah kegiatan lembaga' });
    }
    const row = {
      id: uid('event'), title: payload.title, description: payload.description || null,
      category: payload.category, start_date: payload.start_date, end_date: payload.end_date,
      department_id: payload.department_id || null,
      created_by_profile_id: profile.id || null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    mockInstitutionalEvents.push(row);
    // Meniru trigger notify_institutional_event_created (schema_71):
    // broadcast ke SEMUA profil kecuali pembuat sendiri.
    const rangeLabel = row.start_date === row.end_date
      ? row.start_date
      : `${row.start_date} – ${row.end_date}`;
    mockProfiles.filter(p => p.id !== profile.id).forEach(p => {
      pushNotification(p.id, 'system', `Kegiatan baru: ${row.title}`,
        rangeLabel + (row.description ? ` — ${row.description}` : ''),
        'app-calendar', 'institutional_events', row.id);
    });
    return delay(row);
  },
  async updateInstitutionalEvent(id, payload) {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd', 'pimpinan'].includes(profile.role)) {
      return delay({ ok: false, error: 'Anda tidak memiliki izin mengubah kegiatan lembaga' });
    }
    const row = mockInstitutionalEvents.find(e => e.id === id);
    if (!row) return delay({ ok: false, error: 'Kegiatan tidak ditemukan' });
    Object.assign(row, {
      title: payload.title, description: payload.description || null, category: payload.category,
      start_date: payload.start_date, end_date: payload.end_date, department_id: payload.department_id || null,
      updated_at: new Date().toISOString(),
    });
    return delay(row);
  },
  async deleteInstitutionalEvent(id) {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd', 'pimpinan'].includes(profile.role)) {
      return delay({ ok: false, error: 'Anda tidak memiliki izin menghapus kegiatan lembaga' });
    }
    mockInstitutionalEvents = mockInstitutionalEvents.filter(e => e.id !== id);
    return delay(true);
  },

  async updateLeaveRequestStatus(id, status, notes) {
    const profile = currentMockProfile();
    const req = mockLeaveRequests.find(r => r.id === id);
    if (!req) return delay({ ok: false, error: 'Pengajuan tidak ditemukan' });
    const emp = mockEmployees.find(e => e.id === req.employee_id);
    const isAdmin = profile && ['super_admin', 'hrd'].includes(profile.role);
    const isKabag = profile && profile.role === 'kepala_bagian' && emp && emp.department_id === profile.department_id;
    const isPimp = profile && profile.role === 'pimpinan';
    const isSelf = profile && profile.employee_id === req.employee_id;

    if (isAdmin) {
      // override bebas
    // PERBAIKAN LEBIH LANJUT (bug ketiga dari keluarga yang sama, mirip
    // schema_16 tapi untuk aksi BATALKAN, bukan isi-tahap): sebelumnya
    // syarat "&& !isKabag && !isPimp" di sini membuat kepala_bagian/
    // pimpinan TIDAK PERNAH bisa membatalkan pengajuan cuti MILIK SENDIRI
    // (karena isKabag/isPimp selalu true untuk diri sendiri). Membatalkan
    // milik sendiri BUKAN konflik kepentingan — beda dari menyetujui/
    // meneruskan sebagai kabag/pimpinan, yang tetap benar diblokir di
    // bawah lewat "!isSelf". Lihat schema_17_fix_self_cancel_blocked.sql.
    } else if (isSelf) {
      if (!['pending_kabag', 'pending_pimpinan'].includes(req.status)) {
        return delay({ ok: false, error: 'Pengajuan yang sudah diproses tidak dapat diubah pegawai' });
      }
      if (status !== 'cancelled') {
        return delay({ ok: false, error: 'Anda hanya dapat membatalkan pengajuan, bukan mengubah keputusan' });
      }
    // PERBAIKAN (meniru schema_13_fix_self_approval_loophole.sql, ditemukan
    // lewat audit RLS sungguhan): "&& !isSelf" WAJIB di sini — tanpa ini,
    // kepala_bagian yang mengajukan cuti untuk DIRINYA SENDIRI akan jatuh
    // ke cabang ini (karena dia memang kepala_bagian departemennya) dan
    // bisa menyetujui pengajuannya sendiri. Sekarang tersangkut di
    // 'pending_kabag' sampai HRD/super_admin ATAU Pimpinan (cabang cadangan
    // di bawah) turun tangan.
    //
    // PEMBARUAN (schema_109, approval cuti 1 TAHAP — Kabag menyetujui =
    // LANGSUNG final, tidak lagi dipaksa 'pending_pimpinan'):
    } else if (isKabag && !isSelf && req.status === 'pending_kabag') {
      if (!['approved', 'rejected'].includes(status)) {
        return delay({ ok: false, error: 'Kepala Bagian hanya dapat menyetujui atau menolak pengajuan cuti ini' });
      }
      req.kabag_decided_by_profile_id = profile.id;
      req.kabag_decided_at = new Date().toISOString();
      req.kabag_notes = notes;
      req.decided_by_profile_id = profile.id; req.decided_at = new Date().toISOString(); req.decision_notes = notes;
    // PIMPINAN — CADANGAN (schema_109): sekarang boleh bertindak LANGSUNG
    // atas 'pending_kabag' (Kabag belum sempat, termasuk kasus self-loophole
    // Kabag di atas) MAUPUN 'pending_pimpinan' (baris lama era 2 tahap,
    // kompatibilitas mundur — TIDAK dipaksa migrasi berubah status, lihat
    // catatan schema_109). kabag_decided_by_profile_id SENGAJA tidak diisi
    // kalau Kabag memang belum pernah bertindak — jejak audit jujur.
    } else if (isPimp && !isSelf && ['pending_kabag', 'pending_pimpinan'].includes(req.status)) {
      if (!['approved', 'rejected'].includes(status)) {
        return delay({ ok: false, error: 'Pimpinan hanya dapat menyetujui atau menolak pengajuan cuti ini' });
      }
      req.decided_by_profile_id = profile.id; req.decided_at = new Date().toISOString(); req.decision_notes = notes;
    } else {
      return delay({ ok: false, error: 'Anda tidak berwenang mengubah pengajuan cuti ini pada tahap saat ini — kemungkinan ini pengajuan Anda sendiri, hubungi HRD/Super Admin' });
    }

    const oldStatus = req.status;
    req.status = status;

    // Meniru efek samping trigger leave_requests_apply_approval (schema_07):
    // approval final menambah used_days + baris kehadiran; pembatalan dari
    // approved membalikkan keduanya.
    if (status === 'approved' && oldStatus !== 'approved') {
      let bal = mockLeaveBalances.find(b => b.employee_id === req.employee_id && b.leave_type_id === req.leave_type_id && b.year === CURRENT_YEAR);
      if (!bal) {
        bal = { id: uid('lb'), employee_id: req.employee_id, leave_type_id: req.leave_type_id, year: CURRENT_YEAR, allocated_days: 0, used_days: 0 };
        mockLeaveBalances.push(bal);
      }
      bal.used_days += req.days_count;
    }
    if (status === 'cancelled' && oldStatus === 'approved') {
      const bal = mockLeaveBalances.find(b => b.employee_id === req.employee_id && b.leave_type_id === req.leave_type_id && b.year === CURRENT_YEAR);
      if (bal) bal.used_days = Math.max(0, bal.used_days - req.days_count);
    }

    // Meniru trigger notify_leave_request_changes AFTER UPDATE (schema_18).
    if (oldStatus !== status) {
      if (status === 'pending_pimpinan') {
        findProfileIdsByRole('pimpinan').forEach(pid => pushNotification(
          pid, 'leave_request', 'Cuti menunggu persetujuan Anda',
          `${emp?.full_name || 'Pegawai'} — cuti diteruskan Kepala Bagian, menunggu persetujuan final.`,
          'app-leave', 'employee_leave_requests', req.id
        ));
      } else if (status === 'approved') {
        pushNotification(findProfileIdByEmployeeId(req.employee_id), 'leave_request', 'Cuti disetujui',
          'Pengajuan cuti Anda telah disetujui.', 'app-leave', 'employee_leave_requests', req.id);
      } else if (status === 'rejected') {
        pushNotification(findProfileIdByEmployeeId(req.employee_id), 'leave_request', 'Cuti ditolak',
          'Pengajuan cuti Anda ditolak. Lihat catatan untuk detail.', 'app-leave', 'employee_leave_requests', req.id);
      }
    }

    return delay({ ok: true });
  },

  async getTodayAttendance(employeeId) {
    const today = new Date().toISOString().slice(0, 10);
    return delay(mockAttendance.find(a => a.employee_id === employeeId && a.attendance_date === today) || null);
  },

  async checkIn(employeeId, location) {
    const profile = currentMockProfile();
    if (!profile || profile.employee_id !== employeeId) return delay({ ok: false, error: 'Anda hanya dapat check-in untuk diri sendiri' });
    const today = new Date().toISOString().slice(0, 10);
    if (mockAttendance.some(a => a.employee_id === employeeId && a.attendance_date === today)) {
      return delay({ ok: false, error: 'Anda sudah check-in hari ini' });
    }
    const now = new Date();
    // Konsisten dengan supabaseDataService.checkIn: status 'late' dihitung
    // dari shift efektif pegawai + toleransi late_grace_minutes-nya, supaya
    // perilaku mode mock (offline/demo) sama dengan mode Supabase (production).
    let status = 'present';
    const shift = await this.resolveShiftForEmployee(employeeId);
    if (shift?.start_time) {
      const [h, m] = String(shift.start_time).split(':').map((v) => parseInt(v, 10));
      if (!Number.isNaN(h) && !Number.isNaN(m)) {
        const graceMin = Number.isFinite(shift.late_grace_minutes) ? shift.late_grace_minutes : 15;
        const deadline = new Date(now);
        deadline.setHours(h, m + graceMin, 0, 0);
        if (now > deadline) status = 'late';
      }
    }
    mockAttendance.unshift({
      id: uid('att'), employee_id: employeeId, attendance_date: today,
      check_in: now.toISOString(), check_out: null, status, notes: null, corrected_by_profile_id: null,
      check_in_latitude: location?.latitude ?? null, check_in_longitude: location?.longitude ?? null, check_in_accuracy_m: location?.accuracy ?? null,
      check_out_latitude: null, check_out_longitude: null, check_out_accuracy_m: null,
    });
    return delay({ ok: true });
  },

  async checkOut(employeeId, location) {
    const profile = currentMockProfile();
    if (!profile || profile.employee_id !== employeeId) return delay({ ok: false, error: 'Anda hanya dapat check-out untuk diri sendiri' });
    const today = new Date().toISOString().slice(0, 10);
    const row = mockAttendance.find(a => a.employee_id === employeeId && a.attendance_date === today);
    if (!row) return delay({ ok: false, error: 'Anda belum check-in hari ini' });
    row.check_out = new Date().toISOString();
    row.check_out_latitude = location?.latitude ?? null;
    row.check_out_longitude = location?.longitude ?? null;
    row.check_out_accuracy_m = location?.accuracy ?? null;
    return delay({ ok: true });
  },

  // Meniru RLS employee_attendance_select: super_admin/hrd/pimpinan/
  // bendahara lihat semua, kepala_bagian lihat departemennya, selain itu
  // hanya milik sendiri.
  // Meniru RLS employee_attendance_select (schema_03): super_admin/hrd/
  // pimpinan/bendahara/kepala_bagian departemen terkait/pemilik data.
  // SEBELUMNYA fungsi ini tidak punya pengecekan otorisasi sama sekali —
  // aman selama hanya dipanggil untuk employee_id milik sendiri (halaman
  // Kehadiran), tapi sekarang juga dipakai di tab Kehadiran pada profil
  // pegawai LAIN, jadi perlu ditegakkan di sini juga.
  async listMyAttendance(employeeId, limit = 14) {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    const emp = mockEmployees.find(e => e.id === employeeId);
    const allowed = ['super_admin', 'hrd', 'pimpinan', 'bendahara_umum'].includes(profile.role)
      || (profile.role === 'kepala_bagian' && emp && emp.department_id === profile.department_id)
      || profile.employee_id === employeeId;
    if (!allowed) return delay([]);
    const rows = mockAttendance
      .filter(a => a.employee_id === employeeId)
      .sort((a, b) => (a.attendance_date < b.attendance_date ? 1 : -1))
      .slice(0, limit);
    return delay(rows);
  },

  async listTeamAttendance(date) {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    let rows = mockAttendance.filter(a => a.attendance_date === date);
    if (!['super_admin', 'hrd', 'pimpinan', 'bendahara_umum'].includes(profile.role)) {
      if (profile.role === 'kepala_bagian') {
        rows = rows.filter(a => {
          const emp = mockEmployees.find(e => e.id === a.employee_id);
          return emp && emp.department_id === profile.department_id;
        });
      } else {
        rows = rows.filter(a => a.employee_id === profile.employee_id);
      }
    }
    rows = rows.map(a => ({ ...a, employees: mockEmployees.find(e => e.id === a.employee_id) }));
    return delay(rows);
  },

  // Meniru RLS employee_attendance_insert/update: HANYA super_admin/hrd.
  async upsertAttendanceCorrection({ employeeId, date, status, notes }) {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd'].includes(profile.role)) {
      return delay({ ok: false, error: 'Anda tidak memiliki izin melakukan koreksi kehadiran' });
    }
    let row = mockAttendance.find(a => a.employee_id === employeeId && a.attendance_date === date);
    if (row) {
      row.status = status; row.notes = notes; row.corrected_by_profile_id = profile.id;
    } else {
      mockAttendance.unshift({
        id: uid('att'), employee_id: employeeId, attendance_date: date,
        check_in: null, check_out: null, status, notes, corrected_by_profile_id: profile.id,
      });
    }
    return delay({ ok: true });
  },

  async listPerformanceCriteria() {
    return delay(mockPerfCriteria.filter(c => c.is_active));
  },

  async listPerformancePeriods() {
    return delay([...mockPerfPeriods].sort((a, b) => (a.code < b.code ? 1 : -1)));
  },

  async createPerformancePeriod({ code, name, startDate, endDate }) {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd'].includes(profile.role)) return delay({ ok: false, error: 'Hanya Super Admin/HRD yang dapat membuat periode' });
    if (mockPerfPeriods.some(p => p.code === code)) return delay({ ok: false, error: 'Kode periode sudah dipakai' });
    const period = { id: uid('pp'), code, name, start_date: startDate, end_date: endDate, status: 'open' };
    mockPerfPeriods.unshift(period);
    return delay({ ok: true, period });
  },

  // Meniru RLS performance_reviews_select (schema_08).
  async listPerformanceReviews({ employeeId, periodId } = {}) {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    let rows = [...mockPerfReviews];
    if (employeeId) rows = rows.filter(r => r.employee_id === employeeId);
    if (periodId) rows = rows.filter(r => r.period_id === periodId);
    if (!['super_admin', 'hrd', 'pimpinan'].includes(profile.role)) {
      if (profile.role === 'kepala_bagian') {
        rows = rows.filter(r => {
          const emp = mockEmployees.find(e => e.id === r.employee_id);
          return emp && emp.department_id === profile.department_id;
        });
      } else {
        rows = rows.filter(r => r.employee_id === profile.employee_id);
      }
    }
    rows = rows.map(r => ({
      ...r,
      employees: mockEmployees.find(e => e.id === r.employee_id),
      performance_review_periods: mockPerfPeriods.find(p => p.id === r.period_id),
    })).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return delay(rows);
  },

  // Padanan mock dari listPendingTasksForReviews (dipakai Rekap Kinerja
  // di Laporan). Tidak perlu cek otorisasi tambahan di sini — review_ids
  // yang dikirim ke sini sudah lolos filter listPerformanceReviews() di atas.
  async listPendingTasksForReviews(reviewIds) {
    if (!reviewIds || !reviewIds.length) return delay([]);
    const ids = new Set(reviewIds);
    const rows = mockPerfPendingTasks
      .filter(t => ids.has(t.review_id))
      .map(t => ({ review_id: t.review_id, task_name: t.task_name, new_deadline: t.new_deadline }));
    return delay(rows);
  },

  // ASUMSI DESAIN #1 (lihat schema_08): pegawai (bukan penilai) hanya
  // melihat skor evaluator_role='self' miliknya SELAMA belum finalized;
  // begitu finalized, semua skor terlihat.
  async getPerformanceReview(reviewId) {
    const profile = currentMockProfile();
    const review = mockPerfReviews.find(r => r.id === reviewId);
    if (!review) return delay(null);
    const emp = mockEmployees.find(e => e.id === review.employee_id);
    const canSeeAll = profile && (
      ['super_admin', 'hrd', 'pimpinan'].includes(profile.role)
      || (profile.role === 'kepala_bagian' && emp && emp.department_id === profile.department_id)
    );
    const isSelf = profile && profile.employee_id === review.employee_id;
    if (!canSeeAll && !isSelf) return delay(null);

    let scores = mockPerfScores.filter(s => s.review_id === reviewId);
    if (isSelf && !canSeeAll && review.status !== 'finalized') {
      scores = scores.filter(s => s.evaluator_role === 'self');
    }
    scores = scores.map(s => ({ ...s, performance_criteria: mockPerfCriteria.find(c => c.id === s.criterion_id) }));
    // schema_46 — data faktual "Capaian & Pekerjaan Belum Selesai" ikut
    // dikembalikan bersama review, TIDAK dibatasi bertahap seperti skor
    // evaluator (lihat RLS perf_pending_tasks_select: sama dengan hak
    // lihat baris review induk, bukan hak lihat skor).
    const pendingTasks = mockPerfPendingTasks
      .filter(t => t.review_id === reviewId)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    // schema_77 — Pekerjaan Selesai (Bobot) ikut dikembalikan bersama
    // review, hak lihat SAMA dengan hak lihat baris review induk
    // (perf_completed_tasks_select), bukan dibatasi bertahap seperti skor.
    const completedTasks = mockPerfCompletedTasks
      .filter(t => t.review_id === reviewId)
      .map(t => ({ ...t, task_weight_categories: mockTaskWeightCategories.find(c => c.id === t.category_id) || null }))
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    return delay({
      ...review, employees: emp,
      performance_review_periods: mockPerfPeriods.find(p => p.id === review.period_id),
      scores, pending_tasks: pendingTasks, completed_tasks: completedTasks,
    });
  },

  async createPerformanceReview({ employeeId, periodId }) {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd'].includes(profile.role)) return delay({ ok: false, error: 'Hanya Super Admin/HRD yang dapat membuat review baru' });
    if (mockPerfReviews.some(r => r.employee_id === employeeId && r.period_id === periodId)) {
      return delay({ ok: false, error: 'Review untuk pegawai dan periode ini sudah ada' });
    }
    const review = {
      id: uid('pr'), employee_id: employeeId, period_id: periodId, status: 'draft', overall_score: null, hrd_summary_notes: null,
      achievement_output: null, success_level: null, // schema_46
      self_submitted_by_profile_id: null, self_submitted_at: null,
      atasan_submitted_by_profile_id: null, atasan_submitted_at: null,
      hrd_finalized_by_profile_id: null, hrd_finalized_at: null,
      created_at: new Date().toISOString(),
    };
    mockPerfReviews.unshift(review);
    // Meniru trigger notify_performance_review_changes AFTER INSERT (schema_18).
    const period = mockPerfPeriods.find(p => p.id === periodId);
    pushNotification(
      findProfileIdByEmployeeId(employeeId), 'performance_review', 'Penilaian kinerja baru',
      `Review kinerja periode ${period?.name || '-'} dibuat, silakan isi penilaian diri Anda.`,
      'app-performance', 'performance_reviews', review.id
    );
    return delay({ ok: true, review });
  },

  // Simpan skor untuk SATU evaluator_role + majukan tahap review dalam
  // satu aksi — meniru trigger performance_reviews_protect_fields
  // (schema_08). Urutan PENTING: skor ditulis selagi status LAMA masih
  // cocok, baru status dipindah.
  async submitPerformanceStage({ reviewId, evaluatorRole, scores, notes }) {
    const profile = currentMockProfile();
    const review = mockPerfReviews.find(r => r.id === reviewId);
    if (!review) return delay({ ok: false, error: 'Review tidak ditemukan' });
    const emp = mockEmployees.find(e => e.id === review.employee_id);
    const isAdmin = profile && ['super_admin', 'hrd'].includes(profile.role);
    const isAtasan = profile && profile.role === 'kepala_bagian' && emp && emp.department_id === profile.department_id;
    const isSelf = profile && profile.employee_id === review.employee_id;

    const stageRules = {
      // PERBAIKAN LEBIH LANJUT (ditemukan lewat simulasi lanjutan setelah
      // menutup bug self-approval di atas — bug KEDUA yang berbeda arah):
      // sebelumnya syarat "&& !isAtasan" di sini membuat kepala_bagian
      // TIDAK PERNAH bisa mengisi penilaian DIRI SENDIRI (karena is_atasan
      // selalu true untuk dirinya) — review mereka macet permanen di
      // 'draft'. Mengisi penilaian diri BUKAN konflik kepentingan (beda
      // dari MENYETUJUI sebagai atasan, yang tetap benar diblokir di
      // bawah lewat "!isSelf"), jadi syarat itu dihapus di sini. Lihat
      // schema_16_fix_self_assessment_blocked.sql untuk perbaikan SQL-nya.
      self: { requiredStatus: 'draft', nextStatus: 'self_done', authorized: isAdmin || isSelf },
      // PERBAIKAN (meniru schema_13_fix_self_approval_loophole.sql): tahap
      // "atasan" WAJIB "&& !isSelf" — tanpa ini, kepala_bagian yang dinilai
      // kinerjanya sendiri (dia tetap kepala_bagian departemennya) bisa
      // mengisi tahap penilaian atasan untuk dirinya sendiri. Sekarang
      // tersangkut di 'self_done' sampai HRD/super_admin turun tangan.
      atasan: { requiredStatus: 'self_done', nextStatus: 'atasan_done', authorized: isAdmin || (isAtasan && !isSelf) },
      hrd: { requiredStatus: 'atasan_done', nextStatus: 'finalized', authorized: isAdmin },
    };
    const rule = stageRules[evaluatorRole];
    if (!rule) return delay({ ok: false, error: 'evaluatorRole tidak dikenal' });
    if (!rule.authorized) return delay({ ok: false, error: 'Anda tidak berwenang mengisi tahap ini' });
    if (review.status !== rule.requiredStatus && !isAdmin) {
      return delay({ ok: false, error: `Review belum berada di tahap yang sesuai (status saat ini: ${review.status})` });
    }

    for (const s of (scores || [])) {
      let row = mockPerfScores.find(x => x.review_id === reviewId && x.criterion_id === s.criterionId && x.evaluator_role === evaluatorRole);
      if (row) { row.score = s.score; row.comment = s.comment || null; }
      else {
        mockPerfScores.push({ id: uid('psc'), review_id: reviewId, criterion_id: s.criterionId, evaluator_role: evaluatorRole, score: s.score, comment: s.comment || null, created_at: new Date().toISOString() });
      }
    }

    const now = new Date().toISOString();
    if (evaluatorRole === 'self') { review.self_submitted_by_profile_id = profile.id; review.self_submitted_at = now; }
    if (evaluatorRole === 'atasan') { review.atasan_submitted_by_profile_id = profile.id; review.atasan_submitted_at = now; }
    if (evaluatorRole === 'hrd') { review.hrd_finalized_by_profile_id = profile.id; review.hrd_finalized_at = now; review.hrd_summary_notes = notes || null; }
    review.status = rule.nextStatus;

    const allScores = mockPerfScores.filter(x => x.review_id === reviewId);
    review.overall_score = allScores.length ? Math.round((allScores.reduce((a, b) => a + b.score, 0) / allScores.length) * 10) / 10 : null;

    // Meniru trigger notify_performance_review_changes AFTER UPDATE (schema_18).
    const perfPeriod = mockPerfPeriods.find(p => p.id === review.period_id);
    if (rule.nextStatus === 'self_done') {
      pushNotification(findKabagProfileId(emp?.department_id), 'performance_review', 'Penilaian kinerja menunggu Anda',
        `${emp?.full_name || 'Pegawai'} telah mengisi penilaian diri, menunggu penilaian atasan.`,
        'app-performance', 'performance_reviews', reviewId);
    } else if (rule.nextStatus === 'atasan_done') {
      findProfileIdsByRole('hrd').forEach(pid => pushNotification(
        pid, 'performance_review', 'Penilaian kinerja siap difinalisasi',
        `${emp?.full_name || 'Pegawai'} — penilaian atasan selesai, menunggu finalisasi HRD.`,
        'app-performance', 'performance_reviews', reviewId
      ));
    } else if (rule.nextStatus === 'finalized') {
      pushNotification(findProfileIdByEmployeeId(review.employee_id), 'performance_review', 'Penilaian kinerja selesai',
        `Review kinerja periode ${perfPeriod?.name || '-'} Anda telah difinalisasi.`,
        'app-performance', 'performance_reviews', reviewId);
    }

    return delay({ ok: true });
  },

  // schema_46 — Capaian & Output, Tingkat Keberhasilan, dan Pekerjaan
  // Belum Selesai. Meniru RLS perf_pending_tasks_write/performance_
  // reviews_update: pemilik review HANYA selama status='draft', admin
  // (super_admin/hrd) selalu boleh (mis. koreksi data). Pola "hapus semua
  // baris lama lalu insert ulang" untuk pending tasks — cukup untuk
  // volume kecil per review dan menghindari logika diff insert/update/
  // delete yang lebih rumit tanpa manfaat nyata di sini.
  async savePerformanceMonthlySummary({ reviewId, achievementOutput, successLevel, pendingTasks }) {
    const profile = currentMockProfile();
    const review = mockPerfReviews.find(r => r.id === reviewId);
    if (!review) return delay({ ok: false, error: 'Review tidak ditemukan' });
    const isAdmin = profile && ['super_admin', 'hrd'].includes(profile.role);
    const isSelf = profile && profile.employee_id === review.employee_id;
    if (!isAdmin && !(isSelf && review.status === 'draft')) {
      return delay({ ok: false, error: 'Anda tidak berwenang mengubah Capaian & Output pada tahap ini' });
    }

    if (achievementOutput != null) {
      const len = achievementOutput.trim().length;
      if (len < 20 || len > 2000) {
        return delay({ ok: false, error: 'Capaian & Output harus 20–2000 karakter' });
      }
    }
    if (successLevel != null && !PERF_SUCCESS_LEVELS.includes(successLevel)) {
      return delay({ ok: false, error: 'Tingkat Keberhasilan tidak dikenal' });
    }
    for (const t of (pendingTasks || [])) {
      if (!t.taskName || !t.initialTarget || t.progress === '' || t.progress == null
        || !t.obstacle || !t.followUpPlan || !t.newDeadline) {
        return delay({ ok: false, error: 'Semua kolom Pekerjaan Belum Selesai wajib diisi' });
      }
      const progressNum = Number(t.progress);
      if (isNaN(progressNum) || progressNum < 0 || progressNum > 100) {
        return delay({ ok: false, error: 'Progress harus di antara 0–100%' });
      }
      // schema_61 — Deadline Baru boleh lebih awal dari Target Awal HANYA
      // dengan alasan tertulis (>=10 karakter), meniru CHECK constraint
      // performance_review_pending_tasks_deadline_reason_required di DB.
      // Ini bukan pelonggaran validasi lama tanpa syarat — hard block
      // schema_46 diganti jadi pengecualian BERSYARAT sesuai spec asli
      // ("kecuali terdapat alasan khusus yang diizinkan sistem").
      if (t.newDeadline < t.initialTarget) {
        const reason = (t.deadlineChangeReason || '').trim();
        if (reason.length < 10) {
          return delay({ ok: false, error: `Deadline Baru untuk "${t.taskName}" lebih awal dari Target Awal — wajib isi alasan (minimal 10 karakter)` });
        }
      }
      if (t.status && !PERF_TASK_STATUSES.includes(t.status)) {
        return delay({ ok: false, error: `Status pekerjaan "${t.taskName}" tidak dikenal` });
      }
    }

    review.achievement_output = achievementOutput != null ? achievementOutput.trim() : review.achievement_output;
    review.success_level = successLevel !== undefined ? successLevel : review.success_level;

    const now = new Date().toISOString();
    mockPerfPendingTasks = mockPerfPendingTasks.filter(t => t.review_id !== reviewId);
    (pendingTasks || []).forEach(t => {
      mockPerfPendingTasks.push({
        id: uid('ppt'), review_id: reviewId,
        task_name: t.taskName.trim(), initial_target: t.initialTarget,
        progress: Number(t.progress), obstacle: t.obstacle.trim(),
        follow_up_plan: t.followUpPlan.trim(), new_deadline: t.newDeadline,
        deadline_change_reason: t.newDeadline < t.initialTarget ? (t.deadlineChangeReason || '').trim() : null,
        // Status "Pekerjaan Belum Selesai" (bagian 11 prompt asli) --
        // sebelumnya di-hardcode 'berjalan' di sini, artinya perubahan
        // status pengguna HILANG setiap kali Capaian & Output disimpan
        // ulang (pola delete-lalu-insert-ulang di bawah). Sekarang ikut
        // nilai dari klien, jatuh ke default DB 'berjalan' kalau kosong.
        status: t.status || 'berjalan',
        created_at: now, updated_at: now,
        created_by: profile.id, updated_by: profile.id,
      });
    });

    return delay({ ok: true });
  },

  async listPerformancePendingTasks(reviewId) {
    return delay(mockPerfPendingTasks.filter(t => t.review_id === reviewId));
  },

  /* ============================================================
     Indeks Beban vs Kompensasi (schema_77) — kategori bobot tugas
     (Lapis 1), pekerjaan selesai + penyesuaian atasan (Lapis 2/3),
     dan view agregasi. Meniru RLS/trigger di file migrasi.
     ============================================================ */

  // task_weight_categories_select: semua profil login boleh baca.
  async listTaskWeightCategories({ departmentId, includeInactive } = {}) {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    let rows = [...mockTaskWeightCategories];
    if (!includeInactive) rows = rows.filter(c => c.is_active);
    if (departmentId !== undefined) rows = rows.filter(c => c.department_id === null || c.department_id === departmentId);
    rows = rows.map(c => ({ ...c, departments: mockDepartments.find(d => d.id === c.department_id) || null }));
    return delay(rows.sort((a, b) => (a.name > b.name ? 1 : -1)));
  },

  // task_weight_categories_write: super_admin/hrd/pimpinan.
  async upsertTaskWeightCategory({ id, departmentId, name, baseWeight, description, isActive }) {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd', 'pimpinan'].includes(profile.role)) {
      return delay({ ok: false, error: 'Hanya Super Admin, HRD, atau Pimpinan yang dapat mengelola kategori bobot tugas' });
    }
    const trimmedName = (name || '').trim();
    if (!trimmedName) return delay({ ok: false, error: 'Nama kategori wajib diisi' });
    const weight = Number(baseWeight);
    if (!Number.isInteger(weight) || weight < 1 || weight > 5) {
      return delay({ ok: false, error: 'Bobot dasar harus bilangan bulat 1–5' });
    }
    const dup = mockTaskWeightCategories.find(c => c.department_id === (departmentId || null) && c.name === trimmedName && c.id !== id);
    if (dup) return delay({ ok: false, error: 'Kategori dengan nama yang sama sudah ada untuk unit ini' });
    const now = new Date().toISOString();
    if (id) {
      const row = mockTaskWeightCategories.find(c => c.id === id);
      if (!row) return delay({ ok: false, error: 'Kategori tidak ditemukan' });
      row.department_id = departmentId || null; row.name = trimmedName; row.base_weight = weight;
      row.description = description || null; row.is_active = isActive !== false;
      row.updated_at = now; row.updated_by = profile.id;
    } else {
      mockTaskWeightCategories.unshift({
        id: uid('twc'), department_id: departmentId || null, name: trimmedName, base_weight: weight,
        description: description || null, is_active: isActive !== false,
        created_at: now, updated_at: now, created_by: profile.id, updated_by: profile.id,
      });
    }
    return delay({ ok: true });
  },

  // perf_completed_tasks_select: pemilik review, atasan departemen,
  // hrd/pimpinan/super_admin.
  async listPerformanceCompletedTasks(reviewId) {
    const profile = currentMockProfile();
    const review = mockPerfReviews.find(r => r.id === reviewId);
    if (!profile || !review) return delay([]);
    const emp = mockEmployees.find(e => e.id === review.employee_id);
    const canSee = ['super_admin', 'hrd', 'pimpinan'].includes(profile.role)
      || (profile.role === 'kepala_bagian' && emp && emp.department_id === profile.department_id)
      || profile.employee_id === review.employee_id;
    if (!canSee) return delay([]);
    const rows = mockPerfCompletedTasks
      .filter(t => t.review_id === reviewId)
      .map(t => ({ ...t, task_weight_categories: mockTaskWeightCategories.find(c => c.id === t.category_id) || null }))
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    return delay(rows);
  },

  // perf_completed_tasks_write (insert, pemilik selama status='draft')
  // + trigger perf_completed_tasks_set_audit (weight_adjustment WAJIB 0
  // saat insert oleh pemilik). Pola delete-lalu-insert-ulang SAMA
  // seperti savePerformanceMonthlySummary/pending_tasks — aman karena
  // jendela tulis pemilik (status='draft') dan jendela tulis atasan
  // (setelah self_done) tidak pernah tumpang tindih.
  async saveMyCompletedTasks({ reviewId, completedTasks }) {
    const profile = currentMockProfile();
    const review = mockPerfReviews.find(r => r.id === reviewId);
    if (!review) return delay({ ok: false, error: 'Review tidak ditemukan' });
    const isAdmin = profile && ['super_admin', 'hrd'].includes(profile.role);
    const isSelf = profile && profile.employee_id === review.employee_id;
    if (!isAdmin && !(isSelf && review.status === 'draft')) {
      return delay({ ok: false, error: 'Anda tidak berwenang mengubah Pekerjaan Selesai pada tahap ini' });
    }
    for (const t of (completedTasks || [])) {
      if (!t.categoryId) return delay({ ok: false, error: 'Kategori tugas wajib dipilih untuk setiap Pekerjaan Selesai' });
      if (!t.taskName || !t.taskName.trim()) return delay({ ok: false, error: 'Nama tugas wajib diisi untuk setiap Pekerjaan Selesai' });
      if (!t.completedDate) return delay({ ok: false, error: 'Tanggal selesai wajib diisi untuk setiap Pekerjaan Selesai' });
      const cat = mockTaskWeightCategories.find(c => c.id === t.categoryId && c.is_active);
      if (!cat) return delay({ ok: false, error: `Kategori tugas untuk "${t.taskName}" tidak ditemukan/tidak aktif` });
    }
    const now = new Date().toISOString();
    // Baris yang sudah PERNAH disesuaikan atasan (weight_adjustment != 0)
    // TIDAK ikut dihapus/ditimpa oleh save pemilik — melindungi penilaian
    // atasan yang sudah masuk dari race penyimpanan ulang pemilik dalam
    // sesi yang sama (di produksi RLS mencegah ini lewat status='draft',
    // ini lapis jaga tambahan murni di sisi mock).
    const alreadyAdjustedIds = new Set(
      mockPerfCompletedTasks.filter(t => t.review_id === reviewId && t.weight_adjustment !== 0).map(t => t.id)
    );
    mockPerfCompletedTasks = mockPerfCompletedTasks.filter(t => t.review_id !== reviewId || alreadyAdjustedIds.has(t.id));
    (completedTasks || []).forEach(t => {
      const cat = mockTaskWeightCategories.find(c => c.id === t.categoryId);
      mockPerfCompletedTasks.push({
        id: uid('pct'), review_id: reviewId, category_id: t.categoryId,
        task_name: t.taskName.trim(), completed_date: t.completedDate,
        weight_base: cat.base_weight, weight_adjustment: 0, adjustment_reason: null,
        adjusted_by: null, adjusted_at: null,
        created_at: now, updated_at: now, created_by: profile.id, updated_by: profile.id,
      });
    });
    return delay({ ok: true });
  },

  // Lapis 2 — penyesuaian atasan/HRD/pimpinan, TIDAK terikat status
  // review (RLS mengizinkan kapan pun, lihat perf_completed_tasks_write).
  // Meniru guard trigger: pemilik review sendiri TIDAK boleh menyesuaikan
  // bobot pekerjaannya sendiri; -1..1; alasan wajib >=10 karakter kalau
  // adjustment != 0.
  async adjustCompletedTaskWeight({ taskId, weightAdjustment, adjustmentReason }) {
    const profile = currentMockProfile();
    const task = mockPerfCompletedTasks.find(t => t.id === taskId);
    if (!task) return delay({ ok: false, error: 'Pekerjaan tidak ditemukan' });
    const review = mockPerfReviews.find(r => r.id === task.review_id);
    const emp = review && mockEmployees.find(e => e.id === review.employee_id);
    const isOwner = profile && review && profile.employee_id === review.employee_id;
    const canAdjust = profile && (
      ['super_admin', 'hrd', 'pimpinan'].includes(profile.role)
      || (profile.role === 'kepala_bagian' && emp && emp.department_id === profile.department_id)
    );
    if (!canAdjust || isOwner) {
      return delay({ ok: false, error: 'Hanya atasan/HRD/Pimpinan (bukan pemilik pekerjaan) yang boleh menyesuaikan bobot' });
    }
    const adj = Number(weightAdjustment);
    if (![-1, 0, 1].includes(adj)) return delay({ ok: false, error: 'Penyesuaian bobot harus -1, 0, atau +1' });
    const reason = (adjustmentReason || '').trim();
    if (adj !== 0 && reason.length < 10) {
      return delay({ ok: false, error: 'Alasan penyesuaian wajib diisi (minimal 10 karakter) saat bobot diubah' });
    }
    const finalWeight = task.weight_base + adj;
    if (finalWeight < 1 || finalWeight > 5) return delay({ ok: false, error: 'Bobot akhir di luar rentang 1–5' });
    task.weight_adjustment = adj;
    task.adjustment_reason = adj !== 0 ? reason : null;
    task.adjusted_by = profile.id; task.adjusted_at = new Date().toISOString();
    task.updated_at = task.adjusted_at; task.updated_by = profile.id;
    return delay({ ok: true, weightFinal: finalWeight });
  },

  // v_workload_pay_ratio — HANYA super_admin/hrd/pimpinan/kepala_bagian
  // (departemennya sendiri untuk kepala_bagian), meniru filter RLS view.
  async getWorkloadPayRatio({ periodId } = {}) {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd', 'pimpinan', 'kepala_bagian'].includes(profile.role)) return delay([]);
    let reviews = [...mockPerfReviews];
    if (periodId) reviews = reviews.filter(r => r.period_id === periodId);
    if (profile.role === 'kepala_bagian') {
      reviews = reviews.filter(r => {
        const e = mockEmployees.find(x => x.id === r.employee_id);
        return e && e.department_id === profile.department_id;
      });
    }
    const rows = reviews.map(r => {
      const emp = mockEmployees.find(e => e.id === r.employee_id);
      const dept = emp && mockDepartments.find(d => d.id === emp.department_id);
      const payroll = mockPayrollInfo.find(p => p.employee_id === r.employee_id);
      const tasks = mockPerfCompletedTasks.filter(t => t.review_id === r.id);
      const workloadScore = tasks.reduce((sum, t) => sum + (t.weight_base + t.weight_adjustment), 0);
      const totalNetMonthly = payroll ? mockComputeTotalNetMonthly(payroll) : null;
      const payPerPoint = workloadScore > 0 && totalNetMonthly != null
        ? Math.round((totalNetMonthly / workloadScore) * 100) / 100 : null;
      return {
        review_id: r.id, period_id: r.period_id,
        period_name: mockPerfPeriods.find(p => p.id === r.period_id)?.name || '—',
        employee_id: emp?.id, employee_code: emp?.employee_code, full_name: emp?.full_name,
        position: emp?.position, department_id: emp?.department_id, department_name: dept?.name || '—',
        tasks_completed_count: tasks.length, workload_score: workloadScore,
        workload_score_heavy_tasks: tasks.filter(t => t.weight_base >= 4).reduce((s, t) => s + (t.weight_base + t.weight_adjustment), 0),
        total_net_monthly: totalNetMonthly, pay_per_workload_point: payPerPoint,
      };
    });
    // department_avg_pay_per_workload_point — rata-rata per department_id+period_id.
    const groups = {};
    rows.forEach(r => {
      const key = `${r.department_id}__${r.period_id}`;
      (groups[key] = groups[key] || []).push(r);
    });
    Object.values(groups).forEach(group => {
      const valid = group.filter(r => r.pay_per_workload_point != null);
      const avg = valid.length ? Math.round((valid.reduce((s, r) => s + r.pay_per_workload_point, 0) / valid.length) * 100) / 100 : null;
      group.forEach(r => { r.department_avg_pay_per_workload_point = avg; });
    });
    return delay(rows.sort((a, b) => (a.full_name > b.full_name ? 1 : -1)));
  },

  // v_workload_pay_ratio_by_department — ringkasan per unit, hanya
  // super_admin/hrd/pimpinan (bukan kepala_bagian, meniru RLS view kedua).
  async getWorkloadPayRatioByDepartment({ periodId } = {}) {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd', 'pimpinan'].includes(profile.role)) return delay([]);
    const perEmployee = await this.getWorkloadPayRatio({ periodId });
    const groups = {};
    perEmployee.forEach(r => {
      const key = `${r.department_id}__${r.period_id}`;
      (groups[key] = groups[key] || { department_id: r.department_id, department_name: r.department_name, period_id: r.period_id, period_name: r.period_name, rows: [] }).rows.push(r);
    });
    return Object.values(groups).map(g => {
      const withTasks = g.rows.filter(r => r.workload_score > 0);
      const ratios = g.rows.filter(r => r.pay_per_workload_point != null).map(r => r.pay_per_workload_point);
      const avg = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
      const variance = ratios.length ? ratios.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / ratios.length : null;
      return {
        department_id: g.department_id, department_name: g.department_name,
        period_id: g.period_id, period_name: g.period_name,
        employee_count: g.rows.length, employee_count_with_tasks: withTasks.length,
        avg_pay_per_workload_point: avg != null ? Math.round(avg * 100) / 100 : null,
        min_pay_per_workload_point: ratios.length ? Math.round(Math.min(...ratios) * 100) / 100 : null,
        max_pay_per_workload_point: ratios.length ? Math.round(Math.max(...ratios) * 100) / 100 : null,
        stddev_pay_per_workload_point: variance != null ? Math.round(Math.sqrt(variance) * 100) / 100 : null,
      };
    });
  },

  // RLS employee_education/certifications/competencies SELECT (schema_02):
  // super_admin/hrd/kepala_bagian(departemen)/pemilik sendiri.
  _canSeeProfessionalRecords(employeeId) {
    const profile = currentMockProfile();
    if (!profile) return false;
    if (['super_admin', 'hrd'].includes(profile.role)) return true;
    if (profile.employee_id === employeeId) return true;
    if (profile.role === 'kepala_bagian') {
      const emp = mockEmployees.find(e => e.id === employeeId);
      return emp && emp.department_id === profile.department_id;
    }
    return false;
  },
  // WRITE-nya lebih sempit dari SELECT: kepala_bagian TIDAK termasuk
  // (lihat employee_education_write dkk di schema_02 — hanya
  // super_admin/hrd/pemilik sendiri).
  _canWriteProfessionalRecords(employeeId) {
    const profile = currentMockProfile();
    if (!profile) return false;
    return ['super_admin', 'hrd'].includes(profile.role) || profile.employee_id === employeeId;
  },

  // ---- Laporan Kinerja Bulanan (schema_94) ----
  async getOrCreateMyMonthlyReport(periodMonth) {
    const profile = currentMockProfile();
    if (!profile || !profile.employee_id) throw new Error('Akun ini tidak terhubung ke data pegawai');
    const pm = (periodMonth || new Date().toISOString().slice(0, 7) + '-01').slice(0, 8) + '01';
    let report = mockMonthlyReports.find(r => r.employee_id === profile.employee_id && r.period_month === pm);
    if (!report) {
      report = {
        id: 'mwr-' + (mockMonthlyReportSeq++), employee_id: profile.employee_id, period_month: pm,
        status: 'draft', submitted_at: null, auto_submitted: false, created_at: new Date().toISOString(),
      };
      mockMonthlyReports.push(report);
    }
    return delay(report.id);
  },
  async autoSubmitOverdueMonthlyReports() {
    const profile = currentMockProfile();
    if (!profile || !profile.employee_id) return delay(0);
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
    let count = 0;
    mockMonthlyReports.forEach(r => {
      if (r.employee_id === profile.employee_id && r.status === 'draft' && r.period_month < currentMonth) {
        r.status = 'submitted'; r.submitted_at = new Date().toISOString(); r.auto_submitted = true; count++;
      }
    });
    return delay(count);
  },
  async adminAutoSubmitAllOverdueMonthlyReports() {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd'].includes(profile.role)) throw new Error('Tidak diizinkan');
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
    let count = 0;
    mockMonthlyReports.forEach(r => {
      if (r.status === 'draft' && r.period_month < currentMonth) {
        r.status = 'submitted'; r.submitted_at = new Date().toISOString(); r.auto_submitted = true; count++;
      }
    });
    return delay(count);
  },
  async getMonthlyReport(reportId) {
    const report = mockMonthlyReports.find(r => r.id === reportId);
    if (!report) throw new Error('Laporan tidak ditemukan');
    const emp = mockEmployees.find(e => e.id === report.employee_id);
    return delay({
      ...report,
      employees: emp ? { full_name: emp.full_name, department_id: emp.department_id } : null,
      completed_tasks: mockMonthlyReportCompleted.filter(t => t.report_id === reportId),
      pending_tasks: mockMonthlyReportPending.filter(t => t.report_id === reportId),
    });
  },
  async listMonthlyReportsForReport({ periodMonth } = {}) {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    let rows = mockMonthlyReports.slice();
    if (!['super_admin', 'hrd', 'pimpinan'].includes(profile.role)) {
      if (profile.role === 'kepala_bagian') {
        rows = rows.filter(r => {
          const emp = mockEmployees.find(e => e.id === r.employee_id);
          return emp && emp.department_id === profile.department_id;
        });
      } else {
        rows = rows.filter(r => r.employee_id === profile.employee_id);
      }
    }
    if (periodMonth) rows = rows.filter(r => r.period_month === periodMonth);
    rows = rows
      .map(r => ({
        ...r,
        employees: (() => { const e = mockEmployees.find(e => e.id === r.employee_id); return e ? { full_name: e.full_name, department_id: e.department_id } : null; })(),
        completed_tasks: mockMonthlyReportCompleted.filter(t => t.report_id === r.id),
        pending_tasks: mockMonthlyReportPending.filter(t => t.report_id === r.id),
      }))
      .sort((a, b) => (a.period_month < b.period_month ? 1 : -1));
    return delay(rows);
  },
  async saveMonthlyReportTasks(reportId, { completedTasks, pendingTasks }) {
    mockMonthlyReportCompleted = mockMonthlyReportCompleted.filter(t => t.report_id !== reportId);
    (completedTasks || []).forEach((t, i) => mockMonthlyReportCompleted.push({
      id: 'mwrc-' + (mockMonthlyReportSeq++), report_id: reportId, sort_order: i, task_name: t.taskName,
      result_impact: t.resultImpact || null, output_proof: t.outputProof || null, timeliness: t.timeliness || null,
    }));
    mockMonthlyReportPending = mockMonthlyReportPending.filter(t => t.report_id !== reportId);
    (pendingTasks || []).forEach((t, i) => mockMonthlyReportPending.push({
      id: 'mwrp-' + (mockMonthlyReportSeq++), report_id: reportId, sort_order: i, task_name: t.taskName,
      progress: t.progress === '' || t.progress == null ? null : Number(t.progress),
      obstacle: t.obstacle || null, follow_up_plan: t.followUpPlan || null, new_deadline: t.newDeadline || null,
    }));
    return delay({ ok: true });
  },
  async submitMonthlyReport(reportId) {
    const report = mockMonthlyReports.find(r => r.id === reportId);
    if (!report) return delay({ ok: false, error: 'Laporan tidak ditemukan' });
    report.status = 'submitted'; report.submitted_at = new Date().toISOString(); report.auto_submitted = false;
    return delay({ ok: true });
  },
  // Simpan/hapus SATU kartu (schema_96) -- padanan mock dari RPC
  // upsert_my_mwr_completed_task/upsert_my_mwr_pending_task.
  async saveMwrCompletedTask(reportId, task) {
    let row = task.id ? mockMonthlyReportCompleted.find(t => t.id === task.id) : null;
    if (!row) {
      row = { id: 'mwrc-' + (mockMonthlyReportSeq++), report_id: reportId, sort_order: mockMonthlyReportCompleted.filter(t => t.report_id === reportId).length, created_at: new Date().toISOString() };
      mockMonthlyReportCompleted.push(row);
    }
    row.task_name = task.taskName; row.result_impact = task.resultImpact || null;
    row.timeliness = task.timeliness || null; row.task_size = task.taskSize || null;
    if (task.outputProofPath) { row.output_proof_path = task.outputProofPath; row.output_proof_filename = task.outputProofFilename || null; }
    return delay({ ok: true, row });
  },
  async deleteMwrCompletedTask(id) {
    mockMonthlyReportCompleted = mockMonthlyReportCompleted.filter(t => t.id !== id);
    return delay({ ok: true });
  },
  async saveMwrSupervisorRating(reportId, rating, notes) {
    const report = mockMonthlyReports.find(r => r.id === reportId);
    if (!report) return delay({ ok: false, error: 'Laporan tidak ditemukan' });
    if (report.status !== 'submitted') return delay({ ok: false, error: 'Penilaian atasan hanya bisa diisi setelah laporan terkirim' });
    report.supervisor_rating = rating; report.supervisor_rating_notes = notes || null;
    report.supervisor_rated_at = new Date().toISOString();
    return delay({ ok: true, row: report });
  },
  async saveMwrPendingTask(reportId, task) {
    let row = task.id ? mockMonthlyReportPending.find(t => t.id === task.id) : null;
    if (!row) {
      row = { id: 'mwrp-' + (mockMonthlyReportSeq++), report_id: reportId, sort_order: mockMonthlyReportPending.filter(t => t.report_id === reportId).length, created_at: new Date().toISOString() };
      mockMonthlyReportPending.push(row);
    }
    row.task_name = task.taskName;
    row.progress = task.progress === '' || task.progress == null ? null : Number(task.progress);
    row.obstacle = task.obstacle || null; row.follow_up_plan = task.followUpPlan || null;
    row.new_deadline = task.newDeadline || null;
    return delay({ ok: true, row });
  },
  async deleteMwrPendingTask(id) {
    mockMonthlyReportPending = mockMonthlyReportPending.filter(t => t.id !== id);
    return delay({ ok: true });
  },
  async uploadMwrEvidence(employeeId, reportId, file) {
    if (!file) return { ok: false, error: 'Pilih file terlebih dahulu' };
    return delay({ ok: true, path: `mock/${employeeId}/${reportId}/${file.name}`, filename: file.name });
  },
  async getMwrEvidenceSignedUrl(filePath) {
    return delay('#mock-file:' + filePath);
  },

  async listEducation(employeeId) {
    if (!this._canSeeProfessionalRecords(employeeId)) return delay([]);
    return delay(mockEducation.filter(e => e.employee_id === employeeId).sort((a, b) => (b.graduation_year || 0) - (a.graduation_year || 0)));
  },
  async createEducation({ employeeId, level, institution, major, year, gpa, certNumber }) {
    if (!this._canWriteProfessionalRecords(employeeId)) return delay({ ok: false, error: 'Anda tidak memiliki izin menambah data pendidikan ini' });
    mockEducation.unshift({ id: uid('edu'), employee_id: employeeId, level, institution_name: institution, major: major || null, graduation_year: year || null, gpa: gpa || null, certificate_number: certNumber || null, created_at: new Date().toISOString() });
    return delay({ ok: true });
  },
  async deleteEducation(id) {
    const row = mockEducation.find(e => e.id === id);
    if (!row || !this._canWriteProfessionalRecords(row.employee_id)) return delay({ ok: false, error: 'Anda tidak memiliki izin menghapus data ini' });
    mockEducation = mockEducation.filter(e => e.id !== id);
    return delay({ ok: true });
  },

  async listCertifications(employeeId) {
    if (!this._canSeeProfessionalRecords(employeeId)) return delay([]);
    return delay(mockCertifications.filter(c => c.employee_id === employeeId)
      .map(c => ({ ...c, employee_documents: c.document_id ? mockDocuments.find(d => d.id === c.document_id) : null }))
      .sort((a, b) => (a.issued_date < b.issued_date ? 1 : -1)));
  },
  async createCertification({ employeeId, name, issuer, number, issuedDate, expiryDate, file }) {
    if (!this._canWriteProfessionalRecords(employeeId)) return delay({ ok: false, error: 'Anda tidak memiliki izin menambah sertifikasi ini' });
    let documentId = null;
    if (file) {
      // Reuse uploadDocument (employee_documents) yang sudah ada — bukan
      // jalur upload terpisah — supaya file sertifikat ini juga muncul di
      // tab Dokumen seperti dokumen lain, konsisten satu sumber kebenaran.
      const uploadResult = await this.uploadDocument({ employeeId, documentType: 'sertifikat', file });
      if (!uploadResult.ok) return delay({ ok: false, error: `Gagal mengunggah sertifikat: ${uploadResult.error}` });
      documentId = uploadResult.document.id;
    }
    mockCertifications.unshift({ id: uid('cert'), employee_id: employeeId, certification_name: name, issuing_organization: issuer || null, certificate_number: number || null, issued_date: issuedDate || null, expiry_date: expiryDate || null, document_id: documentId, created_at: new Date().toISOString() });
    return delay({ ok: true });
  },
  async deleteCertification(id) {
    const row = mockCertifications.find(c => c.id === id);
    if (!row || !this._canWriteProfessionalRecords(row.employee_id)) return delay({ ok: false, error: 'Anda tidak memiliki izin menghapus sertifikasi ini' });
    mockCertifications = mockCertifications.filter(c => c.id !== id);
    return delay({ ok: true });
  },

  async listCompetencies(employeeId) {
    if (!this._canSeeProfessionalRecords(employeeId)) return delay([]);
    return delay(mockCompetencies.filter(c => c.employee_id === employeeId)
      .map(c => ({ ...c, employee_documents: c.document_id ? mockDocuments.find(d => d.id === c.document_id) : null })));
  },
  async createCompetency({ employeeId, type, name, level, date, file }) {
    if (!this._canWriteProfessionalRecords(employeeId)) return delay({ ok: false, error: 'Anda tidak memiliki izin menambah data ini' });
    let documentId = null;
    if (file) {
      const uploadResult = await this.uploadDocument({ employeeId, documentType: 'sertifikat', file });
      if (!uploadResult.ok) return delay({ ok: false, error: `Gagal mengunggah dokumen: ${uploadResult.error}` });
      documentId = uploadResult.document.id;
    }
    mockCompetencies.unshift({ id: uid('comp'), employee_id: employeeId, competency_type: type, name, level: level || null, certified_at: date || null, document_id: documentId, created_at: new Date().toISOString() });
    return delay({ ok: true });
  },
  async deleteCompetency(id) {
    const row = mockCompetencies.find(c => c.id === id);
    if (!row || !this._canWriteProfessionalRecords(row.employee_id)) return delay({ ok: false, error: 'Anda tidak memiliki izin menghapus data ini' });
    mockCompetencies = mockCompetencies.filter(c => c.id !== id);
    return delay({ ok: true });
  },

  // Meniru RLS employees_update + trigger guard (schema.sql): privileged
  // ATAU pemilik sendiri boleh ubah photo_url (bukan field terproteksi).
  async uploadEmployeePhoto(employeeId, file) {
    const emp = mockEmployees.find(e => e.id === employeeId);
    if (!emp) return delay({ ok: false, error: 'Pegawai tidak ditemukan' });
    const profile = currentMockProfile();
    const isPrivileged = profile && (['super_admin', 'hrd'].includes(profile.role) || (profile.role === 'kepala_bagian' && profile.department_id === emp.department_id));
    const isSelf = profile && profile.employee_id === employeeId;
    if (!isPrivileged && !isSelf) return delay({ ok: false, error: 'Anda tidak memiliki izin mengubah foto pegawai ini' });
    if (!file) return delay({ ok: false, error: 'Pilih file terlebih dahulu' });
    if (file.size > 5 * 1024 * 1024) return delay({ ok: false, error: 'Ukuran file maksimal 5MB' });
    emp.photo_url = URL.createObjectURL(file); // mode demo: Object URL sementara, sama seperti uploadDocument
    return delay({ ok: true, path: emp.photo_url });
  },

  async getEmployeePhotoSignedUrl(filePath) {
    return delay(filePath); // mode demo: sudah Object URL siap pakai, sama seperti getDocumentSignedUrl
  },

  // Meniru function get_department_head_name (schema_10) — SECURITY
  // DEFINER di Postgres asli, di mock cukup cari langsung tanpa perlu
  // guard RLS tambahan karena mock ini memang bukan pengganti RLS
  // (lihat catatan keamanan di header file).
  async getDepartmentHeadName(departmentId) {
    const head = mockProfiles.find(p => p.role === 'kepala_bagian' && p.department_id === departmentId);
    if (!head) return delay(null);
    const emp = mockEmployees.find(e => e.id === head.employee_id);
    return delay(emp ? emp.full_name : null);
  },

  // Meniru function get_position_holder_names (schema_88, audit
  // 2026-08-24) — SECURITY DEFINER di Postgres asli. SENGAJA TIDAK
  // lewat scopeEmployeesForCurrentUser (yang membatasi pegawai/guru
  // cuma ke baris sendiri) karena RPC aslinya juga sengaja bypass RLS
  // employees_select row-level untuk kasus sempit ini (cuma expose
  // full_name, bukan baris penuh) — mock ini meniru perilaku itu, bukan
  // menegakkan RLS-nya sendiri (sama seperti getDepartmentHeadName di
  // atas).
  async getPositionHolderNames(positionId, excludeEmployeeId) {
    if (!positionId) return delay([]);
    const holders = mockEmployees.filter(e => e.position_id === positionId && e.id !== excludeEmployeeId);
    return delay(holders.map(e => e.full_name));
  },

  // Meniru RPC get_employee_name (schema_107) — lihat komentar di
  // supabaseDataService.js untuk alasan RPC sempit ini dibuat.
  async getEmployeeName(employeeId) {
    if (!employeeId) return delay(null);
    const emp = mockEmployees.find(e => e.id === employeeId);
    return delay(emp ? emp.full_name : null);
  },

  // Meniru function get_team_contacts (schema_89) — SECURITY DEFINER
  // sempit yang HANYA mengembalikan {id, full_name, phone} rekan
  // se-unit (department_id sama), employment_status='active', maks 3
  // baris urut nama, dikecualikan diri sendiri. SENGAJA TIDAK lewat
  // scopeEmployeesForCurrentUser (yang membatasi pegawai/guru cuma ke
  // baris sendiri) karena RPC aslinya juga sengaja bypass RLS
  // employees_select row-level untuk kasus sempit ini — mock ini
  // meniru PERILAKU DATA-nya saja, bukan cek otorisasi RPC (yang
  // di server ditegakkan di dalam function lewat is_owner/role admin);
  // untuk mock, kartu pemanggil (app.js) sudah hanya memanggil ini
  // untuk employeeId aktif yang sedang dilihat, konsisten dengan pola
  // getPositionHolderNames di atas.
  async getTeamContacts(employeeId) {
    if (!employeeId) return delay([]);
    const emp = mockEmployees.find(e => e.id === employeeId);
    if (!emp || !emp.department_id) return delay([]);
    const teammates = mockEmployees
      .filter(e => e.department_id === emp.department_id && e.id !== employeeId && e.employment_status === 'active')
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .slice(0, 3)
      .map(e => ({ id: e.id, full_name: e.full_name, phone: e.contact_info?.phone || null }));
    return delay(teammates);
  },

  // Meniru RPC search_employee_contacts (schema_103) — direktori
  // kontak LINTAS DEPARTEMEN, sengaja dibuat TERPISAH dari
  // getTeamContacts di atas (skenario produk berbeda: itu 3 rekan
  // SATU departemen tanpa perlu mengetik apa pun, ini SIAPA SAJA
  // pegawai aktif tapi WAJIB mengetik minimal 2 karakter -- lihat
  // komentar lengkap alasan keputusan produk di kepala file migrasi
  // schema_103). Kolom dikembalikan SENGAJA sempit (nama/departemen/
  // jabatan/telepon saja), meniru persis kolom yang dikembalikan RPC
  // aslinya — BUKAN baris employees penuh, supaya perilaku mock tidak
  // menyesatkan (mockDataService yang tidak meniru RLS/scoping RPC
  // dengan akurat sudah pernah jadi sumber bug produksi tak terdeteksi
  // sebelumnya, lihat catatan cakupan di kepala tests/mockDataService.test.js).
  async searchEmployeeContacts(query) {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    const q = (query || '').trim();
    if (q.length < 2) return delay([]);
    const qLower = q.toLowerCase();
    const results = mockEmployees
      .filter(e => e.employment_status === 'active'
        && e.id !== profile.employee_id
        && e.full_name.toLowerCase().includes(qLower))
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .slice(0, 20)
      .map(e => ({
        id: e.id, full_name: e.full_name,
        department_name: mockDepartments.find(d => d.id === e.department_id)?.name || null,
        position: e.position || null,
        phone: e.contact_info?.phone || null,
      }));
    return delay(results);
  },

  // Cek TANPA efek samping (tidak menyentuh mockDocNumberCounters) --
  // dipakai generateDocumentFromTemplate utk gagal cepat SEBELUM
  // mail-merge yang berat, sama seperti pre-check di edge function.
  // TIDAK boleh dipakai untuk benar-benar menghasilkan nomor -- kalau
  // ini yang menaikkan counter lalu mail-merge gagal setelahnya, nomor
  // itu "hilang" (gap di urutan) padahal dokumennya tidak pernah jadi.
  _validateDocumentNumberInputs(documentType, issuingUnitId) {
    const letterType = mockDocumentLetterTypes.find(d => d.type_key === documentType && d.is_active);
    if (!letterType) return { ok: false, error: `Jenis surat "${documentType}": tidak ditemukan atau sudah dinonaktifkan` };
    if (letterType.numbering_format === 'unit_type') {
      if (!issuingUnitId) return { ok: false, error: `Jenis surat "${documentType}": format penomoran ini wajib menyertakan Unit Pengeluar Surat` };
      const unit = mockDocumentIssuingUnits.find(u => u.id === issuingUnitId && u.is_active);
      if (!unit) return { ok: false, error: 'Unit pengeluar surat tidak ditemukan atau sudah dinonaktifkan' };
    }
    return { ok: true };
  },

  // Meniru trigger generate_document_number() versi schema_85: 2 mode
  // format berdasarkan numbering_format jenis surat -- 'type_only'
  // (format lama, urut/KODE_JENIS/bulan-romawi/tahun, TIDAK butuh
  // issuingUnitId, counter per document_type+tahun) dipakai surat_cuti/
  // slip_gaji; 'unit_type' (urut/KODE_UNIT-KODE_JENIS/bulan-romawi/
  // tahun, WAJIB issuingUnitId, counter PER UNIT+tahun -- BUKAN per
  // jenis surat, keputusan produk: 1 unit berbagi 1 counter urut utk
  // SEMUA jenis surat yang dikeluarkannya) dipakai jenis surat lain.
  // Dipakai BERSAMA oleh createGeneratedDocument (Surat Cuti/Slip
  // Gaji, selalu type_only) DAN generateDocumentFromTemplate (jenis
  // surat lain) -- sebelumnya yang kedua TIDAK PERNAH mengisi
  // document_number sama sekali di mock (bug paritas mock/produksi:
  // trigger Postgres asli tetap jalan utk SEMUA insert di server,
  // cuma replikanya di mock yang bolong), diperbaiki di sini.
  _buildDocumentNumber(documentType, issuingUnitId) {
    const letterType = mockDocumentLetterTypes.find(d => d.type_key === documentType && d.is_active);
    if (!letterType) return { ok: false, error: `Jenis surat "${documentType}": tidak ditemukan atau sudah dinonaktifkan` };

    const year = new Date().getFullYear();
    const months = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const roman = months[new Date().getMonth()];

    if (letterType.numbering_format === 'unit_type') {
      if (!issuingUnitId) return { ok: false, error: `Jenis surat "${documentType}": format penomoran ini wajib menyertakan Unit Pengeluar Surat` };
      const unit = mockDocumentIssuingUnits.find(u => u.id === issuingUnitId && u.is_active);
      if (!unit) return { ok: false, error: 'Unit pengeluar surat tidak ditemukan atau sudah dinonaktifkan' };
      // Counter PER UNIT (bukan per jenis surat) -- key sengaja TIDAK
      // menyertakan documentType.
      const key = `unit-${issuingUnitId}-${year}`;
      mockDocNumberCounters[key] = (mockDocNumberCounters[key] || 0) + 1;
      const seq = mockDocNumberCounters[key];
      return { ok: true, documentNumber: `${String(seq).padStart(3, '0')}/${unit.code}-${letterType.type_code}/${roman}/${year}` };
    }

    // Entitas "umum" (Surat Cuti/Slip Gaji) -- counter per document_type
    // seperti sebelumnya, tidak berubah.
    const key = `${documentType}-${year}`;
    mockDocNumberCounters[key] = (mockDocNumberCounters[key] || 0) + 1;
    const seq = mockDocNumberCounters[key];
    return { ok: true, documentNumber: `${String(seq).padStart(3, '0')}/${letterType.type_code}/${roman}/${year}` };
  },

  async createGeneratedDocument({ employeeId, documentType, referenceTable, referenceId, file, issuingUnitId }) {
    const profile = currentMockProfile();
    const allowed = profile && (['super_admin', 'hrd'].includes(profile.role) || profile.employee_id === employeeId);
    if (!allowed) return delay({ ok: false, error: 'Anda tidak memiliki izin membuat dokumen ini' });

    // issuingUnitId OPSIONAL di parameter -- trigger generate_document_number
    // asli (schema_85) berlaku utk SEMUA insert generated_documents apa
    // pun jalur client-nya, bukan cuma generateDocumentFromTemplate,
    // jadi fungsi ini juga harus meneruskannya. Di produksi, 2 pemanggil
    // nyata (cetak Surat Cuti/Slip Gaji) tidak pernah mengirimnya --
    // aman karena keduanya numbering_format='type_only' (tidak butuh).
    const numberResult = this._buildDocumentNumber(documentType, issuingUnitId || null);
    if (!numberResult.ok) return delay({ ok: false, error: numberResult.error });

    const doc = {
      id: uid('gdoc'), document_number: numberResult.documentNumber, document_type: documentType,
      employee_id: employeeId, reference_table: referenceTable, reference_id: referenceId,
      issuing_unit_id: issuingUnitId || null,
      file_url: file ? URL.createObjectURL(file) : null,
      generated_by_profile_id: profile.id, generated_at: new Date().toISOString(),
    };
    mockGeneratedDocuments.unshift(doc);
    return delay({ ok: true, document: doc });
  },

  async listGeneratedDocuments(employeeId, documentType) {
    if (!this._canSeeProfessionalRecords(employeeId)) return delay([]);
    let rows = mockGeneratedDocuments.filter(d => d.employee_id === employeeId);
    if (documentType) rows = rows.filter(d => d.document_type === documentType);
    return delay(rows.sort((a, b) => (a.generated_at < b.generated_at ? 1 : -1)));
  },

  // Untuk menu "Manajemen Dokumen" (DMS) — meniru RLS
  // generated_documents_select (schema_36), BUKAN _canSeeProfessionalRecords
  // (yang meniru RLS LAMA sebelum schema_36, dipakai fitur lain seperti
  // Pendidikan/Sertifikasi yang cakupannya SENGAJA tidak ikut diperluas
  // ke Pimpinan/Bendahara). Fungsi scoping terpisah supaya perluasan
  // akses di sini tidak diam-diam bocor ke fitur lain yang memakai
  // helper yang sama.
  async listAllGeneratedDocuments({ documentType, startDate, endDate } = {}) {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    let rows;
    if (['super_admin', 'hrd', 'pimpinan', 'bendahara_umum'].includes(profile.role)) {
      rows = mockGeneratedDocuments.slice();
    } else if (profile.role === 'kepala_bagian') {
      rows = mockGeneratedDocuments.filter(d => {
        const emp = mockEmployees.find(e => e.id === d.employee_id);
        return emp && emp.department_id === profile.department_id;
      });
    } else {
      rows = mockGeneratedDocuments.filter(d => d.employee_id === profile.employee_id);
    }
    if (documentType) rows = rows.filter(d => d.document_type === documentType);
    if (startDate) rows = rows.filter(d => d.generated_at >= startDate);
    if (endDate) rows = rows.filter(d => d.generated_at <= endDate);
    rows = rows
      .map(d => ({ ...d, employees: mockEmployees.find(e => e.id === d.employee_id) }))
      .sort((a, b) => (a.generated_at < b.generated_at ? 1 : -1));
    return delay(rows);
  },

  async getGeneratedDocumentSignedUrl(filePath) {
    return delay(filePath);
  },

  // Meniru RLS schema_11: super_admin/hrd/pimpinan/bendahara_umum SEMUA
  // boleh LIHAT (plus pemilik sendiri), tapi HANYA super_admin/pimpinan/
  // bendahara_umum yang boleh UBAH — HRD sengaja tidak diikutkan di sini.
  _canViewPayroll(employeeId) {
    const profile = currentMockProfile();
    if (!profile) return false;
    if (['super_admin', 'hrd', 'pimpinan', 'bendahara_umum'].includes(profile.role)) return true;
    return profile.employee_id === employeeId;
  },
  _canWritePayroll() {
    const profile = currentMockProfile();
    return profile && ['super_admin', 'pimpinan', 'bendahara_umum'].includes(profile.role);
  },

  async getPayrollInfo(employeeId) {
    if (!this._canViewPayroll(employeeId)) return delay(null);
    return delay(mockPayrollInfo.find(p => p.employee_id === employeeId) || null);
  },
  // 12 kolom baru (schema_43) — komponen penggajian khas pesantren.
  // total_net_monthly dihitung di sini meniru generated column Postgres
  // (mockComputeTotalNetMonthly) — HARUS tetap sinkron dengan rumus SQL
  // di schema_43 kalau salah satu berubah di masa depan.
  async upsertPayrollInfo({
    employeeId, bankName, bankAccountNumber, bankAccountHolder, npwp, bpjsKetenagakerjaan, bpjsKesehatan,
    baseSalary, fixedAllowance, fixedBonus, fixedDeduction, notes,
    allowanceDualMandate, riskConflictCare, riskFinancial, riskPhysicalTechnical, allowanceMuqim,
    skillQuran, skillForeignLanguage, skillTechnicalMedicalIt,
    allowanceSpouse, allowanceChildren, dependentChildrenCount, socialFundDeduction,
  }) {
    if (!this._canWritePayroll()) return delay({ ok: false, error: 'Anda tidak memiliki izin mengubah data gaji — hanya Pimpinan/Bendahara Umum/Super Admin' });
    let row = mockPayrollInfo.find(p => p.employee_id === employeeId);
    const patch = {
      bank_name: bankName || null, bank_account_number: bankAccountNumber || null, bank_account_holder: bankAccountHolder || null,
      npwp: npwp || null, bpjs_ketenagakerjaan: bpjsKetenagakerjaan || null, bpjs_kesehatan: bpjsKesehatan || null,
      base_salary: baseSalary || null, fixed_allowance: fixedAllowance || 0, fixed_bonus: fixedBonus || 0, fixed_deduction: fixedDeduction || 0,
      notes: notes || null,
      allowance_dual_mandate: allowanceDualMandate || 0,
      risk_conflict_care: riskConflictCare || 0, risk_financial: riskFinancial || 0,
      risk_physical_technical: riskPhysicalTechnical || 0, allowance_muqim: allowanceMuqim || 0,
      skill_quran: skillQuran || 0, skill_foreign_language: skillForeignLanguage || 0,
      skill_technical_medical_it: skillTechnicalMedicalIt || 0,
      allowance_spouse: allowanceSpouse || 0, allowance_children: allowanceChildren || 0,
      dependent_children_count: dependentChildrenCount || 0, social_fund_deduction: socialFundDeduction || 0,
    };
    patch.total_net_monthly = mockComputeTotalNetMonthly(patch);
    if (row) Object.assign(row, patch);
    else mockPayrollInfo.push({ id: uid('pr'), employee_id: employeeId, ...patch });
    return delay({ ok: true });
  },

  // Meniru RLS position_compensation_reference (schema_82) -- PERSIS
  // sama role set dgn employee_payroll (schema_11): SELECT 4 role
  // (super_admin/hrd/pimpinan/bendahara_umum), WRITE 3 role (tanpa
  // hrd). kepala_bagian sengaja tidak diikutkan, konsisten dgn
  // employee_salary_history yang juga mengecualikan kepala_bagian.
  async listPositionCompensationReferences() {
    if (!this._canViewPayroll(null)) return delay([]);
    return delay([...mockPositionCompensationReference]);
  },

  async upsertPositionCompensationReference({ id, namaAmanah, gajiDasar, riskConflictCare, riskFinancial, riskPhysicalTechnical, isActive, notes }) {
    if (!this._canWritePayroll()) return delay({ ok: false, error: 'Anda tidak memiliki izin mengubah rujukan kompensasi amanah — hanya Pimpinan/Bendahara Umum/Super Admin' });
    if (!namaAmanah || !namaAmanah.trim()) return delay({ ok: false, error: 'Nama amanah wajib diisi' });
    const dupe = mockPositionCompensationReference.find(r => r.id !== id && r.nama_amanah.toLowerCase() === namaAmanah.trim().toLowerCase());
    if (dupe) return delay({ ok: false, error: `Amanah "${namaAmanah}" sudah punya rujukan` });

    const patch = {
      nama_amanah: namaAmanah.trim(),
      gaji_dasar: gajiDasar || 0,
      risk_conflict_care: riskConflictCare || 0,
      risk_financial: riskFinancial || 0,
      risk_physical_technical: riskPhysicalTechnical || 0,
      is_active: isActive !== false,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    };

    let row = mockPositionCompensationReference.find(r => r.id === id);
    if (!row) {
      row = { id: uid('pcr'), created_at: new Date().toISOString(), ...patch };
      mockPositionCompensationReference.push(row);
      return delay({ ok: true });
    }

    // Meniru trg_cascade_amanah_compensation_update (schema_82): kalau
    // nominal berubah (bukan cuma notes) dan rujukan masih aktif,
    // SEMUA pegawai AKTIF yang tertaut amanah ini ikut disinkron ulang
    // -- dikonfirmasi eksplisit oleh user, BUKAN hanya penempatan baru.
    const nominalChanged = row.gaji_dasar !== patch.gaji_dasar
      || row.risk_conflict_care !== patch.risk_conflict_care
      || row.risk_financial !== patch.risk_financial
      || row.risk_physical_technical !== patch.risk_physical_technical
      || row.is_active !== patch.is_active;
    Object.assign(row, patch);
    if (nominalChanged && patch.is_active) {
      mockEmployees
        .filter(e => e.amanah_id === row.id && e.employment_status === 'active')
        .forEach(e => mockApplyAmanahCompensation(e.id, row.id));
    }
    return delay({ ok: true });
  },

  // Meniru RPC link_employee_amanah (schema_84) -- SATU-SATUNYA jalur
  // resmi yang dipakai UI untuk mengubah employees.amanah_id (lihat
  // app.js saveEmployeeAmanahLink()). Sengaja TERPISAH dari
  // createEmployee/updateEmployee di atas (yang masih meniru celah
  // RLS produksi employees_update TANPA is_bendahara() -- lihat catatan
  // schema_84) -- fungsi ini mewakili PERILAKU SETELAH migrasi schema_84
  // dijalankan tim Supabase, BUKAN perilaku saat ini. Reuse
  // _canWritePayroll() karena role setnya PERSIS sama
  // (super_admin/pimpinan/bendahara_umum) dengan guard RPC yang
  // sebenarnya.
  async linkEmployeeAmanah(employeeId, amanahId) {
    if (!this._canWritePayroll()) return delay({ ok: false, error: 'Hanya Super Admin, Pimpinan, atau Bendahara Umum yang dapat menautkan/mengubah amanah pegawai (menentukan gaji dasar)' });
    const emp = mockEmployees.find(e => e.id === employeeId);
    if (!emp) return delay({ ok: false, error: 'Pegawai tidak ditemukan' });
    if (amanahId && !mockPositionCompensationReference.some(r => r.id === amanahId)) {
      return delay({ ok: false, error: 'Rujukan amanah tidak ditemukan' });
    }
    emp.amanah_id = amanahId || null;
    // Meniru trg_sync_employee_position_text_from_amanah +
    // trg_sync_payroll_on_amanah_change (schema_82) -- sama seperti di
    // updateEmployee(), fungsi bersama mockApplyAmanahCompensation()
    // dipakai supaya satu sumber kebenaran.
    if (emp.amanah_id) {
      const ref = mockPositionCompensationReference.find(r => r.id === emp.amanah_id && r.is_active);
      if (ref) emp.position = ref.nama_amanah;
      mockApplyAmanahCompensation(emp.id, emp.amanah_id);
    }
    pushAuditLog('update', emp);
    return delay({ ok: true });
  },

  async listPayrollPeriods() {
    if (!this._canViewPayroll(null)) return delay([]);
    return delay([...mockPayrollPeriods].sort((a, b) => (a.period_year !== b.period_year ? b.period_year - a.period_year : b.period_month - a.period_month)));
  },
  // Ringkasan keuangan untuk Dashboard Bendahara — HANYA dihitung dari
  // data yang sudah lolos RLS payroll (payroll_periods_select +
  // employee_payslips_select: super_admin/hrd/bendahara/pimpinan).
  // Tidak reuse listPayrollPeriods()/getPayslip() satu-satu (N+1 query)
  // — agregasi langsung di sini, konsisten dengan pola getAttendanceTrend.
  async getFinanceSummary(year) {
    if (!this._canViewPayroll(null)) return delay({ authorized: false });
    const periodsThisYear = mockPayrollPeriods.filter(p => p.period_year === year);
    const periodIds = new Set(periodsThisYear.map(p => p.id));
    const slipsThisYear = mockPayslips.filter(p => periodIds.has(p.payroll_period_id));

    const totalPaidYtd = slipsThisYear.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.net_pay || 0), 0);
    const totalFinalizedUnpaid = slipsThisYear.filter(p => p.status === 'finalized').reduce((s, p) => s + Number(p.net_pay || 0), 0);

    const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, paid: 0 }));
    slipsThisYear.filter(p => p.status === 'paid').forEach(p => {
      const period = mockPayrollPeriods.find(pp => pp.id === p.payroll_period_id);
      if (period) monthly[period.period_month - 1].paid += Number(p.net_pay || 0);
    });

    const periodStatusCounts = { open: 0, processing: 0, finalized: 0, paid: 0 };
    periodsThisYear.forEach(p => { if (periodStatusCounts[p.status] !== undefined) periodStatusCounts[p.status]++; });

    // Estimasi komitmen gaji bulanan — dari struktur gaji MASTER
    // (employee_payroll, lihat schema_24) untuk pegawai berstatus aktif
    // saja. Ini proyeksi/anggaran, BUKAN angka realisasi — dibedakan
    // jelas di UI dari totalPaidYtd yang memang sudah dibayar.
    const activeIds = new Set(mockEmployees.filter(e => e.employment_status === 'active').map(e => e.id));
    let estimatedMonthlyPayroll = 0;
    mockPayrollInfo.forEach(info => {
      if (activeIds.has(info.employee_id)) {
        estimatedMonthlyPayroll += Number(info.total_net_monthly ?? mockComputeTotalNetMonthly(info));
      }
    });

    return delay({
      authorized: true, year, totalPaidYtd, totalFinalizedUnpaid, monthly, periodStatusCounts,
      estimatedMonthlyPayroll, employeeCountActive: activeIds.size,
    });
  },
  // Analisis Biaya SDM (schema_40, diperbarui schema_44 & schema_75) —
  // mock: agregasi langsung dari array mock, SENGAJA mengikuti bentuk
  // data yang sama dengan 4 view SQL supaya app.js bisa konsumsi hasil
  // mock/Supabase lewat kode render yang identik (pola dataService yang
  // sudah dipakai di seluruh app ini). Kolom biaya (total_base_salary/
  // total_estimated_monthly_cost) HANYA dari pegawai employment_status=
  // 'active' -- selaras dengan estimatedMonthlyPayroll di
  // getFinanceSummary() (schema_75) supaya kartu Dashboard dan Analisis
  // Biaya SDM/Ringkasan Eksekutif tidak lagi menampilkan total berbeda.
  // Otorisasi eksplisit sama seperti getFinanceSummary — bukan cuma
  // andalkan filter tampilan.
  async getHrCostAnalysis() {
    if (!this._canViewPayroll(null)) return delay({ authorized: false });

    const payrollByEmp = new Map(mockPayrollInfo.map(p => [p.employee_id, p]));
    const estCost = (p) => p ? Number(p.total_net_monthly ?? mockComputeTotalNetMonthly(p)) : 0;

    // --- v_hr_cost_by_department ---
    const byDepartment = mockDepartments.map(d => {
      const emps = mockEmployees.filter(e => e.department_id === d.id);
      const withPayroll = emps.filter(e => payrollByEmp.has(e.id));
      // Biaya (total_base_salary/total_estimated_monthly_cost) HANYA
      // dari pegawai employment_status='active' -- selaras dengan
      // estimatedMonthlyPayroll di getFinanceSummary() (schema_75).
      // headcount/headcount_active/headcount_with_payroll_data tetap
      // menghitung SEMUA pegawai apa adanya untuk audit kelengkapan data.
      const withPayrollActive = withPayroll.filter(e => e.employment_status === 'active');
      return {
        department_id: d.id,
        department_code: d.code,
        department_name: d.name,
        headcount: emps.length,
        headcount_active: emps.filter(e => e.employment_status === 'active').length,
        headcount_with_payroll_data: withPayroll.length,
        total_base_salary: withPayrollActive.reduce((s, e) => s + Number(payrollByEmp.get(e.id).base_salary || 0), 0),
        total_estimated_monthly_cost: withPayrollActive.reduce((s, e) => s + estCost(payrollByEmp.get(e.id)), 0),
        avg_base_salary_per_employee_with_data: withPayrollActive.length
          ? Math.round(withPayrollActive.reduce((s, e) => s + Number(payrollByEmp.get(e.id).base_salary || 0), 0) / withPayrollActive.length)
          : null,
      };
    }).sort((a, b) => a.department_name.localeCompare(b.department_name));

    // --- v_hr_cost_by_contract_type ---
    const contractGroups = {};
    mockEmployees.forEach(e => {
      const key = e.contract_type || '(belum diisi)';
      if (!contractGroups[key]) contractGroups[key] = [];
      contractGroups[key].push(e);
    });
    const byContractType = Object.keys(contractGroups).map(key => {
      const emps = contractGroups[key];
      const withPayroll = emps.filter(e => payrollByEmp.has(e.id));
      const withPayrollActive = withPayroll.filter(e => e.employment_status === 'active');
      return {
        contract_type: key,
        headcount: emps.length,
        headcount_with_payroll_data: withPayroll.length,
        total_base_salary: withPayrollActive.reduce((s, e) => s + Number(payrollByEmp.get(e.id).base_salary || 0), 0),
        total_estimated_monthly_cost: withPayrollActive.reduce((s, e) => s + estCost(payrollByEmp.get(e.id)), 0),
      };
    }).sort((a, b) => b.total_estimated_monthly_cost - a.total_estimated_monthly_cost);

    // --- v_hr_cost_trend_by_period ---
    const trendByPeriod = mockPayrollPeriods.map(pp => {
      const slips = mockPayslips.filter(s => s.payroll_period_id === pp.id);
      return {
        payroll_period_id: pp.id,
        period_year: pp.period_year,
        period_month: pp.period_month,
        period_status: pp.status,
        payslip_count: slips.length,
        total_base_salary: slips.reduce((s, x) => s + Number(x.base_salary || 0), 0),
        total_allowance: slips.reduce((s, x) => s + Number(x.total_allowance || 0), 0),
        total_deduction: slips.reduce((s, x) => s + Number(x.total_deduction || 0), 0),
        total_pph21: slips.reduce((s, x) => s + Number(x.pph21 || 0), 0),
        total_bpjs_deduction: slips.reduce((s, x) => s + Number(x.bpjs_deduction || 0), 0),
        total_net_pay: slips.reduce((s, x) => s + Number(x.net_pay || 0), 0),
      };
    }).sort((a, b) => (a.period_year !== b.period_year ? b.period_year - a.period_year : b.period_month - a.period_month));

    return delay({ authorized: true, byDepartment, byContractType, trendByPeriod });
  },
  async createPayrollPeriod({ month, year }) {
    if (!this._canWritePayroll()) return delay({ ok: false, error: 'Anda tidak memiliki izin membuat periode payroll' });
    if (mockPayrollPeriods.some(p => p.period_month === month && p.period_year === year)) {
      return delay({ ok: false, error: 'Periode ini sudah ada' });
    }
    const period = { id: uid('pp'), period_month: month, period_year: year, status: 'open', finalized_by_profile_id: null, finalized_at: null };
    mockPayrollPeriods.unshift(period);
    return delay({ ok: true, period });
  },
  async updatePayrollPeriodStatus(id, status) {
    const profile = currentMockProfile();
    const period = mockPayrollPeriods.find(p => p.id === id);
    if (!period) return delay({ ok: false, error: 'Periode tidak ditemukan' });
    if (['finalized', 'paid'].includes(period.status) && status !== period.status && !(profile && profile.role === 'super_admin')) {
      return delay({ ok: false, error: 'Periode yang sudah difinalisasi hanya dapat dibuka kembali oleh Super Admin' });
    }
    if (!this._canWritePayroll()) return delay({ ok: false, error: 'Anda tidak memiliki izin mengubah status periode' });
    period.status = status;
    if (status === 'finalized') { period.finalized_by_profile_id = profile.id; period.finalized_at = new Date().toISOString(); }
    return delay({ ok: true });
  },

  async listPayslipsForPeriod(periodId) {
    if (!this._canViewPayroll(null)) return delay([]);
    return delay(mockPayslips.filter(p => p.payroll_period_id === periodId).map(p => ({ ...p, employees: mockEmployees.find(e => e.id === p.employee_id) })));
  },
  async listMyPayslips(employeeId) {
    if (!this._canViewPayroll(employeeId)) return delay([]);
    return delay(mockPayslips.filter(p => p.employee_id === employeeId)
      .map(p => ({ ...p, payroll_periods: mockPayrollPeriods.find(pp => pp.id === p.payroll_period_id) }))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
  },
  // net_pay dihitung di sini SAAT INSERT — di Postgres asli, trigger
  // recalc hanya jalan BEFORE UPDATE (bukan BEFORE INSERT), jadi insert
  // pertama HARUS menghitung sendiri, sama seperti supabaseDataService.
  async createPayslip({ periodId, employeeId }) {
    if (!this._canWritePayroll()) return delay({ ok: false, error: 'Anda tidak memiliki izin membuat slip gaji' });
    if (mockPayslips.some(p => p.payroll_period_id === periodId && p.employee_id === employeeId)) {
      return delay({ ok: false, error: 'Slip gaji pegawai ini untuk periode tersebut sudah ada' });
    }
    const payrollInfo = mockPayrollInfo.find(p => p.employee_id === employeeId);
    const baseSalary = payrollInfo?.base_salary || 0;
    const period = mockPayrollPeriods.find(p => p.id === periodId);
    const absentDays = mockAttendance.filter(a => {
      if (a.employee_id !== employeeId || a.status !== 'absent') return false;
      const d = new Date(a.attendance_date);
      return period && d.getMonth() + 1 === period.period_month && d.getFullYear() === period.period_year;
    }).length;
    const payslip = {
      id: uid('psl'), payroll_period_id: periodId, employee_id: employeeId, base_salary: baseSalary,
      total_allowance: 0, total_deduction: 0, pph21: 0, bpjs_deduction: 0, net_pay: baseSalary,
      attendance_absent_days: absentDays, status: 'draft', notes: null, created_at: new Date().toISOString(),
    };
    mockPayslips.unshift(payslip);
    return delay({ ok: true, payslip });
  },
  async getPayslip(id) {
    const payslip = mockPayslips.find(p => p.id === id);
    if (!payslip || !this._canViewPayroll(payslip.employee_id)) return delay(null);
    const items = mockPayslipItems.filter(i => i.payslip_id === id);
    return delay({ ...payslip, items, employees: mockEmployees.find(e => e.id === payslip.employee_id), payroll_periods: mockPayrollPeriods.find(pp => pp.id === payslip.payroll_period_id) });
  },
  _recalcPayslipTotals(payslipId) {
    const payslip = mockPayslips.find(p => p.id === payslipId);
    if (!payslip) return;
    const items = mockPayslipItems.filter(i => i.payslip_id === payslipId);
    payslip.total_allowance = items.filter(i => i.item_type === 'allowance').reduce((a, b) => a + b.amount, 0);
    payslip.total_deduction = items.filter(i => i.item_type === 'deduction').reduce((a, b) => a + b.amount, 0);
    payslip.net_pay = payslip.base_salary + payslip.total_allowance - payslip.total_deduction - payslip.pph21 - payslip.bpjs_deduction;
  },
  async addPayslipItem({ payslipId, itemType, label, amount }) {
    const payslip = mockPayslips.find(p => p.id === payslipId);
    if (!payslip) return delay({ ok: false, error: 'Slip gaji tidak ditemukan' });
    if (!this._canWritePayroll() || payslip.status !== 'draft') return delay({ ok: false, error: 'Item hanya dapat diubah selama slip masih berstatus draft, oleh Pimpinan/Bendahara/Super Admin' });
    mockPayslipItems.push({ id: uid('psi'), payslip_id: payslipId, item_type: itemType, label, amount });
    this._recalcPayslipTotals(payslipId);
    return delay({ ok: true });
  },
  async deletePayslipItem(id) {
    const item = mockPayslipItems.find(i => i.id === id);
    if (!item) return delay({ ok: false, error: 'Item tidak ditemukan' });
    const payslip = mockPayslips.find(p => p.id === item.payslip_id);
    if (!this._canWritePayroll() || !payslip || payslip.status !== 'draft') return delay({ ok: false, error: 'Item hanya dapat dihapus selama slip masih berstatus draft' });
    mockPayslipItems = mockPayslipItems.filter(i => i.id !== id);
    this._recalcPayslipTotals(item.payslip_id);
    return delay({ ok: true });
  },
  async updatePayslipFinancials({ id, pph21, bpjsDeduction }) {
    const payslip = mockPayslips.find(p => p.id === id);
    if (!payslip) return delay({ ok: false, error: 'Slip gaji tidak ditemukan' });
    if (!this._canWritePayroll() || payslip.status !== 'draft') return delay({ ok: false, error: 'Hanya dapat diubah selama slip masih berstatus draft' });
    payslip.pph21 = pph21 || 0; payslip.bpjs_deduction = bpjsDeduction || 0;
    payslip.net_pay = payslip.base_salary + payslip.total_allowance - payslip.total_deduction - payslip.pph21 - payslip.bpjs_deduction;
    return delay({ ok: true });
  },
  async updatePayslipStatus(id, status) {
    if (!this._canWritePayroll()) return delay({ ok: false, error: 'Anda tidak memiliki izin mengubah status slip gaji' });
    const payslip = mockPayslips.find(p => p.id === id);
    if (!payslip) return delay({ ok: false, error: 'Slip gaji tidak ditemukan' });
    payslip.status = status;
    return delay({ ok: true });
  },

  // Meniru RLS employee_attendance_select persis (schema_03).
  async listAttendanceReport({ startDate, endDate, departmentId }) {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    let rows = mockAttendance.filter(a => a.attendance_date >= startDate && a.attendance_date <= endDate);
    if (!['super_admin', 'hrd', 'pimpinan', 'bendahara_umum'].includes(profile.role)) {
      if (profile.role === 'kepala_bagian') {
        rows = rows.filter(a => { const e = mockEmployees.find(x => x.id === a.employee_id); return e && e.department_id === profile.department_id; });
      } else {
        rows = rows.filter(a => a.employee_id === profile.employee_id);
      }
    }
    if (departmentId) rows = rows.filter(a => { const e = mockEmployees.find(x => x.id === a.employee_id); return e && e.department_id === departmentId; });

    const byEmp = {};
    rows.forEach(a => {
      if (!byEmp[a.employee_id]) byEmp[a.employee_id] = { employee: mockEmployees.find(e => e.id === a.employee_id), present: 0, late: 0, absent: 0, sick: 0, permit: 0, leave: 0 };
      if (byEmp[a.employee_id][a.status] !== undefined) byEmp[a.employee_id][a.status]++;
    });
    return delay(Object.values(byEmp));
  },

  // Sama scoping dengan listAttendanceReport di atas, tapi agregasi PER
  // TANGGAL (bukan per pegawai) — untuk grafik tren Dashboard.
  async getAttendanceTrend(days = 14) {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    const endDate = new Date();
    const startDate = new Date(); startDate.setDate(endDate.getDate() - (days - 1));
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDate.toISOString().slice(0, 10);

    let rows = mockAttendance.filter(a => a.attendance_date >= startStr && a.attendance_date <= endStr);
    if (!['super_admin', 'hrd', 'pimpinan', 'bendahara_umum'].includes(profile.role)) {
      if (profile.role === 'kepala_bagian') {
        rows = rows.filter(a => { const e = mockEmployees.find(x => x.id === a.employee_id); return e && e.department_id === profile.department_id; });
      } else {
        rows = rows.filter(a => a.employee_id === profile.employee_id);
      }
    }

    const byDate = {};
    // Inisialisasi semua tanggal dalam rentang dengan 0 — supaya grafik
    // tidak bolong di hari tanpa data sama sekali (bukan cuma tanggal
    // yang kebetulan ada baris attendance).
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      byDate[d.toISOString().slice(0, 10)] = { date: d.toISOString().slice(0, 10), present: 0, late: 0, absent: 0 };
    }
    rows.forEach(a => {
      if (byDate[a.attendance_date] && byDate[a.attendance_date][a.status] !== undefined) byDate[a.attendance_date][a.status]++;
    });
    return delay(Object.values(byDate).sort((a, b) => a.date < b.date ? -1 : 1));
  },

  // Meniru RLS employee_leave_requests_select persis (schema_03/07) —
  // CATATAN: bendahara_umum SENGAJA TIDAK termasuk di sini (beda dari
  // attendance report di atas), karena employee_leave_requests_select
  // memang tidak mengizinkan bendahara_umum.
  async listLeaveReport({ startDate, endDate, departmentId }) {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    let rows = mockLeaveRequests.filter(r => r.status === 'approved' && r.start_date <= endDate && r.end_date >= startDate);
    if (!['super_admin', 'hrd', 'pimpinan'].includes(profile.role)) {
      if (profile.role === 'kepala_bagian') {
        rows = rows.filter(r => { const e = mockEmployees.find(x => x.id === r.employee_id); return e && e.department_id === profile.department_id; });
      } else {
        rows = rows.filter(r => r.employee_id === profile.employee_id);
      }
    }
    if (departmentId) rows = rows.filter(r => { const e = mockEmployees.find(x => x.id === r.employee_id); return e && e.department_id === departmentId; });

    const byKey = {};
    rows.forEach(r => {
      const key = r.employee_id + '|' + r.leave_type_id;
      if (!byKey[key]) byKey[key] = { employee: mockEmployees.find(e => e.id === r.employee_id), leave_types: mockLeaveTypes.find(t => t.id === r.leave_type_id), totalDays: 0 };
      byKey[key].totalDays += r.days_count;
    });
    return delay(Object.values(byKey));
  },

  async getInstitutionSettings() {
    return delay({ ...mockInstitutionSettings });
  },
  async upsertInstitutionSettings({ name, address, whatsappGroupUrl }) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat mengubah pengaturan ini' });
    mockInstitutionSettings.name = name;
    mockInstitutionSettings.address = address;
    if (whatsappGroupUrl !== undefined) mockInstitutionSettings.whatsapp_group_url = whatsappGroupUrl || null;
    return delay({ ok: true });
  },
  async uploadInstitutionLogo(file) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat mengubah logo' });
    if (!file) return delay({ ok: false, error: 'Pilih file terlebih dahulu' });
    if (file.size > 2 * 1024 * 1024) return delay({ ok: false, error: 'Ukuran file maksimal 2MB' });
    mockInstitutionSettings.logo_url = URL.createObjectURL(file);
    return delay({ ok: true, path: mockInstitutionSettings.logo_url });
  },
  async getInstitutionLogoUrl(path) {
    return delay(path); // mode demo: sudah Object URL siap pakai
  },

  // Meniru KontenHarianController::index() + tabel jadwal_sholat_harian/
  // ayat_harian/hadits_harian (schema_90) -- SEPENUHNYA statis di mode
  // mock (bukan hitung astronomis / rotasi asli, itu logikanya cuma ada
  // di Edge Function sync-konten-harian sisi Supabase), supaya UI yang
  // memakai ini (kartu Waktu Shalat / Ayat & Hadits Harian di dashboard,
  // KALAU nanti dibuat) tetap punya sesuatu untuk dirender saat demo
  // mode mock TANPA perlu Supabase live. `status` selalu 'success' di
  // sini (beda dari Supabase yang bisa 'partial' kalau cron belum
  // jalan) -- data mock ini SELALU "lengkap" karena memang hardcode.
  async getKontenHarian(tanggal) {
    const tgl = tanggal || new Date().toISOString().slice(0, 10);
    return delay({
      status: 'success',
      tanggal: tgl,
      data: {
        jadwal_sholat: {
          kota: 'Aceh Besar', tanggal: tgl,
          imsyak: '05:02', shubuh: '05:12', terbit: '06:24', dhuha: '06:44',
          dzuhur: '12:47', ashr: '16:11', magrib: '18:53', isya: '20:04',
          sumber: 'kalkulasi_lokal',
        },
        ayat_harian: {
          tanggal: tgl, nomor_surat: 94, nama_surat: 'Al-Insyirah', nomor_ayat: 6,
          teks_arab: 'إِنَّ مَعَ الْعُسْرِ يُسْرًا',
          teks_latin: "Inna ma'al 'usri yusraa",
          terjemahan_id: 'Sesungguhnya bersama kesulitan ada kemudahan.',
        },
        hadits_harian: {
          tanggal: tgl, perawi: 'bukhari', nomor_hadits: 1,
          teks_arab: 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ',
          terjemahan_id: 'Sesungguhnya setiap amalan tergantung niatnya.',
        },
      },
      catatan: null,
    });
  },

  // ---- Kutipan Halaman Login (schema_73 di mode Supabase) — di sini
  // murni tiruan in-memory memakai mockLoginQuotes, pola sama seperti
  // shift kerja (listShifts/createShift/dst) di atas.
  async listLoginQuotes() {
    return delay([...mockLoginQuotes].sort((a, b) => (a.display_order - b.display_order) || a.quote_text.localeCompare(b.quote_text, 'id')));
  },
  async createLoginQuote(payload) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat menambah kutipan' });
    if (!payload.quote_text?.trim()) return delay({ ok: false, error: 'Teks kutipan wajib diisi' });
    const newQuote = { id: uid('lq'), quote_text: payload.quote_text.trim(), quote_source: payload.quote_source || null, is_active: payload.is_active !== false, display_order: payload.display_order || 0 };
    mockLoginQuotes.unshift(newQuote);
    return delay({ ok: true, quote: newQuote });
  },
  async updateLoginQuote(id, payload) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat mengubah kutipan' });
    const q = mockLoginQuotes.find(x => x.id === id);
    if (!q) return delay({ ok: false, error: 'Kutipan tidak ditemukan' });
    Object.assign(q, payload);
    return delay({ ok: true });
  },
  async deleteLoginQuote(id) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat menghapus kutipan' });
    const idx = mockLoginQuotes.findIndex(x => x.id === id);
    if (idx === -1) return delay({ ok: false, error: 'Kutipan tidak ditemukan' });
    mockLoginQuotes.splice(idx, 1);
    return delay({ ok: true });
  },

  // ---- Struktur Ideal (MUSYKER 2026) — lihat schema_52 untuk skema
  // Supabase & keputusan desain lengkap; di sini murni tiruan in-memory
  // memakai array mockOrgStructure (di-seed lazy, lihat
  // seedMockOrgStructureIfNeeded()).
  async listOrgStructure() {
    seedMockOrgStructureIfNeeded();
    return delay([...mockOrgStructure].sort((a, b) => a.urutan - b.urutan));
  },
  async createOrgPosition(input) {
    seedMockOrgStructureIfNeeded();
    const profile = currentMockProfile();
    if (!canEditOrgStructure(profile)) return delay({ ok: false, error: 'Hanya Super Admin, HRD, atau Pimpinan yang dapat mengubah struktur organisasi' });
    if (!input.kode || !input.kode.trim()) return delay({ ok: false, error: 'Kode Jabatan wajib diisi' });
    if (!input.nama || !input.nama.trim()) return delay({ ok: false, error: 'Nama Jabatan wajib diisi' });
    if (mockOrgStructure.some(r => r.kode === input.kode.trim())) return delay({ ok: false, error: `Kode Jabatan "${input.kode}" sudah dipakai jabatan lain` });
    if (input.parent_id && !mockOrgStructure.some(r => r.id === input.parent_id)) return delay({ ok: false, error: 'Atasan langsung yang dipilih tidak ditemukan' });
    const row = {
      id: uid('orgref'), kode: input.kode.trim(), nama: input.nama.trim(),
      parent_id: input.parent_id || null,
      urutan: mockOrgStructure.length ? Math.max(...mockOrgStructure.map(r => r.urutan)) + 1 : 0,
      atasan_label: input.atasan_label || null, membawahi_label: input.membawahi_label || null,
      tujuan: input.tujuan || null,
      tugas_pokok: Array.isArray(input.tugas_pokok) ? input.tugas_pokok : [],
      wewenang: Array.isArray(input.wewenang) ? input.wewenang : [],
      kualifikasi: Array.isArray(input.kualifikasi) ? input.kualifikasi : [],
      kpi: Array.isArray(input.kpi) ? input.kpi : [],
      updated_at: new Date().toISOString(), updated_by: profile.id,
    };
    mockOrgStructure.push(row);
    pushAuditLog('insert', row, 'org_structure_reference');
    return delay({ ok: true, id: row.id });
  },
  async updateOrgPosition(id, patch) {
    seedMockOrgStructureIfNeeded();
    const profile = currentMockProfile();
    if (!canEditOrgStructure(profile)) return delay({ ok: false, error: 'Hanya Super Admin, HRD, atau Pimpinan yang dapat mengubah struktur organisasi' });
    const row = mockOrgStructure.find(r => r.id === id);
    if (!row) return delay({ ok: false, error: 'Jabatan tidak ditemukan' });
    if (patch.kode && patch.kode.trim() !== row.kode && mockOrgStructure.some(r => r.kode === patch.kode.trim())) {
      return delay({ ok: false, error: `Kode Jabatan "${patch.kode}" sudah dipakai jabatan lain` });
    }
    if ('parent_id' in patch && patch.parent_id) {
      if (!mockOrgStructure.some(r => r.id === patch.parent_id)) return delay({ ok: false, error: 'Atasan langsung yang dipilih tidak ditemukan' });
      if (orgStructureWouldCycle(id, patch.parent_id)) {
        return delay({ ok: false, error: 'Perubahan ini akan membuat rantai hierarki melingkar (jabatan menjadi atasan dari atasannya sendiri)' });
      }
    }
    Object.assign(row, patch, { updated_at: new Date().toISOString(), updated_by: profile.id });
    pushAuditLog('update', row, 'org_structure_reference');
    return delay({ ok: true });
  },
  async deleteOrgPosition(id) {
    seedMockOrgStructureIfNeeded();
    const profile = currentMockProfile();
    if (!canEditOrgStructure(profile)) return delay({ ok: false, error: 'Hanya Super Admin, HRD, atau Pimpinan yang dapat mengubah struktur organisasi' });
    const idx = mockOrgStructure.findIndex(r => r.id === id);
    if (idx === -1) return delay({ ok: false, error: 'Jabatan tidak ditemukan' });
    if (orgStructureHasChildren(id)) {
      return delay({ ok: false, error: 'Jabatan ini masih punya bawahan di bagan — pindahkan atau hapus bawahannya terlebih dahulu' });
    }
    const [removed] = mockOrgStructure.splice(idx, 1);
    pushAuditLog('delete', removed, 'org_structure_reference');
    return delay({ ok: true });
  },

  // ---- Template Dokumen (Pengaturan) — lihat supabaseDataService.js
  // untuk konteks lengkap kenapa fitur ini ada.
  async listDocumentTemplates() {
    const rows = [...mockDocumentTemplates]
      .map(t => ({ ...t, document_letter_types: mockDocumentLetterTypes.find(d => d.type_key === t.document_type_key) || null }))
      .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
    return delay(rows);
  },
  async uploadDocumentTemplate({ name, description, file, documentTypeKey }) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat mengunggah template dokumen' });
    if (!file) return delay({ ok: false, error: 'Pilih file terlebih dahulu' });
    if (!name) return delay({ ok: false, error: 'Nama template wajib diisi' });
    mockDocumentTemplates.push({
      id: uid('doctpl'), name, description: description || null,
      file_url: URL.createObjectURL(file), file_name: file.name, file_size: file.size, mime_type: file.type,
      uploaded_by_profile_id: profile.id, uploaded_at: new Date().toISOString(),
      profiles: { full_name: profile.full_name },
      document_type_key: documentTypeKey || null,
    });
    return delay({ ok: true });
  },
  async deleteDocumentTemplate(id) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat menghapus template dokumen' });
    const idx = mockDocumentTemplates.findIndex(t => t.id === id);
    if (idx === -1) return delay({ ok: false, error: 'Template tidak ditemukan' });
    mockDocumentTemplates.splice(idx, 1);
    return delay({ ok: true });
  },
  async getDocumentTemplateSignedUrl(filePath) {
    return delay(filePath); // mode demo: sudah Object URL siap pakai
  },

  // ---- Jenis Surat & Kriteria Penomoran (menu Manajemen Dokumen) --
  // meniru RLS document_letter_types_select/insert/update (schema_37).
  // Format nomor surat TETAP tetap (urut/kode/bulan-romawi/tahun) --
  // yang bisa diedit cuma kode & nama, sama seperti versi Supabase.
  async listDocumentLetterTypes() {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd', 'pimpinan', 'bendahara_umum'].includes(profile.role)) return delay([]);
    return delay([...mockDocumentLetterTypes].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)));
  },
  async createDocumentLetterType({ typeKey, typeCode, name }) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat menambah jenis surat' });
    if (!typeKey || !typeCode || !name) return delay({ ok: false, error: 'Kode unik, kode nomor surat, dan nama wajib diisi' });
    if (mockDocumentLetterTypes.some(d => d.type_key === typeKey)) return delay({ ok: false, error: 'Kode unik jenis surat sudah dipakai' });
    if (mockDocumentLetterTypes.some(d => d.type_code === typeCode)) return delay({ ok: false, error: 'Kode nomor surat sudah dipakai jenis surat lain' });
    mockDocumentLetterTypes.push({
      // numbering_format 'unit_type' -- default utk semua jenis surat
      // BARU (schema_85); cuma surat_cuti/slip_gaji bawaan yang
      // 'type_only', lihat komentar di seed array.
      id: uid('dlt'), type_key: typeKey, type_code: typeCode, name, numbering_format: 'unit_type', is_active: true,
      created_by_profile_id: profile.id, created_at: new Date().toISOString(),
    });
    return delay({ ok: true });
  },
  async setDocumentLetterTypeActive(id, isActive) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat mengubah status jenis surat' });
    const row = mockDocumentLetterTypes.find(d => d.id === id);
    if (!row) return delay({ ok: false, error: 'Jenis surat tidak ditemukan' });
    row.is_active = isActive;
    return delay({ ok: true });
  },
  // Edit jenis surat -- SENGAJA cuma terima typeCode & name. type_key
  // TIDAK ada di parameter/tidak pernah ditulis di sini: dia FK dari
  // generated_documents.document_type & document_templates.
  // document_type_key (schema_37), diubah bisa membuat dokumen lama
  // "kehilangan" jenis suratnya. UI juga mengunci field itu di mode
  // edit (lihat openEditLetterTypeModal, app.js).
  async updateDocumentLetterType({ id, typeCode, name }) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat mengubah jenis surat' });
    if (!typeCode || !name) return delay({ ok: false, error: 'Kode nomor surat dan nama wajib diisi' });
    if (!/^[A-Z]{2,5}$/.test(typeCode)) return delay({ ok: false, error: 'Kode nomor surat harus 2–5 huruf kapital' });
    const row = mockDocumentLetterTypes.find(d => d.id === id);
    if (!row) return delay({ ok: false, error: 'Jenis surat tidak ditemukan' });
    if (mockDocumentLetterTypes.some(d => d.id !== id && d.type_code === typeCode)) return delay({ ok: false, error: 'Kode nomor surat sudah dipakai jenis surat lain' });
    row.type_code = typeCode;
    row.name = name;
    return delay({ ok: true });
  },

  // ---- Unit Pengeluar Surat (schema_85) -- pola CRUD identik
  // document_letter_types di atas: SELECT DMS_ACCESS_ROLES, INSERT/
  // UPDATE khusus super_admin, TIDAK ADA DELETE (nonaktifkan saja).
  // Kode (mis. 'Pimp') SENGAJA TIDAK dipaksa huruf kapital semua --
  // beda dari type_code, mengikuti dokumen referensi kriteria
  // penomoran asli yang kodenya campuran huruf besar/kecil.
  async listDocumentIssuingUnits() {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd', 'pimpinan', 'bendahara_umum'].includes(profile.role)) return delay([]);
    return delay([...mockDocumentIssuingUnits].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)));
  },
  async createDocumentIssuingUnit({ code, name }) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat menambah unit pengeluar surat' });
    if (!code || !name) return delay({ ok: false, error: 'Kode dan nama wajib diisi' });
    if (mockDocumentIssuingUnits.some(u => u.code === code)) return delay({ ok: false, error: 'Kode ini sudah dipakai unit lain' });
    mockDocumentIssuingUnits.push({
      id: uid('diu'), code, name, is_active: true,
      created_by_profile_id: profile.id, created_at: new Date().toISOString(),
    });
    return delay({ ok: true });
  },
  async updateDocumentIssuingUnit({ id, code, name }) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat mengubah unit pengeluar surat' });
    if (!code || !name) return delay({ ok: false, error: 'Kode dan nama wajib diisi' });
    const row = mockDocumentIssuingUnits.find(u => u.id === id);
    if (!row) return delay({ ok: false, error: 'Unit pengeluar surat tidak ditemukan' });
    if (mockDocumentIssuingUnits.some(u => u.id !== id && u.code === code)) return delay({ ok: false, error: 'Kode ini sudah dipakai unit lain' });
    row.code = code;
    row.name = name;
    return delay({ ok: true });
  },
  async setDocumentIssuingUnitActive(id, isActive) {
    const profile = currentMockProfile();
    if (!profile || profile.role !== 'super_admin') return delay({ ok: false, error: 'Hanya Super Admin yang dapat mengubah status unit pengeluar surat' });
    const row = mockDocumentIssuingUnits.find(u => u.id === id);
    if (!row) return delay({ ok: false, error: 'Unit pengeluar surat tidak ditemukan' });
    row.is_active = isActive;
    return delay({ ok: true });
  },

  // Meniru RLS employee_history_select/write (schema_02): SELECT luas
  // (super_admin/hrd/pimpinan/kepala_bagian-departemen/pemilik sendiri),
  // WRITE SENGAJA HANYA super_admin/hrd — bahkan kepala_bagian/pemilik
  // sendiri TIDAK BOLEH menulis (mencegah pegawai memalsukan catatan
  // reward/punishment miliknya sendiri, alasan didokumentasikan di
  // schema_02 saat tabel ini pertama dibuat).
  async listEmployeeHistory(employeeId) {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    const emp = mockEmployees.find(e => e.id === employeeId);
    const allowed = ['super_admin', 'hrd', 'pimpinan'].includes(profile.role)
      || (profile.role === 'kepala_bagian' && emp && emp.department_id === profile.department_id)
      || profile.employee_id === employeeId;
    if (!allowed) return delay([]);
    return delay(mockEmployeeHistory.filter(h => h.employee_id === employeeId).sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1)));
  },
  async createEmployeeHistory({ employeeId, eventType, description, decreeNumber, effectiveDate }) {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd'].includes(profile.role)) {
      return delay({ ok: false, error: 'Hanya Super Admin/HRD yang dapat menambah riwayat karier — ini catatan resmi kepegawaian' });
    }
    mockEmployeeHistory.unshift({ id: uid('hist'), employee_id: employeeId, event_type: eventType, description, decree_number: decreeNumber || null, effective_date: effectiveDate, recorded_by_profile_id: profile.id, created_at: new Date().toISOString() });
    return delay({ ok: true });
  },

  // Riwayat TERSTRUKTUR (schema_42) — read-only dari sisi frontend (baris
  // ditulis oleh trigger DB, lihat schema_42). RLS ditiru persis dari
  // policy SQL: posisi dibaca super_admin/hrd/pimpinan/kepala_bagian
  // departemen terkait/pemilik sendiri; gaji LEBIH KETAT (tidak termasuk
  // kepala_bagian) — hanya super_admin/pimpinan/bendahara_umum/pemilik.
  async listEmployeePositionHistory(employeeId) {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    const emp = mockEmployees.find(e => e.id === employeeId);
    const allowed = ['super_admin', 'hrd', 'pimpinan'].includes(profile.role)
      || (profile.role === 'kepala_bagian' && emp && emp.department_id === profile.department_id)
      || profile.employee_id === employeeId;
    if (!allowed) return delay([]);
    return delay(mockPositionHistory.filter(h => h.employee_id === employeeId).sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1)));
  },
  async listEmployeeSalaryHistory(employeeId) {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    const allowed = ['super_admin', 'pimpinan', 'bendahara_umum'].includes(profile.role)
      || profile.employee_id === employeeId;
    if (!allowed) return delay([]);
    return delay(mockSalaryHistory.filter(h => h.employee_id === employeeId).sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1)));
  },

  // Tiruan generate-document Edge Function — di mode demo TIDAK ADA
  // mail-merge sungguhan (tidak ada backend Deno di browser), jadi
  // cukup simulasikan hasil sukses + catat baris generated_documents
  // palsu, supaya alur UI (tombol Generate -> toast -> muncul di
  // daftar dokumen) bisa didemokan tanpa Supabase. Ditandai jelas lewat
  // note di dokumen yang dihasilkan supaya tidak dikira file sungguhan.
  // Meniru buildMergeData() di supabase/functions/generate-document/index.ts
  // PERSIS — kalau field di sana bertambah, tambahkan juga di sini supaya
  // mode mock & mode Supabase menghasilkan placeholder yang sama.
  _buildDocMergeData(emp, institution) {
    const dept = mockDepartments.find(d => d.id === emp.department_id);
    const payroll = mockPayrollInfo.find(p => p.employee_id === emp.id);
    const flatten = (prefix, obj, out) => {
      if (!obj) return;
      Object.entries(obj).forEach(([k, v]) => { out[`${prefix}${k}`] = v == null ? '' : String(v); });
    };
    const data = {
      employee_code: emp.employee_code ?? '', full_name: emp.full_name ?? '',
      position: emp.position ?? '', unit: emp.unit ?? '',
      department_name: dept?.name ?? '', employment_status: emp.employment_status ?? '',
      contract_type: emp.contract_type ?? '', join_date: emp.join_date ?? '',
      base_salary: payroll?.base_salary != null ? String(payroll.base_salary) : '',
      institution_name: institution?.name ?? '', institution_address: institution?.address ?? '',
      today: new Date().toISOString().slice(0, 10),
    };
    flatten('personal_info_', emp.personal_info, data);
    flatten('contact_info_', emp.contact_info, data);
    flatten('emergency_contact_', emp.emergency_contact, data);
    return data;
  },

  // Isi placeholder {key} langsung di XML word/document.xml — TANPA
  // docxtemplater (lihat catatan CDN di index.html). Word sering
  // memecah satu tag "{full_name}" jadi beberapa <w:r> run kalau ada
  // spell-check/formatting di tengahnya (mis. "{full_" lalu "name}" run
  // terpisah) — replace string polos akan gagal kalau itu terjadi.
  // TRIK: hapus dulu semua tag XML yang ada DI DALAM sepasang { }
  // (non-greedy, tanpa {/} bersarang) supaya run yang terpecah menyatu
  // jadi teks "{key}" polos, BARU string-replace biasa. Ini pendekatan
  // umum untuk mail-merge docx ringan tanpa library besar.
  _mergeDocxXml(xml, mergeData) {
    const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let merged = xml.replace(/\{(?:(?!\{|\}).)*?\}/gs, (m) => m.replace(/<[^>]+>/g, ''));
    Object.entries(mergeData).forEach(([key, value]) => {
      merged = merged.split(`{${key}}`).join(escapeXml(value));
    });
    return merged;
  },

  // Mode mock TIDAK punya storage/Edge Function sungguhan — SEBELUMNYA
  // fungsi ini cuma mencatat baris palsu dengan file_url path fiktif
  // ("mock-generated.docx") yang tidak menunjuk ke file apa pun, jadi
  // tombol Unduh di UI diam-diam gagal (tidak ada file nyata untuk
  // diunduh). DIPERBAIKI: template Word yang diunggah lewat Pengaturan
  // sudah tersimpan sebagai Object URL blob NYATA di browser (lihat
  // uploadDocumentTemplate) — di sini kita buka isi zip .docx-nya pakai
  // PizZip, isi placeholder di word/document.xml (lihat _mergeDocxXml),
  // lalu simpan hasilnya sebagai Object URL baru. Hasilnya file .docx
  // SUNGGUHAN yang bisa dibuka di Microsoft Word, bukan simulasi.
  async listDisciplinaryRecords() {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    const rows = scopeDisciplinaryForCurrentUser(mockDisciplinaryRecords)
      .slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(r => {
        const emp = mockEmployees.find(e => e.id === r.employee_id);
        return {
          ...r,
          employees: emp ? { full_name: emp.full_name, employee_code: emp.employee_code, department_id: emp.department_id, departments: { name: mockDepartments.find(d => d.id === emp.department_id)?.name } } : null,
          proposer: { full_name: mockProfiles.find(p => p.id === r.proposed_by_profile_id)?.full_name || '—' },
          decider: { full_name: mockProfiles.find(p => p.id === r.decided_by_profile_id)?.full_name || '—' },
        };
      });
    return delay(rows);
  },
  async getEmployeeActiveDisciplinaryLevel(employeeId) {
    const LEVEL_RANK = { teguran_lisan: 1, teguran_tertulis: 2, sp1: 3, sp2: 4, sp3: 5 };
    const today = new Date().toISOString().slice(0, 10);
    const active = mockDisciplinaryRecords.filter(r => r.employee_id === employeeId && r.status === 'active' && (!r.valid_until || r.valid_until >= today));
    if (!active.length) return delay(null);
    const highest = active.reduce((a, b) => (LEVEL_RANK[b.level] > LEVEL_RANK[a.level] ? b : a));
    return delay({ employee_id: employeeId, highest_active_level: highest.level, active_records_count: active.length, latest_valid_until: active.map(r => r.valid_until).sort().pop() || null });
  },
  async createDisciplinaryRecord(payload) {
    const profile = currentMockProfile();
    if (!profile) return delay({ ok: false, error: 'Sesi berakhir, silakan masuk kembali' });
    if (!payload.employee_id || !payload.level || !payload.category || !payload.description || !payload.incident_date) {
      return delay({ ok: false, error: 'Semua field wajib diisi' });
    }
    mockDisciplinaryRecords.push({
      id: uid('disc'), employee_id: payload.employee_id, level: payload.level, category: payload.category,
      description: payload.description, incident_date: payload.incident_date, evidence_url: payload.evidence_url || null,
      status: payload.status || 'pending_hrd', proposed_by_profile_id: profile.id,
      decided_by_profile_id: null, decided_at: null, decision_notes: null,
      issued_date: null, valid_until: null, acknowledged_at: null, acknowledged_note: null,
      created_at: new Date().toISOString(),
    });
    return delay({ ok: true });
  },
  async decideDisciplinaryRecord(id, { status, decision_notes, valid_until }) {
    const profile = currentMockProfile();
    const rec = mockDisciplinaryRecords.find(r => r.id === id);
    if (!rec) return delay({ ok: false, error: 'Catatan tidak ditemukan' });
    if ((status === 'rejected' || status === 'revoked') && !decision_notes?.trim()) {
      return delay({ ok: false, error: 'Alasan wajib diisi saat menolak atau mencabut' });
    }
    rec.status = status;
    rec.decision_notes = decision_notes || null;
    rec.decided_by_profile_id = profile?.id || null;
    rec.decided_at = new Date().toISOString();
    if (status === 'active') {
      rec.issued_date = rec.decided_at.slice(0, 10);
      const months = { teguran_lisan: 3, teguran_tertulis: 6, sp1: 6, sp2: 6, sp3: 6 }[rec.level] ?? 6;
      const d = new Date(rec.issued_date); d.setMonth(d.getMonth() + months);
      rec.valid_until = valid_until || d.toISOString().slice(0, 10);
    }
    return delay({ ok: true });
  },
  async acknowledgeDisciplinaryRecord(id, note) {
    const rec = mockDisciplinaryRecords.find(r => r.id === id);
    if (!rec) return delay({ ok: false, error: 'Catatan tidak ditemukan' });
    rec.acknowledged_at = new Date().toISOString();
    rec.acknowledged_note = note || null;
    return delay({ ok: true });
  },
  async uploadDisciplinaryEvidence(employeeId, file) {
    if (!file) return delay({ ok: false, error: 'Pilih file terlebih dahulu' });
    return delay({ ok: true, path: `${employeeId}/${file.name}` }); // mode demo: tidak benar-benar mengunggah
  },
  async getDisciplinaryEvidenceSignedUrl(filePath) {
    return delay('#'); // mode demo: tidak ada file sungguhan untuk diunduh
  },

  async generateDocumentFromTemplate({ templateId, employeeId, documentType, issuingUnitId }) {
    const profile = currentMockProfile();
    if (!profile) return delay({ ok: false, error: 'Sesi berakhir, silakan masuk kembali' });
    // documentType wajib (schema_37 dropdown, e28669e) -- disamakan
    // dengan validasi generate-document/index.ts (edge function) supaya
    // mode mock TIDAK diam-diam sukses untuk kasus yang di mode Supabase
    // sudah ditolak 400 "documentType wajib diisi". Sebelum ini, mock
    // masih fallback ke 'lainnya' -- lolos di demo, gagal di production.
    if (!documentType) return delay({ ok: false, error: 'templateId, employeeId, dan documentType wajib diisi' });
    const emp = mockEmployees.find(e => e.id === employeeId);
    if (!emp) return delay({ ok: false, error: 'Data pegawai tidak ditemukan' });
    // Dicek DI SINI (schema_85), SEBELUM mail-merge yang berat, sama
    // seperti edge function -- gagal cepat, bukan setelah kerja berat
    // selesai lalu baru ketahuan Unit Pengeluar Surat belum dipilih.
    const precheck = this._validateDocumentNumberInputs(documentType, issuingUnitId);
    if (!precheck.ok) return delay({ ok: false, error: precheck.error });
    const template = mockDocumentTemplates.find(t => t.id === templateId);

    // Kalau template tidak ditemukan di mockDocumentTemplates (mis. ID
    // dipakai lewat jalur lain di luar UI "Generate Dokumen" normal) ATAU
    // library PizZip belum termuat (lingkungan tanpa browser/CDN, mis.
    // test Node) — jatuh ke perilaku lama: catat baris tanpa file nyata.
    // Kalau template ADA dan library tersedia, jalur di bawah
    // menghasilkan file .docx SUNGGUHAN dari isi template asli.
    const isDocx = template
      && (template.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        || template.file_name?.toLowerCase().endsWith('.docx'));
    const canRealMerge = isDocx && typeof window !== 'undefined' && window.PizZip && typeof fetch === 'function';

    if (!canRealMerge) {
      const numberResult = this._buildDocumentNumber(documentType, issuingUnitId);
      if (!numberResult.ok) return delay({ ok: false, error: numberResult.error });
      const doc = {
        id: uid('gendoc'), document_number: numberResult.documentNumber, employee_id: employeeId, document_type: documentType,
        reference_table: 'document_templates', reference_id: templateId,
        file_url: `${employeeId}/mock-generated.docx`,
        generated_at: new Date().toISOString(),
        _mockNote: template
          ? 'Template PDF/format lain di mode demo belum bisa di-mail-merge nyata — gunakan mode Supabase.'
          : 'Simulasi (template tidak ditemukan di daftar Template Dokumen) — file bukan hasil mail-merge nyata.',
      };
      mockGeneratedDocuments.unshift(doc);
      return delay({ ok: true, document: doc, fileExt: 'docx' });
    }

    let outputBlob;
    try {
      // Timeout eksplisit: fetch() ke Object URL blob kadang macet tanpa
      // resolve/reject di sebagian browser (mis. blob sudah ke-revoke
      // browser, atau CSP terblokir sebelum fix connect-src blob: aktif).
      // Tanpa timeout ini, tombol "Generate" bisa macet selamanya di
      // "Memproses…" tanpa toast error apa pun -- user tidak tahu ada
      // yang salah.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      let templateBlob;
      try {
        const resp = await fetch(template.file_url, { signal: controller.signal });
        templateBlob = await resp.blob();
      } catch (fetchErr) {
        if (fetchErr?.name === 'AbortError') {
          throw new Error('Gagal ambil file template (timeout 15 detik) — coba unggah ulang template di menu Pengaturan, kemungkinan Object URL sudah kedaluwarsa.');
        }
        throw fetchErr;
      } finally {
        clearTimeout(timeoutId);
      }
      const arrayBuffer = await templateBlob.arrayBuffer();
      const zip = new window.PizZip(arrayBuffer);
      const mergeData = this._buildDocMergeData(emp, mockInstitutionSettings);
      const docXmlPath = 'word/document.xml';
      const docXml = zip.file(docXmlPath)?.asText();
      if (!docXml) throw new Error('File .docx tidak valid (word/document.xml tidak ditemukan)');
      zip.file(docXmlPath, this._mergeDocxXml(docXml, mergeData));
      // Header/footer (kop surat, dsb.) juga bisa berisi placeholder —
      // isi juga kalau ada, diam-diam lewati kalau template tidak
      // punya header/footer sama sekali.
      Object.keys(zip.files).filter(f => /^word\/(header|footer)\d*\.xml$/.test(f)).forEach(f => {
        zip.file(f, this._mergeDocxXml(zip.file(f).asText(), mergeData));
      });
      // compression: 'DEFLATE' -- konsisten dengan fix schema_53 di
      // generate-document/index.ts (edge function). Tanpa ini PizZip
      // keluarkan zip TIDAK TERKOMPRESI (STORE), membengkakkan ukuran
      // file yang diunduh user secara tidak perlu di mode demo/mock.
      // Jalur ini TIDAK melalui Supabase Storage (langsung jadi Blob
      // untuk diunduh browser), jadi tidak kena limit bucket 5MB/10MB
      // seperti kasus produksi -- tapi bug pola-nya sama, jadi tetap
      // diperbaiki untuk konsistensi & ukuran unduhan yang wajar.
      outputBlob = new Blob([zip.generate({ type: 'uint8array', compression: 'DEFLATE' })], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    } catch (e) {
      console.error('[generateDocumentFromTemplate] gagal:', e);
      return delay({ ok: false, error: `Gagal mengisi template docx: ${e?.message || e}` });
    }

    const numberResult = this._buildDocumentNumber(documentType, issuingUnitId);
    if (!numberResult.ok) return delay({ ok: false, error: numberResult.error });

    const genDoc = {
      id: uid('gendoc'), document_number: numberResult.documentNumber, employee_id: employeeId, document_type: documentType,
      reference_table: 'document_templates', reference_id: templateId,
      file_url: URL.createObjectURL(outputBlob),
      file_name: `${emp.full_name.replace(/\s+/g, '_')}_${template.name.replace(/\s+/g, '_')}.docx`,
      generated_at: new Date().toISOString(),
    };
    mockGeneratedDocuments.unshift(genDoc);
    return delay({ ok: true, document: genDoc, fileExt: 'docx' });
  },

  // Simulasi pembersihan retensi (schema_56) di mode demo -- mock
  // tidak punya Storage sungguhan, jadi cukup tandai file_deleted_at
  // pada baris mockGeneratedDocuments yang lebih tua dari retentionDays.
  async cleanupGeneratedDocuments(retentionDays = 30) {
    const profile = currentMockProfile();
    if (!profile || !['super_admin', 'hrd'].includes(profile.role)) {
      return delay({ ok: false, error: 'Hanya Super Admin/HRD yang dapat membersihkan dokumen' });
    }
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let count = 0;
    mockGeneratedDocuments.forEach(d => {
      if (!d.file_deleted_at && new Date(d.generated_at).getTime() < cutoff) {
        d.file_deleted_at = new Date().toISOString();
        count++;
      }
    });
    return delay({ ok: true, deletedCount: count, retentionDays });
  },

  // RLS notifications (schema_18): HANYA penerima sendiri, tidak ada
  // role lain (termasuk super_admin) yang boleh mengintip.
  async listNotifications(limit = 20) {
    const profile = currentMockProfile();
    if (!profile) return delay([]);
    return delay(mockNotifications.filter(n => n.recipient_profile_id === profile.id).slice(0, limit));
  },
  async getUnreadNotificationCount() {
    const profile = currentMockProfile();
    if (!profile) return delay(0);
    return delay(mockNotifications.filter(n => n.recipient_profile_id === profile.id && !n.is_read).length);
  },
  async markNotificationRead(id) {
    const profile = currentMockProfile();
    const n = mockNotifications.find(x => x.id === id);
    if (!n || n.recipient_profile_id !== profile?.id) return delay({ ok: false, error: 'Notifikasi tidak ditemukan' });
    n.is_read = true;
    return delay({ ok: true });
  },
  async markAllNotificationsRead() {
    const profile = currentMockProfile();
    if (!profile) return delay({ ok: false, error: 'Belum login' });
    mockNotifications.filter(n => n.recipient_profile_id === profile.id).forEach(n => { n.is_read = true; });
    return delay({ ok: true });
  },

  // Push notification butuh Edge Function + VAPID sungguhan -- tidak
  // ada padanan bermakna di mode mock, jadi TIDAK BOLEH pura-pura
  // berhasil. Tombol UI-nya sendiri disembunyikan lewat isPushSupported()
  // (VAPID_PUBLIC_KEY kosong = false) sehingga fungsi-fungsi ini
  // seharusnya tidak pernah benar-benar dipanggil dari mode mock,
  // tapi tetap didefinisikan (bukan dibiarkan undefined) supaya
  // app.js tidak crash kalau suatu saat dipanggil.
  isPushSupported() { return false; },
  async getPushSubscriptionStatus() { return 'unsupported'; },
  async subscribeToPush() { return { ok: false, error: 'Push notification tidak tersedia dalam mode demo.' }; },
  async unsubscribeFromPush() { return { ok: true }; },

  // Kartu "Tugas" tab Cek (schema_108) -- lihat canAccessEmployeeTasks()
  // & mockEmployeeTasks di atas.
  async listEmployeeTasks(employeeId) {
    const profile = currentMockProfile();
    if (!canAccessEmployeeTasks(profile, employeeId)) return delay([]);
    return delay(mockEmployeeTasks
      .filter(t => t.employee_id === employeeId)
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
  },
  async createEmployeeTask(employeeId, payload) {
    const profile = currentMockProfile();
    if (!canAccessEmployeeTasks(profile, employeeId)) return delay({ ok: false, error: 'Anda tidak berwenang menambah tugas untuk pegawai ini' });
    mockEmployeeTasks.push({
      id: uid('task'), employee_id: employeeId,
      name: payload.name, given_by: payload.givenBy, deadline: payload.deadline, description: payload.description || null,
      created_by_profile_id: profile.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    return delay({ ok: true });
  },
  async updateEmployeeTask(taskId, payload) {
    const profile = currentMockProfile();
    const task = mockEmployeeTasks.find(t => t.id === taskId);
    if (!task) return delay({ ok: false, error: 'Tugas tidak ditemukan' });
    if (!canAccessEmployeeTasks(profile, task.employee_id)) return delay({ ok: false, error: 'Anda tidak berwenang mengubah tugas ini' });
    Object.assign(task, { name: payload.name, given_by: payload.givenBy, deadline: payload.deadline, description: payload.description || null, updated_at: new Date().toISOString() });
    return delay({ ok: true });
  },
  async deleteEmployeeTask(taskId) {
    const profile = currentMockProfile();
    const task = mockEmployeeTasks.find(t => t.id === taskId);
    if (!task) return delay({ ok: false, error: 'Tugas tidak ditemukan' });
    if (!canAccessEmployeeTasks(profile, task.employee_id)) return delay({ ok: false, error: 'Anda tidak berwenang menghapus tugas ini' });
    mockEmployeeTasks = mockEmployeeTasks.filter(t => t.id !== taskId);
    return delay({ ok: true });
  },

  // ---- Database Santri (schema_110) -- meniru RLS
  // student_database_records_select/insert/update/delete: super_admin
  // atau hrd saja (STUDENT_DB_ACCESS_ROLES, constants.js). ----
  async listStudentDbRecords() {
    const profile = currentMockProfile();
    if (!profile || !["super_admin", "hrd"].includes(profile.role)) return delay([]);
    return delay([...mockStudentDbRecords].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
  },
  async getStudentDbRecord(id) {
    const profile = currentMockProfile();
    if (!profile || !["super_admin", "hrd"].includes(profile.role)) return delay(null);
    return delay(mockStudentDbRecords.find(r => r.id === id) || null);
  },
  async createStudentDbRecord(payload) {
    const profile = currentMockProfile();
    if (!profile || !["super_admin", "hrd"].includes(profile.role)) return delay({ ok: false, error: 'Halaman ini khusus Super Admin/Sekretaris' });
    if (!payload.nama_lengkap) return delay({ ok: false, error: 'Nama Lengkap wajib diisi' });
    if (payload.no_induk_santri && mockStudentDbRecords.some(r => r.no_induk_santri === payload.no_induk_santri)) {
      return delay({ ok: false, error: 'No. Induk Santri ini sudah dipakai data lain' });
    }
    const row = {
      id: uid('sdb'), ...payload,
      lampiran_kk_path: null, lampiran_akte_path: null,
      created_by_profile_id: profile.id, updated_by_profile_id: profile.id,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    mockStudentDbRecords.push(row);
    return delay({ ok: true, id: row.id });
  },
  async updateStudentDbRecord(id, payload) {
    const profile = currentMockProfile();
    if (!profile || !["super_admin", "hrd"].includes(profile.role)) return delay({ ok: false, error: 'Halaman ini khusus Super Admin/Sekretaris' });
    const row = mockStudentDbRecords.find(r => r.id === id);
    if (!row) return delay({ ok: false, error: 'Data santri tidak ditemukan' });
    if (!payload.nama_lengkap) return delay({ ok: false, error: 'Nama Lengkap wajib diisi' });
    if (payload.no_induk_santri && mockStudentDbRecords.some(r => r.id !== id && r.no_induk_santri === payload.no_induk_santri)) {
      return delay({ ok: false, error: 'No. Induk Santri ini sudah dipakai data lain' });
    }
    Object.assign(row, payload, { updated_by_profile_id: profile.id, updated_at: new Date().toISOString() });
    return delay({ ok: true, id: row.id });
  },
  async deleteStudentDbRecord(id) {
    const profile = currentMockProfile();
    if (!profile || !["super_admin", "hrd"].includes(profile.role)) return delay({ ok: false, error: 'Halaman ini khusus Super Admin/Sekretaris' });
    const before = mockStudentDbRecords.length;
    mockStudentDbRecords = mockStudentDbRecords.filter(r => r.id !== id);
    if (mockStudentDbRecords.length === before) return delay({ ok: false, error: 'Data santri tidak ditemukan' });
    mockStudentDbAttachmentBlobs.delete(id + ':kk');
    mockStudentDbAttachmentBlobs.delete(id + ':akte');
    return delay({ ok: true });
  },
  async uploadStudentDbAttachment(id, kind, file) {
    const profile = currentMockProfile();
    if (!profile || !["super_admin", "hrd"].includes(profile.role)) return delay({ ok: false, error: 'Halaman ini khusus Super Admin/Sekretaris' });
    const row = mockStudentDbRecords.find(r => r.id === id);
    if (!row) return delay({ ok: false, error: 'Data santri tidak ditemukan' });
    const key = id + ':' + kind;
    mockStudentDbAttachmentBlobs.set(key, file);
    const path = 'mock/' + key + '/' + file.name;
    if (kind === 'kk') row.lampiran_kk_path = path; else row.lampiran_akte_path = path;
    row.updated_at = new Date().toISOString();
    return delay({ ok: true, path });
  },
  async getStudentDbAttachmentUrl(id, kind) {
    const profile = currentMockProfile();
    if (!profile || !["super_admin", "hrd"].includes(profile.role)) return delay(null);
    const file = mockStudentDbAttachmentBlobs.get(id + ':' + kind);
    if (!file) return delay(null);
    return delay(URL.createObjectURL(file));
  },
};
