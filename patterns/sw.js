/* ============================================================
   sw.js — Service Worker HRIS Al-Falah
   ============================================================
   Dua tanggung jawab:
   1. PWA installable: prasyarat browser untuk menampilkan prompt
      "Tambahkan ke Layar Utama" adalah adanya service worker terdaftar
      + manifest.json valid. Caching di sini disengaja MINIMAL (app-shell
      saja) -- app ini SPA dengan data yang harus selalu real-time
      (absensi, approval cuti, dsb.), jadi cache-first untuk data akan
      berbahaya (data basi tanpa disadari user). Prioritas caching cuma
      untuk asset statis yang jarang berubah.
   2. Push notification: menerima event 'push' dari browser (dikirim
      lewat Web Push API oleh Edge Function send-push-notification) dan
      menampilkannya sebagai notifikasi sistem.

   CATATAN VERSIONING: naikkan CACHE_NAME setiap deploy yang mengubah
   app-shell (index.html/app.js/dll) supaya klien lama tidak nyangkut
   di cache basi. Pola -vN sama seperti yang sudah dipakai untuk
   Workbox/PWA di proyek lain tim ini.

   v10 (2026-08-31, laporan pengguna via screenshot): tab "Dashboard
   Pegawai" (panel "cek") menampilkan kalender Agustus 2026 yang
   BERHENTI di tanggal 30, tanggal 31 tidak muncul. Diverifikasi
   LANGSUNG (dijalankan ulang persis logikanya): buildMonthGrid()/
   daysInMonth() di calendarFeature.js SUDAH BENAR di `main` saat ini
   -- Agustus 2026 dihitung 31 hari, grid 6 baris lengkap termasuk
   tanggal 31. Root cause paling mungkin: cache-first SHELL_ASSETS
   (lihat strategi fetch di bawah) menyimpan versi LAMA
   calendarFeature.js di sejumlah perangkat yang belum sempat refresh
   sejak perbaikan terkait kalender terakhir dideploy TANPA menaikkan
   CACHE_NAME bersamaan (commit 92cb396 mengubah calendarFeature.js di
   bawah CACHE_NAME v7 yang SUDAH ADA sebelumnya, bukan bump baru) --
   pola PERSIS sama dengan insiden v1->v2 yang pernah terjadi di
   proyek ini (lihat commit 08ab181: "fix jam audit log tidak muncul
   karena cache PWA basi"). Menaikkan CACHE_NAME di sini memaksa
   SEMUA klien mengambil ulang seluruh SHELL_ASSETS (termasuk
   calendarFeature.js) dari server pada kunjungan berikutnya --
   TIDAK mengubah isi calendarFeature.js sama sekali di commit ini,
   murni cache-busting. Kalau setelah deploy ini tanggal 31 MASIH
   hilang di perangkat yang sama (setelah refresh penuh/reinstall
   PWA), berarti dugaan cache basi ini SALAH dan perlu investigasi
   lanjutan yang berbeda -- dicatat di sini supaya sesi berikutnya
   tahu hipotesis ini sudah dicoba.
   v11 (2026-08-31, sesi sama, laporan pengguna via screenshot terpisah:
   "tidak ada menu download untuk PWA"): tombol #pwaInstallBtn di topbar
   memang HANYA muncul kalau browser sendiri memicu event
   'beforeinstallprompt' -- itu keputusan penuh browser (heuristik
   engagement/riwayat dismiss), TIDAK bisa dipaksa lewat kode.
   manifest.json diverifikasi valid & lengkap (name/icons 192+512+
   maskable/display:standalone dst) -- BUKAN penyebabnya. Ditambahkan
   banner fallback informasional (pwaFallbackBanner, di index.html +
   pwaInstall.js) yang muncul setelah 5 detik kalau event itu tidak
   kunjung terpicu, mengarahkan ke menu native browser (⋮ > "Instal
   aplikasi"). File yang berubah (pwaInstall.js) ada di SHELL_ASSETS --
   WAJIB bump cache lagi di sini supaya perubahan ini sampai ke klien,
   persis pelajaran dari catatan v10 di atas.
   ============================================================ */

