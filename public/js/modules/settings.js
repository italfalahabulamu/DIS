/* ============================================================
   settings.js — Pengaturan: Profil Institusi (nama, alamat, logo,
   WRITE hanya super_admin), Manajemen Shift, Kutipan Login (rotasi
   harian), Template Dokumen (upload/generate surat dari template),
   pemasangan brand mark + kutipan login saat aplikasi dimuat
   (applyInstitutionBrandMark/applyLoginQuote), dan header institusi
   di topbar (renderTopbarInstitutionHeader/fitInstitutionNameToWidth).
   Dipindahkan dari app.js baris 5758-6269 DAN 2257-2319 (P3.1 Tahap 7)
   -- dua rentang terpisah, digabung karena keduanya "Pengaturan
   Institusi" secara tematik meski jauh posisinya di app.js lama.

   CATATAN: renderTopbarInstitutionHeader()/fitInstitutionNameToWidth()
   ini PERSIS 2 fungsi yang sejak Tahap 4 sengaja DIKECUALIKAN dari
   employee-profile.js dengan janji "menyusul ke settings.js" --
   janji itu SEMPAT TERLEWAT saat settings.js pertama ditulis (baris
   5758-6269 tidak mencakup lokasi asli keduanya di baris 2257-2319),
   ketahuan & dibereskan sekaligus saat auth.js di-cross-import penuh
   di Tahap 7 yang sama (lihat auth.js -- applyInstitutionBrandMark/
   applyLoginQuote sudah lama menunjuk ke sini via window.fn sejak
   Tahap 2, sekarang keduanya benar-benar hidup di sini).

   dayOfYear() TIDAK dicopy ke sini -- sudah canonical di utils.js
   sejak Tahap 1, identik persis dengan definisi lokal lama.

   4 `let` yang tadinya lokal (__shiftsCache, __loginQuotesCache,
   __genDocTemplateId, __genDocLetterTypesCache) TIDAK dicopy --
   sudah di state.js sejak Tahap 1; modul ini baca/tulis semuanya
   lewat `state.x` (pola sama seperti org-chart.js Tahap 5).

   STATUS TRANSISI: modul ini TIDAK punya window.fn tersisa.

   --- PEMBARUAN P3.1 Tahap 17 ---
   TAMBAHAN CAKUPAN: Backup Bulanan (app.js baris 6407-6749, header
   "BACKUP BULANAN (Pengaturan → Backup Data)") -- 5 fungsi (+1 const
   lokal) DITAMBAHKAN ke modul ini di Tahap 17, TERPISAH dari 2
   rentang asli Tahap 7 di atas (jarak jauh di app.js lama, tapi
   SECARA MENU sama-sama "Pengaturan"). Keputusan cakupan ini
   SENGAJA ditunda sejak Tahap 11 (saat gap-nya pertama ditemukan di
   tengah rentang leave.js) sampai Tahap 16 selesai (semua modul
   render lain sudah pasti bukan tujuannya) -- lihat riwayat
   keputusan lengkap di docs/MIGRATION_ES_MODULES.md bagian Tahap 17.
   Fitur ini SUDAH diantisipasi sejak Tahap 6/7: gating
   `backupDataCard` di `renderSettingsScreen()` (di atas) sudah lebih
   dulu menyebut nama fungsi `backupMonthlyData()` secara eksplisit
   di komentarnya, jauh sebelum fungsinya sendiri benar-benar
   dipindah ke sini.

   6 const yang dipakai (MONTH_NAMES, LEAVE_STATUS_LABEL,
   PERF_STATUS_LABEL, HISTORY_TYPE_LABEL, COMPETENCY_TYPE_LABEL,
   ROLE_LABEL) SEMUA sudah canonical di constants.js dari tahap-tahap
   sebelumnya -- TIDAK ada promosi baru di Tahap 17. **Titik penting
   untuk cutover:** ini adalah PEMAKAI TERAKHIR yang tersisa dari
   `PERF_STATUS_LABEL` sebagai const global classic-script (dicatat
   sejak Tahap 13/16) -- begitu Tahap 17 ini selesai, salinan
   duplikat PERF_STATUS_LABEL/BADGE di app.js (~baris 3672) SECARA
   TEKNIS sudah tidak dibaca modul ES manapun lagi, sama seperti 4
   const lain (PAYROLL_VIEWER_ROLES/PAYSLIP_STATUS_LABEL/MONTH_NAMES/
   PAYROLL_PERIOD_STATUS_LABEL) yang sudah aman sejak reports.js
   Tahap 13. TETAP TIDAK dihapus di tahap ini (app.js masih runtime
   aktif), keputusan penghapusan tetap di tahap cutover terakhir.

   `BACKUP_XLSX_HEADER_COLOR` TETAP lokal (tidak diekspor) -- hanya
   dipakai di dalam modul ini sendiri.

   `XLSX`/`JSZip`/`window.jspdf` (semua via CDN, lihat index.html)
   dipakai sebagai referensi GLOBAL BARE (bukan `import`) -- pola
   sama seperti modul lain (payroll.js/leave.js/dashboard.js).

   `backupMonthlyData()` HANYA direferensikan lewat `data-onclick`
   di index.html (tombol "Backup Bulanan") -- tidak ada modul ES
   lain yang perlu meng-`import`-nya.

   STATUS TRANSISI (Tahap 17): modul ini MASIH TIDAK punya window.fn
   tersisa untuk dirinya sendiri.
   ============================================================ */

import { state } from './state.js';
import { MONTH_NAMES, LEAVE_STATUS_LABEL, PERF_STATUS_LABEL, HISTORY_TYPE_LABEL, COMPETENCY_TYPE_LABEL, ROLE_LABEL } from './constants.js'; // P3.1 Tahap 17 -- dipakai Backup Bulanan
import { escapeHtml, formatDate, formatDateTime, friendlyLoadError, dayOfYear, localDateISO, compressImageIfNeeded } from './utils.js';
import { toast, openModal, closeModal } from './ui-shell.js';
import { downloadGeneratedDocument } from './documents-print.js'; // P3.1 Tahap 15 -- sebelumnya referensi global bare (window.downloadGeneratedDocument, fungsi belum punya modul ES), sekarang import eksplisit. documents-print.js TIDAK import apa pun dari settings.js, tidak ada circular import baru.


/* ============================================================
   PENGATURAN — Profil Institusi (nama, alamat, logo). WRITE hanya
   super_admin (schema_12).
   ============================================================ */
export async function renderSettingsScreen() {
  try {
    const settings = await window.dataService.getInstitutionSettings();
    document.getElementById('settingsName').value = settings?.name || '';
    document.getElementById('settingsAddress').value = settings?.address || '';
    const waGroupInput = document.getElementById('settingsWhatsappGroupUrl');
    if (waGroupInput) waGroupInput.value = settings?.whatsapp_group_url || '';
    const preview = document.getElementById('settingsLogoPreview');
    if (settings?.logo_url) {
      const url = await window.dataService.getInstitutionLogoUrl(settings.logo_url);
      preview.innerHTML = `<img src="${url}" alt="Logo" style="width:100%;height:100%;object-fit:contain;" />`;
    } else {
      preview.textContent = '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M14 21v-3a2 2 0 0 0-4 0v3" /><path d="M18 4.933V21" /><path d="m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6" /><path d="m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11" /><path d="M6 4.933V21" /><circle cx="12" cy="9" r="2" /></svg>';
    }

    const canWrite = state.currentProfile?.role === 'super_admin';
    document.getElementById('settingsName').disabled = !canWrite;
    document.getElementById('settingsAddress').disabled = !canWrite;
    const waGroupInputEl = document.getElementById('settingsWhatsappGroupUrl');
    if (waGroupInputEl) waGroupInputEl.disabled = !canWrite;
    document.getElementById('settingsSaveBtn').style.display = canWrite ? '' : 'none';
    document.getElementById('settingsLogoBtn').style.display = canWrite ? '' : 'none';
    document.getElementById('settingsReadOnlyNote').style.display = canWrite ? 'none' : '';
    document.getElementById('docTemplateUploadBtn').style.display = canWrite ? '' : 'none';
    // Backup Data: hanya super_admin (BUKAN pola sama seperti Profil
    // Institusi/Template Dokumen di atas kebetulan sama-sama super_admin
    // saja, tapi alasannya beda — di sini karena paket backup
    // menggabungkan data gaji + disipliner + data pribadi sekaligus,
    // bukan cuma soal siapa yang boleh MENGUBAH pengaturan. Lihat
    // backupMonthlyData().
    document.getElementById('backupDataCard').style.display = canWrite ? '' : 'none';
    await renderDocumentTemplatesList();
    await renderShiftsList();
    await renderLoginQuotesList();
  } catch (e) {
    toast('Gagal memuat pengaturan: ' + e.message, 'error');
  }
}

