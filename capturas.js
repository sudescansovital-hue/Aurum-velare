// ============================================================
// CAPTURAS Y NOTAS POR TRADE en el Diario (08/10; notas por hueco 09/10)
// Ver: tools/post_cierre/sql_capturas.sql, sql_notas_hueco.sql y ESTADO.md
// ("Capturas por trade", "Notas por hueco").
// Sustituye a la zona de pruebas capturas-test.js (carpeta local): todo va a
// Supabase Storage, bucket privado 'capturas-trades'.
//
// - Barra "Capturas" arriba del Diario: botón "Capturar pantalla" (compartir
//   pantalla; solo Chrome / Edge de escritorio), "Subir imagen" y Ctrl+V en
//   cualquier navegador. Cada imagen se enlaza a un trade (por defecto el
//   abierto; si hay varios, hay que elegir; si no hay ninguno, el último
//   cerrado; siempre con lista para elegir otro) y a un hueco: Entrada,
//   Gestión o Salida (máx. 3 por trade; si el hueco está ocupado, se
//   reemplaza).
// - Detalle de cada trade: los 3 huecos con miniatura, ver en grande, Borrar
//   y Reemplazar (capturar, subir o pegar con Ctrl+V tras pulsar el hueco).
// - Nota por hueco (09/10, tabla trade_nota_hueco): Entrada ("Por qué
//   entré"), Gestión y Salida, máx. 300 caracteres cada una, con su Guardar.
//   Se puede escribir aunque el hueco no tenga captura y en trades abiertos;
//   también en la ventana de captura, debajo de "Hueco". Lo escrito sin
//   guardar se conserva al repintar (_caBorradores). La antigua trade_nota
//   ("Por qué entré") pasó a la nota de Entrada con el SQL y ya no se usa.
// - Lista: insignias 📷 n / 📝 y filtro "Con capturas".
// - Imágenes: WebP (JPG si el navegador no sabe hacer WebP, p. ej. Safari),
//   máx. 1600 px de ancho, objetivo ≤ 250 KB; el bucket rechaza > 2 MB.
//   Se guardan CA_MESES_CADUCIDAD meses desde que se suben o reemplazan (las
//   borra el cron api/capturas-caducidad.js; la constante del SQL es
//   capturas_caducidad(): cambiar las dos a la vez).
// - Acceso: Packs de CA_PACKS (y el admin). Solo en el front: la base de
//   datos no lo comprueba.
//
// Subir / reemplazar: primero el archivo (nombre nuevo, nunca se sobrescribe),
// luego la fila (POST o PATCH) y por último se borra el archivo viejo. Si algo
// falla a medias, el archivo que sobra queda huérfano y lo borra el cron.
//
// Módulo aislado: solo LEE helpers globales (supaGet, supaPost, supaPatch,
// supaDelete, getToken, getCurrentUser, usuarioActual, SUPA_URL, SUPA_KEY) y
// del Diario (_daEsc, _daNombreCuenta, _daHora, _daPintar, _daAbierto,
// _daAbrirDetalle). diario-analisis.js lo llama en unos pocos puntos (carga,
// lista, filtro y detalle).
// ============================================================

// Lista de Packs con acceso (configurable por el admin más adelante).
var CA_PACKS = ['senda', 'cima', 'vip'];
var CA_ADMIN = 'sudescansovital@gmail.com';
var CA_MESES_CADUCIDAD = 6;            // = capturas_caducidad() del SQL
var CA_BUCKET = 'capturas-trades';
var CA_ANCHO_MAX = 1600;
var CA_ALTO_MAX = 10000;               // CHECK de la tabla
var CA_OBJETIVO_BYTES = 250 * 1024;
var CA_MAX_BYTES = 2 * 1024 * 1024;    // límite del bucket
var CA_CALIDADES = [0.82, 0.72, 0.62, 0.52, 0.42];
var CA_NOTA_MAX = 300;
var CA_URL_SEG = 3600;                 // validez de las URL firmadas
var CA_TRADES_LISTA = 40;              // trades cerrados que se ofrecen para enlazar
var CA_HUECOS = [
  { id: 'entrada', txt: 'Entrada', nota: 'Por qué entré', guia: 'por qué entré: setup · temporalidad · qué vi' },
  { id: 'gestion', txt: 'Gestión', nota: 'Qué hice',      guia: 'qué hice durante el trade y por qué' },
  { id: 'salida',  txt: 'Salida',  nota: 'Por qué salí',  guia: 'por qué salí o qué me sacó' }
];

var _caCapturas = {};   // fp -> { entrada: fila, gestion: fila, salida: fila }
var _caNotas = {};      // fp -> { entrada | gestion | salida: texto } (trade_nota_hueco)
var _caBorradores = {}; // 'fp|hueco' -> texto escrito y aún sin guardar (sobrevive a los repintados)
var _caEmail = null;    // de quién son los datos cargados
var _caError = null;    // texto si la API no deja leer las tablas
var _caUrls = {};       // ruta -> { url, caduca (ms) }
var _caSoloCapturas = false;   // filtro "Con capturas" de la lista
var _caNueva = null;    // imagen esperando a enlazarse: { blob, ancho, alto, ext, url }
var _caTrades = null;   // { abiertos: [...], cerrados: [...] } de ea_trades para el selector
var _caDestino = null;  // hueco elegido en un detalle para pegar/subir: { fp, hueco }
var _caOcupado = false;
var _caAviso = null;    // mensaje para el detalle tras repintar: { fp, texto, hueco } (hueco = de su nota)

// ── Acceso y entorno ─────────────────────────────────────────────────────

function _caTieneAcceso() {
  var u = window.usuarioActual;
  if (!u) return false;
  return u.email === CA_ADMIN || CA_PACKS.indexOf(u.packSlug) !== -1;
}

