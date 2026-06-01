// ============================================================
// LÓGICA DE MI GESTIÓN — datos reales de Supabase
// ============================================================

function _esperarTrades(fn) {
  function intentar(n) {
    if (window.AURUM_TRADES && window.AURUM_TRADES.todos && window.AURUM_TRADES.todos.length > 0) {
      fn();
    } else if (n > 0) {
      setTimeout(function() { intentar(n - 1); }, 500);
    }
  }
  intentar(10);
}

function gestTab(id) {
  ['trade-record','ciclo111','horarios','equity','cumplimiento','estadisticas','diario','historial'].forEach(function(p) {
    var el = document.getElementById('gpanel-' + p);
    if (el) el.style.display = 'none';
    var tb = document.getElementById('gtab-' + p);
    if (tb) tb.classList.remove('active');
  });
  var panel = document.getElementById('gpanel-' + id);
  if (panel) panel.style.display = 'block';
  var tab = document.getElementById('gtab-' + id);
  if (tab) tab.classList.add('active');
  if (id === 'trade-record') _esperarTrades(buildTradeRecord);
  if (id === 'horarios')     _esperarTrades(buildHorarios);
  if (id === 'ciclo111')     _esperarTrades(buildCicloDots);
  if (id === 'equity')       _esperarTrades(buildEquity);
  if (id === 'cumplimiento')  _esperarTrades(buildCumplimiento);
  if (id === 'estadisticas')  _esperarTrades(buildEstadisticasAvanzadas);
  if (id === 'historial') init_historial();
  if (typeof aplicarEspaciadoPaneles === 'function') setTimeout(aplicarEspaciadoPaneles, 50);
}

function getTradesActivos() {
  var cuenta = window.cuentaActivaGestion || 'global';
  if (!window.AURUM_TRADES) return [];
  var todos = window.AURUM_TRADES.todos || [];
  if (cuenta === 'global') return todos;
  var keyword = { maestra:'maestra', retos:'retos', prueba:'prueba' }[cuenta];
  if (!keyword) return todos;
  return todos.filter(function(t) {
    return t.cuenta && t.cuenta.toLowerCase().indexOf(keyword) >= 0;
  });
}

function buildTradeRecord() {
  var trades = getTradesActivos();
  var tb = document.getElementById('gest-tipos-bars');
  if (tb && !trades.length) { tb.innerHTML = ''; }
  if (tb && trades.length) {
    var scalp = trades.filter(function(t){ return t.dur_min < 30; });
    var intra = trades.filter(function(t){ return t.dur_min >= 30 && t.dur_min < 240; });
    var swing = trades.filter(function(t){ return t.dur_min >= 240 && t.dur_min < 1440; });
    var multi = trades.filter(function(t){ return t.dur_min >= 1440; });
    function _tm(arr, label) {
      var w = arr.filter(function(t){ return t.ganadora; }).length;
      var p = arr.reduce(function(s,t){ return s+(t.beneficio||0); },0);
      return { l:label, t:arr.length, wr:arr.length>0?Math.round(w/arr.length*1000)/10:0, pnl:Math.round(p*100)/100 };
    }
    var tipos = [_tm(scalp,'Scalping <30min'), _tm(intra,'Intradía 30m–4h'), _tm(swing,'✦ Swing 4h–24h'), _tm(multi,'Multi-día >24h')];
    var maxT = Math.max.apply(null, tipos.map(function(d){ return d.t; })) || 1;
    tb.innerHTML = tipos.map(function(d) {
      var col = d.l.includes('Swing') ? 'linear-gradient(90deg,#C9A84C44,#E8C870)' : d.l.includes('Multi') ? '#4ACC8A' : d.l.includes('Scalp') ? '#6A8AEE55' : '#CC554455';
      return '<div style="margin-bottom:.8rem;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:.3rem;">' +
        '<span style="font-size:15px;color:'+(d.wr>=70?'var(--gold-bright)':'var(--text-dim)')+';">'+d.l+'</span>' +
        '<span style="font-size:13px;color:var(--text-muted);">'+d.t+'t · '+d.wr+'% WR · '+(d.pnl>=0?'+':'')+d.pnl+'$</span></div>' +
        '<div style="height:4px;background:var(--border);border-radius:2px;">' +
        '<div style="height:100%;width:'+Math.round(d.t/maxT*100)+'%;background:'+col+';border-radius:2px;"></div></div></div>';
    }).join('');
  }

  // Populate the stats row for the active account view.
  // Reset cuentasBuilt so the builder always runs with fresh data.
  var cuenta = window.cuentaActivaGestion || 'global';
  if (typeof cuentasBuilt !== 'undefined') cuentasBuilt[cuenta] = false;
  if (cuenta === 'global'  && typeof buildGlobal     === 'function') buildGlobal();
  if (cuenta === 'maestra' && typeof buildCuentaReal === 'function') buildCuentaReal('maestra', 'Cuenta Maestra');
  if (cuenta === 'retos'   && typeof buildCuentaReal === 'function') buildCuentaReal('retos',   'Cuenta Retos');
  if (cuenta === 'prueba'  && typeof buildCuentaReal === 'function') buildCuentaReal('prueba',  'Cuenta Prueba');
}

