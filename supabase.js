// ============================================================
// SUPABASE CLIENT v2
// Fetch nativo, sin SDK
// ============================================================

const SUPA_URL = 'https://rsrbxcvlnbwpiyhumqmt.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzcmJ4Y3ZsbmJ3cGl5aHVtcW10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzNTAsImV4cCI6MjA5NTIyMjM1MH0.DpcY9s7DK7l4qVHmint9HQIJK6icnwnfbGvQ-XH15mY';

var _supabaseClient = supabase.createClient(SUPA_URL, SUPA_KEY);

function _headers(token) {
  var h = {
    'apikey': SUPA_KEY,
    'Content-Type': 'application/json'
  };
  h['Authorization'] = 'Bearer ' + (token || SUPA_KEY);
  return h;
}

async function supaGet(tabla, params, token) {
  var url = SUPA_URL + '/rest/v1/' + tabla + (params ? '?' + params : '');
  var r = await fetch(url, { headers: _headers(token) }).catch(function(e) { console.error('[SUPA fetch error]', e); return {ok:false, text: async function(){return e.message;}}; });
  if (!r.ok) { var e = await r.text(); return { data: null, error: e }; }
  return { data: await r.json(), error: null };
}

async function supaPost(tabla, body, prefer, token) {
  var url = SUPA_URL + '/rest/v1/' + tabla;
  var r = await fetch(url, {
    method: 'POST',
    headers: Object.assign(_headers(token), { 'Prefer': prefer || 'return=representation' }),
    body: JSON.stringify(body)
  });
  if (!r.ok) { var e = await r.text(); return { data: null, error: e }; }
  var text = await r.text();
  return { data: text ? JSON.parse(text) : null, error: null };
}

async function supaPatch(tabla, params, body, token) {
  var url = SUPA_URL + '/rest/v1/' + tabla + '?' + params;
  var r = await fetch(url, {
    method: 'PATCH',
    headers: Object.assign(_headers(token), { 'Prefer': 'return=representation' }),
    body: JSON.stringify(body)
  });
  if (!r.ok) { var e = await r.text(); return { data: null, error: e }; }
  var text = await r.text();
  return { data: text ? JSON.parse(text) : null, error: null };
}

async function supaDelete(tabla, params, token) {
  var url = SUPA_URL + '/rest/v1/' + tabla + '?' + params;
  var r = await fetch(url, {
    method: 'DELETE',
    headers: _headers(token)
  });
  if (!r.ok) { var e = await r.text(); return { error: e }; }
  return { error: null };
}

async function supaAuthPost(path, body, token) {
  var url = SUPA_URL + '/auth/v1' + path;
  var r = await fetch(url, {
    method: 'POST',
    headers: Object.assign(_headers(token), { 'apikey': SUPA_KEY }),
    body: JSON.stringify(body)
  });
  var text = await r.text(); var data = text ? JSON.parse(text) : {};
  if (!r.ok) return { data: null, error: data.error_description || data.msg || JSON.stringify(data) };
  return { data, error: null };
}

async function supaAdminPost(endpoint, body) {
  var url = SUPA_URL + '/auth/v1' + endpoint;
  var r = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify(body)
  });
  var data = await r.json();
  if (!r.ok) return { data: null, error: data.error_description || data.msg || JSON.stringify(data) };
  return { data, error: null };
}

async function supaAuthGet(path, token) {
  var url = SUPA_URL + '/auth/v1' + path;
  var r = await fetch(url, { headers: _headers(token) });
  var data = await r.json();
  if (!r.ok) return { data: null, error: data.error_description || data.msg || JSON.stringify(data) };
  return { data, error: null };
}
