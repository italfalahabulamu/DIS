// ============================================================
// auth.js -- login, logout, session, dan profil role (public.users).
//
// CATATAN: alur SIGNUP (siapa boleh buat akun baru: admin invite?
// token undangan wali per-santri?) BELUM diputuskan -- lihat komentar
// di schema_017_users_auth.sql. Modul ini HANYA menangani login untuk
// akun yang SUDAH ADA di auth.users -- tidak ada form daftar akun
// baru sampai alur itu diputuskan Product Manager/Architect.
// ============================================================
import { getSupabaseClient } from '../supabaseClient.js';

let currentSession = null;
let currentProfile = null; // baris public.users milik user login

export async function login(email, password) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentSession = data.session;
  await loadProfile();
  return currentProfile;
}

export async function logout() {
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
  currentSession = null;
  currentProfile = null;
}

export async function restoreSession() {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  currentSession = data.session;
  if (currentSession) await loadProfile();
  return currentProfile;
}

async function loadProfile() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, email, role, nama_lengkap, wali_id')
    .eq('id', currentSession.user.id)
    .single();
  if (error) {
    // Baris public.users tidak ada padahal auth.users ada -- trigger
    // handle_new_auth_user (schema_017) gagal saat signup, atau akun
    // dibuat manual lewat Dashboard tanpa lewat trigger. Ini kondisi
    // rusak yang harus kelihatan jelas ke user, bukan disembunyikan.
    throw new Error('Profil pengguna tidak ditemukan di public.users. Hubungi admin.');
  }
  currentProfile = data;
}

export function getCurrentProfile() {
  return currentProfile;
}

export function isLoggedIn() {
  return !!currentSession;
}
