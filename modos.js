// ============================================================
// MODOS Y PLAN DEL DÍA en el Diario (fase B, 07/10)
// Ver: tools/post_cierre/sql_modos.sql y ESTADO.md ("Modos, plan del día y
// tablero en directo").
//
// - Plan del día (bloque "Hoy" del Diario): el trader elige modo y sesgo, para
//   todas sus cuentas o para una carpeta. Cada elección es una fila nueva de
//   plan_dia (no se sobrescribe).
// - Modo de cada trade = el del plan vigente a la hora de entrada: última fila
//   anterior DEL MISMO DÍA de servidor de su carpeta; si no hay, la de 'todas';
//   si tampoco, "sin clasificar". Una corrección a mano (trade_modo) manda.
// - "Modo" = lo que elige el trader; "Setup (EA)" = estrategia que mide la EA
//   por la distancia del SL. Son cosas distintas.
// Todo son datos y avisos: no cambia ningún cálculo del Diario.
//
// Hora de servidor MT5: los trades y plan_dia van en hora de servidor sin
// zona. El navegador la calcula con el desfase sacado de trade_eventos
// (`timestamp` = hora de servidor de la EA, `creado_en` = hora real de llegada):
// el menor (creado_en − timestamp) de los eventos recientes, redondeado a la
// hora (la cola de la EA solo puede retrasar, nunca adelantar). Sin eventos,
// se estima con la hora de Europa del Este (EET/EEST), la habitual de los
// servidores MT5.
//
// Módulo aislado: solo LEE helpers globales (supaGet, supaPost, supaDelete,
// getToken, usuarioActual) y del Diario (_daEsc, _daCarpetaDe, _daNombreCuenta,
// _daNumeroPestana, _daBenef, _daPtsTrade, _daTradesPorFp, _daFmtD, _daFmtPts,
// _daHora, _daFecha, _daPintar, _daGetTodo). diario-analisis.js lo llama en
// unos pocos puntos (carga, "Hoy", lista, detalle y panel del día).
// ============================================================

var _moModos = null;      // [{id, nombre, orden, activo}] del usuario; null = no cargados
var _moPlanes = [];       // filas de plan_dia, por hora_servidor asc
var _moCorr = {};         // fp -> { modo_id } (trade_modo)
var _moEmail = null;      // de quién son los datos cargados
var _moError = null;      // texto si la API no deja leer las tablas (p. ej. sin recargar el esquema)
var _moOffsetMs = null;   // hora de servidor − hora real (ms)
var _moOffsetFuente = null; // 'trades' | 'estimada'
var _moFiltro = 'todos';  // filtro de la lista: 'todos' | 'sin' | id de modo (texto)
var _moGuardando = false;

var MO_SESGOS = [
  { id: 'vendiendo', txt: 'Vendiendo' },
  { id: 'comprando', txt: 'Comprando' },
  { id: 'sin_sesgo', txt: 'Sin sesgo' }
];
var MO_CARPETA_TXT = { todas: 'Todas las cuentas', maestra: 'Maestra', prueba: 'Prueba', retos: 'Retos' };
var MO_EVENTOS_OFFSET = 30;   // eventos recientes de la EA para calcular el desfase
var MO_HORA_MS = 3600000;

// ── Carga ────────────────────────────────────────────────────────────────

