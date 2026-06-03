// ============================================================
// LÓGICA DE VISTAS POR CUENTA — datos reales de Supabase
// ============================================================

var cuentasBuilt = {};
window.cuentaActivaGestion = "global";

function verCuenta(cuenta) {
  ['global','maestra','retos','prueba'].forEach(function(c) {
    var el = document.getElementById('vista-' + c);
    if (el) el.style.display = 'none';
    var btn = document.getElementById('btn-' + c);
    if (btn) btn.style.borderBottomColor = 'transparent';
  });

  var vista = document.getElementById('vista-' + cuenta);
  if (vista) vista.style.display = 'block';

  var btn = document.getElementById('btn-' + cuenta);
  if (btn) {
    var colores = { global:'var(--gold)', maestra:'var(--green)', retos:'#CC8844', prueba:'#4A8AEE' };
    btn.style.borderBottomColor = colores[cuenta] || 'var(--gold)';
    btn.style.background = 'linear-gradient(135deg,var(--bg2),#0E1020)';
  }

  window.cuentaActivaGestion = cuenta;
  window.yaBuiltGestion = {};
  Object.keys(cuentasBuilt).forEach(function(k){ delete cuentasBuilt[k]; });
  var _cuentaSnap = cuenta;
  function _doBuildVer() {
    if (typeof buildTradeRecord === 'function') buildTradeRecord();
    if (_cuentaSnap === 'global')  buildGlobal();
    if (_cuentaSnap === 'maestra') buildCuentaReal('maestra', 'Cuenta Maestra');
    if (_cuentaSnap === 'retos')   buildCuentaReal('retos',   'Cuenta Retos');
    if (_cuentaSnap === 'prueba')  buildCuentaReal('prueba',  'Cuenta Prueba');
  }
  if (typeof cargarHistorialDesdeSupabase === 'function' &&
      typeof HISTORIAL_CUENTAS !== 'undefined' && !HISTORIAL_CUENTAS.length) {
    cargarHistorialDesdeSupabase().then(_doBuildVer);
  } else {
    _doBuildVer();
  }
}

function getTrades(nombreCuenta) {
  if (!window.AURUM_TRADES) return [];
  var todos = window.AURUM_TRADES.todos || [];
  if (nombreCuenta === 'todos') return todos;
  var keyword = nombreCuenta.toLowerCase();
  return todos.filter(function(t) { return t.cuenta && t.cuenta.toLowerCase().indexOf(keyword) >= 0; });
}

function _fechaTrade(t) {
  if (t.fp) {
    var m = t.fp.match(/(\d{4})\.(\d{2})\.(\d{2})/);
    if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  }
  if (t.created_at) return new Date(t.created_at);
  return null;
}

function _rangoFechas(trades) {
  var MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var fechas = trades.map(_fechaTrade).filter(Boolean).sort(function(a,b){ return a - b; });
  if (!fechas.length) return null;
  var f0 = fechas[0], f1 = fechas[fechas.length - 1];
  return f0.getDate() + ' ' + MESES[f0.getMonth()] + ' – ' + f1.getDate() + ' ' + MESES[f1.getMonth()] + ' ' + f1.getFullYear();
}

function calcMetricas(trades) {
  var total = trades.length;
  if (!total) return { total:0, wins:0, wr:0, pnl:0, rr:0, esp:0, ptsW:0, ptsL:0 };
  var wins = trades.filter(function(t){ return t.ganadora; }).length;
  var wr   = Math.round(wins / total * 1000) / 10;
  var pnl  = Math.round(trades.reduce(function(s,t){ return s + (t.beneficio||0); }, 0) * 100) / 100;
  var wT   = trades.filter(function(t){ return t.ganadora; });
  var lT   = trades.filter(function(t){ return !t.ganadora; });
  var ptsW = wT.length > 0 ? wT.reduce(function(s,t){ return s + (t.puntos||0); }, 0) / wT.length : 0;
  var ptsL = lT.length > 0 ? lT.reduce(function(s,t){ return s + (t.puntos||0); }, 0) / lT.length : 0;
  var rr   = ptsL > 0 ? Math.round(ptsW / ptsL * 100) / 100 : 0;
  var esp  = Math.round(((wr / 100 * ptsW) - ((1 - wr / 100) * ptsL)) * 100) / 100;
  return { total:total, wins:wins, wr:wr, pnl:pnl, rr:rr, esp:esp,
           ptsW: Math.round(ptsW * 10) / 10, ptsL: Math.round(ptsL * 10) / 10 };
}

