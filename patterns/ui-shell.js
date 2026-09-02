/* ============================================================
   ui-shell.js — Navigasi SPA (goto), sidebar, modal (+ a11y focus
   trap), toast, notifikasi (dropdown + popup real-time + Web Push),
   pencarian global, dan parser delegated event handler
   (data-onclick/data-onchange/data-oninput -> window[fn]).
   Dipindahkan dari app.js baris 7942-8021 & 8610-9260 (P3.1 Tahap 3).

   TIDAK termasuk di sini (sengaja): wiring DOMContentLoaded/listener
   global (dulu app.js baris 9043-9314) -- itu tugas main.js di tahap
   TERAKHIR migrasi, karena baru bisa ditulis setelah SEMUA modul lain
   selesai dipindah (main.js perlu tahu daftar lengkap fungsi yang
   harus didaftarkan ke window untuk data-onclick/data-onchange).

   STATUS TRANSISI -- BACA SEBELUM MENGUBAH: sama seperti auth.js/
   employees.js, lihat komentar di sana untuk penjelasan pola
   `window.fn(...)`. goto() KHUSUSNYA akan punya BANYAK referensi
   window.fn -- itu fungsi "hub" yang memanggil render tiap layar,
   wajar baru bersih total di tahap paling akhir migrasi.
   ============================================================ */

import { state } from './state.js';
import { SELF_SERVICE_ROLES, REGISTRATION_APPROVAL_ROLES, DMS_ACCESS_ROLES, HR_COST_ACCESS_ROLES, EXEC_DASHBOARD_ROLES, AUDIT_ROLES, ADD_EMPLOYEE_ROLES, STUDENT_DB_ACCESS_ROLES } from './constants.js';
import { escapeHtml, formatDate, friendlyLoadError } from './utils.js';
import { saveEmployeeChanges, renderEmployeeTable } from './employees.js'; // P3.1 Tahap 19 -- circular import baru (employees.js sekarang juga import toast/openModal/closeModal dari sini, plus viewEmployee dari employee-profile.js yang JUGA import dari sini -- rantai 3-modul), aman dengan cara yang sama seperti pola Tahap 8/10/11/12/13: tidak ada pemanggilan di top-level modul manapun dalam rantai ini.
import { viewEmployee } from './employee-profile.js';
import { renderOrgChart } from './org-chart.js';
import { renderAttendanceScreen } from './attendance.js';
import { renderPerformanceScreen } from './performance.js';
import { renderPayrollScreen } from './payroll.js';
import { renderSettingsScreen } from './settings.js';
import { renderLeaveScreen } from './leave.js'; // P3.1 Tahap 11 -- circular import baru (leave.js juga import toast/openModal/closeModal dari sini), aman: tidak ada pemanggilan di top-level modul manapun, sama seperti pola Tahap 8/10.
import { renderDashboard, renderHrCostDashboard, renderExecutiveDashboard } from './dashboard.js'; // P3.1 Tahap 12 -- 3 window.fn dibersihkan sekaligus (bukan cuma 1 seperti dugaan awal dokumen migrasi), dashboard.js TIDAK import apa pun dari ui-shell.js sehingga tidak ada circular import baru di sini.
import { renderReportsScreen } from './reports.js'; // P3.1 Tahap 13 -- circular import baru (reports.js juga import toast dari sini), aman: toast() hanya dipanggil di dalam fungsi runReports(), tidak ada pemanggilan di top-level modul manapun, sama seperti pola Tahap 8/10/11.
import { renderUserTable } from './users-admin.js'; // P3.1 Tahap 14 -- circular import baru (users-admin.js juga import toast/openModal/closeModal dari sini), aman dengan cara yang sama seperti reports.js di atas.
import { renderAuditLog } from './audit-log.js'; // P3.1 Tahap 14 -- circular import baru (audit-log.js juga import toast/openModal dari sini), aman dengan cara yang sama.
import { renderDmsTable } from './dms.js'; // P3.1 Tahap 16 -- circular import baru (dms.js juga import toast/openModal/closeModal dari sini), aman dengan cara yang sama seperti tahap-tahap sebelumnya.
import { renderStudentDatabaseScreen } from './student-database.js'; // 2026-09-01, modul baru "Database Santri" (schema_110) -- circular import baru (student-database.js juga import toast/openModal/closeModal dari sini), aman dengan pola yang sama seperti dms.js/leave.js di atas: tidak ada pemanggilan di top-level modul manapun.

/* ============================================================
   NAVIGASI (SPA sederhana antar layar dalam satu halaman)
   ============================================================ */
window.addEventListener('hashchange', () => {
  if (state.isNavigatingHash) return;
  let hash = window.location.hash.replace('#/', '');
  if (!hash) hash = 'app-dashboard';
  goto(hash, true);
});

