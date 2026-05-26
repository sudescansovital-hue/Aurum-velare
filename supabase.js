// ============================================================
// SUPABASE — Conexión y funciones de datos
// ============================================================

const SUPABASE_URL = 'https://rsrbxcvlnbwpiyhumqmt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_KjuStc-6eWMM5IfWLerZLw_BIKiZ5iV';

let sb = null;

function initSupabase() {
  if (sb) return;
  if (typeof window.supabase === 'undefined') {
    console.error('Supabase SDK no disponible');
    return;
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  cargarDatosUsuario();
}

// ============================================================
// HISTORIALES — acumulativo por cuenta
// ============================================================

async function guardarHistorial(cuenta) {
  if (!sb || !usuarioActual) return;

  // Buscar si ya existe un registro para esta cuenta
  var res = await sb.from('historiales')
    .select('*')
    .eq('usuario_email', usuarioActual.email)
    .eq('nombre', cuenta.nombre)
    .single();

  if (res.data) {
    // Existe — actualizar acumulando
    var existente = res.data;
    var totalNuevo = existente.total + cuenta.total;
    var winsNuevo = existente.wins + cuenta.wins;
    var pnlNuevo = Math.round((existente.pnl + cuenta.pnl) * 100) / 100;
    var wrNuevo = Math.round((winsNuevo / totalNuevo * 100) * 10) / 10;

    // Fusionar fps
    var fpsExistentes = existente.fps || [];
    var fpsNuevos = cuenta.fps || [];
    var fpsMerged = [...new Set([...fpsExistentes, ...fpsNuevos])];

    await sb.from('historiales').update({
      total: totalNuevo,
      wins: winsNuevo,
      pnl: pnlNuevo,
      wr: wrNuevo,
      rr: Math.round(((existente.rr + cuenta.rr) / 2) * 100) / 100,
      periodo: existente.periodo + ' + ' + cuenta.periodo,
      fps: fpsMerged
    }).eq('id', existente.id);

    console.log('Historial actualizado: ' + cuenta.nombre);
  } else {
    // No existe — insertar nuevo
    await sb.from('historiales').insert({
      usuario_email: usuarioActual.email,
      nombre: cuenta.nombre,
      tipo: cuenta.tipo || 'challenge',
      total: cuenta.total,
      wins: cuenta.wins,
      pnl: cuenta.pnl,
      wr: cuenta.wr,
      rr: cuenta.rr,
      periodo: cuenta.periodo,
      dias: cuenta.dias,
      tipos: cuenta.tipos,
      fps: cuenta.fps || []
    });

    console.log('Historial nuevo: ' + cuenta.nombre);
  }
}

var CUENTAS_INTERNAS_HIST = ['Cuenta Maestra', 'Cuenta Retos', 'Cuenta Prueba'];

async function cargarHistoriales() {
  if (!sb || !usuarioActual) return;
  var res = await sb.from('historiales').select('*')
    .eq('usuario_email', usuarioActual.email)
    .order('created_at', { ascending: false });
  if (res.error || !res.data || res.data.length === 0) return;

  // Solo cuentas externas — excluir las tres cuentas Aurum internas
  var externas = res.data.filter(function(h) {
    return CUENTAS_INTERNAS_HIST.indexOf(h.nombre) === -1;
  });

  HISTORIAL_CUENTAS.length = 0;
  externas.forEach(function(h) {
    HISTORIAL_CUENTAS.push({ nombre:h.nombre, tipo:h.tipo, total:h.total, wins:h.wins, pnl:h.pnl, wr:h.wr, rr:h.rr, periodo:h.periodo, dias:h.dias||[], tipos:h.tipos||{}, fps:h.fps||[] });
    (h.fps||[]).forEach(function(fp){ HISTORIAL_ALL_FPS.add(fp); });
  });

  var lista = document.getElementById('hist-lista');
  if (lista) { lista.innerHTML=''; HISTORIAL_CUENTAS.forEach(function(c,i){ histAnadirFila(c,i); }); }

  actualizarGlobalesHistorial();
  console.log(externas.length + ' historiales externos cargados (de ' + res.data.length + ' totales)');
}

function actualizarGlobalesHistorial() {
  var totalTrades = HISTORIAL_CUENTAS.reduce(function(s,c){ return s + (c.total||0); }, 0);
  var totalWins   = HISTORIAL_CUENTAS.reduce(function(s,c){ return s + (c.wins||0); }, 0);
  var totalPnl    = Math.round(HISTORIAL_CUENTAS.reduce(function(s,c){ return s + (c.pnl||0); }, 0) * 100) / 100;
  var wr = totalTrades > 0 ? Math.round(totalWins / totalTrades * 1000) / 10 : 0;

  var htEl = document.getElementById('hist-global-trades');
  if (htEl) htEl.textContent = totalTrades;
  var hwEl = document.getElementById('hist-global-wr');
  if (hwEl) hwEl.textContent = wr + '%';
  var hpEl = document.getElementById('hist-global-pnl');
  if (hpEl) hpEl.textContent = (totalPnl >= 0 ? '+' : '') + totalPnl + '$';
}

// ============================================================
// DIARIO
// ============================================================

async function guardarEntradaDiarioSupabase(texto) {
  if (!sb || !usuarioActual) return false;
  var res = await sb.from('diario').insert({ usuario_email:usuarioActual.email, texto:texto, fecha:new Date().toISOString().split('T')[0] });
  return !res.error;
}

async function cargarDiario() {
  if (!sb || !usuarioActual) return;
  var res = await sb.from('diario').select('*').eq('usuario_email', usuarioActual.email).order('created_at',{ascending:false}).limit(20);
  if (res.error || !res.data) return;
  var entradas = document.getElementById('diario-entradas');
  if (!entradas) return;
  entradas.innerHTML = '';
  res.data.forEach(function(e) {
    var fechaStr = new Date(e.created_at).toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'});
    var div = document.createElement('div');
    div.style.cssText = 'background:var(--bg2);padding:1.5rem 2rem;position:relative;';
    div.innerHTML = '<div style="position:absolute;top:0;left:0;bottom:0;width:2px;background:linear-gradient(to bottom,transparent,var(--gold),transparent);"></div><div style="display:flex;justify-content:space-between;margin-bottom:.6rem;"><div style="font-size:12px;color:var(--gold-dim);">'+fechaStr+'</div><div style="font-size:11px;color:var(--green);">Guardada</div></div><div style="font-size:15px;color:var(--text-dim);line-height:1.8;">'+e.texto+'</div>';
    entradas.appendChild(div);
  });
}

// ============================================================
// AGENDA
// ============================================================

async function guardarAgendaSupabase(fecha, sesion) {
  if (!sb || !usuarioActual) return false;
  var res = await sb.from('agenda').insert({ usuario_email:usuarioActual.email, fecha:fecha, sesion:sesion });
  return !res.error;
}

async function cargarAgenda() {
  if (!sb || !usuarioActual) return;
  var hoy = new Date().toISOString().split('T')[0];
  var res = await sb.from('agenda').select('*').eq('usuario_email',usuarioActual.email).gte('fecha',hoy).order('fecha',{ascending:true});
  if (res.error || !res.data || res.data.length===0) return;
  var lista = document.getElementById('agenda-lista');
  if (!lista) return;
  lista.innerHTML = '';
  res.data.forEach(function(a) {
    var fechaStr = new Date(a.fecha+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});
    var item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:#0A0C18;border:1px solid var(--border);padding:.6rem 1rem;margin-bottom:.4rem;';
    item.innerHTML = '<div><div style="font-size:13px;color:var(--text-dim);">'+fechaStr+'</div><div style="font-size:11px;color:var(--gold);">'+a.sesion+'</div></div><div onclick="this.parentElement.remove()" style="font-size:12px;color:var(--text-muted);cursor:pointer;opacity:.5;">X</div>';
    lista.appendChild(item);
  });
}

