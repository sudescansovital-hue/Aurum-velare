// ============================================================
// ADMIN — Panel de administración Aurum Velare
// Acceso: sudescansovital@gmail.com únicamente
// ============================================================
// SQL para crear la tabla en Supabase (ejecutar una sola vez):
//
// CREATE TABLE IF NOT EXISTS usuarios_aurum (
//   id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   email            TEXT UNIQUE NOT NULL,
//   pack             TEXT DEFAULT 'hormiga',
//   etapa            INTEGER DEFAULT 1,
//   cuenta_mt5       TEXT DEFAULT '',
//   activo           BOOLEAN DEFAULT true,
//   fecha_expiracion DATE,
//   codigo_eval      TEXT DEFAULT '',
//   notas            TEXT DEFAULT '',
//   created_at       TIMESTAMPTZ DEFAULT NOW(),
//   updated_at       TIMESTAMPTZ DEFAULT NOW()
// );
// ALTER TABLE usuarios_aurum ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "service_role_all" ON usuarios_aurum USING (true) WITH CHECK (true);

const ADMIN_EMAIL = 'sudescansovital@gmail.com';
var adminUsuarios  = [];
var adminEditId    = null;

var PACK_PRECIOS = { hormiga:97, toro:197, aguila:297, leon:397, demo:0 };
var PACK_LABELS  = { hormiga:'Hormiga', toro:'Toro', aguila:'Águila', leon:'León', demo:'Demo' };

function esAdmin() {
  return usuarioActual && usuarioActual.email === ADMIN_EMAIL;
}

async function init_admin() {
  if (!esAdmin()) { irA('home'); return; }
  if (!sb) { setTimeout(init_admin, 600); return; }
  await cargarUsuariosAdmin();
}

// ── Carga y render ──────────────────────────────────────────