/* ---- Shift Kerja (Pengaturan, schema_67) — otorisasi tulis (tambah/
   edit) ditegakkan di window.dataService/RLS shifts_insert/update (super_admin
   & hrd), hapus dibatasi lebih ketat (super_admin saja, shifts_delete).
   Tombol di sini cuma kenyamanan UI, bukan satu-satunya penjagaan —
   pola sama seperti Template Dokumen di atas. ---- */
export async function renderShiftsList() {
  const el = document.getElementById('shiftsList');
  if (!el) return;
  const role = state.currentProfile?.role;
  const canWrite = role === 'super_admin' || role === 'hrd';
  const canDelete = role === 'super_admin';
  document.getElementById('shiftAddBtn').style.display = canWrite ? '' : 'none';
  try {
    const shifts = await window.dataService.listShifts();
    el.innerHTML = shifts.length
      ? shifts.map(s => `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="min-width:0;">
            <div style="font-weight:600;font-size:13.5px;">${escapeHtml(s.name)}${s.is_default ? ' <span class="badge badge-neutral">Default</span>' : ''}</div>
            <div style="font-size:12px;color:var(--ink-500);margin-top:2px;">${(s.start_time || '').slice(0,5)} – ${(s.end_time || '').slice(0,5)} · toleransi telat ${s.late_grace_minutes ?? 15} menit</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            ${canWrite ? `<button class="btn btn-ghost btn-sm" data-onclick="openShiftModal('${s.id}')" title="Edit"><svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M13 21h8" /><path d="m15 5 4 4" /><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /></svg></button>` : ''}
            ${canDelete ? `<button class="btn btn-ghost btn-sm" data-onclick="deleteShiftUI('${s.id}', '${escapeHtml(s.name)}')" title="Hapus"><svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>️</button>` : ''}
          </div>
        </div>`).join('')
      : '<p style="color:var(--ink-500);">Belum ada shift kerja ditambahkan.</p>';
  } catch (e) {
    el.innerHTML = `<p style="color:var(--danger-fg);">${escapeHtml(friendlyLoadError(e))}</p>`;
  }
}

export async function openShiftModal(id) {
  document.getElementById('shiftForm')?.reset();
  document.getElementById('shiftEditId').value = id || '';
  document.getElementById('shiftModalTitle').textContent = id ? 'Edit Shift' : 'Tambah Shift';
  if (id) {
    if (!state.__shiftsCache.length) state.__shiftsCache = await window.dataService.listShifts();
    const s = state.__shiftsCache.find(x => x.id === id) || (await window.dataService.listShifts()).find(x => x.id === id);
    if (s) {
      document.getElementById('shiftName').value = s.name;
      document.getElementById('shiftStartTime').value = (s.start_time || '').slice(0, 5);
      document.getElementById('shiftEndTime').value = (s.end_time || '').slice(0, 5);
      document.getElementById('shiftLateGrace').value = s.late_grace_minutes ?? 15;
      document.getElementById('shiftEarlyGrace').value = s.early_out_grace_minutes ?? 15;
      document.getElementById('shiftEarliestCheckIn').value = (s.earliest_check_in || '06:00').slice(0, 5);
      document.getElementById('shiftIsDefault').checked = !!s.is_default;
    }
  } else {
    document.getElementById('shiftEarliestCheckIn').value = '06:00';
  }
  openModal('shiftModal');
}

export async function submitShift() {
  const id = document.getElementById('shiftEditId').value;
  const name = document.getElementById('shiftName').value.trim();
  const startTime = document.getElementById('shiftStartTime').value;
  const endTime = document.getElementById('shiftEndTime').value;
  if (!name) { toast('Nama shift wajib diisi'); return; }
  if (!startTime || !endTime) { toast('Jam masuk dan jam pulang wajib diisi'); return; }

  const payload = {
    name,
    start_time: startTime,
    end_time: endTime,
    late_grace_minutes: parseInt(document.getElementById('shiftLateGrace').value, 10) || 0,
    early_out_grace_minutes: parseInt(document.getElementById('shiftEarlyGrace').value, 10) || 0,
    earliest_check_in: document.getElementById('shiftEarliestCheckIn').value || '06:00',
    is_default: document.getElementById('shiftIsDefault').checked,
  };

  const btn = document.getElementById('shiftSubmitBtn');
  btn.disabled = true; btn.textContent = 'Menyimpan…';
  try {
    const result = id
      ? await window.dataService.updateShift(id, payload)
      : await window.dataService.createShift(payload);
    if (!result.ok) { toast('Gagal menyimpan shift: ' + result.error, 'error'); return; }
    toast(id ? 'Shift diperbarui' : 'Shift ditambahkan');
    closeModal('shiftModal');
    state.__shiftsCache = [];
    renderShiftsList();
  } finally {
    btn.disabled = false; btn.textContent = 'Simpan';
  }
}

export async function deleteShiftUI(id, name) {
  if (!confirm(`Hapus shift "${name}"? Pegawai yang ditugaskan ke shift ini akan kembali ke shift default.`)) return;
  const result = await window.dataService.deleteShift(id);
  if (!result.ok) { toast('Gagal menghapus: ' + result.error, 'error'); return; }
  toast('Shift dihapus');
  state.__shiftsCache = [];
  renderShiftsList();
}

/* ---- Kutipan Halaman Login (Pengaturan) — pola identik Shift Kerja
   di atas: render list + modal add/edit + hapus, tulis dibatasi
   super_admin (ditegakkan RLS login_quotes_write, schema_73). Bagian
   tampil-di-layar-Login (bukan CRUD) ada di applyInstitutionBrandMark
   sekitarnya -- lihat pickDailyLoginQuote() & applyLoginQuote(). */
export async function renderLoginQuotesList() {
  const el = document.getElementById('loginQuotesList');
  if (!el) return;
  const canWrite = state.currentProfile?.role === 'super_admin';
  document.getElementById('loginQuoteAddBtn').style.display = canWrite ? '' : 'none';
  try {
    const quotes = await window.dataService.listLoginQuotes();
    el.innerHTML = quotes.length
      ? quotes.map(q => `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="min-width:0;">
            <div style="font-size:13.5px;line-height:1.4;">"${escapeHtml(q.quote_text)}"${q.is_active ? '' : ' <span class="badge badge-neutral">Nonaktif</span>'}</div>
            ${q.quote_source ? `<div style="font-size:12px;color:var(--ink-500);margin-top:2px;">— ${escapeHtml(q.quote_source)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            ${canWrite ? `<button class="btn btn-ghost btn-sm" data-onclick="openLoginQuoteModal('${q.id}')" title="Edit"><svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M13 21h8" /><path d="m15 5 4 4" /><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /></svg></button>` : ''}
            ${canWrite ? `<button class="btn btn-ghost btn-sm" data-onclick="deleteLoginQuoteUI('${q.id}')" title="Hapus"><svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>️</button>` : ''}
          </div>
        </div>`).join('')
      : '<p style="color:var(--ink-500);">Belum ada kutipan ditambahkan — layar Login menampilkan kutipan bawaan sebagai fallback.</p>';
  } catch (e) {
    el.innerHTML = `<p style="color:var(--danger-fg);">${escapeHtml(friendlyLoadError(e))}</p>`;
  }
}

export async function openLoginQuoteModal(id) {
  document.getElementById('loginQuoteForm')?.reset();
  document.getElementById('loginQuoteEditId').value = id || '';
  document.getElementById('loginQuoteModalTitle').textContent = id ? 'Edit Kutipan' : 'Tambah Kutipan';
  document.getElementById('loginQuoteIsActive').checked = true;
  document.getElementById('loginQuoteOrder').value = 0;
  if (id) {
    if (!state.__loginQuotesCache.length) state.__loginQuotesCache = await window.dataService.listLoginQuotes();
    const q = state.__loginQuotesCache.find(x => x.id === id) || (await window.dataService.listLoginQuotes()).find(x => x.id === id);
    if (q) {
      document.getElementById('loginQuoteText').value = q.quote_text;
      document.getElementById('loginQuoteSource').value = q.quote_source || '';
      document.getElementById('loginQuoteOrder').value = q.display_order ?? 0;
      document.getElementById('loginQuoteIsActive').checked = !!q.is_active;
    }
  }
  openModal('loginQuoteModal');
}

export async function submitLoginQuote() {
  const id = document.getElementById('loginQuoteEditId').value;
  const quoteText = document.getElementById('loginQuoteText').value.trim();
  if (!quoteText) { toast('Teks kutipan wajib diisi'); return; }

  const payload = {
    quote_text: quoteText,
    quote_source: document.getElementById('loginQuoteSource').value.trim() || null,
    display_order: parseInt(document.getElementById('loginQuoteOrder').value, 10) || 0,
    is_active: document.getElementById('loginQuoteIsActive').checked,
  };

  const btn = document.getElementById('loginQuoteSubmitBtn');
  btn.disabled = true; btn.textContent = 'Menyimpan…';
  try {
    const result = id
      ? await window.dataService.updateLoginQuote(id, payload)
      : await window.dataService.createLoginQuote(payload);
    if (!result.ok) { toast('Gagal menyimpan kutipan: ' + result.error, 'error'); return; }
    toast(id ? 'Kutipan diperbarui' : 'Kutipan ditambahkan');
    closeModal('loginQuoteModal');
    state.__loginQuotesCache = [];
    renderLoginQuotesList();
  } finally {
    btn.disabled = false; btn.textContent = 'Simpan';
  }
}

export async function deleteLoginQuoteUI(id) {
  if (!confirm('Hapus kutipan ini?')) return;
  const result = await window.dataService.deleteLoginQuote(id);
  if (!result.ok) { toast('Gagal menghapus: ' + result.error, 'error'); return; }
  toast('Kutipan dihapus');
  state.__loginQuotesCache = [];
  renderLoginQuotesList();
}

/* ---- Template Dokumen (Pengaturan) — contoh format surat/dokumen resmi
   yang diunggah Super Admin untuk rujukan staf lain. Otorisasi tulis
   (unggah/hapus) ditegakkan di window.dataService (meniru RLS
   document_templates_insert/delete, schema_28) — di sini cuma
   menyembunyikan tombolnya untuk kenyamanan UI, bukan satu-satunya
   penjagaan. TOMBOL "Generate" SUDAH DIPINDAH ke menu Manajemen
   Dokumen → Jenis Surat & Kriteria Penomoran (diminta user) -- di sana
   Jenis Dokumen otomatis terkunci ke jenis surat baris template
   ditautkan (document_type_key), bukan dropdown bebas yang bisa salah
   pilih. Menu ini sekarang murni unggah/unduh/hapus BLANKO template,
   bukan titik pemicu generate lagi. ---- */
export async function renderDocumentTemplatesList() {
  const el = document.getElementById('documentTemplatesList');
  if (!el) return;
  const canWrite = state.currentProfile?.role === 'super_admin';
  try {
    const templates = await window.dataService.listDocumentTemplates();
    el.innerHTML = templates.length
      ? templates.map(t => `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="min-width:0;">
            <div style="font-weight:600;font-size:13.5px;">${escapeHtml(t.name)}</div>
            ${t.description ? `<div style="font-size:12px;color:var(--ink-500);margin-top:2px;">${escapeHtml(t.description)}</div>` : ''}
            <div style="font-size:11.5px;color:var(--ink-500);margin-top:4px;">${escapeHtml(t.file_name)} · diunggah ${formatDate(t.uploaded_at)}${t.profiles?.full_name ? ' oleh ' + escapeHtml(t.profiles.full_name) : ''}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button class="btn btn-ghost btn-sm" data-onclick="downloadDocumentTemplate('${escapeHtml(t.file_url)}')"><svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /></svg> Unduh</button>
            ${canWrite ? `<button class="btn btn-ghost btn-sm" data-onclick="deleteDocumentTemplateUI('${t.id}', '${escapeHtml(t.file_url)}', '${escapeHtml(t.name)}')" title="Hapus"><svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>️</button>` : ''}
          </div>
        </div>`).join('')
      : '<p style="color:var(--ink-500);">Belum ada template dokumen diunggah.</p>';
  } catch (e) {
    el.innerHTML = `<p style="color:var(--danger-fg);">${escapeHtml(friendlyLoadError(e))}</p>`;
  }
}

export function openDocumentTemplateModal() {
  document.getElementById('documentTemplateForm')?.reset();
  openModal('documentTemplateModal');
}

export async function submitDocumentTemplate() {
  const name = document.getElementById('docTplName').value.trim();
  const description = document.getElementById('docTplDescription').value.trim();
  const file = document.getElementById('docTplFile').files[0];
  if (!name) { toast('Nama template wajib diisi'); return; }
  if (!file) { toast('Pilih file terlebih dahulu'); return; }
  if (file.size > 10 * 1024 * 1024) { toast('Ukuran file maksimal 10MB'); return; }

  const btn = document.getElementById('docTplSubmitBtn');
  btn.disabled = true; btn.textContent = 'Mengunggah…';
  try {
    const result = await window.dataService.uploadDocumentTemplate({ name, description, file });
    if (!result.ok) { toast('Gagal mengunggah: ' + result.error, 'error'); return; }
    toast('Template dokumen berhasil diunggah');
    closeModal('documentTemplateModal');
    renderDocumentTemplatesList();
  } finally {
    btn.disabled = false; btn.textContent = 'Unggah';
  }
}

export async function downloadDocumentTemplate(fileUrl) {
  try {
    const url = await window.dataService.getDocumentTemplateSignedUrl(fileUrl);
    window.open(url, '_blank');
  } catch (e) {
    toast('Gagal mengunduh: ' + e.message);
  }
}

export async function deleteDocumentTemplateUI(id, fileUrl, name) {
  if (!confirm(`Hapus template "${name}"? Tindakan ini tidak dapat dibatalkan.`)) return;
  const result = await window.dataService.deleteDocumentTemplate(id, fileUrl);
  if (!result.ok) { toast('Gagal menghapus: ' + result.error, 'error'); return; }
  toast('Template dihapus');
  renderDocumentTemplatesList();
}

/* ---- Generate Dokumen (mail-merge, Edge Function generate-document) ----
   Dipanggil SATU-SATUNYA dari kolom "Template Surat" di menu Manajemen
   Dokumen → Jenis Surat & Kriteria Penomoran (dipindah dari Pengaturan
   → Template Dokumen, diminta user) -- selalu dengan presetTypeKey
   terisi (template di sana SUDAH tertaut ke jenis surat tertentu lewat
   document_type_key), jadi dropdown Jenis Dokumen dikunci ke situ,
   tidak lagi dropdown bebas yang bisa salah pilih jenis surat vs
   template. Parameter presetTypeKey dibuat opsional (bukan wajib) demi
   keluwesan kalau suatu saat ada pemanggil lain, bukan karena masih
   dipakai dari Pengaturan. ---- */
export async function openGenerateDocumentModal(templateId, templateName, presetTypeKey) {
  state.__genDocTemplateId = templateId;
  document.getElementById('generateDocumentForm')?.reset();
  document.getElementById('genDocTemplateName').textContent = `Template: ${templateName}`;
  const select = document.getElementById('genDocEmployeeSelect');
  select.innerHTML = '<option value="">Memuat daftar pegawai…</option>';
  const typeSelect = document.getElementById('genDocType');
  typeSelect.innerHTML = '<option value="">Memuat…</option>';
  typeSelect.disabled = false;
  const unitSelect = document.getElementById('genDocIssuingUnit');
  unitSelect.innerHTML = '<option value="">Memuat…</option>';
  document.getElementById('genDocIssuingUnitField').style.display = 'none';
  openModal('generateDocumentModal');
  try {
    if (!state.employeesCache.length) state.employeesCache = await window.dataService.listEmployees();
    select.innerHTML = state.employeesCache
      .slice()
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'id'))
      .map(e => `<option value="${e.id}">${escapeHtml(e.full_name)}${e.position ? ' — ' + escapeHtml(e.position) : ''}</option>`)
      .join('');
  } catch (e) {
    select.innerHTML = '<option value="">Gagal memuat daftar pegawai</option>';
  }
  // Jenis Dokumen HARUS dipilih dari document_letter_types (schema_37,
  // hanya yang is_active) -- BUKAN teks bebas lagi, supaya document_type
  // yang dikirim ke generate-document selalu cocok persis dengan
  // type_key yang valid (root cause bug "Jenis surat ... tidak
  // ditemukan": sebelumnya input teks bebas gampang typo/beda kapital
  // dari type_key sungguhan, mis. "kontrak_kerja" vs "Surat_Kontrak").
  try {
    state.__genDocLetterTypesCache = (await window.dataService.listDocumentLetterTypes()).filter(t => t.is_active);
    typeSelect.innerHTML = state.__genDocLetterTypesCache.length
      ? state.__genDocLetterTypesCache.map(t => `<option value="${escapeHtml(t.type_key)}">${escapeHtml(t.name)}</option>`).join('')
      : '<option value="">Belum ada jenis surat aktif — tambah di menu Jenis Surat</option>';
    // Dipanggil dari baris Jenis Surat -- template SUDAH tertaut ke
    // jenis surat ini (document_type_key), kunci dropdown supaya tidak
    // bisa dipilih ke jenis surat lain yang templatenya beda.
    if (presetTypeKey && state.__genDocLetterTypesCache.some(t => t.type_key === presetTypeKey)) {
      typeSelect.value = presetTypeKey;
      typeSelect.disabled = true;
    }
  } catch (e) {
    typeSelect.innerHTML = '<option value="">Gagal memuat jenis surat</option>';
  }
  // Unit Pengeluar Surat (schema_85) -- dimuat sekali di sini, field
  // dropdown-nya baru dimunculkan/diwajibkan oleh onGenDocTypeChange()
  // kalau jenis surat terpilih numbering_format='unit_type'.
  try {
    const units = (await window.dataService.listDocumentIssuingUnits()).filter(u => u.is_active);
    unitSelect.innerHTML = units.length
      ? units.map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`).join('')
      : '<option value="">Belum ada unit aktif — tambah di menu Unit Pengeluar Surat</option>';
  } catch (e) {
    unitSelect.innerHTML = '<option value="">Gagal memuat unit pengeluar surat</option>';
  }
  onGenDocTypeChange();
}

// Field Unit Pengeluar Surat cuma relevan utk jenis surat ber-
// numbering_format 'unit_type' (schema_85) -- Surat Cuti/Slip Gaji
// ('type_only') TIDAK PERNAH lewat modal ini (dibuat dari alur
// tersendiri), tapi jaga-jaga tetap disembunyikan kalau suatu saat ada.
export function onGenDocTypeChange() {
  const typeKey = document.getElementById('genDocType').value;
  const type = state.__genDocLetterTypesCache.find(t => t.type_key === typeKey);
  const field = document.getElementById('genDocIssuingUnitField');
  field.style.display = (type?.numbering_format === 'unit_type') ? '' : 'none';
}

export async function submitGenerateDocument() {
  const employeeId = document.getElementById('genDocEmployeeSelect').value;
  const documentType = document.getElementById('genDocType').value.trim();
  const type = state.__genDocLetterTypesCache.find(t => t.type_key === documentType);
  const needsIssuingUnit = type?.numbering_format === 'unit_type';
  const issuingUnitId = needsIssuingUnit ? document.getElementById('genDocIssuingUnit').value : null;
  if (!state.__genDocTemplateId || !employeeId) { toast('Pilih pegawai terlebih dahulu'); return; }
  if (!documentType) { toast('Pilih Jenis Dokumen terlebih dahulu'); return; }
  if (needsIssuingUnit && !issuingUnitId) { toast('Pilih Unit Pengeluar Surat terlebih dahulu'); return; }

  const btn = document.getElementById('genDocSubmitBtn');
  btn.disabled = true; btn.textContent = 'Memproses…';
  try {
    const result = await window.dataService.generateDocumentFromTemplate({
      templateId: state.__genDocTemplateId, employeeId, documentType, issuingUnitId,
    });
    if (!result.ok) { toast('Gagal generate dokumen: ' + result.error, 'error'); return; }
    closeModal('generateDocumentModal');
    // Langsung unduh hasilnya (docx untuk template .docx seperti Surat
    // Perjanjian Kerja, pdf untuk template PDF ber-form-field) — tidak
    // perlu pindah ke tab Dokumen dulu untuk mengunduh manual.
    if (result.document?.file_url) {
      const empName = state.employeesCache.find(e => e.id === employeeId)?.full_name || 'Pegawai';
      const suggestedName = result.document.file_name
        || `${(documentType || 'Dokumen').replace(/\s+/g, '_')}_${empName.replace(/\s+/g, '_')}.${result.fileExt || 'docx'}`;
      await downloadGeneratedDocument(result.document.file_url, suggestedName);
      toast(`Dokumen (.${result.fileExt || 'docx'}) berhasil dibuat & diunduh`);
    } else {
      toast('Dokumen berhasil dibuat — lihat di tab Dokumen pegawai terkait, atau menu Manajemen Dokumen');
    }
  } finally {
    btn.disabled = false; btn.textContent = 'Generate';
  }
}

export async function submitInstitutionSettings() {
  const name = document.getElementById('settingsName').value.trim();
  const address = document.getElementById('settingsAddress').value.trim();
  if (!name) { toast('Nama institusi wajib diisi'); return; }
  const whatsappGroupUrl = document.getElementById('settingsWhatsappGroupUrl')?.value.trim() || '';
  // Validasi longgar (bukan whitelist domain ketat) -- hanya pastikan
  // ini terlihat seperti URL http(s), supaya window.open() nanti tidak
  // membuka sesuatu yang aneh kalau super_admin salah tempel teks biasa.
  // Tidak memvalidasi harus persis chat.whatsapp.com karena wa.me/nomor
  // juga valid dipakai sebagai "grup" versi minimal (mis. nomor admin
  // grup), dan Super Admin bisa saja pakai penyingkat URL.
  if (whatsappGroupUrl && !/^https?:\/\//i.test(whatsappGroupUrl)) {
    toast('Link grup WhatsApp harus diawali http:// atau https://'); return;
  }
  const result = await window.dataService.upsertInstitutionSettings({ name, address, whatsappGroupUrl });
  if (!result.ok) { toast('Gagal menyimpan: ' + result.error, 'error'); return; }
  toast('Pengaturan tersimpan');
}
// Sama persis dengan openEmployeePhotoPicker() di atas -- dipakai tombol
// "+ Unggah Logo" (data-onclick="openInstitutionLogoPicker()"), bug &
// alasan identik: ekspresi berantai document.getElementById(...).click()
// tidak pernah cocok regex parser runInlineHandlerCode().
export function openInstitutionLogoPicker() {
  document.getElementById('settingsLogoFile').click();
}

export async function uploadInstitutionLogo() {
  let file = document.getElementById('settingsLogoFile').files[0];
  if (!file) return;
  // Logo institusi bisa berupa PNG transparan (dipakai di layar Login/
  // Register) -- preserveTransparency:true supaya PNG TIDAK dipaksa
  // jadi JPEG (yang akan mengisi area transparan jadi putih solid).
  // Target lebih kecil dari default karena logo murni identifikasi.
  file = await compressImageIfNeeded(file, { maxBytes: 200 * 1024, maxDimension: 800, preserveTransparency: true });
  const result = await window.dataService.uploadInstitutionLogo(file);
  if (!result.ok) { toast('Gagal mengunggah logo: ' + result.error, 'error'); return; }
  toast('Logo berhasil diunggah');
  renderSettingsScreen();
  applyInstitutionBrandMark(); // logo baru langsung tampil di Login/Register tanpa reload
}

/* ============================================================
   BRAND MARK — ganti kotak "AF" statis di layar Login & Register
   dengan logo institusi (settings.logo_url) kalau sudah diunggah lewat
   Pengaturan. Dipanggil saat halaman pertama dimuat DAN sesudah upload
   logo baru (lihat uploadInstitutionLogo() di atas). Fallback diam-diam
   ke "AF" kalau logo belum ada / gagal dimuat -- BUKAN error yang perlu
   di-toast, karena ini cuma bagian kosmetik, bukan alur inti.
   CATATAN: butuh migrasi schema_72 (RLS institution_settings_select
   dibuka untuk anon) supaya query ini tidak diblokir di layar
   pra-login -- lihat README.
   ============================================================ */
export async function applyInstitutionBrandMark() {
  const marks = [document.getElementById('loginBrandMark'), document.getElementById('registerBrandMark'), document.getElementById('resetPwBrandMark')]
    .filter(Boolean);
  if (!marks.length) return;
  try {
    const settings = await window.dataService.getInstitutionSettings();
    if (!settings?.logo_url) return; // biarkan "AF" default
    const url = await window.dataService.getInstitutionLogoUrl(settings.logo_url);
    if (!url) return;
    marks.forEach(el => {
      el.innerHTML = `<img src="${url}" alt="Logo ${escapeHtml(settings.name || 'Institusi')}" style="width:100%;height:100%;object-fit:contain;border-radius:8px;" />`;
    });
  } catch (e) {
    // Diam saja -- brand-mark "AF" tetap tampil sebagai fallback aman.
    console.warn('[brand-mark] Gagal memuat logo institusi:', e.message);
  }
}

/* ============================================================
   KUTIPAN HALAMAN LOGIN — rotasi harian otomatis dari login_quotes
   (schema_73). Dipilih SATU baris aktif per hari lewat modulo
   hari-dalam-tahun (deterministik & stateless -- tidak perlu cron
   job/scheduler terpisah untuk "berkala", cukup dihitung ulang tiap
   kali halaman dimuat). Kalau tabel kosong/gagal dimuat, teks
   hardcode di HTML dibiarkan apa adanya sebagai fallback.
   ============================================================ */
// dayOfYear() TIDAK diduplikasi di sini -- sudah canonical export di
// utils.js sejak Tahap 1 (P3.1), identik persis.


export function pickDailyLoginQuote(quotes) {
  const active = quotes.filter(q => q.is_active);
  if (!active.length) return null;
  const sorted = [...active].sort((a, b) => (a.display_order - b.display_order) || a.quote_text.localeCompare(b.quote_text, 'id'));
  const idx = dayOfYear() % sorted.length;
  return sorted[idx];
}

export async function applyLoginQuote() {
  const targets = [document.getElementById('loginQuoteTextMain'), document.getElementById('loginQuoteTextRegister')]
    .filter(Boolean);
  if (!targets.length) return;
  try {
    const quotes = await window.dataService.listLoginQuotes();
    const chosen = pickDailyLoginQuote(quotes);
    if (!chosen) return; // biarkan teks hardcode default
    const text = `"${chosen.quote_text}"`;
    targets.forEach(el => { el.textContent = text; });
  } catch (e) {
    // Diam saja -- teks hardcode default tetap tampil sebagai fallback aman.
    console.warn('[login-quote] Gagal memuat kutipan login:', e.message);
  }
}

// Header institusi di TOPBAR (#topbarInstitutionLogo/#topbarInstitutionName)
// -- dipindah dari sidebar profil (#psInstitutionLogo/#psInstitutionName,
// lihat commit 00108b0) ke topbar 2026-08-25 atas permintaan eksplisit
// pengguna, supaya sidebar profil bisa kembali menampilkan identitas
// pegawai perseorangan (avatar/nama/jabatan, lihat .ps-profile-header).
// Dipanggil SEKALI di applyLoggedInProfile() (bukan tiap viewEmployee()
// seperti versi sidebar sebelumnya) karena topbar sekarang tampil global,
// bukan cuma di layar Detail Pegawai.
// Meniru sumber data & fallback yang SAMA PERSIS dengan applyInstitutionBrandMark()
// (logo Login/Register) supaya satu sumber kebenaran (institution_settings),
// bukan duplikasi logika terpisah yang bisa berbeda hasil.
export async function renderTopbarInstitutionHeader() {
  const logoEl = document.getElementById('topbarInstitutionLogo');
  const nameEl = document.getElementById('topbarInstitutionName');
  if (!logoEl && !nameEl) return;
  try {
    const settings = await window.dataService.getInstitutionSettings();
    if (nameEl) {
      nameEl.textContent = settings?.name || 'Institusi Belum Diatur';
      fitInstitutionNameToWidth(nameEl);
    }
    if (logoEl) {
      if (settings?.logo_url) {
        const url = await window.dataService.getInstitutionLogoUrl(settings.logo_url);
        if (url) {
          logoEl.innerHTML = `<img src="${url}" alt="Logo ${escapeHtml(settings.name || 'Institusi')}" style="width:100%;height:100%;object-fit:contain;border-radius:50%;" />`;
        } else {
          logoEl.textContent = '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M14 21v-3a2 2 0 0 0-4 0v3" /><path d="M18 4.933V21" /><path d="m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6" /><path d="m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11" /><path d="M6 4.933V21" /><circle cx="12" cy="9" r="2" /></svg>';
        }
      } else {
        logoEl.textContent = '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M14 21v-3a2 2 0 0 0-4 0v3" /><path d="M18 4.933V21" /><path d="m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6" /><path d="m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11" /><path d="M6 4.933V21" /><circle cx="12" cy="9" r="2" /></svg>';
      }
    }
  } catch (e) {
    // Diam saja -- sama seperti applyInstitutionBrandMark(), ini kosmetik,
    // bukan alur inti; fallback "<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M14 21v-3a2 2 0 0 0-4 0v3" /><path d="M18 4.933V21" /><path d="m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6" /><path d="m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11" /><path d="M6 4.933V21" /><circle cx="12" cy="9" r="2" /></svg>" / nama default tetap tampil.
    if (nameEl && !nameEl.textContent) { nameEl.textContent = 'Institusi Belum Diatur'; fitInstitutionNameToWidth(nameEl); }
    if (logoEl && !logoEl.textContent && !logoEl.innerHTML) logoEl.textContent = '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M14 21v-3a2 2 0 0 0-4 0v3" /><path d="M18 4.933V21" /><path d="m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6" /><path d="m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11" /><path d="M6 4.933V21" /><circle cx="12" cy="9" r="2" /></svg>';
    console.warn('[profil] Gagal memuat identitas institusi:', e.message);
  }
}

// Tanggal Hijriah di header (2026-08-31, permintaan eksplisit pengguna) --
// dihitung SEPENUHNYA client-side lewat Intl.DateTimeFormat dengan
// ekstensi kalender 'islamic-umalqura' (kalender Umm al-Qura, dukungan
// ICU bawaan browser modern -- TIDAK ada panggilan jaringan/API
// eksternal, jadi tidak bergantung CDN/Edge Function seperti
// jadwal_sholat_harian/hadits_harian yang sudah ada).
//
// CATATAN JUJUR (penting, jangan dihapus): ini kalender HITUNGAN
// (kalkulasi astronomis/tabular), BUKAN hasil rukyatul hilal (pengamatan
// bulan sabit) -- bisa berbeda 1 hari dari pengumuman resmi Kemenag RI
// yang memakai rukyat, terutama di awal bulan Hijriah. Ditandai lewat
// atribut title pada elemennya supaya pengguna yang menghover/menekan
// lama tahu ini bukan kepastian mutlak.
//
// Guard resolvedOptions().calendar: Intl TIDAK melempar error kalau
// ekstensi -u-ca- tidak dikenali, dia diam-diam jatuh ke kalender default
// (Gregorian) -- tanpa guard ini, browser yang (sangat jarang, tapi
// mungkin) tidak dukung kalender Islam akan menampilkan TANGGAL MASEHI
// tapi DILABELI seolah Hijriah, salah dan membingungkan. Kalau itu
// terjadi, elemen disembunyikan total, bukan menampilkan info yang salah.
export function renderTopbarHijriDate() {
  const el = document.getElementById('topbarHijriDate');
  if (!el) return;
  try {
    const fmt = new Intl.DateTimeFormat('id-ID-u-ca-islamic-umalqura', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    if (!fmt.resolvedOptions().calendar.startsWith('islamic')) {
      el.style.display = 'none'; // browser diam-diam jatuh ke kalender lain -- jangan tampilkan info salah
      return;
    }
    el.textContent = fmt.format(new Date()); // sudah termasuk sufiks era "H" dari data lokal id-ID, tidak perlu ditambah manual
  } catch (e) {
    // Browser sangat lawas yang bahkan tidak dukung ekstensi -u-ca- sama
    // sekali -- sembunyikan, jangan tampilkan teks rusak/kosong.
    el.style.display = 'none';
    console.warn('[topbar] Kalender Hijriah tidak didukung browser ini:', e);
  }
}

// Nama institusi harus muat 1 baris (permintaan eksplisit pengguna --
// sebelumnya boleh membungkus 2 baris). Sidebar profil lebarnya TETAP
// (250px, menyempit ke 230px di breakpoint 1320px -- lihat .profile-layout),
// jadi tidak bisa diperlebar mengikuti panjang nama. Nama institusi juga
// bisa berubah-ubah panjangnya (diisi bebas oleh super_admin lewat
// Pengaturan > Profil Institusi), jadi TIDAK dipakai ukuran font tetap
// yang cuma pas untuk satu nama tertentu -- font-size dikecilkan
// bertahap sampai muat, dengan batas bawah 9px supaya tidak sampai
// tidak terbaca; text-overflow:ellipsis di CSS jadi jaring pengaman
// terakhir kalau nama sangat panjang bahkan di 9px.
export function fitInstitutionNameToWidth(el, minPx = 9, maxPx = 12) {
  if (!el) return;
  requestAnimationFrame(() => {
    let size = maxPx;
    el.style.fontSize = size + 'px';
    while (size > minPx && el.scrollWidth > el.clientWidth) {
      size -= 0.5;
      el.style.fontSize = size + 'px';
    }
  });
}

/* ============================================================
   BACKUP BULANAN (Pengaturan → Backup Data) — mengumpulkan seluruh
   domain data bisnis + salinan dokumen resmi yang masih ada jadi satu
   file .zip, diunduh langsung ke perangkat (BUKAN disimpan ke
   Storage). 100% client-side, pola sama seperti 3 tombol ekspor .xlsx
   yang sudah ada (exportEmployeesXlsx/exportPayrollInfoXlsx/
   exportLeaveReportXlsx) -- data diambil ulang lewat dataService
   supaya otomatis tunduk pada RLS/mock scoping role saat ini (baris
   yang ditolak RLS untuk role saat ini otomatis tidak ikut, sama
   seperti pola export lain -- BUKAN filter tambahan terpisah di sini).

   KEPUTUSAN DESAIN (didiskusikan dengan Product Owner sebelum
   implementasi, 2026-08-24):
   - Akses tombol: HANYA super_admin (lihat gating di
     renderSettingsScreen). Scan sistematis seluruh policy SELECT di
     skema (51 policy, python3 regex scan atas supabase/schema*.sql)
     mengonfirmasi is_super_admin() SELALU ikut di setiap policy yang
     membatasi akses -- tidak ada satu pun tabel bisnis yang
     mengecualikan super_admin. Kalau nanti role lain (mis. pimpinan)
     mau ditambahkan sebagai trigger, ulangi scan itu dulu -- beberapa
     tabel (mis. employee_payroll, employee_family) SENGAJA
     mengecualikan pimpinan (least privilege, lihat schema_02), jadi
     backup yang dipicu pimpinan bisa diam-diam lebih sedikit baris
     tanpa perubahan lebih lanjut di fungsi ini.
   - docx/pdf TIDAK di-generate ulang dari data mentah -- docx di
     sistem ini cuma bermakna sebagai surat resmi PER ORANG (lihat
     generateDocumentFromTemplate), bukan format dump data. Yang
     disalin ke zip adalah dokumen yang SUDAH ADA di generated_documents
     dan belum kena retensi (schema_56, file_deleted_at), lewat
     listAllGeneratedDocuments() + fetch signed/blob URL -- pola sama
     seperti downloadGeneratedDocument() di atas, BUKAN memanggil ulang
     generateDocumentFromTemplate() secara massal.
   - "Lengkap" dibatasi ke domain yang PUNYA method dataService
     terpadu (dipakai baik mock maupun supabase, lihat parity check
     sebelum implementasi). employee_family TIDAK disertakan karena
     tidak ada method list-nya sama sekali di dataService saat ini --
     dicatat sebagai gap di PENDING_ACTIONS.md, bukan didiamkan.
   - Domain per-pegawai (riwayat karier/pendidikan/sertifikasi/
     kompetensi) diambil lewat loop Promise.all per pegawai -- pola
     N+1 yang SAMA seperti exportPayrollInfoXlsx() yang sudah ada.
     Pada skala saat ini (~16-17 pegawai, per README) ini murah;
     kalau institusi tumbuh ke ratusan pegawai, ini titik yang paling
     dulu perlu dioptimalkan (lihat catatan performa di
     PENDING_ACTIONS.md).
   ============================================================ */

const BACKUP_XLSX_HEADER_COLOR = '146572'; // --brand-700 -- seragam utk semua sheet backup (bukan multi-warna per kolom spt exportEmployeesXlsx yang untuk 1 sheet polished; di sini prioritasnya kelengkapan banyak sheet, bukan estetika per sheet)

// Bangun 1 worksheet xlsx-js-style dari array of plain object + definisi
// kolom eksplisit (header, accessor `get`, lebar). `rows` boleh kosong --
// sheet TETAP dibuat dengan header saja (bukan diam-diam hilang dari
// paket), supaya manifest bisa melaporkan "0 baris" dengan jelas kalau
// RLS/mock memang tidak meloloskan apa pun untuk domain itu.
function backupSheetFromRows(rows, columns) {
  const ws = rows.length
    ? XLSX.utils.json_to_sheet(rows.map(row => {
        const obj = {};
        columns.forEach(col => { obj[col.header] = col.get(row); });
        return obj;
      }))
    : XLSX.utils.aoa_to_sheet([columns.map(c => c.header)]);
  ws['!cols'] = columns.map(c => ({ wch: c.width || 18 }));
  ws['!rows'] = [{ hpt: 26 }];
  columns.forEach((col, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    if (!ws[cellRef]) return;
    ws[cellRef].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: BACKUP_XLSX_HEADER_COLOR } },
      alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
    };
  });
  return ws;
}

