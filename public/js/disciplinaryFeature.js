/* ====================================================================
   FITUR CATATAN DISIPLIN - HRIS Al-Falah
   Gradasi: Teguran Lisan -> Teguran Tertulis -> SP-1 -> SP-2 -> SP-3.
   Backend: supabase/schema_80_disciplinary_records.sql.
   PERBAIKAN: sebelumnya mengandalkan `currentProfile`/`employeesCache`
   sebagai variabel global bebas ala app.js classic lama -- itu SUDAH
   TIDAK ADA sejak migrasi ke ES modules (lihat modules/state.js).
   Sekarang keduanya diakses lewat `state.currentProfile` /
   `state.employeesCache`, yang tersedia sebagai global lewat
   `Object.assign(window, stateMod)` di modules/main.js (state.js
   meng-export `state` sebagai objek, jadi TIDAK bisa diakses sebagai
   `currentProfile` bare seperti dulu -- itu penyebab bug "macet di
   Memuat data..." karena ReferenceError tak tertangkap di canPropose()).
   dataService, toast, openModal/closeModal, escapeHtml, formatDate
   TETAP bare global seperti sebelumnya -- itu named export asli di
   utils.js/ui-shell.js, jadi Object.assign(window, ...) memang
   menghasilkan bare global untuk yang itu, beda dari `state`.
   ==================================================================== */
