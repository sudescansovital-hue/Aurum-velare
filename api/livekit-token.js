const { AccessToken } = require('livekit-server-sdk');

const SUPA_URL      = process.env.SUPABASE_URL || 'https://rsrbxcvlnbwpiyhumqmt.supabase.co';
const SUPA_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzcmJ4Y3ZsbmJ3cGl5aHVtcW10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzNTAsImV4cCI6MjA5NTIyMjM1MH0.DpcY9s7DK7l4qVHmint9HQIJK6icnwnfbGvQ-XH15mY'; // idéntica a supabase.js — pública por diseño
const SUPA_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_EMAIL   = 'sudescansovital@gmail.com'; // misma constante que app.js/admin.js

// usuarios_aurum.animal se guarda como emoji (mismo formato que admin.js
// ANIMAL_SALA y el onboarding), no como slug — hay que traducir antes de comparar.
const ANIMAL_SLUG = {
  '🐝': 'hormiga', '🦁': 'leon', '🐘': 'elefante',
  '🐻': 'oso',     '🐂': 'toro', '🐺': 'lobo',
};

// Debe mantenerse sincronizado a mano con LIVEKIT_ROOMS en salas.js:45-53.
// sala-abierta va preparada pero el frontend hoy no la llama (LIVEKIT_ROOMS
// no tiene 'abierta') — queda lista para cuando se active, sin efecto ahora.
// Sala Evento y Sala Privada NO están aquí a propósito: no existe nada que
// las active hoy (confirmado en salas.js/index.html), se deniegan por
// defecto como cualquier room_name desconocido.
const SALAS = {
  'sala-hormiga':  { tipo: 'animal',  animal: 'hormiga'  },
  'sala-leon':     { tipo: 'animal',  animal: 'leon'     },
  'sala-elefante': { tipo: 'animal',  animal: 'elefante' },
  'sala-oso':      { tipo: 'animal',  animal: 'oso'      },
  'sala-toro':     { tipo: 'animal',  animal: 'toro'     },
  'sala-lobo':     { tipo: 'animal',  animal: 'lobo'     },
  'sala-aguila':   { tipo: 'admin'   },
  'sala-abierta':  { tipo: 'abierta' },
};

async function _emailDesdeToken(token) {
  if (!token) return null;
  const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { apikey: SUPA_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  return (data && data.email) || null;
}

async function _perfilUsuario(email) {
  const r = await fetch(
    `${SUPA_URL}/rest/v1/usuarios_aurum?email=eq.${encodeURIComponent(email)}&select=animal,pack,activo&limit=1`,
    { headers: { apikey: SUPA_SERVICE_KEY, Authorization: `Bearer ${SUPA_SERVICE_KEY}` } }
  );
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return (Array.isArray(rows) && rows[0]) || null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { room_name, participant_name } = req.body || {};
  if (!room_name) {
    return res.status(400).json({ error: 'room_name required' });
  }

  if (!SUPA_SERVICE_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const email = await _emailDesdeToken(token);
  if (!email) {
    return res.status(401).json({ error: 'Sesión no válida. Vuelve a iniciar sesión.' });
  }

  const sala = SALAS[room_name];
  if (!sala) {
    return res.status(403).json({ error: 'Sala no reconocida.' });
  }

  const esAdmin = email === ADMIN_EMAIL;

  if (sala.tipo === 'admin' && !esAdmin) {
    return res.status(403).json({ error: 'Sala reservada al Águila.' });
  }

  if ((sala.tipo === 'animal' || sala.tipo === 'abierta') && !esAdmin) {
    const perfil = await _perfilUsuario(email);
    if (!perfil || !perfil.activo || !perfil.pack) {
      return res.status(403).json({ error: 'Necesitas un Camino activo para entrar a las salas.' });
    }
    if (sala.tipo === 'animal') {
      const esCima     = perfil.pack === 'cima';
      const esSuAnimal = perfil.animal && ANIMAL_SLUG[perfil.animal] === sala.animal;
      if (!esCima && !esSuAnimal) {
        return res.status(403).json({ error: 'No tienes acceso a esta sala.' });
      }
    }
  }

  const apiKey    = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participant_name || email,
    ttl: '2h',
  });

  at.addGrant({
    roomJoin:       true,
    room:           room_name,
    canPublish:     true,
    canSubscribe:   true,
    canPublishData: true,
  });

  const token_lk = await at.toJwt();
  return res.status(200).json({ token: token_lk });
};