export function goto(id, skipPush = false) {
  // Pagar keras mode swalayan: kalau nav disembunyikan lewat CSS tapi
  // seseorang memanggil goto('app-employees') dsb langsung dari console,
  // paksa tetap ke app-profile. 'app-profile' sendiri selalu diizinkan
  // karena itulah satu-satunya layar yang boleh dilihat role ini -
  // viewEmployee() (dipanggil dari applyLoggedInProfile) juga lewat sini.
  if (SELF_SERVICE_ROLES.includes(state.currentProfile?.role) && id !== 'app-profile') {
    toast('Akun ini hanya dapat mengakses halaman profil sendiri');
    id = 'app-profile';
  }
  document.getElementById('screen-login').classList.remove('active');
  document.getElementById('appShell').classList.add('active');
  document.querySelectorAll('.app-screen').forEach(s => { s.style.display = 'none'; });
  const target = document.getElementById(id);
  if (target) target.style.display = 'block';
  document.querySelectorAll('[data-app-goto]').forEach(n => n.classList.toggle('active', n.dataset.appGoto === id));

  const crumbs = {
    'app-dashboard': 'Dashboard',
    'app-employees': 'Pegawai <span>›</span> <b>Daftar Pegawai</b>',
    'app-orgchart': 'Pegawai <span>›</span> <b>Struktur Organisasi</b>',
    'app-attendance': 'Kehadiran',
    'app-performance': 'Kinerja',
    'app-payroll': 'Penggajian',
    'app-reports': 'Laporan',
    'app-settings': 'Pengaturan',
    'app-leave': 'Cuti',
    'app-calendar': 'Kalender',
    'app-disciplinary': 'Catatan Disiplin',
    'app-profile': 'Pegawai <span>›</span> <b>Detail Pegawai</b>',
    'app-users': 'Administrasi <span>›</span> <b>Manajemen Akses Pengguna</b>',
    'app-dms': 'Administrasi <span>›</span> <b>Manajemen Dokumen</b>',
    'app-hr-cost': 'Administrasi <span>›</span> <b>Analisis Biaya SDM</b>',
    'app-audit': 'Administrasi <span>›</span> <b>Audit Log</b>',
    'app-student-database': 'Database Santri'
  };
  const crumbEl = document.getElementById('breadcrumb');
  if (crumbEl) crumbEl.innerHTML = crumbs[id] || '';
  closeMobileSidebar();
  window.scrollTo({ top: 0, behavior: 'instant' });

  // TODO: seluruh render*() di bawah pindah ke `import` begitu modul
  // masing-masing (dashboard.js, reports.js) selesai dipindah.
  // renderCalendar/renderDisciplinary TETAP window.fn selamanya --
  // keduanya didefinisikan di file classic script TERPISAH
  // (calendarFeature.js/disciplinaryFeature.js), di luar cakupan
  // docs/MIGRATION_ES_MODULES.md sepenuhnya.
  // PEMBARUAN (P3.1 Tahap 10): renderEmployeeTable (employees.js,
  // Tahap 2), renderAttendanceScreen (attendance.js, Tahap 10),
  // renderPerformanceScreen (performance.js, Tahap 8),
  // renderPayrollScreen (payroll.js, Tahap 9), renderSettingsScreen
  // (settings.js, Tahap 7) SUDAH di-cross-import langsung --
  // renderEmployeeTable KHUSUSNYA sempat terlewat sejak Tahap 2
  // (modulnya sudah lama selesai tapi baris ini baru dibereskan
  // sekarang), pola backlog yang sama seperti auth.js di Tahap 7.
  // PEMBARUAN (P3.1 Tahap 11): renderLeaveScreen (leave.js) SUDAH
  // di-cross-import juga.
  if (id === 'app-dashboard') renderDashboard();
  if (id === 'app-employees') renderEmployeeTable();
  if (id === 'app-attendance') renderAttendanceScreen();
  if (id === 'app-performance') renderPerformanceScreen();
  if (id === 'app-payroll') renderPayrollScreen();
  if (id === 'app-reports') renderReportsScreen();
  if (id === 'app-settings') renderSettingsScreen();
  if (id === 'app-leave') renderLeaveScreen();
  if (id === 'app-calendar') window.renderCalendar();
  if (id === 'app-disciplinary') window.renderDisciplinary();
  if (id === 'app-orgchart') {
    // Navigasi umum (sidebar dll) selalu kembali ke tampilan default
    // 'supervisor' (data pegawai asli). Nilai 'reference' hanya dipakai
    // saat tombol "Bagan Organisasi" diklik secara eksplisit
    // (lihat showOrgSchemeView), bukan status permanen.
    const basisSelect = document.getElementById('orgChartBasisSelect');
    if (basisSelect) basisSelect.value = 'supervisor';
    renderOrgChart(); // org-chart.js selesai sejak Tahap 5, sempat terlewat juga (lihat catatan di atas)
  }
  if (id === 'app-users') {
    if (!REGISTRATION_APPROVAL_ROLES.includes(state.currentProfile?.role)) { toast('Halaman ini khusus admin'); goto('app-dashboard'); return; }
    renderUserTable();
  }
  if (id === 'app-dms') {
    if (!DMS_ACCESS_ROLES.includes(state.currentProfile?.role)) { toast('Halaman ini khusus Super Admin, HRD, Pimpinan, Bendahara Umum, atau Sekretaris'); goto('app-dashboard'); return; }
    renderDmsTable();
  }
  if (id === 'app-hr-cost') {
    if (!HR_COST_ACCESS_ROLES.includes(state.currentProfile?.role)) { toast('Halaman ini khusus Super Admin, HRD, Pimpinan, atau Bendahara Umum'); goto('app-dashboard'); return; }
    renderHrCostDashboard();
  }
  if (id === 'app-exec-dashboard') {
    if (!EXEC_DASHBOARD_ROLES.includes(state.currentProfile?.role)) { toast('Halaman ini khusus Pimpinan/Super Admin'); goto('app-dashboard'); return; }
    renderExecutiveDashboard();
  }
  if (id === 'app-audit') {
    if (!AUDIT_ROLES.includes(state.currentProfile?.role)) { toast('Halaman ini khusus Super Admin/Pimpinan'); goto('app-dashboard'); return; }
    renderAuditLog();
  }
  if (id === 'app-student-database') {
    if (!STUDENT_DB_ACCESS_ROLES.includes(state.currentProfile?.role)) { toast('Halaman ini khusus Super Admin/HRD'); goto('app-dashboard'); return; }
    renderStudentDatabaseScreen();
  }
}

