// ============================================================
// catatanPerkembangan.js -- log perkembangan santri.
//
// Ustadz/musyrif TULIS (dibatasi RLS ke santri di kelas/asrama yang
// diampu, schema_021). Wali BACA (santri miliknya sendiri, RLS sama).
// Admin CRUD penuh. Query di sini TIDAK melakukan filtering manual --
// RLS Postgres yang menegakkan batasan; kalau query mengembalikan
// baris yang "seharusnya" tidak boleh dilihat user, itu bug di RLS
// (schema_021), bukan di modul ini -- jangan tambal dengan filter
// JS di sisi client, itu bukan batas keamanan sungguhan.
//
// "Realtime": modul ini query-on-load biasa (lihat catatan di
// schema_021) -- TIDAK ada subscription/polling otomatis. Kalau
// definisi "realtime" yang dimaksud pengguna ternyata push/live
// update, ini perlu direvisi memakai supabase.channel(), belum
// diimplementasikan.
// ============================================================
import { getSupabaseClient } from '../supabaseClient.js';

const KATEGORI_LABEL = {
  akademik: 'Akademik',
  ibadah: 'Ibadah',
  perilaku: 'Perilaku',
  kepengasuhan: 'Kepengasuhan',
  kesehatan_umum: 'Kesehatan (umum, non-medis)',
  lainnya: 'Lainnya',
};

export async function listCatatan(santriId) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('catatan_perkembangan')
    .select('id, tanggal, kategori, isi, created_at, dicatat_oleh, users:dicatat_oleh(nama_lengkap)')
    .order('tanggal', { ascending: false });

  if (santriId) query = query.eq('santri_id', santriId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function tambahCatatan({ santriId, kategori, isi, dicatatOleh }) {
  if (!KATEGORI_LABEL[kategori]) {
    throw new Error(`Kategori tidak dikenal: ${kategori}`);
  }
  if (!isi || isi.trim().length === 0) {
    throw new Error('Isi catatan tidak boleh kosong.');
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('catatan_perkembangan')
    .insert({
      santri_id: santriId,
      kategori,
      isi: isi.trim(),
      dicatat_oleh: dicatatOleh,
    })
    .select()
    .single();
  if (error) {
    // Kasus paling umum: RLS menolak karena santri di luar
    // kelas/asrama yang diampu user -- pesan Postgres asli tidak
    // selalu jelas ke pengguna awam, jadi diterjemahkan di sini.
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      throw new Error('Anda tidak punya akses untuk mencatat perkembangan santri ini (bukan santri di kelas/asrama yang Anda ampu).');
    }
    throw error;
  }
  return data;
}

export function labelKategori(kategori) {
  return KATEGORI_LABEL[kategori] || kategori;
}

export function daftarKategori() {
  return Object.entries(KATEGORI_LABEL).map(([value, label]) => ({ value, label }));
}
