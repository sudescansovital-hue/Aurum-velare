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
// trades (AURUM_TRADES, fuente de verdad), cruzando por fp; si el trade no
// está ahí (AURUM_TRADES se carga al entrar), del beneficio de ea_trades.
//
// Trades al instante (06/10): también se leen los cerrados de ea_trades. Los
// que post_cierre.py aún no ha analizado salen como fila provisional
// (_pendiente: "Análisis pendiente") en el calendario, el día, la lista, el
// P&L y los avisos de Mis reglas; los bloques que necesitan el análisis los
// dejan fuera. Clave fp en las dos tablas: un trade nunca sale dos veces.
//
// En curso (09/10): los ABIERTOS de ea_trades (estado=open) y los cerrados
// aún sin análisis salen arriba del todo, en "En curso y pendientes de
// análisis", para poner capturas y notas (Entrada, Gestión, Salida) en el momento. Los
// abiertos van aparte (_daAbiertos): no tienen cierre y no entran en
// calendario, semana ni estadísticas. El fp de ea_trades es el mismo que
// usa post_cierre_analisis (api/post-cierre.js solo acepta fp de ea_trades),
// así que capturas, nota y modo siguen al trade al cerrarse y analizarse.
//
// Semana: de lunes a domingo en hora de servidor MT5. Las fechas vienen
// etiquetadas +00 sin serlo (misma convención que ea_trades), así que se
// trabaja siempre con getUTC*.
// ============================================================

var _daDatos = null;          // filas de post_cierre_analisis + provisionales de ea_trades (_pendiente)
var _daEa = null;             // trades cerrados de ea_trades (P&L y trades aún sin analizar)
var _daEaEmail = null;        // de quién son las filas de _daEa
var _daAbiertos = null;       // trades abiertos de ea_trades (_abierto: "En curso"); van aparte de _daDatos
var _daCargando = false;
var _daCargaPromesa = null;   // carga en curso: quien llame mientras tanto espera la misma (Diario y "Tu situación")
var _daDatosEmail = null;     // de quién son _daDatos
var _daFirma = null;          // últimos cierres y análisis vistos (ver _daComprobarNuevos)
var _daSemana = null;         // ms del lunes 00:00 de la semana elegida
var _daHistorico = false;     // true = "Todo el histórico" (todas las semanas juntas)
var _daCuenta = 'global';     // 'global' | 'maestra' | 'prueba' | 'retos'
var _daEstrategia = 'todas';  // filtro de la lista de trades
var _daAbierto = null;        // trade desplegado: 'w:<fp>' (lista semanal) o 'd:<fp>' (panel del día)
var _daSoloErrores = false;   // filtro "Solo con errores" de la lista de trades
var _daMes = null;            // ms del día 1 00:00 del mes del calendario
var _daDia = null;            // ms del día elegido en el calendario (null = ninguno)
var _daReglas = null;         // Mis reglas: { carpeta: [{regla, nivel, valor, nombre}] } de reglas_efectivas; null = no cargadas

// Vuelta de posición / entradas seguidas: minutos entre el cierre de un trade
// y la apertura del siguiente en la misma cuenta. Cambiar aquí.
var DA_MINUTOS_SECUENCIA = 15;
// Calendario: importe ($) en el que satura la intensidad del color de cada día
// (solo color; los niveles de pérdida/beneficio salen de Mis reglas) y nº de
// vueltas a partir del cual se marca el día. Cambiar aquí.
var DA_ESCALA_COLOR_DIA = 500;
var DA_VUELTAS_AVISO = 3;
// Runners (criterios v7): niveles en pts desde la entrada para "hasta dónde llegó el resto".
var DA_RUNNER_NIVELES = [33, 50, 100];
// "Qué te conviene": mínimo de trades del periodo para sacar conclusiones, y
// mínimo de casos en cada comparación (p. ej. entradas seguidas, runners).
var DA_MIN_TRADES_CONVIENE = 20;
var DA_MIN_GRUPO_CONVIENE = 5;
// Ventana post-cierre en minutos de mercado (= VENTANA_POST_CIERRE_MIN_MERCADO
// de post_cierre.py). Con menos velas el análisis es provisional.
var DA_VENTANA_MIN = 240;
var DA_NARANJA = '#E8873A';
// Con el Diario a la vista, cada cuánto se mira si hay trades cerrados o
// análisis nuevos (2 consultas pequeñas; solo se recarga todo si cambió algo).
var DA_REFRESCO_MS = 60000;

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

// P&L por fp: trades (fuente de verdad); si el trade no está en AURUM_TRADES
// (se carga al entrar en la web, así que no tiene los cerrados después), el
// beneficio de ea_trades, que es el mismo que la EA escribe en trades.
function _daTradesPorFp() {
  var m = {};
  (_daEa || []).forEach(function(t) { if (t.fp && t.beneficio != null) m[t.fp] = { beneficio: t.beneficio }; });
  ((window.AURUM_TRADES && window.AURUM_TRADES.todos) || []).forEach(function(t) {
    if (t.fp && (t.beneficio != null || !m[t.fp])) m[t.fp] = t;
  });
  return m;
}

function _daPendiente(r) { return r._pendiente === true; }
function _daAnalizadas(filas) { return filas.filter(function(r) { return !_daPendiente(r); }); }

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
  // Si la hubieras dejado correr (criterios v8): solo cierres a mano con SL al cerrar
  if (r.dejar_correr === true && r.dejar_correr_resultado && r.dejar_correr_resultado !== 'sin_datos') f += ' ' + _daFraseDejarCorrer(r);
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

// "Si la hubieras dejado" (v8): desde el cierre a mano hasta el TP o el SL que
// tenías puestos al cerrar, tope 5 días de mercado. $ = de más (+) o de menos (−)
// frente a lo que hiciste, con los lotes del cierre final y sin comisiones.
function _daTiempoMercado(min) {
  if (min == null) return '';
  return min < 1440 ? _daDur(min) + ' de mercado' : _daNum(min / 1440, 1) + ' días de mercado';
}

