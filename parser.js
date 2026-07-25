// Parser MT5 + cTrader — Aurum Velare v2
// Detección por contenido, nunca por número de fila

function parsearTrades(raw) {
  console.log('[PARSER] filas recibidas:', raw ? raw.length : 0);
  if (!raw || raw.length < 2) return { trades: [], parciales: [] };

  function norm(v) { return String(v||'').normalize('NFC').replace(/[\r\n\t]+/g,' ').toLowerCase().trim(); }

  var mt5PosRow = -1;
  for (var r = 0; r < Math.min(raw.length, 20); r++) {
    var row = raw[r] || [];
    for (var c = 0; c < row.length; c++) {
      if (String(row[c] || '').trim() === 'Posiciones') { mt5PosRow = r; break; }
    }
    if (mt5PosRow >= 0) break;
  }

  var ctHeaderRow = -1;
  for (var r = 0; r < raw.length; r++) {
    var rn = (raw[r] || []).map(norm);
    var tieneAp = rn.some(function(h) { return h.includes('hora de apertura') || h.includes('open time'); });
    var tieneCi = rn.some(function(h) { return h.includes('hora de cierre') || h.includes('close time'); });
    if (tieneAp && tieneCi && (raw[r]||[]).length < 50) { ctHeaderRow = r; break; }
  }

  console.log('[PARSER] mt5PosRow:', mt5PosRow, '| ctHeaderRow:', ctHeaderRow);

  if (mt5PosRow >= 0)  return _parsearMT5(raw, mt5PosRow);
  if (ctHeaderRow >= 0) return { trades: _parsearCtrader(raw, ctHeaderRow), parciales: [] };

  console.warn('[PARSER] Formato no reconocido');
  return { trades: [], parciales: [] };
}

// ── Utilidades ────────────────────────────────────────────────────

function _num(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = parseFloat(String(v).replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

function _esXauusd(s) {
  var u = String(s || '').toUpperCase().replace(/[^A-Z]/g, '');
  return u.includes('XAU') || u.includes('GOLD');
}

function _parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;
  var s = String(val).trim();
  var m = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5], +m[6]);
  m = s.match(/(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]);
  m = s.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]);
  var d = new Date(s);
  return isNaN(d) ? null : d;
}

function _colIdx(headers, names) {
  var norm = names.map(function(n) { return String(n).normalize('NFC').toLowerCase().trim(); });
  for (var i = 0; i < headers.length; i++) {
    if (norm.indexOf(headers[i]) >= 0) return i;
  }
  return -1;
}

function _allColIdx(headers, names) {
  var norm = names.map(function(n) { return String(n).normalize('NFC').toLowerCase().trim(); });
  var result = [];
  headers.forEach(function(h, i) { if (norm.indexOf(h) >= 0) result.push(i); });
  return result;
}

function _durMin(fAp, fCi) {
  if (!fAp || !fCi) return 60;
  var d = Math.round((fCi - fAp) / 60000);
  return d >= 0 ? d : 60;
}