function buildHorarios() {
  var trades = getTradesActivos();
  if (trades.length < 5) {
    var elT = document.getElementById('gest-horarios-titulo');
    if (elT) elT.textContent = 'Mapa horario real';
    var elV = document.getElementById('gest-horarios-ventana');
    if (elV) elV.textContent = '▲ Tu ventana real (17:00–02:00) · —';
    ['gest-horas-barras','gest-dias-semana','gest-patrones'].forEach(function(id) {
      var e = document.getElementById(id); if (e) e.innerHTML = '';
    });
    return;
  }

  // Compute per-hour stats once, reused by all sections below
  var porHora = {};
  for (var h = 0; h < 24; h++) porHora[h] = {t:0, w:0, p:0};
  trades.forEach(function(t) {
    var h = Math.floor(t.hora || 0);
    if (h >= 0 && h < 24) {
      porHora[h].t++;
      if (t.ganadora) porHora[h].w++;
      porHora[h].p += (t.beneficio || 0);
    }
  });

  // Title: real trade count
  var elTitulo = document.getElementById('gest-horarios-titulo');
  if (elTitulo) elTitulo.textContent = 'Mapa horario real — ' + trades.length + ' trades';

  // Ventana real (17:00–02:00 = hours 17–23 + 0–1): compute P&L inside/outside
  var pnlDentro = 0, pnlFuera = 0;
  for (var h = 0; h < 24; h++) {
    if (h >= 17 || h <= 1) pnlDentro += porHora[h].p;
    else pnlFuera += porHora[h].p;
  }
  pnlDentro = Math.round(pnlDentro);
  pnlFuera  = Math.round(pnlFuera);
  var elVentana = document.getElementById('gest-horarios-ventana');
  if (elVentana) {
    elVentana.textContent = '▲ Tu ventana real (17:00–02:00) · Dentro: ' +
      (pnlDentro >= 0 ? '+' : '') + pnlDentro + '$ · Fuera: ' +
      (pnlFuera  >= 0 ? '+' : '') + pnlFuera  + '$';
  }

  // Hora bars
  var hb = document.getElementById('gest-horas-barras');
  if (hb) {
    hb.innerHTML = '';
    var mx = Math.max.apply(null, Object.keys(porHora).map(function(k){ return porHora[k].t; })) || 1;
    for (var h = 0; h < 24; h++) {
      var d = porHora[h];
      var wr = d.t > 0 ? Math.round(d.w/d.t*100) : 0;
      var col = document.createElement('div');
      col.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;';
      var ht = d.t === 0 ? 1 : Math.max(3, (d.t/mx)*85);
      var bg = d.t === 0 ? 'var(--border)' : wr >= 70 ? '#3AAA6A' : wr >= 50 ? '#C9A84C44' : '#CC554466';
      col.innerHTML = '<div style="width:100%;height:'+ht+'px;background:'+bg+';border-radius:1px 1px 0 0;" title="'+h+':xx · '+d.t+' trades · WR '+wr+'%"></div>' +
        '<div style="font-size:9px;color:var(--text-muted);margin-top:2px;">'+h+'</div>';
      hb.appendChild(col);
    }
  }

  // Días de la semana
  var ds = document.getElementById('gest-dias-semana');
  if (ds) {
    var dias = [{d:'Lunes',t:0,w:0,p:0},{d:'Martes',t:0,w:0,p:0},{d:'Miércoles',t:0,w:0,p:0},{d:'Jueves',t:0,w:0,p:0},{d:'Viernes',t:0,w:0,p:0}];
    trades.forEach(function(t) {
      var d = t.dia;
      if (d >= 0 && d <= 4) { dias[d].t++; if(t.ganadora) dias[d].w++; dias[d].p += t.beneficio||0; }
    });
    var sorted = dias.map(function(d) {
      return { d:d.d, wr:d.t>0?Math.round(d.w/d.t*1000)/10:0, pnl:Math.round(d.p*100)/100, t:d.t };
    }).sort(function(a,b){ return b.wr-a.wr; });
    ds.innerHTML = sorted.map(function(d) {
      var best = d.wr >= 65; var bad = d.wr < 50 && d.t > 0;
      return '<div style="display:flex;align-items:center;gap:.8rem;padding:.5rem 0;border-bottom:1px solid #0A0C14;">' +
        '<span style="font-size:14px;width:85px;color:'+(best?'#C8BDA0':bad?'var(--red)':'var(--text-dim)')+';">'+(best?'✦ ':bad?'⚠ ':'')+d.d+'</span>' +
        '<div style="flex:1;height:3px;background:var(--border);border-radius:2px;">' +
        '<div style="height:100%;width:'+d.wr+'%;background:'+(best?'#4ACC8A':bad?'#CC554444':'#C9A84C44')+';border-radius:2px;"></div></div>' +
        '<span style="font-size:13px;color:'+(best?'var(--green)':bad?'var(--red)':'var(--text-muted)')+';width:115px;text-align:right;">'+d.wr+'% · '+(d.pnl>=0?'+':'')+d.pnl+'$</span></div>';
    }).join('');
  }

  // Patrones detectados: top-2 mejores y top-2 peores horas (mínimo 5 trades)
  var elPatrones = document.getElementById('gest-patrones');
  if (elPatrones) {
    var horaList = [];
    for (var h = 0; h < 24; h++) {
      if (porHora[h].t >= 5) {
        var wr = Math.round(porHora[h].w / porHora[h].t * 100);
        horaList.push({ h:h, t:porHora[h].t, wr:wr, pnl:Math.round(porHora[h].p) });
      }
    }
    if (horaList.length) {
      horaList.sort(function(a, b){ return b.wr - a.wr; });
      var mejores = horaList.slice(0, 2);
      var peores  = horaList.slice(-2).reverse();
      var items   = mejores.concat(peores);
      var etiquetas = ['mejor hora', 'segunda mejor', 'hora difícil', 'peor hora'];
      elPatrones.innerHTML = items.map(function(d, i) {
        var esMejor = i < mejores.length;
        var color   = esMejor ? 'var(--green)' : 'var(--red)';
        var pnlStr  = (d.pnl >= 0 ? '+' : '') + d.pnl + '$';
        return '<div style="display:flex;gap:8px;padding:.6rem;border:1px solid var(--border);background:#0E1020;">' +
          '<div style="width:5px;height:5px;border-radius:50%;background:'+color+';margin-top:5px;flex-shrink:0;"></div>' +
          '<div><div style="font-size:14px;color:#C8BDA0;margin-bottom:1px;">'+d.h+':xx — '+etiquetas[i]+'</div>' +
          '<div style="font-size:13px;color:var(--text-muted);">'+d.wr+'% WR · '+d.t+' trades · '+pnlStr+'</div></div></div>';
      }).join('');
    }
  }
}

function buildCicloDots() {
  var trades = getTradesActivos();
  var cd = document.getElementById('gest-ciclo-dots');

  if (trades.length < 5) {
    ['ciclo-num-actual','ciclo-encurso-txt','ciclo-wr','ciclo-wr-sub','ciclo-pnl',
     'ciclo-rr','ciclo-rr-sub','ciclo-esp','ciclo-cumpl','ciclo-cumpl-sub',
     'ciclo-puntuacion','ciclo-veredicto-txt'].forEach(function(id) {
      var e = document.getElementById(id); if (e) e.textContent = '—';
    });
    if (cd) cd.innerHTML = '';
    return;
  }

  // Calcular ciclos
  var cicloActual = Math.floor(trades.length / 111) + 1;
  var enCurso = trades.length % 111 || 111;
  var completados = Math.floor(trades.length / 111);

  // Actualizar textos de ciclo
  var el;
  el = document.getElementById('ciclo-num-actual'); if (el) el.textContent = cicloActual;
  el = document.getElementById('ciclo-encurso-txt'); if (el) el.textContent = 'Ciclo ' + cicloActual + ' en curso — ' + enCurso + ' trades';
  if (completados > 0) {
    el = document.getElementById('ciclo-completado-label'); if (el) el.textContent = 'Ciclo ' + completados + ' — completado';
    el = document.getElementById('ciclo-completado-trades'); if (el) el.textContent = '111 / 111 trades';
  }

  // Métricas del ciclo actual
  var ultimos = trades.slice(-enCurso);
  var wins = ultimos.filter(function(t){ return t.ganadora; }).length;
  var wr   = ultimos.length > 0 ? Math.round(wins/ultimos.length*1000)/10 : 0;
  var pnl  = Math.round(ultimos.reduce(function(s,t){ return s+(t.beneficio||0); },0)*100)/100;
  var ptsW = wins > 0 ? ultimos.filter(function(t){ return t.ganadora; }).reduce(function(s,t){ return s+(t.puntos||0); },0)/wins : 0;
  var losses = ultimos.length - wins;
  var ptsL = losses > 0 ? ultimos.filter(function(t){ return !t.ganadora; }).reduce(function(s,t){ return s+(t.puntos||0); },0)/losses : 0;
  var rr   = ptsL > 0 ? Math.round(ptsW/ptsL*100)/100 : 0;
  var esp  = Math.round(((wr/100*ptsW) - ((1-wr/100)*ptsL))*100)/100;
  var dentro = ultimos.filter(function(t){ return t.puntos <= 11; });
  var cumpl = ultimos.length > 0 ? Math.round(dentro.length/ultimos.length*1000)/10 : 0;

  // Score
  var score = 0;
  if (wr>=60) score+=25; else if (wr>=55) score+=18; else if (wr>=50) score+=12; else if (wr>=45) score+=6;
  if (rr>=1.8) score+=25; else if (rr>=1.5) score+=18; else if (rr>=1.2) score+=12; else if (rr>=1.0) score+=6;
  if (esp>0) score+=20; else if (esp>-2) score+=8;
  if (ultimos.length>=111) score+=15; else if (ultimos.length>=50) score+=8;
  if (pnl>0) score+=15; else if (pnl>-200) score+=5;

  // Actualizar stats
  el = document.getElementById('ciclo-wr');       if (el) el.textContent = wr + '%';
  el = document.getElementById('ciclo-wr-sub');   if (el) el.textContent = wins + ' wins de ' + ultimos.length;
  el = document.getElementById('ciclo-pnl');      if (el) el.textContent = (pnl>=0?'+':'') + pnl + '$';
  el = document.getElementById('ciclo-rr');       if (el) el.textContent = rr;
  el = document.getElementById('ciclo-rr-sub');   if (el) el.textContent = ptsL > 0 ? Math.round(ptsW*10)/10 + ' / ' + Math.round(ptsL*10)/10 + ' pts' : '—';
  el = document.getElementById('ciclo-esp');      if (el) el.textContent = (esp>=0?'+':'') + esp;
  el = document.getElementById('ciclo-cumpl');    if (el) el.textContent = cumpl + '%';
  el = document.getElementById('ciclo-cumpl-sub');if (el) el.textContent = dentro.length + ' de ' + ultimos.length + ' dentro';
  el = document.getElementById('ciclo-puntuacion');if (el) el.textContent = Math.min(100, score);
  el = document.getElementById('ciclo-veredicto-txt');
  if (el) {
    var nextCumpl = Math.min(100, Math.round(cumpl + 5));
    el.textContent = '"Ciclo ' + cicloActual + (completados > 0 ? ' en curso. Ciclo ' + completados + ' completado' : '') + ' con ' + wr + '% WR y R/R ' + rr + '. Esperanza: ' + (esp>=0?'+':'') + esp + ' pts/trade. Cumplimiento actual: ' + cumpl + '%. Objetivo: ' + nextCumpl + '%+. El proceso es el edge."';
  }

  // Dots
  if (cd) {
    cd.innerHTML = ultimos.map(function(t){
      return '<div style="width:7px;height:7px;border-radius:50%;background:'+(t.ganadora?'#3AAA6A':'#CC5544')+';flex-shrink:0;'+(t.ganadora?'box-shadow:0 0 3px #3AAA6A44':'')+'"></div>';
    }).join('');
  }
}