// ============================================================
// CARGAR TODO AL INICIO
// ============================================================

async function cargarDatosUsuario() {
  await cargarHistoriales();
  await cargarDiario();
  await cargarAgenda();
  await actualizarDashboard();
}

// ============================================================
// TRADES INDIVIDUALES
// ============================================================

async function guardarTradesIndividuales(trades, cuenta) {
  if (!sb || !usuarioActual || !trades || trades.length === 0) return;
  
  var lote = trades.map(function(t) {
    return {
      usuario_email: usuarioActual.email,
      cuenta: cuenta,
      fp: t.fp,
      beneficio: Math.round((t.ben || 0) * 100) / 100,
      volumen: t.vol || 0,
      precio_entrada: t.pe || 0,
      precio_cierre: t.pc || 0,
      puntos: Math.round((t.puntos || 0) * 10) / 10,
      ganadora: t.ganadora || false,
      hora: t.hora || 0,
      dia: t.dia || 0,
      dur_min: t.durMin || 0,
      sl: t.sl != null ? Math.round(t.sl * 100) / 100 : null,
      tp: t.tp != null ? Math.round(t.tp * 100) / 100 : null
    };
  });

  // Insertar en lotes de 50 para no superar límites
  for (var i = 0; i < lote.length; i += 50) {
    var bloque = lote.slice(i, i + 50);
    var res = await sb.from('trades').upsert(bloque, { onConflict: 'fp' });
    if (res.error) console.error('Error guardando trades:', res.error);
  }
  console.log(trades.length + ' trades guardados en Supabase');
}

