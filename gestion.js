// ============================================================
// LÓGICA DE MI GESTIÓN — datos reales de Supabase
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
  if (id === 'equity')       buildEquity();
  if (id === 'cumplimiento') buildCumplimiento();
  if (id === 'historial')    init_historial();
}

function getTodos() {
  var cuenta = window.cuentaActivaGestion || 'global';
  if (!window.AURUM_TRADES) return [];
  if (cuenta === 'global') return window.AURUM_TRADES.todos || [];
  var mapa = { maestra:'Cuenta Maestra', retos:'Cuenta Retos', prueba:'Cuenta Prueba' };
  var nombreCuenta = mapa[cuenta];
  if (!nombreCuenta) return window.AURUM_TRADES.todos || [];
  return (window.AURUM_TRADES.todos || []).filter(function(t){ return t.cuenta === nombreCuenta; });
}

function buildTradeRecord() {
  var trades = getTodos();
  var tb = document.getElementById('gest-tipos-bars');
  if (tb && trades.length) {
    var tipos = window.AURUM_TRADES.tipos || [];
    var maxT = Math.max.apply(null, tipos.map(function(d){ return d.t; })) || 1;
    tb.innerHTML = tipos.map(function(d) {
      var col = d.l.includes('Swing') ? 'linear-gradient(90deg,#C9A84C44,#E8C870)' : d.l.includes('Multi') ? '#4ACC8A' : d.l.includes('Scalp') ? '#6A8AEE55' : '#CC554455';
      return '<div style="margin-bottom:.8rem;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:.3rem;">' +
        '<span style="font-size:15px;color:'+(d.wr>=70?'var(--gold-bright)':'var(--text-dim)')+';">'+d.l+'</span>' +
        '<span style="font-size:13px;color:var(--text-muted);">'+d.t+'t · '+d.wr+'% WR · '+(d.pnl>=0?'+':'')+d.pnl+'$</span></div>' +
        '<div style="height:4px;background:var(--border);border-radius:2px;">' +
        '<div style="height:100%;width:'+Math.round(d.t/maxT*100)+'%;background:'+col+';border-radius:2px;"></div></div></div>';
    }).join('');
  }
}

function buildHorarios() {
  var trades = getTodos();
  var hb = document.getElementById('gest-horas-barras');
  if (hb && trades.length) {
    hb.innerHTML = '';
    var porHora = {};
    for (var h = 0; h < 24; h++) porHora[h] = {t:0, w:0};
    trades.forEach(function(t) {
      var h = Math.floor(t.hora || 0);
      if (h >= 0 && h < 24) { porHora[h].t++; if(t.ganadora) porHora[h].w++; }
    });
    var mx = Math.max.apply(null, Object.values(porHora).map(function(d){ return d.t; })) || 1;
    for (var h = 0; h < 24; h++) {
      var d = porHora[h];
      var wr = d.t > 0 ? Math.round(d.w/d.t*100) : 0;
      var col = document.createElement('div');
      col.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;';
      var ht = d.t === 0 ? 1 : Math.max(3, (d.t/mx)*85);
      var bg = d.t===0 ? 'var(--border)' : wr>=70 ? '#3AAA6A' : wr>=50 ? '#C9A84C44' : '#CC554466';
      col.innerHTML = '<div style="width:100%;height:'+ht+'px;background:'+bg+';border-radius:1px 1px 0 0;" title="'+h+':xx · '+d.t+' trades · WR '+wr+'%"></div><div style="font-size:9px;color:var(--text-muted);margin-top:2px;">'+h+'</div>';
      hb.appendChild(col);
    }
  }

  var ds = document.getElementById('gest-dias-semana');
  if (ds && trades.length) {
    var dias = [{d:'Lunes',t:0,w:0,p:0},{d:'Martes',t:0,w:0,p:0},{d:'Miércoles',t:0,w:0,p:0},{d:'Jueves',t:0,w:0,p:0},{d:'Viernes',t:0,w:0,p:0}];
    trades.forEach(function(t) {
      var d = t.dia;
      if (d >= 0 && d <= 4) { dias[d].t++; if(t.ganadora) dias[d].w++; dias[d].p += t.beneficio||0; }
    });
    var sorted = dias.map(function(d) {
      return { d:d.d, wr:d.t>0?Math.round(d.w/d.t*1000)/10:0, pnl:Math.round(d.p*100)/100, t:d.t };
    }).sort(function(a,b){ return b.wr-a.wr; });
    ds.innerHTML = sorted.map(function(d) {
      var best = d.wr >= 65; var bad = d.wr < 50 && d.t > 0;
      return '<div style="display:flex;align-items:center;gap:.8rem;padding:.5rem 0;border-bottom:1px solid #0A0C14;">' +
        '<span style="font-size:14px;width:85px;color:'+(best?'#C8BDA0':bad?'var(--red)':'var(--text-dim)')+';">'+(best?'✦ ':bad?'⚠ ':'')+d.d+'</span>' +
        '<div style="flex:1;height:3px;background:var(--border);border-radius:2px;">' +
        '<div style="height:100%;width:'+d.wr+'%;background:'+(best?'#4ACC8A':bad?'#CC554444':'#C9A84C44')+';border-radius:2px;"></div></div>' +
        '<span style="font-size:13px;color:'+(best?'var(--green)':bad?'var(--red)':'var(--text-muted)')+';width:115px;text-align:right;">'+d.wr+'% · '+(d.pnl>=0?'+':'')+d.pnl+'$</span></div>';
    }).join('');
  }
}

