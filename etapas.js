// ============================================================
// ETAPAS v2 (07/10) — criterios para LLEGAR a cada etapa, con su barra.
// Ver ESTADO.md, "Etapas v2", y tools/post_cierre/sql_etapas_v2.sql.
//
// - Criterios: tabla etapa_criterios (los edita el admin). Los de la etapa N
//   son los que hacen falta para LLEGAR a N. El usuario ve los de la SIGUIENTE
//   a la suya; % = media de los criterios (cada uno topado al 100 %); "✦ Listo
//   para revisión" cuando los cumple todos. Nunca cambia usuarios_aurum.etapa:
//   decide el admin (guardar etapa → etapa_historial).
// - DISCIPLINA: desde el último cambio de etapa (punto 3: el día siguiente al
//   cambio; sin cambios, desde la entrada en Aurum). Plan del día y modos,
//   además, desde parametros.desde (08/10/2026: los trades del 07/10 son de antes del plan).
// - RESULTADOS: ventanas móviles (últimos N días / últimos meses naturales
//   completos), NO desde el cambio de etapa, y todos los de una etapa con la
//   MISMA cuenta (se elige, entre Maestra / Prueba / Retos, la que más cerca
//   está; si no tiene ninguna asignada, entre todas sus cuentas).
// - "⚠ no mantiene «X»" (admin): en las 3 últimas semanas cerradas no cumplió
//   los criterios de su etapa ACTUAL (los que le hicieron llegar). Para
//   "mantener" se miran los de resultados (ventanas móviles hasta el domingo
//   de cada semana), EA y reglas, y los % de disciplina en ventana móvil (sin
//   el corte del cambio de etapa); los de recuento o racha (días operados,
//   días limpios, semanas de la regla, días sin «Cierre obligatorio») no, porque
//   vuelven a 0 al cambiar de etapa. Nunca baja la etapa.
//
// Funciones puras (_etContexto, _etEvaluar...) para Mi proceso y el admin.
// Usa dias-limpios.js (dlCalcular, _dlTiempos...) y, para la regla de la
// semana, las funciones del Diario (diario-analisis.js).
// ============================================================

var ET_SEMANAS_AVISO = 3;
var ET_VENTANA_MANTENER = 30;      // días operados para los % de disciplina al "mantener"
var ET_MS_DIA = 86400000;
var ET_TAMANO_DEFECTO = 50000;

var _etCriterios = null;           // filas de etapa_criterios
var _etError = null;
var _etUltimo = null;              // resultado de Mi proceso

var ET_TIPO_MANTENER = {           // qué tipos se miran para "mantener"
  ea_conectada: true, reglas_definidas: true, plan_antes_primer_trade: true, trades_con_modo: true,
  pct_dias_limpios: true, ultimos_dias_sin_nivel_maximo: true, cuenta_rentable: true,
  meses_positivos: true, media_mensual_pct: true, periodo_positivo: true
};

function _etEsc(s) { return typeof _dlEsc === 'function' ? _dlEsc(s) : String(s == null ? '' : s); }
function _etNum(v, d) { return v.toFixed(d).replace('.', ','); }
function _etDolares(v) { return typeof _dlDolares === 'function' ? _dlDolares(v) : Math.round(v) + ' $'; }

async function _etCargarCriterios(forzar) {
  if (_etCriterios && !forzar) return _etCriterios;
  var r = await supaGet('etapa_criterios', 'select=*&order=etapa.asc,orden.asc,tipo.asc', getToken());
  if (r.error || !Array.isArray(r.data)) { _etError = String(r.error || 'sin datos'); return null; }
  _etError = null;
  _etCriterios = r.data.map(function(c) {
    c.etapa = Number(c.etapa); c.objetivo = Number(c.objetivo); c.parametros = c.parametros || {};
    return c;
  });
  return _etCriterios;
}

function _etDeEtapa(etapa) {
  return (_etCriterios || []).filter(function(c) { return c.etapa === etapa && c.activo !== false; });
}

// ── Contexto de un usuario ────────────────────────────────────────────────
// o = { trades, reglas, cuentas {maestra,prueba,retos}, eaTiempos, erroresGraves,
//       desde {dia, incluido}, tieneEa, planes, corr, tamanos {carpeta: $},
//       ahoraMs (hora de servidor), reglaSemana (función o null) }
function _etContexto(o) {
  var ahora = o.ahoraMs;
  var cu = o.cuentas || {};
  var carpetaDe = function(num) {
    var n = String(num);
    if (cu.maestra && String(cu.maestra) === n) return 'maestra';
    if (cu.prueba && String(cu.prueba) === n) return 'prueba';
    if (cu.retos && String(cu.retos) === n) return 'retos';
    return 'todas';
  };
  var trades = [];
  (o.trades || []).forEach(function(t) {
    if (t.beneficio == null || isNaN(parseFloat(t.beneficio))) return;
    var tt = _dlTiempos(t, o.eaTiempos);
    if (!tt || tt.c > ahora) return;
    trades.push({ fp: t.fp, cuenta: String(t.cuenta_numero || '?'), carpeta: carpetaDe(t.cuenta_numero), b: parseFloat(t.beneficio), e: tt.e, c: tt.c, raw: t });
  });
  var crudos = trades.map(function(x) { return x.raw; });
  var base = { reglas: o.reglas, cuentas: cu, eaTiempos: o.eaTiempos, erroresGraves: o.erroresGraves };
  var dl = dlCalcular(Object.assign({ trades: crudos, desdeDia: o.desde.dia, desdeIncluido: o.desde.incluido }, base));
  var dlTodo = dlCalcular(Object.assign({ trades: crudos, desdeDia: null }, base));
  var planes = (o.planes || []).map(function(p) {
    return { carpeta: p.carpeta, fecha: String(p.fecha).slice(0, 10), ms: Date.parse(String(p.hora_servidor).replace(' ', 'T').slice(0, 19) + 'Z'), modo_id: p.modo_id, sesgo: p.sesgo };
  }).filter(function(p) { return !isNaN(p.ms) && p.ms <= ahora; }).sort(function(a, b) { return a.ms - b.ms; });
  return { o: o, ahora: ahora, trades: trades, dl: dl, dlTodo: dlTodo, planes: planes, carpetaDe: carpetaDe,
           hayReglas: !dl.sinReglas, maxPerdida: _etMaxPerdida(o.reglas) };
}