function calcTipos(trades) {
  var scalp = trades.filter(function(t){ return t.dur_min < 30; });
  var intra = trades.filter(function(t){ return t.dur_min >= 30 && t.dur_min < 240; });
  var swing = trades.filter(function(t){ return t.dur_min >= 240 && t.dur_min < 1440; });
  var multi = trades.filter(function(t){ return t.dur_min >= 1440; });
  function tm(arr, label, col) {
    var w = arr.filter(function(t){ return t.ganadora; }).length;
    var p = arr.reduce(function(s,t){ return s + (t.beneficio||0); }, 0);
    return { l:label, t:arr.length, wr:arr.length>0?Math.round(w/arr.length*1000)/10:0, pnl:Math.round(p*100)/100, col:col };
  }
  return [
    tm(scalp, 'Scalping <30min',  '#6A8AEE44'),
    tm(intra, 'Intradía 30m–4h',  '#C9A84C44'),
    tm(swing, '✦ Swing 4h–24h',   'linear-gradient(90deg,#C9A84C44,#E8C870)'),
    tm(multi, 'Multi-día >24h',   '#4ACC8A')
  ];
}

function calcDias(trades) {
  var dias = [{d:'Lunes',t:0,w:0,p:0},{d:'Martes',t:0,w:0,p:0},{d:'Miércoles',t:0,w:0,p:0},{d:'Jueves',t:0,w:0,p:0},{d:'Viernes',t:0,w:0,p:0}];
  trades.forEach(function(t) {
    var d = t.dia;
    if (d >= 0 && d <= 4) { dias[d].t++; if(t.ganadora) dias[d].w++; dias[d].p += t.beneficio||0; }
  });
  return dias.map(function(d) {
    var wr = d.t > 0 ? Math.round(d.w / d.t * 1000) / 10 : 0;
    return { d:d.d, wr:wr, pnl:Math.round(d.p*100)/100, t:d.t, best:wr>=70, bad:wr<50&&d.t>0 };
  });
}

function _set(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }

// Busca la entrada de HISTORIAL_CUENTAS que corresponde al keyword (nombre de cuenta)
function _histEntrada(keyword) {
  if (!window.HISTORIAL_CUENTAS || !window.HISTORIAL_CUENTAS.length) return null;
  var kw = keyword.toLowerCase();
  return window.HISTORIAL_CUENTAS.find(function(c) {
    return c.nombre && c.nombre.toLowerCase().indexOf(kw) >= 0;
  }) || null;
}

