/* ============================================================
   dashboard.js — Dashboard: Ringkasan (HR + Bendahara Umum), grafik
   (Pegawai per Unit, Status Kepegawaian, Tren Kehadiran, Biaya
   Bulanan), Analisis Biaya SDM, Ringkasan Eksekutif (Pimpinan), dan
   kartu Aktivitas Terbaru (audit log).
   Dipindahkan dari app.js baris 8050-8635 (P3.1 Tahap 12) — rentang
   KONTIGU (beda dari leave.js Tahap 11 yang punya gap Backup Bulanan
   di tengahnya).

   TIDAK termasuk di sini (SENGAJA): definisi lokal
   AUDIT_ACTION_BADGE/LABEL -- dikonfirmasi HANYA dipakai di dalam
   renderRecentActivity() sendiri (satu-satunya konsumen di seluruh
   app.js), tetap lokal di modul ini, TIDAK dipromosikan ke
   constants.js -- pola sama seperti ATTENDANCE_TEAM_VIEW_ROLES
   (attendance.js, Tahap 10) / LEAVE_APPROVER_ROLES (leave.js, Tahap
   11): const yang cuma dipakai 1 modul tidak perlu jadi canonical
   bersama.

   TEMUAN BARU Tahap 12: `PAYROLL_PERIOD_STATUS_LABEL` (const lokal
   lama di app.js ~baris 8133, SEBELUM tahap ini) ternyata dibaca
   `renderPayrollReportCard()` (app.js ~5615-5631, kandidat
   reports.js, BELUM dimigrasi) sebagai const global classic-script
   -- pola identik MONTH_NAMES/PERIOD_STATUS_LABEL yang dipromosikan
   ke constants.js di Tahap 9 karena alasan yang sama (dibaca modul
   lain yang belum dimigrasi). Dipromosikan sekarang juga (PERTAMA
   KALI dibuat kanonis di constants.js Tahap 12, bukan duplikat lama
   sejak Tahap 4) -- lihat komentar lengkap di constants.js kenapa
   TIDAK disatukan dengan PERIOD_STATUS_LABEL (payroll.js) meski
   nama & bentuknya mirip: label teks utk status 'open' SENGAJA beda
   ("Belum Dihitung" vs "Terbuka"), 2 const independen yang sudah
   begitu sejak sebelum P3.1, bukan kesalahan migrasi.

   9 `let` yang tadinya lokal (__chartByUnit, __chartByStatus,
   __chartAttendanceTrend, __chartMonthlyExpense, __chartHrCostByDept,
   __chartHrCostByContract, __chartHrCostTrend, __execChartAttendance,
   __execChartLeave) TIDAK dicopy -- SUDAH ada di state.js sejak
   Tahap 1, modul ini baca/tulis lewat `state.x`.

   `chartColor()` TETAP lokal (tidak diekspor) -- dikonfirmasi HANYA
   dipakai di dalam modul ini (semua pemanggilan Chart.js di app.js
   ada dalam rentang 8050-8635), pola sama seperti
   ATTENDANCE_TEAM_VIEW_ROLES/LEAVE_APPROVER_ROLES di atas.

   `Chart` (Chart.js, dimuat via CDN, lihat index.html) dipakai
   sebagai referensi GLOBAL BARE (bukan `import`) -- sama seperti
   `XLSX` di payroll.js/leave.js -- karena bukan modul ES, melekat
   ke `window` lewat tag <script> classic.

   STATUS TRANSISI: modul ini TIDAK punya window.fn tersisa untuk
   dirinya sendiri. Cleanup window.fn di ui-shell.js (lihat di
   bawah): 3 referensi (`window.renderDashboard()`,
   `window.renderHrCostDashboard()`, `window.renderExecutiveDashboard()`)
   diganti `import` sungguhan -- TERNYATA ADA 3, bukan cuma 1 seperti
   dugaan awal dokumen ini di rencana Tahap 11 ("PERIKSA sebelum
   mulai, kemungkinan ada window.fn lain yang terlewat di sekitar
   situ juga" -- dugaan itu benar).
   ============================================================ */

import { state } from './state.js';
import { AUDIT_ROLES, PAYROLL_PERIOD_STATUS_LABEL, SYSTEM_HEALTH_ROLES } from './constants.js';
import { escapeHtml, formatDate, formatDateLong, formatRupiah, friendlyLoadError, localDateISO } from './utils.js';

/* ============================================================
   RINGKASAN (Dashboard utama) — beda tampilan untuk Bendahara Umum
   (Keuangan) vs peran lain (HR).
   ============================================================ */
