var salaMicMuted    = false;
var salaTvCargado   = false;
var salaActualTipo  = null;
var jitsiApi        = null;

// Rooms fijos por sala — prefijo aurum para evitar colisiones en meet.jit.si
var JITSI_ROOMS = {
  leon:     'aurum-sala-leon-2026',
  toro:     'aurum-sala-toro-2026',
  oso:      'aurum-sala-oso-2026',
  elefante: 'aurum-sala-elefante-2026',
  lobo:     'aurum-sala-lobo-2026',
  abierta:  'aurum-sala-abierta-2026',
  evento:   'aurum-sala-evento-2026',
  hormiga:  'aurum-sala-hormiga-2026',
};

// ── Entrar / salir ──────────────────────────────────────────

function entrarSala(tipo) {
  salaActualTipo = tipo;
  document.getElementById('salas-lista').style.display   = 'none';
  document.getElementById('sala-interior').style.display = 'block';
  window.scrollTo(0, 0);

  var nombres = {
    leon:     'Sala León',
    hormiga:  'Sala Hormiga',
    oso:      'Sala Oso',
    toro:     'Sala Toro',
    elefante: 'Sala Elefante',
    lobo:     'Sala Lobo',
    abierta:  'Sala Abierta · Unamos y venzamos',
    evento:   'Sala Evento',
  };

  var nombre = nombres[tipo] || 'Sala';
  document.getElementById('sala-nombre-header').textContent = nombre;
  document.getElementById('sala-chat-title').textContent    = nombre + ' · Chat';
  document.getElementById('sala-info-bar').textContent      = nombre + ' · Solo audio';

  if (typeof usuarioActual !== 'undefined' && usuarioActual) {
    var nick = usuarioActual.nick || usuarioActual.nombre;
    document.getElementById('sala-tu-nick').textContent     = nick;
    document.getElementById('sala-tu-msg-name').textContent = nick + ' (Tú)';
    var ini = document.getElementById('sala-tu-inicial');
    if (ini) ini.textContent = nick.charAt(0).toUpperCase();
  }

  // Resetear micro
  salaMicMuted = false;
  var btn    = document.getElementById('sala-btn-micro');
  var dot    = document.getElementById('sala-mic-dot-yo');
  var partYo = document.getElementById('sala-part-yo');
  if (btn)    { btn.textContent = '🎙 Micro'; btn.classList.add('on'); btn.style.color = ''; btn.style.borderColor = ''; }
  if (dot)    { dot.className = 'sala-mic-dot sala-mic-on'; }
  if (partYo) { partYo.classList.remove('sala-silenciado'); }

  // Resetear panel a Chat (sin destruir Jitsi si ya cargó)
  salaPanelTab('chat', true);

  // Cargar TradingView (lazy)
  setTimeout(salaCargarChart, 120);
}

function salirDeSala() {
  cerrarJitsi();
  document.getElementById('sala-interior').style.display  = 'none';
  document.getElementById('salas-lista').style.display    = 'block';
  salaActualTipo = null;
  if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen();
  window.scrollTo(0, 0);
}

// ── Chat ────────────────────────────────────────────────────

function enviarMensajeSala() {
  var input = document.getElementById('sala-chat-input');
  var texto = input.value.trim();
  if (!texto) return;

  var msgs = document.getElementById('sala-chat-msgs');
  var nick = (typeof usuarioActual !== 'undefined' && usuarioActual)
    ? (usuarioActual.nick || usuarioActual.nombre) : 'Usuario';

  var ahora = new Date();
  var hora  = ahora.getHours().toString().padStart(2, '0') + ':' + ahora.getMinutes().toString().padStart(2, '0');

  var msg = document.createElement('div');
  msg.style.cssText = 'border-left:2px solid var(--gold);padding-left:.6rem;';
  msg.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.2rem;">' +
      '<div style="font-size:15px;">—</div>' +
      '<div style="font-size:13px;color:var(--gold-bright);">' + nick + ' (Tú)</div>' +
      '<div style="font-size:10px;color:var(--text-muted);margin-left:auto;">' + hora + '</div>' +
    '</div>' +
    '<div style="font-size:15px;color:var(--text-dim);line-height:1.6;">' + texto + '</div>';
  msgs.appendChild(msg);
  msgs.scrollTop = msgs.scrollHeight;
  input.value = '';
}

