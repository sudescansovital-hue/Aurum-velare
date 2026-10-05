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
var _daHistorico = false;     // true = "Todo el histórico" (todas las semanas juntas)
var _daCuenta = 'global';     // 'global' | 'maestra' | 'prueba' | 'retos'
var _daEstrategia = 'todas';  // filtro de la lista de trades
var _daAbierto = null;        // trade desplegado: 'w:<fp>' (lista semanal) o 'd:<fp>' (panel del día)
var _daSoloErrores = false;   // filtro "Solo con errores" de la lista de trades
var _daMes = null;            // ms del día 1 00:00 del mes del calendario
var _daDia = null;            // ms del día elegido en el calendario (null = ninguno)

// Vuelta de posición / entradas seguidas: minutos entre el cierre de un trade
// y la apertura del siguiente en la misma cuenta. Cambiar aquí.
var DA_MINUTOS_SECUENCIA = 15;
// Calendario: límite de pérdida diaria por cuenta ($, P&L realizado acumulado
// en el día) y nº de vueltas a partir del cual se marca el día. Cambiar aquí.
var DA_LIMITE_PERDIDA_DIA = 500;
var DA_VUELTAS_AVISO = 3;
// Runners (criterios v7): niveles en pts desde la entrada para "hasta dónde llegó el resto".
var DA_RUNNER_NIVELES = [33, 50, 100];
// "Qué te conviene": mínimo de trades del periodo para sacar conclusiones, y
// mínimo de casos en cada comparación (p. ej. entradas seguidas, runners).
var DA_MIN_TRADES_CONVIENE = 20;
var DA_MIN_GRUPO_CONVIENE = 5;
var DA_NARANJA = '#E8873A';

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

// Pestañas de cuenta = las 3 asignadas al usuario desde el admin
// (usuarios_aurum.cuenta_maestra / cuenta_prueba / cuenta_retos, cargadas en
// usuarioActual por app.js), igual que el resto de Mi gestión. Se resuelven en
// cada pintado, así que un cambio de cuenta en el admin se refleja solo.
// Las demás cuentas son historial: sin pestaña, pero cuentan en Global.
var DA_PESTANAS = [
  { clave: 'maestra', nombre: 'Maestra', campo: 'cuenta_maestra' },
  { clave: 'prueba',  nombre: 'Prueba',  campo: 'cuenta_prueba' },
  { clave: 'retos',   nombre: 'Retos',   campo: 'cuenta_retos' }
];

function _daNumeroPestana(clave) {
  var u = window.usuarioActual || {};
  var p = DA_PESTANAS.filter(function(x) { return x.clave === clave; })[0];
  return p && u[p.campo] ? String(u[p.campo]) : null;
}

function _daFiltrarCuenta(filas) {
  if (_daCuenta === 'global') return filas;
  var num = _daNumeroPestana(_daCuenta);
  if (!num) return [];
  return filas.filter(function(r) { return String(r.cuenta_numero) === num; });
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
  var f = _daFraseCierre(r);
  // TP1 no asegurado (criterios v3): se añade a la frase de cómo se cerró.
  if (r.tp1_no_asegurado) {
    f += ' Además, llegó a tu TP1 de +' + _daNum(r.tp1_pts, 0) + ' pts' +
         (r.mfe_puntos != null ? ' (máximo +' + _daNum(r.mfe_puntos, 1) + ')' : '') +
         ' y no aseguraste: volvió a la entrada sin parcial ni SL protegido.';
  }
  // BE antes de TP1 (criterios v6): error de regla
  if (r.be_antes_tp1) {
    f += ' Moviste el SL a breakeven' + (r.be_antes_tp1_en ? ' a las ' + _daHora(r.be_antes_tp1_en).slice(-5) : '') +
         (r.be_antes_tp1_favor_pts != null ? ' con +' + _daNum(r.be_antes_tp1_favor_pts, 1) + ' pts a favor' : ' nada más entrar') +
         ', antes de llegar a tu TP1 de +' + _daNum(r.tp1_pts, 0) + ' pts: rompe la regla' +
         (r.tipo_cierre_detallado === 'sl_breakeven' ? ' y te sacó en breakeven' : '') +
         (r.tp1_alcanzado ? ' (después el precio sí llegó al TP1).' : '.');
  }
  // Runner (criterios v7)
  if (r.runner === true) {
    var sal = parseFloat(r.runner_salida_pts), pts = function(v) { return (v >= 0 ? '+' : '') + _daNum(v, 1); };
    f += ' Cerraste una parte a ' + pts(parseFloat(r.runner_parcial_pts)) + ' pts y dejaste ' +
         (r.runner_vol_resto != null ? _daNum(r.runner_vol_resto, 2) + ' lotes' : 'el resto') +
         ' con el SL en ' + pts(parseFloat(r.runner_sl_pts)) + ': llegó a ' + pts(parseFloat(r.runner_max_pts)) + ' pts y ' +
         (sal <= 1 ? 'volvió al BE' : 'salió a ' + pts(sal)) + ' tras ' + _daDur(r.runner_minutos) +
         (r.runner_usd != null
           ? '; aportó ' + _daFmtD(parseFloat(r.runner_usd)) + ' (cerrando todo en la parcial: ' + _daFmtD(parseFloat(r.runner_usd_todo_parcial)) + ').'
           : '.');
  } else if (r.runner === false) {
    f += ' Cerraste una parte a +' + _daNum(r.runner_parcial_pts, 1) + ' pts pero dejaste el resto sin proteger' +
         (r.runner_sl_pts != null ? ' (SL a ' + _daNum(r.runner_sl_pts, 1) + ' pts de la entrada)' : '') + '.';
  }
  // SL desprotegido (criterios v4)
  if (r.sl_desprotegido) {
    var hh = function(iso) { return _daHora(iso).slice(-5); };
    f += ' Protegiste la entrada' + (r.sl_protegido_en ? ' a las ' + hh(r.sl_protegido_en) : '') +
         ' (SL ' + _daNum(r.sl_nivel_protegido, 2) + ') y a las ' + hh(r.sl_desprotegido_en) +
         ' volviste a alejar el SL a ' + _daNum(r.sl_nivel_desprotegido, 2) +
         (r.sl_n_desprotecciones > 1 ? ' (' + r.sl_n_desprotecciones + ' veces en este trade)' : '') +
         (r.sl_protegido_habria_salido ? ': con el SL protegido habrías salido en BE o mejor.' : '.');
  }
  return f;
}

