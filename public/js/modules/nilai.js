// ============================================================
// nilai.js -- input & lihat nilai santri per mapel per semester.
// Ustadz (RLS is_ustadz_pengampu, schema_020) & wali baca RLS-scoped.
// ============================================================
import { getSupabaseClient } from '../supabaseClient.js';

export async function listMataPelajaran() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('mata_pelajaran')
    .select('id, nama_mapel, kkm, kategori')
    .order('urutan', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listNilai({ santriId = null } = {}) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('nilai')
    .select('id, santri_id, mata_pelajaran_id, semester, tahun_ajaran, nilai_angka, predikat, santri:santri_id(nama_lengkap), mata_pelajaran:mata_pelajaran_id(nama_mapel, kkm)')
    .order('created_at', { ascending: false });
  if (santriId) query = query.eq('santri_id', santriId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function inputNilai({ santriId, mataPelajaranId, kelasId, semester, tahunAjaran, nilaiAngka, predikat, catatan, inputOleh }) {
  const angka = Number(nilaiAngka);
  if (Number.isNaN(angka) || angka < 0 || angka > 100) {
    throw new Error('Nilai harus angka 0-100.');
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('nilai')
    // upsert by unique(santri_id, mata_pelajaran_id, semester, tahun_ajaran)
    .upsert(
      {
        santri_id: santriId,
        mata_pelajaran_id: mataPelajaranId,
        kelas_id: kelasId,
        semester,
        tahun_ajaran: tahunAjaran,
        nilai_angka: angka,
        predikat: predikat || null,
        catatan: catatan || null,
        input_oleh: inputOleh,
      },
      { onConflict: 'santri_id,mata_pelajaran_id,semester,tahun_ajaran' }
    )
    .select()
    .single();
  if (error) {
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      throw new Error('Anda tidak punya akses input nilai untuk santri/mapel/kelas ini (bukan penugasan Anda).');
    }
    throw error;
  }
  return data;
}