// ── Tabs del panel derecho ──────────────────────────────────

function salaPanelTab(tab, silencioso) {
  var panelChat  = document.getElementById('sala-panel-chat');
  var panelJitsi = document.getElementById('sala-panel-jitsi');
  var tabChat    = document.getElementById('sala-tab-chat');
  var tabJitsi   = document.getElementById('sala-tab-jitsi');
  var panel      = document.getElementById('sala-panel-derecho');
  var cerrarBtn  = document.getElementById('sala-jitsi-cerrar-btn');
  if (!panelChat || !panelJitsi) return;

  if (tab === 'jitsi') {
    panelChat.style.display  = 'none';
    panelJitsi.style.display = 'flex';
    if (tabChat)   tabChat.classList.remove('sala-tab-activo');
    if (tabJitsi)  tabJitsi.classList.add('sala-tab-activo');
    if (panel)     panel.style.width = '480px';
    if (cerrarBtn) cerrarBtn.style.display = 'block';
  } else {
    panelChat.style.display  = 'flex';
    panelJitsi.style.display = 'none';
    if (tabChat)   tabChat.classList.add('sala-tab-activo');
    if (tabJitsi)  tabJitsi.classList.remove('sala-tab-activo');
    if (!jitsiApi && panel) panel.style.width = '300px';
    if (cerrarBtn && !jitsiApi) cerrarBtn.style.display = 'none';
  }
}

// ── Jitsi Meet ──────────────────────────────────────────────

function salaCompartirPantalla() {
  if (!salaActualTipo) return;

  // Activar tab de Jitsi y expandir panel
  salaPanelTab('jitsi');

  // Si ya está inicializado, solo mostrar
  if (jitsiApi) return;

  var roomName = JITSI_ROOMS[salaActualTipo] || ('aurum-sala-' + salaActualTipo + '-2026');

  // Mostrar room name en el label
  var lbl = document.getElementById('sala-jitsi-room-label');
  if (lbl) lbl.textContent = roomName;

  // Botón Compartir → activo
  var btnC = document.getElementById('sala-btn-compartir');
  if (btnC) { btnC.classList.add('on'); btnC.textContent = '🟢 Compartiendo'; }

  // Cargar external_api.js de Jitsi si no está
  if (typeof JitsiMeetExternalAPI !== 'undefined') {
    _initJitsi(roomName);
  } else {
    var estado = document.getElementById('sala-jitsi-estado');
    if (estado) estado.textContent = 'Cargando Jitsi Meet…';
    var script = document.createElement('script');
    script.src = 'https://meet.jit.si/external_api.js';
    script.onload = function() { _initJitsi(roomName); };
    script.onerror = function() {
      if (estado) estado.textContent = '⚠ No se pudo cargar Jitsi. Comprueba tu conexión.';
    };
    document.head.appendChild(script);
  }
}

function _initJitsi(roomName) {
  var container = document.getElementById('sala-jitsi-container');
  var estado    = document.getElementById('sala-jitsi-estado');
  if (!container) return;

  var nick = (typeof usuarioActual !== 'undefined' && usuarioActual)
    ? (usuarioActual.nick || usuarioActual.nombre) : 'Participante';

  try {
    jitsiApi = new JitsiMeetExternalAPI('meet.jit.si', {
      roomName:   roomName,
      parentNode: container,
      width:      '100%',
      height:     '100%',
      userInfo:   { displayName: nick },
      configOverwrite: {
        startWithAudioMuted:  false,
        startWithVideoMuted:  true,
        startScreenSharing:   true,
        enableWelcomePage:    false,
        prejoinPageEnabled:   false,
        disableDeepLinking:   true,
        disableInviteFunctions: true,
        doNotStoreRoom:       true,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK:        false,
        SHOW_BRAND_WATERMARK:        false,
        SHOW_PROMOTIONAL_CLOSE_PAGE: false,
        MOBILE_APP_PROMO:            false,
        TOOLBAR_BUTTONS: [
          'microphone', 'desktop', 'hangup',
          'tileview', 'settings', 'fullscreen'
        ],
      },
    });

    if (estado) estado.textContent = '✦ Conectado — audio y pantalla compartida activos';

    jitsiApi.addEventListener('videoConferenceLeft', function() {
      cerrarJitsi();
    });

  } catch (e) {
    console.error('Jitsi error:', e);
    if (estado) estado.textContent = '⚠ Error al iniciar Jitsi: ' + e.message;
  }
}

