#!/usr/bin/env node
/**
 * scripts/seed-mock-accounts.mjs
 *
 * Membuat akun login mock (satu per role) lewat Supabase Admin API.
 * TIDAK BISA dilakukan lewat SQL biasa -- auth.users butuh password
 * hash & internal Supabase yang cuma valid lewat GoTrue admin API,
 * bukan INSERT langsung.
 *
 * URUTAN WAJIB:
 *   1. Jalankan 24 migrasi (supabase/migrations/)
 *   2. Jalankan supabase/seed.sql (butuh wali_id di bawah SUDAH ADA)
 *   3. Baru jalankan script ini
 *
 * Pakai SERVICE ROLE KEY (bukan anon key) -- key ini bisa bypass RLS
 * sepenuhnya, JANGAN PERNAH taruh di kode client/browser, JANGAN
 * commit ke git. Set lewat environment variable saat run, contoh:
 *
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/seed-mock-accounts.mjs
 *
 * Butuh: npm install @supabase/supabase-js  (sekali saja, tidak perlu
 * ditambahkan ke package.json produksi -- ini tooling dev/testing).
 *
 * Aman dijalankan ulang -- akun yang emailnya sudah ada akan
 * dilewati (dicatat di output), bukan bikin duplikat/error fatal.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'ERROR: set SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY sebagai environment variable dulu.\n' +
    'Ambil dari Dashboard -> Project Settings -> API (service_role, BUKAN anon key).'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Password sengaja seragam & jelas ini akun demo -- GANTI/HAPUS akun
// ini kalau project sudah mau dipakai produksi sungguhan. JANGAN
// pernah pakai pola password ini di akun staf/wali asli.
const DEMO_PASSWORD = 'DemoDIS!2026';

// wali_id di sini HARUS SAMA PERSIS dengan id di supabase/seed.sql
const WALI_DEMO_ID = '00000000-0000-0000-0000-000000000201';
const WALI_LAIN_ID = '00000000-0000-0000-0000-000000000202';

const MOCK_ACCOUNTS = [
  {
    email: 'admin.demo@dis.local',
    role: 'admin',
    nama_lengkap: 'Admin Demo',
  },
  {
    email: 'ustadz.demo@dis.local',
    role: 'ustadz',
    nama_lengkap: 'Ustadz Demo',
  },
  {
    email: 'musyrif.demo@dis.local',
    role: 'musyrif',
    nama_lengkap: 'Musyrif Demo',
  },
  {
    email: 'keuangan.demo@dis.local',
    role: 'keuangan_spp',
    nama_lengkap: 'Staf Keuangan Demo',
  },
  {
    email: 'wali.demo@dis.local',
    role: 'wali',
    nama_lengkap: 'Bapak Ahmad (Wali Demo)',
    wali_id: WALI_DEMO_ID, // anak: Fulan bin Ahmad (santri seed #301)
  },
  {
    // Akun wali KEDUA -- khusus untuk uji negatif "wali A tidak boleh
    // lihat/ubah data anak wali B" (item smoke test 7.6/7.9 dkk).
    email: 'wali.lain.demo@dis.local',
    role: 'wali',
    nama_lengkap: 'Ibu Siti (Wali Lain)',
    wali_id: WALI_LAIN_ID, // anak: Fulanah binti Siti (santri seed #302)
  },
];

async function main() {
  console.log(`Membuat ${MOCK_ACCOUNTS.length} akun mock di ${SUPABASE_URL} ...\n`);

  for (const acc of MOCK_ACCOUNTS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: acc.email,
      password: DEMO_PASSWORD,
      email_confirm: true, // langsung terverifikasi, tidak perlu klik link email
      user_metadata: {
        role: acc.role,
        nama_lengkap: acc.nama_lengkap,
        ...(acc.wali_id ? { wali_id: acc.wali_id } : {}),
      },
    });

    if (error) {
      if (error.message?.toLowerCase().includes('already') || error.status === 422) {
        console.log(`  [lewati] ${acc.email} -- sepertinya sudah ada`);
      } else {
        console.error(`  [GAGAL] ${acc.email}: ${error.message}`);
      }
      continue;
    }

    console.log(`  [ok] ${acc.email}  (role: ${acc.role}, id: ${data.user.id})`);
  }

  console.log(`\nSelesai. Password semua akun demo di atas: ${DEMO_PASSWORD}`);
  console.log('Login lewat form login aplikasi pakai email + password di atas.');
  console.log('Kalau public.users tidak otomatis terisi, cek trigger on_auth_user_created (schema_017) -- kemungkinan raw_user_meta_data tidak terbawa, itu bug, laporkan balik.');
}

main();
