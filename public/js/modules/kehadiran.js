// ============================================================
// kehadiran.js -- catat & lihat kehadiran santri per kelas per hari.
//
// Ustadz TULIS (dibatasi RLS ke kelas yang diampu, rumus tahun-ajaran
// dari tanggal -- lihat catatan "belum tentu benar" di
// schema_020_penugasan_ustadz.sql). Wali BACA (anaknya sendiri).
// Admin CRUD penuh.
//
// unique(santri_id, tanggal) di skema (schema_002) berarti SATU baris
// kehadiran per santri per hari -- catatKehadiran ini upsert, bukan
// insert polos, supaya input ulang di hari yang sama (koreksi) tidak
// gagal dengan error unique_violation yang membingungkan pengguna.
// ============================================================
import { getSupabaseClient } from '../supabaseClient.js';

const STATUS_LABEL = {
  hadir: 'Hadir',
  sakit: 'Sakit',
  izin: 'Izin',
  alpa: 'Alpa',
};

export async function listKehadiran({ santriId = null, kelasId = null, tanggal = null } = {}) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('kehadiran')
    .select('id, santri_id, kelas_id, tanggal, status, catatan, santri:santri_id(nama_lengkap)')
    .order('tanggal', { ascending: false });

  if (santriId) query = query.eq('santri_id', santriId);
  if (kelasId) query = query.eq('kelas_id', kelasId);
  if (tanggal) query = query.eq('tanggal', tanggal);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function catatKehadiran({ santriId, kelasId, tanggal, status, catatan, dicatatOleh }) {
  if (!STATUS_LABEL[status]) throw new Error(`Status tidak dikenal: ${status}`);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('kehadiran')
    // upsert by unique(santri_id, tanggal) -- lihat catatan header.
    .upsert(
      {
        santri_id: santriId,
        kelas_id: kelasId,
        tanggal,
        status,
        catatan: catatan || null,
        dicatat_oleh: dicatatOleh,
      },
      { onConflict: 'santri_id,tanggal' }
    )
    .select()
    .single();
  if (error) {
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      throw new Error('Anda tidak punya akses mencatat kehadiran santri ini (bukan kelas yang Anda ampu, atau tahun ajaran tidak cocok).');
    }
    throw error;
  }
  return data;
}

export function labelStatus(status) {
  return STATUS_LABEL[status] || status;
}

export function daftarStatus() {
  return Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));
}

// Daftar kelas -- dipakai dropdown form kehadiran. Tidak ada modul
// kelas terpisah, jadi fungsi ringan ini ditaruh di sini saja untuk
// MVP (kalau kelas butuh CRUD sendiri nanti, pindahkan ke kelas.js).
export async function listKelas() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('kelas')
    .select('id, nama_kelas, tahun_ajaran')
    .order('nama_kelas', { ascending: true });
  if (error) throw error;
  return data;
}
