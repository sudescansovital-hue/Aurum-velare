// Parser MT5 + cTrader — Aurum Velare

function parsearTrades(raw) {
  console.log('[PARSER] llamado con filas:', raw ? raw.length : 0);
  if (!raw || raw.length < 2) return [];

  function norm(v) { return String(v||'').normalize('NFC').toLowerCase().trim(); }
  function rowNorm(r) { return (r||[]).map(norm); }

  // 1. MT5: alguna fila en las primeras 10 contiene "fecha/hora" u "open time" como cabecera
  var esMT5 = raw.slice(0, 10).some(function(fila) {
    return rowNorm(fila).some(function(h) {
      return h === 'fecha/hora' || h === 'open time' || h === 'time';
    });
  });

  // 2. cTrader clásico: fila 0 contiene "informe del historial" Y alguna fila contiene columna "dirección"/"direction"
  var fila0 = norm(raw[0]?.[0] || '');
  var tieneInforme = fila0.includes('informe del historial');
  var tieneDireccion = raw.slice(0, 12).some(function(fila) {
    return rowNorm(fila).some(function(h) {
      return h.includes('direcci') || h === 'direction';
    });
  });
  var esCtraderClasico = tieneInforme && tieneDireccion;

  console.log('[PARSER] esMT5:', esMT5, '| esCtraderClasico:', esCtraderClasico, '| fila0:', fila0.slice(0,40));

  if (esMT5)           return _parsearMT5(raw);
  if (esCtraderClasico) return _parsearCtrader(raw);
  return _parsearCtraderNuevo(raw);
}

function _num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

function _esXauusd(simbolo) {
  if (!simbolo) return false;
  const s = String(simbolo).toUpperCase().replace(/[^A-Z]/g, '');
  return s.includes('XAU') || s.includes('GOLD');
}