// Capturar pantalla: solo Chrome / Edge de escritorio (getDisplayMedia).
function _caPuedeCapturarPantalla() {
  var ua = navigator.userAgent || '';
  var movil = /Android|iPhone|iPad|iPod|Mobi/i.test(ua);
  var chromeOEdge = /Chrome\//.test(ua) && !/OPR\/|Vivaldi|SamsungBrowser/.test(ua) && !navigator.brave;
  return !movil && chromeOEdge && !!(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function');
}

function _caListo() { return _caEmail === (window.usuarioActual && window.usuarioActual.email); }

function _caUid() {
  var u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  return u && /^[0-9a-f-]{36}$/.test(u.id || '') ? u.id : null;
}

// ── Carga ────────────────────────────────────────────────────────────────

async function _caCargar() {
  var u = window.usuarioActual;
  if (_caEmail !== (u && u.email)) { _caUrls = {}; _caDestino = null; _caBorradores = {}; } // nada de la sesión anterior
  if (!u || !u.email || !_caTieneAcceso()) { _caCapturas = {}; _caNotas = {}; _caEmail = null; return; }
  var email = encodeURIComponent(u.email);
  var res = await Promise.all([
    supaGet('trade_capturas', 'usuario_email=eq.' + email + '&select=fp,hueco,ruta,bytes,ancho,alto,capturado_en', getToken()),
    supaGet('trade_nota_hueco', 'usuario_email=eq.' + email + '&select=fp,hueco,nota', getToken())
  ]);
  if (!window.usuarioActual || window.usuarioActual.email !== u.email) return;
  if (res[0].error || res[1].error) {
    _caError = String(res[0].error || res[1].error);
    console.error('[capturas] error al cargar', _caError);
    if (_caEmail !== u.email) { _caCapturas = {}; _caNotas = {}; }
    return;
  }
  _caError = null;
  _caCapturas = {};
  res[0].data.forEach(function(f) { (_caCapturas[f.fp] = _caCapturas[f.fp] || {})[f.hueco] = f; });
  _caNotas = {};
  res[1].data.forEach(function(f) { (_caNotas[f.fp] = _caNotas[f.fp] || {})[f.hueco] = f.nota; });
  _caEmail = u.email;
}

function _caTieneNota(fp) {
  var n = _caNotas[fp];
  return !!n && CA_HUECOS.some(function(h) { return !!n[h.id]; });
}

function _caNumCapturas(fp) {
  var c = _caCapturas[fp];
  return c ? CA_HUECOS.filter(function(h) { return c[h.id]; }).length : 0;
}

// ── Lista del Diario: insignias y filtro ─────────────────────────────────

function _caBadge(r) {
  if (!_caListo()) return '';
  var n = _caNumCapturas(r.fp), nota = _caTieneNota(r.fp);
  if (!n && !nota) return '';
  var est = 'font-size:11px;color:var(--text-dim);border:1px solid var(--border);padding:.12rem .45rem;white-space:nowrap;';
  return (n ? '<span style="' + est + '" title="' + n + ' captura' + (n > 1 ? 's' : '') + '">📷 ' + n + '</span>' : '') +
         (nota ? '<span style="' + est + '" title="Tiene notas">📝</span>' : '');
}

function _caPasaFiltro(r) { return !_caSoloCapturas || !_caListo() || _caNumCapturas(r.fp) > 0; }

function _caHtmlFiltro() {
  if (!_caListo()) return '';
  return '<button class="tab' + (_caSoloCapturas ? ' active' : '') + '" style="padding:.45rem .9rem;font-size:12px;" ' +
         'onclick="_caSoloCapturas=!_caSoloCapturas;_daAbierto=null;_daPintar();">📷 Con capturas</button>';
}

// ── Detalle de un trade ──────────────────────────────────────────────────

function _caTxtCaducidad() {
  return 'Las capturas se guardan ' + CA_MESES_CADUCIDAD + ' meses desde que las subes (o reemplazas); después se borran solas.';
}

// Para atributos HTML (_daEsc no escapa comillas).
function _caAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
                                   .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _caIdFp(fp) { return String(fp).replace(/[^A-Za-z0-9_-]/g, '_'); }

function _caHueco(id) { return CA_HUECOS.filter(function(h) { return h.id === id; })[0]; }

// ids de la nota: ctx 'det' (detalle del trade) o 'cap' (ventana de captura)
function _caIdNota(ctx, fp, hueco) { return 'ca-nota-' + ctx + '-' + _caIdFp(fp) + '-' + hueco; }

// Nota de un hueco: etiqueta, campo con guía en gris, contador, Guardar y aviso.
function _caHtmlNotaHueco(fp, hueco, ctx, av) {
  var hu = _caHueco(hueco), base = _caIdNota(ctx, fp, hueco);
  var guardada = (_caNotas[fp] || {})[hueco] || '';
  var borrador = _caBorradores[fp + '|' + hueco];
  var texto = borrador != null ? borrador : guardada;
  var fpJs = _caAttr(JSON.stringify(fp));
  return '<div class="ca-nota-caja" onclick="event.stopPropagation();">' +
           '<label for="' + base + '" class="ca-nota-lbl">📝 ' + hu.nota + '</label>' +
           '<textarea id="' + base + '" class="ca-nota" rows="3" maxlength="' + CA_NOTA_MAX + '" data-fp="' + _caAttr(fp) + '" data-hueco="' + hueco + '" ' +
             'oninput="_caAlEscribir(this)" placeholder="' + _caAttr(hu.guia) + '">' + _daEsc(texto) + '</textarea>' +
           '<div class="ca-nota-pie">' +
             '<span id="' + base + '-cont" class="ca-nota-cont">' + _caTxtContador(texto, guardada) + '</span>' +
             '<span style="display:flex;align-items:center;gap:.6rem;">' +
               '<span id="' + base + '-msg" role="status" class="ca-nota-msg">' + (av && av.hueco === hueco ? _daEsc(av.texto) : '') + '</span>' +
               '<div class="btn-gold ca-nota-btn" role="button" tabindex="0" onclick="_caGuardarNota(' + fpJs + ',\'' + hueco + '\',\'' + ctx + '\')">Guardar</div>' +
             '</span>' +
           '</div>' +
         '</div>';
}

function _caTxtContador(texto, guardada) {
  return texto.length + ' / ' + CA_NOTA_MAX + (texto !== guardada ? ' · sin guardar' : '');
}

function _caHtmlDetalle(r) {
  if (!_caTieneAcceso()) return '';
  var fp = r.fp, id = _caIdFp(fp), c = _caCapturas[fp] || {};
  var fpJs = _caAttr(JSON.stringify(fp));
  var av = _caAviso && _caAviso.fp === fp ? _caAviso : null;
  _caAviso = null;
  var h = '<div class="ca-detalle" style="margin:0 0 1.2rem;padding:1rem;border:1px solid var(--border);background:#0A0D16;">' +
            '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:.4rem 1rem;margin-bottom:.7rem;">' +
              '<span class="tag" style="display:block;">Capturas y notas</span>' +
              '<span style="font-size:11px;color:var(--text-muted);">' + _daEsc(_caTxtCaducidad()) + ' Las notas no caducan.</span>' +
            '</div>';
  if (_caError) h += '<div style="font-size:13px;color:var(--red);margin-bottom:.6rem;">No se pudieron leer tus capturas o notas (' + _daEsc(_caError.slice(0, 160)) + ').</div>';
  h += '<div class="ca-huecos">';
  CA_HUECOS.forEach(function(hu) {
    var f = c[hu.id];
    var activo = _caDestino && _caDestino.fp === fp && _caDestino.hueco === hu.id;
    h += '<div class="ca-hueco' + (activo ? ' ca-activo' : '') + '" tabindex="0" ' +
           'onclick="_caElegirDestino(' + fpJs + ',\'' + hu.id + '\')" title="Pulsa aquí y pega con Ctrl+V para ' + (f ? 'reemplazar' : 'añadir') + ' la captura">' +
           '<div style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);margin-bottom:.4rem;">' + hu.txt + '</div>' +
           (f ? '<img class="ca-mini" data-ruta="' + _caAttr(f.ruta) + '" alt="Captura de ' + hu.txt + '" ' +
                  'onclick="event.stopPropagation();_caVerGrande(' + _caAttr(JSON.stringify(f.ruta)) + ')">'
              : '<div class="ca-vacio">' + (activo ? 'Pega ahora con Ctrl+V' : 'Sin captura') + '</div>') +
           '<div class="ca-acciones" onclick="event.stopPropagation();">' +
             (_caPuedeCapturarPantalla() ? '<button class="tab" onclick="_caCapturarPara(' + fpJs + ',\'' + hu.id + '\')">' + (f ? 'Reemplazar' : 'Capturar') + '</button>' : '') +
             '<button class="tab" onclick="_caSubirPara(' + fpJs + ',\'' + hu.id + '\')">' + (f && !_caPuedeCapturarPantalla() ? 'Reemplazar' : 'Subir') + '</button>' +
             (f ? '<button class="tab" style="color:var(--red);" onclick="_caBorrar(' + fpJs + ',\'' + hu.id + '\')">Borrar</button>' : '') +
           '</div>' +
           _caHtmlNotaHueco(fp, hu.id, 'det', av) +
         '</div>';
  });
  h += '</div>';
  h += '<div style="font-size:11px;color:var(--text-muted);margin:.4rem 0 0;">Para pegar con Ctrl+V: pulsa primero el hueco (queda marcado en dorado).</div>';
  h += '<div id="ca-msg-' + id + '" style="font-size:13px;margin-top:.5rem;min-height:1px;color:var(--green);">' +
         (av && !av.hueco ? _daEsc(av.texto) : '') + '</div>';
  return h + '</div>';
}

// Tras pintar el detalle: miniaturas con URL firmada.
function _caTrasPintar(cont) {
  if (!cont) return;
  var imgs = cont.querySelectorAll('img.ca-mini[data-ruta]');
  if (!imgs.length) return;
  var rutas = [].map.call(imgs, function(i) { return i.getAttribute('data-ruta'); });
  _caFirmar(rutas).then(function() {
    [].forEach.call(imgs, function(i) {
      var u = _caUrls[i.getAttribute('data-ruta')];
      if (u) i.src = u.url;
    });
  });
}

// Al escribir en una nota: contador y borrador (lo no guardado no se pierde al repintar).
function _caAlEscribir(el) {
  var fp = el.getAttribute('data-fp'), hueco = el.getAttribute('data-hueco');
  var guardada = (_caNotas[fp] || {})[hueco] || '';
  if (el.value === guardada) delete _caBorradores[fp + '|' + hueco];
  else _caBorradores[fp + '|' + hueco] = el.value;
  var c = document.getElementById(el.id + '-cont'), m = document.getElementById(el.id + '-msg');
  if (c) c.textContent = _caTxtContador(el.value, guardada);
  if (m) m.textContent = '';
}

function _caElegirDestino(fp, hueco) {
  _caDestino = (_caDestino && _caDestino.fp === fp && _caDestino.hueco === hueco) ? null : { fp: fp, hueco: hueco };
  _caRepintarDetalle(fp);
}

function _caRepintarDetalle(fp) {
  var det = typeof _daAbierto === 'string' ? document.getElementById('da-det-' + _daAbierto) : null;
  var cont = det && det.querySelector('.ca-detalle');
  if (typeof _daAbierto === 'string' && _daAbierto.slice(_daAbierto.indexOf(':') + 1) === fp && cont) {
    var nuevo = document.createElement('div');
    nuevo.innerHTML = _caHtmlDetalle({ fp: fp });   // lo escrito sin guardar sale de _caBorradores
    var nueva = nuevo.firstChild;
    cont.parentNode.replaceChild(nueva, cont);
    _caTrasPintar(nueva);
  }
}

function _caMsgDetalle(fp, texto, esError) {
  var el = document.getElementById('ca-msg-' + _caIdFp(fp));
  if (!el) return;
  el.textContent = texto;
  el.style.color = esError ? 'var(--red)' : 'var(--green)';
}

// ── URL firmadas ─────────────────────────────────────────────────────────

function _caStorageHeaders(extra) {
  return Object.assign({ apikey: SUPA_KEY, Authorization: 'Bearer ' + getToken() }, extra || {});
}

async function _caFirmar(rutas) {
  var ahora = Date.now();
  var faltan = rutas.filter(function(r) { return !_caUrls[r] || _caUrls[r].caduca - ahora < 5 * 60000; });
  if (!faltan.length) return;
  try {
    var r = await fetch(SUPA_URL + '/storage/v1/object/sign/' + CA_BUCKET, {
      method: 'POST', headers: _caStorageHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: CA_URL_SEG, paths: faltan })
    });
    if (!r.ok) { console.error('[capturas] firmar', r.status, await r.text()); return; }
    (await r.json()).forEach(function(x) {
      var s = x.signedURL || x.signedUrl;
      if (s && !x.error) _caUrls[x.path] = { url: SUPA_URL + '/storage/v1' + s, caduca: ahora + CA_URL_SEG * 1000 };
    });
  } catch (e) { console.error('[capturas] firmar', e); }
}

