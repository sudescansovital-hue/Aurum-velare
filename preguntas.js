// Contador de caracteres
const input = document.getElementById('pregunta-input');
if (input) {
  input.addEventListener('input', function() {
    const count = this.value.length;
    const counter = document.getElementById('pregunta-contador');
    if (counter) {
      counter.textContent = count + ' / 280';
      counter.style.color = count > 250 ? 'var(--red)' : 'var(--text-muted)';
    }
  });
}

function solicitarTablilla() {
  // En producción: formulario de encargo con Stripe
  const modal = document.createElement('div');
  modal.id='modal-tablilla'; modal.style.cssText = 'position:fixed;inset:0;background:#080A12EE;display:flex;align-items:center;justify-content:center;z-index:1000;';
  modal.innerHTML = `
    <div style="border:1px solid var(--border-gold);background:var(--bg2);padding:2.5rem;max-width:480px;width:90%;text-align:center;position:relative;">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);"></div>
      <div onclick="document.getElementById('modal-tablilla').remove()" style="position:absolute;top:.8rem;right:.8rem;cursor:pointer;color:var(--text-muted);font-size:16px;opacity:.5;">✕</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:28px;color:var(--gold-bright);margin-bottom:.5rem;">Tu tablilla</div>
      <p style="font-size:14px;color:var(--text-muted);line-height:1.9;margin-bottom:1.5rem;">
        Grabado láser en madera de roble. Tu pregunta, el símbolo Aurum y la fecha. Envío a toda España.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);margin-bottom:1.5rem;">
        <div style="background:var(--bg2);padding:1rem;text-align:center;">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:.3rem;">Pequeña · 15x5cm</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:28px;color:var(--gold-bright);">22€</div>
        </div>
        <div style="background:var(--bg2);padding:1rem;text-align:center;border:1px solid var(--border-gold);">
          <div style="font-size:11px;color:var(--gold);margin-bottom:.3rem;">Grande · 25x8cm</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:28px;color:var(--gold-bright);">33€</div>
        </div>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:1.5rem;font-style:italic;">Disponible próximamente. Déjanos tu email y te avisamos.</p>
      <div style="display:flex;gap:.5rem;">
        <input type="email" placeholder="tu@email.com" style="flex:1;background:#060810;border:1px solid var(--border);padding:.7rem 1rem;font-size:14px;color:var(--text);font-family:'Outfit',sans-serif;outline:none;" id="tablilla-email">
        <div onclick="avisarTablilla()" class="btn-gold" style="padding:.7rem 1.2rem;white-space:nowrap;font-size:13px;">Avisarme</div>
      </div>
      <div id="tablilla-msg" style="font-size:12px;color:var(--green);margin-top:.8rem;min-height:18px;"></div>
    </div>
  `;
  document.body.appendChild(modal);
}

function avisarTablilla() {
  const email = document.getElementById('tablilla-email').value.trim();
  const msg   = document.getElementById('tablilla-msg');
  if (!email || !email.includes('@')) {
    msg.style.color = 'var(--red)';
    msg.textContent = 'Introduce un email válido.';
    return;
  }
  msg.style.color = 'var(--green)';
  msg.textContent = '✓ Anotado. Te avisamos cuando estén disponibles.';
}

function enviarPregunta() {
  const texto = document.getElementById('pregunta-input').value.trim();
  const msg   = document.getElementById('pregunta-msg');

  if (!texto) {
    msg.style.color = 'var(--red)';
    msg.textContent = 'Escribe tu pregunta antes de enviar.';
    return;
  }

  if (texto.length < 10) {
    msg.style.color = 'var(--red)';
    msg.textContent = 'La pregunta es demasiado corta.';
    return;
  }

  // En producción: guardar en Supabase con email opcional y notificar a Aurum
  const email = document.getElementById('pregunta-email').value.trim();
  msg.style.color = 'var(--green)';
  msg.textContent = email
    ? '✓ Recibida. Si la publicamos te avisamos en ' + email + '.'
    : '✓ Recibida. Aurum la revisará. Si resuena, aparecerá aquí.';
  document.getElementById('pregunta-input').value = '';
  document.getElementById('pregunta-contador').textContent = '0 / 280';
  document.getElementById('pregunta-email').value = '';
}
