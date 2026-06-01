// HISTORIAL EXTERNO
// ================================================================
var HISTORIAL_CUENTAS = [];
var HISTORIAL_ALL_FPS = new Set();

var CUENTAS_AURUM = {
  '7747760': 'Cuenta Maestra',
  '135146':  'Cuenta Prueba',
  '4011477': 'Cuenta Retos',
};

function detectarNombreCuenta(raw, nombreArchivo) {
  for (var num in CUENTAS_AURUM) {
    if (nombreArchivo && String(nombreArchivo).indexOf(num) >= 0) return CUENTAS_AURUM[num];
  }
  for (var r = 0; r < Math.min(raw.length, 10); r++) {
    for (var c = 0; c < (raw[r]||[]).length; c++) {
      var val = String(raw[r][c] || '');
      for (var num in CUENTAS_AURUM) {
        if (val.indexOf(num) >= 0) return CUENTAS_AURUM[num];
      }
    }
  }
  return null;
}

function init_historial() {
  console.log('[HISTORIAL] init_historial llamado — HISTORIAL_CUENTAS.length antes de reset:', HISTORIAL_CUENTAS.length);
  var lista = document.getElementById('hist-lista');
  if (!lista) return;
  HISTORIAL_CUENTAS = [];
  HISTORIAL_ALL_FPS = new Set();
  lista.innerHTML = '';
  cargarHistorialDesdeSupabase().then(function() {
    console.log('[HISTORIAL] cargarHistorialDesdeSupabase completado — cuentas cargadas:', HISTORIAL_CUENTAS.length);
  });
}

async function cargarHistorialDesdeSupabase() {
  if (!window.usuarioActual || !window.usuarioActual.email) return;
  try {
  var token = getToken();
  var params = 'usuario_email=eq.' + encodeURIComponent(usuarioActual.email) + '&order=created_at.asc&limit=5000';
  console.log('[HISTORIAL] URL:', 'https://rsrbxcvlnbwpiyhumqmt.supabase.co/rest/v1/trades?' + params);
  var res = await supaGet('trades', params, token);
  if (res.error) { console.error('[HISTORIAL] res.error:', res.error); return; }
  console.log('[HISTORIAL] trades recibidos:', res.data ? res.data.length : 0, '| primer usuario_email:', res.data && res.data[0] ? res.data[0].usuario_email : 'n/a');
  if (!res.data || !res.data.length) return;

  console.log('[HISTORIAL] tipo res.data:', typeof res.data, '| isArray:', Array.isArray(res.data));
  console.log('[HISTORIAL] primer trade completo:', res.data[0]);
  console.log('[HISTORIAL] primer trade .cuenta:', res.data[0] && res.data[0].cuenta);
  console.log('[HISTORIAL] claves del primer trade:', res.data[0] && Object.keys(res.data[0]));

  // Agrupar por cuenta — sin filtrar, se muestran todos los valores exactos de t.cuenta
  var porCuenta = {};
  res.data.forEach(function(t, i) {
    var c = t.cuenta || '(sin cuenta)';
    if (i < 3) console.log('[HISTORIAL] trade[' + i + '] t.cuenta:', t.cuenta, '→ c:', c);
    if (!porCuenta[c]) porCuenta[c] = [];
    porCuenta[c].push(t);
  });
  console.log('[HISTORIAL] porCuenta keys tras forEach:', Object.keys(porCuenta));

  HISTORIAL_CUENTAS = [];
  HISTORIAL_ALL_FPS = new Set();

  var MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  Object.keys(porCuenta).forEach(function(nombreCuenta) {
    var trades = porCuenta[nombreCuenta];
    trades.forEach(function(t) { if (t.fp) HISTORIAL_ALL_FPS.add(t.fp); });

    var wins  = trades.filter(function(t) { return t.ganadora; }).length;
    var pnl   = Math.round(trades.reduce(function(s, t) { return s + (t.beneficio || 0); }, 0) * 100) / 100;
    var wr    = trades.length > 0 ? Math.round(wins / trades.length * 1000) / 10 : 0;
    var wT    = trades.filter(function(t) { return t.ganadora; });
    var lT    = trades.filter(function(t) { return !t.ganadora; });
    var ptsW  = wT.length > 0 ? wT.reduce(function(s, t) { return s + (t.puntos || 0); }, 0) / wT.length : 0;
    var ptsL  = lT.length > 0 ? lT.reduce(function(s, t) { return s + (t.puntos || 0); }, 0) / lT.length : 0;
    var rr    = ptsL > 0 ? Math.round(ptsW / ptsL * 100) / 100 : 0;

    var fechas = trades.map(function(t) {
      if (t.fp) { var m = String(t.fp).match(/(\d{4})\.(\d{2})\.(\d{2})/); if (m) return new Date(+m[1], +m[2]-1, +m[3]); }
      if (t.created_at) return new Date(t.created_at);
      return null;
    }).filter(Boolean).sort(function(a, b) { return a - b; });

    var periodo = fechas.length > 0
      ? fechas[0].getDate() + ' ' + MESES[fechas[0].getMonth()] + ' – ' +
        fechas[fechas.length-1].getDate() + ' ' + MESES[fechas[fechas.length-1].getMonth()] + ' ' + fechas[fechas.length-1].getFullYear()
      : new Date().toLocaleDateString('es-ES');

    HISTORIAL_CUENTAS.push({
      nombre:  nombreCuenta,
      tipo:    'real',
      total:   trades.length,
      wins:    wins,
      pnl:     pnl,
      wr:      wr,
      rr:      rr,
      periodo: periodo,
      dias:    [],
      tipos:   {},
      fps:     trades.map(function(t) { return t.fp; }).filter(Boolean)
    });
  });

  var lista = document.getElementById('hist-lista');
  if (lista) {
    lista.innerHTML = '';
    HISTORIAL_CUENTAS.forEach(function(c, idx) { histAnadirFila(c, idx); });
  }

  // Totales globales del historial
  var totalTrades = res.data.length;
  var totalWins   = res.data.filter(function(t) { return t.ganadora; }).length;
  var totalPnl    = Math.round(res.data.reduce(function(s, t) { return s + (t.beneficio || 0); }, 0) * 100) / 100;
  var totalWr     = totalTrades > 0 ? Math.round(totalWins / totalTrades * 1000) / 10 : 0;
  var numCuentas  = Object.keys(porCuenta).length;
  var pnlStr      = (totalPnl >= 0 ? '+' : '') + totalPnl + '$';

  var el;
  el = document.getElementById('hist-global-trades');     if (el) el.textContent = totalTrades;
  el = document.getElementById('hist-global-trades-sub'); if (el) el.textContent = numCuentas + ' cuenta' + (numCuentas !== 1 ? 's' : '') + ' · sin duplicados';
  el = document.getElementById('hist-global-wr');         if (el) el.textContent = totalWr + '%';
  el = document.getElementById('hist-global-wr-sub');     if (el) el.textContent = totalWins + ' wins de ' + totalTrades;
  el = document.getElementById('hist-global-pnl');        if (el) el.textContent = pnlStr;
  } catch (err) {
    console.error('[HISTORIAL] excepción en cargarHistorialDesdeSupabase:', err);
  }
}