function _daFraseCierre(r) {
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
  _daMarcarSecuencias(_daDatos);
  if (_daDatos.length && _daSemana == null) _daSemana = _daLunes(_daDatos[0].fecha_cierre);
  if (_daDatos.length && _daMes == null) _daMes = _daMesDe(_daDatos[0].fecha_cierre);
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

// Rejillas de bloques: flex que reparte cada fila y estira los de la última
// hasta el ancho completo, así nunca queda a la vista el fondo gris (el gap
// de 1px sobre var(--border) hace de línea separadora). --da-base fija el
// máximo por fila (p. ej. 33.333% = 3) y el mínimo en px para móvil.
function _daEstilos() {
  if (document.getElementById('da-estilos')) return;
  var s = document.createElement('style');
  s.id = 'da-estilos';
  s.textContent = '.da-rejilla{display:flex;flex-wrap:wrap;gap:1px;background:var(--border);}' +
                  '.da-rejilla>*{flex:1 1 var(--da-base);min-width:0;box-sizing:border-box;}' +
                  // Calendario: 7 columnas iguales que se estrechan en móvil sin desbordar.
                  '.da-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px;background:var(--border);border:1px solid var(--border);}' +
                  '.da-cal>div{background:var(--bg2);min-height:68px;padding:.35rem .45rem;box-sizing:border-box;min-width:0;overflow:hidden;}' +
                  '.da-cal .da-cal-cab{min-height:0;padding:.35rem 0;text-align:center;font-size:11px;color:var(--text-muted);letter-spacing:.08em;}' +
                  '.da-cal .da-cal-dia{cursor:pointer;display:flex;flex-direction:column;gap:.15rem;}' +
                  '.da-cal .da-cal-dia:hover{box-shadow:inset 0 0 0 1px var(--gold-dim);}' +
                  '.da-cal-txt{font-size:11px;color:var(--text-muted);white-space:nowrap;}' +
                  '@media (max-width:600px){.da-cal>div{min-height:54px;padding:.25rem;}.da-cal-largo{display:none;}}';
  document.head.appendChild(s);
}

function _daPintar() {
  var cont = document.getElementById('diario-analisis-bloque');
  if (!cont) return;
  _daEstilos();
  // Si la cuenta de la pestaña elegida se ha quitado en el admin, volver a Global.
  if (_daCuenta !== 'global' && !_daNumeroPestana(_daCuenta)) _daCuenta = 'global';

  var filas = _daFiltrarCuenta(_daDatos);
  var semana = _daDeSemana(filas, _daSemana);
  // "Todo el histórico": mismos bloques con todos los trades de la cuenta elegida.
  var periodo = _daHistorico ? filas : semana;

  var selector = _daHistorico
    ? '<span style="font-size:14px;color:var(--gold-bright);min-width:180px;text-align:center;">' + _daEtiquetaHistorico(filas) + '</span>'
    : '<button class="tab" style="padding:.3rem .7rem;" onclick="_daMoverSemana(-1)" aria-label="Semana anterior">‹</button>' +
      '<span style="font-size:14px;color:var(--gold-bright);min-width:180px;text-align:center;">' + _daEtiquetaSemana(_daSemana) + '</span>' +
      '<button class="tab" style="padding:.3rem .7rem;" onclick="_daMoverSemana(1)" aria-label="Semana siguiente">›</button>';

  var html = '';
  html += '<div class="tag" style="display:block;margin:1.5rem 0 1rem;">Análisis de tus trades · EA</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:0;border-bottom:1px solid var(--border);margin-bottom:1.5rem;">' +
            _daChip('Global', _daCuenta === 'global', "_daElegirCuenta('global')") +
            DA_PESTANAS.filter(function(p) { return _daNumeroPestana(p.clave); }).map(function(p) {
              return '<button class="tab' + (_daCuenta === p.clave ? ' active' : '') + '" style="padding:.45rem .9rem;font-size:12px;line-height:1.25;" ' +
                     'onclick="_daElegirCuenta(\'' + p.clave + '\')">' + p.nombre +
                     '<span style="display:block;font-size:10px;color:var(--text-muted);letter-spacing:.05em;">' + _daEsc(_daNumeroPestana(p.clave)) + '</span></button>';
            }).join('') +
          '</div>';

  html += _daHtmlCalendario(filas);

  html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;margin:2rem 0 1rem;">' +
            '<div class="tag" style="display:block;">' + (_daHistorico ? 'Todo el histórico' : 'Tu semana') + '</div>' +
            '<div style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;">' +
              selector +
              '<span style="display:flex;margin-left:.4rem;">' +
                _daChip('Semana', !_daHistorico, '_daVerHistorico(false)') +
                _daChip('Todo el histórico', _daHistorico, '_daVerHistorico(true)') +
              '</span>' +
            '</div>' +
          '</div>';
  html += _daHtmlSemana(periodo, filas);
  html += _daHistorico
    ? '<div class="cell" style="margin-bottom:2rem;color:var(--text-muted);font-size:14px;">La lista de trades va por semanas: ' +
      '<span style="color:var(--gold);cursor:pointer;" onclick="_daVerHistorico(false)">vuelve a Semana</span> y elige una con las flechas.</div>'
    : _daHtmlTrades(semana, 'Trades de la semana', 'w', true);
  cont.innerHTML = html;
  _daPintarEvolucion(filas);
  if (_daAbierto) _daAbrirDetalle(_daAbierto);
}

function _daMoverSemana(delta) {
  _daSemana += delta * 7 * DA_MS_DIA;
  _daAbierto = null;
  _daPintar();
}

function _daVerHistorico(si) { _daHistorico = si; _daAbierto = null; _daPintar(); }

function _daEtiquetaHistorico(filas) {
  if (!filas.length) return 'Todo el histórico';
  var f = function(iso) {
    return _daFecha(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };
  // filas viene ordenado por fecha_cierre desc (consulta de _daCargar)
  return 'Todo el histórico · ' + f(filas[filas.length - 1].fecha_cierre) + ' – ' + f(filas[0].fecha_cierre);
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
    return '<div class="cell" style="margin-bottom:1.5rem;color:var(--text-muted);font-size:14px;">Sin trades de la EA cerrados ' +
           (_daHistorico ? 'todavía' : 'esta semana') +
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

  var h = '<div class="da-rejilla" style="--da-base:max(140px, calc(16.666% - 1px));margin-bottom:1px;">' +
    _daStat('Trades', semana.length, 'cerrados por la EA', 'white') +
    _daStat('P&amp;L', conPnl ? (pnl >= 0 ? '+' : '') + _daNum(pnl, 0) + '$' : '—', conPnl < semana.length ? conPnl + ' con P&amp;L' : '', pnl >= 0 ? 'green' : 'red') +
    _daStat('Win rate', conPnl ? Math.round(ganadoras / conPnl * 100) + '%' : '—', ganadoras + ' de ' + conPnl, 'green') +
    _daStat('Cierres a mano', manuales.length, Math.round(manuales.length / semana.length * 100) + '% de los trades', 'gold') +
    _daStat('% pronto', pp ? pp.pct + '%' : '—', pp ? pp.pronto + ' de ' + pp.n + ' a mano' : 'sin cierres a mano', 'gold') +
    _daStat('Pts dejados', _daNum(dejados, 1), 'en los cierres pronto', 'gold') +
  '</div>';
  h += _daHtmlConviene(semana, _daHistorico ? 'todo el histórico' : 'esta semana');

  // Tus decisiones de gestión
  var cm = _daContar(manuales, 'decision_cierre_manual');
  var be = semana.filter(function(r) { return r.be_efecto !== 'na'; });
  var cb = _daContar(be, 'be_efecto');
  var sl = semana.filter(function(r) { return String(r.tipo_cierre_detallado).indexOf('sl_') === 0; });
  var cs = _daContar(sl, 'tipo_cierre_detallado');
  var mediaPronto = cm.pronto ? dejados / cm.pronto : null;
  var mixBe = be.filter(function(r) { return r.be_efecto === 'mixto_te_saco_de_un_recorrido' && r.pts_favor_antes_sl != null; });
  var mediaMixBe = mixBe.length ? mixBe.reduce(function(s, r) { return s + parseFloat(r.pts_favor_antes_sl); }, 0) / mixBe.length : null;

  h += '<div class="da-rejilla" style="--da-base:max(240px, calc(33.333% - 1px));margin-bottom:1px;">' +
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
    _daHtmlTp1(semana) +
    _daHtmlSlDesprotegido(semana, porFp) +
    _daHtmlSecuencias(semana, porFp) +
    _daHtmlRunners(semana) +
  '</div>';

  // Por estrategia
  h += '<div class="cell" style="margin-bottom:1px;"><div class="tag" style="display:block;margin-bottom:1rem;">Por estrategia</div>' +
       '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:520px;">' +
       '<thead><tr style="color:var(--text-muted);text-align:right;">' +
       '<th style="text-align:left;font-weight:400;padding:.3rem 0;">Estrategia</th><th style="font-weight:400;">Trades</th><th style="font-weight:400;">P&amp;L</th>' +
       '<th style="font-weight:400;">A mano</th><th style="font-weight:400;">Bien</th><th style="font-weight:400;">Mixto</th><th style="font-weight:400;">Pronto</th><th style="font-weight:400;">Correcto</th><th style="font-weight:400;">TP1 no aseg.</th><th style="font-weight:400;">SL desprot.</th><th style="font-weight:400;">BE antes TP1</th></tr></thead><tbody>';
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
         '<td>' + (c.pronto || 0) + '</td><td>' + (c.correcto || 0) + '</td>' +
         '<td>' + (g.some(function(r) { return r.tp1_pts != null; })
                   ? g.filter(function(r) { return r.tp1_no_asegurado; }).length + ' de ' + g.filter(function(r) { return r.tp1_alcanzado; }).length
                   : '—') + '</td>' +
         '<td>' + g.filter(function(r) { return r.sl_desprotegido; }).length + '</td>' +
         '<td>' + (g.some(function(r) { return r.be_antes_tp1 != null; }) ? g.filter(function(r) { return r.be_antes_tp1; }).length : '—') + '</td></tr>';
  });
  h += '</tbody></table></div></div>';

  return h + _daHtmlEvolucionContenedor();
}

