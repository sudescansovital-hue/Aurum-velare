//+------------------------------------------------------------------+
//| EA_Aurum_Tracker.mq5                                             |
//| Aurum Velare — Registro automático de trades XAU/USD en Supabase |
//+------------------------------------------------------------------+
#property copyright "Aurum Velare"
#property link      "https://aurumvelare.com"
#property version   "1.03"
// 1.02 (27/08): mapa de volumen por posición -> clasificación fiable parcial vs
//   cierre total (antes un parcial podía pisar precio_cierre). SL movido se
//   parte en breakeven/sl_protegido/sl_ajustado. Cierre distingue TP/SL/manual.
// 1.03 (04/09): captura MFE/MAE (máximo favorable/adverso) por posición.
//   Muestreo throttled en OnTick (ver IntervaloExtremosSegundos), persistido
//   en aurum_extremos_<cuenta>.txt igual que la cola. Solo toca OnTick,
//   OnInit, HandleDealClose y BuildCloseJson (parámetros opcionales — no
//   afecta a la llamada ya existente en SyncHistory48h).

//--- Inputs
// Email lleva valor por defecto real: si el EA se reinicia por cualquier
// motivo (recompilar, REASON_PARAMETERS, etc.) no se queda sin email.
input string InEmail       = "roderastrader@gmail.com";
// Token y EaPassword NO se hardcodean aquí (este archivo está en git). Si
// se dejan vacíos, OnInit los autorrellena desde el archivo local
// Common\Files\aurum_auth_<cuenta>.txt (ver CargarAuthDeArchivo) — ese
// archivo está en .gitignore y nunca se commitea. Rellenar el input tiene
// prioridad sobre el archivo.
input string InEaPassword  = "";
input string InToken       = "";
input string EndpointURL    = "https://aurumvelare.com/api/trade-mt5";
input string EventoEndpointURL = "https://aurumvelare.com/api/trade-evento"; // FASE 3 (brief linea de tiempo Diario): entrada/breakeven/parcial/cierre
input int    AvisarCadaXIntentos = 10; // FIX 06/07: ya no se descarta nunca; esto solo controla cada cuántos intentos fallidos se avisa en el log
input int    IntervaloEnvioSegundos = 3600; // cada cuánto se procesa la cola (por defecto 1h)
input int    HorasSync      = 48;
input int    IntervaloExtremosSegundos = 2; // MFE/MAE (04/09): cada cuánto se muestrea Bid/Ask de posiciones abiertas en OnTick. Independiente de IntervaloEnvioSegundos (ese solo vacía la cola, corre cada 1h por defecto).

//--- Globales
string g_cuenta_numero = "";
bool   g_sync_done     = false;

// Credenciales EFECTIVAS que usan los constructores JSON. Se resuelven en
// OnInit: input si está puesto, si no, archivo local aurum_auth_<cuenta>.txt.
string g_email        = "";
string g_token        = "";
string g_ea_password  = "";

//--- Mapa SL (arrays paralelos)
ulong  g_sl_pos_ids[];
double g_sl_values[];

//--- Mapa TP (arrays paralelos, espejo del mapa SL)
ulong  g_tp_pos_ids[];
double g_tp_values[];

//--- Mapa VOLUMEN (arrays paralelos, espejo del mapa SL) — FIX 27/08.
// Sin esto el EA no podía distinguir un cierre parcial (volumen baja pero
// sigue > 0) de un cierre total (volumen llega a 0): si PositionSelectByTicket
// fallaba en el instante exacto de un deal OUT parcial, ese parcial se
// archivaba como EL cierre y su precio pisaba precio_cierre de la operación
// (caso real fp=2026.08.27_21978908).
ulong  g_vol_pos_ids[];
double g_vol_values[];

//--- Mapa EXTREMOS (máx/mín de precio por posición) — MFE/MAE (04/09).
// A diferencia de los mapas SL/TP/Vol, aquí interesa el precio más
// favorable y el más adverso vistos desde la apertura, no solo el último
// valor. Se siembra con el precio de entrada real (PositionGetDouble),
// nunca con el precio del primer tick visto — así funciona igual si el EA
// lleva la posición desde el open o si se reinició a media operación.
ulong  g_ext_pos_ids[];
double g_ext_max[];
double g_ext_min[];

//--- Cola de reintentos
struct PendingEvent {
   string   json_body;
   int      reintentos;
   datetime ultimo_intento;
};
PendingEvent g_cola[];

//--- Cola de reintentos SEPARADA para /api/trade-evento (FASE 3, brief linea
// de tiempo Diario). Aislada a proposito de g_cola: g_cola ya tuvo el bug de
// duplicacion exponencial (ver comentarios de CargarColaPersistida), asi que
// esta cola nueva no comparte funciones ni estado con la existente.
PendingEvent g_cola_eventos[];

//--- Persistencia de la cola a disco (sobrevive a reinicios del EA)
// FIX corazón de datos (06/07): g_cola vivía solo en memoria — cualquier
// reinicio del EA (cambio de gráfico, reconexión, recompilar, lo que sea)
// borraba silenciosamente todo lo que estuviera pendiente de enviar, sin
// dejar rastro. Confirmado en vivo: pos:18796702 se perdió por completo
// (0 filas en ea_trades) por reinicios sucesivos antes de que
// IntervaloEnvioSegundos (3600s por defecto) llegara a vaciar la cola.
string ColaFileName() {
   return "aurum_cola_" + g_cuenta_numero + ".txt";
}

// Archivo de persistencia separado para g_cola_eventos — nunca comparte
// nombre ni contenido con ColaFileName(), para no arriesgar mezclar las dos
// colas en disco.
string ColaEventosFileName() {
   return "aurum_cola_eventos_" + g_cuenta_numero + ".txt";
}

// Archivo local de credenciales (Common\Files\). NO está en git (.gitignore)
// — vive solo en esta máquina. Red de seguridad: si el EA se reinicia con
// los inputs InToken/InEaPassword vacíos, CargarAuthDeArchivo() los rellena
// desde aquí en vez de dejar el EA sin autenticar o con valores viejos.
// Formato: una "clave=valor" por línea (lineas '#' = comentario):
//   email=roderastrader@gmail.com
//   ea_password=...
//   token=...
string AuthFileName() {
   return "aurum_auth_" + g_cuenta_numero + ".txt";
}

// Archivo de persistencia para el mapa de extremos (MFE/MAE, 04/09) —
// mismo patrón que ColaFileName/ColaEventosFileName: un archivo por cuenta
// en Common\Files\, reescrito entero en cada cambio (ver PersistirExtremos).
string ExtremosFileName() {
   return "aurum_extremos_" + g_cuenta_numero + ".txt";
}

