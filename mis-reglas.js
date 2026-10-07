// ============================================================
// MIS REGLAS — niveles de pérdida y de beneficio por carpeta (fase 1)
// Ver: tools/post_cierre/sql_mis_reglas.sql y ESTADO.md ("Mis reglas").
//
// Todos los niveles son AVISOS: Aurum no cierra el día ni bloquea nada. Aquí
// solo se editan las reglas fijadas por el propio usuario (fijada_por =
// 'usuario').
// Candado (fase 3, sql_mis_reglas_v3_candado.sql): si el admin fija un nivel,
// manda el importe más estricto y el usuario solo puede bajarlo; cambiar
// nombre o plan siempre se puede. Tope = fila del admin de esa carpeta o, si
// no hay, la de 'todas' (igual que el trigger). El panel del admin (ver y
// fijar topes de cada usuario) está al final de este archivo.
// Normas por modo (normas-modo.js): pestañas por modo y "Gestionar modos".
//
// Datos: reglas_valores (RLS: cada usuario ve las suyas). Una fila por nivel;
// sin fila = no se mide. Carpeta 'todas' = por defecto; una fila de
// 'maestra' / 'prueba' / 'retos' sustituye a la de 'todas' para esa carpeta.
// Plan (06/10, sql_mis_reglas_v2_plan.sql): qué hace el trader al llegar a
// cada nivel; el Diario lo muestra cuando lo alcanza ("Tu plan dice: …").
//
// Módulo aislado: solo LEE helpers globales (supaGet, supaPost, supaPatch,
// supaDelete, getToken, usuarioActual) y pinta dentro de #mis-reglas-bloque.
// ============================================================

var MR_CARPETAS = [
  { id: 'todas',   txt: 'Todas',   campo: null },
  { id: 'maestra', txt: 'Maestra', campo: 'cuenta_maestra' },
  { id: 'prueba',  txt: 'Prueba',  campo: 'cuenta_prueba' },
  { id: 'retos',   txt: 'Retos',   campo: 'cuenta_retos' }
];
var MR_BLOQUES = [
  { regla: 'perdida_trade', titulo: 'Pérdida máxima por trade', niveles: 1, signo: '−',
    ayuda: 'Aviso cuando un solo trade pierde este importe o más.' },
  { regla: 'perdida_dia',   titulo: 'Pérdida diaria', niveles: 3, signo: '−',
    ayuda: 'Aviso cuando el P&L cerrado del día llega a este importe en negativo.' },
  { regla: 'beneficio_dia', titulo: 'Beneficio diario', niveles: 3, signo: '+',
    ayuda: 'Aviso cuando el P&L cerrado del día llega a este importe en positivo.' }
];
var MR_MAX_NOMBRE = 40;
var MR_MAX_PLAN = 200;

var _mrFilas = null;        // filas de reglas_valores del usuario (suyas y del admin)
var _mrCarpeta = 'todas';
var _mrVista = 'cuenta';    // 'cuenta' | 'modo:<id>' | 'gestionar' (normas-modo.js)
var _mrGuardando = false;
var _mrMsg = null;          // { ok: bool, txt }

function _mrEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function _mrNum(v) { return Number(v).toLocaleString('es-ES', { maximumFractionDigits: 2 }); }

// Tope del admin para una carpeta/regla/nivel: su fila de esa carpeta o, si
// no hay, la de 'todas' (como el trigger). Devuelve la fila o undefined.
function _mrTope(filas, carpeta, regla, nivel) {
  var del = function(c) {
    return (filas || []).filter(function(f) {
      return f.fijada_por === 'admin' && f.cuenta === c && f.regla === regla && f.nivel === nivel;
    })[0];
  };
  return del(carpeta) || (carpeta !== 'todas' ? del('todas') : undefined);
}

// Fila del usuario para una carpeta/regla/nivel (o undefined)
function _mrFila(carpeta, regla, nivel) {
  return (_mrFilas || []).filter(function(f) {
    return f.fijada_por === 'usuario' && f.cuenta === carpeta && f.regla === regla && f.nivel === nivel;
  })[0];
}