function buildEquity() {
  var trades = getTradesActivos();
  if (trades.length < 5) {
    var elSub = document.getElementById('equity-sub');
    if (elSub) elSub.textContent = '—';
    ['equity-chart','equity-fechas','equity-meses','equity-camino'].forEach(function(id) {
      var e = document.getElementById(id); if (e) e.innerHTML = '';
    });
    return;
  }

  // Extract real trade date from MT5 fp (format: ticket_YYYY.MM.DD HH:MM:SS_price_vol)
  // Falls back to created_at (Supabase insertion time)
  function fechaTrade(t) {
    if (t.fp) {
      var m = t.fp.match(/(\d{4})\.(\d{2})\.(\d{2})/);
      if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    }
    if (t.created_at) return new Date(t.created_at);
    return null;
  }

  // Attach dates and sort chronologically when dates are available
  var withDates = trades.map(function(t) { return { t: t, d: fechaTrade(t) }; });
  if (withDates.some(function(x) { return x.d !== null; })) {
    withDates.sort(function(a, b) {
      if (!a.d && !b.d) return 0;
      if (!a.d) return 1;
      if (!b.d) return -1;
      return a.d - b.d;
    });
  }

  // Cumulative P&L
  var cumPnl = [0];
  var running = 0;
  withDates.forEach(function(x) {
    running += (x.t.beneficio || 0);
    cumPnl.push(Math.round(running * 100) / 100);
  });
  var totalPnl = cumPnl[cumPnl.length - 1];

  // Monthly grouping
  var porMes = {}, mesOrden = [];
  withDates.forEach(function(x) {
    var key;
    if (x.d) {
      var mon = x.d.getMonth() + 1;
      key = x.d.getFullYear() + '-' + (mon < 10 ? '0' + mon : '' + mon);
    } else {
      key = 'global';
    }
    if (!porMes[key]) { porMes[key] = { t:0, w:0, p:0 }; mesOrden.push(key); }
    porMes[key].t++;
    if (x.t.ganadora) porMes[key].w++;
    porMes[key].p += (x.t.beneficio || 0);
  });

  var MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  function mesLabel(key) {
    if (key === 'global') return 'Total';
    var p = key.split('-');
    return MESES[parseInt(p[1]) - 1] + ' ' + p[0];
  }

  // Subtitle
  var cuentas = [];
  trades.forEach(function(t) { if (t.cuenta && cuentas.indexOf(t.cuenta) === -1) cuentas.push(t.cuenta); });
  var subTxt = cuentas.length + ' cuenta' + (cuentas.length !== 1 ? 's' : '') + ' · ' + trades.length + ' trades';
  if (mesOrden.length > 1 && mesOrden[0] !== 'global') {
    subTxt += ' · ' + mesLabel(mesOrden[0]) + '–' + mesLabel(mesOrden[mesOrden.length - 1]);
  }
  var elSub = document.getElementById('equity-sub');
  if (elSub) elSub.textContent = subTxt;

  // SVG equity curve
  var elChart = document.getElementById('equity-chart');
  if (elChart && cumPnl.length > 1) {
    var W = 800, H = 180, pad = 12;
    var maxVal = Math.max.apply(null, cumPnl);
    var minVal = Math.min.apply(null, [0].concat(cumPnl));
    var range  = maxVal - minVal || 1;
    var n      = cumPnl.length - 1;
    var pts = cumPnl.map(function(v, i) {
      var x = Math.round(i / n * W);
      var y = Math.round((H - pad) - ((v - minVal) / range) * (H - 2 * pad));
      return x + ',' + y;
    });
    var lastPt  = pts[pts.length - 1].split(',');
    var lastX   = parseInt(lastPt[0]), lastY = parseInt(lastPt[1]);
    var finalStr = (totalPnl >= 0 ? '+' : '') + Math.round(totalPnl) + '$';
    var lineCol  = totalPnl >= 0 ? '#C9A84C' : '#CC5544';
    var dotCol   = totalPnl >= 0 ? '#E8C870' : '#CC5544';
    var gridLines = [Math.round(H*0.25), Math.round(H*0.5), Math.round(H*0.75)].map(function(y) {
      return '<line x1="0" y1="'+y+'" x2="'+W+'" y2="'+y+'" stroke="#1A2040" stroke-width="0.5"/>';
    }).join('');
    var pathD = 'M' + pts.join(' L');
    var fillD = pathD + ' L' + lastX + ',' + H + ' L0,' + H + ' Z';
    var txtAnchor = lastX > W * 0.8 ? 'end' : 'start';
    var txtX = txtAnchor === 'end' ? lastX - 8 : lastX + 8;
    elChart.innerHTML =
      '<svg width="100%" height="100%" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">' +
      '<defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="'+lineCol+'" stop-opacity="0.2"/>' +
      '<stop offset="100%" stop-color="'+lineCol+'" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      gridLines +
      '<path d="'+fillD+'" fill="url(#eg)"/>' +
      '<path d="'+pathD+'" fill="none" stroke="'+lineCol+'" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="'+lastX+'" cy="'+lastY+'" r="5" fill="'+dotCol+'"/>' +
      '<text x="'+txtX+'" y="'+(lastY-8)+'" text-anchor="'+txtAnchor+'" fill="'+dotCol+'" font-size="11" font-family="sans-serif">'+finalStr+'</text>' +
      '</svg>';
  }

  // Date labels below chart
  var elFechas = document.getElementById('equity-fechas');
  if (elFechas) {
    if (mesOrden.length <= 1) {
      elFechas.innerHTML = '<span>Inicio</span><span>Hoy</span>';
    } else {
      elFechas.innerHTML = mesOrden.map(function(k){ return '<span>'+mesLabel(k)+'</span>'; }).join('');
    }
  }

  // Monthly cards (show last 4 months max)
  var elMeses = document.getElementById('equity-meses');
  if (elMeses && mesOrden.length) {
    var mostrar = mesOrden.length > 4 ? mesOrden.slice(-4) : mesOrden;
    elMeses.style.gridTemplateColumns = 'repeat(' + mostrar.length + ',1fr)';
    elMeses.innerHTML = mostrar.map(function(k, i) {
      var m   = porMes[k];
      var pnl = Math.round(m.p * 100) / 100;
      var pnlStr = (pnl >= 0 ? '+' : '') + pnl + '$';
      var isLast = i === mostrar.length - 1;
      return '<div class="stat-card" style="text-align:center;' + (isLast ? 'border:1px solid var(--border-gold);' : '') + '">' +
        '<div class="stat-label" style="' + (isLast ? 'color:var(--gold);' : '') + '">' + mesLabel(k) + (isLast ? ' · En curso' : '') + '</div>' +
        '<div class="stat-val ' + (pnl >= 0 ? 'green' : 'red') + '" style="font-size:26px;">' + pnlStr + '</div>' +
        '<div class="stat-sub">' + m.t + ' trades</div>' +
        '</div>';
    }).join('');
  }

  // Camino matemático — proyecciones basadas en datos reales
  var elCamino = document.getElementById('equity-camino');
  if (elCamino) {
    var wins   = trades.filter(function(t){ return t.ganadora; });
    var losses = trades.filter(function(t){ return !t.ganadora; });
    var WR = trades.length > 0 ? wins.length / trades.length : 0;
    var avgW = wins.length   > 0 ? wins.reduce(function(s,t){return s+(t.beneficio||0);},0)/wins.length   : 0;
    var avgL = losses.length > 0 ? losses.reduce(function(s,t){return s+(t.beneficio||0);},0)/losses.length : 0;
    var avgPtsW = wins.length   > 0 ? wins.reduce(function(s,t){return s+(t.puntos||0);},0)/wins.length   : 0;
    var avgPtsL = losses.length > 0 ? losses.reduce(function(s,t){return s+(t.puntos||0);},0)/losses.length : 0;
    var RR = avgPtsL > 0 ? Math.round(avgPtsW/avgPtsL*100)/100 : 0;
    var meta = 5000, remaining = Math.max(0, meta - totalPnl);

    function scenarioCard(label, wr, avgWin, avgLoss, borderStyle, labelClass, col) {
      var esp = wr * avgWin + (1 - wr) * avgLoss;
      var trNeed = esp > 0 ? Math.ceil(remaining / esp) : null;
      var espStr = esp > 0 ? (esp >= 0 ? '+' : '') + Math.round(esp) + '$/trade' : 'sin edge';
      var rrStr  = avgLoss !== 0 ? '1:' + Math.round(avgWin / Math.abs(avgLoss) * 100) / 100 : '';
      var sub    = rrStr ? rrStr + ' · WR ' + Math.round(wr*1000)/10 + '%' : 'WR ' + Math.round(wr*1000)/10 + '%';
      var meta_  = trNeed !== null
        ? '<strong style="color:'+col+';">'+trNeed+' trades → 5.000$</strong>'
        : '<strong style="color:var(--text-muted);">edge insuficiente</strong>';
      return '<div style="padding:1rem;border:'+borderStyle+';background:'+(labelClass==='tag-gold'?'#C9A84C08':'#0E1020')+';"><div class="'+labelClass+'" style="margin-bottom:.4rem;display:block;">'+label+'</div><div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:'+col+';margin-bottom:.3rem;">'+sub+'</div><div style="font-size:14px;color:var(--text-dim);line-height:1.6;">'+espStr+' · '+meta_+'</div></div>';
    }

    var s1 = scenarioCard('✦ Ritmo actual', WR, avgW, avgL, '1px solid var(--gold)', 'tag-gold', 'var(--gold)');
    var s2 = scenarioCard('WR +5pp', Math.min(1, WR + 0.05), avgW, avgL, '1px solid var(--border)', 'tag', 'var(--green)');
    var s3 = scenarioCard('RR +20%', WR, avgW * 1.2, avgL, '1px solid var(--border)', 'tag', '#6A9AEE');

    elCamino.innerHTML =
      '<div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);"></div>' +
      '<div class="tag-gold" style="display:block;margin-bottom:1rem;">✦ Camino matemático a la Etapa 5</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;">' + s1 + s2 + s3 + '</div>';
  }
}

