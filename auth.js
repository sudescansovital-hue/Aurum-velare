// ============================================================
// AUTH — aurum-3.5
// Supabase Auth real: signInWithPassword, signOut, getSession
// ============================================================

var SESSION = null; // { access_token, refresh_token, user }

async function signInWithPassword(email, password) {
  var res = await supaAuthPost('/token?grant_type=password', { email, password });
  if (res.error) return { user: null, error: res.error };
  SESSION = {
    access_token:  res.data.access_token,
    refresh_token: res.data.refresh_token,
    user:          res.data.user
  };
  return { user: SESSION.user, error: null };
}

async function signOut() {
  if (!SESSION) return;
  await supaAuthPost('/logout', {}, SESSION.access_token);
  SESSION = null;
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
