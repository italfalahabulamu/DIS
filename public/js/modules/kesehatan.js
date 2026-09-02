// ============================================================
// kesehatan.js -- DATA SENSITIF. Hanya admin + wali santri
// bersangkutan (CONFIRMED, lihat schema_008) -- ustadz DAN musyrif
// SENGAJA TIDAK punya akses di sini (beda dari catatan_perkembangan
// yang memang dibuat sebagai kanal terpisah non-medis untuk musyrif).
//
// kesehatan (profil statis, 1 baris per santri) -- WALI HANYA bisa
// UPDATE, TIDAK bisa INSERT (RLS wali_update_kesehatan saja, tidak
// ada wali_insert_kesehatan) -- baris pertama harus dibuat admin.
// kesehatan_riwayat (episodik) -- wali bisa INSERT+SELECT.
// ============================================================
import { getSupabaseClient } from '../supabaseClient.js';

const STATUS_RIWAYAT_LABEL = {
  ditangani: 'Ditangani',
  dirujuk: 'Dirujuk',
  rawat_inap: 'Rawat Inap',
  dalam_pemantauan: 'Dalam Pemantauan',
  sembuh: 'Sembuh',
};

export async function getProfilKesehatan(santriId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('kesehatan')
    .select('santri_id, golongan_darah, alergi, riwayat_penyakit, kontak_darurat')
    .eq('santri_id', santriId)
    .maybeSingle(); // baris mungkin belum ada -- bukan error kalau kosong
  if (error) throw error;
  return data;
}

// Admin: bisa buat baris baru (insert) atau update. Wali: HANYA bisa
// update baris yang sudah ada -- kalau baris belum ada, upsert ini
// akan gagal RLS untuk wali (disengaja, bukan bug modul).
export async function simpanProfilKesehatan({ santriId, golonganDarah, alergi, riwayatPenyakit, kontakDarurat }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('kesehatan')
    .upsert(
      {
        santri_id: santriId,
        golongan_darah: golonganDarah || null,
        alergi: alergi || null,
        riwayat_penyakit: riwayatPenyakit || null,
        kontak_darurat: kontakDarurat || null,
      },
      { onConflict: 'santri_id' }
    )
    .select()
    .single();
  if (error) {
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      throw new Error('Akses ditolak -- kalau ini santri baru, minta admin buat profil kesehatan awal dulu sebelum Anda bisa update.');
    }
    throw error;
  }
  return data;
}

export async function listRiwayatKesehatan(santriId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('kesehatan_riwayat')
    .select('id, tanggal, keluhan, penanganan, status')
    .eq('santri_id', santriId)
    .order('tanggal', { ascending: false });
  if (error) throw error;
  return data;
}

export async function tambahRiwayatKesehatan({ santriId, tanggal, keluhan, penanganan, status, dicatatOleh }) {
  if (!keluhan || keluhan.trim().length === 0) throw new Error('Keluhan wajib diisi.');
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('kesehatan_riwayat')
    .insert({
      santri_id: santriId,
      tanggal,
      keluhan: keluhan.trim(),
      penanganan: penanganan || null,
      status: status || 'ditangani',
      dicatat_oleh: dicatatOleh,
    })
    .select()
    .single();
  if (error) {
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      throw new Error('Anda tidak punya akses mencatat riwayat kesehatan santri ini.');
    }
    throw error;
  }
  return data;
}

export const labelStatusRiwayat = (s) => STATUS_RIWAYAT_LABEL[s] || s;
export const daftarStatusRiwayat = () => Object.entries(STATUS_RIWAYAT_LABEL).map(([value, label]) => ({ value, label }));
