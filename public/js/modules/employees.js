/* ============================================================
   employees.js — Daftar pegawai (tabel, filter, tambah, ekspor
   xlsx) dan penyimpanan perubahan profil pegawai.
   Dipindahkan dari app.js baris 434-693 & 7792-7934 (P3.1 Tahap 2).

   PEMBARUAN (P3.1 Tahap 19 -- audit TODO 2026-08-30): SEMUA
   referensi window.fn di modul ini sudah diganti `import` sungguhan
   (toast/openModal/closeModal -> ui-shell.js, viewEmployee ->
   employee-profile.js, populateDepartmentSelect/populatePositionSelect
   -> org-chart.js) -- backlog ini terlewat sejak Tahap 2, dibereskan
   sekaligus sekarang sama seperti pola Tahap 7 di auth.js.
   CIRCULAR IMPORT BARU (aman, pola sama seperti Tahap 8/10/11/12/13):
   ui-shell.js sudah import {saveEmployeeChanges, renderEmployeeTable}
   dari modul ini, jadi rantai employees.js -> employee-profile.js ->
   ui-shell.js -> employees.js sekarang melingkar. Aman karena TIDAK
   ada pemanggilan fungsi yang diimpor di top-level modul manapun
   dalam rantai ini -- semua pemanggilan ada di dalam badan fungsi,
   yang baru dieksekusi setelah seluruh modul selesai dimuat.
   ============================================================ */

import { state } from './state.js';
import { ADD_EMPLOYEE_ROLES, EDIT_EMPLOYEE_ROLES, CONTRACT_TYPE_LABEL, HISTORY_TYPE_LABEL, PAYROLL_WRITER_ROLES } from './constants.js';
import { initials, escapeHtml, statusBadge, statusText, formatDate, localDateISO } from './utils.js';
import { toast, openModal, closeModal } from './ui-shell.js';
import { viewEmployee } from './employee-profile.js';
import { populateDepartmentSelect, populatePositionSelect, populateSupervisorSelect } from './org-chart.js';

export function employeeRowHtml(e) {
  // Atasan Langsung -- SENGAJA lookup client-side dari state.employeesCache
  // (yang sudah lengkap-berisi-semua-pegawai untuk role admin yang bisa
  // melihat tabel ini), BUKAN lewat RPC getEmployeeName()/get_employee_name
  // (schema_107) yang dipakai kartu profil individu -- migrasi RPC itu
  // belum dieksekusi ke production per PENDING_ACTIONS.md (dikonfirmasi
  // 404 lewat laporan bug terpisah 2026-09-01). Lookup lokal ini
  // menghindari ketergantungan pada migrasi yang belum live sama sekali,
  // dan untuk ukuran daftar pegawai institusi ini (~40-an baris) performa
  // O(n) per baris tidak jadi masalah nyata.
  const supervisor = e.supervisor_id ? state.employeesCache.find(s => s.id === e.supervisor_id) : null;
  return `
    <tr>
      <td><div class="cell-emp"><div class="avatar" style="width:32px;height:32px;font-size:11px;">${initials(e.full_name)}</div>
        <div><div class="n">${escapeHtml(e.full_name)}</div><div class="s">${escapeHtml(e.employee_code)}</div></div></div></td>
      <td>${escapeHtml(e.position || '—')}</td>
      <td>${supervisor ? escapeHtml(supervisor.full_name) : '—'}</td>
      <td>${escapeHtml(e.unit || '—')}</td>
      <td><span class="badge badge-${statusBadge(e.employment_status)}">${statusText(e.employment_status)}</span></td>
      <td>${escapeHtml(CONTRACT_TYPE_LABEL[e.contract_type] || '—')}</td><td>${e.join_date ? formatDate(e.join_date) : '—'}</td>
      <td><div class="row-actions">
        <button class="icon-btn" style="width:30px;height:30px;" aria-label="Lihat detail pegawai" title="Lihat detail" data-onclick="viewEmployee('${e.id}')"><svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></svg></button>
      </div></td>
    </tr>`;
}

