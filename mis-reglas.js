// ============================================================
// MIS REGLAS — niveles de pérdida y de beneficio por carpeta (fase 1)
// Ver: tools/post_cierre/sql_mis_reglas.sql y ESTADO.md ("Mis reglas").
//
// Todos los niveles son AVISOS: Aurum no cierra el día ni bloquea nada. Aquí
// solo se editan las reglas fijadas por el propio usuario (fijada_por =
// 'usuario'); las del admin (candado) llegan en la fase 3.
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
var _mrGuardando = false;
var _mrMsg = null;          // { ok: bool, txt }

function _mrEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function _mrNum(v) { return Number(v).toLocaleString('es-ES', { maximumFractionDigits: 2 }); }

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
  var ok = await _mrCargar();
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
      var idv = 'mr-' + b.regla + '-' + n;
      h += '<div class="mr-fila' + (b.niveles > 1 ? '' : ' mr-sin-nivel') + '">' +
             (b.niveles > 1 ? '<span class="mr-nivel">Nivel ' + n + '</span>' : '') +
             '<label class="mr-importe"><span class="mr-signo">' + b.signo + '</span>' +
               '<input id="' + idv + '-v" type="text" inputmode="decimal" autocomplete="off" ' +
                 'value="' + (f ? _mrNum(f.valor) : '') + '" ' +
                 'placeholder="' + (heredada ? 'Todas: ' + _mrNum(heredada.valor) : 'vacío = no se mide') + '" ' +
                 'aria-label="' + b.titulo + (b.niveles > 1 ? ' nivel ' + n : '') + ', importe en $" style="' + _MR_INPUT + '">' +
               '<span class="mr-usd">$</span></label>' +
             '<input id="' + idv + '-n" type="text" maxlength="' + MR_MAX_NOMBRE + '" value="' + _mrEsc(f && f.nombre ? f.nombre : '') + '" ' +
               'placeholder="' + _mrEsc(heredada && heredada.nombre ? heredada.nombre : 'Nombre (opcional)') + '" ' +
               'aria-label="' + b.titulo + (b.niveles > 1 ? ' nivel ' + n : '') + ', nombre" class="mr-nombre" style="' + _MR_INPUT + '">' +
             '<input id="' + idv + '-p" type="text" maxlength="' + MR_MAX_PLAN + '" value="' + _mrEsc(f && f.plan ? f.plan : '') + '" ' +
               'placeholder="' + _mrEsc(heredada && heredada.plan ? 'Todas: ' + heredada.plan : 'Qué haces al llegar (opcional): p. ej. cierro la plataforma') + '" ' +
               'aria-label="' + b.titulo + (b.niveles > 1 ? ' nivel ' + n : '') + ', tu plan al llegar" class="mr-plan" style="' + _MR_INPUT + 'font-size:14px;">' +
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

  _mrEstilos();
  cont.innerHTML = h;
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
    '#mis-reglas-bloque input:focus{border-color:var(--gold)!important;}' +
    '#mis-reglas-bloque input::placeholder{color:#6b6556;}' +
    '@media (max-width:600px){.mr-fila,.mr-sin-nivel{grid-template-columns:1fr;gap:.35rem;margin-bottom:.9rem;}.mr-plan{grid-column:1/-1;}}';
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
  if (/fijado por el admin/i.test(s)) return 'Ese nivel lo ha fijado el admin: solo puedes poner un importe menor.';
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

// ── Enganche: solo escucha, nunca sobrescribe onclick ni toca gestTab ──────
document.addEventListener('DOMContentLoaded', function() {
  var tab = document.getElementById('gtab-reglas');
  if (tab) tab.addEventListener('click', function() { setTimeout(buildMisReglas, 30); });
});
