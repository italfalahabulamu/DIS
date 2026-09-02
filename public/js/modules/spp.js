// ============================================================
// spp.js -- tagihan & pembayaran SPP. keuangan_spp CRUD penuh (RLS
// keuangan_full_access_spp_*), admin CRUD penuh, wali baca anaknya
// sendiri saja.
//
// status di spp_tagihan TIDAK dihitung otomatis dari total
// spp_pembayaran (dicatat eksplisit sebagai gap di schema_005) --
// modul ini TIDAK menghitung ulang status setelah pembayaran dicatat,
// admin/keuangan_spp harus update status manual. Ini keterbatasan
// yang diwarisi dari skema, bukan bug modul ini.
// ============================================================
import { getSupabaseClient } from '../supabaseClient.js';

const STATUS_LABEL = { belum_bayar: 'Belum Bayar', lunas: 'Lunas', sebagian: 'Sebagian' };
const JENIS_LABEL = { spp_bulanan: 'SPP Bulanan', uang_gedung: 'Uang Gedung', seragam: 'Seragam', lainnya: 'Lainnya' };

export async function listTagihan({ santriId = null } = {}) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('spp_tagihan')
    .select('id, santri_id, periode, jenis, jumlah, jatuh_tempo, status, santri:santri_id(nama_lengkap)')
    .order('jatuh_tempo', { ascending: false });
  if (santriId) query = query.eq('santri_id', santriId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function buatTagihan({ santriId, periode, jenis, jumlah, jatuhTempo }) {
  const nominal = Number(jumlah);
  if (Number.isNaN(nominal) || nominal <= 0) throw new Error('Jumlah harus angka positif.');
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('spp_tagihan')
    .insert({ santri_id: santriId, periode, jenis, jumlah: nominal, jatuh_tempo: jatuhTempo || null })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('Tagihan untuk santri, periode, dan jenis ini sudah ada.');
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      throw new Error('Hanya admin/keuangan_spp yang boleh membuat tagihan.');
    }
    throw error;
  }
  return data;
}

export async function listPembayaran(tagihanId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('spp_pembayaran')
    .select('id, jumlah_dibayar, tanggal_bayar, metode')
    .eq('tagihan_id', tagihanId)
    .order('tanggal_bayar', { ascending: false });
  if (error) throw error;
  return data;
}

export async function catatPembayaran({ tagihanId, jumlahDibayar, metode, dicatatOleh }) {
  const nominal = Number(jumlahDibayar);
  if (Number.isNaN(nominal) || nominal <= 0) throw new Error('Jumlah dibayar harus angka positif.');
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('spp_pembayaran')
    .insert({ tagihan_id: tagihanId, jumlah_dibayar: nominal, metode, dicatat_oleh: dicatatOleh })
    .select()
    .single();
  if (error) {
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      throw new Error('Hanya admin/keuangan_spp yang boleh mencatat pembayaran.');
    }
    throw error;
  }
  return data;
}

export async function updateStatusTagihan(tagihanId, status) {
  if (!STATUS_LABEL[status]) throw new Error(`Status tidak dikenal: ${status}`);
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('spp_tagihan').update({ status }).eq('id', tagihanId);
  if (error) throw error;
}

export const labelStatus = (s) => STATUS_LABEL[s] || s;
export const labelJenis = (j) => JENIS_LABEL[j] || j;
export const daftarJenis = () => Object.entries(JENIS_LABEL).map(([value, label]) => ({ value, label }));
export const daftarStatus = () => Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));
