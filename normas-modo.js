// ============================================================
// NORMAS POR MODO (fase 1: guardar y mostrar) — en Mis reglas
// Ver: tools/post_cierre/sql_normas_modo.sql y ESTADO.md ("Normas por modo").
//
// - Una pestaña por modo activo (modos de sql_modos.sql) con el formulario de
//   sus normas, y "Gestionar modos" para renombrar, añadir y desactivar.
// - Todo opcional: lo vacío no se guarda y Aurum no lo mide. [A] = Aurum
//   podrá medirlo solo con los datos de la EA (fases siguientes); el resto es
//   texto para la tablilla y el tablero.
// - El servidor limpia y valida (trigger de modo_normas); si algo no cuadra,
//   se muestra su mensaje con el nombre del campo de la pantalla.
// - Si ya hay fila se hace PATCH, si no POST (no upsert: el trigger trataría
//   el upsert como alta y el candado del admin frenaría importes que ya
//   estaban guardados).
//
// Módulo aislado: solo LEE helpers globales (supaGet, supaPost, supaPatch,
// getToken, usuarioActual, _mrEsc, _mrNum, _mrLeerImporte, _MR_INPUT) y pinta
// dentro de #nm-bloque, que crea mis-reglas.js.
// ============================================================

var _nmModos = null;       // [{id, nombre, orden, activo}] (todos, también los inactivos)
var _nmNormas = {};        // modo_id -> { normas, updated_at, actualizado_por }
var _nmEmail = null;
var _nmError = null;       // texto si no se pudieron cargar
var _nmGuardando = false;
var _nmMsg = null;         // { ok, txt }

var NM_CARPETAS = [['todas', 'Todas'], ['maestra', 'Maestra'], ['prueba', 'Prueba'], ['retos', 'Retos']];
var NM_SESGOS = [['vendiendo', 'Vendiendo'], ['comprando', 'Comprando'], ['sin_sesgo', 'Sin sesgo']];
var NM_MARGEN = [['todo', 'Todo'], ['mitad', 'La mitad'], ['otro', 'Otro %']];