function buildCumplimiento() {
  var trades = getTradesActivos();
  if (trades.length < 5) {
    ['cumpl-dentro-num','cumpl-dentro-pct','cumpl-fuera-num','cumpl-fuera-pct',
     'cumpl-wr-dentro','cumpl-wr-dentro-sub','cumpl-wr-fuera','cumpl-wr-fuera-sub'].forEach(function(id) {
      var e = document.getElementById(id); if (e) e.textContent = '—';
    });
    ['cumpl-sl-dist','cumpl-alertas'].forEach(function(id) {
      var e = document.getElementById(id); if (e) e.innerHTML = '';
    });
    return;
  }

  var n      = trades.length;
  var edge   = trades.filter(function(t){ return t.puntos <= 11; });
  var aire   = trades.filter(function(t){ return t.puntos > 11 && t.puntos <= 25; });
  var limite = trades.filter(function(t){ return t.puntos > 25 && t.puntos <= 50; });
  var afuera = trades.filter(function(t){ return t.puntos > 50; });
  var dentro = edge;
  var fuera  = trades.filter(function(t){ return t.puntos > 11; });

  function wr(arr)  { return arr.length > 0 ? Math.round(arr.filter(function(t){ return t.ganadora; }).length/arr.length*1000)/10 : 0; }
  function pnlSum(arr) { return Math.round(arr.reduce(function(s,t){ return s+(t.beneficio||0); },0)*100)/100; }
  function pct(arr) { return Math.round(arr.length/n*1000)/10; }

  var wrDentro = wr(dentro), wrFuera = wr(fuera);
  var pnlDentro = pnlSum(dentro), pnlFuera = pnlSum(fuera);

  // Hero stats
  var els = {
    'cumpl-dentro-num':    dentro.length,
    'cumpl-dentro-pct':    pct(dentro) + '% de tus trades',
    'cumpl-fuera-num':     fuera.length,
    'cumpl-fuera-pct':     pct(fuera) + '% — a revisar',
    'cumpl-wr-dentro':     wrDentro + '%',
    'cumpl-wr-dentro-sub': 'P&L ' + (pnlDentro >= 0 ? '+' : '') + pnlDentro + '$ · riesgo controlado',
    'cumpl-wr-fuera':      wrFuera + '%',
    'cumpl-wr-fuera-sub':  'P&L ' + (pnlFuera >= 0 ? '+' : '') + pnlFuera + '$ · más riesgo'
  };
  Object.keys(els).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = els[id];
  });

  // SL distribution (4 zones), normalized bar widths against the largest zone
  var elSlDist = document.getElementById('cumpl-sl-dist');
  if (elSlDist) {
    var zonas = [
      { label:'✦ Edge', desc:'≤ 11 puntos — SL perfecto',       arr:edge,   bg:'#c9a84c18', col:'#e8c870', border:'#c9a84c44', grad:'#c9a84c44,#e8c870' },
      { label:'Aire',   desc:'12–25 puntos — tolerable',         arr:aire,   bg:'#aaa03a18', col:'#c8b040', border:'#aaa03a33', grad:'#aaa03a44,#c8b040' },
      { label:'Límite', desc:'26–50 puntos — zona peligrosa',    arr:limite, bg:'#cc884418', col:'#cc8844', border:'#cc884433', grad:'#cc884444,#cc8844' },
      { label:'Fuera',  desc:'&gt;50 puntos — fuera del método', arr:afuera, bg:'#cc443318', col:'#cc5544', border:'#cc443333', grad:'#cc443344,#cc5544' }
    ];
    var maxZ = Math.max.apply(null, zonas.map(function(z){ return z.arr.length; })) || 1;
    var tagHtml = '<div class="tag" style="display:block;margin-bottom:1rem;">Distribución de SL · Dónde cerraste cada operación</div>';
    var zonaHtml = zonas.map(function(z, i) {
      var pctZ = Math.round(z.arr.length/n*1000)/10;
      var barW = Math.round(z.arr.length/maxZ*100);
      var mb   = i < zonas.length - 1 ? 'margin-bottom:.8rem;' : '';
      return '<div style="display:flex;align-items:center;gap:1rem;padding:.8rem 1rem;border:1px solid var(--border);background:#0e0c08;'+mb+'">' +
        '<div style="font-size:11px;padding:.2rem .7rem;letter-spacing:.15em;text-transform:uppercase;width:80px;text-align:center;flex-shrink:0;background:'+z.bg+';color:'+z.col+';border:1px solid '+z.border+';">'+z.label+'</div>' +
        '<div style="flex:1;">' +
        '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:.3rem;"><span>'+z.desc+'</span><span style="color:'+z.col+';">'+pctZ+'%</span></div>' +
        '<div style="height:4px;background:var(--border);border-radius:2px;"><div style="height:100%;width:'+barW+'%;background:linear-gradient(90deg,'+z.grad+');"></div></div>' +
        '</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:'+z.col+';width:40px;text-align:right;">'+z.arr.length+'</div>' +
        '</div>';
    }).join('');
    elSlDist.innerHTML = tagHtml + zonaHtml;
  }

  // Alertas: top-3 trades with highest puntos (worst outliers)
  var elAlertas = document.getElementById('cumpl-alertas');
  if (elAlertas) {
    var outliers = trades.filter(function(t){ return t.puntos > 25; })
      .sort(function(a, b){ return b.puntos - a.puntos; })
      .slice(0, 3);

    var alertasHtml = '';
    if (outliers.length) {
      alertasHtml = outliers.map(function(t) {
        var pts  = Math.round(t.puntos * 10) / 10;
        var vol  = t.volumen && t.volumen > 0 ? t.volumen.toFixed(2) + ' lotes · ' : '';
        var ben  = (t.beneficio >= 0 ? '+' : '') + Math.round(t.beneficio * 100) / 100 + '$';
        var desc = t.beneficio > 0
          ? 'Ganó ' + ben + ' pero con ' + pts + ' puntos de SL. Fuera del método aunque ganara.'
          : 'Perdió ' + ben + '. SL excesivo de ' + pts + ' puntos.';
        return '<div style="padding:.8rem 1rem;border:1px solid #cc443322;background:#cc443308;border-left:2px solid #cc4433;margin-bottom:.6rem;">' +
          '<div style="font-size:12px;letter-spacing:.1em;color:#cc7755;margin-bottom:.3rem;">⚠ ' + vol + pts + ' puntos</div>' +
          '<div style="font-size:13px;color:#7a4a38;line-height:1.6;">' + desc + '</div>' +
          '</div>';
      }).join('');
    } else {
      alertasHtml = '<div style="padding:1rem;border:1px solid #3AAA6A44;background:#3AAA6A08;border-left:2px solid var(--green);margin-bottom:.6rem;">' +
        '<div style="font-size:14px;color:var(--green);">✓ Sin operaciones fuera del método</div>' +
        '<div style="font-size:13px;color:var(--text-muted);margin-top:.3rem;line-height:1.6;">Todas tus operaciones respetan el SL del método.</div>' +
        '</div>';
    }

    var pctEdge = pct(edge);
    var lectura = pctEdge >= 70
      ? '"El ' + pctEdge + '% de tus trades respetan el Edge 11. Tu win rate dentro del método es ' + wrDentro + '%. El proceso está en marcha."'
      : '"El ' + pctEdge + '% de tus trades respetan el Edge 11. Cuando lo respetas, tu win rate sube al ' + wrDentro + '%. El método funciona — el reto es aplicarlo siempre."';

    var tagHtml2 = '<div class="tag" style="display:block;margin-bottom:1rem;">Operaciones fuera del método · Las más críticas</div>';
    var lecturaHtml = '<div style="padding:1rem;border:1px solid #c9a84c22;background:linear-gradient(135deg,#161208,#1a1608);border-left:2px solid #c9a84c;">' +
      '<div style="font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#c9a84c;margin-bottom:.5rem;">✦ Lectura Aurum</div>' +
      '<div style="font-size:13px;color:#8a7840;line-height:1.8;font-style:italic;">' + lectura + '</div>' +
      '</div>';
    elAlertas.innerHTML = tagHtml2 + alertasHtml + lecturaHtml;
  }

  // Periodo: current month
  var elPeriodo = document.getElementById('cumpl-periodo-txt');
  if (elPeriodo) {
    var MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    var ahora = new Date();
    elPeriodo.textContent = MESES_LARGO[ahora.getMonth()] + ' ' + ahora.getFullYear();
  }
}

