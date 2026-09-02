// ============================================================
// santriPickerHelper.js -- markup + wiring untuk picker pencarian
// santri, dipakai berulang di form Catatan Perkembangan, Kehadiran,
// Nilai, Pelanggaran, Prestasi, Perizinan, Kesehatan.
//
// Diekstrak setelah pola yang sama muncul ke-3 kalinya (Rilis 2) --
// sebelum ini disalin-tempel di uiShell.js untuk Catatan Perkembangan
// dan Kehadiran. Kalau ada bug di picker, sekarang cukup diperbaiki
// di satu tempat.
//
// KONTRAK: form pemanggil WAJIB punya struktur persis ini di dalam
// <form>:
//   <label>...<input name="santri_search">...<div class="picker-hasil"></div></label>
//   <input type="hidden" name="santri_id">
//   <p class="santri-terpilih-label"></p>
// Wiring klik/input ditangani terpusat di uiShell.js (delegasi event
// di level #app), helper ini HANYA menyediakan markup + fungsi
// escapeHtml lokal supaya tidak tergantung modul lain.
// ============================================================

export function markupPickerSantri({ label = 'Cari Santri', required = true } = {}) {
  return `
    <label>${escapeHtml(label)}
      <input type="text" name="santri_search" placeholder="Ketik nama santri..." autocomplete="off" ${required ? 'required' : ''}>
      <div class="picker-hasil"></div>
    </label>
    <input type="hidden" name="santri_id">
    <p class="hint santri-terpilih-label"></p>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