function _etMaxPerdida(reglas) {
  var v = null;
  (reglas || []).forEach(function(x) { if (x.regla === 'perdida_dia' && (v == null || Number(x.valor) > v)) v = Number(x.valor); });
  return v;
}

// Plan vigente (mismo criterio que modos.js): última fila del mismo día de su carpeta; si no, de 'todas'.
function _etPlanDe(planes, carpeta, ms) {
  var dia = new Date(ms).toISOString().slice(0, 10), propio = null, todas = null;
  planes.forEach(function(p) {
    if (p.fecha !== dia || p.ms > ms) return;
    if (p.carpeta === carpeta) propio = p; else if (p.carpeta === 'todas') todas = p;
  });
  return propio || todas;
}

function _etDiaInicio(ctx, crit, mantener) {
  // Disciplina: desde el cambio de etapa (salvo al "mantener") y desde parametros.desde.
  var d = mantener ? null : (ctx.dl.desdeDia ? (ctx.dl.desdeIncluido ? ctx.dl.desdeDia : _etDiaMas(ctx.dl.desdeDia, 1)) : null);
  var p = crit.parametros && crit.parametros.desde;
  if (p && (!d || p > d)) d = p;
  return d;
}
function _etDiaMas(dia, n) { return new Date(Date.parse(dia + 'T00:00:00Z') + n * ET_MS_DIA).toISOString().slice(0, 10); }

// ── Evaluación de un criterio ─────────────────────────────────────────────
// → { valor (texto), meta (texto), prog (0..1), ok, nota }
function _etEvalDisciplina(c, ctx, mantener) {
  var obj = c.objetivo, t = c.tipo, r = { prog: 0, ok: false, valor: '—', meta: '', nota: '' };
  var pl = function(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); };
  if (t === 'ea_conectada' || t === 'reglas_definidas') {
    var si = t === 'ea_conectada' ? !!ctx.o.tieneEa : ctx.hayReglas;
    return { prog: si ? 1 : 0, ok: si, valor: si ? 'Sí' : 'No', meta: 'Sí', nota: '' };
  }
  if (t === 'dias_operados' || t === 'dias_limpios') {
    if (t === 'dias_limpios' && !ctx.hayReglas) return { prog: 0, ok: false, valor: '—', meta: obj + ' días', nota: 'Define tus reglas en Mis reglas' };
    var n = t === 'dias_operados' ? ctx.dl.enPeriodo : ctx.dl.limpios;
    return { prog: Math.min(1, n / obj), ok: n >= obj, valor: pl(n, 'día', 'días'), meta: obj + ' días', nota: '' };
  }
  if (t === 'pct_dias_limpios') {
    if (!ctx.hayReglas) return { prog: 0, ok: false, valor: '—', meta: obj + ' %', nota: 'Define tus reglas en Mis reglas' };
    var vent = Number(c.parametros.ventana) || 30;
    var dias = (mantener ? ctx.dlTodo.dias : ctx.dl.dias.filter(function(d) { return d.cuenta; })).slice(0, vent);
    if (!dias.length) return { prog: 0, ok: false, valor: '—', meta: obj + ' % de ' + vent + ' días', nota: 'Sin días operados' };
    var lim = dias.filter(function(d) { return d.limpio; }).length, pct = lim / dias.length * 100;
    return { prog: Math.min(1, pct / obj) * Math.min(1, dias.length / vent), ok: dias.length >= vent && pct >= obj,
             valor: Math.round(pct) + ' % (' + lim + ' de ' + dias.length + ' días)', meta: obj + ' % de ' + vent + ' días', nota: '' };
  }
  if (t === 'dias_sin_nivel_maximo') {
    if (ctx.maxPerdida == null) return { prog: 0, ok: false, valor: '—', meta: obj + ' días', nota: 'Define tus niveles de pérdida en Mis reglas' };
    var racha = 0;
    for (var i = 0; i < ctx.dl.dias.length; i++) { var d = ctx.dl.dias[i]; if (!d.cuenta) break; if (d.nivelMax) break; racha++; }
    return { prog: Math.min(1, racha / obj), ok: racha >= obj, valor: pl(racha, 'día', 'días') + ' seguidos', meta: obj + ' días', nota: '' };
  }
  if (t === 'plan_antes_primer_trade' || t === 'trades_con_modo') {
    var desde = _etDiaInicio(ctx, c, mantener);
    var lista = ctx.trades.filter(function(x) { return !desde || new Date(x.e).toISOString().slice(0, 10) >= desde; });
    if (t === 'plan_antes_primer_trade') {
      var porDia = {};
      lista.forEach(function(x) { var k = new Date(x.e).toISOString().slice(0, 10); if (!porDia[k] || x.e < porDia[k].e) porDia[k] = x; });
      var dk = Object.keys(porDia).sort().reverse();
      if (mantener) dk = dk.slice(0, ET_VENTANA_MANTENER);
      if (!dk.length) return { prog: 0, ok: false, valor: '—', meta: obj + ' % de los días', nota: 'Sin días operados' + (desde ? ' desde el ' + desde.split('-').reverse().join('/') : '') };
      var con = dk.filter(function(k) { var x = porDia[k]; return !!_etPlanDe(ctx.planes, x.carpeta, x.e); }).length;
      var pc = con / dk.length * 100;
      return { prog: Math.min(1, pc / obj), ok: pc >= obj, valor: Math.round(pc) + ' % (' + con + ' de ' + dk.length + ' días)', meta: obj + ' %', nota: '' };
    }
    if (mantener) lista = lista.sort(function(a, b) { return b.e - a.e; }).slice(0, 200);
    if (!lista.length) return { prog: 0, ok: false, valor: '—', meta: obj + ' %', nota: 'Sin trades' + (desde ? ' desde el ' + desde.split('-').reverse().join('/') : '') };
    var corr = ctx.o.corr || {};
    var conModo = lista.filter(function(x) {
      if (corr[x.fp]) return corr[x.fp].modo_id != null;
      return !!_etPlanDe(ctx.planes, x.carpeta, x.e);
    }).length;
    var pm = conModo / lista.length * 100;
    return { prog: Math.min(1, pm / obj), ok: pm >= obj, valor: Math.round(pm) + ' % (' + conModo + ' de ' + lista.length + ' trades)', meta: obj + ' %', nota: '' };
  }
  if (t === 'regla_semana_seguidas') {
    var rs = typeof ctx.o.reglaSemana === 'function' ? ctx.o.reglaSemana(ctx) : null;
    if (rs == null) return { prog: 0, ok: false, valor: '—', meta: obj + ' semanas', nota: 'Disponible con trades auditados por la EA' };
    return { prog: Math.min(1, rs.racha / obj), ok: rs.racha >= obj, valor: pl(rs.racha, 'semana', 'semanas'), meta: obj + ' semanas', nota: rs.nota || '' };
  }
  return r;
}