// Rellena SOLO los g_* que sigan vacíos tras leer los inputs. El input
// siempre gana sobre el archivo. Best-effort: si el archivo no existe o no
// se puede leer, se sigue con lo que haya en los inputs (y OnInit decide si
// eso basta para arrancar).
void CargarAuthDeArchivo() {
   string fname = AuthFileName();
   if(!FileIsExist(fname, FILE_COMMON)) {
      Print("[AURUM] Sin archivo de auth local (", fname, ") — se usan solo los inputs");
      return;
   }
   int fh = FileOpen(fname, FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if(fh == INVALID_HANDLE) {
      Print("[AURUM] ERROR: no se pudo leer ", fname, " | error:", GetLastError());
      return;
   }
   int rellenados = 0;
   while(!FileIsEnding(fh)) {
      string linea = FileReadString(fh);
      StringTrimLeft(linea); StringTrimRight(linea);
      if(StringLen(linea) == 0 || StringGetCharacter(linea, 0) == '#') continue;
      int eq = StringFind(linea, "=");
      if(eq <= 0) continue;
      string clave = StringSubstr(linea, 0, eq);
      string valor = StringSubstr(linea, eq + 1);
      StringTrimLeft(clave); StringTrimRight(clave);
      StringTrimLeft(valor); StringTrimRight(valor);
      if(clave == "email"       && g_email == "")       { g_email = valor;       rellenados++; }
      if(clave == "token"       && g_token == "")       { g_token = valor;       rellenados++; }
      if(clave == "ea_password" && g_ea_password == "") { g_ea_password = valor; rellenados++; }
   }
   FileClose(fh);
   Print("[AURUM] Auth local: ", rellenados, " campo(s) rellenado(s) desde ", fname);
}

//+------------------------------------------------------------------+
//| UTILIDADES                                                        |
//+------------------------------------------------------------------+

bool EsXauusd(const string sym) {
   string u = sym;
   StringToUpper(u);
   return (StringFind(u, "XAU") >= 0 || StringFind(u, "GOLD") >= 0);
}

string DatetimeToISO(datetime t) {
   string s  = TimeToString(t, TIME_DATE | TIME_SECONDS);
   string d  = StringSubstr(s, 0, 10);
   string tm = StringSubstr(s, 11, 8);
   StringReplace(d, ".", "-");
   return d + "T" + tm;
}

string BuildFp(datetime entry_time, ulong pos_id) {
   // Formato idéntico al parser.js: "YYYY.MM.DD_positionId"
   return TimeToString(entry_time, TIME_DATE) + "_" + IntegerToString(pos_id);
}

bool ArrayContainsUlong(ulong &arr[], ulong val) {
   int n = ArraySize(arr);
   for(int i = 0; i < n; i++)
      if(arr[i] == val) return true;
   return false;
}

void ArrayAddUlong(ulong &arr[], ulong val) {
   int n = ArraySize(arr);
   ArrayResize(arr, n + 1);
   arr[n] = val;
}

//+------------------------------------------------------------------+
//| MAPA SL                                                           |
//+------------------------------------------------------------------+

void SlMapSet(ulong pos_id, double sl) {
   int n = ArraySize(g_sl_pos_ids);
   for(int i = 0; i < n; i++) {
      if(g_sl_pos_ids[i] == pos_id) { g_sl_values[i] = sl; return; }
   }
   ArrayResize(g_sl_pos_ids, n + 1);
   ArrayResize(g_sl_values,  n + 1);
   g_sl_pos_ids[n] = pos_id;
   g_sl_values[n]  = sl;
}

// Devuelve -1.0 si la posición no está en el mapa
double SlMapGet(ulong pos_id) {
   int n = ArraySize(g_sl_pos_ids);
   for(int i = 0; i < n; i++)
      if(g_sl_pos_ids[i] == pos_id) return g_sl_values[i];
   return -1.0;
}

void SlMapRemove(ulong pos_id) {
   int n = ArraySize(g_sl_pos_ids);
   for(int i = 0; i < n; i++) {
      if(g_sl_pos_ids[i] == pos_id) {
         for(int j = i; j < n - 1; j++) {
            g_sl_pos_ids[j] = g_sl_pos_ids[j + 1];
            g_sl_values[j]  = g_sl_values[j + 1];
         }
         ArrayResize(g_sl_pos_ids, n - 1);
         ArrayResize(g_sl_values,  n - 1);
         return;
      }
   }
}

//+------------------------------------------------------------------+
//| MAPA TP (espejo exacto del mapa SL)                               |
//+------------------------------------------------------------------+
// FIX corazón de datos (06/07): bug #2 confirmado — HandlePositionModified
// nunca trackeaba cambios de TP. Este mapa permite detectar cambios de TP
// en tiempo real igual que ya se hace con SL.

void TpMapSet(ulong pos_id, double tp) {
   int n = ArraySize(g_tp_pos_ids);
   for(int i = 0; i < n; i++) {
      if(g_tp_pos_ids[i] == pos_id) { g_tp_values[i] = tp; return; }
   }
   ArrayResize(g_tp_pos_ids, n + 1);
   ArrayResize(g_tp_values,  n + 1);
   g_tp_pos_ids[n] = pos_id;
   g_tp_values[n]  = tp;
}

// Devuelve -1.0 si la posición no está en el mapa
double TpMapGet(ulong pos_id) {
   int n = ArraySize(g_tp_pos_ids);
   for(int i = 0; i < n; i++)
      if(g_tp_pos_ids[i] == pos_id) return g_tp_values[i];
   return -1.0;
}

void TpMapRemove(ulong pos_id) {
   int n = ArraySize(g_tp_pos_ids);
   for(int i = 0; i < n; i++) {
      if(g_tp_pos_ids[i] == pos_id) {
         for(int j = i; j < n - 1; j++) {
            g_tp_pos_ids[j] = g_tp_pos_ids[j + 1];
            g_tp_values[j]  = g_tp_values[j + 1];
         }
         ArrayResize(g_tp_pos_ids, n - 1);
         ArrayResize(g_tp_values,  n - 1);
         return;
      }
   }
}

//+------------------------------------------------------------------+
//| MAPA VOLUMEN (espejo exacto del mapa SL) — FIX 27/08              |
//+------------------------------------------------------------------+
// Registra el volumen abierto de cada posición para que HandleDealClose
// clasifique un deal OUT como PARCIAL (queda volumen) o CIERRE TOTAL (volumen
// 0) por aritmética (vol_prev - vol_deal), sin depender de que
// PositionSelectByTicket gane la carrera de milisegundos.

void VolMapSet(ulong pos_id, double vol) {
   int n = ArraySize(g_vol_pos_ids);
   for(int i = 0; i < n; i++) {
      if(g_vol_pos_ids[i] == pos_id) { g_vol_values[i] = vol; return; }
   }
   ArrayResize(g_vol_pos_ids, n + 1);
   ArrayResize(g_vol_values,  n + 1);
   g_vol_pos_ids[n] = pos_id;
   g_vol_values[n]  = vol;
}

// Devuelve -1.0 si la posición no está en el mapa
double VolMapGet(ulong pos_id) {
   int n = ArraySize(g_vol_pos_ids);
   for(int i = 0; i < n; i++)
      if(g_vol_pos_ids[i] == pos_id) return g_vol_values[i];
   return -1.0;
}

void VolMapRemove(ulong pos_id) {
   int n = ArraySize(g_vol_pos_ids);
   for(int i = 0; i < n; i++) {
      if(g_vol_pos_ids[i] == pos_id) {
         for(int j = i; j < n - 1; j++) {
            g_vol_pos_ids[j] = g_vol_pos_ids[j + 1];
            g_vol_values[j]  = g_vol_values[j + 1];
         }
         ArrayResize(g_vol_pos_ids, n - 1);
         ArrayResize(g_vol_values,  n - 1);
         return;
      }
   }
}

//+------------------------------------------------------------------+
//| MAPA EXTREMOS (MFE/MAE) — máximo/mínimo de precio por posición    |
//+------------------------------------------------------------------+
// MFE/MAE (04/09): registra, mientras la posición sigue abierta, el precio
// más alto y más bajo vistos (Bid para buy, Ask para sell — ver
// ActualizarExtremosAbiertas). Al cierre total, HandleDealClose traduce
// estos dos extremos en mfe_price/mae_price según la dirección del trade.

// Devuelve true si el máximo o el mínimo cambiaron (o si la posición es
// nueva en el mapa) — lo usa ActualizarExtremosAbiertas() para decidir si
// hace falta reescribir el archivo de persistencia.
bool ExtremoMapActualizar(ulong pos_id, double precio_entrada, double precio_actual) {
   int n = ArraySize(g_ext_pos_ids);
   for(int i = 0; i < n; i++) {
      if(g_ext_pos_ids[i] == pos_id) {
         bool cambio = false;
         if(precio_actual > g_ext_max[i]) { g_ext_max[i] = precio_actual; cambio = true; }
         if(precio_actual < g_ext_min[i]) { g_ext_min[i] = precio_actual; cambio = true; }
         return cambio;
      }
   }
   // Primera vez que se ve esta posición: sembrar con el precio de ENTRADA,
   // no con precio_actual — el precio de entrada es el mismo sin importar
   // cuándo el EA la ve por primera vez (recién abierta o tras un reinicio).
   ArrayResize(g_ext_pos_ids, n + 1);
   ArrayResize(g_ext_max,     n + 1);
   ArrayResize(g_ext_min,     n + 1);
   g_ext_pos_ids[n] = pos_id;
   g_ext_max[n]     = MathMax(precio_entrada, precio_actual);
   g_ext_min[n]     = MathMin(precio_entrada, precio_actual);
   return true;
}

// Devuelven -1.0 si la posición no está en el mapa (nunca se llegó a
// muestrear — p.ej. abrió y cerró en menos de IntervaloExtremosSegundos).
double ExtremoMapGetMax(ulong pos_id) {
   int n = ArraySize(g_ext_pos_ids);
   for(int i = 0; i < n; i++)
      if(g_ext_pos_ids[i] == pos_id) return g_ext_max[i];
   return -1.0;
}

double ExtremoMapGetMin(ulong pos_id) {
   int n = ArraySize(g_ext_pos_ids);
   for(int i = 0; i < n; i++)
      if(g_ext_pos_ids[i] == pos_id) return g_ext_min[i];
   return -1.0;
}

void ExtremoMapRemove(ulong pos_id) {
   int n = ArraySize(g_ext_pos_ids);
   for(int i = 0; i < n; i++) {
      if(g_ext_pos_ids[i] == pos_id) {
         for(int j = i; j < n - 1; j++) {
            g_ext_pos_ids[j] = g_ext_pos_ids[j + 1];
            g_ext_max[j]     = g_ext_max[j + 1];
            g_ext_min[j]     = g_ext_min[j + 1];
         }
         ArrayResize(g_ext_pos_ids, n - 1);
         ArrayResize(g_ext_max,     n - 1);
         ArrayResize(g_ext_min,     n - 1);
         return;
      }
   }
}

//+------------------------------------------------------------------+
//| CAPTURA DE ORIGINALES PENDIENTES (bug #1)                        |
//+------------------------------------------------------------------+
// FIX corazón de datos (06/07): cuando abres a mercado sin SL/TP puesto
// (tu estilo habitual), el evento 'open' manda sl/tp en 0 → sl_original/
// tp_original quedan NULL en Supabase para siempre. Este mapa registra qué
// posiciones siguen "pendientes" de que se les capture el primer valor
// real de SL y/o TP, y CheckOriginalesPendientes() (llamado cada ~10s
// desde OnTick) revisa esas posiciones hasta que aparece el valor.

ulong g_pend_pos_ids[];
bool  g_pend_sl_hecho[];
bool  g_pend_tp_hecho[];

void PendienteAgregar(ulong pos_id, bool sl_ya_ok, bool tp_ya_ok) {
   if(sl_ya_ok && tp_ya_ok) return; // nada que vigilar
   int n = ArraySize(g_pend_pos_ids);
   for(int i = 0; i < n; i++) {
      if(g_pend_pos_ids[i] == pos_id) {
         // Ya estaba en vigilancia — no lo marques como "hecho" si aún no lo está
         if(sl_ya_ok) g_pend_sl_hecho[i] = true;
         if(tp_ya_ok) g_pend_tp_hecho[i] = true;
         return;
      }
   }
   ArrayResize(g_pend_pos_ids, n + 1);
   ArrayResize(g_pend_sl_hecho, n + 1);
   ArrayResize(g_pend_tp_hecho, n + 1);
   g_pend_pos_ids[n]  = pos_id;
   g_pend_sl_hecho[n] = sl_ya_ok;
   g_pend_tp_hecho[n] = tp_ya_ok;
}

void PendienteQuitar(int idx) {
   int n = ArraySize(g_pend_pos_ids);
   for(int j = idx; j < n - 1; j++) {
      g_pend_pos_ids[j]  = g_pend_pos_ids[j + 1];
      g_pend_sl_hecho[j] = g_pend_sl_hecho[j + 1];
      g_pend_tp_hecho[j] = g_pend_tp_hecho[j + 1];
   }
   ArrayResize(g_pend_pos_ids,  n - 1);
   ArrayResize(g_pend_sl_hecho, n - 1);
   ArrayResize(g_pend_tp_hecho, n - 1);
}

void PendienteQuitarPorPosId(ulong pos_id) {
   int n = ArraySize(g_pend_pos_ids);
   for(int i = 0; i < n; i++) {
      if(g_pend_pos_ids[i] == pos_id) { PendienteQuitar(i); return; }
   }
}

//+------------------------------------------------------------------+
//| CONSTRUCTORES JSON                                                |
//+------------------------------------------------------------------+

// (09/08, ampliado el mismo día): campo 'estrategia' — clasificación A/B para
// el caso de orden pendiente activada, donde el SL ya viene puesto desde el
// instante mismo del open (a diferencia del caso cubierto por
// BuildOriginalCaptureJson/CheckOriginalesPendientes, que es para cuando el
// SL llega después). Mismo cálculo, mismas bandas, misma regla de fijación
// (una sola vez) — ver ClasificarEstrategia(). Si sl==0.0 en el momento del
// open, quien llama pasa estrategia="" (null) y queda pendiente del camino
// de captura tardía, sin duplicar clasificación.
string BuildOpenJson(ulong pos_id, string fp, string tipo, double vol,
                     double pe, double sl, double tp, double puntos_sl,
                     string estrategia, datetime entry_time) {
   string sl_str  = (sl != 0.0) ? DoubleToString(sl, 5) : "null";
   string tp_str  = (tp != 0.0) ? DoubleToString(tp, 5) : "null";
   string est_str = (estrategia != "") ? ("\"" + estrategia + "\"") : "null";
   return "{\"event\":\"open\""
        + ",\"email\":\""         + g_email                        + "\""
        + ",\"cuenta_numero\":\"" + g_cuenta_numero              + "\""
        + ",\"ea_password\":\""   + g_ea_password                   + "\""
        + ",\"token\":\""         + g_token                        + "\""
        + ",\"position_id\":\""   + IntegerToString(pos_id)      + "\""
        + ",\"fp\":\""            + fp                           + "\""
        + ",\"tipo\":\""          + tipo                         + "\""
        + ",\"volumen\":"         + DoubleToString(vol, 2)
        + ",\"precio_entrada\":"  + DoubleToString(pe, 5)
        + ",\"sl\":"              + sl_str
        + ",\"tp\":"              + tp_str
        + ",\"puntos_sl\":"       + DoubleToString(puntos_sl, 2)
        + ",\"estrategia\":"      + est_str
        + ",\"timestamp\":\""     + DatetimeToISO(entry_time)    + "\""
        + "}";
}

string BuildSlChangeJson(ulong pos_id, double sl_ant, double sl_new, datetime t) {
   string ant_str = (sl_ant > 0.0) ? DoubleToString(sl_ant, 5) : "null";
   return "{\"event\":\"sl_change\""
        + ",\"email\":\""         + g_email                   + "\""
        + ",\"cuenta_numero\":\"" + g_cuenta_numero         + "\""
        + ",\"ea_password\":\""   + g_ea_password               + "\""
        + ",\"token\":\""         + g_token                    + "\""
        + ",\"position_id\":\""   + IntegerToString(pos_id) + "\""
        + ",\"sl_anterior\":"     + ant_str
        + ",\"sl_nuevo\":"        + DoubleToString(sl_new, 5)
        + ",\"timestamp\":\""     + DatetimeToISO(t)        + "\""
        + "}";
}

// FIX corazón de datos (06/07): espejo exacto de BuildSlChangeJson, para
// que trade-mt5.js pueda tratarlo con la misma lógica que sl_change.
string BuildTpChangeJson(ulong pos_id, double tp_ant, double tp_new, datetime t) {
   string ant_str = (tp_ant > 0.0) ? DoubleToString(tp_ant, 5) : "null";
   return "{\"event\":\"tp_change\""
        + ",\"email\":\""         + g_email                   + "\""
        + ",\"cuenta_numero\":\"" + g_cuenta_numero         + "\""
        + ",\"ea_password\":\""   + g_ea_password               + "\""
        + ",\"token\":\""         + g_token                    + "\""
        + ",\"position_id\":\""   + IntegerToString(pos_id) + "\""
        + ",\"tp_anterior\":"     + ant_str
        + ",\"tp_nuevo\":"        + DoubleToString(tp_new, 5)
        + ",\"timestamp\":\""     + DatetimeToISO(t)        + "\""
        + "}";
}

// Clasificación automática de estrategia (A/B) — bandas de tolerancia con
// frontera en el punto medio entre categorías, para que ningún SL entre
// 0 y 37.5 pts quede sin clasificar:
//   rechazo_rsi (Estrategia A) : 0    - 9    pts (medio entre 7 y 11)
//   estructura  (Estrategia B) : 9    - 37.5 pts (medio 11-25 y medio 25-50;
//                                 incluye Edge y Aire — ya se distinguen por
//                                 los puntos de SL guardados, sin campo aparte)
//   sin clasificar              : 37.5+ pts (zona Límite/fuera de método ya
//                                 existente — no se toca)
// Se llama UNA sola vez, en CheckOriginalesPendientes(), con el primer SL
// real detectado (ver REGLA DE FIJACIÓN ahí mismo).
string ClasificarEstrategia(double puntos) {
   if(puntos <= 9.0)  return "rechazo_rsi";
   if(puntos <= 37.5) return "estructura";
   return ""; // fuera de rango — string vacío = no clasificar
}

// FIX corazón de datos (06/07): evento correctivo para cuando se abrió a
// mercado sin SL/TP y luego aparece el primer valor real. Solo manda el
// campo que se acaba de capturar (el otro va como null y el backend lo
// ignora, no lo pisa).
// (09/08) + campo 'estrategia': clasificación A/B calculada en
// CheckOriginalesPendientes() a partir del primer SL real — ver ClasificarEstrategia().
string BuildOriginalCaptureJson(ulong pos_id, double sl, double tp, string estrategia, datetime t) {
   string sl_str  = (sl != 0.0) ? DoubleToString(sl, 5) : "null";
   string tp_str  = (tp != 0.0) ? DoubleToString(tp, 5) : "null";
   string est_str = (estrategia != "") ? ("\"" + estrategia + "\"") : "null";
   return "{\"event\":\"original_capture\""
        + ",\"email\":\""         + g_email                   + "\""
        + ",\"cuenta_numero\":\"" + g_cuenta_numero         + "\""
        + ",\"ea_password\":\""   + g_ea_password               + "\""
        + ",\"token\":\""         + g_token                    + "\""
        + ",\"position_id\":\""   + IntegerToString(pos_id) + "\""
        + ",\"sl\":"              + sl_str
        + ",\"tp\":"              + tp_str
        + ",\"estrategia\":"      + est_str
        + ",\"timestamp\":\""     + DatetimeToISO(t)        + "\""
        + "}";
}

string BuildPartialCloseJson(ulong pos_id, ulong deal_id, double vol,
                              double precio, double beneficio,
                              datetime t, bool es_sl) {
   return "{\"event\":\"partial_close\""
        + ",\"email\":\""         + g_email                    + "\""
        + ",\"cuenta_numero\":\"" + g_cuenta_numero          + "\""
        + ",\"ea_password\":\""   + g_ea_password                + "\""
        + ",\"token\":\""         + g_token                     + "\""
        + ",\"position_id\":\""   + IntegerToString(pos_id)  + "\""
        + ",\"deal_id\":\""       + IntegerToString(deal_id) + "\""
        + ",\"volumen\":"         + DoubleToString(vol, 2)
        + ",\"precio\":"          + DoubleToString(precio, 5)
        + ",\"beneficio\":"       + DoubleToString(beneficio, 2)
        + ",\"es_sl\":"           + (es_sl ? "true" : "false")
        + ",\"timestamp\":\""     + DatetimeToISO(t)         + "\""
        + "}";
}

// FIX 27/08: + volumen_restante. HandleDealClose solo llama aquí en cierre
// TOTAL, así que siempre 0 — pero se manda explícito para que trade-mt5.js
// pueda ignorar (red doble) cualquier 'close' que llegara con volumen abierto.
// MFE/MAE (04/09): + mfe_price/mfe_puntos/mae_price/mae_puntos, todos con
// default -1.0 -> "null". El default deja intacta la llamada que ya existe
// en SyncHistory48h (reconstrucción de histórico, sin datos en vivo que
// trackear) sin tener que tocar esa función.
string BuildCloseJson(ulong pos_id, ulong deal_id, double precio_cierre,
                      double beneficio_total, datetime t, double vol_restante = 0.0,
                      double mfe_price = -1.0, double mfe_puntos = -1.0,
                      double mae_price = -1.0, double mae_puntos = -1.0) {
   string mfe_price_str  = (mfe_price  >= 0.0) ? DoubleToString(mfe_price, 5)  : "null";
   string mfe_puntos_str = (mfe_puntos >= 0.0) ? DoubleToString(mfe_puntos, 2) : "null";
   string mae_price_str  = (mae_price  >= 0.0) ? DoubleToString(mae_price, 5)  : "null";
   string mae_puntos_str = (mae_puntos >= 0.0) ? DoubleToString(mae_puntos, 2) : "null";
   return "{\"event\":\"close\""
        + ",\"email\":\""           + g_email                    + "\""
        + ",\"cuenta_numero\":\""   + g_cuenta_numero          + "\""
        + ",\"ea_password\":\""     + g_ea_password                + "\""
        + ",\"token\":\""           + g_token                     + "\""
        + ",\"position_id\":\""     + IntegerToString(pos_id)  + "\""
        + ",\"deal_id\":\""         + IntegerToString(deal_id) + "\""
        + ",\"precio_cierre\":"     + DoubleToString(precio_cierre,   5)
        + ",\"beneficio_total\":"   + DoubleToString(beneficio_total, 2)
        + ",\"volumen_restante\":"  + DoubleToString(vol_restante,    2)
        + ",\"mfe_price\":"         + mfe_price_str
        + ",\"mfe_puntos\":"        + mfe_puntos_str
        + ",\"mae_price\":"         + mae_price_str
        + ",\"mae_puntos\":"        + mae_puntos_str
        + ",\"timestamp\":\""       + DatetimeToISO(t)         + "\""
        + "}";
}

//+------------------------------------------------------------------+
//| CONSTRUCTORES JSON — /api/trade-evento (FASE 3, brief linea de   |
//| tiempo Diario). Payload esperado por api/trade-evento.js: token, |
//| email, cuenta_numero, ea_password, fp, tipo_evento,              |
//| puntos_desde_entrada, precio, volumen_afectado, volumen_restante,|
//| beneficio, timestamp.                                            |
//+------------------------------------------------------------------+

// FIX 27/08: + volumen_restante (= volumen de entrada completo) para que la
// timeline arranque con el tamaño de la posición.
string BuildEntradaEventoJson(string fp, double precio_entrada, double vol_entrada, datetime t) {
   return "{\"tipo_evento\":\"entrada\""
        + ",\"email\":\""              + g_email                     + "\""
        + ",\"cuenta_numero\":\""      + g_cuenta_numero           + "\""
        + ",\"ea_password\":\""        + g_ea_password                 + "\""
        + ",\"token\":\""              + g_token                      + "\""
        + ",\"fp\":\""                 + fp                          + "\""
        + ",\"precio\":"               + DoubleToString(precio_entrada, 5)
        + ",\"puntos_desde_entrada\":null"
        + ",\"volumen_afectado\":null"
        + ",\"volumen_restante\":"     + DoubleToString(vol_entrada, 2)
        + ",\"beneficio\":null"
        + ",\"timestamp\":\""          + DatetimeToISO(t)           + "\""
        + "}";
}

// FIX 27/08: antes era BuildBreakevenEventoJson y TODO cambio de SL se mandaba
// como 'breakeven'. Ahora quien llama (HandlePositionModified) decide el
// tipo_evento según la distancia CON SIGNO de la entrada al nuevo SL:
//   |dist| <= 3 pts    -> 'breakeven'
//   dist  >  3 a favor -> 'sl_protegido'
//   dist  >  3 en contra -> 'sl_ajustado'
// puntos_desde_entrada va CON SIGNO (+ a favor, - en contra).
// volumen_restante = volumen abierto de la posición en ese instante.
string BuildSlMoveEventoJson(string fp, string tipo_evento, double puntos_con_signo,
                             double sl_nuevo, double vol_restante, datetime t) {
   return "{\"tipo_evento\":\"" + tipo_evento + "\""
        + ",\"email\":\""              + g_email                     + "\""
        + ",\"cuenta_numero\":\""      + g_cuenta_numero           + "\""
        + ",\"ea_password\":\""        + g_ea_password                 + "\""
        + ",\"token\":\""              + g_token                      + "\""
        + ",\"fp\":\""                 + fp                          + "\""
        + ",\"precio\":"               + DoubleToString(sl_nuevo, 5)
        + ",\"puntos_desde_entrada\":" + DoubleToString(puntos_con_signo, 2)
        + ",\"volumen_afectado\":null"
        + ",\"volumen_restante\":"     + DoubleToString(vol_restante, 2)
        + ",\"beneficio\":null"
        + ",\"timestamp\":\""          + DatetimeToISO(t)           + "\""
        + "}";
}

// FIX 27/08: + volumen_restante (lo que queda abierto tras el parcial) y
// + beneficio (realizado del deal, copiado tal cual — el front NO lo deriva
// del resultado final del trade). puntos_desde_entrada pasa a ir informado y
// CON SIGNO.
string BuildParcialEventoJson(string fp, double vol_cerrado, double vol_restante,
                              double precio, double beneficio, double puntos_con_signo,
                              datetime t) {
   return "{\"tipo_evento\":\"parcial\""
        + ",\"email\":\""              + g_email                     + "\""
        + ",\"cuenta_numero\":\""      + g_cuenta_numero           + "\""
        + ",\"ea_password\":\""        + g_ea_password                 + "\""
        + ",\"token\":\""              + g_token                      + "\""
        + ",\"fp\":\""                 + fp                          + "\""
        + ",\"precio\":"               + DoubleToString(precio, 5)
        + ",\"puntos_desde_entrada\":" + DoubleToString(puntos_con_signo, 2)
        + ",\"volumen_afectado\":"     + DoubleToString(vol_cerrado, 2)
        + ",\"volumen_restante\":"     + DoubleToString(vol_restante, 2)
        + ",\"beneficio\":"            + DoubleToString(beneficio, 2)
        + ",\"timestamp\":\""          + DatetimeToISO(t)           + "\""
        + "}";
}

// FIX 27/08: tipo_evento refleja el motivo real del cierre
// ('cierre_tp' / 'cierre_sl' / 'cierre_manual', decidido por quien llama a
// partir de DEAL_REASON del deal de cierre). Se mantiene 'cierre' genérico
// para el fallback de SyncHistory48h. volumen_restante siempre 0.
string BuildCierreEventoJson(string fp, string tipo_evento, double precio_cierre,
                             double vol_ultimo_deal, datetime t) {
   return "{\"tipo_evento\":\"" + tipo_evento + "\""
        + ",\"email\":\""              + g_email                     + "\""
        + ",\"cuenta_numero\":\""      + g_cuenta_numero           + "\""
        + ",\"ea_password\":\""        + g_ea_password                 + "\""
        + ",\"token\":\""              + g_token                      + "\""
        + ",\"fp\":\""                 + fp                          + "\""
        + ",\"precio\":"               + DoubleToString(precio_cierre, 5)
        + ",\"puntos_desde_entrada\":null"
        + ",\"volumen_afectado\":"     + DoubleToString(vol_ultimo_deal, 2)
        + ",\"volumen_restante\":0"
        + ",\"beneficio\":null"
        + ",\"timestamp\":\""          + DatetimeToISO(t)           + "\""
        + "}";
}

//+------------------------------------------------------------------+
//| HTTP                                                              |
//+------------------------------------------------------------------+

bool DoWebRequest(const string json_body) {
   uchar  data_u[];
   char   data[];
   char   result[];
   string result_headers;

   int len = StringToCharArray(json_body, data_u, 0, StringLen(json_body), CP_UTF8);
   if(len <= 0) return false;
   ArrayCopy(data, data_u); // uchar → char (misma representación binaria para ASCII)

   ResetLastError();
   int code = WebRequest(
      "POST", EndpointURL,
      "Content-Type: application/json\r\n",
      4000, data, result, result_headers
   );

   if(code == 200) return true;

   string resp = (ArraySize(result) > 0)
               ? CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8)
               : "";
   Print("[AURUM] HTTP:", code, " | error:", GetLastError(), " | resp:", resp);
   return false;
}

