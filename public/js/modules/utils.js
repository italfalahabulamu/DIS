/* ============================================================
   utils.js — Fungsi murni (pure function) tanpa dependensi ke
   state/DOM aplikasi. Aman di-import oleh modul mana pun.
   Dipindahkan dari app.js (P3.1 — pemecahan ES Modules).

   CATATAN MIGRASI (baca sebelum mengubah formatRupiah):
   app.js lama punya DUA definisi `formatRupiah` (baris 2785 tanpa
   spasi "Rp1.000", baris 4786 dengan spasi "Rp 1.000"). Karena
   keduanya `function` declaration di scope global yang sama,
   definisi KEDUA (dengan spasi) yang sesungguhnya aktif di seluruh
   aplikasi selama ini (hoisting menimpa yang pertama). Versi di
   bawah ini SENGAJA memakai bentuk "Rp " (dengan spasi) supaya
   perilaku aplikasi tidak berubah oleh refactor ini. Definisi
   duplikat di app.js lama nanti dihapus saat modul payroll/profile
   dipindah (tahap berikutnya) — jangan dihapus sekarang sebelum
   semua pemanggilnya ikut pindah ke modul ES, supaya app.js lama
   masih tetap berjalan sebagai fallback selama masa transisi.
   ============================================================ */

export function initials(name) {
  return (name || "?").split(",")[0].split(" ").filter(Boolean).slice(0, 2)
    .map(w => w[0]).join("").toUpperCase();
}

export function statusBadge(s) { return { active: 'success', inactive: 'danger', leave: 'info' }[s] || 'neutral'; }
export function statusText(s) { return { active: 'Aktif', inactive: 'Non-Aktif', leave: 'Cuti' }[s] || s; }

