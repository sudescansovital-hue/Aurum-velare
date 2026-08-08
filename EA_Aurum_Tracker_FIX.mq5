//+------------------------------------------------------------------+
//| EA_Aurum_Tracker.mq5                                             |
//| Aurum Velare — Registro automático de trades XAU/USD en Supabase |
//+------------------------------------------------------------------+
#property copyright "Aurum Velare"
#property link      "https://aurumvelare.com"
#property version   "1.00"

//--- Inputs
input string Email          = "";
input string EaPassword     = "";
input string Token          = "";
input string EndpointURL    = "https://aurumvelare.com/api/trade-mt5";
input string EventoEndpointURL = "https://aurumvelare.com/api/trade-evento"; // FASE 3 (brief linea de tiempo Diario): entrada/breakeven/parcial/cierre
input int    AvisarCadaXIntentos = 10; // FIX 06/07: ya no se descarta nunca; esto solo controla cada cuántos intentos fallidos se avisa en el log
input int    IntervaloEnvioSegundos = 3600; // cada cuánto se procesa la cola (por defecto 1h)
input int    HorasSync      = 48;

//--- Globales
string g_cuenta_numero = "";
bool   g_sync_done     = false;

//--- Mapa SL (arrays paralelos)
ulong  g_sl_pos_ids[];
double g_sl_values[];

//--- Mapa TP (arrays paralelos, espejo del mapa SL)
ulong  g_tp_pos_ids[];
double g_tp_values[];

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

string BuildOpenJson(ulong pos_id, string fp, string tipo, double vol,
                     double pe, double sl, double tp, double puntos_sl,
                     datetime entry_time) {
   string sl_str  = (sl != 0.0) ? DoubleToString(sl, 5) : "null";
   string tp_str  = (tp != 0.0) ? DoubleToString(tp, 5) : "null";
   return "{\"event\":\"open\""
        + ",\"email\":\""         + Email                        + "\""
        + ",\"cuenta_numero\":\"" + g_cuenta_numero              + "\""
        + ",\"ea_password\":\""   + EaPassword                   + "\""
        + ",\"token\":\""         + Token                        + "\""
        + ",\"position_id\":\""   + IntegerToString(pos_id)      + "\""
        + ",\"fp\":\""            + fp                           + "\""
        + ",\"tipo\":\""          + tipo                         + "\""
        + ",\"volumen\":"         + DoubleToString(vol, 2)
        + ",\"precio_entrada\":"  + DoubleToString(pe, 5)
        + ",\"sl\":"              + sl_str
        + ",\"tp\":"              + tp_str
        + ",\"puntos_sl\":"       + DoubleToString(puntos_sl, 2)
        + ",\"timestamp\":\""     + DatetimeToISO(entry_time)    + "\""
        + "}";
}

string BuildSlChangeJson(ulong pos_id, double sl_ant, double sl_new, datetime t) {
   string ant_str = (sl_ant > 0.0) ? DoubleToString(sl_ant, 5) : "null";
   return "{\"event\":\"sl_change\""
        + ",\"email\":\""         + Email                   + "\""
        + ",\"cuenta_numero\":\"" + g_cuenta_numero         + "\""
        + ",\"ea_password\":\""   + EaPassword               + "\""
        + ",\"token\":\""         + Token                    + "\""
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
        + ",\"email\":\""         + Email                   + "\""
        + ",\"cuenta_numero\":\"" + g_cuenta_numero         + "\""
        + ",\"ea_password\":\""   + EaPassword               + "\""
        + ",\"token\":\""         + Token                    + "\""
        + ",\"position_id\":\""   + IntegerToString(pos_id) + "\""
        + ",\"tp_anterior\":"     + ant_str
        + ",\"tp_nuevo\":"        + DoubleToString(tp_new, 5)
        + ",\"timestamp\":\""     + DatetimeToISO(t)        + "\""
        + "}";
}

// FIX corazón de datos (06/07): evento correctivo para cuando se abrió a
// mercado sin SL/TP y luego aparece el primer valor real. Solo manda el
// campo que se acaba de capturar (el otro va como null y el backend lo
// ignora, no lo pisa).
string BuildOriginalCaptureJson(ulong pos_id, double sl, double tp, datetime t) {
   string sl_str = (sl != 0.0) ? DoubleToString(sl, 5) : "null";
   string tp_str = (tp != 0.0) ? DoubleToString(tp, 5) : "null";
   return "{\"event\":\"original_capture\""
        + ",\"email\":\""         + Email                   + "\""
        + ",\"cuenta_numero\":\"" + g_cuenta_numero         + "\""
        + ",\"ea_password\":\""   + EaPassword               + "\""
        + ",\"token\":\""         + Token                    + "\""
        + ",\"position_id\":\""   + IntegerToString(pos_id) + "\""
        + ",\"sl\":"              + sl_str
        + ",\"tp\":"              + tp_str
        + ",\"timestamp\":\""     + DatetimeToISO(t)        + "\""
        + "}";
}