function buildCicloDots() {
  var trades = getTodos();
  var cd = document.getElementById('gest-ciclo-dots');
  if (!cd) return;
  var ultimos = trades.slice(-111);
  if (!ultimos.length) {
    // Sin datos reales — usar demo
    var arr = [];
    for (var i=0; i<71; i++) arr.push('w');
    for (var i=0; i<40; i++) arr.push('l');
    for (var i=arr.length-1; i>0; i--) { var j=Math.floor(Math.random()*(i+1)); var tmp=arr[i]; arr[i]=arr[j]; arr[j]=tmp; }
    cd.innerHTML = arr.map(function(x){ return '<div style="width:7px;height:7px;border-radius:50%;background:'+(x==='w'?'#3AAA6A':'#CC5544')+';flex-shrink:0;'+(x==='w'?'box-shadow:0 0 3px #3AAA6A44':'')+'"></div>'; }).join('');
  } else {
    cd.innerHTML = ultimos.map(function(t){ return '<div style="width:7px;height:7px;border-radius:50%;background:'+(t.ganadora?'#3AAA6A':'#CC5544')+';flex-shrink:0;'+(t.ganadora?'box-shadow:0 0 3px #3AAA6A44':'')+'"></div>'; }).join('');
  }
}

function buildEquity() {
  // La curva de equity ya se renderiza en el HTML estático por ahora
  // Se conectará con datos reales en próxima iteración
}

function buildCumplimiento() {
  var trades = getTodos();
  if (!trades.length) return;
  // SL dentro del método = puntos <= 11
  var dentro = trades.filter(function(t){ return t.puntos <= 11; });
  var fuera   = trades.filter(function(t){ return t.puntos > 11; });
  var wrDentro = dentro.length > 0 ? Math.round(dentro.filter(function(t){ return t.ganadora; }).length/dentro.length*1000)/10 : 0;
  var wrFuera  = fuera.length  > 0 ? Math.round(fuera.filter(function(t){ return t.ganadora; }).length/fuera.length*1000)/10  : 0;

  // Actualizar stats de cumplimiento
  var els = {
    'cumpl-dentro-num': dentro.length,
    'cumpl-dentro-pct': Math.round(dentro.length/trades.length*1000)/10 + '% de tus trades',
    'cumpl-fuera-num':  fuera.length,
    'cumpl-fuera-pct':  Math.round(fuera.length/trades.length*1000)/10 + '% — a revisar',
    'cumpl-wr-dentro':  wrDentro + '%',
    'cumpl-wr-fuera':   wrFuera + '%'
  };
  Object.keys(els).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = els[id];
  });
}

// Diario
function init_gestion() {
  var fechaEl = document.getElementById('diario-fecha-hoy');
  if (fechaEl) {
    var ahora = new Date();
    fechaEl.textContent = ahora.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }
  buildTradeRecord();
  buildCicloDots();
}

function guardarEntradaDiario() {
  var texto = document.getElementById('diario-input').value.trim();
  var msg   = document.getElementById('diario-msg');
  if (!texto) { msg.style.color='var(--red)'; msg.textContent='Escribe algo antes de guardar.'; return; }
  var ahora = new Date();
  var fechaStr = ahora.toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' });
  var entradas = document.getElementById('diario-entradas');
  var nuevaEntrada = document.createElement('div');
  nuevaEntrada.style.cssText = 'background:var(--bg2);padding:1.5rem 2rem;position:relative;';
  nuevaEntrada.innerHTML = '<div style="position:absolute;top:0;left:0;bottom:0;width:2px;background:linear-gradient(to bottom,transparent,var(--gold),transparent);"></div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem;">' +
    '<div style="font-size:12px;color:var(--gold-dim);">Hoy · '+fechaStr+'</div>' +
    '<div style="font-size:11px;color:var(--green);">✓ Guardada</div></div>' +
    '<div style="font-size:15px;color:var(--text-dim);line-height:1.8;">'+texto+'</div>';
  entradas.insertBefore(nuevaEntrada, entradas.firstChild);
  document.getElementById('diario-input').value = '';
  if (typeof guardarEntradaDiarioSupabase === 'function') guardarEntradaDiarioSupabase(texto);
  msg.style.color = 'var(--green)';
  msg.textContent = '✓ Entrada guardada.';
  setTimeout(function(){ msg.textContent = ''; }, 3000);
}
