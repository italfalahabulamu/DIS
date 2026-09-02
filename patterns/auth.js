/* ============================================================
   auth.js — Sesi login, registrasi mandiri, logout, dan role
   gating (sembunyikan/tampilkan menu sesuai peran).
   Dipindahkan dari app.js baris 161-433 (P3.1 Tahap 2).

   STATUS TRANSISI -- BACA SEBELUM MENGUBAH:
   Modul ini BELUM di-import di manapun (index.html belum diubah,
   lihat docs/MIGRATION_ES_MODULES.md).
   PEMBARUAN (P3.1 Tahap 7): SEMUA referensi window.fn di modul ini
   yang tujuannya sudah selesai dimigrasi (ui-shell.js Tahap 3,
   employee-profile.js Tahap 4, settings.js Tahap 7) sudah diganti
   `import` sungguhan -- backlog ini SEHARUSNYA dibereskan bertahap
   sejak Tahap 3/4 tapi terlewat sampai sekarang, dibereskan
   sekaligus di Tahap 7 supaya tidak menumpuk lebih jauh.

   PEMBARUAN (P3.1 Tahap 18): `showModeBanner()` (satu-satunya
   window.fn yang tersisa sejak Tahap 7, definisinya dulu di app.js
   baris ~169) SEKARANG DIPINDAH ke modul ini sendiri -- keputusan
   final: auth.js, BUKAN ui-shell.js seperti TODO lama sempat
   menyarankan (satu-satunya pemanggilnya adalah initSession() di
   modul ini sendiri, jadi tidak ada alasan menaruhnya di modul
   lain). Modul ini TIDAK punya window.fn tersisa lagi.
   ============================================================ */

import { state } from './state.js';
import { ROLE_LABEL, SELF_SERVICE_ROLES, REGISTRATION_APPROVAL_ROLES, DMS_ACCESS_ROLES, HR_COST_ACCESS_ROLES, EXEC_DASHBOARD_ROLES, AUDIT_ROLES, ADD_EMPLOYEE_ROLES, EDIT_EMPLOYEE_ROLES, STUDENT_DB_ACCESS_ROLES } from './constants.js';
import { initials } from './utils.js';
import { toast, openModal, closeModal, goto, refreshNotificationBadge, startNotificationPolling, stopNotificationPolling, closeSidebarActionsMenu } from './ui-shell.js';
import { viewEmployee, renderProfileTodayAttendance } from './employee-profile.js';
import { renderTopbarInstitutionHeader, applyInstitutionBrandMark, applyLoginQuote, renderTopbarHijriDate } from './settings.js';
import { startIdleTimer, stopIdleTimer } from './idle-timeout.js';

export async function initSession() {
  showModeBanner();
  applyInstitutionBrandMark(); // tidak perlu await, kosmetik, tak boleh menunda alur login
  applyLoginQuote(); // idem, rotasi kutipan harian
  renderTopbarHijriDate(); // idem, kosmetik & sinkron (Intl, tanpa jaringan) -- aman dipanggil sebelum sesi dicek

  // Alur reset password via email: link yang dikirim Supabase Auth
  // (lihat supabase/functions/reset-password/index.ts) selalu memuat
  // hash URL '#access_token=...&type=recovery&...'. Dicek di sini
  // SEBELUM getSession() -- deteksi string hash murni sinkron, tidak
  // bergantung event async 'PASSWORD_RECOVERY' dari supabase-js (yang
  // baru terpicu belakangan, rawan race kalau dijadikan satu-satunya
  // sinyal). Tanpa pengecekan ini, supabase-js (detectSessionInUrl
  // default true) akan otomatis membuat sesi dari token recovery itu,
  // dan pengguna akan langsung "ter-login" masuk ke dashboard biasa
  // TANPA pernah diminta mengatur kata sandi baru -- bukan error yang
  // terlihat, tapi jelas bukan alur yang dimaksud.
  if (window.location.hash.includes('type=recovery')) {
    showResetPasswordScreen();
    return;
  }

  const profile = await window.dataService.getSession();
  if (profile) { await applyLoggedInProfile(profile); } else { showLoginScreen(); }
}

export function showResetPasswordScreen() {
  document.getElementById('appShell').classList.remove('active');
  document.getElementById('screen-login').classList.remove('active');
  document.getElementById('screen-register').classList.remove('active');
  document.getElementById('screen-reset-password').classList.add('active');
}