// ── Carga ────────────────────────────────────────────────────────────────

async function _mrCargar() {
  var u = window.usuarioActual;
  if (!u || !u.email || typeof supaGet !== 'function') return false;
  var r = await supaGet('reglas_valores',
    'ambito=eq.usuario&ambito_id=eq.' + encodeURIComponent(u.email) +
    '&select=id,cuenta,regla,nivel,fijada_por,valor,nombre,plan,updated_at&order=regla,nivel', getToken());
  if (r.error || !Array.isArray(r.data)) { console.error('[mis-reglas] error al cargar', r.error); return false; }
  if (!window.usuarioActual || window.usuarioActual.email !== u.email) return false;
  _mrFilas = r.data.map(function(f) { f.nivel = Number(f.nivel); f.valor = Number(f.valor); return f; });
  return true;
}

async function buildMisReglas() {
  var cont = document.getElementById('mis-reglas-bloque');
  if (!cont) return;
  if (_mrFilas == null) cont.innerHTML = '<div style="font-size:14px;color:var(--text-muted);">Cargando…</div>';
  var res = await Promise.all([_mrCargar(), typeof nmCargar === 'function' ? nmCargar() : false]);
  var ok = res[0];
  if (!ok && _mrFilas == null) {
    cont.innerHTML = '<div style="font-size:14px;color:var(--red);">No se pudieron cargar tus reglas. Vuelve a intentarlo en un momento.</div>';
    return;
  }
  _mrPintar();
}

// ── Pintado ──────────────────────────────────────────────────────────────

var _MR_INPUT = 'background:#060810;border:1px solid var(--border);padding:.55rem .7rem;font-size:15px;color:var(--text);' +
                'font-family:inherit;outline:none;box-sizing:border-box;width:100%;';