// Nama tab sheet Excel: batas 31 karakter DAN tidak boleh mengandung
// \ / ? * [ ] : (batasan format .xlsx, bukan pilihan gaya) -- label kita
// saat ini aman, tapi disaring eksplisit di sini supaya perubahan label
// di masa depan tidak diam-diam menghasilkan file .xlsx yang GAGAL
// dibuka Excel (bukan cuma error kosmetik). `usedNames` mencegah dua
// sheet tabrakan nama kalau dua label kepotong sama persis di 31
// karakter (belum pernah terjadi dengan label saat ini, tapi murah
// untuk dijaga).
function safeSheetName(name, usedNames) {
  let safe = String(name).replace(/[\\/?*\[\]:]/g, '-').slice(0, 31) || 'Sheet';
  let candidate = safe;
  let n = 2;
  while (usedNames.has(candidate)) {
    const suffix = ` (${n})`;
    candidate = safe.slice(0, 31 - suffix.length) + suffix;
    n++;
  }
  usedNames.add(candidate);
  return candidate;
}

// Tambah 1 sheet ke workbook BERSAMA (bukan bikin file .xlsx sendiri-
// sendiri) -- diminta user (2026-08-24) setelah mencoba versi 15 file
// terpisah: digabung jadi SATU file .xlsx multi-sheet supaya lebih
// mudah dibuka/dinavigasi, tapi struktur data & manifest per-domain
// TIDAK berubah (masing-masing tetap 1 sheet dengan header sendiri).
function appendBackupSheet(workbook, usedSheetNames, rows, columns, sheetName) {
  const ws = backupSheetFromRows(rows, columns);
  XLSX.utils.book_append_sheet(workbook, ws, safeSheetName(sheetName, usedSheetNames));
}