/* ============================================================
   SIDEBAR (desktop collapse + drawer mobile + menu aksi)
   ============================================================ */
export function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  sb.classList.toggle('collapsed');
  const collapsed = sb.classList.contains('collapsed');
  const icon = document.getElementById('collapseIcon');
  if (icon) icon.innerHTML = collapsed ? '<path d="M9 6l6 6-6 6"/>' : '<path d="M15 6l-6 6 6 6"/>';
  const lbl = document.getElementById('collapseLbl');
  if (lbl) lbl.textContent = collapsed ? '' : 'Ciutkan';
}

// Drawer sidebar mobile (beda dari toggleSidebar() di atas — itu ciutkan/
// lebarkan sidebar DESKTOP, ini buka/tutup drawer overlay di HP).
export function toggleMobileSidebar() {
  const profileScreen = document.getElementById('app-profile');
  const onProfileScreen = !!profileScreen && profileScreen.style.display !== 'none';
  const drawer = document.getElementById(onProfileScreen ? 'profileSidebar' : 'sidebar');
  drawer?.classList.toggle('mobile-open');
  document.getElementById('mobileBackdrop')?.classList.toggle('show');
}
export function closeMobileSidebar() {
  document.getElementById('sidebar')?.classList.remove('mobile-open');
  document.getElementById('profileSidebar')?.classList.remove('mobile-open');
  document.getElementById('mobileBackdrop')?.classList.remove('show');
}
// Audit UI/UX 2026-08-24: drawer mobile bisa ditutup lewat Escape juga
// (bukan cuma tap backdrop/tombol) -- konsisten dengan modal.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const backdropOpen = document.getElementById('mobileBackdrop')?.classList.contains('show');
  if (backdropOpen) closeMobileSidebar();
});
export function toggleSidebarActionsMenu() { document.getElementById('sbActionsMenu')?.classList.toggle('show'); }
export function closeSidebarActionsMenu() { document.getElementById('sbActionsMenu')?.classList.remove('show'); }

// KOREKSI KECIL (P3.1 Tahap 5): goToMyProfile() awalnya ada di rentang
// baris app.js yang direncanakan jadi org-chart.js, tapi ternyata murni
// navigasi sidebar (dipanggil dari tombol "Profil Saya" di menu Aksi,
// lihat data-onclick di index.html), bukan logic struktur organisasi --
// dipindah ke sini alih-alih org-chart.js sebelum kadung salah tempat,
// pola koreksi yang sama seperti goto() di Tahap 3.
// BUG DIPERBAIKI (2026-08-24, dilaporkan super_admin "Firdausaiasisten"
// dibawa ke profil pegawai lain saat klik Profil Saya): tombol "Profil
// Saya" di menu Aksi sidebar sebelumnya cuma memanggil goto('app-profile')
// -- itu HANYA mengganti layar yang tampil, TIDAK mengisi ulang data ke
// layar itu. Untuk role non-swalayan (super_admin/hrd/pimpinan/dst) yang
// bebas membuka profil siapa pun lewat daftar pegawai, layar app-profile
// terus menyimpan data pegawai TERAKHIR yang dibuka (window.__activeEmployeeId)
// sampai ada panggilan viewEmployee() baru. Jadi kalau admin baru saja
// membuka profil pegawai lain lalu klik "Profil Saya", yang tampil (dan
// akan ikut ke-edit bila disimpan) adalah profil pegawai itu, BUKAN
// profil admin sendiri -- persis laporan pengguna. Role swalayan
// (pegawai/guru/tendik) tidak kena bug ini karena viewEmployee() sudah
// dipagar untuk selalu memaksa employee_id sendiri (lihat pagar di
// viewEmployee di employee-profile.js), tapi role lain tidak. Diperbaiki
// dengan fungsi terpisah ini yang EKSPLISIT memanggil
// viewEmployee(currentProfile.employee_id) setiap kali "Profil Saya"
// diklik, dipakai SEMUA role (bukan cuma goto).
export function goToMyProfile() {
  if (state.currentProfile?.employee_id) {
    viewEmployee(state.currentProfile.employee_id);
  } else {
    // Akun tanpa employee_id tertaut (mis. akun sistem murni) -- jangan
    // diam-diam menampilkan profil pegawai terakhir yang dibuka (itu
    // justru bug yang sama). Kasih tahu jelas, jangan pindah layar.
    toast('Akun ini belum tertaut ke data pegawai. Hubungi Super Admin/HRD untuk menautkan akun ke data pegawai.');
  }
}