function _mrPintar() {
  var cont = document.getElementById('mis-reglas-bloque');
  if (!cont) return;
  var u = window.usuarioActual || {};
  var h = '';
  _mrEstilos();

  // Vista: reglas por cuenta, una pestaña por modo activo y "Gestionar modos"
  var modos = typeof nmModosActivos === 'function' ? nmModosActivos() : [];
  if (_mrVista.indexOf('modo:') === 0 && !modos.some(function(m) { return 'modo:' + m.id === _mrVista; })) _mrVista = 'cuenta';
  if (typeof nmPintar === 'function') {
    var pest = function(id, txt) {
      return '<button class="tab' + (_mrVista === id ? ' active' : '') + '" style="padding:.5rem 1rem;font-size:12px;" ' +
             'onclick="_mrElegirVista(\'' + id + '\')">' + txt + '</button>';
    };
    h += '<div class="mr-vistas">' + pest('cuenta', 'Reglas por cuenta') +
         modos.map(function(m) { return pest('modo:' + m.id, 'Modo · ' + _mrEsc(m.nombre)); }).join('') +
         pest('gestionar', '⚙ Gestionar modos') + '</div>';
  }
  if (_mrVista !== 'cuenta') {
    cont.innerHTML = h + '<div id="nm-bloque"></div>';
    nmPintar(_mrVista);
    return;
  }

  // Carpeta
  h += '<div style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-bottom:.6rem;">';
  MR_CARPETAS.forEach(function(c) {
    var num = c.campo && u[c.campo] ? ' · ' + _mrEsc(u[c.campo]) : '';
    h += '<button class="tab' + (_mrCarpeta === c.id ? ' active' : '') + '" style="padding:.45rem .9rem;font-size:12px;" ' +
         'onclick="_mrElegirCarpeta(\'' + c.id + '\')">' + c.txt + num + '</button>';
  });
  h += '</div>';
  h += '<div style="font-size:13px;color:var(--text-muted);margin-bottom:1.4rem;line-height:1.6;">' +
       (_mrCarpeta === 'todas'
         ? 'Se aplican a todas tus cuentas, salvo que pongas otras en Maestra, Prueba o Retos.'
         : 'Solo para esta cuenta. Lo que dejes vacío usa lo de <b>Todas</b> (en gris).') +
       '</div>';

  MR_BLOQUES.forEach(function(b) {
    h += '<div style="border:1px solid var(--border);background:var(--bg2);padding:1.2rem 1.3rem;margin-bottom:1px;">' +
           '<div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--gold);margin-bottom:.3rem;">' + b.titulo + '</div>' +
           '<div style="font-size:13px;color:var(--text-muted);margin-bottom:1rem;">' + b.ayuda + '</div>';
    for (var n = 1; n <= b.niveles; n++) {
      var f = _mrFila(_mrCarpeta, b.regla, n);
      var heredada = _mrCarpeta !== 'todas' ? _mrFila('todas', b.regla, n) : null;
      var tope = _mrTope(_mrFilas, _mrCarpeta, b.regla, n);
      var idv = 'mr-' + b.regla + '-' + n;
      h += '<div class="mr-fila' + (b.niveles > 1 ? '' : ' mr-sin-nivel') + '">' +
             (b.niveles > 1 ? '<span class="mr-nivel">Nivel ' + n + '</span>' : '') +
             '<label class="mr-importe"><span class="mr-signo">' + b.signo + '</span>' +
               '<input id="' + idv + '-v" type="text" inputmode="decimal" autocomplete="off" ' +
                 'value="' + (f ? _mrNum(f.valor) : '') + '" ' +
                 'placeholder="' + (tope ? 'Admin: ' + _mrNum(tope.valor) : heredada ? 'Todas: ' + _mrNum(heredada.valor) : 'vacío = no se mide') + '" ' +
                 'aria-label="' + b.titulo + (b.niveles > 1 ? ' nivel ' + n : '') + ', importe en $" style="' + _MR_INPUT + '">' +
               '<span class="mr-usd">$</span></label>' +
             '<input id="' + idv + '-n" type="text" maxlength="' + MR_MAX_NOMBRE + '" value="' + _mrEsc(f && f.nombre ? f.nombre : '') + '" ' +
               'placeholder="' + _mrEsc(heredada && heredada.nombre ? heredada.nombre : 'Nombre (opcional)') + '" ' +
               'aria-label="' + b.titulo + (b.niveles > 1 ? ' nivel ' + n : '') + ', nombre" class="mr-nombre" style="' + _MR_INPUT + '">' +
             '<input id="' + idv + '-p" type="text" maxlength="' + MR_MAX_PLAN + '" value="' + _mrEsc(f && f.plan ? f.plan : '') + '" ' +
               'placeholder="' + _mrEsc(heredada && heredada.plan ? 'Todas: ' + heredada.plan : 'Qué haces al llegar (opcional): p. ej. cierro la plataforma') + '" ' +
               'aria-label="' + b.titulo + (b.niveles > 1 ? ' nivel ' + n : '') + ', tu plan al llegar" class="mr-plan" style="' + _MR_INPUT + 'font-size:14px;">' +
             (tope ? _mrHtmlCandado(tope, f, heredada) : '') +
           '</div>';
    }
    h += '</div>';
  });

  h += '<div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-top:1.2rem;">' +
         '<div onclick="_mrGuardar()" class="btn-outline" role="button" style="font-size:13px;padding:.6rem 1.5rem;' +
           (_mrGuardando ? 'opacity:.5;pointer-events:none;' : '') + '">' + (_mrGuardando ? 'Guardando…' : 'Guardar reglas →') + '</div>' +
         '<div id="mr-msg" style="font-size:13px;color:' + (_mrMsg && !_mrMsg.ok ? 'var(--red)' : 'var(--green)') + ';">' +
           (_mrMsg ? _mrEsc(_mrMsg.txt) : '') + '</div>' +
       '</div>';
  h += '<div style="font-size:13px;color:var(--text-muted);margin-top:1.4rem;line-height:1.7;border-top:1px solid var(--border);padding-top:1rem;">' +
         'Son avisos: Aurum no cierra tu día ni bloquea operaciones. El Diario te mostrará cuándo llegaste a cada nivel, ' +
         'si seguiste operando y qué pasó después; si escribes qué haces al llegar a un nivel, te lo recordará ese día. Cada cambio queda registrado.' +
       '</div>';

  cont.innerHTML = h;
}

