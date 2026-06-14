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

var salaMicMuted         = false;
var salaTvCargado        = false;
var salaActualTipo       = null;
var livekitRoom          = null;
var livekitScreenSharing = false;
var _lkHudTimer          = null;
var _lkHudHandler        = null;
var _lkBrandTimer        = null;
var _lkBrandHandler      = null;
var _lkCurrentLabel      = '';

var LIVEKIT_WS_URL = 'wss://aurumvelare-gxlhhuyj.livekit.cloud';

var LIVEKIT_ROOMS = {
  hormiga:  'sala-hormiga',
  leon:     'sala-leon',
  elefante: 'sala-elefante',
  oso:      'sala-oso',
  toro:     'sala-toro',
  lobo:     'sala-lobo',
  aguila:   'sala-aguila',
};

// ── Entrar / salir ──────────────────────────────────────────

function entrarSala(tipo) {
  console.log('[LK] entrarSala() tipo:', tipo);
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
    aguila:   'Sala Águila',
    abierta:  'Sala Abierta · Unamos y venzamos',
    evento:   'Sala Evento',
  };

  var nombre = nombres[tipo] || 'Sala';
  document.getElementById('sala-nombre-header').textContent = nombre;
  document.getElementById('sala-chat-title').textContent    = nombre + ' · Chat';
  document.getElementById('sala-info-bar').textContent      = nombre + ' · Audio LiveKit';

  if (typeof usuarioActual !== 'undefined' && usuarioActual) {
    var nick = usuarioActual.nick || usuarioActual.nombre;
    document.getElementById('sala-tu-nick').textContent     = nick;
    document.getElementById('sala-tu-msg-name').textContent = nick + ' (Tú)';
    var ini = document.getElementById('sala-tu-inicial');
    if (ini) ini.textContent = nick.charAt(0).toUpperCase();
  }

  salaMicMuted = false;
  var btn    = document.getElementById('sala-btn-micro');
  var dot    = document.getElementById('sala-mic-dot-yo');
  var partYo = document.getElementById('sala-part-yo');
  if (btn)    { btn.textContent = '🎙 Micro'; btn.classList.add('on'); btn.style.color = ''; btn.style.borderColor = ''; }
  if (dot)    { dot.className = 'sala-mic-dot sala-mic-on'; }
  if (partYo) { partYo.classList.remove('sala-silenciado'); }

  var btnCompartir = document.getElementById('sala-btn-compartir');
  if (btnCompartir) {
    btnCompartir.textContent         = '⏳ Conectando…';
    btnCompartir.style.opacity       = '0.4';
    btnCompartir.style.pointerEvents = 'none';
  }

  // Red de seguridad: si en 10s LiveKit no conectó, restaurar el botón igualmente
  setTimeout(function() {
    var b = document.getElementById('sala-btn-compartir');
    if (b && b.style.pointerEvents === 'none') {
      console.warn('[LK] 10s sin conectar — restaurando botón Compartir');
      b.textContent         = '🖥 Compartir';
      b.style.opacity       = '';
      b.style.pointerEvents = '';
    }
  }, 10000);

  setTimeout(salaCargarChart, 120);
  setTimeout(function() { _conectarLiveKit(tipo); }, 200);
}