export async function renderDashboard() {
  const isBendahara = state.currentProfile?.role === 'bendahara_umum';
  const financeSection = document.getElementById('dashFinanceSection');
  // Susun ulang 2026-08-31 (permintaan eksplisit pengguna) memecah section
  // HR lama jadi 2 elemen DOM terpisah (dashHrSection = kartu statistik,
  // dashHrSection2 = Tren Kehadiran/Aktivitas Terbaru/Kesehatan Sistem) --
  // supaya grid chart Pegawai per Unit/Status Kepegawaian bisa duduk DI
  // ANTARA keduanya tanpa ikut disembunyikan untuk Bendahara (lihat
  // komentar lengkap di index.html). Keduanya di-toggle BERSAMAAN di sini
  // -- kalau nanti salah satu perlu visibility berbeda dari yang lain,
  // baru dipisah jadi 2 kondisi berbeda.
  const hrSection = document.getElementById('dashHrSection');
  const hrSection2 = document.getElementById('dashHrSection2');
  const subtitleEl = document.getElementById('dashboardSubtitle');
  if (financeSection) financeSection.style.display = isBendahara ? '' : 'none';
  if (hrSection) hrSection.style.display = isBendahara ? 'none' : '';
  if (hrSection2) hrSection2.style.display = isBendahara ? 'none' : '';
  if (subtitleEl) subtitleEl.textContent = isBendahara
    ? 'Ringkasan keuangan & penggajian Pesantren Modern Al-Falah Abu Lam U'
    : 'Ringkasan kepegawaian Pesantren Modern Al-Falah Abu Lam U';

  // Pegawai per Unit & Status Kepegawaian tetap tampil untuk SEMUA peran
  // (termasuk Bendahara — relevan untuk perencanaan anggaran gaji per
  // bagian), jadi daftar pegawai selalu diambil di sini.
  //
  // BUG DITEMUKAN & DIPERBAIKI (2026-08-31, laporan pengguna: screenshot
  // dashboard HP menunjukkan "Total Pegawai: 0" padahal data pegawai
  // sungguhan ADA -- diverifikasi lewat PENDING_ACTIONS.md, MCP Supabase
  // sesi 2026-08-26 mengonfirmasi 38 baris di tabel employees).
  // SEBELUMNYA: kalau listEmployees() melempar error (RLS/sesi/jaringan),
  // catch di sini DIAM-DIAM mengubahnya jadi array kosong TANPA logging
  // apa pun -- renderHrDashboardStats([]) lalu menampilkan "0" / "0 aktif
  // · 0 cuti" seolah itu ANGKA SUNGGUHAN, bukan kegagalan muat data.
  // Ini bertentangan dengan pola widget lain di file yang sama (lihat
  // "Cuti Menunggu" 20 baris di bawah: catch-nya menampilkan teks
  // "Gagal memuat" secara eksplisit, BUKAN diam-diam jadi "0"). Sekarang
  // dilacak lewat `employeesLoadFailed` supaya SETIAP widget turunan
  // (Total Pegawai, Profil Belum Lengkap, Kontrak Akan Berakhir, 2 chart
  // di bawah) menampilkan status gagal yang jujur, bukan angka nol yang
  // menyesatkan -- dan error asli di-log ke console supaya sesi debugging
  // berikutnya tidak perlu menebak dari nol lagi (lihat catatan
  // verifikasi lengkap di PENDING_ACTIONS.md: pola "3 query independen
  // gagal bersamaan" lebih mengarah ke masalah sesi/token, bukan
  // RLS/skema per query).
  let list = [];
  let employeesLoadFailed = false;
  try {
    list = await window.dataService.listEmployees();
  } catch (e) {
    console.error('[Dashboard] Gagal memuat daftar pegawai:', e);
    list = [];
    employeesLoadFailed = true;
  }

  if (isBendahara) {
    await renderFinanceDashboard();
  } else {
    await renderHrDashboardStats(list, employeesLoadFailed);
    renderRecentActivity();
  }

  renderSystemHealthCard();
  renderDashboardCharts(list, isBendahara, employeesLoadFailed);
}


// Statistik HR umum (Total Pegawai, Cuti Menunggu, Profil Belum Lengkap,
// Kontrak Akan Berakhir) — dipakai semua peran KECUALI Bendahara Umum,
// yang lihat renderFinanceDashboard().
// employeesLoadFailed: true kalau listEmployees() di renderDashboard() gagal --
// dipakai supaya Total Pegawai, Profil Belum Lengkap, & Kontrak Akan
// Berakhir menampilkan "Gagal memuat" yang jujur, bukan "0" yang
// seolah-olah angka sungguhan.
export async function renderHrDashboardStats(list, employeesLoadFailed = false) {
  const valEl = document.getElementById('statTotalPegawai');
  const deltaEl = document.getElementById('statTotalPegawaiDelta');
  const incEl = document.getElementById('statIncompleteProfiles');
  const incDeltaEl = document.getElementById('statIncompleteProfilesDelta');
  // Kartu "Kontrak Akan Berakhir" (2026-08-31, susun ulang dashboard) --
  // SEBELUMNYA placeholder mati permanen ("Belum bisa dihitung — belum
  // ada kolom tanggal kontrak"), TAPI kolom contract_end_date SUDAH live
  // sejak schema_45_employee_contract_info.sql (dipakai aktif oleh card
  // "Informasi Kontrak" di employee-profile.js/employees.js) -- pesan
  // lama itu SUDAH TIDAK BENAR sejak schema_45 live, cuma dashboard-nya
  // yang belum pernah diperbarui menyusul. Sekarang dihitung sungguhan
  // dari `list` yang SUDAH dimuat listEmployees() (select('*') otomatis
  // menyertakan contract_end_date, TIDAK perlu query tambahan).
  // Ambang 30 hari adalah keputusan desain (belum ada spesifikasi dari
  // pengguna soal angka ini) -- bisa dijadikan pengaturan kalau nanti
  // institusi butuh ambang berbeda.
  const contractEl = document.getElementById('statContractsExpiring');
  const contractDeltaEl = document.getElementById('statContractsExpiringDelta');
  if (!valEl) return;
  try {
    // employeesLoadFailed: tampilkan status gagal yang jujur untuk kartu
    // yang datanya SEPENUHNYA bergantung pada listEmployees() -- Total
    // Pegawai, Profil Belum Lengkap, & Kontrak Akan Berakhir. "0"/"0%"
    // akan salah tampilkan kondisi "gagal muat" sebagai "memang segini
    // datanya", padahal beda makna.
    if (employeesLoadFailed) {
      valEl.textContent = '—';
      deltaEl.textContent = 'Gagal memuat';
      if (incEl) { incEl.textContent = '—'; incDeltaEl.textContent = 'Gagal memuat'; }
      if (contractEl) { contractEl.textContent = '—'; contractDeltaEl.textContent = 'Gagal memuat'; }
    } else {
      valEl.textContent = list.length;
      const active = list.filter(e => e.employment_status === 'active').length;
      const onLeave = list.filter(e => e.employment_status === 'leave').length;
      deltaEl.textContent = `${active} aktif · ${onLeave} cuti`;

      // "Belum lengkap" didefinisikan secara eksplisit di sini: minimal NIK
      // (identitas) dan satu kontak (telepon/email pribadi) sudah terisi.
      // Definisi ini sengaja sederhana dan bisa diperketat nanti — dicatat
      // di README supaya tidak disalahartikan sebagai audit data resmi.
      if (incEl) {
        const incomplete = list.filter(e => {
          const hasNik = !!(e.personal_info && e.personal_info.nik);
          const hasContact = !!(e.contact_info && (e.contact_info.phone || e.contact_info.personal_email));
          return !hasNik || !hasContact;
        }).length;
        const pct = list.length ? Math.round((incomplete / list.length) * 100) : 0;
        incEl.textContent = incomplete;
        incDeltaEl.textContent = list.length ? `${pct}% dari total pegawai` : 'Belum ada data';
      }

      if (contractEl) {
        const now = new Date();
        const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const expiring = list.filter(e => {
          if (!e.contract_end_date) return false; // pegawai tetap (PT) umumnya NULL, bukan dianggap "akan berakhir"
          const d = new Date(e.contract_end_date);
          return d >= now && d <= in30Days;
        });
        contractEl.textContent = expiring.length;
        contractDeltaEl.textContent = expiring.length ? 'Dalam 30 hari ke depan' : 'Tidak ada dalam 30 hari ke depan';
      }
    }

    // Sebelumnya statis "Modul Cuti belum dibangun" — sekarang modul Cuti
    // sudah ada, dihitung dari data asli. Reuse listPendingLeaveApprovals
    // yang sudah otomatis scoped per role (RLS): kepala_bagian/pimpinan/
    // HRD/super_admin lihat yang relevan untuk mereka, pegawai biasa yang
    // tidak punya wewenang approval akan lihat 0 (jujur, bukan bug).
    const pendingEl = document.getElementById('statPendingLeave');
    const pendingDeltaEl = document.getElementById('statPendingLeaveDelta');
    if (pendingEl) {
      try {
        const pending = await window.dataService.listPendingLeaveApprovals();
        pendingEl.textContent = pending.length;
        pendingDeltaEl.textContent = pending.length ? 'Menunggu tindakan Anda' : 'Tidak ada yang menunggu';
      } catch (e) {
        pendingEl.textContent = '—';
        pendingDeltaEl.textContent = 'Gagal memuat';
      }
    }
  } catch (e) {
    valEl.textContent = '—';
    deltaEl.textContent = 'Gagal memuat';
  }
}