string BuildPartialCloseJson(ulong pos_id, ulong deal_id, double vol,
                              double precio, double beneficio,
                              datetime t, bool es_sl) {
   return "{\"event\":\"partial_close\""
        + ",\"email\":\""         + Email                    + "\""
        + ",\"cuenta_numero\":\"" + g_cuenta_numero          + "\""
        + ",\"ea_password\":\""   + EaPassword                + "\""
        + ",\"token\":\""         + Token                     + "\""
        + ",\"position_id\":\""   + IntegerToString(pos_id)  + "\""
        + ",\"deal_id\":\""       + IntegerToString(deal_id) + "\""
        + ",\"volumen\":"         + DoubleToString(vol, 2)
        + ",\"precio\":"          + DoubleToString(precio, 5)
        + ",\"beneficio\":"       + DoubleToString(beneficio, 2)
        + ",\"es_sl\":"           + (es_sl ? "true" : "false")
        + ",\"timestamp\":\""     + DatetimeToISO(t)         + "\""
        + "}";
}

string BuildCloseJson(ulong pos_id, ulong deal_id, double precio_cierre,
                      double beneficio_total, datetime t) {
   return "{\"event\":\"close\""
        + ",\"email\":\""           + Email                    + "\""
        + ",\"cuenta_numero\":\""   + g_cuenta_numero          + "\""
        + ",\"ea_password\":\""     + EaPassword                + "\""
        + ",\"token\":\""           + Token                     + "\""
        + ",\"position_id\":\""     + IntegerToString(pos_id)  + "\""
        + ",\"deal_id\":\""         + IntegerToString(deal_id) + "\""
        + ",\"precio_cierre\":"     + DoubleToString(precio_cierre,   5)
        + ",\"beneficio_total\":"   + DoubleToString(beneficio_total, 2)
        + ",\"timestamp\":\""       + DatetimeToISO(t)         + "\""
        + "}";
}

//+------------------------------------------------------------------+
//| CONSTRUCTORES JSON — /api/trade-evento (FASE 3, brief linea de   |
//| tiempo Diario). Payload esperado por api/trade-evento.js: token, |
//| email, cuenta_numero, ea_password, fp, tipo_evento,              |
//| puntos_desde_entrada, precio, volumen_afectado, timestamp.       |
//+------------------------------------------------------------------+

string BuildEntradaEventoJson(string fp, double precio_entrada, datetime t) {
   return "{\"tipo_evento\":\"entrada\""
        + ",\"email\":\""              + Email                     + "\""
        + ",\"cuenta_numero\":\""      + g_cuenta_numero           + "\""
        + ",\"ea_password\":\""        + EaPassword                 + "\""
        + ",\"token\":\""              + Token                      + "\""
        + ",\"fp\":\""                 + fp                          + "\""
        + ",\"precio\":"               + DoubleToString(precio_entrada, 5)
        + ",\"puntos_desde_entrada\":null"
        + ",\"volumen_afectado\":null"
        + ",\"timestamp\":\""          + DatetimeToISO(t)           + "\""
        + "}";
}

// tipo_evento='breakeven': se manda cada vez que se detecta un cambio real
// de SL (mismo punto donde ya se manda sl_change a trade-mt5) — confirmado
// con el usuario que este EA no distingue "breakeven escalonado" de otros
// ajustes de SL, así que todo cambio de SL detectado cuenta como este evento.
string BuildBreakevenEventoJson(string fp, double puntos_desde_entrada, double sl_nuevo, datetime t) {
   return "{\"tipo_evento\":\"breakeven\""
        + ",\"email\":\""              + Email                     + "\""
        + ",\"cuenta_numero\":\""      + g_cuenta_numero           + "\""
        + ",\"ea_password\":\""        + EaPassword                 + "\""
        + ",\"token\":\""              + Token                      + "\""
        + ",\"fp\":\""                 + fp                          + "\""
        + ",\"precio\":"               + DoubleToString(sl_nuevo, 5)
        + ",\"puntos_desde_entrada\":" + DoubleToString(puntos_desde_entrada, 2)
        + ",\"volumen_afectado\":null"
        + ",\"timestamp\":\""          + DatetimeToISO(t)           + "\""
        + "}";
}

