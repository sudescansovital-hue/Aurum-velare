// ============================================================
// BARRA DE ETAPA POR DÍAS LIMPIOS — Mi proceso, punto 3 (07/10)
// Ver ESTADO.md, "Mi proceso: Tu situación y barra por días limpios",
// Propuesta B, y "Punto 3 de Mi proceso".
//
// DÍA LIMPIO = día operado en el que, con los niveles de Mis reglas que el
// usuario tiene AHORA (reglas_efectivas, por carpeta de cada cuenta):
//   · ningún trade perdió la pérdida máxima por trade o más;
//   · si llegó a un nivel de pérdida diaria, no abrió más trades después;
//   · si llegó al ÚLTIMO nivel de beneficio (el de mayor importe), paró. Los
//     intermedios no cuentan como incumplimiento;
//   · solo trades de la EA ya analizados: sin SL desprotegido ni TP1 no
//     asegurado (errores graves del Diario).
// Mismo criterio que los niveles del Diario: por cuenta y día de servidor del
// cierre, P&L realizado en orden de cierre; se llega al nivel en el cierre del
// trade que lo cruza y "después" = trades de esa cuenta abiertos a partir de
// ese momento y cerrados ese día. Un día es limpio si lo es en todas sus
// cuentas.
//
// Se mide sobre `trades` (cualquier usuario). Horas: las de ea_trades si el
// trade es de la EA (exactas); si no, la del fp (cTrader / MT5 con hora) o el
// día + `hora` (en punto) y el cierre = entrada + dur_min (aproximado).
//
// BARRA = días limpios después del último cambio de etapa (última fila de
// etapa_historial; sin filas, desde la fecha de entrada en Aurum) ÷
// DL_OBJETIVO_DIAS. Solo sube: un día sucio no suma ni resta.
// Calidad reciente = % de días limpios de los últimos DL_CALIDAD_DIAS operados.
// Al 100% con calidad ≥ DL_CALIDAD_MIN → "✦ Listo para revisión de etapa".
// Son AVISOS: nunca cambia usuarios_aurum.etapa (eso lo sigue haciendo el
// admin, que al guardar etapa crea la fila de etapa_historial y la barra
// vuelve a 0).
//
// dlCalcular() es pura (la usan Mi proceso y el panel del admin).
// ============================================================

var DL_OBJETIVO_DIAS = 20;   // v1: igual para todas las etapas
var DL_CALIDAD_DIAS = 10;
var DL_CALIDAD_MIN = 80;     // %
var DL_MS_DIA = 86400000;

var _dlUltimo = null;        // último resultado de Mi proceso (para la lista de días)

// ── Utilidades ───────────────────────────────────────────────────────────

function _dlEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function _dlDolares(v) {
  var a = Math.abs(Math.round(v)), t = String(a).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '−' : '+') + t + ' $';
}

function _dlHHMM(ms) { return new Date(ms).toISOString().slice(11, 16); }
function _dlDia(ms) { return new Date(ms).toISOString().slice(0, 10); }

// Desfase hora de servidor MT5 − UTC: el de modos.js si ya está calculado; si
// no, el de Europa del Este (habitual en los servidores MT5).
function _dlOffsetMs() {
  if (typeof _moOffsetMs !== 'undefined' && _moOffsetMs != null) return _moOffsetMs;
  if (typeof _moOffsetEuropaEste === 'function') return _moOffsetEuropaEste();
  return 2 * 3600000;
}

// Entrada y cierre de un trade de `trades` en ms "hora de servidor" (convención
// del Diario: fechas de servidor etiquetadas como UTC). null si no hay fecha.
function _dlTiempos(t, eaTiempos) {
  var ea = eaTiempos && eaTiempos[t.fp];
  if (ea) return ea;
  var fp = String(t.fp || ''), e = null, m;
  if ((m = fp.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/))) {          // cTrader
    e = Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));
  } else if ((m = fp.match(/(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/))) {   // MT5 con hora
    e = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  } else {
    var d = (fp.match(/(\d{4})\.(\d{2})\.(\d{2})/) || String(t.fecha || '').match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/));
    if (!d) return null;
    e = Date.UTC(+d[1], +d[2] - 1, +d[3], t.hora != null ? +t.hora : 0, 0, 0);
  }
  var dur = parseFloat(t.dur_min);
  return { e: e, c: e + (isNaN(dur) || dur < 0 ? 0 : dur) * 60000 };
}

