function init_salas() {
  var ANIMALES = ['hormiga','leon','elefante','oso','toro','lobo'];
  ANIMALES.forEach(function(a) {
    var c = document.getElementById('sala-card-' + a);
    if (!c) return;
    var badge = document.getElementById('tu-sala-badge-' + a);
    if (badge) badge.remove();
    if (a !== 'leon') {
      c.style.borderColor = 'var(--border)';
      c.onmouseover = function() { this.style.borderColor = 'var(--border-gold)'; };
      c.onmouseout  = function() { this.style.borderColor = 'var(--border)'; };
    }
  });

  if (typeof usuarioActual === 'undefined' || !usuarioActual || !usuarioActual.animalSala) return;
  var animal = usuarioActual.animalSala.toLowerCase();
  var card = document.getElementById('sala-card-' + animal);
  if (!card) return;

  card.style.borderColor = 'var(--gold)';
  card.style.position    = 'relative';
  card.onmouseover = null;
  card.onmouseout  = null;

  var badge = document.createElement('div');
  badge.id = 'tu-sala-badge-' + animal;
  badge.style.cssText = 'position:absolute;top:.5rem;right:.5rem;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);background:var(--gold-glow);border:1px solid var(--border-gold);padding:2px 6px;pointer-events:none;';
  badge.textContent = 'Tu sala';
  card.insertBefore(badge, card.firstChild);
}

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
  if (typeof usuarioActual === 'undefined' || !usuarioActual) {
    showToast('Esta sala es solo para miembros. Necesitas un Camino para entrar.');
    return;
  }
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

// ── Jitsi Meet ──────────────────────────────────────────────

function salaCompartirPantalla() {
  // Mostrar modal (position:fixed — dimensiones concretas para Jitsi)
  var modal = document.getElementById('sala-jitsi-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  // Botón → activo
  var btn = document.getElementById('sala-btn-compartir');
  if (btn) { btn.classList.add('on'); btn.textContent = '🟢 Jitsi activo'; }

  // Si la API ya está inicializada, solo mostrar el modal
  if (jitsiApi) return;

  var room = JITSI_ROOMS[salaActualTipo] || ('aurum-sala-' + (salaActualTipo || 'general') + '-2026');
  var info = document.getElementById('sala-jitsi-room-info');
  if (info) info.textContent = room;

  if (typeof JitsiMeetExternalAPI !== 'undefined') {
    _initJitsi(room);
    return;
  }

  // Cargar external_api.js de forma lazy
  if (info) info.textContent = 'Cargando Jitsi…';
  var s = document.createElement('script');
  s.src = 'https://meet.jit.si/external_api.js';
  s.onload  = function() { _initJitsi(room); };
  s.onerror = function() {
    if (info) info.textContent = '⚠ No se pudo cargar Jitsi. Comprueba tu conexión.';
  };
  document.head.appendChild(s);
}

function _initJitsi(room) {
  var container = document.getElementById('sala-jitsi-container');
  if (!container) return;

  var nick = (window.usuarioActual && window.usuarioActual.nick)
    ? window.usuarioActual.nick
    : (window.usuarioActual && window.usuarioActual.nombre) || 'Participante';

  var info = document.getElementById('sala-jitsi-room-info');
  if (info) info.textContent = room;

  try {
    jitsiApi = new JitsiMeetExternalAPI('meet.jit.si', {
      roomName:   room,
      parentNode: container,
      width:      '100%',
      height:     '100%',
      userInfo:   { displayName: nick },
      configOverwrite: {
        startWithAudioMuted:    false,
        startWithVideoMuted:    true,
        prejoinPageEnabled:     false,
        enableWelcomePage:      false,
        disableDeepLinking:     true,
        disableInviteFunctions: true,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK:        false,
        SHOW_BRAND_WATERMARK:        false,
        SHOW_PROMOTIONAL_CLOSE_PAGE: false,
        MOBILE_APP_PROMO:            false,
        TOOLBAR_BUTTONS: ['microphone', 'desktop', 'hangup', 'tileview', 'fullscreen'],
      },
    });

    jitsiApi.addEventListener('videoConferenceLeft', cerrarJitsi);

  } catch (e) {
    console.error('Jitsi init error:', e);
    if (info) info.textContent = '⚠ Error: ' + e.message;
  }
}

function cerrarJitsi() {
  if (jitsiApi) {
    try { jitsiApi.dispose(); } catch (e) {}
    jitsiApi = null;
  }
  var container = document.getElementById('sala-jitsi-container');
  if (container) container.innerHTML = '';

  var modal = document.getElementById('sala-jitsi-modal');
  if (modal) modal.style.display = 'none';

  var btn = document.getElementById('sala-btn-compartir');
  if (btn) { btn.classList.remove('on'); btn.textContent = '🖥 Compartir'; }
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
