/* ============================================================
   main.js — Entry point ES Modules (P3.1 CUTOVER, tahap terakhir).
   Dimuat dari index.html lewat <script type="module" src="js/modules/main.js">,
   MENGGANTIKAN <script src="js/app.js"> classic yang lama.

   Tugas modul ini (lihat docs/MIGRATION_ES_MODULES.md bagian CUTOVER):
   1. Import seluruh 20 modul ES hasil P3.1 Tahap 1-18.
   2. Daftarkan SETIAP export tiap modul ke `window` -- ini WAJIB,
      bukan opsional, karena:
      a) index.html masih punya banyak atribut data-onclick/
         data-onchange/data-oninput yang di-parse lewat
         runInlineHandlerCode() (ui-shell.js) -- parser itu memanggil
         `window[funcName]`, bukan import langsung.
      b) Beberapa modul (terutama employees.js, Tahap 2 paling awal)
         masih punya pemanggilan transisi `window.toast(...)`,
         `window.closeModal(...)`, `window.viewEmployee(...)`, dkk
         yang ditandai "TODO: pindah ke X.js" tapi belum sempat
         diganti jadi `import` langsung di sepanjang P3.1 -- ini
         backlog kecil yang SENGAJA tidak diblokir dari cutover
         (fungsional tetap benar selama window.fn terdaftar, cuma
         belum serapi mungkin secara kode). Dicatat di sini supaya
         tidak hilang dari radar, bisa dibereskan sebagai cleanup
         terpisah kapan-kapan.
      Verifikasi TIDAK ADA tabrakan nama export antar 20 modul sudah
      dilakukan (grep otomatis) sebelum pola Object.assign ini dipakai
      -- kalau menambah modul baru di masa depan, cek ulang tidak ada
      nama export yang sama dengan modul lain sebelum masuk main.js.
   3. `disableUnbuiltModules()` -- dipindahkan APA ADANYA dari app.js
      baris 7804 (BUKAN modul terpisah, lihat catatan Tahap 18 di
      docs/MIGRATION_ES_MODULES.md kenapa fungsi ini baru "ditemukan"
      di tahap itu).
   4. Wiring DOMContentLoaded -- gabungan 2 listener terpisah yang
      dulu ada di app.js (baris 9082 dan 9289), plus listener
      'submit' (baris 9179), digabung jadi SATU titik bootstrap,
      urutan isi listener dipertahankan PERSIS sama dengan aslinya.

   TIDAK ada perubahan perilaku yang disengaja di file ini -- murni
   pemindahan & pendaftaran window scope, logic function itu sendiri
   sudah dipindah apa adanya di Tahap 1-18.
   ============================================================ */

import * as constantsMod from './constants.js';
import * as stateMod from './state.js';
import * as utilsMod from './utils.js';
import * as authMod from './auth.js';
import * as employeesMod from './employees.js';
import * as orgChartMod from './org-chart.js';
import * as dailyTasksMod from './daily-tasks.js';
import * as employeeProfileMod from './employee-profile.js';
import * as uiShellMod from './ui-shell.js';
import * as settingsMod from './settings.js';
import * as performanceMod from './performance.js';
import * as payrollMod from './payroll.js';
import * as attendanceMod from './attendance.js';
import * as reportsMod from './reports.js';
import * as usersAdminMod from './users-admin.js';
import * as auditLogMod from './audit-log.js';
import * as documentsPrintMod from './documents-print.js';
import * as dmsMod from './dms.js';
import * as dashboardMod from './dashboard.js';
import * as leaveMod from './leave.js';
import * as studentDatabaseMod from './student-database.js'; // 2026-09-01, modul baru "Database Santri" (schema_110)

// Daftarkan seluruh export dari setiap modul ke window scope, satu-satu
// (bukan digabung jadi 1 array Object.assign(window, ...mods) supaya
// kalau salah satu modul gagal di-resolve saat import, error-nya
// menunjuk modul mana yang bermasalah, bukan generic).
Object.assign(window, constantsMod);
Object.assign(window, stateMod);
Object.assign(window, utilsMod);
Object.assign(window, authMod);
Object.assign(window, employeesMod);
Object.assign(window, orgChartMod);
Object.assign(window, dailyTasksMod);
Object.assign(window, employeeProfileMod);
Object.assign(window, uiShellMod);
Object.assign(window, settingsMod);
Object.assign(window, performanceMod);
Object.assign(window, payrollMod);
Object.assign(window, attendanceMod);
Object.assign(window, reportsMod);
Object.assign(window, usersAdminMod);
Object.assign(window, auditLogMod);
Object.assign(window, documentsPrintMod);
Object.assign(window, dmsMod);
Object.assign(window, dashboardMod);
Object.assign(window, leaveMod);
Object.assign(window, studentDatabaseMod);

