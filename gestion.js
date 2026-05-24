// ============================================================
// LÓGICA DE MI GESTIÓN
// ============================================================

function gestTab(id) {
  ['trade-record','ciclo111','horarios','equity','cumplimiento','diario','historial'].forEach(function(p) {
    var el = document.getElementById('gpanel-' + p);
    if (el) el.style.display = 'none';
    var tb = document.getElementById('gtab-' + p);
    if (tb) tb.classList.remove('active');
  });
  var panel = document.getElementById('gpanel-' + id);
  if (panel) panel.style.display = 'block';
  var tab = document.getElementById('gtab-' + id);
  if (tab) tab.classList.add('active');
  if (id === 'trade-record') buildTradeRecord();
  if (id === 'horarios')     buildHorarios();
  if (id === 'ciclo111')     buildCicloDots();
  if (id === 'historial')    init_historial();
}

const yaBuilt = {};

function buildTradeRecord() {
  if (yaBuilt.tipos) return; yaBuilt.tipos = true;
  const tb = document.getElementById('gest-tipos-bars');
  if (tb) {
    const datos = [
      { l:'✦ Swing 4h–24h',  wr:75,   pnl:'+2.989$', t:16,  w:100, col:'linear-gradient(90deg,#C9A84C44,#E8C870)' },
      { l:'✦ Multi-día >24h', wr:100,  pnl:'+1.491$', t:2,   w:100, col:'#4ACC8A' },
      { l:'Scalping <30min',  wr:62.4, pnl:'+485$',   t:165, w:83,  col:'#6A8AEE55' },
      { l:'Intradía 30m–4h',  wr:56.3, pnl:'+202$',   t:71,  w:75,  col:'#CC554455' },
    ];
    tb.innerHTML = datos.map(d => `
      <div style="margin-bottom:.8rem;">
        <div style="display:flex;justify-content:space-between;margin-bottom:.3rem;">
          <span style="font-size:15px;color:${d.wr>=70?'var(--gold-bright)':'var(--text-dim)'};">${d.l}</span>
          <span style="font-size:13px;color:var(--text-muted);">${d.t}t · ${d.wr}% WR · ${d.pnl}</span>
        </div>
        <div style="height:4px;background:var(--border);border-radius:2px;">
          <div style="height:100%;width:${d.w}%;background:${d.col};border-radius:2px;"></div>
        </div>
      </div>
    `).join('');
  }
  const lt = document.getElementById('gest-lotajes-tabla');
  if (lt) {
    const lotes = [
      { l:'0.05', t:43, wr:41.9, pnl:'-928$',   bad:true },
      { l:'0.10', t:32, wr:75.0, pnl:'+918$' },
      { l:'0.11', t:72, wr:72.2, pnl:'+2.734$', best:true },
      { l:'0.20', t:45, wr:68.9, pnl:'+2.259$' },
      { l:'0.40', t:5,  wr:60.0, pnl:'+555$' },
      { l:'0.89', t:1,  wr:100,  pnl:'+1.378$', warn:true },
    ];
    lt.innerHTML = lotes.map(r => `
      <tr>
        <td style="font-family:'Cormorant Garamond',serif;font-size:17px;color:${r.best?'var(--gold-bright)':r.bad?'var(--red)':r.warn?'#CC8844':'var(--text)'};">${r.l}${r.best?' ✦':r.warn?' ⚠':''}</td>
        <td style="text-align:center;color:var(--text-muted);">${r.t}</td>
        <td style="text-align:center;color:${r.wr>=65?'var(--green)':r.wr>=50?'var(--gold)':'var(--red)'};">${r.wr}%</td>
        <td style="text-align:right;font-family:'Cormorant Garamond',serif;font-size:16px;color:${r.pnl.startsWith('+')?'var(--green)':'var(--red)'};">${r.pnl}</td>
      </tr>
    `).join('');
  }
}