function _eavBarra(label, pct, col) {
  return '<div style="margin-bottom:.5rem;">' +
    '<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-muted);margin-bottom:.25rem;">' +
    '<span>' + label + '</span><span style="color:' + col + ';">' + pct + '%</span></div>' +
    '<div style="height:3px;background:var(--border);border-radius:2px;">' +
    '<div style="height:100%;width:' + Math.min(100, pct) + '%;background:' + col + ';border-radius:2px;"></div></div></div>';
}

function buildEstadisticasAvanzadas() {
  var trades = getTradesActivos();

  function setEl(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
  function setHTML(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }

  function fechaDesdeFp(fp) {
    if (!fp) return null;
    var m = String(fp).match(/(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (m) return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6]));
    return null;
  }

  if (trades.length < 5) {
    ['eav-racha-num','eav-racha-tipo','eav-racha-sub',
     'eav-dd-max','eav-dd-sub',
     'eav-mejor-val','eav-mejor-sub',
     'eav-peor-val','eav-peor-sub',
     'eav-tp-pct','eav-tp-sub',
     'eav-revenge-num','eav-revenge-sub'].forEach(function(id){ setEl(id, '—'); });
    ['eav-revenge-lista','eav-lote-tras-perdida','eav-lote-consistencia',
     'eav-hora-analisis','eav-peor-dia-analisis','eav-duracion-analisis','eav-veredicto'].forEach(function(id){ setHTML(id, ''); });
    return;
  }

  // 1. Racha actual
  var racha = 1;
  var rachaGanando = trades[trades.length - 1].ganadora;
  for (var i = trades.length - 2; i >= 0; i--) {
    if (trades[i].ganadora === rachaGanando) racha++;
    else break;
  }
  setEl('eav-racha-num', racha);
  setEl('eav-racha-tipo', rachaGanando ? 'ganando' : 'perdiendo');
  setEl('eav-racha-sub', racha + ' consecutivos ' + (rachaGanando ? 'ganadores' : 'perdedores'));

  // 2. Drawdown máximo
  var cumPnl = 0, peak = 0, maxDD = 0;
  trades.forEach(function(t) {
    cumPnl += (t.beneficio || 0);
    if (cumPnl > peak) peak = cumPnl;
    var dd = peak - cumPnl;
    if (dd > maxDD) maxDD = dd;
  });
  maxDD = Math.round(maxDD * 100) / 100;
  var totalPnl = Math.round(cumPnl * 100) / 100;
  setEl('eav-dd-max', '-' + maxDD + '$');
  setEl('eav-dd-sub', totalPnl >= 0 ? 'Recuperado ✓' : 'En curso — P&L total: ' + totalPnl + '$');

  // 3. Mejor y peor trade individual
  var mejor = trades[0], peor = trades[0];
  trades.forEach(function(t) {
    if ((t.beneficio || 0) > (mejor.beneficio || 0)) mejor = t;
    if ((t.beneficio || 0) < (peor.beneficio || 0)) peor = t;
  });
  var mejorVal = Math.round((mejor.beneficio || 0) * 100) / 100;
  var peorVal  = Math.round((peor.beneficio || 0) * 100) / 100;
  setEl('eav-mejor-val', (mejorVal >= 0 ? '+' : '') + mejorVal + '$');
  setEl('eav-mejor-sub', mejor.cuenta || '—');
  setEl('eav-peor-val',  peorVal + '$');
  setEl('eav-peor-sub',  peor.cuenta || '—');

  // 4. TP alcanzado vs cerrado antes
  var conTp = trades.filter(function(t) { return t.tp != null && t.tp !== 0; });
  if (conTp.length > 0) {
    var hitTp = conTp.filter(function(t) {
      if (!t.ganadora) return false;
      var pe = t.precio_entrada, pc = t.precio_cierre, tp = t.tp;
      if (pe == null || pc == null) return false;
      return (pc > pe) ? (pc >= tp - 0.5) : (pc <= tp + 0.5);
    });
    var tpPct = Math.round(hitTp.length / conTp.length * 1000) / 10;
    setEl('eav-tp-pct', tpPct + '%');
    setEl('eav-tp-sub', hitTp.length + ' de ' + conTp.length + ' con TP registrado');
  } else {
    setEl('eav-tp-pct', '—');
    setEl('eav-tp-sub', 'Sin TP registrado en estos trades');
  }

  // 5. Revenge trading
  var revengeTrades = [];
  for (var i = 1; i < trades.length; i++) {
    if (!trades[i-1].ganadora) {
      var fPrev = fechaDesdeFp(trades[i-1].fp);
      var fCurr = fechaDesdeFp(trades[i].fp);
      if (fPrev && fCurr) {
        var closePrev = new Date(fPrev.getTime() + (trades[i-1].dur_min || 0) * 60000);
        var gapMin = Math.round((fCurr - closePrev) / 60000);
        if (gapMin >= 0 && gapMin < 5) revengeTrades.push({ gap: gapMin, t: trades[i] });
      }
    }
  }
  setEl('eav-revenge-num', revengeTrades.length);
  setEl('eav-revenge-sub', revengeTrades.length === 0
    ? 'Sin señales de revenge trading'
    : 'trades abiertos < 5 min tras una pérdida');
  var lista = document.getElementById('eav-revenge-lista');
  if (lista) {
    if (revengeTrades.length === 0) {
      lista.innerHTML = '<div style="padding:.8rem 1rem;border:1px solid #3AAA6A44;background:#3AAA6A08;border-left:2px solid var(--green);">' +
        '<div style="font-size:14px;color:var(--green);">✓ Sin revenge trading detectado</div>' +
        '<div style="font-size:13px;color:var(--text-muted);margin-top:.3rem;">Ningún trade fue abierto en menos de 5 minutos tras una pérdida.</div>' +
        '</div>';
    } else {
      lista.innerHTML = revengeTrades.slice(0, 5).map(function(r) {
        var ben = Math.round((r.t.beneficio || 0) * 100) / 100;
        var col = r.t.ganadora ? 'var(--green)' : 'var(--red)';
        return '<div style="display:flex;align-items:center;gap:1rem;padding:.5rem 1rem;border:1px solid #cc443322;background:#cc443308;border-left:2px solid #cc4433;margin-bottom:.4rem;">' +
          '<div style="font-size:11px;color:#cc7755;flex-shrink:0;white-space:nowrap;">⚠ ' + r.gap + ' min</div>' +
          '<div style="font-size:13px;color:var(--text-muted);">Abierto tras pérdida → <span style="color:' + col + ';">' + (ben >= 0 ? '+' : '') + ben + '$</span></div>' +
          '</div>';
      }).join('');
    }
  }

  // 6. Lotaje tras pérdida
  var lpSube = 0, lpMant = 0, lpBaja = 0;
  for (var i = 1; i < trades.length; i++) {
    if (!trades[i-1].ganadora) {
      var vPrev = trades[i-1].volumen || 0;
      var vNext = trades[i].volumen || 0;
      if (vPrev > 0) {
        if (vNext > vPrev * 1.05) lpSube++;
        else if (vNext < vPrev * 0.95) lpBaja++;
        else lpMant++;
      }
    }
  }
  var lpTotal = lpSube + lpMant + lpBaja;
  var elLoteP = document.getElementById('eav-lote-tras-perdida');
  if (elLoteP) {
    if (lpTotal === 0) {
      elLoteP.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">Sin datos suficientes de lotaje.</div>';
    } else {
      var pSube = Math.round(lpSube / lpTotal * 100);
      var pMant = Math.round(lpMant / lpTotal * 100);
      var pBaja = Math.round(lpBaja / lpTotal * 100);
      var alertaLp = lpSube > lpTotal * 0.4
        ? '<div style="margin-top:.8rem;padding:.6rem;border:1px solid #cc443322;border-left:2px solid #cc4433;background:#cc443308;font-size:12px;color:#cc7755;">⚠ Aumentas el lote el ' + pSube + '% de las veces tras una pérdida — riesgo de over-trading reactivo.</div>'
        : '<div style="margin-top:.8rem;padding:.6rem;border:1px solid #3AAA6A44;border-left:2px solid var(--green);background:#3AAA6A08;font-size:12px;color:var(--green);">✓ Gestionas bien el lotaje tras pérdidas.</div>';
      elLoteP.innerHTML = _eavBarra('Sube el lote', pSube, '#CC5544') +
        _eavBarra('Mantiene', pMant, '#C9A84C') +
        _eavBarra('Baja el lote', pBaja, '#3AAA6A') +
        alertaLp;
    }
  }

  // 7. Consistencia de lotaje (coeficiente de variación)
  var vols = trades.map(function(t){ return t.volumen || 0; }).filter(function(v){ return v > 0; });
  var elLoteC = document.getElementById('eav-lote-consistencia');
  if (elLoteC) {
    if (vols.length < 3) {
      elLoteC.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">Sin datos suficientes.</div>';
    } else {
      var meanV = vols.reduce(function(s, v){ return s + v; }, 0) / vols.length;
      var varV  = vols.reduce(function(s, v){ return s + Math.pow(v - meanV, 2); }, 0) / vols.length;
      var cv    = meanV > 0 ? Math.round(Math.sqrt(varV) / meanV * 1000) / 10 : 0;
      var cvCol   = cv < 15 ? '#3AAA6A' : cv < 30 ? '#C9A84C' : '#CC5544';
      var cvLabel = cv < 15 ? 'Muy consistente' : cv < 30 ? 'Variable' : 'Inconsistente';
      var cvMsg   = cv < 15 ? 'Tu tamaño de posición es estable y disciplinado.' : cv < 30 ? 'Hay variabilidad en tu lotaje. Revisa el criterio de sizing.' : 'Lotaje muy irregular — puede afectar el control de riesgo.';
      elLoteC.innerHTML = '<div style="text-align:center;padding:1rem 0;">' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:48px;color:' + cvCol + ';line-height:1;">' + cv + '%</div>' +
        '<div style="font-size:14px;color:' + cvCol + ';margin:.3rem 0;">' + cvLabel + '</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">CV lotaje · media ' + (Math.round(meanV * 100) / 100) + ' lots</div>' +
        '</div><div style="padding:.6rem;border:1px solid ' + cvCol + '44;border-left:2px solid ' + cvCol + ';background:' + cvCol + '08;font-size:12px;color:var(--text-muted);">' + cvMsg + '</div>';
    }
  }

  // 8. Mejor franja horaria vs donde más opera
  var porHoraEav = {};
  for (var h = 0; h < 24; h++) porHoraEav[h] = { t:0, w:0 };
  trades.forEach(function(t) {
    var h = Math.floor(t.hora || 0);
    if (h >= 0 && h < 24) { porHoraEav[h].t++; if (t.ganadora) porHoraEav[h].w++; }
  });
  var elHoraA = document.getElementById('eav-hora-analisis');
  if (elHoraA) {
    var horasConDatos = [];
    for (var h = 0; h < 24; h++) {
      if (porHoraEav[h].t >= 3) horasConDatos.push({ h:h, t:porHoraEav[h].t, wr:Math.round(porHoraEav[h].w / porHoraEav[h].t * 100) });
    }
    if (horasConDatos.length < 2) {
      elHoraA.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">Insuficientes datos por hora.</div>';
    } else {
      var mejorHora = horasConDatos.reduce(function(a, b){ return b.wr > a.wr ? b : a; });
      var masOpera  = horasConDatos.reduce(function(a, b){ return b.t > a.t ? b : a; });
      var coincide  = mejorHora.h === masOpera.h;
      var alertaH = coincide
        ? '<div style="padding:.6rem;border:1px solid #3AAA6A44;border-left:2px solid var(--green);background:#3AAA6A08;font-size:12px;color:var(--green);">✓ Operas más donde mejor te va — ' + mejorHora.h + ':xx con ' + mejorHora.wr + '% WR</div>'
        : '<div style="padding:.6rem;border:1px solid #cc443322;border-left:2px solid #cc4433;background:#cc443308;font-size:12px;color:#cc7755;">⚠ Tu mejor hora es ' + mejorHora.h + ':xx (' + mejorHora.wr + '% WR) pero operas más a las ' + masOpera.h + ':xx (' + masOpera.wr + '% WR)</div>';
      elHoraA.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:.6rem;">' +
        '<div style="padding:.6rem;border:1px solid var(--border);background:#0E1020;">' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:.3rem;">Mejor WR</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:24px;color:var(--green);">' + mejorHora.h + ':xx</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">' + mejorHora.wr + '% · ' + mejorHora.t + ' trades</div></div>' +
        '<div style="padding:.6rem;border:1px solid var(--border);background:#0E1020;">' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:.3rem;">Más activo</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:24px;color:var(--gold-bright);">' + masOpera.h + ':xx</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">' + masOpera.wr + '% · ' + masOpera.t + ' trades</div></div></div>' + alertaH;
    }
  }

  // 9. Insistencia en peor día
  var DIAS_ES = ['Lunes','Martes','Miércoles','Jueves','Viernes'];
  var porDiaEav = [0,1,2,3,4].map(function(){ return { t:0, w:0 }; });
  trades.forEach(function(t) {
    var d = t.dia;
    if (d >= 0 && d <= 4) { porDiaEav[d].t++; if (t.ganadora) porDiaEav[d].w++; }
  });
  var elDiaA = document.getElementById('eav-peor-dia-analisis');
  if (elDiaA) {
    var diasConDatos = porDiaEav.map(function(d, i){ return { i:i, t:d.t, wr:d.t > 0 ? Math.round(d.w / d.t * 100) : null }; })
      .filter(function(d){ return d.t >= 3 && d.wr !== null; });
    if (diasConDatos.length < 2) {
      elDiaA.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">Insuficientes datos por día.</div>';
    } else {
      var peorDia = diasConDatos.reduce(function(a, b){ return b.wr < a.wr ? b : a; });
      var pctPeorDia = Math.round(peorDia.t / trades.length * 100);
      var alertaD = pctPeorDia > 25
        ? '<div style="padding:.6rem;border:1px solid #cc443322;border-left:2px solid #cc4433;background:#cc443308;font-size:12px;color:#cc7755;">⚠ El ' + pctPeorDia + '% de tus trades son los ' + DIAS_ES[peorDia.i] + ' (' + peorDia.wr + '% WR) — considera reducir ese día.</div>'
        : '<div style="padding:.6rem;border:1px solid #c9a84c22;border-left:2px solid var(--gold);background:#c9a84c08;font-size:12px;color:var(--gold-dim);">Los ' + DIAS_ES[peorDia.i] + ' son tu peor día (' + peorDia.wr + '% WR) con ' + pctPeorDia + '% de tus trades — exposición controlada.</div>';
      elDiaA.innerHTML = '<div style="text-align:center;padding:.8rem 0;">' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:.2rem;">Peor día</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:28px;color:var(--red);">' + DIAS_ES[peorDia.i] + '</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">' + peorDia.wr + '% WR · ' + peorDia.t + ' trades</div>' +
        '</div>' + alertaD;
    }
  }

  // 10. Duración media ganadoras vs perdedoras
  var wins   = trades.filter(function(t){ return t.ganadora; });
  var losses = trades.filter(function(t){ return !t.ganadora; });
  var avgDurW = wins.length   > 0 ? Math.round(wins.reduce(function(s, t){ return s + (t.dur_min || 0); }, 0) / wins.length) : 0;
  var avgDurL = losses.length > 0 ? Math.round(losses.reduce(function(s, t){ return s + (t.dur_min || 0); }, 0) / losses.length) : 0;
  function fmtMin(m) { if (m < 60) return m + ' min'; var hh = Math.floor(m/60); var mm = m%60; return hh + 'h' + (mm > 0 ? mm + 'm' : ''); }
  var elDurA = document.getElementById('eav-duracion-analisis');
  if (elDurA) {
    var alertaDur = wins.length > 0 && losses.length > 0
      ? (avgDurW < avgDurL
        ? '<div style="padding:.6rem;border:1px solid #3AAA6A44;border-left:2px solid var(--green);background:#3AAA6A08;font-size:12px;color:var(--green);">✓ Cierras ganadoras antes que perdedoras — buena gestión de salida.</div>'
        : '<div style="padding:.6rem;border:1px solid #c9a84c22;border-left:2px solid var(--gold);background:#c9a84c08;font-size:12px;color:var(--gold-dim);">Tus ganadoras duran más — cortas pérdidas rápido y dejas correr ganancias.</div>')
      : '';
    elDurA.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:.6rem;">' +
      '<div style="padding:.8rem;border:1px solid #3AAA6A44;background:#3AAA6A08;text-align:center;">' +
      '<div style="font-size:11px;color:var(--green);margin-bottom:.2rem;">Ganadoras</div>' +
      '<div style="font-family:\'Cormorant Garamond\',serif;font-size:24px;color:var(--green);">' + fmtMin(avgDurW) + '</div>' +
      '<div style="font-size:12px;color:var(--text-muted);">' + wins.length + ' trades</div></div>' +
      '<div style="padding:.8rem;border:1px solid #cc443322;background:#cc443308;text-align:center;">' +
      '<div style="font-size:11px;color:var(--red);margin-bottom:.2rem;">Perdedoras</div>' +
      '<div style="font-family:\'Cormorant Garamond\',serif;font-size:24px;color:var(--red);">' + fmtMin(avgDurL) + '</div>' +
      '<div style="font-size:12px;color:var(--text-muted);">' + losses.length + ' trades</div></div></div>' + alertaDur;
  }

  // 11. Veredicto del inversor
  var elVeredicto = document.getElementById('eav-veredicto');
  if (elVeredicto) {
    var wr_total  = trades.length > 0 ? Math.round(wins.length / trades.length * 1000) / 10 : 0;
    var ptsW_tot  = wins.length   > 0 ? wins.reduce(function(s, t){ return s + (t.puntos || 0); }, 0) / wins.length : 0;
    var ptsL_tot  = losses.length > 0 ? losses.reduce(function(s, t){ return s + (t.puntos || 0); }, 0) / losses.length : 0;
    var rr_total  = ptsL_tot > 0 ? Math.round(ptsW_tot / ptsL_tot * 100) / 100 : 0;

    var lomejor = [];
    if (wr_total >= 60) lomejor.push('WR del ' + wr_total + '% — ratio de acierto sólido');
    if (rr_total >= 1.5) lomejor.push('R/R de ' + rr_total + ' — dejas correr las ganancias');
    if (maxDD < 200) lomejor.push('Drawdown controlado (' + maxDD + '$)');
    if (revengeTrades.length === 0) lomejor.push('Sin revenge trading detectado');
    if (lomejor.length === 0) lomejor.push('Estás en proceso — cada trade es datos');

    var lomalo = [];
    if (wr_total < 50) lomalo.push('WR del ' + wr_total + '% — menos de la mitad son ganadores');
    if (rr_total < 1.0 && ptsL_tot > 0) lomalo.push('R/R de ' + rr_total + ' — las pérdidas superan ganancias en puntos');
    if (maxDD > 500) lomalo.push('Drawdown de ' + maxDD + '$ — episodio de pérdida significativo');
    if (revengeTrades.length > 3) lomalo.push(revengeTrades.length + ' episodios de revenge trading');
    if (lpSube > lpTotal * 0.4 && lpTotal > 0) lomalo.push('Aumentas el lote tras pérdidas con frecuencia');
    if (lomalo.length === 0) lomalo.push('Sin alertas críticas — mantén la disciplina');

    var recomendacion;
    if (revengeTrades.length > 3) {
      recomendacion = 'Prioridad: stop de 15 minutos obligatorio tras cada pérdida. El revenge trading está costándote edge.';
    } else if (lpSube > lpTotal * 0.4 && lpTotal > 0) {
      recomendacion = 'Prioridad: fija el lotaje antes de abrir cada trade, no lo decidas después de una pérdida.';
    } else if (wr_total < 50 && rr_total < 1.2) {
      recomendacion = 'Prioridad: revisa los puntos de entrada — ni el WR ni el RR están a favor ahora mismo.';
    } else if (maxDD > totalPnl * 2 && totalPnl > 0) {
      recomendacion = 'Prioridad: reduce el tamaño de posición — el drawdown es desproporcionado respecto al beneficio.';
    } else {
      recomendacion = 'Sigue el proceso. El edge se consolida con muestra. Foco en cumplimiento del método.';
    }

    function _vcol(titulo, items, col, icon, border) {
      return '<div style="padding:1rem;border:1px solid ' + border + ';background:#0E1020;">' +
        '<div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:' + col + ';margin-bottom:.8rem;">' + icon + ' ' + titulo + '</div>' +
        items.map(function(item){ return '<div style="font-size:13px;color:var(--text-dim);line-height:1.8;padding:.2rem 0;border-bottom:1px solid #0A0C14;">' + item + '</div>'; }).join('') +
        '</div>';
    }

    elVeredicto.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">' +
      _vcol('Lo mejor', lomejor, '#3AAA6A', '✓', '#3AAA6A44') +
      _vcol('Lo peor', lomalo, '#CC5544', '⚠', '#CC554422') +
      '</div>' +
      '<div style="padding:1rem;border:1px solid var(--border-gold);background:linear-gradient(135deg,#161208,#1a1608);position:relative;">' +
      '<div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);"></div>' +
      '<div style="font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:var(--gold);margin-bottom:.5rem;">✦ Recomendación urgente</div>' +
      '<div style="font-size:14px;color:var(--text-dim);line-height:1.8;">' + recomendacion + '</div>' +
      '</div>';
  }
}