// Bloque "TP1 no asegurado": de los trades con TP1 definido (estructura,
// rechazo_rsi), cuántos llegaron a +TP1 y cuántos de esos volvieron a la
// entrada sin asegurar. Mismo bloque en Semana y en Todo el histórico.
function _daHtmlTp1(filas) {
  var ev = filas.filter(function(r) { return r.tp1_pts != null; });
  var alc = ev.filter(function(r) { return r.tp1_alcanzado; });
  var na = alc.filter(function(r) { return r.tp1_no_asegurado; });
  var h = '<div class="cell"><div class="tag" style="display:block;margin-bottom:1rem;">Reglas del TP1</div>';
  if (!ev.length) return h + '<div style="font-size:13px;color:var(--text-muted);">Sin trades con TP1 definido (estructura / rechazo_rsi).</div></div>';
  var sub = function(txt) { return '<div style="font-size:12px;color:var(--text-muted);margin-top:.3rem;">' + txt + '</div>'; };

  h += '<div style="font-size:13px;color:var(--text-dim);margin-bottom:.6rem;">TP1 no asegurado · <span style="color:var(--red);">' + na.length + '</span></div>' +
       _daLineaConteo('Llegaron a TP1', alc.length, ev.length, 'var(--gold)') +
       _daLineaConteo('…y volvieron sin asegurar', na.length, alc.length, 'var(--red)');
  ['estructura', 'rechazo_rsi'].forEach(function(e) {
    var g = alc.filter(function(r) { return r.estrategia === e; });
    if (!g.length) return;
    h += sub(e + ' (TP1 +' + _daNum(g[0].tp1_pts, 0) + '): ' + g.filter(function(r) { return r.tp1_no_asegurado; }).length + ' de ' + g.length + ' sin asegurar');
  });

  // BE antes de TP1 (criterios v6). Filas sin el dato (antes de recalcular) no cuentan.
  var evBe = ev.filter(function(r) { return r.be_antes_tp1 != null; });
  if (evBe.length) {
    var be = evBe.filter(function(r) { return r.be_antes_tp1; });
    h += '<div style="font-size:13px;color:var(--text-dim);margin:1.1rem 0 .6rem;">BE antes de TP1 · <span style="color:var(--red);">' + be.length + '</span></div>' +
         _daLineaConteo('Moviste a BE antes de llegar a TP1', be.length, evBe.length, 'var(--red)') +
         _daLineaConteo('…y te sacó en breakeven', be.filter(function(r) { return r.tipo_cierre_detallado === 'sl_breakeven'; }).length, be.length, 'var(--text-muted)');
    var luego = be.filter(function(r) { return r.tp1_alcanzado; }).length;
    if (be.length) h += sub('En ' + luego + ' de ' + be.length + ' el precio llegó después al TP1 durante el trade');
    ['estructura', 'rechazo_rsi'].forEach(function(e) {
      var g = evBe.filter(function(r) { return r.estrategia === e; });
      if (!g.length) return;
      h += sub(e + ': ' + g.filter(function(r) { return r.be_antes_tp1; }).length + ' de ' + g.length);
    });
  }
  return h + '</div>';
}

// Bloque "SL desprotegido": trades en los que el SL protegió la entrada y
// después se alejó sin protegerla. Cruce con el resultado: cuántas veces el
// SL protegido habría saltado y P&L conjunto de esos trades.
function _daHtmlSlDesprotegido(filas, porFp) {
  var d = filas.filter(function(r) { return r.sl_desprotegido; });
  var h = '<div class="cell"><div class="tag" style="display:block;margin-bottom:1rem;">SL desprotegido · ' + d.length + '</div>';
  if (!d.length) return h + '<div style="font-size:13px;color:var(--text-muted);">No volviste a alejar el SL después de proteger la entrada.</div></div>';
  var habria = d.filter(function(r) { return r.sl_protegido_habria_salido; }).length;
  var pnl = 0, conPnl = 0;
  d.forEach(function(r) { var t = porFp[r.fp]; if (t && t.beneficio != null) { pnl += parseFloat(t.beneficio); conPnl++; } });
  h += _daLineaConteo('…y el SL protegido habría saltado', habria, d.length, 'var(--red)') +
       '<div style="font-size:13px;color:var(--text-dim);margin-top:.4rem;">P&amp;L de esos trades: <span style="color:' + (pnl >= 0 ? 'var(--green)' : 'var(--red)') + ';">' +
       (conPnl ? (pnl >= 0 ? '+' : '') + _daNum(pnl, 0) + '$' : '—') + '</span></div>';
  var varias = d.filter(function(r) { return r.sl_n_desprotecciones > 1; }).length;
  if (varias) h += '<div style="font-size:12px;color:var(--text-muted);margin-top:.3rem;">' + varias + ' con más de una desprotección</div>';
  return h + '</div>';
}

function _daHtmlEvolucionContenedor() {
  return '<div class="cell" style="margin-bottom:1.5rem;"><div class="tag" style="display:block;margin-bottom:.4rem;">% de cierres a mano "pronto" · semana a semana</div>' +
         '<div style="font-size:12px;color:var(--text-muted);margin-bottom:.8rem;">' +
           (_daHistorico ? 'Todas las semanas con trades analizados' : 'Últimas 12 semanas hasta la elegida') +
           ' · número = cierres a mano con veredicto</div>' +
         '<div id="da-evolucion" style="position:relative;"></div></div>';
}

