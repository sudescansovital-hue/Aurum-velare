// ============================================================
// ZONA DE PRUEBAS — Capturas por trade (Diario / Trade Record)
// Solo Caminos Senda, Cima, VIP. No construye la UI final de
// "3 capturas por trade" — valida las piezas técnicas sueltas:
// carpeta local (File System Access API) + captura de pantalla propia.
// No toca salas.js ni el flujo de LiveKit.
// ============================================================

var CAPTURAS_TEST_PACKS_PERMITIDOS = ['senda', 'cima', 'vip'];
var CAPTURAS_TEST_DB_NOMBRE = 'aurum_capturas_test';
var CAPTURAS_TEST_DB_VERSION = 1;
var CAPTURAS_TEST_STORE = 'handles';

var _capturasTestCarpetaHandle = null;
var _capturasTestBlobActual = null;
var _capturasTestImgUrlActual = null;

function _capturasTestTieneAcceso() {
  return !!(window.usuarioActual &&
    CAPTURAS_TEST_PACKS_PERMITIDOS.indexOf(window.usuarioActual.packSlug) !== -1);
}

function _capturasTestEsChromeReal() {
  var ua = navigator.userAgent || '';
  var esChromium = /Chrome\//.test(ua);
  var esEdge     = /Edg\//.test(ua);
  var esOpera    = /OPR\//.test(ua);
  var esBrave    = !!navigator.brave;
  var esVivaldi  = /Vivaldi/.test(ua);
  return esChromium && !esEdge && !esOpera && !esBrave && !esVivaldi;
}

function _capturasTestNavegadorSoportado() {
  var tieneDirPicker     = typeof window.showDirectoryPicker === 'function';
  var tieneScreenCapture = !!(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function');
  return _capturasTestEsChromeReal() && tieneDirPicker && tieneScreenCapture;
}

// ── IndexedDB — guarda el FileSystemDirectoryHandle (no localStorage, no Supabase) ──

function _capturasTestAbrirDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(CAPTURAS_TEST_DB_NOMBRE, CAPTURAS_TEST_DB_VERSION);
    req.onupgradeneeded = function() { req.result.createObjectStore(CAPTURAS_TEST_STORE); };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror   = function() { reject(req.error); };
  });
}

async function _capturasTestGuardarHandle(handle) {
  var db = await _capturasTestAbrirDB();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(CAPTURAS_TEST_STORE, 'readwrite');
    tx.objectStore(CAPTURAS_TEST_STORE).put(handle, 'carpeta');
    tx.oncomplete = function() { resolve(); };
    tx.onerror    = function() { reject(tx.error); };
  });
}

async function _capturasTestLeerHandle() {
  var db = await _capturasTestAbrirDB();
  return new Promise(function(resolve, reject) {
    var tx  = db.transaction(CAPTURAS_TEST_STORE, 'readonly');
    var req = tx.objectStore(CAPTURAS_TEST_STORE).get('carpeta');
    req.onsuccess = function() { resolve(req.result || null); };
    req.onerror   = function() { reject(req.error); };
  });
}

// ── Estado de carpeta ──

function _capturasTestPintarEstadoCarpeta(estado, nombre) {
  var el = document.getElementById('captura-test-estado-carpeta');
  if (!el) return;
  if (estado === 'ok') {
    el.textContent = 'Carpeta: ' + nombre;
    el.style.color = 'var(--green)';
  } else if (estado === 'permiso_denegado') {
    el.textContent = 'Permiso denegado, vuelve a elegir';
    el.style.color = 'var(--red)';
  } else {
    el.textContent = 'Sin carpeta';
    el.style.color = 'var(--text-muted)';
  }
}