// Secciones del formulario. sec = clave del bloque en normas (null = raíz).
// tipo: texto | nombre | opcion | hora | entero | lote | pts | usd | pct | sino | lista (n textos) | filas (n objetos)
var NM_SECCIONES = [
  { sec: 'cuando', t: 'Cuándo uso este modo', campos: [
    { k: 'tipo_dia', t: 'Tipo de día / mercado', tipo: 'texto', ph: 'p. ej. rango estrecho, sin noticias' },
    { k: 'objetivo', t: 'Objetivo', tipo: 'texto', ph: 'p. ej. sacar +250 $ y parar' } ] },
  { sec: 'antes', t: 'Antes de empezar', campos: [
    { k: 'carpeta', t: 'Cuenta', tipo: 'opcion', ops: NM_CARPETAS, A: 1 },
    { k: 'sesgo', t: 'Sesgo habitual', tipo: 'opcion', ops: NM_SESGOS, A: 1 },
    { k: 'hora_desde', t: 'Horario: de', tipo: 'hora', A: 1, ayuda: 'hora del servidor MT5' },
    { k: 'hora_hasta', t: 'a', tipo: 'hora', A: 1 },
    { k: 'max_trades', t: 'Máx. trades al día', tipo: 'entero', A: 1 } ] },
  { sec: 'entrada', t: 'Entrada', campos: [
    { k: 'condiciones', t: 'Condición', tipo: 'lista', n: 3, ph: 'p. ej. rechazo en zona + RSI' },
    { k: 'lote', t: 'Lote inicial', tipo: 'lote', A: 1 },
    { k: 'sl_pts', t: 'SL (pts)', tipo: 'pts', A: 1 },
    { k: 'tp_pts', t: 'TP (pts)', tipo: 'pts', A: 1 } ] },
  { sec: 'gestion', t: 'Gestión', campos: [
    { k: 'tp1_pts', t: 'TP1 (pts)', tipo: 'pts', A: 1 },
    { k: 'tp1_lote', t: 'Lote a cerrar en TP1', tipo: 'lote', A: 1 },
    { k: 'tp2_pts', t: 'TP2 (pts)', tipo: 'pts', A: 1 },
    { k: 'tp2_lote', t: 'Lote a cerrar en TP2', tipo: 'lote', A: 1 },
    { k: 'runner', t: 'Dejo runner', tipo: 'sino', A: 1 },
    { k: 'be_nunca_antes_tp1', t: 'BE nunca antes de TP1', tipo: 'sino', A: 1 },
    { k: 'be_cuando', t: 'Cuándo muevo a BE', tipo: 'texto', ancho: 1 },
    { k: 'no_tocar_desde_min', t: 'No toco el trade: del min', tipo: 'entero', A: 1 },
    { k: 'no_tocar_hasta_min', t: 'al min', tipo: 'entero', A: 1 },
    { k: 'cierre_manual_si', t: 'Cierre a mano permitido si', tipo: 'texto', ancho: 1 } ] },
  { sec: 'primer_trade', t: 'Primer trade del día', campos: [
    { k: 'si_bien', t: 'Si sale bien', tipo: 'texto' },
    { k: 'si_mal', t: 'Si sale mal', tipo: 'texto' } ] },
  { sec: 'escalado', t: 'Escalado con beneficio', nota: 'Al llegar a cada nivel, el suelo del día sube y ya no se devuelve.', campos: [
    { k: 'niveles', t: 'Nivel', tipo: 'filas', n: 3, A: 1, cols: [
      { k: 'nombre', t: 'Nombre', tipo: 'nombre' },
      { k: 'llegar', t: 'Llegar a +$', tipo: 'usd' },
      { k: 'suelo', t: 'Suelo +$', tipo: 'usd0' },
      { k: 'arriesgo', t: 'Arriesgo hasta $', tipo: 'usd' } ] },
    { k: 'margen', t: 'Uso del margen', tipo: 'opcion', ops: NM_MARGEN, A: 1 },
    { k: 'margen_pct', t: '% del margen (si "Otro")', tipo: 'pct', A: 1 },
    { k: 'lote_max', t: 'Lote máximo absoluto', tipo: 'lote', A: 1 } ] },
  { sec: 'perdiendo', t: 'Si voy perdiendo',
    nota: 'Si el modo no los define, se usan los de Mis reglas de la cuenta (prioridad: modo > cuenta > todas). Un tope del admin manda siempre.', campos: [
    { k: 'trade', t: 'Pérdida máx. por trade ($)', tipo: 'usd', A: 1 },
    { k: 'dia', t: 'Pérdida diaria', tipo: 'filas', n: 3, A: 1, cols: [
      { k: 'importe', t: 'Importe −$', tipo: 'usd' },
      { k: 'nombre', t: 'Nombre', tipo: 'nombre' },
      { k: 'plan', t: 'Qué hago', tipo: 'texto' } ] },
    { k: 'racha_n', t: 'Tras N pérdidas seguidas', tipo: 'entero', A: 1 },
    { k: 'racha_plan', t: '… qué hago', tipo: 'texto', ancho: 1 } ] },
  { sec: 'fin', t: 'Fin del día', campos: [
    { k: 'paro_cuando', t: 'Paro cuando', tipo: 'texto' },
    { k: 'apunto', t: 'Qué apunto', tipo: 'texto' } ] },
  { sec: null, t: 'Lo que nunca hago y frase del modo', campos: [
    { k: 'nunca', t: 'Nunca', tipo: 'lista', n: 3 },
    { k: 'frase', t: 'Frase del modo', tipo: 'texto', ancho: 1 } ] }
];

// ── Carga ────────────────────────────────────────────────────────────────