// Resultados de UNA cuenta (ventanas móviles hasta ctx.ahora).
function _etEvalResultado(c, ctx, cuenta) {
  var obj = c.objetivo, t = c.tipo, p = c.parametros || {};
  var tr = ctx.trades.filter(function(x) { return x.cuenta === cuenta; });
  var mesActual = new Date(ctx.ahora).toISOString().slice(0, 7);
  var mesesAtras = function(n) {          // últimos n meses naturales completos, del más reciente al más antiguo
    var out = [], d = new Date(ctx.ahora), y = d.getUTCFullYear(), m = d.getUTCMonth();
    for (var i = 1; i <= n; i++) { var x = new Date(Date.UTC(y, m - i, 1)); out.push(x.toISOString().slice(0, 7)); }
    return out;
  };
  var pnlMes = {};
  tr.forEach(function(x) { var k = new Date(x.c).toISOString().slice(0, 7); if (k < mesActual) pnlMes[k] = (pnlMes[k] || 0) + x.b; });
  if (t === 'ultimos_dias_sin_nivel_maximo') {
    if (ctx.maxPerdida == null) return { prog: 0, ok: false, valor: '—', meta: obj + ' días', nota: 'Define tus niveles de pérdida' };
    var racha = 0;
    for (var i = 0; i < ctx.dlTodo.dias.length; i++) {
      var pc = ctx.dlTodo.dias[i].porCuenta && ctx.dlTodo.dias[i].porCuenta[cuenta];
      if (!pc) continue;
      if (pc.nivelMax) break;
      racha++;
    }
    return { prog: Math.min(1, racha / obj), ok: racha >= obj, valor: Math.min(racha, obj) + ' de ' + obj + ' días', meta: obj + ' días', nota: '' };
  }
  if (t === 'cuenta_rentable') {
    var vd = Number(p.ventana_dias) || 90, minT = Number(p.min_trades) || 0;
    var desde = ctx.ahora - vd * ET_MS_DIA;
    var v = tr.filter(function(x) { return x.c >= desde; });
    var g = 0, l = 0; v.forEach(function(x) { if (x.b > 0) g += x.b; else l -= x.b; });
    var pf = l > 0 ? g / l : (g > 0 ? Infinity : 0);
    var progPf = v.length ? Math.min(1, (pf === Infinity ? obj : pf) / obj) : 0;
    var progN = minT ? Math.min(1, v.length / minT) : (v.length ? 1 : 0);
    return { prog: progPf * progN, ok: v.length > 0 && pf >= obj && v.length >= minT,
             valor: 'PF ' + (pf === Infinity ? '∞' : _etNum(pf, 2)) + ' · ' + v.length + ' trades',
             meta: 'PF ≥ ' + _etNum(obj, obj % 1 ? 1 : 1) + (minT ? ' · ≥ ' + minT + ' trades' : '') + ' en ' + vd + ' días', nota: '' };
  }
  if (t === 'meses_positivos') {
    var de = Number(p.de) || obj, ms = mesesAtras(de);
    var pos = ms.filter(function(k) { return (pnlMes[k] || 0) > 0; }).length;
    return { prog: Math.min(1, pos / obj), ok: pos >= obj, valor: pos + ' de ' + de, meta: obj + ' de ' + de + ' meses', nota: '' };
  }
  if (t === 'media_mensual_pct') {
    var nm = Number(p.meses) || 6, mm = mesesAtras(nm);
    var tam = (ctx.o.tamanos && ctx.o.tamanos[ctx.carpetaDe(cuenta)]) || ET_TAMANO_DEFECTO;
    var media = mm.reduce(function(s, k) { return s + (pnlMes[k] || 0); }, 0) / nm;
    var pct = media / tam * 100;
    return { prog: Math.max(0, Math.min(1, pct / obj)), ok: pct >= obj, valor: _etNum(pct, 1) + ' % (' + _etDolares(media) + '/mes)',
             meta: '≥ ' + _etNum(obj, obj % 1 ? 1 : 0) + ' % de ' + _etDolares(tam).slice(1) + ' en ' + nm + ' meses', nota: '' };
  }
  if (t === 'periodo_positivo') {
    var mp = mesesAtras(obj), tot = mp.reduce(function(s, k) { return s + (pnlMes[k] || 0); }, 0);
    return { prog: tot > 0 ? 1 : 0, ok: tot > 0, valor: _etDolares(tot), meta: '> 0 en ' + obj + ' meses', nota: '' };
  }
  return { prog: 0, ok: false, valor: '—', meta: '', nota: '' };
}