async function _capturasTestRefrescarEstadoCarpeta() {
  var handle;
  try {
    handle = await _capturasTestLeerHandle();
  } catch (e) {
    _capturasTestPintarEstadoCarpeta('sin_carpeta');
    return;
  }
  if (!handle) {
    _capturasTestCarpetaHandle = null;
    _capturasTestPintarEstadoCarpeta('sin_carpeta');
    return;
  }
  var permiso = await handle.queryPermission({ mode: 'readwrite' });
  _capturasTestCarpetaHandle = handle;
  _capturasTestPintarEstadoCarpeta(permiso === 'granted' ? 'ok' : 'permiso_denegado', handle.name);
}

async function elegirCarpetaCapturasTest() {
  try {
    var handle = await window.showDirectoryPicker();
    var permiso = await handle.queryPermission({ mode: 'readwrite' });
    if (permiso !== 'granted') permiso = await handle.requestPermission({ mode: 'readwrite' });
    await _capturasTestGuardarHandle(handle);
    _capturasTestCarpetaHandle = handle;
    _capturasTestPintarEstadoCarpeta(permiso === 'granted' ? 'ok' : 'permiso_denegado', handle.name);
  } catch (e) {
    if (e.name !== 'AbortError') _capturasTestMostrarMsg('Error al elegir carpeta: ' + e.message, true);
  }
}

// ── Captura de pantalla propia (independiente de Salas/LiveKit) ──

function _capturasTestEsperarFrame(video) {
  return new Promise(function(resolve) {
    if (video.readyState >= 2) return resolve();
    video.onloadeddata = function() { resolve(); };
  });
}

async function capturarPantallaTest() {
  var stream = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    var video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await _capturasTestEsperarFrame(video);

    var canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    video.srcObject = null;

    canvas.toBlob(function(blob) {
      _capturasTestBlobActual = blob;
      if (_capturasTestImgUrlActual) URL.revokeObjectURL(_capturasTestImgUrlActual);
      _capturasTestImgUrlActual = URL.createObjectURL(blob);
      var img = document.getElementById('captura-test-img');
      if (img) { img.src = _capturasTestImgUrlActual; img.style.display = 'block'; }
      var guardarZona = document.getElementById('captura-test-guardar-zona');
      if (guardarZona) guardarZona.style.display = 'block';
    }, 'image/jpeg', 0.92);
  } catch (e) {
    if (e.name !== 'NotAllowedError') _capturasTestMostrarMsg('Error al capturar pantalla: ' + e.message, true);
  } finally {
    if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
  }
}

// ── Guardar en la carpeta elegida ──

async function guardarCapturaEnCarpetaTest() {
  if (!_capturasTestCarpetaHandle) { _capturasTestMostrarMsg('Elige primero una carpeta.', true); return; }
  if (!_capturasTestBlobActual)    { _capturasTestMostrarMsg('Captura una pantalla primero.', true); return; }

  var permiso = await _capturasTestCarpetaHandle.queryPermission({ mode: 'readwrite' });
  if (permiso !== 'granted') permiso = await _capturasTestCarpetaHandle.requestPermission({ mode: 'readwrite' });
  if (permiso !== 'granted') { _capturasTestPintarEstadoCarpeta('permiso_denegado', _capturasTestCarpetaHandle.name); _capturasTestMostrarMsg('Sin permiso de escritura en la carpeta.', true); return; }

  try {
    var ts = Date.now();
    var nombreImg  = 'captura_' + ts + '.jpg';
    var nombreJson = 'captura_' + ts + '.json';
    var nota = (document.getElementById('captura-test-nota') || {}).value || '';

    var fhImg = await _capturasTestCarpetaHandle.getFileHandle(nombreImg, { create: true });
    var wImg  = await fhImg.createWritable();
    await wImg.write(_capturasTestBlobActual);
    await wImg.close();

    var fhJson = await _capturasTestCarpetaHandle.getFileHandle(nombreJson, { create: true });
    var wJson  = await fhJson.createWritable();
    await wJson.write(JSON.stringify({ imagen: nombreImg, nota: nota, fecha: new Date(ts).toISOString() }, null, 2));
    await wJson.close();

    _capturasTestMostrarMsg('Guardado: ' + nombreImg, false);
  } catch (e) {
    _capturasTestMostrarMsg('Error al guardar: ' + e.message, true);
  }
}

