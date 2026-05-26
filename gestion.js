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
  ['trade-record','ciclo111','horarios','equity','cumplimiento','diario','historial'].forEach(function(p) {
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
  if (id === 'cumplimiento') _esperarTrades(buildCumplimiento);
  if (id === 'historial')    init_historial();
}

function getTodos() {
  var cuenta = window.cuentaActivaGestion || 'global';
  if (!window.AURUM_TRADES) return [];
  if (cuenta === 'global') return window.AURUM_TRADES.todos || [];
  var mapa = { maestra:'Cuenta Maestra', retos:'Cuenta Retos', prueba:'Cuenta Prueba' };
  var nombreCuenta = mapa[cuenta];
  if (!nombreCuenta) return window.AURUM_TRADES.todos || [];
  return (window.AURUM_TRADES.todos || []).filter(function(t){ return t.cuenta === nombreCuenta; });
}

function buildTradeRecord() {
  var trades = getTodos();
  var tb = document.getElementById('gest-tipos-bars');
  if (tb && trades.length) {
    var tipos = window.AURUM_TRADES.tipos || [];
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
}

function buildHorarios() {
  var trades = window.AURUM_TRADES ? (window.AURUM_TRADES.todos || []) : [];
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
  var trades = window.AURUM_TRADES ? (window.AURUM_TRADES.todos || []) : [];
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
  var trades = window.AURUM_TRADES ? (window.AURUM_TRADES.todos || []) : [];
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
  var trades = window.AURUM_TRADES ? (window.AURUM_TRADES.todos || []) : [];
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