function _etNombreCuenta(ctx, cuenta) {
  var c = ctx.carpetaDe(cuenta);
  return (c === 'todas' ? 'Cuenta' : c.charAt(0).toUpperCase() + c.slice(1)) + ' · ' + cuenta;
}

// Evalúa los criterios de una etapa. mantener = true: solo los que se miran para mantener.
function _etEvaluar(etapa, ctx, mantener) {
  var crit = _etDeEtapa(etapa).filter(function(c) { return !mantener || ET_TIPO_MANTENER[c.tipo]; });
  var dis = crit.filter(function(c) { return c.categoria === 'disciplina'; });
  var res = crit.filter(function(c) { return c.categoria === 'resultados'; });
  var items = dis.map(function(c) { return Object.assign({ c: c }, _etEvalDisciplina(c, ctx, mantener)); });
  var cuenta = null, itemsR = [];
  if (res.length) {
    // Candidatas: las cuentas con carpeta (Maestra / Prueba / Retos, las del
    // tamaño de cuenta); si no tiene ninguna asignada, todas las suyas.
    var cuentas = {}, conCarpeta = ctx.trades.some(function(x) { return x.carpeta !== 'todas'; });
    ctx.trades.forEach(function(x) { if (!conCarpeta || x.carpeta !== 'todas') cuentas[x.cuenta] = true; });
    var mejor = null;
    Object.keys(cuentas).forEach(function(cn) {
      var it = res.map(function(c) { return Object.assign({ c: c }, _etEvalResultado(c, ctx, cn)); });
      var okN = it.filter(function(x) { return x.ok; }).length;
      var media = it.reduce(function(s, x) { return s + x.prog; }, 0) / it.length;
      var punt = okN * 10 + media;
      if (!mejor || punt > mejor.punt) mejor = { cuenta: cn, items: it, punt: punt };
    });
    if (mejor) { cuenta = mejor.cuenta; itemsR = mejor.items; }
    else itemsR = res.map(function(c) { return { c: c, prog: 0, ok: false, valor: '—', meta: '', nota: 'Sin trades' }; });
  }
  var todos = items.concat(itemsR);
  var pct = todos.length ? Math.round(todos.reduce(function(s, x) { return s + x.prog; }, 0) / todos.length * 100) : 100;
  return { etapa: etapa, disciplina: items, resultados: itemsR, cuenta: cuenta, cuentaTxt: cuenta ? _etNombreCuenta(ctx, cuenta) : null,
           pct: pct, cumplidos: todos.filter(function(x) { return x.ok; }).length, total: todos.length,
           listo: todos.length > 0 && todos.every(function(x) { return x.ok; }) };
}

// "No mantiene": las ET_SEMANAS_AVISO últimas semanas cerradas, criterios de la etapa actual.
function _etMantener(etapa, construir, ahoraMs) {
  if (etapa < 1 || !_etDeEtapa(etapa).length) return null;
  var lunes = Date.parse(new Date(ahoraMs).toISOString().slice(0, 10) + 'T00:00:00Z');
  lunes -= ((new Date(lunes).getUTCDay() + 6) % 7) * ET_MS_DIA;           // lunes de esta semana
  var semanas = [];
  for (var i = 1; i <= ET_SEMANAS_AVISO; i++) {
    var finDomingo = lunes - (i - 1) * 7 * ET_MS_DIA - 1;                // domingo 23:59:59.999
    var ev = _etEvaluar(etapa, construir(finDomingo), true);
    semanas.push({ fin: finDomingo, ok: ev.total === 0 || ev.listo, fallan: ev.disciplina.concat(ev.resultados).filter(function(x) { return !x.ok; }).map(function(x) { return x.c.nombre; }) });
  }
  return { semanas: semanas.reverse(), aviso: semanas.every(function(s) { return !s.ok; }) };
}

// ── Regla de la semana: semanas seguidas cumpliéndola (usa el Diario) ─────
// filas: filas del Diario (análisis + pendientes) con _daMarcarSecuencias hecho.
function _etRachaReglaSemana(filas, porFp, desdeDia, ahoraMs) {
  if (!filas || !filas.length || typeof _daConclusionesTodas !== 'function') return null;
  var analizadas = _daAnalizadas(filas);
  var lunesAct = _daLunes(new Date(ahoraMs).toISOString());
  var inicio = desdeDia ? Date.parse(desdeDia + 'T00:00:00Z') : 0;
  var racha = 0, nota = '';
  for (var L = lunesAct - 7 * ET_MS_DIA; L >= inicio && L > lunesAct - 60 * 7 * ET_MS_DIA; L -= 7 * ET_MS_DIA) {
    var semana = filas.filter(function(r) { var t = _daFecha(r.fecha_cierre).getTime(); return t >= L && t < L + 7 * ET_MS_DIA; });
    if (!semana.length) continue;                                           // semana sin operar: ni suma ni corta
    var base = analizadas.filter(function(r) { return _daFecha(r.fecha_cierre).getTime() < L; });
    var regla = null;
    if (base.length >= DA_MIN_TRADES_CONVIENE) {
      regla = _daConclusionesTodas(base, porFp).filter(function(x) { return x.tipo === 'error' && x.dinero > 0; })
                                                .sort(function(a, b) { return b.dinero - a.dinero; })[0] || null;
    }
    if (!regla) continue;                                                   // sin regla (pocos datos): neutra, ni suma ni corta
    if (!_etCumpleRegla(regla, semana, porFp)) { nota = 'La última que no cumpliste: W' + _daSemanaIso(L) + ' («' + regla.regla + '»)'; break; }
    racha++;
  }
  return { racha: racha, nota: nota };
}