// Menu "+" di topbar — isinya dibangun dinamis sesuai peran, dipakai ID
// terpisah (BUKAN class sh-actions-wrap yang sama dengan tombol Aksi di
// sidebar) supaya tidak bentrok dengan listener klik-di-luar yang memakai
// querySelector (cuma ambil elemen PERTAMA yang cocok class-nya).
export function toggleQuickActionMenu() {
  const menu = document.getElementById('quickActionMenu');
  if (!menu) return;
  const items = [];
  if (ADD_EMPLOYEE_ROLES.includes(state.currentProfile?.role)) {
    items.push({ label: '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>&nbsp; Tambah Pegawai', onclick: 'closeQuickActionMenu();openAddEmployeeModal();' });
  }
  if (state.currentProfile?.employee_id) {
    items.push({ label: '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M8 2v3" /><path d="M16 2v3" /><rect x="3" y="3" rx="2" /><path d="M3 9h18" /></svg>&nbsp; Ajukan Cuti', onclick: 'closeQuickActionMenu();openLeaveRequestModal();' });
  }
  // Kalau Aksi Cepat cuma punya SATU pilihan (kasus umum role swalayan:
  // cuma "Ajukan Cuti"), jalankan langsung tanpa buka dropdown dulu --
  // dropdown untuk 1 pilihan cuma menambah 1 tap tanpa guna. Kalau nanti
  // role swalayan dapat aksi cepat kedua, dropdown otomatis kembali
  // muncul karena kondisi ini gagal (items.length !== 1).
  if (items.length === 1) {
    runInlineHandlerCode(items[0].onclick);
    return;
  }
  if (!menu.classList.contains('show')) {
    menu.innerHTML = items.map(it => `<button data-onclick="${it.onclick}">${it.label}</button>`).join('')
      || `<div style="padding:8px 11px;font-size:12px;color:var(--ink-500);">Tidak ada aksi cepat untuk peran Anda</div>`;
  }
  menu.classList.toggle('show');
}
export function closeQuickActionMenu() { document.getElementById('quickActionMenu')?.classList.remove('show'); }

/* ============================================================
   PENCARIAN GLOBAL — topbar "Cari pegawai, ID, jabatan…". Live-search
   di employeesCache (nama/employee_code/jabatan), klik hasil ->
   viewEmployee(). SENGAJA tidak mencakup dokumen: listDocuments()
   backend cuma bisa per-pegawai (butuh employeeId), belum ada endpoint
   pencarian dokumen lintas-pegawai -- daripada janji fitur yang
   setengah jalan, cakupan dibatasi ke pegawai saja dulu.
   ============================================================ */
export function globalSearchResults(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const pool = state.employeesCache.length ? state.employeesCache : [];
  return pool
    .filter(e =>
      (e.full_name || '').toLowerCase().includes(q) ||
      (e.employee_code || '').toLowerCase().includes(q) ||
      (e.position || '').toLowerCase().includes(q)
    )
    .slice(0, 8);
}

export function renderGlobalSearchMenu(query) {
  const menu = document.getElementById('globalSearchMenu');
  if (!menu) return;
  const q = query.trim();
  if (!q) { menu.classList.remove('show'); menu.innerHTML = ''; return; }
  const results = globalSearchResults(q);
  menu.innerHTML = results.length
    ? results.map(e => `
      <button data-onclick="closeGlobalSearchMenu();viewEmployee('${e.id}');" style="display:flex;flex-direction:column;align-items:flex-start;gap:1px;">
        <span>${escapeHtml(e.full_name)}</span>
        <span style="font-size:11px;color:var(--ink-500);font-weight:400;">${escapeHtml(e.employee_code || '—')}${e.position ? ' · ' + escapeHtml(e.position) : ''}</span>
      </button>`).join('')
    : `<div style="padding:8px 11px;font-size:12px;color:var(--ink-500);">Tidak ditemukan</div>`;
  menu.classList.add('show');
}

export async function handleGlobalSearchInput(value) {
  clearTimeout(state.globalSearchDebounce);
  state.globalSearchDebounce = setTimeout(async () => {
    if (!state.employeesCache.length) {
      try { state.employeesCache = await window.dataService.listEmployees(); } catch (e) { /* diam saja, hasil akan kosong */ }
    }
    renderGlobalSearchMenu(value);
  }, 150);
}

