// ============================================================
// uiShell.js -- render shell: login, dashboard per role.
// Modul MVP yang sudah tersambung: Data Induk Santri (admin),
// Catatan Perkembangan (ustadz/musyrif tulis, semua role login baca
// sesuai RLS). Kehadiran menyusul di bawah. Nilai/SPP/Pelanggaran/
// Perizinan/Kesehatan (Rilis 2) belum punya UI.
//
// KNOWN LIMITATION: role tanpa akses SELECT ke suatu tabel (mis.
// keuangan_spp ke catatan_perkembangan) akan melihat pesan "belum
// ada data" yang sama seperti kalau datanya memang kosong -- RLS
// menolak diam-diam di level query, UI tidak membedakan "ditolak"
// vs "kosong". Cukup untuk MVP, perlu dibenahi kalau jadi keluhan
// pengguna nyata.
//
// Pola delegasi data-onclick (bukan onclick= inline) mengikuti aturan
// CSP proyek saudara (dataku2026, tests/no_inline_event_handlers.test.js).
// ============================================================
import { login, logout, restoreSession, getCurrentProfile, isLoggedIn } from './auth.js';
import { listCatatan, tambahCatatan, daftarKategori, labelKategori } from './catatanPerkembangan.js';
import { listSantri, cariSantriUntukPicker, tambahSantri } from './santri.js';
import { listKehadiran, catatKehadiran, daftarStatus, labelStatus, listKelas } from './kehadiran.js';
import { listMataPelajaran, listNilai, inputNilai } from './nilai.js';
import { listPelanggaran, catatPelanggaran, listJenisPelanggaran, daftarKategoriPelanggaran, labelKategoriPelanggaran,
         listPrestasi, catatPrestasi, daftarTingkatPrestasi } from './pelanggaran.js';
import { listPerizinan, ajukanPerizinan, ubahStatusPerizinan, daftarJenisPerizinan, labelJenisPerizinan, labelStatusPerizinan } from './perizinan.js';
import { markupPickerSantri } from './santriPickerHelper.js';

const app = document.getElementById('app');

export async function boot() {
  app.addEventListener('click', handleDelegatedClick);
  app.addEventListener('submit', handleDelegatedSubmit);
  app.addEventListener('input', handleDelegatedInput);

  const profile = await restoreSession().catch(() => null);
  if (profile) {
    renderDashboard(profile);
  } else {
    renderLogin();
  }
}

function renderLogin(errorMsg) {
  app.innerHTML = `
    <div class="login-box">
      <h1>DIS -- Sistem Informasi Santri</h1>
      <p class="subtitle">Pesantren Modern Al-Falah Abu Lam U</p>
      ${errorMsg ? `<p class="error">${escapeHtml(errorMsg)}</p>` : ''}
      <form data-form="login">
        <label>Email<input type="email" name="email" required></label>
        <label>Password<input type="password" name="password" required></label>
        <button type="submit">Masuk</button>
      </form>
    </div>
  `;
}

async function renderDashboard(profile) {
  const bisaCatatKehadiran = profile.role === 'ustadz' || profile.role === 'admin';
  const bisaCatat = profile.role === 'ustadz' || profile.role === 'musyrif';
  const bisaInputNilai = profile.role === 'ustadz' || profile.role === 'admin';
  const bisaAjukanPerizinan = profile.role === 'wali';
  const bisaApprovePerizinan = profile.role === 'admin';

  let kelasList = [];
  let mapelList = [];
  if (bisaCatatKehadiran) kelasList = await listKelas().catch(() => []);
  if (bisaInputNilai) mapelList = await listMataPelajaran().catch(() => []);

  app.innerHTML = `
    <header class="topbar">
      <span>${escapeHtml(profile.nama_lengkap)} &middot; ${escapeHtml(profile.role)}</span>
      <button data-action="logout">Keluar</button>
    </header>
    <main>
      ${profile.role === 'admin' ? renderAdminSantri() : ''}

      <h2>Kehadiran</h2>
      ${bisaCatatKehadiran ? renderFormKehadiran(kelasList) : ''}
      <div id="daftar-kehadiran">Memuat...</div>

      <h2>Nilai</h2>
      ${bisaInputNilai ? renderFormNilai(kelasList, mapelList) : ''}
      <div id="daftar-nilai">Memuat...</div>

      <h2>Pelanggaran &amp; Prestasi</h2>
      ${bisaCatat || profile.role === 'admin' ? renderFormPelanggaranPrestasi() : ''}
      <div id="daftar-pelanggaran">Memuat...</div>
      <div id="daftar-prestasi">Memuat...</div>

      <h2>Perizinan</h2>
      ${bisaAjukanPerizinan ? renderFormPerizinan() : ''}
      <div id="daftar-perizinan">Memuat...</div>

      <h2>Catatan Perkembangan</h2>
      ${bisaCatat ? renderFormCatatan() : ''}
      <div id="daftar-catatan">Memuat...</div>
    </main>
  `;
  await muatDaftarCatatan();
  await muatDaftarKehadiran();
  await muatDaftarNilai();
  await muatDaftarPelanggaran();
  await muatDaftarPrestasi();
  await muatDaftarPerizinan(profile);
  if (profile.role === 'admin') await muatDaftarSantri();
}

