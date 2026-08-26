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
  if (typeof adminCargarPremiosPendientes === 'function') adminCargarPremiosPendientes();
}

// ── Carga y render ──────────────────────────────────────────

async function cargarUsuariosAdmin() {
  var tbody = document.getElementById('admin-tabla-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">Cargando...</td></tr>';

  var res = await supaGet('usuarios_aurum', 'order=created_at.desc', getToken());
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
    estadoHtml += u.tiene_ea
      ? '<span style="color:#6A9AEE;font-size:10px;display:block;margin-top:.2rem;">EA ✓</span>'
      : '';
    estadoHtml += (u.tiene_ea && _adminEaDesincronizado(u))
      ? '<span style="color:var(--red);font-size:10px;display:block;margin-top:.2rem;" title="Token o ea_password del EA ya no coinciden con Supabase">⚠️ EA desincronizado</span>'
      : '';
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
  set('admin-edit-etapa-fecha', ''); // siempre vacío al abrir — es una acción puntual, no un dato guardado del usuario
  set('admin-edit-animal',      u.animal  || '');
  set('admin-edit-acceso-sala', u.acceso_sala_extra || '');
  set('admin-edit-maestra', u.cuenta_maestra || '');
  set('admin-edit-prueba',  u.cuenta_prueba  || '');
  set('admin-edit-retos',   u.cuenta_retos   || '');
  set('admin-edit-exp',         u.fecha_expiracion ? u.fecha_expiracion.split('T')[0] : '');
  set('admin-edit-notas',       u.notas   || '');
  document.getElementById('admin-edit-activo').checked = !!u.activo;
  document.getElementById('admin-edit-tiene-ea').checked = !!u.tiene_ea;
  set('admin-edit-ea-password', u.ea_password || '');
  var eaPassBlock = document.getElementById('admin-edit-ea-password-block');
  if (eaPassBlock) eaPassBlock.style.display = u.tiene_ea ? 'block' : 'none';
  var eaSyncEl = document.getElementById('admin-edit-ea-sync-estado');
  if (eaSyncEl) eaSyncEl.innerHTML = _adminRenderEaSyncEstado(u);
  set('admin-edit-sl-edge', u.sl_edge || 11);
  set('admin-edit-sl-aire', u.sl_aire || 25);
  set('admin-edit-sl-limite', u.sl_limite || 50);
  set('admin-edit-tp1', u.tp_parcial1 || 18);
  set('admin-edit-tp2', u.tp_parcial2 || 33);
  set('admin-edit-tp3', u.tp_parcial3 || 50);
  adminEtapaOriginal = u.etapa || 1;
  adminCumplDesbloqueado = false;
  ['admin-edit-sl-edge','admin-edit-sl-aire','admin-edit-sl-limite','admin-edit-tp1','admin-edit-tp2','admin-edit-tp3'].forEach(function(id){ document.getElementById(id).disabled = true; });
  var estadoEl = document.getElementById('admin-cumpl-estado');
  if (estadoEl) estadoEl.innerHTML = u.cumplimiento_bloqueado ? '<span style="color:var(--red);">🔒 Bloqueado</span>' : '<span style="color:var(--green);">🔓 Sin bloquear aún</span>';
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

function adminToggleEaPasswordBlock(checked) {
  var b = document.getElementById('admin-edit-ea-password-block');
  if (b) b.style.display = checked ? 'block' : 'none';
}

// Estado de sincronización EA (ver sql_ea_auth_sync.sql, pendiente #29 de
// PENDIENTES_AUDITORIA_260826.md) — detecta de un vistazo si el Token o el
// ea_password que tiene pegado el EA real ya no coincide con Supabase, sin
// esperar a que falte un trade para notarlo.
function _adminEaDesincronizado(u) {
  if (!u.ea_ultimo_intento_en) return false; // nunca ha intentado, nada que comparar
  return u.ea_token_match === false || u.ea_password_match === false;
}

function _adminTiempoRelativo(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  var mins = Math.floor((new Date() - d) / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return 'hace ' + mins + ' min';
  var horas = Math.floor(mins / 60);
  if (horas < 24) return 'hace ' + horas + (horas === 1 ? ' hora' : ' horas');
  var dias = Math.floor(horas / 24);
  return 'hace ' + dias + (dias === 1 ? ' día' : ' días');
}

function _adminRenderEaSyncEstado(u) {
  if (!u.ea_ultimo_intento_en) {
    return '<span style="color:var(--text-muted);">Sin intentos de autenticación registrados todavía.</span>';
  }
  var okStyle  = 'color:var(--green);';
  var badStyle = 'color:var(--red);';
  var tokenOk = u.ea_token_match !== false; // null/true = ok, false = mismatch
  var passOk  = u.ea_password_match !== false;
  var html = '<div style="color:var(--text-muted);margin-bottom:.4rem;">Último intento del EA: ' + _adminTiempoRelativo(u.ea_ultimo_intento_en) + '</div>';
  html += '<div>Token compartido: <span style="' + (tokenOk ? okStyle : badStyle) + '">' + (tokenOk ? '✅ coincide' : '❌ NO coincide') + '</span></div>';
  html += '<div style="margin-top:.3rem;">ea_password: <span style="' + (passOk ? okStyle : badStyle) + '">' + (passOk ? '✅ coincide' : '❌ NO coincide') + '</span></div>';
  if (!passOk) {
    html += '<div style="margin-top:.3rem;font-family:monospace;font-size:11px;background:var(--bg);padding:.5rem .6rem;border:1px solid var(--border);">' +
      '<div style="color:var(--text-muted);">Esperado (Supabase):&nbsp;&nbsp;' + (u.ea_password || '(sin generar)') + '</div>' +
      '<div style="color:var(--text-muted);">Último recibido del EA:&nbsp;' + (u.ea_password_ultimo_recibido || '(vacío)') + '</div>' +
    '</div>';
  }
  return html;
}

async function adminGenerarEaPassword() {
  if (!adminEditId) return;
  // Sin caracteres ambiguos (0/O, 1/l/I) — se teclea a mano en el input del EA en MT5
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var pass = '';
  for (var i = 0; i < 14; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));

  var res = await supaPatch('usuarios_aurum', 'id=eq.' + adminEditId, { ea_password: pass, updated_at: new Date().toISOString() }, getToken());
  if (res.error) {
    console.error('[ADMIN] adminGenerarEaPassword error:', res.error);
    showToast('Error generando contraseña EA');
    return;
  }

  document.getElementById('admin-edit-ea-password').value = pass;
  var u = adminUsuarios.find(function(x) { return x.id === adminEditId; });
  if (u) u.ea_password = pass;
  showToast('Contraseña EA generada y guardada');
}

function adminCopiarEaPassword() {
  var val = document.getElementById('admin-edit-ea-password').value;
  if (!val) { showToast('No hay contraseña que copiar'); return; }
  navigator.clipboard.writeText(val).then(function() {
    showToast('Contraseña copiada');
  }).catch(function() {
    showToast('No se pudo copiar — cópiala manualmente');
  });
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
    tiene_ea:         document.getElementById('admin-edit-tiene-ea').checked,
    notas:            document.getElementById('admin-edit-notas').value.trim(),
    updated_at:       new Date().toISOString()
  };
  console.log('[ADMIN] datos a guardar:', JSON.stringify(datos));

  try {
    // Leer valores actuales desde BD justo antes del PATCH
    var _prevRes  = await supaGet('usuarios_aurum', 'id=eq.' + adminEditId + '&select=cuenta_maestra,cuenta_retos,cuenta_prueba,etapa&limit=1', getToken());
    var _prevRow  = (_prevRes.data && _prevRes.data[0]) || {};
    var prevMaestra = _prevRow.cuenta_maestra || null;
    var prevRetos   = _prevRow.cuenta_retos   || null;
    var prevPrueba  = _prevRow.cuenta_prueba  || null;
    var prevEtapa   = _prevRow.etapa;
    console.log('[ADMIN] previos  — maestra:', prevMaestra, '| retos:', prevRetos, '| prueba:', prevPrueba);
    console.log('[ADMIN] nuevos   — maestra:', datos.cuenta_maestra, '| retos:', datos.cuenta_retos, '| prueba:', datos.cuenta_prueba);

    var res = await supaPatch('usuarios_aurum', 'id=eq.' + adminEditId, datos, getToken());
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

    var _u = adminUsuarios.find(function(u) { return u.id === adminEditId; });
    if (_u && _u.email) {
      await _reasignarCuentaExterna(_u.email, [
        { numeroPrevio: prevMaestra, numero: datos.cuenta_maestra, destino: 'Cuenta Maestra' },
        { numeroPrevio: prevRetos,   numero: datos.cuenta_retos,   destino: 'Cuenta Retos'   },
        { numeroPrevio: prevPrueba,  numero: datos.cuenta_prueba,  destino: 'Cuenta Prueba'  }
      ]);
      if (prevEtapa !== datos.etapa) {
        var _histBody = { usuario_email: _u.email, etapa: datos.etapa };
        // FIX corazón de datos (11/07): permite fijar la fecha real del cambio de
        // etapa al reconstruir historial pasado desde el admin. Si se deja vacío,
        // se omite el campo y Supabase usa el default now(), igual que antes.
        var _fechaManual = document.getElementById('admin-edit-etapa-fecha');
        if (_fechaManual && _fechaManual.value) {
          _histBody.created_at = new Date(_fechaManual.value + 'T12:00:00').toISOString();
        }
        var _histRes = await supaPost('etapa_historial', _histBody, 'return=minimal', getToken());
        if (_histRes.error) console.error('[ADMIN] error al registrar etapa_historial:', _histRes.error);
      }
    }

    if (adminCumplDesbloqueado && _u && _u.email) {
      var cumplDatos = {
        sl_edge: parseFloat(document.getElementById('admin-edit-sl-edge').value) || 11,
        sl_aire: parseFloat(document.getElementById('admin-edit-sl-aire').value) || 25,
        sl_limite: parseFloat(document.getElementById('admin-edit-sl-limite').value) || 50,
        tp_parcial1: parseFloat(document.getElementById('admin-edit-tp1').value) || 18,
        tp_parcial2: parseFloat(document.getElementById('admin-edit-tp2').value) || 33,
        tp_parcial3: parseFloat(document.getElementById('admin-edit-tp3').value) || 50,
        cumplimiento_bloqueado: true,
        updated_at: new Date().toISOString()
      };
      var _cumplRes = await supaPatch('usuarios_aurum', 'id=eq.' + adminEditId, cumplDatos, getToken());
      if (_cumplRes.error) {
        console.error('[ADMIN] error guardando umbrales cumplimiento:', _cumplRes.error);
      } else {
        await supaPost('cumplimiento_historial', {
          usuario_email: _u.email,
          sl_edge: cumplDatos.sl_edge, sl_aire: cumplDatos.sl_aire, sl_limite: cumplDatos.sl_limite,
          tp_parcial1: cumplDatos.tp_parcial1, tp_parcial2: cumplDatos.tp_parcial2, tp_parcial3: cumplDatos.tp_parcial3,
          motivo: 'Cambio de etapa ' + adminEtapaOriginal + '→' + datos.etapa + ', aprobado por admin'
        }, 'return=minimal', getToken());
      }
      adminCumplDesbloqueado = false;
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

// Reasigna trades entre carpetas cuando el admin cambia números de cuenta.
// — Asignación: numeroPrevio=null → numero=X  →  Cuenta Externa → destino
// — Revocación: numeroPrevio=X   → numero=null →  destino → Cuenta Externa
async function _reasignarCuentaExterna(email, cuentas) {
  var token = getToken();
  var ep    = 'usuario_email=eq.' + encodeURIComponent(email);

  // Primero revocaciones: liberan trades a Cuenta Externa
  for (var i = 0; i < cuentas.length; i++) {
    var numeroPrevio = cuentas[i].numeroPrevio || null;
    var numero       = cuentas[i].numero       || null;
    var destino      = cuentas[i].destino;
    console.log('[REASIGNAR] destino:', destino, '| numeroPrevio:', JSON.stringify(numeroPrevio), '| numero:', JSON.stringify(numero));
    if (!numero && numeroPrevio) {
      console.log('[REASIGNAR] revocación — moviendo', destino, '→ Cuenta Externa');
      var resRev = await supaGet('trades',
        ep + '&cuenta=eq.' + encodeURIComponent(destino) + '&limit=1', token);
      console.log('[REASIGNAR] revocación — trades en', destino, ':', resRev.data ? resRev.data.length : 'error', resRev.error || '');
      if (!resRev.error && resRev.data && resRev.data.length) {
        // No se vacía cuenta_numero: se conserva para no mezclar esta cuenta
        // revocada con otras que también acaben en Cuenta Externa.
        await supaPatch('trades',
          ep + '&cuenta=eq.' + encodeURIComponent(destino),
          { cuenta: 'Cuenta Externa' }, token);
        await supaPatch('historiales',
          ep + '&nombre=eq.' + encodeURIComponent(destino),
          { nombre: 'Cuenta Externa' }, token);
      }
    }
  }

  // Luego asignaciones: pueden encontrar trades recién liberados
  for (var j = 0; j < cuentas.length; j++) {
    var numeroPrevio = cuentas[j].numeroPrevio || null;
    var numero       = cuentas[j].numero       || null;
    var destino      = cuentas[j].destino;
    if (numero) {
      var filtroNum = '&cuenta_numero=eq.' + encodeURIComponent(numero);
      var resAsig = await supaGet('trades',
        ep + '&cuenta=eq.' + encodeURIComponent('Cuenta Externa') + filtroNum + '&limit=1', token);
      console.log('[REASIGNAR] asignación — trades Cuenta Externa con numero', numero, ':', resAsig.data ? resAsig.data.length : 'error', resAsig.error || '');
      if (!resAsig.error && resAsig.data && resAsig.data.length) {
        await supaPatch('trades',
          ep + '&cuenta=eq.' + encodeURIComponent('Cuenta Externa') + filtroNum,
          { cuenta: destino }, token);
        await supaPatch('historiales',
          ep + '&nombre=eq.' + encodeURIComponent('Cuenta Externa') + '&numero=eq.' + encodeURIComponent(numero),
          { nombre: destino, tipo: destino === 'Cuenta Maestra' ? 'Maestra' : destino === 'Cuenta Retos' ? 'Retos' : 'Prueba' }, token);
      }
      // Segundo patch: mover trades con cuenta_numero=null si hay historial en Externa para este numero
      var resHistConf = await supaGet('historiales',
        ep + '&nombre=eq.' + encodeURIComponent('Cuenta Externa') +
        '&or=(numero.eq.' + encodeURIComponent(numero) + ',numero.is.null)&limit=1', token);
      console.log('[REASIGNAR] historial Externa con numero/null para', destino, ':', resHistConf.data ? resHistConf.data.length : 'error', resHistConf.error || '');
      if (!resHistConf.error && resHistConf.data && resHistConf.data.length) {
        var resNullCheck = await supaGet('trades',
          ep + '&cuenta=eq.' + encodeURIComponent('Cuenta Externa') + '&cuenta_numero=is.null&limit=1', token);
        if (!resNullCheck.error && resNullCheck.data && resNullCheck.data.length) {
          await supaPatch('trades',
            ep + '&cuenta=eq.' + encodeURIComponent('Cuenta Externa') + '&cuenta_numero=is.null',
            { cuenta: destino }, token);
        }
        await supaPatch('historiales',
          ep + '&nombre=eq.' + encodeURIComponent('Cuenta Externa') + '&numero=is.null',
          { nombre: destino, tipo: destino === 'Cuenta Maestra' ? 'Maestra' : destino === 'Cuenta Retos' ? 'Retos' : 'Prueba' }, token);
      }
    }
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
  }, 'return=representation', getToken());
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
  if (el) { document.getElementById('admin-codigo-text').textContent = codigo; el.style.display = 'block'; }
}

async function adminGuardarCodigo() {
  var codigo = (document.getElementById('admin-codigo-text').textContent || '').trim();
  var email  = document.getElementById('admin-codigo-email').value;
  if (!codigo || !email) { showToast('Genera un código y elige un usuario'); return; }

  var res = await supaPatch('usuarios_aurum', 'email=eq.' + encodeURIComponent(email), { codigo_eval: codigo, updated_at: new Date().toISOString() }, getToken());
  if (res.error) { showToast('Error: ' + res.error); return; }
  showToast('Código ' + codigo + ' asignado a ' + email);
  await cargarUsuariosAdmin();
}

function adminCopiarCodigo() {
  var codigo = (document.getElementById('admin-codigo-text').textContent || '').trim();
  if (!codigo) return;
  navigator.clipboard.writeText(codigo).then(function() { showToast('Código copiado'); });
}

// ── Premios pendientes de entregar (retos cumplidos, sin OZT acreditado) ────
// FIX corazón de datos (12/07): detección automática de retos cumplidos ya
// existe en gestion.js (marca ganador=true + completado_at al vuelo cuando
// el usuario carga su panel de Retos). Esto NO acredita el OZT solo — solo
// avisa aquí, con badge, para que el admin apruebe/entregue el premio a mano.

async function adminCargarPremiosPendientes() {
  var badge      = document.getElementById('admin-premios-badge');
  var contenedor = document.getElementById('admin-premios-lista');
  if (!contenedor) return;
  contenedor.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">Cargando...</div>';

  var res = await supaGet('retos_participantes', 'ganador=eq.true&premio_entregado=eq.false&order=completado_at.asc', getToken());
  if (res.error || !res.data) {
    contenedor.innerHTML = '<div style="font-size:12px;color:#e05;">Error: ' + (res.error || 'sin datos') + '</div>';
    if (badge) badge.style.display = 'none';
    return;
  }

  var pendientes = res.data;
  if (!pendientes.length) {
    contenedor.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">No hay premios pendientes de entregar.</div>';
    if (badge) badge.style.display = 'none';
    return;
  }

  // Traer título y premio_ozt de los retos implicados en una sola consulta
  var retoIds = pendientes.map(function(p) { return p.reto_id; })
    .filter(function(v, i, a) { return v && a.indexOf(v) === i; });
  var retosMap = {};
  if (retoIds.length) {
    var idList = retoIds.map(function(id) { return '"' + id + '"'; }).join(',');
    var resRetos = await supaGet('retos', 'id=in.(' + idList + ')&select=id,titulo,premio_ozt', getToken());
    (resRetos.data || []).forEach(function(r) { retosMap[r.id] = r; });
  }

  if (badge) { badge.textContent = pendientes.length; badge.style.display = 'inline-block'; }

  contenedor.innerHTML = pendientes.map(function(p) {
    var reto   = retosMap[p.reto_id] || {};
    var premio = reto.premio_ozt || 0;
    var fecha  = p.completado_at ? new Date(p.completado_at).toLocaleDateString('es-ES') : '—';
    return '<div id="premio-row-' + p.id + '" style="background:var(--bg2);border:1px solid var(--border-gold);padding:.6rem .8rem;display:flex;justify-content:space-between;align-items:center;gap:.5rem;">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (p.usuario_email || '—') + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);">' + (reto.titulo || '(reto sin título)') + ' · cumplido ' + fecha + ' · <span style="color:var(--gold);">' + premio + ' OZT</span></div>' +
      '</div>' +
      '<button onclick="adminEntregarPremio(\'' + p.id + '\',\'' + p.usuario_email + '\',' + premio + ')" style="background:var(--gold);color:#0A0C14;border:none;padding:.35rem .8rem;font-size:11px;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;font-family:inherit;">Entregar</button>' +
    '</div>';
  }).join('');
}

async function adminEntregarPremio(participacionId, email, premioOzt) {
  if (!confirm('¿Entregar ' + premioOzt + ' OZT a ' + email + '?')) return;
  var token = getToken();

  var resU = await supaGet('usuarios_aurum', 'email=eq.' + encodeURIComponent(email) + '&select=ozt_ganados_retos&limit=1', token);
  if (resU.error || !resU.data || !resU.data.length) {
    showToast('Error al leer usuario: ' + (resU.error || 'no encontrado'));
    return;
  }
  var actual = resU.data[0].ozt_ganados_retos || 0;

  var resPatchU = await supaPatch('usuarios_aurum', 'email=eq.' + encodeURIComponent(email),
    { ozt_ganados_retos: actual + premioOzt, updated_at: new Date().toISOString() }, token);
  if (resPatchU.error) { showToast('Error al acreditar OZT: ' + resPatchU.error); return; }

  var resPatchP = await supaPatch('retos_participantes', 'id=eq.' + participacionId,
    { premio_entregado: true }, token);
  if (resPatchP.error) { showToast('OZT acreditado, pero error al marcar como entregado: ' + resPatchP.error); return; }

  showToast('Premio entregado a ' + email);
  adminCargarPremiosPendientes();
}

// ── Gestión de Retos ──────────────────────────────────────────────

// FIX corazón de datos (07/07): vista de admin para ver la disponibilidad
// que los usuarios han agendado (tabla disponibilidad_agenda), para poder
// organizar eventos. Mismo patrón visual que adminCargarRetos.
async function adminCargarDisponibilidad() {
  var contenedor = document.getElementById('admin-disponibilidad-lista');
  if (!contenedor) return;
  contenedor.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">Cargando...</div>';

  var res = await supaGet('disponibilidad_agenda', 'order=fecha.asc', getToken());
  if (res.error || !res.data) {
    contenedor.innerHTML = '<div style="font-size:12px;color:#e05;">Error: ' + (res.error || 'sin datos') + '</div>';
    return;
  }
  if (!res.data.length) {
    contenedor.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">Nadie ha agendado disponibilidad todavía.</div>';
    return;
  }

  contenedor.innerHTML = res.data.map(function(a) {
    var fecha = a.fecha || '—';
    return '<div style="background:var(--bg2);border:1px solid var(--border);padding:.6rem .8rem;display:flex;justify-content:space-between;align-items:center;gap:.5rem;">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + a.usuario_email + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);">' + fecha + ' · ' + a.sesion + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function adminCargarRetos() {
  var contenedor = document.getElementById('admin-retos-lista');
  if (!contenedor) return;
  contenedor.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">Cargando...</div>';

  var res = await supaGet('retos', 'order=fecha_cierre.asc', getToken());
  if (res.error || !res.data) {
    contenedor.innerHTML = '<div style="font-size:12px;color:#e05;">Error: ' + (res.error || 'sin datos') + '</div>';
    return;
  }
  if (!res.data.length) {
    contenedor.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">Sin retos creados.</div>';
    return;
  }

  var th = 'padding:.5rem .7rem;font-size:11px;color:var(--text-muted);';
  contenedor.innerHTML = res.data.map(function(r) {
    var cierre = r.fecha_cierre ? r.fecha_cierre.slice(0, 10) : '—';
    var costeTexto = r.coste_ozt > 0 ? r.coste_ozt + ' OZT entrada' : 'Gratuito';
    var premio = (r.premio_ozt ? r.premio_ozt + ' OZT' : '') + (r.premio_extra ? (r.premio_ozt ? ' · ' : '') + r.premio_extra : '');
    return '<div id="reto-admin-row-' + r.id + '" style="background:var(--bg2);border:1px solid var(--border);padding:.6rem .8rem;display:flex;justify-content:space-between;align-items:center;gap:.5rem;">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (r.titulo || '—') + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);">' + (r.tipo || '') + (r.sala ? ' · ' + r.sala : '') + ' · cierre: ' + cierre + ' · <span style="color:' + (r.coste_ozt > 0 ? 'var(--gold)' : 'var(--text-muted)') + ';">' + costeTexto + '</span>' + (premio ? ' · ' + premio : '') + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:.4rem;flex-shrink:0;">' +
        '<button onclick="adminEditarReto(\'' + r.id + '\',' + (r.coste_ozt || 0) + ',' + (r.premio_ozt || 0) + ')" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);padding:.25rem .5rem;font-size:11px;cursor:pointer;font-family:inherit;">Editar</button>' +
        '<button onclick="adminBorrarReto(\'' + r.id + '\')" style="background:transparent;border:1px solid #66222244;color:#e05;padding:.25rem .5rem;font-size:11px;cursor:pointer;">✕</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function adminCrearReto() {
  var errEl = document.getElementById('admin-reto-err');
  if (errEl) errEl.textContent = '';

  var titulo       = (document.getElementById('admin-reto-titulo').value    || '').trim();
  var tradesReq    = parseInt(document.getElementById('admin-reto-trades-req').value);

  if (!titulo)           { if (errEl) errEl.textContent = 'El título es obligatorio.';         return; }
  if (!tradesReq || tradesReq < 1) { if (errEl) errEl.textContent = 'Trades requeridos debe ser > 0.'; return; }

  var condicionTipo  = document.getElementById('admin-reto-condicion-tipo').value;
  var condicionValor = parseFloat(document.getElementById('admin-reto-condicion-valor').value);
  var condicion = condicionTipo
    ? { tipo: condicionTipo, valor: isNaN(condicionValor) ? 0 : condicionValor, trades_requeridos: tradesReq }
    : null;

  var partMinRaw = parseInt(document.getElementById('admin-reto-part-min').value);
  var partMin    = (!isNaN(partMinRaw) && partMinRaw > 0) ? partMinRaw : 11;

  var costeRaw = (document.getElementById('admin-reto-coste').value || '').trim();
  if (costeRaw === '') {
    if (!confirm('¿Este reto es gratuito (0 OZT de entrada)?')) {
      document.getElementById('admin-reto-coste').focus();
      return;
    }
  }
  var costeOzt = parseInt(costeRaw) || 0;

  var datos = {
    titulo:                 titulo,
    descripcion:            (document.getElementById('admin-reto-desc').value    || '').trim() || null,
    tipo:                   document.getElementById('admin-reto-tipo').value,
    sala:                   (document.getElementById('admin-reto-sala').value    || '').trim() || null,
    coste_ozt:              costeOzt,
    premio_ozt:             parseInt(document.getElementById('admin-reto-ozt').value)    || null,
    premio_extra:           (document.getElementById('admin-reto-extra').value   || '').trim() || null,
    trades_requeridos:      tradesReq,
    condicion:              condicion,
    participantes_minimos:  partMin,
    fecha_cierre:           document.getElementById('admin-reto-cierre').value   || null,
    created_at:             new Date().toISOString()
  };

  var res = await supaPost('retos', datos, 'return=representation', getToken());
  if (res.error) { if (errEl) errEl.textContent = 'Error: ' + res.error; return; }

  ['admin-reto-titulo','admin-reto-desc','admin-reto-sala','admin-reto-coste','admin-reto-ozt',
   'admin-reto-extra','admin-reto-trades-req','admin-reto-condicion-valor',
   'admin-reto-part-min','admin-reto-cierre'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('admin-reto-condicion-tipo').value = '';
  document.getElementById('admin-reto-tipo').value = 'individual';
  adminRetoTipoChange();
  adminRetoCondicionChange();
  showToast('Reto creado correctamente');
  adminCargarRetos();
}

function adminRetoTipoChange() {
  var esEquipo = document.getElementById('admin-reto-tipo').value === 'equipo';
  var nota     = document.getElementById('admin-reto-equipo-nota');
  var partMin  = document.getElementById('admin-reto-part-min');
  if (nota)    nota.style.display    = esEquipo ? 'block' : 'none';
  if (partMin) partMin.style.display = esEquipo ? 'block' : 'none';
}

function adminRetoCondicionChange() {
  var tieneCond = document.getElementById('admin-reto-condicion-tipo').value !== '';
  var valEl     = document.getElementById('admin-reto-condicion-valor');
  if (valEl) valEl.style.display = tieneCond ? 'block' : 'none';
}

async function adminBorrarReto(id) {
  if (!confirm('¿Borrar este reto?')) return;
  var res = await supaDelete('retos', 'id=eq.' + id, getToken());
  if (res.error) { showToast('Error al borrar: ' + res.error); return; }
  showToast('Reto eliminado');
  adminCargarRetos();
}

function adminEditarReto(id, costeActual, premioActual) {
  var existing = document.getElementById('modal-editar-reto');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'modal-editar-reto';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1rem;';
  overlay.innerHTML =
    '<div style="background:var(--bg2);border:1px solid var(--border-gold);padding:2rem;max-width:340px;width:100%;">' +
      '<div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:1.2rem;">Editar reto</div>' +
      '<div style="margin-bottom:.8rem;">' +
        '<label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:.3rem;">Coste de entrada (OZT)</label>' +
        '<input id="modal-reto-coste" type="number" min="0" value="' + costeActual + '" style="width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:.45rem .7rem;font-size:13px;font-family:inherit;outline:none;">' +
      '</div>' +
      '<div style="margin-bottom:1.4rem;">' +
        '<label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:.3rem;">Premio (OZT)</label>' +
        '<input id="modal-reto-premio" type="number" min="0" value="' + (premioActual || '') + '" style="width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:.45rem .7rem;font-size:13px;font-family:inherit;outline:none;">' +
      '</div>' +
      '<div style="display:flex;gap:.8rem;">' +
        '<button onclick="adminGuardarEdicionReto(\'' + id + '\')" style="flex:1;background:var(--gold);color:#0A0C14;border:none;padding:.7rem;font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;font-family:inherit;">Guardar</button>' +
        '<button onclick="document.getElementById(\'modal-editar-reto\').remove()" style="flex:1;background:transparent;color:var(--text-muted);border:1px solid var(--border);padding:.7rem;font-size:12px;cursor:pointer;font-family:inherit;">Cancelar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
}

async function adminGuardarEdicionReto(id) {
  var coste  = parseInt(document.getElementById('modal-reto-coste').value)  || 0;
  var premioRaw = document.getElementById('modal-reto-premio').value.trim();
  var premio = premioRaw !== '' ? (parseInt(premioRaw) || null) : null;

  var res = await supaPatch('retos', 'id=eq.' + id,
    { coste_ozt: coste, premio_ozt: premio }, getToken());
  if (res.error) { showToast('Error al guardar: ' + res.error); return; }

  document.getElementById('modal-editar-reto').remove();
  showToast('Reto actualizado');
  adminCargarRetos();
}

var adminEtapaOriginal = null;
var adminCumplDesbloqueado = false;

function adminDesbloquearCumplimiento() {
  var etapaActual = parseInt(document.getElementById('admin-edit-etapa').value) || 1;
  if (etapaActual === adminEtapaOriginal) {
    showToast('Cambia primero la etapa para poder desbloquear');
    return;
  }
  ['admin-edit-sl-edge','admin-edit-sl-aire','admin-edit-sl-limite','admin-edit-tp1','admin-edit-tp2','admin-edit-tp3'].forEach(function(id){ document.getElementById(id).disabled = false; });
  adminCumplDesbloqueado = true;
  showToast('Umbrales desbloqueados para este guardado');
}