string BuildParcialEventoJson(string fp, double volumen, double precio, datetime t) {
   return "{\"tipo_evento\":\"parcial\""
        + ",\"email\":\""              + Email                     + "\""
        + ",\"cuenta_numero\":\""      + g_cuenta_numero           + "\""
        + ",\"ea_password\":\""        + EaPassword                 + "\""
        + ",\"token\":\""              + Token                      + "\""
        + ",\"fp\":\""                 + fp                          + "\""
        + ",\"precio\":"               + DoubleToString(precio, 5)
        + ",\"puntos_desde_entrada\":null"
        + ",\"volumen_afectado\":"     + DoubleToString(volumen, 2)
        + ",\"timestamp\":\""          + DatetimeToISO(t)           + "\""
        + "}";
}

string BuildCierreEventoJson(string fp, double precio_cierre, datetime t) {
   return "{\"tipo_evento\":\"cierre\""
        + ",\"email\":\""              + Email                     + "\""
        + ",\"cuenta_numero\":\""      + g_cuenta_numero           + "\""
        + ",\"ea_password\":\""        + EaPassword                 + "\""
        + ",\"token\":\""              + Token                      + "\""
        + ",\"fp\":\""                 + fp                          + "\""
        + ",\"precio\":"               + DoubleToString(precio_cierre, 5)
        + ",\"puntos_desde_entrada\":null"
        + ",\"volumen_afectado\":null"
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

      SlMapSet(pos_id, sl);
      TpMapSet(pos_id, tp);
      PendienteAgregar(pos_id, sl != 0.0, tp != 0.0); // FIX 06/07: vigilar si falta SL/TP original
      string json = BuildOpenJson(pos_id, BuildFp(open_time, pos_id),
                                  tipo_str, vol, pe, sl, tp, puntos_sl, open_time);
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

      string json_open = BuildOpenJson(pos_id, BuildFp(entry_time, pos_id),
                                       tipo_str, entry_vol, entry_price,
                                       sl_orig, tp_orig, puntos_sl, entry_time);
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

   double sl = 0.0, tp = 0.0;
   if(PositionSelectByTicket(pos_id)) {
      sl = PositionGetDouble(POSITION_SL);
      tp = PositionGetDouble(POSITION_TP);
   }

   double puntos_sl = (sl != 0.0) ? MathAbs(pe - sl) : 0.0;
   SlMapSet(pos_id, sl);
   TpMapSet(pos_id, tp);
   PendienteAgregar(pos_id, sl != 0.0, tp != 0.0); // FIX 06/07: vigilar si falta SL/TP original

   string fp   = BuildFp(entry_time, pos_id);
   string json = BuildOpenJson(pos_id, fp,
                               tipo_str, vol, pe, sl, tp, puntos_sl, entry_time);
   Print("[AURUM] Apertura — pos:", pos_id, " | ", tipo_str,
         " | pe:", DoubleToString(pe, 5),
         " | sl:", DoubleToString(sl, 5),
         " | pts:", DoubleToString(puntos_sl, 2));
   SendEvent(json);

   // FASE 3 (brief linea de tiempo Diario): evento 'entrada' en paralelo,
   // después del SendEvent existente (orden a propósito, ver confirmación
   // dada al usuario antes de este cambio).
   SendTradeEvento(BuildEntradaEventoJson(fp, pe, entry_time));
}