// ── Ver en grande ────────────────────────────────────────────────────────

async function _caVerGrande(ruta) {
  await _caFirmar([ruta]);
  var u = _caUrls[ruta];
  if (!u) return;
  var capa = document.createElement('div');
  capa.id = 'ca-grande';
  capa.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;padding:16px;cursor:zoom-out;';
  capa.innerHTML = '<img src="' + _caAttr(u.url) + '" alt="Captura" style="max-width:100%;max-height:100%;object-fit:contain;border:1px solid var(--border-gold);">' +
                   '<span style="position:absolute;top:12px;right:18px;font-size:28px;color:var(--gold);">×</span>';
  var cerrar = function() { capa.remove(); document.removeEventListener('keydown', esc); };
  var esc = function(e) { if (e.key === 'Escape') cerrar(); };
  capa.onclick = cerrar;
  document.addEventListener('keydown', esc);
  document.body.appendChild(capa);
}

// ── Obtener la imagen: pantalla, archivo o portapapeles ──────────────────

async function _caCapturarPantalla() {
  var stream = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    var video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    if (video.readyState < 2) await new Promise(function(ok) { video.onloadeddata = ok; });
    var canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    video.srcObject = null;
    return await _caComprimirCanvas(canvas);
  } catch (e) {
    if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') throw e;
    return null; // el usuario canceló
  } finally {
    if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
  }
}

