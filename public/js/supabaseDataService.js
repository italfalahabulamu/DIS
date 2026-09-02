/* ============================================================
   supabaseDataService.js
   Implementasi dataService untuk MODE PRODUKSI — hanya dimuat saat
   window.APP_MODE === 'supabase' (lihat public/js/config.js). Berisi
   logika yang sebelumnya langsung ditulis di app.js: dipindah ke sini
   supaya app.js tidak perlu tahu backend-nya Supabase atau mock.
   ============================================================ */

// PERBAIKAN TIMEZONE (menggantikan pola lama `new Date().toISOString()
// .slice(0,10)` yang SELALU mengembalikan tanggal UTC, bukan tanggal
// lokal). Untuk pengguna WIB (UTC+7), antara pukul 00:00-06:59 WIB,
// toISOString() masih mengembalikan tanggal KEMARIN (UTC belum lewat
// tengah malam) -- akibatnya check-in/check-out Subuh tercatat di
// tanggal yang salah. localDateISO() memakai getFullYear/getMonth/
// getDate (komponen tanggal LOKAL browser pengguna), bukan konversi
// UTC, sehingga "hari ini" selalu sesuai kalender lokal pengguna.
// Menerjemahkan error Postgres ke pesan yang aman & bisa dipahami HRD --
// pesan error Postgres mentah (error.message) TIDAK diteruskan langsung
// ke UI karena bisa membocorkan detail skema/internal (nama kolom, nama
// constraint, dll). error.code 23505 = unique_violation (lihat
// https://www.postgresql.org/docs/current/errcodes-appendix.html).
function friendlyDbError(error) {
  if (error?.code === '23505') {
    const detail = String(error.details || error.message || '');
    if (/nik/i.test(detail)) return 'NIK ini sudah dipakai pegawai lain. Periksa kembali data yang dimasukkan.';
    if (/employee_code/i.test(detail)) return 'ID Pegawai ini sudah dipakai. Gunakan ID lain.';
    return 'Data ini bentrok dengan data yang sudah ada (nilai harus unik). Periksa kembali isian Anda.';
  }
  console.error('Database error:', error);
  return 'Terjadi kesalahan saat menyimpan data. Silakan coba lagi atau hubungi Admin/IT jika berulang.';
}

function localDateISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Bandingkan jam check-in (waktu lokal perangkat, konsisten dengan
// localDateISO() di atas) terhadap shift.start_time + late_grace_minutes
// untuk menentukan status 'present' vs 'late'. shift boleh null (institusi
// belum setup shift sama sekali) — fallback ke 'present' seperti perilaku
// lama, supaya tidak ada regresi kalau data shift belum lengkap.
function computeAttendanceStatus(shift, checkInAt = new Date()) {
  if (!shift?.start_time) return 'present';
  const [h, m] = String(shift.start_time).split(':').map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 'present';
  const graceMin = Number.isFinite(shift.late_grace_minutes) ? shift.late_grace_minutes : 15;
  const deadline = new Date(checkInAt);
  deadline.setHours(h, m + graceMin, 0, 0);
  return checkInAt > deadline ? 'late' : 'present';
}

const edgeFunctionUrl = (name) =>
  SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co') + '/' + name;

async function authedFetch(name, body) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return { ok: false, error: 'Sesi berakhir, silakan masuk kembali' };
  const res = await fetch(edgeFunctionUrl(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const result = await res.json();
  if (!res.ok) return { ok: false, error: result.error || res.statusText };
  return { ok: true, ...result };
}

// profiles.role_id adalah FK ke tabel roles (bukan lagi enum text) — app.js
// tetap memakai `profile.role` sebagai string code (mis. 'super_admin') demi
// kompatibilitas, jadi hasil join roles(code) diratakan di sini.
function flattenProfileRole(profile) {
  return { ...profile, role: profile.roles?.code ?? null, role_name: profile.roles?.name ?? null };
}

window.dataService = {
  mode: 'supabase',

  async getSession() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return null;
    const { data: profile, error } = await supabaseClient
      .from('profiles').select('*, roles(code, name)').eq('id', user.id).single();
    if (error || !profile) return null;
    return flattenProfileRole(profile);
  },

  async signIn({ idValue, password, mode }) {
    let email = idValue;
    if (mode === 'username') {
      // auth.users tidak bisa dibaca dari client — lookup lewat Edge Function publik.
      try {
        const res = await fetch(edgeFunctionUrl('login-lookup'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
          body: JSON.stringify({ username: idValue }),
        });
        const result = await res.json();
        if (!res.ok) return { ok: false, error: 'Username atau kata sandi salah' };
        email = result.email;
      } catch (e) {
        return { ok: false, error: 'Gagal menghubungi server autentikasi: ' + e.message };
      }
    }
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };

    const profile = await this.getSession();
    if (!profile) {
      await supabaseClient.auth.signOut();
      return { ok: false, error: 'Akun ditemukan tapi profil belum lengkap — hubungi admin' };
    }
    if (profile.status !== 'active') {
      await supabaseClient.auth.signOut();
      return { ok: false, error: `Akun ${profile.status} — hubungi admin` };
    }
    supabaseClient.from('profiles').update({ last_login_at: new Date().toISOString() }).eq('id', profile.id).then(() => {});
    return { ok: true, profile };
  },

  async signOut() {
    await supabaseClient.auth.signOut();
    return { ok: true };
  },

  // Step-up auth: konfirmasi ulang kata sandi akun yang SEDANG login,
  // untuk aksi berisiko tinggi (hapus periode payroll, dst) — pola SAMA
  // dengan signIn() (signInWithPassword), cuma dipakai untuk verifikasi
  // identitas ulang, bukan login baru. Tidak mengubah sesi yang sudah
  // aktif secara berarti (email yang dipakai = akun yang sama).
  async verifyCurrentPassword(password) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user?.email) return { ok: false, error: 'Sesi tidak valid, silakan login ulang' };
    const { error } = await supabaseClient.auth.signInWithPassword({ email: user.email, password });
    if (error) return { ok: false, error: 'Kata sandi salah' };
    return { ok: true };
  },

  // Hapus periode payroll — WEWENANG Super Admin (RLS payroll_periods_write,
  // schema_03), dengan konfirmasi kata sandi WAJIB di sisi klien sebelum
  // memanggil ini (lihat verifyCurrentPassword). Otoritas SESUNGGUHNYA
  // tetap di database: trigger payroll_periods_protect_delete (schema_32)
  // menolak penghapusan periode berstatus finalized/paid, apa pun yang
  // terjadi di sisi klien.
  async deletePayrollPeriod(periodId) {
    const { error } = await supabaseClient.from('payroll_periods').delete().eq('id', periodId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  // Ubah kata sandi pengguna yang SEDANG login. Tidak perlu password lama
  // sebagai parameter terpisah — Supabase Auth updateUser() memakai sesi
  // JWT yang sudah aktif sebagai bukti identitas, bukan re-autentikasi
  // dengan password lama (sesuai perilaku standar Supabase Auth).
  async changePassword(newPassword) {
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async listDepartments() {
    const { data, error } = await supabaseClient.from('departments').select('*').order('name');
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Daftar Jabatan (positions) — struktur organisasi live, dipakai untuk
  // dropdown "Jabatan" & "Atasan Langsung" (schema_46/47). Diurutkan by
  // name di server, tapi UI (buildPositionOptionsIndented di app.js) yang
  // menata ulang jadi urutan pohon hierarki (parent sebelum anak).
  async listPositions() {
    const { data, error } = await supabaseClient.from('positions').select('*').order('name');
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Shift kerja (schema_67). Otorisasi tulis (insert/update/delete)
  // ditegakkan oleh RLS shifts_insert/update/delete di database — kode
  // di sini cuma memanggil apa adanya, kalau RLS menolak, error dari
  // Supabase yang dikembalikan ke UI (bukan re-implementasi cek role
  // di sisi klien, supaya tidak ada dua sumber kebenaran).
  async listShifts() {
    const { data, error } = await supabaseClient.from('shifts').select('*').order('name');
    if (error) throw new Error(error.message);
    return data || [];
  },

  async createShift(payload) {
    const { data, error } = await supabaseClient
      .from('shifts').insert(payload).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, shift: data };
  },

  async updateShift(id, payload) {
    const { error } = await supabaseClient.from('shifts').update(payload).eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async deleteShift(id) {
    const { error } = await supabaseClient.from('shifts').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  // Resolusi shift efektif seorang pegawai: shift yang ditugaskan
  // langsung, jatuh ke shift is_default=true kalau employees.shift_id
  // kosong. Query tunggal + fallback di JS (bukan RPC) — cukup untuk
  // skala data institusi ini, konsisten dengan pola sederhana lain di
  // file ini (mis. listPositions).
  async resolveShiftForEmployee(employeeId) {
    const { data: emp, error: empErr } = await supabaseClient
      .from('employees').select('shift_id').eq('id', employeeId).maybeSingle();
    if (empErr) throw new Error(empErr.message);
    if (emp?.shift_id) {
      const { data: assigned } = await supabaseClient
        .from('shifts').select('*').eq('id', emp.shift_id).maybeSingle();
      if (assigned) return assigned;
    }
    const { data: def, error: defErr } = await supabaseClient
      .from('shifts').select('*').eq('is_default', true).maybeSingle();
    if (defErr) throw new Error(defErr.message);
    return def || null;
  },

  async listAuditLogs() {
    const { data, error } = await supabaseClient
      .from('audit_logs').select('*, profiles(full_name, username)')
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return data || [];
  },

  async listEmployees() {
    // Pegawai hasil pendaftaran mandiri yang akun login-nya masih
    // "Menunggu" persetujuan (Manajemen Akses Pengguna) SENGAJA belum
    // ditampilkan di Menu Pegawai sama sekali — supaya HRD tidak
    // melihat status "Aktif"/"Non-Aktif" untuk data yang belum
    // diverifikasi/disetujui. Begitu disetujui, trigger DB (schema_74)
    // otomatis mengubah employment_status jadi 'active' dan baris ini
    // otomatis muncul di sini tanpa tindakan tambahan .
    // Query profiles ini boleh mengembalikan kosong untuk role selain
    // super_admin/hrd/pimpinan (dibatasi RLS profiles_select) — aman,
    // efeknya cuma tidak ada yang disaring untuk role tsb.
    const { data: pendingProfiles } = await supabaseClient
      .from('profiles')
      .select('employee_id')
      .eq('status', 'pending')
      .eq('registration_source', 'self')
      .not('employee_id', 'is', null);
    const excludeIds = (pendingProfiles || []).map(p => p.employee_id);

    let query = supabaseClient.from('employees').select('*').order('created_at', { ascending: false });
    if (excludeIds.length > 0) {
      query = query.not('id', 'in', `(${excludeIds.join(',')})`);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  },

  async getEmployee(id) {
    const { data } = await supabaseClient.from('employees').select('*').eq('id', id).single();
    return data || null;
  },

  async createEmployee(payload) {
    const { error } = await supabaseClient.from('employees').insert(payload);
    return error ? { ok: false, error: friendlyDbError(error) } : { ok: true };
  },

  // PERBAIKAN BUG (2026-09-01, dari laporan pengguna: "data pegawai sudah
  // diupdate tapi dashboard masih -"): SEBELUMNYA cuma cek `error` dari
  // PostgREST -- TAPI kalau RLS employees_update menolak baris (mis. editor
  // BUKAN super_admin/hrd/pimpinan/kepala_bagian departemen terkait/pemilik
  // baris), PostgREST TIDAK mengembalikan error sama sekali, cuma meng-UPDATE
  // 0 baris dengan diam-diam -- kode lama membaca ini sebagai { ok: true }
  // dan toast "Perubahan berhasil disimpan" MUNCUL padahal tidak ada yang
  // tersimpan. Pola sama seperti approveUser()/rejectUser() di atas: tambah
  // .select('id') supaya bisa membedakan "0 baris ter-update" dari "1 baris
  // ter-update", baru func ini bisa jujur soal RLS block vs sukses beneran.
  async updateEmployee(id, payload) {
    const { data, error } = await supabaseClient.from('employees').update(payload).eq('id', id).select('id');
    if (error) return { ok: false, error: friendlyDbError(error) };
    if (!data || !data.length) return { ok: false, error: 'Tidak ada perubahan tersimpan -- kemungkinan Anda tidak berwenang mengubah data pegawai ini (RLS menolak baris ini secara diam-diam)' };
    return { ok: true };
  },

  // Dipakai modal "Akun Login" di halaman Detail Pegawai. Supabase TIDAK
  // PERNAH menyimpan password dalam bentuk yang bisa dibaca ulang (hash
  // satu-arah di auth.users, bukan kolom biasa) — jadi secara teknis pun
  // tidak ada apa pun untuk "ditampilkan" di sini walau mau.
  async getAccountByEmployee(employeeId) {
    const { data, error } = await supabaseClient
      .from('profiles').select('id, username, email, status').eq('employee_id', employeeId).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async listProfiles() {
    const { data, error } = await supabaseClient
      .from('profiles').select('*, roles(code, name)').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(flattenProfileRole);
  },

  // Satu-satunya pemanggilan Edge Function di file ini yang TIDAK lewat
  // authedFetch — pendaftar belum punya sesi sama sekali (itu justru
  // tujuannya). register-employee di-deploy dengan --no-verify-jwt (lihat
  // DEPLOYMENT.md), jadi cukup 'apikey' anon, tanpa Authorization Bearer
  // sesi user.
  async registerEmployee(payload) {
    try {
      const res = await fetch(edgeFunctionUrl('register-employee'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) return { ok: false, error: result.error || res.statusText };
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: 'Gagal menghubungi server pendaftaran: ' + e.message };
    }
  },

  async createUser({ email, username, full_name, role, department_id, employee_id }) {
    return authedFetch('create-user', { email, username, full_name, role, department_id, employee_id });
  },

  // Perbaikan retroaktif untuk akun yang terlanjur dibuat TANPA employee_id
  // (mis. lewat create-user sebelum field ini ada, atau data lama). Pola
  // sama seperti updateUserRole di atas: update langsung dari klien,
  // otoritasnya ditegakkan oleh trigger protect_role_status (schema_23)
  // yang membatasi kolom employee_id HANYA boleh diubah super_admin —
  // bukan Edge Function karena ini bukan operasi auth.users.
  async linkEmployeeToProfile(profileId, employeeId) {
    const { data, error } = await supabaseClient
      .from('profiles')
      .update({ employee_id: employeeId })
      .eq('id', profileId)
      .select('id');
    if (error) return { ok: false, error: error.message };
    if (!data || !data.length) return { ok: false, error: 'Pengguna tidak ditemukan, atau Anda tidak berwenang mengubahnya (hanya Super Admin)' };
    return { ok: true };
  },

  // RLS profiles_update_admin + trigger protect_role_status (schema.sql)
  // yang menegakkan otoritas (hanya super_admin) — sama pola dengan
  // approveUser/rejectUser di atas: update kolom langsung, bukan Edge
  // Function, karena ini bukan operasi auth.users yang butuh service_role.
  async updateUserRole(profileId, role, department_id) {
    const { data: roleRow, error: roleError } = await supabaseClient
      .from('roles').select('id').eq('code', role).single();
    if (roleError || !roleRow) return { ok: false, error: `Role "${role}" tidak ditemukan di database: ` + (roleError?.message || '') };

    const { data, error } = await supabaseClient
      .from('profiles')
      .update({ role_id: roleRow.id, department_id: role === 'kepala_bagian' ? department_id : null })
      .eq('id', profileId)
      .select('id');
    if (error) return { ok: false, error: error.message };
    if (!data || !data.length) return { ok: false, error: 'Pengguna tidak ditemukan, atau Anda tidak berwenang mengubahnya (lihat RLS profiles_update_admin)' };
    return { ok: true };
  },

  async resetPassword(profileId) {
    return authedFetch('reset-password', { targetProfileId: profileId });
  },

  // RLS profiles_update_admin + trigger protect_role_status (schema.sql,
  // DIPERLUAS schema_23): sejak schema_23, super_admin/hrd/pimpinan
  // SEMUA lolos RLS ini — kode di sini TIDAK berubah, otoritasnya murni
  // ditentukan di database. Trigger tetap membatasi HRD/pimpinan hanya
  // boleh dari status 'pending' (lihat schema_23), super_admin bebas.
  async approveUser(profileId) {
    const { data, error } = await supabaseClient.from('profiles').update({ status: 'active' }).eq('id', profileId).eq('status', 'pending').select('id');
    if (error) return { ok: false, error: error.message };
    if (!data || !data.length) return { ok: false, error: 'Akun ini sudah diproses (bukan lagi berstatus Menunggu) — mungkin sudah ditangani admin lain' };
    return { ok: true };
  },
  async rejectUser(profileId) {
    const { data, error } = await supabaseClient.from('profiles').update({ status: 'inactive' }).eq('id', profileId).eq('status', 'pending').select('id');
    if (error) return { ok: false, error: error.message };
    if (!data || !data.length) return { ok: false, error: 'Akun ini sudah diproses (bukan lagi berstatus Menunggu) — mungkin sudah ditangani admin lain' };
    return { ok: true };
  },
  // Menonaktifkan/mengaktifkan kembali akun yang SUDAH aktif — beda dari
  // rejectUser (itu untuk menolak pendaftaran yang masih 'pending').
  // Pola sama (eq status lama sebagai guard concurrent-edit), scope
  // beda: profiles_update_admin (schema.sql) sudah membatasi ke
  // is_super_admin() saja lewat RLS — cocok dengan ADMIN_ROLES di UI.
  async deactivateUser(profileId) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user?.id === profileId) return { ok: false, error: 'Anda tidak dapat menonaktifkan akun Anda sendiri' };
    const { data, error } = await supabaseClient.from('profiles').update({ status: 'inactive' }).eq('id', profileId).eq('status', 'active').select('id');
    if (error) return { ok: false, error: error.message };
    if (!data || !data.length) return { ok: false, error: 'Akun ini bukan lagi berstatus Aktif — mungkin sudah diubah admin lain' };
    return { ok: true };
  },
  async reactivateUser(profileId) {
    const { data, error } = await supabaseClient.from('profiles').update({ status: 'active' }).eq('id', profileId).eq('status', 'inactive').select('id');
    if (error) return { ok: false, error: error.message };
    if (!data || !data.length) return { ok: false, error: 'Akun ini bukan lagi berstatus Nonaktif — mungkin sudah diubah admin lain' };
    return { ok: true };
  },

  // "Hapus Akun" (schema_105) -- BEDA dari deactivateUser: ini menandai
  // akun masuk masa trash 90 hari (deleted_at diisi), BUKAN nonaktif
  // biasa yang bisa diaktifkan lagi kapan saja tanpa batas waktu.
  // status DIPAKSA 'inactive' bersamaan (blokir login lewat mekanisme
  // yang SUDAH teruji, bukan jalur baru) -- lihat trigger
  // protect_role_status (schema_105) yang membatasi dua kolom ini
  // HANYA bisa diubah super_admin, terlepas dari status akun saat ini
  // (aktif MAUPUN nonaktif biasa sama-sama bisa dihapus).
  async deleteUser(profileId) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user?.id === profileId) return { ok: false, error: 'Anda tidak dapat menghapus akun Anda sendiri' };
    const { data, error } = await supabaseClient
      .from('profiles')
      .update({ status: 'inactive', deleted_at: new Date().toISOString(), deleted_by_profile_id: user?.id ?? null })
      .eq('id', profileId)
      .is('deleted_at', null) // guard: cegah menimpa deleted_at yang sudah ada (mis. dobel klik)
      .select('id');
    if (error) return { ok: false, error: error.message };
    if (!data || !data.length) return { ok: false, error: 'Akun ini sudah dihapus sebelumnya — mungkin sudah ditangani admin lain' };
    return { ok: true };
  },
  // Batalkan penghapusan SEBELUM 90 hari habis -- HANYA mencabut status
  // trash (deleted_at -> null), status TETAP 'inactive' (SENGAJA tidak
  // otomatis dikembalikan ke 'active'). Alasan: memulihkan dari trash
  // dan memberi kembali akses login adalah 2 keputusan terpisah --
  // Super Admin tetap harus menekan "Aktifkan Kembali" (reactivateUser,
  // sudah ada) sebagai langkah kedua yang disengaja, bukan efek samping
  // otomatis dari "Pulihkan". Mencegah akun tiba-tiba bisa login lagi
  // tanpa keputusan sadar terpisah.
  async restoreUser(profileId) {
    const { data, error } = await supabaseClient
      .from('profiles')
      .update({ deleted_at: null, deleted_by_profile_id: null })
      .eq('id', profileId)
      .not('deleted_at', 'is', null) // guard: cuma berlaku utk akun yg memang sedang di trash
      .select('id');
    if (error) return { ok: false, error: error.message };
    if (!data || !data.length) return { ok: false, error: 'Akun ini tidak sedang dalam masa trash — mungkin sudah dipulihkan admin lain' };
    return { ok: true };
  },

  async listDocuments(employeeId) {
    // RLS employee_documents_select (schema_02) yang menegakkan otoritas
    // sesungguhnya — query ini cuma balik array kosong buat yang tidak
    // berhak, bukan error, karena RLS select memfilter baris, bukan
    // menolak query.
    const { data, error } = await supabaseClient
      .from('employee_documents')
      .select('*')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async uploadDocument({ employeeId, documentType, file }) {
    if (!file) return { ok: false, error: 'Pilih file terlebih dahulu' };

    // KONVENSI PATH WAJIB '{employee_id}/...' — lihat schema_06_documents_
    // storage.sql, RLS Storage mengekstrak employee_id dari folder pertama
    // path ini untuk dicocokkan lewat is_owner(). Kalau konvensi ini
    // dilanggar, upload akan SELALU ditolak RLS Storage meski usernya
    // berhak menurut RLS tabel employee_documents.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${employeeId}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadErr } = await supabaseClient.storage
      .from('employee-documents')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (uploadErr) return { ok: false, error: `Gagal unggah file: ${uploadErr.message}` };

    const { data: inserted, error: insertErr } = await supabaseClient
      .from('employee_documents')
      .insert({ employee_id: employeeId, document_type: documentType, file_url: path, file_name: file.name })
      .select()
      .single();
    if (insertErr) {
      // File sudah terlanjur ter-upload tapi baris metadata gagal — bersihkan
      // supaya tidak jadi file yatim di Storage yang tidak tercatat di mana
      // pun (tidak bisa ditemukan lewat listDocuments karena bergantung
      // baris tabel, bukan listing Storage langsung).
      await supabaseClient.storage.from('employee-documents').remove([path]);
      return { ok: false, error: `Gagal menyimpan metadata dokumen: ${insertErr.message}. File yang sempat terunggah sudah dibatalkan.` };
    }
    return { ok: true, document: inserted };
  },

  async deleteDocument(documentId) {
    const { data: doc, error: fetchErr } = await supabaseClient
      .from('employee_documents').select('file_url').eq('id', documentId).single();
    if (fetchErr) return { ok: false, error: fetchErr.message };

    const { error: storageErr } = await supabaseClient.storage.from('employee-documents').remove([doc.file_url]);
    if (storageErr) return { ok: false, error: `Gagal menghapus file: ${storageErr.message}` };

    const { error: deleteErr } = await supabaseClient.from('employee_documents').delete().eq('id', documentId);
    if (deleteErr) return { ok: false, error: `File terhapus tapi metadata gagal dihapus: ${deleteErr.message}` };
    return { ok: true };
  },

  // Signed URL berlaku 60 detik — dokumen di bucket PRIVAT (schema_06),
  // tidak bisa diakses lewat URL biasa tanpa ini. Dipanggil saat user
  // klik "Lihat/Unduh", bukan disimpan/di-cache di frontend.
  async getDocumentSignedUrl(filePath) {
    const { data, error } = await supabaseClient.storage
      .from('employee-documents').createSignedUrl(filePath, 60);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },

  async listLeaveTypes() {
    const { data, error } = await supabaseClient.from('leave_types').select('*').order('name');
    if (error) throw new Error(error.message);
    return data || [];
  },

  async listLeaveRequests(employeeId) {
    const { data, error } = await supabaseClient
      .from('employee_leave_requests')
      .select('*, leave_types(name, code)')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async getLeaveBalance(employeeId) {
    const year = new Date().getFullYear();
    const { data, error } = await supabaseClient
      .from('employee_leave_balance')
      .select('*, leave_types(name, code)')
      .eq('employee_id', employeeId)
      .eq('year', year);
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Status awal 'pending_kabag' TIDAK dikirim eksplisit — kolom status
  // punya default 'pending_kabag' (schema_07) dan trigger
  // leave_requests_enforce_pending_on_self menolak kalau pemilik non-admin
  // mencoba kirim status lain, jadi lebih aman biarkan default DB yang
  // menentukan daripada duplikasi aturan di frontend.
  async createLeaveRequest({ employeeId, leaveTypeId, startDate, endDate, daysCount, reason }) {
    const { error } = await supabaseClient.from('employee_leave_requests').insert({
      employee_id: employeeId, leave_type_id: leaveTypeId, start_date: startDate, end_date: endDate,
      days_count: daysCount, reason: reason || null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async listPendingLeaveApprovals() {
    const { data, error } = await supabaseClient
      .from('employee_leave_requests')
      .select('*, employees(full_name), leave_types(name, code)')
      .in('status', ['pending_kabag', 'pending_pimpinan'])
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Riwayat cuti yang sudah disetujui — dibatasi 50 terbaru supaya kartu
  // tidak memuat seluruh riwayat sekaligus. Cakupan baris tetap ditentukan
  // RLS employee_leave_requests_select (super_admin/hrd/pimpinan lihat
  // semua, kepala_bagian lihat departemennya, selain itu cuma milik sendiri).
  async listApprovedLeaveRequests() {
    const { data, error } = await supabaseClient
      .from('employee_leave_requests')
      .select('*, employees(full_name), leave_types(name, code)')
      .eq('status', 'approved')
      .order('decided_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Laporan lengkap pengajuan cuti (untuk export .xlsx) — SEMUA status,
  // tanpa limit 50 seperti listApprovedLeaveRequests. Cakupan baris tetap
  // ditentukan RLS employee_leave_requests_select (super_admin/hrd/pimpinan
  // lihat semua, kepala_bagian lihat departemennya, selain itu cuma milik
  // sendiri) — tidak ada filter tambahan di sini supaya tidak diam-diam
  // menyembunyikan baris yang sebenarnya boleh dilihat role tsb.
  async listAllLeaveRequestsForReport() {
    const { data, error } = await supabaseClient
      .from('employee_leave_requests')
      .select('*, employees(full_name, department_id, departments(name)), leave_types(name, code)')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  // ---- Kegiatan Lembaga (institutional_events, schema_70) ----
  // SELECT: semua pengguna login. WRITE: dibatasi RLS ke
  // super_admin/hrd/pimpinan -- kalau role lain memanggil insert/update/
  // delete, Supabase yang menolak (RLS), bukan validasi di sini; UI juga
  // menyembunyikan tombolnya untuk role selain itu (defense in depth).
  async listInstitutionalEvents() {
    const { data, error } = await supabaseClient
      .from('institutional_events')
      .select('*, departments(name)')
      .order('start_date', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async createInstitutionalEvent(payload) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { data, error } = await supabaseClient
      .from('institutional_events')
      .insert({
        title: payload.title,
        description: payload.description || null,
        category: payload.category,
        start_date: payload.start_date,
        end_date: payload.end_date,
        department_id: payload.department_id || null,
        created_by_profile_id: user?.id,
      })
      .select('*, departments(name)')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async updateInstitutionalEvent(id, payload) {
    const { data, error } = await supabaseClient
      .from('institutional_events')
      .update({
        title: payload.title,
        description: payload.description || null,
        category: payload.category,
        start_date: payload.start_date,
        end_date: payload.end_date,
        department_id: payload.department_id || null,
      })
      .eq('id', id)
      .select('*, departments(name)')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async deleteInstitutionalEvent(id) {
    const { error } = await supabaseClient.from('institutional_events').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return true;
  },

  // Kolom notes yang benar tergantung status TUJUAN, bukan siapa yang
  // memanggil — trigger leave_requests_protect_fields (schema_07) yang
  // menentukan kolom decided_by/decided_at mana yang otomatis terisi;
  // kolom teks bebas ini tetap harus ditulis eksplisit dari sini.
  async updateLeaveRequestStatus(id, status, notes) {
    const patch = { status };
    if (status === 'pending_pimpinan') patch.kabag_notes = notes;
    else if (status === 'approved' || status === 'rejected') patch.decision_notes = notes;
    const { error } = await supabaseClient.from('employee_leave_requests').update(patch).eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async getTodayAttendance(employeeId) {
    const today = localDateISO();
    const { data, error } = await supabaseClient
      .from('employee_attendance').select('*')
      .eq('employee_id', employeeId).eq('attendance_date', today)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  // RLS employee_attendance_insert (schema_03) hanya mengizinkan
  // attendance_date = current_date untuk pemilik sendiri — TIDAK dikirim
  // eksplisit dari sini, dibiarkan default DB (kolom created_at aja yang
  // default; attendance_date memang wajib dikirim tapi HARUS hari ini,
  // dihitung di sisi klien lewat todayISO() supaya jam lokal user yang
  // dipakai, bukan UTC server).
  // location OPSIONAL ({latitude, longitude, accuracy} atau null/undefined
  // — lihat schema_26): geolokasi browser bisa ditolak pengguna, itu TIDAK
  // BOLEH memblokir absensi, jadi field ini boleh kosong sama sekali.
  async checkIn(employeeId, location) {
    const today = localDateISO();
    const now = new Date();
    // schema_69 (Manajemen Shift): status 'late' dihitung dari shift efektif
    // pegawai (assigned atau default) + toleransi late_grace_minutes-nya.
    // Kalau resolveShiftForEmployee gagal (mis. belum ada shift sama sekali
    // di institusi), JANGAN blokir absensi — fallback ke 'present' seperti
    // perilaku lama.
    let status = 'present';
    try {
      const shift = await this.resolveShiftForEmployee(employeeId);
      status = computeAttendanceStatus(shift, now);
    } catch (shiftErr) {
      console.error('[supabaseDataService] Gagal resolve shift untuk status kehadiran, pakai default present:', shiftErr);
    }
    const { error } = await supabaseClient.from('employee_attendance').insert({
      employee_id: employeeId, attendance_date: today, check_in: now.toISOString(), status,
      check_in_latitude: location?.latitude ?? null,
      check_in_longitude: location?.longitude ?? null,
      check_in_accuracy_m: location?.accuracy ?? null,
    });
    if (error) {
      // Sinyal pesantren sering putus-nyambung — kalau ini gagal karena
      // JARINGAN (bukan error bisnis seperti RLS/constraint), simpan dulu
      // di antrian lokal alih-alih membuat pegawai kehilangan absennya
      // atau harus coba berkali-kali. Lihat public/js/attendanceSyncQueue.js.
      const syncErr = window.AttendanceSyncQueue?.classifySyncError(error);
      if (syncErr?.retryable && window.AttendanceSyncQueue) {
        try {
          window.AttendanceSyncQueue.absensiSyncQueue.enqueue({
            kind: 'CHECK_IN', payload: { employeeId, location }, occurredAt: Date.now(),
          });
          return { ok: true, queued: true };
        } catch (enqueueErr) {
          // Antrian penuh — jangan pura-pura berhasil, kembalikan error asli.
          console.error('[supabaseDataService] Gagal enqueue check-in:', enqueueErr);
        }
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  },

  async checkOut(employeeId, location) {
    const today = localDateISO();
    const { error } = await supabaseClient.from('employee_attendance')
      .update({
        check_out: new Date().toISOString(),
        check_out_latitude: location?.latitude ?? null,
        check_out_longitude: location?.longitude ?? null,
        check_out_accuracy_m: location?.accuracy ?? null,
      })
      .eq('employee_id', employeeId).eq('attendance_date', today);
    if (error) {
      const syncErr = window.AttendanceSyncQueue?.classifySyncError(error);
      if (syncErr?.retryable && window.AttendanceSyncQueue) {
        try {
          window.AttendanceSyncQueue.absensiSyncQueue.enqueue({
            kind: 'CHECK_OUT', payload: { employeeId, location }, occurredAt: Date.now(),
          });
          return { ok: true, queued: true };
        } catch (enqueueErr) {
          console.error('[supabaseDataService] Gagal enqueue check-out:', enqueueErr);
        }
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  },

  // Dipanggil saat browser mendeteksi koneksi kembali ('online' event,
  // didaftarkan lewat AttendanceSyncQueue.setDrainHandler di bawah) DAN
  // saat layar absensi dibuka/refresh (lihat app.js renderTodayAttendance).
  // Memanggil ULANG this.checkIn/this.checkOut yang sama (bukan insert
  // manual) supaya kalau masih offline, entri otomatis di-requeue lagi
  // lewat jalur error-handling yang sama, alih-alih duplikasi logic.
  async drainAttendanceQueue() {
    if (!window.AttendanceSyncQueue) return;
    const queue = window.AttendanceSyncQueue.absensiSyncQueue;
    const MAX_PER_TICK = 10;
    let drained = 0;

    while (drained < MAX_PER_TICK) {
      const entry = queue.pickNext();
      if (!entry) break;

      try {
        const fn = entry.kind === 'CHECK_OUT' ? this.checkOut : this.checkIn;
        const result = await fn.call(this, entry.payload.employeeId, entry.payload.location);
        if (result.queued) {
          // Masih gagal karena jaringan -> checkIn/checkOut di atas SUDAH
          // enqueue entri baru sendiri. Batalkan entri lama di sini biar
          // tidak dobel, lalu hentikan tick ini (masih offline, tidak ada
          // gunanya lanjut mencoba entri berikutnya).
          queue.markSuccess(entry.id);
          break;
        }
        if (!result.ok) {
          // Error bisnis (mis. sudah check-in hari ini dari device lain,
          // atau RLS menolak) -> dead-letter, jangan diulang otomatis.
          queue.markFailure(entry.id, { status: null, code: 'BUSINESS', message: result.error, retryable: false });
          continue;
        }
        queue.markSuccess(entry.id);
        drained++;
      } catch (e) {
        queue.markFailure(entry.id, window.AttendanceSyncQueue.classifySyncError(e));
        break;
      }
    }
  },

  async listMyAttendance(employeeId, limit = 14) {
    const { data, error } = await supabaseClient
      .from('employee_attendance').select('*')
      .eq('employee_id', employeeId)
      .order('attendance_date', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return data || [];
  },

  async listTeamAttendance(date) {
    const { data, error } = await supabaseClient
      .from('employee_attendance').select('*, employees(full_name)')
      .eq('attendance_date', date)
      .order('check_in', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },

  // upsert (bukan insert/update terpisah) — koreksi manual bisa untuk
  // tanggal yang SUDAH ada baris (mis. pegawai lupa check-out, HRD isi
  // manual) maupun yang BELUM ada baris sama sekali (retroaktif).
  // onConflict cocok dengan UNIQUE (employee_id, attendance_date) di
  // schema_03.
  async upsertAttendanceCorrection({ employeeId, date, status, notes }) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { error } = await supabaseClient.from('employee_attendance').upsert({
      employee_id: employeeId, attendance_date: date, status, notes,
      corrected_by_profile_id: user?.id ?? null,
    }, { onConflict: 'employee_id,attendance_date' });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async listPerformanceCriteria() {
    const { data, error } = await supabaseClient.from('performance_criteria').select('*').eq('is_active', true).order('name');
    if (error) throw new Error(error.message);
    return data || [];
  },

  async listPerformancePeriods() {
    const { data, error } = await supabaseClient.from('performance_review_periods').select('*').order('code', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async createPerformancePeriod({ code, name, startDate, endDate }) {
    const { error } = await supabaseClient.from('performance_review_periods').insert({
      code, name, start_date: startDate, end_date: endDate,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async listPerformanceReviews({ employeeId, periodId } = {}) {
    let q = supabaseClient.from('performance_reviews')
      .select('*, employees(full_name), performance_review_periods(name, code)')
      .order('created_at', { ascending: false });
    if (employeeId) q = q.eq('employee_id', employeeId);
    if (periodId) q = q.eq('period_id', periodId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Untuk Laporan (Rekap Kinerja) — ambil "Pekerjaan Belum Selesai"
  // (schema_46) sekaligus untuk banyak review dalam satu query (hindari
  // N+1 per baris tabel laporan). RLS perf_pending_tasks_select
  // mengikuti hak lihat baris review induk, jadi review_ids yang
  // dikirim ke sini SUDAH lolos filter listPerformanceReviews() di atas
  // — tidak perlu cek otorisasi tambahan di sini.
  async listPendingTasksForReviews(reviewIds) {
    if (!reviewIds || !reviewIds.length) return [];
    const { data, error } = await supabaseClient
      .from('performance_review_pending_tasks')
      .select('review_id, task_name, new_deadline')
      .in('review_id', reviewIds);
    if (error) throw new Error(error.message);
    return data || [];
  },

  // RLS performance_review_scores_select (schema_08) yang menegakkan
  // aturan visibilitas skor sebelum finalized — query ini cuma balik
  // baris yang lolos, bukan error, untuk yang tidak berhak lihat semua.
  async getPerformanceReview(reviewId) {
    const { data: review, error: reviewErr } = await supabaseClient
      .from('performance_reviews')
      .select('*, employees(full_name), performance_review_periods(name, code)')
      .eq('id', reviewId).single();
    if (reviewErr) throw new Error(reviewErr.message);

    const { data: scores, error: scoresErr } = await supabaseClient
      .from('performance_review_scores')
      .select('*, performance_criteria(code, name, description)')
      .eq('review_id', reviewId);
    if (scoresErr) throw new Error(scoresErr.message);

    // schema_46 — Capaian & Output / Pekerjaan Belum Selesai, RLS
    // perf_pending_tasks_select mengikuti hak lihat baris review induk
    // (tidak dibatasi bertahap seperti skor evaluator).
    const { data: pendingTasks, error: tasksErr } = await supabaseClient
      .from('performance_review_pending_tasks')
      .select('*')
      .eq('review_id', reviewId)
      .order('created_at', { ascending: true });
    if (tasksErr) throw new Error(tasksErr.message);

    // schema_77 — Pekerjaan Selesai (Bobot), hak lihat SAMA dengan hak
    // lihat baris review induk (perf_completed_tasks_select), bukan
    // dibatasi bertahap seperti skor evaluator.
    const { data: completedTasks, error: completedErr } = await supabaseClient
      .from('performance_review_completed_tasks')
      .select('*, task_weight_categories(name, base_weight, department_id)')
      .eq('review_id', reviewId)
      .order('created_at', { ascending: true });
    if (completedErr) throw new Error(completedErr.message);

    return { ...review, scores: scores || [], pending_tasks: pendingTasks || [], completed_tasks: completedTasks || [] };
  },

  async createPerformanceReview({ employeeId, periodId }) {
    const { error } = await supabaseClient.from('performance_reviews').insert({
      employee_id: employeeId, period_id: periodId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  // Dua langkah TERPISAH secara sengaja, urutan PENTING: (1) upsert skor
  // SELAGI status review masih di tahap yang mengizinkan INSERT skor
  // (RLS performance_review_scores_write mensyaratkan status tertentu per
  // evaluator_role — lihat schema_08), BARU (2) update status review.
  // Kalau urutan dibalik, RLS langkah (1) akan menolak karena status
  // sudah berubah duluan.
  async submitPerformanceStage({ reviewId, evaluatorRole, scores, notes }) {
    if (scores && scores.length) {
      const rows = scores.map(s => ({
        review_id: reviewId, criterion_id: s.criterionId, evaluator_role: evaluatorRole,
        score: s.score, comment: s.comment || null,
      }));
      const { error: scoreErr } = await supabaseClient
        .from('performance_review_scores')
        .upsert(rows, { onConflict: 'review_id,criterion_id,evaluator_role' });
      if (scoreErr) return { ok: false, error: `Gagal menyimpan skor: ${scoreErr.message}` };
    }

    const nextStatus = { self: 'self_done', atasan: 'atasan_done', hrd: 'finalized' }[evaluatorRole];
    if (!nextStatus) return { ok: false, error: 'evaluatorRole tidak dikenal' };
    const patch = { status: nextStatus };
    if (evaluatorRole === 'hrd') patch.hrd_summary_notes = notes || null;

    const { error: statusErr } = await supabaseClient.from('performance_reviews').update(patch).eq('id', reviewId);
    if (statusErr) return { ok: false, error: `Skor tersimpan, tapi gagal memajukan tahap review: ${statusErr.message}` };
    return { ok: true };
  },

  // schema_46 — Capaian & Output, Tingkat Keberhasilan, Pekerjaan Belum
  // Selesai. RLS perf_pending_tasks_write & performance_reviews_update
  // menegakkan siapa boleh menulis (owner selama draft, admin selalu).
  // Pola "hapus semua baris lama lalu insert ulang" untuk pending tasks —
  // sederhana & cukup untuk volume kecil, RLS DELETE/INSERT tetap
  // ditegakkan per operasi oleh Postgres.
  async savePerformanceMonthlySummary({ reviewId, achievementOutput, successLevel, pendingTasks }) {
    if (achievementOutput != null || successLevel !== undefined) {
      const patch = {};
      if (achievementOutput != null) patch.achievement_output = achievementOutput.trim();
      if (successLevel !== undefined) patch.success_level = successLevel;
      const { error } = await supabaseClient.from('performance_reviews').update(patch).eq('id', reviewId);
      // Pesan ditaruh mentah (bukan diberi prefix "Gagal menyimpan..."
      // di sini) -- app.js sudah menambahkan prefix itu sendiri saat
      // menampilkan toast (lihat submitPerfScores). Prefix ganda
      // sebelumnya membuat pesan error tampil dobel ke pengguna, mis.
      // "Gagal menyimpan Capaian & Output: Gagal menyimpan Capaian &
      // Output: <pesan asli>". Konsisten dengan mockDataService.js yang
      // dari awal sudah mengembalikan pesan mentah tanpa prefix.
      if (error) return { ok: false, error: error.message };
    }

    const { error: delErr } = await supabaseClient
      .from('performance_review_pending_tasks').delete().eq('review_id', reviewId);
    // Prefix "Gagal menyimpan..." dihapus dari sini juga (konsisten
    // dengan perbaikan di atas) -- app.js sudah menambahkannya sendiri.
    if (delErr) return { ok: false, error: `Pekerjaan Belum Selesai: ${delErr.message}` };

    if (pendingTasks && pendingTasks.length) {
      const rows = pendingTasks.map(t => ({
        review_id: reviewId, task_name: t.taskName, initial_target: t.initialTarget,
        progress: Number(t.progress), obstacle: t.obstacle,
        follow_up_plan: t.followUpPlan, new_deadline: t.newDeadline,
        // schema_61 — hanya relevan (dan hanya lolos CHECK constraint DB)
        // kalau Deadline Baru < Target Awal; null untuk kasus normal.
        deadline_change_reason: t.newDeadline < t.initialTarget ? (t.deadlineChangeReason || '').trim() : null,
        // Status "Pekerjaan Belum Selesai" (bagian 11 prompt asli) --
        // kolom sudah ada sejak schema_46 dengan default DB 'berjalan'.
        // Kirim eksplisit dari klien supaya perubahan status pengguna
        // tidak hilang saat pola delete-lalu-insert-ulang di atas berjalan.
        status: t.status || 'berjalan',
      }));
      const { error: insErr } = await supabaseClient.from('performance_review_pending_tasks').insert(rows);
      if (insErr) return { ok: false, error: `Pekerjaan Belum Selesai: ${insErr.message}` };
    }
    return { ok: true };
  },

  async listPerformancePendingTasks(reviewId) {
    const { data, error } = await supabaseClient
      .from('performance_review_pending_tasks').select('*').eq('review_id', reviewId).order('created_at');
    if (error) throw new Error(error.message);
    return data || [];
  },

  /* ============================================================
     Indeks Beban vs Kompensasi (schema_77) — kategori bobot tugas
     (Lapis 1), pekerjaan selesai + penyesuaian atasan (Lapis 2/3),
     dan view agregasi v_workload_pay_ratio*. RLS/trigger DB
     menegakkan otorisasi sesungguhnya — panggilan di sini murni
     query/DML, sama pola dengan fungsi Rujukan Amanah (schema_82/84).
     ============================================================ */

  async listTaskWeightCategories({ includeInactive } = {}) {
    let q = supabaseClient.from('task_weight_categories').select('*, departments(name)').order('name');
    if (!includeInactive) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  },

  async upsertTaskWeightCategory({ id, departmentId, name, baseWeight, description, isActive }) {
    const payload = {
      department_id: departmentId || null, name, base_weight: baseWeight,
      description: description || null, is_active: isActive !== false,
    };
    const { error } = id
      ? await supabaseClient.from('task_weight_categories').update(payload).eq('id', id)
      : await supabaseClient.from('task_weight_categories').insert(payload);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async listPerformanceCompletedTasks(reviewId) {
    const { data, error } = await supabaseClient
      .from('performance_review_completed_tasks')
      .select('*, task_weight_categories(name, base_weight, department_id)')
      .eq('review_id', reviewId).order('created_at');
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Pola sama seperti savePerformanceMonthlySummary (delete-lalu-insert-
  // ulang) TAPI hanya untuk baris milik pemilik yang BELUM disesuaikan
  // atasan (weight_adjustment=0) — melindungi penilaian atasan yang
  // sudah masuk dari tertimpa kalau pemilik menyimpan ulang. RLS
  // perf_completed_tasks_write tetap jadi penegak utama (owner hanya
  // bisa menulis selama review.status='draft'); filter adjustment=0 di
  // sini murni pencegahan tambahan sisi klien.
  async saveMyCompletedTasks({ reviewId, completedTasks }) {
    const { error: delErr } = await supabaseClient
      .from('performance_review_completed_tasks').delete()
      .eq('review_id', reviewId).eq('weight_adjustment', 0);
    if (delErr) return { ok: false, error: `Pekerjaan Selesai: ${delErr.message}` };

    if (completedTasks && completedTasks.length) {
      // weight_base wajib snapshot dari kategori SAAT insert (bukan FK
      // live, lihat komentar schema_77) — ambil dari cache kategori yang
      // sudah dimuat frontend (dilewatkan lewat weightBase per baris).
      const rows = completedTasks.map(t => ({
        review_id: reviewId, category_id: t.categoryId, task_name: t.taskName,
        completed_date: t.completedDate, weight_base: t.weightBase, weight_adjustment: 0,
      }));
      const { error: insErr } = await supabaseClient.from('performance_review_completed_tasks').insert(rows);
      if (insErr) return { ok: false, error: `Pekerjaan Selesai: ${insErr.message}` };
    }
    return { ok: true };
  },

  // Lapis 2 — penyesuaian atasan/HRD/pimpinan. Trigger DB
  // (perf_completed_tasks_set_audit) menolak kalau pemanggil adalah
  // pemilik review sendiri atau bukan pihak berwenang; constraint DB
  // menolak adjustment tanpa alasan >=10 karakter.
  async adjustCompletedTaskWeight({ taskId, weightAdjustment, adjustmentReason }) {
    const { error } = await supabaseClient
      .from('performance_review_completed_tasks')
      .update({ weight_adjustment: weightAdjustment, adjustment_reason: adjustmentReason || null })
      .eq('id', taskId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async getWorkloadPayRatio({ periodId } = {}) {
    let q = supabaseClient.from('v_workload_pay_ratio').select('*');
    if (periodId) q = q.eq('period_id', periodId);
    const { data, error } = await q.order('full_name');
    if (error) throw new Error(error.message);
    return data || [];
  },

  async getWorkloadPayRatioByDepartment({ periodId } = {}) {
    let q = supabaseClient.from('v_workload_pay_ratio_by_department').select('*');
    if (periodId) q = q.eq('period_id', periodId);
    const { data, error } = await q.order('department_name');
    if (error) throw new Error(error.message);
    return data || [];
  },

  // ---- Laporan Kinerja Bulanan (schema_94) ----
  // Auto-submit dipanggil oportunistik (bukan pg_cron, lihat komentar
  // schema_94) -- getOrCreateMyMonthlyReport() dipanggil setiap kali menu
  // Kinerja pegawai dibuka, autoSubmitOverdueMonthlyReports() sekalian
  // dipanggil di titik yang sama supaya laporan bulan lalu yang masih
  // draft otomatis ter-submit begitu pegawai aktif memakai aplikasi lagi.
  async getOrCreateMyMonthlyReport(periodMonth) {
    const { data, error } = await supabaseClient.rpc('get_or_create_my_monthly_report',
      periodMonth ? { p_month: periodMonth } : {});
    if (error) throw new Error(error.message);
    return data; // uuid report id
  },
  async autoSubmitOverdueMonthlyReports() {
    const { data, error } = await supabaseClient.rpc('auto_submit_overdue_monthly_reports');
    if (error) throw new Error(error.message);
    return data || 0; // jumlah laporan yang baru ter-auto-submit
  },
  async adminAutoSubmitAllOverdueMonthlyReports() {
    const { data, error } = await supabaseClient.rpc('admin_auto_submit_all_overdue_monthly_reports');
    if (error) throw new Error(error.message);
    return data || 0;
  },
  async getMonthlyReport(reportId) {
    const { data, error } = await supabaseClient
      .from('monthly_work_reports')
      .select('*, employees(full_name, department_id, departments(name)), completed_tasks:monthly_work_report_completed_tasks(*), pending_tasks:monthly_work_report_pending_tasks(*)')
      .eq('id', reportId)
      .order('sort_order', { referencedTable: 'monthly_work_report_completed_tasks' })
      .order('sort_order', { referencedTable: 'monthly_work_report_pending_tasks' })
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  // Laporan admin: SEMUA laporan terjangkau RLS (super_admin/hrd/pimpinan
  // lihat semua, kepala_bagian lihat departemennya), untuk daftar/filter
  // di menu "Laporan Kinerja".
  async listMonthlyReportsForReport({ periodMonth } = {}) {
    let q = supabaseClient
      .from('monthly_work_reports')
      .select('*, employees(full_name, department_id, departments(name)), completed_tasks:monthly_work_report_completed_tasks(*), pending_tasks:monthly_work_report_pending_tasks(*)')
      .order('period_month', { ascending: false })
      .order('created_at', { ascending: false })
      .order('sort_order', { referencedTable: 'monthly_work_report_completed_tasks' })
      .order('sort_order', { referencedTable: 'monthly_work_report_pending_tasks' });
    if (periodMonth) q = q.eq('period_month', periodMonth);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  },
  // Simpan isi laporan: hanya boleh selama status masih 'draft' (RLS
  // menegakkan ini juga di server -- pola sama seperti savePerformance-
  // PendingTasks: hapus semua baris anak lalu insert ulang dari draft
  // klien, supaya tambah/hapus/urutan baris tidak perlu tracking id per
  // baris di sisi klien).
  async saveMonthlyReportTasks(reportId, { completedTasks, pendingTasks }) {
    const { error: delCompletedErr } = await supabaseClient
      .from('monthly_work_report_completed_tasks').delete().eq('report_id', reportId);
    if (delCompletedErr) return { ok: false, error: `Pekerjaan Selesai: ${delCompletedErr.message}` };
    if (completedTasks && completedTasks.length) {
      const rows = completedTasks.map((t, i) => ({
        report_id: reportId, sort_order: i, task_name: t.taskName,
        result_impact: t.resultImpact || null, output_proof: t.outputProof || null,
        timeliness: t.timeliness || null,
      }));
      const { error: insErr } = await supabaseClient.from('monthly_work_report_completed_tasks').insert(rows);
      if (insErr) return { ok: false, error: `Pekerjaan Selesai: ${insErr.message}` };
    }

    const { error: delPendingErr } = await supabaseClient
      .from('monthly_work_report_pending_tasks').delete().eq('report_id', reportId);
    if (delPendingErr) return { ok: false, error: `Pekerjaan Belum Selesai: ${delPendingErr.message}` };
    if (pendingTasks && pendingTasks.length) {
      const rows = pendingTasks.map((t, i) => ({
        report_id: reportId, sort_order: i, task_name: t.taskName,
        progress: t.progress === '' || t.progress == null ? null : Number(t.progress),
        obstacle: t.obstacle || null, follow_up_plan: t.followUpPlan || null,
        new_deadline: t.newDeadline || null,
      }));
      const { error: insErr } = await supabaseClient.from('monthly_work_report_pending_tasks').insert(rows);
      if (insErr) return { ok: false, error: `Pekerjaan Belum Selesai: ${insErr.message}` };
    }
    return { ok: true };
  },
  // Simpan SATU kartu Pekerjaan Selesai (insert kalau id null, update
  // kalau ada) -- dipakai tombol "Simpan" per kartu (schema_96).
  async saveMwrCompletedTask(reportId, task) {
    const { data, error } = await supabaseClient.rpc('upsert_my_mwr_completed_task', {
      p_id: task.id || null, p_report_id: reportId, p_task_name: task.taskName,
      p_result_impact: task.resultImpact || null, p_timeliness: task.timeliness || null,
      p_task_size: task.taskSize || null,
      p_output_proof_path: task.outputProofPath || null, p_output_proof_filename: task.outputProofFilename || null,
    });
    if (error) return { ok: false, error: friendlyDbError(error) };
    return { ok: true, row: data };
  },
  async deleteMwrCompletedTask(id) {
    const { error } = await supabaseClient.from('monthly_work_report_completed_tasks').delete().eq('id', id);
    return error ? { ok: false, error: friendlyDbError(error) } : { ok: true };
  },
  // Penilaian Atasan (schema_98) -- update langsung ke baris induk
  // (bukan RPC) karena trigger mwr_guard_supervisor_rating_only() yang
  // menegakkan atasan/pimpinan hanya bisa menyentuh kolom rating ini.
  async saveMwrSupervisorRating(reportId, rating, notes) {
    const { data, error } = await supabaseClient
      .from('monthly_work_reports')
      .update({ supervisor_rating: rating, supervisor_rating_notes: notes || null })
      .eq('id', reportId)
      .select()
      .single();
    if (error) return { ok: false, error: friendlyDbError(error) };
    return { ok: true, row: data };
  },
  // Simpan SATU kartu Pekerjaan Belum Selesai (insert kalau id null,
  // update kalau ada).
  async saveMwrPendingTask(reportId, task) {
    const { data, error } = await supabaseClient.rpc('upsert_my_mwr_pending_task', {
      p_id: task.id || null, p_report_id: reportId, p_task_name: task.taskName,
      p_progress: task.progress === '' || task.progress == null ? null : Number(task.progress),
      p_obstacle: task.obstacle || null, p_follow_up_plan: task.followUpPlan || null,
      p_new_deadline: task.newDeadline || null,
    });
    if (error) return { ok: false, error: friendlyDbError(error) };
    return { ok: true, row: data };
  },
  async deleteMwrPendingTask(id) {
    const { error } = await supabaseClient.from('monthly_work_report_pending_tasks').delete().eq('id', id);
    return error ? { ok: false, error: friendlyDbError(error) } : { ok: true };
  },
  // Unggah bukti output (opsional) ke bucket privat mwr-evidence,
  // folder {employee_id}/{report_id}/ -- pola sama dengan
  // uploadDisciplinaryEvidence.
  async uploadMwrEvidence(employeeId, reportId, file) {
    if (!file) return { ok: false, error: 'Pilih file terlebih dahulu' };
    const path = `${employeeId}/${reportId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabaseClient.storage.from('mwr-evidence').upload(path, file, { upsert: false });
    if (error) return { ok: false, error: `Gagal unggah bukti: ${error.message}` };
    return { ok: true, path, filename: file.name };
  },
  async getMwrEvidenceSignedUrl(filePath) {
    const { data, error } = await supabaseClient.storage.from('mwr-evidence').createSignedUrl(filePath, 300);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },
  // Submit manual (opsional -- normalnya auto-submit di akhir bulan,
  // tapi pegawai boleh submit lebih awal kalau memang sudah selesai).
  async submitMonthlyReport(reportId) {
    const { error } = await supabaseClient
      .from('monthly_work_reports')
      .update({ status: 'submitted', submitted_at: new Date().toISOString(), auto_submitted: false })
      .eq('id', reportId);
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  async listEducation(employeeId) {
    const { data, error } = await supabaseClient.from('employee_education').select('*').eq('employee_id', employeeId).order('graduation_year', { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async createEducation({ employeeId, level, institution, major, year, gpa, certNumber }) {
    const { error } = await supabaseClient.from('employee_education').insert({
      employee_id: employeeId, level, institution_name: institution, major: major || null,
      graduation_year: year || null, gpa: gpa || null, certificate_number: certNumber || null,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  },
  async deleteEducation(id) {
    const { error } = await supabaseClient.from('employee_education').delete().eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  async listCertifications(employeeId) {
    const { data, error } = await supabaseClient.from('employee_certifications').select('*, employee_documents(file_url, file_name)').eq('employee_id', employeeId).order('issued_date', { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async createCertification({ employeeId, name, issuer, number, issuedDate, expiryDate, file }) {
    let documentId = null;
    if (file) {
      const uploadResult = await this.uploadDocument({ employeeId, documentType: 'sertifikat', file });
      if (!uploadResult.ok) return { ok: false, error: `Gagal mengunggah sertifikat: ${uploadResult.error}` };
      documentId = uploadResult.document.id;
    }
    const { error } = await supabaseClient.from('employee_certifications').insert({
      employee_id: employeeId, certification_name: name, issuing_organization: issuer || null,
      certificate_number: number || null, issued_date: issuedDate || null, expiry_date: expiryDate || null,
      document_id: documentId,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  },
  async deleteCertification(id) {
    const { error } = await supabaseClient.from('employee_certifications').delete().eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  async listCompetencies(employeeId) {
    const { data, error } = await supabaseClient.from('employee_competencies').select('*, employee_documents(file_url, file_name)').eq('employee_id', employeeId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async createCompetency({ employeeId, type, name, level, date, file }) {
    let documentId = null;
    if (file) {
      const uploadResult = await this.uploadDocument({ employeeId, documentType: 'sertifikat', file });
      if (!uploadResult.ok) return { ok: false, error: `Gagal mengunggah dokumen: ${uploadResult.error}` };
      documentId = uploadResult.document.id;
    }
    const { error } = await supabaseClient.from('employee_competencies').insert({
      employee_id: employeeId, competency_type: type, name, level: level || null, certified_at: date || null,
      document_id: documentId,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  },
  async deleteCompetency(id) {
    const { error } = await supabaseClient.from('employee_competencies').delete().eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  // Konvensi path SAMA dengan employee-documents (schema_06): wajib
  // '{employee_id}/...' supaya RLS Storage (schema_09) bisa mengekstrak
  // employee_id dari folder pertama.
  async uploadEmployeePhoto(employeeId, file) {
    if (!file) return { ok: false, error: 'Pilih file terlebih dahulu' };
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${employeeId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadErr } = await supabaseClient.storage.from('employee-photos').upload(path, file, { cacheControl: '3600', upsert: false });
    if (uploadErr) return { ok: false, error: `Gagal unggah foto: ${uploadErr.message}` };
    const { error: updateErr } = await supabaseClient.from('employees').update({ photo_url: path }).eq('id', employeeId);
    if (updateErr) {
      await supabaseClient.storage.from('employee-photos').remove([path]);
      return { ok: false, error: `Foto ter-upload tapi gagal disimpan ke profil: ${updateErr.message}` };
    }
    return { ok: true, path };
  },

  async getEmployeePhotoSignedUrl(filePath) {
    const { data, error } = await supabaseClient.storage.from('employee-photos').createSignedUrl(filePath, 300);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },

  // RPC ke function SECURITY DEFINER get_department_head_name (schema_10)
  // — TIDAK melonggarkan RLS profiles, cuma balikan nama, lihat komentar
  // desain lengkap di file migration-nya.
  async getDepartmentHeadName(departmentId) {
    const { data, error } = await supabaseClient.rpc('get_department_head_name', { target_department_id: departmentId });
    if (error) throw new Error(error.message);
    return data;
  },

  // RPC ke function SECURITY DEFINER get_position_holder_names
  // (schema_88, audit 2026-08-24) — dipakai untuk mengisi field "Atasan
  // Langsung" di profil (viewEmployee()). SENGAJA bypass RLS
  // employees_select row-level (yang untuk role swalayan membatasi
  // SELURUH baris pegawai lain, termasuk atasannya sendiri) tapi HANYA
  // mengembalikan full_name, bukan baris penuh — lihat komentar desain
  // lengkap di file migration-nya untuk alasan kenapa RPC sempit ini
  // dipilih alih-alih melebarkan RLS employees_select secara umum.
  async getPositionHolderNames(positionId, excludeEmployeeId) {
    if (!positionId) return [];
    const { data, error } = await supabaseClient.rpc('get_position_holder_names', {
      p_position_id: positionId,
      p_exclude_employee_id: excludeEmployeeId || null,
    });
    if (error) throw new Error(error.message);
    return (data || []).map(r => r.full_name);
  },

  // RPC ke function SECURITY DEFINER get_employee_name (schema_107,
  // 2026-08-31) — dipakai untuk menampilkan nama "Atasan Langsung" di
  // profil (viewEmployee()) sekarang bahwa supervisor_id person-based
  // langsung, bukan lagi lewat jabatan (supervisor_position_id).
  // Alasan sempit sama persis dengan getPositionHolderNames di atas:
  // RLS employees_select tidak mengizinkan role swalayan lihat baris
  // pegawai lain sama sekali, termasuk atasannya sendiri — RPC ini
  // HANYA mengembalikan full_name, bukan baris penuh.
  async getEmployeeName(employeeId) {
    if (!employeeId) return null;
    const { data, error } = await supabaseClient.rpc('get_employee_name', {
      p_employee_id: employeeId,
    });
    if (error) throw new Error(error.message);
    return data || null;
  },

  // RPC ke function SECURITY DEFINER get_team_contacts (schema_89) —
  // dipakai untuk kartu "Anggota Tim" (ps-quickrow) yang HANYA
  // membuka WhatsApp rekan se-unit, TIDAK memberi akses baris employees
  // penuh. Otorisasi (pemilik baris sendiri ATAU role admin) ditegakkan
  // DI DALAM function itu sendiri — kalau pemanggil tidak berwenang,
  // RPC mengembalikan array kosong (bukan error), lihat komentar
  // lengkap di file migration-nya.
  async getTeamContacts(employeeId) {
    if (!employeeId) return [];
    const { data, error } = await supabaseClient.rpc('get_team_contacts', {
      p_employee_id: employeeId,
    });
    if (error) throw new Error(error.message);
    return (data || []).map(r => ({ id: r.id, full_name: r.full_name, phone: r.phone }));
  },

  // RPC search_employee_contacts (schema_103) — direktori kontak LINTAS
  // DEPARTEMEN, wajib query >=2 karakter (server juga menegakkan ini,
  // sisi klien cuma optimasi supaya tidak panggil RPC untuk 0-1
  // karakter). Lihat komentar lengkap di kepala file migrasi.
  async searchEmployeeContacts(query) {
    const q = (query || '').trim();
    if (q.length < 2) return [];
    const { data, error } = await supabaseClient.rpc('search_employee_contacts', {
      p_query: q,
    });
    if (error) throw new Error(error.message);
    return (data || []).map(r => ({
      id: r.id, full_name: r.full_name, department_name: r.department_name,
      position: r.position, phone: r.phone,
    }));
  },

  // Kartu "Kesehatan Sistem" Dashboard (schema_100, R4 audit
  // 2026-08-30) -- RPC get_edge_function_health() SUDAH mengecek role
  // pemanggil (super_admin/hrd) di dalam dirinya sendiri & melempar
  // exception kalau bukan; SYSTEM_HEALTH_ROLES di constants.js cuma
  // dipakai untuk sembunyikan kartunya di UI, bukan satu-satunya
  // penjagaan (pola sama seperti RPC lain yang SECURITY DEFINER).
  async getEdgeFunctionHealth() {
    const { data, error } = await supabaseClient.rpc('get_edge_function_health');
    if (error) throw new Error(error.message);
    return data || [];
  },

  // document_number DIBUAT SERVER (trigger generate_document_number,
  // schema_10) — TIDAK dikirim dari sini, dibaca balik dari baris yang
  // ter-insert.
  async createGeneratedDocument({ employeeId, documentType, referenceTable, referenceId, file, issuingUnitId }) {
    if (!file) return { ok: false, error: 'File PDF tidak ditemukan' };
    const path = `${employeeId}/${crypto.randomUUID()}.pdf`;
    const { error: uploadErr } = await supabaseClient.storage.from('generated-documents').upload(path, file, { contentType: 'application/pdf', upsert: false });
    if (uploadErr) return { ok: false, error: `Gagal unggah PDF: ${uploadErr.message}` };

    // issuingUnitId OPSIONAL (schema_85) -- trigger generate_document_number
    // di server yang menegakkan wajib/tidaknya berdasarkan
    // numbering_format jenis surat. 2 pemanggil nyata (cetak Surat
    // Cuti/Slip Gaji) tidak pernah mengirimnya, keduanya 'type_only'.
    const { data: inserted, error: insertErr } = await supabaseClient.from('generated_documents').insert({
      employee_id: employeeId, document_type: documentType,
      reference_table: referenceTable, reference_id: referenceId, file_url: path,
      issuing_unit_id: issuingUnitId || null,
    }).select().single();
    if (insertErr) {
      await supabaseClient.storage.from('generated-documents').remove([path]);
      return { ok: false, error: `PDF ter-upload tapi gagal dicatat: ${insertErr.message}` };
    }
    return { ok: true, document: inserted };
  },

  async listGeneratedDocuments(employeeId, documentType) {
    let q = supabaseClient.from('generated_documents').select('*').eq('employee_id', employeeId).order('generated_at', { ascending: false });
    if (documentType) q = q.eq('document_type', documentType);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Untuk menu "Manajemen Dokumen" (DMS) — institusi-lebar, TANPA
  // employeeId wajib (beda dari listGeneratedDocuments di atas yang
  // dipakai tab "Surat Saya" per pegawai). Cakupan baris ditentukan RLS
  // generated_documents_select (schema_36) — super_admin/hrd/pimpinan/
  // bendahara lihat semua, kepala_bagian lihat departemennya, selain
  // itu cuma milik sendiri. Nama pegawai di-join supaya tidak perlu
  // query terpisah per baris di UI.
  async listAllGeneratedDocuments({ documentType, startDate, endDate } = {}) {
    let q = supabaseClient.from('generated_documents')
      .select('*, employees(full_name)')
      .order('generated_at', { ascending: false });
    if (documentType) q = q.eq('document_type', documentType);
    if (startDate) q = q.gte('generated_at', startDate);
    if (endDate) q = q.lte('generated_at', endDate);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  },

  async getGeneratedDocumentSignedUrl(filePath) {
    const { data, error } = await supabaseClient.storage.from('generated-documents').createSignedUrl(filePath, 300);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },

  async getPayrollInfo(employeeId) {
    const { data, error } = await supabaseClient.from('employee_payroll').select('*').eq('employee_id', employeeId).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
  // 12 kolom baru (schema_43) — komponen penggajian khas pesantren.
  // total_net_monthly TIDAK dikirim di sini karena generated column
  // (Postgres menolak insert/update kolom generated secara eksplisit);
  // dibaca kembali otomatis lewat getPayrollInfo setelah upsert.
  async upsertPayrollInfo({
    employeeId, bankName, bankAccountNumber, bankAccountHolder, npwp, bpjsKetenagakerjaan, bpjsKesehatan,
    baseSalary, fixedAllowance, fixedBonus, fixedDeduction, notes,
    allowanceDualMandate, riskConflictCare, riskFinancial, riskPhysicalTechnical, allowanceMuqim,
    skillQuran, skillForeignLanguage, skillTechnicalMedicalIt,
    allowanceSpouse, allowanceChildren, dependentChildrenCount, socialFundDeduction,
  }) {
    const { error } = await supabaseClient.from('employee_payroll').upsert({
      employee_id: employeeId, bank_name: bankName || null, bank_account_number: bankAccountNumber || null,
      bank_account_holder: bankAccountHolder || null, npwp: npwp || null,
      bpjs_ketenagakerjaan: bpjsKetenagakerjaan || null, bpjs_kesehatan: bpjsKesehatan || null,
      base_salary: baseSalary || null,
      fixed_allowance: fixedAllowance || 0, fixed_bonus: fixedBonus || 0, fixed_deduction: fixedDeduction || 0,
      notes: notes || null,
      allowance_dual_mandate: allowanceDualMandate || 0,
      risk_conflict_care: riskConflictCare || 0, risk_financial: riskFinancial || 0,
      risk_physical_technical: riskPhysicalTechnical || 0, allowance_muqim: allowanceMuqim || 0,
      skill_quran: skillQuran || 0, skill_foreign_language: skillForeignLanguage || 0,
      skill_technical_medical_it: skillTechnicalMedicalIt || 0,
      allowance_spouse: allowanceSpouse || 0, allowance_children: allowanceChildren || 0,
      dependent_children_count: dependentChildrenCount || 0, social_fund_deduction: socialFundDeduction || 0,
    }, { onConflict: 'employee_id' });
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  // Rujukan gaji dasar + tunjangan risiko per amanah (schema_82).
  // Tidak ada authorization check eksplisit di sini -- RLS
  // position_compensation_reference (SELECT: super_admin/hrd/pimpinan/
  // bendahara_umum) yang menentukan, konsisten pola RLS-first di app ini.
  async listPositionCompensationReferences() {
    const { data, error } = await supabaseClient.from('position_compensation_reference').select('*').order('nama_amanah');
    if (error) throw new Error(error.message);
    return data || [];
  },
  // Cascade ke employee_payroll pegawai aktif yang tertaut (kalau
  // nominal berubah) SEPENUHNYA ditangani trigger
  // trg_cascade_amanah_compensation_update di sisi Postgres (schema_82)
  // -- upsert ini TIDAK perlu memicu apa pun secara manual dari sini.
  async upsertPositionCompensationReference({ id, namaAmanah, gajiDasar, riskConflictCare, riskFinancial, riskPhysicalTechnical, isActive, notes }) {
    const { error } = await supabaseClient.from('position_compensation_reference').upsert({
      id: id || undefined,
      nama_amanah: namaAmanah, gaji_dasar: gajiDasar || 0,
      risk_conflict_care: riskConflictCare || 0, risk_financial: riskFinancial || 0,
      risk_physical_technical: riskPhysicalTechnical || 0,
      is_active: isActive !== false, notes: notes || null,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  // RPC link_employee_amanah (schema_84) -- SATU-SATUNYA jalur resmi
  // untuk mengubah employees.amanah_id dari UI. TIDAK memakai
  // updateEmployee(id, {amanah_id}) langsung karena RLS employees_update
  // (schema_25) tidak menyertakan is_bendahara() -- Bendahara Umum akan
  // ditolak RLS sebelum sempat sampai ke trigger schema_82 yang justru
  // mengizinkannya. RPC SECURITY DEFINER ini own auth check-nya sendiri
  // (lihat schema_84), jadi bypass RLS row-level HANYA untuk kolom ini.
  // PENTING (lihat DEPLOYMENT.md/PENDING_ACTIONS.md): panggilan ini akan
  // gagal dengan "function ... does not exist" sampai schema_84
  // dieksekusi tim Supabase -- belum terkonfirmasi live per sesi ini.
  async linkEmployeeAmanah(employeeId, amanahId) {
    const { error } = await supabaseClient.rpc('link_employee_amanah', {
      p_employee_id: employeeId, p_amanah_id: amanahId || null,
    });
    return error ? { ok: false, error: friendlyDbError(error) } : { ok: true };
  },

  async listPayrollPeriods() {
    const { data, error } = await supabaseClient.from('payroll_periods').select('*').order('period_year', { ascending: false }).order('period_month', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  // Ringkasan keuangan untuk Dashboard Bendahara. Empat query paralel,
  // agregasi di client — sengaja TIDAK pakai RPC/view SQL baru supaya
  // tidak menambah permukaan migrasi untuk fitur yang murni tampilan.
  // Tidak ada authorization check eksplisit di sini: RLS 4 tabel di
  // bawah (payroll_periods, employee_payslips, employees,
  // employee_payroll) yang menentukan — kalau peran tidak berwenang,
  // hasilnya baris kosong (bukan error), dan ringkasan otomatis
  // menunjukkan nol. Konsisten dengan pola RLS-first di seluruh app ini.
  // PERBAIKAN KONSISTENSI (sebelumnya): fungsi ini SELALU mengembalikan
  // authorized:true, murni mengandalkan RLS memfilter 4 tabel di bawah
  // jadi kosong untuk role yang tidak berwenang — hasilnya dashboard
  // "Rp 0" yang menyesatkan alih-alih penolakan yang jelas, kalau
  // fungsi ini suatu saat terpanggil di luar jalur normal (bug gating
  // role lain, atau lewat console). Sekarang eksplisit cek dulu,
  // meniru _canViewPayroll di mockDataService.js — defense-in-depth,
  // bukan cuma andalkan RLS baris demi baris.
  async getFinanceSummary(year) {
    const profile = await this.getSession();
    if (!profile || !['super_admin', 'hrd', 'pimpinan', 'bendahara_umum'].includes(profile.role)) {
      return { authorized: false };
    }
    const [periodsRes, slipsRes, employeesRes, payrollInfoRes] = await Promise.all([
      supabaseClient.from('payroll_periods').select('id, period_month, period_year, status').eq('period_year', year),
      supabaseClient.from('employee_payslips').select('payroll_period_id, net_pay, status'),
      supabaseClient.from('employees').select('id, employment_status'),
      supabaseClient.from('employee_payroll').select('employee_id, base_salary, fixed_allowance, fixed_bonus, fixed_deduction'),
    ]);
    if (periodsRes.error) throw new Error(periodsRes.error.message);
    if (slipsRes.error) throw new Error(slipsRes.error.message);
    if (employeesRes.error) throw new Error(employeesRes.error.message);
    if (payrollInfoRes.error) throw new Error(payrollInfoRes.error.message);

    const periods = periodsRes.data || [];
    const periodIds = new Set(periods.map(p => p.id));
    const periodById = new Map(periods.map(p => [p.id, p]));
    const slipsThisYear = (slipsRes.data || []).filter(s => periodIds.has(s.payroll_period_id));

    const totalPaidYtd = slipsThisYear.filter(s => s.status === 'paid').reduce((sum, s) => sum + Number(s.net_pay || 0), 0);
    const totalFinalizedUnpaid = slipsThisYear.filter(s => s.status === 'finalized').reduce((sum, s) => sum + Number(s.net_pay || 0), 0);

    const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, paid: 0 }));
    slipsThisYear.filter(s => s.status === 'paid').forEach(s => {
      const period = periodById.get(s.payroll_period_id);
      if (period) monthly[period.period_month - 1].paid += Number(s.net_pay || 0);
    });

    const periodStatusCounts = { open: 0, processing: 0, finalized: 0, paid: 0 };
    periods.forEach(p => { if (periodStatusCounts[p.status] !== undefined) periodStatusCounts[p.status]++; });

    const activeIds = new Set((employeesRes.data || []).filter(e => e.employment_status === 'active').map(e => e.id));
    let estimatedMonthlyPayroll = 0;
    (payrollInfoRes.data || []).forEach(info => {
      if (activeIds.has(info.employee_id)) {
        // total_net_monthly = generated column (schema_43), satu sumber
        // kebenaran mencakup seluruh 12 komponen gaji baru + 4 kolom
        // lama — TIDAK dihitung ulang manual di sini lagi.
        estimatedMonthlyPayroll += Number(info.total_net_monthly || 0);
      }
    });

    return {
      authorized: true, year, totalPaidYtd, totalFinalizedUnpaid, monthly, periodStatusCounts,
      estimatedMonthlyPayroll, employeeCountActive: activeIds.size,
    };
  },
  // Analisis Biaya SDM (schema_40) — query 4 view SQL langsung (bukan
  // agregasi client seperti getFinanceSummary), karena agregasi
  // multi-tabel + breakdown per departemen x kontrak lebih murah dan
  // lebih konsisten dihitung sekali di Postgres daripada di-fetch penuh
  // lalu diagregasi ulang di browser. Otorisasi eksplisit di sini SAMA
  // seperti getFinanceSummary — defense-in-depth di atas security_invoker
  // + filter is_xxx() yang sudah ada di badan view itu sendiri
  // (schema_40_hr_cost_analysis_views.sql), bukan pengganti untuk itu.
  async getHrCostAnalysis() {
    const profile = await this.getSession();
    if (!profile || !['super_admin', 'hrd', 'pimpinan', 'bendahara_umum'].includes(profile.role)) {
      return { authorized: false };
    }
    const [deptRes, contractRes, trendRes] = await Promise.all([
      supabaseClient.from('v_hr_cost_by_department').select('*'),
      supabaseClient.from('v_hr_cost_by_contract_type').select('*'),
      supabaseClient.from('v_hr_cost_trend_by_period').select('*'),
    ]);
    if (deptRes.error) throw new Error(deptRes.error.message);
    if (contractRes.error) throw new Error(contractRes.error.message);
    if (trendRes.error) throw new Error(trendRes.error.message);

    return {
      authorized: true,
      byDepartment: deptRes.data || [],
      byContractType: contractRes.data || [],
      trendByPeriod: trendRes.data || [],
    };
  },
  async createPayrollPeriod({ month, year }) {
    const { data, error } = await supabaseClient.from('payroll_periods').insert({ period_month: month, period_year: year }).select().single();
    return error ? { ok: false, error: error.message } : { ok: true, period: data };
  },
  async updatePayrollPeriodStatus(id, status) {
    const patch = { status };
    const { error } = await supabaseClient.from('payroll_periods').update(patch).eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  async listPayslipsForPeriod(periodId) {
    const { data, error } = await supabaseClient.from('employee_payslips').select('*, employees(full_name)').eq('payroll_period_id', periodId);
    if (error) throw new Error(error.message);
    return data || [];
  },
  async listMyPayslips(employeeId) {
    const { data, error } = await supabaseClient.from('employee_payslips').select('*, payroll_periods(period_month, period_year, status)').eq('employee_id', employeeId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  // net_pay dihitung DI SINI saat insert — trigger recalc_payslip_net_pay_
  // self (schema_03) HANYA jalan BEFORE UPDATE, bukan BEFORE INSERT, jadi
  // baris pertama akan net_pay=0 selamanya kalau tidak dihitung manual di
  // sini (baru pulih kalau item ditambah, yang trigger-nya lain lagi).
  // absent_days juga disalin manual sesuai desain kolomnya (schema_03).
  async createPayslip({ periodId, employeeId }) {
    const { data: payrollInfo } = await supabaseClient.from('employee_payroll').select('base_salary').eq('employee_id', employeeId).maybeSingle();
    const baseSalary = payrollInfo?.base_salary || 0;
    const { data: period } = await supabaseClient.from('payroll_periods').select('period_month, period_year').eq('id', periodId).single();
    let absentDays = 0;
    if (period) {
      const startD = `${period.period_year}-${String(period.period_month).padStart(2, '0')}-01`;
      const endD = localDateISO(new Date(period.period_year, period.period_month, 0));
      const { count } = await supabaseClient.from('employee_attendance').select('id', { count: 'exact', head: true })
        .eq('employee_id', employeeId).eq('status', 'absent').gte('attendance_date', startD).lte('attendance_date', endD);
      absentDays = count || 0;
    }
    const { data, error } = await supabaseClient.from('employee_payslips').insert({
      payroll_period_id: periodId, employee_id: employeeId, base_salary: baseSalary,
      net_pay: baseSalary, attendance_absent_days: absentDays,
    }).select().single();
    return error ? { ok: false, error: error.message } : { ok: true, payslip: data };
  },
  async getPayslip(id) {
    const { data: payslip, error } = await supabaseClient.from('employee_payslips').select('*, employees(full_name), payroll_periods(period_month, period_year, status)').eq('id', id).single();
    if (error) throw new Error(error.message);
    const { data: items, error: itemsErr } = await supabaseClient.from('employee_payslip_items').select('*').eq('payslip_id', id);
    if (itemsErr) throw new Error(itemsErr.message);
    return { ...payslip, items: items || [] };
  },
  async addPayslipItem({ payslipId, itemType, label, amount }) {
    const { error } = await supabaseClient.from('employee_payslip_items').insert({ payslip_id: payslipId, item_type: itemType, label, amount });
    return error ? { ok: false, error: error.message } : { ok: true };
  },
  async deletePayslipItem(id) {
    const { error } = await supabaseClient.from('employee_payslip_items').delete().eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  },
  async updatePayslipFinancials({ id, pph21, bpjsDeduction }) {
    const { error } = await supabaseClient.from('employee_payslips').update({ pph21: pph21 || 0, bpjs_deduction: bpjsDeduction || 0 }).eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  },
  async updatePayslipStatus(id, status) {
    const { error } = await supabaseClient.from('employee_payslips').update({ status }).eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  // RLS employee_attendance_select (schema_03) yang menegakkan scoping —
  // query ini balik apa saja yang lolos, agregasi dilakukan client-side.
  async listAttendanceReport({ startDate, endDate, departmentId }) {
    let q = supabaseClient.from('employee_attendance').select('employee_id, status, employees(full_name, department_id)')
      .gte('attendance_date', startDate).lte('attendance_date', endDate);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    let rows = data || [];
    if (departmentId) rows = rows.filter(r => r.employees?.department_id === departmentId);
    const byEmp = {};
    rows.forEach(r => {
      if (!byEmp[r.employee_id]) byEmp[r.employee_id] = { employee: r.employees, present: 0, late: 0, absent: 0, sick: 0, permit: 0, leave: 0 };
      if (byEmp[r.employee_id][r.status] !== undefined) byEmp[r.employee_id][r.status]++;
    });
    return Object.values(byEmp);
  },

  // RLS employee_attendance_select (schema_03) yang menegakkan scoping —
  // query balik apa saja yang lolos, agregasi PER TANGGAL (bukan per
  // pegawai seperti listAttendanceReport) dilakukan client-side.
  async getAttendanceTrend(days = 14) {
    const endDate = new Date();
    const startDate = new Date(); startDate.setDate(endDate.getDate() - (days - 1));
    const startStr = localDateISO(startDate);
    const endStr = localDateISO(endDate);

    const { data, error } = await supabaseClient.from('employee_attendance').select('attendance_date, status')
      .gte('attendance_date', startStr).lte('attendance_date', endStr);
    if (error) throw new Error(error.message);

    const byDate = {};
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const key = localDateISO(d);
      byDate[key] = { date: key, present: 0, late: 0, absent: 0 };
    }
    (data || []).forEach(a => {
      if (byDate[a.attendance_date] && byDate[a.attendance_date][a.status] !== undefined) byDate[a.attendance_date][a.status]++;
    });
    return Object.values(byDate).sort((a, b) => a.date < b.date ? -1 : 1);
  },

  async listLeaveReport({ startDate, endDate, departmentId }) {
    let q = supabaseClient.from('employee_leave_requests')
      .select('employee_id, days_count, leave_type_id, employees(full_name, department_id), leave_types(name)')
      .eq('status', 'approved').lte('start_date', endDate).gte('end_date', startDate);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    let rows = data || [];
    if (departmentId) rows = rows.filter(r => r.employees?.department_id === departmentId);
    const byKey = {};
    rows.forEach(r => {
      const key = r.employee_id + '|' + r.leave_type_id;
      if (!byKey[key]) byKey[key] = { employee: r.employees, leave_types: r.leave_types, totalDays: 0 };
      byKey[key].totalDays += r.days_count;
    });
    return Object.values(byKey);
  },

  async getInstitutionSettings() {
    const { data, error } = await supabaseClient.from('institution_settings').select('*').limit(1).single();
    if (error) throw new Error(error.message);
    return data;
  },
  async upsertInstitutionSettings({ name, address, whatsappGroupUrl }) {
    const { data: existing, error: fetchErr } = await supabaseClient.from('institution_settings').select('id').limit(1).single();
    if (fetchErr) return { ok: false, error: fetchErr.message };
    const payload = { name, address };
    if (whatsappGroupUrl !== undefined) payload.whatsapp_group_url = whatsappGroupUrl || null;
    const { error } = await supabaseClient.from('institution_settings').update(payload).eq('id', existing.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  },
  // Bucket 'institution-assets' PUBLIK (beda dari employee-documents/
  // photos yang privat) — pakai getPublicUrl, BUKAN createSignedUrl.
  async uploadInstitutionLogo(file) {
    if (!file) return { ok: false, error: 'Pilih file terlebih dahulu' };
    const { data: existing, error: fetchErr } = await supabaseClient.from('institution_settings').select('id').limit(1).single();
    if (fetchErr) return { ok: false, error: fetchErr.message };
    const ext = file.name.split('.').pop();
    const path = `logo-${crypto.randomUUID()}.${ext}`;
    const { error: uploadErr } = await supabaseClient.storage.from('institution-assets').upload(path, file, { upsert: true });
    if (uploadErr) return { ok: false, error: `Gagal unggah logo: ${uploadErr.message}` };
    const { error: updateErr } = await supabaseClient.from('institution_settings').update({ logo_url: path }).eq('id', existing.id);
    if (updateErr) return { ok: false, error: `Logo ter-upload tapi gagal disimpan: ${updateErr.message}` };
    return { ok: true, path };
  },
  async getInstitutionLogoUrl(path) {
    if (!path) return null;
    const { data } = supabaseClient.storage.from('institution-assets').getPublicUrl(path);
    return data.publicUrl;
  },

  // Meniru KontenHarianController::index() (schema_90) -- baca LANGSUNG
  // 3 tabel harian (jadwal_sholat_harian/ayat_harian/hadits_harian),
  // BUKAN memanggil Edge Function apa pun (baca murni tidak butuh
  // SERVICE_ROLE_KEY, RLS select sudah mengizinkan authenticated --
  // lihat schema_90). Yang MENGISI tabel-tabel ini adalah Edge Function
  // sync-konten-harian (cron), bukan fungsi ini -- fungsi ini cuma baca.
  // `status` 'partial' + `catatan` kalau ada tabel yang masih kosong
  // untuk tanggal itu (paling sering karena cron belum sempat jalan
  // untuk tanggal tsb, atau ayat_master/hadits_master belum di-seed
  // sama sekali) -- SAMA seperti logika Laravel aslinya.
  // PERBAIKAN (audit keamanan+UI/UX 2026-08-26): sebelumnya melempar
  // exception pada QUERY PERTAMA yang error (jadwal_sholat dicek
  // duluan), membuang hasil 2 query lain WALAU keduanya berhasil --
  // satu tabel bermasalah (mis. relasinya belum ada di DB, lihat
  // PENDING_ACTIONS.md item schema_90/HIGH) membuat KETIGA kartu di UI
  // gagal total, bukan cuma satu. Sekarang tiap query dievaluasi
  // independen: yang gagal jadi null + pesan errornya dicatat per-field
  // di `errors`, yang berhasil tetap dipakai. SENGAJA tidak lagi throw
  // untuk error per-query (hanya kegagalan DI LUAR Promise.all -- mis.
  // network total down sebelum request terkirim -- yang masih propagate
  // sebagai exception ke pemanggil, perilaku lama untuk itu tidak berubah).
  async getKontenHarian(tanggal) {
    const tgl = tanggal || new Date().toISOString().slice(0, 10);

    const [sholatRes, ayatRes, haditsRes] = await Promise.all([
      supabaseClient.from('jadwal_sholat_harian').select('*').eq('tanggal', tgl).maybeSingle(),
      supabaseClient.from('ayat_harian').select('*').eq('tanggal', tgl).maybeSingle(),
      supabaseClient.from('hadits_harian').select('*').eq('tanggal', tgl).maybeSingle(),
    ]);

    const data = {
      jadwal_sholat: sholatRes.error ? null : (sholatRes.data || null),
      ayat_harian: ayatRes.error ? null : (ayatRes.data || null),
      hadits_harian: haditsRes.error ? null : (haditsRes.data || null),
    };
    const errors = {
      jadwal_sholat: sholatRes.error ? sholatRes.error.message : null,
      ayat_harian: ayatRes.error ? ayatRes.error.message : null,
      hadits_harian: haditsRes.error ? haditsRes.error.message : null,
    };
    const adaError = !!(errors.jadwal_sholat || errors.ayat_harian || errors.hadits_harian);
    const lengkap = !!(data.jadwal_sholat && data.ayat_harian && data.hadits_harian);

    return {
      status: lengkap ? 'success' : (adaError ? 'error' : 'partial'),
      tanggal: tgl,
      data,
      errors: adaError ? errors : null,
      catatan: lengkap ? null : 'Sebagian data belum tersedia untuk tanggal ini. Pastikan Edge Function sync-konten-harian sudah dijalankan (manual atau cron).',
    };
  },

  // ---- Kutipan Halaman Login (schema_73) — dibaca publik (anon
  // termasuk, layar Login/Register belum ada sesi), ditulis hanya
  // super_admin lewat menu Pengaturan.
  async listLoginQuotes() {
    const { data, error } = await supabaseClient
      .from('login_quotes').select('*').order('display_order').order('created_at');
    if (error) throw new Error(error.message);
    return data || [];
  },
  async createLoginQuote(payload) {
    const { data, error } = await supabaseClient
      .from('login_quotes').insert(payload).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, quote: data };
  },
  async updateLoginQuote(id, payload) {
    const { error } = await supabaseClient.from('login_quotes').update(payload).eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },
  async deleteLoginQuote(id) {
    const { error } = await supabaseClient.from('login_quotes').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  // ---- Struktur Ideal (MUSYKER 2026) — lihat schema_52 untuk skema
  // lengkap (tabel org_structure_reference, RLS, guard siklus/hapus di
  // level DB). Client di sini TIDAK menduplikasi validasi siklus/hapus
  // secara ketat seperti mockDataService — cukup teruskan pesan error
  // Postgres apa adanya (trigger/FK sudah menegakkan itu di server),
  // konsisten dengan filosofi "RLS/DB yang benar, client cuma teruskan".
  async listOrgStructure() {
    const { data, error } = await supabaseClient
      .from('org_structure_reference').select('*').order('urutan', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async createOrgPosition(input) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { data, error } = await supabaseClient.from('org_structure_reference').insert({
      kode: (input.kode || '').trim(), nama: (input.nama || '').trim(),
      parent_id: input.parent_id || null,
      urutan: input.urutan ?? 0,
      atasan_label: input.atasan_label || null, membawahi_label: input.membawahi_label || null,
      tujuan: input.tujuan || null,
      tugas_pokok: input.tugas_pokok || [], wewenang: input.wewenang || [],
      kualifikasi: input.kualifikasi || [], kpi: input.kpi || [],
      updated_by: user?.id,
    }).select('id').single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data.id };
  },
  async updateOrgPosition(id, patch) {
    const { error } = await supabaseClient.from('org_structure_reference').update(patch).eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },
  async deleteOrgPosition(id) {
    const { error } = await supabaseClient.from('org_structure_reference').delete().eq('id', id);
    if (error) {
      // FK ON DELETE RESTRICT muncul sebagai pesan Postgres teknis —
      // diterjemahkan ke pesan yang dimengerti admin, bukan ditampilkan
      // mentah-mentah.
      if (/foreign key|violates|restrict/i.test(error.message)) {
        return { ok: false, error: 'Jabatan ini masih punya bawahan di bagan — pindahkan atau hapus bawahannya terlebih dahulu' };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  },

  // ---- Template Dokumen (Pengaturan) — contoh format surat/dokumen
  // resmi yang diunggah Super Admin untuk jadi rujukan staf lain.
  // Bucket PRIVAT (beda dari institution-assets), signed URL saja —
  // lihat schema_28 untuk RLS lengkap.
  async listDocumentTemplates() {
    const { data, error } = await supabaseClient
      .from('document_templates').select('*, profiles(full_name), document_letter_types(name, type_code)').order('uploaded_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async uploadDocumentTemplate({ name, description, file, documentTypeKey }) {
    if (!file) return { ok: false, error: 'Pilih file terlebih dahulu' };
    if (!name) return { ok: false, error: 'Nama template wajib diisi' };
    const path = `${crypto.randomUUID()}-${file.name}`;
    const { error: uploadErr } = await supabaseClient.storage.from('document-templates').upload(path, file, { upsert: false });
    if (uploadErr) return { ok: false, error: `Gagal unggah file: ${uploadErr.message}` };
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { error: insertErr } = await supabaseClient.from('document_templates').insert({
      name, description: description || null, file_url: path, file_name: file.name,
      file_size: file.size, mime_type: file.type, uploaded_by_profile_id: user?.id,
      document_type_key: documentTypeKey || null,
    });
    if (insertErr) {
      await supabaseClient.storage.from('document-templates').remove([path]);
      return { ok: false, error: `File ter-upload tapi gagal dicatat: ${insertErr.message}` };
    }
    return { ok: true };
  },
  async deleteDocumentTemplate(id, filePath) {
    const { error: storageErr } = await supabaseClient.storage.from('document-templates').remove([filePath]);
    if (storageErr) return { ok: false, error: `Gagal menghapus file: ${storageErr.message}` };
    const { error } = await supabaseClient.from('document_templates').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },
  async getDocumentTemplateSignedUrl(filePath) {
    const { data, error } = await supabaseClient.storage.from('document-templates').createSignedUrl(filePath, 300);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },

  // ---- Catatan Disiplin (Teguran Lisan -> Teguran Tertulis -> SP1-SP3,
  // schema_80) -- RLS di server sudah menegakkan siapa boleh apa, fungsi
  // di sini murni pipa data, TIDAK menduplikasi aturan otorisasi (kalau
  // ada percobaan akses di luar wewenang, Supabase yang menolak).
  async listDisciplinaryRecords() {
    const { data, error } = await supabaseClient
      .from('disciplinary_records')
      .select('*, employees(full_name, employee_code, department_id, departments(name)), proposer:proposed_by_profile_id(full_name), decider:decided_by_profile_id(full_name)')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async getEmployeeActiveDisciplinaryLevel(employeeId) {
    const { data, error } = await supabaseClient
      .from('v_employee_active_disciplinary_level').select('*').eq('employee_id', employeeId).maybeSingle();
    if (error) throw new Error(error.message);
    return data || null;
  },
  async createDisciplinaryRecord(payload) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { error } = await supabaseClient.from('disciplinary_records').insert({
      employee_id: payload.employee_id,
      level: payload.level,
      category: payload.category,
      description: payload.description,
      incident_date: payload.incident_date,
      evidence_url: payload.evidence_url || null,
      status: payload.status || 'pending_hrd', // super_admin/hrd/pimpinan boleh langsung 'active'
      proposed_by_profile_id: user?.id || null,
    });
    return error ? { ok: false, error: friendlyDbError(error) } : { ok: true };
  },
  // status: 'active' (sahkan) | 'rejected' (tolak) | 'revoked' (cabut, hanya utk yg sudah aktif)
  async decideDisciplinaryRecord(id, { status, decision_notes, valid_until }) {
    const payload = { status, decision_notes: decision_notes || null };
    if (valid_until) payload.valid_until = valid_until; // override manual, kalau kosong dihitung otomatis oleh trigger
    const { error } = await supabaseClient.from('disciplinary_records').update(payload).eq('id', id);
    return error ? { ok: false, error: friendlyDbError(error) } : { ok: true };
  },
  async acknowledgeDisciplinaryRecord(id, note) {
    const { error } = await supabaseClient.from('disciplinary_records')
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_note: note || null }).eq('id', id);
    return error ? { ok: false, error: friendlyDbError(error) } : { ok: true };
  },
  async uploadDisciplinaryEvidence(employeeId, file) {
    if (!file) return { ok: false, error: 'Pilih file terlebih dahulu' };
    const path = `${employeeId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabaseClient.storage.from('disciplinary-evidence').upload(path, file, { upsert: false });
    if (error) return { ok: false, error: `Gagal unggah bukti: ${error.message}` };
    return { ok: true, path };
  },
  async getDisciplinaryEvidenceSignedUrl(filePath) {
    const { data, error } = await supabaseClient.storage.from('disciplinary-evidence').createSignedUrl(filePath, 300);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },

  // Untuk menu "Jenis Surat & Kriteria Penomoran" (DMS) -- lihat
  // schema_37. Kode/nama jenis surat sekarang data, bukan hardcode di
  // migrasi -- tapi FORMAT nomor surat (urut/kode/bulan-romawi/tahun)
  // tetap tetap, dan penomoran TETAP dibuat trigger server, bukan di
  // sini (client cuma baca daftar & kirim kode/nama baru, tidak pernah
  // kirim nomor surat).
  async listDocumentLetterTypes() {
    const { data, error } = await supabaseClient
      .from('document_letter_types').select('*').order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async createDocumentLetterType({ typeKey, typeCode, name }) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { error } = await supabaseClient.from('document_letter_types').insert({
      type_key: typeKey, type_code: typeCode, name, created_by_profile_id: user?.id,
    });
    if (error) return { ok: false, error: friendlyDbError(error) };
    return { ok: true };
  },
  async setDocumentLetterTypeActive(id, isActive) {
    const { error } = await supabaseClient.from('document_letter_types').update({ is_active: isActive }).eq('id', id);
    if (error) return { ok: false, error: friendlyDbError(error) };
    return { ok: true };
  },
  // Edit jenis surat -- SENGAJA cuma kirim type_code & name. type_key
  // TIDAK pernah dikirim dari sini: dia FK dari generated_documents.
  // document_type & document_templates.document_type_key (schema_37).
  // RLS document_letter_types_update (super_admin) sudah ada sejak
  // schema_37 dan tidak membatasi per-kolom -- kalau type_key masih
  // dipakai dokumen/template, FK constraint di server yang menolak
  // percobaan ubah type_key lewat jalur lain (mis. panggilan API
  // langsung di luar UI ini); baris yang belum pernah dipakai TIDAK
  // terlindungi FK itu -- kalau ini jadi perhatian, tim Supabase perlu
  // pertimbangkan trigger tambahan yang menolak perubahan type_key
  // secara eksplisit di level DB, bukan cuma mengandalkan UI mengunci
  // field-nya.
  async updateDocumentLetterType({ id, typeCode, name }) {
    const { error } = await supabaseClient.from('document_letter_types')
      .update({ type_code: typeCode, name }).eq('id', id);
    if (error) return { ok: false, error: friendlyDbError(error) };
    return { ok: true };
  },

  // ---- Unit Pengeluar Surat (schema_85) -- pola identik document_letter_types.
  async listDocumentIssuingUnits() {
    const { data, error } = await supabaseClient
      .from('document_issuing_units').select('*').order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async createDocumentIssuingUnit({ code, name }) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { error } = await supabaseClient.from('document_issuing_units').insert({
      code, name, created_by_profile_id: user?.id,
    });
    if (error) return { ok: false, error: friendlyDbError(error) };
    return { ok: true };
  },
  async updateDocumentIssuingUnit({ id, code, name }) {
    const { error } = await supabaseClient.from('document_issuing_units')
      .update({ code, name }).eq('id', id);
    if (error) return { ok: false, error: friendlyDbError(error) };
    return { ok: true };
  },
  async setDocumentIssuingUnitActive(id, isActive) {
    const { error } = await supabaseClient.from('document_issuing_units').update({ is_active: isActive }).eq('id', id);
    if (error) return { ok: false, error: friendlyDbError(error) };
    return { ok: true };
  },

  async listEmployeeHistory(employeeId) {
    const { data, error } = await supabaseClient.from('employee_history').select('*').eq('employee_id', employeeId).order('effective_date', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async createEmployeeHistory({ employeeId, eventType, description, decreeNumber, effectiveDate }) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { error } = await supabaseClient.from('employee_history').insert({
      employee_id: employeeId, event_type: eventType, description,
      decree_number: decreeNumber || null, effective_date: effectiveDate,
      recorded_by_profile_id: user?.id ?? null,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  // Riwayat TERSTRUKTUR (schema_42) — beda dari listEmployeeHistory di
  // atas: kolom apa adanya (posisi/departemen/gaji per baris dengan
  // rentang tanggal), diisi OTOMATIS oleh trigger DB saat employees/
  // employee_payroll berubah. Fungsi ini murni baca; tidak ada
  // createEmployeePositionHistory/createEmployeeSalaryHistory karena
  // baris ditulis oleh trigger, bukan dari frontend (lihat schema_42).
  async listEmployeePositionHistory(employeeId) {
    const { data, error } = await supabaseClient
      .from('employee_position_history')
      .select('*')
      .eq('employee_id', employeeId)
      .order('effective_date', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },
  async listEmployeeSalaryHistory(employeeId) {
    const { data, error } = await supabaseClient
      .from('employee_salary_history')
      .select('*')
      .eq('employee_id', employeeId)
      .order('effective_date', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Memanggil Edge Function generate-document (mail-merge template
  // docx/pdf + data pegawai) — pakai authedFetch yang SAMA dengan
  // create-user/reset-password/dst, bukan pola baru. Hasilnya otomatis
  // tercatat di generated_documents oleh function itu sendiri, jadi di
  // sisi frontend cukup tampilkan hasilnya (result.document).
  async generateDocumentFromTemplate({ templateId, employeeId, documentType, issuingUnitId }) {
    return authedFetch('generate-document', { templateId, employeeId, documentType, issuingUnitId });
  },

  // Strategi hemat storage #3 (schema_56): hapus file fisik hasil
  // generate yang sudah lewat masa retensi (default 30 hari) --
  // baris & document_number tetap ada untuk audit, cuma file
  // binernya dibuang. Hanya super_admin/hrd (ditegakkan di sisi Edge
  // Function juga, bukan cuma disembunyikan di UI).
  async cleanupGeneratedDocuments(retentionDays = 30) {
    return authedFetch('cleanup-generated-documents', { retentionDays });
  },

  // Trigger notify_leave_request_changes/notify_performance_review_changes
  // (schema_18) yang mengisi tabel ini otomatis — dataService di sini
  // cuma query/update biasa, tidak ada logic notifikasi di frontend.
  async listNotifications(limit = 20) {
    const { data, error } = await supabaseClient.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return data || [];
  },
  async getUnreadNotificationCount() {
    const { count, error } = await supabaseClient.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false);
    if (error) throw new Error(error.message);
    return count || 0;
  },
  async markNotificationRead(id) {
    const { error } = await supabaseClient.from('notifications').update({ is_read: true }).eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  },
  async markAllNotificationsRead() {
    const { error } = await supabaseClient.from('notifications').update({ is_read: true }).eq('is_read', false);
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  // ─── Push Notification (Web Push / VAPID) ─────────────────────────
  // Lihat public/js/registerServiceWorker.js untuk registrasi SW, dan
  // supabase/functions/send-push-notification untuk sisi pengirim.
  // Penerimanya (siapa dapat notif apa) ditentukan SELALU oleh trigger
  // DB (schema_68), BUKAN dipanggil dari sini -- fungsi-fungsi di bawah
  // HANYA mengelola pendaftaran subscription milik device ini sendiri.

  isPushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && !!window.VAPID_PUBLIC_KEY;
  },

  async getPushSubscriptionStatus() {
    if (!this.isPushSupported()) return 'unsupported';
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'subscribed' : 'unsubscribed';
  },

  // VAPID public key dikirim browser sebagai base64url, PushManager
  // butuh Uint8Array -- konversi standar yang dipakai di semua contoh
  // resmi Web Push (MDN, web.dev).
  _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  },

  async subscribeToPush(profileId) {
    if (!this.isPushSupported()) return { ok: false, error: 'Push notification tidak didukung di perangkat/browser ini.' };
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true, // wajib true -- Chrome menolak subscribe tanpa ini
          applicationServerKey: this._urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY),
        });
      }
      const json = sub.toJSON();
      // upsert berbasis endpoint (bukan insert biasa) -- lihat komentar
      // di schema_67_push_subscriptions.sql: endpoint browser yang sama
      // bisa berubah, tapi kalau BELUM berubah dan user klik "aktifkan"
      // dua kali (mis. reload halaman), insert biasa akan gagal karena
      // endpoint UNIQUE.
      const { error } = await supabaseClient.from('push_subscriptions').upsert({
        profile_id: profileId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (e) {
      // Kasus paling umum: user menolak izin notifikasi di prompt browser
      // (e.name === 'NotAllowedError') -- pesan digeneralisasi supaya
      // tetap jelas tanpa mengasumsikan penyebab pastinya.
      return { ok: false, error: 'Gagal mengaktifkan notifikasi: ' + (e.message || e.name || 'penyebab tidak diketahui') };
    }
  },

  async unsubscribeFromPush() {
    if (!('serviceWorker' in navigator)) return { ok: true };
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return { ok: true };
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      // Best-effort -- kalau baris di DB gagal terhapus, Edge Function
      // tetap akan membersihkannya sendiri di kiriman berikutnya (baca
      // status 404/410 dari push service, lihat send-push-notification).
      const { error } = await supabaseClient.from('push_subscriptions').delete().eq('endpoint', endpoint);
      if (error) console.warn('[Push] Unsubscribe di browser sukses, tapi gagal hapus dari DB:', error.message);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  },

  // ============================================================
  // Kartu "Tugas" di tab Cek (schema_108, 2026-09-01) -- SEBELUMNYA
  // localStorage per-device (lihat catatan panjang di migrasi), sekarang
  // tabel employee_tasks sungguhan. RLS (employee_tasks_select/insert/
  // update/delete) sudah meniru persis canManageCekTugas() di
  // daily-tasks.js -- kode di sini TIDAK re-implementasi cek otorisasi,
  // cukup panggil apa adanya & serahkan penolakan ke database (pola sama
  // seperti listShifts/listPositions di file ini).
  // ============================================================
  async listEmployeeTasks(employeeId) {
    const { data, error } = await supabaseClient
      .from('employee_tasks').select('*').eq('employee_id', employeeId).order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async createEmployeeTask(employeeId, payload) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { error } = await supabaseClient.from('employee_tasks').insert({
      employee_id: employeeId,
      name: payload.name,
      given_by: payload.givenBy,
      deadline: payload.deadline,
      description: payload.description || null,
      created_by_profile_id: user?.id || null,
    });
    if (error) return { ok: false, error: friendlyDbError(error) };
    return { ok: true };
  },

  async updateEmployeeTask(taskId, payload) {
    const { data, error } = await supabaseClient.from('employee_tasks').update({
      name: payload.name, given_by: payload.givenBy, deadline: payload.deadline, description: payload.description || null,
    }).eq('id', taskId).select('id');
    if (error) return { ok: false, error: friendlyDbError(error) };
    if (!data || !data.length) return { ok: false, error: 'Tidak ada perubahan tersimpan -- kemungkinan Anda tidak berwenang mengubah tugas ini (RLS menolak baris ini secara diam-diam)' };
    return { ok: true };
  },

  async deleteEmployeeTask(taskId) {
    const { data, error } = await supabaseClient.from('employee_tasks').delete().eq('id', taskId).select('id');
    if (error) return { ok: false, error: friendlyDbError(error) };
    if (!data || !data.length) return { ok: false, error: 'Tugas tidak terhapus -- kemungkinan Anda tidak berwenang menghapus tugas ini (RLS menolak baris ini secara diam-diam)' };
    return { ok: true };
  },

  // ============================================================
  // Database Santri (schema_110) -- modul BERDIRI SENDIRI, tidak
  // terhubung ke employees/SISAF. RLS (student_database_records_*)
  // meniru STUDENT_DB_ACCESS_ROLES (super_admin/hrd) -- kode di sini
  // TIDAK re-implementasi cek otorisasi, sama seperti employee_tasks
  // di atas.
  // ============================================================
  async listStudentDbRecords() {
    const { data, error } = await supabaseClient
      .from('student_database_records').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async getStudentDbRecord(id) {
    const { data, error } = await supabaseClient.from('student_database_records').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data || null;
  },

  async createStudentDbRecord(payload) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { data, error } = await supabaseClient.from('student_database_records')
      .insert({ ...payload, created_by_profile_id: user?.id || null, updated_by_profile_id: user?.id || null })
      .select('id').single();
    if (error) return { ok: false, error: friendlyDbError(error) };
    return { ok: true, id: data.id };
  },

  async updateStudentDbRecord(id, payload) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { data, error } = await supabaseClient.from('student_database_records')
      .update({ ...payload, updated_by_profile_id: user?.id || null })
      .eq('id', id).select('id');
    if (error) return { ok: false, error: friendlyDbError(error) };
    if (!data || !data.length) return { ok: false, error: 'Tidak ada perubahan tersimpan -- kemungkinan Anda tidak berwenang mengubah data ini (RLS menolak baris ini secara diam-diam)' };
    return { ok: true, id };
  },

  async deleteStudentDbRecord(id) {
    const { data, error } = await supabaseClient.from('student_database_records').delete().eq('id', id).select('id');
    if (error) return { ok: false, error: friendlyDbError(error) };
    if (!data || !data.length) return { ok: false, error: 'Data tidak terhapus -- kemungkinan Anda tidak berwenang menghapus data ini (RLS menolak baris ini secara diam-diam)' };
    return { ok: true };
  },

  // Bucket PRIVAT (bukan public) -- KK/Akte Kelahiran adalah dokumen
  // pribadi sensitif, diakses lewat signed URL, pola sama seperti
  // employee-photos/disciplinary-evidence di atas. Bucket ini BELUM
  // dibuat di Supabase Dashboard -- lihat catatan storage bucket di
  // migrasi schema_110 & PENDING_ACTIONS.md.
  async uploadStudentDbAttachment(id, kind, file) {
    if (!file) return { ok: false, error: 'Pilih file terlebih dahulu' };
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${id}/${kind}-${crypto.randomUUID()}-${safeName}`;
    const { error: uploadErr } = await supabaseClient.storage.from('student-database-attachments').upload(path, file, { upsert: false });
    if (uploadErr) return { ok: false, error: `Gagal unggah file: ${uploadErr.message}` };
    const column = kind === 'kk' ? 'lampiran_kk_path' : 'lampiran_akte_path';
    const { error: updateErr } = await supabaseClient.from('student_database_records').update({ [column]: path }).eq('id', id);
    if (updateErr) {
      await supabaseClient.storage.from('student-database-attachments').remove([path]);
      return { ok: false, error: `File ter-unggah tapi gagal disimpan ke data: ${updateErr.message}` };
    }
    return { ok: true, path };
  },

  async getStudentDbAttachmentUrl(id, kind) {
    const record = await this.getStudentDbRecord(id);
    const path = kind === 'kk' ? record?.lampiran_kk_path : record?.lampiran_akte_path;
    if (!path) return null;
    const { data, error } = await supabaseClient.storage.from('student-database-attachments').createSignedUrl(path, 300);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },
};