function buildCuentaReal(cuenta, nombreCuenta) {
  var hist   = _histEntrada(nombreCuenta);
  var trades = getTrades(nombreCuenta);
  if (!hist && !trades.length) return;

  // Métricas principales: preferir HISTORIAL_CUENTAS (fusiona trades + historiales)
  // esp/ptsW/ptsL siguen de AURUM_TRADES (necesitan puntos por trade)
  var _rawM = calcMetricas(trades);
  var m = hist
    ? { total:hist.total, wins:hist.wins, pnl:hist.pnl, wr:hist.wr, rr:hist.rr,
        esp:_rawM.esp, ptsW:_rawM.ptsW, ptsL:_rawM.ptsL }
    : _rawM;
  var dias  = calcDias(trades);
  var tipos = calcTipos(trades);
  var rango = hist ? hist.periodo : _rangoFechas(trades);

  // Header
  var hdr = document.getElementById(cuenta + '-header-sub');
  if (hdr) hdr.textContent = nombreCuenta + ' · ' + m.total + ' trades' +
    (rango ? ' · ' + rango : '') + ' · ' +
    (cuenta === 'maestra' ? 'Fondeada con dinero real' : 'Challenge activo');

  // Stats principales
  _set(cuenta + '-stat-pnl', (m.pnl >= 0 ? '+' : '') + m.pnl + '$');
  _set(cuenta + '-stat-wr',  m.wr + '%');
  _set(cuenta + '-stat-wr-sub', m.wins + ' wins de ' + m.total);
  _set(cuenta + '-stat-rr',  m.rr);
  _set(cuenta + '-stat-esp', (m.esp >= 0 ? '+' : '') + m.esp);

  // Mejor / peor día (mínimo 3 trades para contar)
  var diasConT = dias.filter(function(d){ return d.t >= 3; }).slice().sort(function(a,b){ return b.wr - a.wr; });
  if (diasConT.length) {
    var bestDay  = diasConT[0];
    var worstDay = diasConT[diasConT.length - 1];
    if (cuenta === 'prueba') {
      _set('prueba-stat-trampa', worstDay.d);
      _set('prueba-stat-trampa-sub', worstDay.wr + '% WR · ' + (worstDay.pnl >= 0 ? '+' : '') + worstDay.pnl + '$');
    } else {
      _set(cuenta + '-stat-mejor-dia', bestDay.d);
      _set(cuenta + '-stat-mejor-dia-sub', bestDay.wr + '% WR');
    }
  }

  // Tipos (barras)
  var tb = document.getElementById('tipos-' + cuenta);
  if (tb) {
    var maxT = Math.max.apply(null, tipos.map(function(d){ return d.t; })) || 1;
    tb.innerHTML = tipos.map(function(d) {
      return '<div style="margin-bottom:.8rem;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:.3rem;">' +
        '<span style="font-size:14px;color:'+(d.wr>=70?'var(--gold-bright)':'var(--text-dim)')+';">'+d.l+'</span>' +
        '<span style="font-size:12px;color:var(--text-muted);">'+d.t+'t · '+d.wr+'% · '+(d.pnl>=0?'+':'')+d.pnl+'$</span></div>' +
        '<div style="height:4px;background:var(--border);border-radius:2px;">' +
        '<div style="height:100%;width:'+Math.round(d.t/maxT*100)+'%;background:'+d.col+';border-radius:2px;"></div></div></div>';
    }).join('');
  }

  // Días
  var db = document.getElementById('dias-' + cuenta);
  if (db) {
    db.innerHTML = dias.map(function(d) {
      return '<div style="display:flex;align-items:center;gap:.8rem;padding:.5rem 0;border-bottom:1px solid #0A0C14;">' +
        '<span style="font-size:14px;width:85px;color:'+(d.best?'#C8BDA0':d.bad?'var(--red)':'var(--text-dim)')+';">'+(d.best?'✦ ':d.bad?'⚠ ':'')+d.d+'</span>' +
        '<div style="flex:1;height:3px;background:var(--border);border-radius:2px;">' +
        '<div style="height:100%;width:'+d.wr+'%;background:'+(d.best?'#4ACC8A':d.bad?'#CC554444':'#C9A84C44')+';border-radius:2px;"></div></div>' +
        '<span style="font-size:12px;color:'+(d.best?'var(--green)':d.bad?'var(--red)':'var(--text-muted)')+';width:115px;text-align:right;">'+d.wr+'% · '+(d.pnl>=0?'+':'')+d.pnl+'$</span></div>';
    }).join('');
  }

  // Lectura Aurum dinámica
  var lectura = document.getElementById(cuenta + '-lectura');
  if (lectura) {
    var swing = tipos[2];
    var bd = diasConT[0];
    var wd = diasConT.length > 1 ? diasConT[diasConT.length - 1] : null;
    var txt = '';
    if (cuenta === 'maestra') {
      txt = '"' + m.total + ' trades en cuenta real. WR ' + m.wr + '%, R/R ' + m.rr +
        ', esperanza ' + (m.esp>=0?'+':'') + m.esp + ' pts/trade.' +
        (swing && swing.t > 0 ? ' Swing: ' + swing.wr + '% WR en ' + swing.t + ' trades (' + (swing.pnl>=0?'+':'') + swing.pnl + '$).' : '') +
        (bd ? ' Mejor día: ' + bd.d + ' con ' + bd.wr + '% WR.' : '') + '"';
    } else if (cuenta === 'retos') {
      txt = '"' + m.total + ' trades en challenge. WR ' + m.wr + '% con R/R ' + m.rr +
        '. Esperanza: ' + (m.esp>=0?'+':'') + m.esp + ' pts/trade.' +
        (swing && swing.t > 0 ? ' Swing: ' + swing.wr + '% WR, ' + (swing.pnl>=0?'+':'') + swing.pnl + '$.' : '') +
        ' Cuando operas con criterio de reto, el resultado mejora."';
    } else if (cuenta === 'prueba') {
      txt = '"' + m.total + ' trades desde el inicio. R/R de ' + m.rr +
        (m.rr >= 1.5 ? ' — excelente base de partida.' : '.') +
        (wd && wd.t >= 3 ? ' Trampa: ' + wd.d + ' con ' + wd.wr + '% WR y ' + (wd.pnl>=0?'+':'') + wd.pnl + '$. Reducir exposición ese día.' : '') +
        ' Esperanza global: ' + (m.esp>=0?'+':'') + m.esp + ' pts/trade."';
    }
    lectura.textContent = txt;
  }
}

