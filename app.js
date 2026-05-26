// ============================================================
// NAVEGACIÓN Y LOGIN PRINCIPAL — app.js
// ============================================================

const ADMIN_EMAIL = 'sudescansovital@gmail.com';

const USUARIOS = {
  'alberto@aurum.com': {
    pass:'aurum2026', nombre:'Alberto F.', nick:'Roderas',
    animal:'🦅', pack:'Pack Águila · Etapa 3', packLevel:3,
    etapa:3, ciclo:2, ozt:247
  },
  'demo@aurum.com': {
    pass:'hormiga2026', nombre:'Usuario Demo', nick:'León Demo',
    animal:'🐂', pack:'Pack Hormiga · Etapa 1', packLevel:1,
    etapa:1, ciclo:1, ozt:11
  },
  'sudescansovital@gmail.com': {
    pass:'admin2026', nombre:'Roderas', nick:'Roderas',
    animal:'🦅', pack:'Pack Águila · Etapa 3', packLevel:3,
    etapa:3, ciclo:2, ozt:247
  },
};

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

function hacerLogin() {
  const email = (document.getElementById('login-email').value||'').trim().toLowerCase();
  const pass  = (document.getElementById('login-pass').value||'').trim();
  const err   = document.getElementById('login-err');
  if (!USUARIOS[email]) { err.textContent='Email no reconocido.'; return; }
  if (USUARIOS[email].pass !== pass) { err.textContent='Contraseña incorrecta.'; return; }
  usuarioActual = { email, ...USUARIOS[email] };
  err.textContent = '';
  cerrarLogin();
  document.getElementById('nav-login-btn').style.display = 'none';
  document.getElementById('nav-user-widget').style.display = 'flex';
  document.getElementById('nav-animal').textContent = usuarioActual.animal;
  document.getElementById('nav-uname').textContent  = usuarioActual.nick || usuarioActual.nombre;
  document.getElementById('nav-upack').textContent  = usuarioActual.pack;
  const adminLink = document.getElementById('nav-admin-link');
  if (adminLink) adminLink.style.display = email === ADMIN_EMAIL ? 'inline' : 'none';
  const adminEmailLabel = document.getElementById('admin-email-label');
  if (adminEmailLabel) adminEmailLabel.textContent = email;
  irA(email === ADMIN_EMAIL ? 'admin' : 'dashboard');
}

function hacerLogout() {
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
  if (pagina === 'gestion' && typeof actualizarDashboard === 'function') {
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

document.addEventListener('DOMContentLoaded', () => {
  const p = document.getElementById('login-pass');
  const e = document.getElementById('login-email');
  if (p) p.addEventListener('keydown', ev => { if(ev.key==='Enter') hacerLogin(); });
  if (e) e.addEventListener('keydown', ev => { if(ev.key==='Enter') p.focus(); });

  // Auto-login temporal como alberto@aurum.com para cargar datos
  const _autoEmail = 'alberto@aurum.com';
  usuarioActual = { email: _autoEmail, ...USUARIOS[_autoEmail] };
  document.getElementById('nav-login-btn').style.display   = 'none';
  document.getElementById('nav-user-widget').style.display = 'flex';
  document.getElementById('nav-animal').textContent = usuarioActual.animal;
  document.getElementById('nav-uname').textContent  = usuarioActual.nick;
  document.getElementById('nav-upack').textContent  = usuarioActual.pack;
  const _adminLink = document.getElementById('nav-admin-link');
  if (_adminLink) _adminLink.style.display = 'none';

  mostrarPagina('home');

  setTimeout(function() {
    if (!sb) {
      console.log('[APP] sb es null a los 2000ms — llamando initSupabase()');
      if (typeof initSupabase === 'function') initSupabase();
    } else {
      console.log('[APP] sb listo a los 2000ms — llamando cargarDatosUsuario()');
      if (typeof cargarDatosUsuario === 'function') cargarDatosUsuario();
    }
  }, 2000);
});
