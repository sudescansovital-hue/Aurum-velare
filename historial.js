// HISTORIAL EXTERNO
// ================================================================
var HISTORIAL_CUENTAS = [];
var HISTORIAL_ALL_FPS = new Set();

var CUENTAS_AURUM = {
  '7747760': 'Cuenta Maestra',
  '135146':  'Cuenta Prueba',
  '4011477': 'Cuenta Retos',
};

function detectarNombreCuenta(raw) {
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
  var lista = document.getElementById('hist-lista');
  if (!lista) return;
  if (lista.children.length === HISTORIAL_CUENTAS.length && HISTORIAL_CUENTAS.length > 0) return;
  lista.innerHTML = '';
  HISTORIAL_CUENTAS.forEach(function(c, idx) {
    histAnadirFila(c, idx);
  });
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
        msg.style.color = 'var(--gold)'; msg.textContent = 'Todos los trades ya estaban registrados (' + dups + ' duplicados).'; return;
      }
      var nombreFinal = detectarNombreCuenta(raw) || nombre || 'Cuenta externa';
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
