// ============================================================
// LÓGICA DE VISTAS POR CUENTA
// ============================================================

const cuentasBuilt = {};

function verCuenta(cuenta) {
  // Ocultar todas las vistas
  ['global','maestra','retos','prueba'].forEach(c => {
    const el = document.getElementById('vista-' + c);
    if (el) el.style.display = 'none';
    const btn = document.getElementById('btn-' + c);
    if (btn) btn.style.borderBottomColor = 'transparent';
  });

  // Mostrar la seleccionada
  const vista = document.getElementById('vista-' + cuenta);
  if (vista) vista.style.display = 'block';

  const btn = document.getElementById('btn-' + cuenta);
  if (btn) {
    const colores = { global:'var(--gold)', maestra:'var(--green)', retos:'#CC8844', prueba:'#4A8AEE' };
    btn.style.borderBottomColor = colores[cuenta] || 'var(--gold)';
    btn.style.background = 'linear-gradient(135deg,var(--bg2),#0E1020)';
  }

  // Construir gráficos si es la primera vez
  if (!cuentasBuilt[cuenta]) {
    cuentasBuilt[cuenta] = true;
    if (cuenta === 'global')  buildGlobal();
    if (cuenta === 'maestra') buildCuenta('maestra');
    if (cuenta === 'retos')   buildCuenta('retos');
    if (cuenta === 'prueba')  buildCuenta('prueba');
  }
}

const datosCuentas = {
  maestra: {
    tipos: [
      { l:'Scalping <30min',  t:26, wr:62, pnl:-192,  col:'#6A8AEE44' },
      { l:'Intradía 30m–4h',  t:17, wr:59, pnl:823,   col:'#C9A84C44' },
      { l:'✦ Swing 4h–24h',   t:8,  wr:75, pnl:712,   col:'linear-gradient(90deg,#C9A84C44,#E8C870)' },
      { l:'Multi-día >24h',   t:1,  wr:0,  pnl:-199,  col:'#CC554455' },
    ],
    dias: [
      { d:'Lunes',     wr:57, pnl:1187,  t:14 },
      { d:'Martes',    wr:100,pnl:473,   t:4,  best:true },
      { d:'Miércoles', wr:67, pnl:347,   t:15 },
      { d:'Jueves',    wr:75, pnl:-105,  t:8 },
      { d:'Viernes',   wr:36, pnl:-758,  t:11, bad:true },
    ]
  },
  retos: {
    tipos: [
      { l:'Scalping <30min',  t:16, wr:75,  pnl:361,  col:'#C9A84C44' },
      { l:'Intradía 30m–4h',  t:11, wr:82,  pnl:99,   col:'#C9A84C44' },
      { l:'✦ Swing 4h–24h',   t:6,  wr:100, pnl:1355, col:'linear-gradient(90deg,#C9A84C44,#E8C870)' },
    ],
    dias: [
      { d:'Lunes',     wr:88, pnl:814, t:8,  best:true },
      { d:'Martes',    wr:71, pnl:303, t:14 },
      { d:'Miércoles', wr:100,pnl:206, t:4,  best:true },
      { d:'Jueves',    wr:100,pnl:254, t:3,  best:true },
      { d:'Viernes',   wr:75, pnl:239, t:4 },
    ]
  },
  prueba: {
    tipos: [
      { l:'Scalping <30min', t:83, wr:60, pnl:-52,  col:'#6A8AEE44' },
      { l:'Intradía 30m–4h', t:61, wr:54, pnl:-312, col:'#C9A84C44' },
      { l:'✦ Swing 4h–24h',  t:13, wr:69, pnl:1519, col:'linear-gradient(90deg,#C9A84C44,#E8C870)' },
      { l:'Multi-día >24h',  t:1,  wr:100,pnl:410,  col:'#4ACC8A' },
    ],
    dias: [
      { d:'Lunes',     wr:54, pnl:-314,  t:35 },
      { d:'Martes',    wr:39, pnl:-2138, t:31, bad:true },
      { d:'Miércoles', wr:62, pnl:433,   t:24 },
      { d:'Jueves',    wr:67, pnl:652,   t:21 },
      { d:'Viernes',   wr:69, pnl:2152,  t:35, best:true },
    ]
  }
};

