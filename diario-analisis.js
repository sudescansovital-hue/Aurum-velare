// ============================================================
// DIARIO — análisis post-cierre de los trades de la EA (FASE 2)
// Ver: docs/DISENO_POST_CIERRE.md, sql_post_cierre.sql, api/post-cierre.js
//
// Módulo aislado, mismo criterio que ea-auditoria.js: no modifica ninguna
// función existente. Solo LEE helpers globales (supaGet, getToken,
// usuarioActual, AURUM_TRADES, _eaAuditoriaTipoLabel) y pinta dentro de
// #diario-analisis-bloque. Si el usuario no tiene filas en
// post_cierre_analisis, el bloque queda vacío.
//
// Datos: post_cierre_analisis (ligera, se carga entera) y, al pulsar un
// trade, post_cierre_velas + trade_eventos de ese fp. P&L y WR salen de
// trades (AURUM_TRADES, fuente de verdad), cruzando por fp.
//
// Semana: de lunes a domingo en hora de servidor MT5. Las fechas vienen
// etiquetadas +00 sin serlo (misma convención que ea_trades), así que se
// trabaja siempre con getUTC*.
// ============================================================

var _daDatos = null;          // filas de post_cierre_analisis
var _daCargando = false;
var _daSemana = null;         // ms del lunes 00:00 de la semana elegida
var _daCuenta = 'global';     // 'global' | cuenta_numero
var _daEstrategia = 'todas';  // filtro de la lista de trades
var _daAbierto = null;        // fp desplegado

var DA_MS_DIA = 86400000;
var DA_DECISIONES = ['bien_cerrado', 'mixto_te_saliste_con_poco', 'pronto', 'correcto'];
var DA_ESTRATEGIAS = ['rechazo_rsi', 'estructura', null];
var DA_COLOR = { entrada: '#C9A84C', sl: '#CC4433', tp: '#3AAA6A', precio: '#D0C4A8' };

var DA_TXT = {
  bien_cerrado: 'Bien cerrado',
  mixto_te_saliste_con_poco: 'Mixto',
  pronto: 'Pronto',
  correcto: 'Correcto',
  indeterminado: 'Indeterminado',
  te_salvo: 'Te salvó',
  mixto_te_saco_de_un_recorrido: 'Mixto (BE)',
  te_saco_de_un_ganador: 'Te sacó',
  sin_efecto: 'Sin efecto',
  sl_original_o_ajustado_perdida: 'Pérdida',
  sl_breakeven: 'Breakeven',
  sl_beneficio_trailing: 'Trailing',
  manual: 'Cierre a mano',
  tp: 'TP',
  desconocido: '—'
};