async function nmCargar() {
  var u = window.usuarioActual;
  if (!u || !u.email || typeof supaGet !== 'function') return false;
  var email = encodeURIComponent(u.email), token = getToken();
  var res = await Promise.all([
    supaGet('modos', 'usuario_email=eq.' + email + '&select=id,nombre,orden,activo&order=orden.asc,id.asc', token),
    supaGet('modo_normas', 'usuario_email=eq.' + email + '&select=modo_id,normas,updated_at,actualizado_por', token)
  ]);
  if (!window.usuarioActual || window.usuarioActual.email !== u.email) return false;
  if (res[0].error || res[1].error) {
    _nmError = 'No se pudieron cargar tus modos.';
    console.error('[normas-modo] error al cargar', res[0].error || res[1].error);
    return false;
  }
  var modos = res[0].data || [];
  if (!modos.length) {                             // usuario sin modos: los de partida
    var rpc = await supaPost('rpc/modos_por_defecto', {}, 'return=representation', token);
    if (!rpc.error && Array.isArray(rpc.data)) modos = rpc.data;
  }
  _nmModos = modos.map(function(m) { return { id: m.id, nombre: m.nombre, orden: m.orden, activo: m.activo !== false }; });
  _nmNormas = {};
  (res[1].data || []).forEach(function(f) { _nmNormas[f.modo_id] = f; });
  _nmEmail = u.email;
  _nmError = null;
  _nmSincronizarDiario();
  return true;
}

// El Diario (modos.js) tiene su propia copia de los modos: se actualiza para
// que el plan del día y los filtros vean los nombres y activos nuevos.
function _nmSincronizarDiario() {
  if (typeof _moModos === 'undefined' || !_nmModos) return;
  if (typeof _moEmail !== 'undefined' && _moEmail === _nmEmail) {
    _moModos = _nmModos.map(function(m) { return Object.assign({}, m); });
  }
}

function nmModosActivos() { return (_nmModos || []).filter(function(m) { return m.activo; }); }

// ── Pintado ──────────────────────────────────────────────────────────────

function nmPintar(vista) {
  var cont = document.getElementById('nm-bloque');
  if (!cont) return;
  _nmEstilos();
  if (_nmError || !_nmModos) {
    cont.innerHTML = '<div style="font-size:14px;color:var(--red);">' + _mrEsc(_nmError || 'No se pudieron cargar tus modos.') + '</div>';
    return;
  }
  if (vista === 'gestionar') { cont.innerHTML = _nmHtmlGestionar(); return; }
  var id = Number(String(vista).replace('modo:', ''));
  var m = (_nmModos || []).filter(function(x) { return x.id === id; })[0];
  cont.innerHTML = m ? _nmHtmlFormulario(m) : '<div class="nm-nota">Ese modo ya no existe.</div>';
}

function _nmA(c) {
  return c.A ? ' <span class="nm-a" title="Aurum podrá medirlo con los datos de la EA">[A]</span>' : '';
}

function _nmValor(n, sec, k) {
  var b = sec ? (n[sec] || {}) : n;
  return b[k];
}

function _nmFmtNum(v) { return v == null ? '' : _mrNum(v); }

function _nmInput(path, tipo, v, extra) {
  extra = extra || {};
  var aria = ' aria-label="' + _mrEsc(extra.aria || '') + '"';
  var base = ' data-nm="' + path + '" data-tipo="' + tipo + '"' + aria;
  if (tipo === 'opcion' || tipo === 'sino') {
    var ops = tipo === 'sino' ? [['si', 'Sí'], ['no', 'No']] : extra.ops;
    var actual = tipo === 'sino' ? (v === true ? 'si' : v === false ? 'no' : '') : (v || '');
    return '<select' + base + ' style="' + _MR_INPUT + '"><option value="">—</option>' + ops.map(function(o) {
      return '<option value="' + o[0] + '"' + (actual === o[0] ? ' selected' : '') + '>' + _mrEsc(o[1]) + '</option>';
    }).join('') + '</select>';
  }
  if (tipo === 'hora') return '<input type="time"' + base + ' value="' + _mrEsc(v || '') + '" style="' + _MR_INPUT + '">';
  var num = ['entero', 'lote', 'pts', 'usd', 'usd0', 'pct'].indexOf(tipo) >= 0;
  var max = tipo === 'nombre' ? 40 : 200;
  return '<input type="text"' + base + (num ? ' inputmode="decimal" autocomplete="off"' : ' maxlength="' + max + '"') +
         ' value="' + _mrEsc(num ? _nmFmtNum(v) : (v || '')) + '" placeholder="' + _mrEsc(extra.ph || '') + '" style="' + _MR_INPUT + '">';
}

