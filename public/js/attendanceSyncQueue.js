/* ============================================================
   attendanceSyncQueue.js — Antrian sinkronisasi offline absensi
   ============================================================
   Diadaptasi dari fitur syncQueue OpenHRApp
   (src/services/attendance/syncQueue.ts) untuk pola dataService
   HRIS Al-Falah. Menyimpan check-in/check-out yang gagal terkirim
   (jaringan putus / server sibuk) di localStorage, lalu mengirim
   ulang otomatis saat koneksi kembali — supaya guru/staff tidak
   kehilangan catatan absen di lokasi dengan sinyal tidak stabil.

   Cara pakai dari supabaseDataService.js: lihat pemanggilan
   AttendanceSyncQueue.* di checkIn()/checkOut()/drainAttendanceQueue()
   pada file itu.

   Desain (lihat juga catatan di CHECKIN_SYNC_QUEUE — belum ada file
   dokumen serupa di repo ini, disarankan dibuat di docs/ kalau
   fitur ini dipakai jangka panjang):
     - enqueue() -> PENDING
     - pickNext() -> flip 1 entri PENDING jadi IN_FLIGHT (mencegah
       kirim ganda kalau dua tab browser sama-sama drain)
     - markSuccess() -> hapus entri
     - markFailure() -> retryable? balik ke PENDING dengan backoff :
       DEAD_LETTER (berhenti dicoba, tampil ke user untuk retry manual)

   ⚠️ PRIVASI: entri di sini (employeeId + koordinat GPS) disimpan
   PLAINTEXT di localStorage, tidak terenkripsi. Lihat README.md
   ("Keterbatasan yang perlu diketahui", poin 7) untuk detail risiko
   & syarat WAJIB sebelum Fase 2 (foto selfie) memakai ulang pola
   antrian ini -- JANGAN tambahkan foto/data biometrik ke storageKey
   ini tanpa membaca poin itu dulu.
   ============================================================ */

