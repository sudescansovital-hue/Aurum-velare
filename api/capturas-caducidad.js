// api/capturas-caducidad.js
// Borrado automático de capturas por trade (bucket privado 'capturas-trades').
// Lo llama el cron de Vercel una vez al día (vercel.json -> crons).
// Ver: tools/post_cierre/sql_capturas.sql y ESTADO.md, "Capturas por trade".
//
// Qué borra (lo decide la función SQL capturas_para_borrar()):
//   'caducada'  captura con capturado_en de hace más de capturas_caducidad()
//               (6 meses; la constante vive en el SQL). Se borra el archivo
//               y después la fila de trade_capturas.
//   'huerfana'  archivo del bucket de más de 1 día que ninguna fila usa
//               (subida a medias, o reemplazo/borrado que no quitó el
//               archivo). Solo se borra el archivo.
// Los archivos se borran con la API de Storage: Supabase no deja hacerlo con
// DELETE sobre storage.objects desde SQL. Si algo falla a medias, la pasada
// siguiente lo recoge (fila sin archivo sigue caducada; archivo sin fila es
// huérfano).
//
// Auth: Vercel manda "Authorization: Bearer <CRON_SECRET>" en las llamadas
// del cron si la variable CRON_SECRET existe en el proyecto. Sin ella, el
// endpoint no hace nada (503).

const crypto = require('crypto');

const SUPA_URL = process.env.SUPABASE_URL || 'https://rsrbxcvlnbwpiyhumqmt.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const BUCKET = 'capturas-trades';
const LIMITE_POR_PASADA = 500;  // por tipo; lo que sobre, al día siguiente
const TAM_TROZO = 100;          // rutas por llamada de borrado / filtro in.(...)

function tokenValido(cabecera) {
  if (!CRON_SECRET || typeof cabecera !== 'string') return false;
  const esperado = Buffer.from('Bearer ' + CRON_SECRET);
  const recibido = Buffer.from(cabecera);
  return esperado.length === recibido.length && crypto.timingSafeEqual(esperado, recibido);
}

function cabecerasSupa(extra) {
  return Object.assign({ apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }, extra || {});
}

function trozos(lista, n) {
  const out = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}

// Comillas dobles para in.(...) de PostgREST (las rutas llevan '/' y '.')
function listaIn(rutas) {
  return '(' + rutas.map(r => '"' + r.replace(/"/g, '') + '"').join(',') + ')';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  if (!SUPA_KEY || !CRON_SECRET) return res.status(503).json({ error: 'Falta configuración' });
  if (!tokenValido(req.headers.authorization)) return res.status(401).json({ error: 'No autorizado' });

  // 1) Qué hay que borrar
  const rpc = await fetch(`${SUPA_URL}/rest/v1/rpc/capturas_para_borrar`, {
    method: 'POST',
    headers: cabecerasSupa({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p_limite: LIMITE_POR_PASADA }),
  });
  if (!rpc.ok) {
    const txt = await rpc.text();
    console.error('[capturas-caducidad] rpc', rpc.status, txt);
    return res.status(502).json({ error: 'No se pudo leer qué borrar', status: rpc.status });
  }
  const lista = await rpc.json();
  const caducadas = lista.filter(f => f.motivo === 'caducada').map(f => f.ruta);
  const huerfanas = lista.filter(f => f.motivo === 'huerfana').map(f => f.ruta);

  // 2) Borrar archivos (caducadas + huérfanas). La API ignora las rutas que
  //    ya no existen, así que una fila caducada sin archivo no frena nada.
  let archivosBorrados = 0;
  const caducadasConArchivoBorrado = [];
  for (const grupo of trozos(caducadas.concat(huerfanas), TAM_TROZO)) {
    const r = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: cabecerasSupa({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: grupo }),
    });
    if (!r.ok) {
      console.error('[capturas-caducidad] storage', r.status, await r.text());
      continue; // esas filas se quedan: la pasada de mañana lo reintenta
    }
    const borrados = await r.json();
    archivosBorrados += Array.isArray(borrados) ? borrados.length : 0;
    for (const ruta of grupo) if (caducadas.includes(ruta)) caducadasConArchivoBorrado.push(ruta);
  }

  // 3) Borrar las filas de las caducadas cuyo archivo ya se pidió borrar
  let filasBorradas = 0;
  for (const grupo of trozos(caducadasConArchivoBorrado, TAM_TROZO)) {
    const r = await fetch(`${SUPA_URL}/rest/v1/trade_capturas?ruta=in.${encodeURIComponent(listaIn(grupo))}`, {
      method: 'DELETE',
      headers: cabecerasSupa({ Prefer: 'return=representation' }),
    });
    if (!r.ok) {
      console.error('[capturas-caducidad] filas', r.status, await r.text());
      continue;
    }
    filasBorradas += (await r.json()).length;
  }

  const resumen = {
    ok: true,
    caducadas: caducadas.length,
    huerfanas: huerfanas.length,
    archivos_borrados: archivosBorrados,
    filas_borradas: filasBorradas,
  };
  console.log('[capturas-caducidad]', JSON.stringify(resumen));
  return res.status(200).json(resumen);
};
