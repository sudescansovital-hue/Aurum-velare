// Parser MT5 + cTrader — Aurum Velare

function parsearTrades(raw) {
  if (!raw || raw.length < 8) return [];
  console.log("parsearTrades llamado, filas:", raw.length, "F0:", JSON.stringify(raw[0]), "F5:", JSON.stringify(raw[5]));
  const esCtrader =
    (raw[0]?.[0] && String(raw[0][0]).toLowerCase().includes('informe del historial')) ||
    (raw[5]?.[0] && String(raw[5][0]).trim() === 'Posiciones') ||
    (raw[6]?.[1] && String(raw[6][1]).trim() === 'Posición');
  console.log("esCtrader:", esCtrader);
  if (esCtrader) return _parsearCtrader(raw);
  else return _parsearMT5(raw);
}

function _num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.').replace(/\s/g, ''));
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

function _parsearCtrader(raw) {
  const trades = [];
  const INICIO = 7;
  for (let i = INICIO; i < raw.length; i++) {
    const row = raw[i];
    const volStr = row[4] != null ? String(row[4]) : '';
    if (volStr.includes('/')) break;
    if (!row[0]) break;
    if (!_esXauusd(row[2])) continue;
    const tipo = String(row[3] ?? '').toLowerCase().trim();
    const vol  = _num(volStr);
    const pe   = _num(row[5]);
    const pc   = _num(row[9]);
    const comision = _num(row[10]) ?? 0;
    const swap = _num(row[11]) ?? 0;
    const ben  = _num(row[12]);
    if (ben === null || pe === null || pc === null) continue;
    const puntos = tipo === 'buy' ? +(pc - pe).toFixed(2) : +(pe - pc).toFixed(2);
    const fApertura = _fechaCtrader(row[0]);
    const fCierre   = _fechaCtrader(row[8]);
    const posicionId = row[1] != null ? String(row[1]) : '';
    const fp = posicionId + '_' + pe + '_' + ben;
    const hora = fApertura ? fApertura.getHours() : 0;
    const dia  = fApertura ? (fApertura.getDay() + 6) % 7 : 0;
    const durMin = (fApertura && fCierre) ? Math.round((fCierre - fApertura) / 60000) : 60;
    trades.push({ fp, ben, vol, pe, pc, puntos: Math.abs(puntos), ganadora: ben > 0, hora, dia, durMin });
  }
  return trades;
}

