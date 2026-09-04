// ============================================================
// config.js -- konfigurasi koneksi Supabase project DIS
//
// BELUM DIISI SENGAJA: project Supabase untuk DIS belum pernah
// dibuat (beda dari dataku2026 yang sudah punya project
// sjpsexkdllnlxbvnnypk). Sampai project dibuat dan URL + anon key
// asli diisi di bawah, aplikasi ini TIDAK akan bisa konek ke
// database apa pun -- semua modul akan gagal fetch dengan error
// jelas di console, bukan gagal diam-diam.
//
// anon key Supabase MEMANG didesain untuk publik/client-side --
// batas keamanan sungguhan ada di Row Level Security (RLS) tabel,
// bukan kerahasiaan key ini. Aman ditaruh di file yang di-serve
// browser, TIDAK PERLU proses build/injeksi seperti scripts/build.js
// di dataku2026.
//
// Cara isi: Supabase Dashboard project DIS -> Settings -> API ->
// "Project URL" dan "anon public" key.
// ============================================================
export const SUPABASE_URL = 'https://ovekmgylzofdxwptqbla.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_4EEwFNigv7tNlyMqnkAqXw_Xu03x-Cg';

export const isConfigured = () =>
  SUPABASE_URL.startsWith('https://') && !SUPABASE_ANON_KEY.startsWith('ISI_');
