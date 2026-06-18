// Recibe pagos de Stripe, genera código Evalúame y manda email al cliente

const crypto = require('crypto');

const SUPA_URL = process.env.SUPABASE_URL || 'https://rsrbxcvlnbwpiyhumqmt.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

function generarCodigo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const parte = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return parte() + '-' + parte();
}

function verificarFirmaStripe(rawBody, sigHeader, secret) {
  const parts = sigHeader.split(',');
  const t = parts.find(p => p.startsWith('t='))?.slice(2);
  const v1 = parts.find(p => p.startsWith('v1='))?.slice(3);
  if (!t || !v1) return false;

  const payload = `${t}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

async function mandarEmailCodigo(email, codigo) {
  const html = `
    <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;background:#060810;color:#C8B88A;padding:2rem;border:1px solid #2A2010;">
      <div style="text-align:center;margin-bottom:1.5rem;">
        <div style="font-size:22px;letter-spacing:.4em;color:#C9A84C;">✦ AURUM VELARE</div>
        <div style="font-size:12px;color:#666;letter-spacing:.2em;margin-top:.3rem;">CÓDIGO DE EVALUACIÓN</div>
      </div>
      <p style="font-size:15px;color:#C8B88A;line-height:1.8;">Gracias por tu pago. Tu código de evaluación es:</p>
      <div style="text-align:center;margin:2rem 0;padding:1.5rem;background:#0A0C18;border:1px solid #C9A84C;">
        <div style="font-family:'Courier New',monospace;font-size:28px;letter-spacing:.3em;color:#C9A84C;">${codigo}</div>
      </div>
      <p style="font-size:14px;color:#888;line-height:1.8;">Para usarlo, entra en <a href="https://aurumvelare.com" style="color:#C9A84C;">aurumvelare.com</a>, ve a la sección <strong style="color:#C8B88A;">✦ Evalúame</strong> y pulsa <em>"¿Ya tienes código? Introducirlo aquí"</em>.</p>
      <p style="font-size:13px;color:#666;margin-top:1rem;">Este código es de un solo uso y válido hasta que lo actives.</p>
      <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid #1A1A2A;text-align:center;">
        <a href="https://aurumvelare.com" style="font-size:11px;color:#666;letter-spacing:.15em;">aurumvelare.com</a>
      </div>
    </div>
  `;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Aurum Velare <onboarding@resend.dev>',
      to: [email],
      subject: '✦ Tu código de evaluación — Aurum Velare',
      html
    })
  });
  return r.ok;
}

async function guardarCodigoSupabase(email, codigo) {
  const r = await fetch(`${SUPA_URL}/rest/v1/usuarios_aurum?email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ codigo_eval: codigo })
  });
  return r.ok;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

  const sigHeader = req.headers['stripe-signature'];
  if (!sigHeader || !WEBHOOK_SECRET || !verificarFirmaStripe(rawBody, sigHeader, WEBHOOK_SECRET)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (event.type !== 'checkout.session.completed' && event.type !== 'payment_intent.succeeded') {
    return res.status(200).json({ received: true });
  }

  let email = null;
  if (event.type === 'checkout.session.completed') {
    email = event.data?.object?.customer_details?.email || event.data?.object?.customer_email;
  } else {
    email = event.data?.object?.receipt_email;
  }

  if (!email) return res.status(200).json({ received: true, note: 'no email' });

  // Filtrar solo pagos de Evalúame (33€ = 3300 centavos)
  const amount = event.data?.object?.amount_total || event.data?.object?.amount;
  if (amount && amount !== 3300) {
    return res.status(200).json({ received: true, note: 'not evalua payment' });
  }

  const codigo = generarCodigo();
  await guardarCodigoSupabase(email, codigo);
  await mandarEmailCodigo(email, codigo);

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Aurum Velare <onboarding@resend.dev>',
      to: ['sudescansovital@gmail.com'],
      subject: '✦ Pago Evalúame — ' + email,
      html: `<p>Nuevo pago de <strong>${email}</strong>. Código: <strong>${codigo}</strong></p>`
    })
  });

  return res.status(200).json({ ok: true });
};