(function () {
  var LEVEL_LABEL = {
    teguran_lisan: 'Teguran Lisan', teguran_tertulis: 'Teguran Tertulis',
    sp1: 'SP-1', sp2: 'SP-2', sp3: 'SP-3 (Terakhir)',
  };
  var LEVEL_ORDER = ['teguran_lisan', 'teguran_tertulis', 'sp1', 'sp2', 'sp3'];
  // Kelas badge memakai token warna baku yang SUDAH ADA di index.html
  // (.badge-success/warning/danger/info/neutral) -- tidak ada warna baru.
  var LEVEL_BADGE_CLASS = {
    teguran_lisan: 'badge-neutral', teguran_tertulis: 'badge-info',
    sp1: 'badge-warning', sp2: 'badge-warning', sp3: 'badge-danger',
  };
  var STATUS_LABEL = {
    pending_hrd: 'Menunggu Persetujuan', active: 'Aktif', rejected: 'Ditolak', revoked: 'Dicabut', expired: 'Kedaluwarsa',
  };
  var STATUS_BADGE_CLASS = {
    pending_hrd: 'badge-warning', active: 'badge-success', rejected: 'badge-danger',
    revoked: 'badge-neutral', expired: 'badge-neutral',
  };
  var DECIDER_ROLES = ['super_admin', 'hrd', 'pimpinan'];
  var PROPOSER_ROLES = ['super_admin', 'hrd', 'pimpinan', 'kepala_bagian'];

  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }
  function fmtDate(d) { return (typeof formatDate === 'function' && d) ? formatDate(d) : (d || '—'); }

  var recordsCache = [];
  var currentTab = 'pending_hrd';

  function canPropose() {
    return !!(state.currentProfile && PROPOSER_ROLES.indexOf(state.currentProfile.role) !== -1);
  }
  function canDecide() {
    return !!(state.currentProfile && DECIDER_ROLES.indexOf(state.currentProfile.role) !== -1);
  }

  async function renderDisciplinaryScreen() {
    var container = document.getElementById('disciplinaryContainer');
    if (!container) return;
    container.innerHTML = '<div class="card"><div class="card-pad">Memuat data…</div></div>';
    try {
      recordsCache = await dataService.listDisciplinaryRecords();
    } catch (e) {
      container.innerHTML = '<div class="card"><div class="card-pad">Gagal memuat data: ' + esc(e.message) + '</div></div>';
      return;
    }
    paintDisciplinaryScreen();
  }

  function paintDisciplinaryScreen() {
    var container = document.getElementById('disciplinaryContainer');
    if (!container) return;

    var tabs = [
      { key: 'pending_hrd', label: 'Menunggu Persetujuan' },
      { key: 'active', label: 'Aktif' },
      { key: 'riwayat', label: 'Riwayat (Selesai/Ditolak)' },
    ];
    var filtered = recordsCache.filter(function (r) {
      if (currentTab === 'riwayat') return ['rejected', 'revoked', 'expired'].indexOf(r.status) !== -1;
      return r.status === currentTab;
    });

    var rowsHtml = filtered.length
      ? filtered.map(rowHtml).join('')
      : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--ink-500);">Tidak ada data pada kategori ini</td></tr>';

    container.innerHTML =
      '<div class="card" style="margin-bottom:16px;">' +
      '<div class="card-pad" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">' +
      '<div>' +
      '<h3 style="font-size:14.5px;margin-bottom:4px;">Catatan Disiplin Pegawai</h3>' +
      '<p style="font-size:12px;color:var(--ink-500);">Gradasi: Teguran Lisan → Teguran Tertulis → SP-1 → SP-2 → SP-3. Diajukan Kepala Bagian, disahkan HRD/Pimpinan.</p>' +
      '</div>' +
      (canPropose() ? '<button class="btn btn-primary btn-sm" data-onclick="openDisciplinaryCreateModal()">＋ Ajukan Catatan Baru</button>' : '') +
      '</div>' +
      '<div class="card-pad" style="padding-top:0;">' +
      '<div class="tabs" style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;">' +
      tabs.map(function (t) {
        return '<button class="btn btn-sm ' + (currentTab === t.key ? 'btn-primary' : 'btn-secondary') + '" data-onclick="setDisciplinaryTab(\'' + t.key + '\')">' + t.label + '</button>';
      }).join('') +
      '</div>' +
      '<div style="overflow-x:auto;">' +
      '<table class="dtable"><thead><tr>' +
      '<th>Pegawai</th><th>Level</th><th>Kategori</th><th>Tanggal Kejadian</th><th>Status</th><th style="text-align:right;">Aksi</th>' +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
      '</div></div></div>';
  }

  function badge(cls, label) {
    return '<span class="badge ' + (cls || 'badge-neutral') + '">' + esc(label) + '</span>';
  }

  function rowHtml(r) {
    var emp = r.employees || {};
    var deptName = (emp.departments && emp.departments.name) || '—';
    var actions = [];

    if (r.status === 'pending_hrd' && canDecide()) {
      actions.push('<button class="btn btn-sm btn-primary" data-onclick="openDisciplinaryDecideModal(\'' + r.id + '\',\'active\')">Sahkan</button>');
      actions.push('<button class="btn btn-sm btn-secondary" data-onclick="openDisciplinaryDecideModal(\'' + r.id + '\',\'rejected\')">Tolak</button>');
    }
    if (r.status === 'active') {
      if (canDecide()) actions.push('<button class="btn btn-sm btn-secondary" data-onclick="openDisciplinaryDecideModal(\'' + r.id + '\',\'revoked\')">Cabut</button>');
      if (state.currentProfile && state.currentProfile.employee_id === r.employee_id && !r.acknowledged_at) {
        actions.push('<button class="btn btn-sm btn-primary" data-onclick="acknowledgeDisciplinaryRecordUI(\'' + r.id + '\')">Tandai Sudah Dibaca</button>');
      }
      if (canDecide() || (state.currentProfile && state.currentProfile.role === 'kepala_bagian')) {
        actions.push('<button class="btn btn-sm btn-secondary" data-onclick="openDisciplinaryLetterModal(\'' + r.employee_id + '\',\'' + r.level + '\')">Buat Surat</button>');
      }
    }
    actions.push('<button class="btn btn-sm btn-secondary" data-onclick="viewDisciplinaryDetail(\'' + r.id + '\')">Detail</button>');

    return '<tr>' +
      '<td><b>' + esc(emp.full_name || '—') + '</b><br><span style="font-size:11px;color:var(--ink-500);">' + esc(emp.employee_code || '') + ' · ' + esc(deptName) + '</span></td>' +
      '<td>' + badge(LEVEL_BADGE_CLASS[r.level], LEVEL_LABEL[r.level] || r.level) + '</td>' +
      '<td>' + esc(r.category) + '</td>' +
      '<td>' + fmtDate(r.incident_date) + '</td>' +
      '<td>' + badge(STATUS_BADGE_CLASS[r.status], STATUS_LABEL[r.status] || r.status) +
        (r.status === 'active' && r.valid_until ? '<br><span style="font-size:11px;color:var(--ink-500);">s/d ' + fmtDate(r.valid_until) + '</span>' : '') +
        (r.status === 'active' && !r.acknowledged_at ? '<br><span style="font-size:11px;color:var(--danger-fg);">Belum dibaca pegawai</span>' : '') +
      '</td>' +
      '<td style="text-align:right;white-space:nowrap;">' + actions.join(' ') + '</td>' +
      '</tr>';
  }

  window.setDisciplinaryTab = function (tab) { currentTab = tab; paintDisciplinaryScreen(); };

  /* -------------------- Modal: Ajukan Catatan Baru -------------------- */
  window.openDisciplinaryCreateModal = async function () {
    var form = document.getElementById('disciplinaryCreateForm');
    if (form) form.reset();
    document.getElementById('discSuggestion').textContent = '';
    var select = document.getElementById('discEmployeeSelect');
    select.innerHTML = '<option value="">Memuat…</option>';
    try {
      if (!state.employeesCache.length) state.employeesCache = await dataService.listEmployees();
      var list = state.employeesCache.slice();
      if (state.currentProfile && state.currentProfile.role === 'kepala_bagian') {
        list = list.filter(function (e) { return e.department_id === state.currentProfile.department_id; });
      }
      select.innerHTML = list.sort(function (a, b) { return a.full_name.localeCompare(b.full_name, 'id'); })
        .map(function (e) { return '<option value="' + e.id + '">' + esc(e.full_name) + (e.position ? ' — ' + esc(e.position) : '') + '</option>'; })
        .join('') || '<option value="">Tidak ada pegawai di departemen Anda</option>';
    } catch (e) { select.innerHTML = '<option value="">Gagal memuat daftar pegawai</option>'; }
    var directWrap = document.getElementById('discDirectActiveWrap');
    if (directWrap) directWrap.style.display = canDecide() ? 'block' : 'none';
    openModal('disciplinaryCreateModal');
  };

  window.onDiscEmployeeChange = async function () {
    var employeeId = document.getElementById('discEmployeeSelect').value;
    var hint = document.getElementById('discSuggestion');
    if (!employeeId) { hint.textContent = ''; return; }
    hint.textContent = 'Memeriksa riwayat…';
    try {
      var active = await dataService.getEmployeeActiveDisciplinaryLevel(employeeId);
      if (!active) { hint.textContent = 'Belum ada catatan disiplin aktif untuk pegawai ini.'; return; }
      var idx = LEVEL_ORDER.indexOf(active.highest_active_level);
      var suggestion = LEVEL_ORDER[Math.min(idx + 1, LEVEL_ORDER.length - 1)];
      hint.innerHTML = 'Level aktif tertinggi saat ini: <b>' + (LEVEL_LABEL[active.highest_active_level] || active.highest_active_level) + '</b>' +
        (active.latest_valid_until ? ' (berlaku s/d ' + fmtDate(active.latest_valid_until) + ')' : '') +
        '. Saran gradasi berikutnya: <b>' + (LEVEL_LABEL[suggestion] || suggestion) + '</b> — bisa disesuaikan sesuai berat-ringannya pelanggaran.';
      var levelSelect = document.getElementById('discLevelSelect');
      if (levelSelect && !levelSelect.value) levelSelect.value = suggestion;
    } catch (e) { hint.textContent = ''; }
  };

  window.submitDisciplinaryCreate = async function () {
    var employeeId = document.getElementById('discEmployeeSelect').value;
    var level = document.getElementById('discLevelSelect').value;
    var category = document.getElementById('discCategoryInput').value.trim();
    var description = document.getElementById('discDescriptionInput').value.trim();
    var incidentDate = document.getElementById('discIncidentDateInput').value;
    var file = document.getElementById('discEvidenceInput') && document.getElementById('discEvidenceInput').files[0];
    if (!employeeId || !level || !category || !description || !incidentDate) {
      toast('Semua field wajib diisi'); return;
    }
    var btn = document.getElementById('discCreateSubmitBtn');
    btn.disabled = true; btn.textContent = 'Menyimpan…';
    try {
      var evidenceUrl = null;
      if (file) {
        // window.compressImageIfNeeded datang dari public/js/modules/utils.js
        // (di-expose lewat Object.assign(window, ...) di main.js) -- skrip
        // ini classic script (bukan ES module) jadi tidak bisa import
        // langsung, dipanggil lewat window seperti dataService lainnya.
        file = await window.compressImageIfNeeded(file);
        var up = await dataService.uploadDisciplinaryEvidence(employeeId, file);
        if (!up.ok) { toast(up.error); return; }
        evidenceUrl = up.path;
      }
      var directActive = document.getElementById('discDirectActiveCheckbox');
      var status = (directActive && directActive.checked && canDecide()) ? 'active' : 'pending_hrd';
      var result = await dataService.createDisciplinaryRecord({
        employee_id: employeeId, level: level, category: category, description: description,
        incident_date: incidentDate, evidence_url: evidenceUrl, status: status,
      });
      if (!result.ok) { toast('Gagal menyimpan: ' + result.error); return; }
      closeModal('disciplinaryCreateModal');
      toast('Catatan disiplin berhasil diajukan');
      renderDisciplinaryScreen();
    } finally {
      btn.disabled = false; btn.textContent = 'Simpan';
    }
  };

  /* -------------------- Modal: Sahkan/Tolak/Cabut -------------------- */
  var discDecideId = null, discDecideStatus = null;
  window.openDisciplinaryDecideModal = function (id, status) {
    discDecideId = id; discDecideStatus = status;
    var titles = { active: 'Sahkan Catatan Disiplin', rejected: 'Tolak Pengajuan', revoked: 'Cabut Catatan Disiplin' };
    document.getElementById('discDecideTitle').textContent = titles[status] || 'Keputusan';
    var notesWrap = document.getElementById('discDecideNotesWrap');
    notesWrap.querySelector('span.req').style.display = (status === 'active') ? 'none' : 'inline';
    document.getElementById('discDecideNotes').value = '';
    var validUntilWrap = document.getElementById('discDecideValidUntilWrap');
    validUntilWrap.style.display = (status === 'active') ? 'block' : 'none';
    document.getElementById('discDecideValidUntil').value = '';
    openModal('disciplinaryDecideModal');
  };
  window.submitDisciplinaryDecide = async function () {
    var notes = document.getElementById('discDecideNotes').value.trim();
    if (discDecideStatus !== 'active' && !notes) { toast('Alasan wajib diisi'); return; }
    var validUntil = document.getElementById('discDecideValidUntil').value || null;
    var result = await dataService.decideDisciplinaryRecord(discDecideId, { status: discDecideStatus, decision_notes: notes, valid_until: validUntil });
    if (!result.ok) { toast('Gagal: ' + result.error); return; }
    closeModal('disciplinaryDecideModal');
    toast('Keputusan berhasil disimpan');
    renderDisciplinaryScreen();
  };

  /* -------------------- Tandai sudah dibaca (pegawai) -------------------- */
  window.acknowledgeDisciplinaryRecordUI = async function (id) {
    var note = prompt('Tanggapan/pembelaan (opsional, boleh dikosongkan):', '') || '';
    var result = await dataService.acknowledgeDisciplinaryRecord(id, note);
    if (!result.ok) { toast('Gagal: ' + result.error); return; }
    toast('Ditandai sudah dibaca');
    renderDisciplinaryScreen();
  };

  /* -------------------- Detail (read-only) -------------------- */
  window.viewDisciplinaryDetail = function (id) {
    var r = recordsCache.find(function (x) { return x.id === id; });
    if (!r) return;
    var emp = r.employees || {};
    var lines = [
      'Pegawai: ' + (emp.full_name || '—') + ' (' + (emp.employee_code || '—') + ')',
      'Level: ' + (LEVEL_LABEL[r.level] || r.level),
      'Kategori: ' + r.category,
      'Tanggal Kejadian: ' + fmtDate(r.incident_date),
      'Deskripsi: ' + r.description,
      'Status: ' + (STATUS_LABEL[r.status] || r.status),
      'Diajukan oleh: ' + ((r.proposer && r.proposer.full_name) || '—'),
      r.decided_at ? 'Diputuskan oleh: ' + ((r.decider && r.decider.full_name) || '—') + ' pada ' + fmtDate(r.decided_at) : '',
      r.decision_notes ? 'Catatan Keputusan: ' + r.decision_notes : '',
      r.status === 'active' ? 'Berlaku s/d: ' + fmtDate(r.valid_until) : '',
      r.acknowledged_at ? 'Dibaca pegawai pada: ' + fmtDate(r.acknowledged_at) : 'Belum ditandai dibaca oleh pegawai',
      r.acknowledged_note ? 'Tanggapan Pegawai: ' + r.acknowledged_note : '',
    ].filter(Boolean);
    alert(lines.join('\n'));
  };

  /* -------------------- Buat Surat (pakai modal generate dokumen yang
     sudah ada, dicari template yang cocok dgn document_type_key = level) */
  window.openDisciplinaryLetterModal = async function (employeeId, level) {
    if (level === 'teguran_lisan') { toast('Teguran lisan tidak memiliki surat resmi -- cukup dicatat di sistem'); return; }
    try {
      var templates = await dataService.listDocumentTemplates();
      var match = templates.find(function (t) { return t.document_type_key === level; });
      if (!match) {
        toast('Belum ada template surat untuk jenis "' + (LEVEL_LABEL[level] || level) + '" -- unggah dulu di menu Manajemen Dokumen > Template Dokumen');
        return;
      }
      await openGenerateDocumentModal(match.id, match.name);
      var empSelect = document.getElementById('genDocEmployeeSelect');
      var typeSelect = document.getElementById('genDocType');
      if (empSelect) empSelect.value = employeeId;
      if (typeSelect) typeSelect.value = level;
    } catch (e) {
      toast('Gagal membuka form surat: ' + e.message);
    }
  };

  // Diekspos supaya goto() di app.js bisa memanggilnya -- pola identik
  // renderCalendar() milik calendarFeature.js.
  window.renderDisciplinary = renderDisciplinaryScreen;
})();