function _etCumpleRegla(regla, filas, porFp) {
  var an = _daAnalizadas(filas), c = regla.clave;
  if (c === 'seguidas') return !filas.some(function(r) { return r._seguida; });
  if (c === 'vueltas') return !filas.some(function(r) { return r._vueltaA; });
  if (c === 'be_antes_tp1') return !an.some(function(r) { return r.be_antes_tp1; });
  if (c === 'tp1_no_asegurado') return !an.some(function(r) { return r.tp1_no_asegurado; });
  if (c === 'runners') return !an.some(function(r) { return r.runner === true; });
  if (c === 'dejar_correr') return !an.some(function(r) { return r.dejar_correr === true; });
  if (c.indexOf('nivel:') === 0 && regla.nivel) {
    var dias = {}, ok = true;
    filas.forEach(function(r) { var k = r.cuenta_numero + '|' + _daDiaMs(r.fecha_cierre); (dias[k] = dias[k] || []).push(r); });
    Object.keys(dias).forEach(function(k) {
      _daNivelesDia(dias[k], porFp).forEach(function(h) {
        if (h.nivel.regla === regla.nivel.regla && h.nivel.nivel === regla.nivel.nivel && h.nivel.valor === regla.nivel.valor && _daVeredictoNivel(h)) ok = false;
      });
    });
    return ok;
  }
  return true;
}

// ── Mi proceso ────────────────────────────────────────────────────────────

function _etHtmlItem(x) {
  var col = x.ok ? 'var(--green)' : x.prog >= 0.5 ? 'var(--gold)' : 'var(--text-muted)';
  return '<div class="et-item">' +
           '<div class="et-item-cab"><span>' + (x.ok ? '✓ ' : '') + _etEsc(x.c.nombre) + '</span>' +
             '<span class="et-item-val" style="color:' + col + ';">' + _etEsc(x.valor) + ' <span>/ ' + _etEsc(x.meta) + '</span></span></div>' +
           '<div class="et-barra"><div style="width:' + Math.round(x.prog * 100) + '%;background:' + (x.ok ? 'var(--green)' : 'var(--gold)') + ';"></div></div>' +
           (x.nota ? '<div class="et-nota">' + _etEsc(x.nota) + '</div>' : '') +
         '</div>';
}

function _etHtmlEvaluacion(ev, compacto) {
  var col = function(tit, lista, extra) {
    return '<div><div class="et-col-tit">' + tit + (extra ? ' <span>' + _etEsc(extra) + '</span>' : '') + '</div>' +
           (lista.length ? lista.map(_etHtmlItem).join('') : '<div class="et-nota">Sin criterios.</div>') + '</div>';
  };
  return '<div class="et-cols' + (compacto ? ' et-compacto' : '') + '">' +
           col('Disciplina', ev.disciplina, 'desde tu último cambio de etapa') +
           col('Resultados', ev.resultados, ev.cuentaTxt ? '· ' + ev.cuentaTxt : '') +
         '</div>';
}

async function buildEtapas() {
  var u = window.usuarioActual;
  var cont = document.getElementById('etapa-siguiente');
  if (!u || !u.email) return;
  var crit = await _etCargarCriterios();
  if (!crit) { if (cont) cont.innerHTML = ''; return; }        // sin tabla: se queda la barra del punto 3
  if (typeof _daCargar === 'function' && (_daDatos == null || _daDatosEmail !== u.email)) await _daCargar();
  if (!window.usuarioActual || window.usuarioActual.email !== u.email) return;
  var token = getToken(), email = encodeURIComponent(u.email);
  var res = await Promise.all([
    supaGet('etapa_historial', 'usuario_email=eq.' + email + '&order=created_at.desc&limit=1', token),
    supaGet('cuenta_tamanos', 'usuario_email=eq.' + email + '&select=carpeta,tamano', token),
    supaGet('reglas_efectivas', 'usuario_email=eq.' + email + '&select=carpeta,regla,nivel,valor,nombre', token)
  ]);
  if (!window.usuarioActual || window.usuarioActual.email !== u.email) return;
  var desde = _dlDesde(!res[0].error && res[0].data && res[0].data[0], u);
  var tamanos = {};
  (res[1].data || []).forEach(function(t) { tamanos[t.carpeta] = Number(t.tamano); });
  var etapa = u.etapa_real != null ? u.etapa_real : (u.etapa || 1);
  var mios = _daDatosEmail === u.email;
  var porFp = mios ? _daTradesPorFp() : {};
  var ahora = Date.now() + _dlOffsetMs();
  var datos = {
    trades: (window.AURUM_TRADES && window.AURUM_TRADES.todos) || [],
    reglas: res[2].error ? [] : (res[2].data || []),
    cuentas: { maestra: u.cuenta_maestra, prueba: u.cuenta_prueba, retos: u.cuenta_retos },
    eaTiempos: mios ? _dlEaTiempos(_daEa) : {},
    erroresGraves: mios ? _dlErroresGraves(_daAnalizadas(_daDatos || [])) : {},
    desde: desde, tieneEa: !!u.tiene_ea,
    planes: typeof _moPlanes !== 'undefined' ? _moPlanes : [],
    corr: typeof _moCorr !== 'undefined' ? _moCorr : {},
    tamanos: tamanos,
    reglaSemana: mios ? function(ctx) { return _etRachaReglaSemana(_daDatos, porFp, ctx.dl.desdeDia, ctx.ahora); } : null
  };
  var ctx = _etContexto(Object.assign({ ahoraMs: ahora }, datos));
  var sig = Math.min(etapa + 1, 11);
  var ev = etapa >= 11 ? null : _etEvaluar(sig, ctx, false);
  _etUltimo = { ev: ev, etapa: etapa, sig: sig };
  _etPintarMiProceso(ev, etapa, sig);
}