async function cargarTrades(cuenta) {
  if (!sb || !usuarioActual) return [];
  var query = sb.from('trades').select('*').eq('usuario_email', usuarioActual.email);
  if (cuenta) query = query.eq('cuenta', cuenta);
  var res = await query.order('created_at', { ascending: true });
  if (res.error || !res.data) return [];
  return res.data;
}

// ============================================================
// CALCULAR MÉTRICAS DEL DASHBOARD DESDE TRADES REALES
// ============================================================

async function actualizarDashboard() {
  if (!sb || !usuarioActual) return;

  console.log('[SUPA] Cargando trades para: ' + usuarioActual.email);
  var res = await sb.from('trades').select('*').eq('usuario_email', usuarioActual.email).limit(10000);
  console.log('[SUPA] Trades recibidos: ' + (res.data ? res.data.length : 0));
  if (res.error || !res.data || res.data.length === 0) return;

  var todos = res.data;
  var maestra = todos.filter(function(t){ return t.cuenta === 'Cuenta Maestra'; });
  var prueba  = todos.filter(function(t){ return t.cuenta === 'Cuenta Prueba'; });
  var retos   = todos.filter(function(t){ return t.cuenta === 'Cuenta Retos'; });

  function metricas(trades) {
    if (!trades.length) return { total:0, wins:0, wr:0, pnl:0, rr:0 };
    var wins = trades.filter(function(t){ return t.ganadora; }).length;
    var pnl  = trades.reduce(function(s,t){ return s + (t.beneficio||0); }, 0);
    var ptsW = wins > 0 ? trades.filter(function(t){ return t.ganadora; }).reduce(function(s,t){ return s+(t.puntos||0); },0)/wins : 0;
    var losses = trades.length - wins;
    var ptsL = losses > 0 ? trades.filter(function(t){ return !t.ganadora; }).reduce(function(s,t){ return s+(t.puntos||0); },0)/losses : 0;
    return {
      total: trades.length,
      wins: wins,
      wr: Math.round(wins/trades.length*1000)/10,
      pnl: Math.round(pnl*100)/100,
      rr: ptsL > 0 ? Math.round(ptsW/ptsL*100)/100 : 0
    };
  }

  function horario(trades) {
    var horas = {};
    trades.forEach(function(t) {
      var h = Math.floor(t.hora || 0);
      if (!horas[h]) horas[h] = {total:0, wins:0};
      horas[h].total++;
      if (t.ganadora) horas[h].wins++;
    });
    return horas;
  }

  function porDia(trades) {
    var dias = {0:{nombre:'Lunes',total:0,wins:0,pnl:0},1:{nombre:'Martes',total:0,wins:0,pnl:0},2:{nombre:'Miércoles',total:0,wins:0,pnl:0},3:{nombre:'Jueves',total:0,wins:0,pnl:0},4:{nombre:'Viernes',total:0,wins:0,pnl:0}};
    trades.forEach(function(t) {
      var d = t.dia >= 0 && t.dia <= 4 ? t.dia : null;
      if (d !== null) { dias[d].total++; if(t.ganadora) dias[d].wins++; dias[d].pnl += t.beneficio||0; }
    });
    return Object.values(dias).map(function(d){ return { d:d.nombre, wr:d.total>0?Math.round(d.wins/d.total*1000)/10:0, pnl:Math.round(d.pnl*100)/100, t:d.total, best:d.total>0&&(d.wins/d.total)>=0.7, bad:d.total>0&&(d.wins/d.total)<0.5 }; });
  }

  function porTipo(trades) {
    var scalp = trades.filter(function(t){ return t.dur_min < 30; });
    var intra = trades.filter(function(t){ return t.dur_min >= 30 && t.dur_min < 240; });
    var swing = trades.filter(function(t){ return t.dur_min >= 240 && t.dur_min < 1440; });
    var multi = trades.filter(function(t){ return t.dur_min >= 1440; });
    function tm(arr, label) {
      var w = arr.filter(function(t){ return t.ganadora; }).length;
      var p = arr.reduce(function(s,t){ return s+(t.beneficio||0); },0);
      return { l:label, t:arr.length, wr:arr.length>0?Math.round(w/arr.length*1000)/10:0, pnl:Math.round(p*100)/100 };
    }
    return [tm(scalp,'Scalping <30min'), tm(intra,'Intradía 30m–4h'), tm(swing,'✦ Swing 4h–24h'), tm(multi,'Multi-día >24h')];
  }

  // Calcular métricas
  var mM = metricas(maestra);
  var mP = metricas(prueba);
  var mR = metricas(retos);
  var mG = metricas(todos);

  // Guardar en window ANTES de llamar a los builders
  window.AURUM_TRADES = {
    todos: todos, maestra: maestra, prueba: prueba, retos: retos,
    metricas: { global:mG, maestra:mM, prueba:mP, retos:mR },
    horario: horario(todos),
    dias: porDia(todos),
    tipos: porTipo(todos)
  };

  // Actualizar cards explícitamente con IDs reales
  function setEl(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
  function pnlStr(m) { return (m.pnl >= 0 ? '+' : '') + m.pnl + '$'; }
  function subStr(m) { return m.total + ' trades · WR ' + m.wr + '%'; }

  setEl('card-global-pnl',   pnlStr(mG)); setEl('card-global-sub',   subStr(mG));
  setEl('card-maestra-pnl',  pnlStr(mM)); setEl('card-maestra-sub',  subStr(mM));
  setEl('card-retos-pnl',    pnlStr(mR)); setEl('card-retos-sub',    subStr(mR));
  setEl('card-prueba-pnl',   pnlStr(mP)); setEl('card-prueba-sub',   subStr(mP));

  // Build functions — tabs de gestión y dashboard
  if (typeof buildCicloDots    === 'function') buildCicloDots();
  if (typeof buildHorarios     === 'function') buildHorarios();
  if (typeof buildCumplimiento === 'function') buildCumplimiento();
  if (typeof buildEquity       === 'function') buildEquity();
  if (typeof buildTradeRecord  === 'function') buildTradeRecord();

  // Reconstruir vistas de cuentas con datos frescos
  if (typeof cuentasBuilt !== 'undefined') Object.keys(cuentasBuilt).forEach(function(k){ delete cuentasBuilt[k]; });
  if (typeof buildGlobal    === 'function') buildGlobal();
  if (typeof buildCuentaReal === 'function') {
    buildCuentaReal('maestra', 'Cuenta Maestra');
    buildCuentaReal('retos',   'Cuenta Retos');
    buildCuentaReal('prueba',  'Cuenta Prueba');
  }

  // Stats globales de Trade Record
  actualizarTradeRecord();
}

function actualizarTradeRecord() {
  var d = window.AURUM_TRADES;
  if (!d) return;
  var m = d.metricas.global;

  var els = {
    'gest-global-pnl':   (m.pnl>=0?'+':'')+m.pnl+'$',
    'gest-global-wr':    m.wr+'%',
    'gest-global-rr':    m.rr,
    'gest-global-trades': m.total + ' trades'
  };
  Object.keys(els).forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.textContent = els[id];
  });
}