function _caElegirArchivo() {
  return new Promise(function(ok) {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = function() { ok(inp.files && inp.files[0] ? inp.files[0] : null); };
    inp.click();
  });
}

function _caImagenDelPortapapeles(e) {
  var items = (e.clipboardData && e.clipboardData.items) || [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].kind === 'file' && /^image\//.test(items[i].type)) return items[i].getAsFile();
  }
  return null;
}

// ── Compresión: WebP (o JPG), máx. 1600 px de ancho, objetivo ≤ 250 KB ──

function _caABlob(canvas, tipo, q) {
  return new Promise(function(ok) { canvas.toBlob(function(b) { ok(b); }, tipo, q); });
}

async function _caComprimirCanvas(origen) {
  var w = origen.width, h = origen.height;
  var esc = Math.min(1, CA_ANCHO_MAX / w, CA_ALTO_MAX / h);
  var cw = Math.max(1, Math.round(w * esc)), ch = Math.max(1, Math.round(h * esc));
  var c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  var ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(origen, 0, 0, cw, ch);
  var tipo = 'image/webp', mejor = null;
  for (var i = 0; i < CA_CALIDADES.length; i++) {
    var b = await _caABlob(c, tipo, CA_CALIDADES[i]);
    if (!b) break;
    if (b.type !== tipo) { if (tipo === 'image/jpeg') break; tipo = 'image/jpeg'; i = -1; mejor = null; continue; } // sin WebP (Safari): JPG
    if (!mejor || b.size < mejor.size) mejor = b;
    if (b.size <= CA_OBJETIVO_BYTES) break;
  }
  if (!mejor) throw new Error('el navegador no pudo convertir la imagen');
  if (mejor.size > CA_MAX_BYTES) throw new Error('la imagen pesa más de 2 MB incluso comprimida');
  return { blob: mejor, ancho: cw, alto: ch, ext: tipo === 'image/webp' ? 'webp' : 'jpg', tipo: tipo };
}

async function _caComprimirArchivo(file) {
  if (!/^image\//.test(file.type || '')) throw new Error('el archivo no es una imagen');
  var fuente;
  if (typeof createImageBitmap === 'function') fuente = await createImageBitmap(file);
  else {
    fuente = await new Promise(function(ok, ko) {
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function() { URL.revokeObjectURL(u); ok(img); };
      img.onerror = function() { URL.revokeObjectURL(u); ko(new Error('no se pudo leer la imagen')); };
      img.src = u;
    });
  }
  var c = document.createElement('canvas');
  c.width = fuente.width || fuente.naturalWidth;
  c.height = fuente.height || fuente.naturalHeight;
  c.getContext('2d').drawImage(fuente, 0, 0);
  if (fuente.close) fuente.close();
  return _caComprimirCanvas(c);
}

// ── Guardar, reemplazar y borrar ─────────────────────────────────────────

function _caNombreArchivo(hueco, ext) {
  var azar = Math.random().toString(36).slice(2, 10);
  return hueco + '_' + Date.now().toString(36) + '_' + azar + '.' + ext;
}

async function _caSubirArchivo(ruta, img) {
  var r = await fetch(SUPA_URL + '/storage/v1/object/' + CA_BUCKET + '/' + ruta, {
    method: 'POST',
    headers: _caStorageHeaders({ 'Content-Type': img.tipo, 'x-upsert': 'false', 'cache-control': '31536000' }),
    body: img.blob
  });
  if (!r.ok) throw new Error('no se pudo subir la imagen (' + r.status + ': ' + (await r.text()).slice(0, 160) + ')');
}

async function _caBorrarArchivos(rutas) {
  try {
    var r = await fetch(SUPA_URL + '/storage/v1/object/' + CA_BUCKET, {
      method: 'DELETE', headers: _caStorageHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: rutas })
    });
    if (!r.ok) console.error('[capturas] borrar archivo', r.status, await r.text());
  } catch (e) { console.error('[capturas] borrar archivo', e); } // lo recoge el cron (huérfano)
}

