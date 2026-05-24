// ============================================================
// SUPABASE — Conexión y funciones de datos
// ============================================================

const SUPABASE_URL = 'https://rsrbxcvlnbwpiyhumqmt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_KjuStc-6eWMM5IfWLerZLw_BIKiZ5iV';

let sb = null;

function initSupabase() {
  if (typeof window.supabase !== 'undefined') {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase conectado');
    cargarDatosUsuario();
  }
}

// HISTORIALES
async function guardarHistorial(cuenta) {
  if (!sb || !usuarioActual) return;
  await sb.from('historiales').insert({
    usuario_email: usuarioActual.email,
    nombre: cuenta.nombre,
    tipo: cuenta.tipo || 'challenge',
    total: cuenta.total,
    wins: cuenta.wins,
    pnl: cuenta.pnl,
    wr: cuenta.wr,
    rr: cuenta.rr,
    periodo: cuenta.periodo,
    dias: cuenta.dias,
    tipos: cuenta.tipos,
    fps: cuenta.fps || []
  });
}

async function cargarHistoriales() {
  if (!sb || !usuarioActual) return;
  var res = await sb.from('historiales').select('*')
    .eq('usuario_email', usuarioActual.email)
    .order('created_at', { ascending: false });
  if (res.error || !res.data || res.data.length === 0) return;
  HISTORIAL_CUENTAS.length = 0;
  res.data.forEach(function(h) {
    HISTORIAL_CUENTAS.push({ nombre:h.nombre, tipo:h.tipo, total:h.total, wins:h.wins, pnl:h.pnl, wr:h.wr, rr:h.rr, periodo:h.periodo, dias:h.dias||[], tipos:h.tipos||{}, fps:h.fps||[] });
    (h.fps||[]).forEach(function(fp){ HISTORIAL_ALL_FPS.add(fp); });
  });
  var lista = document.getElementById('hist-lista');
  if (lista) { lista.innerHTML=''; HISTORIAL_CUENTAS.forEach(function(c,i){ histAnadirFila(c,i); }); }
}

// DIARIO
async function guardarEntradaDiarioSupabase(texto) {
  if (!sb || !usuarioActual) return false;
  var res = await sb.from('diario').insert({ usuario_email:usuarioActual.email, texto:texto, fecha:new Date().toISOString().split('T')[0] });
  return !res.error;
}

async function cargarDiario() {
  if (!sb || !usuarioActual) return;
  var res = await sb.from('diario').select('*').eq('usuario_email', usuarioActual.email).order('created_at',{ascending:false}).limit(20);
  if (res.error || !res.data) return;
  var entradas = document.getElementById('diario-entradas');
  if (!entradas) return;
  entradas.innerHTML = '';
  res.data.forEach(function(e) {
    var fechaStr = new Date(e.created_at).toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'});
    var div = document.createElement('div');
    div.style.cssText = 'background:var(--bg2);padding:1.5rem 2rem;position:relative;';
    div.innerHTML = '<div style="position:absolute;top:0;left:0;bottom:0;width:2px;background:linear-gradient(to bottom,transparent,var(--gold),transparent);"></div><div style="display:flex;justify-content:space-between;margin-bottom:.6rem;"><div style="font-size:12px;color:var(--gold-dim);">'+fechaStr+'</div><div style="font-size:11px;color:var(--green);">Guardada</div></div><div style="font-size:15px;color:var(--text-dim);line-height:1.8;">'+e.texto+'</div>';
    entradas.appendChild(div);
  });
}

// AGENDA
async function guardarAgendaSupabase(fecha, sesion) {
  if (!sb || !usuarioActual) return false;
  var res = await sb.from('agenda').insert({ usuario_email:usuarioActual.email, fecha:fecha, sesion:sesion });
  return !res.error;
}

async function cargarAgenda() {
  if (!sb || !usuarioActual) return;
  var hoy = new Date().toISOString().split('T')[0];
  var res = await sb.from('agenda').select('*').eq('usuario_email',usuarioActual.email).gte('fecha',hoy).order('fecha',{ascending:true});
  if (res.error || !res.data || res.data.length===0) return;
  var lista = document.getElementById('agenda-lista');
  if (!lista) return;
  lista.innerHTML = '';
  res.data.forEach(function(a) {
    var fechaStr = new Date(a.fecha+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});
    var item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:#0A0C18;border:1px solid var(--border);padding:.6rem 1rem;margin-bottom:.4rem;';
    item.innerHTML = '<div><div style="font-size:13px;color:var(--text-dim);">'+fechaStr+'</div><div style="font-size:11px;color:var(--gold);">'+a.sesion+'</div></div><div onclick="this.parentElement.remove()" style="font-size:12px;color:var(--text-muted);cursor:pointer;opacity:.5;">X</div>';
    lista.appendChild(item);
  });
}

async function cargarDatosUsuario() {
  await cargarHistoriales();
  await cargarDiario();
  await cargarAgenda();
}