// Línea del candado bajo un nivel con tope del admin.
function _mrHtmlCandado(tope, propia, heredada) {
  var suyo = propia || heredada;
  var txt = '🔒 Tope del admin: ' + _mrNum(tope.valor) + ' $' + (tope.cuenta === 'todas' && _mrCarpeta !== 'todas' ? ' (de Todas)' : '') + '. ';
  if (suyo && suyo.valor > tope.valor) txt += 'Se aplica ' + _mrNum(tope.valor) + ' $ en vez de tus ' + _mrNum(suyo.valor) + ' $; solo puedes bajar el tuyo.';
  else if (suyo) txt += 'El tuyo es igual o más estricto: se aplica el tuyo. No puedes subirlo por encima del tope.';
  else txt += 'Se aplica aunque dejes el tuyo vacío. Puedes poner uno más estricto.';
  return '<div class="mr-candado">' + txt + '</div>';
}

function _mrElegirVista(id) {
  _mrVista = id;
  _mrMsg = null;
  if (typeof _nmMsg !== 'undefined') _nmMsg = null;
  _mrPintar();
}

function _mrEstilos() {
  if (document.getElementById('mr-estilos')) return;
  var s = document.createElement('style');
  s.id = 'mr-estilos';
  s.textContent =
    '.mr-fila{display:grid;grid-template-columns:70px 190px minmax(0,1fr);gap:.6rem;align-items:center;margin-bottom:.55rem;}' +
    '.mr-sin-nivel{grid-template-columns:190px minmax(0,1fr);}' +
    '.mr-nivel{font-size:12px;color:var(--text-muted);letter-spacing:.05em;}' +
    '.mr-importe{display:flex;align-items:center;gap:.35rem;}' +
    '.mr-signo,.mr-usd{font-size:15px;color:var(--text-muted);}' +
    '.mr-plan{grid-column:2/-1;margin-bottom:.5rem;}.mr-sin-nivel .mr-plan{grid-column:1/-1;}' +
    '.mr-candado{grid-column:2/-1;font-size:12px;color:#E8A84C;margin:-.3rem 0 .6rem;line-height:1.5;}.mr-sin-nivel .mr-candado{grid-column:1/-1;}' +
    '.mr-vistas{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1.3rem;padding-bottom:1rem;border-bottom:1px solid var(--border);}' +
    '.mr-adm-t{width:100%;border-collapse:collapse;font-size:12px;}.mr-adm-t td,.mr-adm-t th{padding:.3rem .5rem;border-bottom:1px solid var(--border);text-align:left;vertical-align:middle;}' +
    '.mr-adm-t th{font-weight:normal;color:var(--text-muted);letter-spacing:.05em;}' +
    '#mis-reglas-bloque input:focus{border-color:var(--gold)!important;}' +
    '#mis-reglas-bloque input::placeholder{color:#6b6556;}' +
    '@media (max-width:600px){.mr-fila,.mr-sin-nivel{grid-template-columns:1fr;gap:.35rem;margin-bottom:.9rem;}.mr-plan,.mr-candado{grid-column:1/-1;}}';
  document.head.appendChild(s);
}

function _mrElegirCarpeta(id) {
  _mrCarpeta = id;
  _mrMsg = null;
  _mrPintar();
}

// ── Guardar ──────────────────────────────────────────────────────────────

// Campo de texto (no type=number): con "999,5" un input numérico puede devolver
// '' y se tomaría por "no se mide". Formato español: "1.100" = 1100 (punto de
// miles), "999,5" o "1.100,5" con coma decimal; "2.5" = 2,5. Sin espacios.
function _mrLeerImporte(v) {
  var t = String(v || '').replace(/\s/g, '');
  if (t.indexOf(',') >= 0) return t.replace(/\./g, '').replace(',', '.');
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return t.replace(/\./g, '');
  return t;
}

