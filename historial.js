// HISTORIAL EXTERNO
// ================================================================
var HISTORIAL_CUENTAS = [];
var HISTORIAL_ALL_FPS = new Set();

var CUENTAS_AURUM = {};

// Devuelve el número de cuenta desde el nombre usando CUENTAS_AURUM inverso
function _numeroDesdeNombre(nombre) {
  for (var num in CUENTAS_AURUM) {
    if (CUENTAS_AURUM[num] === nombre) return num;
  }
  return null;
}

function _numeroDesdeFichero(raw, fileName) {
  var nums = Object.keys(CUENTAS_AURUM);
  for (var n = 0; n < nums.length; n++) {
    if (fileName && fileName.includes(nums[n])) return nums[n];
    for (var r = 0; r < Math.min((raw||[]).length, 15); r++) {
      var fila = raw[r] || [];
      for (var c = 0; c < fila.length; c++) {
        if (String(fila[c]||'').includes(nums[n])) return nums[n];
      }
    }
  }
  // Fallback: extraer cualquier número de 5+ dígitos del nombre del archivo
  if (fileName) { var _m = String(fileName).match(/\b(\d{5,})\b/); if (_m) return _m[1]; }
  return null;
}

// Extrae el número de cuenta de la fila "Cuenta de trading:" del Excel
function detectarNumeroCuentaDeRaw(raw) {
  var keywords = ['cuenta de trading', 'account'];
  for (var r = 0; r < Math.min(raw.length, 20); r++) {
    var row = raw[r] || [];
    for (var c = 0; c < row.length; c++) {
      var cell = String(row[c] || '').toLowerCase().trim();
      if (!keywords.some(function(k) { return cell.indexOf(k) >= 0; })) continue;
      var combined = String(row[c] || '') + ' ' + String(row[c + 1] != null ? row[c + 1] : '');
      var m = combined.match(/\b(\d{4,})\b/);
      if (m) return m[1];
    }
  }
  return null;
}

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

async function init_historial() {
  console.log('[HISTORIAL] init_historial llamado — HISTORIAL_CUENTAS.length antes de reset:', HISTORIAL_CUENTAS.length);
  var lista = document.getElementById('hist-lista');
  if (!lista) return;
  HISTORIAL_CUENTAS = [];
  HISTORIAL_ALL_FPS = new Set();
  lista.innerHTML = '';

  CUENTAS_AURUM = {};
  if (window.usuarioActual && window.usuarioActual.email) {
    var perfil = await supaGet('usuarios_aurum',
      'email=eq.' + encodeURIComponent(usuarioActual.email) + '&limit=1', getToken());
    console.log('[HISTORIAL] supaGet usuarios_aurum resultado completo:', JSON.stringify(perfil));
    if (!perfil.error && perfil.data && perfil.data.length) {
      var u = perfil.data[0];
      if (u.cuenta_maestra) CUENTAS_AURUM[u.cuenta_maestra] = 'Cuenta Maestra';
      if (u.cuenta_retos)   CUENTAS_AURUM[u.cuenta_retos]   = 'Cuenta Retos';
      if (u.cuenta_prueba)  CUENTAS_AURUM[u.cuenta_prueba]  = 'Cuenta Prueba';
      console.log('[HISTORIAL] DB raw — maestra:', JSON.stringify(u.cuenta_maestra), 'retos:', JSON.stringify(u.cuenta_retos), 'prueba:', JSON.stringify(u.cuenta_prueba));
    }
    console.log('[HISTORIAL] CUENTAS_AURUM construido — claves:', Object.keys(CUENTAS_AURUM), '| objeto:', CUENTAS_AURUM);
  }

  cargarHistorialDesdeSupabase().then(function() {
    console.log('[HISTORIAL] cargarHistorialDesdeSupabase completado — cuentas cargadas:', HISTORIAL_CUENTAS.length);
  });
}

