// api/trade-evento.js
// Recibe los eventos intermedios de gestion del EA (entrada, breakeven,
// parcial, cierre) y los persiste en trade_eventos, para la linea de tiempo
// de auditoria que se muestra en el Diario. Mismo patron de auth, helpers y
// estilo que api/trade-mt5.js. Ver: brief_diario_linea_tiempo_ea.md (seccion 3)

const SUPA_URL = process.env.SUPABASE_URL || 'https://rsrbxcvlnbwpiyhumqmt.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
const EA_SHARED_SECRET = process.env.EA_SHARED_SECRET;

const TIPOS_VALIDOS = ['entrada', 'breakeven', 'parcial', 'cierre'];

function _headers(prefer) {
  const h = {
    'apikey':        SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type':  'application/json'
  };
  if (prefer) h['Prefer'] = prefer;
  return h;
}

async function _get(table, params) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`, { headers: _headers() });
  if (!r.ok) throw new Error(`GET ${table} ${r.status}: ${await r.text()}`);
  return r.json();
}

async function _patch(table, params, body) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`, {
    method: 'PATCH',
    headers: _headers('return=minimal'),
    body: JSON.stringify(body)
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text };
}

// Detección de desfase Token/ea_password — mismo mecanismo que
// api/trade-mt5.js (ver sql_ea_auth_sync.sql). Best-effort: nunca debe
// romper el flujo de autenticación real.
async function _recordEaSync(email, patch) {
  if (!email) return;
  try {
    await _patch('usuarios_aurum', `email=eq.${encodeURIComponent(email)}`,
      Object.assign({ ea_ultimo_intento_en: new Date().toISOString() }, patch));
  } catch (err) {
    console.warn('[trade-evento] no se pudo registrar estado de sincronización EA:', err.message);
  }
}

// Insert idempotente: on_conflict sobre el indice unico (fp, tipo_evento,
// timestamp) creado en la fase 1. Si el EA reintenta el WebRequest y esa
// fila ya existe, Postgres la ignora (DO NOTHING) en vez de duplicarla o de
// devolver un 409.
async function _insertEvento(row) {
  const url = `${SUPA_URL}/rest/v1/trade_eventos?on_conflict=fp,tipo_evento,timestamp`;
  const r = await fetch(url, {
    method: 'POST',
    headers: _headers('resolution=ignore-duplicates,return=representation'),
    body: JSON.stringify(row)
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text };
}

// ── Handler principal ─────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPA_KEY)             return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY no configurada' });
  if (!EA_SHARED_SECRET)     return res.status(500).json({ error: 'EA_SHARED_SECRET no configurada' });

  const {
    token, email, cuenta_numero, ea_password,
    fp, tipo_evento, puntos_desde_entrada, precio, volumen_afectado, timestamp
  } = req.body || {};

  if (token !== EA_SHARED_SECRET) {
    console.error('[trade-evento] Token: rechazado — email:', email || '(sin email)', '| cuenta:', cuenta_numero || '(sin cuenta)');
    await _recordEaSync(email, { ea_token_match: false });
    return res.status(401).json({ error: 'Token inválido o ausente' });
  }

  if (!email || !cuenta_numero) {
    return res.status(400).json({ error: 'Campos requeridos: email, cuenta_numero' });
  }

  if (!fp || !tipo_evento || !timestamp) {
    return res.status(400).json({ error: 'Campos requeridos: fp, tipo_evento, timestamp' });
  }

  if (!TIPOS_VALIDOS.includes(tipo_evento)) {
    return res.status(400).json({ error: 'tipo_evento inválido: ' + tipo_evento + ' (válidos: ' + TIPOS_VALIDOS.join(', ') + ')' });
  }

  // Validar usuario y acceso EA — mismo patrón que trade-mt5.js
  let user;
  try {
    const rows = await _get(
      'usuarios_aurum',
      `email=eq.${encodeURIComponent(email)}&select=email,tiene_ea,cuenta_maestra,cuenta_retos,cuenta_prueba,ea_password&limit=1`
    );
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(403).json({ error: 'Usuario no encontrado: ' + email });
    }
    user = rows[0];
  } catch (err) {
    console.error('[trade-evento] error validando usuario:', err.message);
    return res.status(500).json({ error: 'Error de validación' });
  }

  if (!user.tiene_ea) {
    return res.status(403).json({ error: 'El usuario no tiene acceso al EA Aurum' });
  }

  // ea_password obligatoria — misma capa que trade-mt5.js (Token = "es un EA
  // legítimo", ea_password = "es la cuenta correcta").
  const eaPasswordMatch = !!user.ea_password && ea_password === user.ea_password;
  await _recordEaSync(email, {
    ea_token_match: true, // si llegamos aquí, el Token ya pasó arriba
    ea_password_match: eaPasswordMatch,
    ea_password_ultimo_recibido: ea_password != null ? ea_password : null
  });
  if (!eaPasswordMatch) {
    console.error('[trade-evento] ea_password: rechazado para', email, '— no coincide o falta');
    return res.status(401).json({ error: 'ea_password inválida o ausente' });
  }

  // Resolver nombre de carpeta desde número de cuenta y verificar que
  // pertenece al usuario — mismo patrón que trade-mt5.js
  let cuentaNombre = 'Cuenta Externa';
  const cn = String(cuenta_numero);
  if (user.cuenta_maestra && String(user.cuenta_maestra) === cn) cuentaNombre = 'Cuenta Maestra';
  else if (user.cuenta_retos   && String(user.cuenta_retos)   === cn) cuentaNombre = 'Cuenta Retos';
  else if (user.cuenta_prueba  && String(user.cuenta_prueba)  === cn) cuentaNombre = 'Cuenta Prueba';

  if (cuentaNombre === 'Cuenta Externa') {
    return res.status(403).json({ error: 'cuenta_numero no pertenece al usuario: ' + cn });
  }

  // Insertar evento (idempotente por fp + tipo_evento + timestamp)
  const row = {
    fp,
    tipo_evento,
    puntos_desde_entrada: puntos_desde_entrada != null ? puntos_desde_entrada : null,
    precio:               precio               != null ? precio               : null,
    volumen_afectado:     volumen_afectado      != null ? volumen_afectado     : null,
    timestamp
  };

  let r;
  try {
    r = await _insertEvento(row);
  } catch (err) {
    console.error('[trade-evento] excepción insertando evento:', err.message);
    return res.status(500).json({ error: err.message });
  }

  if (!r.ok) {
    console.error('[trade-evento] INSERT error:', r.status, r.body);
    return res.status(500).json({ error: 'Error guardando evento', detail: r.body });
  }

  // Con 'resolution=ignore-duplicates', si la fila ya existía (retry del
  // mismo WebRequest) Postgres no inserta nada y el body vuelve como '[]'.
  // Lo distinguimos solo para el log — no es un error para el EA, la fila ya
  // quedó guardada la vez anterior.
  let inserted = [];
  try { inserted = r.body ? JSON.parse(r.body) : []; } catch (e) { /* body vacío o no-JSON, ignorar */ }
  const action = Array.isArray(inserted) && inserted.length ? 'inserted' : 'skipped_duplicate';

  console.log('[trade-evento]', action, '— fp:', fp, '| tipo_evento:', tipo_evento, '| timestamp:', timestamp);
  return res.status(200).json({ ok: true, event: tipo_evento, fp, action });
};