export async function submitPasswordRecovery() {
  const newPw = document.getElementById('rpNewPassword').value;
  const confirmPw = document.getElementById('rpConfirmPassword').value;
  if (!newPw || newPw.length < 8) { toast('Kata sandi baru minimal 8 karakter'); return; }
  if (newPw !== confirmPw) { toast('Konfirmasi kata sandi tidak cocok'); return; }

  const btn = document.getElementById('resetPasswordSubmitBtn');
  btn.disabled = true; btn.textContent = 'Menyimpan…';
  try {
    // changePassword() memanggil supabaseClient.auth.updateUser({password}),
    // yang bekerja memakai SESI AKTIF -- pada alur recovery ini, sesi
    // aktifnya adalah sesi sementara yang dibuat supabase-js dari token
    // di URL hash (bukan sesi login biasa), tapi API-nya sama persis
    // dengan ganti password biasa, jadi fungsi yang sudah ada bisa
    // dipakai ulang apa adanya tanpa duplikasi logic.
    const result = await window.dataService.changePassword(newPw);
    if (!result.ok) { toast('Gagal menyimpan kata sandi baru: ' + result.error, 'error'); return; }

    // Bersihkan hash token dari address bar (tidak dibiarkan tersisa
    // di riwayat browser/kalau di-screenshot/share URL secara tidak
    // sengaja), lalu keluarkan paksa dari sesi recovery sementara --
    // pengguna WAJIB login ulang dengan kata sandi barunya, bukan
    // otomatis lanjut masuk lewat sesi recovery yang sama. Ini pilihan
    // keamanan yang disengaja, konsisten dengan pola doLogout() (selalu
    // kembali ke layar login apa pun hasil signOut() di server).
    history.replaceState(null, '', window.location.pathname + window.location.search);
    try { await window.dataService.signOut(); } catch (e) { /* diamkan, tetap lanjut ke layar login */ }
    toast('Kata sandi berhasil diubah. Silakan masuk dengan kata sandi baru Anda.', 'success');
    showLoginScreen();
  } finally {
    btn.disabled = false; btn.textContent = 'Simpan Kata Sandi Baru';
  }
}

// Banner kuning "MODE DEMO" -- hanya tampil kalau dataService.mode ===
// 'mock' (offline demo, BUKAN produksi Supabase). Dipindahkan ke sini
// (P3.1 Tahap 18) dari app.js baris 169 -- SATU-SATUNYA pemanggilnya
// adalah initSession() di atas, jadi auth.js lebih tepat daripada
// ui-shell.js seperti TODO lama sempat menyarankan.
function showModeBanner() {
  if (window.dataService.mode !== 'mock') return;
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:1000;background:#8A5A10;color:#fff;' +
    'text-align:center;font-size:12px;font-weight:600;padding:6px;letter-spacing:.02em;';
  banner.textContent = '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg> MODE DEMO — data di memori browser, hilang saat refresh, belum tersambung ke Supabase. Login demo: admin / admin123';
  document.body.prepend(banner);
  document.body.style.paddingTop = '30px';
}

export function showLoginScreen() {
  document.getElementById('appShell').classList.remove('active');
  document.getElementById('screen-register').classList.remove('active');
  document.getElementById('screen-reset-password')?.classList.remove('active');
  document.getElementById('screen-login').classList.add('active');
}

export function showRegisterScreen() {
  document.getElementById('screen-login').classList.remove('active');
  document.getElementById('screen-register').classList.add('active');
}

export function showLoginScreenFromRegister() {
  document.getElementById('screen-register').classList.remove('active');
  document.getElementById('screen-login').classList.add('active');
}