export function formatDate(d) {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Sengaja DIPISAH dari formatDate() di atas (bukan mengubahnya langsung)
// — formatDate() dipakai di 19 tempat, termasuk tabel padat (Rekap
// Kehadiran/Cuti, Dokumen) yang baru dirapikan untuk mobile; format
// panjang di sana berisiko bikin kolom melebar/terpotong lagi di HP.
// Dipakai khusus untuk field mandiri (bukan kolom tabel), mis. "Tanggal
// Bergabung" di kv-row Ringkasan.
export function formatDateLong(d) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Tanggal + jam (mis. "11 Agustus 2026 - 12.02"), dipakai khusus untuk
// Audit Log — di sana jam-menit penting untuk menelusuri urutan
// kejadian, beda dengan formatDate() yang cuma tanggal untuk tabel
// padat lain. Jam pakai titik (bukan titik dua) mengikuti gaya
// penulisan waktu Indonesia.
export function formatDateTime(d) {
  if (!d) return '—';
  const date = new Date(d);
  const tanggal = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const jam = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
  return `${tanggal} - ${jam}`;
}

// Nama hari + bulan penuh berbahasa Indonesia, format "11 Agustus 2026"
// (tanpa jam) — dipakai di surat cetak (leave letter, dsb).
export function formatDateIndonesian(dateStr) {
  if (!dateStr) return '—';
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const d = new Date(dateStr);
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Pesan gagal-muat yang aman ditampilkan ke pengguna, dipakai di semua
// layar "daftar/tabel X" (Pengaturan, Kehadiran, Cuti, dst.) saat
// dataService melempar error. SEBELUM INI: setiap layar menampilkan
// `Gagal memuat: ${e.message}` -- pesan error Postgres/Supabase MENTAH
// (mis. `relation "public.shifts" does not exist`, atau pesan RLS
// teknis lainnya) langsung ke UI. Itu membingungkan pengguna non-teknis
// dan berpotensi membocorkan detail struktur database. Sekarang pesan
// ke pengguna digeneralisasi, detail teknis tetap dicatat ke
// console.error untuk developer/tim support yang membuka DevTools.
export function friendlyLoadError(e) {
  console.error('[Gagal memuat]', e);
  return 'Gagal memuat data. Coba muat ulang halaman, atau hubungi admin jika masalah berlanjut.';
}

export function localDateISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO() { return localDateISO(); }

export function formatTime(ts) {
  return ts ? new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—';
}

// Lihat catatan migrasi di puncak file: versi "Rp " (dengan spasi)
// dipertahankan karena itu yang sesungguhnya aktif selama ini.
export function formatRupiah(n) {
  if (n === null || n === undefined) return '—';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

export function dayOfYear(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d - start;
  return Math.floor(diff / 86400000);
}

export function countInclusiveDays(start, end) {
  return Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
}

/* ============================================================
   compressImageIfNeeded — kompresi gambar di sisi browser SEBELUM
   diunggah, dipakai di semua titik upload gambar (foto pegawai, logo
   institusi, bukti dokumen/sertifikasi/kompetensi/disiplin, bukti
   MWR). Ini pelengkap, BUKAN pengganti, batas hard-reject yang sudah
   ada per titik upload di dataService.* (2MB/5MB/10MB) -- batas itu
   tetap jadi penolakan terakhir kalau kompresi gagal/tidak cukup.

   KENAPA HANYA GAMBAR (image/jpeg|png|webp): resize+re-encode valid
   untuk foto/scan gambar, tapi akan MERUSAK file PDF/DOCX/XLSX kalau
   dipaksakan lewat jalur yang sama -- fungsi ini sengaja mengembalikan
   file APA ADANYA untuk tipe non-gambar (deteksi lewat file.type),
   pemanggil TIDAK PERLU cek tipe file dulu sebelum memanggil ini.

   KEPUTUSAN TARGET 400KB (bukan 250KB) SEBAGAI DEFAULT: mayoritas
   titik upload gambar di aplikasi ini adalah SCAN/FOTO DOKUMEN berisi
   teks yang harus tetap terbaca (ijazah, sertifikat, SK, bukti kerja
   MWR, bukti disiplin) -- bukan foto casual. Kompresi agresif ke
   250KB pada resolusi scan dokumen umum (~1600px) berisiko blur/pecah
   di teks kecil. 400KB memberi ruang kualitas lebih tapi masih ~25x
   lebih kecil dari batas lama (10MB). Untuk gambar yang murni
   dekoratif/identifikasi (foto pegawai, logo institusi) pemanggil
   BOLEH override ke target lebih kecil (lihat contoh pemanggilan di
   employee-profile.js/settings.js) karena detail halus tidak relevan
   di ukuran tampil yang kecil.

   Strategi: (1) skip kalau bukan gambar atau sudah di bawah target,
   (2) resize dulu ke maxDimension (defaultnya cukup untuk dibaca di
   layar, bukan untuk dicetak ukuran besar), (3) turunkan kualitas
   JPEG bertahap sampai di bawah target atau mentok minQuality, (4)
   kalau masih di atas target, perkecil dimensi sekali lagi sebagai
   upaya terakhir. PNG dengan preserveTransparency=true TIDAK dipaksa
   re-encode ke JPEG (supaya transparansi logo tidak hilang) -- hanya
   di-resize, PNG lossless jadi tidak ada parameter kualitas yang bisa
   diadu untuk PNG.

   Gagal decode/tidak didukung browser -> kembalikan file ASLI (bukan
   melempar error) supaya alur upload tidak pernah macet gara-gara
   fitur kompresi ini.
   ============================================================ */
const COMPRESSIBLE_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

function renameFileExt(name, ext) {
  const base = (name || 'file').replace(/\.[^./\\]+$/, '');
  return `${base}.${ext}`;
}

export async function compressImageIfNeeded(file, opts = {}) {
  const {
    maxBytes = 400 * 1024,
    maxDimension = 1600,
    preserveTransparency = false,
    minQuality = 0.5,
  } = opts;

  if (!file || !COMPRESSIBLE_IMAGE_TYPES.includes(file.type)) return file;
  if (file.size <= maxBytes) return file;
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    return file; // gambar korup/format tak didukung -- biarkan validasi hard-limit lama yang menolak/menerima
  }

  try {
    let width = bitmap.width;
    let height = bitmap.height;
    if (width > maxDimension || height > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    const wantsPng = preserveTransparency && file.type === 'image/png';
    const outputType = wantsPng ? 'image/png' : 'image/jpeg';

    const drawToCanvas = (w, h) => {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (outputType === 'image/jpeg') {
        // JPEG tidak punya alpha -- isi latar putih dulu supaya area
        // transparan (mis. dari PNG sumber) tidak berubah jadi hitam.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(bitmap, 0, 0, w, h);
      return canvas;
    };

    const canvasToBlob = (canvas, quality) => new Promise(resolve => {
      if (outputType === 'image/jpeg') canvas.toBlob(resolve, outputType, quality);
      else canvas.toBlob(resolve, outputType);
    });

    let canvas = drawToCanvas(width, height);

    if (wantsPng) {
      const blob = await canvasToBlob(canvas);
      if (blob && blob.size < file.size) {
        return new File([blob], renameFileExt(file.name, 'png'), { type: 'image/png', lastModified: Date.now() });
      }
      return file;
    }

    let quality = 0.85;
    let blob = await canvasToBlob(canvas, quality);
    while (blob && blob.size > maxBytes && quality > minQuality) {
      quality = Math.max(minQuality, quality - 0.1);
      blob = await canvasToBlob(canvas, quality);
    }

    // Upaya terakhir kalau kualitas minimum tetap di atas target: perkecil
    // dimensi sekali lagi (bukan turunkan kualitas lebih jauh -- di bawah
    // minQuality artefak JPEG sudah terlalu mengganggu untuk dokumen).
    if (blob && blob.size > maxBytes && Math.max(width, height) > 640) {
      const w2 = Math.round(width * 0.7);
      const h2 = Math.round(height * 0.7);
      canvas = drawToCanvas(w2, h2);
      blob = await canvasToBlob(canvas, minQuality);
    }

    if (!blob || blob.size >= file.size) return file; // hasil kompresi tidak lebih kecil dari asli -- percuma, pakai file asli
    return new File([blob], renameFileExt(file.name, 'jpg'), { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    bitmap.close?.();
  }
}
