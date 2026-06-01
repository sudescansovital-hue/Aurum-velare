// ============================================================
// NAVEGACIÓN Y LOGIN PRINCIPAL — app.js
// ============================================================

const ADMIN_EMAIL = 'roderastrader@gmail.com';

const PAGINAS_PRIVADAS = ['dashboard','gestion','admin'];
let usuarioActual = null;

function abrirLogin() {
  document.getElementById('login-overlay').classList.add('visible');
  setTimeout(() => { const e=document.getElementById('login-email'); if(e) e.focus(); }, 100);
}

function cerrarLogin() {
  document.getElementById('login-overlay').classList.remove('visible');
  document.getElementById('login-err').textContent = '';
}

async function _activarSesion(email) {
  const perfil = await supaGet('usuarios_aurum', 'email=eq.' + encodeURIComponent(email) + '&limit=1', getToken());
  if (perfil.error || !perfil.data || !perfil.data.length) return false;
  const u = perfil.data[0];

  const packMap  = { umbral:'Pack Umbral', raiz:'Pack Raíz', senda:'Pack Senda', cima:'Pack Cima', demo:'Pack Demo' };
  const animalMap = { umbral:'🐝', raiz:'🌱', senda:'🦅', cima:'🦁', demo:'🐂' };

  usuarioActual = {
    email:      email,
    nombre:     u.nombre || email.split('@')[0],
    nick:       u.nombre || email.split('@')[0],
    animal:     animalMap[u.pack] || '✦',
    animalSala: u.animal || null,
    pack:       packMap[u.pack] || u.pack || 'Sin pack',
    packLevel:  u.etapa || 1,
    etapa:      u.etapa || 1,
    activo:     u.activo
  };

  document.getElementById('nav-login-btn').style.display = 'none';
  document.getElementById('nav-user-widget').style.display = 'flex';
  document.getElementById('nav-animal').textContent = usuarioActual.animal;
  document.getElementById('nav-uname').textContent  = usuarioActual.nick;
  document.getElementById('nav-upack').textContent  = usuarioActual.pack;
  const adminLink = document.getElementById('nav-admin-link');
  if (adminLink) adminLink.style.display = email === ADMIN_EMAIL ? 'inline' : 'none';
  const adminEmailLabel = document.getElementById('admin-email-label');
  if (adminEmailLabel) adminEmailLabel.textContent = email;
  return true;
}

async function hacerLogin() {
  const email = (document.getElementById('login-email').value||'').trim().toLowerCase();
  const pass  = (document.getElementById('login-pass').value||'').trim();
  const err   = document.getElementById('login-err');
  if (!email || !pass) { err.textContent='Completa email y contraseña.'; return; }

  const auth = await signInWithPassword(email, pass);
  if (auth.error) { err.textContent = auth.error; return; }

  const ok = await _activarSesion(email);
  if (!ok) { err.textContent = 'Usuario no encontrado en el sistema.'; return; }

  err.textContent = '';
  cerrarLogin();
  irA(email === ADMIN_EMAIL ? 'admin' : 'dashboard');
}

async function hacerLogout() {
  await signOut();
  usuarioActual = null;
  document.getElementById('nav-user-widget').style.display = 'none';
  document.getElementById('nav-login-btn').style.display   = 'block';
  const adminLink = document.getElementById('nav-admin-link');
  if (adminLink) adminLink.style.display = 'none';
  irA('home');
}

function irA(pagina) {
  if (PAGINAS_PRIVADAS.includes(pagina) && !usuarioActual) {
    mostrarPagina('packs');
    const msg = document.getElementById('access-msg');
    if (msg) { msg.style.display='block'; }
    return;
  }
  const msg = document.getElementById('access-msg');
  if (msg) msg.style.display = 'none';
  mostrarPagina(pagina);
  if (typeof window['init_'+pagina] === 'function') window['init_'+pagina]();
  if ((pagina === 'gestion' || pagina === 'dashboard') && typeof actualizarDashboard === 'function') {
    setTimeout(actualizarDashboard, 300);
  }
}

