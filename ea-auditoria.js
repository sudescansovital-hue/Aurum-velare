// ============================================================
// AUDITORÍA EA — badge de Cumplimiento + línea de tiempo por trade
// Fase 4 de brief_diario_linea_tiempo_ea.md.
//
// Módulo aislado a propósito (decisión de sesión 08/08): no importa ni
// modifica ninguna función de cálculo existente (buildCumplimiento,
// porMesCumpl, _esSlProtegido...). Solo LEE _esSlProtegido y
// getTradesActivos (helpers puros ya existentes) y duplica la única
// línea de criterio "dentro del método" que necesita, en vez de
// compartir una función con el cálculo de Cumplimiento.
//
// La idea original del brief (línea de tiempo dentro de una entrada del
// Diario con foto) se descartó esta sesión: diario_entradas no tiene fp
// ni imagen (confirmado por SQL en Supabase 08/08), vincular foto+trade
// ahí queda como funcionalidad futura aparte. En su lugar, este bloque
// vive en Trade Record, donde ya hay trades reales con fp.
// ============================================================

var _eaAuditoriaUltimoLen = -1;

// XAUUSD: 1.00 de movimiento de precio × 1.0 lote = 100 USD (contract size 100 oz).
// Verificado contra trade real 2026.08.27_21978908: 4.035 pts × 100 × 0.2 = 80.70 $.
// El módulo entero es XAU-only (filtro fuente='ea' + brief), así que la constante
// es válida. FIX 27/08: sustituye el $/punto que antes se derivaba de
// precio_cierre/beneficio del trade (frágil, se disparaba si precio_cierre estaba
// corrupto por un parcial mal clasificado).
var VALOR_PUNTO_XAUUSD = 100;

// Mismo criterio que usa buildCumplimiento en gestion.js para "dentro del
// método" (t.puntos <= limAire || SL protegido en breakeven+). Duplicado
// aquí a propósito, no compartido — ver comentario de cabecera.
function _eaAuditoriaDentroDeMetodo(t, limAire) {
  return t.puntos <= limAire || (typeof _esSlProtegido === 'function' && _esSlProtegido(t));
}

// Parser propio del formato de fp que genera BuildFp() en el EA
// ("YYYY.MM.DD_positionId") — fechaDesdeFp() de gestion.js espera
// "YYYY.MM.DD HH:MM:SS" (formato de imports), no reconocería este.
// Aislado a propósito, no se comparte con gestion.js.
function _eaAuditoriaFechaDesdeFp(fp) {
  if (!fp) return null;
  var m = String(fp).match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

// FIX 27/08: el label depende del tipo_evento explícito que llega de BD, ya no
// del signo/tamaño del $ calculado en el front. El EA decide breakeven /
// sl_protegido / sl_ajustado (distancia con signo a la entrada) y
// cierre_tp / cierre_sl / cierre_manual (DEAL_REASON). 'breakeven' y 'cierre'
// a secas siguen apareciendo en filas anteriores a la migración.
function _eaAuditoriaTipoLabel(tipoEvento) {
  return {
    entrada:       'Entrada',
    breakeven:     'Breakeven',
    sl_protegido:  'SL protegido',
    sl_ajustado:   'SL ajustado',
    parcial:       'Parcial',
    cierre:        'Cierre',
    cierre_tp:     'Cierre (TP)',
    cierre_sl:     'Cierre (SL)',
    cierre_manual: 'Cierre (manual)'
  }[tipoEvento] || tipoEvento;
}

// FIX 27/08: el $ de cada evento sale de SUS PROPIOS datos, nunca del resultado
// final del trade (precio_cierre/beneficio) — que es justo lo que se corrompía.
//   1) parcial con beneficio real del deal -> exacto
//   2) movimiento de SL -> $ nocional bloqueado = puntos(con signo) × valor_punto
//      × volumen abierto en ese momento
//   3) parcial sin beneficio (fila anterior a la migración) -> estima con
//      precio/volumen del propio evento
function _eaAuditoriaDolaresEvento(t, ev) {
  if (ev.tipo_evento === 'parcial' && ev.beneficio != null) {
    return Math.round(parseFloat(ev.beneficio) * 100) / 100;
  }
  if (['breakeven', 'sl_protegido', 'sl_ajustado'].indexOf(ev.tipo_evento) !== -1
      && ev.puntos_desde_entrada != null && ev.volumen_restante != null) {
    return Math.round(parseFloat(ev.puntos_desde_entrada)
                    * VALOR_PUNTO_XAUUSD
                    * parseFloat(ev.volumen_restante) * 100) / 100;
  }
  if (ev.tipo_evento === 'parcial' && ev.precio != null && ev.volumen_afectado != null
      && t.precio_entrada != null && t.tipo) {
    var d = t.tipo === 'sell' ? (t.precio_entrada - ev.precio) : (ev.precio - t.precio_entrada);
    return Math.round(d * VALOR_PUNTO_XAUUSD * parseFloat(ev.volumen_afectado) * 100) / 100;
  }
  return null;
}

function _eaAuditoriaFormatHora(ts) {
  var d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  // FIX 01/09: el EA (DatetimeToISO) manda la hora de pared local SIN offset y
  // Postgres la fija como +00 en el timestamptz. Sin timeZone aquí,
  // toLocaleString volvía a proyectar ese instante a la zona del navegador y
  // sumaba el offset una segunda vez (+2h en CEST) — verificado con datos
  // reales, position_id 6421549. Renderizamos en UTC = misma hora de pared
  // que hay en Supabase y en el EA.
  return d.toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC'
  });
}