async function _moCargar() {
  var u = window.usuarioActual;
  if (!u || !u.email || typeof supaGet !== 'function') return;
  var email = encodeURIComponent(u.email), token = getToken();
  var res = await Promise.all([
    supaGet('modos', 'usuario_email=eq.' + email + '&select=id,nombre,orden,activo&order=orden.asc,id.asc', token),
    _daGetTodo('plan_dia', 'usuario_email=eq.' + email + '&select=id,carpeta,fecha,hora_servidor,modo_id,sesgo,creado_en&order=hora_servidor.asc,id.asc'),
    _daGetTodo('trade_modo', 'usuario_email=eq.' + email + '&select=fp,modo_id&order=fp.asc'),
    supaGet('trade_eventos', 'select=timestamp,creado_en&order=creado_en.desc&limit=' + MO_EVENTOS_OFFSET, token)
  ]);
  if (!window.usuarioActual || window.usuarioActual.email !== u.email) return;
  _moEmail = u.email;

  var err = res[0].error || res[1].error || res[2].error;
  if (err) {
    console.error('[modos] error al cargar', err);
    _moError = String(err);
    _moModos = null; _moPlanes = []; _moCorr = {};
  } else {
    _moError = null;
    var modos = res[0].data;
    // Usuario sin modos (alta posterior al SQL): se crean los 3 de partida.
    if (!modos.length) {
      var rpc = await supaPost('rpc/modos_por_defecto', {}, 'return=representation', token);
      if (!rpc.error && Array.isArray(rpc.data)) modos = rpc.data;
      else console.error('[modos] no se pudieron crear los modos por defecto', rpc.error);
    }
    _moModos = modos.map(function(m) { return { id: Number(m.id), nombre: m.nombre, orden: m.orden, activo: m.activo !== false }; });
    _moPlanes = res[1].data.map(function(p) { p.modo_id = Number(p.modo_id); p._ms = _moMs(p.hora_servidor); return p; });
    _moCorr = {};
    res[2].data.forEach(function(c) { _moCorr[c.fp] = { modo_id: c.modo_id == null ? null : Number(c.modo_id) }; });
  }
  _moCalcularOffset(res[3].error ? [] : (res[3].data || []));
}

function _moCalcularOffset(eventos) {
  var deltas = eventos.map(function(e) { return Date.parse(e.timestamp) - Date.parse(e.creado_en); })
                      .filter(function(d) { return !isNaN(d); });
  if (deltas.length) {
    // timestamp (servidor) − llegada real: la llegada solo puede ir con retraso,
    // así que el mayor valor es el más cercano al desfase real.
    _moOffsetMs = Math.round(Math.max.apply(null, deltas) / MO_HORA_MS) * MO_HORA_MS;
    _moOffsetFuente = 'trades';
  } else {
    _moOffsetMs = _moOffsetEuropaEste();
    _moOffsetFuente = 'estimada';
  }
}

// Desfase de Europe/Athens (UTC+2 / UTC+3 en verano) respecto a UTC, en ms.
function _moOffsetEuropaEste() {
  try {
    var d = new Date();
    var s = d.toLocaleString('sv-SE', { timeZone: 'Europe/Athens', hour12: false }).replace(' ', 'T') + 'Z';
    return Math.round((Date.parse(s) - d.getTime()) / MO_HORA_MS) * MO_HORA_MS;
  } catch (e) { return 2 * MO_HORA_MS; }
}

// ── Hora de servidor ─────────────────────────────────────────────────────

// 'YYYY-MM-DD HH:MM:SS' / ISO sin zona (timestamp de plan_dia) → ms "UTC" (convención del Diario)
function _moMs(s) { return Date.parse(String(s).replace(' ', 'T').slice(0, 19) + 'Z'); }

function _moServidorAhoraMs() { return Date.now() + (_moOffsetMs || 0); }

function _moDiaTxt(ms) { return new Date(ms).toISOString().slice(0, 10); }

function _moHHMM(ms) { return new Date(ms).toISOString().slice(11, 16); }

function _moTxtOffset() {
  var h = Math.round((_moOffsetMs || 0) / MO_HORA_MS);
  return 'UTC' + (h >= 0 ? '+' : '−') + Math.abs(h);
}

// ── Modo de un trade ─────────────────────────────────────────────────────

function _moListo() { return !!_moModos && _moEmail === (window.usuarioActual && window.usuarioActual.email); }

function _moModo(id) {
  if (id == null || !_moModos) return null;
  return _moModos.filter(function(m) { return m.id === Number(id); })[0] || null;
}

function _moNombre(id) { var m = _moModo(id); return m ? m.nombre : 'modo borrado'; }

// Plan vigente para una carpeta a una hora de servidor (ms): última fila
// anterior del mismo día de esa carpeta; si no hay, la de 'todas'.
function _moPlanDe(carpeta, ms) {
  if (isNaN(ms)) return null;
  var dia = _moDiaTxt(ms), propio = null, todas = null;
  _moPlanes.forEach(function(p) {
    if (String(p.fecha).slice(0, 10) !== dia || p._ms > ms) return;
    if (p.carpeta === carpeta) propio = p;      // _moPlanes va en orden de hora: la última gana
    else if (p.carpeta === 'todas') todas = p;
  });
  return propio || todas;
}

