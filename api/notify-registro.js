// api/notify-registro.js
// Recibe datos del nuevo registro y envía email a sudescansovital@gmail.com via Resend

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, nick, animal } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' });

  const ANIMAL_NOMBRE = {
    hormiga:  '🐜 Hormiga — Disciplina · Repetición',
    leon:     '🦁 León — Presencia · Convicción',
    elefante: '🐘 Elefante — Memoria · Control emocional',
    oso:      '🐻 Oso — Paciencia · Protección',
    toro:     '🐂 Toro — Expansión · Momentum',
    lobo:     '🐺 Lobo — Instinto · Adaptación',
  };

  const ahora = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
  const animalTexto = ANIMAL_NOMBRE[animal] || animal || '—';

  const html = `
    <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;background:#060810;color:#C8B88A;padding:2rem;border:1px solid #2A2010;">
      <div style="text-align:center;margin-bottom:1.5rem;">
        <div style="font-size:22px;letter-spacing:.4em;color:#C9A84C;">✦ AURUM VELARE</div>
        <div style="font-size:12px;color:#666;letter-spacing:.2em;margin-top:.3rem;">NUEVO REGISTRO</div>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:.5rem 0;color:#888;font-size:13px;width:120px;">Email</td><td style="padding:.5rem 0;color:#C8B88A;font-size:14px;">${email}</td></tr>
        <tr><td style="padding:.5rem 0;color:#888;font-size:13px;">Nick</td><td style="padding:.5rem 0;color:#C8B88A;font-size:14px;">${nick || '—'}</td></tr>
        <tr><td style="padding:.5rem 0;color:#888;font-size:13px;">Animal</td><td style="padding:.5rem 0;color:#C8B88A;font-size:14px;">${animalTexto}</td></tr>
        <tr><td style="padding:.5rem 0;color:#888;font-size:13px;">Fecha</td><td style="padding:.5rem 0;color:#666;font-size:13px;">${ahora}</td></tr>
      </table>
      <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid #1A1A2A;text-align:center;">
        <a href="https://aurumvelare.com" style="font-size:11px;color:#666;letter-spacing:.15em;">aurumvelare.com</a>
      </div>
    </div>
  `;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Aurum Velare <send@aurumvelare.com>',
        to: ['sudescansovital@gmail.com'],
        subject: '✦ Nuevo registro — ' + (nick || email),
        html: html
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: data });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
