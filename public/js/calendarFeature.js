/* ====================================================================
   FITUR KALENDER - HRIS Al-Falah
   Diadaptasi dari calendar_feature.js (sumber: app/index.html prototipe
   lain) supaya cocok dengan arsitektur repo ini:
   - Data cuti diambil lewat dataService.listAllLeaveRequestsForReport()
     (bukan fetch REST /rest/v1/... langsung).
   - Kegiatan lembaga (institutional_events, schema_70) AKTIF: dibaca
     lewat dataService.listInstitutionalEvents(), ditambah/diubah/dihapus
     lewat create/update/deleteInstitutionalEvent(). Tulis dibatasi ke
     super_admin/hrd/pimpinan -- diberlakukan di RLS (server) dan
     disembunyikan di UI (canManageEvents) sebagai lapis kedua, bukan
     satu-satunya penjaga.
   - escHtml didefinisikan lokal karena tidak ada helper global sejenis
     di app.js.
   Palet warna memakai token baku yang SUDAH ADA di :root (lihat alias
   --badge-*, --brand-light/dark, --metric-bg, --ink, --ink-2, --muted
   yang ditambahkan di public/index.html, semuanya mengarah ke token asli
   seperti --success-bg, --brand-900, dst) -- tidak ada warna baru.
   ==================================================================== */
