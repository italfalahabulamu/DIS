/* ============================================================
   dms.js — Manajemen Dokumen (DMS): menu institusi-lebar, khusus
   DMS_ACCESS_ROLES. Tabel dokumen lintas pegawai (3 kartu: Pimpinan/
   Yayasan/Arsip), pembersihan retensi file (>30 hari), CRUD Jenis
   Surat & Kriteria Penomoran (schema_37), CRUD Unit Pengeluar Surat
   (schema_85).
   Dipindahkan dari app.js baris 7361-7799 (P3.1 Tahap 16) — rentang
   KONTIGU, langsung SETELAH documents-print.js (Tahap 15) dalam
   file app.js yang sama (lihat catatan pemisahan cakupan di header
   documents-print.js: DMS = administrasi institusi-lebar lintas
   pegawai, documents-print.js = aksi cetak personal scoped ke
   pegawai sendiri).

   TIDAK termasuk di sini: `disableUnbuiltModules()` (app.js mulai
   baris 7801, header "MODUL BELUM TERSEDIA") -- fitur TIDAK
   TERKAIT DMS sama sekali (kebetulan lokasinya berdekatan di
   app.js). BUKAN item pending yang perlu keputusan terpisah:
   dipanggil LANGSUNG di dalam listener `DOMContentLoaded` (app.js
   baris ~9082), yang menurut header ui-shell.js SENGAJA ditunda
   jadi tugas `main.js` (modul bootstrap TERAKHIR, ditulis saat
   tahap cutover) -- otomatis ikut pindah ke sana, tidak perlu
   modul sendiri.
   (KOREKSI: rencana awal di sini menyebutnya "bersama
   showModeBanner()" -- KELIRU, keduanya diselesaikan lewat jalur
   berbeda: showModeBanner() sudah pindah ke auth.js di Tahap 18,
   disableUnbuiltModules() menunggu main.js di tahap cutover.)

   5 `let` yang tadinya lokal (GENERATED_DOCUMENT_TYPE_LABEL,
   dmsDocumentsCache, letterTypesCache, issuingUnitsCache,
   documentTemplatesCache) TIDAK dicopy -- SUDAH ada di state.js
   sejak Tahap 1, modul ini baca/tulis lewat `state.x`.
   **Perbaikan konsistensi kecil:** app.js lama menulis
   `documentTemplatesCache = templates` (bare assignment, TANPA
   `state.` prefix) di `renderDmsTable()` -- ini AMAN di app.js
   classic script (forward-reference ke `let` yang dideklarasikan
   lebih jauh di bawah, baris 7523, tapi sudah terinisialisasi
   sebelum fungsi ini pernah dipanggil saat runtime), TAPI polanya
   tidak konsisten dengan 4 cache lain di fungsi yang sama yang
   SEMUANYA sudah pakai `state.` sejak app.js lama (dmsDocumentsCache/
   letterTypesCache/issuingUnitsCache/GENERATED_DOCUMENT_TYPE_LABEL
   dituliskan tanpa prefix juga sebenarnya di app.js -- keduanya
   sama-sama bare assignment ke `let` classic-script). Di modul ES
   ini, SEMUA 5 ditulis konsisten lewat `state.x`.

   `downloadGeneratedDocument`/`openGenerateDocumentModal`/
   `downloadDocumentTemplate` HANYA direferensikan lewat string
   `data-onclick` di dalam template HTML (bukan pemanggilan JS
   langsung) -- TIDAK perlu `import`, window[fn] tetap resolve lewat
   parser `runInlineHandlerCode` (ui-shell.js) yang mencari di
   `window`, dan ketiganya sudah ada sebagai fungsi window (app.js
   classic script + modul ES documents-print.js/settings.js yang
   sudah lebih dulu export dan otomatis ATTACH ke window lewat
   salinan app.js lama yang masih aktif).

   **Cleanup window.fn di ui-shell.js:** 1 referensi
   (`window.renderDmsTable()`) diganti `import` langsung -- circular
   import baru TIDAK ada (dms.js tidak import apa pun dari
   ui-shell.js selain toast/openModal/closeModal, pola sama seperti
   tahap-tahap sebelumnya).

   STATUS TRANSISI: modul ini TIDAK punya window.fn tersisa untuk
   dirinya sendiri.
   ============================================================ */