// Dashboard Keuangan — KHUSUS Bendahara Umum. Menampilkan yang relevan
// dengan tugasnya (uang keluar, komitmen gaji, status periode penggajian)
// dan sengaja TIDAK menampilkan kartu HR (cuti, kelengkapan profil,
// kehadiran, log aktivitas sistem) sesuai permintaan eksplisit.
export async function renderFinanceDashboard() {
  const year = new Date().getFullYear();
  const yearLabelEl = document.getElementById('financeYearLabel');
  if (yearLabelEl) yearLabelEl.textContent = year;
  const paidEl = document.getElementById('statPaidYtd');
  const paidDeltaEl = document.getElementById('statPaidYtdDelta');
  const finUnpaidEl = document.getElementById('statFinalizedUnpaid');
  const estEl = document.getElementById('statEstMonthly');
  const activeEl = document.getElementById('statActiveEmployees');
  const periodSummaryEl = document.getElementById('periodStatusSummary');
  if (!paidEl) return;
  try {
    const summary = await window.dataService.getFinanceSummary(year);
    if (!summary || summary.authorized === false) {
      paidEl.textContent = '—'; paidDeltaEl.textContent = 'Anda tidak memiliki izin melihat data ini';
      return;
    }
    paidEl.textContent = formatRupiah(summary.totalPaidYtd);
    paidDeltaEl.textContent = `Sepanjang tahun ${year}`;
    finUnpaidEl.textContent = formatRupiah(summary.totalFinalizedUnpaid);
    estEl.textContent = formatRupiah(summary.estimatedMonthlyPayroll);
    activeEl.textContent = summary.employeeCountActive;
    if (periodSummaryEl) {
      const c = summary.periodStatusCounts;
      periodSummaryEl.textContent = `${c.open} belum dihitung · ${c.processing} diproses · ${c.finalized} terkunci · ${c.paid} dibayar`;
    }

    const ctx = document.getElementById('chartMonthlyExpense');
    if (ctx && window.Chart) {
      const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      if (state.__chartMonthlyExpense) state.__chartMonthlyExpense.destroy();
      state.__chartMonthlyExpense = new Chart(ctx, {
        type: 'bar',
        data: { labels: monthLabels, datasets: [{ label: 'Dibayar (Rp)', data: summary.monthly.map(m => m.paid), backgroundColor: chartColor('--success-fg'), borderRadius: 6 }] },
        options: {
          responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => formatRupiah(ctx.raw) } } },
          scales: { y: { beginAtZero: true, ticks: { callback: (v) => formatRupiah(v) } } },
        },
      });
    }
  } catch (e) {
    paidEl.textContent = '—';
    paidDeltaEl.textContent = 'Gagal memuat data keuangan';
  }
}

/* ============================================================
   GRAFIK DASHBOARD — Chart.js (dimuat via CDN, lihat index.html).
   list = employeesCache yang SUDAH lolos RLS (employeesCache diisi
   dataService.listEmployees() di atas) — tidak ada query tambahan
   untuk 2 chart pertama, cuma agregasi ulang data yang sudah dimuat.
   ============================================================ */