export function closeGlobalSearchMenu() {
  const menu = document.getElementById('globalSearchMenu');
  if (menu) { menu.classList.remove('show'); }
}

/* ============================================================
   NOTIFIKASI — dropdown bel di topbar. Isi dibuat backend lewat trigger
   (schema_18) saat status Cuti/Kinerja berubah — di sini murni
   tampilkan & tandai-baca, TIDAK ada logic pembuatan notifikasi.
   ============================================================ */
const NOTIF_TYPE_ICON = { leave_request: '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M8 2v3" /><path d="M16 2v3" /><rect x="3" y="3" rx="2" /><path d="M3 9h18" /></svg>', performance_review: '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M5 21v-6" /><path d="M12 21V3" /><path d="M19 21V9" /></svg>', payroll: '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></svg>', system: '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>' };

export async function refreshNotificationBadge() {
  const dot = document.getElementById('notifDot');
  if (!dot) return;
  try {
    const count = await window.dataService.getUnreadNotificationCount();
    dot.style.display = count > 0 ? '' : 'none';
  } catch (e) { /* diam saja — badge bukan hal kritis */ }
}

export async function toggleNotificationMenu() {
  const menu = document.getElementById('notifMenu');
  if (!menu) return;
  if (menu.classList.contains('show')) { closeNotificationMenu(); return; }
  menu.classList.add('show');
  await renderNotificationMenu();
}
export function closeNotificationMenu() { document.getElementById('notifMenu')?.classList.remove('show'); }

export async function renderNotificationMenu() {
  const menu = document.getElementById('notifMenu');
  if (!menu) return;
  menu.innerHTML = '<div style="padding:14px;color:var(--ink-500);font-size:13px;">Memuat…</div>';

  // Baris "Aktifkan Notifikasi Push" -- dirender terpisah dari daftar
  // notifikasi supaya tetap muncul walau daftar kosong/gagal dimuat.
  // Disembunyikan total kalau browser tidak dukung ATAU VAPID_PUBLIC_KEY
  // belum dikonfigurasi (lihat config.js) -- lihat dataService.isPushSupported().
  let pushRowHtml = '';
  if (window.dataService.isPushSupported && window.dataService.isPushSupported()) {
    const status = await window.dataService.getPushSubscriptionStatus();
    pushRowHtml = status === 'subscribed'
      ? `<div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:8px;">
           <span style="font-size:11.5px;color:var(--ink-500);"><svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg> Notifikasi push aktif di perangkat ini</span>
           <button class="btn btn-ghost btn-sm" style="font-size:11px;" data-onclick="disablePushNotificationUI()">Matikan</button>
         </div>`
      : `<div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:8px;">
           <span style="font-size:11.5px;color:var(--ink-500);">Aktifkan notifikasi di perangkat ini?</span>
           <button class="btn btn-primary btn-sm" style="font-size:11px;" data-onclick="enablePushNotificationUI()">Aktifkan</button>
         </div>`;
  }

  try {
    const notifs = await window.dataService.listNotifications(20);
    if (!notifs.length) {
      menu.innerHTML = pushRowHtml + '<div style="padding:14px;color:var(--ink-500);font-size:13px;">Tidak ada notifikasi.</div>';
      return;
    }
    const unreadCount = notifs.filter(n => !n.is_read).length;
    menu.innerHTML = pushRowHtml + `
      ${unreadCount ? `<div style="padding:8px 12px;border-bottom:1px solid var(--border);text-align:right;"><button class="btn btn-ghost btn-sm" style="font-size:11px;" data-onclick="markAllNotificationsReadUI()">Tandai semua dibaca</button></div>` : ''}
      ${notifs.map(n => `
        <div data-onclick="openNotification('${n.id}', '${n.link_screen || ''}')"
             style="padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;gap:8px;align-items:flex-start;${n.is_read ? 'opacity:.6;' : 'background:var(--surface-1);'}">
          <span style="font-size:16px;">${NOTIF_TYPE_ICON[n.type] || '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg>'}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:${n.is_read ? '500' : '700'};font-size:13px;">${escapeHtml(n.title)}</div>
            <div style="font-size:12px;color:var(--ink-500);margin-top:2px;">${escapeHtml(n.message)}</div>
            <div style="font-size:11px;color:var(--ink-500);margin-top:4px;">${formatDate(n.created_at)}</div>
          </div>
          ${!n.is_read ? '<span style="width:7px;height:7px;border-radius:50%;background:var(--danger-fg);flex-shrink:0;margin-top:5px;"></span>' : ''}
        </div>`).join('')}
    `;
  } catch (e) {
    menu.innerHTML = pushRowHtml + `<div style="padding:14px;color:var(--danger-fg);font-size:13px;">${escapeHtml(friendlyLoadError(e))}</div>`;
  }
}