function renderAdminSantri() {
  return `
    <section class="admin-santri">
      <h2>Data Induk Santri</h2>
      <form data-form="tambah-santri" class="santri-form">
        <label>NIS<input type="text" name="nis" required></label>
        <label>Nama Lengkap<input type="text" name="nama_lengkap" required></label>
        <label>Tanggal Lahir<input type="date" name="tanggal_lahir"></label>
        <label>Jenis Kelamin
          <select name="jenis_kelamin">
            <option value="">-</option>
            <option value="L">Laki-laki</option>
            <option value="P">Perempuan</option>
          </select>
        </label>
        <label>Tanggal Masuk<input type="date" name="tanggal_masuk" required></label>
        <button type="submit">Tambah Santri</button>
      </form>
      <div id="daftar-santri">Memuat...</div>
    </section>
  `;
}

async function muatDaftarSantri() {
  const el = document.getElementById('daftar-santri');
  if (!el) return;
  try {
    const rows = await listSantri();
    el.innerHTML = rows.length === 0
      ? '<p>Belum ada santri terdaftar.</p>'
      : `<ul class="santri-list">${rows.map(s => `
          <li>${escapeHtml(s.nama_lengkap)} &middot; NIS ${escapeHtml(s.nis)} &middot; ${escapeHtml(s.status)}</li>
        `).join('')}</ul>`;
  } catch (err) {
    el.innerHTML = `<p class="error">Gagal memuat: ${escapeHtml(err.message)}</p>`;
  }
}

function renderFormKehadiran(kelasList) {
  if (kelasList.length === 0) {
    return '<p class="hint">Belum ada kelas terdaftar (atau Anda belum ditugaskan ke kelas manapun) -- tidak bisa catat kehadiran.</p>';
  }
  return `
    <form data-form="kehadiran" class="kehadiran-form">
      <label>Kelas
        <select name="kelas_id" required>
          ${kelasList.map(k => `<option value="${k.id}">${escapeHtml(k.nama_kelas)} (${escapeHtml(k.tahun_ajaran)})</option>`).join('')}
        </select>
      </label>
      <label>Tanggal
        <input type="date" name="tanggal" required value="${new Date().toISOString().slice(0, 10)}">
      </label>
      <label>Cari Santri
        <input type="text" name="santri_search" placeholder="Ketik nama santri..." autocomplete="off">
        <div class="picker-hasil"></div>
      </label>
      <input type="hidden" name="santri_id">
      <p class="hint santri-terpilih-label"></p>
      <label>Status
        <select name="status">
          ${daftarStatus().map(s => `<option value="${s.value}">${escapeHtml(s.label)}</option>`).join('')}
        </select>
      </label>
      <label>Catatan (opsional)<input type="text" name="catatan"></label>
      <button type="submit">Simpan Kehadiran</button>
    </form>
  `;
}

async function muatDaftarKehadiran() {
  const el = document.getElementById('daftar-kehadiran');
  if (!el) return;
  try {
    const rows = await listKehadiran();
    el.innerHTML = rows.length === 0
      ? '<p>Belum ada data kehadiran.</p>'
      : `<ul class="kehadiran-list">${rows.slice(0, 20).map(r => `
          <li>${escapeHtml(r.tanggal)} &middot; ${escapeHtml(r.santri?.nama_lengkap || '-')} &middot; <strong>${escapeHtml(labelStatus(r.status))}</strong></li>
        `).join('')}</ul>`;
  } catch (err) {
    el.innerHTML = `<p class="error">Gagal memuat: ${escapeHtml(err.message)}</p>`;
  }
}