function _daEsc(s) {
  var d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function _daNum(v, dec) {
  if (v == null || isNaN(v)) return '—';
  return (Math.round(parseFloat(v) * Math.pow(10, dec)) / Math.pow(10, dec)).toLocaleString('es-ES');
}

function _daFecha(iso) { return new Date(iso); }

function _daLunes(iso) {
  var d = _daFecha(iso);
  var dia = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return dia - ((d.getUTCDay() + 6) % 7) * DA_MS_DIA;
}

function _daSemanaIso(lunesMs) {
  var d = new Date(lunesMs + 3 * DA_MS_DIA); // jueves de esa semana
  var ene4 = Date.UTC(d.getUTCFullYear(), 0, 4);
  var lunesSem1 = ene4 - ((new Date(ene4).getUTCDay() + 6) % 7) * DA_MS_DIA;
  return Math.floor((lunesMs - lunesSem1) / (7 * DA_MS_DIA)) + 1;
}

function _daEtiquetaSemana(lunesMs) {
  var f = function(ms) {
    return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  };
  return 'W' + _daSemanaIso(lunesMs) + ' · ' + f(lunesMs) + ' – ' + f(lunesMs + 6 * DA_MS_DIA);
}

function _daHora(iso) {
  var d = _daFecha(iso);
  var p = function(n) { return String(n).padStart(2, '0'); };
  return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
}

function _daNombreCuenta(num) {
  var u = window.usuarioActual || {};
  var n = String(num);
  if (u.cuenta_maestra && String(u.cuenta_maestra) === n) return 'Maestra · ' + n;
  if (u.cuenta_retos   && String(u.cuenta_retos)   === n) return 'Retos · ' + n;
  if (u.cuenta_prueba  && String(u.cuenta_prueba)  === n) return 'Prueba · ' + n;
  return n;
}

function _daTradesPorFp() {
  var m = {};
  ((window.AURUM_TRADES && window.AURUM_TRADES.todos) || []).forEach(function(t) { if (t.fp) m[t.fp] = t; });
  return m;
}

function _daFiltrarCuenta(filas) {
  if (_daCuenta === 'global') return filas;
  return filas.filter(function(r) { return String(r.cuenta_numero) === String(_daCuenta); });
}

function _daDeSemana(filas, lunesMs) {
  return filas.filter(function(r) { return _daLunes(r.fecha_cierre) === lunesMs; });
}

function _daContar(filas, campo) {
  var c = {};
  filas.forEach(function(r) { c[r[campo]] = (c[r[campo]] || 0) + 1; });
  return c;
}

// % pronto sobre los cierres a mano con veredicto (sin indeterminados).
function _daPctPronto(filas) {
  var con = filas.filter(function(r) { return DA_DECISIONES.indexOf(r.decision_cierre_manual) !== -1; });
  if (!con.length) return null;
  var p = con.filter(function(r) { return r.decision_cierre_manual === 'pronto'; }).length;
  return { pct: Math.round(p / con.length * 100), pronto: p, n: con.length };
}

// ── Veredicto en una frase (se genera aquí, no se guarda: así se puede
// cambiar la redacción sin re-analizar con MT5) ─────────────────────────
function _daFrase(r) {
  var min = r.minutos_hasta_resultado != null ? r.minutos_hasta_resultado + ' min' : null;
  var favor = r.favor_post_puntos != null ? _daNum(r.favor_post_puntos, 1) + ' pts' : null;
  var d = r.tipo_cierre_detallado;
  if (d === 'manual') {
    switch (r.decision_cierre_manual) {
      case 'bien_cerrado':
        return 'Cerraste a mano y después el precio fue a tu SL original' + (min ? ' en ' + min : '') +
               ' sin ir ni 5 pts a tu favor: bien cerrado.';
      case 'mixto_te_saliste_con_poco':
        return 'Cerraste a mano; después fue ' + _daNum(r.pts_favor_antes_sl, 1) +
               ' pts a tu favor pero acabó tocando tu SL original' + (min ? ' a los ' + min : '') +
               ': te saliste con poco.';
      case 'pronto':
        return r.resultado_post_cierre === 'fue_a_tp'
          ? 'Cerraste a mano y después el precio llegó a tu TP' + (min ? ' en ' + min : '') +
            (favor ? ' (' + favor + ' más)' : '') + ': cerraste pronto.'
          : 'Cerraste a mano y en las 4 h siguientes fue ' + (favor || 'más') +
            ' a tu favor sin tocar tu SL: cerraste pronto.';
      case 'correcto':
        return 'Cerraste a mano y en las 4 h siguientes no fue ni 5 pts a tu favor ni tocó SL o TP: correcto.';
      default:
        return r.resultado_post_cierre === 'ambiguo_misma_vela'
          ? 'Cerraste a mano; después SL y TP se tocaron en la misma vela M1, no se puede saber cuál fue primero.'
          : 'Cerraste a mano, pero no hay velas suficientes después del cierre para juzgarlo.';
    }
  }
  if (d === 'sl_breakeven') {
    if (r.be_efecto === 'te_salvo') return 'Saliste en breakeven y después el precio tocó tu SL original: el breakeven te salvó.';
    if (r.be_efecto === 'mixto_te_saco_de_un_recorrido') {
      return 'Saliste en breakeven; después fue ' + _daNum(r.pts_favor_antes_sl, 1) +
             ' pts a tu favor pero acabó tocando tu SL original' + (min ? ' a los ' + min : '') +
             ': el breakeven te sacó de un recorrido.';
    }
    if (r.be_efecto === 'te_saco_de_un_ganador') {
      return r.resultado_post_cierre === 'fue_a_tp'
        ? 'Saliste en breakeven y después el precio llegó a tu TP' + (min ? ' en ' + min : '') + ': el breakeven te sacó de un ganador.'
        : 'Saliste en breakeven y después fue ' + (favor || 'mucho') + ' a tu favor sin tocar tu SL: el breakeven te sacó de un ganador.';
    }
    return 'Saliste en breakeven y después el precio no hizo nada relevante: sin efecto.';
  }
  if (d === 'sl_original_o_ajustado_perdida') {
    return 'Saliste por SL con pérdida' + (r.resultado_post_cierre === 'fue_a_tp' ? '; después el precio llegó a tu TP.' : '.');
  }
  if (d === 'sl_beneficio_trailing') return 'Saliste por SL en beneficio (trailing)' + (favor ? '; después fue ' + favor + ' más a tu favor.' : '.');
  if (d === 'tp') return 'Saliste por TP.';
  return 'No se pudo determinar cómo se cerró.';
}

// ── Carga ────────────────────────────────────────────────────────────────

async function _daCargar() {
  if (_daDatos || _daCargando) return;
  var u = window.usuarioActual;
  if (!u || !u.email || typeof supaGet !== 'function') return;
  _daCargando = true;
  var r = await supaGet('post_cierre_analisis',
    'usuario_email=eq.' + encodeURIComponent(u.email) + '&order=fecha_cierre.desc&limit=5000', getToken());
  _daCargando = false;
  if (r.error || !Array.isArray(r.data)) { console.error('[diario-analisis] error al cargar', r.error); return; }
  _daDatos = r.data;
  if (_daDatos.length && _daSemana == null) _daSemana = _daLunes(_daDatos[0].fecha_cierre);
}

async function buildDiarioAnalisis() {
  var cont = document.getElementById('diario-analisis-bloque');
  if (!cont) return;
  await _daCargar();
  if (!_daDatos || !_daDatos.length) { cont.innerHTML = ''; return; }
  _daPintar();
}

// ── Pintado ──────────────────────────────────────────────────────────────

function _daChip(texto, activo, onclick) {
  return '<button class="tab' + (activo ? ' active' : '') + '" style="padding:.45rem .9rem;font-size:12px;" onclick="' + onclick + '">' +
         _daEsc(texto) + '</button>';
}

function _daPintar() {
  var cont = document.getElementById('diario-analisis-bloque');
  if (!cont) return;
  var cuentas = [];
  _daDatos.forEach(function(r) { if (cuentas.indexOf(String(r.cuenta_numero)) === -1) cuentas.push(String(r.cuenta_numero)); });

  var filas = _daFiltrarCuenta(_daDatos);
  var semana = _daDeSemana(filas, _daSemana);

  var html = '';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;margin:1.5rem 0 1rem;">' +
            '<div class="tag" style="display:block;">Análisis de tus trades · EA</div>' +
            '<div style="display:flex;align-items:center;gap:.6rem;">' +
              '<button class="tab" style="padding:.3rem .7rem;" onclick="_daMoverSemana(-1)" aria-label="Semana anterior">‹</button>' +
              '<span style="font-size:14px;color:var(--gold-bright);min-width:180px;text-align:center;">' + _daEtiquetaSemana(_daSemana) + '</span>' +
              '<button class="tab" style="padding:.3rem .7rem;" onclick="_daMoverSemana(1)" aria-label="Semana siguiente">›</button>' +
            '</div>' +
          '</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:0;border-bottom:1px solid var(--border);margin-bottom:1.5rem;">' +
            _daChip('Global', _daCuenta === 'global', "_daElegirCuenta('global')") +
            cuentas.map(function(c) { return _daChip(_daNombreCuenta(c), _daCuenta === c, "_daElegirCuenta('" + c + "')"); }).join('') +
          '</div>';

  html += _daHtmlSemana(semana, filas);
  html += _daHtmlTrades(semana);
  cont.innerHTML = html;
  _daPintarEvolucion(filas);
  if (_daAbierto) _daAbrirDetalle(_daAbierto);
}

function _daMoverSemana(delta) {
  _daSemana += delta * 7 * DA_MS_DIA;
  _daAbierto = null;
  _daPintar();
}

function _daElegirCuenta(c) { _daCuenta = c; _daAbierto = null; _daPintar(); }
function _daElegirEstrategia(e) { _daEstrategia = e; _daAbierto = null; _daPintar(); }

function _daStat(label, valor, sub, clase) {
  return '<div class="stat-card" style="text-align:center;"><div class="stat-label">' + label + '</div>' +
         '<div class="stat-val ' + (clase || 'gold') + '" style="font-size:26px;">' + valor + '</div>' +
         '<div class="stat-sub">' + (sub || '&nbsp;') + '</div></div>';
}

function _daLineaConteo(texto, n, total, color) {
  var pct = total ? Math.round(n / total * 100) : 0;
  return '<div style="margin-bottom:.7rem;">' +
           '<div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:.25rem;">' +
             '<span style="color:var(--text-dim);">' + texto + '</span>' +
             '<span style="color:var(--text-muted);">' + n + (total ? ' · ' + pct + '%' : '') + '</span></div>' +
           '<div style="height:4px;background:var(--border);border-radius:2px;">' +
             '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:2px;"></div></div></div>';
}

function _daHtmlSemana(semana, filasCuenta) {
  if (!semana.length) {
    return '<div class="cell" style="margin-bottom:1.5rem;color:var(--text-muted);font-size:14px;">Sin trades de la EA cerrados esta semana' +
           (_daCuenta === 'global' ? '' : ' en esta cuenta') + '.</div>' + _daHtmlEvolucionContenedor();
  }
  var porFp = _daTradesPorFp();
  var pnl = 0, conPnl = 0, ganadoras = 0;
  semana.forEach(function(r) {
    var t = porFp[r.fp];
    if (t && t.beneficio != null) { pnl += parseFloat(t.beneficio); conPnl++; if (parseFloat(t.beneficio) > 0) ganadoras++; }
  });
  var manuales = semana.filter(function(r) { return r.decision_cierre_manual !== 'na'; });
  var pp = _daPctPronto(semana);
  var dejados = semana.filter(function(r) { return r.decision_cierre_manual === 'pronto' && r.favor_post_puntos != null; })
                      .reduce(function(s, r) { return s + parseFloat(r.favor_post_puntos); }, 0);

  var h = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1px;background:var(--border);margin-bottom:1px;">' +
    _daStat('Trades', semana.length, 'cerrados por la EA', 'white') +
    _daStat('P&amp;L', conPnl ? (pnl >= 0 ? '+' : '') + _daNum(pnl, 0) + '$' : '—', conPnl < semana.length ? conPnl + ' con P&amp;L' : '', pnl >= 0 ? 'green' : 'red') +
    _daStat('Win rate', conPnl ? Math.round(ganadoras / conPnl * 100) + '%' : '—', ganadoras + ' de ' + conPnl, 'green') +
    _daStat('Cierres a mano', manuales.length, Math.round(manuales.length / semana.length * 100) + '% de los trades', 'gold') +
    _daStat('% pronto', pp ? pp.pct + '%' : '—', pp ? pp.pronto + ' de ' + pp.n + ' a mano' : 'sin cierres a mano', 'gold') +
    _daStat('Pts dejados', _daNum(dejados, 1), 'en los cierres pronto', 'gold') +
  '</div>';

  // Tus decisiones de gestión
  var cm = _daContar(manuales, 'decision_cierre_manual');
  var be = semana.filter(function(r) { return r.be_efecto !== 'na'; });
  var cb = _daContar(be, 'be_efecto');
  var sl = semana.filter(function(r) { return String(r.tipo_cierre_detallado).indexOf('sl_') === 0; });
  var cs = _daContar(sl, 'tipo_cierre_detallado');
  var mediaPronto = cm.pronto ? dejados / cm.pronto : null;
  var mixBe = be.filter(function(r) { return r.be_efecto === 'mixto_te_saco_de_un_recorrido' && r.pts_favor_antes_sl != null; });
  var mediaMixBe = mixBe.length ? mixBe.reduce(function(s, r) { return s + parseFloat(r.pts_favor_antes_sl); }, 0) / mixBe.length : null;

  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1px;background:var(--border);margin-bottom:1px;">' +
    '<div class="cell"><div class="tag" style="display:block;margin-bottom:1rem;">Cierres a mano · ' + manuales.length + '</div>' +
      _daLineaConteo('Bien cerrado', cm.bien_cerrado || 0, manuales.length, 'var(--green)') +
      _daLineaConteo('Mixto · te saliste con poco', cm.mixto_te_saliste_con_poco || 0, manuales.length, '#8A6A2A') +
      _daLineaConteo('Pronto' + (mediaPronto != null ? ' · media ' + _daNum(mediaPronto, 1) + ' pts' : ''), cm.pronto || 0, manuales.length, 'var(--gold)') +
      _daLineaConteo('Correcto', cm.correcto || 0, manuales.length, 'var(--text-muted)') +
      (cm.indeterminado ? '<div style="font-size:12px;color:var(--text-muted);">' + cm.indeterminado + ' sin veredicto (vela ambigua o sin datos)</div>' : '') +
    '</div>' +
    '<div class="cell"><div class="tag" style="display:block;margin-bottom:1rem;">Breakeven real · ' + be.length + '</div>' +
      _daLineaConteo('Te salvó', cb.te_salvo || 0, be.length, 'var(--green)') +
      _daLineaConteo('Mixto · te sacó de un recorrido' + (mediaMixBe != null ? ' · media ' + _daNum(mediaMixBe, 1) + ' pts' : ''), cb.mixto_te_saco_de_un_recorrido || 0, be.length, '#8A6A2A') +
      _daLineaConteo('Te sacó de un ganador', cb.te_saco_de_un_ganador || 0, be.length, 'var(--gold)') +
      _daLineaConteo('Sin efecto', cb.sin_efecto || 0, be.length, 'var(--text-muted)') +
    '</div>' +
    '<div class="cell"><div class="tag" style="display:block;margin-bottom:1rem;">Salidas por SL · ' + sl.length + '</div>' +
      _daLineaConteo('Pérdida', cs.sl_original_o_ajustado_perdida || 0, sl.length, 'var(--red)') +
      _daLineaConteo('Breakeven', cs.sl_breakeven || 0, sl.length, 'var(--text-muted)') +
      _daLineaConteo('Trailing (beneficio)', cs.sl_beneficio_trailing || 0, sl.length, 'var(--green)') +
    '</div>' +
  '</div>';

  // Por estrategia
  h += '<div class="cell" style="margin-bottom:1px;"><div class="tag" style="display:block;margin-bottom:1rem;">Por estrategia</div>' +
       '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:520px;">' +
       '<thead><tr style="color:var(--text-muted);text-align:right;">' +
       '<th style="text-align:left;font-weight:400;padding:.3rem 0;">Estrategia</th><th style="font-weight:400;">Trades</th><th style="font-weight:400;">P&amp;L</th>' +
       '<th style="font-weight:400;">A mano</th><th style="font-weight:400;">Bien</th><th style="font-weight:400;">Mixto</th><th style="font-weight:400;">Pronto</th><th style="font-weight:400;">Correcto</th></tr></thead><tbody>';
  DA_ESTRATEGIAS.forEach(function(e) {
    var g = semana.filter(function(r) { return (r.estrategia || null) === e; });
    if (!g.length) return;
    var gp = 0, gc = 0;
    g.forEach(function(r) { var t = porFp[r.fp]; if (t && t.beneficio != null) { gp += parseFloat(t.beneficio); gc++; } });
    var gm = g.filter(function(r) { return r.decision_cierre_manual !== 'na'; });
    var c = _daContar(gm, 'decision_cierre_manual');
    h += '<tr style="border-top:1px solid var(--border);text-align:right;color:var(--text-dim);">' +
         '<td style="text-align:left;padding:.45rem 0;">' + (e ? _daEsc(e) : 'sin clasificar') + '</td><td>' + g.length + '</td>' +
         '<td style="color:' + (gp >= 0 ? 'var(--green)' : 'var(--red)') + ';">' + (gc ? (gp >= 0 ? '+' : '') + _daNum(gp, 0) + '$' : '—') + '</td>' +
         '<td>' + gm.length + '</td><td>' + (c.bien_cerrado || 0) + '</td><td>' + (c.mixto_te_saliste_con_poco || 0) + '</td>' +
         '<td>' + (c.pronto || 0) + '</td><td>' + (c.correcto || 0) + '</td></tr>';
  });
  h += '</tbody></table></div></div>';

  return h + _daHtmlEvolucionContenedor();
}

function _daHtmlEvolucionContenedor() {
  return '<div class="cell" style="margin-bottom:1.5rem;"><div class="tag" style="display:block;margin-bottom:.4rem;">% de cierres a mano "pronto" · semana a semana</div>' +
         '<div style="font-size:12px;color:var(--text-muted);margin-bottom:.8rem;">Últimas 12 semanas hasta la elegida · número = cierres a mano con veredicto</div>' +
         '<div id="da-evolucion" style="position:relative;"></div></div>';
}

// Barras de % pronto: una serie, sin leyenda (el título la nombra), tooltip por barra.
function _daPintarEvolucion(filasCuenta) {
  var cont = document.getElementById('da-evolucion');
  if (!cont) return;
  var semanas = [];
  for (var i = 11; i >= 0; i--) semanas.push(_daSemana - i * 7 * DA_MS_DIA);
  var datos = semanas.map(function(s) { return { s: s, p: _daPctPronto(_daDeSemana(filasCuenta, s)) }; });
  var W = Math.max(cont.clientWidth, 300), H = 150, base = H - 34, alto = base - 14;
  var paso = W / semanas.length, ancho = Math.min(28, paso * 0.55);
  var svg = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Porcentaje de cierres pronto por semana">';
  [0, 50, 100].forEach(function(v) {
    var y = base - alto * v / 100;
    svg += '<line x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="#1A2040" stroke-width="1"/>' +
           '<text x="0" y="' + (y - 3) + '" fill="#AAB0C4" font-size="10">' + v + '%</text>';
  });
  datos.forEach(function(d, i) {
    var x = i * paso + (paso - ancho) / 2;
    var elegida = d.s === _daSemana;
    if (d.p) {
      var h = Math.max(2, alto * d.p.pct / 100);
      svg += '<path d="M' + x + ',' + base + ' V' + (base - h + 4) + ' q0,-4 4,-4 H' + (x + ancho - 4) + ' q4,0 4,4 V' + base + ' Z" fill="' + (elegida ? '#E8C870' : '#C9A84C') + '" fill-opacity="' + (elegida ? 1 : 0.55) + '"/>';
    }
    svg += '<text x="' + (x + ancho / 2) + '" y="' + (base + 14) + '" text-anchor="middle" fill="' + (elegida ? '#E8C870' : '#AAB0C4') + '" font-size="10">W' + _daSemanaIso(d.s) + '</text>' +
           '<text x="' + (x + ancho / 2) + '" y="' + (base + 27) + '" text-anchor="middle" fill="#AAB0C4" font-size="10">' + (d.p ? d.p.n : '—') + '</text>' +
           '<rect x="' + (i * paso) + '" y="0" width="' + paso + '" height="' + H + '" fill="transparent" data-i="' + i + '"/>';
  });
  svg += '</svg>';
  cont.innerHTML = svg + '<div id="da-evol-tip" style="display:none;position:absolute;pointer-events:none;background:#060810;border:1px solid var(--border-gold);padding:.4rem .6rem;font-size:12px;color:var(--text);white-space:nowrap;"></div>';
  var tip = document.getElementById('da-evol-tip');
  cont.querySelectorAll('rect[data-i]').forEach(function(r) {
    r.addEventListener('mouseenter', function() {
      var d = datos[+r.getAttribute('data-i')];
      tip.innerHTML = _daEtiquetaSemana(d.s) + '<br>' + (d.p ? d.p.pronto + ' pronto de ' + d.p.n + ' cierres a mano · ' + d.p.pct + '%' : 'sin cierres a mano');
      tip.style.display = 'block';
      var x = +r.getAttribute('x') + paso / 2;
      tip.style.left = Math.min(Math.max(0, x - tip.offsetWidth / 2), W - tip.offsetWidth) + 'px';
      tip.style.top = '-8px';
    });
    r.addEventListener('mouseleave', function() { tip.style.display = 'none'; });
  });
}

// ── B) Lista de trades ───────────────────────────────────────────────────

function _daBadgeDecision(r) {
  var k = r.tipo_cierre_detallado === 'manual' ? r.decision_cierre_manual
        : r.tipo_cierre_detallado === 'sl_breakeven' && r.be_efecto !== 'na' ? r.be_efecto
        : r.tipo_cierre_detallado;
  var col = { bien_cerrado: 'var(--green)', te_salvo: 'var(--green)', sl_beneficio_trailing: 'var(--green)', tp: 'var(--green)',
              pronto: 'var(--gold-bright)', te_saco_de_un_ganador: 'var(--gold-bright)', mixto_te_saliste_con_poco: 'var(--gold)',
              mixto_te_saco_de_un_recorrido: 'var(--gold)',
              sl_original_o_ajustado_perdida: 'var(--red)' }[k] || 'var(--text-muted)';
  return '<span style="font-size:12px;color:' + col + ';border:1px solid var(--border);padding:.15rem .5rem;white-space:nowrap;">' + _daEsc(DA_TXT[k] || k) + '</span>';
}

function _daHtmlTrades(semana) {
  var lista = semana.filter(function(r) {
    return _daEstrategia === 'todas' || (r.estrategia || 'sin_clasificar') === _daEstrategia;
  }).sort(function(a, b) { return _daFecha(b.fecha_cierre) - _daFecha(a.fecha_cierre); });
  var porFp = _daTradesPorFp();

  var h = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.8rem;margin-bottom:.8rem;">' +
            '<div class="tag" style="display:block;">Trades de la semana · ' + lista.length + '</div>' +
            '<div style="display:flex;flex-wrap:wrap;">' +
              _daChip('Todas', _daEstrategia === 'todas', "_daElegirEstrategia('todas')") +
              _daChip('rechazo_rsi', _daEstrategia === 'rechazo_rsi', "_daElegirEstrategia('rechazo_rsi')") +
              _daChip('estructura', _daEstrategia === 'estructura', "_daElegirEstrategia('estructura')") +
              _daChip('sin clasificar', _daEstrategia === 'sin_clasificar', "_daElegirEstrategia('sin_clasificar')") +
            '</div></div>';
  if (!lista.length) return h + '<div class="cell" style="color:var(--text-muted);font-size:14px;margin-bottom:1.5rem;">Sin trades con este filtro.</div>';

  h += '<div style="display:flex;flex-direction:column;gap:1px;background:var(--border);margin-bottom:2rem;">';
  lista.forEach(function(r) {
    var t = porFp[r.fp];
    var ben = t && t.beneficio != null ? parseFloat(t.beneficio) : null;
    h += '<div style="background:var(--bg2);">' +
           '<div onclick="_daToggle(\'' + _daEsc(r.fp) + '\')" style="display:grid;grid-template-columns:110px 1fr auto auto;gap:1rem;align-items:center;padding:.8rem 1.2rem;cursor:pointer;">' +
             '<span style="font-size:13px;color:var(--gold-dim);">' + _daHora(r.fecha_cierre) + '</span>' +
             '<span style="font-size:14px;color:var(--text-dim);">' + (r.direccion === 'buy' ? 'Compra' : 'Venta') + ' · ' + _daEsc(_daNombreCuenta(r.cuenta_numero)) +
               ' <span style="color:var(--text-muted);font-size:12px;">· ' + _daEsc(r.estrategia || 'sin clasificar') + '</span></span>' +
             _daBadgeDecision(r) +
             '<span style="font-size:14px;min-width:70px;text-align:right;color:' + (ben == null ? 'var(--text-muted)' : ben >= 0 ? 'var(--green)' : 'var(--red)') + ';">' +
               (ben == null ? '—' : (ben >= 0 ? '+' : '') + _daNum(ben, 2) + '$') + '</span>' +
           '</div>' +
           '<div id="da-det-' + _daEsc(r.fp) + '" style="display:none;padding:0 1.2rem 1.2rem;"></div>' +
         '</div>';
  });
  return h + '</div>';
}

function _daToggle(fp) {
  if (_daAbierto && _daAbierto !== fp) {
    var prev = document.getElementById('da-det-' + _daAbierto);
    if (prev) prev.style.display = 'none';
  }
  if (_daAbierto === fp) {
    document.getElementById('da-det-' + fp).style.display = 'none';
    _daAbierto = null;
    return;
  }
  _daAbierto = fp;
  _daAbrirDetalle(fp);
}

// ── Detalle de un trade ──────────────────────────────────────────────────

async function _daAbrirDetalle(fp) {
  var det = document.getElementById('da-det-' + fp);
  var r = (_daDatos || []).filter(function(x) { return x.fp === fp; })[0];
  if (!det || !r) return;
  det.style.display = 'block';
  det.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">Cargando…</div>';

  var email = encodeURIComponent(window.usuarioActual.email);
  var token = getToken();
  var res = await Promise.all([
    supaGet('post_cierre_velas', 'usuario_email=eq.' + email + '&fp=eq.' + encodeURIComponent(fp), token),
    supaGet('trade_eventos', 'fp=eq.' + encodeURIComponent(fp) + '&order=timestamp.asc', token)
  ]);
  if (_daAbierto !== fp) return; // se cerró mientras cargaba
  var velas = res[0].data && res[0].data[0];
  var eventos = res[1].data || [];

  var h = '<div style="font-size:15px;color:var(--text);line-height:1.7;margin:.2rem 0 1rem;">' + _daEsc(_daFrase(r)) + '</div>';
  h += '<div id="da-graf-' + _daEsc(fp) + '" style="position:relative;background:#060810;border:1px solid var(--border);margin-bottom:.5rem;"></div>';
  h += '<div style="display:flex;flex-wrap:wrap;gap:1.2rem;font-size:12px;color:var(--text-muted);margin-bottom:1rem;">' +
         _daLeyenda(DA_COLOR.precio, 'Precio (cierre de vela) y rango máx–mín', false) +
         _daLeyenda(DA_COLOR.entrada, 'Entrada ' + _daNum(r.precio_entrada, 2), true) +
         (r.sl_original != null ? _daLeyenda(DA_COLOR.sl, 'SL original ' + _daNum(r.sl_original, 2), true) : '') +
         (r.tp_original != null ? _daLeyenda(DA_COLOR.tp, 'TP ' + _daNum(r.tp_original, 2), true) : '<span>sin TP</span>') +
         '<span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#E2D9C8;margin-right:.4rem;"></span>Cierre ' + _daNum(r.precio_cierre, 2) + '</span>' +
       '</div>';

  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--border);margin-bottom:1rem;">' +
         _daMini('MFE durante', r.mfe_puntos, 'a favor desde la entrada') +
         _daMini('MAE durante', r.mae_puntos, 'en contra desde la entrada') +
         _daMini('A favor después', r.favor_post_puntos, 'hasta SL/TP o 4 h') +
         _daMini('En contra después', r.contra_post_puntos, 'hasta SL/TP o 4 h') +
       '</div>';

  h += '<div class="tag" style="display:block;margin-bottom:.6rem;">Línea de tiempo</div>';
  if (!eventos.length) {
    h += '<div style="font-size:13px;color:var(--text-muted);">Sin eventos registrados por la EA para este trade.</div>';
  } else {
    h += '<div style="display:flex;flex-direction:column;gap:.35rem;">' + eventos.map(function(ev) {
      var label = typeof _eaAuditoriaTipoLabel === 'function' ? _eaAuditoriaTipoLabel(ev.tipo_evento) : ev.tipo_evento;
      return '<div style="display:grid;grid-template-columns:90px 140px 1fr;gap:.8rem;font-size:13px;">' +
               '<span style="color:var(--gold-dim);">' + _daHora(ev.timestamp) + '</span>' +
               '<span style="color:var(--text-dim);">' + _daEsc(label) + '</span>' +
               '<span style="color:var(--text-muted);">' + (ev.precio != null ? _daNum(ev.precio, 2) : '') +
                 (ev.puntos_desde_entrada != null ? ' · ' + (ev.puntos_desde_entrada >= 0 ? '+' : '') + _daNum(ev.puntos_desde_entrada, 2) + ' pts' : '') + '</span>' +
             '</div>';
    }).join('') + '</div>';
  }
  if (r.notas) h += '<div style="font-size:12px;color:var(--text-muted);margin-top:.8rem;">Nota del análisis: ' + _daEsc(r.notas) + '</div>';

  det.innerHTML = h;
  var graf = document.getElementById('da-graf-' + fp);
  if (velas && Array.isArray(velas.velas) && velas.velas.length) _daPintarGrafico(graf, r, velas);
  else graf.innerHTML = '<div style="padding:1rem;font-size:13px;color:var(--text-muted);">Sin velas guardadas para este trade.</div>';
}

