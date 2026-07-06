// ============================================================
// AUTH — aurum-3.5
// Supabase Auth real: signInWithPassword, signOut, getSession
// ============================================================

var SESSION = null; // { access_token, refresh_token, user }
var _AURUM_SK = 'aurum_session_v12';
var _refreshTimer = null;

// FIX corazón de datos (06/07): getToken() nunca renovaba el access_token —
// tras ~1h de inactividad (expiración estándar del JWT de Supabase), las
// peticiones fallaban con "JWT expired" mientras la UI ya cargada seguía
// visible, sin ningún aviso. getToken() se llama de forma síncrona en
// decenas de sitios (gestion.js, historial.js, app.js...), así que en vez
// de tocar todos esos sitios para hacerlos async, se programa un refresco
// EN SEGUNDO PLANO que renueva el token un poco antes de que caduque —
// getToken() sigue funcionando exactamente igual, pero nunca devuelve un
// token caducado mientras la sesión siga activa.

function _decodeJwtExp(token) {
  try {
    var payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp || null; // segundos unix
  } catch (e) { return null; }
}

function _programarRefresh() {
  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
  if (!SESSION || !SESSION.access_token) return;
  var exp = _decodeJwtExp(SESSION.access_token);
  if (!exp) return;
  var msHastaExpirar = (exp * 1000) - Date.now();
  var msParaRefrescar = Math.max(msHastaExpirar - 5 * 60 * 1000, 5000); // 5 min antes, mínimo 5s
  _refreshTimer = setTimeout(_refrescarToken, msParaRefrescar);
}

async function _refrescarToken() {
  if (!SESSION || !SESSION.refresh_token) return;
  var res = await supaAuthPost('/token?grant_type=refresh_token', { refresh_token: SESSION.refresh_token });
  if (res.error || !res.data || !res.data.access_token) {
    console.error('[AUTH] Error al refrescar token — se reintentará en el próximo getSession()/loadStoredSession():', res.error);
    return; // no se cierra sesión aquí; un fallo puntual de red no debe desloguear al usuario
  }
  SESSION.access_token  = res.data.access_token;
  SESSION.refresh_token = res.data.refresh_token || SESSION.refresh_token;
  localStorage.setItem(_AURUM_SK, JSON.stringify(SESSION));
  _programarRefresh();
}

async function signInWithPassword(email, password) {
  var res = await supaAuthPost('/token?grant_type=password', { email, password });
  if (res.error) return { user: null, error: res.error };
  SESSION = {
    access_token:  res.data.access_token,
    refresh_token: res.data.refresh_token,
    user:          res.data.user
  };
  localStorage.setItem(_AURUM_SK, JSON.stringify(SESSION));
  _programarRefresh();
  return { user: SESSION.user, error: null };
}

async function signOut() {
  var token = SESSION ? SESSION.access_token : '';
  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
  SESSION = null;
  localStorage.removeItem(_AURUM_SK);
  try { await fetch(SUPA_URL+'/auth/v1/logout',{method:'POST',headers:{apikey:SUPA_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json'}}); } catch(e) {}
}

async function loadStoredSession() {
  var raw = localStorage.getItem(_AURUM_SK);
  if (!raw) return null;
  try { SESSION = JSON.parse(raw); } catch(e) { localStorage.removeItem(_AURUM_SK); return null; }
  var res = await supaAuthGet('/user', SESSION.access_token);
  if (res.error) { SESSION = null; localStorage.removeItem(_AURUM_SK); return null; }
  SESSION.user = res.data;
  _programarRefresh();
  return SESSION;
}

async function getSession() {
  if (!SESSION) return null;
  var res = await supaAuthGet('/user', SESSION.access_token);
  if (res.error) { SESSION = null; return null; }
  SESSION.user = res.data;
  return SESSION;
}

function getToken() {
  return SESSION ? SESSION.access_token : null;
}

function getCurrentUser() {
  return SESSION ? SESSION.user : null;
}