function renderFormNilai(kelasList, mapelList) {
  if (kelasList.length === 0 || mapelList.length === 0) {
    return '<p class="hint">Belum ada kelas/mata pelajaran tersedia untuk Anda.</p>';
  }
  return `
    <form data-form="nilai" class="nilai-form">
      ${markupPickerSantri()}
      <label>Kelas
        <select name="kelas_id" required>
          ${kelasList.map(k => `<option value="${k.id}">${escapeHtml(k.nama_kelas)}</option>`).join('')}
        </select>
      </label>
      <label>Mata Pelajaran
        <select name="mata_pelajaran_id" required>
          ${mapelList.map(m => `<option value="${m.id}">${escapeHtml(m.nama_mapel)} (KKM ${m.kkm})</option>`).join('')}
        </select>
      </label>
      <label>Semester
        <select name="semester">
          <option value="ganjil">Ganjil</option>
          <option value="genap">Genap</option>
        </select>
      </label>
      <label>Tahun Ajaran<input type="text" name="tahun_ajaran" placeholder="2026/2027" required></label>
      <label>Nilai (0-100)<input type="number" name="nilai_angka" min="0" max="100" step="0.01" required></label>
      <label>Predikat (opsional)<input type="text" name="predikat"></label>
      <button type="submit">Simpan Nilai</button>
    </form>
  `;
}

async function muatDaftarNilai() {
  const el = document.getElementById('daftar-nilai');
  if (!el) return;
  try {
    const rows = await listNilai();
    el.innerHTML = rows.length === 0
      ? '<p>Belum ada data nilai.</p>'
      : `<ul class="nilai-list">${rows.slice(0, 20).map(r => `
          <li>${escapeHtml(r.santri?.nama_lengkap || '-')} &middot; ${escapeHtml(r.mata_pelajaran?.nama_mapel || '-')} &middot;
              <strong>${r.nilai_angka}</strong> ${r.predikat ? `(${escapeHtml(r.predikat)})` : ''}
              &middot; ${escapeHtml(r.semester)} ${escapeHtml(r.tahun_ajaran)}</li>
        `).join('')}</ul>`;
  } catch (err) {
    el.innerHTML = `<p class="error">Gagal memuat: ${escapeHtml(err.message)}</p>`;
  }
}

function renderFormPelanggaranPrestasi() {
  return `
    <form data-form="pelanggaran" class="pelanggaran-form">
      <h3>Catat Pelanggaran</h3>
      ${markupPickerSantri()}
      <label>Tanggal<input type="date" name="tanggal" required value="${new Date().toISOString().slice(0, 10)}"></label>
      <label>Kategori
        <select name="kategori">
          ${daftarKategoriPelanggaran().map(k => `<option value="${k.value}">${escapeHtml(k.label)}</option>`).join('')}
        </select>
      </label>
      <label>Poin<input type="number" name="poin" min="0" required></label>
      <label>Deskripsi<textarea name="deskripsi" rows="2"></textarea></label>
      <button type="submit">Simpan Pelanggaran</button>
      <p class="hint">Katalog jenis pelanggaran (jenis_pelanggaran) masih kosong -- form ini input manual kategori+poin, belum pakai dropdown katalog.</p>
    </form>
    <form data-form="prestasi" class="prestasi-form">
      <h3>Catat Prestasi</h3>
      ${markupPickerSantri()}
      <label>Tanggal<input type="date" name="tanggal" required value="${new Date().toISOString().slice(0, 10)}"></label>
      <label>Kategori
        <select name="kategori">
          <option value="akademik">Akademik</option>
          <option value="non_akademik">Non-Akademik</option>
        </select>
      </label>
      <label>Tingkat
        <select name="tingkat">
          ${daftarTingkatPrestasi().map(t => `<option value="${t.value}">${escapeHtml(t.label)}</option>`).join('')}
        </select>
      </label>
      <label>Deskripsi<textarea name="deskripsi" rows="2" required></textarea></label>
      <button type="submit">Simpan Prestasi</button>
    </form>
  `;
}