function _parsearMT5(raw) {
  const trades = [];
  let headerRow = -1;
  let colSym=-1,colTipo=-1,colVol=-1,colPe=-1,colPc=-1,colBen=-1,colAp=-1,colCi=-1;
  for (let r = 0; r < raw.length; r++) {
    const row = raw[r].map(h => String(h || '').toLowerCase().trim());
    const sIdx = row.findIndex(h => h === 'símbolo' || h === 'simbolo' || h === 'symbol');
    if (sIdx >= 0) {
      headerRow = r; colSym = sIdx;
      colTipo = row.findIndex(h => h === 'tipo' || h === 'type');
      colVol  = row.findIndex(h => h.includes('volum'));
      colPe   = row.findIndex(h => h === 'precio' || h === 'price' || h === 'open price');
      colBen  = row.findIndex(h => h === 'beneficio' || h === 'profit');
      colAp   = row.findIndex(h => h === 'fecha/hora' || h === 'open time' || h === 'time');
      const precioIdxs = row.reduce((acc,h,i) => { if(h==='precio'||h==='price') acc.push(i); return acc; }, []);
      colPc = precioIdxs.length > 1 ? precioIdxs[1] : colBen - 1;
      const fechaIdxs = row.reduce((acc,h,i) => { if(h==='fecha/hora'||h==='time'||h==='close time') acc.push(i); return acc; }, []);
      colCi = fechaIdxs.length > 1 ? fechaIdxs[1] : colAp;
      break;
    }
  }
  if (headerRow === -1) {
    for (let r = 0; r < raw.length; r++) {
      const sym = String(raw[r][2] || '').toUpperCase();
      if (sym.includes('XAU') || sym.includes('GOLD')) {
        headerRow = r-1; colAp=0; colSym=2; colTipo=3; colVol=4; colPe=5; colCi=8; colPc=9; colBen=12; break;
      }
    }
  }
  if (headerRow === -1) return [];
  function toNum(v) { if(v===null||v===undefined||v==='') return NaN; if(typeof v==='number') return v; return parseFloat(String(v).replace(',','.').trim()); }
  function toDate(v) { if(!v) return null; if(v instanceof Date) return v; const s=String(v).trim(); const m=s.match(/(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/); if(m) return new Date(m[1],m[2]-1,m[3],m[4],m[5],m[6]); return new Date(s); }
  for (let i = headerRow+1; i < raw.length; i++) {
    const row = raw[i];
    const sym = String(row[colSym]||'').toUpperCase().trim();
    if (!sym.includes('XAU') && !sym.includes('GOLD')) continue;
    const tipo = String(row[colTipo]||'').toLowerCase().trim();
    if (tipo && tipo!=='buy' && tipo!=='sell' && tipo!=='compra' && tipo!=='venta') continue;
    const ben=toNum(row[colBen]), vol=toNum(row[colVol]), pe=toNum(row[colPe]), pc=toNum(row[colPc]);
    if (isNaN(ben)||isNaN(vol)||vol===0) continue;
    const apDt=toDate(row[colAp]), ciDt=toDate(row[colCi]);
    let hora=0, dia=1, durMin=60;
    if (apDt&&!isNaN(apDt)) { hora=apDt.getHours(); dia=(apDt.getDay()+6)%7; if(ciDt&&!isNaN(ciDt)) durMin=(ciDt-apDt)/60000; }
    const fp = String(row[1]||'')+'_'+String(row[colAp]||'')+'_'+pe+'_'+vol;
    trades.push({ fp, ben, vol, pe, pc:isNaN(pc)?pe:pc, puntos:Math.abs((isNaN(pc)?pe:pc)-pe), ganadora:ben>0, hora, dia, durMin });
  }
  return trades;
}


function calcularMetricas(trades) {
  const total  = trades.length;
  const wins   = trades.filter(t => t.ganadora).length;
  const losses = total - wins;
  const wr     = wins / total * 100;
  const pnl    = trades.reduce((s, t) => s + t.ben, 0);

  const ptsW   = wins > 0 ? trades.filter(t => t.ganadora).reduce((s,t)=>s+t.puntos,0)/wins : 0;
  const ptsL   = losses > 0 ? trades.filter(t=>!t.ganadora).reduce((s,t)=>s+t.puntos,0)/losses : 0;
  const rr     = ptsL > 0 ? ptsW/ptsL : 0;
  const esp    = (wr/100*ptsW) - ((1-wr/100)*ptsL);

  const maxWin  = Math.max(...trades.map(t=>t.ben));
  const maxLoss = Math.min(...trades.map(t=>t.ben));

  // Por tipo
  const tipos = {
    scalp:  trades.filter(t=>t.durMin<30),
    intra:  trades.filter(t=>t.durMin>=30&&t.durMin<240),
    swing:  trades.filter(t=>t.durMin>=240&&t.durMin<1440),
    multi:  trades.filter(t=>t.durMin>=1440),
  };

  // Equity acumulada
  let acc = 0;
  const equity = trades.map(t=>{acc+=t.ben;return acc;});

  // Score
  let score = 0;
  if (wr >= 60) score+=25; else if (wr >= 55) score+=18; else if (wr >= 50) score+=12; else if (wr >= 45) score+=6;
  if (rr >= 1.8) score+=25; else if (rr >= 1.5) score+=18; else if (rr >= 1.2) score+=12; else if (rr >= 1.0) score+=6;
  if (esp > 0) score+=20; else if (esp > -2) score+=8;
  if (total >= 111) score+=15; else if (total >= 50) score+=8;
  if (pnl > 0) score+=15; else if (pnl > -200) score+=5;

  return { total, wins, losses, wr, pnl, ptsW, ptsL, rr, esp, maxWin, maxLoss, tipos, equity, score };
}