(function () {
  var calStates = {};
  var eventsCache = {}; // containerId -> array hasil listInstitutionalEvents() render terakhir
  var shareContextCache = {}; // containerId -> {byDay, eventsByDay, gridStart, gridEnd, view, year, month0} render terakhir, dipakai fitur Bagikan

  // ------------------------------------------------------------------
  // CACHE DATA BERSAMA (leave requests approved + kegiatan lembaga +
  // departemen) -- PERBAIKAN PERFORMA (audit 2026-08-24): sebelumnya
  // renderCalendar() DAN renderAgendaCard() (kartu "Agenda Bulan Ini"
  // di tab Ringkasan profil) masing-masing melakukan fetch PENUH dari
  // nol setiap dipanggil, tanpa cache dan tanpa batas tanggal --
  // listAllLeaveRequestsForReport() mengambil SELURUH riwayat cuti dan
  // listInstitutionalEvents() mengambil SELURUH kegiatan lembaga sejak
  // awal berdiri (institutional_events TIDAK dibatasi RLS per baris --
  // semua pengguna login dapat baris yang sama, cuma leave requests
  // yang dibatasi RLS per role). Akibatnya:
  //  1. Login (self-service) -> viewEmployee() -> renderAgendaCard():
  //     fetch penuh #1.
  //  2. Buka tab Kalender -> renderCalendar(): fetch penuh #2 (DATA
  //     SAMA PERSIS dengan #1, cuma detik berikutnya).
  //  3. Klik bulan berikutnya/sebelumnya/Hari-ini/ganti tampilan
  //     Bulan-Minggu-Agenda/filter divisi: fetch penuh lagi SETIAP
  //     klik, padahal data cuti & kegiatan lembaga tidak berubah --
  //     cuma rentang tanggal yang ditampilkan yang berubah (itu pun
  //     difilter di CLIENT lewat distributeEventsByDay, bukan di
  //     query). Ini penyebab utama laporan "kalender sering loading
  //     lama", terutama di akun pegawai/guru yang lebih sering buka
  //     tab Kalender di HP dengan koneksi lebih lambat.
  // TTL pendek (60 detik) dipilih supaya perubahan data (cuti baru
  // disetujui, kegiatan baru ditambahkan) tetap terlihat dalam waktu
  // wajar TANPA perlu melacak/invalidasi manual di setiap titik mutasi
  // di seluruh aplikasi -- titik mutasi yang memang mudah dijangkau
  // (saveEventModal/deleteEventModal di file ini, submitLeaveDecision
  // di app.js) tetap memanggil invalidateCalendarDataCache() secara
  // eksplisit supaya orang yang BARU SAJA melakukan aksi itu langsung
  // melihat hasilnya, tidak perlu menunggu TTL habis.
  var CAL_DATA_CACHE_TTL_MS = 60 * 1000;
  var calDataCache = { leaveRequests: null, institutionalEvents: null, departments: null, fetchedAt: 0 };

  async function loadCalendarSharedData() {
    var now = Date.now();
    if (calDataCache.fetchedAt && (now - calDataCache.fetchedAt) < CAL_DATA_CACHE_TTL_MS) {
      return calDataCache;
    }
    var leaveRequests = [];
    try {
      var all = await dataService.listAllLeaveRequestsForReport();
      leaveRequests = (all || []).filter(function (r) { return r.status === "approved"; });
    } catch (e) { leaveRequests = []; }
    var institutionalEvents = [];
    try { institutionalEvents = await dataService.listInstitutionalEvents(); } catch (e) { institutionalEvents = []; }
    var departments = [];
    try { departments = await dataService.listDepartments(); } catch (e) { departments = []; }
    calDataCache = { leaveRequests: leaveRequests, institutionalEvents: institutionalEvents, departments: departments, fetchedAt: now };
    return calDataCache;
  }

  function invalidateCalendarDataCache() {
    calDataCache.fetchedAt = 0;
  }

  function getCalState(containerId) {
    if (!calStates[containerId]) calStates[containerId] = { year: null, month: null, department: "all", view: "month", weekAnchor: null };
    return calStates[containerId];
  }

  // super_admin/hrd/pimpinan -- sama persis dengan RLS institutional_events_write
  // (schema_70) dan pola REGISTRATION_APPROVAL_ROLES yang sudah dipakai di app.js.
  // PERBAIKAN (ditemukan lewat audit 2026-09-01, pola bug SAMA PERSIS
  // dengan disciplinaryFeature.js yang sudah diperbaiki lebih dulu --
  // lihat catatan lengkap di kepala file itu): sebelumnya mengandalkan
  // `currentProfile` sebagai variabel global bebas ala app.js classic
  // lama -- SUDAH TIDAK ADA sejak migrasi ES modules (P3.1). Guard
  // `typeof currentProfile !== "undefined"` TIDAK melempar error (aman
  // dari ReferenceError), tapi karena globalnya memang tidak pernah ada
  // lagi, kondisi itu SELALU false -- canManageEvents() diam-diam SELALU
  // mengembalikan false untuk SEMUA orang, termasuk super_admin/hrd/
  // pimpinan yang sah. Dampak: tombol "Tambah Kegiatan" + kelola
  // kegiatan lembaga di kalender hilang total dari UI tanpa pesan error
  // apa pun -- persis pola silent-fail yang sama, bukan ReferenceError
  // yang mudah ketahuan. Sekarang diakses lewat `state.currentProfile`
  // (bare `state`, tersedia global lewat `Object.assign(window,
  // stateMod)` di modules/main.js).
  var EVENT_MANAGE_ROLES = ["super_admin", "hrd", "pimpinan"];
  function canManageEvents() {
    try {
      return !!(window.state && window.state.currentProfile && EVENT_MANAGE_ROLES.indexOf(window.state.currentProfile.role) !== -1);
    } catch (e) { return false; }
  }

  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var DAY_NAMES_ID = ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu"];
  // Dipakai KHUSUS untuk header grid bulan/minggu di layar sempit (HP) --
  // lihat isNarrow di renderCalendar(). Nama lengkap ("Selasa", "Jum'at")
  // pada font Philosopher 17px tidak muat di lebar kolom grid 7-kolom pada
  // layar HP (~360-412px), sehingga TERPOTONG dan tertimpa (bukan terlihat
  // rapi ter-wrap) oleh background kolom sebelahnya yang di-render setelahnya
  // -- itulah sumber tampilan aneh "Ahac", "Senii", "Selas" dst yang
  // dilaporkan pengguna. Singkatan 3 huruf ini + font lebih kecil dipakai
  // sebagai pengganti, bukan cuma overflow:hidden, supaya tetap terbaca
  // jelas (bukan cuma tidak lagi "aneh").
  var DAY_NAMES_ID_SHORT = ["Ahd", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  var MONTH_NAMES_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  var LEAVE_TYPE_COLORS_FALLBACK = { bg: "var(--badge-gray-bg)", fg: "var(--badge-gray-fg)" };
  var LEAVE_TYPE_COLORS = {
    "Cuti Tahunan":    { bg: "var(--badge-green-bg)", fg: "var(--badge-green-fg)" },
    "Cuti Sakit":      { bg: "var(--badge-red-bg)",   fg: "var(--badge-red-fg)" },
    "Cuti Melahirkan": { bg: "var(--badge-amber-bg)", fg: "var(--badge-amber-fg)" },
    "Izin Khusus":     { bg: "var(--badge-blue-bg)",  fg: "var(--badge-blue-fg)" }
  };
  // Kategori institutional_events (schema_70 CHECK constraint) -> warna.
  var EVENT_CATEGORY_LABELS = {
    akademik: "Akademik", keagamaan: "Keagamaan", umum: "Umum", libur_lembaga: "Libur Lembaga"
  };
  var EVENT_CATEGORY_COLORS = {
    akademik:      { bg: "var(--badge-blue-bg)",  fg: "var(--badge-blue-fg)" },
    keagamaan:     { bg: "var(--badge-green-bg)", fg: "var(--badge-green-fg)" },
    umum:          { bg: "var(--badge-gray-bg)",  fg: "var(--badge-gray-fg)" },
    libur_lembaga: { bg: "var(--badge-amber-bg)", fg: "var(--badge-amber-fg)" }
  };
  // Ikon per kategori (schema_70 CHECK constraint) -- dipakai di chip
  // grid bulan/minggu, daftar agenda, legend, dan modal lihat-detail,
  // supaya kategori bisa dibedakan tanpa mengandalkan warna saja
  // (aksesibilitas: warna+ikon, bukan warna sendirian). Emoji dipilih
  // (bukan font ikon eksternal) karena app ini sengaja tanpa dependensi
  // CDN font/ikon dan CSP-nya ketat (lihat tests/csp_connect_src_covers_
  // fetch_domains.test.js) -- menambah CDN baru berarti nambah baris
  // whitelist CSP untuk manfaat yang sama bisa dicapai tanpa itu.
  var EVENT_CATEGORY_ICONS = {
    akademik: "🎓", keagamaan: "🕌", umum: "🗓️", libur_lembaga: "🏖️"
  };
  function eventColor(cat) { return EVENT_CATEGORY_COLORS[cat] || LEAVE_TYPE_COLORS_FALLBACK; }
  function eventIcon(cat) { return EVENT_CATEGORY_ICONS[cat] || "📌"; }
  function leaveColor(type) { return LEAVE_TYPE_COLORS[type] || LEAVE_TYPE_COLORS_FALLBACK; }

  // Ikon PENANDA garis (bukan emoji) untuk badge sel kalender gaya kartu --
  // gaya SAMA PERSIS dengan ikon menu sidebar (.nav-item .ic di index.html):
  // viewBox 24x24, fill:none, stroke:currentColor (otomatis ikut warna
  // .fg badge masing-masing), stroke-width 1.8, ujung/sambungan bulat.
  // 13px supaya proporsional di dalam badge bulat ~22px (lihat renderDayCellV2).
  var DAY_MARKER_ICON_ATTRS = 'width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"';
  var DAY_MARKER_ICONS = {
    // Bulan sabit -- hari libur/penting Islam (bar hijau)
    crescent: '<svg ' + DAY_MARKER_ICON_ATTRS + '><path d="M15.5 3.5A8.5 8.5 0 1 0 20.5 18a7 7 0 0 1-5-13.5Z"/></svg>',
    // Bendera -- hari libur nasional lainnya (bar merah)
    flag: '<svg ' + DAY_MARKER_ICON_ATTRS + '><path d="M6 21V4"/><path d="M6 4.5h11l-2.7 3.5L17 11.5H6"/></svg>',
    // Orang -- cuti pegawai (bar biru)
    person: '<svg ' + DAY_MARKER_ICON_ATTRS + '><circle cx="12" cy="8" r="3.3"/><path d="M5.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2"/></svg>',
    // Topi wisuda -- kegiatan lembaga kategori "akademik"
    academic: '<svg ' + DAY_MARKER_ICON_ATTRS + '><path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M6 10.5V16c0 1.5 2.5 3 6 3s6-1.5 6-3v-5.5"/><path d="M22 8v6"/></svg>',
    // Tenda -- kegiatan lembaga terkait Pramuka/perkemahan (cocok-kata "pramuka"/"kemah" di judul)
    scout: '<svg ' + DAY_MARKER_ICON_ATTRS + '><path d="M3 20h18"/><path d="M12 4 3 20h18L12 4Z"/><path d="M9 20l3-6.5 3 6.5"/></svg>',
    // Toa/pengumuman -- kegiatan lembaga umum, tanpa cocok-kata kategori lain
    megaphone: '<svg ' + DAY_MARKER_ICON_ATTRS + '><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M17 8a4 4 0 0 1 0 8"/></svg>',
    // Medali/penghargaan -- kegiatan lembaga terkait wisuda (cocok-kata "wisuda" di judul)
    graduation: '<svg ' + DAY_MARKER_ICON_ATTRS + '><circle cx="12" cy="8" r="5"/><path d="M8.5 12.5 7 21l5-3 5 3-1.5-8.5"/></svg>'
  };
  // Cocok-kata judul kegiatan lembaga -> ikon spesifik (Pramuka/Wisuda), sama
  // pola dengan ISLAMIC_HOLIDAY_PATTERN di bawah: institutional_events
  // (schema_70) TIDAK punya kolom sub-jenis, cuma category umum (akademik/
  // keagamaan/umum/libur_lembaga) + title bebas teks -- jadi Pramuka & Wisuda
  // (yang bukan category tersendiri di skema) dikenali dari kata di title.
  var SCOUT_EVENT_PATTERN = /pramuka|kemah|kepanduan/i;
  var GRADUATION_EVENT_PATTERN = /wisuda|kelulusan/i;
  // Ikon badge kalender untuk satu kegiatan lembaga: akademik pakai topi
  // wisuda langsung dari category resminya; Pramuka & Wisuda dari cocok-kata
  // title (lihat catatan di atas); selain itu (umum, keagamaan non-Islam,
  // libur_lembaga, dst) jatuh ke ikon toa generik.
  function institutionalEventDayIcon(ev) {
    if (ev.category === 'akademik') return DAY_MARKER_ICONS.academic;
    if (SCOUT_EVENT_PATTERN.test(ev.title || '')) return DAY_MARKER_ICONS.scout;
    if (GRADUATION_EVENT_PATTERN.test(ev.title || '')) return DAY_MARKER_ICONS.graduation;
    return DAY_MARKER_ICONS.megaphone;
  }

  /* ================================================================
     EKSPOR KALENDER — .ics (unduh) & "Tambah ke Google Calendar".
     Cakupan SENGAJA dibatasi ke Kegiatan Lembaga (institutional_events)
     saja, TIDAK termasuk data cuti pegawai -- cuti bersifat personal,
     mengekspornya ke file yang bisa dibagikan/diimpor siapa saja
     berpotensi membocorkan siapa cuti kapan ke luar sistem. Kegiatan
     Lembaga memang untuk konsumsi bersama (RLS select-nya sendiri
     sudah "semua pengguna login", lihat schema_70), jadi aman diekspor.

     "Tambah ke Google Calendar" per-kegiatan pakai quick-add link
     resmi Google (https://calendar.google.com/calendar/render?...) --
     BUKAN integrasi API, cuma buka tab baru dengan form sudah terisi,
     jadi tidak perlu OAuth/API key apa pun. Google TIDAK menyediakan
     link serupa untuk banyak event sekaligus, makanya untuk ekspor
     borongan dipakai .ics (format standar RFC 5545, bisa diimpor ke
     Google Calendar lewat Setelan > Impor & Ekspor, juga ke
     Outlook/Apple Calendar/dll).
     ================================================================ */
  function icsDateValue(ymd) { return (ymd || "").replace(/-/g, ""); }

  function addDaysYmd(ymd, days) {
    var p = ymd.split("-").map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    d.setDate(d.getDate() + days);
    return ymdStr(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // RFC 5545 §3.3.11: escape backslash, titik koma, koma, dan baris baru.
  function icsEscapeText(s) {
    return String(s == null ? "" : s)
      .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }

  // RFC 5545 §3.1: baris >75 oktet harus dilipat (folded), lanjutan
  // dimulai dengan satu spasi. Deskripsi kegiatan bisa panjang, jadi ini
  // bukan sekadar formalitas -- tanpanya beberapa aplikasi kalender
  // (terutama yang ketat) menolak/memotong file .ics-nya.
  function foldIcsLine(line) {
    if (line.length <= 75) return line;
    var out = "", i = 0;
    while (i < line.length) {
      var take = i === 0 ? 75 : 74;
      out += (i === 0 ? "" : "\r\n ") + line.slice(i, i + take);
      i += take;
    }
    return out;
  }

  function icsTimestampNow() {
    var d = new Date();
    function p(n) { return n < 10 ? "0" + n : "" + n; }
    return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + "T" + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + "Z";
  }

  // events: array hasil listInstitutionalEvents() (id, title, category,
  // start_date, end_date, description). DTEND dibuat exclusive (+1 hari
  // dari end_date) sesuai konvensi VALUE=DATE RFC 5545 -- kalau tidak,
  // aplikasi kalender akan menampilkan kegiatan berakhir sehari lebih
  // awal dari yang sebenarnya.
  function buildIcsCalendar(events) {
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HRIS Al-Falah//Kegiatan Lembaga//ID", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    var stamp = icsTimestampNow();
    (events || []).forEach(function (ev) {
      lines.push("BEGIN:VEVENT");
      lines.push(foldIcsLine("UID:" + ev.id + "@hris-alfalah"));
      lines.push("DTSTAMP:" + stamp);
      lines.push("DTSTART;VALUE=DATE:" + icsDateValue(ev.start_date));
      lines.push("DTEND;VALUE=DATE:" + icsDateValue(addDaysYmd(ev.end_date, 1)));
      lines.push(foldIcsLine("SUMMARY:" + icsEscapeText(ev.title)));
      if (ev.description) lines.push(foldIcsLine("DESCRIPTION:" + icsEscapeText(ev.description)));
      lines.push(foldIcsLine("CATEGORIES:" + icsEscapeText(EVENT_CATEGORY_LABELS[ev.category] || ev.category)));
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }

  function slugifyFilename(s) {
    return String(s || "kegiatan").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "kegiatan";
  }

  function downloadIcsFile(filename, content) {
    var blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ================================================================
     BERBAGI (WhatsApp) — merangkum cuti pegawai & Kegiatan Lembaga yang
     sedang tampil (rentang & filter divisi mengikuti tampilan aktif:
     Bulan/Minggu/Agenda) jadi teks ringkas, dibuka lewat wa.me (link
     resmi WhatsApp, tanpa API/OAuth). TIDAK mengirim otomatis -- cuma
     membuka WhatsApp dengan teks sudah terisi, pengirimannya tetap
     tindakan sadar oleh pengguna sendiri.
     ================================================================ */
  function buildShareSummaryText(containerId, label) {
    var ctx = shareContextCache[containerId];
    if (!ctx) return "";
    var dates = [];
    var seen = {};
    Object.keys(ctx.byDay).concat(Object.keys(ctx.eventsByDay)).forEach(function (k) {
      if (!seen[k] && k >= ctx.gridStart && k <= ctx.gridEnd) { seen[k] = true; dates.push(k); }
    });
    dates.sort();
    var lines = ["*Agenda " + label + "*", ""];
    if (!dates.length) {
      lines.push("Tidak ada cuti maupun kegiatan pada rentang ini.");
    } else {
      dates.forEach(function (k) {
        var p = k.split("-").map(Number);
        lines.push("*" + p[2] + " " + MONTH_NAMES_ID[p[1] - 1] + "*");
        (ctx.eventsByDay[k] || []).forEach(function (ev) { var dn = ev.departments && ev.departments.name; lines.push(eventIcon(ev.category) + " " + ev.title + " (" + (EVENT_CATEGORY_LABELS[ev.category] || ev.category) + (dn ? " — " + dn : "") + ")"); });
        (ctx.byDay[k] || []).forEach(function (e) { lines.push("🗓 " + e.employeeName + " — " + e.type); });
        lines.push("");
      });
    }
    lines.push("_Dikirim dari Kalender HRIS Al-Falah_");
    return lines.join("\n");
  }

  function shareCalendarWhatsApp(containerId) {
    var ctx = shareContextCache[containerId];
    if (!ctx) { toast("Kalender belum siap, coba lagi sebentar"); return; }
    var label = ctx.view === "agenda" ? MONTH_NAMES_ID[ctx.month0] + " " + ctx.year
      : ctx.view === "week" ? (ctx.gridStart + " s.d. " + ctx.gridEnd)
      : MONTH_NAMES_ID[ctx.month0] + " " + ctx.year;
    var text = buildShareSummaryText(containerId, label);
    if (!text) { toast("Belum ada data untuk dibagikan"); return; }
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
  }

  function downloadAllEventsIcs(containerId) {
    var events = eventsCache[containerId] || [];
    if (!events.length) { toast("Belum ada Kegiatan Lembaga untuk diunduh"); return; }
    downloadIcsFile("kegiatan-lembaga-alfalah.ics", buildIcsCalendar(events));
  }

  function downloadSingleEventIcs(containerId, eventId) {
    var ev = (eventsCache[containerId] || []).find(function (e) { return e.id === eventId; });
    if (!ev) { toast("Kegiatan tidak ditemukan"); return; }
    downloadIcsFile("kegiatan-" + slugifyFilename(ev.title) + ".ics", buildIcsCalendar([ev]));
  }

  function googleCalendarUrlForEvent(ev) {
    var params = new URLSearchParams();
    params.set("action", "TEMPLATE");
    params.set("text", ev.title || "");
    params.set("dates", icsDateValue(ev.start_date) + "/" + icsDateValue(addDaysYmd(ev.end_date, 1)));
    if (ev.description) params.set("details", ev.description);
    return "https://calendar.google.com/calendar/render?" + params.toString();
  }

  function addEventToGoogleCalendar(containerId, eventId) {
    var ev = (eventsCache[containerId] || []).find(function (e) { return e.id === eventId; });
    if (!ev) { toast("Kegiatan tidak ditemukan"); return; }
    window.open(googleCalendarUrlForEvent(ev), "_blank", "noopener");
  }

  /* ================================================================
     INTEGRASI HARI LIBUR/PENTING INDONESIA
     Sumber: guangrei/APIHariLibur_V2 (GitHub, GPL-3.0, auto-updated dari
     Google Calendar). Diambil saat runtime lewat fetch() -- tidak
     menyalin kode sumbernya, jadi tidak mewarisi lisensi GPL ke aplikasi
     ini. Hanya mencakup tahun berjalan; kalau pengguna menavigasi ke
     tahun lain, sel kalender untuk tahun itu sederhananya tidak mendapat
     tanda hari libur -- bukan error.
     ================================================================ */
  var HOLIDAY_SOURCE_URL = "https://raw.githubusercontent.com/guangrei/APIHariLibur_V2/main/calendar.min.json";
  var HOLIDAY_CACHE_KEY = "hris-holiday-cache-v1";
  var HOLIDAY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

  function parseHolidayData(raw) {
    var out = {};
    Object.keys(raw || {}).forEach(function (key) {
      if (key === "info") return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
      var v = raw[key];
      out[key] = {
        holiday: !!v.holiday,
        summary: (v.summary && v.summary.length) ? v.summary.join(", ") : "",
        description: (v.description && v.description.length) ? v.description.join(", ") : ""
      };
    });
    return out;
  }
  function getCachedHolidays(now) {
    now = now || Date.now();
    try {
      var raw = localStorage.getItem(HOLIDAY_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.fetchedAt !== "number" || !parsed.data) return null;
      if (now - parsed.fetchedAt > HOLIDAY_CACHE_MAX_AGE_MS) return null;
      return parsed.data;
    } catch (e) { return null; }
  }
  function setCachedHolidays(data) {
    try { localStorage.setItem(HOLIDAY_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), data: data })); } catch (e) {}
  }
  function loadHolidays() {
    var cached = getCachedHolidays();
    if (cached) return Promise.resolve(cached);
    return fetch(HOLIDAY_SOURCE_URL).then(function (res) {
      if (!res.ok) throw new Error("status " + res.status);
      return res.json();
    }).then(function (raw) {
      var parsed = parseHolidayData(raw);
      setCachedHolidays(parsed);
      return parsed;
    }).catch(function (e) {
      console.warn("Gagal memuat data hari libur (kalender tetap jalan tanpa tanda hari libur):", e.message);
      return {};
    });
  }

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function ymdStr(y, m, d) { return y + "-" + pad2(m + 1) + "-" + pad2(d); }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function sundayIndex(y, m, d) { return new Date(y, m, d).getDay(); }

  // --- Kalender Hijriah -------------------------------------------------
  // Pakai Intl.DateTimeFormat calendar islamic-umalqura bawaan browser
  // (tanpa API eksternal, tanpa dependency baru). Fallback ke null kalau
  // browser tidak mendukung -- UI cukup tidak menampilkan baris Hijriah.
  var hijriFormatterCache = null;
  function getHijriFormatter() {
    if (hijriFormatterCache !== null) return hijriFormatterCache;
    try {
      hijriFormatterCache = new Intl.DateTimeFormat("id-TN-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" });
      hijriFormatterCache.format(new Date()); // uji cepat, lempar kalau tidak didukung
    } catch (e) { hijriFormatterCache = false; }
    return hijriFormatterCache;
  }
  function hijriDayMonth(y, m, d) {
    var fmt = getHijriFormatter();
    if (!fmt) return null;
    try {
      var parts = fmt.formatToParts(new Date(y, m, d));
      var map = {};
      parts.forEach(function (p) { map[p.type] = p.value; });
      return map.day ? { day: map.day, month: map.month, year: map.year } : null;
    } catch (e) { return null; }
  }

  function buildMonthGrid(year, month0) {
    var total = daysInMonth(year, month0);
    var firstIdx = sundayIndex(year, month0, 1);
    var cells = [];
    for (var i = 0; i < firstIdx; i++) cells.push({ date: null, day: null });
    for (var d = 1; d <= total; d++) cells.push({ date: ymdStr(year, month0, d), day: d, y: year, m0: month0 });
    while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
    var weeks = [];
    for (var j = 0; j < cells.length; j += 7) weeks.push(cells.slice(j, j + 7));
    return weeks;
  }

  // Minggu (Ahad–Sabtu) berisi tanggal anchorYmd -- bisa lintas dua bulan,
  // makanya tiap cell menyimpan y/m0 sendiri (beda dari buildMonthGrid yang
  // semua cell-nya pasti satu bulan yang sama).
  function buildWeekGrid(anchorYmd) {
    var p = anchorYmd.split("-").map(Number);
    var anchor = new Date(p[0], p[1] - 1, p[2]);
    var start = new Date(anchor); start.setDate(anchor.getDate() - anchor.getDay());
    var cells = [];
    for (var i = 0; i < 7; i++) {
      var dt = new Date(start); dt.setDate(start.getDate() + i);
      cells.push({ date: ymdStr(dt.getFullYear(), dt.getMonth(), dt.getDate()), day: dt.getDate(), y: dt.getFullYear(), m0: dt.getMonth() });
    }
    return [cells];
  }

  // rows: hasil dataService.listAllLeaveRequestsForReport(), sudah difilter
  // status === 'approved' oleh pemanggil. Bentuk field mengikuti
  // exportLeaveReportXlsx() di app.js: r.employees.full_name,
  // r.leave_types.name, r.start_date, r.end_date.
  function distributeEventsByDay(rows, gridStart, gridEnd) {
    var byDay = {};
    (rows || []).forEach(function (r) {
      var start = r.start_date < gridStart ? gridStart : r.start_date;
      var end = r.end_date > gridEnd ? gridEnd : r.end_date;
      if (!start || !end || start > end) return;
      var p = start.split("-").map(Number);
      var cursor = new Date(p[0], p[1] - 1, p[2]);
      var ep = end.split("-").map(Number);
      var endDate = new Date(ep[0], ep[1] - 1, ep[2]);
      while (cursor <= endDate) {
        var key = ymdStr(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
        (byDay[key] = byDay[key] || []).push({
          employeeName: (r.employees && r.employees.full_name) || "-",
          type: (r.leave_types && r.leave_types.name) || "-",
          department: (r.employees && r.employees.departments && r.employees.departments.name) || "-",
          status: r.status, id: r.id
        });
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return byDay;
  }

  // events: hasil dataService.listInstitutionalEvents() (schema_70).
  function distributeInstitutionalEventsByDay(events, gridStart, gridEnd) {
    var byDay = {};
    (events || []).forEach(function (ev) {
      var start = ev.start_date < gridStart ? gridStart : ev.start_date;
      var end = ev.end_date > gridEnd ? gridEnd : ev.end_date;
      if (!start || !end || start > end) return;
      var p = start.split("-").map(Number);
      var cursor = new Date(p[0], p[1] - 1, p[2]);
      var ep = end.split("-").map(Number);
      var endDate = new Date(ep[0], ep[1] - 1, ep[2]);
      while (cursor <= endDate) {
        var key = ymdStr(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
        (byDay[key] = byDay[key] || []).push(ev);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return byDay;
  }

  // Tampilan Agenda: daftar tanggal (yang punya cuti/kegiatan) dalam rentang
  // gridStart..gridEnd, urut tanggal, dikelompokkan per hari.
  // containerId & manage ditambahkan supaya baris Kegiatan Lembaga di sini
  // BISA DIKLIK untuk edit/lihat, sama seperti chip kegiatan di tampilan
  // bulan/minggu (renderDayCell) -- sebelumnya baris agenda ini HTML statis
  // tanpa data-onclick sama sekali, jadi klik tidak melakukan apa-apa;
  // itu sebabnya "pindah tanggal / ganti nama kegiatan" via tab Agenda
  // tidak bisa dilakukan meski fix klik-chip di grid bulan/minggu sudah
  // beres. Baris cuti (byDay) TIDAK dibuat bisa-klik di sini -- cuti
  // dikelola lewat alur pengajuan/persetujuan cuti, bukan modal kalender.
  function renderAgendaBody(byDay, eventsByDay, gridStart, gridEnd, todayStr, containerId, manage) {
    var dates = [];
    var seen = {};
    Object.keys(byDay).concat(Object.keys(eventsByDay)).forEach(function (k) {
      if (!seen[k] && k >= gridStart && k <= gridEnd) { seen[k] = true; dates.push(k); }
    });
    dates.sort();
    if (!dates.length) {
      return '<div style="padding:32px;text-align:center;color:var(--muted);font-size:13px;">Tidak ada cuti maupun kegiatan pada rentang ini.</div>';
    }
    return '<div style="padding:8px 16px;">' + dates.map(function (k) {
      var p = k.split("-").map(Number);
      var dow = DAY_NAMES_ID[new Date(p[0], p[1] - 1, p[2]).getDay()];
      var isToday = k === todayStr;
      var isSunday = dow === "Ahad";
      var isFriday = dow === "Jum'at";
      var dowColor = isSunday ? 'var(--danger-solid)' : (isFriday ? 'var(--success-solid)' : null);
      var rowsHtml = (eventsByDay[k] || []).map(function (ev) {
        var col = eventColor(ev.category);
        var deptName = ev.departments && ev.departments.name;
        var clickAttr = manage
          ? ' data-onclick="openEventModal(\'' + containerId + '\',\'\',\'' + ev.id + '\')" title="Klik untuk ubah kegiatan ini"'
          : ' data-onclick="openEventViewModal(\'' + containerId + '\',\'' + ev.id + '\')" title="Klik untuk lihat detail kegiatan"';
        return '<div' + clickAttr + ' style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;"><span style="font-size:11px;font-weight:700;background:' + col.bg + ';color:' + col.fg + ';border-radius:6px;padding:2px 8px;">' + eventIcon(ev.category) + ' ' + escHtml(EVENT_CATEGORY_LABELS[ev.category] || ev.category) + '</span><span style="font-size:13px;color:var(--ink);">' + escHtml(ev.title) + (deptName ? ' <span style="color:var(--muted);font-size:11px;">· ' + escHtml(deptName) + '</span>' : '') + '</span></div>';
      }).join('') + (byDay[k] || []).map(function (e) {
        var c = leaveColor(e.type);
        return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;"><span style="font-size:11px;font-weight:700;background:' + c.bg + ';color:' + c.fg + ';border-radius:6px;padding:2px 8px;">' + escHtml(e.type) + '</span><span style="font-size:13px;color:var(--ink);">' + escHtml(e.employeeName) + '</span></div>';
      }).join('');
      return '<div style="border-bottom:1px solid var(--border);padding:10px 0;display:flex;gap:14px;">' +
        '<div style="width:64px;flex-shrink:0;text-align:center;">' +
          '<div style="font-size:11px;color:' + (dowColor || 'var(--muted)') + ';">' + dow + '</div>' +
          '<div style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;font-size:14px;font-weight:700;' + (isToday ? 'background:var(--brand-dark);color:#fff;' : ('color:' + (dowColor || 'var(--ink)') + ';')) + '">' + p[2] + '</div>' +
        '</div>' +
        '<div style="flex:1;min-width:0;">' + rowsHtml + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderDayCell(cell, i, ctx) {
    if (cell.day === null) return '<div style="border-bottom:1px solid var(--border);' + (i < 6 ? 'border-right:1px solid var(--border);' : '') + 'min-height:' + (ctx.isNarrow ? '84px' : '64px') + ';background:var(--surface-2);"></div>';
    var dayEvents = ctx.byDay[cell.date] || [];
    var isToday = cell.date === ctx.todayStr;
    var holiday = ctx.holidays[cell.date] || null;
    var hCell = hijriDayMonth(cell.y, cell.m0, cell.day);
    var hijriHtml = hCell ? '<div style="font-size:9px;color:var(--muted);line-height:1;">' + hCell.day + ' H</div>' : '';
    var dayNumHtml;
    var monthTag = ctx.showMonthTag ? '<span style="font-size:9px;color:var(--muted);font-weight:400;"> ' + MONTH_NAMES_ID[cell.m0].slice(0, 3) + '</span>' : '';
    // i === 0 -> kolom Ahad (lihat urutan DAY_NAMES_ID & header grid di
    // renderCalendar: Ahad selalu kolom pertama). Warna merah dipakai
    // untuk angka tanggal hari Ahad, kecuali saat hari itu juga hari
    // libur mandatory (badge merah, teks putih -- sudah kontras jelas
    // dan TIDAK perlu diubah) supaya tidak tertukar makna dgn badge itu.
    // i === 5 -> kolom Jum'at, warna hijau (var(--success-solid), sama
    // bobot kontrasnya dengan --danger-solid milik Ahad) dengan pola sama.
    var isSunday = i === 0;
    var isFriday = i === 5;
    var dowColor = isSunday ? 'var(--danger-solid)' : (isFriday ? 'var(--success-solid)' : null);
    if (holiday && holiday.holiday) {
      dayNumHtml = '<div title="' + escHtml(holiday.summary) + '" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--danger-solid);color:#fff;font-size:14px;font-weight:700;">' + cell.day + '</div>' + monthTag;
    } else if (holiday) {
      dayNumHtml = '<div title="' + escHtml(holiday.summary) + '" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;border:2px solid var(--gold-500);font-size:14px;font-weight:' + (isToday || dowColor ? '700' : '400') + ';color:' + (dowColor || (isToday ? 'var(--brand-dark)' : 'var(--ink)')) + ';">' + cell.day + '</div>' + monthTag;
    } else {
      dayNumHtml = '<div style="font-size:14px;font-weight:' + (isToday || dowColor ? '700' : '400') + ';color:' + (dowColor || (isToday ? 'var(--brand-dark)' : 'var(--ink)')) + ';">' + cell.day + monthTag + '</div>';
    }
    var holidayLabel = holiday ? '<div style="font-size:9px;color:' + (holiday.holiday ? 'var(--danger-solid)' : 'var(--gold-600)') + ';margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(holiday.summary) + '</div>' : '';
    var dayEventItems = ctx.eventsByDay[cell.date] || [];
    // Di layar sempit (ctx.isNarrow), chip kegiatan & tombol "+ kegiatan"
    // dibuat sedikit lebih besar (font & padding vertikal) supaya target
    // ketuk (tap target) tidak terlalu kecil/rapat -- sebelumnya semua chip
    // di sel tanggal yang sudah sempit (~50-60px lebar di HP) memakai
    // ukuran yang sama persis dengan versi desktop, membuatnya sulit
    // diketuk tepat di HP nyata meski data-onclick-nya sendiri sudah benar.
    var chipPad = ctx.isNarrow ? '3px 5px' : '1px 4px';
    var chipFont = ctx.isNarrow ? '11px' : '10px';
    var chipMarginTop = ctx.isNarrow ? '4px' : '2px';
    var eventChips = dayEventItems.map(function (ev) {
      var col = eventColor(ev.category);
      var deptName = ev.departments && ev.departments.name;
      var clickAttr = ctx.manage
        ? ' data-onclick="openEventModal(\'' + ctx.containerId + '\',\'\',\'' + ev.id + '\')" style="cursor:pointer;'
        : ' data-onclick="openEventViewModal(\'' + ctx.containerId + '\',\'' + ev.id + '\')" style="cursor:pointer;';
      var tooltip = escHtml(ev.title) + ' (' + escHtml(EVENT_CATEGORY_LABELS[ev.category] || ev.category) + (deptName ? ' — ' + escHtml(deptName) : '') + ')';
      return '<div title="' + tooltip + '"' + clickAttr + 'font-size:' + chipFont + ';font-weight:600;background:' + col.bg + ';color:' + col.fg + ';border-radius:4px;padding:' + chipPad + ';margin-top:' + chipMarginTop + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + eventIcon(ev.category) + ' ' + escHtml(ev.title) + (deptName ? ' <span style="opacity:.75;">· ' + escHtml(deptName) + '</span>' : '') + '</div>';
    }).join('');
    var leaveChips = dayEvents.slice(0, 2).map(function (e) {
      var c = leaveColor(e.type);
      return '<div title="' + escHtml(e.employeeName + ' — ' + e.type) + '" style="font-size:' + chipFont + ';background:' + c.bg + ';color:' + c.fg + ';border-radius:4px;padding:' + chipPad + ';margin-top:' + chipMarginTop + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(e.employeeName) + '</div>';
    }).join('');
    var moreCount = Math.max(0, dayEvents.length - 2);
    var more = moreCount > 0 ? '<div style="font-size:9px;color:var(--muted);margin-top:2px;">+' + moreCount + ' lagi</div>' : '';
    var conflictBadge = dayEvents.length >= 2 ?
      '<div title="' + dayEvents.length + ' pegawai cuti bersamaan pada tanggal ini" style="font-size:9px;font-weight:700;color:var(--danger-solid);margin-top:2px;">⚠ ' + dayEvents.length + ' cuti bersamaan</div>' : '';
    var addBtn = (ctx.manage && cell.date) ?
      '<div data-onclick="openEventModal(\'' + ctx.containerId + '\',\'' + cell.date + '\')" title="Tambah kegiatan" class="no-print" style="cursor:pointer;font-size:' + (ctx.isNarrow ? '12px' : '11px') + ';color:var(--muted);margin-top:' + chipMarginTop + ';padding:' + (ctx.isNarrow ? '2px 0' : '0') + ';">+ kegiatan</div>' : '';
    var minH = ctx.isNarrow ? '84px' : '64px';
    // SELURUH SEL tanggal (bukan cuma chip 10-11px di dalamnya) kini bisa
    // diketuk untuk membuka "Detail Hari" (openDayDetailModal) -- ini
    // jawaban utama untuk laporan berulang "masih belum bisa diedit di HP":
    // chip kegiatan/cuti yang sudah ada TETAP mempertahankan data-onclick
    // masing-masing (jadi tetap bisa diketuk langsung untuk edit cepat di
    // desktop/kursor presisi -- delegasi klik di app.js berhenti di elemen
    // TERDEKAT yang punya data-onclick saat menelusuri ke atas DOM, jadi
    // klik pada chip tetap memicu handler chip itu sendiri, bukan handler
    // sel), tapi sekarang ada target ketuk cadangan yang jauh lebih besar
    // (seluruh sel, minimal 64-84px persegi) untuk kasus jari meleset dari
    // chip kecil di layar sentuh nyata. Modal detail itu sendiri menampilkan
    // semua kegiatan/cuti hari itu dengan tombol "Ubah" yang jelas & besar.
    var cellClick = cell.date ? ' data-onclick="openDayDetailModal(\'' + ctx.containerId + '\',\'' + cell.date + '\')" style="cursor:pointer;' : ' style="';
    return '<div' + cellClick + 'border-bottom:1px solid var(--border);' + (i < 6 ? 'border-right:1px solid var(--border);' : '') + 'min-height:' + minH + ';padding:4px;' + (isToday ? 'background:var(--metric-bg);' : '') + '">' +
      dayNumHtml + hijriHtml + holidayLabel + eventChips + leaveChips + more + conflictBadge + addBtn +
    '</div>';
  }

  // Deteksi heuristik "libur Islam" (hijau) vs "libur nasional lainnya"
  // (merah) dari teks summary API hari libur (guangrei/APIHariLibur_V2).
  // API itu TIDAK punya field agama/kategori -- cuma tanggal + ringkasan
  // teks -- jadi ini cocok-kata (bukan sumber data resmi bertingkat).
  // Cukup andal untuk daftar tetap hari libur Islam nasional Indonesia
  // (jumlahnya kecil & namanya baku tiap tahun), tapi BUKAN jaminan 100%
  // kalau suatu saat API menambah istilah baru di luar daftar ini.
  var ISLAMIC_HOLIDAY_PATTERN = /maulid|isra|mi'?raj|idul\s*fitri|idul\s*adha|hari\s*raya\s*haji|1\s*syawal|1\s*muharram|tahun\s*baru\s*islam|nuzulul|ramadhan/i;
  function isIslamicHolidaySummary(summary) {
    return ISLAMIC_HOLIDAY_PATTERN.test(summary || "");
  }

  // Angka tanggal Hijriah pakai aksara Arab (mis. "٣", bukan "3") -- numbering
  // system "arab" lewat Intl, dites dukungannya sekali (sama pola dengan
  // getHijriFormatter di atas). Fallback ke angka Hijriah biasa (Latin) dari
  // hijriDayMonth() kalau browser tidak dukung.
  var hijriArabicDayFormatterCache = null;
  function getHijriArabicDayFormatter() {
    if (hijriArabicDayFormatterCache !== null) return hijriArabicDayFormatterCache;
    try {
      hijriArabicDayFormatterCache = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-arab", { day: "numeric" });
      hijriArabicDayFormatterCache.format(new Date());
    } catch (e) { hijriArabicDayFormatterCache = false; }
    return hijriArabicDayFormatterCache;
  }
  function hijriDayNumeralArabic(y, m, d) {
    var fmt = getHijriArabicDayFormatter();
    if (fmt) { try { return fmt.format(new Date(y, m, d)); } catch (e) { /* jatuh ke fallback di bawah */ } }
    var latin = hijriDayMonth(y, m, d);
    return latin ? latin.day : "";
  }

  // ------------------------------------------------------------------
  // REDESAIN 2026-08-25 -- diganti total (bukan sekadar re-skin) atas
  // permintaan eksplisit pengguna untuk meniru tampilan referensi (grid
  // bulan bersih dengan sel bulat lega + kartu "Agenda Bulan Ini" di
  // samping). Fitur yang SENGAJA DIHILANGKAN dari versi lama (dikonfirmasi
  // pengguna boleh hilang): tampilan Minggu, tampilan Agenda sebagai mode
  // terpisah, filter Divisi, kalender Hijriah, panel legend, cetak, ekspor
  // .ics, share WhatsApp. Yang TETAP DIPERTAHANKAN karena bagian inti data
  // (bukan cuma kosmetik lama) dan tidak diminta hilang: data cuti disetujui
  // & kegiatan lembaga per hari (ditampilkan sebagai pill warna di sel dan
  // baris di kartu Agenda), klik sel -> openDayDetailModal (tetap dari kode
  // lama, tidak diubah), tambah/ubah/lihat kegiatan (modalHtml/viewModalHtml,
  // tidak diubah), indikator hari libur nasional (loadHolidays -- fetch ke
  // raw.githubusercontent.com yang dijaga tests/csp_connect_src_covers_
  // fetch_domains.test.js, TIDAK BOLEH dihapus tanpa update test itu juga).
  // ------------------------------------------------------------------
  async function renderCalendar(containerId) {
    containerId = containerId || "calendarContainer";
    var calState = getCalState(containerId);
    if (calState.year == null) { var t = new Date(); calState.year = t.getFullYear(); calState.month = t.getMonth(); }

    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '<div style="padding:24px;color:var(--muted);">Memuat kalender…</div>';

    var rowsRaw = [];
    var events = [];
    var departments = [];
    try {
      var shared = await loadCalendarSharedData();
      rowsRaw = shared.leaveRequests;
      events = shared.institutionalEvents;
      departments = shared.departments;
    } catch (e) { /* masing-masing sudah punya fallback [] di loadCalendarSharedData */ }
    var holidays = await loadHolidays();

    var year = calState.year, month0 = calState.month;
    var weeks = buildMonthGrid(year, month0);
    var gridStart = ymdStr(year, month0, 1);
    var gridEnd = ymdStr(year, month0, daysInMonth(year, month0));
    var byDay = distributeEventsByDay(rowsRaw, gridStart, gridEnd);
    var eventsByDay = distributeInstitutionalEventsByDay(events, gridStart, gridEnd);

    eventsCache[containerId] = events;
    shareContextCache[containerId] = { byDay: byDay, eventsByDay: eventsByDay, gridStart: gridStart, gridEnd: gridEnd, view: "month", year: year, month0: month0 };

    var todayStr = ymdStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    var manage = canManageEvents();
    var isNarrow = typeof window !== 'undefined' && !!window.innerWidth && window.innerWidth <= 480;
    // Ahad-pertama (DAY_NAMES_ID = [Ahad..Sabtu]), sama urutannya dengan
    // buildMonthGrid() di atas. index 0 = Ahad (merah), index 5 = Jum'at
    // (hijau) -- pola warna sama seperti header grid versi lama, diminta
    // lagi secara eksplisit oleh pengguna.
    var DOW_AHAD_FIRST_SHORT = ["Ahad", "Sen", "Sel", "Rab", "Kam", "Jum'at", "Sab"];

    var ctx = { byDay: byDay, eventsByDay: eventsByDay, holidays: holidays, todayStr: todayStr, manage: manage, containerId: containerId, isNarrow: isNarrow };

    // FIX 2026-08-26 -- keluhan "harus scroll untuk melihat semua tanggal".
    // Root cause: sel tanggal dipatok aspect-ratio:1/1 (tinggi = lebar
    // kolom), jadi di layar lebar sel jadi persegi BESAR dan grid 6 baris
    // meluber ke bawah viewport. Fix: kartu kalender & grid isi (bukan
    // header hari) sekarang mengisi TINGGI YANG TERSEDIA (dihitung lewat
    // JS dari sisa tinggi viewport, lihat fitCalendarHeight di bawah) dan
    // dibagi rata ke jumlah baris minggu (grid-template-rows:repeat(N,1fr))
    // -- bukan lagi persegi tetap, tapi proporsional & selalu muat tanpa
    // scroll. isNarrow (mobile) TETAP scroll wajar (layar kecil, ini yang
    // diharapkan di HP), fix ini untuk tampilan desktop/tablet lebar.
    var numWeeks = weeks.length;
    var rowId = 'calRow-' + containerId;
    var bodyId = 'calBody-' + containerId;

    var html = '<div id="' + rowId + '" style="display:flex;gap:18px;flex-wrap:wrap;align-items:stretch;">' +
      '<div style="flex:2 1 460px;min-width:340px;background:var(--surface-0);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow-sm);padding:' + (isNarrow ? '16px 12px' : '22px 24px') + ';display:flex;flex-direction:column;min-height:0;overflow:hidden;">' +
        '<div class="no-print" style="flex-shrink:0;display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">' +
          '<button id="cal-prev-' + containerId + '" aria-label="Bulan sebelumnya" style="width:32px;height:32px;border-radius:50%;border:none;background:linear-gradient(165deg, #0E505A 0%, #206b62 35%, #3F8D58 68%, #7DD857 100%);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 3px 8px rgba(14,80,90,.35);">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5L8 12l7 7"/></svg>' +
          '</button>' +
          '<div style="font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--ink-900);text-align:center;">' + MONTH_NAMES_ID[month0] + ' ' + year +
            (function () {
              var hStart = hijriDayMonth(year, month0, 1);
              var hEnd = hijriDayMonth(year, month0, daysInMonth(year, month0));
              if (!hStart || !hEnd) return '';
              var label = hStart.month === hEnd.month ? (hStart.month + ' ' + hStart.year + ' H') : (hStart.month + '–' + hEnd.month + ' ' + hEnd.year + ' H');
              // Ukuran dinaikkan 2px (11px -> 13px) atas permintaan eksplisit
              // pengguna 2026-08-25 ("ukuran bulan hijri naikkan 2 ukuran"),
              // sepasang dengan nama bulan Masehi di atasnya yang dinaikkan
              // ke 22px pada perubahan yang sama.
              return '<div style="font-size:13px;font-weight:400;color:var(--ink-300);margin-top:2px;">' + escHtml(label) + '</div>';
            })() +
          '</div>' +
          '<button id="cal-next-' + containerId + '" aria-label="Bulan berikutnya" style="width:32px;height:32px;border-radius:50%;border:none;background:linear-gradient(165deg, #0E505A 0%, #206b62 35%, #3F8D58 68%, #7DD857 100%);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 3px 8px rgba(14,80,90,.35);">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>' +
          '</button>' +
        '</div>' +
        (manage ? '<div class="no-print" style="flex-shrink:0;text-align:right;margin:-10px 0 12px;">' +
          '<button data-onclick="openEventModal(\'' + containerId + '\')" style="background:none;border:none;color:var(--brand-600);font-size:12px;font-weight:700;cursor:pointer;padding:0;">+ Tambah Kegiatan</button>' +
        '</div>' : '') +
        '<div style="flex-shrink:0;display:grid;grid-template-columns:repeat(7,1fr);gap:' + (isNarrow ? '4px' : '6px') + ';margin-bottom:' + (isNarrow ? '4px' : '6px') + ';">' +
          DOW_AHAD_FIRST_SHORT.map(function (d, di) {
            var dowColor = di === 0 ? 'var(--danger-solid)' : (di === 5 ? 'var(--success-solid)' : 'var(--ink-300)');
            return '<div style="text-align:center;font-size:11px;font-weight:700;color:' + dowColor + ';text-transform:uppercase;letter-spacing:.04em;padding:4px 6px;">' + d + '</div>';
          }).join('') +
        '</div>' +
        '<div id="' + bodyId + '" style="flex:1 1 auto;min-height:' + (isNarrow ? 'auto' : '0') + ';display:grid;grid-template-columns:repeat(7,1fr);grid-template-rows:repeat(' + numWeeks + ',1fr);gap:' + (isNarrow ? '4px' : '6px') + ';' + (isNarrow ? 'overflow-y:auto;' : 'overflow:hidden;') + '">' +
          weeks.map(function (week) { return week.map(function (cell) { return renderDayCellV2(cell, ctx); }).join(''); }).join('') +
        '</div>' +
      '</div>' +
      renderAgendaSidebar(byDay, eventsByDay, gridStart, gridEnd, todayStr, containerId, manage) +
      '</div>' +
      (manage ? modalHtml(containerId, departments) : '') +
      viewModalHtml(containerId) +
      dayModalHtml(containerId);

    el.innerHTML = html;
    document.getElementById("cal-prev-" + containerId).onclick = function () {
      calState.month--; if (calState.month < 0) { calState.month = 11; calState.year--; }
      renderCalendar(containerId);
    };
    document.getElementById("cal-next-" + containerId).onclick = function () {
      calState.month++; if (calState.month > 11) { calState.month = 0; calState.year++; }
      renderCalendar(containerId);
    };
    if (!isNarrow) fitCalendarHeight(rowId);
  }

  // Menghitung tinggi yang tersisa di viewport (dari posisi kartu kalender
  // sampai bawah layar, dikurangi sedikit margin) dan menerapkannya sebagai
  // tinggi baris kalender+agenda -- grid isi (grid-template-rows:repeat(N,1fr))
  // lalu otomatis membagi tinggi itu rata ke tiap baris minggu, sehingga
  // SEMUA baris (4/5/6 minggu tergantung bulan) selalu muat tanpa scroll,
  // proporsional terhadap layar yang dipakai (bukan angka piksel tetap).
  // Dipasang ulang tiap kali render (bulan ganti) & saat window di-resize.
  function fitCalendarHeight(rowId) {
    var rowEl = document.getElementById(rowId);
    if (!rowEl) return;
    var apply = function () {
      rowEl = document.getElementById(rowId);
      if (!rowEl || typeof window === 'undefined') return;
      var top = rowEl.getBoundingClientRect().top;
      var h = window.innerHeight - top - 20; // 20px margin bawah
      if (h < 460) h = 460; // batas bawah supaya tidak terlalu gepeng di layar pendek
      rowEl.style.height = h + 'px';
    };
    apply();
    if (!fitCalendarHeight._resizeBound) {
      fitCalendarHeight._resizeBound = true;
      var pending = null;
      window.addEventListener('resize', function () {
        clearTimeout(pending);
        pending = setTimeout(function () {
          document.querySelectorAll('[id^="calRow-"]').forEach(function (el) {
            var top = el.getBoundingClientRect().top;
            var h = window.innerHeight - top - 20;
            if (h < 460) h = 460;
            el.style.height = h + 'px';
          });
        }, 120);
      });
    }
  }

  // Sel tanggal versi kartu (redesain 2026-08-25 putaran 3) -- meniru
  // referensi: kartu putih bulat berbingkai, angka Masehi besar di kiri
  // atas, angka Hijriah aksara Arab kecil di kanan atas, lalu PENANDA
  // (bukan lagi bar bertulisan) di bawahnya: badge bulat kecil berwarna
  // dengan ikon garis di dalamnya (gaya sama seperti ikon menu sidebar):
  //   hijau  = hari libur/penting ISLAM (cocok-kata ISLAMIC_HOLIDAY_PATTERN)
  //   merah  = hari libur NASIONAL lainnya (holiday.holiday true, bukan Islam)
  //   kuning = agenda/kegiatan lembaga (institutional_events, "agenda pesantren")
  //   biru   = cuti pegawai (dipertahankan dari versi sebelumnya, warna
  //            keempat di luar 3 warna yang diminta supaya tidak tertukar
  //            makna dengan kategori lain)
  // TIDAK ADA TEKS di dalam sel sama sekali (permintaan eksplisit pengguna
  // -- sebelumnya bar bertulisan bikin lebar kolom grid ikut memanjang
  // sesuai teks terpanjang, jadi tidak rapi). Nama lengkap kegiatan/hari
  // libur cuma muncul lewat: (1) atribut title (tooltip hover) di badge,
  // (2) kartu "Agenda Bulan Ini" di sampingnya, (3) modal Detail Hari saat
  // sel diklik (openDayDetailModal, tidak diubah). Grid induk (lihat
  // renderCalendar) kembali pakai grid-template-columns: repeat(7,1fr)
  // -- lebar kolom seragam, tidak lagi ikut konten.
  // Sel dibuat PERSEGI SAMA SISI (aspect-ratio:1/1), permintaan eksplisit
  // pengguna 2026-08-25 ("ukuran dari setiap bulan berbeda-beda"). Root
  // cause versi sebelumnya: tinggi sel cuma dipatok min-height (78px/58px)
  // sementara lebar mengikuti grid-template-columns:repeat(7,1fr) --
  // keduanya TIDAK saling terikat, jadi sel bukan persegi di lebar layar
  // manapun selain kebetulan. LEBIH PARAH LAGI: markersRow (badge
  // libur/agenda/cuti) sebelumnya flex-wrap:wrap, jadi sel bisa tumbuh
  // lebih tinggi dari min-height kalau badge-nya sampai 2 baris -- bulan
  // yang lebih "ramai" (banyak cuti/agenda) jadi kelihatan beda tinggi
  // dari bulan yang sepi, padahal harusnya identik. Fix: aspect-ratio:1/1
  // (tinggi SELALU = lebar, konsisten apa pun isinya/bulannya) +
  // overflow:hidden di sel & markersRow flex-wrap:nowrap+overflow:hidden
  // (badge kelebihan tetap ter-cap di 4+"+N" seperti sebelumnya, TIDAK
  // lagi bisa mendorong sel jadi lebih tinggi).
  function renderDayCellV2(cell, ctx) {
    if (cell.day === null) {
      return '<div style="' + (ctx.isNarrow ? 'aspect-ratio:1/1;' : 'height:100%;min-height:0;') + 'border-radius:var(--r-lg);background:var(--surface-1);"></div>';
    }
    var isToday = cell.date === ctx.todayStr;
    var holiday = ctx.holidays[cell.date] || null;
    var dayEventItems = ctx.eventsByDay[cell.date] || [];
    var dayLeaves = ctx.byDay[cell.date] || [];

    var markers = [];
    if (holiday && holiday.holiday) {
      var isIslamic = isIslamicHolidaySummary(holiday.summary);
      markers.push({
        label: holiday.summary || (isIslamic ? 'Libur Islam' : 'Libur Nasional'),
        bg: isIslamic ? 'var(--badge-green-bg)' : 'var(--badge-red-bg)',
        fg: isIslamic ? 'var(--badge-green-fg)' : 'var(--badge-red-fg)',
        shadow: isIslamic ? 'rgba(30,125,30,.32)' : 'rgba(160,32,32,.32)',
        icon: isIslamic ? DAY_MARKER_ICONS.crescent : DAY_MARKER_ICONS.flag
      });
    }
    dayEventItems.forEach(function (ev) {
      markers.push({ label: ev.title, bg: 'var(--badge-amber-bg)', fg: 'var(--badge-amber-fg)', shadow: 'rgba(138,90,16,.32)', icon: institutionalEventDayIcon(ev) });
    });
    if (dayLeaves.length) {
      markers.push({ label: dayLeaves.length + ' Cuti Pegawai', bg: 'var(--badge-blue-bg)', fg: 'var(--badge-blue-fg)', shadow: 'rgba(26,90,138,.32)', icon: DAY_MARKER_ICONS.person });
    }
    // Ikon jauh lebih ringkas dari teks -- muat sampai 4 badge/baris di sel
    // sekecil apa pun sebelum perlu "+N".
    var shown = markers.slice(0, 4);
    var moreCount = markers.length - shown.length;
    var badgeSize = ctx.isNarrow ? '18px' : '22px';
    var badgesHtml = shown.map(function (m) {
      return '<div title="' + escHtml(m.label) + '" style="width:' + badgeSize + ';height:' + badgeSize + ';border-radius:50%;background:' + m.bg + ';color:' + m.fg + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 5px ' + m.shadow + ';">' + m.icon + '</div>';
    }).join('') + (moreCount > 0 ? '<div style="font-size:9px;font-weight:700;color:var(--ink-300);align-self:center;">+' + moreCount + '</div>' : '');
    // flex-wrap:nowrap + overflow:hidden (bukan wrap seperti sebelumnya) --
    // lihat komentar besar di atas fungsi ini kenapa ini WAJIB untuk sel
    // tetap persegi konsisten. shown sudah dibatasi maks 4 item + "+N" di
    // atas, jadi baris ini secara desain memang tidak pernah butuh 2 baris.
    var markersRow = markers.length ? '<div style="display:flex;gap:4px;flex-wrap:nowrap;overflow:hidden;margin-top:auto;padding-top:6px;">' + badgesHtml + '</div>' : '';

    var hijriNum = hijriDayNumeralArabic(cell.y, cell.m0, cell.day);
    var numColor = isToday ? '#fff' : 'var(--ink-900)';
    var hijriColor = isToday ? 'rgba(255,255,255,.75)' : 'var(--ink-300)';
    var cellBg = isToday ? 'var(--success-solid)' : 'var(--surface-0)';
    var cellBorder = isToday ? 'var(--success-solid)' : 'var(--border)';
    var cellClick = cell.date ? ' data-onclick="openDayDetailModal(\'' + ctx.containerId + '\',\'' + cell.date + '\')" style="cursor:pointer;' : ' style="';
    return '<div' + cellClick + (ctx.isNarrow ? 'aspect-ratio:1/1;' : 'height:100%;min-height:0;') + 'overflow:hidden;border-radius:var(--r-lg);border:1px solid ' + cellBorder + ';background:' + cellBg + ';display:flex;flex-direction:column;padding:' + (ctx.isNarrow ? '5px 5px' : '7px 7px') + ';transition:background .12s;">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;">' +
        '<div style="font-size:' + (ctx.isNarrow ? '14px' : '18px') + ';font-weight:800;color:' + numColor + ';line-height:1;">' + cell.day + '</div>' +
        (hijriNum ? '<div style="font-size:' + (ctx.isNarrow ? '10px' : '12px') + ';font-weight:600;color:' + hijriColor + ';line-height:1;" dir="rtl">' + escHtml(hijriNum) + '</div>' : '') +
      '</div>' +
      markersRow +
    '</div>';
  }

  // Kartu "Agenda Bulan Ini" -- daftar kegiatan lembaga + cuti pegawai bulan
  // berjalan, tiap baris diberi border kiri berwarna sesuai kategori
  // (pola kartu di referensi yang diminta pengguna), diurut tanggal naik.
  // Klik baris kegiatan tetap membuka modal lihat/ubah yang sama seperti
  // sel grid & modal Detail Hari (tidak ada logika baru, cuma tampilan baru).
  function renderAgendaSidebar(byDay, eventsByDay, gridStart, gridEnd, todayStr, containerId, manage) {
    var dates = [];
    var seen = {};
    Object.keys(byDay).concat(Object.keys(eventsByDay)).forEach(function (k) {
      if (!seen[k] && k >= gridStart && k <= gridEnd) { seen[k] = true; dates.push(k); }
    });
    dates.sort();

    var rows = '';
    dates.forEach(function (k) {
      var p = k.split("-").map(Number);
      var dateLabel = pad2(p[2]) + ' ' + MONTH_NAMES_ID[p[1] - 1].slice(0, 3);
      (eventsByDay[k] || []).forEach(function (ev) {
        var col = eventColor(ev.category);
        var clickAttr = manage
          ? ' data-onclick="openEventModal(\'' + containerId + '\',\'\',\'' + ev.id + '\')"'
          : ' data-onclick="openEventViewModal(\'' + containerId + '\',\'' + ev.id + '\')"';
        rows += '<div' + clickAttr + ' style="cursor:pointer;border-left:4px solid ' + col.fg + ';background:' + col.bg + ';border-radius:0 10px 10px 0;padding:8px 10px;margin-bottom:8px;">' +
          '<div style="font-size:12.5px;font-weight:700;color:var(--ink-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + eventIcon(ev.category) + ' ' + escHtml(ev.title) + '</div>' +
          '<div style="font-size:10.5px;color:var(--ink-500);margin-top:1px;">' + dateLabel + '</div>' +
        '</div>';
      });
      (byDay[k] || []).forEach(function (e) {
        var c = leaveColor(e.type);
        rows += '<div style="border-left:4px solid ' + c.fg + ';background:' + c.bg + ';border-radius:0 10px 10px 0;padding:8px 10px;margin-bottom:8px;">' +
          '<div style="font-size:12.5px;font-weight:700;color:var(--ink-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(e.employeeName) + ' — ' + escHtml(e.type) + '</div>' +
          '<div style="font-size:10.5px;color:var(--ink-500);margin-top:1px;">' + dateLabel + '</div>' +
        '</div>';
      });
    });
    if (!rows) rows = '<div style="text-align:center;color:var(--ink-300);font-size:12.5px;padding:20px 0;">Tidak ada kegiatan maupun cuti bulan ini.</div>';

    var isNarrowSidebar = typeof window !== 'undefined' && !!window.innerWidth && window.innerWidth <= 480;
    return '<div style="flex:1 1 260px;min-width:240px;max-width:320px;background:var(--surface-0);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow-sm);padding:18px;' + (isNarrowSidebar ? 'max-height:420px;' : 'height:100%;') + 'overflow-y:auto;box-sizing:border-box;">' +
      '<div style="font-size:18px;font-weight:700;color:var(--ink-900);margin-bottom:14px;display:flex;align-items:center;gap:6px;">Agenda Bulan Ini</div>' +
      rows +
    '</div>';
  }

  // ---- Modal tambah/ubah Kegiatan Lembaga ----

  // ---- Modal tambah/ubah Kegiatan Lembaga ----
  function modalHtml(containerId, departments) {
    var mid = "eventModal-" + containerId;
    var catOptions = Object.keys(EVENT_CATEGORY_LABELS).map(function (c) {
      return '<option value="' + c + '">' + eventIcon(c) + ' ' + escHtml(EVENT_CATEGORY_LABELS[c]) + '</option>';
    }).join('');
    var deptOptions = '<option value="">— Lembaga / Lintas Divisi —</option>' +
      (departments || []).map(function (d) { return '<option value="' + d.id + '">' + escHtml(d.name) + '</option>'; }).join('');
    return '<div class="modal-overlay" id="' + mid + '">' +
      '<div class="modal">' +
        '<div class="modal-head"><h3 id="' + mid + '-title">Tambah Kegiatan</h3><button class="close-x" data-onclick="closeModal(\'' + mid + '\')">✕</button></div>' +
        '<div class="modal-body">' +
          '<input type="hidden" id="' + mid + '-id">' +
          '<div class="field"><label>Judul Kegiatan <span class="req">*</span></label><input type="text" id="' + mid + '-title-input" placeholder="mis. Rapat Koordinasi Bulanan"></div>' +
          '<div style="display:flex;gap:10px;">' +
            '<div class="field" style="flex:1;"><label>Kategori <span class="req">*</span></label><select id="' + mid + '-category">' + catOptions + '</select></div>' +
            '<div class="field" style="flex:1;"><label>Divisi Penyelenggara</label><select id="' + mid + '-department" title="Kosongkan bila kegiatan milik lembaga/lintas divisi">' + deptOptions + '</select></div>' +
          '</div>' +
          '<div style="display:flex;gap:10px;">' +
            '<div class="field" style="flex:1;"><label>Tanggal Mulai <span class="req">*</span></label><input type="date" id="' + mid + '-start"></div>' +
            '<div class="field" style="flex:1;"><label>Tanggal Selesai <span class="req">*</span></label><input type="date" id="' + mid + '-end"></div>' +
          '</div>' +
          '<div class="field"><label>Deskripsi (opsional)</label><textarea id="' + mid + '-desc" rows="3"></textarea></div>' +
        '</div>' +
        '<div class="modal-foot" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">' +
          '<button class="btn btn-danger btn-sm" id="' + mid + '-delete" style="display:none;" data-onclick="deleteEventModal(\'' + containerId + '\')">Hapus</button>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-left:auto;">' +
            '<button class="btn btn-secondary btn-sm" id="' + mid + '-gcal" style="display:none;" data-onclick="addEventToGoogleCalendarFromModal(\'' + containerId + '\')" title="Buka Google Calendar dengan kegiatan ini sudah terisi">📅 Google Calendar</button>' +
            '<button class="btn btn-secondary btn-sm" id="' + mid + '-ics" style="display:none;" data-onclick="downloadEventIcsFromModal(\'' + containerId + '\')" title="Unduh kegiatan ini sebagai file .ics">⬇️ .ics</button>' +
            '<button class="btn btn-secondary btn-sm" data-onclick="closeModal(\'' + mid + '\')">Batal</button>' +
            '<button class="btn btn-primary btn-sm" data-onclick="saveEventModal(\'' + containerId + '\')">Simpan</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ---- Modal lihat kegiatan (read-only) -- dipakai pengguna tanpa izin
  // tulis (bukan super_admin/hrd/pimpinan) saat klik chip kegiatan di
  // kalender. Terpisah dari modalHtml() (modal edit) supaya tombol
  // Simpan/Hapus tidak pernah muncul di DOM untuk role yang memang
  // tidak boleh menulis -- konsisten dengan pola canWrite di layar lain
  // (bukan cuma mengandalkan RLS server sebagai satu-satunya penjaga).
  function viewModalHtml(containerId) {
    var mid = "eventViewModal-" + containerId;
    return '<div class="modal-overlay" id="' + mid + '">' +
      '<div class="modal">' +
        '<div class="modal-head"><h3 id="' + mid + '-title">Kegiatan</h3><button class="close-x" data-onclick="closeModal(\'' + mid + '\')">✕</button></div>' +
        '<div class="modal-body">' +
          '<input type="hidden" id="' + mid + '-id">' +
          '<div style="font-size:11px;font-weight:700;display:inline-block;border-radius:6px;padding:3px 8px;margin-bottom:10px;" id="' + mid + '-category"></div>' +
          '<div style="font-size:12.5px;color:var(--ink-500);margin-bottom:6px;" id="' + mid + '-dates"></div>' +
          '<div style="font-size:13.5px;line-height:1.5;" id="' + mid + '-desc"></div>' +
        '</div>' +
        '<div class="modal-foot" style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;">' +
          '<button class="btn btn-secondary btn-sm" data-onclick="addEventToGoogleCalendarFromViewModal(\'' + containerId + '\')" title="Buka Google Calendar dengan kegiatan ini sudah terisi">📅 Google Calendar</button>' +
          '<button class="btn btn-secondary btn-sm" data-onclick="downloadEventIcsFromViewModal(\'' + containerId + '\')" title="Unduh kegiatan ini sebagai file .ics">⬇️ .ics</button>' +
          '<button class="btn btn-secondary btn-sm" data-onclick="closeModal(\'' + mid + '\')">Tutup</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function openEventViewModal(containerId, eventId) {
    var mid = "eventViewModal-" + containerId;
    var ev = (eventsCache[containerId] || []).find(function (e) { return e.id === eventId; });
    if (!ev) { toast('Kegiatan tidak ditemukan'); return; }
    var col = eventColor(ev.category);
    document.getElementById(mid + '-title').textContent = ev.title;
    document.getElementById(mid + '-id').value = ev.id;
    var catEl = document.getElementById(mid + '-category');
    var deptName = ev.departments && ev.departments.name;
    catEl.textContent = eventIcon(ev.category) + ' ' + (EVENT_CATEGORY_LABELS[ev.category] || ev.category) + (deptName ? ' · ' + deptName : ' · Lembaga/Lintas Divisi');
    catEl.style.background = col.bg; catEl.style.color = col.fg;
    var range = ev.start_date === ev.end_date ? formatShortDate(ev.start_date) : formatShortDate(ev.start_date) + ' – ' + formatShortDate(ev.end_date);
    document.getElementById(mid + '-dates').textContent = range;
    document.getElementById(mid + '-desc').textContent = ev.description || '(Tidak ada deskripsi)';
    openModal(mid);
  }

  // ---- Modal "Detail Hari" -- dibuka dengan MENGETUK SELURUH SEL tanggal
  // (lihat cellClick di renderDayCell), bukan cuma chip 10-11px di
  // dalamnya. Menampilkan semua kegiatan lembaga & cuti pada tanggal itu
  // dengan tombol "Ubah" yang besar & jelas per kegiatan, plus tombol
  // "+ Tambah Kegiatan" -- dirancang khusus supaya laporan berulang
  // "masih belum bisa diedit di HP" punya jalan yang jauh lebih toleran
  // terhadap ketepatan ketuk dibanding mengandalkan chip kecil saja.
  function dayModalHtml(containerId) {
    var mid = "dayModal-" + containerId;
    return '<div class="modal-overlay" id="' + mid + '">' +
      '<div class="modal">' +
        '<div class="modal-head"><h3 id="' + mid + '-title">Detail Hari</h3><button class="close-x" data-onclick="closeModal(\'' + mid + '\')">✕</button></div>' +
        '<div class="modal-body" id="' + mid + '-body"></div>' +
        '<div class="modal-foot" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">' +
          '<button class="btn btn-primary btn-sm" id="' + mid + '-add" style="display:none;"></button>' +
          '<button class="btn btn-secondary btn-sm" style="margin-left:auto;" data-onclick="closeModal(\'' + mid + '\')">Tutup</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function openDayDetailModal(containerId, dateStr) {
    var mid = "dayModal-" + containerId;
    var ctx = shareContextCache[containerId];
    if (!ctx || !dateStr) return;
    var manage = canManageEvents();
    var p = dateStr.split("-").map(Number);
    var dow = DAY_NAMES_ID[new Date(p[0], p[1] - 1, p[2]).getDay()];
    document.getElementById(mid + '-title').textContent = dow + ', ' + p[2] + ' ' + MONTH_NAMES_ID[p[1] - 1] + ' ' + p[0];

    var dayEvents = ctx.byDay[dateStr] || [];
    var dayEventItems = ctx.eventsByDay[dateStr] || [];
    var body = '';

    if (dayEventItems.length) {
      body += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:8px;">Kegiatan Lembaga</div>';
      body += dayEventItems.map(function (ev) {
        var col = eventColor(ev.category);
        var deptName = ev.departments && ev.departments.name;
        var editAttr = manage
          ? ' data-onclick="closeModal(\'' + mid + '\'); openEventModal(\'' + containerId + '\',\'\',\'' + ev.id + '\')"'
          : ' data-onclick="closeModal(\'' + mid + '\'); openEventViewModal(\'' + containerId + '\',\'' + ev.id + '\')"';
        return '<div' + editAttr + ' style="cursor:pointer;display:flex;align-items:center;gap:10px;padding:11px 8px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">' +
          '<span style="font-size:11px;font-weight:700;background:' + col.bg + ';color:' + col.fg + ';border-radius:6px;padding:3px 8px;white-space:nowrap;flex-shrink:0;">' + eventIcon(ev.category) + ' ' + escHtml(EVENT_CATEGORY_LABELS[ev.category] || ev.category) + '</span>' +
          '<span style="font-size:13.5px;color:var(--ink);flex:1;min-width:0;">' + escHtml(ev.title) + (deptName ? ' <span style="color:var(--muted);font-size:11.5px;">· ' + escHtml(deptName) + '</span>' : '') + '</span>' +
          '<span style="font-size:12px;font-weight:700;color:var(--brand-600);flex-shrink:0;">' + (manage ? 'Ubah ›' : 'Lihat ›') + '</span>' +
        '</div>';
      }).join('');
    }

    if (dayEvents.length) {
      body += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:14px 0 8px;">Cuti Pegawai</div>';
      body += dayEvents.map(function (e) {
        var c = leaveColor(e.type);
        return '<div style="display:flex;align-items:center;gap:10px;padding:9px 8px;border-bottom:1px solid var(--border);">' +
          '<span style="font-size:11px;font-weight:700;background:' + c.bg + ';color:' + c.fg + ';border-radius:6px;padding:3px 8px;white-space:nowrap;flex-shrink:0;">' + escHtml(e.type) + '</span>' +
          '<span style="font-size:13px;color:var(--ink);flex:1;min-width:0;">' + escHtml(e.employeeName) + '</span>' +
        '</div>';
      }).join('') +
        '<div style="font-size:11.5px;color:var(--muted);margin-top:8px;">Cuti dikelola lewat pengajuan &amp; persetujuan cuti, bukan dari kalender ini.</div>';
    }

    if (!dayEventItems.length && !dayEvents.length) {
      body += '<div style="text-align:center;color:var(--muted);font-size:13px;padding:24px 0;">Tidak ada kegiatan maupun cuti pada tanggal ini.</div>';
    }

    document.getElementById(mid + '-body').innerHTML = body;

    var addBtn = document.getElementById(mid + '-add');
    if (manage) {
      addBtn.style.display = 'inline-flex';
      addBtn.textContent = '+ Tambah Kegiatan';
      addBtn.setAttribute('data-onclick', "closeModal('" + mid + "'); openEventModal('" + containerId + "','" + dateStr + "')");
    } else {
      addBtn.style.display = 'none';
    }

    openModal(mid);
  }

  function addEventToGoogleCalendarFromModal(containerId) {
    var mid = "eventModal-" + containerId;
    var id = document.getElementById(mid + '-id').value;
    if (!id) { toast('Simpan kegiatan terlebih dahulu sebelum menambah ke Google Calendar'); return; }
    addEventToGoogleCalendar(containerId, id);
  }

  function downloadEventIcsFromModal(containerId) {
    var mid = "eventModal-" + containerId;
    var id = document.getElementById(mid + '-id').value;
    if (!id) { toast('Simpan kegiatan terlebih dahulu sebelum mengunduh .ics'); return; }
    downloadSingleEventIcs(containerId, id);
  }

  // Sama seperti dua fungsi di atas, tapi baca id dari modal VIEW
  // (read-only) -- dipisah karena data-onclick TIDAK bisa langsung
  // mengevaluasi ekspresi seperti document.getElementById(...).value
  // sebagai argumen (lihat runInlineHandlerCode() di app.js, parsernya
  // cuma mengenali string literal/angka/event/this/window.xxx) --
  // makanya perlu wrapper per-modal yang membaca id-nya sendiri.
  function addEventToGoogleCalendarFromViewModal(containerId) {
    var mid = "eventViewModal-" + containerId;
    var id = document.getElementById(mid + '-id').value;
    if (!id) return;
    addEventToGoogleCalendar(containerId, id);
  }

  function downloadEventIcsFromViewModal(containerId) {
    var mid = "eventViewModal-" + containerId;
    var id = document.getElementById(mid + '-id').value;
    if (!id) return;
    downloadSingleEventIcs(containerId, id);
  }

  // dateStr: kalau diisi (klik "+ kegiatan" di sel kosong), prefill start/end
  // ke tanggal itu. eventId: kalau diisi (klik chip kegiatan), mode edit.
  function openEventModal(containerId, dateStr, eventId) {
    var mid = "eventModal-" + containerId;
    var ev = eventId ? (eventsCache[containerId] || []).find(function (e) { return e.id === eventId; }) : null;
    document.getElementById(mid + '-title').textContent = ev ? 'Ubah Kegiatan' : 'Tambah Kegiatan';
    document.getElementById(mid + '-id').value = ev ? ev.id : '';
    document.getElementById(mid + '-title-input').value = ev ? ev.title : '';
    document.getElementById(mid + '-category').value = ev ? ev.category : 'umum';
    document.getElementById(mid + '-department').value = ev ? (ev.department_id || '') : '';
    document.getElementById(mid + '-start').value = ev ? ev.start_date : (dateStr || '');
    document.getElementById(mid + '-end').value = ev ? ev.end_date : (dateStr || '');
    document.getElementById(mid + '-desc').value = ev ? (ev.description || '') : '';
    document.getElementById(mid + '-delete').style.display = ev ? 'inline-flex' : 'none';
    document.getElementById(mid + '-gcal').style.display = ev ? 'inline-flex' : 'none';
    document.getElementById(mid + '-ics').style.display = ev ? 'inline-flex' : 'none';
    openModal(mid);
  }

  async function saveEventModal(containerId) {
    var mid = "eventModal-" + containerId;
    var id = document.getElementById(mid + '-id').value;
    var payload = {
      title: document.getElementById(mid + '-title-input').value.trim(),
      category: document.getElementById(mid + '-category').value,
      department_id: document.getElementById(mid + '-department').value || null,
      start_date: document.getElementById(mid + '-start').value,
      end_date: document.getElementById(mid + '-end').value,
      description: document.getElementById(mid + '-desc').value.trim(),
    };
    if (!payload.title) { toast('Judul kegiatan wajib diisi'); return; }
    if (!payload.start_date || !payload.end_date) { toast('Tanggal mulai & selesai wajib diisi'); return; }
    if (payload.end_date < payload.start_date) { toast('Tanggal selesai tidak boleh sebelum tanggal mulai'); return; }
    try {
      var result = id
        ? await dataService.updateInstitutionalEvent(id, payload)
        : await dataService.createInstitutionalEvent(payload);
      if (result && result.ok === false) { toast(result.error || 'Gagal menyimpan kegiatan'); return; }
      toast(id ? 'Kegiatan diperbarui' : 'Kegiatan ditambahkan');
      closeModal(mid);
      invalidateCalendarDataCache();
      renderCalendar(containerId);
    } catch (e) { toast('Gagal menyimpan kegiatan: ' + e.message); }
  }

  async function deleteEventModal(containerId) {
    var mid = "eventModal-" + containerId;
    var id = document.getElementById(mid + '-id').value;
    if (!id) return;
    if (!confirm('Hapus kegiatan ini?')) return;
    try {
      var result = await dataService.deleteInstitutionalEvent(id);
      if (result && result.ok === false) { toast(result.error || 'Gagal menghapus kegiatan'); return; }
      toast('Kegiatan dihapus');
      closeModal(mid);
      invalidateCalendarDataCache();
      renderCalendar(containerId);
    } catch (e) { toast('Gagal menghapus kegiatan: ' + e.message); }
  }

  // ---- Kartu "Agenda bulan ini" (tab Ringkasan di profil pegawai/guru) ----
  // Menampilkan pengajuan cuti (status approved) milik pegawai yang sedang
  // dibuka, yang jatuh pada bulan berjalan. Memakai method dataService yang
  // sama dengan kalender utama; untuk role swalayan (pegawai/guru) RLS di
  // backend memang sudah membatasi hasilnya ke data diri sendiri, tapi
  // filter employee_id tetap dipasang di sini supaya benar juga saat
  // dipanggil dari sisi Admin (yang melihat SEMUA baris, bukan cuma milik
  // pegawai yang profilnya sedang dibuka).
  function formatShortDate(ymd) {
    if (!ymd) return "";
    var p = ymd.split("-").map(Number);
    return p[2] + " " + MONTH_NAMES_ID[p[1] - 1].slice(0, 3);
  }
  async function renderAgendaCard(employeeId, containerId, homeContainerId, reminderContainerId) {
    containerId = containerId || "profileAgendaCard";
    // homeContainerId: kartu blok kecil "Agenda Bulan Ini" di baris #profileHomeToday
    // (tab Ringkasan, mode swalayan) -- ringkasan padat dari data YANG SAMA,
    // diisi dalam satu kali fetch supaya tidak pernah tidak sinkron dengan
    // section penuh, meniru pola profileLeaveBalanceHome/profilePayrollHome.
    // reminderContainerId (ditambahkan 2026-08-25): kartu "Reminder" gaya
    // glass di tab Ringkasan -- SAMA sumber data, BUKAN fetch terpisah,
    // supaya tidak pernah tidak sinkron dengan 2 salinan lain di atas.
    var el = document.getElementById(containerId);
    var homeEl = homeContainerId ? document.getElementById(homeContainerId) : null;
    var reminderEl = reminderContainerId ? document.getElementById(reminderContainerId) : null;
    if ((!el && !homeEl && !reminderEl) || !employeeId) return;
    if (el) el.innerHTML = '<div style="color:var(--muted);font-size:12.5px;">Memuat…</div>';
    if (homeEl) homeEl.innerHTML = '<div style="color:var(--ink-500);font-size:12px;">Memuat…</div>';
    if (reminderEl) reminderEl.style.display = 'none';

    var t = new Date();
    var gridStart = ymdStr(t.getFullYear(), t.getMonth(), 1);
    var gridEnd = ymdStr(t.getFullYear(), t.getMonth(), daysInMonth(t.getFullYear(), t.getMonth()));

    var leaveItems = [];
    var eventItems = [];
    try {
      var shared = await loadCalendarSharedData();
      leaveItems = (shared.leaveRequests || []).filter(function (r) {
        return r.employee_id === employeeId &&
          r.start_date <= gridEnd && r.end_date >= gridStart;
      }).map(function (r) {
        return {
          start_date: r.start_date, end_date: r.end_date,
          label: (r.leave_types && r.leave_types.name) || "Cuti",
          color: leaveColor((r.leave_types && r.leave_types.name) || "")
        };
      });
      eventItems = (shared.institutionalEvents || []).filter(function (ev) {
        return ev.start_date <= gridEnd && ev.end_date >= gridStart;
      }).map(function (ev) {
        return {
          start_date: ev.start_date, end_date: ev.end_date,
          label: ev.title, color: eventColor(ev.category), isEvent: true, category: ev.category
        };
      });
    } catch (e) { leaveItems = []; eventItems = []; }

    var items = leaveItems.concat(eventItems);
    if (!items.length) {
      if (el) el.innerHTML = '<div style="font-size:12.5px;color:var(--muted);">Tidak ada agenda pada bulan ini.</div>';
      if (homeEl) homeEl.innerHTML = '<p style="font-size:12px;color:var(--ink-500);">Tidak ada agenda bulan ini.</p>';
      return;
    }
    items.sort(function (a, b) { return a.start_date < b.start_date ? -1 : 1; });

    if (el) {
      el.innerHTML = items.map(function (it) {
        var range = it.start_date === it.end_date
          ? formatShortDate(it.start_date)
          : formatShortDate(it.start_date) + " – " + formatShortDate(it.end_date);
        return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);">' +
          '<span style="font-size:11px;font-weight:700;background:' + it.color.bg + ';color:' + it.color.fg + ';border-radius:6px;padding:3px 8px;white-space:nowrap;">' + escHtml(range) + '</span>' +
          '<span style="font-size:12.5px;color:var(--ink);">' + (it.isEvent ? eventIcon(it.category) + ' ' : '') + escHtml(it.label) + '</span>' +
        '</div>';
      }).join('');
    }

    // Versi padat untuk kartu blok kecil -- maksimal 3 baris (konsisten
    // dengan pola home-stat-row yang dipakai profileLeaveBalanceHome), sisanya
    // diringkas jadi satu baris "+N agenda lagi" alih-alih memanjangkan kartu.
    if (homeEl) {
      var MAX_HOME_ITEMS = 3;
      var shown = items.slice(0, MAX_HOME_ITEMS);
      var rest = items.length - shown.length;
      homeEl.innerHTML = shown.map(function (it) {
        var range = it.start_date === it.end_date
          ? formatShortDate(it.start_date)
          : formatShortDate(it.start_date) + "–" + formatShortDate(it.end_date);
        return '<div class="home-stat-row" style="align-items:flex-start;">' +
          '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:118px;">' + (it.isEvent ? eventIcon(it.category) + ' ' : '') + escHtml(it.label) + '</span>' +
          '<b style="font-family:inherit;font-weight:700;font-size:11px;background:' + it.color.bg + ';color:' + it.color.fg + ';border-radius:6px;padding:2px 7px;white-space:nowrap;">' + escHtml(range) + '</b>' +
        '</div>';
      }).join('') + (rest > 0 ? '<div style="font-size:11px;color:var(--ink-500);margin-top:4px;">+' + rest + ' agenda lagi</div>' : '');
    }

    // Kartu "Reminder" -- HANYA tampil kalau ada agenda yang BELUM lewat
    // (end_date >= hari ini). Sengaja TIDAK menampilkan agenda yang
    // sudah lewat sebagai "pengingat" -- itu akan menyesatkan, bukan
    // membantu. Kalau tidak ada yang akan datang bulan ini, kartu tetap
    // disembunyikan (style.display sudah di-reset 'none' di atas).
    if (reminderEl) {
      var todayStr = ymdStr(t.getFullYear(), t.getMonth(), t.getDate());
      var upcoming = items.filter(function (it) { return it.end_date >= todayStr; });
      if (upcoming.length) {
        var r = upcoming[0];
        // Ambil angka tanggal langsung dari string 'YYYY-MM-DD' (split,
        // BUKAN new Date().getDate()) -- menghindari kelas bug parsing
        // timezone yang sama seperti catatan WIB di bagian lain proyek ini.
        var dayNum = r.start_date.split('-')[2];
        var dateEl = document.getElementById('profileReminderDate');
        var titleEl = document.getElementById('profileReminderTitle');
        var subEl = document.getElementById('profileReminderSub');
        var rangeText = r.start_date === r.end_date
          ? formatShortDate(r.start_date)
          : formatShortDate(r.start_date) + ' – ' + formatShortDate(r.end_date);
        if (dateEl) dateEl.textContent = dayNum;
        // textContent (BUKAN innerHTML) -- r.label berasal dari data
        // pegawai/institusi, tidak boleh dirender sebagai HTML mentah.
        if (titleEl) titleEl.textContent = (r.isEvent ? eventIcon(r.category) + ' ' : '') + r.label;
        if (subEl) subEl.textContent = rangeText;
        reminderEl.style.display = 'flex';
      }
    }
  }

  // ---- Kalender mini + agenda gaya "Cek" (dashboard swalayan) ----
  // Dipanggil dari kartu kalender+agenda di tab "Dashboard Pegawai"
  // (data-panel "cek", label menu sebelumnya "Dashboard"). Sebelumnya
  // (25-26 Agustus 2026) juga dipakai di tab "Kalender" terpisah
  // (data-tab "calendar") -- tab itu DIHAPUS 2026-08-25 atas permintaan
  // user (kalender pegawai cukup di tab Dashboard, tidak perlu tab
  // berdiri sendiri). Fungsi ini TIDAK dihapus/disederhanakan meski
  // sekarang cuma 1 pemanggil -- kalenderCalCard/kalenderAgendaCard sudah
  // tidak ada di DOM, tapi signature (calContainerId, agendaContainerId
  // terpisah) sengaja dipertahankan supaya tetap reusable kalau tab
  // terpisah dibutuhkan lagi nanti.
  // Format agenda SENGAJA daftar-tanggal (bukan slot jam seperti mockup
  // asli) -- data cuti/kegiatan lembaga cuma punya start_date/end_date,
  // tidak ada jam spesifik, jadi memaksakan slot jam akan menampilkan jam
  // palsu/menyesatkan.
  var cekRenderParams = {}; // calContainerId -> {employeeId, agendaContainerId}

  async function renderCekCalendarAgenda(employeeId, calContainerId, agendaContainerId) {
    cekRenderParams[calContainerId] = { employeeId: employeeId, agendaContainerId: agendaContainerId };
    var calEl = calContainerId ? document.getElementById(calContainerId) : null;
    var agendaEl = agendaContainerId ? document.getElementById(agendaContainerId) : null;
    if ((!calEl && !agendaEl) || !employeeId) return;

    var calState = getCalState(calContainerId);
    if (calState.year == null) { var t0 = new Date(); calState.year = t0.getFullYear(); calState.month = t0.getMonth(); }
    var year = calState.year, month0 = calState.month;

    var leaveRows = [], events = [];
    try {
      var shared = await loadCalendarSharedData();
      leaveRows = shared.leaveRequests || [];
      events = shared.institutionalEvents || [];
    } catch (e) { leaveRows = []; events = []; }

    var gridStart = ymdStr(year, month0, 1);
    var gridEnd = ymdStr(year, month0, daysInMonth(year, month0));
    var ownLeaveRows = leaveRows.filter(function (r) { return r.employee_id === employeeId; });
    var byDay = distributeEventsByDay(ownLeaveRows, gridStart, gridEnd);
    var eventsByDay = distributeInstitutionalEventsByDay(events, gridStart, gridEnd);

    var now = new Date();
    var todayStr = ymdStr(now.getFullYear(), now.getMonth(), now.getDate());
    var isCurrentMonth = (year === now.getFullYear() && month0 === now.getMonth());
    var DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var weeks = buildMonthGrid(year, month0);

    if (calEl) {
      var gridHtml = DOW_SHORT.map(function (d) { return '<div class="dow">' + d + '</div>'; }).join('');
      weeks.forEach(function (week) {
        week.forEach(function (cell) {
          if (!cell.date) { gridHtml += '<div class="day is-muted"></div>'; return; }
          var cls = 'day';
          if (isCurrentMonth && cell.date === todayStr) cls += ' hl-orange';
          if (byDay[cell.date] && byDay[cell.date].length) cls += ' hl-blue';
          if (eventsByDay[cell.date] && eventsByDay[cell.date].length) cls += ' has-dot';
          gridHtml += '<div class="' + cls + '">' + cell.day + '</div>';
        });
      });
      calEl.innerHTML =
        '<div class="cek-cal-head">' +
          '<div><span class="m">' + escHtml(MONTH_NAMES_ID[month0]) + '</span><span class="d">' + year + '</span></div>' +
          '<div class="cek-cal-nav">' +
            '<span data-onclick="cekCalNav(\'' + calContainerId + '\',-1)" role="button" aria-label="Bulan sebelumnya">‹</span>' +
            '<span data-onclick="cekCalNav(\'' + calContainerId + '\',1)" role="button" aria-label="Bulan berikutnya">›</span>' +
          '</div>' +
        '</div>' +
        '<div class="cek-cal-grid">' + gridHtml + '</div>';
    }

    if (agendaEl) {
      var leaveItems = ownLeaveRows.filter(function (r) {
        return r.start_date <= gridEnd && r.end_date >= gridStart;
      }).map(function (r) {
        return {
          start_date: r.start_date, end_date: r.end_date,
          label: (r.leave_types && r.leave_types.name) || "Cuti",
          color: leaveColor((r.leave_types && r.leave_types.name) || "")
        };
      });
      var eventItems = (events || []).filter(function (ev) {
        return ev.start_date <= gridEnd && ev.end_date >= gridStart;
      }).map(function (ev) {
        return {
          start_date: ev.start_date, end_date: ev.end_date,
          label: ev.title, color: eventColor(ev.category), isEvent: true, category: ev.category
        };
      });
      var items = leaveItems.concat(eventItems);
      items.sort(function (a, b) { return a.start_date < b.start_date ? -1 : 1; });

      if (!items.length) {
        agendaEl.innerHTML = '<div class="cek-agenda-title">Agenda Bulan Ini</div>' +
          '<div style="font-size:12px;color:var(--ink-500);">Tidak ada agenda pada bulan ini.</div>';
      } else {
        agendaEl.innerHTML = '<div class="cek-agenda-title">Agenda Bulan Ini</div>' +
          '<div class="cek-agenda-track">' +
          items.map(function (it) {
            var range = it.start_date === it.end_date
              ? formatShortDate(it.start_date)
              : formatShortDate(it.start_date) + ' – ' + formatShortDate(it.end_date);
            return '<div class="cek-agenda-slot" style="min-height:auto;">' +
              '<div class="time" style="width:56px;">' + escHtml(range) + '</div>' +
              '<div class="rail"></div>' +
              '<div class="cek-agenda-event" style="flex:1;margin-bottom:0;background:' + it.color.bg + ';color:' + it.color.fg + ';">' +
                (it.isEvent ? eventIcon(it.category) + ' ' : '') + escHtml(it.label) +
              '</div>' +
            '</div>';
          }).join('') +
          '</div>';
      }
    }
  }

  function cekCalNav(calContainerId, direction) {
    var calState = getCalState(calContainerId);
    calState.month += direction;
    if (calState.month < 0) { calState.month = 11; calState.year--; }
    if (calState.month > 11) { calState.month = 0; calState.year++; }
    var params = cekRenderParams[calContainerId];
    if (!params) return;
    renderCekCalendarAgenda(params.employeeId, calContainerId, params.agendaContainerId);
  }

  window.renderCalendar = renderCalendar;
  window.renderAgendaCard = renderAgendaCard;
  window.renderCekCalendarAgenda = renderCekCalendarAgenda;
  window.cekCalNav = cekCalNav;
  window.invalidateCalendarDataCache = invalidateCalendarDataCache;
  window.openEventModal = openEventModal;
  window.saveEventModal = saveEventModal;
  window.deleteEventModal = deleteEventModal;
  window.openEventViewModal = openEventViewModal;
  window.openDayDetailModal = openDayDetailModal;
  window.downloadAllEventsIcs = downloadAllEventsIcs;
  window.downloadSingleEventIcs = downloadSingleEventIcs;
  window.addEventToGoogleCalendar = addEventToGoogleCalendar;
  window.addEventToGoogleCalendarFromModal = addEventToGoogleCalendarFromModal;
  window.downloadEventIcsFromModal = downloadEventIcsFromModal;
  window.addEventToGoogleCalendarFromViewModal = addEventToGoogleCalendarFromViewModal;
  window.downloadEventIcsFromViewModal = downloadEventIcsFromViewModal;
})();


