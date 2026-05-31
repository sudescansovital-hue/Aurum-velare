// ============================================================
// LÓGICA DE EVALÚAME
// Para modificar precios o textos: edita el HTML de arriba
// Para modificar la lógica: edita estas funciones
// ============================================================

// Códigos válidos — en producción vendrán de Supabase
const CODIGOS_VALIDOS = {
  'AURUM-EVAL-DEMO-2026': { usado: false, nombre: 'Demo' },
  'AURUM-EVAL-TEST-0001': { usado: false, nombre: 'Test' },
  'AURUM-EVAL-TEST-0002': { usado: false, nombre: 'Test2' },
  'AURUM-EVAL-TEST-0003': { usado: false, nombre: 'Test3' },
};

const cuentasEvaluadas = new Map();

// Simular pago (en producción: redirigir a Stripe)
function simularPago() {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:#080A12EE;display:flex;align-items:center;justify-content:center;z-index:1000;';
  modal.innerHTML = `
    <div style="border:1px solid var(--border-gold);background:var(--bg2);padding:2.5rem;max-width:420px;width:90%;text-align:center;position:relative;">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);"></div>
      <div style="font-size:32px;margin-bottom:1rem;">🔒</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--gold-bright);margin-bottom:.5rem;">Pago seguro con Stripe</div>
      <div style="font-size:15px;color:var(--text-muted);margin-bottom:1.5rem;line-height:1.8;">En producción aquí se abriría el formulario de pago de Stripe. Una vez confirmado el pago recibirías tu código por email.</div>
      <div style="font-size:14px;color:var(--text-dim);padding:.8rem;background:var(--bg3);border:1px solid var(--border);margin-bottom:1.5rem;">
        Código demo:<br>
        <span style="font-family:monospace;font-size:15px;color:var(--gold-bright);letter-spacing:.1em;">AURUM-EVAL-DEMO-2026</span>
      </div>
      <div onclick="this.closest('[style]').remove();mostrarFormularioCodigo();" style="padding:.8rem 2rem;border:1px solid var(--border-gold);background:var(--gold-glow);font-size:14px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);cursor:pointer;display:inline-block;">
        Usar código demo →
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function mostrarFormularioCodigo() {
  document.getElementById('evalua-paso-pago').style.display = 'none';
  document.getElementById('evalua-paso-codigo').style.display = 'block';
  setTimeout(() => document.getElementById('evalua-codigo-input').focus(), 100);
}

function volverAlPago() {
  document.getElementById('evalua-paso-codigo').style.display = 'none';
  document.getElementById('evalua-paso-pago').style.display = 'block';
}

function validarCodigoEvalua() {
  const input = document.getElementById('evalua-codigo-input').value.trim().toUpperCase();
  const err   = document.getElementById('evalua-codigo-err');

  if (!input) { err.textContent = 'Introduce tu código.'; return; }
  if (!CODIGOS_VALIDOS[input]) { err.textContent = 'Código no reconocido. Verifica el email que recibiste tras el pago.'; return; }
  if (CODIGOS_VALIDOS[input].usado) { err.textContent = 'Este código ya fue utilizado. Cada código es válido para una sola evaluación.'; return; }

  CODIGOS_VALIDOS[input].usado = true;
  err.textContent = '';
  document.getElementById('evalua-paso-codigo').style.display = 'none';
  document.getElementById('evalua-zona-subida').style.display = 'block';
}

function procesarArchivoEvalua(file) {
  if (!file) return;
  if (!file.name.match(/\.(xlsx|xls)$/i)) {
    alert('El archivo debe ser un informe MT5 en formato .xlsx');
    return;
  }

  document.getElementById('evalua-zona-subida').style.display = 'none';
  document.getElementById('evalua-procesando').style.display = 'block';
  setProgreso(10, 'Leyendo archivo...');

  // Cargar SheetJS dinámicamente si no está disponible
  if (typeof XLSX === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => leerExcel(file);
    document.head.appendChild(script);
  } else {
    leerExcel(file);
  }
}

function setProgreso(pct, label) {
  document.getElementById('evalua-proc-bar').style.width = pct + '%';
  document.getElementById('evalua-proc-label').textContent = label;
}

function leerExcel(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      setProgreso(30, 'Parseando datos MT5...');
      const data = new Uint8Array(e.target.result);
      const wb   = XLSX.read(data, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });

      setProgreso(50, 'Extrayendo trades XAU/USD...');
      const trades = parsearTrades(raw);

      if (trades.length === 0) {
        document.getElementById('evalua-procesando').style.display = 'none';
        document.getElementById('evalua-zona-subida').style.display = 'block';
        alert('No se encontraron trades de XAU/USD en el archivo. Verifica que el informe es correcto.');
        return;
      }

      if (trades.length < 111) {
        document.getElementById('evalua-procesando').style.display = 'none';
        document.getElementById('evalua-zona-subida').style.display = 'block';
        alert(`Solo se encontraron ${trades.length} trades. Aurum requiere mínimo 111 trades en XAU/USD para dar una evaluación válida. Tu código sigue disponible cuando los tengas.`);
        return;
      }

      setProgreso(75, 'Calculando métricas...');
      const metricas = calcularMetricas(trades);

      setProgreso(100, 'Generando evaluación...');
      setTimeout(() => {
        document.getElementById('evalua-procesando').style.display = 'none';
        mostrarResultados(trades, metricas, file.name);
      }, 500);

    } catch(err) {
      document.getElementById('evalua-procesando').style.display = 'none';
      document.getElementById('evalua-zona-subida').style.display = 'block';
      alert('Error al leer el archivo: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
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

function mostrarResultados(trades, m, nombreArchivo) {
  if (window.usuarioActual && window.usuarioActual.email && typeof guardarTradesIndividuales === 'function') {
    var cuentaEval = typeof detectarNombreCuenta === 'function' ? detectarNombreCuenta([], nombreArchivo) : null;
    guardarTradesIndividuales(trades, cuentaEval || 'Evaluación');
  }
  const res = document.getElementById('evalua-resultados');
  res.style.display = 'block';

  const etapas = ['Inicio','Disciplina','Despertar','Simulador','Rentable','✦ Oro'];
  let etapaRec = 0;
  if (m.wr>=45&&m.rr>=1.0) etapaRec=1;
  if (m.wr>=50&&m.rr>=1.2) etapaRec=2;
  if (m.wr>=52&&m.rr>=1.3) etapaRec=3;
  if (m.wr>=55&&m.rr>=1.5) etapaRec=4;
  if (m.wr>=58&&m.rr>=1.6) etapaRec=5;
  if (m.wr>=60&&m.rr>=1.8) etapaRec=6;

  // Equity SVG
  const minE = Math.min(...m.equity), maxE = Math.max(...m.equity), rng = maxE-minE||1;
  const pts  = m.equity.map((v,i)=>{
    const x = i/(m.equity.length-1)*800;
    const y = 130 - ((v-minE)/rng*110);
    return `${x.toFixed(0)},${y.toFixed(0)}`;
  }).join(' ');
  const lastY = 130 - ((m.equity[m.equity.length-1]-minE)/rng*110);

  res.innerHTML = `
    <div style="margin-top:2rem;">
      <div onclick="reiniciarEvalua()" style="font-size:14px;color:var(--text-muted);cursor:pointer;margin-bottom:1.5rem;">← Nueva evaluación</div>

      <!-- Stats globales -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);margin-bottom:1px;">
        <div class="stat-card highlight" style="text-align:center;">
          <div class="stat-label">Trades analizados</div>
          <div class="stat-val white" style="font-size:36px;">${m.total}</div>
          <div class="stat-sub">de ${nombreArchivo}</div>
        </div>
        <div class="stat-card" style="text-align:center;">
          <div class="stat-label">Win Rate</div>
          <div class="stat-val ${m.wr>=55?'green':m.wr>=45?'gold':'red'}" style="font-size:36px;">${m.wr.toFixed(1)}%</div>
          <div class="stat-sub">${m.wins} ganadoras · ${m.losses} perdedoras</div>
        </div>
        <div class="stat-card" style="text-align:center;">
          <div class="stat-label">R/R Real</div>
          <div class="stat-val gold" style="font-size:36px;">${m.rr.toFixed(2)}</div>
          <div class="stat-sub">${m.ptsW.toFixed(1)} pts WIN / ${m.ptsL.toFixed(1)} LOSS</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);margin-bottom:1.5rem;">
        <div class="stat-card" style="text-align:center;">
          <div class="stat-label">Esperanza/trade</div>
          <div class="stat-val ${m.esp>0?'green':'red'}" style="font-size:36px;">${m.esp>=0?'+':''}${m.esp.toFixed(1)}</div>
          <div class="stat-sub">puntos por trade</div>
        </div>
        <div class="stat-card" style="text-align:center;">
          <div class="stat-label">P&L Total</div>
          <div class="stat-val ${m.pnl>=0?'green':'red'}" style="font-size:36px;">${m.pnl>=0?'+':''}${m.pnl.toFixed(0)}$</div>
          <div class="stat-sub">en ${m.total} trades</div>
        </div>
        <div class="stat-card" style="text-align:center;">
          <div class="stat-label">Puntuación Aurum</div>
          <div class="stat-val gold" style="font-size:36px;">${Math.min(100,m.score)}</div>
          <div class="stat-sub">/ 100 posible</div>
        </div>
      </div>

      <!-- Tipos -->
      <div style="background:var(--bg2);border:1px solid var(--border);padding:1.5rem;margin-bottom:1px;">
        <div class="tag" style="margin-bottom:1rem;display:block;">Tipos de trade por duración</div>
        ${Object.entries(m.tipos).map(([tipo,arr])=>{
          if(!arr.length) return '';
          const nombres={'scalp':'Scalping <30min','intra':'Intradía 30m–4h','swing':'Swing 4h–24h','multi':'Multi-día >24h'};
          const w=arr.filter(t=>t.ganadora).length;
          const wr=w/arr.length*100;
          const pnl=arr.reduce((s,t)=>s+t.ben,0);
          const col=wr>=70?'var(--gold-bright)':wr>=50?'#C9A84C44':'#CC554466';
          return `<div style="margin-bottom:.8rem;">
            <div style="display:flex;justify-content:space-between;margin-bottom:.3rem;">
              <span style="font-size:16px;color:${wr>=70?'var(--gold-bright)':'var(--text-dim)'};">${wr>=70?'✦ ':''}${nombres[tipo]}</span>
              <span style="font-size:15px;color:var(--text-muted);">${arr.length}t · ${wr.toFixed(0)}% WR · ${pnl>=0?'+':''}${pnl.toFixed(0)}$</span>
            </div>
            <div style="height:4px;background:var(--border);border-radius:2px;">
              <div style="height:100%;width:${wr}%;background:${col};border-radius:2px;"></div>
            </div>
          </div>`;
        }).join('')}
      </div>

      <!-- Equity -->
      <div style="background:var(--bg2);border:1px solid var(--border);padding:1.5rem;margin-bottom:1px;">
        <div class="tag" style="margin-bottom:1rem;display:block;">Curva de equity acumulada</div>
        <div style="height:150px;background:#060810;border:1px solid var(--border);border-radius:2px;overflow:hidden;">
          <svg width="100%" height="100%" viewBox="0 0 800 150" preserveAspectRatio="none">
            <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#C9A84C" stop-opacity="0.2"/><stop offset="100%" stop-color="#C9A84C" stop-opacity="0"/></linearGradient></defs>
            <line x1="0" y1="50" x2="800" y2="50" stroke="#1A2040" stroke-width="0.5"/>
            <line x1="0" y1="100" x2="800" y2="100" stroke="#1A2040" stroke-width="0.5"/>
            <polyline points="${pts} 800,150 0,150" fill="url(#eg)"/>
            <polyline points="${pts}" fill="none" stroke="${m.pnl>=0?'#C9A84C':'#CC5544'}" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="800" cy="${lastY.toFixed(0)}" r="4" fill="${m.pnl>=0?'#E8C870':'#CC5544'}"/>
            <text x="793" y="${Math.max(12,lastY-5)}" text-anchor="end" fill="${m.pnl>=0?'#E8C870':'#CC5544'}" font-size="11" font-family="sans-serif">${m.pnl>=0?'+':''}${m.pnl.toFixed(0)}$</text>
          </svg>
        </div>
      </div>

      <!-- Etapa recomendada -->
      <div style="background:var(--bg2);border:1px solid var(--border);padding:1.5rem;margin-bottom:1.5rem;">
        <div class="tag" style="margin-bottom:1rem;display:block;">Etapa Aurum recomendada</div>
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:var(--border);margin-bottom:1rem;">
          ${etapas.map((e,i)=>`
            <div style="background:${i===etapaRec?'linear-gradient(135deg,var(--bg2),#0E1020)':'var(--bg2)'};padding:.8rem;text-align:center;${i===etapaRec?'border:1px solid var(--border-gold);':''}">
              <div style="font-family:'Cormorant Garamond',serif;font-size:24px;color:${i===etapaRec?'var(--gold-bright)':'var(--text-muted)'};">${i+1}</div>
              <div style="font-size:13px;color:${i===etapaRec?'var(--gold-dim)':'var(--text-muted)'};">${e}</div>
            </div>
          `).join('')}
        </div>
        <div style="font-size:16px;color:var(--text-muted);line-height:1.7;">
          Con <strong style="color:var(--text);">${m.wr.toFixed(1)}%</strong> de win rate y R/R <strong style="color:var(--text);">${m.rr.toFixed(2)}</strong>, 
          tus datos encajan en la etapa <strong style="color:var(--gold-bright);">${etapas[Math.max(0,etapaRec-1)] || 'Inicio'}</strong> del proceso Aurum.
        </div>
      </div>

      <!-- Veredicto -->
      <div style="padding:1.5rem 2rem;background:linear-gradient(135deg,var(--bg2),var(--bg));border:1px solid var(--border-gold);position:relative;margin-bottom:2rem;">
        <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);"></div>
        <div class="tag-gold" style="display:block;margin-bottom:.8rem;">✦ Veredicto Aurum</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:48px;color:var(--gold-bright);text-shadow:0 0 30px var(--gold-glow);line-height:1;display:inline-block;margin-right:.5rem;">${Math.min(100,m.score)}</div>
        <span style="font-size:16px;color:var(--gold-dim);">/ 100</span>
        <div style="font-size:15px;color:#8A7840;line-height:1.9;font-style:italic;margin-top:1rem;max-width:600px;">
          ${generarVeredicto(m)}
        </div>
      </div>

      <!-- CTA -->
      <div style="text-align:center;padding:2rem;border:1px solid var(--border);background:var(--bg2);">
        <div style="font-family:'Cormorant Garamond',serif;font-size:28px;color:var(--text);margin-bottom:.5rem;">¿Quieres el proceso completo?</div>
        <div style="font-size:16px;color:var(--text-muted);max-width:480px;margin:0 auto 1.5rem;line-height:1.8;">Los 33€ de esta evaluación se descuentan del pack que elijas. El proceso Aurum te da las cuentas MT5, las salas en vivo y el acompañamiento ciclo a ciclo.</div>
        <div class="btn-gold" onclick="irA('packs')">Explorar los packs →</div>
      </div>
    </div>
  `;
}

function generarVeredicto(m) {
  if (m.total < 111) return `Con ${m.total} trades es difícil establecer un edge claro. Aurum necesita al menos 111 trades para dar una evaluación significativa.`;
  if (m.wr < 40) return `Un win rate de ${m.wr.toFixed(0)}% indica que la selección de entradas necesita revisión fundamental. El proceso Aurum empieza exactamente por ahí.`;
  if (m.pnl < 0 && m.wr >= 50) return `Tienes ${m.wr.toFixed(0)}% de acierto pero resultado negativo. Eso significa que tus perdedoras son más grandes que las ganadoras. El R/R de ${m.rr.toFixed(2)} necesita trabajo.`;
  if (m.esp > 0 && m.wr >= 55) return `El edge existe. Con ${m.wr.toFixed(0)}% de win rate, R/R ${m.rr.toFixed(2)} y esperanza positiva de +${m.esp.toFixed(1)} puntos por trade, tienes un sistema que funciona matemáticamente. El trabajo ahora es la consistencia.`;
  return `Resultados prometedores con ${m.total} trades. El proceso Aurum transformaría estos datos en un sistema claro, medible y consistente ciclo a ciclo.`;
}

function reiniciarEvalua() {
  document.getElementById('evalua-resultados').style.display = 'none';
  document.getElementById('evalua-resultados').innerHTML = '';
  document.getElementById('evalua-paso-pago').style.display = 'block';
  document.getElementById('evalua-codigo-input').value = '';
  document.getElementById('evalua-file-input').value = '';
}

function init_evalua() {
  if (!window.usuarioActual || !window.usuarioActual.email) return;
  var container = document.getElementById('evalua-paso-pago');
  if (!container || document.getElementById('evalua-btn-supabase')) return;
  var btn = document.createElement('div');
  btn.id = 'evalua-btn-supabase';
  btn.style.cssText = 'text-align:center;margin-top:1.5rem;padding:1rem;border:1px solid var(--border);background:var(--bg2);';
  btn.innerHTML = '<div style="font-size:14px;color:var(--text-muted);margin-bottom:.6rem;">¿Ya tienes trades guardados en Aurum?</div>' +
    '<div onclick="cargarYEvaluarDesdeSupabase()" style="display:inline-block;padding:.6rem 1.5rem;border:1px solid var(--border-gold);font-size:14px;color:var(--gold-dim);cursor:pointer;letter-spacing:.1em;">✦ Evaluar mis trades guardados →</div>';
  container.appendChild(btn);
}

async function cargarYEvaluarDesdeSupabase() {
  if (!window.usuarioActual || !window.usuarioActual.email) { abrirLogin(); return; }
  var paso = document.getElementById('evalua-paso-pago');
  if (paso) paso.style.display = 'none';
  var proc = document.getElementById('evalua-procesando');
  if (proc) proc.style.display = 'block';
  setProgreso(20, 'Cargando trades desde Aurum...');

  var token = getToken();
  var params = 'usuario_email=eq.' + encodeURIComponent(usuarioActual.email) + '&order=created_at.asc&limit=5000';
  var res = await supaGet('trades', params, token);

  if (res.error || !res.data || !res.data.length) {
    if (proc) proc.style.display = 'none';
    if (paso) paso.style.display = 'block';
    alert('No tienes trades guardados. Sube un historial MT5 desde la sección Historial primero.');
    return;
  }

  setProgreso(70, 'Calculando métricas...');
  var trades = res.data.map(function(t) {
    return {
      fp:       t.fp,
      ben:      t.beneficio || 0,
      beneficio: t.beneficio || 0,
      vol:      t.vol,
      pe:       t.pe,
      pc:       t.pc,
      puntos:   t.puntos || 0,
      ganadora: !!t.ganadora,
      hora:     t.hora || 0,
      dia:      t.dia || 0,
      durMin:   t.dur_min || 0,
      dur_min:  t.dur_min || 0,
      cuenta:   t.cuenta
    };
  });

  if (trades.length < 111) {
    if (proc) proc.style.display = 'none';
    if (paso) paso.style.display = 'block';
    alert('Solo tienes ' + trades.length + ' trades guardados. Aurum requiere mínimo 111 para una evaluación válida.');
    return;
  }

  setProgreso(90, 'Generando evaluación...');
  var metricas = calcularMetricas(trades);
  setProgreso(100, 'Listo.');
  setTimeout(function() {
    if (proc) proc.style.display = 'none';
    mostrarResultados(trades, metricas, 'Trades guardados (' + trades.length + ')');
  }, 300);
}

function unirseListaEspera() {
  const email = document.getElementById('waitlist-email').value.trim();
  const msg   = document.getElementById('waitlist-msg');
  if (!email || !email.includes('@')) {
    msg.style.color = 'var(--red)';
    msg.textContent = 'Introduce un email válido.';
    return;
  }
  // En producción: guardar en Supabase
  msg.style.color = 'var(--green)';
  msg.textContent = '✓ Plaza reservada. Te contactamos en cuanto haya acceso disponible.';
  document.getElementById('waitlist-email').value = '';
}
