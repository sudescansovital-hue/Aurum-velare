function entrarSala(tipo) {
  document.getElementById('salas-lista').style.display = 'none';
  document.getElementById('sala-interior').style.display = 'block';
  window.scrollTo(0,0);

  const nombres = {
    leon:     'Sala León',
    hormiga:  'Sala Hormiga',
    oso:      'Sala Oso',
    toro:     'Sala Toro',
    elefante: 'Sala Elefante',
    lobo:     'Sala Lobo',
    abierta:  'Sala Abierta · Unamos y venzamos',
    evento:   'Sala Evento',
  };

  const nombre = nombres[tipo] || 'Sala';
  document.getElementById('sala-nombre-header').textContent = nombre;
  document.getElementById('sala-chat-title').textContent = nombre + ' · Chat';
  document.getElementById('sala-info-bar').textContent = nombre + ' · Solo audio';

  if (typeof usuarioActual !== 'undefined' && usuarioActual) {
    const nick = usuarioActual.nick || usuarioActual.nombre;
    document.getElementById('sala-tu-nick').textContent = nick;
    document.getElementById('sala-tu-msg-name').textContent = nick + ' (Tú)';
  }
}

function salirDeSala() {
  document.getElementById('sala-interior').style.display = 'none';
  document.getElementById('salas-lista').style.display = 'block';
  window.scrollTo(0,0);
}

function enviarMensajeSala() {
  const input = document.getElementById('sala-chat-input');
  const texto = input.value.trim();
  if (!texto) return;

  const msgs = document.getElementById('sala-chat-msgs');
  const nick = (typeof usuarioActual !== 'undefined' && usuarioActual)
    ? (usuarioActual.nick || usuarioActual.nombre)
    : 'Usuario';

  const ahora = new Date();
  const hora = `${ahora.getHours().toString().padStart(2,'0')}:${ahora.getMinutes().toString().padStart(2,'0')}`;

  const msg = document.createElement('div');
  msg.style.cssText = 'border-left:2px solid var(--gold);padding-left:.6rem;';
  msg.innerHTML = `
    <div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.2rem;">
      <div style="font-size:15px;">—</div>
      <div style="font-size:13px;color:var(--gold-bright);">${nick} (Tú)</div>
      <div style="font-size:10px;color:var(--text-muted);margin-left:auto;">${hora}</div>
    </div>
    <div style="font-size:15px;color:var(--text-dim);line-height:1.6;">${texto}</div>
  `;
  msgs.appendChild(msg);
  msgs.scrollTop = msgs.scrollHeight;
  input.value = '';
}
