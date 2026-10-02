// api/post-cierre.js
// Puente entre tools/post_cierre/post_cierre.py (corre en local con MT5
// abierto) y las tablas post_cierre_analisis / post_cierre_velas. El script
// pide los trades de la EA que aún no tienen análisis, los analiza con velas
// M1 y sube aquí los resultados. La web NO usa este endpoint: lee las tablas
// directamente con el JWT del usuario (RLS solo SELECT).
// Ver: sql_post_cierre.sql y docs/DISENO_POST_CIERRE.md
//
// Auth: token propio y dedicado (POST_CIERRE_TOKEN), en cabecera
// Authorization: Bearer. No es EA_SHARED_SECRET ni la service key.
// El email NO viene del cliente: se trabaja siempre con POST_CIERRE_EMAIL,
// así que un token filtrado solo da acceso a los trades de ese usuario y a
// estas dos tablas.
//
// Rutas:
//   GET  ?accion=ping                       -> { ok: true }
//   GET  ?accion=pendientes&version=N       -> trades sin análisis, con
//        ventana_completa=false o criterios_version < N, con todo lo que
//        antes venía en los 4 CSV exportados a mano
//   POST ?accion=resultados                 -> upsert de análisis + velas

const crypto = require('crypto');

const SUPA_URL = process.env.SUPABASE_URL || 'https://rsrbxcvlnbwpiyhumqmt.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
const POST_CIERRE_TOKEN = process.env.POST_CIERRE_TOKEN;
const POST_CIERRE_EMAIL = process.env.POST_CIERRE_EMAIL;

const MAX_RESULTADOS_POR_LOTE = 25;
const MAX_VELAS_POR_TRADE = 2000;
const TAM_TROZO_IN = 100; // ids por filtro in.(...) para no pasarse de longitud de URL

// Columnas que acepta post_cierre_analisis desde el script. usuario_email,
// id y calculado_en los pone el servidor / la tabla.
const COLUMNAS_ANALISIS = [
  'fp', 'position_id', 'cuenta_numero', 'estrategia', 'direccion', 'volumen',
  'fecha_entrada', 'precio_entrada', 'fecha_cierre', 'precio_cierre',
  'sl_original', 'sl_original_origen', 'tp_original', 'tp_original_origen',
  'sl_final', 'tp_final',
  'tipo_cierre_guardado', 'tipo_cierre_deducido', 'tipo_cierre_discrepancia', 'tipo_cierre_detallado',
  'mfe_puntos', 'mfe_en', 'mae_puntos', 'mae_en',
  'n_be_ea', 'n_be_reales', 'be_real_en', 'be_real_nivel', 'be_efecto',
  'resultado_post_cierre', 'minutos_hasta_resultado',
  'favor_post_puntos', 'contra_post_puntos', 'favor_1h_puntos', 'favor_4h_puntos',
  'velas_post_disponibles', 'ventana_completa',
  'decision_cierre_manual', 'pts_favor_antes_sl',
  'tp1_pts', 'tp1_alcanzado', 'tp1_alcanzado_en', 'tp1_volvio_en', 'tp1_no_asegurado',
  'sl_desprotegido', 'sl_n_desprotecciones', 'sl_protegido_en', 'sl_nivel_protegido',
  'sl_desprotegido_en', 'sl_nivel_desprotegido', 'sl_protegido_habria_salido',
  'entrada_en_vela', 'cierre_en_vela', 'notas', 'simbolo_velas', 'broker_velas',
  'criterios_version'
];

// Mismos valores que los CHECK de sql_post_cierre.sql: se validan aquí para
// devolver un motivo claro por trade en vez de un 400 de Postgres para todo el lote.
const ENUMS = {
  direccion:              ['buy', 'sell'],
  tipo_cierre_detallado:  ['manual', 'tp', 'sl_original_o_ajustado_perdida',
                           'sl_breakeven', 'sl_beneficio_trailing', 'desconocido'],
  be_efecto:              ['na', 'te_salvo', 'mixto_te_saco_de_un_recorrido',
                           'te_saco_de_un_ganador', 'sin_efecto'],
  resultado_post_cierre:  ['fue_a_sl', 'fue_a_tp', 'ninguno_en_ventana',
                           'ambiguo_misma_vela', 'datos_insuficientes'],
  decision_cierre_manual: ['na', 'bien_cerrado', 'mixto_te_saliste_con_poco',
                           'pronto', 'correcto', 'indeterminado']
};

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

// PostgREST corta en max-rows (1000 por defecto en Supabase): paginar.
async function _getTodo(table, params) {
  const PAGINA = 1000;
  let out = [];
  for (let offset = 0; ; offset += PAGINA) {
    const filas = await _get(table, `${params}&limit=${PAGINA}&offset=${offset}`);
    out = out.concat(filas);
    if (filas.length < PAGINA) return out;
  }
}