async function muatDaftarPelanggaran() {
  const el = document.getElementById('daftar-pelanggaran');
  if (!el) return;
  try {
    const rows = await listPelanggaran();
    el.innerHTML = rows.length === 0
      ? '<p>Belum ada data pelanggaran.</p>'
      : `<ul class="pelanggaran-list">${rows.slice(0, 10).map(r => `
          <li>${escapeHtml(r.tanggal)} &middot; ${escapeHtml(r.santri?.nama_lengkap || '-')} &middot;
              ${escapeHtml(labelKategoriPelanggaran(r.kategori))} (${r.poin} poin)</li>
        `).join('')}</ul>`;
  } catch (err) {
    el.innerHTML = `<p class="error">Gagal memuat: ${escapeHtml(err.message)}</p>`;
  }
}

async function muatDaftarPrestasi() {
  const el = document.getElementById('daftar-prestasi');
  if (!el) return;
  try {
    const rows = await listPrestasi();
    el.innerHTML = rows.length === 0
      ? '<p>Belum ada data prestasi.</p>'
      : `<ul class="prestasi-list">${rows.slice(0, 10).map(r => `
          <li>${escapeHtml(r.tanggal)} &middot; ${escapeHtml(r.santri?.nama_lengkap || '-')} &middot; ${escapeHtml(r.deskripsi)}</li>
        `).join('')}</ul>`;
  } catch (err) {
    el.innerHTML = `<p class="error">Gagal memuat: ${escapeHtml(err.message)}</p>`;
  }
}

function renderFormPerizinan() {
  return `
    <form data-form="perizinan" class="perizinan-form">
      ${markupPickerSantri({ label: 'Cari Santri (anak Anda)' })}
      <label>Jenis
        <select name="jenis">
          ${daftarJenisPerizinan().map(j => `<option value="${j.value}">${escapeHtml(j.label)}</option>`).join('')}
        </select>
      </label>
      <label>Tanggal Mulai<input type="date" name="tanggal_mulai" required></label>
      <label>Tanggal Selesai<input type="date" name="tanggal_selesai" required></label>
      <label>Alasan<textarea name="alasan" rows="2"></textarea></label>
      <button type="submit">Ajukan Izin</button>
    </form>
  `;
}

async function muatDaftarPerizinan(profile) {
  const el = document.getElementById('daftar-perizinan');
  if (!el) return;
  try {
    const rows = await listPerizinan();
    const bisaApprove = profile.role === 'admin';
    el.innerHTML = rows.length === 0
      ? '<p>Belum ada pengajuan izin.</p>'
      : `<ul class="perizinan-list">${rows.slice(0, 10).map(r => `
          <li>
            ${escapeHtml(r.santri?.nama_lengkap || '-')} &middot; ${escapeHtml(labelJenisPerizinan(r.jenis))}
            &middot; ${escapeHtml(r.tanggal_mulai)} s.d. ${escapeHtml(r.tanggal_selesai)}
            &middot; <strong>${escapeHtml(labelStatusPerizinan(r.status))}</strong>
            ${bisaApprove && r.status === 'menunggu' ? `
              <button type="button" data-action="setujui-izin" data-izin-id="${r.id}">Setujui</button>
              <button type="button" data-action="tolak-izin" data-izin-id="${r.id}">Tolak</button>
            ` : ''}
          </li>
        `).join('')}</ul>`;
  } catch (err) {
    el.innerHTML = `<p class="error">Gagal memuat: ${escapeHtml(err.message)}</p>`;
  }
}

function renderFormCatatan() {
  return `
    <form data-form="catatan" class="catatan-form">
      <label>Cari Santri
        <input type="text" name="santri_search" placeholder="Ketik nama santri..." autocomplete="off">
        <div class="picker-hasil"></div>
      </label>
      <input type="hidden" name="santri_id">
      <p class="hint santri-terpilih-label"></p>
      <label>Kategori
        <select name="kategori">
          ${daftarKategori().map(k => `<option value="${k.value}">${escapeHtml(k.label)}</option>`).join('')}
        </select>
      </label>
      <label>Catatan
        <textarea name="isi" required rows="3" placeholder="Tulis perkembangan santri..."></textarea>
      </label>
      <button type="submit">Simpan</button>
    </form>
  `;
}

