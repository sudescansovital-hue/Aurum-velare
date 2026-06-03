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

var adminUsuarios       = [];
var adminEditId         = null;
var adminHistorialesMap = {};

var PACK_PRECIOS = { umbral:77, raiz:111, senda:222, cima:333, demo:0 };
var PACK_LABELS  = { umbral:'Umbral', raiz:'Raíz', senda:'Senda', cima:'Cima', demo:'Demo' };

var ANIMAL_SALA = {
  '🐝': 'Sala Hormiga',
  '🦁': 'Sala León',
  '🐘': 'Sala Elefante',
  '🐻': 'Sala Oso',
  '🐂': 'Sala Toro',
  '🐺': 'Sala Lobo'
};

function adminActualizarSalaAsignada(animal) {
  var el = document.getElementById('admin-edit-sala-asignada');
  if (el) el.textContent = (animal && ANIMAL_SALA[animal]) ? ANIMAL_SALA[animal] + ' (auto)' : '—';
}

function esAdmin() {
  return usuarioActual && usuarioActual.email === ADMIN_EMAIL;
}

async function init_admin() {
  if (!esAdmin()) { irA('home'); return; }
  await cargarUsuariosAdmin();
}

// ── Carga y render ──────────────────────────────────────────

async function cargarUsuariosAdmin() {
  var tbody = document.getElementById('admin-tabla-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">Cargando...</td></tr>';

  var res = await supaGet('usuarios_aurum', 'order=created_at.desc');
  if (res.error) {
    console.error('Admin error:', res.error);
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="color:var(--red);padding:1rem;">Error: ' + res.error + '</td></tr>';
    return;
  }
  adminUsuarios = res.data || [];

  adminHistorialesMap = {};
  var emails = adminUsuarios.map(function(u) { return u.email; }).filter(Boolean);
  if (emails.length) {
    var tradesData = [];
    for (var i = 0; i < emails.length; i++) {
      var em = emails[i];
      var tUrl = 'https://rsrbxcvlnbwpiyhumqmt.supabase.co/rest/v1/historiales?usuario_email=eq.' + encodeURIComponent(em) + '&select=usuario_email,nombre,numero&limit=500';
      var tRes = await fetch(tUrl, {
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzcmJ4Y3ZsbmJ3cGl5aHVtcW10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzNTAsImV4cCI6MjA5NTIyMjM1MH0.DpcY9s7DK7l4qVHmint9HQIJK6icnwnfbGvQ-XH15mY',
          'Authorization': 'Bearer ' + getToken()
        }
      });
      if (tRes.ok) {
        var tData = await tRes.json();
        if (Array.isArray(tData)) tradesData = tradesData.concat(tData);
      }
    }
    console.log('[ADMIN] trades para adminHistorialesMap:', tradesData.length);
    tradesData.forEach(function(t) {
      var em = t.usuario_email; var n = (t.nombre || '').toLowerCase();
      if (!em || !n) return;
      if (!adminHistorialesMap[em]) adminHistorialesMap[em] = {};
      var val = t.numero || t.nombre;
      if (n.includes('maestra') && !adminHistorialesMap[em].Maestra) adminHistorialesMap[em].Maestra = val;
      if (n.includes('retos')   && !adminHistorialesMap[em].Retos)   adminHistorialesMap[em].Retos   = val;
      if (n.includes('prueba')  && !adminHistorialesMap[em].Prueba)  adminHistorialesMap[em].Prueba  = val;
    });
  }

  renderAdminTabla();
  renderAdminStats();
  poblarSelectCodigo();
}