import { state } from './state.js';
import { escapeHtml, formatDate, friendlyLoadError } from './utils.js';
import { toast, openModal, closeModal } from './ui-shell.js';

/* ============================================================
   MANAJEMEN DOKUMEN (DMS) — menu institusi-lebar, khusus DMS_ACCESS_ROLES.
   Beda dari renderPrintedLetters() (documents-print.js, itu "surat saya",
   scoped ke currentProfile.employee_id sendiri) -- di sini menampilkan
   dokumen LINTAS PEGAWAI, cakupan barisnya ditentukan RLS
   generated_documents_select (schema_36) lewat listAllGeneratedDocuments().

   Label jenis dokumen SEKARANG DINAMIS (dibangun dari
   listDocumentLetterTypes(), schema_37) -- SEBELUMNYA hardcode
   { surat_cuti: 'Surat Cuti', slip_gaji: 'Slip Gaji' }, harus diedit
   manual tiap ada jenis surat baru. Cache di bawah diisi renderDmsTable().
   ============================================================ */

// Accordion "Pesantren"/"Yayasan" (2026-09-01, diminta pengguna) --
// murni toggle class, pola sama seperti toggleSidebar()/toggleQuickActionMenu()
// di ui-shell.js. TIDAK mempengaruhi renderDmsTable()/filterDmsTable() sama
// sekali -- tbody tetap dirender walau section sedang tertutup (display:none
// di body accordion, bukan di-unmount), jadi data selalu siap begitu section
// dibuka, tidak perlu re-fetch.
export function toggleDmsAccordion(sectionId) {
  document.getElementById(sectionId)?.classList.toggle('open');
}

export async function renderDmsTable() {
  // Guard longgar -- cukup pastikan halaman DMS memang sedang di-render
  // (salah satu dari 3 tbody card ada di DOM), bukan menunjuk 1 elemen
  // spesifik seperti dulu (dmsTableBody sudah dihapus saat dipecah jadi
  // 3 card: Pimpinan/Yayasan/Arsip).
  const pimpBody = document.getElementById('dmsPimpTableBody');
  if (!pimpBody) return;
  const loadingRow = `<tr><td colspan="5" style="text-align:center;color:var(--ink-500);padding:24px;">Memuat…</td></tr>`;
  ['dmsPimpTableBody', 'dmsYalTableBody', 'dmsArsipTableBody'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = loadingRow;
  });
  try {
    const [docs, types, templates, units] = await Promise.all([
      window.dataService.listAllGeneratedDocuments(),
      window.dataService.listDocumentLetterTypes(),
      window.dataService.listDocumentTemplates(),
      window.dataService.listDocumentIssuingUnits(),
    ]);
    state.dmsDocumentsCache = docs;
    state.letterTypesCache = types;
    state.documentTemplatesCache = templates;
    state.issuingUnitsCache = units;
    state.GENERATED_DOCUMENT_TYPE_LABEL = Object.fromEntries(types.map(t => [t.type_key, t.name]));
  } catch (e) {
    const errorRow = `<tr><td colspan="5" style="color:var(--danger-fg);text-align:center;padding:24px;">${escapeHtml(friendlyLoadError(e))}</td></tr>`;
    ['dmsPimpTableBody', 'dmsYalTableBody', 'dmsArsipTableBody'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = errorRow;
    });
    return;
  }

  // Dropdown filter jenis dokumen dibangun dari letterTypesCache --
  // simpan pilihan aktif dulu supaya tidak reset kalau render ulang.
  const typeSelect = document.getElementById('dmsFilterType');
  if (typeSelect) {
    const current = typeSelect.value;
    typeSelect.innerHTML = '<option value="">Semua Jenis Dokumen</option>' +
      state.letterTypesCache.map(t => `<option value="${escapeHtml(t.type_key)}">${escapeHtml(t.name)}</option>`).join('');
    typeSelect.value = current;
  }

  filterDmsTable();
  renderLetterTypesTable();
  renderIssuingUnitsTable();
}