async function muatDaftarCatatan() {
  const el = document.getElementById('daftar-catatan');
  try {
    const rows = await listCatatan();
    if (rows.length === 0) {
      el.innerHTML = '<p>Belum ada catatan perkembangan.</p>';
      return;
    }
    el.innerHTML = `<ul class="catatan-list">${rows.map(r => `
      <li>
        <strong>${escapeHtml(r.tanggal)}</strong> &middot; ${escapeHtml(labelKategori(r.kategori))}
        <br>${escapeHtml(r.isi)}
        <br><small>oleh ${escapeHtml(r.users?.nama_lengkap || '-')}</small>
      </li>
    `).join('')}</ul>`;
  } catch (err) {
    el.innerHTML = `<p class="error">Gagal memuat: ${escapeHtml(err.message)}</p>`;
  }
}

async function handleDelegatedClick(e) {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'logout') {
    await logout();
    renderLogin();
  }
  const pickHasil = e.target.closest('[data-pick-santri]');
  if (pickHasil) {
    const form = pickHasil.closest('form');
    const label = pickHasil.closest('.picker-hasil').closest('label');
    const nama = pickHasil.dataset.nama;
    const nis = pickHasil.dataset.nis;
    form.querySelector('[name="santri_id"]').value = pickHasil.dataset.pickSantri;
    label.querySelector('[name="santri_search"]').value = nama;
    label.querySelector('.picker-hasil').innerHTML = '';
    const terpilihEl = form.querySelector('.santri-terpilih-label');
    if (terpilihEl) terpilihEl.textContent = `Terpilih: ${nama} (NIS ${nis})`;
  }

  const izinBtn = e.target.closest('[data-action="setujui-izin"], [data-action="tolak-izin"]');
  if (izinBtn) {
    const status = izinBtn.dataset.action === 'setujui-izin' ? 'disetujui' : 'ditolak';
    try {
      await ubahStatusPerizinan(izinBtn.dataset.izinId, status);
      await muatDaftarPerizinan(getCurrentProfile());
    } catch (err) {
      alert(err.message); // eslint-disable-line no-alert
    }
  }
}

let pickerDebounce = null;
async function handleDelegatedInput(e) {
  if (e.target.name !== 'santri_search') return;
  clearTimeout(pickerDebounce);
  const q = e.target.value;
  const hasilEl = e.target.closest('label').querySelector('.picker-hasil');
  pickerDebounce = setTimeout(async () => {
    try {
      const hasil = await cariSantriUntukPicker(q);
      hasilEl.innerHTML = hasil.length === 0 ? '' : hasil.map(s => `
        <div class="picker-item" data-pick-santri="${s.id}" data-nama="${escapeHtml(s.nama_lengkap)}" data-nis="${escapeHtml(s.nis)}">
          ${escapeHtml(s.nama_lengkap)} <small>(NIS ${escapeHtml(s.nis)})</small>
        </div>
      `).join('');
    } catch (err) {
      hasilEl.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    }
  }, 300);
}