void HandleDealClose(const MqlTradeTransaction &trans) {
   ulong    pos_id  = trans.position;
   ulong    deal_id = trans.deal;
   if(EsEventoDuplicado("CLOSE:" + IntegerToString(pos_id) + ":" + IntegerToString((long)deal_id)))
      return;

   double   price   = HistoryDealGetDouble(deal_id, DEAL_PRICE);
   double   vol     = HistoryDealGetDouble(deal_id, DEAL_VOLUME);
   datetime dtime   = (datetime)HistoryDealGetInteger(deal_id, DEAL_TIME);
   bool     es_sl   = (HistoryDealGetInteger(deal_id, DEAL_REASON) == DEAL_REASON_SL);
   double   profit  = HistoryDealGetDouble(deal_id, DEAL_PROFIT)
                    + HistoryDealGetDouble(deal_id, DEAL_COMMISSION)
                    + HistoryDealGetDouble(deal_id, DEAL_SWAP);

   bool is_partial = PositionSelectByTicket(pos_id);

   if(is_partial) {
      string json = BuildPartialCloseJson(pos_id, deal_id, vol, price, profit, dtime, es_sl);
      Print("[AURUM] Parcial — pos:", pos_id,
            " | deal:", deal_id,
            " | vol:", DoubleToString(vol, 2),
            " | price:", DoubleToString(price, 5),
            " | ben:", DoubleToString(profit, 2));
      SendEvent(json);

      // FASE 3: evento 'parcial'. La posición sigue seleccionada aquí
      // (is_partial = PositionSelectByTicket ya tuvo éxito), así que
      // POSITION_TIME da la hora de apertura sin necesidad de historial.
      datetime entry_time = (datetime)PositionGetInteger(POSITION_TIME);
      string   fp         = BuildFp(entry_time, pos_id);
      SendTradeEvento(BuildParcialEventoJson(fp, vol, price, dtime));
   } else {
      double beneficio_total = GetBeneficioTotalPos(pos_id);
      string json = BuildCloseJson(pos_id, deal_id, price, beneficio_total, dtime);
      Print("[AURUM] Cierre — pos:", pos_id,
            " | deal:", deal_id,
            " | price:", DoubleToString(price, 5),
            " | ben_total:", DoubleToString(beneficio_total, 2));
      SendEvent(json);
      SlMapRemove(pos_id);
      TpMapRemove(pos_id);
      PendienteQuitarPorPosId(pos_id); // FIX 06/07: ya no hace falta vigilar una posición cerrada

      // FASE 3: evento 'cierre'. Aquí la posición YA NO está seleccionable
      // (cerró del todo) — la hora de apertura se recupera del historial.
      datetime entry_time = GetEntryTimeForPosition(pos_id);
      string   fp         = BuildFp(entry_time, pos_id);
      SendTradeEvento(BuildCierreEventoJson(fp, price, dtime));
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

         // FASE 3: todo cambio de SL detectado cuenta como 'breakeven' en la
         // línea de tiempo (confirmado con el usuario — este EA no distingue
         // "breakeven escalonado" de otros ajustes de SL). La posición sigue
         // seleccionada aquí (PositionSelectByTicket ya tuvo éxito arriba).
         double   precio_entrada    = PositionGetDouble(POSITION_PRICE_OPEN);
         datetime entry_time        = (datetime)PositionGetInteger(POSITION_TIME);
         string   fp                = BuildFp(entry_time, pos_id);
         double   puntos_desde_ent  = MathAbs(sl_nuevo - precio_entrada);
         SendTradeEvento(BuildBreakevenEventoJson(fp, puntos_desde_ent, sl_nuevo, now));
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

      if(!g_pend_sl_hecho[i] && sl_actual != 0.0) {
         g_pend_sl_hecho[i] = true;
         sl_para_evento = sl_actual;
         SlMapSet(pos_id, sl_actual);
         huboCaptura = true;
      }
      if(!g_pend_tp_hecho[i] && tp_actual != 0.0) {
         g_pend_tp_hecho[i] = true;
         tp_para_evento = tp_actual;
         TpMapSet(pos_id, tp_actual);
         huboCaptura = true;
      }

      if(huboCaptura) {
         string json = BuildOriginalCaptureJson(pos_id, sl_para_evento, tp_para_evento, TimeTradeServer());
         Print("[AURUM] Original capturado — pos:", pos_id,
               " | sl:", DoubleToString(sl_para_evento, 5),
               " | tp:", DoubleToString(tp_para_evento, 5));
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
//| EVENTOS PRINCIPALES                                               |
//+------------------------------------------------------------------+

int OnInit() {
   if(Email == "") {
      Print("[AURUM] ERROR: introduce tu email Aurum en el input 'Email' y reactiva el EA");
      return INIT_FAILED;
   }

   g_cuenta_numero = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   g_sync_done     = false;

   // FIX 06/07: recuperar eventos pendientes de una sesión anterior ANTES
   // de nada más — si el EA se reinició con la cola llena, esto los trae
   // de vuelta a g_cola para que se reintenten en el próximo OnTimer.
   CargarColaPersistida();

   // FASE 3: mismo mecanismo, cola separada. Va después de la existente
   // a propósito (ver confirmación dada al usuario sobre orden de llamadas).
   CargarColaEventosPersistida();

   // Precarga SL de posiciones abiertas (seguro en OnInit, sin WebRequest)
   PopulateSlMap();

   EventSetTimer(5); // Sync inicial en 5 segundos via OnTimer

   Print("══════════════════════════════════════════════════");
   Print("[AURUM] EA_Aurum_Tracker iniciado");
   Print("[AURUM] Cuenta  : ", g_cuenta_numero);
   Print("[AURUM] Email   : ", Email);
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
   Print("[AURUM] EA detenido | razón:", reason,
         " | eventos pendientes: ", ArraySize(g_cola),
         " | eventos línea de tiempo pendientes: ", ArraySize(g_cola_eventos),
         " (guardados en disco, se recuperan al reiniciar)");
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

void OnTick() {
   if(ArraySize(g_pend_pos_ids) == 0) return; // nada que vigilar, no perder tiempo
   if(TimeCurrent() - g_ultimoCheckOriginales < 10) return;
   g_ultimoCheckOriginales = TimeCurrent();
   CheckOriginalesPendientes();
}