// ── Parser MT5 ────────────────────────────────────────────────────
function _parsearMT5(raw, posicionesRow) {
  var trades    = [];
  var parciales = [];

  // ── 1. Leer sección Posiciones ──────────────────────────────────
  var headerRow = posicionesRow + 1;
  if (headerRow >= raw.length) return { trades: [], parciales: [] };

  var headers = (raw[headerRow] || []).map(function(h) {
    // FIX corazón de datos (04/07): algunos brokers añaden sufijo de zona
    // horaria a la cabecera (ej. "Hora de apertura (UTC+1)"), lo que rompe
    // la coincidencia exacta de _colIdx. Se quita antes de comparar.
    return String(h || '').normalize('NFC').toLowerCase().trim()
      .replace(/\s*\([^)]*\)\s*$/, '');
  });

  var precioIdxs = _allColIdx(headers, ['precio', 'price']);
  var fechaIdxs  = _allColIdx(headers, ['fecha/hora', 'time', 'open time', 'close time']);

  var colPos  = _colIdx(headers, ['posición', 'posicion', 'position', 'ticket']);
  var colSym  = _colIdx(headers, ['símbolo', 'simbolo', 'symbol']);
  var colTipo = _colIdx(headers, ['tipo', 'type']);
  var colVol  = _colIdx(headers, ['volumen', 'volume', 'vol']);
  var colPe   = precioIdxs[0] !== undefined ? precioIdxs[0] : -1;
  var colPc   = precioIdxs[1] !== undefined ? precioIdxs[1] : -1;
  var colSl   = _colIdx(headers, ['s / l', 's/l', 'sl', 'stop loss']);
  var colTp   = _colIdx(headers, ['t / p', 't/p', 'tp', 'take profit']);
  var colAp   = fechaIdxs[0] !== undefined ? fechaIdxs[0] : -1;
  var colCi   = fechaIdxs[1] !== undefined ? fechaIdxs[1] : -1;
  var colBen  = _colIdx(headers, ['beneficio', 'profit']);
  var colCom  = _colIdx(headers, ['comisión', 'comision', 'commission']);
  var colSwap = _colIdx(headers, ['swap']);

  // positionId → fp y tipo (para vincular parciales)
  var posIdToFp   = {};
  var posIdToTipo = {};

  var ordenesRow       = -1;
  var transaccionesRow = -1;

  for (var i = headerRow + 1; i < raw.length; i++) {
    var row = raw[i] || [];

    // Detectar inicio de secciones siguientes
    for (var c = 0; c < row.length; c++) {
      var cell = String(row[c] || '').trim();
      if (cell === 'Órdenes' || cell === 'Ordenes') { ordenesRow = i; break; }
      if (cell === 'Transacciones')                 { transaccionesRow = i; break; }
    }
    if (ordenesRow >= 0 || transaccionesRow >= 0) break;

    if (colSym < 0 || !row[colSym]) continue;
    if (!_esXauusd(row[colSym])) continue;

    var tipo = String(row[colTipo] || '').toLowerCase().trim();
    if (tipo && tipo !== 'buy' && tipo !== 'sell' && tipo !== 'compra' && tipo !== 'venta') continue;
    // FIX corazón de datos (06/07): normalizar a 'buy'/'sell' — antes 'compra'/
    // 'venta' (exports MT5 en español) pasaban el filtro pero nunca coincidían
    // con 'sell' en el cálculo de puntos de abajo, tratando toda venta como compra.
    if (tipo === 'compra') tipo = 'buy';
    else if (tipo === 'venta') tipo = 'sell';

    var ben = (_num(row[colBen]) || 0) + (_num(row[colCom]) || 0) + (_num(row[colSwap]) || 0);
    var vol = _num(row[colVol]);
    var pe  = _num(row[colPe]);
    var pc  = _num(row[colPc]);

    if (pe === null || pc === null) continue;
    if (ben === null || vol === null || vol === 0) continue;
    if (pe < 100 || pe > 50000) continue;
    if (Math.abs(ben) > 50000) continue;
    if (vol > 100) continue;

    var sl = colSl >= 0 ? _num(row[colSl]) : null;
    var tp = colTp >= 0 ? _num(row[colTp]) : null;

    var fAp = _parseDate(row[colAp]);
    var fCi = _parseDate(row[colCi]);
    var hora = fAp ? fAp.getHours() : 0;
    var dia  = fAp ? (fAp.getDay() + 6) % 7 : 0;

    var posId    = colPos >= 0 && row[colPos] ? String(row[colPos]) : '';
    var fechaStr = fAp ? (fAp.getFullYear() + '.' + String(fAp.getMonth()+1).padStart(2,'0') + '.' + String(fAp.getDate()).padStart(2,'0')) : '';
    var fp       = fechaStr + '_' + (posId || (pe + '_' + vol));

    var pcFinal = pc !== null ? pc : pe;
    // 'puntos' debe reflejar el RIESGO del SL (distancia entrada→SL), no cuánto
    // corrió el precio hasta el cierre. Antes se usaba siempre pe-pc, lo que
    // marcaba trades ganadores que corrieron mucho como "SL excesivo" cuando
    // en realidad el SL real podía estar perfecto. Se prioriza sl si es válido.
    var slValido = (sl !== null && sl !== 0 && Math.abs(sl - pe) > 0.00001);
    var puntos;
    if (slValido) {
      puntos = tipo === 'sell' ? +(sl - pe).toFixed(2) : +(pe - sl).toFixed(2);
    } else {
      puntos = tipo === 'sell' ? +(pe - pcFinal).toFixed(2) : +(pcFinal - pe).toFixed(2);
    }

    trades.push({
      fp: fp, ben: ben, vol: vol, pe: pe, pc: pcFinal,
      puntos: Math.abs(puntos), ganadora: ben > 0,
      hora: hora, dia: dia, durMin: _durMin(fAp, fCi),
      sl: sl, tp: tp, tipo: tipo || null,
      fecha: fechaStr
    });

    if (posId) {
      posIdToFp[posId]   = fp;
      posIdToTipo[posId] = tipo;
    }
  }

  // ── 2. Buscar sección Transacciones ────────────────────────────
  if (transaccionesRow < 0) {
    var desde = ordenesRow >= 0 ? ordenesRow : headerRow;
    for (var i = desde; i < raw.length; i++) {
      var row = raw[i] || [];
      for (var c = 0; c < row.length; c++) {
        if (String(row[c] || '').trim() === 'Transacciones') { transaccionesRow = i; break; }
      }
      if (transaccionesRow >= 0) break;
    }
  }

  if (transaccionesRow < 0) return { trades: trades, parciales: [] };

  var txHeader = transaccionesRow + 1;
  if (txHeader >= raw.length) return { trades: trades, parciales: [] };

  var txHeaders = (raw[txHeader] || []).map(function(h) {
    return String(h || '').normalize('NFC').toLowerCase().trim()
      .replace(/\s*\([^)]*\)\s*$/, '');
  });

  var txColFecha  = _colIdx(txHeaders, ['fecha/hora', 'time']);
  var txColSym    = _colIdx(txHeaders, ['símbolo', 'simbolo', 'symbol']);
  var txColTipo   = _colIdx(txHeaders, ['tipo', 'type']);
  var txColDir    = _colIdx(txHeaders, ['dirección', 'direccion', 'direction']);
  var txColVol    = _colIdx(txHeaders, ['volumen', 'volume']);
  var txColPrecio = _colIdx(txHeaders, ['precio', 'price']);
  var txColOrden  = _colIdx(txHeaders, ['orden', 'order']);
  var txColBen    = _colIdx(txHeaders, ['beneficio', 'profit']);
  var txColCom    = _colIdx(txHeaders, ['comisión', 'comision', 'commission']);
  var txColComent = _colIdx(txHeaders, ['comentario', 'comment']);

  // ── 3. Extraer parciales de Transacciones ──────────────────────
  // Lógica: fila dir='in' → apertura, col Orden = positionId
  //         fila dir='out' → cierre parcial, col Orden = ordenId del cierre
  // Vinculamos 'out' al positionId buscando hacia atrás la fila 'in' más cercana
  // del tipo opuesto cuyo ordenId esté en posIdToFp

  // Contamos salidas por posición para detectar parciales (>1 salida)
  var salidasPorPos = {};

  for (var i = txHeader + 1; i < raw.length; i++) {
    var row = raw[i] || [];
    if (!row[txColSym]) continue;
    if (!_esXauusd(row[txColSym])) continue;

    var dir  = txColDir >= 0 ? String(row[txColDir] || '').toLowerCase().trim() : '';
    if (dir !== 'out') continue;

    var tipo   = txColTipo >= 0 ? String(row[txColTipo] || '').toLowerCase().trim() : '';
    var precio = _num(row[txColPrecio]);
    var vol    = _num(row[txColVol]);
    var ben    = (_num(row[txColBen]) || 0) + (_num(row[txColCom]) || 0);
    if (precio === null || vol === null) continue;

    // Buscar positionId hacia atrás: fila 'in' del tipo opuesto más cercana
    var posId = null;
    var tipoEsperado = tipo === 'buy' ? 'sell' : 'buy';
    for (var j = i - 1; j >= txHeader + 1; j--) {
      var rowJ  = raw[j] || [];
      if (!rowJ[txColSym]) continue;
      if (!_esXauusd(rowJ[txColSym])) continue;
      var dirJ  = txColDir  >= 0 ? String(rowJ[txColDir]  || '').toLowerCase().trim() : '';
      var tipoJ = txColTipo >= 0 ? String(rowJ[txColTipo] || '').toLowerCase().trim() : '';
      if (dirJ !== 'in') continue;
      if (tipoJ !== tipoEsperado) continue;
      var ordenJ = txColOrden >= 0 ? String(rowJ[txColOrden] || '') : '';
      if (ordenJ && posIdToFp[ordenJ]) { posId = ordenJ; break; }
    }

    if (!posId || !posIdToFp[posId]) continue;

    if (!salidasPorPos[posId]) salidasPorPos[posId] = [];

    var fTx      = _parseDate(row[txColFecha]);
    var fechaStr = fTx ? (fTx.getFullYear() + '.' + String(fTx.getMonth()+1).padStart(2,'0') + '.' + String(fTx.getDate()).padStart(2,'0')) : '';
    var comentario = txColComent >= 0 ? String(row[txColComent] || '') : '';
    var esSl = comentario.toLowerCase().includes('[sl');

    salidasPorPos[posId].push({
      fp_trade:  posIdToFp[posId],
      orden_id:  txColOrden >= 0 ? String(row[txColOrden] || '') : '',
      fecha:     fechaStr,
      hora:      fTx ? fTx.getHours() : 0,
      precio:    precio,
      volumen:   vol,
      beneficio: Math.round(ben * 100) / 100,
      es_sl:     esSl
    });
  }

  // Solo registrar parciales de posiciones con MÁS DE UNA salida
  Object.keys(salidasPorPos).forEach(function(posId) {
    var salidas = salidasPorPos[posId];
    if (salidas.length > 1) {
      salidas.forEach(function(p) { parciales.push(p); });
    }
  });

  console.log('[PARSER MT5] trades:', trades.length, '| parciales:', parciales.length);
  return { trades: trades, parciales: parciales };
}

