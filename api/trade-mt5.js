// api/trade-mt5.js
// Recibe eventos del EA_Aurum_Tracker via WebRequest y los persiste en Supabase.
// Eventos: open | sl_change | partial_close | close

const SUPA_URL = process.env.SUPABASE_URL || 'https://rsrbxcvlnbwpiyhumqmt.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

function _headers() {
  return {
    'apikey':        SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type':  'application/json'
  };
}

async function _get(table, params) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`, { headers: _headers() });
  if (!r.ok) throw new Error(`GET ${table} ${r.status}: ${await r.text()}`);
  return r.json();
}

async function _post(table, body, prefer) {
  const h = Object.assign(_headers(), prefer ? { 'Prefer': prefer } : {});
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: 'POST', headers: h, body: JSON.stringify(body)
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text };
}

async function _patch(table, params, body) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`, {
    method: 'PATCH',
    headers: Object.assign(_headers(), { 'Prefer': 'return=minimal' }),
    body: JSON.stringify(body)
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text };
}

// ── Handlers por evento ───────────────────────────────────────────────────────

async function handleOpen(body, email, cuentaNumero, cuentaNombre) {
  const { position_id, fp, tipo, volumen, precio_entrada, sl, tp, puntos_sl, timestamp } = body;

  if (!position_id || !fp || precio_entrada == null || !timestamp) {
    return { status: 400, json: { error: 'open: faltan position_id, fp, precio_entrada o timestamp' } };
  }

  // Comprobar si la posición ya existe para proteger sl_original y fecha_entrada
  const existing = await _get('ea_trades', `position_id=eq.${encodeURIComponent(position_id)}&select=position_id,sl_original`);

  if (Array.isArray(existing) && existing.length > 0) {
    // Posición ya registrada (p.ej. llegó de la sync OnInit pero ya estaba en ea_trades).
    // Solo actualizamos sl_actual — sl_original y fecha_entrada quedan intactos.
    const r = await _patch(
      'ea_trades',
      `position_id=eq.${encodeURIComponent(position_id)}`,
      { sl_actual: sl != null ? sl : null }
    );
    if (!r.ok) {
      console.error('[trade-mt5] open (update sl_actual) error:', r.status, r.body);
      return { status: 500, json: { error: 'Error actualizando sl_actual en open duplicado', detail: r.body } };
    }
    console.log('[trade-mt5] open duplicado — solo sl_actual actualizado | position_id:', position_id);
    return { status: 200, json: { ok: true, event: 'open', position_id, action: 'updated_sl_actual' } };
  }

  // Posición nueva → INSERT completo
  const row = {
    position_id,
    fp,
    usuario_email:  email,
    cuenta_numero:  cuentaNumero,
    tipo:           tipo     || null,
    volumen:        volumen  != null ? volumen  : null,
    precio_entrada,
    sl_original:    sl       != null ? sl       : null,
    tp_original:    tp       != null ? tp       : null,
    sl_actual:      sl       != null ? sl       : null,
    puntos_sl:      puntos_sl != null ? puntos_sl : null,
    estado:         'open',
    fecha_entrada:  timestamp
  };

  const r = await _post('ea_trades', row, 'return=minimal');
  if (!r.ok) {
    console.error('[trade-mt5] open INSERT error:', r.status, r.body);
    return { status: 500, json: { error: 'Error guardando apertura', detail: r.body } };
  }
  console.log('[trade-mt5] open OK — position_id:', position_id, '| fp:', fp);
  return { status: 200, json: { ok: true, event: 'open', position_id, action: 'inserted' } };
}

async function handleSlChange(body, email, cuentaNumero) {
  const { position_id, sl_anterior, sl_nuevo, timestamp } = body;

  if (!position_id || sl_nuevo == null || !timestamp) {
    return { status: 400, json: { error: 'sl_change: faltan position_id, sl_nuevo o timestamp' } };
  }

  // 1. Registrar el cambio
  const r1 = await _post('ea_sl_changes', {
    position_id,
    usuario_email: email,
    cuenta_numero: cuentaNumero,
    sl_anterior:   sl_anterior != null ? sl_anterior : null,
    sl_nuevo,
    timestamp
  }, 'return=minimal');

  if (!r1.ok) {
    console.error('[trade-mt5] sl_change INSERT error:', r1.status, r1.body);
    return { status: 500, json: { error: 'Error registrando cambio SL', detail: r1.body } };
  }

  // 2. Actualizar sl_actual en ea_trades (no fatal si falla)
  const r2 = await _patch('ea_trades', `position_id=eq.${encodeURIComponent(position_id)}`, { sl_actual: sl_nuevo });
  if (!r2.ok) {
    console.warn('[trade-mt5] sl_change PATCH sl_actual warn:', r2.status, r2.body);
  }

  console.log('[trade-mt5] sl_change OK — position_id:', position_id, '| sl_nuevo:', sl_nuevo);
  return { status: 200, json: { ok: true, event: 'sl_change', position_id, sl_nuevo } };
}