function histAnadirFila(cuenta, idx) {
  var lista = document.getElementById('hist-lista');
  if (!lista) return;
  var wrColor = cuenta.wr >= 55 ? 'var(--green)' : 'var(--red)';
  var plColor = cuenta.pnl >= 0 ? 'var(--green)' : 'var(--red)';
  var plStr = (cuenta.pnl >= 0 ? '+' : '') + cuenta.pnl.toFixed(0) + '$';
  var div = document.createElement('div');
  div.style.cssText = 'background:var(--bg2);padding:1.2rem 1.5rem;cursor:pointer;border-left:2px solid transparent;transition:border-color .2s;';
  div.onclick = function() { histVerDetalle(idx); };
  div.onmouseover = function() { this.style.borderLeftColor = 'var(--gold)'; };
  div.onmouseout = function() { this.style.borderLeftColor = 'transparent'; };
  div.innerHTML = '<div style="display:grid;grid-template-columns:1fr auto auto auto auto;gap:1rem;align-items:center;">' +
    '<div><div style="font-size:14px;color:var(--text-dim);">' + cuenta.nombre + '</div><div style="font-size:12px;color:var(--text-muted);">' + cuenta.periodo + '</div></div>' +
    '<div style="text-align:center;"><div style="font-size:11px;color:var(--text-muted);">Trades</div><div style="font-size:18px;color:var(--text);">' + cuenta.total + '</div></div>' +
    '<div style="text-align:center;"><div style="font-size:11px;color:var(--text-muted);">WR</div><div style="font-size:18px;color:' + wrColor + ';">' + cuenta.wr + '%</div></div>' +
    '<div style="text-align:center;"><div style="font-size:11px;color:var(--text-muted);">P&L</div><div style="font-size:18px;color:' + plColor + ';">' + plStr + '</div></div>' +
    '<div style="text-align:center;"><div style="font-size:11px;color:var(--text-muted);">R/R</div><div style="font-size:18px;color:var(--text);">' + cuenta.rr + '</div></div>' +
  '</div>';
  lista.appendChild(div);
}