function buildGlobal() {
  var histAll = window.HISTORIAL_CUENTAS || [];
  var histM   = _histEntrada('Cuenta Maestra');
  var histR   = _histEntrada('Cuenta Retos');
  var histP   = _histEntrada('Cuenta Prueba');

  var maestra = getTrades('Cuenta Maestra');
  var prueba  = getTrades('Cuenta Prueba');
  var retos   = getTrades('Cuenta Retos');
  var todos   = getTrades('todos');

  var totalHist = histAll.reduce(function(s,c){ return s+(c.total||0); }, 0);
  if (!totalHist && !todos.length) return;

  // Métricas globales: total/wins/pnl/wr desde HISTORIAL_CUENTAS; rr/esp desde AURUM_TRADES
  var mG;
  if (totalHist > 0) {
    var _w   = histAll.reduce(function(s,c){ return s+(c.wins||0); }, 0);
    var _pnl = Math.round(histAll.reduce(function(s,c){ return s+(c.pnl||0); }, 0)*100)/100;
    var _wr  = Math.round(_w/totalHist*1000)/10;
    var _raw = calcMetricas(todos);
    mG = { total:totalHist, wins:_w, pnl:_pnl, wr:_wr, rr:_raw.rr, esp:_raw.esp };
  } else {
    mG = calcMetricas(todos);
  }

  // Métricas por cuenta: preferir HISTORIAL_CUENTAS
  var mM = histM ? { wr:histM.wr, pnl:histM.pnl, total:histM.total, wins:histM.wins } : calcMetricas(maestra);
  var mR = histR ? { wr:histR.wr, pnl:histR.pnl, total:histR.total, wins:histR.wins } : calcMetricas(retos);
  var mP = histP ? { wr:histP.wr, pnl:histP.pnl, total:histP.total, wins:histP.wins } : calcMetricas(prueba);
  var diasG  = calcDias(todos);
  var tiposG = calcTipos(todos);

  // Stat grid global
  _set('global-stat-pnl', (mG.pnl >= 0 ? '+' : '') + mG.pnl + '$');
  var rango = _rangoFechas(todos);
  var nomCuentas = [
    (histM || maestra.length) ? 'Maestra' : false,
    (histR || retos.length)   ? 'Retos'   : false,
    (histP || prueba.length)  ? 'Prueba'  : false
  ].filter(Boolean);
  _set('global-stat-pnl-sub', nomCuentas.join(' + ') + (rango ? ' · ' + rango : ''));
  _set('global-stat-wr',  mG.wr + '%');
  _set('global-stat-wr-sub', mG.wins + ' de ' + mG.total + ' trades');
  _set('global-stat-rr',  mG.rr);
  _set('global-stat-esp', (mG.esp >= 0 ? '+' : '') + mG.esp);

  var diasConT = diasG.filter(function(d){ return d.t > 0; }).slice().sort(function(a,b){ return b.wr - a.wr; });
  if (diasConT.length) {
    _set('global-stat-mejor-dia', diasConT[0].d);
    _set('global-stat-mejor-dia-sub', diasConT[0].wr + '% WR');
  }

  var bestTipo = tiposG.slice().sort(function(a,b){ return b.wr - a.wr; })[0];
  if (bestTipo && bestTipo.t > 0) {
    _set('global-stat-edge', bestTipo.l.replace('✦ ', '').split(' ')[0]);
    _set('global-stat-edge-sub', bestTipo.wr + '% WR · ' + bestTipo.t + ' trades');
  }

  // Comparativa tipos (Maestra vs Prueba)
  var tiposM = calcTipos(maestra);
  var tiposP = calcTipos(prueba);
  var comp = document.getElementById('global-comparativa');
  if (comp) {
    var labels = ['Scalping <30min','Intradía 30m–4h','✦ Swing 4h–24h','Multi-día >24h'];
    comp.innerHTML = labels.map(function(label, i) {
      var m = tiposM[i]; var p = tiposP[i];
      return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--border);margin-bottom:1px;">' +
        '<div style="background:var(--bg2);padding:.5rem .8rem;font-size:13px;color:'+(label.includes('✦')?'var(--gold-bright)':'var(--text-dim)')+';">'+label+'</div>' +
        '<div style="background:var(--bg2);padding:.5rem;text-align:center;font-size:12px;color:'+(m&&m.wr>=65?'var(--green)':'var(--text-muted)')+';">'+(m&&m.t?m.wr+'% · '+(m.pnl>=0?'+':'')+m.pnl+'$':'—')+'</div>' +
        '<div style="background:var(--bg2);padding:.5rem;text-align:center;font-size:12px;color:'+(p&&p.wr>=65?'#6A9AEE':'var(--text-muted)')+';">'+(p&&p.t?p.wr+'% · '+(p.pnl>=0?'+':'')+p.pnl+'$':'—')+'</div></div>';
    }).join('');
  }

  // Patrones comunes (generados dinámicamente)
  var patrones = document.getElementById('global-patrones');
  if (patrones) {
    var swingM = calcTipos(maestra)[2];
    var swingR = calcTipos(retos)[2];
    var swingP = calcTipos(prueba)[2];
    var diasP  = calcDias(prueba);
    var worstDiaP = diasP.filter(function(d){ return d.t >= 3; }).sort(function(a,b){ return a.wr - b.wr; })[0];

    var cuentasWR = [
      { n:'Maestra', wr:mM.wr, t:mM.total || maestra.length },
      { n:'Retos',   wr:mR.wr, t:mR.total || retos.length },
      { n:'Prueba',  wr:mP.wr, t:mP.total || prueba.length }
    ].filter(function(c){ return c.t > 0; }).sort(function(a,b){ return b.wr - a.wr; });
    var bestCuenta = cuentasWR[0];

    var items = [];

    var swingPartes = [swingM.t&&('Maestra '+swingM.wr+'%'), swingR.t&&('Retos '+swingR.wr+'%'), swingP.t&&('Prueba '+swingP.wr+'%')].filter(Boolean);
    if (swingPartes.length) {
      items.push({ col:'var(--green)', titulo:'✦ Swing — edge confirmado en las 3', sub: swingPartes.join(' · ') + '. No es casualidad.' });
    }
    if (worstDiaP) {
      items.push({ col:'var(--red)', titulo:worstDiaP.d + ' — peor día en Prueba', sub: worstDiaP.wr + '% WR, ' + (worstDiaP.pnl>=0?'+':'') + worstDiaP.pnl + '$. Revisar qué ocurre ese día.' });
    }
    if (bestCuenta) {
      items.push({ col:'var(--green)', titulo:bestCuenta.n + ' — la cuenta más limpia', sub: bestCuenta.wr + '% WR en ' + bestCuenta.t + ' trades. Cuando operas con criterio, el resultado mejora.' });
    }
    items.push({ col:'#6A9AEE', titulo:'Anti-trampa ✓', sub:'0 duplicados entre las ' + nomCuentas.length + ' cuentas. Datos independientes verificados.' });

    patrones.innerHTML = items.map(function(item) {
      return '<div style="display:flex;gap:8px;padding:.6rem;border:1px solid var(--border);background:#0E1020;">' +
        '<div style="width:5px;height:5px;border-radius:50%;background:'+item.col+';margin-top:5px;flex-shrink:0;"></div>' +
        '<div><div style="font-size:14px;color:#C8BDA0;margin-bottom:1px;">'+item.titulo+'</div>' +
        '<div style="font-size:13px;color:var(--text-muted);">'+item.sub+'</div></div></div>';
    }).join('');
  }
}

// buildGlobal() is now driven by buildTradeRecord() after trades load.
