// ============================================================
// ADMIN — aurum-3.5
// Gestión de usuarios_aurum con fetch nativo
// Requiere: supabase.js + auth.js cargados antes
// ============================================================

// ── Listar usuarios ─────────────────────────────────────────

async function adminListarUsuarios() {
  var res = await supaGet('usuarios_aurum', 'order=fecha_entrada.desc', getToken());
  if (res.error) { console.error('[ADMIN] listar:', res.error); return []; }
  return res.data || [];
}

// ── Crear usuario ────────────────────────────────────────────
// Crea la cuenta Auth + el registro en usuarios_aurum

async function adminCrearUsuario(email, password, nombre, notas) {
  // 1. Crear cuenta en Supabase Auth
  var authRes = await supaAuthPost('/signup', { email, password });
  if (authRes.error) return { error: 'Auth signup: ' + authRes.error };

  // 2. Insertar en usuarios_aurum
  var dbRes = await supaPost('usuarios_aurum', {
    email:  email,
    nombre: nombre || email,
    etapa:  0,
    notas:  notas  || ''
  }, 'return=representation', getToken());

  if (dbRes.error) return { error: 'DB insert: ' + dbRes.error };
  return { data: dbRes.data, error: null };
}

// ── Cambiar etapa ─────────────────────────────────────────────

async function adminCambiarEtapa(id, etapa) {
  var etapaNum = parseInt(etapa);
  if (isNaN(etapaNum) || etapaNum < 0 || etapaNum > 3) {
    return { error: 'Etapa debe ser 0, 1, 2 o 3' };
  }
  var res = await supaPatch(
    'usuarios_aurum',
    'id=eq.' + id,
    { etapa: etapaNum },
    getToken()
  );
  if (res.error) return { error: res.error };
  return { data: res.data, error: null };
}

// ── Borrar usuario ────────────────────────────────────────────
// Borra el registro de usuarios_aurum.
// Para borrar también la cuenta Auth se necesita service_role key.

async function adminBorrarUsuario(id) {
  var res = await supaDelete('usuarios_aurum', 'id=eq.' + id, getToken());
  if (res.error) return { error: res.error };
  return { error: null };
}

// ── Render panel ─────────────────────────────────────────────

async function adminRenderPanel(contenedorId) {
  var el = document.getElementById(contenedorId);
  if (!el) return;

  el.innerHTML = '<p style="color:#888;">Cargando...</p>';
  var usuarios = await adminListarUsuarios();

  if (!usuarios.length) {
    el.innerHTML = '<p style="color:#888;">Sin usuarios registrados.</p>';
    return;
  }

  var filas = usuarios.map(function(u) {
    return '<tr data-id="' + u.id + '">' +
      '<td>' + (u.email || '—') + '</td>' +
      '<td>' + (u.nombre || '—') + '</td>' +
      '<td>' +
        '<select onchange="adminCambiarEtapa(\'' + u.id + '\', this.value).then(function(){ adminRenderPanel(\'' + contenedorId + '\'); })">' +
        [0,1,2,3].map(function(n) {
          return '<option value="' + n + '"' + (u.etapa === n ? ' selected' : '') + '>' + n + '</option>';
        }).join('') +
        '</select>' +
      '</td>' +
      '<td>' + (u.fecha_entrada ? new Date(u.fecha_entrada).toLocaleDateString('es-ES') : '—') + '</td>' +
      '<td><button onclick="adminBorrarUsuario(\'' + u.id + '\').then(function(){ adminRenderPanel(\'' + contenedorId + '\'); })">Borrar</button></td>' +
    '</tr>';
  }).join('');

  el.innerHTML =
    '<table style="width:100%;border-collapse:collapse;">' +
      '<thead><tr>' +
        '<th style="text-align:left;padding:.4rem .6rem;">Email</th>' +
        '<th style="text-align:left;padding:.4rem .6rem;">Nombre</th>' +
        '<th style="text-align:left;padding:.4rem .6rem;">Etapa</th>' +
        '<th style="text-align:left;padding:.4rem .6rem;">Entrada</th>' +
        '<th></th>' +
      '</tr></thead>' +
      '<tbody>' + filas + '</tbody>' +
    '</table>' +
    '<hr>' +
    '<h3>Crear usuario</h3>' +
    '<div id="admin-form" style="display:flex;flex-direction:column;gap:.5rem;max-width:360px;">' +
      '<input id="af-email"    placeholder="Email"       style="padding:.4rem;">' +
      '<input id="af-pass"     placeholder="Contraseña"  type="password" style="padding:.4rem;">' +
      '<input id="af-nombre"   placeholder="Nombre"      style="padding:.4rem;">' +
      '<input id="af-notas"    placeholder="Notas"       style="padding:.4rem;">' +
      '<button onclick="adminFormCrear(\'' + contenedorId + '\')">Crear</button>' +
      '<div id="af-msg" style="font-size:13px;"></div>' +
    '</div>';
}

async function adminFormCrear(contenedorId) {
  var email  = (document.getElementById('af-email').value  || '').trim();
  var pass   = (document.getElementById('af-pass').value   || '').trim();
  var nombre = (document.getElementById('af-nombre').value || '').trim();
  var notas  = (document.getElementById('af-notas').value  || '').trim();
  var msg    = document.getElementById('af-msg');

  if (!email || !pass) { msg.textContent = 'Email y contraseña requeridos.'; return; }

  msg.textContent = 'Creando...';
  var res = await adminCrearUsuario(email, pass, nombre, notas);
  if (res.error) { msg.style.color = 'red'; msg.textContent = res.error; return; }
  msg.style.color = 'green'; msg.textContent = 'Usuario creado.';
  setTimeout(function() { adminRenderPanel(contenedorId); }, 800);
}