export async function enablePushNotificationUI() {
  if (!state.currentProfile?.id) { toast('Gagal mengaktifkan notifikasi: profil belum dimuat.'); return; }
  const result = await window.dataService.subscribeToPush(state.currentProfile.id);
  if (!result.ok) { toast(result.error, 'error'); renderNotificationMenu(); return; }
  toast('Notifikasi push diaktifkan di perangkat ini.');
  renderNotificationMenu();
}
export async function disablePushNotificationUI() {
  await window.dataService.unsubscribeFromPush();
  toast('Notifikasi push dimatikan di perangkat ini.');
  renderNotificationMenu();
}

export async function openNotification(id, linkScreen) {
  await window.dataService.markNotificationRead(id);
  closeNotificationMenu();
  refreshNotificationBadge();
  if (linkScreen) goto(linkScreen);
}
export async function markAllNotificationsReadUI() {
  await window.dataService.markAllNotificationsRead();
  refreshNotificationBadge();
  renderNotificationMenu();
}

/* ============================================================
   POPUP NOTIFIKASI REAL-TIME (gaya WhatsApp) -- selagi app TERBUKA.
   Beda dari Web Push (schema_68, kerja walau app tertutup/tab lain):
   ini murni di sisi klien, polling ringan tiap NOTIF_POLL_INTERVAL_MS
   selama tab ini terbuka & pengguna sudah login, lalu tampilkan kartu
   melayang di pojok kanan atas untuk notifikasi yang BENAR-BENAR baru
   (dibuat SETELAH momen login sesi ini -- notifikasi lama yang belum
   dibaca dari sebelumnya TIDAK memicu popup ulang, cukup lewat badge
   bel seperti biasa, supaya tidak membanjiri layar begitu login).
   ============================================================ */
const NOTIF_POLL_INTERVAL_MS = 15000;

export function startNotificationPolling() {
  state.lastSeenNotifCreatedAt = new Date().toISOString();
  stopNotificationPolling();
  state.notifPollTimer = setInterval(pollForNewNotifications, NOTIF_POLL_INTERVAL_MS);
}
export function stopNotificationPolling() {
  if (state.notifPollTimer) { clearInterval(state.notifPollTimer); state.notifPollTimer = null; }
}

export async function pollForNewNotifications() {
  if (!state.currentProfile) return;
  try {
    const notifs = await window.dataService.listNotifications(10);
    const fresh = notifs.filter(n => n.created_at > state.lastSeenNotifCreatedAt).sort((a, b) => a.created_at < b.created_at ? -1 : 1);
    if (!fresh.length) return;
    state.lastSeenNotifCreatedAt = fresh[fresh.length - 1].created_at;
    fresh.forEach(showWaPopup);
    refreshNotificationBadge();
  } catch (e) { /* diam saja -- polling latar belakang, bukan aksi yang diminta pengguna */ }
}

export function showWaPopup(notif) {
  const stack = document.getElementById('waPopupStack');
  if (!stack) return;
  const card = document.createElement('div');
  card.className = 'wa-popup';
  card.setAttribute('data-onclick', `openNotification('${notif.id}', '${notif.link_screen || ''}');dismissWaPopup(this)`);
  card.innerHTML = `
    <div class="wa-popup-icon">${NOTIF_TYPE_ICON[notif.type] || '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg>'}</div>
    <div class="wa-popup-body">
      <div class="wa-popup-title">${escapeHtml(notif.title)}</div>
      <div class="wa-popup-msg">${escapeHtml(notif.message)}</div>
    </div>
    <button class="wa-popup-close" data-onclick="dismissWaPopup(this)" title="Tutup"><svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>
  `;
  stack.prepend(card); // terbaru di ATAS -- sama seperti notifikasi WA/HP
  setTimeout(() => dismissWaPopup(card), 8000);
}
export function dismissWaPopup(el) {
  const card = el.closest ? el.closest('.wa-popup') : el;
  if (!card || card.classList.contains('leaving')) return;
  card.classList.add('leaving');
  setTimeout(() => card.remove(), 220);
}

/* ============================================================
   PERUBAHAN BELUM DISIMPAN (indikator "unsaved") -- profil pegawai
   ============================================================ */
export function markUnsaved() {
  state.dirty = true;
  const ind = document.getElementById('unsavedIndicator');
  if (ind) ind.style.visibility = 'visible';
}
export function saveChanges() {
  state.dirty = false;
  const ind = document.getElementById('unsavedIndicator');
  if (ind) ind.style.visibility = 'hidden';
  saveEmployeeChanges(); // sudah ES module (employees.js), import langsung -- bukan window.fn
}
export function cancelEdit() {
  state.dirty = false;
  const ind = document.getElementById('unsavedIndicator');
  if (ind) ind.style.visibility = 'hidden';
  // Tab "Ringkasan" (summary) dihapus 2026-08-25 -- "attendance" (Kehadiran)
  // sekarang jadi tab default, jadi cancel edit kembali ke situ.
  document.querySelector('#profileTabs [data-tab="attendance"]')?.click();
}