// Lee el formulario de la carpeta actual. Devuelve { cambios, error }.
function _mrLeerFormulario() {
  var cambios = [], errores = [];
  MR_BLOQUES.forEach(function(b) {
    var importes = [];
    for (var n = 1; n <= b.niveles; n++) {
      var idv = 'mr-' + b.regla + '-' + n;
      var crudo = _mrLeerImporte(document.getElementById(idv + '-v').value);
      var nombre = (document.getElementById(idv + '-n').value || '').trim().slice(0, MR_MAX_NOMBRE);
      var plan = (document.getElementById(idv + '-p').value || '').trim().slice(0, MR_MAX_PLAN);
      var etiqueta = b.titulo + (b.niveles > 1 ? ' (nivel ' + n + ')' : '');
      var valor = null;
      if (crudo !== '') {
        valor = /^\d+(\.\d+)?$/.test(crudo) ? Number(crudo) : NaN;
        if (!isFinite(valor) || valor <= 0) { errores.push(etiqueta + ': pon un importe mayor que 0 o déjalo vacío.'); continue; }
        valor = Math.round(valor * 100) / 100;
        importes.push(valor);
        var tp = _mrTope(_mrFilas, _mrCarpeta, b.regla, n), ya = _mrFila(_mrCarpeta, b.regla, n);
        if (tp && valor > tp.valor && (!ya || valor > ya.valor)) {     // mismo criterio que el trigger v3
          errores.push(etiqueta + ': el admin ha fijado un tope de ' + _mrNum(tp.valor) + ' $; solo puedes poner ese importe o uno menor.');
          continue;
        }
      } else if (nombre || plan) {
        errores.push(etiqueta + ': tiene ' + (nombre ? 'nombre' : 'plan') + ' pero no importe.');
        continue;
      }
      var actual = _mrFila(_mrCarpeta, b.regla, n);
      if (valor == null && actual) cambios.push({ op: 'borrar', fila: actual });
      else if (valor != null && !actual) cambios.push({ op: 'crear', regla: b.regla, nivel: n, valor: valor, nombre: nombre || null, plan: plan || null });
      else if (valor != null && (actual.valor !== valor || (actual.nombre || '') !== nombre || (actual.plan || '') !== plan)) {
        cambios.push({ op: 'cambiar', fila: actual, valor: valor, nombre: nombre || null, plan: plan || null });
      }
    }
    for (var i = 1; i < importes.length; i++) {
      if (importes[i] <= importes[i - 1]) {
        errores.push(b.titulo + ': los niveles tienen que ir de menor a mayor importe.');
        break;
      }
    }
  });
  return { cambios: cambios, error: errores.length ? errores[0] : null };
}

async function _mrGuardar() {
  if (_mrGuardando) return;
  var u = window.usuarioActual, token = getToken();
  if (!u || !u.email || !token) return;
  var lectura = _mrLeerFormulario();
  if (lectura.error) { _mrMsg = { ok: false, txt: lectura.error }; _mrPintarMsg(); return; }
  if (!lectura.cambios.length) { _mrMsg = { ok: true, txt: 'No hay cambios que guardar.' }; _mrPintarMsg(); return; }

  _mrGuardando = true; _mrMsg = null; _mrPintar();
  var fallo = null;
  for (var i = 0; i < lectura.cambios.length && !fallo; i++) {
    var c = lectura.cambios[i], r;
    if (c.op === 'crear') {
      r = await supaPost('reglas_valores', {
        ambito: 'usuario', ambito_id: u.email, cuenta: _mrCarpeta, regla: c.regla, nivel: c.nivel,
        fijada_por: 'usuario', valor: c.valor, nombre: c.nombre, plan: c.plan
      }, 'return=minimal', token);
    } else if (c.op === 'cambiar') {
      r = await supaPatch('reglas_valores', 'id=eq.' + c.fila.id, { valor: c.valor, nombre: c.nombre, plan: c.plan }, token);
    } else {
      r = await supaDelete('reglas_valores', 'id=eq.' + c.fila.id, token);
    }
    if (r.error) fallo = r.error;
  }
  await _mrCargar();          // siempre releer: lo guardado antes de un fallo ya está en la base
  _mrGuardando = false;
  _mrMsg = fallo
    ? { ok: false, txt: _mrTextoError(fallo) }
    : { ok: true, txt: '✓ Guardado (' + lectura.cambios.length + (lectura.cambios.length === 1 ? ' cambio' : ' cambios') + ').' };
  _mrPintar();
}