function mostrarPagina(pagina) {
  document.querySelectorAll('.page-content').forEach(p => { p.style.display='none'; });
  const page = document.getElementById('page-'+pagina);
  if (page) { page.style.display='block'; window.scrollTo(0,0); }
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    const oc = link.getAttribute('onclick')||'';
    if (oc.includes("'"+pagina+"'")) link.classList.add('active');
  });
}

function showToast(msg) {
  let t = document.getElementById('toast-msg');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast-msg';
    t.style.cssText = 'position:fixed;bottom:2rem;right:2rem;background:var(--bg2);border:1px solid var(--border-gold);padding:.8rem 1.5rem;font-size:14px;color:var(--gold-bright);z-index:200;';
    document.body.appendChild(t);
  }
  t.textContent = '✦ ' + msg;
  t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity='0'; }, 3000);
}

// ── Recovery de contraseña ───────────────────────────────────

var _recoveryToken = null;

function checkRecoveryToken() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  if (params.get('type') !== 'recovery') return false;
  _recoveryToken = params.get('access_token');
  if (!_recoveryToken) return false;
  history.replaceState(null, '', window.location.pathname);
  document.getElementById('recovery-overlay').style.display = 'flex';
  return true;
}

async function hacerResetPassword() {
  const pass1 = document.getElementById('recovery-pass1').value;
  const pass2 = document.getElementById('recovery-pass2').value;
  const err   = document.getElementById('recovery-err');
  if (!pass1 || pass1.length < 6) { err.textContent = 'Mínimo 6 caracteres.'; return; }
  if (pass1 !== pass2)            { err.textContent = 'Las contraseñas no coinciden.'; return; }
  err.textContent = '';

  const r = await fetch(SUPA_URL + '/auth/v1/user', {
    method: 'PUT',
    headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + _recoveryToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pass1 })
  });
  if (!r.ok) {
    const e = await r.json();
    err.textContent = e.message || 'Error al actualizar la contraseña.'; return;
  }
  _recoveryToken = null;
  document.getElementById('recovery-overlay').style.display = 'none';
  showToast('Contraseña actualizada — inicia sesión');
  abrirLogin();
}

// ── Supabase init + dashboard loader ────────────────────────

function initSupabase() {}

async function actualizarDashboard() {
  if (!usuarioActual || !usuarioActual.email) return;
  var token = getToken();
  var params = 'usuario_email=eq.' + encodeURIComponent(usuarioActual.email) + '&order=created_at.asc&limit=5000';
  var res = await supaGet('trades', params, token);
  if (res.error || !res.data) {
    console.error('[DASHBOARD] Error cargando trades:', res.error);
    return;
  }
  window.AURUM_TRADES = { todos: res.data };
  if (typeof buildDashboardHero       === 'function') buildDashboardHero();
  if (typeof buildTradeRecord         === 'function') buildTradeRecord();
  if (typeof buildCicloDots           === 'function') buildCicloDots();
  if (typeof buildHorarios            === 'function') buildHorarios();
  if (typeof buildEquity              === 'function') buildEquity();
  if (typeof buildCumplimiento        === 'function') buildCumplimiento();
  if (typeof buildEstadisticasAvanzadas === 'function') buildEstadisticasAvanzadas();
}

// ── Init ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const p = document.getElementById('login-pass');
  const e = document.getElementById('login-email');
  if (p) p.addEventListener('keydown', ev => { if(ev.key==='Enter') hacerLogin(); });
  if (e) e.addEventListener('keydown', ev => { if(ev.key==='Enter') p.focus(); });

  if (checkRecoveryToken()) return;

  const stored = await loadStoredSession();
  if (stored && stored.user && stored.user.email) {
    const ok = await _activarSesion(stored.user.email);
    if (ok) { irA('dashboard'); return; }
  }
  mostrarPagina('home');
});