// Rentang tanggal bulan berjalan menurut kalender LOKAL browser (WIB
// untuk pengguna kita) -- prinsip sama seperti localDateISO() di
// seluruh proyek ini: JANGAN pakai UTC (Date#getUTC*) untuk "bulan ini",
// supaya konsisten dengan today_wib()/localDateISO() yang sudah dipakai
// di tempat lain.
function currentMonthRangeWIB() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { startDate: localDateISO(start), endDate: localDateISO(end), year: now.getFullYear(), month: now.getMonth() + 1 };
}

// Manifest ringkasan (ringkasan.pdf di dalam paket) -- BUKAN surat
// resmi institusi (tidak pakai kop surat seperti printLeaveLetter/
// printPayslip), cuma tanda terima teknis: apa isi paket, kapan
// dibuat, oleh siapa, berapa baris per domain -- termasuk domain yang
// 0 baris atau dokumen yang di-skip karena sudah kena retensi, supaya
// TIDAK ada gap yang diam-diam tidak dilaporkan.
function buildBackupManifestPdf(manifestRows, meta) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 24;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('Ringkasan Backup Bulanan HRIS', 20, y); y += 9;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  doc.text('Institusi: Pesantren Modern Al-Falah Abu Lam U', 20, y); y += 6;
  doc.text(`Periode data: ${MONTH_NAMES[meta.month]} ${meta.year}`, 20, y); y += 6;
  doc.text(`Dibuat oleh: ${meta.generatedBy || '-'}`, 20, y); y += 6;
  doc.text(`Waktu dibuat: ${formatDateTime(meta.generatedAt)}`, 20, y); y += 10;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Isi Paket', 20, y); y += 7;
  doc.setDrawColor(180); doc.line(20, y - 3, 190, y - 3);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  manifestRows.forEach(row => {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.text(String(row.domain), 24, y, { maxWidth: 130 });
    doc.text(String(row.count), 182, y, { align: 'right' });
    y += 6;
  });
  y += 8;
  doc.setFontSize(8); doc.setTextColor(130);
  doc.text('Dokumen ini dibuat otomatis oleh sistem HRIS (dataku2026) sebagai manifest teknis isi paket backup, bukan dokumen resmi institusi.', 20, y, { maxWidth: 170 });
  return doc.output('blob');
}

