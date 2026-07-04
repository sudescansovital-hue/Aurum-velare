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
function detectarNumeroCuentaDeRaw(raw, fileName) {
  var nums = Object.keys(CUENTAS_AURUM);
  // 1. Nombre de archivo
  if (fileName) {
    for (var n = 0; n < nums.length; n++) {
      if (String(fileName).indexOf(nums[n]) >= 0) return nums[n];
    }
  }
  // 2. Coincidencia exacta con cuentas conocidas en cualquier celda (30 filas)
  for (var r = 0; r < Math.min(raw.length, 30); r++) {
    var row = raw[r] || [];
    for (var c = 0; c < row.length; c++) {
      var cell = String(row[c] || '');
      for (var n = 0; n < nums.length; n++) {
        if (cell.indexOf(nums[n]) >= 0) return nums[n];
      }
    }
  }
  // 3. Keywords clásicas — buscar en toda la fila, no solo celdas contiguas
  var keywords = ['cuenta de trading', 'account', 'login', 'numero de cuenta', 'account number', 'account id'];
  for (var r = 0; r < Math.min(raw.length, 30); r++) {
    var row = raw[r] || [];
    var filaStr = row.map(function(c){ return String(c||''); }).join(' ');
    var filaLow = filaStr.toLowerCase();
    if (!keywords.some(function(k) { return filaLow.indexOf(k) >= 0; })) continue;
    // Buscar cualquier número de 4+ dígitos en toda la fila
    var m = filaStr.match(/\b(\d{4,})\b/);
    if (m) return m[1];
  }
  // 4. Fallback: numero de 5+ digitos en las primeras 10 filas
  for (var r = 0; r < Math.min(raw.length, 10); r++) {
    var row = raw[r] || [];
    for (var c = 0; c < row.length; c++) {
      var cell = String(row[c] || '').trim();
      var m = cell.match(/^\d{5,}$/);
      if (m) return m[0];
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
  var u = window.usuarioActual;
  if (u && u.cuenta_maestra) CUENTAS_AURUM[u.cuenta_maestra] = 'Cuenta Maestra';
  if (u && u.cuenta_retos)   CUENTAS_AURUM[u.cuenta_retos]   = 'Cuenta Retos';
  if (u && u.cuenta_prueba)  CUENTAS_AURUM[u.cuenta_prueba]  = 'Cuenta Prueba';
  console.log('[HISTORIAL] CUENTAS_AURUM construido — claves:', Object.keys(CUENTAS_AURUM), '| objeto:', CUENTAS_AURUM);

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

    // Borrar trades sin cuenta asignada antes de cargar
    await supaDelete('trades', 'usuario_email=eq.' + encodeURIComponent(usuarioActual.email) + '&cuenta=is.null', token);

    var allData = [];
    var from = 0;
    var pageSize = 1000;
    while (true) {
      var pageParams = params + '&offset=' + from + '&limit=' + pageSize;
      var res = await supaGet('trades', pageParams, token);
      var page = res.data || [];
      allData = allData.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    console.log('[HISTORIAL] trades cargados:', allData.length, '| primer row:', allData[0]);
    if (!allData.length) { console.log('[HISTORIAL] sin trades — salida'); return; }

    // Registrar todos los fps conocidos para deduplicación al subir
    allData.forEach(function(t) {
      if (t.fp) HISTORIAL_ALL_FPS.add(t.fp);
    });

    // Agrupar por cuenta
    var porCuenta = {};
    allData.forEach(function(t) {
      var c = (t.cuenta === 'Cuenta Externa' && t.cuenta_numero)
        ? 'Cuenta Externa · ' + t.cuenta_numero
        : t.cuenta;
      if (!c) return;
      if (!porCuenta[c]) porCuenta[c] = [];
      porCuenta[c].push(t);
    });
    console.log('[HISTORIAL] cuentas detectadas:', Object.keys(porCuenta));

    if (!window.usuarioActual || window.usuarioActual.email !== emailInicio) return;
    HISTORIAL_CUENTAS = [];
    HISTORIAL_ALL_FPS = new Set();
    // Reconstruir HISTORIAL_ALL_FPS tras el guard
    allData.forEach(function(t) {
      if (t.fp) HISTORIAL_ALL_FPS.add(t.fp);
    });

    var MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    Object.keys(porCuenta).forEach(function(nombreCuenta) {
      var trades = porCuenta[nombreCuenta];
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

    HISTORIAL_CUENTAS.sort(function(a, b) {
      var orden = ['Cuenta Maestra', 'Cuenta Retos', 'Cuenta Prueba'];
      var ia = orden.indexOf(a.nombre);
      var ib = orden.indexOf(b.nombre);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return 0;
    });

    var lista = document.getElementById('hist-lista');
    if (lista) {
      lista.innerHTML = '';
      HISTORIAL_CUENTAS.forEach(function(c, idx) { histAnadirFila(c, idx); });
    }

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

// FIX corazón de datos (04/07) — comprueba si el número de cuenta detectado
// en el archivo ya está asignado a OTRO usuario del sistema (usuarios_aurum).
// Evita que un import con la sesión equivocada guarde trades/parciales de un
// usuario bajo el email de otro (bug confirmado: 21 trades de Willian bajo
// el email de Mara en trade_parciales, cuenta_numero 7747760).
async function _verificarCuentaDeOtroUsuario(numeroCuenta, token) {
  if (!numeroCuenta) return null;
  try {
    var q = 'select=email,cuenta_maestra,cuenta_retos,cuenta_prueba&or=(cuenta_maestra.eq.' +
      encodeURIComponent(numeroCuenta) + ',cuenta_retos.eq.' + encodeURIComponent(numeroCuenta) +
      ',cuenta_prueba.eq.' + encodeURIComponent(numeroCuenta) + ')';
    var res = await supaGet('usuarios_aurum', q, token);
    if (res.error || !Array.isArray(res.data)) return null;
    var otro = res.data.find(function(u) { return u.email && u.email !== usuarioActual.email; });
    return otro ? otro.email : null;
  } catch (err) {
    console.error('[HISTORIAL] Error verificando cuenta ajena:', err);
    return null;
  }
}

function _confirmarCuentaAjena(numero, emailOtro) {
  return new Promise(function(resolve) {
    var existing = document.getElementById('modal-cuenta-ajena');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'modal-cuenta-ajena';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:99999';
    modal.innerHTML =
      '<div style="background:#0d1120;border:1px solid var(--red,#cc4444);border-radius:12px;padding:32px;max-width:460px;width:90%;text-align:center;position:relative;z-index:100000">' +
        '<p style="color:#e0e0e0;margin:0 0 12px;line-height:1.6;font-size:15px">⚠ El número de cuenta <strong style="color:var(--gold,#c9a84c)">' + numero + '</strong> ya está asignado a otro usuario del sistema (<strong>' + emailOtro + '</strong>).</p>' +
        '<p style="color:#e0e0e0;margin:0 0 24px;line-height:1.6;font-size:14px;opacity:.8">Si continúas, estos trades se guardarán con tu email actual pero con ese número de cuenta. ¿Seguro que quieres continuar?</p>' +
        '<div style="display:flex;gap:12px;justify-content:center">' +
          '<button id="btn-ca-cancelar" style="background:var(--gold,#c9a84c);color:#000;border:none;padding:10px 28px;border-radius:8px;cursor:pointer;font-weight:bold">Cancelar</button>' +
          '<button id="btn-ca-continuar" style="background:transparent;color:var(--text,#e0e0e0);border:1px solid var(--border,#333);padding:10px 28px;border-radius:8px;cursor:pointer">Continuar de todos modos</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    document.getElementById('btn-ca-continuar').onclick = function() { modal.remove(); resolve(true); };
    document.getElementById('btn-ca-cancelar').onclick  = function() { modal.remove(); resolve(false); };
  });
}

function histSubirMultiple(files) {
  if (!files || !files.length) return;
  var arr = Array.from(files);
  function procesarSiguiente(i) {
    if (i >= arr.length) return;
    histSubir(arr[i], function() { procesarSiguiente(i + 1); });
  }
  procesarSiguiente(0);
}

function histDrop(event) {
  var files = event.dataTransfer.files;
  if (files && files.length) histSubirMultiple(files);
}

function histSubir(file, onDone) {
  if (!file) return;
  var msg = document.getElementById('hist-msg');
  msg.textContent = '';
  document.getElementById('hist-progreso').style.display = 'block';
  document.getElementById('hist-prog-bar').style.width = '30%';
  document.getElementById('hist-prog-txt').textContent = 'Leyendo archivo...';

  var reader = new FileReader();
  async function procesarRaw(raw, numeroCuentaForzado) {
    document.getElementById('hist-prog-bar').style.width = '70%';
    document.getElementById('hist-prog-txt').textContent = 'Calculando...';
    if (Object.keys(CUENTAS_AURUM).length === 0) {
      var _u = window.usuarioActual;
      if (_u && _u.cuenta_maestra) CUENTAS_AURUM[_u.cuenta_maestra] = 'Cuenta Maestra';
      if (_u && _u.cuenta_retos)   CUENTAS_AURUM[_u.cuenta_retos]   = 'Cuenta Retos';
      if (_u && _u.cuenta_prueba)  CUENTAS_AURUM[_u.cuenta_prueba]  = 'Cuenta Prueba';
    }
    var _parsed = parsearTrades(raw);
    var trades   = Array.isArray(_parsed) ? _parsed : (_parsed.trades || []);
    var parciales = Array.isArray(_parsed) ? [] : (_parsed.parciales || []);
    if (!trades || trades.length < 5) {
      msg.style.color = 'var(--red)'; msg.textContent = 'No se encontraron trades XAU/USD suficientes.';
      document.getElementById('hist-progreso').style.display = 'none';
      if (typeof onDone === 'function') onDone();
      return;
    }
    var numeroCuenta = numeroCuentaForzado || detectarNumeroCuentaDeRaw(raw, file.name);
    var nombreFinal  = (numeroCuenta && CUENTAS_AURUM[numeroCuenta]) || 'Cuenta Externa';
    var tipo         = nombreFinal === 'Cuenta Externa' ? 'extern' : 'real';

    async function _pedirNumeroSiNecesario() {
      if (numeroCuenta) return numeroCuenta;
      return new Promise(function(resolve) {
        var modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:99999';
        modal.innerHTML = '<div style="background:#0d1120;border:1px solid var(--gold,#c9a84c);border-radius:12px;padding:32px;max-width:460px;width:90%;text-align:center;position:relative">' +
          '<button id="btn-cerrar-x" style="position:absolute;top:12px;right:16px;background:transparent;border:none;color:#888;font-size:20px;cursor:pointer;line-height:1">✕</button>' +
          '<p style="color:#e0e0e0;margin:0 0 8px;font-size:15px">No se detectó el número de cuenta automáticamente.</p>' +
          '<p style="color:#e0e0e0;margin:0 0 24px;font-size:14px;opacity:.7">¿Es una cuenta externa o cancelar?</p>' +
          '<div style="display:flex;gap:12px;justify-content:center">' +
            '<button id="btn-externa" style="background:var(--gold,#c9a84c);color:#000;border:none;padding:10px 28px;border-radius:8px;cursor:pointer;font-weight:bold">Es una cuenta externa</button>' +
            '<button id="btn-cancelar" style="background:transparent;color:var(--text,#e0e0e0);border:1px solid #444;padding:10px 28px;border-radius:8px;cursor:pointer">Cancelar</button>' +
          '</div>' +
        '</div>';
        document.body.appendChild(modal);
        document.getElementById('btn-cerrar-x').onclick = function() { modal.remove(); resolve('CANCELAR'); };
        document.getElementById('btn-externa').onclick = function() { modal.remove(); resolve(null); };
        document.getElementById('btn-cancelar').onclick = function() { modal.remove(); resolve('CANCELAR'); };
      });
    }

    document.getElementById('hist-progreso').style.display = 'none';
    numeroCuenta = await _pedirNumeroSiNecesario();
    if (numeroCuenta === 'CANCELAR') {
      msg.style.color = 'var(--gold)';
      msg.textContent = 'Subida cancelada.';
      if (typeof onDone === 'function') onDone();
      return;
    }
    nombreFinal  = (numeroCuenta && CUENTAS_AURUM[numeroCuenta]) || 'Cuenta Externa';
    tipo         = nombreFinal === 'Cuenta Externa' ? 'extern' : 'real';

    // FIX corazón de datos (04/07): avisar si este número de cuenta ya
    // pertenece a otro usuario del sistema, antes de guardar nada.
    var _emailAjeno = await _verificarCuentaDeOtroUsuario(numeroCuenta, getToken());
    if (_emailAjeno) {
      var _continuar = await _confirmarCuentaAjena(numeroCuenta, _emailAjeno);
      if (!_continuar) {
        msg.style.color = 'var(--gold)';
        msg.textContent = 'Subida cancelada — ese número de cuenta pertenece a otro usuario.';
        document.getElementById('hist-progreso').style.display = 'none';
        if (typeof onDone === 'function') onDone();
        return;
      }
    }

    (function() {
      trades.map(function(t){ return t.fp; }).filter(Boolean)
        .forEach(function(fp) { HISTORIAL_ALL_FPS.add(nombreFinal + '|' + fp); });
      if (typeof guardarTradesIndividuales === 'function') {
        var _resultadoImport = null;
        guardarTradesIndividuales(trades, nombreFinal, numeroCuenta, parciales).then(function(resultado) {
          _resultadoImport = resultado;
          return _actualizarEntradaHistorial(nombreFinal, tipo, numeroCuenta);
        }).then(function() {
          cargarHistorialDesdeSupabase();
          if (typeof actualizarDashboard === 'function') actualizarDashboard();
          msg.style.color = 'var(--green)';
          if (_resultadoImport) {
            var partes = [];
            partes.push(_resultadoImport.nuevos + ' nuevo' + (_resultadoImport.nuevos !== 1 ? 's' : ''));
            partes.push(_resultadoImport.actualizados + ' ya exist' + (_resultadoImport.actualizados !== 1 ? 'ían' : 'ía'));
            if (_resultadoImport.protegidos > 0) partes.push(_resultadoImport.protegidos + ' protegido' + (_resultadoImport.protegidos !== 1 ? 's' : '') + ' (EA)');
            msg.textContent = partes.join(' · ');
          } else {
            msg.textContent = trades.length + ' trades reimportados.';
          }
        }).catch(function(err) {
          console.error('[HISTORIAL] Error guardando trades:', err);
          if (!err || !err.mensajeMostrado) {
            msg.style.color = 'var(--red)';
            msg.textContent = 'Error al guardar los trades. Reintenta la importación.';
          }
        });
      } else {
        msg.style.color = 'var(--green)'; msg.textContent = trades.length + ' trades reimportados.';
      }
      document.getElementById('hist-nombre').value = '';
      if (typeof onDone === 'function') onDone();
    })();
  }
  if (file.name.toLowerCase().endsWith('.xlsx')) {
    reader.onload = function(e) {
      function leerConXLSX() {
        try { var data = new Uint8Array(e.target.result); var wb = XLSX.read(data,{type:'array',cellDates:true}); var ws = wb.Sheets[wb.SheetNames[0]]; var raw = XLSX.utils.sheet_to_json(ws,{header:1,defval:''}); console.log('[XLSX] filas totales:', raw.length, '| fila0:', JSON.stringify(raw[0]), '| fila1:', JSON.stringify(raw[1]), '| fila2:', JSON.stringify(raw[2])); procesarRaw(raw); }
        catch(err) { msg.style.color='var(--red)'; msg.textContent='Error al leer el archivo.'; document.getElementById('hist-progreso').style.display='none'; if (typeof onDone === 'function') onDone(); }
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
      try {
        var htmlText = e.target.result;
        var parser2 = new DOMParser();
        var doc2 = parser2.parseFromString(htmlText, 'text/html');
        var titleText = (doc2.querySelector('title') || {}).textContent || '';
        var titleMatch = titleText.match(/cT[\s_]+(\d{5,})/i);
        var numeroCuentaTitle = titleMatch ? titleMatch[1] : null;
        console.log('[PARSER-HTM] title:', titleText.trim(), '| cuenta:', numeroCuentaTitle);
        var raw = [];
        doc2.querySelectorAll('table').forEach(function(table) {
          table.querySelectorAll('tr').forEach(function(tr) {
            var cells = Array.from(tr.querySelectorAll('td,th')).map(function(td) { return td.textContent.trim(); });
            if (cells.length > 3) raw.push(cells);
          });
        });
        procesarRaw(raw, numeroCuentaTitle);
      } catch(err) {
        msg.style.color = 'var(--red)';
        msg.textContent = 'Error al leer el archivo.';
        document.getElementById('hist-progreso').style.display = 'none';
        if (typeof onDone === 'function') onDone();
      }
    }; reader.readAsText(file, 'UTF-16');
  }
}

async function _actualizarEntradaHistorial(nombreCuenta, tipo, numeroCuenta) {
  if (!window.usuarioActual || !window.usuarioActual.email) return;
  var token = getToken();
  var params = 'usuario_email=eq.' + encodeURIComponent(usuarioActual.email) + '&order=created_at.asc&limit=5000';

  var resTrades = await supaGet('trades', params, token);
  var allRows = resTrades.data || [];
  if (!allRows.length) return;

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

  var nombre = (trades[0] && trades[0].cuenta) || nombreCuenta;
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
  if (idx >= 0) { HISTORIAL_CUENTAS[idx] = entrada; } else { HISTORIAL_CUENTAS.push(entrada); }

  var lista = document.getElementById('hist-lista');
  if (lista) {
    lista.innerHTML = '';
    HISTORIAL_CUENTAS.forEach(function(c, i) { histAnadirFila(c, i); });
  }
}

async function guardarTradesIndividuales(trades, nombreCuenta, numeroCuenta, parciales) {
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

  // 1.5. Verificar qué trades de este archivo ya existen en Supabase (para
  //      el mensaje final nuevos/ya existían) y proteger los del EA (nunca
  //      pisar un trade que ya tiene el historial completo de SL capturado
  //      por el EA, fuente='ea'). Una sola consulta para ambas cosas.
  var deCuentaParams = emailParam + '&cuenta=eq.' + encodeURIComponent(nombreCuenta);
  if (numeroCuenta) deCuentaParams += '&cuenta_numero=eq.' + encodeURIComponent(numeroCuenta);
  var existRes = await supaGet('trades', deCuentaParams + '&select=fp,fuente', token);
  if (existRes.error || !Array.isArray(existRes.data)) {
    console.error('[HISTORIAL] Error verificando trades existentes/protegidos:', existRes.error || 'data no es array: ' + JSON.stringify(existRes.data));
    var msgEl = document.getElementById('hist-msg');
    if (msgEl) {
      msgEl.style.color = 'var(--red)';
      msgEl.textContent = 'No se pudo verificar qué trades están protegidos por el EA. Reintenta la importación.';
    }
    var errAbort = new Error('[HISTORIAL] Import abortado: fallo verificando protección fuente=ea');
    errAbort.mensajeMostrado = true;
    throw errAbort;
  }
  var fpsProtegidos = {};
  var fpsExistentes = {};
  existRes.data.forEach(function(r) {
    if (!r.fp) return;
    fpsExistentes[r.fp] = true;
    if (r.fuente === 'ea') fpsProtegidos[r.fp] = true;
  });

  var tradesAEnviar = trades.filter(function(t) { return !fpsProtegidos[t.fp]; });
  var protegidos = trades.length - tradesAEnviar.length;
  if (protegidos > 0) console.log('[HISTORIAL]', protegidos, 'trade(s) excluidos del reimport por ser fuente=ea (protegidos)');

  var nuevos = tradesAEnviar.filter(function(t) { return t.fp && !fpsExistentes[t.fp]; }).length;
  var actualizados = tradesAEnviar.length - nuevos;

  // 2. UPSERT de todos los trades del archivo — nunca se borra nada que no
  //    esté en el archivo nuevo. Requiere UNIQUE(fp) en Supabase (ya confirmado).
  var rows = tradesAEnviar.map(function(t) {
    return {
      fp:            t.fp,
      fecha:         t.fecha || '',
      usuario_email: usuarioActual.email,
      cuenta:        nombreCuenta || 'Externa',
      cuenta_numero: numeroCuenta || null,
      ganadora:      !!t.ganadora,
      beneficio:     t.ben != null ? t.ben : (t.beneficio != null ? t.beneficio : 0),
      hora:          t.hora != null ? t.hora : 0,
      dia:           t.dia != null ? t.dia : 0,
      puntos:        t.puntos != null ? t.puntos : null,
      precio_entrada: t.pe   || null,
      precio_cierre:  t.pc   || null,
      dur_min:       Math.round(t.durMin || t.dur_min || 60),
      sl:            t.sl || null,
      tp:            t.tp || null,
      volumen:       t.vol != null ? t.vol : (t.volumen != null ? t.volumen : null),
      fuente:        'import'
    };
  });
  console.log('[INSERT] enviando', rows.length, 'rows (upsert por fp, excluidos', protegidos, 'protegidos) | cuenta:', nombreCuenta, '| primer fp:', rows[0] && rows[0].fp);
  var _insertResp, _insertBody;
  try {
    _insertResp = await fetch(SUPA_URL + '/rest/v1/trades?on_conflict=fp', {
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

  // 4. INSERT parciales (solo si el parser MT5 detectó salidas múltiples)
  parciales = parciales || [];
  if (parciales.length > 0) {
    var fpsTrades = trades.map(function(t) { return t.fp; }).filter(Boolean);
    if (fpsTrades.length) {
      var fpListP = fpsTrades.map(function(fp) { return '%22' + encodeURIComponent(fp) + '%22'; }).join(',');
      await supaDelete('trade_parciales', emailParam + '&fp_trade=in.(' + fpListP + ')', token);
    }
    var rowsP = parciales.map(function(p) {
      return {
        fp_trade:      p.fp_trade,
        usuario_email: usuarioActual.email,
        cuenta:        nombreCuenta || 'Externa',
        cuenta_numero: numeroCuenta || null,
        orden_id:      p.orden_id  || null,
        fecha:         p.fecha     || null,
        hora:          p.hora      != null ? p.hora : 0,
        precio:        p.precio    || null,
        volumen:       p.volumen   || null,
        beneficio:     p.beneficio != null ? p.beneficio : 0,
        es_sl:         !!p.es_sl
      };
    });
    try {
      var respP = await fetch(SUPA_URL + '/rest/v1/trade_parciales', {
        method:  'POST',
        headers: Object.assign(_headers(token), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body:    JSON.stringify(rowsP)
      });
      if (respP.ok) console.log('[PARCIALES] INSERT OK —', rowsP.length, 'parciales guardados');
      else console.error('[PARCIALES] INSERT FALLO —', respP.status, await respP.text());
    } catch (err) {
      console.error('[PARCIALES] excepcion en fetch:', err);
    }
  }

  return { nuevos: nuevos, actualizados: actualizados, protegidos: protegidos };
}
