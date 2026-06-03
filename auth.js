// ============================================================
// AUTH — aurum-3.5
// Supabase Auth real: signInWithPassword, signOut, getSession
// ============================================================

var SESSION = null; // { access_token, refresh_token, user }
var _AURUM_SK = 'aurum_session_v12';

async function signInWithPassword(email, password) {
  var res = await supaAuthPost('/token?grant_type=password', { email, password });
  if (res.error) return { user: null, error: res.error };
  SESSION = {
    access_token:  res.data.access_token,
    refresh_token: res.data.refresh_token,
    user:          res.data.user
  };
  localStorage.setItem(_AURUM_SK, JSON.stringify(SESSION));
  return { user: SESSION.user, error: null };
}

async function signOut() {
  var token = SESSION ? SESSION.access_token : '';
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