// { modo (o null = sin clasificar), plan (vigente al entrar), manual }
function _moDeTrade(r) {
  var plan = _moPlanDe(_daCarpetaDe(r.cuenta_numero), _daFecha(r.fecha_entrada).getTime());
  var c = _moCorr[r.fp];
  if (c) return { modo: c.modo_id == null ? null : (_moModo(c.modo_id) || { id: c.modo_id, nombre: 'modo borrado' }), plan: plan, manual: true };
  return { modo: plan ? (_moModo(plan.modo_id) || { id: plan.modo_id, nombre: 'modo borrado' }) : null, plan: plan, manual: false };
}

// ── Lista de trades: insignia y filtro ──────────────────────────────────

function _moBadge(r) {
  if (!_moListo()) return '';
  var x = _moDeTrade(r);
  var txt = 'Modo: ' + (x.modo ? x.modo.nombre : 'sin clasificar') + (x.manual ? ' ✎' : '');
  var titulo = x.manual ? 'Modo corregido a mano' : x.plan ? 'Del plan de las ' + _moHHMM(x.plan._ms) + ' (' + MO_CARPETA_TXT[x.plan.carpeta] + ')' : 'Sin plan del día a la hora de entrada';
  var col = x.modo ? '#9FB4FF' : 'var(--text-muted)';
  return '<span title="' + _daEsc(titulo) + '" style="font-size:11px;color:' + col + ';border:1px solid ' + (x.modo ? '#9FB4FF55' : 'var(--border)') +
         ';padding:.12rem .45rem;white-space:nowrap;">' + _daEsc(txt) + '</span>';
}

function _moPasaFiltro(r) {
  if (!_moListo() || _moFiltro === 'todos') return true;
  var m = _moDeTrade(r).modo;
  return _moFiltro === 'sin' ? !m : !!m && String(m.id) === _moFiltro;
}

function _moElegirFiltro(f) { _moFiltro = f; _daAbierto = null; _daPintar(); }

function _moHtmlFiltro() {
  if (!_moListo()) return '';
  if (_moFiltro !== 'todos' && _moFiltro !== 'sin' && !_moModo(_moFiltro)) _moFiltro = 'todos';
  var chip = function(txt, f) {
    return '<button class="tab' + (_moFiltro === f ? ' active' : '') + '" style="padding:.45rem .9rem;font-size:12px;" onclick="_moElegirFiltro(\'' + f + '\')">' + _daEsc(txt) + '</button>';
  };
  return '<div style="display:flex;flex-wrap:wrap;align-items:center;">' +
           '<span style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--text-muted);margin-right:.4rem;">Modo</span>' +
           chip('Todos', 'todos') +
           _moModos.map(function(m) { return chip(m.nombre, String(m.id)); }).join('') +
           chip('Sin clasificar', 'sin') +
         '</div>';
}

// ── "Hoy": plan del día ─────────────────────────────────────────────────

// Carpetas que se pueden elegir: todas + las asignadas en el admin.
function _moCarpetas() {
  return ['todas'].concat(['maestra', 'prueba', 'retos'].filter(function(c) { return _daNumeroPestana(c); }));
}

