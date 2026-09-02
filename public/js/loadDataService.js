/* ============================================================
   PEMUATAN KONDISIONAL dataService BERDASAR APP_MODE
   ============================================================
   BUG DIPERBAIKI (awal): logika ini sebelumnya ada di dalam <script>
   INLINE di public/index.html. Waktu CSP diperketat -- 'unsafe-inline'
   dihapus dari script-src -- browser memblokir script inline itu.
   Dipindah ke file eksternal ini (loadDataService.js) sehingga lolos
   CSP 'self'.

   PERBAIKAN LANJUTAN: document.write() diganti dengan insertScriptSync()
   yang memakai document.createElement('script') + insertBefore().
   Alasan penggantian:
   - document.write() adalah API usang yang dapat menghapus seluruh
     halaman jika dipanggil setelah load selesai (walau saat ini aman
     karena dipanggil saat parser masih berjalan, polanya rapuh).
   - createElement + insertBefore AMAN dan modern: memasukkan <script>
     tepat setelah elemen <script src="loadDataService.js"> ini di DOM.
   - Karena script yang disisipkan TIDAK punya atribut async/defer,
     browser tetap menjalankannya sinkron sebelum melanjutkan parsing
     baris HTML berikutnya -- perilaku SAMA dengan document.write().
   - CDN supabase-js kini di-pin ke versi eksplisit (2.112.2, sama
     dengan devDependency di package.json) agar update minor CDN tidak
     otomatis masuk production tanpa review.

   URUTAN EKSEKUSI SETELAH loadDataService.js (s.async=false -> urutan
   eksekusi = urutan PEMANGGILAN insertScriptSync(), bukan posisi DOM):
   Mode supabase: supabase-js CDN -> supabaseClient.js -> attendanceSyncQueue.js -> supabaseDataService.js
   Mode mock    : mockDataService.js
   Kemudian (dari index.html): orgReferenceData.js -> calendarFeature.js -> app.js
   ============================================================ */

function insertScriptSync(src) {
  const s = document.createElement('script');
  s.src = src;
  // BUG DIPERBAIKI (2026-08-29): komentar SEBELUMNYA di sini salah --
  // script yang disisipkan lewat createElement() TIDAK otomatis sinkron.
  // Defaultnya browser menjalankannya ASINKRON (async=true secara implisit)
  // begitu selesai didownload, TIDAK menunggu urutan insersi maupun
  // selesainya parsing HTML -- beda total dari document.write() yang
  // benar-benar blocking. Akibatnya urutan eksekusi 4 file di bawah
  // (supabaseDataService.js -> attendanceSyncQueue.js -> supabaseClient.js
  // -> CDN supabase-js) TIDAK TERJAMIN -- tergantung kecepatan network
  // saat itu, file mana pun bisa selesai duluan dan jalan lebih dulu.
  // Kalau supabaseDataService.js sempat jalan sebelum supabaseClient.js
  // selesai, setiap fungsi yang dipanggil tombol lewat runInlineHandlerCode()
  // akan gagal DIAM-DIAM (typeof window[funcName] !== 'function' -> parser
  // melewatinya tanpa error) -- persis gejala "tombol tidak merespons".
  // Fix: `s.async = false` memaksa browser TETAP mendownload paralel
  // (tidak blocking parsing HTML) TAPI menjalankan script sesuai URUTAN
  // INSERSI, bukan urutan selesai download -- teknik standar untuk
  // menjaga urutan pada script yang disisipkan secara dinamis.
  s.async = false;
  // insertBefore tepat setelah <script> ini sendiri (document.currentScript).
  const me = document.currentScript;
  me.parentNode.insertBefore(s, me.nextSibling);
}

if (window.APP_MODE === 'supabase') {
  // BUG DIPERBAIKI (2026-08-30): dengan teknik s.async=false, urutan
  // EKSEKUSI mengikuti urutan PEMANGGILAN insertScriptSync() -- BUKAN
  // posisi akhir elemen di DOM. Urutan sebelumnya di sini terbalik
  // (didasarkan pada asumsi keliru soal insertBefore), yang membuat
  // supabaseClient.js dieksekusi SEBELUM CDN supabase-js selesai memuat
  // -> `TypeError: Cannot read properties of undefined (reading
  // 'createClient')` deterministik, lalu setiap dataService.* gagal
  // dengan `ReferenceError: supabaseClient is not defined`.
  // Urutan yang benar (dependency-first), sesuai urutan pemanggilan:
  //   1. cdn: @supabase/supabase-js (define window.supabase)
  //   2. js/supabaseClient.js       (define SUPABASE_URL, SUPABASE_ANON_KEY, supabaseClient)
  //   3. js/attendanceSyncQueue.js  (offline queue absensi)
  //   4. js/supabaseDataService.js
  // Pin ke versi eksplisit agar update CDN tidak otomatis masuk production.
  insertScriptSync('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.2/dist/umd/supabase.min.js');
  insertScriptSync('js/supabaseClient.js');
  insertScriptSync('js/attendanceSyncQueue.js');
  insertScriptSync('js/supabaseDataService.js');
} else {
  // Mode mock -- satu file, tidak ada masalah urutan.
  insertScriptSync('js/mockDataService.js');
}