// Enlaza la imagen al trade y hueco: sube, crea o actualiza la fila, borra la vieja.
async function _caGuardar(fp, hueco, img) {
  var uid = _caUid();
  var email = window.usuarioActual && window.usuarioActual.email;
  if (!uid || !email) throw new Error('sin sesión');
  var ruta = uid + '/' + _caNombreArchivo(hueco, img.ext);
  await _caSubirArchivo(ruta, img);
  var vieja = (_caCapturas[fp] || {})[hueco];
  var datos = { ruta: ruta, bytes: img.blob.size, ancho: img.ancho, alto: img.alto };
  var res = vieja
    ? await supaPatch('trade_capturas', 'usuario_email=eq.' + encodeURIComponent(email) + '&fp=eq.' + encodeURIComponent(fp) + '&hueco=eq.' + hueco, datos, getToken())
    : await supaPost('trade_capturas', Object.assign({ fp: fp, hueco: hueco }, datos), 'return=representation', getToken());
  if (res.error || !res.data || !res.data.length) {
    await _caBorrarArchivos([ruta]);
    throw new Error('no se pudo enlazar la captura (' + String(res.error || 'sin filas').slice(0, 200) + ')');
  }
  (_caCapturas[fp] = _caCapturas[fp] || {})[hueco] = res.data[0];
  if (vieja && vieja.ruta !== ruta) _caBorrarArchivos([vieja.ruta]);
}

async function _caBorrar(fp, hueco) {
  var f = (_caCapturas[fp] || {})[hueco];
  if (!f || _caOcupado) return;
  var nombre = CA_HUECOS.filter(function(h) { return h.id === hueco; })[0].txt;
  if (!confirm('¿Borrar la captura de ' + nombre + '? No se puede deshacer.')) return;
  _caOcupado = true;
  var email = encodeURIComponent(window.usuarioActual.email);
  var res = await supaDelete('trade_capturas', 'usuario_email=eq.' + email + '&fp=eq.' + encodeURIComponent(fp) + '&hueco=eq.' + hueco, getToken());
  _caOcupado = false;
  if (res.error) { _caMsgDetalle(fp, 'No se ha borrado: ' + String(res.error).slice(0, 160), true); return; }
  delete _caCapturas[fp][hueco];
  _caBorrarArchivos([f.ruta]);
  _caTrasCambio(fp, 'Captura borrada.');
}

// Repinta la lista (insignias) y deja el detalle abierto con un mensaje.
function _caTrasCambio(fp, texto, hueco) {
  _caAviso = { fp: fp, texto: texto, hueco: hueco || null };
  if (typeof _daPintar === 'function' && document.getElementById('diario-analisis-bloque')) _daPintar();
  else _caRepintarDetalle(fp);
}

// Reemplazar / añadir desde un hueco del detalle
async function _caCapturarPara(fp, hueco) {
  try {
    var img = await _caCapturarPantalla();
    if (img) await _caGuardarDesdeDetalle(fp, hueco, img);
  } catch (e) { _caMsgDetalle(fp, 'Error: ' + e.message, true); }
}

async function _caSubirPara(fp, hueco) {
  var file = await _caElegirArchivo();
  if (!file) return;
  try { await _caGuardarDesdeDetalle(fp, hueco, await _caComprimirArchivo(file)); }
  catch (e) { _caMsgDetalle(fp, 'Error: ' + e.message, true); }
}

async function _caGuardarDesdeDetalle(fp, hueco, img) {
  if (_caOcupado) return;
  _caOcupado = true;
  _caMsgDetalle(fp, 'Guardando…', false);
  try {
    var habia = !!(_caCapturas[fp] || {})[hueco];
    await _caGuardar(fp, hueco, img);
    _caDestino = null;
    _caTrasCambio(fp, (habia ? 'Captura reemplazada' : 'Captura guardada') + ' (' + Math.round(img.blob.size / 1024) + ' KB).');
  } catch (e) { _caMsgDetalle(fp, 'Error: ' + e.message, true); }
  finally { _caOcupado = false; }
}

// Nota de un hueco: vacío = borrar. Devuelve null si fue bien o el texto del error.
async function _caGuardarNotaDatos(fp, hueco, texto) {
  var email = encodeURIComponent(window.usuarioActual.email);
  var filtro = 'usuario_email=eq.' + email + '&fp=eq.' + encodeURIComponent(fp) + '&hueco=eq.' + hueco;
  var antes = (_caNotas[fp] || {})[hueco];
  var res;
  if (!texto) res = await supaDelete('trade_nota_hueco', filtro, getToken());
  else if (antes != null) res = await supaPatch('trade_nota_hueco', filtro, { nota: texto }, getToken());
  else res = await supaPost('trade_nota_hueco', { fp: fp, hueco: hueco, nota: texto }, 'return=representation', getToken());
  if (res.error) return String(res.error).slice(0, 160);
  if (texto) (_caNotas[fp] = _caNotas[fp] || {})[hueco] = texto;
  else if (_caNotas[fp]) delete _caNotas[fp][hueco];
  delete _caBorradores[fp + '|' + hueco];
  return null;
}