// ── Parser cTrader ────────────────────────────────────────────────
function _parsearCtrader(raw, headerRow) {
  var trades = [];

  var headers = (raw[headerRow] || []).map(function(h) {
    // FIX corazón de datos (04/07): mismo fix que en _parsearMT5 — algunos
    // brokers de cTrader añaden "(UTC+1)" a "Hora de apertura"/"Hora de
    // cierre", rompiendo la coincidencia exacta de _colIdx.
    return String(h || '').normalize('NFC').toLowerCase().trim()
      .replace(/\s*\([^)]*\)\s*$/, '');
  });

  var colSim  = _colIdx(headers, ['símbolo', 'simbolo', 'symbol', 'instrument']);
  var colDir  = _colIdx(headers, ['dirección de apertura', 'direccion de apertura', 'dirección', 'direccion', 'direction', 'type', 'tipo']);
  var colAp   = _colIdx(headers, ['hora de apertura', 'open time']);
  var colCi   = _colIdx(headers, ['hora de cierre', 'close time']);
  var colPe   = _colIdx(headers, ['precio de entrada', 'entry price', 'precio entrada', 'entrada']);
  var colPc   = _colIdx(headers, ['precio de cierre', 'exit price', 'close price', 'precio cierre']);
  var colVol  = _colIdx(headers, ['cantidad de cierre', 'cantidad', 'qty', 'lots', 'quantity', 'volumen']);
  var colNeto = _colIdx(headers, ['$ neto', 'usd neto', 'neto', 'net profit', 'profit', 'beneficio']);
  var colSl   = _colIdx(headers, ['s / l', 's/l', 'sl', 'stop loss']);
  var colTp   = _colIdx(headers, ['t / p', 't/p', 'tp', 'take profit']);

  var groups     = {};
  var groupOrder = [];

  for (var i = headerRow + 1; i < raw.length; i++) {
    var row = raw[i] || [];
    if (!row[colSim]) continue;
    if (!_esXauusd(row[colSim])) continue;

    var ben = _num(row[colNeto]);
    var pe  = _num(row[colPe]);
    var pc  = _num(row[colPc]);
    var vol = _num(row[colVol]);

    if (ben === null || pe === null) continue;
    if (pe < 100 || pe > 50000) continue;
    if (Math.abs(ben) > 50000) continue;
    if (vol !== null && vol > 100) continue;

    var apStr  = String(row[colAp] || '').trim();
    var dirStr = String(row[colDir] || '').trim().toLowerCase();
    var key    = apStr + '|' + dirStr + '|' + pe;

    if (!groups[key]) {
      groups[key] = {
        fp: key, apStr: apStr, ciStr: String(row[colCi] || '').trim(),
        dir: dirStr, pe: pe, vol: vol || 0, ben: 0, pc: pc || pe,
        sl: colSl >= 0 ? _num(row[colSl]) : null,
        tp: colTp >= 0 ? _num(row[colTp]) : null
      };
      groupOrder.push(key);
    }

    var g  = groups[key];
    g.ben += ben;
    g.vol  = vol || g.vol;
    g.pc   = pc  || g.pc;
    if (row[colCi]) g.ciStr = String(row[colCi]).trim();
  }

  groupOrder.forEach(function(key) {
    var g      = groups[key];
    var fAp    = _parseDate(g.apStr);
    var fCi    = _parseDate(g.ciStr);
    var tipo   = (g.dir.includes('vend') || g.dir.includes('sell')) ? 'sell' : 'buy';
    var slValido = (g.sl !== null && g.sl !== 0 && Math.abs(g.sl - g.pe) > 0.00001);
    var puntos;
    if (slValido) {
      puntos = tipo === 'sell' ? +(g.sl - g.pe).toFixed(2) : +(g.pe - g.sl).toFixed(2);
    } else {
      puntos = tipo === 'sell' ? +(g.pe - g.pc).toFixed(2) : +(g.pc - g.pe).toFixed(2);
    }

    trades.push({
      fp: g.fp, ben: Math.round(g.ben * 100) / 100, vol: g.vol,
      pe: g.pe, pc: g.pc, puntos: Math.abs(puntos), ganadora: g.ben > 0,
      hora: fAp ? fAp.getHours() : 0, dia: fAp ? (fAp.getDay() + 6) % 7 : 0,
      durMin: _durMin(fAp, fCi), sl: g.sl, tp: g.tp, tipo: tipo
    });
  });

  return trades;
}