function _moHtmlPlanHoy() {
  var h = '<div style="background:var(--bg2);border:1px solid var(--border-gold);padding:1rem 1.2rem;margin-bottom:1px;">';
  h += '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:.4rem 1rem;margin-bottom:.6rem;">' +
         '<span style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);">Plan del día</span>';
  if (_moError) {
    return h + '</div><div style="font-size:13px;color:var(--red);">No se pudieron leer tus modos y planes (' + _daEsc(_moError.slice(0, 160)) + '). ' +
           'Si las tablas son nuevas, puede que la API aún no las vea.</div></div>';
  }
  if (!_moListo()) return h + '</div><div style="font-size:13px;color:var(--text-muted);">Cargando modos…</div></div>';

  var ahora = _moServidorAhoraMs(), dia = _moDiaTxt(ahora);
  var fechaTxt = new Date(ahora).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  h += '<span style="font-size:12px;color:var(--text-muted);" title="' +
         _daEsc(_moOffsetFuente === 'trades' ? 'Hora de servidor MT5 calculada con los últimos eventos de tu EA' : 'Hora de servidor MT5 estimada (sin eventos recientes de la EA)') +
         '">Servidor MT5: ' + _daEsc(fechaTxt) + ', ' + _moHHMM(ahora) + ' (' + _moTxtOffset() + (_moOffsetFuente === 'trades' ? '' : ', estimada') + ')</span></div>';

  var hoy = _moPlanes.filter(function(p) { return String(p.fecha).slice(0, 10) === dia; });
  var carpetas = _moCarpetas();
  if (!hoy.length) {
    h += '<div style="font-size:14px;color:var(--gold-bright);margin-bottom:.7rem;">⚑ Aún no has elegido el plan de hoy. Elige modo y sesgo antes del primer trade: ' +
         'tus trades de hoy se clasificarán con él (sin plan quedan "sin clasificar").</div>';
  } else {
    // Plan en vigor ahora por carpeta (la propia o, si no tiene, el de todas)
    h += '<div style="display:flex;flex-direction:column;gap:.3rem;margin-bottom:.6rem;">';
    carpetas.forEach(function(c) {
      var p = _moPlanDe(c, ahora);
      if (!p || (c !== 'todas' && p.carpeta === 'todas')) return;
      h += '<div style="font-size:15px;color:var(--text);">' + _daEsc(MO_CARPETA_TXT[c]) + ': <span style="color:var(--gold-bright);">' +
           _daEsc(_moNombre(p.modo_id)) + ' · ' + _daEsc(_moSesgoTxt(p.sesgo).toLowerCase()) + '</span>' +
           ' <span style="font-size:12px;color:var(--text-muted);">desde las ' + _moHHMM(p._ms) + '</span></div>';
    });
    h += '</div>';
    if (hoy.length > 1) {
      h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:.6rem;">Cambios de hoy: ' +
           hoy.map(function(p) {
             return _moHHMM(p._ms) + ' ' + (p.carpeta === 'todas' ? '' : MO_CARPETA_TXT[p.carpeta] + ' ') + _moNombre(p.modo_id) + ' / ' + _moSesgoTxt(p.sesgo).toLowerCase();
           }).map(_daEsc).join(' → ') + '</div>';
    }
  }

  var sel = 'background:var(--bg);border:1px solid var(--border);color:var(--text);padding:.4rem .5rem;font:inherit;font-size:13px;';
  h += '<div style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;">' +
         '<select id="mo-plan-carpeta" style="' + sel + '" aria-label="Cuenta">' +
           carpetas.map(function(c) { return '<option value="' + c + '">' + _daEsc(MO_CARPETA_TXT[c]) + '</option>'; }).join('') + '</select>' +
         '<select id="mo-plan-modo" style="' + sel + '" aria-label="Modo">' +
           _moModos.filter(function(m) { return m.activo; }).map(function(m) { return '<option value="' + m.id + '">' + _daEsc(m.nombre) + '</option>'; }).join('') + '</select>' +
         '<select id="mo-plan-sesgo" style="' + sel + '" aria-label="Sesgo">' +
           MO_SESGOS.map(function(s) { return '<option value="' + s.id + '">' + s.txt + '</option>'; }).join('') + '</select>' +
         '<button class="btn-outline" style="padding:.4rem 1rem;font-size:12px;" onclick="_moGuardarPlan()">' + (hoy.length ? 'Cambiar plan' : 'Guardar plan') + '</button>' +
         '<span id="mo-plan-msg" style="font-size:12px;"></span>' +
       '</div>' +
       '<div style="font-size:12px;color:var(--text-muted);margin-top:.5rem;">Si lo cambias durante el día queda registrado con la hora; los trades de antes siguen con el plan anterior. ' +
       '"Todas las cuentas" vale para las que no tengan un plan propio.</div>';
  return h + '</div>';
}

function _moSesgoTxt(id) { var s = MO_SESGOS.filter(function(x) { return x.id === id; })[0]; return s ? s.txt : id; }