// PERBAIKAN KEAMANAN: role & status TIDAK dikirim dari sini sama sekali —
// server (trigger handle_new_user, lihat schema_23) yang menentukan
// role='pegawai' & status='pending' secara default. Kalaupun seseorang
// memodifikasi request ini lewat DevTools untuk menyisipkan field role,
// Edge Function register-employee tidak membacanya dari payload sama
// sekali (lihat index.ts) — jadi tidak ada jalan eskalasi privilege lewat
// form ini, bukan cuma disembunyikan di UI.
export async function doRegister() {
  const btn = document.getElementById('registerSubmitBtn');
  const val = (id) => document.getElementById(id)?.value.trim();

  const payload = {
    username: val('regUsername'), email: val('regEmail'), password: val('regPassword'),
    full_name: val('regFullName'), title: val('regTitle'), nik: val('regNIK'),
    birth_place_date: val('regBirthPlace'), npwp: val('regNPWP'),
    gender: document.getElementById('regGender').value, religion: document.getElementById('regReligion').value,
    marital_status: document.getElementById('regMaritalStatus').value, nationality: val('regNationality'),
    blood_type: document.getElementById('regBloodType').value,
    ktp_address: val('regKtpAddress'), ktp_province: val('regKtpProvince'), ktp_regency: val('regKtpRegency'),
    ktp_district: val('regKtpDistrict'), ktp_village: val('regKtpVillage'),
    spouse_name: val('regSpouseName'),
    children_count: val('regChildrenCount') ? Number(val('regChildrenCount')) : null,
    dependents_count: val('regDependentsCount') ? Number(val('regDependentsCount')) : null,
    emergency_name: val('regEmergencyName'), emergency_relation: val('regEmergencyRelation'), emergency_phone: val('regEmergencyPhone'),
  };

  const missing = [];
  if (!payload.username) missing.push('Username');
  if (!payload.email) missing.push('Email');
  if (!payload.password || payload.password.length < 8) missing.push('Kata Sandi (minimal 8 karakter)');
  if (!payload.full_name) missing.push('Nama Lengkap');
  if (!payload.nik || payload.nik.length !== 16) missing.push('NIK (harus 16 digit)');
  if (missing.length) { toast('Mohon lengkapi: ' + missing.join(', ')); return; }
  const pwConfirm = val('regPasswordConfirm');
  if (payload.password !== pwConfirm) { toast('Konfirmasi kata sandi tidak cocok'); return; }

  btn.disabled = true; btn.textContent = 'Memproses…';
  try {
    const result = await window.dataService.registerEmployee(payload);
    if (!result.ok) { toast('Pendaftaran gagal: ' + result.error, 'error'); return; }
    toast('Pendaftaran terkirim! Menunggu persetujuan HRD/Pimpinan/Super Admin sebelum akun bisa dipakai masuk.');
    document.getElementById('registerForm')?.reset();
    showLoginScreenFromRegister();
  } finally {
    btn.disabled = false; btn.textContent = 'Daftar';
  }
}

export async function applyLoggedInProfile(profile) {
  state.currentProfile = profile;
  document.getElementById('sidebarAvatar').textContent = initials(profile.full_name);
  document.getElementById('sidebarName').textContent = profile.full_name;
  document.getElementById('sidebarRole').textContent = ROLE_LABEL[profile.role] || profile.role;
  // BUG SEBELUMNYA: topbar (pojok kanan atas) tidak pernah di-update di sini
  // sama sekali — selalu menampilkan teks statis "Siti Hardiyanti / HRD
  // Staff" yang ditulis langsung di index.html sebagai placeholder desain,
  // apa pun akun yang sesungguhnya login. Dilaporkan user: "setiap membuka
  // akun pasti akan keluar akun siti hardiyanti".
  document.getElementById('topbarAvatar').textContent = initials(profile.full_name);
  document.getElementById('topbarName').textContent = profile.full_name;
  document.getElementById('topbarRole').textContent = ROLE_LABEL[profile.role] || profile.role;
  renderTopbarInstitutionHeader(); // logo+nama institusi topbar
  applyRoleGating(profile.role);
  refreshNotificationBadge();
  refreshEmployeeCountBadge(); // sengaja TIDAK di-await, sama seperti app.js asli (fire-and-forget)
  startNotificationPolling();
  // Auto logout kalau tidak ada aktivitas selama 10 menit (lihat
  // idle-timeout.js). Dipasang di sini (bukan hanya di salah satu
  // cabang self-service/normal di bawah) supaya berlaku untuk SEMUA
  // role, apa pun jalur yang diambil setelah ini.
  startIdleTimer(async () => {
    await doLogout();
    toast('Anda keluar otomatis karena tidak ada aktivitas selama 10 menit', 'error');
  });

  // Mode swalayan (SELF_SERVICE_ROLES — lihat definisi di constants.js):
  // pegawai hanya boleh melihat profilnya sendiri, tanpa nav aplikasi apa
  // pun. topbarRole (identitas jabatan/role) disembunyikan, topbarName
  // menampilkan EMAIL (lihat override di bawah). goto() dan
  // viewEmployee() diberi pagar keras (lihat masing-masing) supaya
  // navigasi/permintaan data lewat console/DevTools ke layar atau
  // pegawai lain tetap dipentalkan balik ke profil sendiri — bukan
  // cuma disembunyikan di UI.
  if (SELF_SERVICE_ROLES.includes(profile.role)) {
    document.body.classList.add('self-service-mode');
    // Diubah lagi atas permintaan pengguna (2026-08-25): topbarName kembali
    // menampilkan EMAIL (bukan nama) khusus mode swalayan -- membalik
    // perubahan R7 di atas. Nama pegawai tetap tampil di tempat lain
    // (kartu profil kiri/kanan, panel Cek) jadi tidak hilang total, cuma
    // topbar kanan atas yang sekarang identitas login (email).
    document.getElementById('topbarName').textContent = profile.email || profile.full_name;
    if (profile.employee_id) {
      await viewEmployee(profile.employee_id);
      // Widget "Aksi Hari Ini" & tab Kehadiran cuma terisi kalau tab itu
      // sempat dibuka -- tanpa panggilan eksplisit ini, grup Keluar/Check-in
      // di topbar (#topbarQuickActions, tampil sejak login) akan tetap
      // menunjukkan status kosong/lama sampai pengguna kebetulan membuka
      // tab Kehadiran atau Ringkasan lebih dulu.
      await renderProfileTodayAttendance();
    } else {
      // Kondisi tak terduga: role swalayan tanpa employee_id tertaut.
      // Jangan jatuh ke Dashboard admin — itu justru membocorkan nav.
      toast('Akun Anda belum tertaut ke data pegawai. Hubungi HRD.');
    }
    return;
  }
  document.body.classList.remove('self-service-mode');
  goto('app-dashboard');
}