function _nmHtmlFormulario(m) {
  var fila = _nmNormas[m.id];
  var n = (fila && fila.normas) || {};
  var h = '<div class="nm-nota" style="margin-bottom:1.2rem;">Normas de <b style="color:var(--text);">' + _mrEsc(m.nombre) + '</b>' +
          (m.activo ? '' : ' (desactivado)') + '. Todo es opcional: lo que dejes vacío, Aurum no lo mide. ' +
          '<span class="nm-a">[A]</span> = Aurum podrá medirlo con los datos de la EA; el resto es texto para tu tablilla y el tablero.</div>';
  NM_SECCIONES.forEach(function(s) {
    h += '<div class="nm-sec"><div class="nm-sec-t">' + s.t + '</div>' + (s.nota ? '<div class="nm-nota" style="margin-bottom:.8rem;">' + s.nota + '</div>' : '') + '<div class="nm-grid">';
    s.campos.forEach(function(c) {
      var path = (s.sec ? s.sec + '.' : '') + c.k, v = _nmValor(n, s.sec, c.k);
      if (c.tipo === 'lista') {
        for (var i = 0; i < c.n; i++) {
          h += '<label class="nm-campo nm-ancho"><span>' + c.t + ' ' + (i + 1) + _nmA(c) + '</span>' +
               _nmInput(path + '.' + i, 'texto', (v || [])[i], { ph: i === 0 ? c.ph : '', aria: c.t + ' ' + (i + 1) }) + '</label>';
        }
      } else if (c.tipo === 'filas') {
        h += '<div class="nm-ancho nm-filas" style="--nm-cols:' + c.cols.length + ';"><span></span>' + c.cols.map(function(col) {
          return '<span class="nm-col-t nm-cab">' + col.t + '</span>';
        }).join('');
        for (var j = 0; j < c.n; j++) {
          var o = (v || [])[j] || {};
          h += '<span class="nm-col-t">' + c.t + ' ' + (j + 1) + _nmA(c) + '</span>' + c.cols.map(function(col) {
            return _nmInput(path + '.' + j + '.' + col.k, col.tipo, o[col.k], { aria: c.t + ' ' + (j + 1) + ', ' + col.t, ph: col.t });
          }).join('');
        }
        h += '</div>';
      } else {
        h += '<label class="nm-campo' + (c.ancho ? ' nm-ancho' : '') + '"><span>' + c.t + _nmA(c) + (c.ayuda ? ' <i>(' + c.ayuda + ')</i>' : '') + '</span>' +
             _nmInput(path, c.tipo, v, { ops: c.ops, ph: c.ph, aria: c.t }) + '</label>';
      }
    });
    h += '</div></div>';
  });
  h += '<div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-top:1.2rem;">' +
         '<div onclick="nmGuardar(' + m.id + ')" class="btn-outline" role="button" style="font-size:13px;padding:.6rem 1.5rem;' +
           (_nmGuardando ? 'opacity:.5;pointer-events:none;' : '') + '">' + (_nmGuardando ? 'Guardando…' : 'Guardar normas de ' + _mrEsc(m.nombre) + ' →') + '</div>' +
         '<div id="nm-msg" style="font-size:13px;max-width:640px;line-height:1.5;color:' + (_nmMsg && !_nmMsg.ok ? 'var(--red)' : 'var(--green)') + ';">' +
           (_nmMsg ? _mrEsc(_nmMsg.txt) : '') + '</div>' +
       '</div>';
  if (fila && fila.updated_at) {
    h += '<div class="nm-nota" style="margin-top:.8rem;">Último cambio: ' + new Date(fila.updated_at).toLocaleString('es-ES') +
         (fila.actualizado_por && fila.actualizado_por !== _nmEmail ? ' (por ' + _mrEsc(fila.actualizado_por) + ')' : '') +
         '. Cada cambio queda registrado.</div>';
  }
  return h;
}