async function _getPorTrozos(table, campo, valores, params, comillas) {
  let out = [];
  for (let i = 0; i < valores.length; i += TAM_TROZO_IN) {
    const trozo = valores.slice(i, i + TAM_TROZO_IN)
      .map(v => comillas ? '%22' + encodeURIComponent(v) + '%22' : encodeURIComponent(v))
      .join(',');
    out = out.concat(await _getTodo(table, `${campo}=in.(${trozo})&${params}`));
  }
  return out;
}

async function _upsert(table, onConflict, rows) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: _headers('resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify(rows)
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text };
}

// Comparación en tiempo constante; nunca se loguea el token recibido.
function _tokenValido(req) {
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(POST_CIERRE_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── GET ?accion=pendientes ───────────────────────────────────────────────────

async function pendientes(version) {
  const email = encodeURIComponent(POST_CIERRE_EMAIL);

  const trades = await _getTodo('ea_trades',
    `usuario_email=eq.${email}&estado=eq.closed&fecha_cierre=not.is.null` +
    `&select=position_id,fp,cuenta_numero,estrategia,tipo,volumen,precio_entrada,fecha_entrada,` +
    `precio_cierre,fecha_cierre,sl_original,tp_original,sl_actual,tp_actual&order=fecha_cierre.asc`);

  const hechos = await _getTodo('post_cierre_analisis',
    `usuario_email=eq.${email}&select=fp,ventana_completa,criterios_version`);
  const porFp = {};
  hechos.forEach(h => { porFp[h.fp] = h; });

  const lista = trades.filter(t => {
    const h = porFp[t.fp];
    return !h || h.ventana_completa === false || h.criterios_version < version;
  });
  if (!lista.length) return { total_ea: trades.length, pendientes: [] };

  const posIds = lista.map(t => t.position_id);
  const fps = lista.map(t => t.fp);
  const [slCh, tpCh, eventos] = await Promise.all([
    _getPorTrozos('ea_sl_changes', 'position_id', posIds,
      `usuario_email=eq.${email}&select=position_id,sl_anterior,sl_nuevo,timestamp&order=timestamp.asc`, false),
    _getPorTrozos('ea_tp_changes', 'position_id', posIds,
      `usuario_email=eq.${email}&select=position_id,tp_anterior,tp_nuevo,timestamp&order=timestamp.asc`, false),
    _getPorTrozos('trade_eventos', 'fp', fps,
      'select=fp,tipo_evento,timestamp,precio,puntos_desde_entrada,volumen_restante&order=timestamp.asc', true)
  ]);

  const agrupar = (filas, clave) => {
    const g = {};
    filas.forEach(f => { (g[f[clave]] = g[f[clave]] || []).push(f); });
    return g;
  };
  const slPorPos = agrupar(slCh, 'position_id');
  const tpPorPos = agrupar(tpCh, 'position_id');
  const evPorFp = agrupar(eventos, 'fp');

  return {
    total_ea: trades.length,
    pendientes: lista.map(t => Object.assign({}, t, {
      sl_changes: (slPorPos[t.position_id] || []).map(c =>
        ({ valor_anterior: c.sl_anterior, valor_nuevo: c.sl_nuevo, timestamp: c.timestamp })),
      tp_changes: (tpPorPos[t.position_id] || []).map(c =>
        ({ valor_anterior: c.tp_anterior, valor_nuevo: c.tp_nuevo, timestamp: c.timestamp })),
      eventos: evPorFp[t.fp] || []
    }))
  };
}

// ── POST ?accion=resultados ──────────────────────────────────────────────────

function _validarVelas(v) {
  if (!v || typeof v !== 'object') return 'velas ausentes';
  if (!Array.isArray(v.velas) || !v.velas.length) return 'velas vacías';
  if (v.velas.length > MAX_VELAS_POR_TRADE) return 'demasiadas velas';
  const okFila = f => Array.isArray(f) && f.length === 5 && f.every(x => typeof x === 'number' && isFinite(x));
  if (!v.velas.every(okFila)) return 'formato de vela inválido';
  if (!v.inicio) return 'velas sin inicio';
  for (const k of ['tf_durante_min', 'idx_entrada', 'idx_cierre']) {
    if (!Number.isInteger(v[k]) || v[k] < 0) return 'velas: ' + k + ' inválido';
  }
  return null;
}

async function resultados(body) {
  const lote = body && body.resultados;
  if (!Array.isArray(lote) || !lote.length) return { status: 400, json: { error: 'resultados vacío' } };
  if (lote.length > MAX_RESULTADOS_POR_LOTE) {
    return { status: 400, json: { error: `máximo ${MAX_RESULTADOS_POR_LOTE} resultados por lote` } };
  }

  // Solo se aceptan fp que sean trades de la EA de este usuario.
  const fpsLote = lote.map(r => r && r.analisis && r.analisis.fp).filter(Boolean);
  const existentes = await _getPorTrozos('ea_trades', 'fp', fpsLote,
    `usuario_email=eq.${encodeURIComponent(POST_CIERRE_EMAIL)}&select=fp`, true);
  const fpsValidos = new Set(existentes.map(e => e.fp));

  const filasAnalisis = [];
  const filasVelas = [];
  const rechazados = [];

  lote.forEach(r => {
    const a = r && r.analisis;
    const fp = a && a.fp;
    if (!fp) { rechazados.push({ fp: null, motivo: 'sin fp' }); return; }
    if (!fpsValidos.has(fp)) { rechazados.push({ fp, motivo: 'fp no es un trade EA de este usuario' }); return; }

    const extra = Object.keys(a).filter(k => !COLUMNAS_ANALISIS.includes(k));
    if (extra.length) { rechazados.push({ fp, motivo: 'columnas desconocidas: ' + extra.join(',') }); return; }
    for (const campo in ENUMS) {
      if (!ENUMS[campo].includes(a[campo])) {
        rechazados.push({ fp, motivo: `${campo} inválido: ${a[campo]}` });
        return;
      }
    }
    if (!Number.isInteger(a.criterios_version)) { rechazados.push({ fp, motivo: 'criterios_version inválido' }); return; }
    // velas = null es válido: trade sin histórico M1 (datos_insuficientes),
    // se guarda el análisis sin gráfico.
    const errVelas = r.velas == null ? null : _validarVelas(r.velas);
    if (errVelas) { rechazados.push({ fp, motivo: errVelas }); return; }

    const fila = { usuario_email: POST_CIERRE_EMAIL, calculado_en: new Date().toISOString() };
    COLUMNAS_ANALISIS.forEach(k => { fila[k] = a[k] !== undefined ? a[k] : null; });
    filasAnalisis.push(fila);
    if (r.velas == null) return;
    filasVelas.push({
      usuario_email:  POST_CIERRE_EMAIL,
      fp,
      inicio:         r.velas.inicio,
      velas:          r.velas.velas,
      tf_durante_min: r.velas.tf_durante_min,
      idx_entrada:    r.velas.idx_entrada,
      idx_cierre:     r.velas.idx_cierre
    });
  });

  if (!filasAnalisis.length) return { status: 200, json: { guardados: 0, rechazados } };

  // Primero el análisis: post_cierre_velas tiene FK a (usuario_email, fp).
  const r1 = await _upsert('post_cierre_analisis', 'usuario_email,fp', filasAnalisis);
  if (!r1.ok) {
    console.error('[post-cierre] upsert analisis error:', r1.status, r1.body);
    return { status: 500, json: { error: 'Error guardando análisis', detail: r1.body, rechazados } };
  }
  const r2 = filasVelas.length ? await _upsert('post_cierre_velas', 'usuario_email,fp', filasVelas) : { ok: true };
  if (!r2.ok) {
    console.error('[post-cierre] upsert velas error:', r2.status, r2.body);
    return { status: 500, json: { error: 'Análisis guardado pero fallaron las velas', detail: r2.body, rechazados } };
  }

  return { status: 200, json: { guardados: filasAnalisis.length, rechazados } };
}

// ── Handler principal ─────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (!SUPA_KEY)          return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY no configurada' });
  if (!POST_CIERRE_TOKEN) return res.status(500).json({ error: 'POST_CIERRE_TOKEN no configurada' });
  if (!POST_CIERRE_EMAIL) return res.status(500).json({ error: 'POST_CIERRE_EMAIL no configurada' });

  if (!_tokenValido(req)) {
    console.error('[post-cierre] token rechazado');
    return res.status(401).json({ error: 'Token inválido o ausente' });
  }

  const accion = (req.query && req.query.accion) || '';
  try {
    if (req.method === 'GET' && accion === 'ping') {
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'GET' && accion === 'pendientes') {
      const version = parseInt(req.query.version, 10);
      if (!Number.isInteger(version) || version < 1) {
        return res.status(400).json({ error: 'version requerida (entero >= 1)' });
      }
      return res.status(200).json(await pendientes(version));
    }
    if (req.method === 'POST' && accion === 'resultados') {
      const r = await resultados(req.body);
      return res.status(r.status).json(r.json);
    }
  } catch (err) {
    console.error('[post-cierre] excepción en', accion, ':', err.message);
    return res.status(500).json({ error: err.message });
  }
  return res.status(400).json({ error: 'Acción no válida: ' + req.method + ' ' + accion });
};
