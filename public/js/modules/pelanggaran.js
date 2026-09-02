// ============================================================
// pelanggaran.js -- catat pelanggaran (Model B: kategori label +
// poin akumulatif, ambang di pengaturan_ambang_pelanggaran) & prestasi.
// Ustadz tulis (RLS scoped ke kelas AKTIF santri, schema_020), wali
// baca anaknya sendiri.
// ============================================================
import { getSupabaseClient } from '../supabaseClient.js';

const KATEGORI_LABEL = {
  teguran_lisan: 'Teguran Lisan',
  teguran_tertulis: 'Teguran Tertulis',
  sp1: 'SP-1',
  sp2: 'SP-2',
  sp3: 'SP-3',
};

const TINGKAT_PRESTASI_LABEL = {
  sekolah: 'Sekolah',
  kabupaten: 'Kabupaten',
  provinsi: 'Provinsi',
  nasional: 'Nasional',
};

export async function listJenisPelanggaran() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('jenis_pelanggaran')
    .select('id, nama, kategori, poin_default')
    .eq('aktif', true)
    .order('nama', { ascending: true });
  if (error) throw error;
  // Katalog ini SENGAJA kosong sampai pesantren isi data nyata (lihat
  // BRB v0.2) -- kalau data.length === 0, form pemanggil harus
  // menampilkan pesan jelas, bukan dropdown kosong tanpa penjelasan.
  return data;
}

export async function listPelanggaran({ santriId = null } = {}) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('pelanggaran')
    .select('id, santri_id, tanggal, kategori, poin, deskripsi, santri:santri_id(nama_lengkap)')
    .order('tanggal', { ascending: false });
  if (santriId) query = query.eq('santri_id', santriId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function catatPelanggaran({ santriId, tanggal, kategori, poin, deskripsi }) {
  if (!KATEGORI_LABEL[kategori]) throw new Error(`Kategori tidak dikenal: ${kategori}`);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('pelanggaran')
    .insert({ santri_id: santriId, tanggal, kategori, poin: Number(poin), deskripsi: deskripsi || null })
    .select()
    .single();
  if (error) {
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      throw new Error('Anda tidak punya akses mencatat pelanggaran santri ini (bukan kelas yang Anda ampu sekarang).');
    }
    throw error;
  }
  return data;
}

export async function listPrestasi({ santriId = null } = {}) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('prestasi')
    .select('id, santri_id, tanggal, kategori, deskripsi, tingkat, santri:santri_id(nama_lengkap)')
    .order('tanggal', { ascending: false });
  if (santriId) query = query.eq('santri_id', santriId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function catatPrestasi({ santriId, tanggal, kategori, deskripsi, tingkat }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('prestasi')
    .insert({ santri_id: santriId, tanggal, kategori, deskripsi, tingkat: tingkat || null })
    .select()
    .single();
  if (error) {
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      throw new Error('Anda tidak punya akses mencatat prestasi santri ini (bukan kelas yang Anda ampu sekarang).');
    }
    throw error;
  }
  return data;
}

export const labelKategoriPelanggaran = (k) => KATEGORI_LABEL[k] || k;
export const daftarKategoriPelanggaran = () => Object.entries(KATEGORI_LABEL).map(([value, label]) => ({ value, label }));
export const daftarTingkatPrestasi = () => Object.entries(TINGKAT_PRESTASI_LABEL).map(([value, label]) => ({ value, label }));