function _nmHtmlGestionar() {
  var h = '<div class="nm-nota" style="margin-bottom:1rem;">Renombra, añade o desactiva tus modos. Un modo desactivado deja de salir en el plan del día ' +
          'y en estas pestañas, pero sus trades y sus normas se conservan.</div><div class="nm-sec">';
  (_nmModos || []).forEach(function(m) {
    h += '<div class="nm-modo-fila">' +
           '<input id="nm-mo-n-' + m.id + '" type="text" maxlength="40" value="' + _mrEsc(m.nombre) + '" aria-label="Nombre del modo" style="' + _MR_INPUT + '">' +
           '<label style="font-size:13px;color:var(--text-muted);white-space:nowrap;"><input id="nm-mo-a-' + m.id + '" type="checkbox"' + (m.activo ? ' checked' : '') + '> Activo</label>' +
         '</div>';
  });
  h += '<div class="nm-modo-fila" style="margin-top:1rem;">' +
         '<input id="nm-mo-nuevo" type="text" maxlength="40" placeholder="Nuevo modo (p. ej. Noticias)" aria-label="Nombre del nuevo modo" style="' + _MR_INPUT + '">' +
         '<span class="nm-nota">vacío = no se añade</span></div></div>';
  h += '<div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-top:1.2rem;">' +
         '<div onclick="nmGuardarModos()" class="btn-outline" role="button" style="font-size:13px;padding:.6rem 1.5rem;' +
           (_nmGuardando ? 'opacity:.5;pointer-events:none;' : '') + '">' + (_nmGuardando ? 'Guardando…' : 'Guardar modos →') + '</div>' +
         '<div id="nm-msg" style="font-size:13px;color:' + (_nmMsg && !_nmMsg.ok ? 'var(--red)' : 'var(--green)') + ';">' + (_nmMsg ? _mrEsc(_nmMsg.txt) : '') + '</div>' +
       '</div>';
  return h;
}

function _nmEstilos() {
  if (document.getElementById('nm-estilos')) return;
  var s = document.createElement('style');
  s.id = 'nm-estilos';
  s.textContent =
    '.nm-sec{border:1px solid var(--border);background:var(--bg2);padding:1.2rem 1.3rem;margin-bottom:1px;}' +
    '.nm-sec-t{font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--gold);margin-bottom:.8rem;}' +
    '.nm-nota{font-size:13px;color:var(--text-muted);line-height:1.6;}' +
    '.nm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:.7rem 1rem;}' +
    '.nm-campo{display:flex;flex-direction:column;gap:.3rem;font-size:12px;color:var(--text-muted);}' +
    '.nm-campo i{font-style:normal;color:#6b6556;}' +
    '.nm-ancho{grid-column:1/-1;}' +
    '.nm-a{color:#6A9AEE;font-size:11px;letter-spacing:.05em;}' +
    '.nm-filas{display:grid;grid-template-columns:125px repeat(var(--nm-cols),minmax(0,1fr));gap:.45rem .6rem;align-items:center;}' +
    '.nm-col-t{font-size:12px;color:var(--text-muted);}' +
    '.nm-modo-fila{display:grid;grid-template-columns:minmax(0,320px) auto;gap:1rem;align-items:center;margin-bottom:.55rem;}' +
    '#nm-bloque input:focus,#nm-bloque select:focus{border-color:var(--gold)!important;}' +
    '#nm-bloque input::placeholder{color:#6b6556;}' +
    '#nm-bloque input[type=time]{color-scheme:dark;}' +
    '@media (max-width:600px){.nm-filas{grid-template-columns:1fr;}.nm-filas>.nm-cab,.nm-filas>span:first-child{display:none;}.nm-filas>.nm-col-t:not(.nm-cab){margin-top:.6rem;}.nm-modo-fila{grid-template-columns:1fr auto;}}';
  document.head.appendChild(s);
}

// ── Guardar normas ───────────────────────────────────────────────────────

var NM_TIPOS_NUM = { entero: 1, lote: 1, pts: 1, usd: 1, usd0: 1, pct: 1 };

// Etiqueta legible de una ruta ("gestion.tp1_lote" -> "Lote a cerrar en TP1").
function _nmEtiqueta(path) {
  var p = path.split('.');
  var sec = NM_SECCIONES.filter(function(x) { return x.sec === p[0]; })[0];
  if (!sec) { sec = NM_SECCIONES.filter(function(x) { return x.sec === null; })[0]; p.unshift(null); }
  var c = sec.campos.filter(function(x) { return x.k === p[1]; })[0];
  if (!c) return path;
  var t = c.t + (p[2] != null ? ' ' + (Number(p[2]) + 1) : '');
  if (p[3] && c.cols) { var col = c.cols.filter(function(x) { return x.k === p[3]; })[0]; if (col) t += ', ' + col.t; }
  return t;
}