// reglas_efectivas (filas) → { carpeta: { trade, perdida: [..], beneficio: [..] } }
function _dlReglasPorCarpeta(filas) {
  var out = {};
  (filas || []).forEach(function(x) {
    var c = out[x.carpeta] = out[x.carpeta] || { trade: null, perdida: [], beneficio: [] };
    var n = { nivel: Number(x.nivel), valor: Number(x.valor), nombre: x.nombre || null };
    if (x.regla === 'perdida_trade') c.trade = n;
    else if (x.regla === 'perdida_dia') c.perdida.push(n);
    else if (x.regla === 'beneficio_dia') c.beneficio.push(n);
  });
  Object.keys(out).forEach(function(k) {
    out[k].perdida.sort(function(a, b) { return a.valor - b.valor; });
    out[k].beneficio.sort(function(a, b) { return a.valor - b.valor; });
  });
  return out;
}

function _dlTxtNivel(n, signo) {
  return signo + String(Math.round(n.valor)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' $' + (n.nombre ? ' «' + n.nombre + '»' : '');
}

// ── Cálculo (puro) ───────────────────────────────────────────────────────
// datos = {
//   trades:        filas de `trades` del usuario (fp, cuenta_numero, fecha, hora, dur_min, beneficio)
//   reglas:        filas de reglas_efectivas del usuario
//   cuentas:       { maestra, prueba, retos } (números asignados en el admin)
//   eaTiempos:     { fp: { e, c } } horas exactas de ea_trades (ms de servidor)
//   erroresGraves: { fp: ['SL desprotegido', ...] } (análisis de la EA)
//   desdeDia:      'YYYY-MM-DD' del último cambio de etapa (cuentan los días posteriores) o null
//   desdeIncluido: true si desdeDia también cuenta (fecha de entrada, sin etapa_historial)
// }
function dlCalcular(datos) {
  var reglas = _dlReglasPorCarpeta(datos.reglas);
  var hayReglas = Object.keys(reglas).some(function(k) {
    var r = reglas[k]; return r.trade || r.perdida.length || r.beneficio.length;
  });
  var res = { sinReglas: !hayReglas, objetivo: DL_OBJETIVO_DIAS, desdeDia: datos.desdeDia || null,
              desdeIncluido: !!datos.desdeIncluido, dias: [], limpios: 0, enPeriodo: 0, sinFecha: 0 };
  if (!hayReglas) return res;

  var cu = datos.cuentas || {};
  var carpetaDe = function(num) {
    var n = String(num);
    if (cu.maestra && String(cu.maestra) === n) return 'maestra';
    if (cu.prueba && String(cu.prueba) === n) return 'prueba';
    if (cu.retos && String(cu.retos) === n) return 'retos';
    return 'todas';
  };

  // Trades con horas, agrupados por cuenta y día de cierre
  var grupos = {};
  (datos.trades || []).forEach(function(t) {
    if (t.beneficio == null || isNaN(parseFloat(t.beneficio))) return;
    var tt = _dlTiempos(t, datos.eaTiempos);
    if (!tt) { res.sinFecha++; return; }
    var dia = _dlDia(tt.c), k = (t.cuenta_numero || '?') + '|' + dia;
    (grupos[k] = grupos[k] || { cuenta: t.cuenta_numero, dia: dia, lista: [] })
      .lista.push({ fp: t.fp, b: parseFloat(t.beneficio), e: tt.e, c: tt.c });
  });

  var porDia = {};
  Object.keys(grupos).forEach(function(k) {
    var g = grupos[k], r = reglas[carpetaDe(g.cuenta)] || reglas.todas || { trade: null, perdida: [], beneficio: [] };
    var d = porDia[g.dia] = porDia[g.dia] || { dia: g.dia, trades: 0, motivos: [], pnl: 0 };
    var lista = g.lista.sort(function(a, b) { return a.c - b.c; });
    var cuentaTxt = carpetaDe(g.cuenta) === 'todas' ? String(g.cuenta) : carpetaDe(g.cuenta).charAt(0).toUpperCase() + carpetaDe(g.cuenta).slice(1);
    var ultimoB = r.beneficio.length ? r.beneficio[r.beneficio.length - 1] : null;
    var acum = 0, hechoP = false, hechoB = false;
    d.trades += lista.length;
    lista.forEach(function(x) {
      d.pnl += x.b;
      acum += x.b;
      if (r.trade && x.b <= -r.trade.valor) {
        d.motivos.push(cuentaTxt + ': un trade perdió ' + _dlDolares(x.b).slice(1) + ' a las ' + _dlHHMM(x.c) +
                       ' (pérdida máx. por trade ' + _dlTxtNivel(r.trade, '') + ')');
      }
      var despues = function() { return lista.filter(function(y) { return y !== x && y.e >= x.c; }).length; };
      if (!hechoP && r.perdida.length && acum <= -r.perdida[0].valor) {
        hechoP = true;
        // El nivel más profundo alcanzado en ese cierre, para el texto
        var alc = r.perdida.filter(function(n) { return acum <= -n.valor; }).pop();
        var n1 = despues();
        if (n1) d.motivos.push(cuentaTxt + ': llegó a ' + _dlTxtNivel(alc, '−') + ' a las ' + _dlHHMM(x.c) + ' y abrió ' + n1 + (n1 === 1 ? ' trade' : ' trades') + ' después');
      }
      if (!hechoB && ultimoB && acum >= ultimoB.valor) {
        hechoB = true;
        var n2 = despues();
        if (n2) d.motivos.push(cuentaTxt + ': llegó a ' + _dlTxtNivel(ultimoB, '+') + ' (último nivel de beneficio) a las ' + _dlHHMM(x.c) + ' y siguió: ' + n2 + (n2 === 1 ? ' trade' : ' trades'));
      }
      var eg = datos.erroresGraves && datos.erroresGraves[x.fp];
      if (eg && eg.length) d.motivos.push(cuentaTxt + ': ' + eg.join(' y ') + ' en el trade de las ' + _dlHHMM(x.e) + ' (análisis de la EA)');
    });
  });

  res.dias = Object.keys(porDia).sort().reverse().map(function(k) {
    var d = porDia[k]; d.limpio = !d.motivos.length;
    d.cuenta = !res.desdeDia || (res.desdeIncluido ? d.dia >= res.desdeDia : d.dia > res.desdeDia);
    return d;
  });
  var periodo = res.dias.filter(function(d) { return d.cuenta; });
  res.enPeriodo = periodo.length;
  res.limpios = periodo.filter(function(d) { return d.limpio; }).length;
  res.pct = Math.min(100, Math.round(res.limpios / res.objetivo * 100));
  var ult = res.dias.slice(0, DL_CALIDAD_DIAS);
  var ultLimpios = ult.filter(function(d) { return d.limpio; }).length;
  res.calidad = { n: ult.length, limpios: ultLimpios, pct: ult.length ? Math.round(ultLimpios / ult.length * 100) : null };
  res.listo = res.limpios >= res.objetivo && ult.length >= DL_CALIDAD_DIAS && res.calidad.pct >= DL_CALIDAD_MIN;
  return res;
}

// ── Datos de un usuario (Mi proceso: lo ya cargado; admin: consultas) ─────

function _dlDesde(historial, perfil) {
  var off = _dlOffsetMs();
  if (historial && historial.created_at) {
    return { dia: _dlDia(Date.parse(historial.created_at) + off), incluido: false, etapa: historial.etapa, fuente: 'etapa' };
  }
  var f = perfil && (perfil.fecha_entrada || perfil.created_at);
  if (f) return { dia: _dlDia(Date.parse(f) + off), incluido: true, fuente: 'entrada' };
  return { dia: null, incluido: false, fuente: null };
}

function _dlEaTiempos(filasEa) {
  var m = {};
  (filasEa || []).forEach(function(t) {
    if (!t.fp || !t.fecha_entrada || !t.fecha_cierre) return;
    var e = Date.parse(t.fecha_entrada), c = Date.parse(t.fecha_cierre);
    if (!isNaN(e) && !isNaN(c)) m[t.fp] = { e: e, c: c };
  });
  return m;
}

function _dlErroresGraves(analisis) {
  var m = {};
  (analisis || []).forEach(function(r) {
    var l = [];
    if (r.sl_desprotegido) l.push('SL desprotegido');
    if (r.tp1_no_asegurado) l.push('TP1 no asegurado');
    if (l.length) m[r.fp] = l;
  });
  return m;
}

// Para el admin: todo lo de un usuario con consultas propias.
async function dlCargarUsuario(u) {
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
    supaGet('reglas_efectivas', 'usuario_email=eq.' + email + '&select=carpeta,regla,nivel,valor,nombre', token),
    todo('ea_trades', 'usuario_email=eq.' + email + '&estado=eq.closed&fecha_cierre=not.is.null&select=fp,fecha_entrada,fecha_cierre&order=fp.asc'),
    todo('post_cierre_analisis', 'usuario_email=eq.' + email + '&select=fp,sl_desprotegido,tp1_no_asegurado&order=fp.asc'),
    supaGet('etapa_historial', 'usuario_email=eq.' + email + '&order=created_at.desc&limit=1', token)
  ]);
  if (res[0].error || res[1].error) return { error: res[0].error || res[1].error };
  var desde = _dlDesde(!res[4].error && res[4].data && res[4].data[0], u);
  return dlCalcular({
    trades: res[0].data, reglas: res[1].data,
    cuentas: { maestra: u.cuenta_maestra, prueba: u.cuenta_prueba, retos: u.cuenta_retos },
    eaTiempos: res[2].error ? {} : _dlEaTiempos(res[2].data),
    erroresGraves: res[3].error ? {} : _dlErroresGraves(res[3].data),
    desdeDia: desde.dia, desdeIncluido: desde.incluido
  });
}