function _eaAuditoriaDetalleEvento(ev) {
  var partes = [];
  if (ev.puntos_desde_entrada != null) {
    var pts = Math.round(parseFloat(ev.puntos_desde_entrada) * 10) / 10;
    partes.push((pts >= 0 ? '+' : '') + pts + ' pts'); // FIX 27/08: puntos con signo
  }
  if (ev.precio != null) partes.push(parseFloat(ev.precio).toFixed(2));
  if (ev.tipo_evento === 'entrada' && ev.volumen_restante != null) {
    partes.push(parseFloat(ev.volumen_restante) + ' lotes');
  }
  if (ev.tipo_evento === 'parcial') {
    if (ev.volumen_afectado != null) partes.push('cerró ' + parseFloat(ev.volumen_afectado));
    if (ev.volumen_restante != null) partes.push('quedan ' + parseFloat(ev.volumen_restante));
  }
  return partes.length ? partes.join(' · ') : '—';
}

function _eaAuditoriaCrearFila(t, eventos, limAire) {
  var dentro = _eaAuditoriaDentroDeMetodo(t, limAire);
  var fecha = _eaAuditoriaFechaDesdeFp(t.fp);
  var fechaStr = fecha ? fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : (t.fp || '—');
  var pts = t.puntos != null ? Math.round(t.puntos * 10) / 10 : null;
  var ben = t.beneficio != null ? (t.beneficio >= 0 ? '+' : '') + Math.round(t.beneficio * 100) / 100 + '$' : '';

  var fila = document.createElement('div');
  fila.style.cssText = 'background:var(--bg2);padding:1rem 1.2rem;';

  var cabecera = document.createElement('div');
  cabecera.style.cssText = 'display:flex;justify-content:space-between;align-items:center;cursor:pointer;gap:1rem;flex-wrap:wrap;';

  var volEntrada = t.volumen != null ? ' · ' + t.volumen + ' lot' : ''; // FIX 27/08: volumen de entrada en la cabecera
  var izq = document.createElement('div');
  izq.innerHTML =
    '<span style="font-size:13px;color:var(--text-dim);">' + fechaStr + (t.tipo ? ' · ' + t.tipo : '') + volEntrada + '</span>' +
    '<span style="font-size:11px;padding:.15rem .6rem;letter-spacing:.1em;text-transform:uppercase;margin-left:.6rem;border:1px solid ' +
      (dentro ? '#3AAA6A44' : '#CC554444') + ';background:' + (dentro ? '#3AAA6A14' : '#CC554414') + ';color:' +
      (dentro ? 'var(--green)' : 'var(--red)') + ';">' + (dentro ? 'Dentro del método' : 'Fuera del método') + '</span>';

  var der = document.createElement('div');
  der.style.cssText = 'font-size:13px;color:var(--text-muted);display:flex;align-items:center;gap:.5rem;';
  var resumen = document.createElement('span');
  resumen.textContent = (pts != null ? pts + ' pts · ' : '') + ben;
  var flecha = document.createElement('span');
  flecha.textContent = '▾';
  der.appendChild(resumen);
  der.appendChild(flecha);

  cabecera.appendChild(izq);
  cabecera.appendChild(der);
  fila.appendChild(cabecera);

  var timeline = document.createElement('div');
  timeline.style.cssText = 'display:none;margin-top:.8rem;padding-top:.8rem;border-top:1px solid var(--border);';
  eventos.forEach(function(ev) {
    var rowEv = document.createElement('div');
    rowEv.style.cssText = 'display:flex;gap:1rem;padding:.4rem 0;font-size:13px;color:var(--text-dim);border-bottom:1px solid #0A0C14;';
    var dolaresEv = _eaAuditoriaDolaresEvento(t, ev);
    rowEv.innerHTML =
      '<span style="width:110px;color:var(--text-muted);flex-shrink:0;">' + _eaAuditoriaFormatHora(ev.timestamp) + '</span>' +
      '<span style="width:130px;color:var(--gold-dim);flex-shrink:0;">' + _eaAuditoriaTipoLabel(ev.tipo_evento) + '</span>' +
      '<span>' + _eaAuditoriaDetalleEvento(ev) + (dolaresEv != null ? ' · ' + (dolaresEv >= 0 ? '+' : '') + dolaresEv + '$' : '') + '</span>';
    timeline.appendChild(rowEv);
  });
  fila.appendChild(timeline);

  var abierto = false;
  cabecera.onclick = function() {
    abierto = !abierto;
    timeline.style.display = abierto ? 'block' : 'none';
    flecha.textContent = abierto ? '▴' : '▾';
  };

  return fila;
}