// v12 (2026-09-01, laporan pengguna 2 screenshot kartu "Info Kepegawaian"
// tab Cek -- kartu tampak statis/kosong di HP pengguna). Root cause
// SESUNGGUHNYA (commit 7074578, hari ini): ReferenceError
// `setText is not defined` di renderCekInfoKepegawaian() (employee-profile.js)
// membuat fungsi itu gagal total sejak pertama dibuat (commit b2e3711,
// 2026-08-31) -- sudah diperbaiki di kode. TAPI perbaikan itu
// (employee-profile.js, ada di SHELL_ASSETS) DIPUSH TANPA bump CACHE_NAME
// bersamaan -- pola PERSIS sama dengan insiden v8/v10/v11 di atas. Klien
// yang sudah instal PWA (persis kasus screenshot pengguna) akan terus
// menjalankan employee-profile.js versi lama yang rusak dari cache sampai
// bump ini sampai ke mereka.
// v13 (2026-09-01, sesi sama, permintaan pengguna "'Belum ada tugas.'
// bisa diperbaiki?"): kartu "Tugas" tab Cek dipindah dari localStorage
// per-device ke tabel server employee_tasks (schema_108) -- lihat
// migrasi untuk detail lengkap. daily-tasks.js (SHELL_ASSETS) berubah
// total (localStorage -> window.dataService), WAJIB bump cache lagi
// supaya semua klien (termasuk yang baru saja dapat v12) benar-benar
// menjalankan versi baru, bukan cuma sisi server yang berubah.
const CACHE_NAME = 'alfalah-hris-shell-v14';

// Hanya app-shell statis -- SENGAJA TIDAK termasuk endpoint Supabase
// (REST/Auth/Realtime/Storage) ataupun HTML halaman yang mengandung
// data (index.html sendiri TIDAK di-cache-first supaya update konten
// selalu kelihatan; cukup register saja).
//
// KOREKSI v8 (2026-08-31): daftar ini sebelumnya masih rujuk
// '/js/app.js' -- file itu SUDAH TIDAK dimuat index.html sejak cutover
// ES modules (P3.1, lihat docs/MIGRATION_ES_MODULES.md), jadi selama
// ini SW percache 9.300 baris dead code untuk nothing, SEKALIGUS tidak
// pernah cache entry point sesungguhnya (main.js) ataupun 19 modul lain
// yang dia import. Diperbaiki: entry classic script yang benar-benar
// dimuat <script src="js/..."> di index.html, PLUS seluruh 20 file
// ES module di js/modules/ (masing-masing request browser terpisah
// karena ES module graph, jadi harus dilist satu-satu, bukan cukup
// main.js saja, supaya offline-shell benar-benar lengkap).
const SHELL_ASSETS = [
  '/js/config.js',
  '/js/loadDataService.js',
  '/js/orgReferenceData.js',
  '/js/lucideIcons.js',
  '/js/calendarFeature.js',
  '/js/disciplinaryFeature.js',
  '/js/registerServiceWorker.js',
  '/js/pwaInstall.js',
  '/js/modules/main.js',
  '/js/modules/constants.js',
  '/js/modules/state.js',
  '/js/modules/utils.js',
  '/js/modules/auth.js',
  '/js/modules/employees.js',
  '/js/modules/org-chart.js',
  '/js/modules/daily-tasks.js',
  '/js/modules/employee-profile.js',
  '/js/modules/ui-shell.js',
  '/js/modules/settings.js',
  '/js/modules/performance.js',
  '/js/modules/payroll.js',
  '/js/modules/attendance.js',
  '/js/modules/reports.js',
  '/js/modules/users-admin.js',
  '/js/modules/audit-log.js',
  '/js/modules/documents-print.js',
  '/js/modules/dms.js',
  '/js/modules/dashboard.js',
  '/js/modules/leave.js',
  '/js/modules/student-database.js',
  '/assets/favicon-192.png',
  '/assets/favicon-32.png',
  '/assets/favicon.ico',
  '/assets/apple-touch-icon.png',
  '/assets/icon-512.png',
  '/assets/icon-512-maskable.png',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch((err) => {
        // Jangan gagalkan instalasi SW cuma karena satu asset gagal
        // di-cache (mis. asset belum ada di build tertentu) -- SW yang
        // gagal install berarti PWA juga gagal installable sama sekali.
        console.warn('[SW] Sebagian asset gagal di-precache:', err);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
    ))
  );
  self.clients.claim();
});

// Strategi: cache-first HANYA untuk asset yang ada di SHELL_ASSETS
// (dicek berdasar path, bukan seluruh domain). Semua request lain
// (termasuk *.supabase.co, index.html, CDN eksternal) lewat network
// biasa -- browser/HTTP cache normal yang menangani, bukan SW ini.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!SHELL_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});

// ─── Push notification ─────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    // Fallback kalau payload bukan JSON valid -- jangan diam-diam
    // gagal tanpa menampilkan apa pun ke user.
    payload = { title: 'HRIS Al-Falah', body: event.data.text() || 'Ada pemberitahuan baru.' };
  }

  const title = payload.title || 'HRIS Al-Falah';
  const options = {
    body: payload.body || '',
    icon: '/assets/favicon-192.png',
    badge: '/assets/favicon-32.png',
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Klik notifikasi -> fokus tab yang sudah terbuka kalau ada, atau buka
// tab baru ke URL yang disertakan payload push.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