async function handlePartialClose(body, email, cuentaNumero, cuentaNombre) {
  const { position_id, deal_id, volumen, precio, beneficio, timestamp, es_sl } = body;

  if (!position_id || !deal_id || precio == null || !timestamp) {
    return { status: 400, json: { error: 'partial_close: faltan position_id, deal_id, precio o timestamp' } };
  }

  // Idempotencia: no duplicar si el deal_id ya existe
  const existing = await _get('trade_parciales', `deal_id=eq.${encodeURIComponent(deal_id)}&select=deal_id`);
  if (Array.isArray(existing) && existing.length > 0) {
    console.log('[trade-mt5] partial_close ya existe, skip — deal_id:', deal_id);
    return { status: 200, json: { ok: true, event: 'partial_close', skipped: true, deal_id } };
  }

  // Obtener fp_trade desde ea_trades
  const eaRows = await _get('ea_trades', `position_id=eq.${encodeURIComponent(position_id)}&select=fp`);
  if (!Array.isArray(eaRows) || !eaRows.length) {
    return { status: 404, json: { error: 'partial_close: posición no encontrada en ea_trades. ¿Se recibió el evento open?' } };
  }
  const fp_trade = eaRows[0].fp;

  const ts = new Date(timestamp);
  const fecha = isNaN(ts) ? null : ts.toISOString().slice(0, 10).replace(/-/g, '.');
  const hora  = isNaN(ts) ? 0   : ts.getUTCHours();

  const row = {
    fp_trade,
    usuario_email: email,
    cuenta:        cuentaNombre,
    cuenta_numero: cuentaNumero,
    orden_id:      deal_id,
    deal_id,
    fecha,
    hora,
    precio,
    volumen:   volumen   != null ? volumen   : null,
    beneficio: beneficio != null ? beneficio : 0,
    es_sl:     !!es_sl,
    timestamp,
    fuente:    'ea'
  };

  const r = await _post('trade_parciales', row, 'return=minimal');
  if (!r.ok) {
    console.error('[trade-mt5] partial_close INSERT error:', r.status, r.body);
    return { status: 500, json: { error: 'Error guardando parcial', detail: r.body } };
  }
  console.log('[trade-mt5] partial_close OK — position_id:', position_id, '| deal_id:', deal_id, '| precio:', precio);
  return { status: 200, json: { ok: true, event: 'partial_close', position_id, deal_id } };
}

async function handleClose(body, email, cuentaNumero) {
  const { position_id, precio_cierre, beneficio_total, timestamp } = body;

  if (!position_id || precio_cierre == null || !timestamp) {
    return { status: 400, json: { error: 'close: faltan position_id, precio_cierre o timestamp' } };
  }

  const r = await _patch('ea_trades', `position_id=eq.${encodeURIComponent(position_id)}`, {
    estado:       'closed',
    precio_cierre,
    beneficio:    beneficio_total != null ? beneficio_total : null,
    fecha_cierre: timestamp
  });

  if (!r.ok) {
    console.error('[trade-mt5] close PATCH error:', r.status, r.body);
    return { status: 500, json: { error: 'Error actualizando cierre', detail: r.body } };
  }
  console.log('[trade-mt5] close OK — position_id:', position_id, '| precio_cierre:', precio_cierre);
  return { status: 200, json: { ok: true, event: 'close', position_id } };
}

// ── Handler principal ─────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPA_KEY)             return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY no configurada' });

  const { event, email, cuenta_numero } = req.body || {};

  if (!event || !email || !cuenta_numero) {
    return res.status(400).json({ error: 'Campos requeridos: event, email, cuenta_numero' });
  }

  // Validar usuario y acceso EA
  let user;
  try {
    const rows = await _get(
      'usuarios_aurum',
      `email=eq.${encodeURIComponent(email)}&select=email,tiene_ea,cuenta_maestra,cuenta_retos,cuenta_prueba&limit=1`
    );
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(403).json({ error: 'Usuario no encontrado: ' + email });
    }
    user = rows[0];
  } catch (err) {
    console.error('[trade-mt5] error validando usuario:', err.message);
    return res.status(500).json({ error: 'Error de validación' });
  }

  if (!user.tiene_ea) {
    return res.status(403).json({ error: 'El usuario no tiene acceso al EA Aurum' });
  }

  // Resolver nombre de carpeta desde número de cuenta
  let cuentaNombre = 'Cuenta Externa';
  const cn = String(cuenta_numero);
  if (user.cuenta_maestra && String(user.cuenta_maestra) === cn) cuentaNombre = 'Cuenta Maestra';
  else if (user.cuenta_retos   && String(user.cuenta_retos)   === cn) cuentaNombre = 'Cuenta Retos';
  else if (user.cuenta_prueba  && String(user.cuenta_prueba)  === cn) cuentaNombre = 'Cuenta Prueba';

  // Despachar evento
  let result;
  try {
    if (event === 'open')          result = await handleOpen(req.body, email, cn, cuentaNombre);
    else if (event === 'sl_change')      result = await handleSlChange(req.body, email, cn);
    else if (event === 'partial_close')  result = await handlePartialClose(req.body, email, cn, cuentaNombre);
    else if (event === 'close')          result = await handleClose(req.body, email, cn);
    else return res.status(400).json({ error: 'Evento desconocido: ' + event });
  } catch (err) {
    console.error('[trade-mt5] excepción en evento', event, ':', err.message);
    return res.status(500).json({ error: err.message });
  }

  return res.status(result.status).json(result.json);
};
