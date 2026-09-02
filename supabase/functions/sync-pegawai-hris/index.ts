// ============================================================
// sync-pegawai-hris/index.ts
// Job sinkronisasi HRIS -- Bagian (b) dari 3 bagian yang dibutuhkan
// sinkronisasi nyata (Tahap 18, menyusul schema_014-016).
//
// Deno Edge Function (runtime Supabase) -- DIPANGGIL BERKALA oleh
// Cron Trigger (lihat README.md di folder ini untuk setup, WAJIB
// tim Supabase -- Claude tidak punya akses Dashboard).
//
// ------------------------------------------------------------
// YANG SAYA TIDAK TAHU -- DITANDAI EKSPLISIT, BUKAN DIKARANG:
// ------------------------------------------------------------
// Saya TIDAK punya akses terverifikasi ke skema tabel pegawai yang
// SEBENARNYA di dataku2026 dalam sesi ini (repo berbeda, tidak
// dibuka di sesi ini). Nama tabel/kolom di bawah (SUMBER_TABEL,
// SUMBER_KOLOM_*) adalah TEBAKAN berdasarkan field yang terlihat di
// dashboard_redesign.html proyek dataku2026 sebelumnya ("ID pegawai
// REG-20260824-4DB8ED", "Unit kerja", "Amanah utama" / role, "Tipe
// pegawai") -- BUKAN hasil pengecekan skema database asli. WAJIB
// diverifikasi terhadap repo dataku2026 (public/js/modules/
// supabaseDataService.js atau skema Postgres asli) SEBELUM deploy.
//
// Saya SENGAJA TIDAK memanggil RPC get_team_contacts() atau
// search_employee_contacts() milik dataku2026 -- keduanya sedang
// punya bug produksi aktif per riwayat proyek (42702 ambiguous
// column, menunggu schema_89b/schema_103b). Fungsi ini query
// LANGSUNG ke tabel sumber (asumsi nama "employees", lihat catatan
// di atas) via service_role key (bypass RLS), yang lebih stabil
// selama RPC itu belum diperbaiki -- TAPI ini juga perlu verifikasi
// nama tabel yang benar.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --------------------------------------------------------------
// Konfigurasi -- WAJIB diisi via `supabase secrets set` di project
// DIS (lihat README.md), BUKAN hardcode di kode ini.
// --------------------------------------------------------------
const DIS_SUPABASE_URL = Deno.env.get('SUPABASE_URL')! // otomatis tersedia di runtime Edge Function DIS
const DIS_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // otomatis tersedia

// HARUS diset manual sebagai secret terpisah -- kredensial LINTAS
// PROJECT (project dataku2026, bukan project DIS ini):
const HRIS_SUPABASE_URL = Deno.env.get('HRIS_SUPABASE_URL')!
const HRIS_SERVICE_ROLE_KEY = Deno.env.get('HRIS_SERVICE_ROLE_KEY')!

// TEBAKAN nama tabel + kolom sumber -- VERIFIKASI SEBELUM DEPLOY,
// lihat catatan header file.
const SUMBER_TABEL = 'employees' // TEBAKAN -- cek nama tabel asli di dataku2026
const SUMBER_KOLOM_ID = 'id' // atau 'employee_id' / 'registration_id'? -- VERIFIKASI
const SUMBER_KOLOM_NAMA = 'nama_lengkap' // VERIFIKASI
const SUMBER_KOLOM_UNIT = 'unit_kerja' // VERIFIKASI
const SUMBER_KOLOM_JABATAN = 'jabatan' // VERIFIKASI
const SUMBER_KOLOM_STATUS = 'status_aktif' // VERIFIKASI -- mungkin namanya 'status' dengan nilai teks, bukan boolean

interface PegawaiSumber {
  [key: string]: unknown
}

interface PegawaiReferensi {
  hris_employee_id: string
  nama_lengkap: string
  unit_kerja: string | null
  jabatan: string | null
  status_aktif: boolean
  synced_at: string
}

