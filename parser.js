// Parser MT5 + cTrader — Aurum Velare v2
// Detección por contenido, nunca por número de fila

function parsearTrades(raw) {
  console.log('[PARSER] filas recibidas:', raw ? raw.length : 0);
  if (!raw || raw.length < 2) return [];

  function norm(v) { return String(v||'').normalize('NFC').replace(/[\r\n\t]+/g,' ').toLowerCase().trim(); }

  // ── Detección MT5 ──────────────────────────────────────────────
  // Busca celda que diga exactamente "Posiciones" en las primeras 20 filas
  var mt5PosRow = -1;
  for (var r = 0; r < Math.min(raw.length, 20); r++) {
    var row = raw[r] || [];
    for (var c = 0; c < row.length; c++) {
      if (String(row[c] || '').trim() === 'Posiciones') {
        mt5PosRow = r;
        break;
      }
    }
    if (mt5PosRow >= 0) break;
  }

  // ── Detección cTrader ──────────────────────────────────────────
  // Busca la fila que tenga "hora de apertura" y "hora de cierre" como cabeceras
  var ctHeaderRow = -1;
  for (var r = 0; r < raw.length; r++) {
    var rn = (raw[r] || []).map(norm);
    var tieneAp = rn.some(function(h) { return h.includes('hora de apertura') || h.includes('open time'); });
    var tieneCi = rn.some(function(h) { return h.includes('hora de cierre')   || h.includes('close time'); });
    if (tieneAp && tieneCi && (raw[r]||[]).length < 50) { ctHeaderRow = r; break; }
  }

  console.log('[PARSER] ctHeaderRow:', ctHeaderRow, '| fila:', JSON.stringify((raw[ctHeaderRow]||[]).slice(0,5)));
  console.log('[PARSER] mt5PosRow:', mt5PosRow, '| ctHeaderRow:', ctHeaderRow);

  if (mt5PosRow >= 0)  return _parsearMT5(raw, mt5PosRow);
  if (ctHeaderRow >= 0) return _parsearCtrader(raw, ctHeaderRow);

  console.warn('[PARSER] Formato no reconocido');
  return [];
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
  // dd/mm/yyyy HH:MM:SS
  var m = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5], +m[6]);
  // yyyy.mm.dd HH:MM:SS  (MT5)
  m = s.match(/(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]);
  // yyyy-mm-dd HH:MM:SS
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
  var trades = [];

  // La fila siguiente a "Posiciones" es la cabecera de columnas
  var headerRow = posicionesRow + 1;
  if (headerRow >= raw.length) return trades;

  var headers = (raw[headerRow] || []).map(function(h) {
    return String(h || '').normalize('NFC').toLowerCase().trim();
  });

  // "Precio" aparece dos veces (entrada y cierre), "Fecha/Hora" también
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

  for (var i = headerRow + 1; i < raw.length; i++) {
    var row = raw[i] || [];

    // Parar al llegar a la sección de Órdenes o Transacciones
    for (var c = 0; c < row.length; c++) {
      var cell = String(row[c] || '').trim();
      if (cell === 'Órdenes' || cell === 'Ordenes' || cell === 'Transacciones') return trades;
    }

    if (colSym < 0 || !row[colSym]) continue;
    if (!_esXauusd(row[colSym])) continue;

    var tipo = String(row[colTipo] || '').toLowerCase().trim();
    if (tipo && tipo !== 'buy' && tipo !== 'sell' && tipo !== 'compra' && tipo !== 'venta') continue;

    var ben = _num(row[colBen]);
    var vol = _num(row[colVol]);
    var pe  = _num(row[colPe]);
    var pc  = _num(row[colPc]);

    if (ben === null || vol === null || vol === 0) continue;
    if (pe === null || pe < 100 || pe > 50000) continue;
    if (Math.abs(ben) > 50000) continue;
    if (vol > 100) continue;

    var sl = colSl >= 0 ? _num(row[colSl]) : null;
    var tp = colTp >= 0 ? _num(row[colTp]) : null;

    var fAp = _parseDate(row[colAp]);
    var fCi = _parseDate(row[colCi]);
    var hora = fAp ? fAp.getHours() : 0;
    var dia  = fAp ? (fAp.getDay() + 6) % 7 : 0;

    // fp = ID de posición (único por trade en MT5)
    var posId = colPos >= 0 && row[colPos] ? String(row[colPos]) : '';
    var fp = posId || (String(row[colAp] || '') + '_' + pe + '_' + vol);

    var pcFinal = pc !== null ? pc : pe;
    var puntos  = tipo === 'sell' ? +(pe - pcFinal).toFixed(2) : +(pcFinal - pe).toFixed(2);

    trades.push({
      fp:       fp,
      ben:      ben,
      vol:      vol,
      pe:       pe,
      pc:       pcFinal,
      puntos:   Math.abs(puntos),
      ganadora: ben > 0,
      hora:     hora,
      dia:      dia,
      durMin:   _durMin(fAp, fCi),
      sl:       sl,
      tp:       tp
    });
  }
  return trades;
}

// ── Parser cTrader ────────────────────────────────────────────────
// Agrupa cierres parciales: misma (Hora apertura + Dirección + Precio entrada) = misma posición
function _parsearCtrader(raw, headerRow) {
  var trades = [];

  var headers = (raw[headerRow] || []).map(function(h) {
    return String(h || '').normalize('NFC').toLowerCase().trim();
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

  // Agrupar filas por posición
  var groups = {};
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
        fp:    key,
        apStr: apStr,
        ciStr: String(row[colCi] || '').trim(),
        dir:   dirStr,
        pe:    pe,
        vol:   vol || 0,
        ben:   0,
        pc:    pc || pe,
        sl:    colSl  >= 0 ? _num(row[colSl])  : null,
        tp:    colTp  >= 0 ? _num(row[colTp])  : null
      };
      groupOrder.push(key);
    }

    var g  = groups[key];
    g.ben += ben;
    g.vol  = vol || g.vol;  // quedarse con el último lote
    g.pc   = pc  || g.pc;
    // actualizar hora de cierre con la última fila del grupo
    if (row[colCi]) g.ciStr = String(row[colCi]).trim();
  }

  groupOrder.forEach(function(key) {
    var g   = groups[key];
    var fAp = _parseDate(g.apStr);
    var fCi = _parseDate(g.ciStr);

    var tipo   = (g.dir.includes('vend') || g.dir.includes('sell')) ? 'sell' : 'buy';
    var puntos = tipo === 'sell' ? +(g.pe - g.pc).toFixed(2) : +(g.pc - g.pe).toFixed(2);

    trades.push({
      fp:       g.fp,
      ben:      Math.round(g.ben * 100) / 100,
      vol:      g.vol,
      pe:       g.pe,
      pc:       g.pc,
      puntos:   Math.abs(puntos),
      ganadora: g.ben > 0,
      hora:     fAp ? fAp.getHours() : 0,
      dia:      fAp ? (fAp.getDay() + 6) % 7 : 0,
      durMin:   _durMin(fAp, fCi),
      sl:       g.sl,
      tp:       g.tp
    });
  });

  return trades;
}
