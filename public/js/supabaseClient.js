// ============================================================
// supabaseClient.js -- singleton client Supabase, dipakai semua modul.
// ============================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js';

let client = null;

export function getSupabaseClient() {
  if (!isConfigured()) {
    throw new Error(
      'Supabase belum dikonfigurasi -- isi SUPABASE_URL dan SUPABASE_ANON_KEY di public/js/config.js (project DIS belum pernah dibuat, lihat komentar di file tsb).'
    );
  }
  if (!client) {
    // Supabase JS v2 diimpor dari CDN (bukan npm bundle) -- konsisten
    // dengan pola vanilla-JS-tanpa-build-step di seluruh repo ini.
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}