const { initSession } = authMod;
const { runInlineHandlerCode, toggleDeptFieldVisibility } = uiShellMod;
window.toggleDeptFieldVisibility = toggleDeptFieldVisibility; // dipakai data-onchange di index.html

/* ============================================================
   MODUL BELUM TERSEDIA — tandai jujur, jangan pura-pura aktif
   Dipindahkan APA ADANYA dari app.js baris 7804 (P3.1 Tahap 18 --
   satu-satunya sisa yang tidak tercatat di tabel migrasi manapun,
   memang bagian dari pekerjaan cutover ini sendiri, lihat catatan
   Tahap 18 di docs/MIGRATION_ES_MODULES.md).
   ============================================================ */
function disableUnbuiltModules() {
  const unbuilt = ['Rekrutmen'];
  document.querySelectorAll('.nav-item').forEach(el => {
    const label = el.querySelector('span')?.textContent?.trim();
    if (unbuilt.includes(label)) {
      el.classList.add('nav-item-disabled');
      el.style.opacity = '0.45';
      el.style.pointerEvents = 'none';
      el.title = 'Segera hadir';
      const tag = document.createElement('span');
      tag.textContent = 'Segera hadir';
      tag.style.cssText = 'margin-left:auto;font-size:10px;background:var(--neutral-bg);color:var(--neutral-fg);padding:2px 6px;border-radius:999px;';
      el.appendChild(tag);
    }
  });
}

// Added for CSP compliance (unsafe-inline removal) -- dipindahkan APA
// ADANYA dari app.js baris 9179 (lihat komentar panjang aslinya di git
// blame / arsip app.js kalau perlu konteks penuh: SEMUA <form> di
// index.html sebelumnya pakai onsubmit="return false;" inline, diganti
// listener 'submit' terpusat ini saat CSP script-src diperketat).
document.addEventListener('submit', (e) => { e.preventDefault(); });

