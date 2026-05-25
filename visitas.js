// ============================================================
// LÓGICA DE VISTAS POR CUENTA — datos reales de Supabase
// ============================================================

const cuentasBuilt = {};
window.cuentaActivaGestion = "global"; // cuenta seleccionada actualmente

function verCuenta(cuenta) {
  ['global','maestra','retos','prueba'].forEach(function(c) {
    var el = document.getElementById('vista-' + c);
    if (el) el.style.display = 'none';
    var btn = document.getElementById('btn-' + c);
    if (btn) btn.style.borderBottomColor = 'transparent';
  });

  var vista = document.getElementById('vista-' + cuenta);
  if (vista) vista.style.display = 'block';

  var btn = document.getElementById('btn-' + cuenta);
  if (btn) {
    var colores = { global:'var(--gold)', maestra:'var(--green)', retos:'#CC8844', prueba:'#4A8AEE' };
    btn.style.borderBottomColor = colores[cuenta] || 'var(--gold)';
    btn.style.background = 'linear-gradient(135deg,var(--bg2),#0E1020)';
  }

  window.cuentaActivaGestion = cuenta;
  // Resetear cache de tabs para que se recalculen con la nueva cuenta
  window.yaBuiltGestion = {};
  if (!cuentasBuilt[cuenta]) {
    cuentasBuilt[cuenta] = true;
    if (cuenta === 'global')  buildGlobal();
    if (cuenta === 'maestra') buildCuentaReal('maestra', 'Cuenta Maestra');
    if (cuenta === 'retos')   buildCuentaReal('retos',   'Cuenta Retos');
    if (cuenta === 'prueba')  buildCuentaReal('prueba',  'Cuenta Prueba');
  }
}

function getTrades(nombreCuenta) {
  if (!window.AURUM_TRADES) return [];
  if (nombreCuenta === 'todos') return window.AURUM_TRADES.todos || [];
  return (window.AURUM_TRADES.todos || []).filter(function(t){ return t.cuenta === nombreCuenta; });
}

function calcTipos(trades) {
  var scalp = trades.filter(function(t){ return t.dur_min < 30; });
  var intra = trades.filter(function(t){ return t.dur_min >= 30 && t.dur_min < 240; });
  var swing = trades.filter(function(t){ return t.dur_min >= 240 && t.dur_min < 1440; });
  var multi = trades.filter(function(t){ return t.dur_min >= 1440; });
  function tm(arr, label, col) {
    var w = arr.filter(function(t){ return t.ganadora; }).length;
    var p = arr.reduce(function(s,t){ return s+(t.beneficio||0); }, 0);
    return { l:label, t:arr.length, wr:arr.length>0?Math.round(w/arr.length*1000)/10:0, pnl:Math.round(p*100)/100, col:col };
  }
  return [
    tm(scalp, 'Scalping <30min',  '#6A8AEE44'),
    tm(intra, 'Intradía 30m–4h',  '#C9A84C44'),
    tm(swing, '✦ Swing 4h–24h',   'linear-gradient(90deg,#C9A84C44,#E8C870)'),
    tm(multi, 'Multi-día >24h',   '#4ACC8A')
  ];
}

function calcDias(trades) {
  var dias = [{d:'Lunes',t:0,w:0,p:0},{d:'Martes',t:0,w:0,p:0},{d:'Miércoles',t:0,w:0,p:0},{d:'Jueves',t:0,w:0,p:0},{d:'Viernes',t:0,w:0,p:0}];
  trades.forEach(function(t) {
    var d = t.dia;
    if (d >= 0 && d <= 4) { dias[d].t++; if(t.ganadora) dias[d].w++; dias[d].p += t.beneficio||0; }
  });
  return dias.map(function(d) {
    var wr = d.t > 0 ? Math.round(d.w/d.t*1000)/10 : 0;
    return { d:d.d, wr:wr, pnl:Math.round(d.p*100)/100, t:d.t, best:wr>=70, bad:wr<50&&d.t>0 };
  });
}