// Satu baris <tr> dipakai bersama oleh ketiga card (Pimpinan/Yayasan/
// Arsip) -- markup identik, hanya sumber datanya yang beda, supaya
// tidak ada 3 salinan template yang bisa mendrift satu sama lain.
function dmsDocumentRowHtml(d) {
  return `
    <tr>
      <td style="font-family:var(--font-mono);font-weight:600;">${escapeHtml(d.document_number)}</td>
      <td><span class="badge badge-neutral">${escapeHtml(state.GENERATED_DOCUMENT_TYPE_LABEL[d.document_type] || d.document_type)}</span></td>
      <td>${escapeHtml(d.employees?.full_name || '—')}</td>
      <td style="color:var(--ink-500);">${formatDate(d.generated_at)}</td>
      <td>${d.file_deleted_at
        ? `<span class="badge badge-neutral" title="File dihapus otomatis karena lewat masa retensi — riwayat & nomor surat tetap tersimpan">Arsip dihapus</span>`
        : `<button class="btn btn-ghost btn-sm" data-onclick="downloadGeneratedDocument('${escapeHtml(d.file_url)}')">Unduh</button>`}</td>
    </tr>`;
}

function renderDmsCardTable(tbodyId, rows, emptyMessage) {
  const body = document.getElementById(tbodyId);
  if (!body) return;
  body.innerHTML = rows.map(dmsDocumentRowHtml).join('') ||
    `<tr><td colspan="5" style="text-align:center;color:var(--ink-500);padding:24px;">${escapeHtml(emptyMessage)}</td></tr>`;
}

// Restrukturisasi (schema_85): dulu 1 tabel datar + filter dropdown,
// sekarang dipecah jadi 3 card berdasar issuing_unit_id --
//   - Surat Pimpinan Pesantren: issuing_unit_id -> unit berkode 'Pimp'
//   - Surat Yayasan: issuing_unit_id -> unit berkode 'YAL'
//   - Arsip Surat: SUPERSET (semua dokumen, termasuk 2 di atas + entitas
//     "umum" spt Cuti/Slip Gaji yang issuing_unit_id-nya NULL) --
//     keputusan produk owner, sengaja tumpang tindih, bukan partisi.
// Toolbar cari/filter TETAP satu (dmsSearchInput/dmsFilterType), hasil
// filter-nya yang dibagi ke 3 tbody, bukan 3 toolbar terpisah.
export function filterDmsTable() {
  const typeFilter = document.getElementById('dmsFilterType')?.value || '';
  const searchTerm = (document.getElementById('dmsSearchInput')?.value || '').trim().toLowerCase();

  const filtered = state.dmsDocumentsCache.filter(d => {
    const typeOk = !typeFilter || d.document_type === typeFilter;
    const nameOk = !searchTerm || (d.employees?.full_name || '').toLowerCase().includes(searchTerm);
    return typeOk && nameOk;
  });

  const unitCodeById = Object.fromEntries(state.issuingUnitsCache.map(u => [u.id, u.code]));
  const pimpinanDocs = filtered.filter(d => unitCodeById[d.issuing_unit_id] === 'Pimp');
  const yayasanDocs = filtered.filter(d => unitCodeById[d.issuing_unit_id] === 'YAL');
  const arsipDocs = filtered; // superset -- lihat komentar di atas

  renderDmsCardTable('dmsPimpTableBody', pimpinanDocs, 'Belum ada surat dari Pimpinan Pesantren yang cocok dengan filter');
  renderDmsCardTable('dmsYalTableBody', yayasanDocs, 'Belum ada surat dari Yayasan yang cocok dengan filter');
  renderDmsCardTable('dmsArsipTableBody', arsipDocs, 'Tidak ada dokumen yang cocok dengan filter');

  const pimpCountEl = document.getElementById('dmsPimpCount');
  if (pimpCountEl) pimpCountEl.textContent = `${pimpinanDocs.length} dokumen`;
  const yalCountEl = document.getElementById('dmsYalCount');
  if (yalCountEl) yalCountEl.textContent = `${yayasanDocs.length} dokumen`;
  const arsipCountEl = document.getElementById('dmsArsipCount');
  if (arsipCountEl) arsipCountEl.textContent = `Menampilkan ${arsipDocs.length} dari ${state.dmsDocumentsCache.length} dokumen`;

  // Tombol pembersihan retensi (schema_56): hanya super_admin/hrd --
  // ditegakkan juga di Edge Function, ini cuma menyembunyikan UI-nya.
  const cleanupBtn = document.getElementById('dmsCleanupBtn');
  if (cleanupBtn) {
    const role = state.currentProfile?.role;
    cleanupBtn.style.display = (role === 'super_admin' || role === 'hrd') ? '' : 'none';
  }
}