async function buildAuditoriaEA() {
  var contenedor = document.getElementById('ea-auditoria-bloque');
  if (!contenedor) return;

  var trades = (typeof getTradesActivos === 'function') ? getTradesActivos()
             : (window.AURUM_TRADES && window.AURUM_TRADES.todos) || [];

  // Punto 4 del brief: solo trades fuente='ea' con sl Y tp no nulos.
  var elegibles = trades.filter(function(t) {
    return t.fuente === 'ea' && t.sl != null && t.tp != null && t.fp;
  });
  if (!elegibles.length) { contenedor.innerHTML = ''; return; }

  var token = (typeof getToken === 'function') ? getToken() : null;
  var fpList = elegibles.map(function(t) { return '%22' + encodeURIComponent(t.fp) + '%22'; }).join(',');

  var r = await supaGet('trade_eventos', 'fp=in.(' + fpList + ')&order=timestamp.asc', token);
  if (r.error || !Array.isArray(r.data) || !r.data.length) { contenedor.innerHTML = ''; return; }

  var porFp = {};
  r.data.forEach(function(ev) {
    if (!porFp[ev.fp]) porFp[ev.fp] = [];
    porFp[ev.fp].push(ev);
  });

  // Solo entran trades que además tienen eventos reales — silencioso si no hay.
  var conEventos = elegibles.filter(function(t) { return porFp[t.fp] && porFp[t.fp].length; });
  if (!conEventos.length) { contenedor.innerHTML = ''; return; }

  conEventos.sort(function(a, b) {
    var fa = _eaAuditoriaFechaDesdeFp(a.fp);
    var fb = _eaAuditoriaFechaDesdeFp(b.fp);
    if (!fa && !fb) return 0;
    if (!fa) return 1;
    if (!fb) return -1;
    return fb - fa; // más reciente primero
  });

  var limAire = (window.usuarioActual && window.usuarioActual.sl_aire) || 25;

  contenedor.innerHTML = '';
  var titulo = document.createElement('div');
  titulo.className = 'tag';
  titulo.style.display = 'block';
  titulo.style.marginBottom = '1rem';
  titulo.textContent = 'Auditoría EA · Línea de tiempo por trade';
  contenedor.appendChild(titulo);

  var lista = document.createElement('div');
  lista.style.cssText = 'display:flex;flex-direction:column;gap:1px;background:var(--border);';
  conEventos.forEach(function(t) { lista.appendChild(_eaAuditoriaCrearFila(t, porFp[t.fp], limAire)); });
  contenedor.appendChild(lista);
}

// ── Enganche: solo escucha (addEventListener), nunca sobreescribe onclick
// existente ni toca gestTab/verCuenta/actualizarDashboard. El polling es
// la red de seguridad para la carga inicial (trades llegan async tras login).
function _eaAuditoriaComprobarCambio() {
  var trades = window.AURUM_TRADES && window.AURUM_TRADES.todos;
  if (trades && trades.length !== _eaAuditoriaUltimoLen) {
    _eaAuditoriaUltimoLen = trades.length;
    buildAuditoriaEA();
  }
}

document.addEventListener('DOMContentLoaded', function() {
  setInterval(_eaAuditoriaComprobarCambio, 1000);
  ['gtab-trade-record', 'btn-global', 'btn-maestra', 'btn-retos', 'btn-prueba'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function() { buildAuditoriaEA(); });
  });
});