function buildCuentaReal(cuenta, nombreCuenta) {
  var trades = getTrades(nombreCuenta);
  if (!trades.length) return;

  var tipos = calcTipos(trades);
  var tb = document.getElementById('tipos-' + cuenta);
  if (tb) {
    var maxT = Math.max.apply(null, tipos.map(function(d){ return d.t; })) || 1;
    tb.innerHTML = tipos.map(function(d) {
      return '<div style="margin-bottom:.8rem;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:.3rem;">' +
        '<span style="font-size:14px;color:'+(d.wr>=70?'var(--gold-bright)':'var(--text-dim)')+';">'+d.l+'</span>' +
        '<span style="font-size:12px;color:var(--text-muted);">'+d.t+'t · '+d.wr+'% · '+(d.pnl>=0?'+':'')+d.pnl+'$</span></div>' +
        '<div style="height:4px;background:var(--border);border-radius:2px;">' +
        '<div style="height:100%;width:'+Math.round(d.t/maxT*100)+'%;background:'+d.col+';border-radius:2px;"></div></div></div>';
    }).join('');
  }

  var dias = calcDias(trades);
  var db = document.getElementById('dias-' + cuenta);
  if (db) {
    db.innerHTML = dias.map(function(d) {
      return '<div style="display:flex;align-items:center;gap:.8rem;padding:.5rem 0;border-bottom:1px solid #0A0C14;">' +
        '<span style="font-size:14px;width:85px;color:'+(d.best?'#C8BDA0':d.bad?'var(--red)':'var(--text-dim)')+';">'+(d.best?'✦ ':d.bad?'⚠ ':'')+d.d+'</span>' +
        '<div style="flex:1;height:3px;background:var(--border);border-radius:2px;">' +
        '<div style="height:100%;width:'+d.wr+'%;background:'+(d.best?'#4ACC8A':d.bad?'#CC554444':'#C9A84C44')+';border-radius:2px;"></div></div>' +
        '<span style="font-size:12px;color:'+(d.best?'var(--green)':d.bad?'var(--red)':'var(--text-muted)')+';width:115px;text-align:right;">'+d.wr+'% · '+(d.pnl>=0?'+':'')+d.pnl+'$</span></div>';
    }).join('');
  }
}

function buildGlobal() {
  var todos = getTrades('todos');
  if (!todos.length) return;

  var maestra = getTrades('Cuenta Maestra');
  var prueba  = getTrades('Cuenta Prueba');

  var tiposM = calcTipos(maestra);
  var tiposP = calcTipos(prueba);

  var comp = document.getElementById('global-comparativa');
  if (comp) {
    var labels = ['Scalping <30min','Intradía 30m–4h','✦ Swing 4h–24h','Multi-día >24h'];
    comp.innerHTML = labels.map(function(label, i) {
      var m = tiposM[i];
      var p = tiposP[i];
      return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--border);margin-bottom:1px;">' +
        '<div style="background:var(--bg2);padding:.5rem .8rem;font-size:13px;color:'+(label.includes('✦')?'var(--gold-bright)':'var(--text-dim)')+';">'+label+'</div>' +
        '<div style="background:var(--bg2);padding:.5rem;text-align:center;font-size:12px;color:'+(m&&m.wr>=65?'var(--green)':'var(--text-muted)')+';">'+(m?m.wr+'% · '+(m.pnl>=0?'+':'')+m.pnl+'$':'—')+'</div>' +
        '<div style="background:var(--bg2);padding:.5rem;text-align:center;font-size:12px;color:'+(p&&p.wr>=65?'#6A9AEE':'var(--text-muted)')+';">'+(p?p.wr+'% · '+(p.pnl>=0?'+':'')+p.pnl+'$':'—')+'</div></div>';
    }).join('');
  }
}

document.addEventListener('DOMContentLoaded', function() {
  // buildGlobal se llamará cuando AURUM_TRADES esté disponible
  setTimeout(function() { if (window.AURUM_TRADES) buildGlobal(); }, 2000);
});
