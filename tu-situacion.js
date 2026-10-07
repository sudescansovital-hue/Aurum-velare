// ============================================================
// TU SITUACIÓN — Mi proceso, punto 1 (07/10). Ver ESTADO.md, "Mi proceso: Tu
// situación y barra por días limpios", Propuesta A.
//
// Por cuenta (Maestra / Prueba / Retos): ¿eres rentable en los últimos 90 días?
// y la evolución del P&L mes a mes (últimos 6 meses).
//
// Datos: solo `trades` (window.AURUM_TRADES.todos, lo que ya carga
// actualizarDashboard): importados y de la EA. Vale para cualquier usuario,
// con EA o sin ella. Cuentas con el mismo criterio que las pestañas de Mi
// gestión (getTradesActivos() en gestion.js): si el admin asigna número a la
// carpeta (usuarios_aurum.cuenta_maestra / cuenta_prueba / cuenta_retos), los
// trades con ese cuenta_numero; si no, los que tengan la carpeta en `cuenta`
// ("Cuenta Retos"…). Sin número ni trades de la carpeta → "Sin cuenta
// asignada". Las cuentas sin carpeta no salen aquí (Historial externo).
// Fecha de cada trade: _fechaRealTrade() de gestion.js (fp, luego fecha;
// `trades` no guarda el cierre, así que es el día del trade).
//
// Rentable = P&L > 0 y PF ≥ 1,1; En equilibrio = PF 0,9–1,1; No rentable = el
// resto. Con menos de TS_MIN_TRADES trades en la ventana no se juzga.
//
// Módulo aislado: solo LEE globales (AURUM_TRADES, usuarioActual,
// _fechaRealTrade) y pinta dentro de #tu-situacion. No cambia ningún otro
// cálculo de la página.
// ============================================================

var TS_DIAS_VENTANA = 90;
var TS_MIN_TRADES   = 30;
var TS_MESES        = 6;
var TS_PF_RENTABLE  = 1.1;
var TS_PF_EQUILIBRIO_MIN = 0.9;

var TS_CARPETAS = [
  { id: 'maestra', txt: 'Maestra', campo: 'cuenta_maestra', clave: 'maestra' },
  { id: 'prueba',  txt: 'Prueba',  campo: 'cuenta_prueba',  clave: 'prueba' },
  { id: 'retos',   txt: 'Retos',   campo: 'cuenta_retos',   clave: 'retos' }
];
var TS_MESES_TXT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

var _tsCuenta = null; // carpeta elegida en "Evolución mes a mes"

function _tsEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// Importe en formato español con punto de miles y signo: +2.340 $, −410 $.
function _tsDolares(v, decimales) {
  var d = decimales || 0;
  var abs = Math.abs(v);
  var partes = abs.toFixed(d).split('.');
  partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  var txt = partes.join(',');
  if (Number(abs.toFixed(d)) === 0) return '0 $';
  return (v < 0 ? '−' : '+') + txt + ' $';
}

function _tsNum(v, decimales) {
  return v.toFixed(decimales).replace('.', ',');
}

function _tsColor(v) {
  return v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text-muted)';
}

// Trades de una carpeta, con su fecha (criterio de getTradesActivos). null si
// la carpeta no tiene número asignado ni trades con su etiqueta.
function _tsTradesCarpeta(c) {
  var u = window.usuarioActual;
  var num = u && u[c.campo] ? String(u[c.campo]) : null;
  var todos = (window.AURUM_TRADES && window.AURUM_TRADES.todos) || [];
  var esDeLaCarpeta = num
    ? function(t) { return t.cuenta_numero != null && String(t.cuenta_numero) === num; }
    : function(t) { return t.cuenta && t.cuenta.toLowerCase().indexOf(c.clave) >= 0; };
  var out = [];
  todos.forEach(function(t) {
    if (!esDeLaCarpeta(t)) return;
    var f = typeof _fechaRealTrade === 'function' ? _fechaRealTrade(t) : null;
    if (!f || isNaN(f.getTime())) return;
    out.push({ f: f, b: parseFloat(t.beneficio) || 0 });
  });
  if (!num && !out.length) return null;
  return out;
}

function _tsResumen(lista) {
  var pnl = 0, gan = 0, per = 0;
  lista.forEach(function(x) { pnl += x.b; if (x.b > 0) gan += x.b; else per += -x.b; });
  var pf = per > 0 ? gan / per : (gan > 0 ? Infinity : null);
  return { n: lista.length, pnl: pnl, pf: pf, porTrade: lista.length ? pnl / lista.length : 0 };
}

function _tsVeredicto(r) {
  if (r.n < TS_MIN_TRADES) return { txt: 'Sin trades suficientes (' + r.n + ' de ' + TS_MIN_TRADES + ')', color: 'var(--text-muted)', icono: '' };
  if (r.pnl > 0 && r.pf >= TS_PF_RENTABLE) return { txt: 'Rentable', color: 'var(--green)', icono: '✓ ' };
  if (r.pf != null && r.pf >= TS_PF_EQUILIBRIO_MIN && r.pf <= TS_PF_RENTABLE) return { txt: 'En equilibrio', color: 'var(--gold)', icono: '≈ ' };
  return { txt: 'No rentable', color: 'var(--red)', icono: '✗ ' };
}