function _fechaCtrader(val) {
  if (!val) return null;
  const s = String(val).replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3');
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// Parser cTrader NUEVO formato (columnas: Símbolo, Dirección, Hora apertura, Hora cierre, Precio entrada, Precio cierre, Qty, Vol, $ neto, Saldo)
function _parsearCtraderNuevo(raw) {
  var trades = [];
  // Encontrar fila de cabecera
  var headerRow = -1;
  var colSim=-1, colDir=-1, colAp=-1, colCi=-1, colPe=-1, colPc=-1, colVol=-1, colNeto=-1, colPosicion=-1;

  for (var r = 0; r < Math.min(raw.length, 10); r++) {
    var row = (raw[r] || []).map(function(c){ return String(c||'').normalize('NFC').toLowerCase().trim(); });
    var simIdx = row.findIndex(function(h){ return h === 'símbolo' || h === 'simbolo' || h === 'symbol' || h === 'instrument'; });
    if (simIdx >= 0) {
      headerRow = r;
      colSim      = simIdx;
      colDir      = row.findIndex(function(h){ return h.includes('direcci') || h === 'direction' || h === 'type'; });
      colAp       = row.findIndex(function(h){ return (h.includes('apertura') && h.includes('hora')) || (h.includes('open') && h.includes('time')); });
      colCi       = row.findIndex(function(h){ return (h.includes('cierre') && h.includes('hora')) || (h.includes('close') && h.includes('time')); });
      colPe       = row.findIndex(function(h){ return h.includes('entrada') || (h.includes('open') && h.includes('price')) || h === 'entry price'; });
      colPc       = row.findIndex(function(h){ return (h.includes('cierre') && h.includes('precio')) || (h.includes('close') && h.includes('price')) || h === 'exit price'; });
      colVol      = row.findIndex(function(h){ return h.includes('volumen') || h === 'vol' || h.includes('vol.') || h === 'lots' || h === 'quantity' || h.includes('qty') || h.includes('cantidad'); });
      colNeto     = row.findIndex(function(h){ return h.includes('neto') || h === '$ neto' || h === 'net profit' || h === 'profit'; });
      colPosicion = row.findIndex(function(h){ return h.includes('posici') || h === 'id' || h.includes('ticket') || h.includes('position'); });
      break;
    }
  }

  if (headerRow === -1) {
    // Intentar formato posicional: col0=Símbolo, col1=Dirección, col2=HoraAp, col3=HoraCi, col4=PE, col5=PC, col6=Qty, col7=Vol, col8=Neto
    headerRow = 0;
    colSim=0; colDir=1; colAp=2; colCi=3; colPe=4; colPc=5; colVol=7; colNeto=8;
  }

  function parseDate(val) {
    if (!val) return null;
    var s = String(val).trim();
    // formato dd/mm/yyyy HH:MM:SS
    var m = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (m) return new Date(m[3], m[2]-1, m[1], m[4], m[5], m[6]);
    // formato yyyy-mm-dd HH:MM:SS
    return new Date(s);
  }

  for (var i = headerRow + 1; i < raw.length; i++) {
    var row = raw[i];
    if (!row || !row[colSim]) continue;
    if (!_esXauusd(row[colSim])) continue;

    var dir = String(row[colDir]||'').toLowerCase();
    var tipo = dir.includes('vend') || dir.includes('sell') ? 'sell' : 'buy';
    var pe   = _num(row[colPe]);
    var pc   = _num(row[colPc]);
    var vol  = _num(row[colVol]);
    var ben  = _num(row[colNeto]);

    if (ben === null || pe === null || pc === null) continue;

    var fAp = parseDate(row[colAp]);
    var fCi = parseDate(row[colCi]);

    var puntos = tipo === 'buy' ? +(pc - pe).toFixed(2) : +(pe - pc).toFixed(2);
    var hora   = fAp ? fAp.getHours() : 0;
    var dia    = fAp ? (fAp.getDay() + 6) % 7 : 0;
    var durMin = (fAp && fCi) ? Math.round((fCi - fAp) / 60000) : 60;
    var posicionId = colPosicion >= 0 && row[colPosicion] ? String(row[colPosicion]) : '';
    var fp = (posicionId || (fAp ? fAp.getTime() : String(i))) + '_' + pe + '_' + ben;

    trades.push({ fp, ben, vol, pe, pc, puntos: Math.abs(puntos), ganadora: ben > 0, hora, dia, durMin });
  }
  return trades;
}

// Parser cTrader CLÁSICO
function _parsearCtrader(raw) {
  var trades = [];
  var INICIO = 8;
  for (var i = INICIO; i < raw.length; i++) {
    var row = raw[i];
    var volStr = row[4] != null ? String(row[4]) : '';
    if (volStr.includes('/')) break;
    if (!row[0]) break;
    if (!_esXauusd(row[2])) continue;
    var tipo = String(row[3]||'').toLowerCase().trim();
    var vol  = _num(volStr);
    var pe   = _num(row[5]);
    var sl   = _num(row[6]);
    var tp   = _num(row[7]);
    var pc   = _num(row[9]);
    var ben  = _num(row[12]);
    if (ben === null || pe === null || pc === null) continue;
    var puntos = tipo === 'buy' ? +(pc - pe).toFixed(2) : +(pe - pc).toFixed(2);
    var fAp = _fechaCtrader(row[0]);
    var fCi = _fechaCtrader(row[8]);
    var posicionId = row[1] != null ? String(row[1]) : '';
    var fp = posicionId + '_' + pe + '_' + ben;
    var hora = fAp ? fAp.getHours() : 0;
    var dia  = fAp ? (fAp.getDay() + 6) % 7 : 0;
    var durMin = (fAp && fCi) ? Math.round((fCi - fAp) / 60000) : 60;
    trades.push({ fp, ben, vol, pe, pc, puntos: Math.abs(puntos), ganadora: ben > 0, hora, dia, durMin, sl, tp });
  }
  return trades;
}

// Parser MT5
function _parsearMT5(raw) {
  var trades = [];
  var headerRow=-1, colSym=-1, colTipo=-1, colVol=-1, colPe=-1, colPc=-1, colBen=-1, colAp=-1, colCi=-1, colSl=-1, colTp=-1;
  for (var r = 0; r < raw.length; r++) {
    var row = raw[r].map(function(h){ return String(h||'').toLowerCase().trim(); });
    var sIdx = row.findIndex(function(h){ return h==='símbolo'||h==='simbolo'||h==='symbol'; });
    if (sIdx >= 0) {
      headerRow=r; colSym=sIdx;
      colTipo = row.findIndex(function(h){ return h==='tipo'||h==='type'; });
      colVol  = row.findIndex(function(h){ return h.includes('volum'); });
      colPe   = row.findIndex(function(h){ return h==='precio'||h==='price'||h==='open price'; });
      colBen  = row.findIndex(function(h){ return h==='beneficio'||h==='profit'; });
      colAp   = row.findIndex(function(h){ return h==='fecha/hora'||h==='open time'||h==='time'; });
      colSl   = row.findIndex(function(h){ return h==='s / l'||h==='sl'||h==='stop loss'||h==='s/l'; });
      colTp   = row.findIndex(function(h){ return h==='t / p'||h==='tp'||h==='take profit'||h==='t/p'; });
      var precioIdxs = row.reduce(function(acc,h,i){ if(h==='precio'||h==='price') acc.push(i); return acc; }, []);
      colPc = precioIdxs.length>1 ? precioIdxs[1] : colBen-1;
      var fechaIdxs = row.reduce(function(acc,h,i){ if(h==='fecha/hora'||h==='time'||h==='close time') acc.push(i); return acc; }, []);
      colCi = fechaIdxs.length>1 ? fechaIdxs[1] : colAp;
      break;
    }
  }
  if (headerRow===-1) {
    for (var r=0; r<raw.length; r++) {
      var sym=String(raw[r][2]||'').toUpperCase();
      if (sym.includes('XAU')||sym.includes('GOLD')) { headerRow=r-1;colAp=0;colSym=2;colTipo=3;colVol=4;colPe=5;colSl=6;colTp=7;colCi=8;colPc=9;colBen=12;break; }
    }
  }
  if (headerRow===-1) return [];
  function toNum(v){ if(v===null||v===undefined||v==='') return NaN; if(typeof v==='number') return v; return parseFloat(String(v).replace(',','.').trim()); }
  function toDate(v){ if(!v) return null; if(v instanceof Date) return v; var s=String(v).trim(); var m=s.match(/(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/); if(m) return new Date(m[1],m[2]-1,m[3],m[4],m[5],m[6]); return new Date(s); }
  for (var i=headerRow+1; i<raw.length; i++) {
    var row=raw[i];
    var sym=String(row[colSym]||'').toUpperCase().trim();
    if(!sym.includes('XAU')&&!sym.includes('GOLD')) continue;
    var tipo=String(row[colTipo]||'').toLowerCase().trim();
    if(tipo&&tipo!=='buy'&&tipo!=='sell'&&tipo!=='compra'&&tipo!=='venta') continue;
    var ben=toNum(row[colBen]),vol=toNum(row[colVol]),pe=toNum(row[colPe]),pc=toNum(row[colPc]);
    if(isNaN(ben)||isNaN(vol)||vol===0) continue;
    var sl=colSl>=0?toNum(row[colSl]):NaN;
    var tp=colTp>=0?toNum(row[colTp]):NaN;
    var apDt=toDate(row[colAp]),ciDt=toDate(row[colCi]);
    var hora=0,dia=1,durMin=60;
    if(apDt&&!isNaN(apDt)){ hora=apDt.getHours(); dia=(apDt.getDay()+6)%7; if(ciDt&&!isNaN(ciDt)) durMin=(ciDt-apDt)/60000; }
    var fp=String(row[1]||'')+'_'+String(row[colAp]||'')+'_'+pe+'_'+vol;
    trades.push({ fp, ben, vol, pe, pc:isNaN(pc)?pe:pc, puntos:Math.abs((isNaN(pc)?pe:pc)-pe), ganadora:ben>0, hora, dia, durMin, sl:isNaN(sl)?null:sl, tp:isNaN(tp)?null:tp });
  }
  return trades;
}