function cerrarJitsi() {
  if (jitsiApi) {
    try { jitsiApi.dispose(); } catch (e) {}
    jitsiApi = null;
  }

  var container = document.getElementById('sala-jitsi-container');
  if (container) container.innerHTML = '';

  var estado = document.getElementById('sala-jitsi-estado');
  if (estado) estado.textContent = 'Cargando Jitsi Meet…';

  var lbl = document.getElementById('sala-jitsi-room-label');
  if (lbl) lbl.textContent = '—';

  // Resetear botón Compartir
  var btnC = document.getElementById('sala-btn-compartir');
  if (btnC) { btnC.classList.remove('on'); btnC.textContent = '🖥 Compartir'; }

  // Botón cerrar Jitsi
  var cerrarBtn = document.getElementById('sala-jitsi-cerrar-btn');
  if (cerrarBtn) cerrarBtn.style.display = 'none';

  // Volver al panel de chat y reducir ancho
  salaPanelTab('chat');
  var panel = document.getElementById('sala-panel-derecho');
  if (panel) panel.style.width = '300px';
}

// ── Micro ───────────────────────────────────────────────────

function toggleMicrofono() {
  salaMicMuted = !salaMicMuted;
  var btn    = document.getElementById('sala-btn-micro');
  var dot    = document.getElementById('sala-mic-dot-yo');
  var partYo = document.getElementById('sala-part-yo');

  if (salaMicMuted) {
    if (btn)    { btn.textContent = '🔇 Silenciado'; btn.classList.remove('on'); btn.style.color = 'var(--red)'; btn.style.borderColor = '#CC443344'; }
    if (dot)    { dot.className = 'sala-mic-dot sala-mic-off'; }
    if (partYo) { partYo.classList.add('sala-silenciado'); }
    if (jitsiApi) jitsiApi.executeCommand('toggleAudio');
  } else {
    if (btn)    { btn.textContent = '🎙 Micro'; btn.classList.add('on'); btn.style.color = ''; btn.style.borderColor = ''; }
    if (dot)    { dot.className = 'sala-mic-dot sala-mic-on'; }
    if (partYo) { partYo.classList.remove('sala-silenciado'); }
    if (jitsiApi) jitsiApi.executeCommand('toggleAudio');
  }
}

// ── TradingView ─────────────────────────────────────────────

function salaCargarChart() {
  if (salaTvCargado) return;
  if (typeof TradingView !== 'undefined') { _initTvWidget(); return; }
  var script    = document.createElement('script');
  script.src    = 'https://s3.tradingview.com/tv.js';
  script.onload = _initTvWidget;
  document.head.appendChild(script);
}

function _initTvWidget() {
  if (salaTvCargado) return;
  salaTvCargado = true;
  try {
    new TradingView.widget({
      container_id:        'sala-tv-container',
      autosize:            true,
      symbol:              'OANDA:XAUUSD',
      interval:            '240',
      timezone:            'Europe/Madrid',
      theme:               'dark',
      style:               '1',
      locale:              'es',
      allow_symbol_change: true,
      withdateranges:      true,
      hide_side_toolbar:   false,
    });
  } catch (e) { console.warn('TradingView widget error:', e); }
}

// ── Pantalla completa ───────────────────────────────────────

function salaFullscreen() {
  var el = document.documentElement;
  if (!document.fullscreenElement) {
    var req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    if (req) req.call(el);
  } else {
    var exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
    if (exit) exit.call(document);
  }
}

document.addEventListener('fullscreenchange',       _salaFullscreenChange);
document.addEventListener('webkitfullscreenchange', _salaFullscreenChange);

function _salaFullscreenChange() {
  var icon  = document.getElementById('sala-fullscreen-icon');
  var label = document.getElementById('sala-fullscreen-label');
  if (!icon) return;
  if (document.fullscreenElement) {
    icon.textContent  = '⤡';
    if (label) label.textContent = 'Salir pantalla completa';
  } else {
    icon.textContent  = '⤢';
    if (label) label.textContent = 'Pantalla completa';
  }
}