/* ============================================================
   AKSESIBILITAS MODAL: fokus, focus trap, tutup via Escape
   ============================================================
   Ditambahkan audit 2026-08-23. Semua 34 modal-overlay di index.html
   berbagi struktur identik (.modal-overlay > .modal), jadi cukup
   ditangani terpusat di sini -- TIDAK perlu mengubah markup 34 modal
   satu per satu. Pola pemakaian di app.js selalu closeModal() dulu
   sebelum openModal() lain (lihat mis. openDeletePayrollPeriodConfirm),
   jadi hanya satu modal aktif dalam satu waktu -- _activeModalId cukup
   berupa satu variabel, bukan stack.
   ============================================================ */
function _getFocusableInModal(modalEl) {
  return Array.from(modalEl.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el => el.offsetParent !== null);
}
function _modalKeydownHandler(e) {
  if (!state._activeModalId) return;
  const overlay = document.getElementById(state._activeModalId);
  if (!overlay) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeModal(state._activeModalId);
    return;
  }
  if (e.key !== 'Tab') return;
  const modalEl = overlay.querySelector('.modal') || overlay;
  const focusable = _getFocusableInModal(modalEl);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
export function openModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  state._lastFocusedBeforeModal = document.activeElement;
  overlay.classList.add('show');
  state._activeModalId = id;
  const modalEl = overlay.querySelector('.modal') || overlay;
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  if (!modalEl.hasAttribute('tabindex')) modalEl.setAttribute('tabindex', '-1');
  const heading = modalEl.querySelector('.modal-head h3, h3, h2');
  if (heading) {
    if (!heading.id) heading.id = id + 'Title';
    modalEl.setAttribute('aria-labelledby', heading.id);
  }
  document.addEventListener('keydown', _modalKeydownHandler, true);
  // Fokus dipindah setelah render selesai (setTimeout 0) -- pemanggil
  // sering mengisi/merender konten modal (mis. textContent, innerHTML)
  // TEPAT SEBELUM memanggil openModal(id) pada baris berikutnya, jadi
  // query elemen focusable perlu menunggu microtask itu selesai.
  setTimeout(() => {
    const focusable = _getFocusableInModal(modalEl);
    (focusable[0] || modalEl).focus({ preventScroll: true });
  }, 0);
}
export function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.remove('show');
  if (state._activeModalId === id) {
    state._activeModalId = null;
    document.removeEventListener('keydown', _modalKeydownHandler, true);
  }
  if (state._lastFocusedBeforeModal && typeof state._lastFocusedBeforeModal.focus === 'function') {
    state._lastFocusedBeforeModal.focus({ preventScroll: true });
  }
  state._lastFocusedBeforeModal = null;
}

/* ============================================================
   TOAST
   ============================================================
   toast(msg, type) -- 'type' opsional, default tetap 'success' supaya
   SELURUH pemanggilan toast(msg) yang sudah ada (266 titik) tidak
   berubah tampilan tanpa disengaja. type:'error' baru dipasang secara
   eksplisit di titik-titik yang SECARA STRUKTURAL pasti jalur gagal
   (di dalam blok `if (!x.ok) { ... }` atau `catch (e) { ... }") --
   bukan ditebak dari kata kunci pesan, karena penamaan pesan tidak
   selalu konsisten (mis. beberapa penolakan izin tidak memakai kata
   "gagal" sama sekali).

   Perbaikan 2026-08-24 (tahap 2 dari audit UI/UX):
   1) role="status"/"alert" + aria-live -- SEBELUM ini toast tidak
      pernah diumumkan ke pembaca layar sama sekali (WCAG 4.1.3).
   2) durasi naik dari 3200ms tetap ke 5000/6000ms (error lebih lama
      karena pesannya sering lebih panjang, mis. error mentah dari
      Supabase), plus jeda otomatis saat kursor di atas toast dan
      tombol tutup manual -- toast lama tidak bisa dibaca ulang atau
      ditutup manual sama sekali.
   ============================================================ */
export function toast(msg, type) {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) { console.log(msg); return; }
  const isError = type === 'error';
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : ' success');
  t.setAttribute('role', isError ? 'alert' : 'status');
  t.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  t.innerHTML = '<span class="ic">' + (isError ? '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>' : '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M20 6 9 17l-5-5" /></svg>') + '</span>' +
    '<span class="msg">' + escapeHtml(msg) + '</span>' +
    '<button type="button" class="toast-close" aria-label="Tutup notifikasi" data-onclick="closeToast(this)"><svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>';
  wrap.appendChild(t);
  const duration = isError ? 6000 : 5000;
  let removeTimer = setTimeout(() => t.remove(), duration);
  t.addEventListener('mouseenter', () => clearTimeout(removeTimer));
  t.addEventListener('mouseleave', () => { removeTimer = setTimeout(() => t.remove(), 2000); });
}
// Dipanggil via data-onclick="closeToast(this)" pada tombol tutup toast
// -- BUKAN "this.closest('.toast').remove()" langsung di atribut,
// karena runInlineHandlerCode() cuma mem-parse SATU pemanggilan fungsi
// bernama (regex ^nama(...)$), bukan method chaining bebas; ditulis
// sebagai chaining akan lolos tanpa error tapi diam-diam tidak
// melakukan apa-apa, persis pola bug yang sudah beberapa kali
// didokumentasikan di sekitar fungsi ini.
export function closeToast(el) {
  const t = el && el.closest ? el.closest('.toast') : null;
  if (t) t.remove();
}

