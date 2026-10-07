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
// Punto 2 (07/10): aciertos, errores y regla de la semana. Salen de "Qué te
// conviene" del Diario (_daConclusionesTodas, diario-analisis.js) con los
// trades auditados por la EA (todas las cuentas, todo el histórico, como el
// Diario en Global → Todo el histórico). La carga es la del Diario
// (_daCargar, compartida: si ya está cargando, se espera la misma).
// Regla de la semana = el error que más dinero cuesta con los trades cerrados
// hasta el domingo anterior (semana de lunes a domingo en hora de servidor
// MT5): no cambia a mitad de semana. Debajo, cómo vas esta semana.
//
// Módulo aislado: solo LEE globales (AURUM_TRADES, usuarioActual,
// _fechaRealTrade y las funciones del Diario) y pinta dentro de
// #tu-situacion. No cambia ningún otro cálculo de la página.
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

  h += '<div id="ts-conclusiones"></div>';
  h += '<div class="ts-base">Base: ' + base + ' trade' + (base === 1 ? '' : 's') + ' de Maestra, Prueba y Retos (importados y de la EA)' +
       '<span id="ts-base-ea"></span>. ' +
       'Rentable = P&amp;L &gt; 0 y PF ≥ 1,1 · en equilibrio = PF 0,9–1,1 · mínimo ' + TS_MIN_TRADES + ' trades en ' + TS_DIAS_VENTANA + ' días. ' +
       'Pulsa una cuenta para verla en el Diario.</div>';
  cont.innerHTML = h;
  _tsPintarConclusiones();
}

// ── Aciertos, errores y regla de la semana (punto 2) ─────────────────────

var TS_MAX_LISTA = 3;

function _tsListaConclusiones(lista, tipo) {
  if (!lista.length) {
    return '<div class="ts-vacio">' + (tipo === 'acierto' ? 'Ninguna comparación sale a tu favor todavía.' : 'Ninguna comparación sale en contra.') + '</div>';
  }
  return '<ol class="ts-lista">' + lista.map(function(x) {
    return '<li title="' + _tsEsc(x.frase) + '">' + _tsEsc(x.corta) + '</li>';
  }).join('') + '</ol>';
}

function _tsMejores(conc, tipo) {
  return conc.filter(function(x) { return x.tipo === tipo && x.dinero > 0; })
             .sort(function(a, b) { return b.dinero - a.dinero; }).slice(0, TS_MAX_LISTA);
}

// Lunes 00:00 de la semana en curso, en hora de servidor MT5 (convención del Diario).
function _tsLunesServidor() {
  var ahora = (typeof _moServidorAhoraMs === 'function' && typeof _moOffsetMs !== 'undefined' && _moOffsetMs != null)
    ? _moServidorAhoraMs() : Date.now();
  return _daLunes(new Date(ahora).toISOString());
}

// Cómo vas esta semana con la regla (filas = trades de la EA cerrados esta semana).
function _tsProgreso(regla, filas) {
  if (!filas.length) return 'Esta semana aún no hay trades de la EA cerrados.';
  var an = _daAnalizadas(filas), porFp = _daTradesPorFp();
  var pl = function(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); };
  var c = regla.clave;
  if (c === 'seguidas') {
    var conAnt = filas.filter(function(r) { return r._gapMin != null; });
    var s = conAnt.filter(function(r) { return r._seguida; }).length;
    return 'Esta semana: ' + pl(s, 'entrada seguida', 'entradas seguidas') + ' de ' + pl(conAnt.length, 'trade', 'trades') + ' con un trade anterior.';
  }
  if (c === 'vueltas') {
    var v = filas.filter(function(r) { return r._vueltaA; }).length;
    return v ? 'Esta semana: ' + pl(v, 'vuelta', 'vueltas') + ' de posición.' : 'Esta semana: ninguna vuelta de posición. ✓';
  }
  if (c.indexOf('nivel:') === 0) {
    var dias = {};
    filas.forEach(function(r) { var k = r.cuenta_numero + '|' + _daDiaMs(r.fecha_cierre); (dias[k] = dias[k] || []).push(r); });
    var llego = 0, cumplida = 0;
    Object.keys(dias).forEach(function(k) {
      _daNivelesDia(dias[k], porFp).forEach(function(h) {
        if (h.nivel.regla !== regla.nivel.regla || h.nivel.nivel !== regla.nivel.nivel || h.nivel.valor !== regla.nivel.valor) return;
        llego++;
        if (!_daVeredictoNivel(h)) cumplida++;
      });
    });
    return llego ? 'Esta semana: cumplida ' + cumplida + ' de ' + pl(llego, 'día', 'días') + ' en que llegaste al nivel.'
                 : 'Esta semana aún no has llegado a ese nivel.';
  }
  if (c === 'be_antes_tp1') {
    var ev = an.filter(function(r) { return r.be_antes_tp1 != null; });
    var b = ev.filter(function(r) { return r.be_antes_tp1; }).length;
    return ev.length ? 'Esta semana: BE antes de TP1 en ' + b + ' de ' + pl(ev.length, 'trade evaluado', 'trades evaluados') + '.'
                     : 'Esta semana aún no hay trades analizados donde se pueda medir.';
  }
  if (c === 'tp1_no_asegurado') {
    var alc = an.filter(function(r) { return r.tp1_alcanzado; });
    var na = alc.filter(function(r) { return r.tp1_no_asegurado; }).length;
    return alc.length ? 'Esta semana: ' + na + ' sin asegurar de ' + pl(alc.length, 'vez', 'veces') + ' que llegaste a TP1.'
                      : 'Esta semana aún no has llegado a TP1 en ningún trade analizado.';
  }
  if (c === 'runners') {
    var rn = an.filter(function(r) { return r.runner === true; }).length;
    return 'Esta semana: ' + pl(rn, 'runner', 'runners') + '.';
  }
  if (c === 'dejar_correr') {
    var cm = an.filter(function(r) { return r.dejar_correr === true; }).length;
    return 'Esta semana: ' + pl(cm, 'cierre a mano con SL', 'cierres a mano con SL') + '.';
  }
  return '';
}

