// ============================================================
// NAVEGACIÓN Y LOGIN PRINCIPAL — app.js
// ============================================================

const ADMIN_EMAIL = 'sudescansovital@gmail.com';
const PAGINAS_PRIVADAS = ['dashboard', 'gestion', 'admin'];
let usuarioActual = null;

const ANIMAL_EMOJI = {
  hormiga: '🐜', leon: '🦁', elefante: '🐘',
  oso: '🐻', toro: '🐂', lobo: '🐺', aguila: '🦅'
};

function abrirLogin() {
  document.getElementById('login-overlay').classList.add('visible');
  setTimeout(() => { const e = document.getElementById('login-email'); if (e) e.focus(); }, 100);
}

function cerrarLogin() {
  document.getElementById('login-overlay').classList.remove('visible');
  document.getElementById('login-err').textContent = '';
  const re = document.getElementById('registro-err');
  if (re) re.textContent = '';
}

function mostrarFormLogin() {
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('registro-form').style.display = 'none';
  document.getElementById('tab-login').style.color = 'var(--gold-bright)';
  document.getElementById('tab-login').style.borderBottom = '1px solid var(--gold)';
  document.getElementById('tab-login').style.marginBottom = '-1px';
  document.getElementById('tab-registro').style.color = 'var(--text-muted)';
  document.getElementById('tab-registro').style.borderBottom = 'none';
  document.getElementById('tab-registro').style.marginBottom = '0';
}

function mostrarFormRegistro() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('registro-form').style.display = 'block';
  document.getElementById('tab-registro').style.color = 'var(--gold-bright)';
  document.getElementById('tab-registro').style.borderBottom = '1px solid var(--gold)';
  document.getElementById('tab-registro').style.marginBottom = '-1px';
  document.getElementById('tab-login').style.color = 'var(--text-muted)';
  document.getElementById('tab-login').style.borderBottom = 'none';
  document.getElementById('tab-login').style.marginBottom = '0';
}

async function hacerLogin() {
  const email = (document.getElementById('login-email').value || '').trim().toLowerCase();
  const pass  = (document.getElementById('login-pass').value  || '').trim();
  const err   = document.getElementById('login-err');
  if (!email || !pass) { err.textContent = 'Introduce email y contraseña.'; return; }
  if (!sb) { err.textContent = 'Conectando...'; return; }
  err.textContent = 'Accediendo...';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { err.textContent = 'Email o contraseña incorrectos.'; return; }
  await _aplicarSesionAuth(data.user);
}

async function hacerRegistro() {
  const email  = (document.getElementById('reg-email').value  || '').trim().toLowerCase();
  const pass   = (document.getElementById('reg-pass').value   || '').trim();
  const nick   = (document.getElementById('reg-nick').value   || '').trim();
  const animal = document.getElementById('reg-animal').value;
  const err    = document.getElementById('registro-err');
  if (!email || !pass || !nick || !animal) { err.textContent = 'Rellena todos los campos.'; return; }
  if (pass.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
  if (!sb) { err.textContent = 'Conectando...'; return; }
  err.style.color = 'var(--red)';
  err.textContent = 'Creando cuenta...';
  const { data, error } = await sb.auth.signUp({ email, password: pass });
  if (error) {
    err.textContent = error.message === 'User already registered'
      ? 'Ese email ya está registrado.' : error.message;
    return;
  }
  // Crear entrada en usuarios_aurum
  // Nota: la tabla debe tener columnas nick TEXT y animal TEXT
  await sb.from('usuarios_aurum').upsert({ email, nick, animal, pack: 'demo' }, { onConflict: 'email' });
  if (data.user) {
    await _aplicarSesionAuth(data.user);
  } else {
    err.style.color = 'var(--green)';
    err.textContent = '✦ Cuenta creada. Revisa tu email para confirmar.';
  }
}

async function _aplicarSesionAuth(authUser) {
  if (!authUser) return;
  const email = authUser.email;
  let userData = null;
  if (sb) {
    const { data } = await sb.from('usuarios_aurum').select('*').eq('email', email).single();
    userData = data;
  }
  // Entrada por defecto para el admin si no existe en la tabla
  if (!userData && email === ADMIN_EMAIL) {
    userData = { email, nick: 'Roderas', animal: 'aguila', pack: 'Pack Águila · Etapa 3' };
    if (sb) await sb.from('usuarios_aurum').upsert(userData, { onConflict: 'email' });
  }
  const nick   = userData?.nick   || email.split('@')[0];
  const animal = userData?.animal || 'hormiga';
  const pack   = userData?.pack   || 'demo';
  usuarioActual = { email, nick, animal, pack, emoji: ANIMAL_EMOJI[animal] || '✦' };
  cerrarLogin();
  document.getElementById('nav-login-btn').style.display   = 'none';
  document.getElementById('nav-user-widget').style.display = 'flex';
  document.getElementById('nav-animal').textContent = usuarioActual.emoji;
  document.getElementById('nav-uname').textContent  = usuarioActual.nick;
  document.getElementById('nav-upack').textContent  = usuarioActual.pack;
  const adminLink = document.getElementById('nav-admin-link');
  if (adminLink) adminLink.style.display = email === ADMIN_EMAIL ? 'inline' : 'none';
  const adminEmailLabel = document.getElementById('admin-email-label');
  if (adminEmailLabel) adminEmailLabel.textContent = email;
  irA(email === ADMIN_EMAIL ? 'admin' : 'dashboard');
  if (typeof cargarDatosUsuario === 'function') cargarDatosUsuario();
}

// Llamado desde supabase.js tras inicializar sb
async function restaurarSesion() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await _aplicarSesionAuth(session.user);
    return;
  }
  // Auto-login solo para el admin (conveniencia de desarrollo)
  const { data } = await sb.auth.signInWithPassword({ email: ADMIN_EMAIL, password: 'admin2026' });
  if (data?.user) await _aplicarSesionAuth(data.user);
}

async function hacerLogout() {
  if (sb) await sb.auth.signOut();
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
    if (msg) { msg.style.display = 'block'; }
    return;
  }
  const msg = document.getElementById('access-msg');
  if (msg) msg.style.display = 'none';
  mostrarPagina(pagina);
  if (typeof window['init_' + pagina] === 'function') window['init_' + pagina]();
  if (pagina === 'gestion' && typeof actualizarDashboard === 'function') {
    setTimeout(actualizarDashboard, 300);
  }
}

function mostrarPagina(pagina) {
  document.querySelectorAll('.page-content').forEach(p => { p.style.display = 'none'; });
  const page = document.getElementById('page-' + pagina);
  if (page) { page.style.display = 'block'; window.scrollTo(0, 0); }
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    const oc = link.getAttribute('onclick') || '';
    if (oc.includes("'" + pagina + "'")) link.classList.add('active');
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
  t._t = setTimeout(() => { t.style.opacity = '0'; }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  const p = document.getElementById('login-pass');
  const e = document.getElementById('login-email');
  if (p) p.addEventListener('keydown', ev => { if (ev.key === 'Enter') hacerLogin(); });
  if (e) e.addEventListener('keydown', ev => { if (ev.key === 'Enter') p.focus(); });
  const rp = document.getElementById('reg-pass');
  if (rp) rp.addEventListener('keydown', ev => { if (ev.key === 'Enter') hacerRegistro(); });
  mostrarPagina('home');
});
