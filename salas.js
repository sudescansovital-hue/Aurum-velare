var salaMicMuted   = false;
var salaTvCargado  = false;

// ── Entrar / salir ──────────────────────────────────────────

function entrarSala(tipo) {
  document.getElementById('salas-lista').style.display  = 'none';
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
  document.getElementById('sala-nombre-header').textContent  = nombre;
  document.getElementById('sala-chat-title').textContent     = nombre + ' · Chat';
  document.getElementById('sala-info-bar').textContent       = nombre + ' · Solo audio';

  if (typeof usuarioActual !== 'undefined' && usuarioActual) {
    var nick = usuarioActual.nick || usuarioActual.nombre;
    document.getElementById('sala-tu-nick').textContent      = nick;
    document.getElementById('sala-tu-msg-name').textContent  = nick + ' (Tú)';
    if (document.getElementById('sala-tu-inicial')) {
      document.getElementById('sala-tu-inicial').textContent = nick.charAt(0).toUpperCase();
    }
  }

  // Resetear estado del micro
  salaMicMuted = false;
  var btn = document.getElementById('sala-btn-micro');
  var dot = document.getElementById('sala-mic-dot-yo');
  var partYo = document.getElementById('sala-part-yo');
  if (btn)    { btn.textContent = '🎙 Micro'; btn.classList.add('on'); btn.style.color = ''; btn.style.borderColor = ''; }
  if (dot)    { dot.className = 'sala-mic-dot sala-mic-on'; }
  if (partYo) { partYo.classList.remove('sala-silenciado'); }

  // Cargar gráfico TradingView (lazy)
  setTimeout(salaCargarChart, 120);
}

function salirDeSala() {
  document.getElementById('sala-interior').style.display  = 'none';
  document.getElementById('salas-lista').style.display    = 'block';
  // Salir de fullscreen si estaba activo
  if (document.fullscreenElement) {
    document.exitFullscreen && document.exitFullscreen();
  }
  window.scrollTo(0, 0);
}

// ── Chat ────────────────────────────────────────────────────

function enviarMensajeSala() {
  var input = document.getElementById('sala-chat-input');
  var texto = input.value.trim();
  if (!texto) return;

  var msgs = document.getElementById('sala-chat-msgs');
  var nick = (typeof usuarioActual !== 'undefined' && usuarioActual)
    ? (usuarioActual.nick || usuarioActual.nombre)
    : 'Usuario';

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

// ── Micro: silenciar / activar ──────────────────────────────

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
}

// ── Gráfico TradingView ─────────────────────────────────────

function salaCargarChart() {
  if (salaTvCargado) return;

  if (typeof TradingView !== 'undefined') {
    _initTvWidget();
    return;
  }

  // Cargar tv.js de forma lazy (no impacta el tiempo de carga inicial)
  var script  = document.createElement('script');
  script.src  = 'https://s3.tradingview.com/tv.js';
  script.onload = _initTvWidget;
  document.head.appendChild(script);
}

function _initTvWidget() {
  if (salaTvCargado) return;
  salaTvCargado = true;
  try {
    new TradingView.widget({
      container_id:      'sala-tv-container',
      autosize:          true,
      symbol:            'OANDA:XAUUSD',
      interval:          '240',
      timezone:          'Europe/Madrid',
      theme:             'dark',
      style:             '1',
      locale:            'es',
      allow_symbol_change: true,
      withdateranges:    true,
      hide_side_toolbar: false
    });
  } catch (e) {
    console.warn('TradingView widget error:', e);
  }
}

// ── Pantalla completa ───────────────────────────────────────

function salaFullscreen() {
  var el = document.getElementById('sala-chart-wrap');
  if (!el) return;

  if (!document.fullscreenElement) {
    var req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    if (req) req.call(el);
  } else {
    var exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
    if (exit) exit.call(document);
  }
}

// Actualizar icono/etiqueta del botón al cambiar estado fullscreen
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