function _etPintarMiProceso(ev, etapa, sig) {
  var nombres = typeof DL_ETAPAS !== 'undefined' ? DL_ETAPAS : [];
  var nomSig = nombres[sig] || ('Etapa ' + sig);
  var cont = document.getElementById('etapa-siguiente');
  var set = function(id, prop, v) { var el = document.getElementById(id); if (el) el[prop] = v; };
  if (!ev) {
    if (cont) cont.innerHTML = '<div class="tag" style="display:block;margin-bottom:.4rem;">Tu etapa</div><div class="et-nota">Estás en ✦ Oro, la última etapa.</div>';
    return;
  }
  if (cont) {
    cont.innerHTML =
      '<div class="et-cab"><span class="tag" style="margin:0;">Para llegar a «' + _etEsc(nomSig) + '»</span>' +
        '<span class="et-pct">' + ev.pct + ' % · ' + ev.cumplidos + ' de ' + ev.total + ' criterios</span></div>' +
      (ev.listo ? '<div class="et-listo">✦ Listo para revisión de etapa: el Águila revisará tu paso a «' + _etEsc(nomSig) + '».</div>' : '') +
      _etHtmlEvaluacion(ev, false) +
      '<div class="et-pie">Los de disciplina cuentan desde tu último cambio de etapa (plan del día y modos, desde el 08/10/2026); los de resultados, ' +
        'en ventanas móviles y todos con la misma cuenta. Son avisos: la etapa la cambia el Águila.</div>';
  }
  // Recuadro "Tu nivel" y tarjeta "Nivel actual": % de la etapa (media de los criterios).
  ['dash-nivel', 'sidebar-nivel'].forEach(function(p) {
    var f = document.getElementById(p + '-fill'); if (f) f.style.width = ev.pct + '%';
    set(p + '-pct', 'textContent', ev.pct + '%');
    var dl = document.getElementById(p + '-dl');
    if (dl) {
      dl.innerHTML = '<div style="color:var(--text-dim);">' + ev.cumplidos + ' de ' + ev.total + ' criterios → ' + _etEsc(nomSig) + '</div>' +
        (ev.listo ? '<div style="color:var(--gold-bright);margin-top:.2rem;">✦ Listo para revisión de etapa</div>' : '') +
        '<div style="color:var(--gold-dim);cursor:pointer;margin-top:.25rem;text-decoration:underline;" onclick="irA(\'dashboard\');setTimeout(function(){var e=document.getElementById(\'etapa-siguiente\');if(e)e.scrollIntoView({behavior:\'smooth\'});},300);">Ver criterios</div>' +
        '<div style="color:var(--gold-dim);cursor:pointer;margin-top:.15rem;text-decoration:underline;" onclick="dlVerDias()">Ver días limpios</div>';
    }
    var barra = document.getElementById(p + '-fill');
    if (barra && barra.parentNode) barra.parentNode.title = ev.pct + ' % hacia ' + nomSig;
  });
  set('dash-nivel-sub', 'textContent', ev.pct + ' % hacia ' + nomSig + ' · ' + ev.cumplidos + '/' + ev.total + ' criterios' + (ev.listo ? ' · ✦ listo' : ''));
}

// ── Admin ────────────────────────────────────────────────────────────────

var _etAdminCache = {};

async function _etDatosAdmin(u) {
  var email = encodeURIComponent(u.email), token = getToken();
  var todo = async function(tabla, params) {
    var out = [];
    for (var off = 0; ; off += 1000) {
      var r = await supaGet(tabla, params + '&limit=1000&offset=' + off, token);
      if (r.error || !Array.isArray(r.data)) return { error: r.error };
      out = out.concat(r.data);
      if (r.data.length < 1000) return { data: out };
    }
  };
  var res = await Promise.all([
    todo('trades', 'usuario_email=eq.' + email + '&select=fp,cuenta_numero,fecha,hora,dur_min,beneficio&order=fp.asc'),
    supaGet('reglas_efectivas', 'usuario_email=eq.' + email + '&select=*', token),
    todo('ea_trades', 'usuario_email=eq.' + email + '&estado=eq.closed&fecha_cierre=not.is.null&select=' + DA_COLUMNAS_EA + '&order=fp.asc'),
    todo('post_cierre_analisis', 'usuario_email=eq.' + email + '&order=fp.asc'),
    supaGet('etapa_historial', 'usuario_email=eq.' + email + '&order=created_at.desc&limit=1', token),
    todo('plan_dia', 'usuario_email=eq.' + email + '&select=carpeta,fecha,hora_servidor,modo_id,sesgo&order=hora_servidor.asc,id.asc'),
    todo('trade_modo', 'usuario_email=eq.' + email + '&select=fp,modo_id&order=fp.asc'),
    supaGet('cuenta_tamanos', 'usuario_email=eq.' + email + '&select=carpeta,tamano', token)
  ]);
  if (res[0].error || res[1].error) return { error: res[0].error || res[1].error };
  var corr = {};
  (res[6].data || []).forEach(function(c) { corr[c.fp] = { modo_id: c.modo_id }; });
  var tamanos = {};
  (res[7].data || []).forEach(function(t) { tamanos[t.carpeta] = Number(t.tamano); });
  var analisis = res[3].error ? [] : res[3].data, ea = res[2].error ? [] : res[2].data;
  // Filas del Diario de este usuario (para la regla de la semana)
  var filas = (analisis.length || ea.length) ? _daFusionar(analisis, ea) : [];
  if (filas.length) _daMarcarSecuencias(filas);
  var porFp = {};
  ea.forEach(function(t) { if (t.fp && t.beneficio != null) porFp[t.fp] = { beneficio: t.beneficio }; });
  res[0].data.forEach(function(t) { if (t.fp && (t.beneficio != null || !porFp[t.fp])) porFp[t.fp] = t; });
  var reglasDiario = {};
  res[1].data.forEach(function(x) {
    (reglasDiario[x.carpeta] = reglasDiario[x.carpeta] || []).push({ regla: x.regla, nivel: Number(x.nivel), valor: Number(x.valor), nombre: x.nombre || null, plan: x.plan || null });
  });
  return {
    trades: res[0].data, reglas: res[1].data,
    cuentas: { maestra: u.cuenta_maestra, prueba: u.cuenta_prueba, retos: u.cuenta_retos },
    eaTiempos: _dlEaTiempos(ea), erroresGraves: _dlErroresGraves(analisis),
    desde: _dlDesde(!res[4].error && res[4].data && res[4].data[0], u), tieneEa: !!u.tiene_ea,
    planes: res[5].error ? [] : res[5].data, corr: corr, tamanos: tamanos,
    // La regla de la semana usa las funciones del Diario, que leen sus datos de
    // variables globales: se cambian un momento (sin esperas en medio) y se restauran.
    reglaSemana: filas.length ? function(ctx) {
      var g = { d: _daDatos, r: _daReglas, u: window.usuarioActual };
      try {
        _daDatos = filas; _daReglas = reglasDiario;
        window.usuarioActual = Object.assign({}, g.u || {}, u);
        return _etRachaReglaSemana(filas, porFp, ctx.dl.desdeDia, ctx.ahora);
      } finally { _daDatos = g.d; _daReglas = g.r; window.usuarioActual = g.u; }
    } : null
  };
}