(function (global) {
  'use strict';

  var SCHEMA_VERSION = 1;

  var QUEUE_DEFAULTS = {
    storageKey: 'alfalah_hris_absensi_sync_queue',
    maxAttempts: 5,
    backoffMs: [250, 750, 2000, 10000, 60000],
    deadLetterTtlMs: 14 * 24 * 60 * 60 * 1000, // 14 hari
    maxEntries: 100, // jauh lebih kecil dari default OpenHRApp (500) —
    // ini antrian per-pegawai (1 device, 1 orang), bukan per-lokasi
    // dengan banyak santri, jadi 100 sudah sangat longgar.
  };

  function genId() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch (e) { /* abaikan, pakai fallback di bawah */ }
    return 'absen_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function emptyEnvelope() {
    return { schemaVersion: SCHEMA_VERSION, entries: [] };
  }

  function readEnvelope(storageKey) {
    try {
      if (typeof localStorage === 'undefined') return emptyEnvelope();
      var raw = localStorage.getItem(storageKey);
      if (!raw) return emptyEnvelope();
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.entries)) {
        console.warn('[AbsensiSyncQueue] Envelope tidak kompatibel, dibuang');
        return emptyEnvelope();
      }
      return parsed;
    } catch (e) {
      console.warn('[AbsensiSyncQueue] Gagal baca envelope:', e);
      return emptyEnvelope();
    }
  }

  function writeEnvelope(storageKey, env) {
    try {
      if (typeof localStorage === 'undefined') return;
      if (env.entries.length === 0) {
        localStorage.removeItem(storageKey);
        return;
      }
      localStorage.setItem(storageKey, JSON.stringify(env));
    } catch (e) {
      console.warn('[AbsensiSyncQueue] Gagal simpan envelope (kuota penuh?):', e);
    }
  }

  function evictExpiredDeadLetters(entries, now, ttlMs) {
    var cutoff = now - ttlMs;
    return entries.filter(function (e) {
      return !(e.status === 'DEAD_LETTER' && e.queuedAt < cutoff);
    });
  }

  function nextBackoffMs(attempts, backoff) {
    var idx = Math.min(Math.max(attempts - 1, 0), backoff.length - 1);
    return backoff[idx];
  }

  function createQueue(opts) {
    opts = opts || {};
    var storageKey = opts.storageKey || QUEUE_DEFAULTS.storageKey;
    var defaultMaxAttempts = opts.maxAttempts || QUEUE_DEFAULTS.maxAttempts;
    var backoffMs = opts.backoffMs || QUEUE_DEFAULTS.backoffMs;
    var deadLetterTtlMs = opts.deadLetterTtlMs || QUEUE_DEFAULTS.deadLetterTtlMs;
    var maxEntries = opts.maxEntries || QUEUE_DEFAULTS.maxEntries;

    function loadFresh(now) {
      var env = readEnvelope(storageKey);
      return evictExpiredDeadLetters(env.entries, now, deadLetterTtlMs);
    }
    function save(entries) {
      writeEnvelope(storageKey, { schemaVersion: SCHEMA_VERSION, entries: entries });
    }

    return {
      // kind: 'CHECK_IN' | 'CHECK_OUT'
      // payload: { employeeId, location } — bentuk argumen asli
      // dataService.checkIn/checkOut, BUKAN row database. Dikirim ulang
      // dengan memanggil ulang fungsi yang sama, bukan insert manual,
      // supaya semua validasi/RLS-side-effect yang sama tetap berlaku.
      enqueue: function (input) {
        var now = Date.now();
        var entries = loadFresh(now);
        if (entries.length >= maxEntries) {
          throw new Error('[AbsensiSyncQueue] Antrian penuh (' + entries.length + ' entri) — sambungkan ke internet untuk mengosongkan.');
        }
        var entry = {
          id: genId(),
          kind: input.kind,
          payload: input.payload,
          occurredAt: input.occurredAt,
          queuedAt: now,
          status: 'PENDING',
          attempts: 0,
          lastAttemptAt: null,
          nextEligibleAt: now,
          lastError: null,
          maxAttempts: input.maxAttempts || defaultMaxAttempts,
          schemaVersion: SCHEMA_VERSION,
        };
        entries.push(entry);
        save(entries);
        return entry;
      },

      pickNext: function (now) {
        now = now || Date.now();
        var entries = loadFresh(now);
        var sorted = entries.slice().sort(function (a, b) { return a.occurredAt - b.occurredAt; });
        for (var i = 0; i < sorted.length; i++) {
          var e = sorted[i];
          if (e.status !== 'PENDING' || e.nextEligibleAt > now) continue;
          var target = entries.filter(function (x) { return x.id === e.id; })[0];
          target.status = 'IN_FLIGHT';
          target.lastAttemptAt = now;
          target.attempts += 1;
          save(entries);
          return target;
        }
        return null;
      },

      markSuccess: function (id) {
        var entries = loadFresh(Date.now()).filter(function (e) { return e.id !== id; });
        save(entries);
      },

      markFailure: function (id, err, now) {
        now = now || Date.now();
        var entries = loadFresh(now);
        var target = entries.filter(function (e) { return e.id === id; })[0];
        if (!target) return;
        target.lastError = err;
        if (!err.retryable || target.attempts >= target.maxAttempts) {
          target.status = 'DEAD_LETTER';
          save(entries);
          return;
        }
        target.status = 'PENDING';
        target.nextEligibleAt = now + nextBackoffMs(target.attempts, backoffMs);
        save(entries);
      },

      list: function (filter) {
        var entries = loadFresh(Date.now());
        if (!filter || !filter.status) return entries;
        return entries.filter(function (e) { return e.status === filter.status; });
      },
      size: function (filter) { return this.list(filter).length; },
      remove: function (id) {
        save(loadFresh(Date.now()).filter(function (e) { return e.id !== id; }));
      },
      requeueDeadLetter: function (id) {
        var now = Date.now();
        var entries = loadFresh(now);
        var target = entries.filter(function (e) { return e.id === id; })[0];
        if (!target || target.status !== 'DEAD_LETTER') return;
        target.status = 'PENDING'; target.attempts = 0;
        target.nextEligibleAt = now; target.lastError = null;
        save(entries);
      },
      clear: function () { save([]); },
    };
  }

  // Klasifikasi error dari supabase-js/postgrest-js.
  // CATATAN AKURASI: postgrest-js pada kegagalan JARINGAN (offline, DNS,
  // dsb.) TIDAK throw — ia menangkap exception fetch dan MENGEMBALIKANNYA
  // sebagai { error } dari pemanggilan .insert()/.update(), dengan
  // error.message biasanya "Failed to fetch" (Chrome/Edge) atau
  // "NetworkError when attempting to fetch resource." (Firefox/Safari
  // beda-beda). Ini diverifikasi terhadap kode checkIn/checkOut yang
  // ADA di supabaseDataService.js (tidak ada try/catch di sana — error
  // jaringan pasti lewat jalur { error } juga, bukan exception).
  // Error bisnis PostgREST (constraint DB, RLS) datang dengan field
  // `code` (kode error Postgres, mis. '23505' unique_violation).
  function classifySyncError(err) {
    if (!err) {
      return { status: null, code: 'UNKNOWN', message: 'Error tidak diketahui', retryable: false };
    }
    var msg = err.message || '';
    var isNetworkMsg = /failed to fetch|network ?error|load failed|networkrequestfailed/i.test(msg);
    if (isNetworkMsg) {
      return { status: null, code: 'NETWORK', message: msg, retryable: true };
    }
    // Kode error Postgres/PostgREST tersedia -> ini error BISNIS (RLS,
    // constraint, dsb.), bukan gagal jaringan. Jangan retry otomatis.
    if (err.code) {
      return { status: null, code: 'DB_' + err.code, message: msg, retryable: false };
    }
    // Tidak ada kode & bukan pola pesan jaringan yang dikenali ->
    // perlakukan sebagai tidak diketahui, JANGAN retry otomatis supaya
    // tidak diam-diam mengulang error yang sebenarnya permanen.
    return { status: null, code: 'UNKNOWN', message: msg, retryable: false };
  }

  var absensiSyncQueue = createQueue();

  // Handler drain didaftarkan dari supabaseDataService.js (butuh akses
  // ke supabaseClient, tidak tersedia di module ini secara langsung).
  var _drainFn = null;
  function setDrainHandler(fn) { _drainFn = fn; }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', function () {
      if (typeof _drainFn === 'function') {
        _drainFn().catch(function (e) {
          console.warn('[AbsensiSyncQueue] Auto-drain saat online gagal:', e);
        });
      }
    });
  }

  global.AttendanceSyncQueue = {
    createQueue: createQueue,
    absensiSyncQueue: absensiSyncQueue,
    classifySyncError: classifySyncError,
    setDrainHandler: setDrainHandler,
    QUEUE_DEFAULTS: QUEUE_DEFAULTS,
  };

})(typeof window !== 'undefined' ? window : this);