function _capturasTestMostrarMsg(texto, esError) {
  var el = document.getElementById('captura-test-msg');
  if (!el) return;
  el.textContent = texto;
  el.style.color = esError ? 'var(--red)' : 'var(--green)';
}

// ── Construcción de la zona (solo si hay acceso — nada se añade al DOM si no) ──

function _capturasTestCrearZona() {
  var zona = document.createElement('div');
  zona.id = 'captura-test-zona';
  zona.style.cssText = 'display:block;margin-top:2rem;border:1px solid var(--border-gold);background:var(--bg2);padding:1.5rem;position:relative;';

  if (!_capturasTestNavegadorSoportado()) {
    zona.innerHTML =
      '<div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);"></div>' +
      '<div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--gold);margin-bottom:1rem;">Zona de pruebas — Capturas por trade</div>' +
      '<div style="font-size:13px;color:var(--red);line-height:1.7;">Esta función solo está garantizada en Google Chrome de escritorio. Tu navegador actual no soporta la elección de carpeta local y/o la captura de pantalla necesarias — no se mostrarán los controles.</div>';
    return zona;
  }

  zona.innerHTML =
    '<div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);"></div>' +
    '<div style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--gold);margin-bottom:1rem;">Zona de pruebas — Capturas por trade (validación técnica, no es la función final)</div>' +

    '<div style="display:flex;gap:1rem;align-items:center;margin-bottom:1.2rem;flex-wrap:wrap;">' +
      '<div onclick="elegirCarpetaCapturasTest()" class="btn-outline" style="font-size:13px;padding:.6rem 1.5rem;">Elegir carpeta de mis capturas</div>' +
      '<div id="captura-test-estado-carpeta" style="font-size:13px;color:var(--text-muted);">Sin carpeta</div>' +
    '</div>' +

    '<div style="margin-bottom:1.2rem;">' +
      '<div onclick="capturarPantallaTest()" class="btn-outline" style="font-size:13px;padding:.6rem 1.5rem;display:inline-block;">Capturar pantalla</div>' +
    '</div>' +

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">' +
      '<div><img id="captura-test-img" style="display:none;max-width:100%;border:1px solid var(--border);" /></div>' +
      '<div>' +
        '<label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:.4rem;">Nota de esta captura</label>' +
        '<textarea id="captura-test-nota" rows="4" style="width:100%;background:#060810;border:1px solid var(--border);padding:.8rem;font-size:14px;color:var(--text);font-family:\'Outfit\',sans-serif;outline:none;resize:none;"></textarea>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-top:.5rem;">Vista previa: <span id="captura-test-nota-preview"></span></div>' +
      '</div>' +
    '</div>' +

    '<div id="captura-test-guardar-zona" style="display:none;margin-top:1rem;">' +
      '<div onclick="guardarCapturaEnCarpetaTest()" class="btn-gold" style="font-size:13px;padding:.6rem 1.5rem;display:inline-block;">Guardar en mi carpeta</div>' +
    '</div>' +

    '<div id="captura-test-msg" style="font-size:13px;margin-top:.8rem;min-height:18px;"></div>';

  var nota = zona.querySelector('#captura-test-nota');
  var preview = zona.querySelector('#captura-test-nota-preview');
  if (nota && preview) {
    nota.addEventListener('input', function() { preview.textContent = nota.value; });
  }

  return zona;
}

function initZonaCapturasTest() {
  var contenedor = document.getElementById('gpanel-diario');
  if (!contenedor) return;
  var existente = document.getElementById('captura-test-zona');

  if (!_capturasTestTieneAcceso()) {
    if (existente) existente.remove();
    return;
  }

  if (existente) {
    _capturasTestRefrescarEstadoCarpeta();
    return;
  }

  contenedor.appendChild(_capturasTestCrearZona());
  if (_capturasTestNavegadorSoportado()) _capturasTestRefrescarEstadoCarpeta();
}