// PERBAIKAN: badge jumlah pegawai di menu sidebar sebelumnya HANYA
// diperbarui saat halaman Pegawai (app-employees) benar-benar dibuka —
// sebelum itu, tetap menampilkan angka statis "13" yang ditulis langsung
// di index.html sebagai placeholder desain awal, apa pun jumlah pegawai
// sesungguhnya. Dilaporkan user: badge bilang 13, tapi Struktur
// Organisasi cuma menampilkan 1 pegawai — padahal itu pegawai satu-
// satunya yang memang ada, cuma badge-nya yang bohong. Dipanggil di sini
// (segera setelah login) supaya akurat dari awal, bukan cuma setelah
// halaman Pegawai sempat dibuka.
export async function refreshEmployeeCountBadge() {
  try {
    if (!state.employeesCache.length) state.employeesCache = await window.dataService.listEmployees();
    const badgeCount = document.querySelector('[data-app-goto="app-employees"] .badge-count');
    if (badgeCount) badgeCount.textContent = state.employeesCache.length;
  } catch (e) {
    // Diam-diam gagal — badge tetap menampilkan angka lama daripada
    // memblokir alur login karena kegagalan hal yang bukan kritikal.
    console.error('Gagal memuat jumlah pegawai untuk badge sidebar:', e);
  }
}

export function applyRoleGating(role) {
  // Label sidebar "Cuti" -> "Persetujuan Cuti" khusus akun Pimpinan
  // (bukan role lain) — Pimpinan hanya memakai layar ini untuk
  // menyetujui pengajuan tahap kedua, bukan mengajukan cuti sendiri.
  const leaveNavLabel = document.querySelector('[data-app-goto="app-leave"] span:not(.badge-count)');
  if (leaveNavLabel) leaveNavLabel.textContent = role === 'pimpinan' ? 'Persetujuan Cuti' : 'Cuti';

  const usersNav = document.querySelector('[data-app-goto="app-users"]');
  if (usersNav) usersNav.style.display = REGISTRATION_APPROVAL_ROLES.includes(role) ? '' : 'none';
  const dmsNav = document.querySelector('[data-app-goto="app-dms"]');
  if (dmsNav) dmsNav.style.display = DMS_ACCESS_ROLES.includes(role) ? '' : 'none';
  const hrCostNav = document.querySelector('[data-app-goto="app-hr-cost"]');
  if (hrCostNav) hrCostNav.style.display = HR_COST_ACCESS_ROLES.includes(role) ? '' : 'none';
  const execDashNav = document.querySelector('[data-app-goto="app-exec-dashboard"]');
  const canSeeExec = EXEC_DASHBOARD_ROLES.includes(role);
  if (execDashNav) execDashNav.style.display = canSeeExec ? '' : 'none';
  // Regrouping menu (lihat catatan): grup "Eksekutif" cuma berisi 1 item
  // (Ringkasan Eksekutif). Kalau item itu disembunyikan, label grupnya
  // juga harus ikut disembunyikan -- kalau tidak, role selain
  // super_admin/pimpinan akan melihat judul grup kosong tanpa isi.
  const navGroupEksekutif = document.getElementById('navGroupEksekutif');
  if (navGroupEksekutif) navGroupEksekutif.style.display = canSeeExec ? '' : 'none';

  const auditNav = document.querySelector('[data-app-goto="app-audit"]');
  if (auditNav) auditNav.style.display = AUDIT_ROLES.includes(role) ? '' : 'none';

  // "Database Santri" (schema_110, 2026-09-01) -- modul berdiri sendiri,
  // lihat student-database.js.
  const studentDbNav = document.getElementById('navStudentDatabase');
  if (studentDbNav) studentDbNav.style.display = STUDENT_DB_ACCESS_ROLES.includes(role) ? '' : 'none';

  const canAddEmployee = ADD_EMPLOYEE_ROLES.includes(role);
  document.querySelectorAll('[data-requires-add-employee]').forEach(el => {
    el.style.display = canAddEmployee ? '' : 'none';
  });

  // Tab "Kepegawaian" di profil pegawai (jabatan/unit/departemen/atasan/
  // status/kontrak/tanggal bergabung) — sebelumnya SELALU tampil untuk
  // siapa pun yang buka profil, dengan field-nya cuma di-disable untuk
  // yang tidak berwenang (lihat viewEmployee()). Sekarang tab itu SENDIRI
  // disembunyikan total untuk role di luar EDIT_EMPLOYEE_ROLES — bukan
  // cuma field di dalamnya — termasuk saat melihat profil sendiri.
  const tabEmployment = document.getElementById('tabEmployment');
  if (tabEmployment) tabEmployment.style.display = EDIT_EMPLOYEE_ROLES.includes(role) ? '' : 'none';

  // Label tab "Penggajian" di profil — untuk role SELF_SERVICE_ROLES
  // (pegawai & guru; role lain seperti kepala_bagian/hrd/dst tetap
  // "Penggajian") diganti jadi "Ihsan", sesuai istilah internal
  // institusi (terlihat di mockup awal sebagai "Ihsan (gaji)"). Isi/
  // fungsi tab TIDAK berubah — cuma labelnya.
  const tabPayrollLabel = document.getElementById('tabPayrollLabel');
  if (tabPayrollLabel) tabPayrollLabel.textContent = SELF_SERVICE_ROLES.includes(role) ? 'Ihsan' : 'Penggajian';
}