Deno.serve(async (req: Request) => {
  // --------------------------------------------------------------
  // Autentikasi pemanggil -- Cron Trigger Supabase memanggil dengan
  // header Authorization berisi SERVICE_ROLE_KEY project DIS sendiri
  // (dikonfigurasi saat setup Cron, lihat README.md). Ditolak kalau
  // tidak cocok -- endpoint ini TIDAK untuk dipanggil publik.
  // --------------------------------------------------------------
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${DIS_SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const hasil = { ditarik: 0, diupsert: 0, gagal: 0, error: [] as string[] }

  try {
    // ------------------------------------------------------------
    // 1. Tarik data dari project dataku2026 (LINTAS PROJECT --
    //    lewat REST API PostgREST-nya, bukan koneksi Postgres
    //    langsung, karena dua project terpisah).
    // ------------------------------------------------------------
    const hrisClient = createClient(HRIS_SUPABASE_URL, HRIS_SERVICE_ROLE_KEY)

    const { data: pegawaiSumber, error: fetchError } = await hrisClient
      .from(SUMBER_TABEL)
      .select(`${SUMBER_KOLOM_ID}, ${SUMBER_KOLOM_NAMA}, ${SUMBER_KOLOM_UNIT}, ${SUMBER_KOLOM_JABATAN}, ${SUMBER_KOLOM_STATUS}`)

    if (fetchError) {
      throw new Error(`Gagal tarik data dari HRIS: ${fetchError.message}`)
    }

    hasil.ditarik = pegawaiSumber?.length ?? 0

    // ------------------------------------------------------------
    // 2. Petakan ke bentuk pegawai_hris_referensi (DIS).
    // ------------------------------------------------------------
    const sekarang = new Date().toISOString()
    const baris: PegawaiReferensi[] = (pegawaiSumber ?? []).map((p: PegawaiSumber) => ({
      hris_employee_id: String(p[SUMBER_KOLOM_ID]),
      nama_lengkap: String(p[SUMBER_KOLOM_NAMA] ?? ''),
      unit_kerja: p[SUMBER_KOLOM_UNIT] ? String(p[SUMBER_KOLOM_UNIT]) : null,
      jabatan: p[SUMBER_KOLOM_JABATAN] ? String(p[SUMBER_KOLOM_JABATAN]) : null,
      // TEBAKAN konversi ke boolean -- VERIFIKASI nilai asli kolom
      // status di dataku2026 (mis. teks 'aktif'/'nonaktif' vs boolean).
      status_aktif: p[SUMBER_KOLOM_STATUS] === true || p[SUMBER_KOLOM_STATUS] === 'aktif',
      synced_at: sekarang,
    }))

    // ------------------------------------------------------------
    // 3. Upsert ke pegawai_hris_referensi (project DIS) -- TIDAK
    //    PERNAH DELETE baris lama yang tidak muncul lagi di sumber
    //    (mis. pegawai keluar dari HRIS TAPI query tidak
    //    mengembalikannya lagi) -- itu akan memutus FK dari
    //    pelanggaran lama yang pernah dia laporkan. Baris yang hilang
    //    dari sumber TIDAK diapa-apakan di sini (tetap status_aktif
    //    lama) -- lihat catatan "Belum Diputuskan" di README.md.
    // ------------------------------------------------------------
    if (baris.length > 0) {
      const disClient = createClient(DIS_SUPABASE_URL, DIS_SERVICE_ROLE_KEY)
      const { error: upsertError, count } = await disClient
        .from('pegawai_hris_referensi')
        .upsert(baris, { onConflict: 'hris_employee_id', count: 'exact' })

      if (upsertError) {
        throw new Error(`Gagal upsert ke DIS: ${upsertError.message}`)
      }
      hasil.diupsert = count ?? baris.length
    }

    return new Response(JSON.stringify({ status: 'ok', ...hasil }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    hasil.gagal = 1
    hasil.error.push(err instanceof Error ? err.message : String(err))
    // PENTING: kembalikan status 500 (bukan 200 dengan pesan error
    // di body) supaya Cron Trigger/monitoring bisa mendeteksi
    // kegagalan -- prinsip proyek: jangan ulangi celah "silent
    // failure" (get_team_contacts() gagal 6 hari tanpa terdeteksi).
    return new Response(JSON.stringify({ status: 'error', ...hasil }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