function histVerDetalle(idx) {
  var cuenta = HISTORIAL_CUENTAS[idx];
  if (!cuenta) return;
  var det = document.getElementById('hist-detalle');
  var titulo = document.getElementById('hist-detalle-titulo');
  if (det) det.style.display = 'block';
  if (titulo) titulo.textContent = cuenta.nombre + ' — ' + cuenta.periodo;

  var tiposLabels = { scalping: 'Scalping <30min', intraday: 'Intraday 30m-4h', swing: 'Swing 4h-24h', multiday: 'Multi-día >24h' };
  var tiposEl = document.getElementById('hist-detalle-tipos');
  if (tiposEl) {
    tiposEl.innerHTML = Object.keys(cuenta.tipos || {}).map(function(k) {
      var t = cuenta.tipos[k];
      var wr = t.total > 0 ? (t.wins / t.total * 100).toFixed(0) : 0;
      var pct = Math.round(t.total / cuenta.total * 100);
      var pnlStr = (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(0) + '$';
      return '<div style="margin-bottom:.8rem;"><div style="display:flex;justify-content:space-between;margin-bottom:.3rem;"><span style="font-size:14px;color:var(--text-dim);">' + (tiposLabels[k]||k) + '</span><span style="font-size:12px;color:var(--text-muted);">' + t.total + 't · ' + wr + '% · ' + pnlStr + '</span></div><div style="height:4px;background:var(--border);"><div style="height:100%;width:' + pct + '%;background:var(--gold-glow);"></div></div></div>';
    }).join('');
  }

  var diasEl = document.getElementById('hist-detalle-dias');
  if (diasEl) {
    diasEl.innerHTML = (cuenta.dias || []).map(function(d) {
      var best = d.wr >= 65 && d.pnl > 0;
      var bad = d.wr < 45;
      var pnlStr = (d.pnl >= 0 ? '+' : '') + d.pnl.toFixed(0) + '$';
      return '<div style="display:flex;align-items:center;gap:.8rem;padding:.5rem 0;border-bottom:1px solid #0A0C14;"><span style="font-size:14px;width:90px;color:' + (best ? 'var(--gold-bright)' : bad ? 'var(--red)' : 'var(--text-dim)') + ';">' + d.nombre + '</span><div style="flex:1;height:3px;background:var(--border);"><div style="height:100%;width:' + Math.min(d.wr,100) + '%;background:' + (best ? '#4ACC8A' : bad ? '#CC554444' : 'var(--gold-glow)') + ';"></div></div><span style="font-size:12px;color:' + (best ? 'var(--green)' : bad ? 'var(--red)' : 'var(--text-muted)') + ';width:110px;text-align:right;">' + d.wr.toFixed(0) + '% · ' + pnlStr + '</span></div>';
    }).join('');
  }
  if (det) det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function histDrop(event) {
  var file = event.dataTransfer.files[0];
  if (file) histSubir(file);
}

function histSubir(file) {
  if (!file) return;
  var msg = document.getElementById('hist-msg');
  var nombre = (document.getElementById('hist-nombre').value || '').trim();
  msg.textContent = '';
  document.getElementById('hist-progreso').style.display = 'block';
  document.getElementById('hist-prog-bar').style.width = '30%';
  document.getElementById('hist-prog-txt').textContent = 'Leyendo archivo...';

  var reader = new FileReader();
  function procesarRaw(raw) {
    document.getElementById('hist-prog-bar').style.width = '70%';
    document.getElementById('hist-prog-txt').textContent = 'Calculando...';
    var trades = parsearTrades(raw);
    if (!trades || trades.length < 5) {
      msg.style.color = 'var(--red)'; msg.textContent = 'No se encontraron trades XAU/USD suficientes.';
      document.getElementById('hist-progreso').style.display = 'none'; return;
    }
    var fps_nuevos = trades.filter(function(t) { return !HISTORIAL_ALL_FPS.has(t.fp || ''); });
    var dups = trades.length - fps_nuevos.length;
    setTimeout(function() {
      document.getElementById('hist-progreso').style.display = 'none';
      if (fps_nuevos.length === 0) {
        var nombreFinalDup = detectarNombreCuenta(raw, file.name) || nombre || 'Cuenta externa';
        if (typeof guardarTradesIndividuales === 'function') guardarTradesIndividuales(trades, nombreFinalDup);
        msg.style.color = 'var(--gold)'; msg.textContent = 'Todos los trades ya estaban registrados (' + dups + ' duplicados).'; return;
      }
      var nombreFinal = detectarNombreCuenta(raw, file.name) || nombre || 'Cuenta externa';
      var m = calcularMetricas(fps_nuevos);
      var fps_list = fps_nuevos.map(function(t){ return t.fp; }).filter(Boolean);
      fps_list.forEach(function(fp) { HISTORIAL_ALL_FPS.add(fp); });
      var nueva = { nombre: nombreFinal, tipo: document.getElementById('hist-tipo').value, total: fps_nuevos.length, wins: m.wins||0, pnl: Math.round((m.pnl||0)*100)/100, wr: Math.round((m.wr||0)*10)/10, rr: Math.round((m.rr||0)*100)/100, periodo: new Date().toLocaleDateString('es-ES'), dias: m.dias||[], tipos: m.tipos||{}, fps: fps_list };
      HISTORIAL_CUENTAS.push(nueva);
      histAnadirFila(nueva, HISTORIAL_CUENTAS.length - 1);
      if (typeof guardarHistorial === 'function') guardarHistorial(nueva);
      // Guardar trades individuales en Supabase
      if (typeof guardarTradesIndividuales === 'function') guardarTradesIndividuales(fps_nuevos, nombreFinal);
      var aviso = dups > 0 ? ' (' + dups + ' duplicados ignorados)' : '';
      msg.style.color = 'var(--green)'; msg.textContent = fps_nuevos.length + ' trades únicos añadidos' + aviso + '.';
      document.getElementById('hist-nombre').value = '';
    }, 400);
  }
  if (file.name.toLowerCase().endsWith('.xlsx')) {
    reader.onload = function(e) {
      function leerConXLSX() {
        try { var data = new Uint8Array(e.target.result); var wb = XLSX.read(data,{type:'array',cellDates:true}); var ws = wb.Sheets[wb.SheetNames[0]]; procesarRaw(XLSX.utils.sheet_to_json(ws,{header:1,defval:''})); }
        catch(err) { msg.style.color='var(--red)'; msg.textContent='Error al leer el archivo.'; document.getElementById('hist-progreso').style.display='none'; }
      }
      if (typeof XLSX !== 'undefined') {
        leerConXLSX();
      } else {
        var s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = leerConXLSX;
        document.head.appendChild(s);
      }
    }; reader.readAsArrayBuffer(file);
  } else {
    reader.onload = function(e) {
      try { var parser = new DOMParser(); var doc = parser.parseFromString(e.target.result,'text/html'); var raw=[]; doc.querySelectorAll('table').forEach(function(table){table.querySelectorAll('tr').forEach(function(tr){var cells=Array.from(tr.querySelectorAll('td,th')).map(function(td){return td.textContent.trim();}); if(cells.length>3)raw.push(cells);})}); procesarRaw(raw); }
      catch(err) { msg.style.color='var(--red)'; msg.textContent='Error al leer el archivo.'; document.getElementById('hist-progreso').style.display='none'; }
    }; reader.readAsText(file);
  }
}

async function guardarTradesIndividuales(trades, nombreCuenta) {
  if (!window.usuarioActual || !window.usuarioActual.email) return;
  if (!trades || !trades.length) return;
  var token = getToken();
  var rows = trades.map(function(t) {
    return {
      fp:            t.fp,
      usuario_email: usuarioActual.email,
      cuenta:        nombreCuenta || 'Externa',
      ganadora:      !!t.ganadora,
      beneficio:     t.ben != null ? t.ben : (t.beneficio != null ? t.beneficio : 0),
      dur_min:       Math.round(t.durMin != null ? t.durMin : (t.dur_min != null ? t.dur_min : 0)),
      hora:          t.hora != null ? t.hora : 0,
      dia:           t.dia != null ? t.dia : 0,
      vol:           t.vol || null,
      pe:            t.pe || null,
      pc:            t.pc || null,
      puntos:        t.puntos != null ? t.puntos : null,
      sl:            t.sl || null,
      tp:            t.tp || null
    };
  });
  var res = await supaPost('trades', rows, 'resolution=ignore-duplicates,return=minimal', token);
  if (res.error) console.error('[HISTORIAL] Error guardando trades:', res.error);
}