/* ============================================================
   DELEGATED EVENT HANDLER PARSER (CSP-safe pengganti onclick/onchange/
   oninput inline mentah) -- data-onclick/data-onchange/data-oninput
   ============================================================
   Added for CSP compliance (unsafe-inline removal). Parser dipecah
   per ';' lalu menjalankan tiap pemanggilan fungsi satu-satu; "return
   false" (dipakai murni untuk mencegah default <a href="#">) diabaikan
   karena e.preventDefault() sudah menggantikannya di listener 'click'
   (dipasang main.js, di luar cakupan modul ini).
   ============================================================ */
export function runInlineHandlerCode(code, e, target) {
  const statements = code.split(';').map(s => s.trim()).filter(s => s && s !== 'return false');
  for (const stmt of statements) {
    // parse function call e.g. navigate('home')
    const match = stmt.match(/^([a-zA-Z0-9_]+)\((.*)\)$/);
    if (match) {
      const funcName = match[1];
      const argsStr = match[2];
      if (typeof window[funcName] === 'function') {
        // parse args simply
        // PENTING: argsStr.trim() === '' berarti pemanggilan TANPA
        // argumen sama sekali (mis. closeModal()) -- itu SATU-SATUNYA
        // kasus yang harus menghasilkan array args kosong. Sebelumnya
        // dipakai .filter(s => s !== "") di akhir untuk menangani
        // kasus ini, tapi filter itu ikut membuang argumen STRING
        // KOSONG YANG DISENGAJA di tengah pemanggilan multi-argumen
        // (mis. openEventModal(containerId, '', eventId) -- dateStr
        // sengaja dikosongkan supaya mode "edit" terpakai, bukan
        // "tambah dengan tanggal prefill"). Akibatnya argumen geser
        // posisi dan eventId hilang -- ini root cause bug "klik
        // kegiatan di kalender selalu buka form Tambah, bukan Ubah".
        // Jadi array kosong HANYA untuk argsStr benar-benar kosong;
        // argumen string kosong yang eksplisit (','','' di antara
        // koma) tetap dipertahankan sesuai posisinya.
        const args = argsStr.trim() === '' ? [] : argsStr.split(',').map(s => {
          s = s.trim();
          // 'event' dan 'this' -- dipakai beberapa handler (mis.
          // toggleOrgNode(event, this) untuk event.stopPropagation()
          // dan btnEl.closest(...)) -- HARUS jadi objek event/elemen
          // ASLI, bukan string literal "event"/"this" (yang tidak
          // punya method itu sama sekali dan akan throw TypeError).
          if (s === 'event') return e;
          if (s === 'this') return target;
          if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
            return s.substring(1, s.length - 1);
          }
          if (s === 'true') return true;
          if (s === 'false') return false;
          if (!isNaN(s) && s !== '') return Number(s);
          // referensi properti global sederhana, mis. window.__activeEmployeeId
          // (dipakai tombol "Unduh Profil Lengkap (PDF)") -- tanpa ini, args
          // seperti itu lolos sebagai STRING LITERAL nama propertinya sendiri,
          // bukan nilai sebenarnya, dan fungsi tujuan menerima ID yang salah.
          const winRefMatch = s.match(/^window\.([a-zA-Z0-9_$]+)$/);
          if (winRefMatch) return window[winRefMatch[1]];
          return s;
        });

        window[funcName].apply(null, args);
      } else {
        console.warn('Function not found:', funcName);
      }
    }
  }
}

// Dipakai data-onchange="toggleDeptFieldVisibility(this, 'xxx')" untuk
// 2 dropdown role (tambah user & edit user) -- field departemen cuma
// tampak kalau role yang dipilih "Kepala Bagian". Diekstrak jadi fungsi
// bernama supaya cocok pola parser runInlineHandlerCode di atas (parser
// cuma menangani pemanggilan fungsi, bukan expression assignment bebas
// seperti `this.value === ... ? ... : ...` yang sebelumnya ada langsung
// di atribut onchange="" mentah).
export function toggleDeptFieldVisibility(selectEl, fieldId) {
  document.getElementById(fieldId).style.display = selectEl.value === 'Kepala Bagian' ? 'block' : 'none';
}

// Toggle tampil/sembunyi teks password generik -- dipakai layar Atur
// Kata Sandi Baru (alur reset password). Layar Login (#loginPw) TIDAK
// pakai fungsi ini, tetap addEventListener langsung di main.js -- tidak
// diseragamkan sekaligus di sesi ini supaya perubahan tetap kecil &
// fokus, cukup dicatat sebagai backlog kecil kalau mau dirapikan nanti.
export function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btnEl.textContent = showing ? 'TAMPILKAN' : 'SEMBUNYIKAN';
}