async function _tsPintarConclusiones() {
  var el = document.getElementById('ts-conclusiones');
  var u = window.usuarioActual;
  if (!el || !u || typeof _daCargar !== 'function' || typeof _daConclusionesTodas !== 'function') return;
  if (_daDatos == null || _daDatosEmail !== u.email) {
    el.innerHTML = '<div class="ts-vacio" style="margin-top:1rem;">Cargando lo que haces bien y lo que te cuesta…</div>';
    await _daCargar();
    el = document.getElementById('ts-conclusiones');
    if (!el || !window.usuarioActual || window.usuarioActual.email !== u.email) return;
  }
  var todos = _daDatosEmail === u.email ? (_daDatos || []) : [];
  var filas = _daAnalizadas(todos);
  var baseEa = document.getElementById('ts-base-ea');
  if (baseEa) baseEa.textContent = todos.length ? ' · ' + filas.length + ' auditados por la EA (Diario)' : '';

  var cab = '<div class="ts-mes-cab" style="margin-top:1rem;"><span class="ts-sub">Lo que haces bien y lo que te cuesta · todo el histórico</span></div>';
  if (!todos.length) {
    el.innerHTML = cab + '<div class="ts-vacio">Disponible cuando tus trades pasen por la EA.</div>';
    return;
  }
  if (filas.length < DA_MIN_TRADES_CONVIENE) {
    el.innerHTML = cab + '<div class="ts-vacio">Con ' + filas.length + ' trades auditados todavía no hay base suficiente (mínimo ' + DA_MIN_TRADES_CONVIENE + ').</div>';
    return;
  }
  var porFp = _daTradesPorFp();
  var conc = _daConclusionesTodas(filas, porFp);
  var h = cab + '<div class="ts-ae">' +
            '<div><div class="ts-ae-tit" style="color:var(--green);">✓ Lo que haces bien</div>' + _tsListaConclusiones(_tsMejores(conc, 'acierto'), 'acierto') + '</div>' +
            '<div><div class="ts-ae-tit" style="color:var(--red);">✗ Lo que te cuesta</div>' + _tsListaConclusiones(_tsMejores(conc, 'error'), 'error') + '</div>' +
          '</div>';

  // Regla de la semana: con los trades cerrados antes del lunes de esta semana.
  var lunes = _tsLunesServidor();
  var antes = filas.filter(function(r) { return _daFecha(r.fecha_cierre).getTime() < lunes; });
  var semana = todos.filter(function(r) { return _daFecha(r.fecha_cierre).getTime() >= lunes; });
  var sem = 'W' + _daSemanaIso(lunes);
  h += '<div class="ts-regla"><div class="ts-ae-tit" style="color:var(--gold-bright);">◆ Regla de la semana (' + sem + ')</div>';
  var regla = antes.length >= DA_MIN_TRADES_CONVIENE ? _tsMejores(_daConclusionesTodas(antes, porFp), 'error')[0] : null;
  if (!regla) {
    h += '<div class="ts-vacio">' + (antes.length < DA_MIN_TRADES_CONVIENE
           ? 'Sin base suficiente hasta el domingo pasado (' + antes.length + ' trades auditados, mínimo ' + DA_MIN_TRADES_CONVIENE + ').'
           : 'Hasta el domingo pasado ninguna comparación salía en contra: sin regla esta semana.') + '</div>';
  } else {
    h += '<div class="ts-regla-txt">«' + _tsEsc(regla.regla) + '»</div>' +
         '<div class="ts-linea" style="color:var(--text-muted);font-size:13px;" title="' + _tsEsc(regla.frase) + '">Por qué: ' + _tsEsc(regla.corta) +
           ' (hasta el domingo pasado, ' + antes.length + ' trades).</div>' +
         '<div class="ts-linea" style="margin-top:.2rem;">' + _tsEsc(_tsProgreso(regla, semana)) + '</div>';
  }
  h += '</div>';
  el.innerHTML = h;
}