// Copia exacta de DoWebRequest, apuntando a EventoEndpointURL en vez de
// EndpointURL. Duplicada a propósito (no parametrizada) para no tocar
// DoWebRequest — mismo dominio aurumvelare.com, así que no hace falta
// añadir nada nuevo a la lista blanca de WebRequest en MT5.
bool DoWebRequestEventos(const string json_body) {
   uchar  data_u[];
   char   data[];
   char   result[];
   string result_headers;

   int len = StringToCharArray(json_body, data_u, 0, StringLen(json_body), CP_UTF8);
   if(len <= 0) return false;
   ArrayCopy(data, data_u);

   ResetLastError();
   int code = WebRequest(
      "POST", EventoEndpointURL,
      "Content-Type: application/json\r\n",
      4000, data, result, result_headers
   );

   if(code == 200) return true;

   string resp = (ArraySize(result) > 0)
               ? CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8)
               : "";
   Print("[AURUM EVENTO] HTTP:", code, " | error:", GetLastError(), " | resp:", resp);
   return false;
}

// Reescribe el archivo de cola completo con el estado actual de g_cola.
// Se llama tras CUALQUIER cambio en g_cola (añadir o quitar un evento),
// así el archivo en disco nunca queda desincronizado de la memoria.
void PersistirCola() {
   int fh = FileOpen(ColaFileName(), FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if(fh == INVALID_HANDLE) {
      Print("[AURUM] ERROR: no se pudo escribir el archivo de cola — ", ColaFileName(),
            " | error:", GetLastError());
      return;
   }
   for(int i = 0; i < ArraySize(g_cola); i++)
      FileWriteString(fh, g_cola[i].json_body + "\r\n");
   FileClose(fh);
}

// Se llama una sola vez en OnInit, antes de cualquier otra cosa. Si el EA
// se reinició con eventos pendientes de una sesión anterior, los recupera
// y los vuelve a meter en g_cola para que ProcessRetryQueue los reintente.
void CargarColaPersistida() {
   string fname = ColaFileName();

   // FIX (20/07): g_cola es variable global — un reinicio por REASON_PARAMETERS
   // no la limpia (sigue viva en memoria). Sin este reset, cada reinicio de
   // ese tipo volvía a sumar el contenido del archivo sobre lo que ya había
   // en memoria, duplicando la cola indefinidamente. PersistirCola() ya
   // sobrescribe el archivo completo en cada cambio, así que partir de cero
   // aquí es seguro: lo único que debe sobrevivir es lo que hay en disco.
   ArrayResize(g_cola, 0);

   if(!FileIsExist(fname, FILE_COMMON)) return;

   int fh = FileOpen(fname, FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if(fh == INVALID_HANDLE) {
      Print("[AURUM] ERROR: no se pudo leer el archivo de cola — ", fname,
            " | error:", GetLastError());
      return;
   }

   int recuperados = 0;
   while(!FileIsEnding(fh)) {
      string linea = FileReadString(fh);
      if(StringLen(linea) == 0) continue;
      int sz = ArraySize(g_cola);
      ArrayResize(g_cola, sz + 1);
      g_cola[sz].json_body      = linea;
      g_cola[sz].reintentos     = 0;
      g_cola[sz].ultimo_intento = 0;
      recuperados++;
   }
   FileClose(fh);

   if(recuperados > 0)
      Print("[AURUM] ⚠ Cola recuperada tras reinicio — ", recuperados,
            " eventos pendientes de una sesión anterior, se reintentarán ahora");
}

// Copia exacta de PersistirCola(), sobre g_cola_eventos y ColaEventosFileName().
void PersistirColaEventos() {
   int fh = FileOpen(ColaEventosFileName(), FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if(fh == INVALID_HANDLE) {
      Print("[AURUM EVENTO] ERROR: no se pudo escribir el archivo de cola — ", ColaEventosFileName(),
            " | error:", GetLastError());
      return;
   }
   for(int i = 0; i < ArraySize(g_cola_eventos); i++)
      FileWriteString(fh, g_cola_eventos[i].json_body + "\r\n");
   FileClose(fh);
}

// Copia exacta de CargarColaPersistida(), sobre g_cola_eventos y
// ColaEventosFileName(). Mismo reset a cero al inicio, por el mismo motivo
// (variable global que sobrevive a reinicios por REASON_PARAMETERS).
void CargarColaEventosPersistida() {
   string fname = ColaEventosFileName();

   ArrayResize(g_cola_eventos, 0);

   if(!FileIsExist(fname, FILE_COMMON)) return;

   int fh = FileOpen(fname, FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if(fh == INVALID_HANDLE) {
      Print("[AURUM EVENTO] ERROR: no se pudo leer el archivo de cola — ", fname,
            " | error:", GetLastError());
      return;
   }

   int recuperados = 0;
   while(!FileIsEnding(fh)) {
      string linea = FileReadString(fh);
      if(StringLen(linea) == 0) continue;
      int sz = ArraySize(g_cola_eventos);
      ArrayResize(g_cola_eventos, sz + 1);
      g_cola_eventos[sz].json_body      = linea;
      g_cola_eventos[sz].reintentos     = 0;
      g_cola_eventos[sz].ultimo_intento = 0;
      recuperados++;
   }
   FileClose(fh);

   if(recuperados > 0)
      Print("[AURUM EVENTO] ⚠ Cola recuperada tras reinicio — ", recuperados,
            " eventos pendientes de una sesión anterior, se reintentarán ahora");
}

// Reescribe el archivo de extremos completo con el estado actual del mapa
// g_ext_*. Formato: una línea por posición abierta, "pos_id;max;min".
// Igual que PersistirCola, se llama tras cualquier cambio real (ver
// ExtremoMapActualizar) para que el archivo nunca quede desincronizado.
void PersistirExtremos() {
   int fh = FileOpen(ExtremosFileName(), FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if(fh == INVALID_HANDLE) {
      Print("[AURUM EXTREMOS] ERROR: no se pudo escribir ", ExtremosFileName(),
            " | error:", GetLastError());
      return;
   }
   for(int i = 0; i < ArraySize(g_ext_pos_ids); i++) {
      FileWriteString(fh, IntegerToString(g_ext_pos_ids[i]) + ";"
                         + DoubleToString(g_ext_max[i], 5) + ";"
                         + DoubleToString(g_ext_min[i], 5) + "\r\n");
   }
   FileClose(fh);
}

// Se llama una sola vez en OnInit, junto a CargarColaPersistida(). Recupera
// el mapa de extremos de una sesión anterior — si el EA se reinició a media
// operación, esto evita perder el máximo/mínimo ya observado hasta ese
// punto. PurgeExtremosCerrados() (llamada justo después en OnInit) limpia
// las posiciones que ya cerraron mientras el EA estaba parado.
void CargarExtremosPersistidos() {
   string fname = ExtremosFileName();
   ArrayResize(g_ext_pos_ids, 0);
   ArrayResize(g_ext_max,     0);
   ArrayResize(g_ext_min,     0);

   if(!FileIsExist(fname, FILE_COMMON)) return;

   int fh = FileOpen(fname, FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if(fh == INVALID_HANDLE) {
      Print("[AURUM EXTREMOS] ERROR: no se pudo leer ", fname, " | error:", GetLastError());
      return;
   }

   int recuperados = 0;
   while(!FileIsEnding(fh)) {
      string linea = FileReadString(fh);
      if(StringLen(linea) == 0) continue;
      int p1 = StringFind(linea, ";");
      int p2 = (p1 >= 0) ? StringFind(linea, ";", p1 + 1) : -1;
      if(p1 <= 0 || p2 <= p1) continue; // línea corrupta — se descarta, no se aborta la carga

      ulong  pos_id = (ulong)StringToInteger(StringSubstr(linea, 0, p1));
      double vmax   = StringToDouble(StringSubstr(linea, p1 + 1, p2 - p1 - 1));
      double vmin   = StringToDouble(StringSubstr(linea, p2 + 1));

      int sz = ArraySize(g_ext_pos_ids);
      ArrayResize(g_ext_pos_ids, sz + 1);
      ArrayResize(g_ext_max,     sz + 1);
      ArrayResize(g_ext_min,     sz + 1);
      g_ext_pos_ids[sz] = pos_id;
      g_ext_max[sz]     = vmax;
      g_ext_min[sz]     = vmin;
      recuperados++;
   }
   FileClose(fh);

   if(recuperados > 0)
      Print("[AURUM EXTREMOS] Mapa recuperado tras reinicio — ", recuperados,
            " posición(es) con MFE/MAE de una sesión anterior");
}

// IMPORTANTE: SendEvent NUNCA llama a DoWebRequest directamente.
// Antes se intentaba un envío síncrono aquí mismo, dentro de OnTradeTransaction,
// con timeout de 10s — eso es lo que congelaba el terminal en cada cambio de SL
// durante gestión activa de parciales. Ahora solo se encola; el envío real
// siempre ocurre en OnTimer, desacoplado del hilo de trading.
void SendEvent(const string json_body) {
   int sz = ArraySize(g_cola);
   ArrayResize(g_cola, sz + 1);
   g_cola[sz].json_body      = json_body;
   g_cola[sz].reintentos     = 0;
   g_cola[sz].ultimo_intento = 0; // 0 = listo para procesar en el próximo tick del timer
   PersistirCola(); // FIX 06/07: guardar a disco inmediatamente tras encolar
}

// Copia exacta de SendEvent(), sobre g_cola_eventos — encola para
// /api/trade-evento (FASE 3). Tampoco llama a DoWebRequestEventos
// directamente, mismo motivo que SendEvent: no bloquear el hilo de trading.
void SendTradeEvento(const string json_body) {
   int sz = ArraySize(g_cola_eventos);
   ArrayResize(g_cola_eventos, sz + 1);
   g_cola_eventos[sz].json_body      = json_body;
   g_cola_eventos[sz].reintentos     = 0;
   g_cola_eventos[sz].ultimo_intento = 0;
   PersistirColaEventos();
}

// FIX corazón de datos (06/07): antes esta función descartaba un evento
// para siempre tras MaxReintentos fallos — si Supabase tardaba más que eso
// en recuperarse de una caída, el dato se perdía aunque Supabase volviera
// a funcionar poco después. Confirmado en vivo: pasó con dos trades reales
// durante un incidente de infraestructura de Supabase. Ahora NUNCA se
// descarta un evento — se reintenta indefinidamente mientras siga en la
// cola (y persistido en disco), hasta que consiga enviarse. Solo se avisa
// cada 10 intentos por si el problema es de verdad permanente (URL mal
// puesta, etc.) y hace falta mirarlo a mano.
void ProcessRetryQueue() {
   if(ArraySize(g_cola) == 0) return;
   Print("[AURUM] Procesando cola — ", ArraySize(g_cola), " eventos pendientes");
   int i = 0;
   bool huboCambios = false;
   while(i < ArraySize(g_cola)) {
      g_cola[i].reintentos++;
      g_cola[i].ultimo_intento = TimeCurrent();

      if(DoWebRequest(g_cola[i].json_body)) {
         for(int j = i; j < ArraySize(g_cola) - 1; j++) g_cola[j] = g_cola[j + 1];
         ArrayResize(g_cola, ArraySize(g_cola) - 1);
         huboCambios = true;
      } else {
         if(g_cola[i].reintentos % AvisarCadaXIntentos == 0) {
            Print("[AURUM] ⚠ Evento lleva ", g_cola[i].reintentos,
                  " intentos fallidos y SIGUE en cola (no se descarta) — ",
                  g_cola[i].json_body);
         }
         i++; // se reintenta en la próxima pasada, sin límite
      }
   }
   // FIX 06/07: reescribir el archivo de cola tras procesarla, para que
   // refleje exactamente lo que queda pendiente (o quede vacío/borrado
   // si ya no queda nada) — así un reinicio posterior no vuelve a
   // reintentar eventos que ya se enviaron o ya se descartaron.
   if(huboCambios) PersistirCola();
}

// Copia exacta de ProcessRetryQueue(), sobre g_cola_eventos y
// DoWebRequestEventos(). Nunca se llama a sí misma ni comparte estado con
// ProcessRetryQueue() — un fallo aquí no puede afectar a la cola de trades.
void ProcessRetryQueueEventos() {
   if(ArraySize(g_cola_eventos) == 0) return;
   Print("[AURUM EVENTO] Procesando cola — ", ArraySize(g_cola_eventos), " eventos pendientes");
   int i = 0;
   bool huboCambios = false;
   while(i < ArraySize(g_cola_eventos)) {
      g_cola_eventos[i].reintentos++;
      g_cola_eventos[i].ultimo_intento = TimeCurrent();

      if(DoWebRequestEventos(g_cola_eventos[i].json_body)) {
         for(int j = i; j < ArraySize(g_cola_eventos) - 1; j++) g_cola_eventos[j] = g_cola_eventos[j + 1];
         ArrayResize(g_cola_eventos, ArraySize(g_cola_eventos) - 1);
         huboCambios = true;
      } else {
         if(g_cola_eventos[i].reintentos % AvisarCadaXIntentos == 0) {
            Print("[AURUM EVENTO] ⚠ Evento lleva ", g_cola_eventos[i].reintentos,
                  " intentos fallidos y SIGUE en cola (no se descarta) — ",
                  g_cola_eventos[i].json_body);
         }
         i++;
      }
   }
   if(huboCambios) PersistirColaEventos();
}

//+------------------------------------------------------------------+
//| SINCRONIZACIÓN                                                    |
//+------------------------------------------------------------------+

void PopulateSlMap() {
   // Precarga SL de posiciones abiertas — sin WebRequest, seguro en OnInit
   int total = PositionsTotal();
   for(int i = 0; i < total; i++) {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      if(!EsXauusd(PositionGetString(POSITION_SYMBOL))) continue;
      SlMapSet(ticket, PositionGetDouble(POSITION_SL));
      VolMapSet(ticket, PositionGetDouble(POSITION_VOLUME)); // FIX 27/08: mapa de volumen
   }
}

// Se llama una sola vez en OnInit, justo después de CargarExtremosPersistidos().
// Si el archivo traía posiciones que ya cerraron mientras el EA estaba
// parado (nunca van a pasar por HandleDealClose en esta sesión, así que
// ExtremoMapRemove no las habría limpiado), esto las quita para no
// acumular basura indefinidamente en el archivo/mapa.
void PurgeExtremosCerrados() {
   int total = ArraySize(g_ext_pos_ids);
   if(total == 0) return;

   ulong abiertas[];
   ArrayResize(abiertas, PositionsTotal());
   int nAbiertas = 0;
   for(int i = 0; i < PositionsTotal(); i++) {
      ulong ticket = PositionGetTicket(i);
      if(ticket != 0) abiertas[nAbiertas++] = ticket;
   }

   int purgadas = 0;
   int i = 0;
   while(i < ArraySize(g_ext_pos_ids)) {
      bool sigueAbierta = false;
      for(int j = 0; j < nAbiertas; j++) {
         if(abiertas[j] == g_ext_pos_ids[i]) { sigueAbierta = true; break; }
      }
      if(sigueAbierta) { i++; continue; }
      ExtremoMapRemove(g_ext_pos_ids[i]);
      purgadas++;
      // no incrementar i: ExtremoMapRemove desplazó el array un puesto
   }

   if(purgadas > 0) {
      Print("[AURUM EXTREMOS] ", purgadas, " posición(es) cerradas mientras el EA ",
            "estaba parado — purgadas del mapa de extremos");
      PersistirExtremos();
   }
}

void SyncOpenPositions() {
   int total  = PositionsTotal();
   int synced = 0;
   for(int i = 0; i < total; i++) {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      if(!EsXauusd(PositionGetString(POSITION_SYMBOL))) continue;

      ulong    pos_id    = ticket;
      datetime open_time = (datetime)PositionGetInteger(POSITION_TIME);
      double   pe        = PositionGetDouble(POSITION_PRICE_OPEN);
      double   sl        = PositionGetDouble(POSITION_SL);
      double   tp        = PositionGetDouble(POSITION_TP);
      double   vol       = PositionGetDouble(POSITION_VOLUME);
      string   tipo_str  = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? "buy" : "sell";
      double   puntos_sl = (sl != 0.0) ? MathAbs(pe - sl) : 0.0;
      // (09/08) Op. B: si el SL ya está puesto en el momento del sync, se
      // clasifica aquí mismo — si no, queda pendiente vía CheckOriginalesPendientes().
      string   estrategia_open = (sl != 0.0) ? ClasificarEstrategia(puntos_sl) : "";

      SlMapSet(pos_id, sl);
      TpMapSet(pos_id, tp);
      VolMapSet(pos_id, vol); // FIX 27/08: mapa de volumen
      PendienteAgregar(pos_id, sl != 0.0, tp != 0.0); // FIX 06/07: vigilar si falta SL/TP original
      string json = BuildOpenJson(pos_id, BuildFp(open_time, pos_id),
                                  tipo_str, vol, pe, sl, tp, puntos_sl, estrategia_open, open_time);
      Print("[AURUM SYNC] Posición abierta (SL=valor actual) — pos:", pos_id);
      SendEvent(json);
      synced++;
   }
   Print("[AURUM SYNC] Posiciones abiertas sincronizadas: ", synced);
}

double GetBeneficioTotalPos(ulong pos_id) {
   if(!HistorySelectByPosition(pos_id)) return 0.0;
   double total = 0.0;
   int n = HistoryDealsTotal();
   for(int i = 0; i < n; i++) {
      ulong d = HistoryDealGetTicket(i);
      ENUM_DEAL_ENTRY de = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(d, DEAL_ENTRY);
      if(de == DEAL_ENTRY_OUT || de == DEAL_ENTRY_OUT_BY)
         total += HistoryDealGetDouble(d, DEAL_PROFIT)
                + HistoryDealGetDouble(d, DEAL_COMMISSION)
                + HistoryDealGetDouble(d, DEAL_SWAP);
   }
   return total;
}

// FASE 3 (brief linea de tiempo Diario): construir fp para el evento
// 'cierre' hace falta la hora de apertura de la posición — pero en el cierre
// completo (HandleDealClose, rama else) la posición ya no está seleccionable
// con PositionSelectByTicket (ya cerró). Se recupera del historial de deals,
// mismo patrón que ya usa SyncHistory48h más abajo para encontrar el deal de
// apertura (DEAL_ENTRY_IN) de una posición cerrada.
datetime GetEntryTimeForPosition(ulong pos_id) {
   if(!HistorySelectByPosition(pos_id)) return 0;
   int n = HistoryDealsTotal();
   for(int i = 0; i < n; i++) {
      ulong d = HistoryDealGetTicket(i);
      if((ENUM_DEAL_ENTRY)HistoryDealGetInteger(d, DEAL_ENTRY) == DEAL_ENTRY_IN)
         return (datetime)HistoryDealGetInteger(d, DEAL_TIME);
   }
   return 0;
}

void SyncHistory48h() {
   datetime desde = TimeCurrent() - (datetime)((ulong)HorasSync * 3600);
   if(!HistorySelect(desde, TimeCurrent())) {
      Print("[AURUM SYNC] Error cargando historial — sync cancelada");
      return;
   }

   int total = HistoryDealsTotal();

   // Pre-carga todos los tickets antes de iterar para evitar
   // que HistorySelectByPosition (dentro del bucle) cambie el contexto
   ulong deal_tickets[];
   ArrayResize(deal_tickets, total);
   for(int i = 0; i < total; i++)
      deal_tickets[i] = HistoryDealGetTicket(i);

   ulong processed[];
   int   synced = 0;

   for(int i = 0; i < ArraySize(deal_tickets); i++) {
      ulong dt = deal_tickets[i];
      if(dt == 0) continue;
      if(!EsXauusd(HistoryDealGetString(dt, DEAL_SYMBOL))) continue;
      if((ENUM_DEAL_ENTRY)HistoryDealGetInteger(dt, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;

      ulong pos_id = (ulong)HistoryDealGetInteger(dt, DEAL_POSITION_ID);
      if(ArrayContainsUlong(processed, pos_id)) continue;
      ArrayAddUlong(processed, pos_id);

      // Posición abierta: SyncOpenPositions ya la cubre
      if(PositionSelectByTicket(pos_id)) continue;

      // Recuperar SL/TP del orden de apertura ANTES de cambiar contexto
      double sl_orig = 0.0, tp_orig = 0.0;
      ulong  order_ticket = (ulong)HistoryDealGetInteger(dt, DEAL_ORDER);
      if(HistoryOrderSelect(order_ticket)) {
         sl_orig = HistoryOrderGetDouble(order_ticket, ORDER_SL);
         tp_orig = HistoryOrderGetDouble(order_ticket, ORDER_TP);
      }

      datetime entry_time  = (datetime)HistoryDealGetInteger(dt, DEAL_TIME);
      double   entry_price = HistoryDealGetDouble(dt, DEAL_PRICE);
      double   entry_vol   = HistoryDealGetDouble(dt, DEAL_VOLUME);
      string   tipo_str    = (HistoryDealGetInteger(dt, DEAL_TYPE) == DEAL_TYPE_BUY) ? "buy" : "sell";
      double   puntos_sl   = (sl_orig != 0.0) ? MathAbs(entry_price - sl_orig) : 0.0;
      // (09/08) Op. B: mismo criterio que en los otros dos sitios — el SL de
      // la orden ya se conoce al reconciliar histórico, así que se clasifica aquí.
      string   estrategia_open = (sl_orig != 0.0) ? ClasificarEstrategia(puntos_sl) : "";

      string json_open = BuildOpenJson(pos_id, BuildFp(entry_time, pos_id),
                                       tipo_str, entry_vol, entry_price,
                                       sl_orig, tp_orig, puntos_sl, estrategia_open, entry_time);
      Print("[AURUM SYNC] Posición cerrada — pos:", pos_id,
            " | pe:", DoubleToString(entry_price, 5),
            " | sl_orig:", DoubleToString(sl_orig, 5));
      SendEvent(json_open);

      // Ahora sí cambiamos contexto para obtener datos de cierre
      double   beneficio_total = 0.0;
      double   close_price     = 0.0;
      datetime close_time      = 0;
      ulong    close_deal_id   = 0;

      if(HistorySelectByPosition(pos_id)) {
         int nd = HistoryDealsTotal();
         for(int j = 0; j < nd; j++) {
            ulong d  = HistoryDealGetTicket(j);
            ENUM_DEAL_ENTRY de = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(d, DEAL_ENTRY);
            if(de == DEAL_ENTRY_OUT || de == DEAL_ENTRY_OUT_BY) {
               beneficio_total += HistoryDealGetDouble(d, DEAL_PROFIT)
                                + HistoryDealGetDouble(d, DEAL_COMMISSION)
                                + HistoryDealGetDouble(d, DEAL_SWAP);
               datetime dtime = (datetime)HistoryDealGetInteger(d, DEAL_TIME);
               if(dtime >= close_time) {
                  close_time    = dtime;
                  close_price   = HistoryDealGetDouble(d, DEAL_PRICE);
                  close_deal_id = d;
               }
            }
         }
      }

      if(close_time > 0 && close_deal_id != 0) {
         string json_close = BuildCloseJson(pos_id, close_deal_id,
                                            close_price, beneficio_total, close_time);
         SendEvent(json_close);
      }
      synced++;
   }
   Print("[AURUM SYNC] Historial ", HorasSync, "h — posiciones procesadas: ", synced);
}

//+------------------------------------------------------------------+
//| ANTI-DUPLICADOS                                                    |
//+------------------------------------------------------------------+
// Algunos brokers/cuentas Hedge disparan OnTradeTransaction dos veces
// para la misma transacción real (mismo snapshot de datos). Esto evita
// procesar y encolar el mismo evento dos veces en una ventana corta.
string g_lastEventKey = "";
ulong  g_lastEventMs  = 0;

bool EsEventoDuplicado(const string key) {
   ulong ahora = GetTickCount64();
   if(key == g_lastEventKey && (ahora - g_lastEventMs) < 1000) return true;
   g_lastEventKey = key;
   g_lastEventMs  = ahora;
   return false;
}

//+------------------------------------------------------------------+
//| HANDLERS EN TIEMPO REAL                                           |
//+------------------------------------------------------------------+

void HandleDealOpen(const MqlTradeTransaction &trans) {
   ulong pos_id = trans.position;
   if(EsEventoDuplicado("OPEN:" + IntegerToString(pos_id) + ":" + IntegerToString((long)trans.deal)))
      return;

   datetime entry_time = (datetime)HistoryDealGetInteger(trans.deal, DEAL_TIME);
   double   pe         = HistoryDealGetDouble(trans.deal, DEAL_PRICE);
   double   vol        = HistoryDealGetDouble(trans.deal, DEAL_VOLUME);
   string   tipo_str   = (HistoryDealGetInteger(trans.deal, DEAL_TYPE) == DEAL_TYPE_BUY)
                         ? "buy" : "sell";

   double sl = 0.0, tp = 0.0, vol_pos = vol; // vol_pos: total abierto tras este deal
   if(PositionSelectByTicket(pos_id)) {
      sl      = PositionGetDouble(POSITION_SL);
      tp      = PositionGetDouble(POSITION_TP);
      vol_pos = PositionGetDouble(POSITION_VOLUME); // FIX 27/08: cubre scaling-in (suma total)
   }

   double puntos_sl = (sl != 0.0) ? MathAbs(pe - sl) : 0.0;
   // (09/08) Hallazgo #1 de la auditoría — caso de orden pendiente activada:
   // el SL ya viene puesto en este mismo instante (a diferencia del open a
   // mercado sin SL, cubierto por CheckOriginalesPendientes()/original_capture
   // más abajo). Se clasifica aquí, en el propio evento 'open', para que la
   // escritura sea atómica (Opción B — ver ARQUITECTURA.md, sesión 09/08 auditoría).
   string estrategia_open = (sl != 0.0) ? ClasificarEstrategia(puntos_sl) : "";
   SlMapSet(pos_id, sl);
   TpMapSet(pos_id, tp);
   VolMapSet(pos_id, vol_pos); // FIX 27/08: mapa de volumen para clasificar parcial vs cierre total
   PendienteAgregar(pos_id, sl != 0.0, tp != 0.0); // FIX 06/07: vigilar si falta SL/TP original

   string fp   = BuildFp(entry_time, pos_id);
   string json = BuildOpenJson(pos_id, fp,
                               tipo_str, vol, pe, sl, tp, puntos_sl, estrategia_open, entry_time);
   Print("[AURUM] Apertura — pos:", pos_id, " | ", tipo_str,
         " | pe:", DoubleToString(pe, 5),
         " | sl:", DoubleToString(sl, 5),
         " | pts:", DoubleToString(puntos_sl, 2));
   SendEvent(json);

   // FASE 3 (brief linea de tiempo Diario): evento 'entrada' en paralelo,
   // después del SendEvent existente (orden a propósito, ver confirmación
   // dada al usuario antes de este cambio).
   SendTradeEvento(BuildEntradaEventoJson(fp, pe, vol_pos, entry_time));
}

void HandleDealClose(const MqlTradeTransaction &trans) {
   ulong    pos_id  = trans.position;
   ulong    deal_id = trans.deal;
   if(EsEventoDuplicado("CLOSE:" + IntegerToString(pos_id) + ":" + IntegerToString((long)deal_id)))
      return;

   double   price   = HistoryDealGetDouble(deal_id, DEAL_PRICE);
   double   vol      = HistoryDealGetDouble(deal_id, DEAL_VOLUME); // volumen cerrado por ESTE deal
   datetime dtime   = (datetime)HistoryDealGetInteger(deal_id, DEAL_TIME);
   long     reason  = HistoryDealGetInteger(deal_id, DEAL_REASON);
   bool     es_sl   = (reason == DEAL_REASON_SL);
   double   profit  = HistoryDealGetDouble(deal_id, DEAL_PROFIT)
                    + HistoryDealGetDouble(deal_id, DEAL_COMMISSION)
                    + HistoryDealGetDouble(deal_id, DEAL_SWAP);

   // FIX 27/08: clasificar PARCIAL vs CIERRE TOTAL por ARITMÉTICA DE VOLUMEN,
   // no por si PositionSelectByTicket gana la carrera. Antes, si esa llamada
   // fallaba en el instante exacto de un deal OUT parcial, el parcial se
   // archivaba como el cierre total y su precio pisaba precio_cierre.
   bool   sel      = PositionSelectByTicket(pos_id);
   double vol_prev = VolMapGet(pos_id); // -1.0 si no está en el mapa
   double vol_restante;
   if(vol_prev >= 0.0) {
      vol_restante = vol_prev - vol;
      if(vol_restante < 0.0) vol_restante = 0.0;
   } else if(sel) {
      vol_restante = PositionGetDouble(POSITION_VOLUME); // fallback fiable
   } else {
      vol_restante = 0.0; // fallback ambiguo — SyncHistory48h lo corrige al reiniciar
      Print("[AURUM] ⚠ HandleDealClose sin volumen previo y posición no seleccionable",
            " — se asume CIERRE TOTAL — pos:", pos_id, " deal:", deal_id);
   }
   bool es_parcial = (vol_restante > 0.00001);

   // Precio de entrada + dirección, para puntos_desde_entrada CON SIGNO.
   double pe_ref = 0.0;
   bool   es_buy = true;
   if(sel) {
      pe_ref = PositionGetDouble(POSITION_PRICE_OPEN);
      es_buy = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY);
   } else if(HistorySelectByPosition(pos_id)) {
      int nd0 = HistoryDealsTotal();
      for(int k = 0; k < nd0; k++) {
         ulong d0 = HistoryDealGetTicket(k);
         if((ENUM_DEAL_ENTRY)HistoryDealGetInteger(d0, DEAL_ENTRY) == DEAL_ENTRY_IN) {
            pe_ref = HistoryDealGetDouble(d0, DEAL_PRICE);
            es_buy = (HistoryDealGetInteger(d0, DEAL_TYPE) == DEAL_TYPE_BUY);
            break;
         }
      }
   }
   double puntos_evt = (pe_ref != 0.0)
                     ? (es_buy ? (price - pe_ref) : (pe_ref - price))
                     : 0.0;

   if(es_parcial) {
      // --- PARCIAL: NUNCA escribe precio_cierre de la operación ---
      string json = BuildPartialCloseJson(pos_id, deal_id, vol, price, profit, dtime, es_sl);
      Print("[AURUM] Parcial — pos:", pos_id,
            " | deal:", deal_id,
            " | vol_cerrado:", DoubleToString(vol, 2),
            " | vol_restante:", DoubleToString(vol_restante, 2),
            " | price:", DoubleToString(price, 5),
            " | ben:", DoubleToString(profit, 2));
      SendEvent(json);

      datetime entry_time = sel ? (datetime)PositionGetInteger(POSITION_TIME)
                                : GetEntryTimeForPosition(pos_id);
      string   fp         = BuildFp(entry_time, pos_id);
      SendTradeEvento(BuildParcialEventoJson(fp, vol, vol_restante, price, profit, puntos_evt, dtime));

      VolMapSet(pos_id, vol_restante); // la posición sigue viva
   } else {
      // --- CIERRE TOTAL: única vía que escribe precio_cierre ---
      double tp_ref = TpMapGet(pos_id); // capturar antes de TpMapRemove (desempate de motivo)
      double beneficio_total = GetBeneficioTotalPos(pos_id);

      // MFE/MAE (04/09): traducir máx/mín en bruto a favorable/adverso según
      // dirección (pe_ref/es_buy ya calculados arriba, antes del if(es_parcial)).
      // Sentinela -1.0 (nunca se muestreó — p.ej. open+close en menos de
      // IntervaloExtremosSegundos) se propaga tal cual; BuildCloseJson lo
      // convierte en null, nunca en un valor inventado.
      double ext_max    = ExtremoMapGetMax(pos_id);
      double ext_min    = ExtremoMapGetMin(pos_id);
      double mfe_price = -1.0, mfe_puntos = -1.0, mae_price = -1.0, mae_puntos = -1.0;
      if(ext_max >= 0.0 && ext_min >= 0.0) {
         mfe_price  = es_buy ? ext_max : ext_min;
         mae_price  = es_buy ? ext_min : ext_max;
         mfe_puntos = MathAbs(mfe_price - pe_ref);
         mae_puntos = MathAbs(mae_price - pe_ref);
      }

      string json = BuildCloseJson(pos_id, deal_id, price, beneficio_total, dtime, 0.0,
                                   mfe_price, mfe_puntos, mae_price, mae_puntos);
      Print("[AURUM] Cierre — pos:", pos_id,
            " | deal:", deal_id,
            " | motivo:", reason,
            " | price:", DoubleToString(price, 5),
            " | ben_total:", DoubleToString(beneficio_total, 2),
            " | mfe_pts:", (mfe_price >= 0.0 ? DoubleToString(mfe_puntos, 2) : "n/d"),
            " | mae_pts:", (mae_price >= 0.0 ? DoubleToString(mae_puntos, 2) : "n/d"));
      SendEvent(json);

      // Motivo real del cierre: DEAL_REASON como fuente principal; si el bróker
      // devuelve CLIENT/EXPERT/… para todo, desempate por cercanía a tp_actual.
      string tipo_cierre;
      if(reason == DEAL_REASON_TP)                                        tipo_cierre = "cierre_tp";
      else if(reason == DEAL_REASON_SL)                                   tipo_cierre = "cierre_sl";
      else if(tp_ref > 0.0 && MathAbs(price - tp_ref) <= 1.0)             tipo_cierre = "cierre_tp";
      else                                                               tipo_cierre = "cierre_manual";

      datetime entry_time = GetEntryTimeForPosition(pos_id);
      string   fp         = BuildFp(entry_time, pos_id);
      SendTradeEvento(BuildCierreEventoJson(fp, tipo_cierre, price, vol, dtime));

      SlMapRemove(pos_id);
      TpMapRemove(pos_id);
      VolMapRemove(pos_id);
      ExtremoMapRemove(pos_id); // MFE/MAE (04/09): ya no hace falta seguir esta posición
      PersistirExtremos();      // reflejar la baja en disco inmediatamente, no esperar al próximo tick
      PendienteQuitarPorPosId(pos_id); // FIX 06/07: ya no hace falta vigilar una posición cerrada
   }
}

// FIX corazón de datos (06/07): bug #2 resuelto — antes esta función solo
// miraba el SL y el TP se ignoraba por completo. Ahora se comprueban SL y
// TP de forma independiente (una modificación puede tocar uno, el otro, o
// los dos a la vez), cada uno con su propia clave de deduplicación para no
// pisarse entre sí.
void HandlePositionModified(const MqlTradeTransaction &trans) {
   ulong pos_id = trans.position;
   if(!PositionSelectByTicket(pos_id)) return;
   if(!EsXauusd(PositionGetString(POSITION_SYMBOL))) return;

   double   sl_nuevo = PositionGetDouble(POSITION_SL);
   double   tp_nuevo = PositionGetDouble(POSITION_TP);
   datetime now      = TimeTradeServer();

   // --- SL ---
   if(!EsEventoDuplicado("SLMOD:" + IntegerToString(pos_id) + ":" + DoubleToString(sl_nuevo, 5))) {
      double sl_prev = SlMapGet(pos_id);
      if(sl_prev < 0.0) {
         SlMapSet(pos_id, sl_nuevo); // no estaba en el mapa — registrar sin mandar evento
      } else if(MathAbs(sl_nuevo - sl_prev) > 0.00001) {
         string json = BuildSlChangeJson(pos_id, sl_prev, sl_nuevo, now);
         Print("[AURUM] SL change — pos:", pos_id,
               " | ", DoubleToString(sl_prev, 5), " → ", DoubleToString(sl_nuevo, 5));
         SlMapSet(pos_id, sl_nuevo);
         SendEvent(json);

         // FIX 27/08: el evento de línea de tiempo ya NO es siempre 'breakeven'.
         // Se decide por la distancia CON SIGNO de la entrada al nuevo SL:
         //   |dist| <= 3 pts      -> 'breakeven'
         //   dist  >  3 a favor   -> 'sl_protegido'
         //   dist  >  3 en contra -> 'sl_ajustado'
         // La posición sigue seleccionada aquí (PositionSelectByTicket OK arriba).
         double   precio_entrada = PositionGetDouble(POSITION_PRICE_OPEN);
         bool     es_buy         = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY);
         datetime entry_time     = (datetime)PositionGetInteger(POSITION_TIME);
         string   fp             = BuildFp(entry_time, pos_id);
         double   vol_restante   = PositionGetDouble(POSITION_VOLUME);
         double   dist_favor     = es_buy ? (sl_nuevo - precio_entrada)
                                          : (precio_entrada - sl_nuevo); // + a favor, - en contra

         string tipo_sl;
         if(MathAbs(dist_favor) <= 3.0) tipo_sl = "breakeven";
         else if(dist_favor > 3.0)      tipo_sl = "sl_protegido";
         else                           tipo_sl = "sl_ajustado";

         VolMapSet(pos_id, vol_restante); // mantener el mapa de volumen fresco
         SendTradeEvento(BuildSlMoveEventoJson(fp, tipo_sl, dist_favor, sl_nuevo, vol_restante, now));
      }
   }

   // --- TP (espejo exacto de la lógica de SL) ---
   if(!EsEventoDuplicado("TPMOD:" + IntegerToString(pos_id) + ":" + DoubleToString(tp_nuevo, 5))) {
      double tp_prev = TpMapGet(pos_id);
      if(tp_prev < 0.0) {
         TpMapSet(pos_id, tp_nuevo); // no estaba en el mapa — registrar sin mandar evento
      } else if(MathAbs(tp_nuevo - tp_prev) > 0.00001) {
         string json = BuildTpChangeJson(pos_id, tp_prev, tp_nuevo, now);
         Print("[AURUM] TP change — pos:", pos_id,
               " | ", DoubleToString(tp_prev, 5), " → ", DoubleToString(tp_nuevo, 5));
         TpMapSet(pos_id, tp_nuevo);
         SendEvent(json);
      }
   }
}

//+------------------------------------------------------------------+
//| CAPTURA DE ORIGINALES — polling cada ~10s (bug #1)                |
//+------------------------------------------------------------------+
// FIX corazón de datos (06/07): revisa las posiciones vigiladas (las que
// abrieron sin SL y/o sin TP) y, en cuanto detecta el primer valor real,
// manda un evento correctivo 'original_capture' para que sl_original/
// tp_original dejen de quedarse en NULL para siempre.
void CheckOriginalesPendientes() {
   int i = 0;
   while(i < ArraySize(g_pend_pos_ids)) {
      ulong pos_id = g_pend_pos_ids[i];

      if(!PositionSelectByTicket(pos_id)) {
         // La posición ya no está abierta (cerró) — dejar de vigilarla.
         PendienteQuitar(i);
         continue;
      }

      double sl_actual = PositionGetDouble(POSITION_SL);
      double tp_actual = PositionGetDouble(POSITION_TP);
      bool   huboCaptura = false;

      double sl_para_evento = 0.0, tp_para_evento = 0.0;
      string estrategia_capturada = ""; // solo se rellena si AQUÍ se captura el primer SL real

      if(!g_pend_sl_hecho[i] && sl_actual != 0.0) {
         g_pend_sl_hecho[i] = true;
         sl_para_evento = sl_actual;
         SlMapSet(pos_id, sl_actual);
         huboCaptura = true;

         // Clasificación por bandas — SOLO aquí, con el primer SL real.
         // No se recalcula en cambios posteriores (breakeven/gestión activa,
         // esos siguen su propio evento en HandlePositionModified()).
         double precio_entrada_pos = PositionGetDouble(POSITION_PRICE_OPEN);
         double puntos_sl_real     = MathAbs(precio_entrada_pos - sl_actual);
         estrategia_capturada      = ClasificarEstrategia(puntos_sl_real);
      }
      if(!g_pend_tp_hecho[i] && tp_actual != 0.0) {
         g_pend_tp_hecho[i] = true;
         tp_para_evento = tp_actual;
         TpMapSet(pos_id, tp_actual);
         huboCaptura = true;
      }

      if(huboCaptura) {
         string json = BuildOriginalCaptureJson(pos_id, sl_para_evento, tp_para_evento, estrategia_capturada, TimeTradeServer());
         Print("[AURUM] Original capturado — pos:", pos_id,
               " | sl:", DoubleToString(sl_para_evento, 5),
               " | tp:", DoubleToString(tp_para_evento, 5),
               " | estrategia:", (estrategia_capturada != "" ? estrategia_capturada : "(sin clasificar)"));
         SendEvent(json);
      }

      if(g_pend_sl_hecho[i] && g_pend_tp_hecho[i]) {
         PendienteQuitar(i); // ya capturado del todo — dejar de vigilar
      } else {
         i++;
      }
   }
}

//+------------------------------------------------------------------+
//| MUESTREO MFE/MAE — throttled en OnTick (04/09)                    |
//+------------------------------------------------------------------+
// Recorre las posiciones abiertas (mismo filtro EsXauusd que el resto del
// EA) y actualiza el mapa de extremos con el precio de salida real de cada
// una: Bid para buy (te cierran vendiendo), Ask para sell (te cierran
// comprando) — así el extremo refleja lo que de verdad se podría haber
// cerrado en ese instante, no un precio genérico que ignora el spread.
void ActualizarExtremosAbiertas() {
   bool huboCambios = false;
   int total = PositionsTotal();
   for(int i = 0; i < total; i++) {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;
      string sym = PositionGetString(POSITION_SYMBOL);
      if(!EsXauusd(sym)) continue;

      bool   es_buy         = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY);
      double precio_entrada = PositionGetDouble(POSITION_PRICE_OPEN);
      double precio_actual  = es_buy ? SymbolInfoDouble(sym, SYMBOL_BID)
                                      : SymbolInfoDouble(sym, SYMBOL_ASK);
      if(precio_actual <= 0.0) continue; // símbolo sin cotización válida en este tick

      if(ExtremoMapActualizar(ticket, precio_entrada, precio_actual))
         huboCambios = true;
   }
   if(huboCambios) PersistirExtremos();
}

//+------------------------------------------------------------------+
//| EVENTOS PRINCIPALES                                               |
//+------------------------------------------------------------------+

int OnInit() {
   g_cuenta_numero = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   g_sync_done     = false;

   // Resolver credenciales efectivas: input si está puesto; los que queden
   // vacíos se rellenan desde el archivo local aurum_auth_<cuenta>.txt.
   // Necesita g_cuenta_numero ya fijado (arriba) para el nombre del archivo.
   g_email       = InEmail;
   g_token       = InToken;
   g_ea_password = InEaPassword;
   if(g_email == "" || g_token == "" || g_ea_password == "")
      CargarAuthDeArchivo();

   if(g_email == "" || g_token == "" || g_ea_password == "") {
      Print("[AURUM] ERROR: faltan credenciales — rellena los inputs (Email/Token/EaPassword) ",
            "o crea Common\\Files\\", AuthFileName(),
            " | estado: email=", (g_email == "" ? "VACÍO" : "ok"),
            " token=", (g_token == "" ? "VACÍO" : "ok"),
            " ea_password=", (g_ea_password == "" ? "VACÍO" : "ok"));
      return INIT_FAILED;
   }

   // FIX 06/07: recuperar eventos pendientes de una sesión anterior ANTES
   // de nada más — si el EA se reinició con la cola llena, esto los trae
   // de vuelta a g_cola para que se reintenten en el próximo OnTimer.
   CargarColaPersistida();

   // FASE 3: mismo mecanismo, cola separada. Va después de la existente
   // a propósito (ver confirmación dada al usuario sobre orden de llamadas).
   CargarColaEventosPersistida();

   // MFE/MAE (04/09): recupera el mapa de extremos de una sesión anterior, y
   // purga cualquier posición que ya haya cerrado mientras el EA estaba
   // parado (su MFE/MAE de esa sesión perdida no se puede reconstruir — se
   // pierde, no se inventa).
   CargarExtremosPersistidos();
   PurgeExtremosCerrados();

   // Precarga SL de posiciones abiertas (seguro en OnInit, sin WebRequest)
   PopulateSlMap();

   CrearBotonEnviarAhora();

   EventSetTimer(5); // Sync inicial en 5 segundos via OnTimer

   Print("══════════════════════════════════════════════════");
   Print("[AURUM] EA_Aurum_Tracker iniciado");
   Print("[AURUM] Cuenta  : ", g_cuenta_numero);
   Print("[AURUM] Email   : ", g_email,
         " (", (InEmail != "" ? "input" : "archivo local"), ")");
   Print("[AURUM] Auth    : token+ea_password ",
         ((InToken != "" && InEaPassword != "") ? "desde inputs"
          : (InToken == "" && InEaPassword == "") ? "desde archivo local"
          : "mezcla input+archivo"));
   Print("[AURUM] Endpoint: ", EndpointURL);
   Print("[AURUM] Endpoint eventos (línea de tiempo): ", EventoEndpointURL);
   Print("[AURUM] ⚠ Añade la URL a la lista blanca si no está:");
   Print("[AURUM]   MT5 → Herramientas → Opciones → Asesores Expertos");
   Print("[AURUM]   → Permitir WebRequest → agregar: https://aurumvelare.com");
   Print("[AURUM]   (mismo dominio para ambos endpoints, no hace falta añadir nada más)");
   Print("[AURUM] Sincronización inicial en 5 segundos...");
   Print("══════════════════════════════════════════════════");

   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) {
   EventKillTimer();
   ObjectDelete(0, "AurumBtnEnviarAhora");
   Print("[AURUM] EA detenido | razón:", reason,
         " | eventos pendientes: ", ArraySize(g_cola),
         " | eventos línea de tiempo pendientes: ", ArraySize(g_cola_eventos),
         " (guardados en disco, se recuperan al reiniciar)");
}

//+------------------------------------------------------------------+
//| BOTÓN MANUAL "ENVIAR AHORA" — fuerza el vaciado de las dos colas |
//| (g_cola y g_cola_eventos) sin esperar a IntervaloEnvioSegundos.  |
//+------------------------------------------------------------------+
void CrearBotonEnviarAhora() {
   string nombre = "AurumBtnEnviarAhora";
   if(ObjectFind(0, nombre) >= 0) return;
   ObjectCreate(0, nombre, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, nombre, OBJPROP_CORNER, CORNER_LEFT_LOWER);
   ObjectSetInteger(0, nombre, OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, nombre, OBJPROP_YDISTANCE, 10);
   ObjectSetInteger(0, nombre, OBJPROP_XSIZE, 140);
   ObjectSetInteger(0, nombre, OBJPROP_YSIZE, 26);
   ObjectSetString(0, nombre, OBJPROP_TEXT, "Aurum: Enviar ahora");
   ObjectSetInteger(0, nombre, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, nombre, OBJPROP_BGCOLOR, clrDarkGoldenrod);
   ObjectSetInteger(0, nombre, OBJPROP_SELECTABLE, false);
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam) {
   if(id == CHARTEVENT_OBJECT_CLICK && sparam == "AurumBtnEnviarAhora") {
      Print("[AURUM] Botón pulsado — enviando ", ArraySize(g_cola), " trade(s) y ",
            ArraySize(g_cola_eventos), " evento(s) de línea de tiempo pendientes, ahora");
      ProcessRetryQueue();
      ProcessRetryQueueEventos();
      ObjectSetInteger(0, "AurumBtnEnviarAhora", OBJPROP_STATE, false);
   }
}

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest     &request,
                        const MqlTradeResult      &result) {
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD) {
      if(!HistoryDealSelect(trans.deal)) return;
      if(!EsXauusd(HistoryDealGetString(trans.deal, DEAL_SYMBOL))) return;

      ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(trans.deal, DEAL_ENTRY);

      if(entry == DEAL_ENTRY_IN)
         HandleDealOpen(trans);
      else if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY)
         HandleDealClose(trans);

   } else if(trans.type == TRADE_TRANSACTION_POSITION) {
      HandlePositionModified(trans);
   }
}

void OnTimer() {
   if(!g_sync_done) {
      g_sync_done = true;

      // Guard extra: si el EA se recarga dos veces seguidas (p.ej. al
      // recompilar con el chart abierto), esto evita repetir la
      // sincronización de historial dentro de una ventana de 30s.
      string gv = "AURUM_LAST_SYNC_" + g_cuenta_numero;
      double ultimoSync = GlobalVariableCheck(gv) ? GlobalVariableGet(gv) : 0;
      if(TimeCurrent() - (datetime)ultimoSync < 30) {
         Print("[AURUM] Sync inicial omitida — ya se hizo hace <30s (doble recarga detectada)");
      } else {
         GlobalVariableSet(gv, (double)TimeCurrent());
         SyncOpenPositions();
         SyncHistory48h();
      }

      EventKillTimer();
      EventSetTimer(IntervaloEnvioSegundos); // p.ej. cada hora, procesa la cola entera
      return;
   }
   ProcessRetryQueue();

   // FASE 3: cola separada, se procesa después de la existente a propósito
   // (ver confirmación dada al usuario — un fallo aquí nunca puede bloquear
   // ni afectar a ProcessRetryQueue(), que ya se ejecutó por completo arriba).
   ProcessRetryQueueEventos();
}

// FIX corazón de datos (06/07): revisa cada ~10s si alguna posición vigilada
// ya tiene SL/TP puesto (bug #1). Se hace en OnTick (que en XAUUSD se
// dispara constantemente) con un throttle manual, en vez de un segundo
// timer — MQL5 solo permite un EventSetTimer activo por EA, y ese ya lo
// usa IntervaloEnvioSegundos para la cola.
datetime g_ultimoCheckOriginales = 0;
datetime g_ultimoCheckExtremos   = 0; // MFE/MAE (04/09)

void OnTick() {
   if(ArraySize(g_pend_pos_ids) > 0 && TimeCurrent() - g_ultimoCheckOriginales >= 10) {
      g_ultimoCheckOriginales = TimeCurrent();
      CheckOriginalesPendientes();
   }

   // MFE/MAE (04/09): throttle independiente del de arriba — tiene que
   // correr aunque no haya ninguna posición "pendiente" de SL/TP original.
   if(TimeCurrent() - g_ultimoCheckExtremos >= IntervaloExtremosSegundos) {
      g_ultimoCheckExtremos = TimeCurrent();
      ActualizarExtremosAbiertas();
   }
}