// Botón Guardar de una nota (ctx 'det' = detalle del trade, 'cap' = ventana de captura).
async function _caGuardarNota(fp, hueco, ctx) {
  var base = _caIdNota(ctx, fp, hueco);
  var t = document.getElementById(base), msg = document.getElementById(base + '-msg');
  if (!t) return;
  var poner = function(s, err) { if (msg) { msg.textContent = s; msg.style.color = err ? 'var(--red)' : 'var(--green)'; } };
  var texto = t.value.trim();
  if (texto.length > CA_NOTA_MAX) { poner('Máximo ' + CA_NOTA_MAX + ' caracteres.', true); return; }
  if (texto === ((_caNotas[fp] || {})[hueco] || '')) {
    delete _caBorradores[fp + '|' + hueco];
    t.value = texto;
    _caAlEscribir(t);
    poner('No hay cambios.', false);
    return;
  }
  poner('Guardando…', false);
  var err = await _caGuardarNotaDatos(fp, hueco, texto);
  if (err) { poner('No se ha guardado: ' + err, true); return; }
  var aviso = texto ? '✓ Guardado' : '✓ Nota borrada';
  if (ctx === 'det') { _caTrasCambio(fp, aviso, hueco); return; }
  // Ventana de captura: se queda abierta; la lista se repinta por la insignia 📝.
  t.value = texto;
  _caAlEscribir(t);
  if (typeof _daPintar === 'function' && document.getElementById('diario-analisis-bloque') &&
      (typeof _daHayAlgo !== 'function' || _daHayAlgo())) _daPintar();
  poner(aviso, false);
}

// ── Barra "Capturas" (arriba del Diario): capturar y enlazar ─────────────

function _caFilaTrade(t, abierto) {
  var lado = String(t.tipo || '').toLowerCase() === 'sell' ? 'Venta' : 'Compra';
  var cuando = abierto ? 'abierto ' + _daHora(t.fecha_entrada) : 'cerrado ' + _daHora(t.fecha_cierre);
  return (abierto ? '● ' : '') + lado + ' · ' + _daNombreCuenta(t.cuenta_numero) + ' · ' + cuando +
         (t.precio_entrada != null ? ' · ' + Number(t.precio_entrada).toFixed(2) : '');
}

async function _caCargarTrades() {
  var email = encodeURIComponent(window.usuarioActual.email);
  var cols = 'fp,cuenta_numero,tipo,precio_entrada,fecha_entrada,fecha_cierre';
  var res = await Promise.all([
    supaGet('ea_trades', 'usuario_email=eq.' + email + '&estado=eq.open&select=' + cols + '&order=fecha_entrada.desc', getToken()),
    supaGet('ea_trades', 'usuario_email=eq.' + email + '&estado=eq.closed&fecha_cierre=not.is.null&select=' + cols +
                         '&order=fecha_cierre.desc,position_id.desc&limit=' + CA_TRADES_LISTA, getToken())
  ]);
  if (res[0].error || res[1].error) throw new Error('no se pudieron leer tus trades');
  // Solo los abiertos de verdad (ver _daAbiertoReal en diario-analisis.js): fuera
  // los 'open' antiguos sin cierre registrado y los de cuentas que ya no son suyas.
  var abiertos = (res[0].data || []).filter(typeof _daAbiertoReal === 'function' ? _daAbiertoReal : function() { return true; });
  _caTrades = { abiertos: abiertos, cerrados: res[1].data || [] };
}

function _caHuecoPorDefecto(fp, abierto) {
  var c = _caCapturas[fp] || {};
  var orden = abierto ? ['entrada', 'gestion', 'salida'] : ['salida', 'gestion', 'entrada'];
  for (var i = 0; i < orden.length; i++) if (!c[orden[i]]) return orden[i];
  return orden[0];
}

function _caOpcionesHueco(fp, elegido) {
  var c = _caCapturas[fp] || {};
  return CA_HUECOS.map(function(h) {
    return '<option value="' + h.id + '"' + (h.id === elegido ? ' selected' : '') + '>' + h.txt + (c[h.id] ? ' (ocupado: se reemplaza)' : '') + '</option>';
  }).join('');
}

function _caPintarEnlazar() {
  var zona = document.getElementById('ca-enlazar');
  if (!zona || !_caNueva) { if (zona) zona.innerHTML = ''; return; }
  var ab = _caTrades.abiertos, ce = _caTrades.cerrados;
  var fpDef = ab.length === 1 ? ab[0].fp : ab.length > 1 ? '' : (ce[0] ? ce[0].fp : '');
  var aviso = ab.length > 1 ? '<div style="font-size:13px;color:var(--gold);margin-bottom:.5rem;">Tienes ' + ab.length + ' trades abiertos: elige a cuál va esta captura.</div>'
            : ab.length === 1 ? '' : '<div style="font-size:12px;color:var(--text-muted);margin-bottom:.5rem;">No tienes trades abiertos: va al último cerrado (puedes elegir otro).</div>';
  if (!ab.length && !ce.length) aviso = '<div style="font-size:13px;color:var(--red);margin-bottom:.5rem;">No hay trades de la EA a los que enlazar la captura.</div>';
  var opts = (ab.length > 1 ? '<option value="">— Elige el trade —</option>' : '') +
             (ab.length ? '<optgroup label="Abiertos">' + ab.map(function(t) { return '<option value="' + _caAttr(t.fp) + '" data-abierto="1"' + (t.fp === fpDef ? ' selected' : '') + '>' + _daEsc(_caFilaTrade(t, true)) + '</option>'; }).join('') + '</optgroup>' : '') +
             (ce.length ? '<optgroup label="Cerrados (últimos ' + ce.length + ')">' + ce.map(function(t) { return '<option value="' + _caAttr(t.fp) + '"' + (t.fp === fpDef ? ' selected' : '') + '>' + _daEsc(_caFilaTrade(t, false)) + '</option>'; }).join('') + '</optgroup>' : '');
  var hDef = fpDef ? _caHuecoPorDefecto(fpDef, ab.length > 0) : 'entrada';
  zona.innerHTML =
    '<div class="ca-enlazar-caja">' +
      '<img src="' + _caNueva.url + '" alt="Vista previa de la captura" class="ca-previa">' +
      '<div style="flex:1 1 260px;min-width:0;">' +
        aviso +
        '<label for="ca-sel-trade" class="ca-lbl">Trade</label>' +
        '<select id="ca-sel-trade" class="ca-sel" onchange="_caCambioTrade()">' + opts + '</select>' +
        '<label for="ca-sel-hueco" class="ca-lbl">Hueco</label>' +
        '<select id="ca-sel-hueco" class="ca-sel" onchange="_caPintarNotaCaptura()">' + _caOpcionesHueco(fpDef, hDef) + '</select>' +
        '<div id="ca-nota-cap" style="max-width:520px;margin-bottom:.5rem;"></div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin:.2rem 0 .8rem;">' + Math.round(_caNueva.blob.size / 1024) + ' KB · ' +
          _caNueva.ancho + '×' + _caNueva.alto + ' px · ' + _caNueva.ext.toUpperCase() + '</div>' +
        '<div style="display:flex;gap:.6rem;flex-wrap:wrap;">' +
          '<div class="btn-gold" style="font-size:13px;padding:.55rem 1.3rem;cursor:pointer;" onclick="_caEnlazar()">Guardar en el trade</div>' +
          '<div class="btn-outline" style="font-size:13px;padding:.55rem 1.3rem;" onclick="_caDescartar()">Descartar</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  _caPintarNotaCaptura();
}

