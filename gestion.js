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
  if (id === 'diario' && typeof initZonaCapturasTest === 'function') initZonaCapturasTest();
  if (typeof aplicarEspaciadoPaneles === 'function') setTimeout(aplicarEspaciadoPaneles, 50);
}

function fechaDesdeFp(fp) {
  if (!fp) return null;
  var m = String(fp).match(/(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6]));
  return null;
}

function ordenarTradesPorFechaReal(arr) {
  return arr.slice().sort(function(a, b) {
    var fa = fechaDesdeFp(a.fp), fb = fechaDesdeFp(b.fp);
    if (!fa && !fb) return 0;
    if (!fa) return 1;
    if (!fb) return -1;
    return fa - fb;
  });
}

function getTradesActivos() {
  var cuenta = window.cuentaActivaGestion || 'global';
  if (!window.AURUM_TRADES) return [];
  var todos = window.AURUM_TRADES.todos || [];
  todos = ordenarTradesPorFechaReal(todos);
  if (cuenta === 'global') return todos;
  var keyword = { maestra:'maestra', retos:'retos', prueba:'prueba' }[cuenta];
  if (!keyword) return todos;
  // FIX corazón de datos (06/07): filtrar por cuenta_numero cuando esté disponible,
  // no solo por el nombre/etiqueta — mismo fix ya aplicado en getTrades() de
  // visitas.js (commit 09f7cae, 05/07). Sin esto, dos cuentas de usuarios
  // distintos con la misma etiqueta (ej. "Cuenta Prueba") se mezclarían aquí,
  // aunque en visitas.js ya estuvieran separadas correctamente.
  var _u = window.usuarioActual;
  var _numero = cuenta === 'maestra' ? (_u && _u.cuenta_maestra || null)
              : cuenta === 'retos'   ? (_u && _u.cuenta_retos   || null)
              : (_u && _u.cuenta_prueba || null);
  if (_numero) {
    var num = String(_numero);
    return todos.filter(function(t) { return t.cuenta_numero != null && String(t.cuenta_numero) === num; });
  }
  return todos.filter(function(t) {
    return t.cuenta && t.cuenta.toLowerCase().indexOf(keyword) >= 0;
  });
}

// FIX corazón de datos (06/07): un SL movido a break-even o más allá (protegiendo
// ganancia) se estaba midiendo por su distancia a la entrada igual que un SL de
// riesgo real — un trade con 100+ puntos de beneficio protegido salía marcado
// como "fuera del método", cuando es justo lo contrario: gestión perfecta.
// Esta función centraliza el criterio para los 3 sitios que clasifican por puntos.
function _esSlProtegido(t) {
  if (!t || t.sl == null || !t.tipo) return false;
  var pe = parseFloat(t.precio_entrada);
  if (!pe) return false; // sin precio_entrada fiable (0 o null) — no se puede evaluar
  if (parseFloat(t.precio_cierre) === 0) return false; // datos corruptos (ver Willian, precio_cierre=0)
  var sl = parseFloat(t.sl);
  if (isNaN(sl)) return false;
  return t.tipo === 'sell' ? (sl <= pe) : (sl >= pe);
}