// Strategi hemat storage #3 (schema_56): hapus file fisik hasil
// generate yang lebih tua dari 30 hari lewat Edge Function
// cleanup-generated-documents. Baris & document_number TIDAK dihapus
// -- hanya ditandai file_deleted_at, riwayat tetap utuh untuk audit.
export async function runCleanupGeneratedDocuments() {
  if (!confirm('Hapus file fisik dokumen yang sudah lebih dari 30 hari?\n\nNomor surat & riwayat TETAP tersimpan — hanya file yang bisa diunduh yang akan dihapus untuk membebaskan kuota Storage.')) return;
  const btn = document.getElementById('dmsCleanupBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Membersihkan…'; }
  try {
    const result = await window.dataService.cleanupGeneratedDocuments(30);
    if (!result.ok) { toast('Gagal membersihkan: ' + result.error, 'error'); return; }
    toast(result.deletedCount > 0
      ? `${result.deletedCount} file dokumen (>30 hari) berhasil dihapus, kuota Storage terbebas`
      : 'Tidak ada dokumen yang melewati masa retensi 30 hari');
    await renderDmsTable();
  } catch (e) {
    toast('Gagal membersihkan: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21" /><path d="m5.082 11.09 8.828 8.828" /></svg> Bersihkan Dokumen >30 Hari'; }
  }
}

/* ============================================================
   JENIS SURAT & KRITERIA PENOMORAN (schema_37) — dulu CHECK constraint
   + CASE hardcode di trigger (schema_10/27), sekarang data di tabel
   document_letter_types. Kelola (tambah/nonaktifkan) KHUSUS Super
   Admin -- role DMS lain (HRD/Pimpinan/Bendahara) cuma lihat, sama
   pola dengan document_templates_insert (schema_28).
   ============================================================ */