document.addEventListener('DOMContentLoaded', async () => {
  // FIX (cutover P3.1): loadDataService.js menyisipkan mockDataService.js/
  // supabaseDataService.js lewat createElement('script') + async=false --
  // teknik itu MENJAMIN urutan eksekusi ANTAR script yang disisipkan
  // secara dinamis, TAPI TIDAK MENJAMIN selesai SEBELUM event
  // DOMContentLoaded (beda dari script <script defer>/type="module" biasa
  // yang dijamin selesai sebelum DOMContentLoaded). Ini race condition
  // laten yang sudah ada sejak app.js classic (kebetulan jarang kena
  // karena timing lokal), TAPI jadi lebih mudah terpicu setelah cutover
  // ke type="module" (main.js dieksekusi lebih lambat -- setelah parsing
  // penuh selesai -- yang secara tidak intuitif TIDAK otomatis "lebih
  // aman", karena DOMContentLoaded sendiri juga baru terpicu di titik
  // yang sama, jadi race-nya tetap ada). Diverifikasi nyata lewat
  // Puppeteer: window.dataService kadang masih undefined tepat saat
  // listener ini jalan. Perbaikan: tunggu window.dataService benar-benar
  // ada sebelum lanjut (poll requestAnimationFrame, bukan setTimeout
  // tetap, supaya tidak menambah delay kalau sudah siap).
  if (!window.dataService) {
    await new Promise((resolve) => {
      const check = () => { window.dataService ? resolve() : requestAnimationFrame(check); };
      requestAnimationFrame(check);
    });
  }

  disableUnbuiltModules();
  // Coba kosongkan antrian juga saat app baru dibuka/reload -- menutup
  // celah kalau device offline saat check-in lalu app ditutup total
  // sebelum event 'online' sempat terpicu (mis. HP di-restart).
  window.dataService.drainAttendanceQueue?.().catch(() => { /* ditangani di dalam */ });

  document.querySelectorAll('[data-app-goto]').forEach(el => {
    el.addEventListener('click', () => uiShellMod.goto(el.dataset.appGoto));
  });

  document.querySelectorAll('#profileTabs .ps-menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#profileTabs .ps-menu-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`.tab-panel[data-panel="${btn.dataset.tab}"]`)?.classList.add('active');
      // 'cek' (menu "Dashboard Pegawai") -- kartu kalender+agenda dipanggil
      // lewat renderCekCalendarAgenda(). Menu "Kalender" terpisah (dulu
      // data-tab="calendar") DIHAPUS 2026-08-25 -- kalender pegawai cukup
      // di sini, tidak ada tab berdiri sendiri lagi.
      if (btn.dataset.tab === 'cek') { window.renderCekCalendarAgenda(window.__activeEmployeeId, 'cekCalCard', 'cekAgendaCard'); window.renderKontenHarian(); window.renderCekInfoKepegawaian(window.__activeEmployeeId); }
      // 'contact' digabung ke dalam panel 'personal' (Kontak -> Data Pribadi) —
      // tab terpisah 'contact' sudah dihapus dari nav, jangan ditambah lagi di sini.
      const editable = ['personal', 'employment'].includes(btn.dataset.tab);
      const sticky = document.getElementById('stickyBar');
      if (sticky) sticky.style.display = editable ? 'flex' : 'none';
      document.querySelectorAll('.content')[0]?.scrollTo({ top: 0, behavior: 'instant' });
      // Tutup drawer menu profil otomatis di HP setelah user memilih
      // salah satu menu (Ringkasan/Kehadiran/Cuti/dst) — kalau tidak,
      // drawer tetap menutupi tab yang baru saja dibuka.
      uiShellMod.closeMobileSidebar();
    });
  });

  document.addEventListener('click', (e) => {
    const wrap1 = document.querySelector('.sh-actions-wrap');
    if (wrap1 && !wrap1.contains(e.target)) uiShellMod.closeSidebarActionsMenu();
    const wrap3 = document.getElementById('quickActionWrap');
    if (wrap3 && !wrap3.contains(e.target)) uiShellMod.closeQuickActionMenu();
    const wrap4 = document.getElementById('notifWrap');
    if (wrap4 && !wrap4.contains(e.target)) uiShellMod.closeNotificationMenu();
    const wrap5 = document.getElementById('globalSearchWrap');
    if (wrap5 && !wrap5.contains(e.target)) uiShellMod.closeGlobalSearchMenu();
  });

  document.getElementById('globalSearchInput')?.addEventListener('input', (e) => {
    uiShellMod.handleGlobalSearchInput(e.target.value);
  });
  document.getElementById('globalSearchInput')?.addEventListener('focus', (e) => {
    if (e.target.value.trim()) uiShellMod.renderGlobalSearchMenu(e.target.value);
  });

  document.getElementById('pwToggleBtn')?.addEventListener('click', function () {
    const pw = document.getElementById('loginPw');
    const showing = pw.type === 'text';
    pw.type = showing ? 'password' : 'text';
    this.textContent = showing ? 'TAMPILKAN' : 'SEMBUNYIKAN';
  });
  document.getElementById('loginPw')?.addEventListener('keyup', (e) => {
    const caps = e.getModifierState && e.getModifierState('CapsLock');
    document.getElementById('capsHint')?.classList.toggle('show', !!caps);
  });
  document.querySelectorAll('[data-login-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-login-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.loginMode;
      const label = document.getElementById('loginIdLabel');
      if (label) label.innerHTML = (mode === 'username' ? 'Username' : 'Email') + ' <span class="req">*</span>';
      const idInput = document.getElementById('loginId');
      idInput.placeholder = mode === 'username' ? 'mis. ahmad.fauzi' : 'mis. ahmad.fauzi@alfalahabulamu.sch.id';
      idInput.type = mode === 'username' ? 'text' : 'email';
    });
  });

  window.addEventListener('beforeunload', (e) => { if (stateMod.state.dirty) { e.preventDefault(); e.returnValue = ''; } });

  initSession();

  // --- Digabung dari listener DOMContentLoaded KEDUA app.js lama
  //     (baris 9289) -- delegasi data-onclick/data-onchange/data-oninput.
  document.body.addEventListener('click', (e) => {
    let target = e.target;
    while (target && target !== document.body) {
      if (target.hasAttribute('data-onclick')) {
        runInlineHandlerCode(target.getAttribute('data-onclick'), e, target);
        e.preventDefault();
        break;
      }
      target = target.parentNode;
    }
  });

  document.body.addEventListener('change', (e) => {
    let target = e.target;
    while (target && target !== document.body) {
      if (target.hasAttribute('data-onchange')) {
        runInlineHandlerCode(target.getAttribute('data-onchange'), e, target);
        break;
      }
      target = target.parentNode;
    }
  });

  document.body.addEventListener('input', (e) => {
    let target = e.target;
    while (target && target !== document.body) {
      if (target.hasAttribute('data-oninput')) {
        runInlineHandlerCode(target.getAttribute('data-oninput'), e, target);
        break;
      }
      target = target.parentNode;
    }
  });
});