async function cargarHistorialDesdeSupabase() {
  if (!window.usuarioActual || !window.usuarioActual.email) return;
  var emailInicio = window.usuarioActual.email;
  HISTORIAL_CUENTAS = [];
  HISTORIAL_ALL_FPS = new Set();
  try {
  var token = getToken();
  var params = 'usuario_email=eq.' + encodeURIComponent(usuarioActual.email) + '&order=created_at.asc&limit=5000';

  // Borrar trades sin cuenta asignada antes de cargar (limpieza de datos corruptos)
  await supaDelete('trades', 'usuario_email=eq.' + encodeURIComponent(usuarioActual.email) + '&cuenta=is.null', token);

  // Query both tables to find where the data lives
  var resTrades     = await supaGet('trades',     params, token);
  var resHistoriales = await supaGet('historiales', params, token);

  console.log('[HISTORIAL] tabla trades     — error:', resTrades.error,     '| count:', resTrades.data     ? resTrades.data.length     : 0, '| primer row:', resTrades.data     && resTrades.data[0]);
  console.log('[HISTORIAL] tabla historiales — error:', resHistoriales.error, '| count:', resHistoriales.data ? resHistoriales.data.length : 0, '| primer row:', resHistoriales.data && resHistoriales.data[0]);

  // Merge ambas tablas deduplicando por (usuario_email, fp) — campo cuenta es la clave de agrupación
  var allData = [];
  var _mergedFps = new Set();
  function _addUnique(rows) {
    if (!rows || !rows.length) return;
    rows.forEach(function(t) {
      if (t.fp) {
        var key = (t.usuario_email || '') + '|' + t.fp;
        if (!_mergedFps.has(key)) { _mergedFps.add(key); allData.push(t); }
      } else {
        allData.push(t);
      }
    });
  }
  _addUnique(resTrades.data);
  _addUnique(resHistoriales.data);

  console.log('[HISTORIAL] merge — trades:', resTrades.data ? resTrades.data.length : 0, '| historiales:', resHistoriales.data ? resHistoriales.data.length : 0, '| combinados:', allData.length);
  if (!allData.length) { console.log('[HISTORIAL] allData vacío — salida sin render'); return; }

  console.log('[HISTORIAL] primer row completo:', allData[0]);
  console.log('[HISTORIAL] primer row .cuenta:', allData[0] && allData[0].cuenta);
  console.log('[HISTORIAL] claves del primer row:', allData[0] && Object.keys(allData[0]));

  // Agrupar por cuenta — campo exacto usado en ambas tablas
  var porCuenta = {};
  allData.forEach(function(t, i) {
    var c = t.cuenta || t.nombre || null; if (!c) return;
    if (i < 3) console.log('[HISTORIAL] row[' + i + '] t.cuenta:', t.cuenta, '→ c:', c);
    if (!porCuenta[c]) porCuenta[c] = [];
    porCuenta[c].push(t);
  });
  console.log('[HISTORIAL] porCuenta keys tras merge:', Object.keys(porCuenta));

  console.log('[GUARD]', window.usuarioActual ? window.usuarioActual.email : 'null', '!==', emailInicio, '?', window.usuarioActual && window.usuarioActual.email !== emailInicio);
  if (!window.usuarioActual || window.usuarioActual.email !== emailInicio) { console.log('[HISTORIAL] email cambió — salida sin render'); return; }
  HISTORIAL_CUENTAS = [];
  HISTORIAL_ALL_FPS = new Set();

  var MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  Object.keys(porCuenta).forEach(function(nombreCuenta) {
    var trades = porCuenta[nombreCuenta];
    trades.forEach(function(t) { if (t.fp) HISTORIAL_ALL_FPS.add(nombreCuenta + '|' + t.fp); });

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
      numero:  _numeroDesdeNombre(nombreCuenta),
      tipo:    (trades.find(function(t) { return t.tipo; }) || {}).tipo || 'Externa',
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
  var totalTrades = allData.length;
  var totalWins   = allData.filter(function(t) { return t.ganadora; }).length;
  var totalPnl    = Math.round(allData.reduce(function(s, t) { return s + (t.beneficio || 0); }, 0) * 100) / 100;
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
    '<div>' +
      '<div style="font-size:14px;color:var(--text-dim);">' + cuenta.nombre + '</div>' +
      (cuenta.numero ? '<div style="font-size:11px;color:var(--text-muted);letter-spacing:.05em;">' + cuenta.numero + '</div>' : '') +
      '<div style="font-size:12px;color:var(--text-muted);">' + cuenta.periodo + '</div>' +
    '</div>' +
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

// Busca en HISTORIAL_ALL_FPS (cargado desde Supabase) el nombre de cuenta
// asociado a alguno de los fps del archivo. Prioridad sobre la detección del archivo.
function _nombreCuentaDesdeHISTORIAL(fps) {
  if (!HISTORIAL_ALL_FPS.size || !fps.length) return null;
  var fpSet = new Set(fps);
  var found = null;
  HISTORIAL_ALL_FPS.forEach(function(entry) {
    if (found) return;
    var sep = entry.indexOf('|');
    if (sep < 0) return;
    var cuenta = entry.substring(0, sep);
    var fp     = entry.substring(sep + 1);
    if (cuenta !== '(sin cuenta)' && fpSet.has(fp)) found = cuenta;
  });
  return found;
}

function _confirmarNumeroCuenta(numero, label) {
  return new Promise(function(resolve) {
    var existing = document.getElementById('modal-confirmar-cuenta');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'modal-confirmar-cuenta';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.82);display:flex;align-items:center;justify-content:center;z-index:99999';
    modal.innerHTML =
      '<div style="background:#0d1120;border:1px solid var(--gold,#c9a84c);border-radius:12px;padding:32px;max-width:420px;width:90%;text-align:center;position:relative;z-index:100000">' +
        '<p style="color:#e0e0e0;margin:0 0 24px;line-height:1.6;font-size:15px">Hemos detectado el número <strong style="color:var(--gold,#c9a84c)">' + numero + '</strong>.<br>¿Es tu cuenta <strong>' + label + '</strong>?</p>' +
        '<div style="display:flex;gap:12px;justify-content:center">' +
          '<button id="btn-cc-confirmar" style="background:var(--gold,#c9a84c);color:#000;border:none;padding:10px 28px;border-radius:8px;cursor:pointer;font-weight:bold">Confirmar</button>' +
          '<button id="btn-cc-cancelar" style="background:transparent;color:var(--text,#e0e0e0);border:1px solid var(--border,#333);padding:10px 28px;border-radius:8px;cursor:pointer">Cancelar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    document.getElementById('btn-cc-confirmar').onclick = function() { modal.remove(); resolve(true); };
    document.getElementById('btn-cc-cancelar').onclick  = function() { modal.remove(); resolve(false); };
  });
}

function histDrop(event) {
  var file = event.dataTransfer.files[0];
  if (file) histSubir(file);
}

function histSubir(file) {
  if (!file) return;
  var msg = document.getElementById('hist-msg');
  msg.textContent = '';
  document.getElementById('hist-progreso').style.display = 'block';
  document.getElementById('hist-prog-bar').style.width = '30%';
  document.getElementById('hist-prog-txt').textContent = 'Leyendo archivo...';

  var reader = new FileReader();
  async function procesarRaw(raw) {
    document.getElementById('hist-prog-bar').style.width = '70%';
    document.getElementById('hist-prog-txt').textContent = 'Calculando...';
    var trades = parsearTrades(raw);
    if (!trades || trades.length < 5) {
      msg.style.color = 'var(--red)'; msg.textContent = 'No se encontraron trades XAU/USD suficientes.';
      document.getElementById('hist-progreso').style.display = 'none'; return;
    }
    // 1. Buscar nombre de cuenta en datos ya cargados de Supabase (HISTORIAL_ALL_FPS)
    var fps = trades.map(function(t) { return t.fp; }).filter(Boolean);
    var nombreFinal = _nombreCuentaDesdeHISTORIAL(fps);
    // 2. Si no está en cache, consultar Supabase con el primer fp del archivo
    if (!nombreFinal && fps.length && window.usuarioActual) {
      var _lr = await supaGet('trades',
        'usuario_email=eq.' + encodeURIComponent(usuarioActual.email) +
        '&fp=eq.' + encodeURIComponent(fps[0]) +
        '&cuenta=not.is.null&limit=1', getToken());
      if (!_lr.error && _lr.data && _lr.data.length) nombreFinal = _lr.data[0].cuenta;
    }
    // 3. Detectar número de cuenta del archivo y comparar con CUENTAS_AURUM
    var _detDeRaw  = detectarNumeroCuentaDeRaw(raw);
    var _detDeFile = _numeroDesdeFichero(raw, file.name);
    var numeroCuenta = _detDeRaw || _detDeFile;
    console.log('[HISTORIAL] paso3 — numeroCuenta:', JSON.stringify(numeroCuenta), '| nombreFinal previo:', JSON.stringify(nombreFinal), '| CUENTAS_AURUM:', CUENTAS_AURUM);
    if (numeroCuenta && CUENTAS_AURUM[numeroCuenta]) {
      // Número ya vinculado → usar carpeta mapeada
      nombreFinal = CUENTAS_AURUM[numeroCuenta];
    } else if (numeroCuenta) {
      // Número desconocido → asignar según el desplegable
      var _tipoSel = ((document.getElementById('hist-tipo') || {}).value || '').toLowerCase();
      var _tipoMap = { maestra: { col: 'cuenta_maestra', label: 'Maestra' }, retos: { col: 'cuenta_retos', label: 'Retos' }, prueba: { col: 'cuenta_prueba', label: 'Prueba' } };
      if (_tipoMap[_tipoSel]) {
        // Guardar número en usuarios_aurum y actualizar sesión
        var _patchData = {}; _patchData[_tipoMap[_tipoSel].col] = numeroCuenta;
        await supaPatch('usuarios_aurum', 'email=eq.' + encodeURIComponent(usuarioActual.email), _patchData, getToken());
        CUENTAS_AURUM[numeroCuenta] = 'Cuenta ' + _tipoMap[_tipoSel].label;
        nombreFinal = 'Cuenta ' + _tipoMap[_tipoSel].label;
        console.log('[HISTORIAL] Número vinculado automáticamente:', numeroCuenta, '→', nombreFinal);
      } else {
        nombreFinal = nombreFinal || 'Cuenta Externa';
      }
    } else if (!nombreFinal) {
      nombreFinal = 'Cuenta Externa';
    }
    // Safety net: si nombreFinal sigue siendo Cuenta Externa pero el desplegable tiene Maestra/Retos/Prueba, sobreescribir
    var _tipoFinal = ((document.getElementById('hist-tipo') || {}).value || '').toLowerCase();
    var _tipoMapFinal = { maestra: { col: 'cuenta_maestra', label: 'Maestra' }, retos: { col: 'cuenta_retos', label: 'Retos' }, prueba: { col: 'cuenta_prueba', label: 'Prueba' } };
    if (nombreFinal === 'Cuenta Externa' && _tipoMapFinal[_tipoFinal]) {
      nombreFinal = 'Cuenta ' + _tipoMapFinal[_tipoFinal].label;
      if (numeroCuenta) {
        var _pd2 = {}; _pd2[_tipoMapFinal[_tipoFinal].col] = numeroCuenta;
        await supaPatch('usuarios_aurum', 'email=eq.' + encodeURIComponent(usuarioActual.email), _pd2, getToken());
        CUENTAS_AURUM[numeroCuenta] = nombreFinal;
      }
      console.log('[HISTORIAL] Safety net — override por desplegable:', nombreFinal, '| numeroCuenta:', numeroCuenta);
    }
    console.log('[HISTORIAL] nombreFinal final:', nombreFinal);
    var fps_nuevos = trades.filter(function(t) { return !HISTORIAL_ALL_FPS.has(nombreFinal + '|' + (t.fp || '')); });
    var dups = trades.length - fps_nuevos.length;
    setTimeout(function() {
      document.getElementById('hist-progreso').style.display = 'none';
      if (fps_nuevos.length === 0) {
        if (typeof guardarTradesIndividuales === 'function') guardarTradesIndividuales(trades, nombreFinal);
        msg.style.color = 'var(--gold)'; msg.textContent = 'Todos los trades ya estaban registrados (' + dups + ' duplicados).'; return;
      }
      var fps_list = fps_nuevos.map(function(t){ return t.fp; }).filter(Boolean);
      fps_list.forEach(function(fp) { HISTORIAL_ALL_FPS.add(nombreFinal + '|' + fp); });
      // Guardar trades individuales en Supabase y luego recargar métricas completas
      if (typeof guardarTradesIndividuales === 'function') {
        guardarTradesIndividuales(fps_nuevos, nombreFinal).then(function() {
          return _actualizarEntradaHistorial(nombreFinal, document.getElementById('hist-tipo').value, numeroCuenta);
        }).then(function() {
          cargarHistorialDesdeSupabase();
          if (typeof actualizarDashboard === 'function') actualizarDashboard();
        });
      }
      var aviso = dups > 0 ? ' (' + dups + ' duplicados ignorados)' : '';
      msg.style.color = 'var(--green)'; msg.textContent = fps_nuevos.length + ' trades únicos añadidos' + aviso + '.';
      document.getElementById('hist-nombre').value = '';
    }, 400);
  }
  if (file.name.toLowerCase().endsWith('.xlsx')) {
    reader.onload = function(e) {
      function leerConXLSX() {
        try { var data = new Uint8Array(e.target.result); var wb = XLSX.read(data,{type:'array',cellDates:true}); var ws = wb.Sheets[wb.SheetNames[0]]; var raw = XLSX.utils.sheet_to_json(ws,{header:1,defval:''}); console.log('[XLSX] filas totales:', raw.length, '| fila0:', JSON.stringify(raw[0]), '| fila1:', JSON.stringify(raw[1]), '| fila2:', JSON.stringify(raw[2])); procesarRaw(raw); }
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

async function _actualizarEntradaHistorial(nombreCuenta, tipo, numeroCuenta) {
  if (!window.usuarioActual || !window.usuarioActual.email) return;
  var token = getToken();
  var params = 'usuario_email=eq.' + encodeURIComponent(usuarioActual.email) + '&order=created_at.asc&limit=5000';

  // Merge trades + historiales igual que cargarHistorialDesdeSupabase para ver el total real
  var resTrades      = await supaGet('trades',     params, token);
  var resHistoriales = await supaGet('historiales', params, token);
  var allRows = [];
  var _seenFps = new Set();
  function _addRows(rows) {
    if (!rows || !rows.length) return;
    rows.forEach(function(t) {
      if (t.fp) {
        var key = (t.usuario_email || '') + '|' + t.fp;
        if (!_seenFps.has(key)) { _seenFps.add(key); allRows.push(t); }
      } else {
        allRows.push(t);
      }
    });
  }
  _addRows(resTrades.data);
  _addRows(resHistoriales.data);
  if (!allRows.length) return;

  // Filtrar a esta cuenta por nombre exacto del campo cuenta
  var keyword = nombreCuenta.toLowerCase();
  var trades = allRows.filter(function(t) {
    return t.cuenta && t.cuenta.toLowerCase().indexOf(keyword) >= 0;
  });
  if (!trades.length) return;

  var wins = trades.filter(function(t) { return t.ganadora; }).length;
  var pnl  = Math.round(trades.reduce(function(s, t) { return s + (t.beneficio || 0); }, 0) * 100) / 100;
  var wr   = Math.round(wins / trades.length * 1000) / 10;
  var wT   = trades.filter(function(t) { return t.ganadora; });
  var lT   = trades.filter(function(t) { return !t.ganadora; });
  var ptsW = wT.length > 0 ? wT.reduce(function(s, t) { return s + (t.puntos || 0); }, 0) / wT.length : 0;
  var ptsL = lT.length > 0 ? lT.reduce(function(s, t) { return s + (t.puntos || 0); }, 0) / lT.length : 0;
  var rr   = ptsL > 0 ? Math.round(ptsW / ptsL * 100) / 100 : 0;

  var MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var fechas = trades.map(function(t) {
    if (t.fp) { var m = String(t.fp).match(/(\d{4})\.(\d{2})\.(\d{2})/); if (m) return new Date(+m[1], +m[2]-1, +m[3]); }
    if (t.created_at) return new Date(t.created_at);
    return null;
  }).filter(Boolean).sort(function(a, b) { return a - b; });
  var periodo = fechas.length > 0
    ? fechas[0].getDate() + ' ' + MESES[fechas[0].getMonth()] + ' – ' +
      fechas[fechas.length-1].getDate() + ' ' + MESES[fechas[fechas.length-1].getMonth()] + ' ' + fechas[fechas.length-1].getFullYear()
    : new Date().toLocaleDateString('es-ES');

  // Usar el campo cuenta tal como está guardado en Supabase como clave canónica
  var nombre = (trades.length > 0 && trades[0].cuenta) || nombreCuenta;

  var entrada = {
    nombre:  nombre,
    numero:  numeroCuenta || _numeroDesdeNombre(nombre),
    tipo:    tipo || 'real',
    total:   trades.length,
    wins:    wins,
    pnl:     pnl,
    wr:      wr,
    rr:      rr,
    periodo: periodo,
    dias:    [],
    tipos:   {},
    fps:     trades.map(function(t) { return t.fp; }).filter(Boolean)
  };

  var idx = HISTORIAL_CUENTAS.findIndex(function(c) { return c.nombre === nombre; });
  if (idx >= 0) {
    HISTORIAL_CUENTAS[idx] = entrada;
  } else {
    HISTORIAL_CUENTAS.push(entrada);
  }

  var _hFilter = 'usuario_email=eq.' + encodeURIComponent(usuarioActual.email) +
                 '&nombre=eq.'        + encodeURIComponent(nombre) + '&limit=1';
  var _hCheck = await supaGet('historiales', _hFilter, token);
  var _hData  = { usuario_email: usuarioActual.email, nombre: nombre, tipo: tipo || 'real', numero: numeroCuenta || null };
  var _hRes;
  if (!_hCheck.error && _hCheck.data && _hCheck.data.length) {
    _hRes = await supaPatch('historiales', _hFilter, _hData, token);
    console.log('[HISTORIAL] PATCH historiales — nombre:', nombre);
  } else {
    _hRes = await supaPost('historiales', _hData, token);
    console.log('[HISTORIAL] INSERT historiales — nombre:', nombre);
  }
  if (_hRes && _hRes.error) console.error('[HISTORIAL] Error guardando historiales:', _hRes.error);

  // Re-render full list
  var lista = document.getElementById('hist-lista');
  if (lista) {
    lista.innerHTML = '';
    HISTORIAL_CUENTAS.forEach(function(c, i) { histAnadirFila(c, i); });
  }
}

async function guardarTradesIndividuales(trades, nombreCuenta) {
  if (!window.usuarioActual || !window.usuarioActual.email) return;
  if (!trades || !trades.length) return;
  var token = getToken();
  var emailParam = 'usuario_email=eq.' + encodeURIComponent(usuarioActual.email);

  // 1. UPDATE: asignar nombre de cuenta a trades existentes con cuenta = null
  //    que coincidan por fp con el archivo que se está subiendo
  var fps = trades.map(function(t) { return t.fp; }).filter(Boolean);
  if (fps.length) {
    var fpList = fps.map(function(fp) {
      return '%22' + encodeURIComponent(fp) + '%22';
    }).join(',');
    var patchRes = await supaPatch(
      'trades',
      emailParam + '&cuenta=is.null&fp=in.(' + fpList + ')',
      { cuenta: nombreCuenta },
      token
    );
    if (patchRes.error) console.error('[HISTORIAL] Error reparando cuenta nula:', patchRes.error);
  }

  // 2. INSERT / UPDATE del resto de trades del archivo — fetch raw para ver respuesta completa
  var rows = trades.map(function(t) {
    return {
      fp:            t.fp,
      usuario_email: usuarioActual.email,
      cuenta:        nombreCuenta || 'Externa',
      ganadora:      !!t.ganadora,
      beneficio:     t.ben != null ? t.ben : (t.beneficio != null ? t.beneficio : 0),
      hora:          t.hora != null ? t.hora : 0,
      dia:           t.dia != null ? t.dia : 0,
      puntos:        t.puntos != null ? t.puntos : null,
      sl:            t.sl || null,
      tp:            t.tp || null
    };
  });
  console.log('[INSERT] enviando', rows.length, 'rows | cuenta:', nombreCuenta, '| primer fp:', rows[0] && rows[0].fp);
  var _insertResp, _insertBody;
  try {
    _insertResp = await fetch(SUPA_URL + '/rest/v1/trades', {
      method:  'POST',
      headers: Object.assign(_headers(token), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body:    JSON.stringify(rows)
    });
    _insertBody = await _insertResp.text();
    console.log('[INSERT] status:', _insertResp.status, '| ok:', _insertResp.ok, '| rows enviados:', rows.length);
    var _insertParsed = null;
    try { _insertParsed = JSON.parse(_insertBody); } catch(_) {}
    if (!_insertResp.ok) {
      console.error('[INSERT] FALLO —', _insertResp.status, _insertResp.statusText);
      console.error('[INSERT] body raw:', _insertBody);
      console.error('[INSERT] body parsed:', _insertParsed);
    } else {
      console.log('[INSERT] OK — body:', _insertBody || '(vacío, esperado con return=minimal)');
    }
  } catch (err) {
    console.error('[INSERT] excepción en fetch:', err);
    console.error('[INSERT] body hasta el momento:', _insertBody);
  }

  // 3. DELETE: eliminar todos los trades sin cuenta de este usuario (datos corruptos)
  var delRes = await supaDelete('trades', emailParam + '&cuenta=is.null', token);
  if (delRes.error) console.error('[HISTORIAL] Error eliminando trades sin cuenta:', delRes.error);
}