export async function renderEmployeeTable() {
  const body = document.getElementById('empTableBody');
  try {
    state.employeesCache = await window.dataService.listEmployees();
  } catch (e) { toast('Gagal memuat data pegawai: ' + e.message, 'error'); return; }

  body.innerHTML = state.employeesCache.map(employeeRowHtml).join('');

  const countLbl = document.querySelector('#app-employees .content-header p');
  if (countLbl) countLbl.textContent = `${state.employeesCache.length} pegawai terdaftar di seluruh unit kerja`;
  const badgeCount = document.querySelector('[data-app-goto="app-employees"] .badge-count');
  if (badgeCount) badgeCount.textContent = state.employeesCache.length;
  const paginationText = document.getElementById('empPaginationText');
  // BUG DIPERBAIKI: sebelumnya teks ini statis "Menampilkan 1–8 dari 13
  // pegawai" apa pun jumlah pegawai sebenarnya, dan tombol halaman di
  // sampingnya tidak berfungsi sama sekali (dekorasi belaka dari mockup
  // awal) — belum ada logic pagination sungguhan yang dibangun (semua
  // pegawai dirender sekaligus di satu tabel). Diperbaiki jadi jujur:
  // tampilkan jumlah asli, tombol halaman palsu dihapus dari HTML.
  if (paginationText) paginationText.textContent = state.employeesCache.length
    ? `Menampilkan ${state.employeesCache.length} dari ${state.employeesCache.length} pegawai`
    : 'Tidak ada pegawai untuk ditampilkan';

  // Populate opsi filter Unit secara DINAMIS dari data asli — sebelumnya
  // hardcoded ('Tahfidz'/'Akademik'/'Administrasi') yang TIDAK COCOK
  // dengan nilai unit sesungguhnya di data, jadi filter itu tidak akan
  // pernah menemukan apa pun meski diklik.
  const unitFilter = document.getElementById('empUnitFilter');
  if (unitFilter && unitFilter.options.length <= 1) {
    const units = [...new Set(state.employeesCache.map(e => e.unit).filter(Boolean))].sort();
    unitFilter.innerHTML = '<option value="">Semua Unit</option>' + units.map(u => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('');
  }
}

// Ekspor .xlsx seluruh data pegawai (menu "Pegawai") — tombol dibatasi
// ADD_EMPLOYEE_ROLES (Super Admin & HRD) lewat data-requires-add-employee
// karena isinya termasuk data pribadi (NIK, no. HP, email pribadi, alamat).
// Selalu tarik data TERBARU langsung dari dataService (bukan cuma
// employeesCache yang sedang dirender/difilter di tabel) supaya "semua
// informasi terbaru" benar-benar terbaru, meniru pola exportLeaveReportXlsx().
export async function exportEmployeesXlsx() {
  const btn = document.getElementById('empExportBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Menyiapkan…'; }
  try {
    const [employees, departments] = await Promise.all([
      window.dataService.listEmployees(),
      window.dataService.listDepartments().catch(() => []),
    ]);
    if (!employees.length) { toast('Tidak ada data pegawai untuk diekspor'); return; }

    // Pendidikan/Sertifikasi/Karier disimpan di tabel terpisah (satu-ke-
    // banyak per pegawai) — ambil PARALEL per pegawai lalu ringkas jadi
    // satu-dua kalimat per kolom, karena sheet ini satu baris = satu
    // pegawai (bukan sheet detail terpisah). N+1 query aman untuk skala
    // satu yayasan (belasan pegawai); kalau jumlah pegawai membesar jauh,
    // pertimbangkan RPC agregat sisi database.
    const EDU_LEVEL_RANK = { SD: 0, SMP: 1, SMA: 2, D3: 3, S1: 4, S2: 5, S3: 6 };
    const detailByEmployee = await Promise.all(employees.map(async (e) => {
      const [education, certifications, history] = await Promise.all([
        window.dataService.listEducation(e.id).catch(() => []),
        window.dataService.listCertifications(e.id).catch(() => []),
        window.dataService.listEmployeeHistory(e.id).catch(() => []),
      ]);

      let lastEducation = '';
      if (education.length) {
        const top = [...education].sort((a, b) => {
          const rankDiff = (EDU_LEVEL_RANK[b.level] ?? -1) - (EDU_LEVEL_RANK[a.level] ?? -1);
          if (rankDiff !== 0) return rankDiff;
          return (b.graduation_year || 0) - (a.graduation_year || 0);
        })[0];
        lastEducation = `${top.level} — ${top.institution_name}` +
          (top.major ? ` (${top.major}${top.graduation_year ? ', ' + top.graduation_year : ''})` : (top.graduation_year ? ` (${top.graduation_year})` : ''));
      }

      const certificationsSummary = certifications
        .map(c => c.issued_date ? `${c.certification_name} (${new Date(c.issued_date).getFullYear()})` : c.certification_name)
        .join('; ');

      let latestCareer = '';
      if (history.length) {
        const h = history[0]; // sudah terurut effective_date desc dari dataService
        latestCareer = `${HISTORY_TYPE_LABEL[h.event_type] || h.event_type} — ${h.description} (${formatDate(h.effective_date)})`;
      }

      return { lastEducation, certificationsSummary, latestCareer };
    }));

    const deptById = new Map(departments.map(d => [d.id, d.name]));
    const empById = new Map(employees.map(e => [e.id, e.full_name]));
    const STATUS_LABEL = { active: 'Aktif', contract: 'Kontrak', inactive: 'Non-Aktif' };

    const sheetData = employees.map((e, idx) => {
      const pi = e.personal_info || {};
      const ci = e.contact_info || {};
      const ec = e.emergency_contact || {};
      const ktp = pi.ktp_address || {};
      const detail = detailByEmployee[idx];
      return {
        'ID Pegawai': e.employee_code || '',
        'Nama Lengkap': e.full_name || '',
        'Amanah/Jabatan': e.position || '',
        'Unit': e.unit || '',
        'Departemen': deptById.get(e.department_id) || '',
        'Atasan Langsung': empById.get(e.supervisor_id) || '',
        'Status Kepegawaian': STATUS_LABEL[e.employment_status] || e.employment_status || '',
        'Jenis Kontrak': e.contract_type || '',
        'Tanggal Bergabung': e.join_date ? formatDate(e.join_date) : '',
        'NIK': pi.nik || '',
        'Tempat, Tanggal Lahir': pi.birth_place_date || '',
        'Jenis Kelamin': pi.gender || '',
        'No. HP': ci.phone || '',
        'Email Pribadi': ci.personal_email || '',
        'Alamat KTP': ktp.address || '',
        'Kontak Darurat': ec.name ? `${ec.name} (${ec.relation || '-'}) — ${ec.phone || '-'}` : '',
        'Pendidikan Terakhir': detail.lastEducation,
        'Sertifikasi': detail.certificationsSummary,
        'Jenjang Karier Terbaru': detail.latestCareer,
        'Terakhir Diperbarui': e.updated_at ? formatDate(e.updated_at) : '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [
      { wch: 14 }, { wch: 24 }, { wch: 22 }, { wch: 16 }, { wch: 18 },
      { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
      { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 24 }, { wch: 32 },
      { wch: 32 }, { wch: 34 }, { wch: 34 }, { wch: 34 }, { wch: 16 },
    ];
    // Header berwarna per kelompok kolom, supaya sekilas pandang jelas mana
    // Identitas/Jabatan, Kepegawaian, Data Pribadi, Kontak, Riwayat
    // Profesional, dan Metadata — dipakai lewat xlsx-js-style (lihat
    // <script> di index.html), library "xlsx" biasa TIDAK menyimpan style
    // saat menulis file.
    // Kolom ke-i (0-based) → warna isi header (hex tanpa '#') + warna teks.
    const HEADER_PALETTE = [
      { rgb: '1D4ED8' }, // 0 ID Pegawai            } Identitas & Jabatan (biru)
      { rgb: '1D4ED8' }, // 1 Nama Lengkap           }
      { rgb: '1D4ED8' }, // 2 Amanah/Jabatan         }
      { rgb: '1D4ED8' }, // 3 Unit                   }
      { rgb: '15803D' }, // 4 Departemen             } Kepegawaian (hijau)
      { rgb: '15803D' }, // 5 Atasan Langsung        }
      { rgb: '15803D' }, // 6 Status Kepegawaian     }
      { rgb: '15803D' }, // 7 Jenis Kontrak          }
      { rgb: '15803D' }, // 8 Tanggal Bergabung      }
      { rgb: 'B45309' }, // 9 NIK                    } Data Pribadi (amber)
      { rgb: 'B45309' }, // 10 Tempat, Tanggal Lahir }
      { rgb: 'B45309' }, // 11 Jenis Kelamin         }
      { rgb: '6D28D9' }, // 12 No. HP                } Kontak (ungu)
      { rgb: '6D28D9' }, // 13 Email Pribadi         }
      { rgb: '6D28D9' }, // 14 Alamat KTP            }
      { rgb: '6D28D9' }, // 15 Kontak Darurat        }
      { rgb: 'BE185D' }, // 16 Pendidikan Terakhir   } Riwayat Profesional (pink)
      { rgb: 'BE185D' }, // 17 Sertifikasi           }
      { rgb: 'BE185D' }, // 18 Jenjang Karier Terbaru}
      { rgb: '475569' }, // 19 Terakhir Diperbarui   } Metadata (abu-abu)
    ];
    HEADER_PALETTE.forEach((color, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
      if (!ws[cellRef]) return;
      ws[cellRef].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid', fgColor: color },
        alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
        border: {
          top: { style: 'thin', color: { rgb: 'FFFFFF' } },
          bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
          left: { style: 'thin', color: { rgb: 'FFFFFF' } },
          right: { style: 'thin', color: { rgb: 'FFFFFF' } },
        },
      };
    });
    ws['!rows'] = [{ hpt: 28 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Pegawai');
    const today = localDateISO();
    XLSX.writeFile(wb, `data-pegawai-al-falah-${today}.xlsx`);
  } catch (e) {
    toast('Gagal mengekspor data pegawai: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /></svg> Ekspor'; }
  }
}

// Search box + filter Unit/Status — sebelumnya murni dekoratif, sama
// sekali tidak ter-wire ke JS. Filter CLIENT-SIDE dari employeesCache
// yang sudah dimuat (tidak perlu request baru — daftar pegawai untuk
// skala satu yayasan cukup kecil untuk difilter di browser).
export function applyEmployeeFilters() {
  const query = (document.getElementById('empSearchInput')?.value || '').toLowerCase().trim();
  const unit = document.getElementById('empUnitFilter')?.value || '';
  const status = document.getElementById('empStatusFilter')?.value || '';

  const filtered = state.employeesCache.filter(e => {
    const matchesQuery = !query || e.full_name.toLowerCase().includes(query) || (e.employee_code || '').toLowerCase().includes(query);
    const matchesUnit = !unit || e.unit === unit;
    const matchesStatus = !status || e.employment_status === status;
    return matchesQuery && matchesUnit && matchesStatus;
  });

  const body = document.getElementById('empTableBody');
  body.innerHTML = filtered.map(employeeRowHtml).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--ink-500);padding:24px;">Tidak ada pegawai yang cocok dengan filter ini</td></tr>`;

  const paginationText = document.getElementById('empPaginationText');
  if (paginationText) paginationText.textContent = `Menampilkan ${filtered.length} dari ${state.employeesCache.length} pegawai`;
}

export function openAddEmployeeModal() {
  populateDepartmentSelect('empDepartment');
  populatePositionSelect('empPositionId');
  // Atasan Langsung: person-based (employees.supervisor_id), BUKAN lagi
  // position-based (supervisor_position_id) -- diubah atas permintaan
  // eksplisit user 2026-08-31, menerima trade-off harus di-reassign
  // manual tiap kali pemegang jabatan berganti (lihat helper text form).
  populateSupervisorSelect('empSupervisor');
  openModal('employeeModal');
}

export async function createEmployee() {
  // Hanya Super Admin & HRD (lihat ADD_EMPLOYEE_ROLES) — kepala_bagian
  // sengaja TIDAK diikutkan sejak keputusan mencabut hak tambah pegawainya.
  // Ini pengecekan kenyamanan UI saja; RLS employees_insert di schema.sql
  // yang jadi otoritas sesungguhnya dan akan menolak kalau ini dilewati.
  if (!ADD_EMPLOYEE_ROLES.includes(state.currentProfile?.role)) { toast('Anda tidak memiliki izin menambah pegawai — hanya Super Admin dan HRD'); return; }
  const payload = {
    employee_code: document.getElementById('empCode').value.trim(),
    full_name: document.getElementById('empName').value.trim(),
    position: document.getElementById('empPosition').value.trim(),
    unit: document.getElementById('empUnit').value.trim(),
    department_id: document.getElementById('empDepartment')?.value || null,
    position_id: document.getElementById('empPositionId')?.value || null,
    supervisor_id: document.getElementById('empSupervisor')?.value || null,
    employment_status: document.getElementById('empStatus').value,
    contract_type: document.getElementById('empContractType').value.trim() || null,
    join_date: document.getElementById('empJoinDate').value || null,
  };
  if (!payload.employee_code || !payload.full_name) { toast('ID Pegawai dan Nama wajib diisi'); return; }

  const result = await window.dataService.createEmployee(payload);
  if (!result.ok) { toast('Gagal menyimpan: ' + result.error, 'error'); return; }
  closeModal('employeeModal');
  toast('Pegawai berhasil ditambahkan');
  document.getElementById('employeeForm').reset();
  renderEmployeeTable();
}

export async function saveEmployeeChanges() {
  const id = window.__activeEmployeeId;
  if (!id) { toast('Tidak ada pegawai aktif'); return; }
  // Bukan gate tunggal lagi: EDIT_EMPLOYEE_ROLES/kepala_bagian boleh ubah
  // field apa pun; pemilik data sendiri (guru/pegawai atas datanya sendiri)
  // tetap boleh menyimpan tab Personal/Kontak/Kontak Darurat miliknya —
  // otoritas sesungguhnya ada di trigger employees_protect_privileged_fields
  // di schema.sql yang menolak di level database kalau field kepegawaian
  // (position/unit/department_id/dst) diubah oleh non-admin/non-kepala.
  // (Ini soal EDIT pegawai yang sudah ada — beda dari ADD_EMPLOYEE_ROLES
  // yang mengatur siapa boleh membuat pegawai BARU, lihat createEmployee().)
  const isPrivileged = EDIT_EMPLOYEE_ROLES.includes(state.currentProfile?.role);
  const isSelf = state.currentProfile?.employee_id === id;
  if (!isPrivileged && !isSelf) { toast('Anda tidak memiliki izin mengubah data ini'); return; }

  const get = (elId) => document.getElementById(elId)?.value?.trim();
  const payload = {};
  if (isPrivileged) {
    // BUG YANG DIPERBAIKI: full_name SEBELUMNYA cuma ditulis ke
    // personal_info.full_name (JSONB) di bawah — bukan ke kolom
    // employees.full_name asli yang dipakai psName/avatar/tabel
    // pegawai di seluruh aplikasi. Dipindah ke sini (top-level payload,
    // gated isPrivileged) karena full_name memang salah satu kolom
    // yang dilindungi trigger employees_protect_privileged_fields
    // (employee_code/full_name/position/unit/dst) — non-privileged
    // tidak akan pernah bisa menyimpannya di database manapun, jadi
    // field-nya sekarang juga di-disable untuk mereka di viewEmployee()
    // (jujur soal batasan yang sudah ada, bukan aturan baru).
    if (document.getElementById('empEditFullName')) payload.full_name = get('empEditFullName');
    if (document.getElementById('empEditCode')) payload.employee_code = get('empEditCode');
    if (document.getElementById('empEditPosition')) payload.position = get('empEditPosition');
    if (document.getElementById('empEditUnit')) payload.unit = get('empEditUnit');
    if (document.getElementById('empEditJoinDate')) payload.join_date = get('empEditJoinDate') || null;
    if (document.getElementById('empEditContractType')) payload.contract_type = get('empEditContractType') || null;
    if (document.getElementById('empEditContractStartDate')) payload.contract_start_date = get('empEditContractStartDate') || null;
    if (document.getElementById('empEditContractEndDate')) payload.contract_end_date = get('empEditContractEndDate') || null;
    if (document.getElementById('empEditProbationEndDate')) payload.probation_end_date = get('empEditProbationEndDate') || null;
    if (document.getElementById('empEditStatus')) payload.employment_status = document.getElementById('empEditStatus').value;
    if (document.getElementById('empEditDepartment')) payload.department_id = document.getElementById('empEditDepartment').value || null;
    if (document.getElementById('empEditPositionId')) payload.position_id = document.getElementById('empEditPositionId').value || null;
    if (document.getElementById('empEditSupervisor')) payload.supervisor_id = document.getElementById('empEditSupervisor').value || null;
    if (document.getElementById('empEditAdditionalPosition1')) payload.additional_position_1 = get('empEditAdditionalPosition1') || null;
    if (document.getElementById('empEditAdditionalUnit1')) payload.additional_unit_1 = get('empEditAdditionalUnit1') || null;
    if (document.getElementById('empEditAdditionalSupervisor1')) payload.additional_supervisor_id_1 = document.getElementById('empEditAdditionalSupervisor1').value || null;
    if (document.getElementById('empEditAdditionalPosition2')) payload.additional_position_2 = get('empEditAdditionalPosition2') || null;
    if (document.getElementById('empEditAdditionalUnit2')) payload.additional_unit_2 = get('empEditAdditionalUnit2') || null;
    if (document.getElementById('empEditAdditionalSupervisor2')) payload.additional_supervisor_id_2 = document.getElementById('empEditAdditionalSupervisor2').value || null;
  }

  if (document.getElementById('empEditNIK')) {
    payload.personal_info = {
      title: get('empEditTitle'),
      nik: get('empEditNIK'),
      birth_place_date: get('empEditBirthPlace'),
      npwp: get('empEditNPWP'),
      gender: document.getElementById('empEditGender')?.value,
      religion: document.getElementById('empEditReligion')?.value || null,
      marital_status: document.getElementById('empEditMaritalStatus')?.value || null,
      nationality: get('empEditNationality') || null,
      blood_type: document.getElementById('empEditBloodType')?.value || null,
      spouse_name: get('empEditSpouseName') || null,
      children_count: document.getElementById('empEditChildrenCount')?.value ? parseInt(document.getElementById('empEditChildrenCount').value) : null,
      dependents_count: document.getElementById('empEditDependentsCount')?.value ? parseInt(document.getElementById('empEditDependentsCount').value) : null,
      ktp_address: {
        address: get('empEditKtpAddress') || null,
        province: get('empEditKtpProvince') || null,
        regency: get('empEditKtpRegency') || null,
        district: get('empEditKtpDistrict') || null,
        village: get('empEditKtpVillage') || null,
      },
    };
    payload.emergency_contact = {
      name: get('empEditEmergencyName'),
      relation: get('empEditEmergencyRelation'),
      phone: get('empEditEmergencyPhone'),
    };
  }
  if (document.getElementById('empEditPhone')) {
    payload.contact_info = {
      phone: get('empEditPhone'),
      personal_email: get('empEditPersonalEmail'),
      office_email: get('empEditOfficeEmail'),
      address: get('empEditAddress'),
    };
  }

  if (!Object.keys(payload).length) { toast('Tidak ada perubahan untuk disimpan'); return; }
  if ('employee_code' in payload && !payload.employee_code) { toast('ID Pegawai tidak boleh dikosongkan'); return; }

  const result = await window.dataService.updateEmployee(id, payload);
  if (!result.ok) { toast('Gagal menyimpan: ' + result.error, 'error'); return; }
  toast('Perubahan berhasil disimpan');
  // BUG: sebelumnya cuma renderEmployeeTable() dipanggil di sini — itu
  // me-refresh tabel DAFTAR pegawai (yang tidak sedang terlihat di layar
  // profil ini), TAPI tidak pernah memanggil ulang viewEmployee(id), yang
  // justru fungsi yang mengisi hero card/tab/badge "Kelengkapan profil".
  // Akibatnya layar profil tetap menampilkan data LAMA setelah Simpan,
  // sampai pengguna pindah halaman lalu balik lagi. employeesCache juga
  // di-refresh dulu di sini (bukan cuma di renderEmployeeTable) supaya
  // viewEmployee() di bawah tidak membaca entri cache yang basi.
  state.employeesCache = [];
  await viewEmployee(id);
  renderEmployeeTable();
}

// Menautkan/mengubah/menghapus employees.amanah_id — SENGAJA function
// TERPISAH dari saveEmployeeChanges() di atas, memanggil
// dataService.linkEmployeeAmanah() (RPC link_employee_amanah, schema_84)
// alih-alih updateEmployee() biasa. Lihat catatan panjang di
// empEditAmanahHelper/schema_84 kenapa jalur ini dipisah: RLS
// employees_update (schema_25) tidak menyertakan is_bendahara(), jadi
// Bendahara Umum HARUS lewat RPC ini, tidak bisa lewat updateEmployee()
// langsung. super_admin/pimpinan tetap boleh pakai jalur ini juga demi
// konsistensi satu jalur untuk semua role penulis gaji.
export async function saveEmployeeAmanahLink() {
  const id = window.__activeEmployeeId;
  if (!id) { toast('Tidak ada pegawai aktif'); return; }
  if (!PAYROLL_WRITER_ROLES.includes(state.currentProfile?.role)) { toast('Hanya Super Admin, Pimpinan, atau Bendahara Umum yang dapat menautkan amanah'); return; }
  const amanahId = document.getElementById('empEditAmanahId')?.value || null;
  const selectedLabel = document.getElementById('empEditAmanahId')?.selectedOptions?.[0]?.textContent || '— Tidak ditautkan —';
  if (!confirm(`Tautkan pegawai ini ke amanah "${selectedLabel}"?\n\nGaji dasar & tunjangan risiko pegawai akan LANGSUNG diganti mengikuti nominal rujukan amanah ini.`)) return;

  const result = await window.dataService.linkEmployeeAmanah(id, amanahId);
  if (!result.ok) { toast('Gagal menautkan amanah: ' + result.error, 'error'); return; }
  toast('Amanah berhasil ditautkan — gaji dasar & tunjangan risiko ikut diperbarui');
  state.employeesCache = [];
  await viewEmployee(id);
  renderEmployeeTable();
}