function _tsIrAlDiario(carpeta) {
  if (typeof irA === 'function') irA('gestion');
  setTimeout(function() {
    var tab = document.getElementById('gtab-diario');
    if (tab) tab.click();
    if (typeof _daElegirCuenta === 'function') _daElegirCuenta(carpeta);
  }, 400);
}

function _tsElegirCuenta(id) {
  _tsCuenta = id;
  buildTuSituacion();
}

function buildTuSituacion() {
  var cont = document.getElementById('tu-situacion');
  if (!cont) return;
  var u = window.usuarioActual;
  if (!u || !window.AURUM_TRADES) { cont.innerHTML = ''; return; }

  var ahora = new Date();
  var hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  var desde = new Date(hoy.getTime() - (TS_DIAS_VENTANA - 1) * 86400000);

  var cuentas = TS_CARPETAS.map(function(c) {
    var lista = _tsTradesCarpeta(c);
    return { c: c, num: u[c.campo] || null, lista: lista };
  });
  var conDatos = cuentas.filter(function(x) { return x.lista && x.lista.length; });
  var base = conDatos.reduce(function(s, x) { return s + x.lista.length; }, 0);

  var hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  var h = '<div class="ts-cab"><span class="tag" style="margin:0;">Tu situación</span>' +
          '<span class="ts-hora">actualizado hoy ' + _tsEsc(hora) + '</span></div>';

  // ── Rentable por cuenta (últimos 90 días) ──
  h += '<div class="ts-cuentas">';
  cuentas.forEach(function(x) {
    var cab = '<span class="ts-nombre">' + _tsEsc(x.c.txt.toUpperCase()) + ' · ' + (x.num ? _tsEsc(x.num) : '—') + '</span>';
    if (!x.lista) {
      h += '<div class="ts-cuenta">' + cab + '<span class="ts-ver" style="color:var(--text-muted);">Sin cuenta asignada</span>' +
           '<div class="ts-linea">El admin asigna la cuenta de cada carpeta.</div></div>';
      return;
    }
    var ult = x.lista.filter(function(t) { return t.f >= desde; });
    var r = _tsResumen(ult), v = _tsVeredicto(r);
    var linea = r.n === 0
      ? 'Sin trades en los últimos ' + TS_DIAS_VENTANA + ' días.'
      : 'Últimos ' + TS_DIAS_VENTANA + ' días: <b style="color:' + _tsColor(r.pnl) + ';">' + _tsDolares(r.pnl) + '</b> · ' +
        r.n + ' trade' + (r.n === 1 ? '' : 's') +
        ' · PF ' + (r.pf == null ? '—' : r.pf === Infinity ? '∞' : _tsNum(r.pf, 2)) +
        ' · ' + _tsDolares(r.porTrade, 1).replace(' $', ' $/trade');
    h += '<div class="ts-cuenta" onclick="_tsIrAlDiario(\'' + x.c.id + '\')" title="Ver en el Diario">' + cab +
         '<span class="ts-ver" style="color:' + v.color + ';">' + v.icono + _tsEsc(v.txt) + '</span>' +
         '<div class="ts-linea">' + linea + '</div></div>';
  });
  h += '</div>';

  // ── Evolución mes a mes ──
  if (conDatos.length) {
    if (!_tsCuenta || !conDatos.some(function(x) { return x.c.id === _tsCuenta; })) _tsCuenta = conDatos[0].c.id;
    var elegida = conDatos.filter(function(x) { return x.c.id === _tsCuenta; })[0];
    h += '<div class="ts-mes-cab"><span class="ts-sub">Evolución mes a mes · ' + _tsEsc(elegida.c.txt) + '</span><span class="ts-chips">';
    conDatos.forEach(function(x) {
      h += '<button class="ts-chip' + (x.c.id === _tsCuenta ? ' activo' : '') + '" onclick="_tsElegirCuenta(\'' + x.c.id + '\')">' + _tsEsc(x.c.txt) + '</button>';
    });
    h += '</span></div><div class="ts-meses">';
    for (var i = TS_MESES - 1; i >= 0; i--) {
      var m = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      var sig = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      var delMes = elegida.lista.filter(function(t) { return t.f >= m && t.f < sig; });
      var rm = _tsResumen(delMes);
      h += '<div class="ts-mes"><div class="ts-mes-nombre">' + TS_MESES_TXT[m.getMonth()] + (i === 0 ? ' <span>(en curso)</span>' : '') + '</div>' +
           '<div class="ts-mes-pnl" style="color:' + (rm.n ? _tsColor(rm.pnl) : 'var(--text-muted)') + ';">' + (rm.n ? _tsDolares(rm.pnl) : '—') + '</div>' +
           '<div class="ts-mes-n">' + (rm.n ? rm.n + ' trade' + (rm.n === 1 ? '' : 's') : 'sin trades') + '</div></div>';
    }
    h += '</div>';
  }

  h += '<div class="ts-base">Base: ' + base + ' trade' + (base === 1 ? '' : 's') + ' de Maestra, Prueba y Retos (importados y de la EA). ' +
       'Rentable = P&amp;L &gt; 0 y PF ≥ 1,1 · en equilibrio = PF 0,9–1,1 · mínimo ' + TS_MIN_TRADES + ' trades en ' + TS_DIAS_VENTANA + ' días. ' +
       'Pulsa una cuenta para verla en el Diario.</div>';
  cont.innerHTML = h;
}