// ── Mi proceso / Mi gestión: recuadro "Tu nivel" y tarjeta "Nivel actual" ──

var DL_ETAPAS = ['Descubrimiento', 'Silencio', 'Umbral', 'Estructura', 'Fractura', 'Claridad', 'Consistencia', 'Confianza', 'Paciencia', 'Rentabilidad', 'Vuelo', '✦ Oro'];

function _dlSiguienteEtapa() {
  var u = window.usuarioActual || {};
  var e = u.etapa_real != null ? u.etapa_real : (u.etapa || 1);
  var i = Math.min(Math.max(0, e), DL_ETAPAS.length - 1);
  return DL_ETAPAS[Math.min(i + 1, DL_ETAPAS.length - 1)];
}

function _dlPintar(r, historial) {
  var set = function(id, prop, v) { var el = document.getElementById(id); if (el) el[prop] = v; };
  var sig = _dlSiguienteEtapa();
  if (!r) {
    ['dash-nivel', 'sidebar-nivel'].forEach(function(p) {
      set(p + '-pct', 'textContent', '—');
      set(p + '-dl', 'innerHTML', '<div style="color:var(--text-muted);">No se pudieron calcular tus días limpios.</div>');
    });
    return;
  }
  if (r.sinReglas) {
    var msg = 'Define tus reglas en <span style="color:var(--gold);cursor:pointer;text-decoration:underline;" onclick="irA(\'gestion\');setTimeout(function(){var t=document.getElementById(\'gtab-reglas\');if(t)t.click();},400);">Mis reglas</span> para empezar a medir tu progreso.';
    ['dash-nivel', 'sidebar-nivel'].forEach(function(p) {
      var f0 = document.getElementById(p + '-fill'); if (f0) f0.style.width = '0%';
      set(p + '-pct', 'textContent', '—');
      set(p + '-dl', 'innerHTML', '<div style="color:var(--text-muted);line-height:1.5;">' + msg + '</div>');
    });
    set('dash-nivel-sub', 'textContent', 'Define tus reglas para medir tu progreso');
    return;
  }
  var linea1 = r.limpios + ' de ' + r.objetivo + ' días limpios → ' + sig;
  var cal = r.calidad.n ? 'Últimos ' + r.calidad.n + ' días: ' + r.calidad.limpios + '/' + r.calidad.n + ' limpios' : 'Aún sin días operados';
  var desde = r.desdeDia ? 'desde ' + (r.desdeIncluido ? 'el ' : 'el día siguiente al ') + new Date(r.desdeDia + 'T12:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) +
              (historial && historial.fuente === 'etapa' ? ' (último cambio de etapa)' : ' (entrada en Aurum)') : '';
  var html = '<div style="color:var(--text-dim);">' + _dlEsc(linea1) + '</div>' +
             '<div style="color:var(--text-muted);">' + _dlEsc(cal) + '</div>' +
             (r.listo ? '<div style="color:var(--gold-bright);margin-top:.2rem;">✦ Listo para revisión de etapa</div>' : '') +
             '<div style="color:var(--gold-dim);cursor:pointer;margin-top:.25rem;text-decoration:underline;" onclick="dlVerDias()">Ver días</div>';
  ['dash-nivel', 'sidebar-nivel'].forEach(function(p) {
    var f1 = document.getElementById(p + '-fill'); if (f1) f1.style.width = r.pct + '%';
    set(p + '-pct', 'textContent', r.pct + '%');
    set(p + '-dl', 'innerHTML', html);
    var barra = document.getElementById(p + '-fill');
    if (barra && barra.parentNode) { barra.parentNode.style.cursor = 'pointer'; barra.parentNode.onclick = dlVerDias; barra.parentNode.title = desde; }
  });
  set('dash-nivel-sub', 'textContent', r.limpios + '/' + r.objetivo + ' días limpios hacia ' + sig + (r.listo ? ' · ✦ listo para revisión' : ''));
}

async function buildDiasLimpios() {
  var u = window.usuarioActual;
  if (!u || !u.email || typeof dlCalcular !== 'function') return;
  if (typeof _daCargar === 'function' && (_daDatos == null || _daDatosEmail !== u.email)) await _daCargar();
  if (!window.usuarioActual || window.usuarioActual.email !== u.email) return;
  var h = await supaGet('etapa_historial', 'usuario_email=eq.' + encodeURIComponent(u.email) + '&order=created_at.desc&limit=1', getToken());
  if (!window.usuarioActual || window.usuarioActual.email !== u.email) return;
  var desde = _dlDesde(!h.error && h.data && h.data[0], u);
  // Reglas: las mismas que ya cargó el Diario (reglas_efectivas); si no, se piden.
  var reglas = null;
  if (typeof _daReglas !== 'undefined' && _daReglas && _daDatosEmail === u.email) {
    reglas = [];
    Object.keys(_daReglas).forEach(function(c) {
      _daReglas[c].forEach(function(n) { reglas.push({ carpeta: c, regla: n.regla, nivel: n.nivel, valor: n.valor, nombre: n.nombre }); });
    });
  } else {
    var rr = await supaGet('reglas_efectivas', 'usuario_email=eq.' + encodeURIComponent(u.email) + '&select=carpeta,regla,nivel,valor,nombre', getToken());
    if (rr.error) { _dlPintar(null); return; }
    reglas = rr.data || [];
  }
  var mios = _daDatosEmail === u.email;
  _dlUltimo = dlCalcular({
    trades: (window.AURUM_TRADES && window.AURUM_TRADES.todos) || [],
    reglas: reglas,
    cuentas: { maestra: u.cuenta_maestra, prueba: u.cuenta_prueba, retos: u.cuenta_retos },
    eaTiempos: mios ? _dlEaTiempos(_daEa) : {},
    erroresGraves: mios ? _dlErroresGraves(_daAnalizadas(_daDatos || [])) : {},
    desdeDia: desde.dia, desdeIncluido: desde.incluido
  });
  _dlUltimo.historial = desde;
  _dlPintar(_dlUltimo, desde);
}

// Lista de días (al pulsar la barra o "Ver días")
function dlVerDias() {
  var r = _dlUltimo;
  if (!r || r.sinReglas) return;
  var prev = document.getElementById('dl-modal');
  if (prev) prev.remove();
  var fecha = function(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' }); };
  var periodo = r.dias.filter(function(d) { return d.cuenta; });
  var otros = r.dias.filter(function(d) { return !d.cuenta; }).slice(0, Math.max(0, DL_CALIDAD_DIAS - periodo.length));
  var fila = function(d) {
    return '<div style="display:grid;grid-template-columns:110px 1fr;gap:.6rem;padding:.45rem 0;border-top:1px solid var(--border);font-size:13px;">' +
             '<span style="color:var(--text-dim);">' + _dlEsc(fecha(d.dia)) + '</span>' +
             '<span>' + (d.limpio ? '<span style="color:var(--green);">✓ Limpio</span>' : '<span style="color:var(--red);">✗ No limpio</span>') +
               ' <span style="color:var(--text-muted);">· ' + d.trades + (d.trades === 1 ? ' trade' : ' trades') + ' · ' + _dlEsc(_dlDolares(d.pnl)) + '</span>' +
               d.motivos.map(function(m) { return '<div style="color:var(--text-muted);font-size:12px;">· ' + _dlEsc(m) + '</div>'; }).join('') +
             '</span></div>';
  };
  var desde = r.historial;
  var h = '<div style="position:fixed;inset:0;background:#080A12EE;z-index:600;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:2rem 1rem;" id="dl-modal" onclick="if(event.target===this)this.remove()">' +
          '<div style="background:var(--bg2);border:1px solid var(--border-gold);max-width:640px;width:100%;padding:1.2rem 1.4rem;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem;">' +
              '<span class="tag" style="margin:0;">Días limpios</span>' +
              '<button class="tab" style="padding:.2rem .7rem;" onclick="document.getElementById(\'dl-modal\').remove()" aria-label="Cerrar">✕</button></div>' +
            '<div style="font-size:15px;color:var(--text);margin-bottom:.3rem;">' + r.limpios + ' de ' + r.objetivo + ' días limpios' +
              (r.listo ? ' · <span style="color:var(--gold-bright);">✦ Listo para revisión de etapa</span>' : '') + '</div>' +
            '<div style="font-size:12px;color:var(--text-muted);line-height:1.6;margin-bottom:.8rem;">' +
              (r.desdeDia ? 'Cuentan los días operados ' + (r.desdeIncluido ? 'desde el ' : 'después del ') + _dlEsc(fecha(r.desdeDia)) +
                (desde && desde.fuente === 'etapa' ? ' (tu último cambio de etapa)' : ' (tu entrada en Aurum: aún no hay cambios de etapa)') + '. ' : '') +
              'Un día es limpio si ningún trade pasó tu pérdida máxima por trade, no abriste más trades tras llegar a un nivel de pérdida diaria, ' +
              'paraste al llegar a tu último nivel de beneficio y, en los trades de la EA, no hubo SL desprotegido ni TP1 no asegurado. ' +
              'Los niveles son los que tienes ahora en Mis reglas. Un día sucio no resta. Es un aviso: la etapa la cambia el Águila.' +
              (r.sinFecha ? ' (' + r.sinFecha + ' trades sin fecha no cuentan.)' : '') + '</div>' +
            (periodo.length ? periodo.map(fila).join('') : '<div style="font-size:13px;color:var(--text-muted);padding:.5rem 0;">Aún no has operado desde entonces.</div>') +
            (otros.length ? '<div style="font-size:12px;color:var(--text-muted);margin-top:1rem;">Anteriores (solo cuentan para la calidad de los últimos ' + DL_CALIDAD_DIAS + ' días):</div>' + otros.map(fila).join('') : '') +
          '</div></div>';
  document.body.insertAdjacentHTML('beforeend', h);
}

// ── Panel del admin: "15/20 · 80%" o "✦ listo" junto a la etapa ─────────

var _dlAdminCache = {};

async function dlAdminPintar(usuarios) {
  for (var i = 0; i < (usuarios || []).length; i++) {
    var u = usuarios[i];
    var el = document.getElementById('adm-dl-' + i);
    if (!el || !u.email) continue;
    var r = _dlAdminCache[u.email];
    if (!r) {
      try { r = await dlCargarUsuario(u); } catch (e) { r = { error: e.message }; }
      _dlAdminCache[u.email] = r;
    }
    el = document.getElementById('adm-dl-' + i);
    if (!el) continue;
    if (r.error) { el.textContent = ''; continue; }
    if (r.sinReglas) { el.innerHTML = '<span style="color:var(--text-muted);" title="Sin niveles en Mis reglas">sin reglas</span>'; continue; }
    el.innerHTML = r.listo
      ? '<span style="color:var(--gold-bright);" title="' + r.limpios + '/' + r.objetivo + ' días limpios · últimos ' + r.calidad.n + ': ' + r.calidad.pct + '%">✦ listo</span>'
      : '<span title="Días limpios desde el último cambio de etapa · % limpios de los últimos ' + DL_CALIDAD_DIAS + ' días operados">' +
          r.limpios + '/' + r.objetivo + (r.calidad.pct != null ? ' · ' + r.calidad.pct + '%' : '') + '</span>';
  }
}

function dlAdminOlvidar(email) { if (email) delete _dlAdminCache[email]; else _dlAdminCache = {}; }