function renderLetterTypesTable() {
  const body = document.getElementById('letterTypesTableBody');
  if (!body) return;
  const isSuperAdmin = state.currentProfile?.role === 'super_admin';
  const addBtn = document.getElementById('addLetterTypeBtn');
  if (addBtn) addBtn.style.display = isSuperAdmin ? '' : 'none';

  const templatesByType = {};
  state.documentTemplatesCache.forEach(t => { if (t.document_type_key) templatesByType[t.document_type_key] = t; });

  // Preview "Contoh Nomor" (schema_85): jenis surat numbering_format
  // 'unit_type' menampilkan KODE_UNIT-KODE_JENIS (pakai unit aktif
  // pertama sebagai contoh -- kalau belum ada unit aktif sama sekali,
  // tampilkan placeholder jujur, bukan pura-pura ada), 'type_only'
  // (Surat Cuti/Slip Gaji) tetap format lama satu dimensi.
  const exampleUnitCode = state.issuingUnitsCache.find(u => u.is_active)?.code;

  body.innerHTML = state.letterTypesCache.map(t => {
    const tpl = templatesByType[t.type_key];
    const codeForPreview = t.numbering_format === 'unit_type'
      ? `${exampleUnitCode ? escapeHtml(exampleUnitCode) : '<span style="color:var(--danger-fg);">Belum ada unit aktif</span>'}-${escapeHtml(t.type_code)}`
      : escapeHtml(t.type_code);
    // Kolom Template Surat: dulu cuma tombol unduh (dan salah pakai
    // downloadGeneratedDocument -- bucket 'generated-documents', bukan
    // 'document-templates' tempat file template sebenarnya disimpan,
    // diperbaiki sekalian jadi downloadDocumentTemplate). Sekarang
    // tombol "Generate" JUGA di sini -- fitur generate surat DIPINDAH
    // dari Pengaturan → Template Dokumen ke sini (diminta user), supaya
    // Jenis Dokumen otomatis terkunci ke jenis surat baris ini, bukan
    // dropdown bebas yang bisa salah pilih.
    const templateCell = tpl
      ? `<button class="btn btn-primary btn-sm" data-onclick="openGenerateDocumentModal('${escapeHtml(tpl.id)}', '${escapeHtml(tpl.file_name)}', '${escapeHtml(t.type_key)}')"><svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></svg> Generate</button> <button class="btn btn-ghost btn-sm" aria-label="Unduh template" title="Unduh template" data-onclick="downloadDocumentTemplate('${escapeHtml(tpl.file_url)}')"><svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /></svg></button>`
      : '<span style="color:var(--ink-500);">— belum ada template</span>';
    return `
    <tr>
      <td style="font-weight:600;">${escapeHtml(t.name)}</td>
      <td style="font-family:var(--font-mono);">${escapeHtml(t.type_code)}</td>
      <td style="color:var(--ink-500);font-family:var(--font-mono);font-size:12px;">001/${codeForPreview}/VIII/${new Date().getFullYear()}</td>
      <td>${templateCell}</td>
      <td><span class="badge badge-${t.is_active ? 'success' : 'neutral'}">${t.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
      <td>${isSuperAdmin ? `<button class="btn btn-ghost btn-sm" data-onclick="openEditLetterTypeModal('${t.id}')">Edit</button> <button class="btn btn-ghost btn-sm" data-onclick="toggleLetterTypeActive('${t.id}', ${!t.is_active})">${t.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>` : ''}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--ink-500);padding:24px;">Belum ada jenis surat</td></tr>`;
}

/* ============================================================
   UNIT PENGELUAR SURAT (schema_85) -- pola CRUD identik Jenis Surat
   di atas (Tambah/Edit/Aktifkan-Nonaktifkan, khusus Super Admin).
   Kode unit DIGABUNG dengan kode jenis surat di nomor resmi untuk
   jenis surat ber-numbering_format 'unit_type' (lihat generate_document_number,
   schema_85).
   ============================================================ */
function renderIssuingUnitsTable() {
  const body = document.getElementById('issuingUnitsTableBody');
  if (!body) return;
  const isSuperAdmin = state.currentProfile?.role === 'super_admin';
  const addBtn = document.getElementById('addIssuingUnitBtn');
  if (addBtn) addBtn.style.display = isSuperAdmin ? '' : 'none';

  body.innerHTML = state.issuingUnitsCache.map(u => `
    <tr>
      <td style="font-weight:600;">${escapeHtml(u.name)}</td>
      <td style="font-family:var(--font-mono);">${escapeHtml(u.code)}</td>
      <td><span class="badge badge-${u.is_active ? 'success' : 'neutral'}">${u.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
      <td>${isSuperAdmin ? `<button class="btn btn-ghost btn-sm" data-onclick="openEditIssuingUnitModal('${u.id}')">Edit</button> <button class="btn btn-ghost btn-sm" data-onclick="toggleIssuingUnitActive('${u.id}', ${!u.is_active})">${u.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>` : ''}</td>
    </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--ink-500);padding:24px;">Belum ada unit pengeluar surat</td></tr>`;
}

export function openAddIssuingUnitModal() {
  if (state.currentProfile?.role !== 'super_admin') { toast('Hanya Super Admin yang dapat menambah unit pengeluar surat'); return; }
  document.getElementById('issuingUnitModalTitle').textContent = 'Tambah Unit Pengeluar Surat';
  document.getElementById('iuId').value = '';
  document.getElementById('iuName').value = '';
  document.getElementById('iuCode').value = '';
  openModal('issuingUnitModal');
}

export function openEditIssuingUnitModal(id) {
  if (state.currentProfile?.role !== 'super_admin') { toast('Hanya Super Admin yang dapat mengubah unit pengeluar surat'); return; }
  const row = state.issuingUnitsCache.find(u => u.id === id);
  if (!row) { toast('Unit pengeluar surat tidak ditemukan'); return; }
  document.getElementById('issuingUnitModalTitle').textContent = `Edit Unit Pengeluar Surat — ${row.name}`;
  document.getElementById('iuId').value = row.id;
  document.getElementById('iuName').value = row.name;
  document.getElementById('iuCode').value = row.code;
  openModal('issuingUnitModal');
}

export async function submitIssuingUnit() {
  const id = document.getElementById('iuId').value || null;
  const name = document.getElementById('iuName').value.trim();
  const code = document.getElementById('iuCode').value.trim();
  if (!name || !code) { toast('Nama dan kode wajib diisi'); return; }

  const result = id
    ? await window.dataService.updateDocumentIssuingUnit({ id, code, name })
    : await window.dataService.createDocumentIssuingUnit({ code, name });
  if (!result.ok) { toast(`Gagal ${id ? 'memperbarui' : 'menyimpan'} unit pengeluar surat: ` + result.error, 'error'); return; }
  closeModal('issuingUnitModal');
  toast(id ? 'Unit pengeluar surat berhasil diperbarui' : 'Unit pengeluar surat baru berhasil ditambahkan');
  renderDmsTable();
}

export async function toggleIssuingUnitActive(id, newActiveState) {
  const label = newActiveState ? 'mengaktifkan kembali' : 'menonaktifkan';
  if (!confirm(`Yakin ingin ${label} unit pengeluar surat ini?`)) return;
  const result = await window.dataService.setDocumentIssuingUnitActive(id, newActiveState);
  if (!result.ok) { toast('Gagal mengubah status: ' + result.error, 'error'); return; }
  toast(newActiveState ? 'Unit pengeluar surat diaktifkan kembali' : 'Unit pengeluar surat dinonaktifkan');
  renderDmsTable();
}

function slugifyLetterTypeName(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
export function autofillLetterTypeKey() {
  // Mode edit (#ltId terisi): kode unik terkunci, jangan ikut berubah
  // walau nama diedit -- field-nya sendiri sudah disabled, ini jaga-
  // jaga tambahan.
  if (document.getElementById('ltId').value) return;
  const name = document.getElementById('ltName').value;
  document.getElementById('ltTypeKey').value = slugifyLetterTypeName(name);
}

export function openAddLetterTypeModal() {
  if (state.currentProfile?.role !== 'super_admin') { toast('Hanya Super Admin yang dapat menambah jenis surat'); return; }
  document.getElementById('letterTypeModalTitle').textContent = 'Tambah Jenis Surat';
  document.getElementById('ltId').value = '';
  document.getElementById('ltCurrentTemplateId').value = '';
  document.getElementById('ltCurrentTemplateUrl').value = '';
  document.getElementById('ltName').value = '';
  document.getElementById('ltTypeKey').value = '';
  document.getElementById('ltTypeKey').disabled = false;
  document.getElementById('ltTypeKeyHelper').textContent = 'Otomatis terisi dari nama, boleh disesuaikan sebelum disimpan.';
  document.getElementById('ltTypeCode').value = '';
  document.getElementById('ltTemplateFile').value = '';
  document.getElementById('ltTemplateField').style.display = '';
  document.getElementById('ltTemplateLabel').textContent = 'Template Surat (opsional)';
  document.getElementById('ltTemplateHelper').textContent = 'Kalau diisi, jadi rujukan format resmi jenis surat ini — belum otomatis mengisi dokumen (referensi visual saja).';
  const infoEl = document.getElementById('ltCurrentTemplateInfo');
  infoEl.style.display = 'none';
  infoEl.textContent = '';
  openModal('letterTypeModal');
}

// Kode unik (type_key) SENGAJA tidak bisa diedit di sini -- dia FK
// dari generated_documents.document_type & document_templates.
// document_type_key (schema_37); mengubahnya bisa membuat riwayat
// dokumen lama kehilangan rujukan jenis suratnya. Kalau memang perlu
// ganti kode unik, buat jenis surat baru lalu nonaktifkan yang lama
// (pola yang sudah didokumentasikan di schema_37 sejak awal).
//
// Template Surat SEKARANG JUGA bisa diganti dari mode Edit (diminta
// user) -- field ltCurrentTemplateId/Url melacak template yang SEDANG
// tertaut (kalau ada), dipakai submitLetterType() untuk tahu apakah
// perlu menghapus template lama setelah upload baru berhasil. Ini
// TIDAK melanggar keputusan desain schema_28 ("tidak ada policy UPDATE
// -- ganti = unggah baru + hapus lama") -- cuma menggabungkan 2
// langkah manual itu jadi 1 aksi di UI, bukan overwrite di tempat.
export function openEditLetterTypeModal(id) {
  if (state.currentProfile?.role !== 'super_admin') { toast('Hanya Super Admin yang dapat mengubah jenis surat'); return; }
  const row = state.letterTypesCache.find(t => t.id === id);
  if (!row) { toast('Jenis surat tidak ditemukan'); return; }
  document.getElementById('letterTypeModalTitle').textContent = `Edit Jenis Surat — ${row.name}`;
  document.getElementById('ltId').value = row.id;
  document.getElementById('ltName').value = row.name;
  document.getElementById('ltTypeKey').value = row.type_key;
  document.getElementById('ltTypeKey').disabled = true;
  document.getElementById('ltTypeKeyHelper').textContent = 'Kode unik tidak bisa diubah karena sudah dipakai sebagai rujukan dokumen & template yang ada.';
  document.getElementById('ltTypeCode').value = row.type_code;
  document.getElementById('ltTemplateFile').value = '';
  document.getElementById('ltTemplateField').style.display = '';

  const currentTpl = state.documentTemplatesCache.find(t => t.document_type_key === row.type_key);
  const infoEl = document.getElementById('ltCurrentTemplateInfo');
  if (currentTpl) {
    document.getElementById('ltCurrentTemplateId').value = currentTpl.id;
    document.getElementById('ltCurrentTemplateUrl').value = currentTpl.file_url;
    document.getElementById('ltTemplateLabel').textContent = 'Ganti Template Surat (opsional)';
    document.getElementById('ltTemplateHelper').textContent = 'Kalau diisi, template LAMA otomatis dihapus dan diganti file ini — tidak perlu hapus manual dulu.';
    infoEl.textContent = `<svg class="icon-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></svg> Template saat ini: ${currentTpl.file_name}`;
    infoEl.style.display = '';
  } else {
    document.getElementById('ltCurrentTemplateId').value = '';
    document.getElementById('ltCurrentTemplateUrl').value = '';
    document.getElementById('ltTemplateLabel').textContent = 'Tambah Template Surat (opsional)';
    document.getElementById('ltTemplateHelper').textContent = 'Jenis surat ini belum punya template — bisa langsung diunggah di sini.';
    infoEl.style.display = 'none';
    infoEl.textContent = '';
  }
  openModal('letterTypeModal');
}

export async function submitLetterType() {
  const id = document.getElementById('ltId').value || null;
  const name = document.getElementById('ltName').value.trim();
  const typeKey = document.getElementById('ltTypeKey').value.trim();
  const typeCode = document.getElementById('ltTypeCode').value.trim().toUpperCase();
  const file = document.getElementById('ltTemplateFile').files[0] || null;

  if (!name || !typeKey || !typeCode) { toast('Nama, kode unik, dan kode nomor surat wajib diisi'); return; }
  if (!/^[A-Z]{2,5}$/.test(typeCode)) { toast('Kode nomor surat harus 2–5 huruf kapital'); return; }

  if (id) {
    // Mode edit: typeKey TIDAK dikirim -- immutable, lihat
    // openEditLetterTypeModal() & updateDocumentLetterType().
    const result = await window.dataService.updateDocumentLetterType({ id, typeCode, name });
    if (!result.ok) { toast('Gagal memperbarui jenis surat: ' + result.error, 'error'); return; }

    // Ganti template OPSIONAL -- upload BARU dulu, baru hapus yang
    // LAMA (kalau ada) setelah upload baru sukses. Urutan ini sengaja:
    // kalau upload baru gagal, template lama TETAP UTUH (tidak pernah
    // ada momen jenis surat ini tanpa template sama sekali akibat
    // kegagalan jaringan/dsb).
    if (file) {
      const oldTemplateId = document.getElementById('ltCurrentTemplateId').value || null;
      const oldTemplateUrl = document.getElementById('ltCurrentTemplateUrl').value || null;
      const uploadResult = await window.dataService.uploadDocumentTemplate({
        name: `Template ${name}`, file, documentTypeKey: typeKey,
      });
      if (!uploadResult.ok) {
        toast(`Jenis surat diperbarui, TAPI template baru gagal diunggah (template lama tetap dipakai): ${uploadResult.error}`);
        closeModal('letterTypeModal');
        renderDmsTable();
        return;
      }
      if (oldTemplateId) {
        const deleteResult = await window.dataService.deleteDocumentTemplate(oldTemplateId, oldTemplateUrl);
        if (!deleteResult.ok) {
          toast(`Template baru berhasil diunggah, TAPI template lama gagal dihapus otomatis (hapus manual di Pengaturan → Template Dokumen): ${deleteResult.error}`);
          closeModal('letterTypeModal');
          renderDmsTable();
          return;
        }
      }
    }

    closeModal('letterTypeModal');
    toast('Jenis surat berhasil diperbarui');
    renderDmsTable();
    return;
  }

  const result = await window.dataService.createDocumentLetterType({ typeKey, typeCode, name });
  if (!result.ok) { toast('Gagal menyimpan jenis surat: ' + result.error, 'error'); return; }

  // Upload template OPSIONAL, langsung ditautkan ke jenis surat yang
  // baru dibuat -- ini yang memenuhi "kalau ada pengembangan dokumen
  // bisa langsung diupload templatenya" dalam satu langkah, bukan dua
  // menu terpisah yang harus disambungkan manual.
  if (file) {
    const uploadResult = await window.dataService.uploadDocumentTemplate({
      name: `Template ${name}`, file, documentTypeKey: typeKey,
    });
    if (!uploadResult.ok) {
      toast(`Jenis surat tersimpan, TAPI template gagal diunggah: ${uploadResult.error}`);
      closeModal('letterTypeModal');
      renderDmsTable();
      return;
    }
  }

  closeModal('letterTypeModal');
  toast('Jenis surat baru berhasil ditambahkan');
  renderDmsTable();
}

export async function toggleLetterTypeActive(id, newActiveState) {
  const label = newActiveState ? 'mengaktifkan kembali' : 'menonaktifkan';
  if (!confirm(`Yakin ingin ${label} jenis surat ini?`)) return;
  const result = await window.dataService.setDocumentLetterTypeActive(id, newActiveState);
  if (!result.ok) { toast('Gagal mengubah status: ' + result.error, 'error'); return; }
  toast(newActiveState ? 'Jenis surat diaktifkan kembali' : 'Jenis surat dinonaktifkan');
  renderDmsTable();
}

