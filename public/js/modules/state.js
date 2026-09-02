/* ============================================================
   state.js — Satu-satunya sumber "state" mutable yang tadinya
   berupa `let` global tersebar di app.js (43 variabel, ditemukan
   lewat pemindaian P3.1). Semua modul lain WAJIB baca/tulis
   lewat objek `state` ini, TIDAK boleh punya `let` cache-nya
   sendiri — kalau tidak, tiap modul ES akan punya salinan
   terpisah dan data antar-modul akan tidak sinkron (beda dari
   perilaku script klasik yang berbagi satu global scope).

   Pola pemakaian di modul lain:
     import { state } from './state.js';
     state.employeesCache = await dataService.listEmployees();
     // ... nanti di modul lain:
     renderEmployeeTable(state.employeesCache);

   Nama properti SENGAJA dibuat identik dengan nama variabel lama
   di app.js supaya diff saat migrasi gampang diverifikasi 1:1.
   ============================================================ */

export const state = {
  // --- Auth / sesi ---
  currentProfile: null,

  // --- Pegawai ---
  employeesCache: [],

  // --- Struktur organisasi ---
  orgStructureCache: [],
  orgStructureChildrenOf: new Map(), // parent_id -> array of child rows
  orgPositionModalMode: null,
  orgPositionModalAnchorKode: null,

  // --- Manajemen pengguna ---
  profilesCache: [],

  // --- Audit log ---
  auditLogCache: [],

  // --- Kinerja (Performance) ---
  perfCriteriaCache: [],
  perfPeriodsCache: [],
  __perfPendingTasksDraft: [],
  __perfPendingTasksLocalSeq: 0,
  __activePerfReviewId: null,

  // --- Indeks Beban vs Kompensasi (schema_77) ---
  workloadCategoriesCache: [],
  __perfCompletedTasksDraft: [],
  __perfCompletedTasksLocalSeq: 0,
  __workloadPeriodFilter: null,

  // --- Laporan Kinerja Bulanan (MWR) ---
  __mwrCompletedList: [],
  __mwrPendingList: [],
  __mwrReportId: null,
  __mwrReportStatus: 'draft',
  __mwrCardHomeParent: null,
  __mwrCardHomeNextSibling: null,

  // --- Amanah / referensi payroll ---
  amanahRefCache: [],

  // --- Payroll ---
  __activePeriodId: null,
  __deletePeriodId: null,
  __activePayslipId: null,

  // --- Settings: shift, kutipan login, template dokumen ---
  __shiftsCache: [],
  __loginQuotesCache: [],
  __genDocTemplateId: null,
  // baris LENGKAP (bukan cuma type_key/name) -- perlu numbering_format
  // utk onGenDocTypeChange()
  __genDocLetterTypesCache: [],

  // --- Cuti / Izin ---
  leaveTypesCache: [],
  myLeaveRequestsCache: [],
  __activeLeaveDecisionId: null,
  __kopSuratBase64: null,

  // --- Manajemen Dokumen (DMS) ---
  GENERATED_DOCUMENT_TYPE_LABEL: {},
  dmsDocumentsCache: [],
  letterTypesCache: [],
  issuingUnitsCache: [], // schema_85 — Unit Pengeluar Surat
  documentTemplatesCache: [],

  // --- Database Santri (schema_110, modul berdiri sendiri, 2026-09-01) ---
  studentDbRecordsCache: [],
  __activeStudentDbRecordId: null,
  __studentDbSearchTerm: '',
  __studentDbKkFile: null, // File terpilih (belum diunggah) di modal, direset saat modal ditutup/disimpan
  __studentDbAkteFile: null,

  // --- Navigasi / shell ---
  isNavigatingHash: false,

  // --- Instance Chart.js (dashboard) ---
  __chartByUnit: undefined,
  __chartByStatus: undefined,
  __chartAttendanceTrend: undefined,
  __chartMonthlyExpense: undefined,
  __chartHrCostByDept: undefined,
  __chartHrCostByContract: undefined,
  __chartHrCostTrend: undefined,
  __execChartAttendance: undefined,
  __execChartLeave: undefined,

  // --- UI shell: search, notifikasi, modal, unsaved changes ---
  globalSearchDebounce: null,
  notifPollTimer: null,
  lastSeenNotifCreatedAt: null, // ISO string -- diset ke waktu login
  dirty: false,
  _activeModalId: null,
  _lastFocusedBeforeModal: null,
};