function _mrTextoError(e) {
  var s = String(e || '');
  if (/fijado por el admin/i.test(s)) return 'Ese nivel tiene un tope del admin: solo puedes poner ese importe o uno menor.';
  if (/row-level security|42501|JWT/i.test(s)) return 'Tu sesión ha caducado. Vuelve a entrar e inténtalo de nuevo.';
  console.error('[mis-reglas] error al guardar', s);
  return '✗ No se pudo guardar. Inténtalo de nuevo.';
}

function _mrPintarMsg() {
  var el = document.getElementById('mr-msg');
  if (!el) return;
  el.style.color = _mrMsg && !_mrMsg.ok ? 'var(--red)' : 'var(--green)';
  el.textContent = _mrMsg ? _mrMsg.txt : '';
}

// ── Admin: reglas de cada usuario y topes (fase 3) ───────────────────────
// Botón "Reglas" en la fila de cada usuario (admin.js) → fila desplegable con
// sus niveles por carpeta, el tope del admin de cada nivel (editable; vacío =
// sin tope) y lo que se aplica. Los topes son filas de reglas_valores con
// fijada_por = 'admin' (RLS rv_admin_all). Manda el importe más estricto.

var _mrAdm = {};            // índice de adminUsuarios -> { email, filas, hist, carpeta, msg }
var MR_ADM_HIST = 8;        // últimos cambios que se enseñan

var MR_REGLA_TXT = { perdida_trade: 'Pérdida por trade', perdida_dia: 'Pérdida diaria', beneficio_dia: 'Beneficio diario' };

async function _mrAdmCargar(i) {
  var u = (typeof adminUsuarios !== 'undefined' ? adminUsuarios : [])[i];
  if (!u || !u.email) return null;
  var email = encodeURIComponent(u.email), token = getToken();
  var res = await Promise.all([
    supaGet('reglas_valores', 'ambito=eq.usuario&ambito_id=eq.' + email +
      '&select=id,cuenta,regla,nivel,fijada_por,valor,nombre,plan,updated_at&order=regla,nivel', token),
    supaGet('reglas_valores_historial', 'ambito=eq.usuario&ambito_id=eq.' + email +
      '&select=cuenta,regla,nivel,fijada_por,operacion,antes,despues,hecho_por,creado_en&order=creado_en.desc&limit=' + MR_ADM_HIST, token)
  ]);
  var prev = _mrAdm[i] || {};
  var st = { email: u.email, carpeta: prev.email === u.email ? prev.carpeta || 'todas' : 'todas', msg: null };
  if (res[0].error) { st.error = 'No se pudieron cargar sus reglas.'; console.error('[mis-reglas] admin', res[0].error); }
  else st.filas = res[0].data.map(function(f) { f.nivel = Number(f.nivel); f.valor = Number(f.valor); return f; });
  st.hist = res[1].error ? [] : res[1].data;
  _mrAdm[i] = st;
  return st;
}

async function mrAdminDetalle(i) {
  var fila = document.getElementById('adm-mr-det-' + i);
  if (!fila) return;
  if (fila.style.display !== 'none') { fila.style.display = 'none'; return; }
  _mrEstilos();
  fila.querySelector('td').innerHTML = '<div style="font-size:12px;color:var(--text-muted);">Cargando reglas…</div>';
  fila.style.display = '';
  await _mrAdmCargar(i);
  _mrAdmPintar(i);
}

