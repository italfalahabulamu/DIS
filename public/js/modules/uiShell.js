// ============================================================
// uiShell.js -- render shell minimal: login, lalu daftar+form
// Catatan Perkembangan. SATU modul MVP saja -- Data Induk Santri,
// Kehadiran, dan modul lain BELUM punya UI, hanya skema DB.
//
// Pola delegasi data-onclick (bukan onclick= inline) mengikuti aturan
// CSP proyek saudara (dataku2026, tests/no_inline_event_handlers.test.js).
// ============================================================
import { login, logout, restoreSession, getCurrentProfile, isLoggedIn } from './auth.js';
import { listCatatan, tambahCatatan, daftarKategori, labelKategori } from './catatanPerkembangan.js';

const app = document.getElementById('app');

export async function boot() {
  app.addEventListener('click', handleDelegatedClick);
  app.addEventListener('submit', handleDelegatedSubmit);

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
  app.innerHTML = `
    <header class="topbar">
      <span>${escapeHtml(profile.nama_lengkap)} &middot; ${escapeHtml(profile.role)}</span>
      <button data-action="logout">Keluar</button>
    </header>
    <main>
      <h2>Catatan Perkembangan</h2>
      ${profile.role === 'ustadz' || profile.role === 'musyrif'
        ? renderFormCatatan()
        : ''}
      <div id="daftar-catatan">Memuat...</div>
    </main>
  `;
  await muatDaftarCatatan();
}

function renderFormCatatan() {
  return `
    <form data-form="catatan" class="catatan-form">
      <label>ID Santri
        <input type="text" name="santri_id" placeholder="UUID santri" required>
      </label>
      <label>Kategori
        <select name="kategori">
          ${daftarKategori().map(k => `<option value="${k.value}">${escapeHtml(k.label)}</option>`).join('')}
        </select>
      </label>
      <label>Catatan
        <textarea name="isi" required rows="3" placeholder="Tulis perkembangan santri..."></textarea>
      </label>
      <button type="submit">Simpan</button>
      <p class="hint">Catatan: form ini belum punya pencarian nama santri (perlu modul Data Induk Santri, belum ada UI). Sementara isi UUID santri langsung.</p>
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
    try {
      await tambahCatatan({
        santriId: fd.get('santri_id'),
        kategori: fd.get('kategori'),
        isi: fd.get('isi'),
        dicatatOleh: getCurrentProfile().id,
      });
      e.target.reset();
      await muatDaftarCatatan();
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