function buildCuenta(cuenta) {
  const datos = datosCuentas[cuenta];
  if (!datos) return;

  // Tipos
  const tb = document.getElementById('tipos-' + cuenta);
  if (tb) {
    const maxPnl = Math.max(...datos.tipos.map(d => Math.abs(d.pnl)));
    tb.innerHTML = datos.tipos.map(d => `
      <div style="margin-bottom:.8rem;">
        <div style="display:flex;justify-content:space-between;margin-bottom:.3rem;">
          <span style="font-size:14px;color:${d.wr>=70?'var(--gold-bright)':'var(--text-dim)'};">${d.l}</span>
          <span style="font-size:12px;color:var(--text-muted);">${d.t}t · ${d.wr}% · ${d.pnl>=0?'+':''}${d.pnl}$</span>
        </div>
        <div style="height:4px;background:var(--border);border-radius:2px;">
          <div style="height:100%;width:${Math.round(d.t/datos.tipos.reduce((s,x)=>s+x.t,0)*100)}%;background:${d.col};border-radius:2px;"></div>
        </div>
      </div>
    `).join('');
  }

  // Días
  const db = document.getElementById('dias-' + cuenta);
  if (db) {
    db.innerHTML = datos.dias.map(d => `
      <div style="display:flex;align-items:center;gap:.8rem;padding:.5rem 0;border-bottom:1px solid #0A0C14;">
        <span style="font-size:14px;width:85px;color:${d.best?'#C8BDA0':d.bad?'var(--red)':'var(--text-dim)'};">${d.best?'✦ ':d.bad?'⚠ ':''}${d.d}</span>
        <div style="flex:1;height:3px;background:var(--border);border-radius:2px;">
          <div style="height:100%;width:${d.wr}%;background:${d.best?'#4ACC8A':d.bad?'#CC554444':'#C9A84C44'};border-radius:2px;"></div>
        </div>
        <span style="font-size:12px;color:${d.best?'var(--green)':d.bad?'var(--red)':'var(--text-muted)'};width:115px;text-align:right;">${d.wr}% · ${d.pnl>=0?'+':''}${d.pnl}$</span>
      </div>
    `).join('');
  }
}

function buildGlobal() {
  const comp = document.getElementById('global-comparativa');
  if (!comp) return;
  const tipos = ['Scalping <30min','Intradía 30m–4h','✦ Swing 4h–24h','Multi-día >24h'];
  const mData = { 'Scalping <30min':{wr:62,pnl:-192}, 'Intradía 30m–4h':{wr:59,pnl:823}, '✦ Swing 4h–24h':{wr:75,pnl:712}, 'Multi-día >24h':{wr:0,pnl:-199} };
  const pData = { 'Scalping <30min':{wr:60,pnl:-52},  'Intradía 30m–4h':{wr:54,pnl:-312},'✦ Swing 4h–24h':{wr:69,pnl:1519},'Multi-día >24h':{wr:100,pnl:410} };

  comp.innerHTML = tipos.map(tipo => {
    const m = mData[tipo];
    const p = pData[tipo];
    if (!m && !p) return '';
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--border);margin-bottom:1px;">
        <div style="background:var(--bg2);padding:.5rem .8rem;font-size:13px;color:${tipo.includes('✦')?'var(--gold-bright)':'var(--text-dim)'};">${tipo}</div>
        <div style="background:var(--bg2);padding:.5rem;text-align:center;font-size:12px;color:${m&&m.wr>=65?'var(--green)':'var(--text-muted)'};">${m?m.wr+'% · '+(m.pnl>=0?'+':'')+m.pnl+'$':'—'}</div>
        <div style="background:var(--bg2);padding:.5rem;text-align:center;font-size:12px;color:${p&&p.wr>=65?'#6A9AEE':'var(--text-muted)'};">${p?p.wr+'% · '+(p.pnl>=0?'+':'')+p.pnl+'$':'—'}</div>
      </div>
    `;
  }).join('');
}

// Inicializar con vista global
document.addEventListener('DOMContentLoaded', () => {
  buildGlobal();
});