function salirDeSala() {
  _desconectarLiveKit();
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

// ── LiveKit ──────────────────────────────────────────────────

function _cargarLiveKitSDK(cb) {
  if (window.LivekitClient) {
    cb();
  } else {
    console.error('[LK] window.LivekitClient no disponible — el script del head no cargó');
    showToast('Error al cargar LiveKit SDK.');
  }
}

async function _getLiveKitToken(roomName) {
  var nick = (window.usuarioActual && (window.usuarioActual.nick || window.usuarioActual.nombre)) || 'Participante';
  var body = { room_name: roomName, participant_name: nick };
  console.log('[LK] token request → POST /api/livekit-token', body);
  try {
    var r = await fetch('/api/livekit-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var rawText = await r.text();
    console.log('[LK] token response — status:', r.status, '| body:', rawText);
    var data;
    try { data = JSON.parse(rawText); } catch (_) { data = {}; }
    if (!r.ok) {
      console.error('[LK] token error HTTP', r.status, data);
      return null;
    }
    if (!data.token) {
      console.error('[LK] token ausente en la respuesta:', data);
      return null;
    }
    var t = data.token;
    console.log('[LK] token ok para', roomName, '— longitud:', t.length, '| inicio:', t.slice(0, 20) + '…');
    return t;
  } catch (e) {
    console.error('[LK] token fetch exception:', e);
    return null;
  }
}

function _conectarLiveKit(tipo) {
  var roomName = LIVEKIT_ROOMS[tipo];
  if (!roomName) {
    console.warn('[LK] tipo "' + tipo + '" no está en LIVEKIT_ROOMS — sin conexión LiveKit');
    // Restaurar botón para tipos sin sala LiveKit (abierta, evento…)
    setTimeout(function() {
      var b = document.getElementById('sala-btn-compartir');
      if (b) { b.textContent = '🖥 Compartir'; b.style.opacity = ''; b.style.pointerEvents = ''; }
    }, 300);
    return;
  }

  _cargarLiveKitSDK(async function() {
    try {
    var LK = window.LivekitClient;
    if (!LK) { showToast('LiveKit SDK no disponible.'); return; }

    var token = await _getLiveKitToken(roomName);
    if (!token) { showToast('Error al obtener acceso a la sala.'); return; }

    livekitRoom = new LK.Room({ adaptiveStream: true, dynacast: true });

    // Diagnóstico: log de room.state cada segundo durante 10s
    var _diagTicks = 0;
    var _diagInterval = setInterval(function() {
      if (!livekitRoom) { clearInterval(_diagInterval); return; }
      console.log('[LK] tick ' + (++_diagTicks) + 's — room.state:', livekitRoom.state);
      if (_diagTicks >= 10) clearInterval(_diagInterval);
    }, 1000);

    // Manejador único de "ya conectado" (evita doble llamada)
    var _yaConectado = false;
    function _onConectado() {
      if (_yaConectado) return;
      _yaConectado = true;
      clearInterval(_diagInterval);
      console.log('[LK] conectado a', roomName);
      _lkConectado();
      livekitRoom.localParticipant.setMicrophoneEnabled(!salaMicMuted).catch(function(e) {
        console.error('[LK] mic error:', e);
      });
      _lkActualizarContador();
    }

    livekitRoom
      .on(LK.RoomEvent.Connected, function() {
        console.log('[LK] RoomEvent.Connected disparado');
        _onConectado();
      })
      .on(LK.RoomEvent.ConnectionStateChanged, function(state) {
        console.log('[LK] RoomEvent.ConnectionStateChanged →', state);
        if (state === 'connected') _onConectado();
      })
      .on(LK.RoomEvent.TrackSubscribed,         _lkTrackSubscribed)
      .on(LK.RoomEvent.TrackUnsubscribed,       _lkTrackUnsubscribed)
      .on(LK.RoomEvent.LocalTrackPublished,     _lkLocalTrackPublished)
      .on(LK.RoomEvent.LocalTrackUnpublished,   _lkLocalTrackUnpublished)
      .on(LK.RoomEvent.ParticipantConnected,    _lkActualizarContador)
      .on(LK.RoomEvent.ParticipantDisconnected, _lkActualizarContador)
      .on(LK.RoomEvent.ActiveSpeakersChanged,   _lkActiveSpeakers)
      .on(LK.RoomEvent.Disconnected, function() {
        console.log('[LK] desconectado');
        _lkLimpiarAudios();
      });

    // Timeout de seguridad a 5s
    setTimeout(function() {
      if (livekitRoom && livekitRoom.state === 'connected') {
        console.log('[LK] fallback 5s: estado connected, forzando _onConectado()');
        _onConectado();
      } else if (livekitRoom) {
        console.warn('[LK] fallback 5s: estado sigue siendo', livekitRoom.state);
      }
    }, 5000);

    // connect() sin await — la resolución se maneja via eventos
    console.log('[LK] llamando connect() — WS URL:', LIVEKIT_WS_URL, '| room:', roomName);
    livekitRoom.connect(LIVEKIT_WS_URL, token).then(function() {
      console.log('[LK] connect() promise resuelta — state:', livekitRoom ? livekitRoom.state : 'null');
      _onConectado();
    }).catch(function(e) {
      clearInterval(_diagInterval);
      console.error('[LK] connect() rejected — name:', e && e.name, '| message:', e && e.message);
      console.error('[LK] connect() error object completo:', e);
      try { console.error('[LK] connect() JSON:', JSON.stringify(e, Object.getOwnPropertyNames(e))); } catch (_) {}
      showToast('Error al conectar: ' + (e && e.message ? e.message : String(e)));
    });
    } catch (err) {
      console.error('[LK] error inesperado en _conectarLiveKit:', err);
      showToast('Error interno de LiveKit: ' + (err.message || String(err)));
    }
  });
}

function _lkConectado() {
  var infoBar = document.getElementById('sala-info-bar');
  if (infoBar) infoBar.textContent = '✦ LiveKit conectado';
  var btn = document.getElementById('sala-btn-compartir');
  if (btn) {
    btn.textContent         = '🖥 Compartir';
    btn.style.opacity       = '';
    btn.style.pointerEvents = '';
  }
}

function _lkTrackSubscribed(track, publication, participant) {
  var LK = window.LivekitClient;
  if (track.kind === LK.Track.Kind.Audio) {
    var el = track.attach();
    el.dataset.lkAudio = participant.identity;
    document.body.appendChild(el);
    return;
  }
  if (track.kind === LK.Track.Kind.Video &&
      publication.source === LK.Track.Source.ScreenShare) {
    _lkMostrarVideo(track, participant.identity + ' · pantalla');
  }
}

function _lkTrackUnsubscribed(track, publication, participant) {
  var LK = window.LivekitClient;
  track.detach();
  if (track.kind === LK.Track.Kind.Audio) {
    document.querySelectorAll('[data-lk-audio="' + participant.identity + '"]').forEach(function(el) { el.remove(); });
  }
  if (track.kind === LK.Track.Kind.Video &&
      publication.source === LK.Track.Source.ScreenShare) {
    _lkOcultarVideo();
  }
}

function _lkLocalTrackPublished(publication) {
  var LK = window.LivekitClient;
  if (publication.source === LK.Track.Source.ScreenShare && publication.track) {
    livekitScreenSharing = true;
    _lkMostrarVideo(publication.track, 'Tu pantalla');
    var btn = document.getElementById('sala-btn-compartir');
    if (btn) { btn.classList.add('on'); btn.textContent = '🟢 Compartiendo'; }
  }
}

function _lkLocalTrackUnpublished(publication) {
  var LK = window.LivekitClient;
  if (publication.source === LK.Track.Source.ScreenShare) {
    livekitScreenSharing = false;
    _lkOcultarVideo();
    var btn = document.getElementById('sala-btn-compartir');
    if (btn) { btn.classList.remove('on'); btn.textContent = '🖥 Compartir'; }
  }
}

function _lkActiveSpeakers(speakers) {
  var banner = document.getElementById('sala-hablando-banner');
  var nick   = document.getElementById('sala-hablando-nick');
  if (!banner || !nick) return;
  var remote = speakers.find(function(s) { return !s.isLocal; });
  if (remote) {
    banner.style.display = 'flex';
    nick.textContent = remote.identity;
  } else {
    banner.style.display = 'none';
  }
}

function _lkActualizarContador() {
  if (!livekitRoom) return;
  var n = livekitRoom.remoteParticipants.size + 1;
  var txt = n + ' conectado' + (n !== 1 ? 's' : '');
  var e1 = document.getElementById('sala-conectados');
  var e2 = document.getElementById('sala-chat-conectados');
  if (e1) e1.textContent = txt;
  if (e2) e2.textContent = txt;
}

function _lkHudShow() {
  var hud = document.getElementById('sala-video-hud');
  if (hud) hud.style.opacity = '1';
  clearTimeout(_lkHudTimer);
  _lkHudTimer = setTimeout(function() {
    var h = document.getElementById('sala-video-hud');
    if (h) h.style.opacity = '0';
  }, 3000);
}

function _lkMostrarVideo(track, label) {
  var overlay   = document.getElementById('sala-video-overlay');
  var container = document.getElementById('sala-video-container');
  var info      = document.getElementById('sala-video-room-info');
  if (!overlay || !container) return;
  container.innerHTML = '';
  var el = track.attach();
  el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;';
  container.appendChild(el);
  _lkCurrentLabel = label || '';
  if (info) info.textContent = label || 'Video activo';
  overlay.style.display = 'flex';

  // HUD: mostrar al activar y ocultar tras 3s; reaparecer al mover el ratón
  _lkHudShow();
  if (_lkHudHandler) overlay.removeEventListener('mousemove', _lkHudHandler);
  _lkHudHandler = function() { _lkHudShow(); };
  overlay.addEventListener('mousemove', _lkHudHandler);
}

function _lkOcultarVideo() {
  var overlay   = document.getElementById('sala-video-overlay');
  var container = document.getElementById('sala-video-container');
  if (container) container.innerHTML = '';
  if (overlay) {
    overlay.style.display = 'none';
    if (_lkHudHandler) {
      overlay.removeEventListener('mousemove', _lkHudHandler);
      _lkHudHandler = null;
    }
  }
  clearTimeout(_lkHudTimer);
  _lkHudTimer = null;
  _lkCurrentLabel = '';
}

function _lkLimpiarAudios() {
  document.querySelectorAll('[data-lk-audio]').forEach(function(el) { el.remove(); });
}

async function _desconectarLiveKit() {
  if (livekitRoom) {
    try { await livekitRoom.disconnect(); } catch (e) {}
    livekitRoom = null;
  }
  livekitScreenSharing = false;
  _lkLimpiarAudios();
  _lkOcultarVideo();
}

// ── Compartir pantalla ───────────────────────────────────────

async function salaCompartirPantalla() {
  console.log('[LK] salaCompartirPantalla() llamada — room:', livekitRoom ? livekitRoom.state : 'null', '| sharing:', livekitScreenSharing);
  if (!livekitRoom || livekitRoom.state !== 'connected') {
    showToast('Espera a estar conectado antes de compartir.');
    return;
  }
  try {
    if (livekitScreenSharing) {
      await livekitRoom.localParticipant.setScreenShareEnabled(false);
    } else {
      await livekitRoom.localParticipant.setScreenShareEnabled(true);
    }
  } catch (e) {
    if (e && e.name !== 'NotAllowedError') {
      console.error('[LK] screenshare error:', e);
      showToast('Error al compartir pantalla.');
    }
  }
}

function cerrarLiveKitVideo() {
  _lkOcultarVideo();
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
  } else {
    if (btn)    { btn.textContent = '🎙 Micro'; btn.classList.add('on'); btn.style.color = ''; btn.style.borderColor = ''; }
    if (dot)    { dot.className = 'sala-mic-dot sala-mic-on'; }
    if (partYo) { partYo.classList.remove('sala-silenciado'); }
  }
  if (livekitRoom) {
    livekitRoom.localParticipant.setMicrophoneEnabled(!salaMicMuted).catch(function(e) {
      console.error('[LK] mic error:', e);
    });
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
  if (document.fullscreenElement) {
    var exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
    if (exit) exit.call(document);
    return;
  }
  // Si hay screenshare activo, poner el overlay en fullscreen; si no, la página completa
  var overlay = document.getElementById('sala-video-overlay');
  var el = (overlay && overlay.style.display !== 'none') ? overlay : document.documentElement;
  var req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
  if (req) req.call(el);
}

function salaVideoFullscreen() {
  if (document.fullscreenElement) {
    var exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
    if (exit) exit.call(document);
    return;
  }
  var el = document.getElementById('sala-video-overlay');
  if (!el) return;
  var req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
  if (req) req.call(el);
}

document.addEventListener('fullscreenchange',       _salaFullscreenChange);
document.addEventListener('webkitfullscreenchange', _salaFullscreenChange);

function _salaFullscreenChange() {
  var isFs  = !!document.fullscreenElement;
  var icon  = document.getElementById('sala-fullscreen-icon');
  var label = document.getElementById('sala-fullscreen-label');
  var fsBtn = document.getElementById('sala-video-fs-btn');
  if (icon)  icon.textContent  = isFs ? '⤡' : '⤢';
  if (label) label.textContent = isFs ? 'Salir pantalla completa' : 'Pantalla completa';
  if (fsBtn) fsBtn.textContent = isFs ? '⤡ Salir pantalla completa' : '⤢ Pantalla completa';

  var overlay = document.getElementById('sala-video-overlay');
  if (isFs && document.fullscreenElement === overlay) {
    _lkBrandCreate(overlay);
  } else {
    _lkBrandDestroy(overlay);
  }
}

function _lkBrandCreate(overlay) {
  _lkBrandDestroy(overlay);
  var brand = document.createElement('div');
  brand.id = 'lk-brand-overlay';
  brand.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:30;transition:opacity .35s ease;';

  var left = document.createElement('span');
  left.textContent = '✦ AURUM VELARE';
  left.style.cssText = 'position:absolute;top:.8rem;left:1.2rem;font-family:\'Cormorant Garamond\',serif;font-size:28px;font-weight:300;letter-spacing:.55em;text-transform:uppercase;color:#C9A84C;opacity:.9;line-height:1;';

  var right = document.createElement('span');
  right.textContent = _lkCurrentLabel || '';
  right.style.cssText = 'position:absolute;top:1.1rem;right:1.2rem;font-family:\'Cormorant Garamond\',serif;font-size:13px;font-weight:300;letter-spacing:.25em;text-transform:uppercase;color:#C9A84C;opacity:.8;';

  brand.appendChild(left);
  brand.appendChild(right);
  overlay.appendChild(brand);

  _lkBrandShow();
  if (_lkBrandHandler) overlay.removeEventListener('mousemove', _lkBrandHandler);
  _lkBrandHandler = function() { _lkBrandShow(); };
  overlay.addEventListener('mousemove', _lkBrandHandler);
}

function _lkBrandShow() {
  var brand = document.getElementById('lk-brand-overlay');
  if (brand) brand.style.opacity = '1';
  clearTimeout(_lkBrandTimer);
  _lkBrandTimer = setTimeout(function() {
    var b = document.getElementById('lk-brand-overlay');
    if (b) b.style.opacity = '0';
  }, 3000);
}

function _lkBrandDestroy(overlay) {
  var existing = document.getElementById('lk-brand-overlay');
  if (existing) existing.remove();
  clearTimeout(_lkBrandTimer);
  _lkBrandTimer = null;
  if (overlay && _lkBrandHandler) {
    overlay.removeEventListener('mousemove', _lkBrandHandler);
    _lkBrandHandler = null;
  }
}