function renderAdminTabla() {
  var tbody = document.getElementById('admin-tabla-body');
  if (!tbody) return;
  if (!adminUsuarios.length) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--text-muted);padding:2rem;">Sin usuarios registrados</td></tr>';
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
    var packLabel  = PACK_LABELS[u.pack] || u.pack || '—';
    var ANIMAL_NOMBRE = { '🐝':'Hormiga','🦁':'León','🐘':'Elefante','🐻':'Oso','🐂':'Toro','🐺':'Lobo' };
    var animalText = u.animal ? (ANIMAL_NOMBRE[u.animal] || u.animal.replace(/\p{Emoji}/gu, '').trim() || '—') : '—';
    var salaAuto   = (u.animal && ANIMAL_SALA[u.animal]) ? ANIMAL_SALA[u.animal] : '—';
    var salaExtra  = u.acceso_sala_extra ? '<span style="font-size:10px;color:#6A9AEE;margin-left:.3rem;">+' + u.acceso_sala_extra + '</span>' : '';
    var th = 'padding:.65rem .9rem;font-size:13px;';
    return '<tr style="border-bottom:1px solid var(--border);" onmouseover="this.style.background=\'#0E1020\'" onmouseout="this.style.background=\'\'">' +
      '<td style="' + th + 'color:var(--text-dim);">' + (u.email || '—') + '</td>' +
      '<td style="' + th + 'color:var(--text-dim);">' + (u.nombre || '—') + '</td>' +
      '<td style="' + th + '"><span style="color:var(--gold);">' + packLabel + '</span></td>' +
      '<td style="' + th + 'color:var(--text-muted);">' + animalText + '</td>' +
      '<td style="' + th + 'font-size:12px;color:var(--text-muted);">' + salaAuto + salaExtra + '</td>' +
      '<td style="' + th + 'color:var(--text-muted);">Etapa ' + (u.etapa || 1) + '</td>' +
      '<td style="' + th + 'color:var(--green);font-size:12px;">' + (u.cuenta_maestra || (adminHistorialesMap[u.email] && adminHistorialesMap[u.email]['Maestra']) || '—') + '</td>' +
      '<td style="' + th + 'color:#6A9AEE;font-size:12px;">'   + (u.cuenta_prueba  || (adminHistorialesMap[u.email] && adminHistorialesMap[u.email]['Prueba'])   || '—') + '</td>' +
      '<td style="' + th + 'color:#E8A84C;font-size:12px;">'   + (u.cuenta_retos   || (adminHistorialesMap[u.email] && adminHistorialesMap[u.email]['Retos'])    || '—') + '</td>' +
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
  set('admin-edit-pack',   u.pack    || 'umbral');
  set('admin-edit-etapa',  u.etapa   || 1);
  set('admin-edit-animal',      u.animal  || '');
  set('admin-edit-acceso-sala', u.acceso_sala_extra || '');
  set('admin-edit-maestra', u.cuenta_maestra || '');
  set('admin-edit-prueba',  u.cuenta_prueba  || '');
  set('admin-edit-retos',   u.cuenta_retos   || '');
  set('admin-edit-exp',         u.fecha_expiracion ? u.fecha_expiracion.split('T')[0] : '');
  set('admin-edit-notas',       u.notas   || '');
  document.getElementById('admin-edit-activo').checked = !!u.activo;
  adminActualizarSalaAsignada(u.animal || '');

  // Calcular días en proceso desde el primer trade del usuario
  var dpEl = document.getElementById('admin-edit-dias-proceso');
  if (dpEl) {
    dpEl.textContent = 'Días en proceso: calculando...';
    supaGet('trades', 'usuario_email=eq.' + encodeURIComponent(u.email) + '&order=created_at.asc&limit=1', getToken()).then(function(r) {
      if (r.data && r.data.length) {
        var t = r.data[0];
        var d = null;
        if (t.fp) { var m = String(t.fp).match(/(\d{4})\.(\d{2})\.(\d{2})/); if (m) d = new Date(+m[1], +m[2]-1, +m[3]); }
        if (!d && t.created_at) d = new Date(t.created_at);
        if (d) {
          var dias = Math.floor((new Date() - d) / 86400000);
          dpEl.textContent = 'Días en proceso: ' + dias + ' (primer trade: ' + d.toLocaleDateString('es-ES') + ')';
        } else {
          dpEl.textContent = 'Días en proceso: sin fecha en primer trade';
        }
      } else {
        dpEl.textContent = 'Días en proceso: sin trades registrados';
      }
    });
  }

  document.getElementById('admin-modal').style.display = 'flex';
}

function adminCerrarModal() {
  document.getElementById('admin-modal').style.display = 'none';
  adminEditId = null;
}