function _etConstruir(datos) {
  return function(ahoraMs) { return _etContexto(Object.assign({ ahoraMs: ahoraMs }, datos)); };
}

async function etAdminPintar(usuarios) {
  var crit = await _etCargarCriterios();
  if (!crit) { if (typeof dlAdminPintar === 'function') dlAdminPintar(usuarios); return; }
  var nombres = typeof DL_ETAPAS !== 'undefined' ? DL_ETAPAS : [];
  for (var i = 0; i < (usuarios || []).length; i++) {
    var u = usuarios[i];
    if (!document.getElementById('adm-dl-' + i) || !u.email) continue;
    var r = _etAdminCache[u.email];
    if (!r) {
      try {
        var datos = await _etDatosAdmin(u);
        if (datos.error) r = { error: datos.error };
        else {
          var ahora = Date.now() + _dlOffsetMs(), construir = _etConstruir(datos), etapa = Number(u.etapa != null ? u.etapa : 1);
          r = { etapa: etapa, ev: etapa >= 11 ? null : _etEvaluar(etapa + 1, construir(ahora), false), mant: _etMantener(etapa, construir, ahora), datos: datos };
        }
      } catch (e) { r = { error: e.message }; console.error('[etapas] admin', u.email, e); }
      _etAdminCache[u.email] = r;
    }
    var el = document.getElementById('adm-dl-' + i);
    if (!el) continue;
    if (r.error) { el.innerHTML = '<span style="color:var(--text-muted);" title="' + _etEsc(r.error) + '">—</span>'; continue; }
    var h = r.ev ? (r.ev.listo ? '<span style="color:var(--gold-bright);">✦ listo</span>'
                               : '<span title="% hacia ' + _etEsc(nombres[r.etapa + 1] || '') + '">' + r.ev.pct + ' % · ' + r.ev.cumplidos + '/' + r.ev.total + '</span>')
                 : '<span>Oro</span>';
    if (r.mant && r.mant.aviso) h += '<span style="display:block;color:var(--red);">⚠ no mantiene «' + _etEsc(nombres[r.etapa] || r.etapa) + '»</span>';
    h += '<span style="display:block;color:var(--gold-dim);cursor:pointer;text-decoration:underline;" onclick="etAdminDetalle(' + i + ')">criterios</span>';
    el.innerHTML = h;
  }
}

function etAdminOlvidar(email) { if (email) delete _etAdminCache[email]; else _etAdminCache = {}; }

function etAdminDetalle(i) {
  var u = (typeof adminUsuarios !== 'undefined' ? adminUsuarios : [])[i];
  var fila = document.getElementById('adm-et-det-' + i);
  if (!u || !fila) return;
  if (fila.style.display !== 'none') { fila.style.display = 'none'; return; }
  var r = _etAdminCache[u.email];
  var nombres = typeof DL_ETAPAS !== 'undefined' ? DL_ETAPAS : [];
  var h = '';
  if (!r || r.error) h = '<div class="et-nota">Sin datos.</div>';
  else {
    h += r.ev ? '<div class="et-cab"><span class="tag" style="margin:0;">Para llegar a «' + _etEsc(nombres[r.etapa + 1]) + '»</span><span class="et-pct">' +
                r.ev.pct + ' % · ' + r.ev.cumplidos + ' de ' + r.ev.total + (r.ev.listo ? ' · ✦ listo' : '') + '</span></div>' + _etHtmlEvaluacion(r.ev, true)
              : '<div class="et-nota">En ✦ Oro.</div>';
    if (r.mant) {
      h += '<div class="et-col-tit" style="margin-top:.8rem;">Mantener «' + _etEsc(nombres[r.etapa]) + '» · últimas ' + ET_SEMANAS_AVISO + ' semanas cerradas</div>' +
           '<div class="et-nota">' + r.mant.semanas.map(function(s) {
             return 'W' + _daSemanaIso(_daLunes(new Date(s.fin).toISOString())) + ' ' + (s.ok ? '✓' : '✗ (' + _etEsc(s.fallan.join(', ')) + ')');
           }).join(' · ') + (r.mant.aviso ? ' → <span style="color:var(--red);">⚠ no mantiene</span>' : '') + '</div>';
    }
  }
  var tam = (r && r.datos && r.datos.tamanos) || {};
  var inp = function(c) {
    return '<label style="font-size:12px;color:var(--text-muted);">' + c.charAt(0).toUpperCase() + c.slice(1) +
           ' <input id="et-tam-' + i + '-' + c + '" value="' + (tam[c] || ET_TAMANO_DEFECTO) + '" style="width:90px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:.25rem .4rem;font:inherit;font-size:12px;"> $</label>';
  };
  h += '<div style="display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:center;margin-top:.9rem;">' +
         '<span class="et-col-tit" style="margin:0;">Tamaño de cuenta</span>' + ['maestra', 'prueba', 'retos'].map(inp).join('') +
         '<button class="tab" style="padding:.25rem .8rem;font-size:12px;" onclick="etAdminGuardarTamanos(' + i + ')">Guardar tamaños</button>' +
         '<span id="et-tam-msg-' + i + '" style="font-size:12px;"></span></div>';
  fila.querySelector('td').innerHTML = h;
  fila.style.display = '';
}