function _mrAdmPintar(i) {
  var fila = document.getElementById('adm-mr-det-' + i), st = _mrAdm[i];
  if (!fila || !st) return;
  var td = fila.querySelector('td');
  if (st.error) { td.innerHTML = '<div style="font-size:12px;color:var(--red);">' + _mrEsc(st.error) + '</div>'; return; }
  var c = st.carpeta, filas = st.filas;
  var usuario = function(carpeta, regla, n) {
    return filas.filter(function(f) { return f.fijada_por === 'usuario' && f.cuenta === carpeta && f.regla === regla && f.nivel === n; })[0];
  };
  var adminDe = function(carpeta, regla, n) {
    return filas.filter(function(f) { return f.fijada_por === 'admin' && f.cuenta === carpeta && f.regla === regla && f.nivel === n; })[0];
  };
  var h = '<div style="display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;margin-bottom:.7rem;">' +
          '<span class="et-col-tit" style="margin:0 .6rem 0 0;">Mis reglas · topes del admin</span>' +
          MR_CARPETAS.map(function(x) {
            return '<button class="tab' + (c === x.id ? ' active' : '') + '" style="padding:.25rem .8rem;font-size:12px;" onclick="_mrAdmCarpeta(' + i + ',\'' + x.id + '\')">' + x.txt + '</button>';
          }).join('') + '</div>';
  h += '<table class="mr-adm-t"><tr><th>Nivel</th><th>Suyo</th><th>Tope del admin ($)</th><th>Se aplica</th></tr>';
  MR_BLOQUES.forEach(function(b) {
    for (var n = 1; n <= b.niveles; n++) {
      var su = usuario(c, b.regla, n) || (c !== 'todas' ? usuario('todas', b.regla, n) : null);
      var suDeTodas = su && su.cuenta !== c;
      var propio = adminDe(c, b.regla, n);
      var tope = _mrTope(filas, c, b.regla, n);
      var aplica = [su, tope].filter(Boolean).sort(function(x, y) { return x.valor - y.valor; })[0];
      h += '<tr><td style="white-space:nowrap;">' + MR_REGLA_TXT[b.regla] + (b.niveles > 1 ? ' ' + n : '') + '</td>' +
           '<td>' + (su ? b.signo + _mrNum(su.valor) + ' $' + (su.nombre ? ' «' + _mrEsc(su.nombre) + '»' : '') + (suDeTodas ? ' <span style="color:var(--text-muted);">(de Todas)</span>' : '') : '<span style="color:var(--text-muted);">—</span>') + '</td>' +
           '<td><input id="mr-adm-' + i + '-' + b.regla + '-' + n + '" type="text" inputmode="decimal" autocomplete="off" value="' + (propio ? _mrNum(propio.valor) : '') + '" ' +
             'placeholder="' + (tope && !propio ? 'Todas: ' + _mrNum(tope.valor) : 'sin tope') + '" ' +
             'style="width:110px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:.25rem .4rem;font:inherit;font-size:12px;"></td>' +
           '<td>' + (aplica ? (aplica.fijada_por === 'admin' ? '🔒 ' : '') + b.signo + _mrNum(aplica.valor) + ' $' : '<span style="color:var(--text-muted);">no se mide</span>') + '</td></tr>';
    }
  });
  h += '</table>';
  h += '<div style="display:flex;flex-wrap:wrap;gap:.8rem;align-items:center;margin-top:.7rem;">' +
         '<button class="tab" style="padding:.3rem .9rem;font-size:12px;" onclick="mrAdminGuardar(' + i + ')">Guardar topes de ' + MR_CARPETAS.filter(function(x) { return x.id === c; })[0].txt + '</button>' +
         '<span id="mr-adm-msg-' + i + '" style="font-size:12px;color:' + (st.msg && !st.msg.ok ? 'var(--red)' : 'var(--green)') + ';">' + (st.msg ? _mrEsc(st.msg.txt) : '') + '</span></div>' +
       '<div style="font-size:11px;color:var(--text-muted);margin-top:.5rem;line-height:1.6;">Manda el importe más estricto (también en beneficio: avisa antes). ' +
         'El usuario ve el candado y solo puede bajar el suyo. Vacío = sin tope en esta carpeta' + (c !== 'todas' ? ' (se usa el de Todas, si hay)' : '') + '.</div>';
  if (st.hist && st.hist.length) {
    h += '<div class="et-col-tit" style="margin-top:.9rem;">Últimos cambios</div><div style="font-size:11px;color:var(--text-muted);line-height:1.7;">' +
         st.hist.map(function(x) {
           var v = function(j) { return j && j.valor != null ? _mrNum(j.valor) + ' $' : '—'; };
           return new Date(x.creado_en).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' · ' +
                  _mrEsc(x.cuenta) + ' · ' + (MR_REGLA_TXT[x.regla] || x.regla) + ' ' + x.nivel + ' · ' + (x.fijada_por === 'admin' ? 'tope admin' : 'suyo') + ': ' +
                  v(x.antes) + ' → ' + v(x.despues) + ' · ' + _mrEsc(x.hecho_por);
         }).join('<br>') + '</div>';
  }
  td.innerHTML = h;
}