async function _moGuardarPlan() {
  if (_moGuardando) return;
  var msg = document.getElementById('mo-plan-msg');
  var carpeta = document.getElementById('mo-plan-carpeta').value;
  var modo = Number(document.getElementById('mo-plan-modo').value);
  var sesgo = document.getElementById('mo-plan-sesgo').value;
  if (!modo) { if (msg) { msg.style.color = 'var(--red)'; msg.textContent = 'Elige un modo.'; } return; }
  var ahora = new Date(_moServidorAhoraMs()).toISOString();
  _moGuardando = true;
  if (msg) { msg.style.color = 'var(--text-muted)'; msg.textContent = 'Guardando…'; }
  var r = await supaPost('plan_dia', {
    usuario_email: window.usuarioActual.email, carpeta: carpeta, fecha: ahora.slice(0, 10),
    hora_servidor: ahora.slice(0, 19), modo_id: modo, sesgo: sesgo
  }, 'return=representation', getToken());
  _moGuardando = false;
  if (r.error) {
    console.error('[modos] error al guardar el plan', r.error);
    if (msg) { msg.style.color = 'var(--red)'; msg.textContent = 'No se pudo guardar: ' + String(r.error).slice(0, 120); }
    return;
  }
  (r.data || []).forEach(function(p) { p.modo_id = Number(p.modo_id); p._ms = _moMs(p.hora_servidor); _moPlanes.push(p); });
  _moPlanes.sort(function(a, b) { return a._ms - b._ms || a.id - b.id; });
  _daPintar();
}

// ── Detalle de un trade: corregir el modo a mano ────────────────────────

function _moHtmlCorregir(r, clave) {
  if (!_moListo()) return '';
  var x = _moDeTrade(r);
  var origen = x.manual
    ? 'corregido a mano' + (x.plan ? '; el plan de las ' + _moHHMM(x.plan._ms) + ' decía ' + _moNombre(x.plan.modo_id) : '')
    : x.plan ? 'del plan de las ' + _moHHMM(x.plan._ms) + ' · ' + MO_CARPETA_TXT[x.plan.carpeta] + ' · ' + _moSesgoTxt(x.plan.sesgo).toLowerCase()
    : 'no había plan del día cuando lo abriste';
  var actual = x.manual ? (x.modo ? String(x.modo.id) : 'sin') : '';
  var sel = 'background:var(--bg);border:1px solid var(--border);color:var(--text);padding:.3rem .5rem;font:inherit;font-size:13px;';
  var id = 'mo-corr-' + _daEsc(clave);
  return '<div style="display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:center;margin:0 0 1rem;padding:.6rem .8rem;border-left:2px solid #9FB4FF55;font-size:13px;">' +
           '<span style="color:var(--text-dim);">Modo: <b style="color:#9FB4FF;font-weight:500;">' + _daEsc(x.modo ? x.modo.nombre : 'sin clasificar') + '</b>' +
             ' <span style="color:var(--text-muted);">(' + _daEsc(origen) + ')</span></span>' +
           '<span style="display:flex;gap:.4rem;align-items:center;margin-left:auto;">' +
             '<select id="' + id + '" style="' + sel + '" aria-label="Corregir el modo">' +
               '<option value=""' + (actual === '' ? ' selected' : '') + '>Según el plan</option>' +
               _moModos.map(function(m) { return '<option value="' + m.id + '"' + (actual === String(m.id) ? ' selected' : '') + '>' + _daEsc(m.nombre) + '</option>'; }).join('') +
               '<option value="sin"' + (actual === 'sin' ? ' selected' : '') + '>Sin clasificar</option>' +
             '</select>' +
             '<button class="tab" style="padding:.3rem .8rem;font-size:12px;" onclick="_moCorregir(\'' + _daEsc(r.fp) + '\',\'' + id + '\')">Guardar</button>' +
             '<span id="' + id + '-msg" style="font-size:12px;"></span>' +
           '</span>' +
         '</div>';
}