// Barras de % pronto: una serie, sin leyenda (el título la nombra), tooltip por barra.
function _daPintarEvolucion(filasCuenta) {
  var cont = document.getElementById('da-evolucion');
  if (!cont) return;
  var semanas = [];
  if (_daHistorico) {
    if (!filasCuenta.length) { cont.innerHTML = ''; return; }
    var primera = _daLunes(filasCuenta[filasCuenta.length - 1].fecha_cierre);
    for (var s = _daLunes(filasCuenta[0].fecha_cierre); s >= primera; s -= 7 * DA_MS_DIA) semanas.unshift(s);
  } else {
    for (var i = 11; i >= 0; i--) semanas.push(_daSemana - i * 7 * DA_MS_DIA);
  }
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
    var elegida = !_daHistorico && d.s === _daSemana;
    var conEtiqueta = paso >= 30 || i % 2 === (datos.length - 1) % 2; // con muchas semanas, una de cada dos
    if (d.p) {
      var h = Math.max(2, alto * d.p.pct / 100);
      svg += '<path d="M' + x + ',' + base + ' V' + (base - h + 4) + ' q0,-4 4,-4 H' + (x + ancho - 4) + ' q4,0 4,4 V' + base + ' Z" fill="' + (elegida ? '#E8C870' : '#C9A84C') + '" fill-opacity="' + (elegida || _daHistorico ? 1 : 0.55) + '"/>';
    }
    if (conEtiqueta) {
      svg += '<text x="' + (x + ancho / 2) + '" y="' + (base + 14) + '" text-anchor="middle" fill="' + (elegida ? '#E8C870' : '#AAB0C4') + '" font-size="10">W' + _daSemanaIso(d.s) + '</text>' +
             '<text x="' + (x + ancho / 2) + '" y="' + (base + 27) + '" text-anchor="middle" fill="#AAB0C4" font-size="10">' + (d.p ? d.p.n : '—') + '</text>';
    }
    svg += '<rect x="' + (i * paso) + '" y="0" width="' + paso + '" height="' + H + '" fill="transparent" data-i="' + i + '"/>';
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

// ── Runners (criterios v7) ───────────────────────────────────────────────
// Trade con parcial y el resto con SL en BE o mejor (runner = true, lo decide
// post_cierre.py). Pts desde la entrada; $ = pts × 100 × lotes del resto, sin
// comisiones; runner_usd null si la EA no mandó volumen (antes del ~27/08).

function _daDur(min) {
  if (min == null) return '—';
  return min < 60 ? min + ' min' : Math.floor(min / 60) + ' h' + (min % 60 ? ' ' + (min % 60) + ' min' : '');
}

// Hasta dónde llegó el resto: el nivel más alto de DA_RUNNER_NIVELES que tocó;
// si no llegó al primero, 'be' si salió en BE (±1 pt) o 'algo' si salió por encima.
function _daNivelRunner(r) {
  var m = parseFloat(r.runner_max_pts);
  for (var i = DA_RUNNER_NIVELES.length - 1; i >= 0; i--) if (m >= DA_RUNNER_NIVELES[i]) return 'n' + DA_RUNNER_NIVELES[i];
  return parseFloat(r.runner_salida_pts) <= 1 ? 'be' : 'algo';
}

function _daRunnersResumen(filas) {
  var run = filas.filter(function(r) { return r.runner === true; });
  var conUsd = run.filter(function(r) { return r.runner_usd != null && r.runner_usd_todo_parcial != null; });
  var suma = function(a, k) { return a.reduce(function(s, r) { return s + parseFloat(r[k]); }, 0); };
  return { run: run, conUsd: conUsd, usd: suma(conUsd, 'runner_usd'), todo: suma(conUsd, 'runner_usd_todo_parcial'),
           sinProteger: filas.filter(function(r) { return r.runner === false; }).length };
}

function _daHtmlRunners(filas) {
  var rs = _daRunnersResumen(filas), run = rs.run;
  var h = '<div class="cell"><div class="tag" style="display:block;margin-bottom:1rem;">Runners · ' + run.length + '</div>';
  if (!run.length) {
    return h + '<div style="font-size:13px;color:var(--text-muted);">Ningún trade con parcial y el resto con SL en BE o mejor' +
           (rs.sinProteger ? ' (' + rs.sinProteger + ' con parcial y el resto sin proteger)' : '') + '.</div></div>';
  }
  var c = _daContar(run.map(function(r) { return { k: _daNivelRunner(r) }; }), 'k');
  var N = DA_RUNNER_NIVELES;
  h += _daLineaConteo('Volvió al BE', c.be || 0, run.length, 'var(--text-muted)') +
       _daLineaConteo('Salió con algo sin llegar a +' + N[0], c.algo || 0, run.length, '#8A6A2A');
  N.forEach(function(n, i) {
    h += _daLineaConteo(i < N.length - 1 ? 'Llegó a +' + n + ' (sin +' + N[i + 1] + ')' : 'Llegó a +' + n + ' o más',
                        c['n' + n] || 0, run.length, i === N.length - 1 ? 'var(--green)' : 'var(--gold)');
  });
  var mins = run.map(function(r) { return r.runner_minutos; }).filter(function(x) { return x != null; }).sort(function(a, b) { return a - b; });
  var sub = function(t) { return '<div style="font-size:12px;color:var(--text-muted);margin-top:.3rem;">' + t + '</div>'; };
  if (mins.length) h += sub('Tiempo abierto tras la parcial: mediana ' + _daDur(mins[Math.floor(mins.length / 2)]) + ' (máx. ' + _daDur(mins[mins.length - 1]) + ')');
  if (rs.conUsd.length) {
    var col = function(v) { return v >= 0 ? 'var(--green)' : 'var(--red)'; };
    var dif = rs.usd - rs.todo;
    h += '<div style="font-size:13px;color:var(--text-dim);line-height:1.7;margin-top:.7rem;">' +
         'Aportaron <span style="color:' + col(rs.usd) + ';">' + _daFmtD(rs.usd) + '</span> (' + _daFmtD(rs.usd / rs.conUsd.length) + ' por runner)' +
         '<br>Cerrando todo en la parcial: <span style="color:' + col(rs.todo) + ';">' + _daFmtD(rs.todo) + '</span>' +
         ' · diferencia <span style="color:' + col(dif) + ';">' + _daFmtD(dif) + '</span></div>';
    if (rs.conUsd.length < run.length) h += sub((run.length - rs.conUsd.length) + ' sin volumen guardado por la EA (antes del 27/08), fuera del $');
  }
  ['estructura', 'rechazo_rsi', null].forEach(function(e) {
    var g = _daRunnersResumen(run.filter(function(r) { return (r.estrategia || null) === e; }));
    if (!g.run.length) return;
    h += sub((e || 'sin clasificar') + ': ' + g.run.length + ' runner' + (g.run.length === 1 ? '' : 's') +
             (g.conUsd.length ? ' · ' + _daFmtD(g.usd) + ' vs ' + _daFmtD(g.todo) + ' todo en la parcial' : ''));
  });
  if (rs.sinProteger) h += sub(rs.sinProteger + ' con parcial pero el resto sin proteger (no cuentan como runner)');
  return h + '</div>';
}

// ── "Qué te conviene" ────────────────────────────────────────────────────
// 3–4 frases por reglas (sin IA) con las conclusiones de más dinero en juego
// del periodo. Cada comparación necesita DA_MIN_GRUPO_CONVIENE casos y el
// periodo DA_MIN_TRADES_CONVIENE trades. "dinero" solo ordena las frases.
function _daConclusiones(filas, porFp) {
  var G = DA_MIN_GRUPO_CONVIENE, out = [];
  var suma = function(a, f) { return a.reduce(function(s, r) { return s + f(r); }, 0); };
  var ben = function(r) { var t = porFp[r.fp]; return t && t.beneficio != null ? parseFloat(t.beneficio) : null; };
  var tr = function(n) { return ' (' + n + ' trade' + (n === 1 ? '' : 's') + ')'; };

  // 1. Esperar 15 min frente a entrar seguido
  var seg = _daResumenGrupo(filas.filter(function(r) { return r._seguida; }), porFp);
  var esp = _daResumenGrupo(filas.filter(function(r) { return r._gapMin != null && !r._seguida; }), porFp);
  if (seg && esp && seg.n >= G && esp.n >= G) {
    var d = esp.medio - seg.medio;
    out.push({ dinero: Math.abs(d) * seg.n, frase: d > 0
      ? 'Espera al menos ' + DA_MINUTOS_SECUENCIA + ' min tras cerrar: entrando seguido sacas ' + _daFmtD(seg.medio) + ' por trade y esperando ' +
        _daFmtD(esp.medio) + '; en tus ' + seg.n + ' entradas seguidas son unos ' + _daNum(d * seg.n, 0) + ' $ de diferencia' + tr(seg.n + esp.n) + '.'
      : 'Entrar seguido no te está costando: ' + _daFmtD(seg.medio) + ' por trade frente a ' + _daFmtD(esp.medio) + ' esperando ' +
        DA_MINUTOS_SECUENCIA + ' min' + tr(seg.n + esp.n) + '.' });
  }

  // 2. Vueltas de posición
  var vu = _daVueltasDinero(filas, porFp);
  if (vu.n >= G) {
    var dv = vu.mant - vu.real;
    out.push({ dinero: Math.abs(dv), frase: dv > 0
      ? 'No le des la vuelta: en ' + vu.n + ' vueltas sacaste ' + _daFmtD(vu.real) + ' con los dos trades; manteniendo el primero hasta su SL o TP habrías sacado ' +
        _daFmtD(vu.mant) + ', ' + _daNum(dv, 0) + ' $ más' + tr(vu.n * 2) + '.'
      : 'Darle la vuelta te ha salido bien: ' + vu.n + ' vueltas, ' + _daFmtD(vu.real) + ' frente a ' + _daFmtD(vu.mant) + ' manteniendo el primero' + tr(vu.n * 2) + '.' });
  }

  // 3. Parar en el límite de pérdida diaria
  var porDia = {};
  filas.forEach(function(r) { var k = _daDiaMs(r.fecha_cierre); (porDia[k] = porDia[k] || []).push(r); });
  var tras = 0, pnlTras = 0, dias = 0;
  Object.keys(porDia).forEach(function(k) {
    _daResumenDia(porDia[k], porFp).rotos.forEach(function(x) { if (x.despues) { tras += x.despues; pnlTras += x.pnlDespues; dias++; } });
  });
  if (tras >= G) {
    out.push({ dinero: Math.abs(pnlTras), frase: pnlTras < 0
      ? 'Para al llegar a −' + _daNum(DA_LIMITE_PERDIDA_DIA, 0) + ' $ en el día: después de superarlo hiciste ' + tras + ' trades más en ' + dias +
        (dias === 1 ? ' día' : ' días') + ' y sumaron ' + _daFmtD(pnlTras) + '; parando te los habrías ahorrado' + tr(tras) + '.'
      : 'Después de superar el límite de ' + _daNum(DA_LIMITE_PERDIDA_DIA, 0) + ' $ hiciste ' + tras + ' trades más y sumaron ' + _daFmtD(pnlTras) +
        ': seguir no te costó dinero, pero rompe la regla' + tr(tras) + '.' });
  }

  // 4. BE antes de TP1
  var evBe = filas.filter(function(r) { return r.be_antes_tp1 != null; });
  var be = evBe.filter(function(r) { return r.be_antes_tp1; });
  if (evBe.length >= G && be.length) {
    var perdidos = be.filter(function(r) {
      return r.tipo_cierre_detallado === 'sl_breakeven' && r.favor_post_puntos != null && r.tp1_pts != null &&
             parseFloat(r.favor_post_puntos) >= parseFloat(r.tp1_pts) && parseFloat(r.volumen) > 0;
    });
    var dTp1 = suma(perdidos, function(r) { return parseFloat(r.tp1_pts) * VALOR_PUNTO_XAUUSD * parseFloat(r.volumen); });
    out.push({ dinero: dTp1, frase: 'No muevas a BE antes de TP1: lo hiciste en ' + be.length + ' de ' + evBe.length + ' trades' +
      (perdidos.length
        ? '; en ' + perdidos.length + ' te sacó en BE y después el precio llegó a tu TP1: unos ' + _daNum(dTp1, 0) + ' $ a TP1 con todo el volumen'
        : '; ninguno te ha sacado todavía de un TP1') + tr(evBe.length) + '.' });
  }

  // 5. TP1 no asegurado
  var alc = filas.filter(function(r) { return r.tp1_alcanzado; });
  var na = alc.filter(function(r) { return r.tp1_no_asegurado && ben(r) != null && parseFloat(r.volumen) > 0; });
  if (alc.length >= G && na.length) {
    var aTp1 = suma(na, function(r) { return parseFloat(r.tp1_pts) * VALOR_PUNTO_XAUUSD * parseFloat(r.volumen); });
    var realNa = suma(na, ben);
    out.push({ dinero: Math.abs(aTp1 - realNa), frase: 'Asegura al llegar a TP1: ' + na.length + ' de ' + alc.length +
      ' veces llegaste a +TP1 y volvió a la entrada sin parcial ni BE; cerrando en TP1 habrías hecho ' + _daFmtD(aTp1) +
      ' en vez de ' + _daFmtD(realNa) + tr(alc.length) + '.' });
  }

  // 6. Runners
  var rs = _daRunnersResumen(filas);
  if (rs.conUsd.length >= G) {
    var dr = rs.usd - rs.todo;
    out.push({ dinero: Math.abs(dr), frase: dr >= 0
      ? 'Dejar runners te compensa: ' + rs.conUsd.length + ' runners aportaron ' + _daFmtD(rs.usd) + ' frente a ' + _daFmtD(rs.todo) +
        ' cerrando todo en la parcial, ' + _daNum(dr, 0) + ' $ más' + tr(rs.conUsd.length) + '.'
      : 'Los runners te están costando: ' + rs.conUsd.length + ' runners aportaron ' + _daFmtD(rs.usd) + '; cerrando todo en la parcial habrías hecho ' +
        _daFmtD(rs.todo) + ', ' + _daNum(-dr, 0) + ' $ más' + tr(rs.conUsd.length) + '.' });
  }

  return out.filter(function(x) { return x.dinero > 0; })
            .sort(function(a, b) { return b.dinero - a.dinero; }).slice(0, 4);
}

function _daHtmlConviene(filas, nombrePeriodo) {
  var h = '<div class="cell" style="border-left:2px solid var(--gold);margin-bottom:1px;">' +
          '<div class="tag" style="display:block;margin-bottom:.8rem;">Qué te conviene · ' + nombrePeriodo + '</div>';
  if (filas.length < DA_MIN_TRADES_CONVIENE) {
    return h + '<div style="font-size:14px;color:var(--text-muted);">Con ' + filas.length + ' trade' + (filas.length === 1 ? '' : 's') +
           ' todavía no hay base suficiente para sacar conclusiones (mínimo ' + DA_MIN_TRADES_CONVIENE + ').</div></div>';
  }
  var c = _daConclusiones(filas, _daTradesPorFp());
  if (!c.length) {
    return h + '<div style="font-size:14px;color:var(--text-muted);">Ninguna comparación tiene todavía casos suficientes (mínimo ' +
           DA_MIN_GRUPO_CONVIENE + ' por comparación) · ' + filas.length + ' trades.</div></div>';
  }
  return h + '<ul style="margin:0;padding-left:1.1rem;font-size:15px;color:var(--text);line-height:1.7;">' +
         c.map(function(x) { return '<li style="margin-bottom:.4rem;">' + _daEsc(x.frase) + '</li>'; }).join('') + '</ul>' +
         '<div style="font-size:12px;color:var(--text-muted);margin-top:.4rem;">Calculado con ' + filas.length + ' trades · ordenado por dinero en juego · ' +
         'mínimo ' + DA_MIN_GRUPO_CONVIENE + ' casos por comparación · estimaciones con tus propios precios, sin comisiones</div></div>';
}

// ── Calendario mensual ───────────────────────────────────────────────────
// Encima de la vista semanal y con la misma pestaña de cuenta. Cada trade va
// al día de su cierre (hora de servidor MT5, getUTC*). P&L de trades
// (AURUM_TRADES), como en el resto del Diario.

function _daDiaMs(iso) {
  var d = _daFecha(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function _daMesDe(iso) {
  var d = _daFecha(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function _daFmtD(v) { return (v >= 0 ? '+' : '−') + _daNum(Math.abs(v), 0) + ' $'; }

// P&L corto para las celdas: +553 / −1,2k
function _daFmtCorto(v) {
  var a = Math.abs(v);
  return (v >= 0 ? '+' : '−') + (a >= 1000 ? _daNum(a / 1000, 1) + 'k' : _daNum(a, 0));
}

// Resumen de un día (filas de ese día, cualquier orden). El límite se mide por
// cuenta: P&L acumulado del día, trade a trade por hora de cierre; se rompe en
// el primer trade que lo deja en −DA_LIMITE_PERDIDA_DIA o peor.
function _daResumenDia(filasDia, porFp) {
  var lista = filasDia.slice().sort(function(a, b) { return _daFecha(a.fecha_cierre) - _daFecha(b.fecha_cierre); });
  var res = { lista: lista, pnl: 0, conPnl: 0, gan: 0, rotos: [], vueltas: 0 };
  var acum = {}, roto = {};
  lista.forEach(function(r) {
    if (r._vueltaA) res.vueltas++;
    var t = porFp[r.fp];
    if (!t || t.beneficio == null) return;
    var b = parseFloat(t.beneficio), c = String(r.cuenta_numero);
    res.pnl += b; res.conPnl++; if (b > 0) res.gan++;
    acum[c] = (acum[c] || 0) + b;
    if (roto[c]) { roto[c].despues++; roto[c].pnlDespues += b; }
    else if (acum[c] <= -DA_LIMITE_PERDIDA_DIA) {
      roto[c] = { r: r, cuenta: c, acum: acum[c], despues: 0, pnlDespues: 0 };
      res.rotos.push(roto[c]);
    }
  });
  return res;
}

function _daMoverMes(delta) {
  var d = new Date(_daMes);
  _daMes = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1);
  _daDia = null;
  if (_daAbierto && _daAbierto.indexOf('d:') === 0) _daAbierto = null;
  _daPintar();
}

function _daElegirDia(ms) {
  _daDia = _daDia === ms ? null : ms;
  if (_daAbierto && _daAbierto.indexOf('d:') === 0) _daAbierto = null;
  _daPintar();
}

function _daHtmlCalendario(filas) {
  if (_daMes == null) return '';
  var porFp = _daTradesPorFp();
  var d0 = new Date(_daMes), y = d0.getUTCFullYear(), m = d0.getUTCMonth();
  var finMes = Date.UTC(y, m + 1, 1);
  var nDias = new Date(finMes - DA_MS_DIA).getUTCDate();

  var porDia = {};
  filas.forEach(function(r) {
    var k = _daDiaMs(r.fecha_cierre);
    if (k >= _daMes && k < finMes) (porDia[k] = porDia[k] || []).push(r);
  });
  var res = {};
  Object.keys(porDia).forEach(function(k) { res[k] = _daResumenDia(porDia[k], porFp); });
  if (_daDia != null && (_daDia < _daMes || _daDia >= finMes)) _daDia = null;

  var nombreMes = new Date(_daMes).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  nombreMes = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
  var h = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">' +
            '<div class="tag" style="display:block;">Calendario</div>' +
            '<div style="display:flex;align-items:center;gap:.6rem;">' +
              '<button class="tab" style="padding:.3rem .7rem;" onclick="_daMoverMes(-1)" aria-label="Mes anterior">‹</button>' +
              '<span style="font-size:14px;color:var(--gold-bright);min-width:150px;text-align:center;">' + _daEsc(nombreMes) + '</span>' +
              '<button class="tab" style="padding:.3rem .7rem;" onclick="_daMoverMes(1)" aria-label="Mes siguiente">›</button>' +
            '</div>' +
          '</div>';

  h += '<div class="da-cal">';
  ['L', 'M', 'X', 'J', 'V', 'S', 'D'].forEach(function(d) { h += '<div class="da-cal-cab">' + d + '</div>'; });
  var hueco = (new Date(_daMes).getUTCDay() + 6) % 7;
  for (var i = 0; i < hueco; i++) h += '<div></div>';
  for (var dia = 1; dia <= nDias; dia++) {
    var k = Date.UTC(y, m, dia), rd = res[k];
    var estilo = '', sombras = [];
    if (rd && rd.conPnl) {
      // Intensidad: proporcional al importe, saturada en el límite diario.
      var a = 0.1 + 0.5 * Math.min(1, Math.abs(rd.pnl) / DA_LIMITE_PERDIDA_DIA);
      estilo = 'background:linear-gradient(' + (rd.pnl >= 0 ? 'rgba(58,170,106,' : 'rgba(204,68,51,') + a.toFixed(2) + '),' +
               (rd.pnl >= 0 ? 'rgba(58,170,106,' : 'rgba(204,68,51,') + a.toFixed(2) + ')),var(--bg2);';
    }
    if (rd && rd.rotos.length) sombras.push('inset 0 3px 0 #CC4433');
    if (_daDia === k) sombras.push('inset 0 0 0 2px var(--gold)');
    if (sombras.length) estilo += 'box-shadow:' + sombras.join(',') + ';';
    var marcas = '';
    if (rd && rd.rotos.length) marcas += '<span class="da-cal-largo" title="Límite de pérdida diaria superado" style="color:#FF6B5A;font-size:10px;font-weight:600;">LÍM</span>';
    if (rd && rd.vueltas >= DA_VUELTAS_AVISO) marcas += '<span title="' + rd.vueltas + ' vueltas" style="color:' + DA_NARANJA + ';font-size:10px;font-weight:600;">↺' + rd.vueltas + '</span>';
    h += '<div class="da-cal-dia" style="' + estilo + '" onclick="_daElegirDia(' + k + ')" role="button" aria-label="' + dia + '">' +
           '<div style="display:flex;justify-content:space-between;gap:.2rem;align-items:baseline;">' +
             '<span style="font-size:12px;color:' + (rd ? 'var(--text)' : 'var(--text-muted)') + ';">' + dia + '</span>' +
             '<span style="display:flex;gap:.25rem;">' + marcas + '</span></div>' +
           (rd
             ? '<span class="da-cal-txt">' + rd.lista.length + '<span class="da-cal-largo"> trade' + (rd.lista.length === 1 ? '' : 's') + '</span></span>' +
               '<span style="font-size:12px;font-weight:600;white-space:nowrap;color:' + (!rd.conPnl ? 'var(--text-muted)' : rd.pnl >= 0 ? '#7FD6A0' : '#FF8A7A') + ';">' +
                 (rd.conPnl ? _daFmtCorto(rd.pnl) : '—') + '</span>'
             : '') +
         '</div>';
  }
  var resto = (7 - (hueco + nDias) % 7) % 7;
  for (var j = 0; j < resto; j++) h += '<div></div>';
  h += '</div>';
  h += '<div style="display:flex;flex-wrap:wrap;gap:.4rem 1.2rem;font-size:12px;color:var(--text-muted);margin:.5rem 0 1px;">' +
         '<span>Color: P&amp;L del día (más intenso cuanto mayor, tope ' + _daNum(DA_LIMITE_PERDIDA_DIA, 0) + ' $)</span>' +
         '<span><span style="color:#FF6B5A;font-weight:600;">LÍM</span> / barra roja arriba: límite de pérdida diaria (' + _daNum(DA_LIMITE_PERDIDA_DIA, 0) + ' $ por cuenta) superado</span>' +
         '<span><span style="color:' + DA_NARANJA + ';font-weight:600;">↺</span> ' + DA_VUELTAS_AVISO + ' o más vueltas</span>' +
       '</div>';

  h += _daHtmlResumenMes(res);
  var filasMes = [];
  Object.keys(porDia).forEach(function(k) { filasMes = filasMes.concat(porDia[k]); });
  if (filasMes.length) h += '<div style="margin-top:1px;">' + _daHtmlConviene(filasMes, 'este mes') + '</div>';
  if (_daDia != null) h += _daHtmlPanelDia(res[_daDia] || null);
  return h;
}

function _daHtmlResumenMes(res) {
  var dias = Object.keys(res).map(function(k) { return { k: +k, r: res[k] }; }).filter(function(d) { return d.r.conPnl; });
  var fecha = function(ms) { return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  var nTrades = Object.keys(res).reduce(function(s, k) { return s + res[k].lista.length; }, 0);
  if (!nTrades) {
    return '<div class="cell" style="margin-top:.8rem;color:var(--text-muted);font-size:14px;">Sin trades de la EA cerrados este mes' +
           (_daCuenta === 'global' ? '' : ' en esta cuenta') + '.</div>';
  }
  var pnl = dias.reduce(function(s, d) { return s + d.r.pnl; }, 0);
  var verdes = dias.filter(function(d) { return d.r.pnl > 0; }).length;
  var rojos = dias.filter(function(d) { return d.r.pnl < 0; }).length;
  var orden = dias.slice().sort(function(a, b) { return b.r.pnl - a.r.pnl; });
  var mejor = orden[0], peor = orden[orden.length - 1];
  var rotos = Object.keys(res).filter(function(k) { return res[k].rotos.length; }).length;
  var conVueltas = Object.keys(res).filter(function(k) { return res[k].vueltas >= DA_VUELTAS_AVISO; }).length;
  return '<div class="da-rejilla" style="--da-base:max(140px, calc(16.666% - 1px));margin-top:.8rem;">' +
    _daStat('P&amp;L del mes', dias.length ? _daFmtD(pnl) : '—', nTrades + ' trades', pnl >= 0 ? 'green' : 'red') +
    _daStat('Días verdes', verdes, 'de ' + dias.length + ' con trades', 'green') +
    _daStat('Días rojos', rojos, 'de ' + dias.length + ' con trades', 'red') +
    _daStat('Mejor día', mejor && mejor.r.pnl > 0 ? _daFmtD(mejor.r.pnl) : '—', mejor && mejor.r.pnl > 0 ? fecha(mejor.k) : 'sin días verdes', 'green') +
    _daStat('Peor día', peor && peor.r.pnl < 0 ? _daFmtD(peor.r.pnl) : '—', peor && peor.r.pnl < 0 ? fecha(peor.k) : 'sin días rojos', 'red') +
    _daStat('Límite roto', rotos, (rotos === 1 ? 'día' : 'días') + (conVueltas ? ' · ' + conVueltas + ' con ' + DA_VUELTAS_AVISO + '+ vueltas' : ''), rotos ? 'red' : 'white') +
  '</div>';
}

function _daHtmlPanelDia(rd) {
  var fecha = new Date(_daDia).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  fecha = fecha.charAt(0).toUpperCase() + fecha.slice(1);
  var h = '<div style="border:1px solid var(--border-gold);margin-top:1rem;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.8rem 1.2rem;border-bottom:1px solid var(--border);">' +
            '<span style="font-size:15px;color:var(--gold-bright);">' + _daEsc(fecha) + '</span>' +
            '<button class="tab" style="padding:.2rem .7rem;" onclick="_daElegirDia(' + _daDia + ')" aria-label="Cerrar el día">✕</button>' +
          '</div>';
  if (!rd) {
    return h + '<div style="padding:1rem 1.2rem;font-size:14px;color:var(--text-muted);">Sin trades de la EA cerrados este día' +
           (_daCuenta === 'global' ? '' : ' en esta cuenta') + '.</div></div>';
  }
  h += '<div style="padding:1rem 1.2rem;"><div class="tag" style="display:block;margin-bottom:.6rem;">Análisis del día</div>' +
       '<div style="font-size:15px;color:var(--text);line-height:1.7;">' + _daEsc(_daAnalisisDia(rd)) + '</div></div>';
  h += '<div style="padding:0 1.2rem;">' + _daHtmlTrades(rd.lista, 'Trades del día', 'd', false) + '</div>';
  return h + '</div>';
}

// "Análisis del día" por reglas (sin IA): 2–3 frases con lo que hay.
function _daAnalisisDia(rd) {
  var n = rd.lista.length, frases = [];
  var plural = function(k, uno, varios) { return k + ' ' + (k === 1 ? uno : varios); };
  var hora = function(r) { return _daHora(r.fecha_cierre).slice(-5); };

  // 1. Volumen, resultado, vueltas y entradas seguidas
  var f1 = 'Cerraste ' + plural(n, 'trade', 'trades') +
           (rd.conPnl ? ' con ' + _daFmtD(rd.pnl) + ' (' + plural(rd.gan, 'ganador', 'ganadores') + ')' : '');
  var seg = rd.lista.filter(function(r) { return r._seguida; }).length;
  var extra = [];
  if (rd.vueltas) extra.push(plural(rd.vueltas, 'vuelta de posición', 'vueltas de posición'));
  if (seg) extra.push(plural(seg, 'entrada seguida', 'entradas seguidas') + ' (menos de ' + DA_MINUTOS_SECUENCIA + ' min tras cerrar el anterior)');
  frases.push(f1 + (extra.length ? ', con ' + extra.join(' y ') : (n > 1 ? ', sin entradas seguidas' : '')) + '.');

  // 2. Errores de regla y límite de pérdida diaria
  var tipos = [['TP1 no asegurado', 'tp1_no_asegurado'], ['SL desprotegido', 'sl_desprotegido'], ['BE antes de TP1', 'be_antes_tp1']];
  var conErr = rd.lista.filter(function(r) { return r.tp1_no_asegurado || r.sl_desprotegido || r.be_antes_tp1; }).length;
  var det = tipos.map(function(t) {
    var k = rd.lista.filter(function(r) { return r[t[1]]; }).length;
    return k ? t[0] + (k > 1 ? ' ×' + k : '') : null;
  }).filter(Boolean);
  var f2 = conErr ? plural(conErr, 'trade', 'trades') + ' con error de regla (' + det.join(', ') + ')' : 'Sin errores de regla';
  rd.rotos.forEach(function(x, i) {
    f2 += (i === 0 ? '; superaste el límite de pérdida diaria de ' + _daNum(DA_LIMITE_PERDIDA_DIA, 0) + ' $' : '; también')  +
          (_daCuenta === 'global' ? ' en ' + _daNombreCuenta(x.cuenta) : '') +
          ' con el trade cerrado a las ' + hora(x.r) + ' (acumulado ' + _daFmtD(x.acum) + ')' +
          (x.despues ? ' y después hiciste ' + plural(x.despues, 'trade más', 'trades más') + ' (' + _daFmtD(x.pnlDespues) + ')' : ' y paraste ahí');
  });
  frases.push(f2 + '.');

  // 3. Con espera vs seguidas (solo si hay de los dos)
  var porFp = _daTradesPorFp();
  var grupo = function(g) {
    var con = g.filter(function(r) { var t = porFp[r.fp]; return t && t.beneficio != null; });
    return con.length ? { n: con.length, medio: con.reduce(function(s, r) { return s + parseFloat(porFp[r.fp].beneficio); }, 0) / con.length } : null;
  };
  var gs = grupo(rd.lista.filter(function(r) { return r._seguida; }));
  var ge = grupo(rd.lista.filter(function(r) { return r._gapMin != null && !r._seguida; }));
  if (gs && ge) {
    frases.push('Tras esperar al menos ' + DA_MINUTOS_SECUENCIA + ' min: ' + plural(ge.n, 'trade', 'trades') + ', ' + _daFmtD(ge.medio) +
                ' de media; seguidas: ' + plural(gs.n, 'trade', 'trades') + ', ' + _daFmtD(gs.medio) + ' de media' +
                (gs.medio < ge.medio ? ' — esperar te fue mejor.' : gs.medio > ge.medio ? ' — las seguidas te fueron mejor.' : '.'));
  }
  return frases.join(' ');
}

// ── B) Lista de trades ───────────────────────────────────────────────────

// Insignia del veredicto de cierre: neutra y discreta, "Cierre: …", porque solo
// habla del momento de cerrar. Los errores van aparte, en color y delante.
var DA_CIERRE_CORTO = {
  bien_cerrado: 'bien', mixto_te_saliste_con_poco: 'mixto', pronto: 'pronto', correcto: 'correcto',
  indeterminado: 'sin veredicto', te_salvo: 'BE, te salvó', mixto_te_saco_de_un_recorrido: 'BE, mixto',
  te_saco_de_un_ganador: 'BE, te sacó', sin_efecto: 'BE, sin efecto', sl_breakeven: 'BE',
  sl_original_o_ajustado_perdida: 'SL con pérdida', sl_beneficio_trailing: 'trailing', tp: 'TP', desconocido: '—'
};

function _daBadgeDecision(r) {
  var k = r.tipo_cierre_detallado === 'manual' ? r.decision_cierre_manual
        : r.tipo_cierre_detallado === 'sl_breakeven' && r.be_efecto !== 'na' ? r.be_efecto
        : r.tipo_cierre_detallado;
  return '<span style="font-size:11px;color:var(--text-muted);border:1px solid var(--border);padding:.12rem .45rem;white-space:nowrap;">Cierre: ' +
         _daEsc(DA_CIERRE_CORTO[k] || k) + '</span>';
}

// Errores del trade, en el orden en que se muestran (a la izquierda del cierre).
function _daErrores(r) {
  var e = [];
  if (r.tp1_no_asegurado) e.push({ txt: 'TP1 no asegurado', color: 'var(--red)' });
  if (r.sl_desprotegido)  e.push({ txt: 'SL desprotegido', color: 'var(--red)' });
  if (r.be_antes_tp1)     e.push({ txt: 'BE antes de TP1', color: 'var(--red)' });
  if (r._vueltaA || r._vueltaDe) e.push({ txt: 'Vuelta', color: DA_NARANJA });
  return e;
}

function _daBadgesErrores(r) {
  return _daErrores(r).map(function(e) {
    return '<span style="font-size:12px;color:' + e.color + ';border:1px solid ' + (e.color === DA_NARANJA ? DA_NARANJA + '66' : '#CC443366') +
           ';padding:.15rem .5rem;white-space:nowrap;">' + _daEsc(e.txt) + '</span>';
  }).join('');
}

// ── Vuelta de posición / entradas seguidas ─────────────────────────────────
// Se calcula en el front sobre todos los trades cargados (necesita el trade
// anterior aunque sea de otra semana). Por cada trade, el anterior es el que
// cerró más tarde antes de su entrada, en la misma cuenta.
//   _gapMin: minutos desde ese cierre hasta la entrada (null si no hay anterior)
//   _seguida: _gapMin < DA_MINUTOS_SECUENCIA
//   vuelta: seguida + dirección contraria + el anterior cerró a mano o con
//   pérdida → _vueltaDe (en el segundo) / _vueltaA (en el primero)
function _daMarcarSecuencias(filas) {
  var porCuenta = {};
  filas.forEach(function(r) {
    r._gapMin = null; r._seguida = false; r._vueltaDe = null; r._vueltaA = null;
    (porCuenta[r.cuenta_numero] = porCuenta[r.cuenta_numero] || []).push(r);
  });
  Object.keys(porCuenta).forEach(function(c) {
    var lista = porCuenta[c].slice().sort(function(a, b) { return _daFecha(a.fecha_entrada) - _daFecha(b.fecha_entrada); });
    lista.forEach(function(b) {
      var ent = _daFecha(b.fecha_entrada), prev = null;
      lista.forEach(function(a) {
        if (a !== b && _daFecha(a.fecha_cierre) <= ent && (!prev || _daFecha(a.fecha_cierre) > _daFecha(prev.fecha_cierre))) prev = a;
      });
      if (!prev) return;
      b._gapMin = (ent - _daFecha(prev.fecha_cierre)) / 60000;
      b._seguida = b._gapMin < DA_MINUTOS_SECUENCIA;
      var perdio = _daPtsReales(prev) < 0;
      if (b._seguida && prev.direccion !== b.direccion && (prev.tipo_cierre_detallado === 'manual' || perdio) && !prev._vueltaA) {
        b._vueltaDe = prev.fp; prev._vueltaA = b.fp;
      }
    });
  });
}

function _daPtsReales(r) {
  var d = r.direccion === 'buy' ? 1 : -1;
  return (parseFloat(r.precio_cierre) - parseFloat(r.precio_entrada)) * d;
}

// "Si hubieras mantenido el primero": desde su cierre real hasta su SL o TP
// original, máximo 4 h de mercado (la ventana post-cierre ya analizada). Si no
// toca ninguno, a precio_fin_ventana. Vela ambigua → SL (conservador). Si ya
// cerró en su SL original, mantener = lo real. Devuelve pts desde la entrada o null.
function _daMantenerPts(r) {
  var d = r.direccion === 'buy' ? 1 : -1, e = parseFloat(r.precio_entrada);
  if (r.sl_original != null && Math.abs(parseFloat(r.precio_cierre) - parseFloat(r.sl_original)) <= 0.5) return _daPtsReales(r);
  if ((r.resultado_post_cierre === 'fue_a_sl' || r.resultado_post_cierre === 'ambiguo_misma_vela') && r.sl_original != null) {
    return (parseFloat(r.sl_original) - e) * d;
  }
  if (r.resultado_post_cierre === 'fue_a_tp' && r.tp_original != null) return (parseFloat(r.tp_original) - e) * d;
  if (r.resultado_post_cierre === 'ninguno_en_ventana' && r.precio_fin_ventana != null) return (parseFloat(r.precio_fin_ventana) - e) * d;
  return null;
}

function _daResumenGrupo(g, porFp) {
  var con = g.filter(function(r) { var t = porFp[r.fp]; return t && t.beneficio != null; });
  if (!con.length) return null;
  var ben = con.map(function(r) { return parseFloat(porFp[r.fp].beneficio); });
  var pts = con.map(function(r) {
    var v = parseFloat(r.volumen);
    return v > 0 ? parseFloat(porFp[r.fp].beneficio) / (VALOR_PUNTO_XAUUSD * v) : _daPtsReales(r);
  });
  var suma = function(a) { return a.reduce(function(s, x) { return s + x; }, 0); };
  return { n: con.length, wr: Math.round(ben.filter(function(x) { return x > 0; }).length / con.length * 100),
           medio: suma(ben) / con.length, total: suma(ben), esp: suma(pts) / con.length };
}

// Vueltas del periodo (la pareja cuenta en el periodo del primer trade):
// P&L real de los dos trades vs "mantener el primero" (_daMantenerPts).
// n = parejas con los dos datos; solo esas entran en real/mant.
function _daVueltasDinero(filas, porFp) {
  var todos = {};
  (_daDatos || []).forEach(function(r) { todos[r.fp] = r; });
  var pares = filas.filter(function(r) { return r._vueltaA && todos[r._vueltaA]; });
  var real = 0, n = 0, mant = 0;
  pares.forEach(function(a) {
    var b = todos[a._vueltaA], ta = porFp[a.fp], tb = porFp[b.fp];
    if (ta && tb && ta.beneficio != null && tb.beneficio != null) {
      var p = _daMantenerPts(a), v = parseFloat(a.volumen);
      if (p != null && v > 0) {
        real += parseFloat(ta.beneficio) + parseFloat(tb.beneficio); n++;
        mant += p * VALOR_PUNTO_XAUUSD * v;
      }
    }
  });
  return { pares: pares, n: n, real: real, mant: mant };
}

function _daHtmlSecuencias(filas, porFp) {
  var fmtD = function(v) { return v == null ? '—' : (v >= 0 ? '+' : '') + _daNum(v, 0) + '$'; };
  var col = function(v) { return v == null ? 'var(--text-muted)' : v >= 0 ? 'var(--green)' : 'var(--red)'; };
  var h = '<div class="cell"><div class="tag" style="display:block;margin-bottom:1rem;">Vueltas y entradas seguidas · ' + DA_MINUTOS_SECUENCIA + ' min</div>';

  var vu = _daVueltasDinero(filas, porFp);
  var pares = vu.pares, real = vu.real, conReal = vu.n, mant = vu.mant;
  h += '<div style="font-size:14px;color:var(--text-dim);margin-bottom:.3rem;">Vueltas de posición: <span style="color:' + DA_NARANJA + ';">' + pares.length + '</span></div>';
  if (pares.length) {
    h += '<div style="font-size:13px;color:var(--text-muted);line-height:1.7;">' +
         (conReal
           ? 'Resultado real (los dos trades): <span style="color:' + col(real) + ';">' + fmtD(real) + '</span>' +
             '<br>Si hubieras mantenido el primero: <span style="color:' + col(mant) + ';">' + fmtD(mant) + '</span>' +
             ' · diferencia <span style="color:' + col(real - mant) + ';">' + fmtD(real - mant) + '</span>'
           : 'Sin datos para comparar.') +
         (conReal < pares.length ? '<br><span style="font-size:12px;">' + (pares.length - conReal) + ' sin dato de P&amp;L o de "mantener", fuera de la comparación</span>' : '') +
         '</div>';
  }

  // Entradas seguidas vs esperando (los primeros trades de cada cuenta no tienen anterior: fuera)
  var seg = _daResumenGrupo(filas.filter(function(r) { return r._seguida; }), porFp);
  var esp = _daResumenGrupo(filas.filter(function(r) { return r._gapMin != null && !r._seguida; }), porFp);
  var linea = function(t, g) {
    return '<tr style="border-top:1px solid var(--border);"><td style="padding:.35rem 0;color:var(--text-dim);">' + t + '</td>' +
           '<td style="text-align:right;">' + (g ? g.n : 0) + '</td><td style="text-align:right;">' + (g ? g.wr + '%' : '—') + '</td>' +
           '<td style="text-align:right;color:' + col(g ? g.medio : null) + ';">' + fmtD(g ? g.medio : null) + '</td>' +
           '<td style="text-align:right;">' + (g ? (g.esp >= 0 ? '+' : '') + _daNum(g.esp, 2) : '—') + '</td></tr>';
  };
  h += '<div style="font-size:14px;color:var(--text-dim);margin:1rem 0 .3rem;">Entradas seguidas (&lt; ' + DA_MINUTOS_SECUENCIA + ' min tras cerrar el anterior)</div>' +
       '<table style="width:100%;border-collapse:collapse;font-size:12px;color:var(--text-muted);"><thead><tr>' +
       '<th style="text-align:left;font-weight:400;"></th><th style="text-align:right;font-weight:400;">n</th><th style="text-align:right;font-weight:400;">WR</th>' +
       '<th style="text-align:right;font-weight:400;">$ medio</th><th style="text-align:right;font-weight:400;">Esp. pts</th></tr></thead><tbody>' +
       linea('Seguidas', seg) + linea('Si hubieras esperado (≥ ' + DA_MINUTOS_SECUENCIA + ' min)', esp) + '</tbody></table>';
  return h + '</div>';
}

// Lista de trades. pref distingue dónde se pinta ('w' = semana, 'd' = panel del
// día del calendario) para que un mismo trade en los dos sitios no repita ids.
// conFiltros: chips de estrategia / "Solo con errores" (solo en la semana).
function _daHtmlTrades(filas, titulo, pref, conFiltros) {
  var lista = filas.filter(function(r) {
    return !conFiltros || ((_daEstrategia === 'todas' || (r.estrategia || 'sin_clasificar') === _daEstrategia) &&
                           (!_daSoloErrores || _daErrores(r).length));
  }).sort(function(a, b) { return _daFecha(b.fecha_cierre) - _daFecha(a.fecha_cierre); });
  var porFp = _daTradesPorFp();

  var h = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.8rem;margin-bottom:.8rem;">' +
            '<div class="tag" style="display:block;">' + titulo + ' · ' + lista.length + '</div>' +
            (!conFiltros ? '' :
            '<div style="display:flex;flex-wrap:wrap;">' +
              _daChip('Todas', _daEstrategia === 'todas', "_daElegirEstrategia('todas')") +
              _daChip('rechazo_rsi', _daEstrategia === 'rechazo_rsi', "_daElegirEstrategia('rechazo_rsi')") +
              _daChip('estructura', _daEstrategia === 'estructura', "_daElegirEstrategia('estructura')") +
              _daChip('sin clasificar', _daEstrategia === 'sin_clasificar', "_daElegirEstrategia('sin_clasificar')") +
              '<span style="width:1px;background:var(--border);margin:0 .4rem;"></span>' +
              '<button class="tab' + (_daSoloErrores ? ' active' : '') + '" style="padding:.45rem .9rem;font-size:12px;' +
                (_daSoloErrores ? 'color:var(--red);border-bottom-color:var(--red);' : '') + '" ' +
                'onclick="_daSoloErrores=!_daSoloErrores;_daAbierto=null;_daPintar();">Solo con errores</button>' +
            '</div>') + '</div>';
  if (!lista.length) return h + '<div class="cell" style="color:var(--text-muted);font-size:14px;margin-bottom:1.5rem;">Sin trades con este filtro.</div>';

  h += '<div style="display:flex;flex-direction:column;gap:1px;background:var(--border);margin-bottom:2rem;">';
  lista.forEach(function(r) {
    var t = porFp[r.fp];
    var ben = t && t.beneficio != null ? parseFloat(t.beneficio) : null;
    var conError = _daErrores(r).length > 0;
    var clave = _daEsc(pref + ':' + r.fp);
    h += '<div style="background:var(--bg2);' + (conError ? 'box-shadow:inset 3px 0 0 #CC4433B3;' : '') + '">' +
           // Flex con wrap: en pantallas estrechas las insignias y el P&L bajan a
           // una segunda línea (alineadas a la derecha) en vez de aplastar el texto.
           '<div onclick="_daToggle(\'' + clave + '\')" style="display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:center;padding:.8rem 1.2rem;cursor:pointer;">' +
             '<span style="font-size:13px;color:var(--gold-dim);flex:0 0 88px;">' + _daHora(r.fecha_cierre) + '</span>' +
             '<span style="font-size:14px;color:var(--text-dim);flex:1 1 180px;min-width:0;">' + (r.direccion === 'buy' ? 'Compra' : 'Venta') + ' · ' + _daEsc(_daNombreCuenta(r.cuenta_numero)) +
               ' <span style="color:var(--text-muted);font-size:12px;">· ' + _daEsc(r.estrategia || 'sin clasificar') + '</span></span>' +
             '<span style="display:flex;gap:.4rem 1rem;flex-wrap:wrap;justify-content:flex-end;align-items:center;margin-left:auto;">' +
               '<span style="display:flex;gap:.4rem;flex-wrap:wrap;justify-content:flex-end;">' + _daBadgesErrores(r) +
                 (r.runner === true ? '<span style="font-size:11px;color:var(--gold);border:1px solid var(--border-gold);padding:.12rem .45rem;white-space:nowrap;">Runner: +' +
                                      _daNum(r.runner_max_pts, 1) + '</span>' : '') +
                 _daBadgeDecision(r) + '</span>' +
               '<span style="font-size:14px;min-width:70px;text-align:right;color:' + (ben == null ? 'var(--text-muted)' : ben >= 0 ? 'var(--green)' : 'var(--red)') + ';">' +
                 (ben == null ? '—' : (ben >= 0 ? '+' : '') + _daNum(ben, 2) + '$') + '</span>' +
             '</span>' +
           '</div>' +
           '<div id="da-det-' + clave + '" style="display:none;padding:0 1.2rem 1.2rem;"></div>' +
         '</div>';
  });
  return h + '</div>';
}

// clave = '<pref>:<fp>' (ver _daHtmlTrades)
function _daToggle(clave) {
  if (_daAbierto && _daAbierto !== clave) {
    var prev = document.getElementById('da-det-' + _daAbierto);
    if (prev) prev.style.display = 'none';
  }
  if (_daAbierto === clave) {
    document.getElementById('da-det-' + clave).style.display = 'none';
    _daAbierto = null;
    return;
  }
  _daAbierto = clave;
  _daAbrirDetalle(clave);
}

// ── Detalle de un trade ──────────────────────────────────────────────────

async function _daAbrirDetalle(clave) {
  var fp = clave.slice(clave.indexOf(':') + 1);
  var det = document.getElementById('da-det-' + clave);
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
  if (_daAbierto !== clave) return; // se cerró mientras cargaba
  var velas = res[0].data && res[0].data[0];
  var eventos = res[1].data || [];

  var h = '<div style="font-size:15px;color:var(--text);line-height:1.7;margin:.2rem 0 1rem;">' + _daEsc(_daFrase(r)) + '</div>';
  h += '<div id="da-graf-' + _daEsc(clave) + '" style="position:relative;background:#060810;border:1px solid var(--border);margin-bottom:.5rem;"></div>';
  h += '<div style="display:flex;flex-wrap:wrap;gap:1.2rem;font-size:12px;color:var(--text-muted);margin-bottom:1rem;">' +
         _daLeyenda(DA_COLOR.precio, 'Precio (cierre de vela) y rango máx–mín', false) +
         _daLeyenda(DA_COLOR.entrada, 'Entrada ' + _daNum(r.precio_entrada, 2), true) +
         (r.sl_original != null ? _daLeyenda(DA_COLOR.sl, 'SL original ' + _daNum(r.sl_original, 2), true) : '') +
         (r.tp_original != null ? _daLeyenda(DA_COLOR.tp, 'TP ' + _daNum(r.tp_original, 2), true) : '<span>sin TP</span>') +
         '<span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#E2D9C8;margin-right:.4rem;"></span>Cierre ' + _daNum(r.precio_cierre, 2) + '</span>' +
       '</div>';

  h += '<div class="da-rejilla" style="--da-base:max(150px, calc(25% - 1px));margin-bottom:1rem;">' +
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
  var graf = document.getElementById('da-graf-' + clave);
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