function _mrAdmCarpeta(i, c) {
  if (!_mrAdm[i]) return;
  _mrAdm[i].carpeta = c;
  _mrAdm[i].msg = null;
  _mrAdmPintar(i);
}

async function mrAdminGuardar(i) {
  var st = _mrAdm[i], token = getToken();
  if (!st || !st.filas || !token) return;
  var c = st.carpeta, cambios = [], error = null;
  MR_BLOQUES.forEach(function(b) {
    for (var n = 1; n <= b.niveles && !error; n++) {
      var el = document.getElementById('mr-adm-' + i + '-' + b.regla + '-' + n);
      if (!el) continue;
      var crudo = _mrLeerImporte(el.value), valor = null;
      if (crudo !== '') {
        valor = /^\d+(\.\d+)?$/.test(crudo) ? Math.round(Number(crudo) * 100) / 100 : NaN;
        if (!isFinite(valor) || valor <= 0) { error = MR_REGLA_TXT[b.regla] + ' ' + n + ': importe no válido.'; break; }
      }
      var actual = st.filas.filter(function(f) { return f.fijada_por === 'admin' && f.cuenta === c && f.regla === b.regla && f.nivel === n; })[0];
      if (valor == null && actual) cambios.push({ op: 'borrar', fila: actual });
      else if (valor != null && !actual) cambios.push({ op: 'crear', regla: b.regla, nivel: n, valor: valor });
      else if (valor != null && actual.valor !== valor) cambios.push({ op: 'cambiar', fila: actual, valor: valor });
    }
  });
  var msg = function(ok, txt) { st.msg = { ok: ok, txt: txt }; var e = document.getElementById('mr-adm-msg-' + i); if (e) { e.style.color = ok ? 'var(--green)' : 'var(--red)'; e.textContent = txt; } };
  if (error) return msg(false, error);
  if (!cambios.length) return msg(true, 'No hay cambios.');
  msg(true, 'Guardando…');
  var fallo = null;
  for (var k = 0; k < cambios.length && !fallo; k++) {
    var x = cambios[k], r;
    if (x.op === 'crear') r = await supaPost('reglas_valores', { ambito: 'usuario', ambito_id: st.email, cuenta: c, regla: x.regla, nivel: x.nivel, fijada_por: 'admin', valor: x.valor }, 'return=minimal', token);
    else if (x.op === 'cambiar') r = await supaPatch('reglas_valores', 'id=eq.' + x.fila.id, { valor: x.valor }, token);
    else r = await supaDelete('reglas_valores', 'id=eq.' + x.fila.id, token);
    if (r.error) fallo = r.error;
  }
  await _mrAdmCargar(i);
  if (fallo) console.error('[mis-reglas] admin guardar', fallo);
  _mrAdm[i].msg = fallo ? { ok: false, txt: '✗ No se pudo guardar todo (se muestra lo que quedó guardado).' } : { ok: true, txt: '✓ Topes guardados (' + cambios.length + ').' };
  _mrAdmPintar(i);
  if (typeof etAdminOlvidar === 'function') etAdminOlvidar(st.email);   // días limpios y etapas usan reglas_efectivas
}

// ── Enganche: solo escucha, nunca sobrescribe onclick ni toca gestTab ──────
document.addEventListener('DOMContentLoaded', function() {
  var tab = document.getElementById('gtab-reglas');
  if (tab) tab.addEventListener('click', function() { setTimeout(buildMisReglas, 30); });
});