export async function backupMonthlyData() {
  if (state.currentProfile?.role !== 'super_admin') { toast('Hanya Super Admin yang dapat membuat backup ini'); return; }
  const btn = document.getElementById('backupMonthlyBtn');
  const statusEl = document.getElementById('backupMonthlyStatus');
  const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };
  if (btn) { btn.disabled = true; btn.textContent = 'Menyiapkan…'; }
  try {
    const { startDate, endDate, year, month } = currentMonthRangeWIB();
    const zip = new JSZip();
    const docsFolder = zip.folder('dokumen-resmi');
    const manifestRows = [];
    const workbook = XLSX.utils.book_new();
    const usedSheetNames = new Set();
    const addSheet = (rows, columns, sheetLabel, domainLabel) => {
      appendBackupSheet(workbook, usedSheetNames, rows, columns, sheetLabel);
      manifestRows.push({ domain: domainLabel || sheetLabel, count: rows.length });
    };

    setStatus('Mengambil data pegawai…');
    const employees = await window.dataService.listEmployees();
    const departments = await window.dataService.listDepartments();
    const deptById = new Map(departments.map(d => [d.id, d.name]));
    const empLabel = (id) => employees.find(e => e.id === id)?.full_name || id || '';

    addSheet(employees, [
      { header: 'ID Pegawai', get: e => e.employee_code || '', width: 14 },
      { header: 'Nama Lengkap', get: e => e.full_name || '', width: 26 },
      { header: 'Amanah/Jabatan', get: e => e.position || '', width: 24 },
      { header: 'Unit', get: e => e.unit || '', width: 16 },
      { header: 'Departemen', get: e => deptById.get(e.department_id) || '', width: 20 },
      { header: 'Status Kepegawaian', get: e => e.employment_status || '', width: 16 },
      { header: 'Jenis Kontrak', get: e => e.contract_type || '', width: 16 },
      { header: 'Tanggal Bergabung', get: e => e.join_date ? formatDate(e.join_date) : '', width: 16 },
      { header: 'NIK', get: e => e.personal_info?.nik || '', width: 20 },
      { header: 'No. HP', get: e => e.contact_info?.phone || '', width: 16 },
      { header: 'Terakhir Diperbarui', get: e => e.updated_at ? formatDate(e.updated_at) : '', width: 16 },
    ], 'Pegawai');

    setStatus('Mengambil data absensi bulan ini…');
    const attendance = await window.dataService.listAttendanceReport({ startDate, endDate });
    addSheet(attendance, [
      { header: 'Nama Pegawai', get: r => r.employee?.full_name || '', width: 26 },
      { header: 'Hadir', get: r => r.present || 0, width: 10 },
      { header: 'Terlambat', get: r => r.late || 0, width: 10 },
      { header: 'Tidak Hadir', get: r => r.absent || 0, width: 12 },
      { header: 'Sakit', get: r => r.sick || 0, width: 10 },
      { header: 'Izin', get: r => r.permit || 0, width: 10 },
      { header: 'Cuti', get: r => r.leave || 0, width: 10 },
    ], `Absensi ${MONTH_NAMES[month]} ${year}`, 'Absensi Bulan Ini');

    setStatus('Mengambil data cuti…');
    const leaveThisMonth = await window.dataService.listLeaveReport({ startDate, endDate });
    addSheet(leaveThisMonth, [
      { header: 'Nama Pegawai', get: r => r.employee?.full_name || '', width: 26 },
      { header: 'Jenis Cuti', get: r => r.leave_types?.name || '', width: 20 },
      { header: 'Total Hari', get: r => r.totalDays || 0, width: 12 },
    ], `Cuti Disetujui ${MONTH_NAMES[month]} ${year}`, 'Cuti Disetujui Bulan Ini');

    const allLeaveRequests = await window.dataService.listAllLeaveRequestsForReport();
    addSheet(allLeaveRequests, [
      { header: 'Nama Pegawai', get: r => r.employees?.full_name || '', width: 26 },
      { header: 'Jenis Cuti', get: r => r.leave_types?.name || '', width: 20 },
      { header: 'Tanggal Mulai', get: r => formatDate(r.start_date), width: 14 },
      { header: 'Tanggal Selesai', get: r => formatDate(r.end_date), width: 14 },
      { header: 'Jumlah Hari', get: r => r.days_count, width: 10 },
      { header: 'Status', get: r => LEAVE_STATUS_LABEL[r.status] || r.status, width: 20 },
      { header: 'Alasan', get: r => r.reason || '', width: 30 },
    ], 'Riwayat Cuti', 'Riwayat Cuti (Semua Status)');

    setStatus('Mengambil data gaji pokok…');
    const payrollInfoRows = (await Promise.all(employees.map(async e => ({ emp: e, info: await window.dataService.getPayrollInfo(e.id) }))))
      .filter(r => r.info);
    addSheet(payrollInfoRows, [
      { header: 'ID Pegawai', get: r => r.emp.employee_code || '', width: 14 },
      { header: 'Nama Lengkap', get: r => r.emp.full_name || '', width: 26 },
      { header: 'Gaji Pokok Jabatan', get: r => Number(r.info.base_salary || 0), width: 18 },
      { header: 'Total Bersih', get: r => Number(r.info.total_net_monthly || 0), width: 18 },
    ], 'Gaji Pokok', 'Gaji Pokok & Komponen');

    setStatus('Mengambil slip gaji periode berjalan…');
    const payrollPeriods = await window.dataService.listPayrollPeriods();
    const currentPeriod = payrollPeriods.find(p => p.period_month === month && p.period_year === year);
    const payslips = currentPeriod ? await window.dataService.listPayslipsForPeriod(currentPeriod.id) : [];
    addSheet(payslips, [
      { header: 'Nama Pegawai', get: r => r.employees?.full_name || '', width: 26 },
      { header: 'Status Slip', get: r => r.status || '', width: 14 },
      { header: 'Total Bersih (Net Pay)', get: r => Number(r.net_pay || 0), width: 18 },
    ], 'Slip Gaji', currentPeriod ? `Slip Gaji ${MONTH_NAMES[month]} ${year}` : 'Slip Gaji Periode Berjalan (periode belum dibuat)');

    setStatus('Mengambil data penilaian kinerja…');
    const performanceReviews = await window.dataService.listPerformanceReviews({});
    addSheet(performanceReviews, [
      { header: 'Nama Pegawai', get: r => r.employees?.full_name || '', width: 26 },
      { header: 'Periode', get: r => r.performance_review_periods?.name || r.performance_review_periods?.code || '', width: 18 },
      { header: 'Status', get: r => PERF_STATUS_LABEL?.[r.status] || r.status || '', width: 18 },
      { header: 'Skor Akhir', get: r => r.overall_score ?? '', width: 12 },
    ], 'Penilaian Kinerja');

    setStatus('Mengambil struktur organisasi…');
    const orgStructure = await window.dataService.listOrgStructure();
    const orgByCode = new Map(orgStructure.map(o => [o.id, o.kode]));
    addSheet(orgStructure, [
      { header: 'Kode', get: r => r.kode || '', width: 14 },
      { header: 'Nama Jabatan', get: r => r.nama || '', width: 30 },
      { header: 'Kode Induk', get: r => r.parent_id ? (orgByCode.get(r.parent_id) || '') : '', width: 14 },
    ], 'Struktur Organisasi');

    setStatus('Mengambil kejadian institusi…');
    const events = await window.dataService.listInstitutionalEvents();
    addSheet(events, [
      { header: 'Judul', get: r => r.title || '', width: 30 },
      { header: 'Tanggal Mulai', get: r => formatDate(r.start_date), width: 14 },
      { header: 'Tanggal Selesai', get: r => formatDate(r.end_date), width: 14 },
    ], 'Kejadian Institusi');

    setStatus('Mengambil catatan disiplin…');
    const disciplinary = await window.dataService.listDisciplinaryRecords();
    addSheet(disciplinary, [
      { header: 'Nama Pegawai', get: r => r.employees?.full_name || empLabel(r.employee_id), width: 26 },
      { header: 'Level', get: r => r.level || '', width: 14 },
      { header: 'Status', get: r => r.status || '', width: 16 },
      { header: 'Deskripsi', get: r => r.description || '', width: 34 },
      { header: 'Berlaku s/d', get: r => r.valid_until ? formatDate(r.valid_until) : '', width: 14 },
    ], 'Catatan Disiplin');

    setStatus('Mengambil riwayat karier, pendidikan, sertifikasi, kompetensi (per pegawai)…');
    const [historyByEmp, educationByEmp, certByEmp, competencyByEmp] = await Promise.all([
      Promise.all(employees.map(e => window.dataService.listEmployeeHistory(e.id))),
      Promise.all(employees.map(e => window.dataService.listEducation(e.id))),
      Promise.all(employees.map(e => window.dataService.listCertifications(e.id))),
      Promise.all(employees.map(e => window.dataService.listCompetencies(e.id))),
    ]);
    const flattenPerEmployee = (arrays) => employees.flatMap((e, idx) => (arrays[idx] || []).map(row => ({ ...row, __empName: e.full_name, __empCode: e.employee_code })));

    addSheet(flattenPerEmployee(historyByEmp), [
      { header: 'ID Pegawai', get: r => r.__empCode || '', width: 14 },
      { header: 'Nama Pegawai', get: r => r.__empName || '', width: 26 },
      { header: 'Jenis Kejadian', get: r => HISTORY_TYPE_LABEL?.[r.event_type] || r.event_type || '', width: 18 },
      { header: 'Deskripsi', get: r => r.description || '', width: 34 },
      { header: 'Tanggal Berlaku', get: r => r.effective_date ? formatDate(r.effective_date) : '', width: 14 },
      { header: 'No. SK', get: r => r.decree_number || '', width: 18 },
    ], 'Riwayat Karier');

    addSheet(flattenPerEmployee(educationByEmp), [
      { header: 'ID Pegawai', get: r => r.__empCode || '', width: 14 },
      { header: 'Nama Pegawai', get: r => r.__empName || '', width: 26 },
      { header: 'Jenjang', get: r => r.level || '', width: 14 },
      { header: 'Institusi', get: r => r.institution_name || '', width: 26 },
      { header: 'Jurusan', get: r => r.major || '', width: 20 },
      { header: 'Tahun Lulus', get: r => r.graduation_year || '', width: 12 },
    ], 'Pendidikan');

    addSheet(flattenPerEmployee(certByEmp), [
      { header: 'ID Pegawai', get: r => r.__empCode || '', width: 14 },
      { header: 'Nama Pegawai', get: r => r.__empName || '', width: 26 },
      { header: 'Nama Sertifikasi', get: r => r.certification_name || '', width: 26 },
      { header: 'Penerbit', get: r => r.issuing_organization || '', width: 22 },
      { header: 'Tanggal Terbit', get: r => r.issued_date ? formatDate(r.issued_date) : '', width: 14 },
      { header: 'Berlaku s/d', get: r => r.expiry_date ? formatDate(r.expiry_date) : '', width: 14 },
    ], 'Sertifikasi');

    addSheet(flattenPerEmployee(competencyByEmp), [
      { header: 'ID Pegawai', get: r => r.__empCode || '', width: 14 },
      { header: 'Nama Pegawai', get: r => r.__empName || '', width: 26 },
      { header: 'Jenis', get: r => COMPETENCY_TYPE_LABEL?.[r.competency_type] || r.competency_type || '', width: 18 },
      { header: 'Nama', get: r => r.name || '', width: 22 },
      { header: 'Level', get: r => r.level || '', width: 14 },
      { header: 'Tanggal', get: r => r.certified_at ? formatDate(r.certified_at) : '', width: 14 },
    ], 'Kompetensi');

    setStatus('Mengambil profil akun pengguna…');
    const profiles = await window.dataService.listProfiles();
    addSheet(profiles, [
      { header: 'Nama Lengkap', get: r => r.full_name || '', width: 26 },
      { header: 'Peran', get: r => ROLE_LABEL?.[r.role] || r.role || '', width: 18 },
      { header: 'Status Akun', get: r => r.status || '', width: 14 },
      { header: 'Email', get: r => r.email || '', width: 26 },
    ], 'Profil Akun');

    // Domain yang SENGAJA belum masuk cakupan versi pertama, dicatat
    // eksplisit di manifest (bukan didiamkan) -- lihat catatan
    // PENDING_ACTIONS.md.
    manifestRows.push({ domain: 'Data keluarga pegawai (employee_family) — belum ada method dataService terpadu, di luar cakupan versi ini', count: '—' });

    setStatus('Mengumpulkan dokumen resmi bulan ini…');
    const generatedDocs = await window.dataService.listAllGeneratedDocuments({ startDate, endDate });
    const stillAvailable = generatedDocs.filter(d => !d.file_deleted_at);
    let copiedCount = 0;
    for (const d of stillAvailable) {
      try {
        const url = await window.dataService.getGeneratedDocumentSignedUrl(d.file_url);
        const blob = await (await fetch(url)).blob();
        const ext = blob.type === 'application/pdf' ? 'pdf'
          : blob.type.includes('wordprocessingml') ? 'docx'
          : ((d.file_url || '').split('.').pop() || 'bin').split('?')[0];
        const empName = d.employees?.full_name || empLabel(d.employee_id) || 'pegawai';
        const safeName = `${d.document_number || d.id} - ${empName}`.replace(/[\\/:*?"<>|]/g, '-');
        docsFolder.file(`${safeName}.${ext}`, blob);
        copiedCount++;
      } catch (e) {
        console.error('Gagal menyalin dokumen resmi ke backup:', d.id, e);
      }
    }
    manifestRows.push({ domain: 'Dokumen Resmi (docx/pdf) disalin', count: copiedCount });
    const skippedRetention = generatedDocs.length - stillAvailable.length;
    if (skippedRetention > 0) {
      manifestRows.push({ domain: 'Dokumen Resmi tidak disertakan (file sudah dihapus retensi, schema_56)', count: skippedRetention });
    }

    setStatus('Menulis file .xlsx gabungan (15 sheet)…');
    const dataXlsxOut = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    zip.file('data-lengkap.xlsx', new Blob([dataXlsxOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));

    setStatus('Membuat manifest ringkasan…');
    const manifestBlob = buildBackupManifestPdf(manifestRows, {
      year, month, generatedBy: state.currentProfile?.full_name || 'Super Admin', generatedAt: new Date(),
    });
    zip.file('ringkasan.pdf', manifestBlob);

    setStatus('Mengemas file .zip…');
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const fileName = `HRIS_Backup_${MONTH_NAMES[month]}${year}_${localDateISO()}.zip`;
    const objectUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = objectUrl; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(objectUrl);

    setStatus(`Backup terakhir: ${fileName} (${formatDateTime(new Date())})`);
    toast('Backup bulanan berhasil diunduh');
  } catch (e) {
    console.error('Gagal membuat backup bulanan:', e);
    setStatus('Backup gagal — lihat pesan di atas.');
    toast('Gagal membuat backup: ' + (e.message || String(e)), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /></svg> Backup Bulanan'; }
  }
}



