// ============================================================
// main.js -- entry point DIS. Menggantikan patterns/main.js lama
// yang rusak (import 15 modul HRIS tak relevan, path salah -- lihat
// INTEGRATION_NOTES.md). Entry point ini HANYA memuat modul MVP
// (auth + Catatan Perkembangan) -- modul lain menyusul Rilis 2.
// ============================================================
import { boot } from './modules/uiShell.js';

boot().catch((err) => {
  console.error('Gagal boot aplikasi:', err);
  document.getElementById('app').innerHTML =
    `<p style="color:red;padding:2rem">Aplikasi gagal dimuat: ${err.message}</p>`;
});
