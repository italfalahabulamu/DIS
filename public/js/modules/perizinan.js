// ============================================================
// perizinan.js -- pengajuan izin santri. Wali INSERT+SELECT untuk
// anaknya sendiri (RLS wali_insert_perizinan mensyaratkan
// diajukan_oleh = current_user_wali_id() -- BUKAN users.id, catatan
// penting: wali login pakai auth id, tapi kolom ini FK ke wali.id).
// Wali SENGAJA tidak bisa UPDATE status (approve/reject) -- itu
// wewenang admin.
// ============================================================
import { getSupabaseClient } from '../supabaseClient.js';

const JENIS_LABEL = { pulang: 'Pulang', sakit: 'Sakit', keperluan_lain: 'Keperluan Lain' };
const STATUS_LABEL = { menunggu: 'Menunggu', disetujui: 'Disetujui', ditolak: 'Ditolak' };

export async function listPerizinan({ santriId = null } = {}) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('perizinan')
    .select('id, santri_id, jenis, tanggal_mulai, tanggal_selesai, alasan, status, santri:santri_id(nama_lengkap)')
    .order('tanggal_mulai', { ascending: false });
  if (santriId) query = query.eq('santri_id', santriId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// diajukanOleh HARUS wali.id (dari public.users.wali_id profil login),
// BUKAN users.id -- salah kirim ini akan ditolak RLS
// (wali_insert_perizinan mensyaratkan diajukan_oleh = current_user_wali_id()).
export async function ajukanPerizinan({ santriId, jenis, tanggalMulai, tanggalSelesai, alasan, diajukanOleh }) {
  if (!diajukanOleh) {
    throw new Error('Akun ini tidak terhubung ke data wali (wali_id kosong) -- tidak bisa mengajukan izin.');
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('perizinan')
    .insert({
      santri_id: santriId,
      jenis,
      tanggal_mulai: tanggalMulai,
      tanggal_selesai: tanggalSelesai,
      alasan: alasan || null,
      diajukan_oleh: diajukanOleh,
    })
    .select()
    .single();
  if (error) {
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      throw new Error('Pengajuan ditolak -- pastikan santri ini benar anak Anda.');
    }
    throw error;
  }
  return data;
}

// Admin only (RLS admin_full_access_perizinan) -- wali sengaja tidak
// bisa update status sendiri.
export async function ubahStatusPerizinan(id, status) {
  if (!STATUS_LABEL[status]) throw new Error(`Status tidak dikenal: ${status}`);
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('perizinan').update({ status }).eq('id', id);
  if (error) {
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      throw new Error('Hanya admin yang boleh mengubah status perizinan.');
    }
    throw error;
  }
}

export const labelJenisPerizinan = (j) => JENIS_LABEL[j] || j;
export const labelStatusPerizinan = (s) => STATUS_LABEL[s] || s;
export const daftarJenisPerizinan = () => Object.entries(JENIS_LABEL).map(([value, label]) => ({ value, label }));
