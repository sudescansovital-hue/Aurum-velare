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
    // Solo actualizamos sl_actual/tp_actual — sl_original, tp_original y fecha_entrada quedan intactos.
    // FIX corazón de datos (06/07): antes esta rama ignoraba el TP por completo.
    const r = await _patch(
      'ea_trades',
      `position_id=eq.${encodeURIComponent(position_id)}`,
      { sl_actual: sl != null ? sl : null, tp_actual: tp != null ? tp : null }
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
    tp_actual:      tp       != null ? tp       : null,
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

// FIX corazón de datos (06/07): espejo exacto de handleSlChange, tabla
// ea_tp_changes en vez de ea_sl_changes, tp_actual en vez de sl_actual.
async function handleTpChange(body, email, cuentaNumero) {
  const { position_id, tp_anterior, tp_nuevo, timestamp } = body;

  if (!position_id || tp_nuevo == null || !timestamp) {
    return { status: 400, json: { error: 'tp_change: faltan position_id, tp_nuevo o timestamp' } };
  }

  // 1. Registrar el cambio
  const r1 = await _post('ea_tp_changes', {
    position_id,
    usuario_email: email,
    cuenta_numero: cuentaNumero,
    tp_anterior:   tp_anterior != null ? tp_anterior : null,
    tp_nuevo,
    timestamp
  }, 'return=minimal');

  if (!r1.ok) {
    console.error('[trade-mt5] tp_change INSERT error:', r1.status, r1.body);
    return { status: 500, json: { error: 'Error registrando cambio TP', detail: r1.body } };
  }

  // 2. Actualizar tp_actual en ea_trades (no fatal si falla)
  const r2 = await _patch('ea_trades', `position_id=eq.${encodeURIComponent(position_id)}`, { tp_actual: tp_nuevo });
  if (!r2.ok) {
    console.warn('[trade-mt5] tp_change PATCH tp_actual warn:', r2.status, r2.body);
  }

  console.log('[trade-mt5] tp_change OK — position_id:', position_id, '| tp_nuevo:', tp_nuevo);
  return { status: 200, json: { ok: true, event: 'tp_change', position_id, tp_nuevo } };
}

// FIX corazón de datos (06/07): evento correctivo que manda el EA cuando
// detecta (via polling cada 10s) el primer valor real de SL y/o TP tras
// haber abierto a mercado sin ninguno de los dos puestos. Solo actualiza
// sl_original/tp_original si vienen informados (no pisa con null).
async function handleOriginalCapture(body, email, cuentaNumero) {
  const { position_id, sl, tp, timestamp } = body;

  if (!position_id) {
    return { status: 400, json: { error: 'original_capture: falta position_id' } };
  }

  const patch = {};
  if (sl != null) { patch.sl_original = sl; patch.sl_actual = sl; }
  if (tp != null) { patch.tp_original = tp; patch.tp_actual = tp; }

  if (Object.keys(patch).length === 0) {
    return { status: 200, json: { ok: true, event: 'original_capture', position_id, skipped: true } };
  }

  const r = await _patch('ea_trades', `position_id=eq.${encodeURIComponent(position_id)}`, patch);
  if (!r.ok) {
    console.error('[trade-mt5] original_capture PATCH error:', r.status, r.body);
    return { status: 500, json: { error: 'Error guardando original_capture', detail: r.body } };
  }

  console.log('[trade-mt5] original_capture OK — position_id:', position_id, '| patch:', JSON.stringify(patch));
  return { status: 200, json: { ok: true, event: 'original_capture', position_id, patch } };
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

// FIX corazón de datos (04/07): al cerrar, además de marcar ea_trades como
// closed, se hace un upsert (por fp, igual mecanismo que historial.js) hacia
// la tabla 'trades' con fuente='ea', replicando EXACTAMENTE las mismas
// fórmulas que usa parser.js para 'puntos', 'ganadora', 'dia' y 'hora' —
// verificado dato-a-dato contra un trade real (ticket 18579861, cuenta
// 152034) antes de aplicar: la hora que manda el EA y la que guarda
// Supabase con getUTCHours()/getUTCDay() coincide exacta con la hora del
// terminal MT5, igual que hace parser.js con los históricos. Sin desfase.
async function handleClose(body, email, cuentaNumero, cuentaNombre) {
  const { position_id, precio_cierre, beneficio_total, timestamp } = body;

  if (!position_id || precio_cierre == null || !timestamp) {
    return { status: 400, json: { error: 'close: faltan position_id, precio_cierre o timestamp' } };
  }

  // 1. Cerrar en ea_trades (igual que antes)
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

  // 2. Traer los datos de apertura desde ea_trades para construir la fila de 'trades'
  let eaRows;
  try {
    eaRows = await _get(
      'ea_trades',
      `position_id=eq.${encodeURIComponent(position_id)}&select=fp,tipo,volumen,precio_entrada,sl_actual,tp_actual,fecha_entrada`
    );
  } catch (err) {
    console.error('[trade-mt5] close: error leyendo ea_trades para upsert:', err.message);
    return { status: 200, json: { ok: true, event: 'close', position_id, warning: 'ea_trades cerrado pero fallo leyendo datos para upsert a trades' } };
  }

  if (!Array.isArray(eaRows) || !eaRows.length) {
    console.error('[trade-mt5] close: no se encontró ea_trades para upsert a trades — position_id:', position_id);
    return { status: 200, json: { ok: true, event: 'close', position_id, warning: 'ea_trades cerrado pero no se pudo upsertar a trades (fila no encontrada)' } };
  }
  const ea = eaRows[0];

  const fAp = ea.fecha_entrada ? new Date(ea.fecha_entrada) : null;
  const fCi = new Date(timestamp);
  const tipo = (ea.tipo || '').toLowerCase();
  const pe = ea.precio_entrada;
  const pc = precio_cierre;
  const sl = ea.sl_actual;
  const tp = ea.tp_actual; // FIX 06/07: antes usaba tp_original (estático); ahora tp_actual se mantiene al día
  const ben = beneficio_total != null ? beneficio_total : 0;

  // Mismo criterio que parser.js (fAp.getHours()/getDay()) — verificado que
  // coincide con la hora de terminal usando getUTCHours()/getUTCDay() sobre
  // el timestamp que manda el EA (sin conversión de zona horaria adicional).
  const hora = fAp ? fAp.getUTCHours() : 0;
  const dia  = fAp ? (fAp.getUTCDay() + 6) % 7 : 0;

  // Mismo criterio que parser.js: prioriza distancia entrada→SL si el SL es
  // válido; si no, distancia entrada→cierre. Siempre en valor absoluto.
  const slValido = (sl !== null && sl !== undefined && sl !== 0 && Math.abs(sl - pe) > 0.00001);
  let puntosRaw;
  if (slValido) {
    puntosRaw = tipo === 'sell' ? (sl - pe) : (pe - sl);
  } else {
    puntosRaw = tipo === 'sell' ? (pe - pc) : (pc - pe);
  }
  const puntos = Math.abs(Math.round(puntosRaw * 100) / 100);

  const durMin = fAp ? Math.max(0, Math.round((fCi - fAp) / 60000)) : 60;

  const fechaStr = fAp
    ? (fAp.getUTCFullYear() + '.' + String(fAp.getUTCMonth() + 1).padStart(2, '0') + '.' + String(fAp.getUTCDate()).padStart(2, '0'))
    : '';

  const tradeRow = {
    fp:             ea.fp,
    fecha:          fechaStr,
    usuario_email:  email,
    cuenta:         cuentaNombre,
    cuenta_numero:  cuentaNumero,
    ganadora:       ben > 0,
    beneficio:      ben,
    hora:           hora,
    dia:            dia,
    puntos:         puntos,
    precio_entrada: pe,
    precio_cierre:  pc,
    dur_min:        durMin,
    sl:             sl,
    tp:             tp,
    volumen:        ea.volumen,
    tipo:           tipo,
    fuente:         'ea'
  };

  let rUpsert;
  try {
    rUpsert = await fetch(`${SUPA_URL}/rest/v1/trades?on_conflict=fp,usuario_email`, {
      method: 'POST',
      headers: Object.assign(_headers(), { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify([tradeRow])
    });
  } catch (err) {
    console.error('[trade-mt5] close: excepción en upsert a trades:', err.message);
    return { status: 200, json: { ok: true, event: 'close', position_id, warning: 'ea_trades cerrado pero upsert a trades lanzó excepción' } };
  }

  if (!rUpsert.ok) {
    const errBody = await rUpsert.text();
    console.error('[trade-mt5] close: upsert a trades FALLÓ:', rUpsert.status, errBody);
    return { status: 200, json: { ok: true, event: 'close', position_id, warning: 'ea_trades cerrado pero upsert a trades falló', detail: errBody } };
  }

  console.log('[trade-mt5] close OK — position_id:', position_id, '| upsert a trades OK | fp:', ea.fp);
  return { status: 200, json: { ok: true, event: 'close', position_id, upserted_to_trades: true } };
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
    else if (event === 'tp_change')      result = await handleTpChange(req.body, email, cn);
    else if (event === 'original_capture') result = await handleOriginalCapture(req.body, email, cn);
    else if (event === 'partial_close')  result = await handlePartialClose(req.body, email, cn, cuentaNombre);
    else if (event === 'close')          result = await handleClose(req.body, email, cn, cuentaNombre);
    else return res.status(400).json({ error: 'Evento desconocido: ' + event });
  } catch (err) {
    console.error('[trade-mt5] excepción en evento', event, ':', err.message);
    return res.status(500).json({ error: err.message });
  }

  return res.status(result.status).json(result.json);
};