// Lee el formulario → { normas, error }
function _nmLeer() {
  var normas = {}, error = null;
  document.querySelectorAll('#nm-bloque [data-nm]').forEach(function(el) {
    if (error) return;
    var path = el.getAttribute('data-nm'), tipo = el.getAttribute('data-tipo');
    var crudo = (el.value || '').trim(), v;
    if (crudo === '') return;
    if (tipo === 'sino') v = crudo === 'si';
    else if (NM_TIPOS_NUM[tipo]) {
      var t = _mrLeerImporte(crudo);
      if (!/^-?\d+(\.\d+)?$/.test(t)) { error = _nmEtiqueta(path) + ': «' + crudo + '» no es un número.'; return; }
      v = Number(t);
    } else v = crudo;
    // Colocar en su sitio: los índices numéricos crean listas.
    var p = path.split('.'), o = normas;
    for (var i = 0; i < p.length - 1; i++) {
      var sig = /^\d+$/.test(p[i + 1]) ? [] : {};
      if (o[p[i]] == null) o[p[i]] = sig;
      o = o[p[i]];
    }
    o[p[p.length - 1]] = v;
  });
  // Listas sin huecos (lo vacío no se guarda): [ , 'b'] -> ['b']
  (function compactar(o) {
    Object.keys(o).forEach(function(k) {
      if (Array.isArray(o[k])) o[k] = o[k].filter(function(x) { return x != null; });
      if (o[k] && typeof o[k] === 'object') compactar(o[k]);
    });
  })(normas);
  return { normas: normas, error: error };
}

// JSON con las claves ordenadas (Postgres guarda jsonb con otro orden de claves).
function _nmCanon(v) {
  if (Array.isArray(v)) return '[' + v.map(_nmCanon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function(k) { return JSON.stringify(k) + ':' + _nmCanon(v[k]); }).join(',') + '}';
  return JSON.stringify(v);
}

// Mensaje del servidor ("Normas del modo: gestión: el TP2 …") con los nombres de la pantalla.
function _nmTextoError(e) {
  var s = String(e || ''), msg = s;
  try { var j = JSON.parse(s); if (j && j.message) msg = j.message; } catch (x) {}
  if (/Normas del modo:/.test(msg)) {
    msg = msg.replace(/^.*Normas del modo:\s*/, '');
    msg = msg.replace(/\b(cuando|antes|entrada|gestion|primer_trade|escalado|perdiendo|fin|normas)\.([a-z_0-9]+)(\[(\d+)\])?(\.[a-z_]+)?/g, function(all, sec, k, b, idx, sub) {
      var ruta = (sec === 'normas' ? '' : sec + '.') + k + (idx ? '.' + (Number(idx) - 1) + (sub || '') : '');
      var et = _nmEtiqueta(ruta);
      return et === ruta ? all : '«' + et + '»';
    });
    return 'No se ha guardado: ' + msg;
  }
  if (/fijado por el admin/i.test(msg)) return 'No se ha guardado: ' + msg.replace(/^.*Nivel fijado/, 'Nivel fijado') + '.';
  if (/row-level security|42501|JWT/i.test(msg)) return 'Tu sesión ha caducado. Vuelve a entrar e inténtalo de nuevo.';
  console.error('[normas-modo] error al guardar', s);
  return '✗ No se pudo guardar. Inténtalo de nuevo.';
}

async function nmGuardar(modoId) {
  if (_nmGuardando) return;
  var u = window.usuarioActual, token = getToken();
  if (!u || !u.email || !token) return;
  var l = _nmLeer();
  if (l.error) { _nmMsg = { ok: false, txt: l.error }; _nmPintarMsg(); return; }
  var actual = _nmNormas[modoId];
  if (actual && _nmCanon(actual.normas) === _nmCanon(l.normas)) { _nmMsg = { ok: true, txt: 'No hay cambios que guardar.' }; _nmPintarMsg(); return; }
  _nmGuardando = true; _nmMsg = null; _nmPintarMsg(); _nmBotones('Guardando…');
  var r = actual
    ? await supaPatch('modo_normas', 'modo_id=eq.' + modoId, { normas: l.normas }, token)
    : await supaPost('modo_normas', { modo_id: modoId, usuario_email: u.email, normas: l.normas }, 'return=representation', token);
  _nmGuardando = false;
  if (r.error) {
    _nmMsg = { ok: false, txt: _nmTextoError(r.error) };   // el formulario conserva lo escrito
    _nmPintarMsg();
    _nmBotones(null);
    return;
  }
  await nmCargar();
  _nmMsg = { ok: true, txt: '✓ Normas guardadas.' };
  _nmRepintar();
}