function buildHorarios() {
  if (yaBuilt.horas) return; yaBuilt.horas = true;
  const hb = document.getElementById('gest-horas-barras');
  if (hb) {
    const horas = [
      {h:0,t:19,wr:63.2},{h:1,t:9,wr:33.3},{h:2,t:10,wr:40},{h:3,t:7,wr:71.4},
      {h:4,t:0,wr:0},{h:5,t:0,wr:0},{h:6,t:0,wr:0},{h:7,t:0,wr:0},{h:8,t:0,wr:0},
      {h:9,t:6,wr:16.7},{h:10,t:12,wr:91.7},{h:11,t:8,wr:62.5},{h:12,t:7,wr:57.1},
      {h:13,t:11,wr:81.8},{h:14,t:15,wr:46.7},{h:15,t:21,wr:81},{h:16,t:0,wr:0},
      {h:17,t:26,wr:69.2},{h:18,t:23,wr:65.2},{h:19,t:12,wr:58.3},{h:20,t:14,wr:64.3},
      {h:21,t:30,wr:56.7},{h:22,t:6,wr:50},{h:23,t:10,wr:60}
    ];
    const mx = Math.max(...horas.map(d => d.t));
    horas.forEach(d => {
      const col = document.createElement('div');
      col.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;';
      const ht = d.t === 0 ? 1 : Math.max(3, (d.t/mx)*85);
      const bg = d.t===0 ? 'var(--border)' : d.wr>=70 ? '#3AAA6A' : d.wr>=50 ? '#C9A84C44' : '#CC554466';
      col.innerHTML = `<div style="width:100%;height:${ht}px;background:${bg};border-radius:1px 1px 0 0;" title="${d.h}:xx · ${d.t} trades · WR ${d.wr}%"></div><div style="font-size:9px;color:var(--text-muted);margin-top:2px;">${d.h}</div>`;
      hb.appendChild(col);
    });
  }
  const ds = document.getElementById('gest-dias-semana');
  if (ds) {
    const dias = [
      { d:'Jueves',    wr:73.1, pnl:'+2.345$', best:true },
      { d:'Martes',    wr:67.5, pnl:'+2.011$', best:true },
      { d:'Viernes',   wr:55.6, pnl:'+914$' },
      { d:'Lunes',     wr:56.6, pnl:'+28$' },
      { d:'Miércoles', wr:57.6, pnl:'-130$',   bad:true },
    ];
    ds.innerHTML = dias.map(d => `
      <div style="display:flex;align-items:center;gap:.8rem;padding:.5rem 0;border-bottom:1px solid #0A0C14;">
        <span style="font-size:14px;width:85px;color:${d.best?'#C8BDA0':d.bad?'var(--red)':'var(--text-dim)'};">${d.best?'✦ ':d.bad?'⚠ ':''}${d.d}</span>
        <div style="flex:1;height:3px;background:var(--border);border-radius:2px;">
          <div style="height:100%;width:${d.wr}%;background:${d.best?'#4ACC8A':d.bad?'#CC554444':'#C9A84C44'};border-radius:2px;"></div>
        </div>
        <span style="font-size:13px;color:${d.best?'var(--green)':d.bad?'var(--red)':'var(--text-muted)'};width:115px;text-align:right;">${d.wr}% · ${d.pnl}</span>
      </div>
    `).join('');
  }
}

function buildCicloDots() {
  if (yaBuilt.dots) return; yaBuilt.dots = true;
  const cd = document.getElementById('gest-ciclo-dots');
  if (!cd) return;
  const arr = [];
  for (let i=0; i<71; i++) arr.push('w');
  for (let i=0; i<40; i++) arr.push('l');
  for (let i=arr.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
  cd.innerHTML = arr.map(x => `<div style="width:7px;height:7px;border-radius:50%;background:${x==='w'?'#3AAA6A':'#CC5544'};flex-shrink:0;${x==='w'?'box-shadow:0 0 3px #3AAA6A44':''}"></div>`).join('');
}

// Diario
function init_gestion() {
  const fechaEl = document.getElementById('diario-fecha-hoy');
  if (fechaEl) {
    const ahora = new Date();
    fechaEl.textContent = ahora.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }
  buildTradeRecord();
  buildCicloDots();
}

function guardarEntradaDiario() {
  const texto = document.getElementById('diario-input').value.trim();
  const msg   = document.getElementById('diario-msg');
  if (!texto) {
    msg.style.color = 'var(--red)';
    msg.textContent = 'Escribe algo antes de guardar.';
    return;
  }
  const ahora   = new Date();
  const fechaStr = ahora.toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' });
  const entradas = document.getElementById('diario-entradas');
  const nuevaEntrada = document.createElement('div');
  nuevaEntrada.style.cssText = 'background:var(--bg2);padding:1.5rem 2rem;position:relative;';
  nuevaEntrada.innerHTML = `
    <div style="position:absolute;top:0;left:0;bottom:0;width:2px;background:linear-gradient(to bottom,transparent,var(--gold),transparent);"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem;">
      <div style="font-size:12px;color:var(--gold-dim);">Hoy · ${fechaStr}</div>
      <div style="font-size:11px;color:var(--green);">✓ Guardada</div>
    </div>
    <div style="font-size:15px;color:var(--text-dim);line-height:1.8;">${texto}</div>
  `;
  entradas.insertBefore(nuevaEntrada, entradas.firstChild);
  document.getElementById('diario-input').value = '';
  if (typeof guardarEntradaDiarioSupabase === 'function') guardarEntradaDiarioSupabase(texto);
  msg.style.color = 'var(--green)';
  msg.textContent = '✓ Entrada guardada.';
  setTimeout(() => { msg.textContent = ''; }, 3000);
}

// ================================================================