async function adminGuardarUsuario() {
  console.log('[ADMIN] adminGuardarUsuario llamado — adminEditId:', adminEditId);
  if (!adminEditId) { console.warn('[ADMIN] adminEditId es null, abortando'); return; }
  var btn = document.getElementById('admin-guardar-btn');
  if (btn) { btn.textContent = 'Guardando...'; btn.disabled = true; }

  var datos = {
    pack:             document.getElementById('admin-edit-pack').value,
    etapa:            parseInt(document.getElementById('admin-edit-etapa').value) || 1,
    animal:           document.getElementById('admin-edit-animal').value || null,
    acceso_sala_extra: document.getElementById('admin-edit-acceso-sala').value || null,
    cuenta_maestra:   document.getElementById('admin-edit-maestra').value.trim() || null,
    cuenta_prueba:    document.getElementById('admin-edit-prueba').value.trim()  || null,
    cuenta_retos:     document.getElementById('admin-edit-retos').value.trim()   || null,
    fecha_expiracion: document.getElementById('admin-edit-exp').value || null,
    activo:           document.getElementById('admin-edit-activo').checked,
    notas:            document.getElementById('admin-edit-notas').value.trim(),
    updated_at:       new Date().toISOString()
  };
  console.log('[ADMIN] datos a guardar:', JSON.stringify(datos));

  // Verify columns exist before attempting PATCH
  var colCheck = await supaGet('usuarios_aurum', 'limit=1', getToken());
  if (colCheck.data && colCheck.data[0]) {
    var cols = Object.keys(colCheck.data[0]);
    console.log('[ADMIN] columnas en usuarios_aurum:', cols);
    if (cols.indexOf('animal') === -1)           console.warn('[ADMIN] ⚠ columna "animal" NO existe — el PATCH fallará');
    if (cols.indexOf('acceso_sala_extra') === -1) console.warn('[ADMIN] ⚠ columna "acceso_sala_extra" NO existe — el PATCH fallará');
  } else {
    console.warn('[ADMIN] no se pudo verificar columnas:', colCheck.error);
  }

  try {
    var res = await supaPatch('usuarios_aurum', 'id=eq.' + adminEditId, datos);
    console.log('[ADMIN] supaPatch res.error (raw):', res.error);
    console.log('[ADMIN] supaPatch res.data:', res.data);

    if (btn) { btn.textContent = '✦ Guardar cambios'; btn.disabled = false; }

    if (res.error) {
      var errorMsg = res.error;
      try { var parsed = JSON.parse(res.error); errorMsg = parsed.message || parsed.error || res.error; } catch(e) {}
      console.error('[ADMIN] error Supabase parseado:', errorMsg);
      showToast('Error: ' + errorMsg);
      return;
    }
    adminCerrarModal();
    showToast('Usuario actualizado');
    await cargarUsuariosAdmin();
  } catch (err) {
    console.error('[ADMIN] excepción en adminGuardarUsuario:', err);
    if (btn) { btn.textContent = '✦ Guardar cambios'; btn.disabled = false; }
    showToast('Error inesperado — ver consola');
  }
}

// ── Añadir usuario ──────────────────────────────────────────

async function adminCrearUsuario() {
  var email = (document.getElementById('admin-nuevo-email').value || '').trim().toLowerCase();
  var pack  = document.getElementById('admin-nuevo-pack').value;
  var mt5   = (document.getElementById('admin-nuevo-mt5').value || '').trim();
  var exp   = document.getElementById('admin-nuevo-exp').value || null;
  if (!email || !email.includes('@')) { showToast('Email inválido'); return; }

  var res = await supaPost('usuarios_aurum', {
    email: email, pack: pack, etapa: 1, activo: true, cuenta_mt5: mt5, fecha_expiracion: exp
  });
  if (res.error) {
    showToast(res.error.includes('23505') || res.error.includes('unique') ? 'Email ya registrado' : 'Error: ' + res.error);
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
  var codigo = (document.getElementById('admin-codigo-result').textContent || '').trim();
  var email  = document.getElementById('admin-codigo-email').value;
  if (!codigo || !email) { showToast('Genera un código y elige un usuario'); return; }

  var res = await supaPatch('usuarios_aurum', 'email=eq.' + encodeURIComponent(email), { codigo_eval: codigo, updated_at: new Date().toISOString() });
  if (res.error) { showToast('Error: ' + res.error); return; }
  showToast('Código ' + codigo + ' asignado a ' + email);
  await cargarUsuariosAdmin();
}

function adminCopiarCodigo() {
  var codigo = (document.getElementById('admin-codigo-result').textContent || '').trim();
  if (!codigo) return;
  navigator.clipboard.writeText(codigo).then(function() { showToast('Código copiado'); });
}