async function handleDelegatedSubmit(e) {
  const formType = e.target.dataset.form;
  if (!formType) return;
  e.preventDefault();
  const fd = new FormData(e.target);

  if (formType === 'login') {
    try {
      const profile = await login(fd.get('email'), fd.get('password'));
      renderDashboard(profile);
    } catch (err) {
      renderLogin(err.message);
    }
  }

  if (formType === 'catatan') {
    const santriId = fd.get('santri_id');
    if (!santriId) {
      alert('Pilih santri dari hasil pencarian dulu (ketik nama, klik salah satu hasil).'); // eslint-disable-line no-alert
      return;
    }
    try {
      await tambahCatatan({
        santriId,
        kategori: fd.get('kategori'),
        isi: fd.get('isi'),
        dicatatOleh: getCurrentProfile().id,
      });
      e.target.reset();
      const terpilihEl = e.target.querySelector('.santri-terpilih-label');
      if (terpilihEl) terpilihEl.textContent = '';
      await muatDaftarCatatan();
    } catch (err) {
      alert(err.message); // eslint-disable-line no-alert -- MVP, ganti toast nanti
    }
  }

  if (formType === 'kehadiran') {
    const santriId = fd.get('santri_id');
    if (!santriId) {
      alert('Pilih santri dari hasil pencarian dulu.'); // eslint-disable-line no-alert
      return;
    }
    try {
      await catatKehadiran({
        santriId,
        kelasId: fd.get('kelas_id'),
        tanggal: fd.get('tanggal'),
        status: fd.get('status'),
        catatan: fd.get('catatan'),
        dicatatOleh: getCurrentProfile().id,
      });
      e.target.reset();
      const terpilihEl = e.target.querySelector('.santri-terpilih-label');
      if (terpilihEl) terpilihEl.textContent = '';
      await muatDaftarKehadiran();
    } catch (err) {
      alert(err.message); // eslint-disable-line no-alert -- MVP, ganti toast nanti
    }
  }

  if (formType === 'nilai') {
    const santriId = fd.get('santri_id');
    if (!santriId) { alert('Pilih santri dulu.'); return; } // eslint-disable-line no-alert
    try {
      await inputNilai({
        santriId,
        kelasId: fd.get('kelas_id'),
        mataPelajaranId: fd.get('mata_pelajaran_id'),
        semester: fd.get('semester'),
        tahunAjaran: fd.get('tahun_ajaran'),
        nilaiAngka: fd.get('nilai_angka'),
        predikat: fd.get('predikat'),
        inputOleh: getCurrentProfile().id,
      });
      e.target.reset();
      const t = e.target.querySelector('.santri-terpilih-label'); if (t) t.textContent = '';
      await muatDaftarNilai();
    } catch (err) {
      alert(err.message); // eslint-disable-line no-alert
    }
  }

  if (formType === 'pelanggaran') {
    const santriId = fd.get('santri_id');
    if (!santriId) { alert('Pilih santri dulu.'); return; } // eslint-disable-line no-alert
    try {
      await catatPelanggaran({
        santriId,
        tanggal: fd.get('tanggal'),
        kategori: fd.get('kategori'),
        poin: fd.get('poin'),
        deskripsi: fd.get('deskripsi'),
      });
      e.target.reset();
      const t = e.target.querySelector('.santri-terpilih-label'); if (t) t.textContent = '';
      await muatDaftarPelanggaran();
    } catch (err) {
      alert(err.message); // eslint-disable-line no-alert
    }
  }

  if (formType === 'prestasi') {
    const santriId = fd.get('santri_id');
    if (!santriId) { alert('Pilih santri dulu.'); return; } // eslint-disable-line no-alert
    try {
      await catatPrestasi({
        santriId,
        tanggal: fd.get('tanggal'),
        kategori: fd.get('kategori'),
        deskripsi: fd.get('deskripsi'),
        tingkat: fd.get('tingkat'),
      });
      e.target.reset();
      const t = e.target.querySelector('.santri-terpilih-label'); if (t) t.textContent = '';
      await muatDaftarPrestasi();
    } catch (err) {
      alert(err.message); // eslint-disable-line no-alert
    }
  }

  if (formType === 'perizinan') {
    const santriId = fd.get('santri_id');
    if (!santriId) { alert('Pilih santri dulu.'); return; } // eslint-disable-line no-alert
    try {
      await ajukanPerizinan({
        santriId,
        jenis: fd.get('jenis'),
        tanggalMulai: fd.get('tanggal_mulai'),
        tanggalSelesai: fd.get('tanggal_selesai'),
        alasan: fd.get('alasan'),
        diajukanOleh: getCurrentProfile().wali_id,
      });
      e.target.reset();
      const t = e.target.querySelector('.santri-terpilih-label'); if (t) t.textContent = '';
      await muatDaftarPerizinan(getCurrentProfile());
    } catch (err) {
      alert(err.message); // eslint-disable-line no-alert
    }
  }

  if (formType === 'tambah-santri') {
    try {
      await tambahSantri({
        nis: fd.get('nis'),
        namaLengkap: fd.get('nama_lengkap'),
        tanggalLahir: fd.get('tanggal_lahir'),
        jenisKelamin: fd.get('jenis_kelamin'),
        tanggalMasuk: fd.get('tanggal_masuk'),
      });
      e.target.reset();
      await muatDaftarSantri();
    } catch (err) {
      alert(err.message); // eslint-disable-line no-alert -- MVP, ganti toast nanti
    }
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
