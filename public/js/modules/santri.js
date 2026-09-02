// ============================================================
// santri.js -- Data Induk Santri. Admin CRUD penuh (RLS
// admin_full_access_santri, schema_001). Role lain baca sesuai
// batasan RLS masing-masing (wali: anaknya sendiri; ustadz: santri
// di kelas yang diampu, schema_020).
//
// kelas_id di tabel santri TIDAK dipakai di sini -- kolom itu FK-nya
// belum pernah diaktifkan (lihat komentar schema_001) dan kelas
// AKTIF santri yang sebenarnya berlaku ada di santri_kelas_riwayat
// (tanggal_selesai IS NULL). Modul kelas/santri_kelas_riwayat belum
// punya UI -- backlog terpisah, BUKAN pekerjaan modul ini.
// ============================================================
import { getSupabaseClient } from '../supabaseClient.js';

export async function listSantri({ search = '', status = null } = {}) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('santri')
    .select('id, nis, nama_lengkap, tanggal_lahir, jenis_kelamin, status, tanggal_masuk')
    .order('nama_lengkap', { ascending: true });

  if (search) query = query.ilike('nama_lengkap', `%${search}%`);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// Dipakai picker di form Catatan Perkembangan/Kehadiran -- hasil
// ringan (id + label), bukan full record.
export async function cariSantriUntukPicker(query, limit = 10) {
  if (!query || query.trim().length < 2) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('santri')
    .select('id, nis, nama_lengkap')
    .ilike('nama_lengkap', `%${query.trim()}%`)
    .eq('status', 'aktif')
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function tambahSantri({ nis, namaLengkap, tanggalLahir, jenisKelamin, tanggalMasuk }) {
  if (!nis || !namaLengkap || !tanggalMasuk) {
    throw new Error('NIS, nama lengkap, dan tanggal masuk wajib diisi.');
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('santri')
    .insert({
      nis: nis.trim(),
      nama_lengkap: namaLengkap.trim(),
      tanggal_lahir: tanggalLahir || null,
      jenis_kelamin: jenisKelamin || null,
      tanggal_masuk: tanggalMasuk,
      status: 'aktif',
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') { // unique_violation
      throw new Error(`NIS "${nis}" sudah terdaftar -- tidak boleh duplikat.`);
    }
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      throw new Error('Hanya admin yang boleh menambah data santri.');
    }
    throw error;
  }
  return data;
}