async function cargarUsuariosAdmin() {
  var tbody = document.getElementById('admin-tabla-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">Cargando...</td></tr>';

  var res = await sb.from('usuarios_aurum').select('*').order('created_at', { ascending: false });
  if (res.error) {
    console.error('Admin error:', res.error);
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="color:var(--red);padding:1rem;">Error: ' + res.error.message + '</td></tr>';
    return;
  }
  adminUsuarios = res.data || [];
  renderAdminTabla();
  renderAdminStats();
  poblarSelectCodigo();
}

function renderAdminTabla() {
  var tbody = document.getElementById('admin-tabla-body');
  if (!tbody) return;
  if (!adminUsuarios.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">Sin usuarios registrados</td></tr>';
    return;
  }
  var hoy = new Date();
  tbody.innerHTML = adminUsuarios.map(function(u) {
    var expirado = u.fecha_expiracion && new Date(u.fecha_expiracion) < hoy;
    var activo   = u.activo && !expirado;
    var exp      = u.fecha_expiracion ? new Date(u.fecha_expiracion + 'T12:00:00').toLocaleDateString('es-ES') : 'Sin límite';
    var estadoHtml = activo
      ? '<span style="color:var(--green);font-size:12px;">● Activo</span>'
      : '<span style="color:var(--red);font-size:12px;">● ' + (expirado ? 'Expirado' : 'Inactivo') + '</span>';
    var packLabel = PACK_LABELS[u.pack] || u.pack || '—';
    var th = 'padding:.65rem .9rem;font-size:13px;';
    return '<tr style="border-bottom:1px solid var(--border);" onmouseover="this.style.background=\'#0E1020\'" onmouseout="this.style.background=\'\'">' +
      '<td style="' + th + 'color:var(--text-dim);">' + (u.email || '—') + '</td>' +
      '<td style="' + th + '"><span style="color:var(--gold);">' + packLabel + '</span></td>' +
      '<td style="' + th + 'color:var(--text-muted);">Etapa ' + (u.etapa || 1) + '</td>' +
      '<td style="' + th + 'color:var(--text-muted);font-size:12px;">' + (u.cuenta_mt5 || '—') + '</td>' +
      '<td style="' + th + 'font-size:12px;color:' + (expirado ? 'var(--red)' : 'var(--text-muted)') + ';">' + exp + '</td>' +
      '<td style="' + th + '">' + estadoHtml + '</td>' +
      '<td style="' + th + '">' +
        '<button onclick="adminAbrirEditar(\'' + u.id + '\')" style="font-size:11px;padding:.3rem .8rem;background:transparent;border:1px solid var(--border-gold);color:var(--gold);cursor:pointer;letter-spacing:.05em;">Editar</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function renderAdminStats() {
  var hoy = new Date();
  var activos = adminUsuarios.filter(function(u) {
    return u.activo && (!u.fecha_expiracion || new Date(u.fecha_expiracion) >= hoy);
  });
  var ingresos = activos.reduce(function(s, u) {
    return s + (PACK_PRECIOS[u.pack] || 0);
  }, 0);

  function set(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
  set('admin-stat-total',    adminUsuarios.length);
  set('admin-stat-activos',  activos.length);
  set('admin-stat-inactivos', adminUsuarios.length - activos.length);
  set('admin-stat-ingresos', ingresos + '€/mes');
}

function poblarSelectCodigo() {
  var sel = document.getElementById('admin-codigo-email');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Asignar a usuario —</option>' +
    adminUsuarios.map(function(u) {
      return '<option value="' + u.email + '">' + u.email + '</option>';
    }).join('');
}

// ── Filtro tabla ────────────────────────────────────────────

function adminFiltrarTabla(q) {
  q = q.toLowerCase();
  document.querySelectorAll('#admin-tabla-body tr').forEach(function(row) {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ── Modal edición ───────────────────────────────────────────

function adminAbrirEditar(id) {
  var u = adminUsuarios.find(function(x) { return x.id === id; });
  if (!u) return;
  adminEditId = id;

  var set = function(elId, val) { var e = document.getElementById(elId); if (e) e.value = val; };
  document.getElementById('admin-edit-email').textContent = u.email;
  set('admin-edit-pack',   u.pack    || 'hormiga');
  set('admin-edit-etapa',  u.etapa   || 1);
  set('admin-edit-mt5',    u.cuenta_mt5 || '');
  set('admin-edit-exp',    u.fecha_expiracion ? u.fecha_expiracion.split('T')[0] : '');
  set('admin-edit-notas',  u.notas   || '');
  document.getElementById('admin-edit-activo').checked = !!u.activo;
  document.getElementById('admin-modal').style.display = 'flex';
}

function adminCerrarModal() {
  document.getElementById('admin-modal').style.display = 'none';
  adminEditId = null;
}

async function adminGuardarUsuario() {
  if (!adminEditId || !sb) return;
  var btn = document.getElementById('admin-guardar-btn');
  if (btn) { btn.textContent = 'Guardando...'; btn.disabled = true; }

  var datos = {
    pack:             document.getElementById('admin-edit-pack').value,
    etapa:            parseInt(document.getElementById('admin-edit-etapa').value) || 1,
    cuenta_mt5:       document.getElementById('admin-edit-mt5').value.trim(),
    fecha_expiracion: document.getElementById('admin-edit-exp').value || null,
    activo:           document.getElementById('admin-edit-activo').checked,
    notas:            document.getElementById('admin-edit-notas').value.trim(),
    updated_at:       new Date().toISOString()
  };

  var res = await sb.from('usuarios_aurum').update(datos).eq('id', adminEditId);
  if (btn) { btn.textContent = '✦ Guardar cambios'; btn.disabled = false; }
  if (res.error) { showToast('Error: ' + res.error.message); return; }
  adminCerrarModal();
  showToast('Usuario actualizado');
  await cargarUsuariosAdmin();
}

// ── Añadir usuario ──────────────────────────────────────────

async function adminCrearUsuario() {
  if (!sb) return;
  var email = (document.getElementById('admin-nuevo-email').value || '').trim().toLowerCase();
  var pack  = document.getElementById('admin-nuevo-pack').value;
  var mt5   = (document.getElementById('admin-nuevo-mt5').value || '').trim();
  var exp   = document.getElementById('admin-nuevo-exp').value || null;
  if (!email || !email.includes('@')) { showToast('Email inválido'); return; }

  var res = await sb.from('usuarios_aurum').insert({
    email: email, pack: pack, etapa: 1, activo: true, cuenta_mt5: mt5, fecha_expiracion: exp
  });
  if (res.error) {
    showToast(res.error.message.includes('unique') ? 'Email ya registrado' : 'Error: ' + res.error.message);
    return;
  }
  document.getElementById('admin-nuevo-email').value = '';
  document.getElementById('admin-nuevo-mt5').value   = '';
  document.getElementById('admin-nuevo-exp').value   = '';
  showToast('Usuario ' + email + ' creado');
  await cargarUsuariosAdmin();
}

// ── Generador de códigos ────────────────────────────────────

function adminGenerarCodigo() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var parte = function() {
    var s = '';
    for (var i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };
  var codigo = parte() + '-' + parte();
  var el = document.getElementById('admin-codigo-result');
  if (el) { el.textContent = codigo; el.style.display = 'block'; }
}

async function adminGuardarCodigo() {
  if (!sb) return;
  var codigo = (document.getElementById('admin-codigo-result').textContent || '').trim();
  var email  = document.getElementById('admin-codigo-email').value;
  if (!codigo || !email) { showToast('Genera un código y elige un usuario'); return; }

  var res = await sb.from('usuarios_aurum').update({ codigo_eval: codigo, updated_at: new Date().toISOString() }).eq('email', email);
  if (res.error) { showToast('Error: ' + res.error.message); return; }
  showToast('Código ' + codigo + ' asignado a ' + email);
  await cargarUsuariosAdmin();
}

function adminCopiarCodigo() {
  var codigo = (document.getElementById('admin-codigo-result').textContent || '').trim();
  if (!codigo) return;
  navigator.clipboard.writeText(codigo).then(function() { showToast('Código copiado'); });
}