function _daLeyenda(color, texto, discontinua) {
  return '<span><span style="display:inline-block;width:16px;height:0;border-top:2px ' + (discontinua ? 'dashed' : 'solid') + ' ' + color +
         ';vertical-align:middle;margin-right:.4rem;"></span>' + _daEsc(texto) + '</span>';
}

function _daMini(label, v, sub) {
  return '<div class="stat-card" style="text-align:center;padding:.8rem;"><div class="stat-label">' + label + '</div>' +
         '<div style="font-size:20px;color:var(--text);">' + (v == null ? '—' : _daNum(v, 1) + ' pts') + '</div>' +
         '<div class="stat-sub">' + sub + '</div></div>';
}

// Gráfico del trade. Eje X = índice de vela (minutos de mercado: los fines
// de semana no dejan hueco). Banda máx–mín + línea de cierre de vela, líneas
// de entrada / SL original / TP, punto de cierre y zona post-cierre sombreada.
function _daPintarGrafico(cont, r, v) {
  var velas = v.velas;
  var W = Math.max(cont.clientWidth, 320), H = 260, mI = 8, mD = 64, mS = 14, mA = 22;
  var ys = [];
  velas.forEach(function(c) { ys.push(c[2], c[3]); });
  [r.precio_entrada, r.precio_cierre, r.sl_original, r.tp_original].forEach(function(p) { if (p != null) ys.push(parseFloat(p)); });
  var yMin = Math.min.apply(null, ys), yMax = Math.max.apply(null, ys);
  var pad = (yMax - yMin) * 0.06 || 1;
  yMin -= pad; yMax += pad;
  var n = velas.length;
  var X = function(i) { return mI + (W - mI - mD) * (n > 1 ? i / (n - 1) : 0.5); };
  var Y = function(p) { return mS + (H - mS - mA) * (yMax - p) / (yMax - yMin); };

  var svg = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Precio durante el trade y 4 horas después">';
  // Zona post-cierre
  var xc = X(Math.min(v.idx_cierre, n - 1));
  svg += '<rect x="' + xc + '" y="' + mS + '" width="' + (W - mD - xc) + '" height="' + (H - mS - mA) + '" fill="#C9A84C" fill-opacity="0.05"/>' +
         '<text x="' + (xc + 6) + '" y="' + (mS + 12) + '" fill="#AAB0C4" font-size="11">después del cierre</text>' +
         '<line x1="' + X(v.idx_entrada) + '" x2="' + X(v.idx_entrada) + '" y1="' + mS + '" y2="' + (H - mA) + '" stroke="#252840" stroke-width="1"/>' +
         '<line x1="' + xc + '" x2="' + xc + '" y1="' + mS + '" y2="' + (H - mA) + '" stroke="#252840" stroke-width="1"/>';
  // Rejilla de precio
  for (var k = 0; k <= 3; k++) {
    var p = yMin + (yMax - yMin) * k / 3;
    svg += '<line x1="' + mI + '" x2="' + (W - mD) + '" y1="' + Y(p) + '" y2="' + Y(p) + '" stroke="#1A2040" stroke-width="1"/>' +
           '<text x="' + (W - mD + 6) + '" y="' + (Y(p) + 4) + '" fill="#AAB0C4" font-size="10">' + _daNum(p, 1) + '</text>';
  }
  // Banda máx–mín y línea de cierre
  var arriba = velas.map(function(c, i) { return X(i) + ',' + Y(c[2]); });
  var abajo = velas.map(function(c, i) { return X(i) + ',' + Y(c[3]); }).reverse();
  svg += '<polygon points="' + arriba.concat(abajo).join(' ') + '" fill="' + DA_COLOR.precio + '" fill-opacity="0.12"/>';
  svg += '<polyline points="' + velas.map(function(c, i) { return X(i) + ',' + Y(c[4]); }).join(' ') + '" fill="none" stroke="' + DA_COLOR.precio + '" stroke-width="1.5" stroke-linejoin="round"/>';
  // Niveles
  [[r.sl_original, DA_COLOR.sl], [r.tp_original, DA_COLOR.tp], [r.precio_entrada, DA_COLOR.entrada]].forEach(function(nv) {
    if (nv[0] == null) return;
    svg += '<line x1="' + mI + '" x2="' + (W - mD) + '" y1="' + Y(nv[0]) + '" y2="' + Y(nv[0]) + '" stroke="' + nv[1] + '" stroke-width="1.5" stroke-dasharray="5 4"/>';
  });
  // Entrada y cierre
  var iCierre = Math.max(0, Math.min(v.idx_cierre - 1, n - 1));
  svg += '<circle cx="' + X(v.idx_entrada) + '" cy="' + Y(r.precio_entrada) + '" r="5" fill="' + DA_COLOR.entrada + '" stroke="#060810" stroke-width="2"/>' +
         '<circle cx="' + X(iCierre) + '" cy="' + Y(r.precio_cierre) + '" r="5" fill="#E2D9C8" stroke="#060810" stroke-width="2"/>';
  // Eje X: inicio, entrada, cierre, final
  var t0 = new Date(v.inicio).getTime();
  var hora = function(i) { return _daHora(new Date(t0 + velas[i][0] * 60000).toISOString()); };
  svg += '<text x="' + mI + '" y="' + (H - 6) + '" fill="#AAB0C4" font-size="10">' + hora(0) + '</text>' +
         '<text x="' + xc + '" y="' + (H - 6) + '" fill="#AAB0C4" font-size="10" text-anchor="middle">' + hora(iCierre) + '</text>' +
         '<text x="' + (W - mD) + '" y="' + (H - 6) + '" fill="#AAB0C4" font-size="10" text-anchor="end">' + hora(n - 1) + '</text>';
  // Capa de hover
  svg += '<line id="da-cruz" x1="0" x2="0" y1="' + mS + '" y2="' + (H - mA) + '" stroke="#AAB0C4" stroke-width="1" stroke-dasharray="2 3" style="display:none;"/>' +
         '<rect x="' + mI + '" y="0" width="' + (W - mI - mD) + '" height="' + H + '" fill="transparent" id="da-hover"/>';
  svg += '</svg>';
  if (v.tf_durante_min > 1) {
    svg += '<div style="position:absolute;left:8px;bottom:26px;font-size:11px;color:var(--text-muted);">Durante el trade: velas agrupadas de ' + v.tf_durante_min + ' min</div>';
  }
  cont.innerHTML = svg + '<div class="da-tip" style="display:none;position:absolute;pointer-events:none;background:#060810;border:1px solid var(--border-gold);padding:.4rem .6rem;font-size:12px;color:var(--text);white-space:nowrap;"></div>';

  var hover = cont.querySelector('#da-hover'), cruz = cont.querySelector('#da-cruz'), tip = cont.querySelector('.da-tip');
  hover.addEventListener('mousemove', function(e) {
    var bx = cont.getBoundingClientRect().left;
    var i = Math.round((e.clientX - bx - mI) / (W - mI - mD) * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    var c = velas[i], x = X(i);
    cruz.setAttribute('x1', x); cruz.setAttribute('x2', x); cruz.style.display = '';
    tip.innerHTML = hora(i) + (i >= v.idx_cierre ? ' · después' : i >= v.idx_entrada ? ' · en el trade' : ' · antes') +
                    '<br>máx ' + _daNum(c[2], 2) + ' · mín ' + _daNum(c[3], 2) + ' · cierre ' + _daNum(c[4], 2);
    tip.style.display = 'block';
    tip.style.left = Math.min(Math.max(0, x + 12), W - tip.offsetWidth - 4) + 'px';
    tip.style.top = '8px';
  });
  hover.addEventListener('mouseleave', function() { cruz.style.display = 'none'; tip.style.display = 'none'; });
}

// ── Enganche: solo escucha, nunca sobrescribe onclick ni toca gestTab ──────
document.addEventListener('DOMContentLoaded', function() {
  var tab = document.getElementById('gtab-diario');
  if (tab) tab.addEventListener('click', function() { setTimeout(buildDiarioAnalisis, 60); });
});