// Nota del trade y hueco elegidos en la ventana de captura.
function _caPintarNotaCaptura() {
  var zona = document.getElementById('ca-nota-cap');
  var sel = document.getElementById('ca-sel-trade'), hs = document.getElementById('ca-sel-hueco');
  if (!zona || !sel || !hs) return;
  zona.innerHTML = sel.value
    ? _caHtmlNotaHueco(sel.value, hs.value, 'cap', null)
    : '<div style="font-size:12px;color:var(--text-muted);margin:.2rem 0 .3rem;">Elige el trade para escribir la nota de este hueco.</div>';
}

function _caCambioTrade() {
  var sel = document.getElementById('ca-sel-trade'), hs = document.getElementById('ca-sel-hueco');
  if (!sel || !hs) return;
  var op = sel.options[sel.selectedIndex];
  var abierto = !!(op && op.getAttribute('data-abierto'));
  hs.innerHTML = _caOpcionesHueco(sel.value, sel.value ? _caHuecoPorDefecto(sel.value, abierto) : 'entrada');
  _caPintarNotaCaptura();
}

function _caMsgBarra(texto, esError) {
  var el = document.getElementById('ca-msg');
  if (!el) return;
  el.textContent = texto;
  el.style.color = esError ? 'var(--red)' : 'var(--green)';
}

async function _caNuevaImagen(obtener) {
  if (_caOcupado) return;
  _caMsgBarra('', false);
  try {
    var img = await obtener();
    if (!img) return;
    await _caCargarTrades();
    if (_caNueva && _caNueva.url) URL.revokeObjectURL(_caNueva.url);
    img.url = URL.createObjectURL(img.blob);
    _caNueva = img;
    _caPintarEnlazar();
  } catch (e) { _caMsgBarra('Error: ' + e.message, true); }
}

function caCapturarPantalla() { _caNuevaImagen(_caCapturarPantalla); }
function caSubirImagen() {
  _caNuevaImagen(async function() { var f = await _caElegirArchivo(); return f ? _caComprimirArchivo(f) : null; });
}

function _caDescartar() {
  if (_caNueva && _caNueva.url) URL.revokeObjectURL(_caNueva.url);
  _caNueva = null;
  _caPintarEnlazar();
}

async function _caEnlazar() {
  var sel = document.getElementById('ca-sel-trade'), hs = document.getElementById('ca-sel-hueco');
  if (!_caNueva || !sel || !hs || _caOcupado) return;
  if (!sel.value) { _caMsgBarra('Elige a qué trade va la captura.', true); return; }
  var fp = sel.value, hueco = hs.value;
  var trade = sel.options[sel.selectedIndex].textContent;
  _caOcupado = true;
  _caMsgBarra('Guardando…', false);
  try {
    var habia = !!(_caCapturas[fp] || {})[hueco];
    await _caGuardar(fp, hueco, _caNueva);
    var kb = Math.round(_caNueva.blob.size / 1024);
    // La nota del hueco, si se ha escrito o cambiado en la ventana de captura.
    var tn = document.getElementById(_caIdNota('cap', fp, hueco)), notaTxt = '';
    if (tn && tn.value.trim() !== ((_caNotas[fp] || {})[hueco] || '') && tn.value.trim().length <= CA_NOTA_MAX) {
      var errNota = await _caGuardarNotaDatos(fp, hueco, tn.value.trim());
      notaTxt = errNota ? ' La nota NO se ha guardado: ' + errNota : ' y nota';
    }
    _caOcupado = false;
    _caDescartar();
    // Relee los abiertos: si el trade se abrió después de cargar el Diario, sale ya en "En curso".
    if (typeof _daRefrescarAbiertos === 'function') await _daRefrescarAbiertos();
    else if (typeof _daPintar === 'function' && document.getElementById('diario-analisis-bloque')) _daPintar();
    _caMsgBarra((habia ? 'Reemplazada' : 'Guardada') + ' en ' + trade.replace(/^● /, '') + ' · ' +
                _caHueco(hueco).txt + ' (' + kb + ' KB)' + (notaTxt === ' y nota' ? ' y nota guardada.' : '.' + notaTxt), /NO se ha/.test(notaTxt));
  } catch (e) {
    _caOcupado = false;
    _caMsgBarra('Error: ' + e.message, true);
  }
}

// Ctrl+V con el Diario a la vista: al hueco marcado en un detalle o, si no hay
// ninguno, como captura nueva para enlazar. En la nota (textarea) o cualquier
// campo de texto, el pegado normal no se toca.
function _caAlPegar(e) {
  var panel = document.getElementById('gpanel-diario');
  if (!panel || panel.style.display === 'none' || !_caTieneAcceso()) return;
  var t = e.target;
  if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
  var file = _caImagenDelPortapapeles(e);
  if (!file) return;
  e.preventDefault();
  if (_caDestino) {
    var d = _caDestino;
    _caComprimirArchivo(file).then(function(img) { return _caGuardarDesdeDetalle(d.fp, d.hueco, img); })
      .catch(function(err) { _caMsgDetalle(d.fp, 'Error: ' + err.message, true); });
  } else {
    _caNuevaImagen(function() { return _caComprimirArchivo(file); });
  }
}