// ── Gestionar modos ──────────────────────────────────────────────────────

async function nmGuardarModos() {
  if (_nmGuardando) return;
  var u = window.usuarioActual, token = getToken();
  if (!u || !u.email || !token) return;
  var cambios = [], nombres = {}, error = null;
  (_nmModos || []).forEach(function(m) {
    var nombre = (document.getElementById('nm-mo-n-' + m.id).value || '').trim();
    var activo = document.getElementById('nm-mo-a-' + m.id).checked;
    if (!nombre) { error = 'Un modo no puede quedarse sin nombre (puedes desactivarlo).'; return; }
    nombres[nombre.toLowerCase()] = (nombres[nombre.toLowerCase()] || 0) + 1;
    if (nombre !== m.nombre || activo !== m.activo) cambios.push({ id: m.id, nombre: nombre, activo: activo });
  });
  var nuevo = (document.getElementById('nm-mo-nuevo').value || '').trim();
  if (nuevo) nombres[nuevo.toLowerCase()] = (nombres[nuevo.toLowerCase()] || 0) + 1;
  if (!error && Object.keys(nombres).some(function(k) { return nombres[k] > 1; })) error = 'Hay dos modos con el mismo nombre.';
  if (!error && !cambios.length && !nuevo) error = null;
  if (error) { _nmMsg = { ok: false, txt: error }; _nmPintarMsg(); return; }
  if (!cambios.length && !nuevo) { _nmMsg = { ok: true, txt: 'No hay cambios que guardar.' }; _nmPintarMsg(); return; }
  _nmGuardando = true; _nmMsg = null; _nmPintarMsg(); _nmBotones('Guardando…');
  var fallo = null;
  // Primero los renombrados (por si un nombre pasa de un modo a otro, uno a uno).
  for (var i = 0; i < cambios.length && !fallo; i++) {
    var r = await supaPatch('modos', 'id=eq.' + cambios[i].id, { nombre: cambios[i].nombre, activo: cambios[i].activo }, token);
    if (r.error) fallo = r.error;
  }
  if (!fallo && nuevo) {
    var orden = (_nmModos || []).reduce(function(mx, m) { return Math.max(mx, m.orden || 0); }, 0) + 1;
    var rn = await supaPost('modos', { usuario_email: u.email, nombre: nuevo, orden: orden }, 'return=minimal', token);
    if (rn.error) fallo = rn.error;
  }
  await nmCargar();
  _nmGuardando = false;
  _nmMsg = fallo
    ? { ok: false, txt: /23505|duplicate/i.test(String(fallo)) ? 'Ya tienes un modo con ese nombre.' : _nmTextoError(fallo) }
    : { ok: true, txt: '✓ Modos guardados.' };
  if (typeof _mrPintar === 'function') _mrPintar(); else _nmRepintar();
}

// ── Mensajes ─────────────────────────────────────────────────────────────

function _nmRepintar() { if (typeof _mrPintar === 'function') _mrPintar(); }

function _nmPintarMsg() {
  var el = document.getElementById('nm-msg');
  if (!el) return;
  el.style.color = _nmMsg && !_nmMsg.ok ? 'var(--red)' : 'var(--green)';
  el.textContent = _nmMsg ? _nmMsg.txt : '';
}

// Botón de guardar sin repintar el formulario (no perder lo escrito).
function _nmBotones(texto) {
  var b = document.querySelector('#nm-bloque .btn-outline');
  if (!b) return;
  if (texto) { b.dataset.txt = b.dataset.txt || b.textContent; b.textContent = texto; b.style.opacity = '.5'; b.style.pointerEvents = 'none'; }
  else { if (b.dataset.txt) b.textContent = b.dataset.txt; b.style.opacity = ''; b.style.pointerEvents = ''; }
}
