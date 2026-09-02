/* ============================================================
   idle-timeout.js — Auto logout setelah 10 menit tanpa aktivitas.

   Cara kerja: sekali startIdleTimer() dipanggil (dari
   applyLoggedInProfile() di auth.js, tepat setelah login berhasil),
   modul ini mendengarkan event aktivitas pengguna (mousemove,
   keydown, mousedown, touchstart, scroll, wheel) dan mereset
   penghitung mundur setiap kali salah satu event itu terjadi.
   Kalau tidak ada aktivitas sama sekali selama IDLE_TIMEOUT_MS,
   doLogout() dipanggil otomatis dan pengguna melihat toast
   penjelasan kenapa dia dikeluarkan dari sesi.

   stopIdleTimer() WAJIB dipanggil setiap kali sesi berakhir lewat
   jalur lain (logout manual lewat doLogout(), sesi habis di server,
   dsb) -- kalau tidak, listener lama akan tetap aktif dan menumpuk
   kalau pengguna login lagi tanpa reload halaman penuh.

   Pemakaian 'mousemove'/'scroll' TIDAK di-throttle secara agresif
   di sini karena reset timer sendiri murah (cuma clearTimeout +
   setTimeout) -- kalau nanti terbukti jadi masalah performa di
   perangkat lemah, throttle bisa ditambah tanpa mengubah kontrak
   fungsi publik (start/stop) di modul ini.
   ============================================================ */

export const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 menit

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];

let timeoutId = null;
let listenersAttached = false;
let onTimeoutCallback = null;

function resetTimer() {
  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = setTimeout(handleTimeout, IDLE_TIMEOUT_MS);
}

async function handleTimeout() {
  // BUG (ditemukan lewat test): stopIdleTimer() SET onTimeoutCallback =
  // null -- kalau dipanggil duluan lalu baru dicek typeof
  // onTimeoutCallback di bawah, callback-nya sudah keburu hilang dan
  // TIDAK PERNAH terpanggil sama sekali (auto-logout diam-diam gagal,
  // timer habis tapi tidak ada efek apa pun). Simpan referensi lokal
  // dulu SEBELUM stopIdleTimer() menghapusnya.
  const callback = onTimeoutCallback;
  stopIdleTimer();
  if (typeof callback === 'function') {
    await callback();
  }
}

// onTimeout: async function yang dipanggil kalau waktu idle habis --
// diinjeksikan dari auth.js (bukan di-import langsung di sini) supaya
// modul ini tidak perlu tahu apa pun soal doLogout()/toast(), murni
// urusan hitung mundur aktivitas saja.
export function startIdleTimer(onTimeout) {
  onTimeoutCallback = onTimeout;
  if (!listenersAttached) {
    ACTIVITY_EVENTS.forEach((evt) => {
      document.addEventListener(evt, resetTimer, { passive: true });
    });
    listenersAttached = true;
  }
  resetTimer();
}

export function stopIdleTimer() {
  if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
  if (listenersAttached) {
    ACTIVITY_EVENTS.forEach((evt) => {
      document.removeEventListener(evt, resetTimer);
    });
    listenersAttached = false;
  }
  onTimeoutCallback = null;
}