function _daFraseDejarCorrer(r) {
  var extra = r.dejar_correr_usd_extra != null ? parseFloat(r.dejar_correr_usd_extra) : null;
  var frente = extra == null ? '' : ': ' + _daFmtD(extra) + ' frente a cerrar a mano';
  var cuando = r.dejar_correr_en ? ' el ' + _daHora(r.dejar_correr_en).replace(' ', ' a las ') : '';
  var tras = r.dejar_correr_min_mercado != null ? ', ' + _daTiempoMercado(r.dejar_correr_min_mercado) + ' después' : '';
  var tp = r.dejar_correr_tp != null ? _daNum(r.dejar_correr_tp, 2) : null;
  var sl = _daNum(r.dejar_correr_sl, 2);
  switch (r.dejar_correr_resultado) {
    case 'tp':
      return 'Si la hubieras dejado: llegó a tu TP (' + tp + ')' + cuando + tras +
             (r.dejar_correr_hueco ? ', en un hueco de apertura' : '') + frente + '.';
    case 'sl':
      return 'Si la hubieras dejado: habría tocado tu SL (' + sl + ')' + cuando + tras +
             (r.dejar_correr_hueco ? ', con hueco de apertura (salida a ' + _daNum(r.dejar_correr_precio, 2) + ')' : '') +
             (r.dejar_correr_ambiguo ? ' (en el mismo minuto que el TP: se cuenta como SL)' : '') + frente + '.';
    case 'ninguno':
      return 'Si la hubieras dejado: en 5 días de mercado no tocó ' + (tp ? 'ni tu TP ni tu SL' : 'tu SL (no tenías TP)') +
             '; al final iba a ' + _daNum(r.dejar_correr_precio, 2) + frente + '.';
    case 'en_curso':
      return 'Si la hubieras dejado: todavía no ha tocado ' + (tp ? 'ni tu TP ni tu SL' : 'tu SL') +
             ' (en seguimiento' + (r.dejar_correr_min_mercado != null ? ', ' + _daTiempoMercado(r.dejar_correr_min_mercado) : '') + ').';
  }
  return '';
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

// Se vuelve a pedir cada vez que se abre el Diario: la tarea programada sube
// análisis nuevos cada hora (y recalcula los provisionales), y antes solo se
// cargaban una vez por sesión. Si falla, se siguen mostrando los anteriores.
// PostgREST corta cada respuesta en 1000 filas (max-rows de Supabase): se pide
// por páginas. params lleva un orden total (con desempate) para no saltar filas.
async function _daGetTodo(tabla, params) {
  var out = [];
  for (var offset = 0; ; offset += 1000) {
    var r = await supaGet(tabla, params + '&limit=1000&offset=' + offset, getToken());
    if (r.error || !Array.isArray(r.data)) return { data: null, error: r.error };
    out = out.concat(r.data);
    if (r.data.length < 1000) return { data: out, error: null };
  }
}

var DA_COLUMNAS_EA = 'fp,position_id,cuenta_numero,estrategia,tipo,volumen,precio_entrada,fecha_entrada,precio_cierre,fecha_cierre,beneficio';
var DA_COLUMNAS_ABIERTOS = 'fp,position_id,cuenta_numero,estrategia,tipo,volumen,precio_entrada,fecha_entrada,sl_actual,tp_actual';
// "En curso": máximo de cerrados sin análisis que se listan arriba (los demás
// siguen en el calendario y en su semana).
var DA_PENDIENTES_ARRIBA = 20;

// ¿Abierto de verdad? ea_trades guarda como 'open' trades antiguos cuyo cierre
// nunca llegó (EA anterior a la 1.04, cuentas que ya no se usan). La EA no
// manda al servidor su lista de abiertas (vive en aurum_abiertas_<cuenta>.txt),
// así que aquí cuenta como abierto solo si: es de una cuenta activa del
// usuario (Maestra / Prueba / Retos), no está ya cerrado en trades (historial
// importado de MT5, mismo fp) y se abrió hace menos de DA_ABIERTO_MAX_DIAS.
// Lo usa también la lista de la captura (capturas.js).
var DA_ABIERTO_MAX_DIAS = 14;
function _daCuentasActivas() {
  var u = window.usuarioActual || {};
  return DA_PESTANAS.map(function(p) { return u[p.campo] ? String(u[p.campo]) : null; }).filter(Boolean);
}
function _daAbiertoReal(t) {
  if (!t || !t.fp || _daCuentasActivas().indexOf(String(t.cuenta_numero)) === -1) return false;
  var cerrados = (window.AURUM_TRADES && window.AURUM_TRADES.todos) || [];
  if (cerrados.some(function(x) { return x.fp === t.fp; })) return false;
  var ms = Date.parse(t.fecha_entrada);
  return !isNaN(ms) && Date.now() - ms < DA_ABIERTO_MAX_DIAS * DA_MS_DIA;
}

// Abiertos de ea_trades con la misma forma que las filas del Diario.
function _daFilasAbiertas(ea) {
  return ea.filter(_daAbiertoReal).map(function(t) {
    return {
      fp: t.fp, position_id: t.position_id, cuenta_numero: t.cuenta_numero, estrategia: t.estrategia || null,
      direccion: String(t.tipo || '').toLowerCase() === 'sell' ? 'sell' : 'buy', volumen: t.volumen,
      fecha_entrada: t.fecha_entrada, precio_entrada: t.precio_entrada,
      sl_actual: t.sl_actual, tp_actual: t.tp_actual, _abierto: true
    };
  }).sort(function(a, b) { return _daFecha(b.fecha_entrada) - _daFecha(a.fecha_entrada); });
}

function _daConsultaAbiertos(email) {
  return supaGet('ea_trades', 'usuario_email=eq.' + email + '&estado=eq.open&select=' + DA_COLUMNAS_ABIERTOS +
                              '&order=fecha_entrada.desc,position_id.desc', getToken());
}

// Vuelve a leer solo los abiertos y repinta (p. ej. tras una captura de un
// trade que se abrió después de cargar el Diario).
async function _daRefrescarAbiertos() {
  var u = window.usuarioActual;
  if (!u || !u.email) return;
  var r = await _daConsultaAbiertos(encodeURIComponent(u.email));
  if (r.error || !Array.isArray(r.data) || !window.usuarioActual || window.usuarioActual.email !== u.email) return;
  _daAbiertos = _daFilasAbiertas(r.data);
  if (document.getElementById('diario-analisis-bloque') && _daHayAlgo()) _daPintar();
}

function _daHayAlgo() { return !!((_daDatos && _daDatos.length) || (_daAbiertos && _daAbiertos.length)); }

// Análisis + trades de ea_trades sin analizar todavía, por fecha de cierre desc.
// Una provisional por fp que no tenga análisis: cuando post_cierre.py lo sube,
// en la siguiente carga el fp ya está analizado y la provisional no se crea.
function _daFusionar(analisis, ea) {
  var vistos = {};
  analisis.forEach(function(r) { vistos[r.fp] = true; });
  var pendientes = [];
  ea.forEach(function(t) {
    if (!t.fp || vistos[t.fp] || !t.fecha_cierre) return;
    vistos[t.fp] = true;
    pendientes.push({
      fp: t.fp, position_id: t.position_id, cuenta_numero: t.cuenta_numero, estrategia: t.estrategia || null,
      direccion: String(t.tipo || '').toLowerCase() === 'sell' ? 'sell' : 'buy', volumen: t.volumen,
      fecha_entrada: t.fecha_entrada || t.fecha_cierre, precio_entrada: t.precio_entrada,
      fecha_cierre: t.fecha_cierre, precio_cierre: t.precio_cierre, _pendiente: true
    });
  });
  return analisis.concat(pendientes).sort(function(a, b) { return _daFecha(b.fecha_cierre) - _daFecha(a.fecha_cierre); });
}

// Se vuelve a pedir cada vez que se abre el Diario: la tarea programada sube
// análisis nuevos cada hora (y recalcula los provisionales), y antes solo se
// cargaban una vez por sesión. Si falla, se siguen mostrando los anteriores.
function _daCargar() {
  if (_daCargaPromesa) return _daCargaPromesa;
  _daCargaPromesa = _daCargarAhora().finally(function() { _daCargaPromesa = null; });
  return _daCargaPromesa;
}

async function _daCargarAhora() {
  if (_daCargando) return;
  var u = window.usuarioActual;
  if (!u || !u.email || typeof supaGet !== 'function') return;
  _daCargando = true;
  var email = encodeURIComponent(u.email);
  var res = await Promise.all([
    _daGetTodo('post_cierre_analisis', 'usuario_email=eq.' + email + '&order=fecha_cierre.desc,id.desc'),
    // select=*: con o sin la columna plan (sql_mis_reglas_v2_plan.sql) funciona igual
    supaGet('reglas_efectivas', 'usuario_email=eq.' + email + '&select=*', getToken()),
    _daGetTodo('ea_trades', 'usuario_email=eq.' + email + '&estado=eq.closed&fecha_cierre=not.is.null' +
                            '&select=' + DA_COLUMNAS_EA + '&order=fecha_cierre.desc,position_id.desc'),
    // Modos y plan del día (modos.js): si fallan, el Diario sigue igual.
    typeof _moCargar === 'function' ? _moCargar().catch(function(e) { console.error('[diario-analisis] modos', e); }) : null,
    // Capturas y notas por hueco (capturas.js): si fallan, el Diario sigue igual.
    typeof _caCargar === 'function' ? _caCargar().catch(function(e) { console.error('[diario-analisis] capturas', e); }) : null,
    _daConsultaAbiertos(email)
  ]);
  var r = res[0];
  _daCargando = false;
  if (!window.usuarioActual || window.usuarioActual.email !== u.email) return; // cambió la sesión mientras cargaba
  // Mis reglas: si fallan, se mantienen las anteriores (o ninguna) y el Diario sigue.
  if (!res[1].error && Array.isArray(res[1].data)) {
    _daReglas = {};
    res[1].data.forEach(function(x) {
      (_daReglas[x.carpeta] = _daReglas[x.carpeta] || []).push({ regla: x.regla, nivel: Number(x.nivel), valor: Number(x.valor),
                                                                  nombre: x.nombre || null, plan: x.plan || null });
    });
  } else if (res[1].error) console.error('[diario-analisis] error al cargar Mis reglas', res[1].error);
  // ea_trades: si falla, el Diario sigue solo con lo analizado (como antes).
  if (res[2].error) {
    console.error('[diario-analisis] error al cargar ea_trades', res[2].error);
    if (_daEaEmail !== u.email) _daEa = null;   // nunca los de otra sesión
  } else { _daEa = res[2].data; _daEaEmail = u.email; }
  // Abiertos: si fallan, se mantienen los anteriores de esta sesión (o ninguno).
  if (res[5].error || !Array.isArray(res[5].data)) {
    console.error('[diario-analisis] error al cargar los abiertos', res[5].error);
    if (_daDatosEmail !== u.email) _daAbiertos = null;
  } else _daAbiertos = _daFilasAbiertas(res[5].data);
  if (r.error || !Array.isArray(r.data)) { console.error('[diario-analisis] error al cargar', r.error); return; }
  _daDatos = _daFusionar(r.data, _daEa || []);
  _daDatosEmail = u.email;
  _daMarcarSecuencias(_daDatos);
  if (_daDatos.length && _daSemana == null) _daSemana = _daLunes(_daDatos[0].fecha_cierre);
  if (_daDatos.length && _daMes == null) _daMes = _daMesDe(_daDatos[0].fecha_cierre);
}

async function buildDiarioAnalisis() {
  var cont = document.getElementById('diario-analisis-bloque');
  if (!cont) return;
  await _daCargar();
  _daFirma = null;
  _daComprobarNuevos(true);
  if (!_daHayAlgo()) { cont.innerHTML = ''; return; }
  _daPintar();
}

// ── Refresco con el Diario abierto ─────────────────────────────────────────
// Firma = últimos cierres de ea_trades (fp + beneficio), últimos análisis
// (fp + ventana completa + versión) y abiertos (fp + SL/TP). Si cambia, se recarga y se repinta; si
// no, no se toca la pantalla. Solo con la pestaña del navegador y el Diario visibles.
async function _daFirmaActual() {
  var u = window.usuarioActual;
  if (!u || !u.email) return null;
  var email = encodeURIComponent(u.email);
  var res = await Promise.all([
    supaGet('ea_trades', 'usuario_email=eq.' + email + '&estado=eq.closed&fecha_cierre=not.is.null' +
                         '&select=fp,beneficio&order=fecha_cierre.desc,position_id.desc&limit=20', getToken()),
    supaGet('post_cierre_analisis', 'usuario_email=eq.' + email +
                                    '&select=fp,ventana_completa,criterios_version&order=calculado_en.desc&limit=20', getToken()),
    supaGet('ea_trades', 'usuario_email=eq.' + email + '&estado=eq.open&select=fp,sl_actual,tp_actual&order=fecha_entrada.desc,position_id.desc', getToken())
  ]);
  if (res[0].error || res[1].error || res[2].error) return null;
  return JSON.stringify([res[0].data, res[1].data, res[2].data]);
}

function _daVisible() {
  var cont = document.getElementById('diario-analisis-bloque');
  return !document.hidden && !!cont && cont.offsetParent !== null;
}

// soloFirma: primera llamada tras cargar, solo guarda la firma de partida.
async function _daComprobarNuevos(soloFirma) {
  var f = await _daFirmaActual();
  if (f == null) return;
  if (soloFirma || _daFirma == null) { _daFirma = f; return; }
  if (f === _daFirma) return;
  _daFirma = f;
  await _daCargar();
  if (_daVisible() && _daHayAlgo()) _daPintar();
}

setInterval(function() { if (_daDatos && _daVisible()) _daComprobarNuevos(false); }, DA_REFRESCO_MS);

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

  _daMarcarNiveles(_daDatos || [], _daTradesPorFp());
  var filas = _daFiltrarCuenta(_daDatos || []);
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

  html += _daHtmlEnCurso(filas);
  html += _daHtmlHoy(filas);
  // Solo abiertos (aún ningún trade cerrado): no hay calendario ni semanas que pintar.
  if (!_daDatos || !_daDatos.length) {
    cont.innerHTML = html;
    if (_daAbierto) _daAbrirDetalle(_daAbierto);
    return;
  }
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

// Al cambiar de cuenta, si esa cuenta no tiene trades en la semana a la vista
// se salta a su última semana con trades (si no, una cuenta poco activa
// parecía vacía aunque tuviera todo analizado).
function _daElegirCuenta(c) {
  _daCuenta = c; _daAbierto = null;
  var filas = _daFiltrarCuenta(_daDatos || []);
  if (filas.length && !_daDeSemana(filas, _daSemana).length) _daSemana = _daLunes(filas[0].fecha_cierre);
  _daPintar();
}

function _daIrASemana(lunesMs) { _daSemana = lunesMs; _daHistorico = false; _daAbierto = null; _daPintar(); }

// Lunes de la semana con trades más reciente anterior a la elegida o, si no
// hay ninguna antes, la más reciente de todas. null si la cuenta no tiene trades.
function _daSemanaConTrades(filas) {
  if (!filas.length) return null;
  for (var i = 0; i < filas.length; i++) {   // filas, por fecha_cierre desc
    var l = _daLunes(filas[i].fecha_cierre);
    if (l < _daSemana) return l;
  }
  return _daLunes(filas[0].fecha_cierre);
}
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
    var otra = _daHistorico ? null : _daSemanaConTrades(filasCuenta || []);
    return '<div class="cell" style="margin-bottom:1.5rem;color:var(--text-muted);font-size:14px;">Sin trades de la EA cerrados ' +
           (_daHistorico ? 'todavía' : 'esta semana') +
           (_daCuenta === 'global' ? '' : ' en esta cuenta') + '.' +
           (otra == null ? '' : ' <span style="color:var(--gold);cursor:pointer;" onclick="_daIrASemana(' + otra + ')">' +
                                (otra < _daSemana ? 'Ir a la anterior con trades' : 'Ir a la última con trades') +
                                ' (' + _daEsc(_daEtiquetaSemana(otra)) + ') →</span>') +
           '</div>' + _daHtmlEvolucionContenedor();
  }
  var porFp = _daTradesPorFp();
  // Trades, P&L, WR, niveles y la tabla por estrategia: todos los trades. El
  // resto (veredictos, BE, TP1, runners...) necesita el análisis: solo analizados.
  var todas = semana, nPend = todas.length - _daAnalizadas(todas).length;
  semana = _daAnalizadas(todas);
  var pnl = 0, conPnl = 0, ganadoras = 0;
  todas.forEach(function(r) {
    var t = porFp[r.fp];
    if (t && t.beneficio != null) { pnl += parseFloat(t.beneficio); conPnl++; if (parseFloat(t.beneficio) > 0) ganadoras++; }
  });
  var manuales = semana.filter(function(r) { return r.decision_cierre_manual !== 'na'; });
  var pp = _daPctPronto(semana);
  var dejados = semana.filter(function(r) { return r.decision_cierre_manual === 'pronto' && r.favor_post_puntos != null; })
                      .reduce(function(s, r) { return s + parseFloat(r.favor_post_puntos); }, 0);

  var h = '<div class="da-rejilla" style="--da-base:max(140px, calc(16.666% - 1px));margin-bottom:1px;">' +
    _daStat('Trades', todas.length, nPend ? nPend + ' pendiente' + (nPend === 1 ? '' : 's') + ' de análisis' : 'cerrados por la EA', 'white') +
    _daStat('P&amp;L', conPnl ? (pnl >= 0 ? '+' : '') + _daNum(pnl, 0) + '$' : '—', conPnl < todas.length ? conPnl + ' con P&amp;L' : '', pnl >= 0 ? 'green' : 'red') +
    _daStat('Win rate', conPnl ? Math.round(ganadoras / conPnl * 100) + '%' : '—', ganadoras + ' de ' + conPnl, 'green') +
    _daStat('Cierres a mano', semana.length ? manuales.length : '—',
            semana.length ? Math.round(manuales.length / semana.length * 100) + '% de los ' + (nPend ? 'analizados' : 'trades') : 'sin trades analizados', 'gold') +
    _daStat('% pronto', pp ? pp.pct + '%' : '—', pp ? pp.pronto + ' de ' + pp.n + ' a mano' : 'sin cierres a mano', 'gold') +
    _daStat('Pts dejados', _daNum(dejados, 1), 'en los cierres pronto', 'gold') +
  '</div>';
  h += _daHtmlConviene(semana, _daHistorico ? 'todo el histórico' : 'esta semana');
  h += _daHtmlNiveles(todas, _daHistorico ? 'todo el histórico' : 'esta semana');

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
  h += '<div class="cell" style="margin-bottom:1px;"><div class="tag" style="display:block;margin-bottom:1rem;">Por setup (EA)</div>' +
       '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:520px;">' +
       '<thead><tr style="color:var(--text-muted);text-align:right;">' +
       '<th style="text-align:left;font-weight:400;padding:.3rem 0;">Setup (EA)</th><th style="font-weight:400;">Trades</th><th style="font-weight:400;">P&amp;L</th>' +
       '<th style="font-weight:400;">A mano</th><th style="font-weight:400;">Bien</th><th style="font-weight:400;">Mixto</th><th style="font-weight:400;">Pronto</th><th style="font-weight:400;">Correcto</th><th style="font-weight:400;">TP1 no aseg.</th><th style="font-weight:400;">SL desprot.</th><th style="font-weight:400;">BE antes TP1</th></tr></thead><tbody>';
  DA_ESTRATEGIAS.forEach(function(e) {
    var g = todas.filter(function(r) { return (r.estrategia || null) === e; });
    if (!g.length) return;
    var gp = 0, gc = 0;
    g.forEach(function(r) { var t = porFp[r.fp]; if (t && t.beneficio != null) { gp += parseFloat(t.beneficio); gc++; } });
    var gm = _daAnalizadas(g).filter(function(r) { return r.decision_cierre_manual !== 'na'; });
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
  return _daConclusionesTodas(filas, porFp).filter(function(x) { return x.dinero > 0; })
            .sort(function(a, b) { return b.dinero - a.dinero; }).slice(0, 4);
}

// Todas las conclusiones, sin filtrar ni cortar (Mi proceso, "Tu situación":
// aciertos, errores y regla de la semana). Cada una lleva además:
//   tipo   'acierto' | 'error'
//   clave  qué comparación es ('seguidas', 'vueltas', 'nivel:<regla>:<nivel>:<valor>',
//          'be_antes_tp1', 'tp1_no_asegurado', 'runners', 'dejar_correr')
//   corta  texto corto con el coste o la ganancia
//   regla  (solo errores) la regla en imperativo
function _daConclusionesTodas(filas, porFp) {
  var G = DA_MIN_GRUPO_CONVIENE, out = [];
  var suma = function(a, f) { return a.reduce(function(s, r) { return s + f(r); }, 0); };
  var ben = function(r) { var t = porFp[r.fp]; return t && t.beneficio != null ? parseFloat(t.beneficio) : null; };
  var tr = function(n) { return ' (' + n + ' trade' + (n === 1 ? '' : 's') + ')'; };

  // 1. Esperar 15 min frente a entrar seguido
  var seg = _daResumenGrupo(filas.filter(function(r) { return r._seguida; }), porFp);
  var esp = _daResumenGrupo(filas.filter(function(r) { return r._gapMin != null && !r._seguida; }), porFp);
  if (seg && esp && seg.n >= G && esp.n >= G) {
    var d = esp.medio - seg.medio;
    out.push({ dinero: Math.abs(d) * seg.n, clave: 'seguidas', tipo: d > 0 ? 'error' : 'acierto',
      corta: d > 0 ? 'Entrar seguido (< ' + DA_MINUTOS_SECUENCIA + ' min): ' + seg.n + ' veces, ~' + _daNum(d * seg.n, 0) + ' $ menos que esperando'
                   : 'Entrar seguido no te cuesta: ' + _daFmtD(seg.medio) + '/trade frente a ' + _daFmtD(esp.medio) + ' esperando',
      regla: 'Espera al menos ' + DA_MINUTOS_SECUENCIA + ' min tras cerrar un trade antes de abrir otro.',
      frase: d > 0
      ? 'Espera al menos ' + DA_MINUTOS_SECUENCIA + ' min tras cerrar: entrando seguido sacas ' + _daFmtD(seg.medio) + ' por trade y esperando ' +
        _daFmtD(esp.medio) + '; en tus ' + seg.n + ' entradas seguidas son unos ' + _daNum(d * seg.n, 0) + ' $ de diferencia' + tr(seg.n + esp.n) + '.'
      : 'Entrar seguido no te está costando: ' + _daFmtD(seg.medio) + ' por trade frente a ' + _daFmtD(esp.medio) + ' esperando ' +
        DA_MINUTOS_SECUENCIA + ' min' + tr(seg.n + esp.n) + '.' });
  }

  // 2. Vueltas de posición
  var vu = _daVueltasDinero(filas, porFp);
  if (vu.n >= G) {
    var dv = vu.mant - vu.real;
    out.push({ dinero: Math.abs(dv), clave: 'vueltas', tipo: dv > 0 ? 'error' : 'acierto',
      corta: dv > 0 ? 'Vueltas de posición: ' + vu.n + ', ' + _daNum(dv, 0) + ' $ menos que manteniendo el primero'
                    : 'Darle la vuelta: ' + vu.n + ' veces, ' + _daNum(-dv, 0) + ' $ más que manteniendo',
      regla: 'No le des la vuelta a una posición: si cierras, espera.',
      frase: dv > 0
      ? 'No le des la vuelta: en ' + vu.n + ' vueltas sacaste ' + _daFmtD(vu.real) + ' con los dos trades; manteniendo el primero hasta su SL o TP habrías sacado ' +
        _daFmtD(vu.mant) + ', ' + _daNum(dv, 0) + ' $ más' + tr(vu.n * 2) + '.'
      : 'Darle la vuelta te ha salido bien: ' + vu.n + ' vueltas, ' + _daFmtD(vu.real) + ' frente a ' + _daFmtD(vu.mant) + ' manteniendo el primero' + tr(vu.n * 2) + '.' });
  }

  // 3. Seguir operando después de alcanzar un nivel de Mis reglas (avisos)
  _daResumenNiveles(filas, porFp).forEach(function(x) {
    var n = x.sirvio.n + x.error.n + x.neutro;
    if (n < G) return;
    var tot = x.sirvio.usd + x.error.usd, pts = x.sirvio.pts + x.error.pts;
    var reparto = ' (te sirvió ' + x.sirvio.n + (x.sirvio.n === 1 ? ' vez, ' : ' veces, ') + _daFmtD(x.sirvio.usd) +
                  '; error ' + x.error.n + (x.error.n === 1 ? ' vez, ' : ' veces, ') + _daFmtD(x.error.usd) + ')';
    out.push({ dinero: Math.abs(tot), clave: 'nivel:' + x.nivel.regla + ':' + x.nivel.nivel + ':' + x.nivel.valor, nivel: x.nivel, tipo: tot < 0 ? 'error' : 'acierto',
      corta: (tot < 0 ? 'Seguir tras ' : 'Seguir tras ') + _daTxtNivel(x.nivel) + ': ' + n + ' veces, ' + _daFmtD(tot),
      regla: 'Al llegar a ' + _daTxtNivel(x.nivel) + ', para.',
      frase: tot < 0
      ? 'Al llegar a ' + _daTxtNivel(x.nivel) + ', para: seguiste ' + n + ' veces y los trades de después sumaron ' + _daFmtD(tot) +
        ' (' + _daFmtPts(pts) + ')' + reparto + tr(x.trades) + '.'
      : 'Seguir después de ' + _daTxtNivel(x.nivel) + ' te ha salido bien: ' + n + ' veces, ' + _daFmtD(tot) + ' (' + _daFmtPts(pts) + ')' + reparto + tr(x.trades) + '.' });
  });

  // 4. BE antes de TP1
  var evBe = filas.filter(function(r) { return r.be_antes_tp1 != null; });
  var be = evBe.filter(function(r) { return r.be_antes_tp1; });
  if (evBe.length >= G && be.length) {
    var perdidos = be.filter(function(r) {
      return r.tipo_cierre_detallado === 'sl_breakeven' && r.favor_post_puntos != null && r.tp1_pts != null &&
             parseFloat(r.favor_post_puntos) >= parseFloat(r.tp1_pts) && parseFloat(r.volumen) > 0;
    });
    var dTp1 = suma(perdidos, function(r) { return parseFloat(r.tp1_pts) * VALOR_PUNTO_XAUUSD * parseFloat(r.volumen); });
    out.push({ dinero: dTp1, clave: 'be_antes_tp1', tipo: 'error',
      corta: 'BE antes de TP1: ' + be.length + ' de ' + evBe.length + (perdidos.length ? ', ~' + _daNum(dTp1, 0) + ' $ que llegaban a TP1' : ''),
      regla: 'No muevas a BE antes de TP1.',
      frase: 'No muevas a BE antes de TP1: lo hiciste en ' + be.length + ' de ' + evBe.length + ' trades' +
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
    out.push({ dinero: Math.abs(aTp1 - realNa), clave: 'tp1_no_asegurado', tipo: 'error',
      corta: 'TP1 no asegurado: ' + na.length + ' de ' + alc.length + ', ~' + _daNum(Math.abs(aTp1 - realNa), 0) + ' $',
      regla: 'Asegura al llegar a TP1 (parcial o SL a la entrada).',
      frase: 'Asegura al llegar a TP1: ' + na.length + ' de ' + alc.length +
      ' veces llegaste a +TP1 y volvió a la entrada sin parcial ni BE; cerrando en TP1 habrías hecho ' + _daFmtD(aTp1) +
      ' en vez de ' + _daFmtD(realNa) + tr(alc.length) + '.' });
  }

  // 6. Runners
  var rs = _daRunnersResumen(filas);
  if (rs.conUsd.length >= G) {
    var dr = rs.usd - rs.todo;
    out.push({ dinero: Math.abs(dr), clave: 'runners', tipo: dr >= 0 ? 'acierto' : 'error',
      corta: dr >= 0 ? 'Dejar runners: ' + rs.conUsd.length + ', ' + _daNum(dr, 0) + ' $ más que cerrar en la parcial'
                     : 'Runners: ' + rs.conUsd.length + ', ' + _daNum(-dr, 0) + ' $ menos que cerrar en la parcial',
      regla: 'Cierra todo en la parcial: de momento el runner te resta.',
      frase: dr >= 0
      ? 'Dejar runners te compensa: ' + rs.conUsd.length + ' runners aportaron ' + _daFmtD(rs.usd) + ' frente a ' + _daFmtD(rs.todo) +
        ' cerrando todo en la parcial, ' + _daNum(dr, 0) + ' $ más' + tr(rs.conUsd.length) + '.'
      : 'Los runners te están costando: ' + rs.conUsd.length + ' runners aportaron ' + _daFmtD(rs.usd) + '; cerrando todo en la parcial habrías hecho ' +
        _daFmtD(rs.todo) + ', ' + _daNum(-dr, 0) + ' $ más' + tr(rs.conUsd.length) + '.' });
  }

  // 7. Dejar correr los cierres a mano hasta su TP/SL (v8). Solo resueltos y con $.
  var dc = filas.filter(function(r) {
    return r.dejar_correr === true && ['tp', 'sl', 'ninguno'].indexOf(r.dejar_correr_resultado) !== -1 &&
           r.dejar_correr_usd_extra != null && ben(r) != null;
  });
  if (dc.length >= G) {
    var dcExtra = suma(dc, function(r) { return parseFloat(r.dejar_correr_usd_extra); });
    var dcReal = suma(dc, ben);
    var dcN = function(k) { return dc.filter(function(r) { return r.dejar_correr_resultado === k; }).length; };
    var reparto = dcN('tp') + ' llegaban a su TP, ' + dcN('sl') + ' a su SL y ' + dcN('ninguno') + ' a ninguno en 5 días de mercado';
    out.push({ dinero: Math.abs(dcExtra), clave: 'dejar_correr', tipo: dcExtra > 0 ? 'error' : 'acierto',
      corta: dcExtra > 0 ? 'Cerrar a mano antes de tiempo: ' + dc.length + ', ' + _daNum(dcExtra, 0) + ' $ menos que dejándolas correr'
                         : 'Cerrar a mano: ' + dc.length + ' veces, te ahorró ' + _daNum(-dcExtra, 0) + ' $',
      regla: 'Deja correr hasta tu SL o TP las que sueles cerrar a mano.',
      frase: dcExtra > 0
      ? 'Deja correr las que cierras a mano: de ' + dc.length + ' cierres a mano con SL, ' + reparto + '; dejándolas correr habrías hecho ' +
        _daFmtD(dcReal + dcExtra) + ' en vez de ' + _daFmtD(dcReal) + ', ' + _daNum(dcExtra, 0) + ' $ más' + tr(dc.length) + '.'
      : 'Cerrar a mano te compensa: de ' + dc.length + ' cierres a mano con SL, ' + reparto + '; dejándolas correr habrías hecho ' +
        _daFmtD(dcReal + dcExtra) + ' en vez de ' + _daFmtD(dcReal) + ', ' + _daNum(-dcExtra, 0) + ' $ menos' + tr(dc.length) + '.' });
  }

  return out;
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

// Resumen de un día (filas de ese día, cualquier orden). Los niveles de Mis
// reglas se miden por cuenta (ver _daNivelesDia).
function _daResumenDia(filasDia, porFp) {
  var lista = filasDia.slice().sort(function(a, b) { return _daFecha(a.fecha_cierre) - _daFecha(b.fecha_cierre); });
  var res = { lista: lista, pnl: 0, conPnl: 0, gan: 0, vueltas: 0, niveles: _daNivelesDia(lista, porFp) };
  lista.forEach(function(r) {
    if (r._vueltaA) res.vueltas++;
    var t = porFp[r.fp];
    if (!t || t.beneficio == null) return;
    var b = parseFloat(t.beneficio);
    res.pnl += b; res.conPnl++; if (b > 0) res.gan++;
  });
  res.perdida = res.niveles.filter(function(x) { return x.nivel.regla !== 'beneficio_dia'; });
  res.beneficio = res.niveles.filter(function(x) { return x.nivel.regla === 'beneficio_dia'; });
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
      // Intensidad: proporcional al importe, saturada en DA_ESCALA_COLOR_DIA.
      var a = 0.1 + 0.5 * Math.min(1, Math.abs(rd.pnl) / DA_ESCALA_COLOR_DIA);
      estilo = 'background:linear-gradient(' + (rd.pnl >= 0 ? 'rgba(58,170,106,' : 'rgba(204,68,51,') + a.toFixed(2) + '),' +
               (rd.pnl >= 0 ? 'rgba(58,170,106,' : 'rgba(204,68,51,') + a.toFixed(2) + ')),var(--bg2);';
    }
    if (rd && rd.perdida.length) sombras.push('inset 0 3px 0 #CC4433');
    else if (rd && rd.beneficio.length) sombras.push('inset 0 3px 0 #3AAA6A');
    if (_daDia === k) sombras.push('inset 0 0 0 2px var(--gold)');
    if (sombras.length) estilo += 'box-shadow:' + sombras.join(',') + ';';
    var marcas = '';
    if (rd && rd.perdida.length) marcas += '<span class="da-cal-largo" title="' + _daEsc(_daTituloNiveles(rd.perdida)) + '" style="color:#FF6B5A;font-size:10px;font-weight:600;">LÍM</span>';
    if (rd && rd.beneficio.length) marcas += '<span class="da-cal-largo" title="' + _daEsc(_daTituloNiveles(rd.beneficio)) + '" style="color:#7FD6A0;font-size:10px;font-weight:600;">▲' + rd.beneficio.length + '</span>';
    if (rd && rd.niveles.some(function(x) { return _daVeredictoNivel(x) === 'error'; })) {
      marcas += '<span title="Seguiste después de un nivel y los trades de después sumaron negativo" style="color:#FF6B5A;font-size:10px;font-weight:600;">!</span>';
    }
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
         '<span>Color: P&amp;L del día (más intenso cuanto mayor, tope ' + _daNum(DA_ESCALA_COLOR_DIA, 0) + ' $)</span>' +
         (_daHayReglas()
           ? '<span><span style="color:#FF6B5A;font-weight:600;">LÍM</span> / barra roja: llegaste a un nivel de pérdida · ' +
             '<span style="color:#7FD6A0;font-weight:600;">▲</span> / barra verde: a un nivel de beneficio · ' +
             '<span style="color:#FF6B5A;font-weight:600;">!</span> seguiste y fue error (avisos de Mis reglas, por cuenta)</span>'
           : '<span>Sin niveles de pérdida ni de beneficio: ' + _daEnlaceReglas('ponlos en Mis reglas') + '</span>') +
         '<span><span style="color:' + DA_NARANJA + ';font-weight:600;">↺</span> ' + DA_VUELTAS_AVISO + ' o más vueltas</span>' +
       '</div>';

  h += _daHtmlResumenMes(res);
  var filasMes = [];
  Object.keys(porDia).forEach(function(k) { filasMes = filasMes.concat(porDia[k]); });
  if (filasMes.length) h += '<div style="margin-top:1px;">' + _daHtmlConviene(_daAnalizadas(filasMes), 'este mes') + _daHtmlNiveles(filasMes, 'este mes') + '</div>';
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
  var rotos = Object.keys(res).filter(function(k) { return res[k].perdida.length; }).length;
  var conVueltas = Object.keys(res).filter(function(k) { return res[k].vueltas >= DA_VUELTAS_AVISO; }).length;
  return '<div class="da-rejilla" style="--da-base:max(140px, calc(16.666% - 1px));margin-top:.8rem;">' +
    _daStat('P&amp;L del mes', dias.length ? _daFmtD(pnl) : '—', nTrades + ' trades', pnl >= 0 ? 'green' : 'red') +
    _daStat('Días verdes', verdes, 'de ' + dias.length + ' con trades', 'green') +
    _daStat('Días rojos', rojos, 'de ' + dias.length + ' con trades', 'red') +
    _daStat('Mejor día', mejor && mejor.r.pnl > 0 ? _daFmtD(mejor.r.pnl) : '—', mejor && mejor.r.pnl > 0 ? fecha(mejor.k) : 'sin días verdes', 'green') +
    _daStat('Peor día', peor && peor.r.pnl < 0 ? _daFmtD(peor.r.pnl) : '—', peor && peor.r.pnl < 0 ? fecha(peor.k) : 'sin días rojos', 'red') +
    _daStat('Nivel de pérdida', rotos, (rotos === 1 ? 'día' : 'días') + (conVueltas ? ' · ' + conVueltas + ' con ' + DA_VUELTAS_AVISO + '+ vueltas' : ''), rotos ? 'red' : 'white') +
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
  if (typeof _moHtmlPlanRealidad === 'function') h += _moHtmlPlanRealidad(rd.lista);
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

  // 2. Errores de regla
  var tipos = [['TP1 no asegurado', 'tp1_no_asegurado'], ['SL desprotegido', 'sl_desprotegido'], ['BE antes de TP1', 'be_antes_tp1']];
  var conErr = rd.lista.filter(function(r) { return r.tp1_no_asegurado || r.sl_desprotegido || r.be_antes_tp1; }).length;
  var det = tipos.map(function(t) {
    var k = rd.lista.filter(function(r) { return r[t[1]]; }).length;
    return k ? t[0] + (k > 1 ? ' ×' + k : '') : null;
  }).filter(Boolean);
  var f2 = conErr ? plural(conErr, 'trade', 'trades') + ' con error de regla (' + det.join(', ') + ')' : 'Sin errores de regla';
  // Los errores de regla salen del análisis: los pendientes aún no se han mirado.
  var pend = rd.lista.filter(_daPendiente).length;
  if (pend === n) f2 = 'Errores de regla: todavía sin analizar';
  else if (pend) f2 += ' en los analizados (' + plural(pend, 'trade pendiente', 'trades pendientes') + ' de análisis)';
  frases.push(f2 + '.');

  // 2b. Niveles de Mis reglas alcanzados (avisos), en orden de hora
  rd.niveles.forEach(function(x) { frases.push(_daFraseNivel(x, _daCuenta === 'global')); });

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

// ── Mis reglas en el Diario (fase 2) ───────────────────────────────────────
// Niveles de reglas_efectivas (mis-reglas.js / sql_mis_reglas.sql). Todos son
// AVISOS: Aurum no cierra el día ni bloquea nada; el Diario muestra cuándo se
// llegó a cada nivel, si se siguió operando y qué pasó después.
// Por cuenta y día de servidor (día del cierre, como el calendario), con el
// P&L realizado en orden de cierre (beneficio de trades por fp):
//   perdida_trade  un trade pierde >= valor
//   perdida_dia    el acumulado del día llega a -valor
//   beneficio_dia  el acumulado del día llega a +valor
// Se llega al nivel en el cierre del trade que lo cruza. "Después" = trades de
// esa cuenta abiertos a partir de ese momento y cerrados ese mismo día.
// Veredicto si se siguió: "te sirvió" si los de después suman > 0, "error" si
// suman < 0 (en $; los pts = beneficio / (100 × lotes) de cada trade, sumados).

var DA_REGLA_ORDEN = { perdida_trade: 0, perdida_dia: 1, beneficio_dia: 2 };

// Carpeta de una cuenta ('maestra' / 'prueba' / 'retos'); las que no tienen
// carpeta (historial) usan las reglas de 'todas'.
function _daCarpetaDe(num) {
  var u = window.usuarioActual || {}, n = String(num);
  if (u.cuenta_maestra && String(u.cuenta_maestra) === n) return 'maestra';
  if (u.cuenta_prueba  && String(u.cuenta_prueba)  === n) return 'prueba';
  if (u.cuenta_retos   && String(u.cuenta_retos)   === n) return 'retos';
  return 'todas';
}

function _daReglasDe(num) { return (_daReglas && _daReglas[_daCarpetaDe(num)]) || []; }

function _daHayReglas() {
  return !!_daReglas && Object.keys(_daReglas).some(function(k) { return _daReglas[k].length; });
}

function _daEnlaceReglas(txt) {
  return '<span style="color:var(--gold);cursor:pointer;" onclick="gestTab(\'reglas\');if(typeof buildMisReglas===\'function\')buildMisReglas();">' + txt + '</span>';
}

function _daFmtPts(v) { return (v >= 0 ? '+' : '−') + _daNum(Math.abs(v), 1) + ' pts'; }

// "−800 $ «Límite»", "−500 $ en un trade", "+250 $ «Día bueno»"
function _daTxtNivel(n) {
  return (n.regla === 'beneficio_dia' ? '+' : '−') + _daNum(n.valor, 0) + ' $' +
         (n.regla === 'perdida_trade' ? ' en un trade' : '') + (n.nombre ? ' «' + n.nombre + '»' : '');
}

function _daBenef(r, porFp) {
  var t = porFp[r.fp];
  return t && t.beneficio != null ? parseFloat(t.beneficio) : null;
}

function _daPtsTrade(r, porFp) {
  var b = _daBenef(r, porFp), v = parseFloat(r.volumen);
  return b != null && v > 0 ? b / (VALOR_PUNTO_XAUUSD * v) : _daPtsReales(r);
}

// Niveles alcanzados en un día (filas de ese día de cualquier cuenta).
// Devuelve [{ nivel, cuenta, r (trade que lo cruza), acum, en (ms), tras: [...], usd, pts }] por hora.
function _daNivelesDia(filasDia, porFp) {
  var porCuenta = {}, out = [];
  filasDia.forEach(function(r) { (porCuenta[r.cuenta_numero] = porCuenta[r.cuenta_numero] || []).push(r); });
  Object.keys(porCuenta).forEach(function(c) {
    var niveles = _daReglasDe(c);
    if (!niveles.length) return;
    var lista = porCuenta[c].slice().sort(function(a, b) { return _daFecha(a.fecha_cierre) - _daFecha(b.fecha_cierre); });
    var hechos = {}, acum = 0;
    lista.forEach(function(r) {
      var b = _daBenef(r, porFp);
      if (b == null) return;
      acum += b;
      niveles.forEach(function(n) {
        var k = n.regla + ':' + n.nivel;
        if (hechos[k]) return;
        var llega = n.regla === 'perdida_trade' ? b <= -n.valor
                  : n.regla === 'perdida_dia'   ? acum <= -n.valor
                  : acum >= n.valor;
        if (!llega) return;
        var en = _daFecha(r.fecha_cierre).getTime();
        var tras = lista.filter(function(x) { return x !== r && _daFecha(x.fecha_entrada).getTime() >= en; });
        var conB = tras.filter(function(x) { return _daBenef(x, porFp) != null; });
        hechos[k] = { nivel: n, cuenta: c, r: r, acum: acum, en: en, tras: tras,
                      usd: conB.reduce(function(s, x) { return s + _daBenef(x, porFp); }, 0),
                      pts: conB.reduce(function(s, x) { return s + _daPtsTrade(x, porFp); }, 0) };
        out.push(hechos[k]);
      });
    });
  });
  return out.sort(function(a, b) {
    return a.en - b.en || DA_REGLA_ORDEN[a.nivel.regla] - DA_REGLA_ORDEN[b.nivel.regla] || a.nivel.nivel - b.nivel.nivel;
  });
}

// null = no siguió operando; 'sirvio' / 'error' / 'neutro' (suma 0 o sin P&L)
function _daVeredictoNivel(h) {
  if (!h.tras.length) return null;
  return h.usd > 0 ? 'sirvio' : h.usd < 0 ? 'error' : 'neutro';
}

// Frase del día: "Llegaste a +250 $ «Día bueno» a las 14:05 y seguiste: 3 trades,
// devolviste 180 $ (−6,3 pts) → error."
function _daFraseNivel(h, conCuenta) {
  var hora = _daHora(h.r.fecha_cierre).slice(-5), n = h.nivel, ben = n.regla === 'beneficio_dia';
  var ini = n.regla === 'perdida_trade'
    ? 'Un trade perdió ' + _daNum(-_daBenef(h.r, _daTradesPorFp()), 0) + ' $ a las ' + hora + ' (tu aviso: ' + _daTxtNivel(n) + ')'
    : 'Llegaste a ' + _daTxtNivel(n) + ' a las ' + hora + (n.regla === 'perdida_dia' ? ' (acumulado ' + _daFmtD(h.acum) + ')' : '');
  if (conCuenta) ini += ' en ' + _daNombreCuenta(h.cuenta);
  if (n.plan) ini += ' (tu plan: «' + n.plan + '»)';
  var v = _daVeredictoNivel(h);
  if (!v) return ini + ' y paraste ahí.';
  var k = h.tras.length, cuanto;
  if (v === 'neutro') cuanto = 'quedaste igual';
  else if (ben) cuanto = h.usd < 0 ? 'devolviste ' + _daNum(-h.usd, 0) + ' $' : 'ganaste ' + _daNum(h.usd, 0) + ' $ más';
  else cuanto = h.usd < 0 ? 'perdiste ' + _daNum(-h.usd, 0) + ' $ más' : 'recuperaste ' + _daNum(h.usd, 0) + ' $';
  return ini + ' y seguiste: ' + k + (k === 1 ? ' trade, ' : ' trades, ') + cuanto + ' (' + _daFmtPts(h.pts) + ')' +
         (v === 'sirvio' ? ' → te sirvió.' : v === 'error' ? ' → error.' : '.');
}

function _daTituloNiveles(lista) {
  return lista.map(function(h) {
    var v = _daVeredictoNivel(h);
    return _daTxtNivel(h.nivel) + (v === 'error' ? ': seguiste y fue error' : v === 'sirvio' ? ': seguiste y te sirvió' : v ? ': seguiste' : ': paraste');
  }).join(' · ');
}

// Marca en cada trade los niveles alcanzados antes de abrirlo (r._trasNiveles),
// con todos los trades cargados, por cuenta y día del cierre.
function _daMarcarNiveles(filas, porFp) {
  var dias = {};
  (filas || []).forEach(function(r) {
    r._trasNiveles = [];
    var k = r.cuenta_numero + '|' + _daDiaMs(r.fecha_cierre);
    (dias[k] = dias[k] || []).push(r);
  });
  Object.keys(dias).forEach(function(k) {
    _daNivelesDia(dias[k], porFp).forEach(function(h) {
      h.tras.forEach(function(r) { r._trasNiveles.push(h); });
    });
  });
}

// Insignia (aviso, no error: no cuenta para "Solo con errores"): el último
// nivel de pérdida y el último de beneficio alcanzados antes de abrir el trade.
function _daBadgesNivel(r) {
  if (!r._trasNiveles || !r._trasNiveles.length) return '';
  var ult = {};
  r._trasNiveles.forEach(function(h) { ult[h.nivel.regla === 'beneficio_dia' ? 'b' : 'p'] = h; });
  return ['p', 'b'].filter(function(k) { return ult[k]; }).map(function(k) {
    var h = ult[k], col = k === 'p' ? '#FF8A7A' : '#7FD6A0';
    return '<span title="Abierto después de llegar a ' + _daEsc(_daTxtNivel(h.nivel)) + ' ese día" style="font-size:11px;color:' + col +
           ';border:1px dashed ' + col + '88;padding:.12rem .45rem;white-space:nowrap;">Tras ' +
           _daEsc(h.nivel.nombre ? '«' + h.nivel.nombre + '»' : _daTxtNivel(h.nivel)) + '</span>';
  }).join('');
}

// Resumen por nivel de un periodo: días que se alcanzó, días que se siguió y
// veredictos con su total. Un mismo nivel con importes distintos en cada
// carpeta (p. ej. Prueba −600, resto −800) sale en filas separadas.
function _daResumenNiveles(filas, porFp) {
  var dias = {}, grupos = {};
  filas.forEach(function(r) {
    var k = r.cuenta_numero + '|' + _daDiaMs(r.fecha_cierre);
    (dias[k] = dias[k] || []).push(r);
  });
  Object.keys(dias).forEach(function(k) {
    _daNivelesDia(dias[k], porFp).forEach(function(h) {
      var n = h.nivel, g = n.regla + '|' + n.nivel + '|' + n.valor + '|' + (n.nombre || '');
      var x = grupos[g] = grupos[g] || { nivel: n, dias: 0, siguio: 0, trades: 0, neutro: 0,
                                         sirvio: { n: 0, usd: 0, pts: 0 }, error: { n: 0, usd: 0, pts: 0 } };
      x.dias++;
      var v = _daVeredictoNivel(h);
      if (!v) return;
      x.siguio++; x.trades += h.tras.length;
      if (v === 'neutro') { x.neutro++; return; }
      x[v].n++; x[v].usd += h.usd; x[v].pts += h.pts;
    });
  });
  return Object.keys(grupos).map(function(k) { return grupos[k]; }).sort(function(a, b) {
    return DA_REGLA_ORDEN[a.nivel.regla] - DA_REGLA_ORDEN[b.nivel.regla] || a.nivel.nivel - b.nivel.nivel || a.nivel.valor - b.nivel.valor;
  });
}

function _daHtmlNiveles(filas, nombrePeriodo) {
  var h = '<div class="cell" style="margin-bottom:1px;"><div class="tag" style="display:block;margin-bottom:.4rem;">Tus niveles · ' + nombrePeriodo + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:.9rem;">Avisos de Mis reglas, por cuenta y día: cuándo llegaste a cada nivel, si seguiste operando y qué pasó después.</div>';
  if (!_daHayReglas()) {
    return h + '<div style="font-size:14px;color:var(--text-muted);">No tienes niveles configurados. ' + _daEnlaceReglas('Ponlos en Mis reglas →') + '</div></div>';
  }
  var res = _daResumenNiveles(filas, _daTradesPorFp());
  if (!res.length) {
    return h + '<div style="font-size:14px;color:var(--text-muted);">No llegaste a ningún nivel ' + (nombrePeriodo === 'todo el histórico' ? 'en todo el histórico' : nombrePeriodo) + '.</div></div>';
  }
  var celda = function(g, color) {
    if (!g.n) return '<td style="color:var(--text-muted);">—</td>';
    return '<td style="color:' + color + ';white-space:nowrap;">' + g.n + ' · ' + _daFmtD(g.usd) +
           ' <span style="color:var(--text-muted);font-size:12px;">(' + _daFmtPts(g.pts) + ')</span></td>';
  };
  h += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:560px;">' +
       '<thead><tr style="color:var(--text-muted);text-align:right;">' +
       '<th style="text-align:left;font-weight:400;padding:.3rem 0;">Nivel</th><th style="font-weight:400;">Días</th>' +
       '<th style="font-weight:400;">Seguiste</th><th style="font-weight:400;">Te sirvió</th><th style="font-weight:400;">Error</th></tr></thead><tbody>';
  res.forEach(function(x) {
    var color = x.nivel.regla === 'beneficio_dia' ? '#7FD6A0' : '#FF8A7A';
    h += '<tr style="border-top:1px solid var(--border);text-align:right;color:var(--text-dim);">' +
         '<td style="text-align:left;padding:.45rem 0;"><span style="color:' + color + ';">' + _daEsc(_daTxtNivel(x.nivel)) + '</span></td>' +
         '<td>' + x.dias + '</td><td>' + x.siguio + (x.neutro ? ' <span style="color:var(--text-muted);font-size:12px;">(' + x.neutro + ' igual)</span>' : '') + '</td>' +
         celda(x.sirvio, 'var(--green)') + celda(x.error, 'var(--red)') + '</tr>';
  });
  return h + '</tbody></table></div>' +
         '<div style="font-size:12px;color:var(--text-muted);margin-top:.5rem;">Te sirvió / error: los trades que abriste después de llegar al nivel ese día sumaron positivo / negativo. ' +
         'Trades de la EA, también los que aún no tienen análisis.</div></div>';
}

// ── Hoy: P&L del día y qué toca según Mis reglas (plan del trader) ──────────
// Por cuenta con trades cerrados hoy (también los que aún no tienen análisis):
// P&L, último nivel de pérdida y de beneficio alcanzado con el plan que el
// trader escribió en Mis reglas y lo que ha hecho después, y el siguiente nivel
// de cada lado. Siempre es un aviso: no bloquea nada.
// "Hoy" = fecha del navegador. Las horas del Diario son de servidor MT5, que en
// los brókers europeos va con la hora de España ±1 h: cerca de medianoche el
// día puede no coincidir (el calendario sigue siendo la referencia).

function _daHoyMs() {
  var d = new Date();
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

// Siguiente nivel de un lado ('beneficio' | 'perdida') aún no alcanzado hoy.
function _daSiguienteNivel(niveles, alcanzados, lado) {
  var hechos = {};
  alcanzados.forEach(function(h) { hechos[h.nivel.regla + ':' + h.nivel.nivel] = true; });
  return niveles.filter(function(n) {
    return (lado === 'beneficio' ? n.regla === 'beneficio_dia' : n.regla === 'perdida_dia') && !hechos[n.regla + ':' + n.nivel];
  }).sort(function(a, b) { return a.valor - b.valor; })[0] || null;
}

function _daHtmlHoyNivel(h) {
  var n = h.nivel, ben = n.regla === 'beneficio_dia', col = ben ? '#7FD6A0' : '#FF8A7A';
  var hora = _daHora(h.r.fecha_cierre).slice(-5);
  var titulo = n.regla === 'perdida_trade'
    ? 'Un trade perdió ' + _daNum(-_daBenef(h.r, _daTradesPorFp()), 0) + ' $ a las ' + hora + ' (aviso: ' + _daTxtNivel(n) + ')'
    : (n.nombre ? n.nombre + ' alcanzado' : 'Nivel alcanzado') + ' a las ' + hora + ': ' + _daTxtNivel(n);
  var tras = h.tras.length
    ? 'Después has abierto ' + h.tras.length + (h.tras.length === 1 ? ' trade' : ' trades') +
      (h.tras.some(function(x) { return _daBenef(x, _daTradesPorFp()) != null; }) ? ': ' + _daFmtD(h.usd) : '') + '.'
    : 'No has abierto más trades desde entonces.';
  return '<div style="margin-top:.7rem;">' +
           '<div style="font-size:14px;color:' + col + ';">' + (ben ? '▲ ' : 'LÍM · ') + _daEsc(titulo) + '</div>' +
           '<div style="font-size:15px;color:var(--text);margin-top:.25rem;">' +
             (n.plan ? 'Tu plan dice: <span style="color:var(--gold-bright);">«' + _daEsc(n.plan) + '»</span>'
                     : '<span style="color:var(--text-muted);font-size:13px;">No tienes plan escrito para este nivel: ' + _daEnlaceReglas('escríbelo en Mis reglas') + '.</span>') +
           '</div>' +
           '<div style="font-size:12px;color:var(--text-muted);margin-top:.2rem;">' + _daEsc(tras) + '</div>' +
         '</div>';
}

function _daHtmlHoy(filas) {
  var hoy = _daHoyMs(), porFp = _daTradesPorFp();
  var porCuenta = {};
  filas.forEach(function(r) {
    if (_daDiaMs(r.fecha_cierre) === hoy) (porCuenta[r.cuenta_numero] = porCuenta[r.cuenta_numero] || []).push(r);
  });
  var cuentas = Object.keys(porCuenta).sort(function(a, b) { return _daNombreCuenta(a).localeCompare(_daNombreCuenta(b)); });
  var fecha = new Date(hoy).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  // Plan del día (modos.js): se ve siempre, también antes del primer trade.
  var plan = typeof _moHtmlPlanHoy === 'function' ? _moHtmlPlanHoy() : '';
  if (!cuentas.length) {
    return plan ? '<div class="tag" style="display:block;margin-bottom:.8rem;">Hoy · ' + _daEsc(fecha) + '</div>' +
                  '<div style="margin-bottom:2rem;">' + plan + '</div>' : '';
  }

  var h = '<div class="tag" style="display:block;margin-bottom:.8rem;">Hoy · ' + _daEsc(fecha) + '</div>' + plan +
          '<div style="display:flex;flex-direction:column;gap:1px;background:var(--border);border:1px solid var(--border);margin-bottom:.5rem;">';
  cuentas.forEach(function(c) {
    var lista = porCuenta[c], pnl = 0, conPnl = 0;
    lista.forEach(function(r) { var b = _daBenef(r, porFp); if (b != null) { pnl += b; conPnl++; } });
    var pend = lista.filter(_daPendiente).length;
    var niveles = _daReglasDe(c), alc = _daNivelesDia(lista, porFp);
    var ultP = alc.filter(function(x) { return x.nivel.regla !== 'beneficio_dia'; }).pop();
    var ultB = alc.filter(function(x) { return x.nivel.regla === 'beneficio_dia'; }).pop();
    var ultimo = alc[alc.length - 1];
    var borde = !ultimo ? 'var(--gold-dim)' : ultimo.nivel.regla === 'beneficio_dia' ? '#3AAA6A' : '#CC4433';

    h += '<div style="background:var(--bg2);padding:1rem 1.2rem;box-shadow:inset 3px 0 0 ' + borde + ';">' +
           '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:.4rem 1rem;">' +
             '<span style="font-size:14px;color:var(--text-dim);">' + _daEsc(_daNombreCuenta(c)) + '</span>' +
             '<span style="font-size:14px;color:var(--text-muted);">' + lista.length + (lista.length === 1 ? ' trade' : ' trades') +
               (pend ? ' · ' + pend + ' sin analizar' : '') +
               ' · <span style="font-size:18px;font-weight:600;color:' + (!conPnl ? 'var(--text-muted)' : pnl >= 0 ? '#7FD6A0' : '#FF8A7A') + ';">' +
               (conPnl ? _daFmtD(pnl) : '—') + '</span></span>' +
           '</div>';
    if (!niveles.length) {
      h += '<div style="font-size:13px;color:var(--text-muted);margin-top:.5rem;">Sin niveles para esta cuenta: ' + _daEnlaceReglas('ponlos en Mis reglas') + '.</div></div>';
      return;
    }
    // Primero el que se alcanzó antes: así se lee en el orden en que pasó.
    [ultP, ultB].filter(Boolean).sort(function(a, b) { return a.en - b.en; }).forEach(function(x) { h += _daHtmlHoyNivel(x); });

    // Con un nivel de pérdida ya alcanzado no se enseña cuánto falta para el de
    // beneficio: sería una invitación a recuperar.
    var sigB = ultP ? null : _daSiguienteNivel(niveles, alc, 'beneficio'), sigP = _daSiguienteNivel(niveles, alc, 'perdida');
    var sig = [];
    if (sigB) sig.push('beneficio ' + _daTxtNivel(sigB) + (pnl < sigB.valor ? ' (faltan ' + _daNum(sigB.valor - pnl, 0) + ' $)' : ''));
    if (sigP) sig.push('pérdida ' + _daTxtNivel(sigP) + (pnl > -sigP.valor ? ' (te separan ' + _daNum(sigP.valor + pnl, 0) + ' $)' : ''));
    if (sig.length || !alc.length) {
      h += '<div style="font-size:12px;color:var(--text-muted);margin-top:.7rem;">' + (alc.length ? '' : 'Ningún nivel alcanzado todavía. ') +
           (sig.length ? _daEsc((sig.length === 1 ? 'Siguiente nivel: ' : 'Siguientes niveles: ') + sig.join(' · ')) : '') + '</div>';
    }
    h += '</div>';
  });
  h += '</div><div style="font-size:12px;color:var(--text-muted);margin-bottom:2rem;">Son avisos de Mis reglas: Aurum no cierra tu día ni bloquea nada. ' +
       'Los niveles y lo que haces al llegar a cada uno se cambian en ' + _daEnlaceReglas('Mis reglas') + '.</div>';
  return h;
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

// En lugar del veredicto, en los trades que post_cierre.py aún no ha analizado.
function _daBadgePendiente() {
  return '<span title="La EA ya lo envió; el análisis (gráfico y veredicto) llega con la tarea horaria" ' +
         'style="font-size:11px;color:var(--text-muted);border:1px dashed var(--border);padding:.12rem .45rem;white-space:nowrap;">Análisis pendiente</span>';
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

// Análisis hecho sin la ventana post-cierre completa (trade cerrado hace menos
// de DA_VENTANA_MIN min de mercado): la tarea programada lo recalcula cada hora
// hasta completarla, así que el veredicto aún puede cambiar.
function _daProvisional(r) { return r.ventana_completa === false; }

function _daMinVentana(r) {
  var v = parseInt(r.velas_post_disponibles, 10);
  return (isNaN(v) ? 0 : Math.min(v, DA_VENTANA_MIN)) + '/' + DA_VENTANA_MIN + ' min';
}

function _daBadgeProvisional(r) {
  if (!_daProvisional(r)) return '';
  return '<span title="Análisis provisional: se recalcula cada hora hasta completar las 4 h de mercado tras el cierre" ' +
         'style="font-size:11px;color:var(--gold);border:1px dashed var(--border-gold);padding:.12rem .45rem;white-space:nowrap;">Provisional · ' +
         _daMinVentana(r) + '</span>';
}

// Lo que no se pudo evaluar en este trade por falta de datos (no es un fallo
// del Diario): se explica en el detalle para que no parezca que falta análisis.
function _daHtmlNoEvaluado(r, eventos) {
  var l = [];
  if (!r.estrategia || r.estrategia === 'sin_clasificar') l.push('Sin estrategia: no se evalúan las reglas del TP1 (TP1 no asegurado y BE antes de TP1), que dependen de ella.');
  if (!eventos.length) l.push('La EA no registró eventos de este trade (las versiones antiguas no los enviaban): sin línea de tiempo ni detección de parciales y runner.');
  if (r.mfe_puntos == null && r.mae_puntos == null) l.push('Sin MFE/MAE durante el trade.');
  if (!l.length) return '';
  return '<div style="font-size:12px;color:var(--text-muted);line-height:1.6;margin:.8rem 0 0;padding:.6rem .8rem;border-left:2px solid var(--border);">' +
           '<div style="color:var(--text-dim);margin-bottom:.2rem;">No evaluado en este trade</div>' +
           l.map(function(x) { return '<div>· ' + _daEsc(x) + '</div>'; }).join('') +
         '</div>';
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
                           (!_daSoloErrores || _daErrores(r).length) &&
                           (typeof _moPasaFiltro !== 'function' || _moPasaFiltro(r)) &&
                           (typeof _caPasaFiltro !== 'function' || _caPasaFiltro(r)));
  }).sort(function(a, b) { return _daFecha(b.fecha_cierre) - _daFecha(a.fecha_cierre); });
  var porFp = _daTradesPorFp();

  var h = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.8rem;margin-bottom:.8rem;">' +
            '<div class="tag" style="display:block;">' + titulo + ' · ' + lista.length + '</div>' +
            (!conFiltros ? '' :
            '<div style="display:flex;flex-wrap:wrap;align-items:center;">' +
              '<span style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--text-muted);margin-right:.4rem;">Setup (EA)</span>' +
              _daChip('Todas', _daEstrategia === 'todas', "_daElegirEstrategia('todas')") +
              _daChip('rechazo_rsi', _daEstrategia === 'rechazo_rsi', "_daElegirEstrategia('rechazo_rsi')") +
              _daChip('estructura', _daEstrategia === 'estructura', "_daElegirEstrategia('estructura')") +
              _daChip('sin clasificar', _daEstrategia === 'sin_clasificar', "_daElegirEstrategia('sin_clasificar')") +
              '<span style="width:1px;background:var(--border);margin:0 .4rem;"></span>' +
              '<button class="tab' + (_daSoloErrores ? ' active' : '') + '" style="padding:.45rem .9rem;font-size:12px;' +
                (_daSoloErrores ? 'color:var(--red);border-bottom-color:var(--red);' : '') + '" ' +
                'onclick="_daSoloErrores=!_daSoloErrores;_daAbierto=null;_daPintar();">Solo con errores</button>' +
              (typeof _caHtmlFiltro === 'function' ? _caHtmlFiltro() : '') +
            '</div>' +
            (typeof _moHtmlFiltro === 'function' ? '<div style="flex-basis:100%;display:flex;justify-content:flex-end;">' + _moHtmlFiltro() + '</div>' : '')) + '</div>';
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
               ' <span style="color:var(--text-muted);font-size:12px;">· Setup: ' + _daEsc(r.estrategia || 'sin clasificar') + '</span></span>' +
             '<span style="display:flex;gap:.4rem 1rem;flex-wrap:wrap;justify-content:flex-end;align-items:center;margin-left:auto;">' +
               '<span style="display:flex;gap:.4rem;flex-wrap:wrap;justify-content:flex-end;">' +
                 (typeof _moBadge === 'function' ? _moBadge(r) : '') + (typeof _caBadge === 'function' ? _caBadge(r) : '') +
                 _daBadgesErrores(r) + _daBadgesNivel(r) +
                 (r.runner === true ? '<span style="font-size:11px;color:var(--gold);border:1px solid var(--border-gold);padding:.12rem .45rem;white-space:nowrap;">Runner: +' +
                                      _daNum(r.runner_max_pts, 1) + '</span>' : '') +
                 (_daPendiente(r) ? _daBadgePendiente() : _daBadgeDecision(r) + _daBadgeProvisional(r)) + '</span>' +
               '<span style="font-size:14px;min-width:70px;text-align:right;color:' + (ben == null ? 'var(--text-muted)' : ben >= 0 ? 'var(--green)' : 'var(--red)') + ';">' +
                 (ben == null ? '—' : (ben >= 0 ? '+' : '') + _daNum(ben, 2) + '$') + '</span>' +
             '</span>' +
           '</div>' +
           '<div id="da-det-' + clave + '" style="display:none;padding:0 1.2rem 1.2rem;"></div>' +
         '</div>';
  });
  return h + '</div>';
}

// ── En curso: abiertos y cerrados sin análisis (arriba del todo) ─────────

function _daInsignia(texto, color, titulo) {
  return '<span title="' + _daEsc(titulo) + '" style="font-size:11px;color:' + color + ';border:1px solid ' + color +
         ';padding:.12rem .45rem;white-space:nowrap;">' + texto + '</span>';
}

function _daPrecio(v) { return v == null || Number(v) === 0 ? '—' : _daNum(v, 2); }

// Lista "En curso y pendientes de análisis" (pref 'a'): abiertos de la cuenta
// elegida y, debajo, los cerrados que post_cierre.py aún no ha analizado.
function _daHtmlEnCurso(filasCuenta) {
  var abiertos = _daFiltrarCuenta(_daAbiertos || []);
  var pend = filasCuenta.filter(_daPendiente);
  if (!abiertos.length && !pend.length) return '';
  var porFp = _daTradesPorFp();
  var masPend = pend.length > DA_PENDIENTES_ARRIBA ? pend.length - DA_PENDIENTES_ARRIBA : 0;
  var lista = abiertos.concat(pend.slice(0, DA_PENDIENTES_ARRIBA));
  var h = '<div class="tag" style="display:block;margin-bottom:.4rem;">En curso y pendientes de análisis · ' + (abiertos.length + pend.length) + '</div>' +
          '<div style="font-size:13px;color:var(--text-muted);margin-bottom:.8rem;">Pulsa un trade para poner sus capturas y notas (por qué entré, qué hice, por qué salí) ya; ' +
            'se quedan con él cuando se cierre y se analice.</div>' +
          '<div style="display:flex;flex-direction:column;gap:1px;background:var(--border);margin-bottom:' + (masPend ? '.5rem' : '2rem') + ';border:1px solid var(--border-gold);">';
  lista.forEach(function(r) {
    var clave = _daEsc('a:' + r.fp);
    var ab = r._abierto === true;
    var ben = ab ? null : _daBenef(r, porFp);
    var datos = (r.volumen != null ? _daNum(r.volumen, 2) + ' lotes · ' : '') + 'entrada ' + _daPrecio(r.precio_entrada) +
                (ab ? ' · SL ' + _daPrecio(r.sl_actual) + ' · TP ' + _daPrecio(r.tp_actual) : ' · cierre ' + _daPrecio(r.precio_cierre));
    h += '<div style="background:var(--bg2);' + (ab ? 'box-shadow:inset 3px 0 0 var(--gold);' : '') + '">' +
           '<div onclick="_daToggle(\'' + clave + '\')" style="display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:center;padding:.8rem 1.2rem;cursor:pointer;">' +
             '<span style="font-size:13px;color:var(--gold-dim);flex:0 0 88px;" title="' + (ab ? 'Hora de entrada' : 'Hora de cierre') + '">' +
               _daHora(ab ? r.fecha_entrada : r.fecha_cierre) + '</span>' +
             '<span style="font-size:14px;color:var(--text-dim);flex:1 1 220px;min-width:0;">' + (r.direccion === 'buy' ? 'Compra' : 'Venta') + ' · ' +
               _daEsc(_daNombreCuenta(r.cuenta_numero)) +
               ' <span style="color:var(--text-muted);font-size:12px;">· ' + datos + '</span></span>' +
             '<span style="display:flex;gap:.4rem 1rem;flex-wrap:wrap;justify-content:flex-end;align-items:center;margin-left:auto;">' +
               '<span style="display:flex;gap:.4rem;flex-wrap:wrap;justify-content:flex-end;">' +
                 (typeof _moBadge === 'function' ? _moBadge(r) : '') + (typeof _caBadge === 'function' ? _caBadge(r) : '') +
                 (ab ? _daInsignia('● Abierto', 'var(--gold)', 'La EA lo tiene abierto ahora; SL y TP son los actuales')
                     : _daInsignia('Pendiente de análisis', 'var(--text-muted)', 'Cerrado; el análisis llega con la tarea horaria')) + '</span>' +
               '<span style="font-size:14px;min-width:70px;text-align:right;color:' + (ben == null ? 'var(--text-muted)' : ben >= 0 ? 'var(--green)' : 'var(--red)') + ';">' +
                 (ben == null ? (ab ? 'en curso' : '—') : (ben >= 0 ? '+' : '') + _daNum(ben, 2) + '$') + '</span>' +
             '</span>' +
           '</div>' +
           '<div id="da-det-' + clave + '" style="display:none;padding:0 1.2rem 1.2rem;"></div>' +
         '</div>';
  });
  h += '</div>';
  if (masPend) h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:2rem;">Y ' + masPend + ' pendientes más: están en el calendario y en su semana.</div>';
  return h;
}

// clave = '<pref>:<fp>' (ver _daHtmlTrades)
function _daToggle(clave) {
  if (_daAbierto && _daAbierto !== clave) {
    var prev = document.getElementById('da-det-' + _daAbierto);
    if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }  // un mismo fp puede estar en dos listas: sin ids repetidos
  }
  if (_daAbierto === clave) {
    var det = document.getElementById('da-det-' + clave);
    det.style.display = 'none';
    det.innerHTML = '';
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
  var r = (_daDatos || []).concat(_daAbiertos || []).filter(function(x) { return x.fp === fp; })[0];
  if (!det || !r) return;
  det.style.display = 'block';
  det.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">Cargando…</div>';

  var email = encodeURIComponent(window.usuarioActual.email);
  var token = getToken();
  if (r._abierto === true) return _daAbrirAbiertoDetalle(clave, r, det, token);
  if (_daPendiente(r)) return _daAbrirPendiente(clave, r, det, token);
  var res = await Promise.all([
    supaGet('post_cierre_velas', 'usuario_email=eq.' + email + '&fp=eq.' + encodeURIComponent(fp), token),
    supaGet('trade_eventos', 'fp=eq.' + encodeURIComponent(fp) + '&order=timestamp.asc', token)
  ]);
  if (_daAbierto !== clave) return; // se cerró mientras cargaba
  var velas = res[0].data && res[0].data[0];
  var eventos = res[1].data || [];

  var h = '';
  if (_daProvisional(r)) {
    h += '<div style="font-size:13px;color:var(--gold);line-height:1.6;margin:.2rem 0 .6rem;padding:.5rem .8rem;border:1px dashed var(--border-gold);">' +
           'Análisis provisional: solo hay ' + _daEsc(_daMinVentana(r)) + ' de mercado después del cierre. ' +
           'Se recalcula cada hora hasta completar las 4 h; el veredicto puede cambiar.</div>';
  }
  h += '<div style="font-size:15px;color:var(--text);line-height:1.7;margin:.2rem 0 1rem;">' + _daEsc(_daFrase(r)) + '</div>';
  if (typeof _moHtmlCorregir === 'function') h += _moHtmlCorregir(r, clave);
  if (typeof _caHtmlBotonPagina === 'function') h += _caHtmlBotonPagina(r);
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

  h += _daHtmlEventos(eventos);
  h += _daHtmlNoEvaluado(r, eventos);
  if (r.notas) h += '<div style="font-size:12px;color:var(--text-muted);margin-top:.8rem;">Nota del análisis: ' + _daEsc(r.notas) + '</div>';

  det.innerHTML = h;
  var graf = document.getElementById('da-graf-' + clave);
  if (velas && Array.isArray(velas.velas) && velas.velas.length) _daPintarGrafico(graf, r, velas);
  else graf.innerHTML = '<div style="padding:1rem;font-size:13px;color:var(--text-muted);">Sin velas guardadas para este trade.</div>';
}

function _daHtmlEventos(eventos) {
  var h = '<div class="tag" style="display:block;margin-bottom:.6rem;">Línea de tiempo</div>';
  if (!eventos.length) return h + '<div style="font-size:13px;color:var(--text-muted);">Sin eventos registrados por la EA para este trade.</div>';
  return h + '<div style="display:flex;flex-direction:column;gap:.35rem;">' + eventos.map(function(ev) {
    var label = typeof _eaAuditoriaTipoLabel === 'function' ? _eaAuditoriaTipoLabel(ev.tipo_evento) : ev.tipo_evento;
    return '<div style="display:grid;grid-template-columns:90px 140px 1fr;gap:.8rem;font-size:13px;">' +
             '<span style="color:var(--gold-dim);">' + _daHora(ev.timestamp) + '</span>' +
             '<span style="color:var(--text-dim);">' + _daEsc(label) + '</span>' +
             '<span style="color:var(--text-muted);">' + (ev.precio != null ? _daNum(ev.precio, 2) : '') +
               (ev.puntos_desde_entrada != null ? ' · ' + (ev.puntos_desde_entrada >= 0 ? '+' : '') + _daNum(ev.puntos_desde_entrada, 2) + ' pts' : '') + '</span>' +
           '</div>';
  }).join('') + '</div>';
}

// Detalle de un trade sin análisis todavía: lo que ya mandó la EA (entrada,
// cierre, P&L y línea de tiempo). Gráfico y veredicto llegan con el análisis.
async function _daAbrirPendiente(clave, r, det, token) {
  var res = await supaGet('trade_eventos', 'fp=eq.' + encodeURIComponent(r.fp) + '&order=timestamp.asc', token);
  if (_daAbierto !== clave) return; // se cerró mientras cargaba
  var b = _daBenef(r, _daTradesPorFp());
  var celda = function(label, valor, sub, color) {
    return '<div class="stat-card" style="text-align:center;padding:.8rem;"><div class="stat-label">' + label + '</div>' +
           '<div style="font-size:20px;color:' + (color || 'var(--text)') + ';">' + valor + '</div>' +
           '<div class="stat-sub">' + sub + '</div></div>';
  };
  det.innerHTML =
    '<div style="font-size:13px;color:var(--text-muted);line-height:1.6;margin:.2rem 0 .8rem;padding:.5rem .8rem;border:1px dashed var(--border);">' +
      'Análisis pendiente: la EA ya envió el trade y la tarea programada lo analiza cada hora (gráfico, veredicto y 4 h después del cierre).</div>' +
    (typeof _caHtmlBotonPagina === 'function' ? _caHtmlBotonPagina(r) : '') +
    (typeof _moHtmlCorregir === 'function' ? _moHtmlCorregir(r, clave) : '') +
    '<div class="da-rejilla" style="--da-base:max(150px, calc(25% - 1px));margin-bottom:1rem;">' +
      celda('Entrada', _daNum(r.precio_entrada, 2), _daEsc(_daHora(r.fecha_entrada))) +
      celda('Cierre', _daNum(r.precio_cierre, 2), _daEsc(_daHora(r.fecha_cierre))) +
      _daMini('Puntos', _daPtsReales(r), 'desde la entrada') +
      celda('P&amp;L', b == null ? '—' : _daFmtD(b), r.volumen != null ? _daNum(r.volumen, 2) + ' lotes' : '&nbsp;',
            b == null ? 'var(--text-muted)' : b >= 0 ? 'var(--green)' : 'var(--red)') +
    '</div>' +
    _daHtmlEventos(res.data || []);
}

// Detalle de un trade ABIERTO: botón de capturas y notas por hueco (ya se
// pueden rellenar, en la vista "Capturas del trade" de capturas.js), modo,
// entrada, SL/TP actuales, lote y línea de tiempo hasta ahora.
async function _daAbrirAbiertoDetalle(clave, r, det, token) {
  var res = await supaGet('trade_eventos', 'fp=eq.' + encodeURIComponent(r.fp) + '&order=timestamp.asc', token);
  if (_daAbierto !== clave) return; // se cerró mientras cargaba
  var celda = function(label, valor, sub) {
    return '<div class="stat-card" style="text-align:center;padding:.8rem;"><div class="stat-label">' + label + '</div>' +
           '<div style="font-size:20px;color:var(--text);">' + valor + '</div><div class="stat-sub">' + sub + '</div></div>';
  };
  var dist = function(v) {
    return v == null || Number(v) === 0 || r.precio_entrada == null ? 'sin poner' : _daNum(Math.abs(Number(v) - Number(r.precio_entrada)), 1) + ' pts de la entrada';
  };
  det.innerHTML =
    '<div style="font-size:13px;color:var(--gold);line-height:1.6;margin:.2rem 0 .8rem;padding:.5rem .8rem;border:1px dashed var(--border-gold);">' +
      'Trade abierto. Pon ya tus capturas y notas: se quedan con este trade cuando se cierre y se analice.</div>' +
    (typeof _caHtmlBotonPagina === 'function' ? _caHtmlBotonPagina(r) : '') +
    (typeof _moHtmlCorregir === 'function' ? _moHtmlCorregir(r, clave) : '') +
    '<div class="da-rejilla" style="--da-base:max(150px, calc(25% - 1px));margin-bottom:1rem;">' +
      celda('Entrada', _daPrecio(r.precio_entrada), _daEsc(_daHora(r.fecha_entrada)) + ' · ' + (r.direccion === 'buy' ? 'compra' : 'venta')) +
      celda('SL actual', _daPrecio(r.sl_actual), dist(r.sl_actual)) +
      celda('TP actual', _daPrecio(r.tp_actual), dist(r.tp_actual)) +
      celda('Lote', r.volumen != null ? _daNum(r.volumen, 2) : '—', 'Setup: ' + _daEsc(r.estrategia || 'sin clasificar')) +
    '</div>' +
    _daHtmlEventos(res.data || []);
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