function _caEstilos() {
  if (document.getElementById('ca-estilos')) return;
  var s = document.createElement('style');
  s.id = 'ca-estilos';
  s.textContent =
    '.ca-huecos{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:.6rem;}' +
    '.ca-hueco{border:1px solid var(--border);background:var(--bg2);padding:.6rem;cursor:pointer;outline:none;min-width:0;}' +
    '.ca-hueco.ca-activo{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold);}' +
    '.ca-mini{display:block;width:100%;height:110px;object-fit:cover;object-position:top left;background:#060810;border:1px solid var(--border);cursor:zoom-in;}' +
    '.ca-vacio{height:110px;display:flex;align-items:center;justify-content:center;border:1px dashed var(--border);font-size:12px;color:var(--text-muted);text-align:center;padding:.4rem;}' +
    '.ca-acciones{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.5rem;}' +
    '.ca-acciones .tab{padding:.3rem .6rem;font-size:11px;}' +
    '.ca-nota-caja{margin-top:.7rem;padding-top:.6rem;border-top:1px solid var(--border);cursor:default;}' +
    '.ca-nota-lbl{font-size:13px;color:var(--gold);display:block;margin-bottom:.3rem;}' +
    '.ca-nota-pie{display:flex;justify-content:space-between;align-items:center;gap:.5rem;margin-top:.35rem;flex-wrap:wrap;}' +
    '.ca-nota-cont{font-size:11px;color:var(--text-muted);}' +
    '.ca-nota-msg{font-size:13px;color:var(--green);}' +
    '.ca-nota-btn{font-size:12px;padding:.35rem 1rem;cursor:pointer;}' +
    '.ca-nota::placeholder{color:var(--text-muted);opacity:.8;}' +
    '.ca-nota{width:100%;box-sizing:border-box;background:#060810;border:1px solid var(--border);padding:.6rem .8rem;font-size:14px;color:var(--text);font-family:\'Outfit\',sans-serif;outline:none;resize:vertical;}' +
    '.ca-enlazar-caja{display:flex;flex-wrap:wrap;gap:1rem;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border);}' +
    '.ca-previa{flex:0 1 320px;max-width:100%;max-height:220px;object-fit:contain;border:1px solid var(--border);background:#060810;}' +
    '.ca-lbl{font-size:12px;color:var(--text-muted);display:block;margin:.2rem 0 .3rem;}' +
    '.ca-sel{width:100%;max-width:520px;box-sizing:border-box;background:#060810;border:1px solid var(--border);padding:.5rem .6rem;font-size:13px;color:var(--text);margin-bottom:.5rem;}';
  document.head.appendChild(s);
}

function _caHtmlBarra() {
  return '<div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);"></div>' +
    '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:.4rem 1rem;margin-bottom:.8rem;">' +
      '<span style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);">Capturas de tus trades</span>' +
      '<span style="font-size:12px;color:var(--text-muted);">' + _daEsc(_caTxtCaducidad()) + '</span>' +
    '</div>' +
    '<div style="display:flex;gap:.8rem;align-items:center;flex-wrap:wrap;">' +
      (_caPuedeCapturarPantalla() ? '<div class="btn-gold" style="font-size:13px;padding:.55rem 1.3rem;cursor:pointer;" onclick="caCapturarPantalla()">📷 Capturar pantalla</div>' : '') +
      '<div class="btn-outline" style="font-size:13px;padding:.55rem 1.3rem;" onclick="caSubirImagen()">Subir imagen</div>' +
      '<span style="font-size:12px;color:var(--text-muted);">o pega una imagen con Ctrl+V' +
        (_caPuedeCapturarPantalla() ? '' : ' · «Capturar pantalla» solo funciona en Chrome o Edge de escritorio') + '</span>' +
    '</div>' +
    '<div id="ca-enlazar"></div>' +
    '<div id="ca-msg" style="font-size:13px;margin-top:.6rem;min-height:1px;"></div>';
}

// Se llama al abrir el Diario (gestion.js). Crea o quita la barra según el
// Pack, y limpia la carpeta local de la antigua zona de pruebas.
function initCapturasTrade() {
  _caLimpiarZonaPruebas();
  var panel = document.getElementById('gpanel-diario');
  var bloque = document.getElementById('diario-analisis-bloque');
  if (!panel || !bloque) return;
  var barra = document.getElementById('ca-barra');
  if (!_caTieneAcceso()) { if (barra) barra.remove(); _caNueva = null; return; }
  _caEstilos();
  if (!barra) {
    barra = document.createElement('div');
    barra.id = 'ca-barra';
    barra.style.cssText = 'position:relative;border:1px solid var(--border-gold);background:var(--bg2);padding:1.1rem 1.2rem;margin:1rem 0 .5rem;';
    bloque.parentNode.insertBefore(barra, bloque);
    barra.innerHTML = _caHtmlBarra();
  }
  if (!window._caPegarListo) { document.addEventListener('paste', _caAlPegar); window._caPegarListo = true; }
}

// La zona de pruebas (capturas-test.js, hasta el 08/10) guardaba en IndexedDB
// el permiso de la carpeta local ('aurum_capturas_test'). Se borra la base
// entera una vez por navegador para que no vuelva a pedir "Reconectar".
function _caLimpiarZonaPruebas() {
  var vieja = document.getElementById('captura-test-zona');
  if (vieja) vieja.remove();
  try {
    if (localStorage.getItem('aurum_capturas_test_borrado') === '1') return;
    if (window.indexedDB) {
      var req = indexedDB.deleteDatabase('aurum_capturas_test');
      req.onsuccess = function() { try { localStorage.setItem('aurum_capturas_test_borrado', '1'); } catch (e) {} };
    }
  } catch (e) {}
}
