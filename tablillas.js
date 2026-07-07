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

  if (tab === 'inicio'     && typeof cargarRetosPreviewHome === 'function') cargarRetosPreviewHome();
  if (tab === 'retos'      && typeof cargarRetosActivos === 'function') cargarRetosActivos();
  if (tab === 'calendario' && typeof renderCalendario  === 'function') renderCalendario(_calYear, _calMonth);
}

// FIX corazón de datos (07/07): antes la home mostraba 2 retos de muestra
// escritos a mano en index.html, nunca conectados a Supabase. Esta función
// carga los retos reales (misma tabla y mismo filtro que cargarRetosActivos
// en gestion.js) y muestra los 2 más próximos a cerrar.
async function cargarRetosPreviewHome() {
  var cont = document.getElementById('home-retos-preview');
  if (!cont) return;
  if (typeof supaGet !== 'function' || typeof getToken !== 'function') return;

  var res = await supaGet('retos', 'order=fecha_cierre.asc', getToken());
  if (res.error || !res.data) {
    cont.innerHTML = '';
    return;
  }

  var retos = res.data.filter(function(r) { return r.estado !== 'cerrado'; }).slice(0, 2);
  if (!retos.length) {
    cont.innerHTML = '';
    return;
  }

  cont.style.display = 'grid';
  cont.style.gridTemplateColumns = retos.length > 1 ? '1fr 1fr' : '1fr';
  cont.style.gap = '1px';
  cont.style.background = 'var(--border)';

  cont.innerHTML = retos.map(function(r) {
    var esEquipo  = r.tipo === 'equipo';
    var etiqueta  = esEquipo ? ('Reto activo' + (r.sala ? ' · Sala ' + r.sala : '')) : 'Reto activo · Individual';
    var premioPartes = [];
    if (r.premio_ozt)   premioPartes.push('◈ ' + r.premio_ozt + ' OZT');
    if (r.premio_extra) premioPartes.push(r.premio_extra);
    var premioTxt = premioPartes.join(' · ') || '—';
    var cierreTxt = '—';
    if (r.fecha_cierre) {
      var fc = new Date(r.fecha_cierre);
      cierreTxt = 'Cierra ' + fc.getDate() + ' ' + fc.toLocaleString('es-ES', { month: 'short' }).replace('.', '');
    }
    return '<div style="background:var(--bg2);padding:1.2rem 1.5rem;position:relative;">' +
      '<div style="position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--border-gold),transparent);"></div>' +
      '<div style="font-size:11px;color:var(--text-muted);margin-bottom:.5rem;letter-spacing:.2em;text-transform:uppercase;">' + etiqueta + '</div>' +
      '<div style="font-size:15px;color:var(--text-dim);margin-bottom:.8rem;line-height:1.6;">' + (r.descripcion || r.titulo || '') + '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
      '<div style="font-size:13px;color:var(--gold-bright);">' + premioTxt + '</div>' +
      '<div style="font-size:12px;color:var(--text-muted);">' + cierreTxt + '</div>' +
      '</div></div>';
  }).join('');
}

function init_dashboard() {
  if (typeof usuarioActual === 'undefined' || !usuarioActual) return;

  const nick = usuarioActual.nick || usuarioActual.nombre;

  // Saludo
  const el = document.getElementById('dash-saludo-nick');
  if (el) el.textContent = nick + '.';

  // Ranking
  const rankNick = document.getElementById('dash-ranking-nick');
  if (rankNick) rankNick.textContent = nick + ' (Tú)';

  // Stats del dashboard con datos reales si ya están disponibles
  if (typeof buildDashboardHero  === 'function') buildDashboardHero();
  if (typeof renderCalendario    === 'function') renderCalendario(_calYear, _calMonth);
  if (typeof cargarRetosPreviewHome === 'function') cargarRetosPreviewHome();

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