function buildDashboardHero() {
  var todos = window.AURUM_TRADES ? (window.AURUM_TRADES.todos || []) : [];

  console.log('[AURUM] t.cuenta valores únicos:', todos.reduce(function(acc, t) {
    if (acc.indexOf(t.cuenta) === -1) acc.push(t.cuenta); return acc;
  }, []));

  var totalTrades = todos.length;
  var wins = todos.filter(function(t) { return t.ganadora; });
  var wr = totalTrades > 0 ? Math.round(wins.length / totalTrades * 1000) / 10 : 0;
  var pnl = Math.round(todos.reduce(function(s, t) { return s + (t.beneficio || 0); }, 0) * 100) / 100;
  var pnlStr = (pnl >= 0 ? '+' : '') + pnl + '$';
  var cuentas = [];
  todos.forEach(function(t) { if (t.cuenta && cuentas.indexOf(t.cuenta) === -1) cuentas.push(t.cuenta); });

  var el;
  el = document.getElementById('dash-trades-total');  if (el) el.textContent = totalTrades;
  el = document.getElementById('dash-wr-global');     if (el) el.textContent = wr + '%';
  el = document.getElementById('dash-wr-global-sub'); if (el) el.textContent = wins.length + ' wins de ' + totalTrades;
  el = document.getElementById('dash-pnl-global');    if (el) el.textContent = pnlStr;
  el = document.getElementById('dash-pnl-global-sub');if (el) el.textContent = cuentas.length + ' cuenta' + (cuentas.length !== 1 ? 's' : '') + ' · entorno real';
  el = document.getElementById('card-global-pnl');    if (el) el.textContent = pnlStr;
  el = document.getElementById('card-global-sub');    if (el) el.textContent = totalTrades + ' trades · WR ' + wr + '%';

  // Ciclo actual
  var cicloActual = Math.floor(totalTrades / 111) + 1;
  var enCurso = totalTrades % 111 || 111;
  var pctCiclo = Math.round(enCurso / 111 * 100);
  el = document.getElementById('dash-ciclo');     if (el) el.textContent = 'Ciclo ' + cicloActual;
  el = document.getElementById('dash-ciclo-sub'); if (el) el.textContent = enCurso + ' / 111 trades · ' + pctCiclo + '%';
  el = document.getElementById('ciclo-encurso-txt'); if (el) el.textContent = 'Ciclo ' + cicloActual + ' en curso — ' + enCurso + ' trades';

  // Nivel/etapa
  var ETAPAS = ['Inicio', 'Disciplina', 'Despertar', 'Simulador', 'Rentable', '✦ Oro'];
  var etapa = (typeof usuarioActual !== 'undefined' && usuarioActual && usuarioActual.etapa) ? usuarioActual.etapa : 1;
  var idx = Math.min(Math.max(0, etapa), ETAPAS.length - 1);
  var nombreActual = ETAPAS[idx];
  var nombreSig = ETAPAS[Math.min(idx + 1, ETAPAS.length - 1)];
  var numStr = (idx < 10 ? '0' : '') + idx;
  el = document.getElementById('dash-nivel-num');  if (el) el.textContent = numStr;
  el = document.getElementById('dash-nivel-name'); if (el) el.textContent = nombreActual;
  el = document.getElementById('dash-nivel-fill'); if (el) el.style.width = pctCiclo + '%';
  el = document.getElementById('dash-nivel-pct');  if (el) el.textContent = pctCiclo + '%';
  el = document.getElementById('dash-nivel-card'); if (el) el.textContent = numStr + ' · ' + nombreActual;
  el = document.getElementById('dash-nivel-sub');  if (el) el.textContent = pctCiclo + '% hacia ' + nombreSig;

  // Días en proceso desde el primer trade
  var primerFecha = null;
  todos.forEach(function(t) {
    var d = null;
    if (t.fp) {
      var m = String(t.fp).match(/(\d{4})\.(\d{2})\.(\d{2})/);
      if (m) d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    }
    if (!d && t.created_at) d = new Date(t.created_at);
    if (d && (!primerFecha || d < primerFecha)) primerFecha = d;
  });
  if (primerFecha) {
    var dias = Math.floor((new Date() - primerFecha) / 86400000);
    el = document.getElementById('dash-dias-proceso'); if (el) el.textContent = dias;
  }

  // Cards por cuenta — coincidencia parcial case-insensitive
  function statsCuenta(keyword) {
    var sub = todos.filter(function(t) { return t.cuenta && t.cuenta.toLowerCase().indexOf(keyword) >= 0; });
    var p   = Math.round(sub.reduce(function(s, t) { return s + (t.beneficio || 0); }, 0) * 100) / 100;
    var w   = sub.filter(function(t) { return t.ganadora; }).length;
    var wr  = sub.length > 0 ? Math.round(w / sub.length * 1000) / 10 : 0;
    return { pnl: (p >= 0 ? '+' : '') + p + '$', sub: sub.length + ' trades · WR ' + wr + '%' };
  }
  var sM = statsCuenta('maestra'), sR = statsCuenta('retos'), sP = statsCuenta('prueba');
  el = document.getElementById('card-maestra-pnl'); if (el) el.textContent = sM.pnl;
  el = document.getElementById('card-maestra-sub'); if (el) el.textContent = sM.sub;
  el = document.getElementById('card-retos-pnl');   if (el) el.textContent = sR.pnl;
  el = document.getElementById('card-retos-sub');   if (el) el.textContent = sR.sub;
  el = document.getElementById('card-prueba-pnl');  if (el) el.textContent = sP.pnl;
  el = document.getElementById('card-prueba-sub');  if (el) el.textContent = sP.sub;
}