async function etAdminGuardarTamanos(i) {
  var u = adminUsuarios[i], msg = document.getElementById('et-tam-msg-' + i);
  var filas = [];
  ['maestra', 'prueba', 'retos'].forEach(function(c) {
    var v = parseFloat(String(document.getElementById('et-tam-' + i + '-' + c).value).replace(/\./g, '').replace(',', '.'));
    if (v > 0) filas.push({ usuario_email: u.email, carpeta: c, tamano: v });
  });
  if (filas.length !== 3) { if (msg) { msg.style.color = 'var(--red)'; msg.textContent = 'Importes no válidos.'; } return; }
  var r = await supaPost('cuenta_tamanos?on_conflict=usuario_email,carpeta', filas, 'resolution=merge-duplicates,return=minimal', getToken());
  if (r.error) { if (msg) { msg.style.color = 'var(--red)'; msg.textContent = 'No se pudo guardar.'; } return; }
  if (msg) { msg.style.color = 'var(--green)'; msg.textContent = '✓ Guardado'; }
  etAdminOlvidar(u.email);
  await etAdminPintar(adminUsuarios);
}

// ── Admin: editor de criterios ───────────────────────────────────────────

var _etEditorEtapa = 1;

async function etEditorPintar(etapa) {
  var cont = document.getElementById('admin-etapas-editor');
  if (!cont) return;
  if (etapa) _etEditorEtapa = etapa;
  var crit = await _etCargarCriterios(true);
  if (!crit) { cont.innerHTML = '<div class="et-nota">No se pudieron leer los criterios (' + _etEsc(_etError) + ').</div>'; return; }
  var nombres = typeof DL_ETAPAS !== 'undefined' ? DL_ETAPAS : [];
  var sel = '<select onchange="etEditorPintar(Number(this.value))" style="background:var(--bg);border:1px solid var(--border);color:var(--text);padding:.3rem .5rem;font:inherit;font-size:13px;">';
  for (var e = 1; e <= 11; e++) sel += '<option value="' + e + '"' + (e === _etEditorEtapa ? ' selected' : '') + '>Para llegar a ' + e + ' · ' + _etEsc(nombres[e] || '') + '</option>';
  sel += '</select>';
  var inp = 'background:var(--bg);border:1px solid var(--border);color:var(--text);padding:.25rem .4rem;font:inherit;font-size:12px;box-sizing:border-box;';
  var filas = crit.filter(function(c) { return c.etapa === _etEditorEtapa; });
  var h = '<div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap;margin-bottom:.7rem;">' + sel +
          '<span class="et-nota">Cada cambio queda en el historial. Un criterio se aplica a quien quiera LLEGAR a esa etapa. Parámetros en JSON (p. ej. {"ventana_dias": 90, "min_trades": 100}).</span></div>' +
          '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:820px;"><thead><tr style="color:var(--text-muted);text-align:left;">' +
          '<th style="font-weight:400;padding:.3rem;">Categoría · tipo</th><th style="font-weight:400;">Nombre (lo ve el usuario)</th><th style="font-weight:400;">Objetivo</th>' +
          '<th style="font-weight:400;">Parámetros</th><th style="font-weight:400;">Activo</th><th></th></tr></thead><tbody>';
  filas.forEach(function(c) {
    h += '<tr style="border-top:1px solid var(--border);">' +
         '<td style="padding:.35rem;color:var(--text-dim);white-space:nowrap;">' + _etEsc(c.categoria) + ' · ' + _etEsc(c.tipo) + '</td>' +
         '<td><input id="et-ed-n-' + c.id + '" value="' + _etEsc(c.nombre) + '" style="' + inp + 'width:100%;"></td>' +
         '<td><input id="et-ed-o-' + c.id + '" value="' + _etEsc(String(c.objetivo).replace('.', ',')) + '" style="' + inp + 'width:70px;"></td>' +
         '<td><input id="et-ed-p-' + c.id + '" value="' + _etEsc(JSON.stringify(c.parametros || {})) + '" style="' + inp + 'width:100%;"></td>' +
         '<td style="text-align:center;"><input type="checkbox" id="et-ed-a-' + c.id + '"' + (c.activo !== false ? ' checked' : '') + '></td>' +
         '<td style="white-space:nowrap;"><button class="tab" style="padding:.2rem .6rem;font-size:12px;" onclick="etEditorGuardar(' + c.id + ')">Guardar</button>' +
           '<span id="et-ed-m-' + c.id + '" style="font-size:11px;margin-left:.3rem;"></span></td></tr>';
  });
  h += '</tbody></table></div>';
  cont.innerHTML = h;
}

async function etEditorGuardar(id) {
  var msg = document.getElementById('et-ed-m-' + id);
  var obj = parseFloat(String(document.getElementById('et-ed-o-' + id).value).replace(',', '.'));
  var par;
  try { par = JSON.parse(document.getElementById('et-ed-p-' + id).value || '{}'); } catch (e) { par = null; }
  if (!(obj > 0) || !par || typeof par !== 'object' || Array.isArray(par)) { if (msg) { msg.style.color = 'var(--red)'; msg.textContent = 'Objetivo o parámetros no válidos'; } return; }
  var r = await supaPatch('etapa_criterios', 'id=eq.' + id, {
    nombre: document.getElementById('et-ed-n-' + id).value, objetivo: obj, parametros: par,
    activo: document.getElementById('et-ed-a-' + id).checked
  }, getToken());
  if (r.error) {
    var t = r.error; try { t = JSON.parse(r.error).message || t; } catch (e) {}
    if (msg) { msg.style.color = 'var(--red)'; msg.textContent = String(t).slice(0, 80); }
    return;
  }
  if (msg) { msg.style.color = 'var(--green)'; msg.textContent = '✓'; }
  await _etCargarCriterios(true);
  etAdminOlvidar();
}