function chartColor(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

// Helper kecil (baru, 2026-08-31 — bagian dari perbaikan bug "Total
// Pegawai: 0" di atas): tampilkan catatan "Gagal memuat" di sebelah
// canvas chart kalau datanya gagal dimuat, alih-alih diam-diam
// menggambar chart kosong/nol yang terlihat seperti "memang tidak ada
// data" padahal sebenarnya "gagal mengambil data". idempotent — dipanggil
// ulang tiap renderDashboardCharts() tidak menumpuk elemen duplikat.
function showChartLoadError(canvasEl) {
  if (!canvasEl) return;
  canvasEl.style.display = 'none';
  const parent = canvasEl.parentElement;
  if (!parent) return;
  let note = parent.querySelector('.chart-load-error');
  if (!note) {
    note = document.createElement('p');
    note.className = 'chart-load-error';
    note.style.cssText = 'color:var(--danger-fg);font-size:13px;margin:0;';
    parent.appendChild(note);
  }
  note.textContent = 'Gagal memuat data grafik.';
}
function clearChartLoadError(canvasEl) {
  if (!canvasEl) return;
  canvasEl.style.display = '';
  canvasEl.parentElement?.querySelector('.chart-load-error')?.remove();
}

// employeesLoadFailed: diteruskan dari renderDashboard() (lihat catatan
// bug di atas) -- kalau true, 2 chart pertama (Pegawai per Unit, Status
// Kepegawaian) MEMANG tidak punya data valid untuk digambar (employeeList
// kosong karena gagal muat, bukan karena organisasi benar-benar 0
// pegawai) -- tampilkan status gagal, jangan gambar chart nol yang
// menyesatkan.
export async function renderDashboardCharts(employeeList, isBendahara, employeesLoadFailed = false) {
  if (!window.Chart) return; // Chart.js belum termuat (jaringan lambat) — jangan error, lewati saja

  // --- Pegawai per Unit (bar) ---
  const ctxUnit = document.getElementById('chartByUnit');
  if (employeesLoadFailed) {
    if (state.__chartByUnit) { state.__chartByUnit.destroy(); state.__chartByUnit = null; }
    showChartLoadError(ctxUnit);
  } else if (ctxUnit) {
    clearChartLoadError(ctxUnit);
    const byUnit = {};
    employeeList.forEach(e => { const u = e.unit || 'Tanpa Unit'; byUnit[u] = (byUnit[u] || 0) + 1; });
    const unitLabels = Object.keys(byUnit);
    const unitData = Object.values(byUnit);
    if (state.__chartByUnit) state.__chartByUnit.destroy();
    state.__chartByUnit = new Chart(ctxUnit, {
      type: 'bar',
      data: { labels: unitLabels, datasets: [{ label: 'Pegawai', data: unitData, backgroundColor: chartColor('--brand-600'), borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }

  // --- Status Kepegawaian (doughnut) ---
  const ctxStatus = document.getElementById('chartByStatus');
  if (employeesLoadFailed) {
    if (state.__chartByStatus) { state.__chartByStatus.destroy(); state.__chartByStatus = null; }
    showChartLoadError(ctxStatus);
  } else if (ctxStatus) {
    clearChartLoadError(ctxStatus);
    const statusCounts = { active: 0, inactive: 0, leave: 0 };
    employeeList.forEach(e => { if (statusCounts[e.employment_status] !== undefined) statusCounts[e.employment_status]++; });
    if (state.__chartByStatus) state.__chartByStatus.destroy();
    state.__chartByStatus = new Chart(ctxStatus, {
      type: 'doughnut',
      data: {
        labels: ['Aktif', 'Non-Aktif', 'Cuti'],
        datasets: [{ data: [statusCounts.active, statusCounts.inactive, statusCounts.leave],
          backgroundColor: [chartColor('--success-fg'), chartColor('--danger-fg'), chartColor('--info-fg')] }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
    });
  }

  // --- Tren Kehadiran 14 hari (line) — butuh query terpisah, RLS-scoped.
  //     Dilewati untuk Bendahara Umum: bukan bagian tugasnya, dan kartu
  //     ini memang disembunyikan (dashHrSection) — jangan buang query. ---
  const ctxTrend = isBendahara ? null : document.getElementById('chartAttendanceTrend');
  if (ctxTrend) {
    try {
      const trend = await window.dataService.getAttendanceTrend(14);
      clearChartLoadError(ctxTrend);
      const labels = trend.map(t => formatDate(t.date).slice(0, 5)); // "07 Agu" dipotong biar muat
      if (state.__chartAttendanceTrend) state.__chartAttendanceTrend.destroy();
      state.__chartAttendanceTrend = new Chart(ctxTrend, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Hadir', data: trend.map(t => t.present), borderColor: chartColor('--success-fg'), backgroundColor: 'transparent', tension: .3 },
            { label: 'Terlambat', data: trend.map(t => t.late), borderColor: chartColor('--warning-fg'), backgroundColor: 'transparent', tension: .3 },
            { label: 'Tanpa Keterangan', data: trend.map(t => t.absent), borderColor: chartColor('--danger-fg'), backgroundColor: 'transparent', tension: .3 },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
      });
    } catch (e) {
      // SEBELUMNYA: diam-diam ditelan total, tanpa logging apa pun --
      // kartu tetap kosong tanpa jejak untuk didiagnosis. "Chart bukan
      // hal kritis, jangan ganggu render dashboard lain" (keputusan
      // desain asli) TETAP dipertahankan -- tidak memblokir render
      // dashboard lain -- tapi sekarang di-log ke console + tampilkan
      // catatan kecil, bukan bisu total, supaya kegagalan berulang
      // (lihat laporan pengguna 2026-08-31: kartu ini kosong bersamaan
      // dengan "Cuti Menunggu"/"Aktivitas Terbaru" gagal) bisa dilacak.
      console.error('[Dashboard] Gagal memuat Tren Kehadiran:', e);
      if (state.__chartAttendanceTrend) { state.__chartAttendanceTrend.destroy(); state.__chartAttendanceTrend = null; }
      showChartLoadError(ctxTrend);
    }
  }
}

/* ============================================================
   ANALISIS BIAYA SDM — konsumsi getHrCostAnalysis() (mock: agregasi
   langsung dari array mock; supabase: query 4 view schema_40).
   Peringatan kelengkapan data SELALU dievaluasi dan ditampilkan kalau
   relevan (audit 2026-08-30: rujukan README lama untuk bagian ini
   sudah tidak ada, dihapus dari komentar -- alasannya tetap berlaku):
   per temuan riset kesiapan data, sebagian besar pegawai belum punya
   department_id/contract_type/
   employee_payroll terisi, jadi dashboard ini kemungkinan besar akan
   menampilkan banyak nol pada penggunaan pertama — itu bukan bug.
   ============================================================ */
export async function renderHrCostDashboard() {
  const warnEl = document.getElementById('hrCostDataWarning');
  const totalCostEl = document.getElementById('hcTotalCost');
  const totalCostDeltaEl = document.getElementById('hcTotalCostDelta');
  const headcountEl = document.getElementById('hcHeadcount');
  const headcountDeltaEl = document.getElementById('hcHeadcountDelta');
  const withPayrollEl = document.getElementById('hcHeadcountWithPayroll');
  const withPayrollDeltaEl = document.getElementById('hcHeadcountWithPayrollDelta');
  const avgCostEl = document.getElementById('hcAvgCost');
  const deptTbody = document.getElementById('hrCostDeptTableBody');
  if (!totalCostEl) return;

  try {
    const data = await window.dataService.getHrCostAnalysis();
    if (!data || data.authorized === false) {
      totalCostEl.textContent = '—';
      totalCostDeltaEl.textContent = 'Anda tidak memiliki izin melihat data ini';
      return;
    }
    const { byDepartment, byContractType, trendByPeriod } = data;

    const totalHeadcount = byDepartment.reduce((s, d) => s + d.headcount, 0);
    const totalWithPayroll = byDepartment.reduce((s, d) => s + d.headcount_with_payroll_data, 0);
    const totalCost = byDepartment.reduce((s, d) => s + Number(d.total_estimated_monthly_cost || 0), 0);
    const missingDeptCount = totalHeadcount - byDepartment.filter(d => d.department_id).reduce((s, d) => s + d.headcount, 0);

    // Peringatan kelengkapan data — TIDAK disembunyikan meski angka di
    // atas ada isinya, karena "ada isinya" bukan berarti "lengkap" (bisa
    // saja 1 dari 16 pegawai terisi, angka tetap tampak seperti angka
    // sungguhan kalau tidak diberi konteks eksplisit).
    if (warnEl) {
      const gaps = [];
      if (totalHeadcount > 0 && totalWithPayroll < totalHeadcount) {
        gaps.push(`${totalHeadcount - totalWithPayroll} dari ${totalHeadcount} pegawai belum punya data payroll (employee_payroll) terisi`);
      }
      if (missingDeptCount > 0) {
        gaps.push(`${missingDeptCount} pegawai belum punya departemen (department_id) terisi — tidak muncul dalam breakdown per departemen`);
      }
      if (gaps.length) {
        warnEl.style.display = '';
        warnEl.innerHTML = `<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg> Data belum lengkap — angka di bawah ini kemungkinan besar <b>bukan gambaran biaya SDM yang sebenarnya</b>: ${gaps.join('; ')}. Lengkapi lewat menu Data Pegawai untuk hasil yang akurat.`;
      } else {
        warnEl.style.display = 'none';
      }
    }

    totalCostEl.textContent = formatRupiah(totalCost);
    totalCostDeltaEl.textContent = totalWithPayroll < totalHeadcount ? 'Estimasi dari data yang tersedia — belum lengkap' : 'Estimasi biaya bulanan penuh';
    headcountEl.textContent = totalHeadcount;
    headcountDeltaEl.textContent = `${byDepartment.filter(d => d.department_id).length} departemen`;
    withPayrollEl.textContent = totalWithPayroll;
    withPayrollDeltaEl.textContent = totalHeadcount ? `${Math.round((totalWithPayroll / totalHeadcount) * 100)}% dari total pegawai` : 'Belum ada data';
    avgCostEl.textContent = totalWithPayroll ? formatRupiah(totalCost / totalWithPayroll) : '—';

    // --- Tabel rincian per departemen ---
    if (deptTbody) {
      deptTbody.innerHTML = byDepartment.length
        ? byDepartment.map(d => `
          <tr>
            <td>${escapeHtml(d.department_name || '(Tanpa Departemen)')}</td>
            <td>${d.headcount}</td>
            <td>${d.headcount_active}</td>
            <td>${d.headcount_with_payroll_data} / ${d.headcount}</td>
            <td>${formatRupiah(d.total_estimated_monthly_cost)}</td>
          </tr>`).join('')
        : `<tr><td colspan="5" style="text-align:center;color:var(--ink-500);">Belum ada data departemen</td></tr>`;
    }

    // --- Chart: Biaya per Departemen ---
    const ctxDept = document.getElementById('chartHrCostByDept');
    if (ctxDept && window.Chart) {
      if (state.__chartHrCostByDept) state.__chartHrCostByDept.destroy();
      state.__chartHrCostByDept = new Chart(ctxDept, {
        type: 'bar',
        data: {
          labels: byDepartment.map(d => d.department_name),
          datasets: [{ label: 'Estimasi Biaya Bulanan (Rp)', data: byDepartment.map(d => Number(d.total_estimated_monthly_cost || 0)), backgroundColor: chartColor('--brand-600'), borderRadius: 6 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => formatRupiah(ctx.raw) } } },
          scales: { y: { beginAtZero: true, ticks: { callback: (v) => formatRupiah(v) } } },
        },
      });
    }

    // --- Chart: Biaya per Tipe Kontrak ---
    const ctxContract = document.getElementById('chartHrCostByContract');
    if (ctxContract && window.Chart) {
      if (state.__chartHrCostByContract) state.__chartHrCostByContract.destroy();
      state.__chartHrCostByContract = new Chart(ctxContract, {
        type: 'doughnut',
        data: {
          labels: byContractType.map(c => c.contract_type),
          datasets: [{ data: byContractType.map(c => Number(c.total_estimated_monthly_cost || 0)),
            backgroundColor: [chartColor('--brand-600'), chartColor('--success-fg'), chartColor('--warning-fg'), chartColor('--info-fg'), chartColor('--danger-fg')] }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatRupiah(ctx.raw)}` } } } },
      });
    }

    // --- Chart: Tren Biaya per Periode (dari payslip aktual, bisa kosong
    //     kalau belum ada periode payroll yang pernah diproses) ---
    const ctxTrend = document.getElementById('chartHrCostTrend');
    if (ctxTrend && window.Chart) {
      const sorted = [...trendByPeriod].sort((a, b) => (a.period_year !== b.period_year ? a.period_year - b.period_year : a.period_month - b.period_month));
      const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      if (state.__chartHrCostTrend) state.__chartHrCostTrend.destroy();
      state.__chartHrCostTrend = new Chart(ctxTrend, {
        type: 'line',
        data: {
          labels: sorted.map(p => `${monthLabels[p.period_month - 1]} ${p.period_year}`),
          datasets: [{ label: 'Total Net Pay (Rp)', data: sorted.map(p => Number(p.total_net_pay || 0)), borderColor: chartColor('--brand-600'), backgroundColor: 'transparent', tension: .3 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => formatRupiah(ctx.raw) } } },
          scales: { y: { beginAtZero: true, ticks: { callback: (v) => formatRupiah(v) } } },
        },
      });
    }
  } catch (e) {
    console.error('Gagal memuat Analisis Biaya SDM:', e);
    totalCostEl.textContent = '—';
    totalCostDeltaEl.textContent = 'Gagal memuat data';
  }
}

/* ============================================================
   RINGKASAN EKSEKUTIF (Pimpinan) — satu halaman lintas-modul.
   TIDAK ADA query/tabel baru: murni memanggil ulang dataService yang
   SUDAH dipakai di layar Laporan (listAttendanceReport/listLeaveReport),
   Analisis Biaya SDM (getHrCostAnalysis), Kinerja
   (listPerformancePeriods/listPerformanceReviews), dan Kalender
   (listInstitutionalEvents), lalu diagregasi ulang di client jadi satu
   tampilan ringkas. RLS di masing-masing tabel sudah otomatis membatasi
   apa yang boleh dilihat Pimpinan -- tidak ada bypass baru di sini.
   ============================================================ */

// Agregasi org-wide dari listAttendanceReport() yang aslinya per-pegawai
// (dipakai apa adanya di layar Laporan) -- di sini dijumlahkan lintas
// semua pegawai supaya jadi satu angka "kehadiran organisasi".
function aggregateAttendanceTotals(rows) {
  const totals = { present: 0, late: 0, absent: 0, sick: 0, permit: 0, leave: 0 };
  (rows || []).forEach(r => {
    totals.present += r.present || 0; totals.late += r.late || 0; totals.absent += r.absent || 0;
    totals.sick += r.sick || 0; totals.permit += r.permit || 0; totals.leave += r.leave || 0;
  });
  return totals;
}

// Agregasi listLeaveReport() (yang aslinya per-pegawai-per-jenis) jadi
// total hari per jenis cuti lintas seluruh pegawai.
function aggregateLeaveByType(rows) {
  const byType = {};
  (rows || []).forEach(r => {
    const name = r.leave_types?.name || 'Lainnya';
    byType[name] = (byType[name] || 0) + (r.totalDays || 0);
  });
  return byType;
}

export async function renderExecutiveDashboard() {
  const warnEl = document.getElementById('execDataWarning');
  const asOfEl = document.getElementById('execAsOfDate');
  if (!asOfEl) return;
  const today = new Date();
  asOfEl.textContent = formatDateLong(localDateISO(today));

  const monthStart = localDateISO(new Date(today.getFullYear(), today.getMonth(), 1));
  const monthEnd = localDateISO(today);
  const warnings = [];

  // --- Pegawai aktif (dasar untuk kartu pertama & pembagi rata-rata) ---
  let employees = [];
  try { employees = await window.dataService.listEmployees(); } catch (e) { warnings.push('Data pegawai gagal dimuat'); }
  const activeCount = employees.filter(e => e.employment_status === 'active').length;
  document.getElementById('execTotalActive').textContent = activeCount || '—';
  document.getElementById('execTotalActiveDelta').textContent = employees.length ? `dari ${employees.length} total pegawai` : 'Memuat…';

  // --- Kehadiran bulan berjalan (agregat org-wide) ---
  try {
    const attRows = await window.dataService.listAttendanceReport({ startDate: monthStart, endDate: monthEnd });
    const t = aggregateAttendanceTotals(attRows);
    const totalRecorded = t.present + t.late + t.absent + t.sick + t.permit + t.leave;
    const rate = totalRecorded ? Math.round(((t.present + t.late) / totalRecorded) * 100) : 0;
    document.getElementById('execAttendanceRate').textContent = totalRecorded ? `${rate}%` : '—';
    document.getElementById('execAttendanceDelta').textContent = totalRecorded
      ? `${t.present} hadir · ${t.late} telat · ${t.absent} tanpa keterangan`
      : 'Belum ada data kehadiran bulan ini';

    const ctxAtt = document.getElementById('execChartAttendance');
    if (ctxAtt && window.Chart) {
      if (state.__execChartAttendance) state.__execChartAttendance.destroy();
      state.__execChartAttendance = new Chart(ctxAtt, {
        type: 'bar',
        data: {
          labels: ['Hadir', 'Terlambat', 'Tanpa Ket.', 'Sakit', 'Izin', 'Cuti'],
          datasets: [{
            data: [t.present, t.late, t.absent, t.sick, t.permit, t.leave],
            backgroundColor: [chartColor('--success-fg'), chartColor('--warning-fg'), chartColor('--danger-fg'), chartColor('--info-fg'), chartColor('--brand-600'), chartColor('--gold-500')],
            borderRadius: 6,
          }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
      });
    }
  } catch (e) {
    document.getElementById('execAttendanceRate').textContent = '—';
    document.getElementById('execAttendanceDelta').textContent = 'Gagal memuat data kehadiran';
    warnings.push('Data kehadiran gagal dimuat');
  }

  // --- Cuti menunggu persetujuan (scoped RLS ke wewenang Pimpinan) ---
  try {
    const pending = await window.dataService.listPendingLeaveApprovals();
    document.getElementById('execPendingLeave').textContent = pending.length;
    document.getElementById('execPendingLeaveDelta').textContent = pending.length ? 'Menunggu tindakan Anda' : 'Tidak ada yang menunggu';
  } catch (e) {
    document.getElementById('execPendingLeave').textContent = '—';
    document.getElementById('execPendingLeaveDelta').textContent = 'Gagal memuat';
    warnings.push('Data cuti menunggu gagal dimuat');
  }

  // --- Cuti disetujui bulan ini, per jenis ---
  try {
    const leaveRows = await window.dataService.listLeaveReport({ startDate: monthStart, endDate: monthEnd });
    const byType = aggregateLeaveByType(leaveRows);
    const labels = Object.keys(byType);
    const ctxLeave = document.getElementById('execChartLeave');
    if (ctxLeave && window.Chart) {
      if (state.__execChartLeave) state.__execChartLeave.destroy();
      state.__execChartLeave = new Chart(ctxLeave, {
        type: 'doughnut',
        data: {
          labels: labels.length ? labels : ['Belum ada data'],
          datasets: [{
            data: labels.length ? labels.map(l => byType[l]) : [1],
            backgroundColor: labels.length
              ? [chartColor('--success-fg'), chartColor('--danger-fg'), chartColor('--warning-fg'), chartColor('--info-fg'), chartColor('--brand-600')]
              : [chartColor('--surface-2')],
          }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => labels.length ? `${ctx.label}: ${ctx.raw} hari` : 'Belum ada cuti disetujui bulan ini' } } } },
      });
    }
  } catch (e) {
    warnings.push('Data cuti disetujui gagal dimuat');
  }

  // --- Kinerja: periode terbaru (list sudah diurutkan terbaru dulu
  //     berdasar `code`, lihat listPerformancePeriods()) ---
  try {
    const periods = await window.dataService.listPerformancePeriods();
    const latest = periods[0];
    const labelEl = document.getElementById('execPerfPeriodLabel');
    const noteEl = document.getElementById('execPerfNote');
    if (!latest) {
      labelEl.textContent = 'Belum ada periode';
      document.getElementById('execPerfAvg').textContent = '—';
      document.getElementById('execPerfFinalized').textContent = '—';
      noteEl.textContent = 'Buat periode penilaian kinerja di menu Kinerja untuk melihat ringkasan di sini.';
    } else {
      labelEl.textContent = latest.name || latest.code;
      const reviews = await window.dataService.listPerformanceReviews({ periodId: latest.id });
      const scored = reviews.filter(r => r.overall_score != null);
      const avg = scored.length ? (scored.reduce((s, r) => s + Number(r.overall_score), 0) / scored.length).toFixed(1) : '—';
      const finalized = reviews.filter(r => r.status === 'finalized').length;
      document.getElementById('execPerfAvg').textContent = avg;
      document.getElementById('execPerfFinalized').textContent = `${finalized}/${reviews.length}`;
      noteEl.textContent = reviews.length ? `${reviews.length} pegawai dinilai pada periode ini` : 'Belum ada pegawai dinilai pada periode ini';
    }
  } catch (e) {
    document.getElementById('execPerfPeriodLabel').textContent = '—';
    document.getElementById('execPerfAvg').textContent = '—';
    document.getElementById('execPerfFinalized').textContent = '—';
    warnings.push('Data kinerja gagal dimuat');
  }

  // --- Biaya SDM: total kartu + top 5 departemen ---
  try {
    const data = await window.dataService.getHrCostAnalysis();
    const deptBody = document.getElementById('execHrCostDeptBody');
    if (!data || data.authorized === false) {
      document.getElementById('execHrCost').textContent = '—';
      document.getElementById('execHrCostDelta').textContent = 'Anda tidak memiliki izin melihat data ini';
      deptBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--ink-500);padding:20px;">Tidak ada izin</td></tr>';
    } else {
      const { byDepartment } = data;
      const totalCost = byDepartment.reduce((s, d) => s + Number(d.total_estimated_monthly_cost || 0), 0);
      const totalHeadcount = byDepartment.reduce((s, d) => s + d.headcount, 0);
      const totalWithPayroll = byDepartment.reduce((s, d) => s + d.headcount_with_payroll_data, 0);
      document.getElementById('execHrCost').textContent = formatRupiah(totalCost);
      document.getElementById('execHrCostDelta').textContent = totalWithPayroll < totalHeadcount
        ? `Estimasi dari ${totalWithPayroll}/${totalHeadcount} pegawai (data belum lengkap)`
        : 'Estimasi biaya bulanan penuh';
      if (totalWithPayroll < totalHeadcount) warnings.push('Data payroll sebagian pegawai belum lengkap -- estimasi biaya SDM belum mencerminkan kondisi penuh');

      const top5 = [...byDepartment].sort((a, b) => Number(b.total_estimated_monthly_cost || 0) - Number(a.total_estimated_monthly_cost || 0)).slice(0, 5);
      deptBody.innerHTML = top5.length
        ? top5.map(d => `
          <tr>
            <td>${escapeHtml(d.department_name || '(Tanpa Departemen)')}</td>
            <td>${d.headcount}</td>
            <td>${formatRupiah(d.total_estimated_monthly_cost)}</td>
          </tr>`).join('')
        : '<tr><td colspan="3" style="text-align:center;color:var(--ink-500);padding:20px;">Belum ada data</td></tr>';
    }
  } catch (e) {
    document.getElementById('execHrCost').textContent = '—';
    document.getElementById('execHrCostDelta').textContent = 'Gagal memuat';
    warnings.push('Data biaya SDM gagal dimuat');
  }

  // --- Agenda Kegiatan Lembaga 30 hari ke depan (integrasi modul Kalender) ---
  try {
    const events = await window.dataService.listInstitutionalEvents();
    const todayStr = localDateISO(today);
    const in30 = localDateISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30));
    const upcoming = (events || [])
      .filter(ev => ev.end_date >= todayStr && ev.start_date <= in30)
      .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
      .slice(0, 5);
    const el = document.getElementById('execUpcomingEvents');
    el.innerHTML = upcoming.length
      ? upcoming.map(ev => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
          <span class="badge badge-neutral" style="white-space:nowrap;">${formatDate(ev.start_date)}${ev.end_date !== ev.start_date ? ' – ' + formatDate(ev.end_date) : ''}</span>
          <span style="font-size:13px;"><svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" /></svg> ${escapeHtml(ev.title)}</span>
        </div>`).join('')
      : '<p style="color:var(--ink-500);font-size:12.5px;">Tidak ada Kegiatan Lembaga dalam 30 hari ke depan.</p>';
  } catch (e) {
    document.getElementById('execUpcomingEvents').innerHTML = `<p style="color:var(--danger-fg);font-size:12.5px;">${escapeHtml(friendlyLoadError(e))}</p>`;
  }

  if (warnEl) {
    if (warnings.length) {
      warnEl.style.display = '';
      warnEl.innerHTML = `<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg> Sebagian data gagal dimuat atau belum lengkap: ${warnings.join('; ')}.`;
    } else {
      warnEl.style.display = 'none';
    }
  }
}

// Kartu "Aktivitas Terbaru" — SEBELUMNYA contoh statis eksplisit
// ("belum tersambung ke log aktivitas sungguhan"), sekarang tersambung
// ke audit_logs asli. RLS audit_logs_select (schema.sql) HANYA
// super_admin/pimpinan — untuk role lain, listAuditLogs() balik array
// kosong (bukan error), ditangani dengan pesan jelas di bawah, bukan
// dibiarkan kosong tanpa penjelasan.
const AUDIT_ACTION_BADGE = { insert: 'success', update: 'info', delete: 'danger' };
const AUDIT_ACTION_LABEL = { insert: 'Ditambahkan', update: 'Diubah', delete: 'Dihapus' };
// Kartu "Kesehatan Sistem" (schema_100, R4 audit 2026-08-30) — status
// 9 Edge Function, HANYA super_admin/hrd (SYSTEM_HEALTH_ROLES). Kartu
// disembunyikan total (bukan cuma dikosongkan) untuk role lain --
// RPC get_edge_function_health() SUDAH menolak lewat exception untuk
// role selain itu juga (defense in depth, lihat migrasi schema_100),
// tapi cek role di sini dulu supaya tidak perlu round-trip network
// yang pasti gagal untuk role yang jelas tidak berwenang.
const ALERT_LEVEL_BADGE = { critical: 'danger', warning: 'warning', info: 'info', ok: 'success' };
const ALERT_LEVEL_LABEL = { critical: 'Kritis', warning: 'Perhatian', info: 'Info', ok: 'Sehat' };
const HEALTH_CATEGORY_LABEL = { admin_gated: 'Admin', scheduled_daily: 'Terjadwal', general: 'Umum' };

export async function renderSystemHealthCard() {
  const card = document.getElementById('systemHealthCard');
  const list = document.getElementById('systemHealthList');
  if (!card || !list) return;

  if (!SYSTEM_HEALTH_ROLES.includes(state.currentProfile?.role)) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  try {
    const health = await window.dataService.getEdgeFunctionHealth();
    if (!health.length) {
      list.innerHTML = '<p style="color:var(--ink-500);font-size:13px;">Belum ada data invocation Edge Function.</p>';
      return;
    }
    // Fungsi bermasalah (critical/warning/info) ditampilkan lebih dulu --
    // RPC sudah mengurutkan begini, tapi diurutkan ulang di klien juga
    // supaya tidak bergantung diam-diam pada urutan server kalau nanti
    // RPC-nya berubah.
    const order = { critical: 0, warning: 1, info: 2, ok: 3 };
    const sorted = [...health].sort((a, b) => (order[a.alert_level] ?? 9) - (order[b.alert_level] ?? 9));
    list.innerHTML = sorted.map(h => `
      <div style="display:flex;gap:10px;font-size:13px;align-items:center;">
        <span class="badge badge-${ALERT_LEVEL_BADGE[h.alert_level] || 'neutral'}">${ALERT_LEVEL_LABEL[h.alert_level] || h.alert_level}</span>
        <span>${escapeHtml(h.function_name)} <span style="color:var(--ink-500);font-size:11px;">(${HEALTH_CATEGORY_LABEL[h.category] || h.category})</span></span>
        <span style="margin-left:auto;color:var(--ink-500);font-size:11px;" title="${h.invocations_24h} invocation, ${h.errors_24h} error dalam 24 jam terakhir">
          ${h.last_success_at ? `Sukses terakhir: ${formatDate(h.last_success_at)}` : 'Belum pernah sukses'}
        </span>
      </div>`).join('');
  } catch (e) {
    // RPC menolak (exception role check) TERMASUK di sini kalau
    // profiles.role_id lokal di state.currentProfile sempat basi --
    // sembunyikan kartu sepenuhnya alih-alih menampilkan pesan error
    // membingungkan untuk kasus itu, tapi TETAP tampilkan pesan kalau
    // memang kegagalan lain (mis. koneksi).
    if (/akses ditolak/i.test(e?.message || '')) {
      card.style.display = 'none';
      return;
    }
    list.innerHTML = `<p style="color:var(--danger-fg);font-size:13px;">${escapeHtml(friendlyLoadError(e))}</p>`;
  }
}

// Kartu "Aktivitas Terbaru" -- SEKARANG disembunyikan TOTAL (bukan cuma
// dikosongkan/diisi pesan "hanya dapat dilihat oleh...") untuk role di
// luar AUDIT_ROLES, pola SAMA PERSIS dengan "Kesehatan Sistem"
// (SYSTEM_HEALTH_ROLES) tepat di atasnya -- 2026-08-31, bagian dari susun
// ulang dashboard admin ("pilih item"): kartu yang isinya PASTI kosong
// untuk kebanyakan role (HRD/kepala_bagian/dst, cuma super_admin/pimpinan
// yang relevan) sebaiknya tidak memakan slot layar sama sekali, alih-alih
// menampilkan kartu penuh berisi satu baris "tidak berwenang".
export async function renderRecentActivity() {
  const card = document.getElementById('recentActivityCard');
  const el = document.getElementById('recentActivityList');
  if (!el) return;

  if (!AUDIT_ROLES.includes(state.currentProfile?.role)) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = '';

  try {
    const logs = await window.dataService.listAuditLogs();
    el.innerHTML = logs.length
      ? logs.slice(0, 8).map(l => `
      <div style="display:flex;gap:10px;font-size:13px;align-items:center;">
        <span class="badge badge-${AUDIT_ACTION_BADGE[l.action] || 'neutral'}">${AUDIT_ACTION_LABEL[l.action] || l.action}</span>
        <span>Data ${escapeHtml(l.table_name)} ${l.profiles?.full_name ? `oleh ${escapeHtml(l.profiles.full_name)}` : ''}</span>
        <span style="margin-left:auto;color:var(--ink-500);font-size:11px;">${formatDate(l.created_at)}</span>
      </div>`).join('')
      : '<p style="color:var(--ink-500);font-size:13px;">Belum ada aktivitas tercatat.</p>';
  } catch (e) {
    el.innerHTML = `<p style="color:var(--danger-fg);font-size:13px;">${escapeHtml(friendlyLoadError(e))}</p>`;
  }
}