function buildTradeRecord() {
  var trades = getTradesActivos();
  var tb   = document.getElementById('gest-tipos-bars');
  var verd = document.getElementById('gest-tipo-trader-veredicto');
  if (tb   && !trades.length) { tb.innerHTML   = ''; }
  if (verd && !trades.length) { verd.innerHTML = ''; }
  if (!trades.length) {
    ['gest-tipo-trader-veredicto-maestra','gest-tipo-trader-veredicto-retos','gest-tipo-trader-veredicto-prueba'].forEach(function(id) {
      var e = document.getElementById(id); if (e) e.innerHTML = '';
    });
  }
  if (trades.length) {
    // FIX corazón de datos (06/07): antes se recalculaba aquí, a mano, exactamente
    // lo mismo que calcTipos() en visitas.js (mismos umbrales, mismas etiquetas) —
    // un fix futuro al WR ambiguo (o a cualquier otro cálculo) solo se aplicaba en
    // uno de los dos sitios. Ahora ambos llaman a la misma función.
    var tipos = (typeof calcTipos === 'function') ? calcTipos(trades) : [];
    var maxT = Math.max.apply(null, tipos.map(function(d){ return d.t; })) || 1;
    if (tb) {
      tb.innerHTML = tipos.map(function(d) {
        var col = d.l.includes('Swing') ? 'linear-gradient(90deg,#C9A84C44,#E8C870)' : d.l.includes('Multi') ? '#4ACC8A' : d.l.includes('Scalp') ? '#6A8AEE55' : '#CC554455';
        return '<div style="margin-bottom:.8rem;">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:.3rem;">' +
          '<span style="font-size:15px;color:'+(d.wr>=70?'var(--gold-bright)':'var(--text-dim)')+';">'+d.l+'</span>' +
          '<span style="font-size:13px;color:var(--text-muted);">'+d.t+'t' + (d.wr===null?'':' · '+d.wr+'% WR') + ' · '+(d.pnl>=0?'+':'')+d.pnl+'$</span></div>' +
          '<div style="height:4px;background:var(--border);border-radius:2px;">' +
          '<div style="height:100%;width:'+Math.round(d.t/maxT*100)+'%;background:'+col+';border-radius:2px;"></div></div></div>';
      }).join('');
    }
    var dominante = tipos.reduce(function(a,b){ return b.t > a.t ? b : a; });
    var colDom = dominante.l.includes('Swing') ? '#C9A84C' : dominante.l.includes('Multi') ? '#4ACC8A' : dominante.l.includes('Scalp') ? '#6A8AEE' : '#CC5544';
    var tiposConDatos = tipos.filter(function(d){ return d.t >= 3; });
    var verdHtml = '<div style="display:flex;align-items:flex-start;gap:1rem;flex-wrap:wrap;padding:.8rem 0;">' +
      '<div style="padding:.6rem 1rem;border:1px solid '+colDom+'44;background:'+colDom+'08;">' +
      '<div style="font-size:11px;color:var(--text-muted);margin-bottom:.2rem;letter-spacing:.1em;text-transform:uppercase;">Tipo dominante</div>' +
      '<div style="font-size:15px;color:'+colDom+';">'+dominante.l+'</div>' +
      '<div style="font-size:12px;color:var(--text-muted);">'+dominante.t+' trades · '+dominante.wr+'% WR</div></div>';
    if (tiposConDatos.length >= 2) {
      var mejorWR = tiposConDatos.reduce(function(a,b){ return b.wr > a.wr ? b : a; });
      var peorWR  = tiposConDatos.reduce(function(a,b){ return b.wr < a.wr ? b : a; });
      verdHtml += '<div style="padding:.6rem 1rem;border:1px solid #3AAA6A44;background:#3AAA6A08;">' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:.2rem;letter-spacing:.1em;text-transform:uppercase;">Mejor WR</div>' +
        '<div style="font-size:15px;color:var(--green);">'+mejorWR.l+'</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">'+mejorWR.wr+'% · '+mejorWR.t+' trades</div></div>' +
        '<div style="padding:.6rem 1rem;border:1px solid #CC554422;background:#CC554408;">' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:.2rem;letter-spacing:.1em;text-transform:uppercase;">Peor WR</div>' +
        '<div style="font-size:15px;color:var(--red);">'+peorWR.l+'</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">'+peorWR.wr+'% · '+peorWR.t+' trades</div></div>';
      // FIX (26/08): "dominante" es por conteo y "Mejor/Peor WR" es por WR
      // aislado — ninguno de los dos combina WR+R/R. Se añade este tercero
      // rankeado por esperanza (misma fórmula ya usada en toda la app,
      // calcMetricas: wr-ponderado sobre puntos ganados/perdidos), sin
      // quitar los dos anteriores.
      var mejorEsp = tiposConDatos.reduce(function(a,b){ return b.esp > a.esp ? b : a; });
      verdHtml += '<div style="padding:.6rem 1rem;border:1px solid #C9A84C44;background:#C9A84C08;">' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:.2rem;letter-spacing:.1em;text-transform:uppercase;">Tipo más consistente</div>' +
        '<div style="font-size:15px;color:var(--gold);">'+mejorEsp.l+'</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">Esperanza '+(mejorEsp.esp>=0?'+':'')+mejorEsp.esp+' pts/trade</div></div>';
    }
    verdHtml += '</div>';
    if (verd) { verd.innerHTML = verdHtml; }
    var cuentaActiva = window.cuentaActivaGestion || 'global';
    var verdIdCuenta = cuentaActiva === 'maestra' ? 'gest-tipo-trader-veredicto-maestra'
                     : cuentaActiva === 'retos'   ? 'gest-tipo-trader-veredicto-retos'
                     : cuentaActiva === 'prueba'  ? 'gest-tipo-trader-veredicto-prueba'
                     : null;
    var verdCuenta = verdIdCuenta ? document.getElementById(verdIdCuenta) : null;
    if (verdCuenta) { verdCuenta.innerHTML = verdHtml; }
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
    ['gest-horas-barras','gest-dias-semana','gest-patrones','gest-ventanas-15min'].forEach(function(id) {
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

  // Ventana dinámica: 8 horas consecutivas con más trades
  var bestStart = 0, bestCount = 0;
  for (var s = 0; s < 24; s++) {
    var cnt = 0;
    for (var w = 0; w < 8; w++) cnt += porHora[(s + w) % 24].t;
    if (cnt > bestCount) { bestCount = cnt; bestStart = s; }
  }
  var winSet = {};
  for (var w = 0; w < 8; w++) winSet[(bestStart + w) % 24] = true;
  var endH = (bestStart + 7) % 24;
  var hStr = (bestStart < 10 ? '0' + bestStart : bestStart) + ':00–' + (endH < 10 ? '0' + endH : endH) + ':59';
  var pnlDentro = 0, pnlFuera = 0;
  for (var h = 0; h < 24; h++) {
    if (winSet[h]) pnlDentro += porHora[h].p;
    else pnlFuera += porHora[h].p;
  }
  pnlDentro = Math.round(pnlDentro);
  pnlFuera  = Math.round(pnlFuera);
  var elVentana = document.getElementById('gest-horarios-ventana');
  if (elVentana) {
    elVentana.textContent = '▲ Tu ventana óptima (' + hStr + ') · Dentro: ' +
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
      var wr = d.t > 0 ? Math.round(d.w/d.t*100) : null;
      var col = document.createElement('div');
      col.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;';
      var ht = d.t === 0 ? 1 : Math.max(3, (d.t/mx)*85);
      var bg = d.t === 0 ? 'var(--border)' : wr >= 70 ? '#3AAA6A' : wr >= 50 ? '#C9A84C44' : '#CC554466';
      col.innerHTML = '<div style="width:100%;height:'+ht+'px;background:'+bg+';border-radius:1px 1px 0 0;" title="'+h+':xx · '+d.t+' trades' + (wr === null ? '' : ' · WR '+wr+'%') + '"></div>' +
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
      return { d:d.d, wr:d.t>0?Math.round(d.w/d.t*1000)/10:null, pnl:Math.round(d.p*100)/100, t:d.t };
    }).sort(function(a,b){ if(a.wr===null&&b.wr===null) return 0; if(a.wr===null) return 1; if(b.wr===null) return -1; return b.wr-a.wr; });
    ds.innerHTML = sorted.map(function(d) {
      var best = d.wr >= 65; var bad = d.wr < 50 && d.t > 0;
      return '<div style="display:flex;align-items:center;gap:.8rem;padding:.5rem 0;border-bottom:1px solid #0A0C14;">' +
        '<span style="font-size:14px;width:85px;color:'+(best?'#C8BDA0':bad?'var(--red)':'var(--text-dim)')+';">'+(best?'✦ ':bad?'⚠ ':'')+d.d+'</span>' +
        '<div style="flex:1;height:3px;background:var(--border);border-radius:2px;">' +
        '<div style="height:100%;width:'+(d.wr===null?0:d.wr)+'%;background:'+(best?'#4ACC8A':bad?'#CC554444':'#C9A84C44')+';border-radius:2px;"></div></div>' +
        '<span style="font-size:13px;color:'+(best?'var(--green)':bad?'var(--red)':'var(--text-muted)')+';width:115px;text-align:right;">'+(d.wr===null ? 'Sin trades' : d.wr+'% · '+(d.pnl>=0?'+':'')+d.pnl+'$')+'</span></div>';
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

  // Ventanas de 15 minutos (usando campo fp del trade)
  var elV15 = document.getElementById('gest-ventanas-15min');
  if (elV15) {
    var porSlot = {};
    trades.forEach(function(t) {
      var hh = -1, mm = -1;
      if (t.fp) {
        var m = t.fp.match(/(\d{2}):(\d{2}):\d{2}/);
        if (m) { hh = parseInt(m[1]); mm = parseInt(m[2]); }
      }
      if (hh < 0 && t.hora !== undefined) {
        hh = Math.floor(t.hora);
        mm = Math.round((t.hora - hh) * 60);
      }
      if (hh < 0) return;
      var slotMin = Math.floor(mm / 15) * 15;
      var key = (hh < 10 ? '0' + hh : hh) + ':' + (slotMin === 0 ? '00' : slotMin);
      if (!porSlot[key]) porSlot[key] = { t: 0, w: 0, p: 0, rr_w: 0, rr_l: 0, n_w: 0, n_l: 0 };
      porSlot[key].t++;
      if (t.ganadora) {
        porSlot[key].w++;
        porSlot[key].rr_w += (t.puntos || 0);
        porSlot[key].n_w++;
      } else {
        porSlot[key].rr_l += (t.puntos || 0);
        porSlot[key].n_l++;
      }
      porSlot[key].p += (t.beneficio || 0);
    });

    var slotList = Object.keys(porSlot)
      .filter(function(k) { return porSlot[k].t >= 3; })
      .map(function(k) {
        var s = porSlot[k];
        var wr = Math.round(s.w / s.t * 1000) / 10;
        var avgW = s.n_w > 0 ? s.rr_w / s.n_w : 0;
        var avgL = s.n_l > 0 ? s.rr_l / s.n_l : 0;
        var rr  = avgL > 0 ? Math.round(avgW / avgL * 100) / 100 : 0;
        var parts = k.split(':');
        var hh2 = parseInt(parts[0]);
        var mm2 = parseInt(parts[1]) + 15;
        var hh3 = hh2 + Math.floor(mm2 / 60);
        var mm3 = mm2 % 60;
        var fin = (hh3 < 10 ? '0' + hh3 : hh3) + ':' + (mm3 === 0 ? '00' : mm3);
        return { key: k, fin: fin, t: s.t, w: s.w, wr: wr, rr: rr, p: Math.round(s.p) };
      })
      .sort(function(a, b) { return a.key.localeCompare(b.key); });

    if (slotList.length < 2) {
      elV15.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">Se necesitan al menos 3 trades en una franja de 15 min para mostrar datos. Aseg\u00farate de que el historial tenga hora exacta en el campo fp.</div>';
    } else {
      var mejorWR = slotList.reduce(function(a, b) { return b.wr > a.wr ? b : a; });
      var mejorRR = slotList.filter(function(s) { return s.rr > 0; });
      mejorRR = mejorRR.length > 0 ? mejorRR.reduce(function(a, b) { return b.rr > a.rr ? b : a; }) : null;
      var maxT = Math.max.apply(null, slotList.map(function(s) { return s.t; })) || 1;

      var html = '<div style="margin-bottom:1rem;">';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:1rem;">';
      html += '<div style="padding:.7rem;border:1px solid #3AAA6A44;background:#3AAA6A08;">' +
        '<div style="font-size:10px;letter-spacing:.2em;color:var(--green);margin-bottom:.3rem;">\u2746 MEJOR WR</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:var(--green);">' + mejorWR.key + '\u2013' + mejorWR.fin + '</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">' + mejorWR.wr + '% WR \u00b7 ' + mejorWR.t + ' trades \u00b7 ' + (mejorWR.p >= 0 ? '+' : '') + mejorWR.p + '$</div>' +
        '</div>';
      if (mejorRR) {
        html += '<div style="padding:.7rem;border:1px solid #C9A84C44;background:#C9A84C08;">' +
          '<div style="font-size:10px;letter-spacing:.2em;color:var(--gold);margin-bottom:.3rem;">\u2746 MEJOR R/R</div>' +
          '<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:var(--gold-bright);">' + mejorRR.key + '\u2013' + mejorRR.fin + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);">R/R ' + mejorRR.rr + ' \u00b7 ' + mejorRR.t + ' trades \u00b7 ' + (mejorRR.p >= 0 ? '+' : '') + mejorRR.p + '$</div>' +
          '</div>';
      }
      html += '</div>';
      html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:.5rem;letter-spacing:.1em;">TODAS LAS FRANJAS (m\u00edn. 3 trades)</div>';
      slotList.forEach(function(s) {
        var wr = s.wr;
        var barW = Math.max(2, Math.round(s.t / maxT * 100));
        var bg = wr >= 60 ? '#3AAA6A' : wr >= 50 ? '#C9A84C' : '#CC5544';
        var isMejWR = s.key === mejorWR.key;
        var isMejRR = mejorRR && s.key === mejorRR.key;
        html += '<div style="display:flex;align-items:center;gap:.6rem;padding:.35rem 0;border-bottom:1px solid #0A0C14;">' +
          '<span style="font-size:12px;color:var(--text-dim);width:100px;flex-shrink:0;">' +
          (isMejWR ? '\u2746 ' : isMejRR ? '\u25c8 ' : '') + s.key + '\u2013' + s.fin + '</span>' +
          '<div style="flex:1;height:3px;background:var(--border);border-radius:2px;">' +
          '<div style="height:100%;width:' + barW + '%;background:' + bg + ';border-radius:2px;"></div></div>' +
          '<span style="font-size:12px;color:' + bg + ';width:50px;text-align:right;">' + wr + '%</span>' +
          '<span style="font-size:11px;color:var(--text-muted);width:55px;text-align:right;">R/R ' + (s.rr > 0 ? s.rr : '\u2014') + '</span>' +
          '<span style="font-size:11px;color:var(--text-muted);width:40px;text-align:right;">' + s.t + 't</span>' +
          '</div>';
      });
      html += '</div>';
      elV15.innerHTML = html;
    }
  }
}

function buildCicloDots() {
  var trades = getTradesActivos();
  var cd = document.getElementById('gest-ciclo-dots');

  if (trades.length < 5) {
    ['ciclo-num-actual','ciclo-encurso-txt','ciclo-wr','ciclo-wr-sub','ciclo-pnl',
     'ciclo-rr','ciclo-rr-sub','ciclo-esp','ciclo-cumpl','ciclo-cumpl-sub',
     'ciclo-puntuacion','ciclo-veredicto-txt','ciclo-completado-label',
     'ciclo-completado-trades'].forEach(function(id) {
      var e = document.getElementById(id); if (e) e.textContent = '—';
    });
    if (cd) cd.innerHTML = '';
    var cva = document.getElementById('ciclo-vs-anterior');
    if (cva) cva.innerHTML = '';
    var elLotCiclo = document.getElementById('ciclo-lotajes');
    if (elLotCiclo) elLotCiclo.innerHTML = '';
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
  el = document.getElementById('ciclo-completado-label');
  if (el) el.textContent = completados > 0 ? ('Ciclo ' + completados + ' — completado') : 'Aún sin ciclos completados';
  el = document.getElementById('ciclo-completado-trades');
  if (el) el.textContent = completados > 0 ? '111 / 111 trades' : '';

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
  var limEdge   = (window.usuarioActual && window.usuarioActual.sl_edge)   || 11;
  var limAire   = (window.usuarioActual && window.usuarioActual.sl_aire)   || 25;
  var limLimite = (window.usuarioActual && window.usuarioActual.sl_limite) || 50;
  var dentro = ultimos.filter(function(t){ return t.puntos <= limAire || _esSlProtegido(t); });
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

  // Ciclo vs anterior
  var cva = document.getElementById('ciclo-vs-anterior');
  if (cva) {
    if (completados < 1) {
      cva.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:1rem 0;">Completa el primer ciclo para ver la comparativa con el anterior.</div>';
    } else {
      var prevEnd   = trades.length - enCurso;
      var prevStart = Math.max(0, prevEnd - 111);
      var prev      = prevEnd > prevStart ? trades.slice(prevStart, prevEnd) : [];
      var prevWins  = prev.filter(function(t){ return t.ganadora; }).length;
      var prevWR    = prev.length > 0 ? Math.round(prevWins/prev.length*1000)/10 : null;
      var prevPnl   = Math.round(prev.reduce(function(s,t){ return s+(t.beneficio||0); },0)*100)/100;
      var prevPtsW  = prevWins > 0 ? prev.filter(function(t){ return t.ganadora; }).reduce(function(s,t){ return s+(t.puntos||0); },0)/prevWins : 0;
      var prevLoss  = prev.length - prevWins;
      var prevPtsL  = prevLoss > 0 ? prev.filter(function(t){ return !t.ganadora; }).reduce(function(s,t){ return s+(t.puntos||0); },0)/prevLoss : 0;
      var prevRR    = prevPtsL > 0 ? Math.round(prevPtsW/prevPtsL*100)/100 : 0;
      function _cvaTag(cur, ant, higherBetter) {
        var d = Math.round((cur - ant)*10)/10;
        var ok = higherBetter ? d >= 0 : d <= 0;
        return '<span style="font-size:11px;color:'+(ok?'var(--green)':'var(--red)')+';">'+(d>=0?'+':'')+d+'</span>';
      }
      cva.innerHTML =
        '<div style="padding:1rem 2rem;border-top:1px solid var(--border);background:var(--bg2);">' +
        '<div class="tag" style="display:block;margin-bottom:.8rem;">Ciclo actual vs ciclo anterior ('+prev.length+' trades)</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);">' +
        '<div style="background:var(--bg);padding:.8rem;text-align:center;">' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:.2rem;">Win Rate</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:24px;color:var(--green);">'+wr+'%</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">ant: '+(prevWR===null?'sin datos':prevWR+'%')+' '+(prevWR===null?'':_cvaTag(wr,prevWR,true))+'</div></div>' +
        '<div style="background:var(--bg);padding:.8rem;text-align:center;">' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:.2rem;">R/R</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:24px;color:var(--gold-bright);">'+rr+'</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">ant: '+prevRR+' '+_cvaTag(rr,prevRR,true)+'</div></div>' +
        '<div style="background:var(--bg);padding:.8rem;text-align:center;">' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:.2rem;">P&L</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:24px;color:'+(pnl>=0?'var(--green)':'var(--red)')+'">'+(pnl>=0?'+':'')+pnl+'$</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">ant: '+(prevPnl>=0?'+':'')+prevPnl+'$ '+_cvaTag(pnl,prevPnl,true)+'</div></div>' +
        '</div></div>';
    }
  }

  // Lotajes del ciclo actual
  var elLotCiclo = document.getElementById('ciclo-lotajes');
  if (elLotCiclo) {
    var vols = ultimos.map(function(t) { return t.volumen || 0; }).filter(function(v) { return v > 0; });
    if (vols.length < 3) {
      elLotCiclo.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">Sin datos de lotaje en este ciclo.</div>';
    } else {
      var minVol = Math.min.apply(null, vols);
      var maxVol = Math.max.apply(null, vols);
      var freq = {};
      vols.forEach(function(v) {
        var k = (Math.round(v * 100) / 100).toFixed(2);
        freq[k] = (freq[k] || 0) + 1;
      });
      var masFreqKey = Object.keys(freq).reduce(function(a, b) { return freq[b] > freq[a] ? b : a; });
      var masFreqCnt = freq[masFreqKey];
      var masFreqPct = Math.round(masFreqCnt / vols.length * 100);

      elLotCiclo.innerHTML =
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);">' +
        '<div style="background:var(--bg);padding:.7rem;text-align:center;">' +
        '<div style="font-size:10px;color:var(--text-muted);margin-bottom:.2rem;">MÍN</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:var(--text-dim);">' + minVol.toFixed(2) + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);">lots</div></div>' +
        '<div style="background:var(--bg);padding:.7rem;text-align:center;border-left:1px solid var(--border-gold);border-right:1px solid var(--border-gold);">' +
        '<div style="font-size:10px;color:var(--gold);margin-bottom:.2rem;">MÁS USADO</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:var(--gold-bright);">' + masFreqKey + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);">' + masFreqCnt + ' trades · ' + masFreqPct + '%</div></div>' +
        '<div style="background:var(--bg);padding:.7rem;text-align:center;">' +
        '<div style="font-size:10px;color:var(--text-muted);margin-bottom:.2rem;">MÁX</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:var(--text-dim);">' + maxVol.toFixed(2) + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);">lots</div></div>' +
        '</div>';
    }
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
  renderSlConfig();
  var trades = getTradesActivos();

  // FIX corazón de datos (14/07): excluir trades con precio_entrada y
  // precio_cierre en 0 — son datos rotos de imports fallidos entre el
  // 13/06 y el 18/06 (parser de esos días no capturaba el precio), no un
  // SL real. Sin este filtro, 'puntos' se calcula como abs(sl - 0) = el
  // valor del SL en bruto (ej. 5340 puntos), contaminando la clasificación
  // Edge/Aire/Límite/Fuera con datos imposibles. Confirmado con SQL en
  // Supabase: sin el filtro el % "fuera del método" salía en 25.5%
  // (958/1286), con el filtro sale el real: 10.4% (223/249). No afecta a
  // ninguna otra pantalla (P&L, Trade Record, Equity no usan esta función).
  trades = trades.filter(function(t) {
    return !(t.precio_entrada === 0 && t.precio_cierre === 0);
  });

  if (trades.length < 5) {
    ['cumpl-dentro-num','cumpl-dentro-pct','cumpl-fuera-num','cumpl-fuera-pct',
     'cumpl-wr-dentro','cumpl-wr-dentro-sub','cumpl-wr-fuera','cumpl-wr-fuera-sub'].forEach(function(id) {
      var e = document.getElementById(id); if (e) e.textContent = '—';
    });
    ['cumpl-sl-dist','cumpl-alertas','cumpl-evolucion-mensual'].forEach(function(id) {
      var e = document.getElementById(id); if (e) e.innerHTML = '';
    });
    buildCumplimientoParciales();
    return;
  }

  var n      = trades.length;
  var limEdge   = (window.usuarioActual && window.usuarioActual.sl_edge)   || 11;
  var limAire   = (window.usuarioActual && window.usuarioActual.sl_aire)   || 25;
  var limLimite = (window.usuarioActual && window.usuarioActual.sl_limite) || 50;
  var edge   = trades.filter(function(t){ return t.puntos <= limEdge || _esSlProtegido(t); });
  var aire   = trades.filter(function(t){ return !_esSlProtegido(t) && t.puntos > limEdge && t.puntos <= limAire; });
  var limite = trades.filter(function(t){ return !_esSlProtegido(t) && t.puntos > limAire && t.puntos <= limLimite; });
  var afuera = trades.filter(function(t){ return !_esSlProtegido(t) && t.puntos > limLimite; });
  var dentro = trades.filter(function(t){ return t.puntos <= limAire || _esSlProtegido(t); });
  var fuera  = trades.filter(function(t){ return !_esSlProtegido(t) && t.puntos > limAire; });

  function wr(arr)  { return arr.length > 0 ? Math.round(arr.filter(function(t){ return t.ganadora; }).length/arr.length*1000)/10 : null; }
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
    'cumpl-wr-dentro':     (wrDentro === null ? '—' : wrDentro + '%'),
    'cumpl-wr-dentro-sub': 'P&L ' + (pnlDentro >= 0 ? '+' : '') + pnlDentro + '$ · riesgo controlado',
    'cumpl-wr-fuera':      (wrFuera === null ? '—' : wrFuera + '%'),
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
      { label:'✦ Edge', desc:'≤ ' + limEdge + ' puntos — SL perfecto',                       arr:edge,   bg:'#c9a84c18', col:'#e8c870', border:'#c9a84c44', grad:'#c9a84c44,#e8c870' },
      { label:'Aire',   desc:(limEdge + 1) + '–' + limAire + ' puntos — tolerable',          arr:aire,   bg:'#aaa03a18', col:'#c8b040', border:'#aaa03a33', grad:'#aaa03a44,#c8b040' },
      { label:'Límite', desc:(limAire + 1) + '–' + limLimite + ' puntos — zona peligrosa',   arr:limite, bg:'#cc884418', col:'#cc8844', border:'#cc884433', grad:'#cc884444,#cc8844' },
      { label:'Fuera',  desc:'&gt;' + limLimite + ' puntos — fuera del método',              arr:afuera, bg:'#cc443318', col:'#cc5544', border:'#cc443333', grad:'#cc443344,#cc5544' }
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
    var conSlExcesivo = trades.filter(function(t){ return t.sl != null && t.puntos > limAire && !_esSlProtegido(t); })
      .sort(function(a, b){ return b.puntos - a.puntos; })
      .slice(0, 3);
    var sinSl = trades.filter(function(t){ return t.sl == null; })
      .sort(function(a, b){ return Math.abs(b.beneficio) - Math.abs(a.beneficio); })
      .slice(0, 2);
    var outliers = conSlExcesivo.concat(sinSl).slice(0, 5);

    var alertasHtml = '';
    if (outliers.length) {
      alertasHtml = outliers.map(function(t) {
        var pts  = Math.round(t.puntos * 10) / 10;
        var vol  = t.volumen && t.volumen > 0 ? t.volumen.toFixed(2) + ' lotes · ' : '';
        var ben  = (t.beneficio >= 0 ? '+' : '') + Math.round(t.beneficio * 100) / 100 + '$';
        var desc = t.sl == null
          ? (t.beneficio > 0 ? 'Ganó ' + ben + ' sin SL registrado. Opera siempre con stop.' : 'Perdió ' + ben + ' sin SL registrado. Opera siempre con stop.')
          : (t.beneficio > 0 ? 'Ganó ' + ben + ' pero con ' + pts + ' puntos de SL. Fuera del método aunque ganara.' : 'Perdió ' + ben + '. SL excesivo de ' + pts + ' puntos.');
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
    var lectura = wrDentro === null
      ? '"Aún no hay trades dentro del método en esta cuenta para evaluar el win rate del edge."'
      : (pctEdge >= 70
        ? '"El ' + pctEdge + '% de tus trades respetan el Edge ' + limEdge + '. Tu win rate dentro del método es ' + wrDentro + '%. El proceso está en marcha."'
        : '"El ' + pctEdge + '% de tus trades respetan el Edge ' + limEdge + '. Cuando lo respetas, tu win rate sube al ' + wrDentro + '%. El método funciona — el reto es aplicarlo siempre."');

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

  // Evolución mensual del cumplimiento
  var elEvolMens = document.getElementById('cumpl-evolucion-mensual');
  if (elEvolMens) {
    var porMesCumpl = {}, mesOrdenCumpl = [];
    trades.forEach(function(t) {
      var key = null;
      if (t.fp) {
        var mf = String(t.fp).match(/(\d{4})\.(\d{2})\.(\d{2})/);
        if (mf) key = mf[1] + '-' + mf[2];
      }
      if (!key && t.created_at) {
        var dc = new Date(t.created_at);
        var mc = dc.getMonth() + 1;
        key = dc.getFullYear() + '-' + (mc < 10 ? '0' + mc : '' + mc);
      }
      if (!key) return;
      if (!porMesCumpl[key]) { porMesCumpl[key] = { t:0, dentro:0 }; mesOrdenCumpl.push(key); }
      porMesCumpl[key].t++;
      if (t.puntos <= limAire || _esSlProtegido(t)) porMesCumpl[key].dentro++;
    });
    var MESES_C = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    function _mesLabel(k) { var p = k.split('-'); return MESES_C[parseInt(p[1])-1] + ' ' + p[0].slice(2); }
    var mesesConDatosCumpl = mesOrdenCumpl.filter(function(k){ return porMesCumpl[k].t >= 3; });
    if (mesesConDatosCumpl.length < 2) {
      elEvolMens.innerHTML = '';
    } else {
      var htmlMenses = mesesConDatosCumpl.map(function(k) {
        var m = porMesCumpl[k];
        var pctM = Math.round(m.dentro / m.t * 100);
        var colM = pctM >= 70 ? '#4ACC8A' : pctM >= 50 ? '#C9A84C' : '#CC5544';
        return '<div style="display:flex;align-items:center;gap:.8rem;padding:.5rem 0;border-bottom:1px solid #0A0C14;">' +
          '<span style="font-size:13px;color:var(--text-dim);width:60px;flex-shrink:0;">'+_mesLabel(k)+'</span>' +
          '<div style="flex:1;height:4px;background:var(--border);border-radius:2px;">' +
          '<div style="height:100%;width:'+pctM+'%;background:'+colM+';border-radius:2px;"></div></div>' +
          '<span style="font-size:13px;color:'+colM+';width:42px;text-align:right;">'+pctM+'%</span>' +
          '<span style="font-size:12px;color:var(--text-muted);width:60px;text-align:right;">'+m.t+' trades</span>' +
          '</div>';
      }).join('');
      elEvolMens.innerHTML =
        '<div style="padding:1.5rem 2rem;border-top:1px solid var(--border);">' +
        '<div class="tag" style="display:block;margin-bottom:1rem;">Evolución mensual del cumplimiento · % trades en método (Edge ' + limEdge + ')</div>' +
        htmlMenses + '</div>';
    }
  }
  // Parciales
  buildCumplimientoParciales();
}

async function buildCumplimientoParciales() {
  var contenedor = document.getElementById('cumpl-parciales-bloque');
  if (!contenedor) return;

  var ua = window.usuarioActual;
  var email = ua && ua.email;
  if (!email) { contenedor.innerHTML = ''; return; }

  var tp1 = (ua && ua.tp_parcial1) || 18;
  var tp2 = (ua && ua.tp_parcial2) || 33;
  var tp3 = (ua && ua.tp_parcial3) || 50;

  contenedor.innerHTML = '<div style="padding:1rem 2rem;color:var(--text-muted);font-size:13px;">Cargando parciales…</div>';

  var token = getToken();
  var cuentaSel = window.cuentaActivaGestion || 'global';
  var cuentasActivas = [];
  if (cuentaSel === 'global') {
    if (ua.cuenta_maestra) cuentasActivas.push(String(ua.cuenta_maestra));
    if (ua.cuenta_retos)   cuentasActivas.push(String(ua.cuenta_retos));
    if (ua.cuenta_prueba)  cuentasActivas.push(String(ua.cuenta_prueba));
  } else if (cuentaSel === 'maestra' && ua.cuenta_maestra) {
    cuentasActivas.push(String(ua.cuenta_maestra));
  } else if (cuentaSel === 'retos' && ua.cuenta_retos) {
    cuentasActivas.push(String(ua.cuenta_retos));
  } else if (cuentaSel === 'prueba' && ua.cuenta_prueba) {
    cuentasActivas.push(String(ua.cuenta_prueba));
  }

  if (!cuentasActivas.length) {
    contenedor.innerHTML = '<div style="padding:1rem 2rem;color:var(--text-muted);font-size:13px;">Sin cuentas activas.</div>';
    return;
  }

  var inFilter = cuentasActivas.map(function(c){ return '"' + c + '"'; }).join(',');
  // FIX corazón de datos (04/07): filtrar también por usuario_email, no solo
  // por cuenta_numero — este último puede coincidir con la cuenta de OTRO
  // usuario del sistema (confirmado: 7747760 es de Willian, no único global).
  var result = await supaGet('trade_parciales', 'usuario_email=eq.' + encodeURIComponent(email) + '&cuenta_numero=in.(' + inFilter + ')&order=hora.asc', token);
  if (result.error) {
    contenedor.innerHTML = '<div style="padding:1rem 2rem;color:var(--red);font-size:13px;">Error al cargar parciales: ' + result.error + '</div>';
    return;
  }

  var parciales = result.data || [];
  if (!Array.isArray(parciales) || parciales.length === 0) {
    contenedor.innerHTML =
      '<div style="padding:1.5rem 2rem;border-top:1px solid var(--border);">' +
      '<div class="tag" style="display:block;margin-bottom:.5rem;">Gestión activa · Parciales</div>' +
      '<div style="font-size:13px;color:var(--text-muted);">Sin parciales registrados en las cuentas activas.</div></div>';
    return;
  }

  // Agrupar por fp_trade
  var porTrade = {};
  parciales.forEach(function(p) {
    var key = String(p.fp_trade);
    if (!porTrade[key]) porTrade[key] = [];
    porTrade[key].push(p);
  });

  // Cruzar trades activos por fp
  var trades = getTradesActivos ? getTradesActivos() : [];
  var tradeByFp = {};
  trades.forEach(function(t) {
    if (t.fp) tradeByFp[String(t.fp)] = t;
  });

  // Zonas TP
  var zonas = [
    { label: 'TP1', rango: '1 – ' + tp1 + ' pts',            count: 0, fuera: [], limMin: 1,      limMax: tp1 },
    { label: 'TP2', rango: (tp1+1) + ' – ' + tp2 + ' pts',  count: 0, fuera: [], limMin: tp1+1,   limMax: tp2 },
    { label: 'TP3', rango: (tp2+1) + ' – ' + tp3 + ' pts',  count: 0, fuera: [], limMin: tp2+1,   limMax: tp3 }
  ];
  var totalConParciales = 0;
  var totalParciales = 0;
  var parcialesOk = 0;

  Object.keys(porTrade).forEach(function(pid) {
    var grupo = porTrade[pid];
    // FIX corazón de datos (06/07): 'hora' es un número (0-23), no texto —
    // ordenar con localeCompare hacía que "14" ordenara antes que "8".
    grupo.sort(function(a, b) { return (parseInt(a.hora, 10) || 0) - (parseInt(b.hora, 10) || 0); });

    var trade = tradeByFp[pid];
    var pe = trade ? (parseFloat(trade.precio_entrada) || null) : null;

    totalConParciales++;

    // FIX corazón de datos (06/07): idxZona debe contar solo parciales de TP
    // (no-SL) en orden — antes usaba el índice del array completo, así que
    // una salida de SL intercalada desplazaba el resto y evaluaba el parcial
    // contra la zona equivocada (ej. el 2º parcial real se juzgaba como 3º).
    var idxTp = 0;
    grupo.forEach(function(p) {
      if (p.es_sl) return; // salida controlada por SL — no evaluar zona TP, no cuenta para el índice
      totalParciales++;
      if (pe === null) return;

      var puntos = Math.abs(pe - parseFloat(p.precio || 0));
      puntos = Math.round(puntos * 100) / 100;

      var idxZona = Math.min(idxTp, 2);
      idxTp++;
      var zona = zonas[idxZona];

      if (puntos >= zona.limMin && puntos <= zona.limMax) {
        // Dentro de zona — correcto
        zona.count++;
        parcialesOk++;
      } else if (puntos < zona.limMin) {
        // Cerró ANTES de la zona — demasiado pronto — fallo real
        zona.fuera.push({ pid: pid, puntos: puntos, tipo: 'pronto' });
      } else {
        // Cerró MÁS ALLÁ de la zona — llegó más lejos — contar como ok
        zona.count++;
        parcialesOk++;
        zona.masLejos = (zona.masLejos || 0) + 1;
      }
    });
  });

  // Trades sin parciales
  var fpsConParciales = Object.keys(porTrade);
  var totalSinParciales = 0;
  trades.forEach(function(t) {
    if (!t.fp) return;
    if (fpsConParciales.indexOf(String(t.fp)) === -1) totalSinParciales++;
  });

  var totalTrades = totalConParciales + totalSinParciales;
  var pctGestion = totalTrades > 0 ? Math.round(totalConParciales / totalTrades * 1000) / 10 : 0;
  var pctSinGestion = Math.round((100 - pctGestion) * 10) / 10;

  var colZona = ['#c9a84c', '#aaa03a', '#4ACC8A'];

  var html = '<div style="padding:1.5rem 2rem;border-top:1px solid var(--border);">';
  html += '<div class="tag" style="display:block;margin-bottom:1.2rem;">Gestión activa · Parciales</div>';

  // Cards ratio gestion activa vs salida unica
  html += '<div style="display:flex;gap:1.5rem;margin-bottom:1.5rem;flex-wrap:wrap;">';
  html += _parcialesStatCard('Con gestión activa', totalConParciales, pctGestion + '%', '#c9a84c', 'Trades con al menos 1 parcial registrado');
  html += _parcialesStatCard('Salida única', totalSinParciales, pctSinGestion + '%', '#7a6a4a', 'Trades cerrados de golpe sin parciales');
  html += '</div>';

  if (totalParciales > 0) {
    var pctOk = Math.round(parcialesOk / totalParciales * 1000) / 10;
    html += '<div style="margin-bottom:1.5rem;">';
    html += '<div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--text-muted);margin-bottom:.8rem;">Distribución por zona TP</div>';

    zonas.forEach(function(z, i) {
      var total_z = z.count + z.fuera.length;
      var pctZ = total_z > 0 ? Math.round(z.count / total_z * 1000) / 10 : 0;
      var col = colZona[i];
      html += '<div style="display:flex;align-items:flex-start;gap:1rem;padding:.8rem 1rem;border:1px solid var(--border);background:#0e0c08;margin-bottom:.5rem;">';
      html += '<div style="font-size:11px;padding:.2rem .7rem;letter-spacing:.15em;text-transform:uppercase;width:48px;text-align:center;flex-shrink:0;background:' + col + '18;color:' + col + ';border:1px solid ' + col + '44;">' + z.label + '</div>';
      html += '<div style="flex:1;">';
      html += '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:.3rem;">';
      html += '<span>' + z.rango + '</span>';
      html += '<span style="color:' + col + ';">' + pctZ + '% dentro &middot; ' + z.count + ' / ' + total_z + (z.masLejos ? ' <span style="font-size:10px;color:var(--text-muted);">(' + z.masLejos + ' pasaron zona)</span>' : '') + '</span></div>';
      html += '<div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:.5rem;">';
      html += '<div style="height:100%;width:' + Math.min(100, pctZ) + '%;background:' + col + ';border-radius:2px;"></div></div>';

      if (z.fuera.length > 0) {
        html += '<div style="margin-top:.4rem;">';
        z.fuera.slice(0, 5).forEach(function(f) {
          var zonaReal = f.puntos <= tp1 ? 'TP1 (≤' + tp1 + 'pts)' : f.puntos <= tp2 ? 'TP2 (≤' + tp2 + 'pts)' : 'TP3 (≤' + tp3 + 'pts)';
          html += '<div style="font-size:11px;color:#cc7755;padding:.2rem 0;border-bottom:1px solid #cc443311;">';
          var pidLabel = String(f.pid).split('_')[1] || f.pid; html += '⚠ #' + pidLabel + ' — ' + f.puntos + ' pts · cerró antes de zona ' + zonaReal + ' (demasiado pronto)';
          html += '</div>';
        });
        if (z.fuera.length > 5) {
          html += '<div style="font-size:11px;color:var(--text-muted);padding:.3rem 0;">… y ' + (z.fuera.length - 5) + ' más fuera de zona</div>';
        }
        html += '</div>';
      }

      html += '</div>';
      html += '<div style="font-family:\"Cormorant Garamond\",serif;font-size:20px;color:' + col + ';width:40px;text-align:right;">' + total_z + '</div>';
      html += '</div>';
    });

    var lectura = pctOk >= 70
      ? '"El ' + pctOk + '% de tus parciales se ejecutan en su zona. La gestión activa está integrada en tu proceso."'
      : '"El ' + pctOk + '% de tus parciales respetan su zona TP. Cuando las respetas, el proceso fluye. El reto es la consistencia."';
    html += '<div style="padding:1rem;border:1px solid #c9a84c22;background:linear-gradient(135deg,#161208,#1a1608);border-left:2px solid #c9a84c;margin-top:1rem;">';
    html += '<div style="font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#c9a84c;margin-bottom:.5rem;">❖ Lectura Aurum</div>';
    html += '<div style="font-size:13px;color:#8a7840;line-height:1.8;font-style:italic;">' + lectura + '</div>';
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';
  contenedor.innerHTML = html;
}

function _parcialesStatCard(titulo, num, pct, col, desc) {
  return '<div style="flex:1;min-width:160px;padding:1rem;border:1px solid var(--border);background:#0e0c08;">' +
    '<div style="font-size:28px;font-family:\"Cormorant Garamond\",serif;color:' + col + ';">' + num + '</div>' +
    '<div style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:' + col + ';margin:.2rem 0;">' + pct + ' · ' + titulo + '</div>' +
    '<div style="font-size:12px;color:var(--text-muted);">' + desc + '</div>' +
    '</div>';
}

async function guardarConfigTpParciales() {
  var inp1 = document.getElementById('tp-inp-p1');
  var inp2 = document.getElementById('tp-inp-p2');
  var inp3 = document.getElementById('tp-inp-p3');
  if (!inp1 || !inp2 || !inp3) return;
  var tp1 = parseInt(inp1.value) || 18;
  var tp2 = parseInt(inp2.value) || 33;
  var tp3 = parseInt(inp3.value) || 50;
  var msg = document.getElementById('sl-config-msg');
  if (tp1 >= tp2 || tp2 >= tp3) {
    if (msg) { msg.style.color = 'var(--red)'; msg.textContent = 'TP1 < TP2 < TP3'; }
    return;
  }
  var token = getToken();
  var email = usuarioActual && usuarioActual.email;
  if (!token || !email) return;
  var res = await supaPatch('usuarios_aurum', 'email=eq.' + encodeURIComponent(email),
    { tp_parcial1: tp1, tp_parcial2: tp2, tp_parcial3: tp3, updated_at: new Date().toISOString() }, token);
  if (res.error) {
    if (msg) { msg.style.color = 'var(--red)'; msg.textContent = '✗ Error al guardar'; }
    return;
  }
  usuarioActual.tp_parcial1 = tp1;
  usuarioActual.tp_parcial2 = tp2;
  usuarioActual.tp_parcial3 = tp3;
  window.usuarioActual = usuarioActual;
  if (msg) { msg.style.color = 'var(--green)'; msg.textContent = '✓ Guardado'; }
  setTimeout(function() { if (msg) msg.textContent = ''; }, 2000);
  buildCumplimiento();
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
     'eav-racha-max-win','eav-racha-max-loss',
     'eav-dd-max','eav-dd-sub',
     'eav-mejor-val','eav-mejor-sub',
     'eav-peor-val','eav-peor-sub',
     'eav-tp-pct','eav-tp-sub',
     'eav-revenge-num','eav-revenge-sub','eav-mejor-lotaje'].forEach(function(id){ setEl(id, '—'); });
    ['eav-revenge-lista','eav-lote-tras-perdida','eav-lote-consistencia',
     'eav-hora-analisis','eav-peor-dia-analisis','eav-duracion-analisis','eav-veredicto','eav-ultimos30','eav-riesgo-ruina'].forEach(function(id){ setHTML(id, ''); });
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

  // Racha máxima histórica (ganadora y perdedora)
  var rachaMaxWin = 0, rachaMaxLoss = 0, rachaTmp = 0, tipoTmp = null;
  trades.forEach(function(t) {
    if (t.ganadora === tipoTmp) { rachaTmp++; }
    else { tipoTmp = t.ganadora; rachaTmp = 1; }
    if (tipoTmp === true  && rachaTmp > rachaMaxWin)  rachaMaxWin = rachaTmp;
    if (tipoTmp === false && rachaTmp > rachaMaxLoss) rachaMaxLoss = rachaTmp;
  });
  setEl('eav-racha-max-win', rachaMaxWin);
  setEl('eav-racha-max-loss', rachaMaxLoss);

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

  // 7b. Mejor lotaje por rendimiento
  var elMejorLot = document.getElementById('eav-mejor-lotaje');
  if (elMejorLot) {
    function _lotCategoria(v) {
      if (v < 0.05)  return 'micro';
      if (v <= 0.10) return 'pequeño';
      if (v <= 0.20) return 'medio';
      return 'grande';
    }
    function _lotLabel(cat) {
      if (cat === 'micro')     return '< 0.05';
      if (cat === 'pequeño') return '0.05–0.10';
      if (cat === 'medio')     return '0.11–0.20';
      return '> 0.20';
    }
    var todosVols = trades.map(function(t) { return t.volumen || 0; }).filter(function(v) { return v > 0; });
    var uniqueVols = {};
    todosVols.forEach(function(v) { uniqueVols[(Math.round(v * 100) / 100).toFixed(2)] = true; });
    var usarRangos = Object.keys(uniqueVols).length > 8;

    var grupLot = {};
    trades.forEach(function(t) {
      var v = t.volumen || 0;
      if (v <= 0) return;
      var key = usarRangos ? _lotCategoria(v) : (Math.round(v * 100) / 100).toFixed(2);
      if (!grupLot[key]) grupLot[key] = { t: 0, w: 0, rr_w: 0, rr_l: 0, n_w: 0, n_l: 0, p: 0 };
      grupLot[key].t++;
      if (t.ganadora) {
        grupLot[key].w++;
        grupLot[key].rr_w += (t.puntos || 0);
        grupLot[key].n_w++;
      } else {
        grupLot[key].rr_l += (t.puntos || 0);
        grupLot[key].n_l++;
      }
      grupLot[key].p += (t.beneficio || 0);
    });

    var MIN_TRADES_LOT = 5;
    var lotList = Object.keys(grupLot)
      .filter(function(k) { return grupLot[k].t >= MIN_TRADES_LOT; })
      .map(function(k) {
        var g = grupLot[k];
        var wr   = Math.round(g.w / g.t * 1000) / 10;
        var avgW = g.n_w > 0 ? g.rr_w / g.n_w : 0;
        var avgL = g.n_l > 0 ? g.rr_l / g.n_l : 0;
        var rr   = avgL > 0 ? Math.round(avgW / avgL * 100) / 100 : 0;
        var scoreConsist = wr * 0.6 + Math.min(rr * 25, 40);
        var label = usarRangos ? k + ' (' + _lotLabel(k) + ')' : k + ' lots';
        return { key: k, label: label, t: g.t, wr: wr, rr: rr, p: Math.round(g.p), score: scoreConsist };
      });

    if (lotList.length < 2) {
      elMejorLot.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">Se necesitan al menos 5 trades por lotaje (o rango) para mostrar este análisis. Actualmente hay ' + trades.length + ' trades en total.</div>';
    } else {
      var mejLotWR    = lotList.reduce(function(a, b) { return b.wr > a.wr ? b : a; });
      var mejLotRRarr = lotList.filter(function(l) { return l.rr > 0; });
      var mejLotRR    = mejLotRRarr.length > 0 ? mejLotRRarr.reduce(function(a, b) { return b.rr > a.rr ? b : a; }) : null;
      var mejLotConst = lotList.reduce(function(a, b) { return b.score > a.score ? b : a; });

      var html = '';
      html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);margin-bottom:1rem;">';
      html += '<div style="background:var(--bg);padding:.7rem;text-align:center;">' +
        '<div style="font-size:10px;color:var(--green);letter-spacing:.15em;margin-bottom:.3rem;">MEJOR WR</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--green);">' + mejLotWR.label + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);">' + mejLotWR.wr + '% · ' + mejLotWR.t + 't</div></div>';
      if (mejLotRR) {
        html += '<div style="background:var(--bg);padding:.7rem;text-align:center;">' +
          '<div style="font-size:10px;color:var(--gold);letter-spacing:.15em;margin-bottom:.3rem;">MEJOR R/R</div>' +
          '<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--gold-bright);">' + mejLotRR.label + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted);">R/R ' + mejLotRR.rr + ' · ' + mejLotRR.t + 't</div></div>';
      } else {
        html += '<div style="background:var(--bg);padding:.7rem;text-align:center;"><div style="font-size:11px;color:var(--text-muted);">Sin R/R suficiente</div></div>';
      }
      html += '<div style="background:var(--bg);padding:.7rem;text-align:center;">' +
        '<div style="font-size:10px;color:#C8BDA0;letter-spacing:.15em;margin-bottom:.3rem;">MÁS CONSISTENTE</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:#C8BDA0;">' + mejLotConst.label + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);">' + mejLotConst.wr + '% · R/R ' + mejLotConst.rr + '</div></div>';
      html += '</div>';

      html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:.4rem;letter-spacing:.1em;">TODOS LOS LOTAJES (mín. ' + MIN_TRADES_LOT + ' trades) · ' + (usarRangos ? 'agrupados por rango' : 'lotaje exacto') + '</div>';
      lotList.sort(function(a, b) { return b.wr - a.wr; }).forEach(function(l) {
        var bg = l.wr >= 60 ? '#3AAA6A' : l.wr >= 50 ? '#C9A84C' : '#CC5544';
        var isMejWR = l.key === mejLotWR.key;
        var isMejRR = mejLotRR && l.key === mejLotRR.key;
        var isMejC  = l.key === mejLotConst.key;
        var badge = isMejWR ? ' <span style="color:var(--green);font-size:10px;">WR</span>' :
                    isMejRR ? ' <span style="color:var(--gold);font-size:10px;">R/R</span>' :
                    isMejC  ? ' <span style="color:#C8BDA0;font-size:10px;">≈</span>' : '';
        html += '<div style="display:flex;align-items:center;gap:.6rem;padding:.35rem 0;border-bottom:1px solid #0A0C14;">' +
          '<span style="font-size:12px;color:var(--text-dim);width:110px;flex-shrink:0;">' + l.label + badge + '</span>' +
          '<div style="flex:1;height:3px;background:var(--border);border-radius:2px;">' +
          '<div style="height:100%;width:' + l.wr + '%;background:' + bg + ';border-radius:2px;"></div></div>' +
          '<span style="font-size:12px;color:' + bg + ';width:48px;text-align:right;">' + l.wr + '%</span>' +
          '<span style="font-size:11px;color:var(--text-muted);width:52px;text-align:right;">R/R ' + (l.rr > 0 ? l.rr : '—') + '</span>' +
          '<span style="font-size:11px;color:var(--text-muted);width:38px;text-align:right;">' + l.t + 't</span>' +
          '</div>';
      });

      var masUsadoKey = Object.keys(grupLot).reduce(function(a, b) { return grupLot[b].t > grupLot[a].t ? b : a; });
      if (masUsadoKey !== mejLotWR.key && lotList.find(function(l) { return l.key === masUsadoKey; })) {
        html += '<div style="margin-top:.8rem;padding:.6rem;border:1px solid #c9a84c22;border-left:2px solid var(--gold);background:#c9a84c08;font-size:12px;color:var(--gold-dim);">' +
          '⚠ Operas más con ' + masUsadoKey + (usarRangos ? '' : ' lots') + ' pero tu mejor WR es con ' + mejLotWR.label + ' — considera ajustar tu sizing habitual.</div>';
      }

      elMejorLot.innerHTML = html;
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

  // Últimos 30 vs histórico
  var elUlt30 = document.getElementById('eav-ultimos30');
  if (elUlt30) {
    if (trades.length < 10) {
      elUlt30.innerHTML = '';
    } else {
      var wr_hist = trades.length > 0 ? Math.round(wins.length/trades.length*1000)/10 : 0;
      var ptsW_h = wins.length > 0 ? wins.reduce(function(s,t){ return s+(t.puntos||0); },0)/wins.length : 0;
      var ptsL_h = losses.length > 0 ? losses.reduce(function(s,t){ return s+(t.puntos||0); },0)/losses.length : 0;
      var rr_hist = ptsL_h > 0 ? Math.round(ptsW_h/ptsL_h*100)/100 : 0;
      var pnl_hist_pt = trades.length > 0 ? Math.round(totalPnl/trades.length*100)/100 : 0;
      var ult30 = trades.slice(-30);
      var u30w = ult30.filter(function(t){ return t.ganadora; }).length;
      var u30l = ult30.length - u30w;
      var u30wr = ult30.length > 0 ? Math.round(u30w/ult30.length*1000)/10 : 0;
      var u30pnl = Math.round(ult30.reduce(function(s,t){ return s+(t.beneficio||0); },0)*100)/100;
      var u30ptsW = u30w > 0 ? ult30.filter(function(t){ return t.ganadora; }).reduce(function(s,t){ return s+(t.puntos||0); },0)/u30w : 0;
      var u30ptsL = u30l > 0 ? ult30.filter(function(t){ return !t.ganadora; }).reduce(function(s,t){ return s+(t.puntos||0); },0)/u30l : 0;
      var u30rr = u30ptsL > 0 ? Math.round(u30ptsW/u30ptsL*100)/100 : 0;
      var u30pt = ult30.length > 0 ? Math.round(u30pnl/ult30.length*100)/100 : 0;
      var score30 = (u30wr - wr_hist > 2 ? 1 : u30wr - wr_hist < -2 ? -1 : 0) +
                   (u30rr - rr_hist > 0.1 ? 1 : u30rr - rr_hist < -0.1 ? -1 : 0) +
                   (u30pt - pnl_hist_pt > 0 ? 1 : u30pt - pnl_hist_pt < 0 ? -1 : 0);
      var tendencia = score30 >= 2 ? '<span style="color:var(--green);">mejorando</span>' :
                      score30 <= -2 ? '<span style="color:var(--red);">empeorando</span>' :
                      '<span style="color:var(--gold-bright);">estable</span>';
      function _u30tag(cur, base) {
        var d = Math.round((cur - base)*10)/10;
        return '<span style="font-size:11px;color:'+(d>=0?'var(--green)':'var(--red)')+';">'+(d>=0?'+':'')+d+'</span>';
      }
      elUlt30.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:1rem;">' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--gold-bright);">Últimos 30 trades vs histórico</div>' +
        '<div style="font-size:14px;color:var(--text-muted);">Tendencia: '+tendencia+'</div></div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);">' +
        '<div style="background:var(--bg);padding:.8rem;text-align:center;">' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:.2rem;">WR últimos 30</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:24px;color:var(--green);">'+u30wr+'%</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">histórico: '+wr_hist+'% '+_u30tag(u30wr,wr_hist)+'</div></div>' +
        '<div style="background:var(--bg);padding:.8rem;text-align:center;">' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:.2rem;">R/R últimos 30</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:24px;color:var(--gold-bright);">'+u30rr+'</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">histórico: '+rr_hist+' '+_u30tag(u30rr,rr_hist)+'</div></div>' +
        '<div style="background:var(--bg);padding:.8rem;text-align:center;">' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:.2rem;">P&L / trade (ult30)</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:24px;color:'+(u30pt>=0?'var(--green)':'var(--red)')+'">'+(u30pt>=0?'+':'')+u30pt+'$</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">histórico: '+(pnl_hist_pt>=0?'+':'')+pnl_hist_pt+'$ '+_u30tag(u30pt,pnl_hist_pt)+'</div></div>' +
        '</div>';
    }
  }

  // Riesgo de ruina: ((1-wr)/wr)^(avgWin/avgLoss)
  var elRuina = document.getElementById('eav-riesgo-ruina');
  if (elRuina) {
    if (trades.length < 20 || wins.length === 0 || losses.length === 0) {
      elRuina.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">Necesitas al menos 20 trades con ganadoras y perdedoras para calcular el riesgo de ruina.</div>';
    } else {
      var wrR = wins.length / trades.length;
      var avgWinR  = wins.reduce(function(s,t){ return s+(t.beneficio||0); },0) / wins.length;
      var avgLossR = Math.abs(losses.reduce(function(s,t){ return s+(t.beneficio||0); },0) / losses.length);
      var vols = trades.map(function(t){ return t.volumen || t.vol || 0; }).filter(function(v){ return v > 0; });
      var cvLot = 0;
      if (vols.length > 1) {
        var avgVol = vols.reduce(function(s,v){ return s+v; },0) / vols.length;
        var stdVol = Math.sqrt(vols.reduce(function(s,v){ return s+Math.pow(v-avgVol,2); },0) / vols.length);
        cvLot = avgVol > 0 ? stdVol / avgVol : 0;
      }
      var lotajeVariable = cvLot > 0.3;
      var expAjuste = lotajeVariable ? 0.7 : 1;
      var ruina = (avgLossR > 0 && wrR > 0 && wrR < 1)
        ? Math.min(1, Math.pow((1 - wrR) / wrR, (avgWinR / avgLossR) * expAjuste))
        : (wrR >= 1 ? 0 : 1);
      var ruinaPct = Math.round(ruina * 1000) / 10;
      var lotajeNote = lotajeVariable
        ? 'Lotaje variable detectado — riesgo real probablemente menor que el calculado'
        : 'Lotaje constante — cálculo preciso';
      var ruinaCol   = ruinaPct < 15 ? '#3AAA6A' : ruinaPct < 35 ? '#C9A84C' : ruinaPct < 60 ? '#CC5544' : '#AA2222';
      var ruinaLabel = ruinaPct < 15 ? 'Muy bajo' : ruinaPct < 35 ? 'Moderado' : ruinaPct < 60 ? 'Elevado' : 'Crítico';
      var ruinaMsg   = ruinaPct < 15
        ? 'Tu edge matemático protege bien el capital a largo plazo. Mantén la consistencia.'
        : ruinaPct < 35
        ? 'Riesgo moderado. Pequeñas mejoras en WR o RR reducen exponencialmente la probabilidad de ruina.'
        : ruinaPct < 60
        ? 'Riesgo elevado. El sistema actual no protege suficientemente el capital a largo plazo.'
        : 'Riesgo crítico. El sistema actual destruirá el capital a largo plazo sin cambios estructurales urgentes.';
      var ruinaRec = ruinaPct < 15
        ? 'Tu edge es sólido. Mantén el R/R por encima de 1.0 y el WR estable.'
        : avgWinR / avgLossR < 1.0
        ? 'Prioridad: el R/R está por debajo de 1.0 — estás ganando operaciones pero perdiendo más de lo que ganas. Revisa los SL y TP. Mientras el R/R sea menor que 1.0, el sistema tiene fragilidad estructural aunque el profit sea positivo.'
        : 'Para reducirlo: sube el R/R por encima de 1.2 o mejora el WR 5 puntos. Ambos juntos lo reducen drásticamente.';
      // Simulador: qué cambio concreto reduce más el riesgo
      var _sim = function(wrSim, avgWinSim) {
        if (avgLossR <= 0 || wrSim <= 0 || wrSim >= 1) return wrSim >= 1 ? 0 : 100;
        return Math.round(Math.min(1, Math.pow((1-wrSim)/wrSim, (avgWinSim/avgLossR)*expAjuste))*1000)/10;
      };
      var wrCurPct = Math.round(wrR*1000)/10;
      var wrR2     = Math.min(0.99, wrR + 0.05);
      var wrNewPct = Math.round(wrR2*1000)/10;
      var rrCur    = Math.round(avgWinR/avgLossR*100)/100;
      var rrNew    = Math.round((avgWinR/avgLossR+0.2)*100)/100;
      var simWR    = _sim(wrR2, avgWinR);
      var simRR    = _sim(wrR, avgLossR * (avgWinR/avgLossR + 0.2));
      var impWR    = Math.round((ruinaPct - simWR)*10)/10;
      var impRR    = Math.round((ruinaPct - simRR)*10)/10;
      var prioridad = impWR >= impRR ? 'WR' : 'RR';
      var simHtml  = 'Si subes el WR de '+wrCurPct+'% a '+wrNewPct+'% → riesgo baja de '+ruinaPct+'% a <b>'+simWR+'%</b> (−'+impWR+'pp). ' +
        'Si subes el RR de '+rrCur+' a '+rrNew+' → riesgo baja a <b>'+simRR+'%</b> (−'+impRR+'pp). ' +
        '<b>Mayor impacto: '+(prioridad==='WR'?'subir el WR':'subir el RR')+'.</b>';
      // Detección de outliers en pérdidas
      var lossAmts = losses.map(function(t){ return Math.abs(t.beneficio||0); }).sort(function(a,b){ return a-b; });
      var _midL = Math.floor(lossAmts.length/2);
      var medLoss = lossAmts.length%2===0 ? (lossAmts[_midL-1]+lossAmts[_midL])/2 : lossAmts[_midL];
      var lossOutliers = lossAmts.filter(function(v){ return v > 2*medLoss; });
      var outlierHtml = '';
      if (lossOutliers.length > 0 && medLoss > 0) {
        var lossNoOut   = lossAmts.filter(function(v){ return v <= 2*medLoss; });
        var avgLossNoOut = lossNoOut.length > 0 ? lossNoOut.reduce(function(s,v){ return s+v; },0)/lossNoOut.length : avgLossR;
        var ruinaNoOut  = (avgLossNoOut > 0 && wrR > 0 && wrR < 1)
          ? Math.round(Math.min(1, Math.pow((1-wrR)/wrR, (avgWinR/avgLossNoOut)*expAjuste))*1000)/10
          : ruinaPct;
        outlierHtml =
          '<div style="border-top:1px solid var(--border);padding-top:.8rem;margin-top:.8rem;">' +
          '<div style="font-size:12px;color:#C9A84C;line-height:1.8;padding:.6rem .8rem;border-left:2px solid #C9A84C44;background:#C9A84C08;">' +
          '⚠ Hay '+lossOutliers.length+' trade'+(lossOutliers.length>1?'s':'')+' con pérdida atípica (más del doble de la mediana de '+Math.round(medLoss*100)/100+'$). ' +
          'Sin ellos, tu pérdida media sería '+Math.round(avgLossNoOut*100)/100+'$ y el riesgo de ruina bajaría a '+ruinaNoOut+'%. ' +
          'Estos trades tienen un impacto desproporcionado en tus estadísticas.</div></div>';
      }
      elRuina.innerHTML =
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--gold-bright);margin-bottom:1rem;">Riesgo de ruina</div>' +
        '<div style="display:grid;grid-template-columns:120px 1fr;gap:1.5rem;align-items:center;margin-bottom:1rem;">' +
        '<div style="text-align:center;">' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:52px;color:'+ruinaCol+';line-height:1;">'+ruinaPct+'%</div>' +
        '<div style="font-size:13px;color:'+ruinaCol+';">'+ruinaLabel+'</div></div>' +
        '<div>' +
        '<div style="font-size:13px;color:var(--text-muted);line-height:1.7;margin-bottom:.6rem;">'+ruinaMsg+'</div>' +
        '<div style="font-size:11px;color:var(--text-muted);opacity:.7;margin-bottom:.4rem;">((1−WR)/WR)^(avgWin/avgLoss'+(lotajeVariable?'×0.7':'')+') · WR='+wrCurPct+'% · AvgWin='+Math.round(avgWinR*100)/100+'$ · AvgLoss='+Math.round(avgLossR*100)/100+'$</div>' +
        '<div style="font-size:11px;color:'+(lotajeVariable?'#C9A84C':'var(--text-muted)')+';opacity:.85;margin-bottom:.8rem;">'+lotajeNote+'</div>' +
        '<div style="font-size:12px;color:'+ruinaCol+';line-height:1.7;padding:.6rem .8rem;border-left:2px solid '+ruinaCol+'44;background:'+ruinaCol+'08;margin-bottom:.8rem;">'+ruinaRec+'</div>' +
        '</div></div>' +
        '<div style="border-top:1px solid var(--border);padding-top:.8rem;">' +
        '<div style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--text-muted);margin-bottom:.5rem;">Cómo reducirlo</div>' +
        '<div style="font-size:12px;color:var(--text-dim);line-height:1.9;">'+simHtml+'</div>' +
        '</div>' +
        outlierHtml;
    }
  }
}

// ── Configuración de umbrales SL ─────────────────────────────────

function renderSlConfig() {
  var panelId = 'sl-config-bloque';
  if (document.getElementById(panelId)) {
    var ua = window.usuarioActual;
    var inpE = document.getElementById('sl-inp-edge');
    var inpA = document.getElementById('sl-inp-aire');
    var inpL = document.getElementById('sl-inp-limite');
    if (inpE) inpE.value = (ua && ua.sl_edge)   || 11;
    if (inpA) inpA.value = (ua && ua.sl_aire)   || 25;
    if (inpL) inpL.value = (ua && ua.sl_limite) || 50;
    var inp1 = document.getElementById('tp-inp-p1');
    var inp2 = document.getElementById('tp-inp-p2');
    var inp3 = document.getElementById('tp-inp-p3');
    if (inp1) inp1.value = (ua && ua.tp_parcial1) || 18;
    if (inp2) inp2.value = (ua && ua.tp_parcial2) || 33;
    if (inp3) inp3.value = (ua && ua.tp_parcial3) || 50;
    return;
  }
  var panel = document.getElementById('gpanel-cumplimiento');
  if (!panel) return;
  var ua    = window.usuarioActual;
  var vEdge = (ua && ua.sl_edge)   || 11;
  var vAire = (ua && ua.sl_aire)   || 25;
  var vLim  = (ua && ua.sl_limite) || 50;
  var div   = document.createElement('div');
  div.id    = panelId;
  div.style.cssText = 'padding:.8rem 2rem;border-bottom:1px solid var(--border);background:var(--bg2);display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap;';
  var vTp1 = (ua && ua.tp_parcial1) || 18;
  var vTp2 = (ua && ua.tp_parcial2) || 33;
  var vTp3 = (ua && ua.tp_parcial3) || 50;
  div.innerHTML =
    '<span style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--text-muted);">Umbrales SL</span>' +
    '<span style="font-size:10px;color:var(--text-muted);opacity:.7;">(gestionado por tu mentor)</span>' +
    _slInput('Edge',   'sl-inp-edge',   vEdge) +
    _slInput('Aire',   'sl-inp-aire',   vAire) +
    _slInput('Límite', 'sl-inp-limite', vLim)  +
    '<span style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--text-muted);margin-left:1.5rem;">Umbrales TP Parciales</span>' +
    _slInput('TP1', 'tp-inp-p1', vTp1) +
    _slInput('TP2', 'tp-inp-p2', vTp2) +
    _slInput('TP3', 'tp-inp-p3', vTp3) +
    '<span id="sl-config-msg" style="font-size:12px;color:var(--green);min-width:80px;"></span>';
  panel.insertBefore(div, panel.firstChild);
  ['sl-inp-edge', 'sl-inp-aire', 'sl-inp-limite'].forEach(function(id) {
    var inp = document.getElementById(id);
    if (inp) inp.addEventListener('change', guardarConfigSl);
  });
  ['tp-inp-p1', 'tp-inp-p2', 'tp-inp-p3'].forEach(function(id) {
    var inp = document.getElementById(id);
    if (inp) inp.addEventListener('change', guardarConfigTpParciales);
  });
}

function _slInput(label, id, val) {
  return '<label style="display:flex;align-items:center;gap:.4rem;">' +
    '<span style="font-size:12px;color:var(--text-muted);">' + label + '</span>' +
    '<input id="' + id + '" type="number" value="' + val + '" min="1" max="999" disabled ' +
    'style="width:55px;background:var(--bg);border:1px solid var(--border);color:var(--text-muted);padding:.25rem .4rem;font-size:13px;font-family:inherit;text-align:center;outline:none;cursor:not-allowed;">' +
    '</label>';
}

async function guardarConfigSl() {
  var inpE = document.getElementById('sl-inp-edge');
  var inpA = document.getElementById('sl-inp-aire');
  var inpL = document.getElementById('sl-inp-limite');
  if (!inpE || !inpA || !inpL) return;
  var edge   = parseFloat(inpE.value) || 11;
  var aire   = parseFloat(inpA.value) || 25;
  var limite = parseFloat(inpL.value) || 50;
  var msg    = document.getElementById('sl-config-msg');
  if (edge >= aire || aire >= limite) {
    if (msg) { msg.style.color = 'var(--red)'; msg.textContent = 'Edge < Aire < Límite'; }
    return;
  }
  var token = getToken();
  var email = usuarioActual && usuarioActual.email;
  if (!token || !email) return;
  var res = await supaPatch('usuarios_aurum', 'email=eq.' + encodeURIComponent(email),
    { sl_edge: edge, sl_aire: aire, sl_limite: limite, updated_at: new Date().toISOString() }, token);
  if (res.error) {
    if (msg) { msg.style.color = 'var(--red)'; msg.textContent = '✗ Error al guardar'; }
    return;
  }
  usuarioActual.sl_edge   = edge;
  usuarioActual.sl_aire   = aire;
  usuarioActual.sl_limite = limite;
  window.usuarioActual    = usuarioActual;
  if (msg) { msg.style.color = 'var(--green)'; msg.textContent = '✓ Guardado'; }
  setTimeout(function() { if (msg) msg.textContent = ''; }, 2000);
  buildCumplimiento();
}

function buildDashboardHero() {
  var todos = window.AURUM_TRADES ? (window.AURUM_TRADES.todos || []) : [];

  console.log('[AURUM] t.cuenta valores únicos:', todos.reduce(function(acc, t) {
    if (acc.indexOf(t.cuenta) === -1) acc.push(t.cuenta); return acc;
  }, []));

  var totalTrades = todos.length;
  window._totalTrades = totalTrades;
  window._userTrades  = todos;
  var wins = todos.filter(function(t) { return t.ganadora; });
  var wr = totalTrades > 0 ? Math.round(wins.length / totalTrades * 1000) / 10 : null;
  var pnl = Math.round(todos.reduce(function(s, t) { return s + (t.beneficio || 0); }, 0) * 100) / 100;
  var pnlStr = (pnl >= 0 ? '+' : '') + pnl + '$';
  var cuentas = [];
  todos.forEach(function(t) { if (t.cuenta && cuentas.indexOf(t.cuenta) === -1) cuentas.push(t.cuenta); });

  var el;
  el = document.getElementById('dash-trades-total');  if (el) el.textContent = totalTrades;
  el = document.getElementById('dash-wr-global');     if (el) el.textContent = (wr === null ? '—' : wr + '%');
  el = document.getElementById('dash-wr-global-sub'); if (el) el.textContent = (totalTrades === 0 ? 'Sin trades registrados' : wins.length + ' wins de ' + totalTrades);
  el = document.getElementById('dash-pnl-global');    if (el) el.textContent = pnlStr;
  el = document.getElementById('dash-pnl-global-sub');if (el) el.textContent = cuentas.length + ' cuenta' + (cuentas.length !== 1 ? 's' : '') + ' · entorno real';
  el = document.getElementById('card-global-pnl');    if (el) el.textContent = pnlStr;
  var conEAGlobal = todos.filter(function(t) { return t.fuente === 'ea'; }).length;
  el = document.getElementById('card-global-sub');    if (el) el.textContent = totalTrades === 0 ? 'Sin trades registrados' : (totalTrades + ' trades · WR ' + wr + '%' + (conEAGlobal > 0 ? ' · ' + conEAGlobal + ' auditado' + (conEAGlobal !== 1 ? 's' : '') + ' EA' : ''));

  // Ciclo actual
  var ciclosCompletados = Math.floor(totalTrades / 111);
  var cicloActual = ciclosCompletados + 1;
  var enCurso = totalTrades === 0 ? 0 : (totalTrades % 111 || 111);
  var pctCiclo = totalTrades === 0 ? 0 : Math.round(enCurso / 111 * 100);
  el = document.getElementById('dash-ciclo');     if (el) el.textContent = 'Ciclo ' + cicloActual;
  el = document.getElementById('dash-ciclo-sub'); if (el) el.textContent = enCurso + ' / 111 trades · ' + pctCiclo + '%';
  el = document.getElementById('ciclo-encurso-txt'); if (el) el.textContent = 'Ciclo ' + cicloActual + ' en curso — ' + enCurso + ' trades';

  // OZT: 10 por ciclo (111 trades) + 50 bonus por evaluación superada (1111 trades)
  var evaluacionesCompletadas = Math.floor(totalTrades / 1111);
  var oztCiclos  = ciclosCompletados * 10;
  var oztEtapas  = (usuarioActual.etapa || 0) * 30;
  var oztGanado  = oztCiclos + (evaluacionesCompletadas * 50) + oztEtapas;
  var oztTotal   = oztGanado + (usuarioActual.ozt_ganados_retos || 0) + (usuarioActual.ozt_comprados || 0) - (usuarioActual.ozt_gastados || 0);
  window.AURUM_OZT = oztTotal;
  el = document.getElementById('dash-ozt');          if (el) el.textContent = oztTotal;
  el = document.getElementById('ozt-saldo');         if (el) el.textContent = oztTotal;
  el = document.getElementById('dash-ozt-widget');   if (el) el.textContent = oztTotal;
  el = document.getElementById('dash-ranking-ozt');  if (el) el.textContent = oztTotal + ' OZT';
  el = document.getElementById('ozt-ganados-retos'); if (el) el.textContent = usuarioActual.ozt_ganados_retos || 0;
  el = document.getElementById('ozt-canjeados');     if (el) el.textContent = usuarioActual.ozt_gastados      || 0;

  // Nivel/etapa
  var ETAPAS = ['Descubrimiento', 'Silencio', 'Umbral', 'Estructura', 'Fractura', 'Claridad', 'Consistencia', 'Confianza', 'Paciencia', 'Rentabilidad', 'Vuelo', '✦ Oro'];
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
  el = document.getElementById('sidebar-nivel-num');  if (el) el.textContent = numStr;
  el = document.getElementById('sidebar-nivel-name'); if (el) el.textContent = nombreActual;
  el = document.getElementById('sidebar-nivel-fill'); if (el) el.style.width = pctCiclo + '%';
  el = document.getElementById('sidebar-nivel-pct');  if (el) el.textContent = pctCiclo + '%';
  el = document.getElementById('sidebar-nivel-next'); if (el) el.textContent = '→ ' + nombreSig;

  // Días en proceso general — desde registro en Aurum (created_at)
  var _fechaRegistro = usuarioActual && (usuarioActual.fecha_entrada || usuarioActual.created_at); // created_at = fecha real de registro en Aurum
  if (_fechaRegistro) {
    var _fe = new Date(_fechaRegistro);
    var diasProceso = Math.floor((Date.now() - _fe) / 86400000);
    el = document.getElementById('dash-dias-proceso'); if (el) el.textContent = diasProceso;
    el = document.getElementById('dash-fecha-inicio'); if (el) el.textContent = _fe.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Días por cuenta — desde primer trade hasta último trade
  // Usa la misma lógica de fecha que el resto del sistema (fp primero, luego created_at)
  function _parseFecha(t) {
    var campos = [t.fp, t.fecha_cierre, t.fecha].filter(Boolean);
    for (var ci = 0; ci < campos.length; ci++) {
      var s = String(campos[ci]);
      // MT5: YYYY.MM.DD (con o sin hora)
      var m1 = s.match(/(\d{4})\.(\d{2})\.(\d{2})/);
      if (m1) return new Date(parseInt(m1[1]), parseInt(m1[2])-1, parseInt(m1[3]));
      // cTrader: DD/MM/YYYY
      var m2 = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (m2) return new Date(parseInt(m2[3]), parseInt(m2[2])-1, parseInt(m2[1]));
    }
    if (t.created_at) return new Date(t.created_at);
    return null;
  }
  function diasCuenta(keyword) {
    var sub = todos.filter(function(t) { return t.cuenta && t.cuenta.toLowerCase().indexOf(keyword) >= 0; });
    if (sub.length === 0) return '—';
    var fechas = sub.map(_parseFecha).filter(Boolean);
    if (fechas.length === 0) return '—';
    var timestamps = fechas.map(function(f) { return f.getTime(); });
    var minF = new Date(Math.min.apply(null, timestamps));
    var maxF = new Date(Math.max.apply(null, timestamps));
    var d = Math.floor((maxF - minF) / 86400000);
    return d === 0 ? 'mismo día' : d + ' días';
  }
  el = document.getElementById('card-maestra-dias'); if (el) el.textContent = diasCuenta('maestra');
  el = document.getElementById('card-retos-dias');   if (el) el.textContent = diasCuenta('retos');
  el = document.getElementById('card-prueba-dias');  if (el) el.textContent = diasCuenta('prueba');

  var bM = document.getElementById('badge-maestra');
  var bR = document.getElementById('badge-retos');
  var bP = document.getElementById('badge-prueba');
  var badgeStyle = 'font-size:10px;letter-spacing:.15em;padding:2px 8px;border-radius:3px;font-family:sans-serif;';
  if (bM) bM.innerHTML = '<span style="' + badgeStyle + 'background:rgba(100,200,100,.15);color:#6ec97b;border:1px solid #6ec97b44;">Real</span>';
  if (bR) bR.innerHTML = '<span style="' + badgeStyle + 'background:rgba(201,168,76,.1);color:var(--gold);border:1px solid var(--gold-dim);">Challenge</span>';
  if (bP) bP.innerHTML = '<span style="' + badgeStyle + 'background:rgba(201,168,76,.1);color:var(--gold);border:1px solid var(--gold-dim);">Challenge</span>';

  // Cards por cuenta — coincidencia parcial case-insensitive
  // FIX corazón de datos (06/07): antes recalculaba wr/pnl a mano aquí, por
  // tercera vez en el proyecto (ya estaba en calcMetricas de visitas.js y en
  // calcTipos). Ahora reutiliza calcMetricas() como fuente del cálculo.
  function statsCuenta(keyword) {
    var sub = todos.filter(function(t) { return t.cuenta && t.cuenta.toLowerCase().indexOf(keyword) >= 0; });
    var m = (typeof calcMetricas === 'function') ? calcMetricas(sub) : { pnl: 0, wr: 0 };
    var conEA = sub.filter(function(t) { return t.fuente === 'ea'; }).length;
    var subTxt = sub.length === 0
      ? 'Sin trades'
      : sub.length + ' trades · WR ' + (m.wr === null ? '—' : m.wr + '%') + (conEA > 0 ? ' · ' + conEA + ' auditado' + (conEA !== 1 ? 's' : '') + ' EA' : '');
    return { pnl: (m.pnl >= 0 ? '+' : '') + m.pnl + '$', sub: subTxt };
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
  cargarDiario();
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

function _escapeHtml(s) {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function _pintarEntradaDiario(entrada, alPrincipio) {
  var entradas = document.getElementById('diario-entradas');
  if (!entradas) return;
  var fecha = new Date(entrada.created_at);
  var hoy = new Date();
  var esHoy = fecha.toDateString() === hoy.toDateString();
  var fechaStr = (esHoy ? 'Hoy · ' : '') + fecha.toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' });
  var nuevaEntrada = document.createElement('div');
  nuevaEntrada.style.cssText = 'background:var(--bg2);padding:1.5rem 2rem;position:relative;';
  nuevaEntrada.innerHTML = '<div style="position:absolute;top:0;left:0;bottom:0;width:2px;background:linear-gradient(to bottom,transparent,var(--gold),transparent);"></div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem;">' +
    '<div style="font-size:12px;color:var(--gold-dim);">'+fechaStr+'</div>' +
    '<div style="font-size:11px;color:var(--green);">✓ Guardada</div></div>' +
    '<div style="font-size:15px;color:var(--text-dim);line-height:1.8;">'+_escapeHtml(entrada.texto)+'</div>';
  if (alPrincipio) entradas.insertBefore(nuevaEntrada, entradas.firstChild);
  else entradas.appendChild(nuevaEntrada);
}

async function cargarDiario() {
  var entradas = document.getElementById('diario-entradas');
  if (!entradas || !usuarioActual || !usuarioActual.email) return;
  var token  = getToken();
  var params = 'usuario_email=eq.' + encodeURIComponent(usuarioActual.email) + '&order=created_at.desc&limit=30';
  var r = await supaGet('diario_entradas', params, token);
  if (r.error || !r.data) { console.error('[diario] error al cargar', r.error); return; }
  entradas.innerHTML = '';
  r.data.forEach(function(e) { _pintarEntradaDiario(e, false); });
}

async function guardarEntradaDiario() {
  var texto = document.getElementById('diario-input').value.trim();
  var msg   = document.getElementById('diario-msg');
  if (!texto) { msg.style.color='var(--red)'; msg.textContent='Escribe algo antes de guardar.'; return; }
  if (!usuarioActual || !usuarioActual.email) { msg.style.color='var(--red)'; msg.textContent='Sesión no válida, vuelve a iniciar sesión.'; return; }
  var token = getToken();
  var r = await supaPost('diario_entradas', { usuario_email: usuarioActual.email, texto: texto }, 'return=representation', token);
  if (r.error) {
    msg.style.color = 'var(--red)';
    msg.textContent = 'Error al guardar. Inténtalo de nuevo.';
    console.error('[diario] error al guardar', r.error);
    return;
  }
  _pintarEntradaDiario(r.data[0], true);
  document.getElementById('diario-input').value = '';
  msg.style.color = 'var(--green)';
  msg.textContent = '✓ Entrada guardada.';
  setTimeout(function(){ msg.textContent = ''; }, 3000);
}

// ── Calendario ───────────────────────────────────────────────────

var _calYear  = new Date().getFullYear();
var _calMonth = new Date().getMonth(); // 0-indexed

var _CAL_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
var _CAL_DIAS  = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

function renderCalendario(year, month) {
  _calYear  = year;
  _calMonth = month;

  var label = document.getElementById('cal-mes-label');
  if (label) label.textContent = _CAL_MESES[month] + ' ' + year;

  var grid = document.getElementById('cal-grid');
  if (!grid) return;

  var hoy    = new Date();
  var hoyStr = hoy.getFullYear() + '-' + String(hoy.getMonth()+1).padStart(2,'0') + '-' + String(hoy.getDate()).padStart(2,'0');

  var html = _CAL_DIAS.map(function(d) {
    return '<div style="background:var(--bg2);padding:.6rem;text-align:center;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--text-muted);">' + d + '</div>';
  }).join('');

  var primerDow = new Date(year, month, 1).getDay(); // 0=Dom
  var offset    = (primerDow + 6) % 7;               // 0=Lun
  var diasEnMes = new Date(year, month + 1, 0).getDate();

  for (var i = 0; i < offset; i++) {
    html += '<div style="background:var(--bg2);"></div>';
  }

  for (var d = 1; d <= diasEnMes; d++) {
    var mm      = String(month + 1).padStart(2, '0');
    var dd      = String(d).padStart(2, '0');
    var dateStr = year + '-' + mm + '-' + dd;
    var dow     = (offset + d - 1) % 7; // 0=Lun…4=Vie, 5=Sáb, 6=Dom
    var esFin   = dow >= 5;
    var esHoy   = dateStr === hoyStr;

    var bg     = esFin ? 'var(--bg3)' : 'var(--bg2)';
    var border = esHoy ? 'border:1px solid var(--border-gold);' : '';
    var topBar = esHoy ? '<div style="position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--gold),transparent);"></div>' : '';
    var numCol = esHoy ? 'var(--gold-bright)' : 'var(--text-muted)';
    var numTxt = esHoy ? d + ' · Hoy' : d;

    html += '<div id="cal-day-' + dateStr + '" style="background:' + bg + ';padding:.6rem;min-height:70px;position:relative;' + border + '">' +
      topBar +
      '<div style="font-size:13px;color:' + numCol + ';margin-bottom:.3rem;">' + numTxt + '</div>' +
    '</div>';
  }

  var resto = (offset + diasEnMes) % 7;
  if (resto > 0) {
    for (var i = 0; i < 7 - resto; i++) {
      html += '<div style="background:var(--bg3);"></div>';
    }
  }

  grid.innerHTML = html;
  if (window._retosCache) pintarRetosEnCalendario(window._retosCache);
  if (window._agendaCache) pintarAgendaEnCalendario(window._agendaCache);
}

function calNavegar(dir) {
  var m = _calMonth + dir;
  var y = _calYear;
  if (m > 11) { m = 0; y++; }
  if (m < 0)  { m = 11; y--; }
  renderCalendario(y, m);
}

function pintarRetosEnCalendario(retos) {
  (retos || []).forEach(function(r) {
    if (!r.created_at) return;
    var dateStr = r.created_at.slice(0, 10);
    var celda   = document.getElementById('cal-day-' + dateStr);
    if (!celda) return;

    var esEquipo  = r.tipo === 'equipo';
    var bgColor   = esEquipo ? 'var(--gold-glow)'  : '#4A7AAA22';
    var textColor = esEquipo ? 'var(--gold-dim)'   : '#6A9AEE';
    var bdrColor  = esEquipo ? 'var(--border-gold)': '#4A7AAA33';

    var chip = document.createElement('div');
    chip.style.cssText = 'font-size:10px;background:' + bgColor + ';color:' + textColor + ';border:1px solid ' + bdrColor + ';padding:1px 4px;border-radius:1px;margin-top:2px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    chip.title       = r.titulo;
    chip.textContent = r.titulo;
    chip.onclick = (function(id) {
      return function() {
        if (typeof mostrarTab === 'function') mostrarTab('retos');
        setTimeout(function() {
          var card = document.getElementById('reto-card-' + id);
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      };
    })(r.id);
    celda.appendChild(chip);
  });
}

// FIX corazón de datos (07/07): carga la disponibilidad real del usuario
// (tabla disponibilidad_agenda) — antes guardarAgenda() solo pintaba en el
// DOM, sin persistir nada. Rellena la lista de "Mis sesiones agendadas" y
// pinta una chip en el calendario, mismo patrón que pintarRetosEnCalendario.
async function cargarAgenda() {
  var lista = document.getElementById('agenda-lista');
  var email = window.usuarioActual && window.usuarioActual.email;
  if (!email || typeof supaGet !== 'function') return;

  var res = await supaGet('disponibilidad_agenda', 'usuario_email=eq.' + encodeURIComponent(email) + '&order=fecha.asc', getToken());
  if (res.error || !res.data) return;

  window._agendaCache = res.data;
  pintarAgendaEnCalendario(res.data);

  if (!lista) return;
  if (!res.data.length) {
    lista.innerHTML = '<div style="font-size:13px;color:var(--text-muted);font-style:italic;padding:.5rem 0;">Sin sesiones agendadas. Añade tu disponibilidad para que Aurum sepa cuándo puedes conectarte.</div>';
    return;
  }
  lista.innerHTML = res.data.map(function(a) {
    var d = new Date(a.fecha + 'T12:00:00');
    var fechaStr = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return '<div style="display:flex;align-items:center;justify-content:space-between;background:#0A0C18;border:1px solid var(--border);padding:.6rem 1rem;margin-bottom:.4rem;">' +
      '<div><div style="font-size:13px;color:var(--text-dim);">' + fechaStr + '</div><div style="font-size:11px;color:var(--gold);">' + a.sesion + '</div></div>' +
      '<div onclick="borrarSesionAgenda(' + a.id + ')" style="font-size:12px;color:var(--text-muted);cursor:pointer;opacity:.5;padding:.2rem .5rem;">✕</div>' +
    '</div>';
  }).join('');
}

async function borrarSesionAgenda(id) {
  var res = await supaDelete('disponibilidad_agenda', 'id=eq.' + id, getToken());
  if (res.error) { alert('Error al borrar: ' + res.error); return; }
  cargarAgenda();
}

function pintarAgendaEnCalendario(agenda) {
  (agenda || []).forEach(function(a) {
    if (!a.fecha) return;
    var celda = document.getElementById('cal-day-' + a.fecha);
    if (!celda) return;
    var chip = document.createElement('div');
    chip.style.cssText = 'font-size:10px;background:#4A7AAA22;color:#6A9AEE;border:1px solid #4A7AAA33;padding:1px 4px;border-radius:1px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    chip.title = 'Disponible: ' + a.sesion;
    chip.textContent = '◆ ' + a.sesion;
    celda.appendChild(chip);
  });
}

// ── Retos activos ────────────────────────────────────────────────

function calcularProgreso(trades, condicion) {
  if (!condicion || !condicion.tipo) return null;
  var tipo       = condicion.tipo;
  var valor      = parseFloat(condicion.valor)            || 0;
  var requeridos = parseInt(condicion.trades_requeridos)  || 0;
  if (!requeridos) return null;

  var actual = 0;

  if (tipo === 'lote_maximo') {
    actual = trades.filter(function(t) { return (t.volumen || 0) <= valor; }).length;

  } else if (tipo === 'wr_minimo') {
    // Racha de trades en los que el WR acumulado se mantiene >= valor%
    var racha = 0, wins = 0;
    for (var i = 0; i < trades.length; i++) {
      if (trades[i].ganadora) wins++;
      var wr = Math.round(wins / (i + 1) * 1000) / 10;
      if (wr >= valor) racha = i + 1; else racha = 0;
    }
    actual = racha;

  } else if (tipo === 'trades_sin_revenge') {
    // Racha de trades sin aumentar lote tras una pérdida
    var racha = 0, prevPerdio = false, prevVol = 0;
    for (var i = 0; i < trades.length; i++) {
      var t   = trades[i];
      var vol = t.volumen || 0;
      if (prevPerdio && vol > prevVol) racha = 0;
      else racha++;
      prevPerdio = !t.ganadora;
      prevVol    = vol;
    }
    actual = racha;

  } else if (tipo === 'pnl_minimo') {
    actual = trades.filter(function(t) { return (t.beneficio || 0) >= valor; }).length;
  }

  return { actual: Math.min(actual, requeridos), requeridos: requeridos };
}

// FIX corazón de datos (12/07 noche): fecha real de un trade, para cortar
// "trades desde que me apunté a un reto" por FECHA, no por posición en el
// array. Mismo patrón de 3 formatos que el resto del sistema (MT5, cTrader,
// fallback created_at) — necesaria aquí porque _parseFecha() ya existe en
// este archivo pero vive encerrada dentro de otra función, no reutilizable.
function _fechaRealTrade(t) {
  var campos = [t.fp, t.fecha_cierre, t.fecha].filter(Boolean);
  for (var i = 0; i < campos.length; i++) {
    var s = String(campos[i]);
    var m1 = s.match(/(\d{4})\.(\d{2})\.(\d{2})/);          // MT5: AAAA.MM.DD
    if (m1) return new Date(parseInt(m1[1]), parseInt(m1[2]) - 1, parseInt(m1[3]));
    var m2 = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);          // cTrader: DD/MM/AAAA
    if (m2) return new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]));
  }
  if (t.created_at) return new Date(t.created_at);          // último recurso
  return null;
}

async function cargarRetosActivos() {
  var contenedor = document.getElementById('retos-activos-lista');
  if (!contenedor) return;
  contenedor.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">Cargando...</div>';

  var email = usuarioActual && usuarioActual.email;
  var token = getToken();

  var results = await Promise.all([
    supaGet('retos', 'order=fecha_cierre.asc', token),
    email ? supaGet('retos_participantes', 'usuario_email=eq.' + encodeURIComponent(email), token) : Promise.resolve({ data: [] })
  ]);
  var resRetos = results[0], resPart = results[1];

  if (resRetos.error || !resRetos.data) {
    contenedor.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">Error al cargar los retos.</div>';
    return;
  }

  // Filtrar cerrados client-side (funciona aunque la columna aún no exista)
  var retos = resRetos.data.filter(function(r) { return r.estado !== 'cerrado'; });
  if (!retos.length) {
    contenedor.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">No hay retos activos en este momento.</div>';
    window._retosCache = [];
    return;
  }
  window._retosCache = retos;

  var participaMap = {};
  (resPart.data || []).forEach(function(p) { participaMap[p.reto_id] = p; });
  var ahora = new Date();

  contenedor.innerHTML = retos.map(function(r) {
    var esEquipo    = r.tipo === 'equipo';
    var tipoLabel   = esEquipo ? 'Reto de equipo' : 'Reto individual';
    var tipoColor   = esEquipo ? 'var(--gold)' : 'var(--text-muted)';
    var borderColor = esEquipo ? 'var(--border-gold)' : 'var(--border)';
    var topBar      = esEquipo ? '<div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);"></div>' : '';
    var salaText    = r.sala ? ' · Sala ' + r.sala : '';

    var cierreHTML = '';
    if (r.fecha_cierre) {
      var fc   = new Date(r.fecha_cierre);
      var dias = Math.ceil((fc - ahora) / 86400000);
      var cierreTexto = dias > 0 ? dias + (dias === 1 ? ' día' : ' días') : (dias === 0 ? 'Hoy' : 'Cerrado');
      cierreHTML = '<div style="text-align:right;">' +
        '<div style="font-size:11px;color:var(--text-muted);">Cierra en</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-size:26px;color:' + (esEquipo ? 'var(--gold-bright)' : 'var(--text)') + ';">' + cierreTexto + '</div>' +
      '</div>';
    }

    var premioPartes = [];
    if (r.premio_ozt)   premioPartes.push('◈ ' + r.premio_ozt + ' OZT');
    if (r.premio_extra) premioPartes.push(r.premio_extra);
    var premioHTML = premioPartes.length
      ? '<div style="font-size:14px;color:var(--gold-bright);margin-top:.8rem;">' + premioPartes.join(' · ') + '</div>'
      : '';

    var descHTML = r.descripcion
      ? '<div style="font-size:14px;color:var(--text-muted);margin-bottom:1rem;line-height:1.8;">' + r.descripcion + '</div>'
      : '';

    // Botón Registrarse + barra de progreso
    var botonHTML = '';
    var participacion = participaMap[r.id];
    if (participacion) {
      botonHTML = '<div style="display:flex;align-items:center;gap:.4rem;font-size:12px;color:var(--green);margin-top:1rem;">' +
        '<div style="width:5px;height:5px;border-radius:50%;background:var(--green);"></div>Participando</div>';

      // Barra de progreso si el reto tiene condición
      var condicion = r.condicion;
      if (typeof condicion === 'string') { try { condicion = JSON.parse(condicion); } catch(e) { condicion = null; } }
      if (condicion && condicion.tipo) {
        var todosUser    = window._userTrades || [];
        var fechaInicio  = participacion.created_at ? new Date(participacion.created_at) : null;
        var tradesReto;
        if (fechaInicio) {
          tradesReto = todosUser.filter(function(t) {
            var f = _fechaRealTrade(t);
            return f && f >= fechaInicio;
          });
        } else {
          // Fallback: sin fecha de registro guardada, mantener comportamiento anterior
          tradesReto = todosUser.slice(participacion.trades_al_inicio || 0);
        }
        var prog        = calcularProgreso(tradesReto, condicion);
        if (prog) {
          var pct = prog.requeridos > 0 ? Math.round(prog.actual / prog.requeridos * 100) : 0;
          var yaGanado = !!participacion.ganador;

          // FIX corazón de datos (12/07): detección automática de reto cumplido.
          // Se marca solo (progreso + ganador + completado_at); el premio en OZT
          // sigue requiriendo aprobación manual del admin — no se auto-paga aquí.
          if (!yaGanado && prog.actual >= prog.requeridos) {
            supaPatch('retos_participantes', 'id=eq.' + participacion.id, {
              progreso: prog.actual, ganador: true, completado_at: new Date().toISOString()
            }, token);
            yaGanado = true;
          }

          if (yaGanado) {
            botonHTML += '<div style="margin-top:.8rem;display:flex;align-items:center;gap:.4rem;font-size:12px;color:var(--gold-bright);">' +
              '<div style="width:5px;height:5px;border-radius:50%;background:var(--gold-bright);"></div>' +
              '✦ Reto cumplido — premio pendiente de aprobación</div>';
          } else {
            botonHTML += '<div style="margin-top:.8rem;">' +
              '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:.4rem;">' +
                '<span>Progreso</span><span style="color:var(--gold);">' + prog.actual + ' / ' + prog.requeridos + ' operaciones</span>' +
              '</div>' +
              '<div style="height:4px;background:var(--border);border-radius:2px;">' +
                '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#C9A84C44,var(--gold-bright));border-radius:2px;transition:width .3s;"></div>' +
              '</div>' +
            '</div>';
          }
        }
      }
    } else {
      var coste     = r.coste_ozt || 0;
      var saldoOZT  = window.AURUM_OZT || 0;
      var btnLabel  = coste > 0 ? 'Registrarse · ' + coste + ' OZT' : 'Registrarse';
      if (coste > 0 && saldoOZT < coste) {
        botonHTML = '<button disabled style="margin-top:1rem;padding:.5rem 1.2rem;background:transparent;border:1px solid var(--border);color:var(--text-muted);font-size:12px;letter-spacing:.1em;text-transform:uppercase;font-family:inherit;cursor:not-allowed;opacity:.5;">OZT insuficientes</button>';
      } else {
        botonHTML = '<button onclick="unirseAReto(\'' + r.id + '\')" style="margin-top:1rem;padding:.5rem 1.2rem;background:transparent;border:1px solid var(--gold);color:var(--gold);font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;font-family:inherit;">' + btnLabel + '</button>';
      }
    }


    return '<div id="reto-card-' + r.id + '" style="background:var(--bg2);border:1px solid ' + borderColor + ';padding:1.5rem;position:relative;">' +
      topBar +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem;">' +
        '<div>' +
          '<div style="font-size:11px;letter-spacing:.25em;text-transform:uppercase;color:' + tipoColor + ';margin-bottom:.3rem;">' + tipoLabel + salaText + '</div>' +
          '<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:var(--text);">' + (r.titulo || '') + '</div>' +
        '</div>' +
        cierreHTML +
      '</div>' +
      descHTML +
      premioHTML +
      botonHTML +
    '</div>';
  }).join('');

  pintarRetosEnCalendario(retos);
}

async function unirseAReto(retoId) {
  var token = getToken();
  var email = usuarioActual.email;

  // Leer coste_ozt desde la BD para evitar depender del valor del HTML
  var rReto = await supaGet('retos', 'id=eq.' + retoId + '&select=coste_ozt&limit=1', token);
  if (rReto.error || !rReto.data || !rReto.data.length) {
    showToast('Error al obtener datos del reto.');
    return;
  }
  var costeOzt = Number(rReto.data[0].coste_ozt) || 0;

  // Verificar saldo antes de proceder
  if (costeOzt > 0 && (window.AURUM_OZT || 0) < costeOzt) {
    showToast('OZT insuficientes para registrarse en este reto.');
    return;
  }

  var r1 = await supaPost('retos_participantes', {
    reto_id:          retoId,
    usuario_email:    email,
    trades_al_inicio: window._totalTrades || 0,
    created_at:       new Date().toISOString()
  }, 'return=representation', token);
  if (r1.error) { showToast('Error al registrarse: ' + r1.error); return; }

  // Descontar OZT si el reto tiene coste
  if (costeOzt > 0) {
    var nuevosGastados = (usuarioActual.ozt_gastados || 0) + costeOzt;
    var rOzt = await supaPatch('usuarios_aurum', 'email=eq.' + encodeURIComponent(email),
      { ozt_gastados: nuevosGastados, updated_at: new Date().toISOString() }, token);
    if (!rOzt.error) {
      usuarioActual.ozt_gastados = nuevosGastados;
      window.usuarioActual       = usuarioActual;
      window.AURUM_OZT           = (window.AURUM_OZT || 0) - costeOzt;
      if (typeof buildDashboardHero === 'function') buildDashboardHero();
    } else {
      showToast('Error al descontar OZT: ' + rOzt.error);
    }
  }

  // Si reto de equipo llega a 11 participantes → activar
  var resCount = await supaGet('retos_participantes', 'reto_id=eq.' + retoId + '&select=id', token);
  var total    = (resCount.data || []).length;
  if (total >= 11) {
    await supaPatch('retos', 'id=eq.' + retoId,
      { estado: 'activo', updated_at: new Date().toISOString() }, token);
  }

  showToast('¡Registrado en el reto!');
  cargarRetosActivos();
}

// ── Modal Reset de cuenta ─────────────────────────────────────────

function abrirModalReset() {
  var saldo = window.AURUM_OZT || 0;
  var cuentas = [
    { tipo: 'cuenta_maestra', label: 'Maestra', numero: usuarioActual.cuenta_maestra },
    { tipo: 'cuenta_retos',   label: 'Retos',   numero: usuarioActual.cuenta_retos   },
    { tipo: 'cuenta_prueba',  label: 'Prueba',  numero: usuarioActual.cuenta_prueba  }
  ];

  var cuentasHTML = cuentas.map(function(c) {
    var vacia = !c.numero;
    return '<label style="display:flex;align-items:center;gap:.8rem;padding:.8rem 1rem;border:1px solid var(--border);margin-bottom:.5rem;' +
      (vacia ? 'opacity:.4;cursor:not-allowed;' : 'cursor:pointer;') + '">' +
      '<input type="radio" name="reset-cuenta" value="' + c.tipo + '"' + (vacia ? ' disabled' : '') + ' style="accent-color:var(--gold);">' +
      '<div>' +
        '<div style="font-size:13px;color:var(--text);">Cuenta ' + c.label + '</div>' +
        '<div style="font-size:12px;color:var(--text-muted);">' + (c.numero || 'Sin cuenta asignada') + '</div>' +
      '</div>' +
    '</label>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.id = 'modal-reset-cuenta';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1rem;';
  overlay.innerHTML =
    '<div style="background:var(--bg2);border:1px solid var(--border-gold);padding:2rem;max-width:420px;width:100%;">' +
      '<div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:.5rem;">↺ Reset de cuenta</div>' +
      '<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--text);margin-bottom:1.5rem;">Elige la cuenta a resetear</div>' +
      cuentasHTML +
      '<div style="border-top:1px solid var(--border);margin-top:1rem;padding-top:1rem;">' +
        '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:.4rem;">' +
          '<span style="color:var(--text-muted);">Tu saldo OZT</span>' +
          '<span style="color:var(--gold-bright);">' + saldo + ' OZT</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:1rem;">' +
          '<span style="color:var(--text-muted);">Coste</span>' +
          '<span style="color:var(--gold-bright);">777 OZT</span>' +
        '</div>' +
      '</div>' +
      '<div id="reset-error" style="font-size:13px;color:#e05;margin-bottom:.8rem;display:none;"></div>' +
      '<div style="display:flex;gap:.8rem;">' +
        '<button onclick="confirmarReset()" style="flex:1;background:var(--gold);color:#0A0C14;border:none;padding:.7rem;font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;font-family:inherit;">Confirmar reset</button>' +
        '<button onclick="cerrarModalReset()" style="flex:1;background:transparent;color:var(--text-muted);border:1px solid var(--border);padding:.7rem;font-size:12px;cursor:pointer;font-family:inherit;">Cancelar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
}

function cerrarModalReset() {
  var m = document.getElementById('modal-reset-cuenta');
  if (m) m.remove();
}

async function confirmarReset() {
  var radio = document.querySelector('#modal-reset-cuenta input[name="reset-cuenta"]:checked');
  var errEl = document.getElementById('reset-error');
  if (!radio) {
    if (errEl) { errEl.textContent = 'Elige una cuenta.'; errEl.style.display = 'block'; }
    return;
  }
  await resetCuenta(radio.value);
}

async function _liberarCuentaAExterna(email, destino, token) {
  var ep = 'usuario_email=eq.' + encodeURIComponent(email);

  var resTrades = await supaGet('trades',
    ep + '&cuenta=eq.' + encodeURIComponent(destino) + '&limit=1', token);
  if (!resTrades.error && resTrades.data && resTrades.data.length) {
    // No se vacía cuenta_numero: se conserva para no mezclar esta cuenta
    // revocada con otras que también acaben en Cuenta Externa.
    await supaPatch('trades',
      ep + '&cuenta=eq.' + encodeURIComponent(destino),
      { cuenta: 'Cuenta Externa' }, token);
  }

  var resParciales = await supaGet('trade_parciales',
    ep + '&cuenta=eq.' + encodeURIComponent(destino) + '&limit=1', token);
  if (!resParciales.error && resParciales.data && resParciales.data.length) {
    await supaPatch('trade_parciales',
      ep + '&cuenta=eq.' + encodeURIComponent(destino),
      { cuenta: 'Cuenta Externa' }, token);
  }

  await supaPatch('historiales',
    ep + '&nombre=eq.' + encodeURIComponent(destino),
    { nombre: 'Cuenta Externa' }, token);
}

async function resetCuenta(tipoCuenta) {
  var errEl = document.getElementById('reset-error');
  var saldo = window.AURUM_OZT || 0;

  if (saldo < 777) {
    if (errEl) { errEl.textContent = 'Saldo insuficiente. Necesitas 777 OZT (tienes ' + saldo + ').'; errEl.style.display = 'block'; }
    return;
  }

  var token    = getToken();
  var email    = usuarioActual.email;
  var nuevosGastados = (usuarioActual.ozt_gastados || 0) + 777;

  var r1 = await supaPatch('usuarios_aurum', 'email=eq.' + encodeURIComponent(email),
    { ozt_gastados: nuevosGastados, updated_at: new Date().toISOString() }, token);
  if (r1.error) {
    if (errEl) { errEl.textContent = 'Error al registrar el gasto: ' + r1.error; errEl.style.display = 'block'; }
    return;
  }

  var destinoLabel = { cuenta_maestra:'Cuenta Maestra', cuenta_retos:'Cuenta Retos', cuenta_prueba:'Cuenta Prueba' }[tipoCuenta];
  if (destinoLabel) {
    await _liberarCuentaAExterna(email, destinoLabel, token);
  }

  var campoReset = {};
  campoReset[tipoCuenta] = null;
  campoReset.updated_at  = new Date().toISOString();
  var r2 = await supaPatch('usuarios_aurum', 'email=eq.' + encodeURIComponent(email), campoReset, token);
  if (r2.error) {
    if (errEl) { errEl.textContent = 'Error al resetear la cuenta: ' + r2.error; errEl.style.display = 'block'; }
    return;
  }

  usuarioActual.ozt_gastados  = nuevosGastados;
  usuarioActual[tipoCuenta]   = null;
  window.usuarioActual        = usuarioActual;

  cerrarModalReset();
  if (typeof actualizarDashboard === 'function') actualizarDashboard();
}
