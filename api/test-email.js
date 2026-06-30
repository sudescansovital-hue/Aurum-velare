// ENDPOINT TEMPORAL — borrar después de confirmar que Resend funciona
// GET /api/test-email?dominio=resend  → prueba con onboarding@resend.dev
// GET /api/test-email?dominio=custom  → prueba con send@aurumvelare.com (dominio verificado)
// GET /api/test-email                  → prueba ambos

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Solo GET' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'RESEND_API_KEY no configurada en Vercel' });

  const modo = req.query.dominio; // 'resend', 'custom', o undefined (ambos)
  const DEST = 'sudescansovital@gmail.com';
  const ahora = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });

  async function enviar(from, label) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [DEST],
        subject: `✦ Test Resend [${label}] — ${ahora}`,
        html: `
          <div style="font-family:Georgia,serif;max-width:480px;background:#060810;color:#C8B88A;padding:2rem;border:1px solid #2A2010;">
            <div style="text-align:center;margin-bottom:1rem;">
              <div style="font-size:20px;letter-spacing:.4em;color:#C9A84C;">✦ AURUM VELARE</div>
              <div style="font-size:11px;color:#666;letter-spacing:.2em;margin-top:.3rem;">TEST EMAIL</div>
            </div>
            <p style="font-size:14px;">Email de prueba enviado correctamente.</p>
            <table style="width:100%;font-size:13px;">
              <tr><td style="color:#888;padding:.3rem 0;width:100px;">From</td><td style="color:#C8B88A;">${from}</td></tr>
              <tr><td style="color:#888;padding:.3rem 0;">To</td><td style="color:#C8B88A;">${DEST}</td></tr>
              <tr><td style="color:#888;padding:.3rem 0;">Hora</td><td style="color:#666;">${ahora}</td></tr>
              <tr><td style="color:#888;padding:.3rem 0;">Modo</td><td style="color:#C9A84C;">${label}</td></tr>
            </table>
            <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid #1A1A2A;text-align:center;font-size:11px;color:#666;">
              Borrar /api/test-email.js después de confirmar
            </div>
          </div>
        `
      })
    });
    const data = await r.json();
    return { label, from, ok: r.ok, status: r.status, resend: data };
  }

  const resultados = [];

  if (!modo || modo === 'resend') {
    resultados.push(await enviar('Aurum Velare <onboarding@resend.dev>', 'resend.dev (actual)'));
  }

  if (!modo || modo === 'custom') {
    resultados.push(await enviar('Aurum Velare <send@aurumvelare.com>', 'aurumvelare.com (dominio propio)'));
  }

  const todoOk = resultados.every(r => r.ok);
  return res.status(todoOk ? 200 : 207).json({ resultados });
};