async function _moCorregir(fp, idSelect) {
  var el = document.getElementById(idSelect), msg = document.getElementById(idSelect + '-msg');
  if (!el) return;
  var v = el.value, token = getToken(), email = window.usuarioActual.email, r;
  if (msg) { msg.style.color = 'var(--text-muted)'; msg.textContent = 'Guardando…'; }
  if (v === '') {
    r = await supaDelete('trade_modo', 'usuario_email=eq.' + encodeURIComponent(email) + '&fp=eq.' + encodeURIComponent(fp), token);
  } else {
    r = await supaPost('trade_modo?on_conflict=usuario_email,fp',
                       { usuario_email: email, fp: fp, modo_id: v === 'sin' ? null : Number(v) },
                       'resolution=merge-duplicates,return=representation', token);
  }
  if (r.error) {
    console.error('[modos] error al corregir el modo', r.error);
    if (msg) { msg.style.color = 'var(--red)'; msg.textContent = 'No se pudo guardar.'; }
    return;
  }
  if (v === '') delete _moCorr[fp];
  else _moCorr[fp] = { modo_id: v === 'sin' ? null : Number(v) };
  _daPintar();   // reabre el detalle (_daAbierto) con el modo nuevo
}

// ── Panel del día: plan frente a realidad ───────────────────────────────

// Sesgo → dirección a favor ('sell' / 'buy'); sin sesgo → null (no se mide).
function _moFavor(sesgo) { return sesgo === 'vendiendo' ? 'sell' : sesgo === 'comprando' ? 'buy' : null; }

function _moHtmlPlanRealidad(lista) {
  if (!_moListo() || !lista.length) return '';
  var porFp = _daTradesPorFp();
  var orden = lista.slice().sort(function(a, b) { return _daFecha(a.fecha_entrada) - _daFecha(b.fecha_entrada); });
  var dia = _moDiaTxt(_daFecha(orden[0].fecha_cierre).getTime());
  var planesDia = _moPlanes.filter(function(p) { return String(p.fecha).slice(0, 10) === dia; });
  var conPlan = [], sinPlan = 0;
  orden.forEach(function(r) {
    var x = _moDeTrade(r);
    if (x.plan) conPlan.push({ r: r, plan: x.plan, favor: _moFavor(x.plan.sesgo) });
    else sinPlan++;
  });
  var frases = [];
  if (!planesDia.length) {
    frases.push('No elegiste plan este día: ' + orden.length + (orden.length === 1 ? ' trade sin clasificar' : ' trades sin clasificar') + '.');
  } else {
    frases.push('Plan: ' + planesDia.map(function(p) {
      return _moHHMM(p._ms) + ' ' + (p.carpeta === 'todas' ? '' : MO_CARPETA_TXT[p.carpeta] + ' ') + _moNombre(p.modo_id) + ' · ' + _moSesgoTxt(p.sesgo).toLowerCase();
    }).join(' → ') + '.');
    var medibles = conPlan.filter(function(x) { return x.favor; });
    if (medibles.length) {
      var p1 = medibles[0];
      frases.push('Primer trade (' + _daHora(p1.r.fecha_entrada).slice(-5) + ', ' + (p1.r.direccion === 'buy' ? 'compra' : 'venta') + '): ' +
                  (p1.r.direccion === p1.favor ? 'a favor del sesgo ✓' : 'contra el sesgo ✗') + '.');
      var contra = medibles.filter(function(x) { return x.r.direccion !== x.favor; });
      if (contra.length) {
        var conB = contra.filter(function(x) { return _daBenef(x.r, porFp) != null; });
        var usd = conB.reduce(function(s, x) { return s + _daBenef(x.r, porFp); }, 0);
        var pts = conB.reduce(function(s, x) { return s + _daPtsTrade(x.r, porFp); }, 0);
        frases.push('Contra el sesgo: ' + contra.length + (contra.length === 1 ? ' trade' : ' trades') +
                    (conB.length ? ', ' + _daFmtD(usd) + ' (' + _daFmtPts(pts) + ')' : '') + '.');
      } else {
        frases.push('Ningún trade contra el sesgo.');
      }
    } else if (conPlan.length) {
      frases.push('Plan sin sesgo: no se mide a favor / en contra.');
    }
    if (sinPlan) frases.push(sinPlan + (sinPlan === 1 ? ' trade abierto' : ' trades abiertos') + ' sin plan vigente (sin clasificar).');
  }
  return '<div style="padding:0 1.2rem 1rem;"><div class="tag" style="display:block;margin-bottom:.4rem;">Plan frente a realidad</div>' +
         '<div style="font-size:14px;color:var(--text);line-height:1.7;">' + _daEsc(frases.join(' ')) + '</div></div>';
}
