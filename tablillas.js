function mostrarTab(tab) {
  // Ocultar todos los paneles
  ['inicio','calendario','retos','ozt'].forEach(p => {
    const el = document.getElementById('panel-' + p);
    if (el) el.style.display = 'none';
  });

  // Mostrar el seleccionado
  const panel = document.getElementById('panel-' + tab);
  if (panel) panel.style.display = 'block';

  // Marcar sidebar activo
  document.querySelectorAll('#page-dashboard .sidebar-item').forEach(item => {
    item.classList.remove('active');
  });
  const tabMap = { inicio: 0, salas: 1, gestion: 2, calendario: 3, retos: 4, ozt: 5 };
  const items = document.querySelectorAll('#page-dashboard .sidebar-item');
  if (tabMap[tab] !== undefined && items[tabMap[tab]]) {
    items[tabMap[tab]].classList.add('active');
  }
}

function init_dashboard() {
  if (typeof usuarioActual === 'undefined' || !usuarioActual) return;

  const nick = usuarioActual.nick || usuarioActual.nombre;

  // Saludo
  const el = document.getElementById('dash-saludo-nick');
  if (el) el.textContent = nick + '.';

  // Cards
  const oztEls = ['dash-ozt','dash-ozt-widget','ozt-saldo'];
  oztEls.forEach(id => {
    const e = document.getElementById(id);
    if (e) e.textContent = usuarioActual.ozt || 0;
  });

  // Ranking
  const rankNick = document.getElementById('dash-ranking-nick');
  if (rankNick) rankNick.textContent = nick + ' (Tú)';
  const rankOzt = document.getElementById('dash-ranking-ozt');
  if (rankOzt) rankOzt.textContent = (usuarioActual.ozt || 0) + ' OZT';

  // Stats del dashboard con datos reales si ya están disponibles
  if (typeof buildDashboardHero === 'function') buildDashboardHero();

  // Historial etapas
  const etapasEl = document.getElementById('dash-etapas-historial');
  if (etapasEl) {
    const etapasCompletadas = [
      { num: '0', nombre: 'Silencio',    fecha: '01 Feb 2026', validada: true },
      { num: '0.5', nombre: 'Umbral',    fecha: '15 Feb 2026', validada: true },
      { num: '1', nombre: 'Estructura',  fecha: '10 Mar 2026', validada: true },
      { num: '1.5', nombre: 'Fractura',  fecha: '02 Abr 2026', validada: true },
      { num: '2', nombre: 'Claridad',    fecha: '25 Abr 2026', validada: true },
      { num: '2.5', nombre: 'Consistencia', fecha: '10 May 2026', validada: true },
    ];
    etapasEl.innerHTML = etapasCompletadas.map(e => `
      <div style="display:flex;align-items:center;gap:.5rem;padding:.4rem 0;border-bottom:1px solid #0A0C14;">
        <div style="font-family:'Cormorant Garamond',serif;font-size:16px;color:var(--gold-dim);width:24px;">${e.num}</div>
        <div style="flex:1;">
          <div style="font-size:12px;color:var(--text-dim);">${e.nombre}</div>
          <div style="font-size:10px;color:var(--text-muted);">${e.fecha}</div>
        </div>
        ${e.validada ? '<div style="font-size:10px;color:var(--green);">✓</div>' : ''}
      </div>
    `).join('');
  }
}