// Diario
function init_gestion() {
  var fechaEl = document.getElementById('diario-fecha-hoy');
  if (fechaEl) {
    var ahora = new Date();
    fechaEl.textContent = ahora.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }
  // Esperar a que Supabase cargue los datos
  function intentar(intentos) {
    if (window.AURUM_TRADES && window.AURUM_TRADES.todos && window.AURUM_TRADES.todos.length > 0) {
      buildTradeRecord();
      buildCicloDots();
      buildHorarios();
      buildEquity();
      buildCumplimiento();
      buildEstadisticasAvanzadas();
    } else if (intentos > 0) {
      setTimeout(function(){ intentar(intentos-1); }, 500);
    }
  }
  intentar(10); // intenta hasta 5 segundos
}

function guardarEntradaDiario() {
  var texto = document.getElementById('diario-input').value.trim();
  var msg   = document.getElementById('diario-msg');
  if (!texto) { msg.style.color='var(--red)'; msg.textContent='Escribe algo antes de guardar.'; return; }
  var ahora = new Date();
  var fechaStr = ahora.toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' });
  var entradas = document.getElementById('diario-entradas');
  var nuevaEntrada = document.createElement('div');
  nuevaEntrada.style.cssText = 'background:var(--bg2);padding:1.5rem 2rem;position:relative;';
  nuevaEntrada.innerHTML = '<div style="position:absolute;top:0;left:0;bottom:0;width:2px;background:linear-gradient(to bottom,transparent,var(--gold),transparent);"></div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem;">' +
    '<div style="font-size:12px;color:var(--gold-dim);">Hoy · '+fechaStr+'</div>' +
    '<div style="font-size:11px;color:var(--green);">✓ Guardada</div></div>' +
    '<div style="font-size:15px;color:var(--text-dim);line-height:1.8;">'+texto+'</div>';
  entradas.insertBefore(nuevaEntrada, entradas.firstChild);
  document.getElementById('diario-input').value = '';
  if (typeof guardarEntradaDiarioSupabase === 'function') guardarEntradaDiarioSupabase(texto);
  msg.style.color = 'var(--green)';
  msg.textContent = '✓ Entrada guardada.';
  setTimeout(function(){ msg.textContent = ''; }, 3000);
}