export async function doLogin() {
  const btn = document.getElementById('loginSubmitBtn');
  const idVal = document.getElementById('loginId').value.trim();
  const pwVal = document.getElementById('loginPw').value.trim();
  if (!idVal || !pwVal) { toast('Mohon lengkapi username/email dan kata sandi'); return; }

  const mode = document.getElementById('loginId').type === 'text' ? 'username' : 'email';

  btn.disabled = true; btn.textContent = 'Memproses…';
  try {
    const result = await window.dataService.signIn({ idValue: idVal, password: pwVal, mode });
    if (!result.ok) { toast(result.error, 'error'); return; }
    await applyLoggedInProfile(result.profile);
  } finally {
    btn.disabled = false; btn.textContent = 'Masuk';
  }
}

export async function doLogout() {
  // PERBAIKAN: sebelumnya kalau dataService.signOut() gagal (mis. sesi
  // sudah invalid di server, gangguan jaringan sesaat), await di sini
  // akan throw dan MENGHENTIKAN eksekusi SEBELUM currentProfile=null dan
  // showLoginScreen() sempat jalan — dari sudut pandang pengguna, tombol
  // "Keluar" terlihat "tidak berfungsi" (menu tertutup tapi tetap di
  // dashboard). Dibungkus try/finally supaya pengguna SELALU kembali ke
  // layar login, apa pun hasil signOut() di sisi server.
  try {
    await window.dataService.signOut();
  } catch (e) {
    console.error('signOut gagal, tetap keluarkan pengguna dari sisi klien:', e);
  } finally {
    state.currentProfile = null;
    stopNotificationPolling();
    stopIdleTimer();
    closeSidebarActionsMenu();
    showLoginScreen();
  }
}

export function openChangePasswordModal() {
  const f = document.getElementById('changePasswordForm');
  if (f) f.reset();
  openModal('changePasswordModal');
}

export async function submitChangePassword() {
  const newPw = document.getElementById('cpNewPassword').value;
  const confirmPw = document.getElementById('cpConfirmPassword').value;
  if (!newPw || newPw.length < 8) { toast('Kata sandi baru minimal 8 karakter'); return; }
  if (newPw !== confirmPw) { toast('Konfirmasi kata sandi tidak cocok'); return; }

  const btn = document.getElementById('cpSubmitBtn');
  btn.disabled = true; btn.textContent = 'Menyimpan…';
  try {
    const result = await window.dataService.changePassword(newPw);
    if (!result.ok) { toast('Gagal mengubah kata sandi: ' + result.error, 'error'); return; }
    closeModal('changePasswordModal');
    toast('Kata sandi berhasil diubah');
  } finally {
    btn.disabled = false; btn.textContent = 'Simpan Kata Sandi';
  }
}
