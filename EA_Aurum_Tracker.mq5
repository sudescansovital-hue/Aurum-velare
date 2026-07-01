//+------------------------------------------------------------------+
//| EA_Aurum_Tracker.mq5                                             |
//| Aurum Velare — Registro automático de trades XAU/USD en Supabase |
//+------------------------------------------------------------------+
#property copyright "Aurum Velare"
#property link      "https://aurumvelare.com"
#property version   "1.00"

//--- Inputs
input string Email          = "";
input string EndpointURL    = "https://aurumvelare.com/api/trade-mt5";
input int    MaxReintentos  = 3;
input int    TimerSegundos  = 30;
input int    HorasSync      = 48;

//--- Globales
string g_cuenta_numero = "";
bool   g_sync_done     = false;

//--- Mapa SL (arrays paralelos)
ulong  g_sl_pos_ids[];
double g_sl_values[];

//--- Cola de reintentos
struct PendingEvent {
   string   json_body;
   int      reintentos;
   datetime ultimo_intento;
};
PendingEvent g_cola[];

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
        + ",\"position_id\":\""   + IntegerToString(pos_id) + "\""
        + ",\"sl_anterior\":"     + ant_str
        + ",\"sl_nuevo\":"        + DoubleToString(sl_new, 5)
        + ",\"timestamp\":\""     + DatetimeToISO(t)        + "\""
        + "}";
}

string BuildPartialCloseJson(ulong pos_id, ulong deal_id, double vol,
                              double precio, double beneficio,
                              datetime t, bool es_sl) {
   return "{\"event\":\"partial_close\""
        + ",\"email\":\""         + Email                    + "\""
        + ",\"cuenta_numero\":\"" + g_cuenta_numero          + "\""
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
        + ",\"position_id\":\""     + IntegerToString(pos_id)  + "\""
        + ",\"deal_id\":\""         + IntegerToString(deal_id) + "\""
        + ",\"precio_cierre\":"     + DoubleToString(precio_cierre,   5)
        + ",\"beneficio_total\":"   + DoubleToString(beneficio_total, 2)
        + ",\"timestamp\":\""       + DatetimeToISO(t)         + "\""
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
      10000, data, result, result_headers
   );

   if(code == 200) return true;

   string resp = (ArraySize(result) > 0)
               ? CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8)
               : "";
   Print("[AURUM] HTTP:", code, " | error:", GetLastError(), " | resp:", resp);
   return false;
}

void SendEvent(const string json_body) {
   if(DoWebRequest(json_body)) return;

   int sz = ArraySize(g_cola);
   ArrayResize(g_cola, sz + 1);
   g_cola[sz].json_body      = json_body;
   g_cola[sz].reintentos     = 0;
   g_cola[sz].ultimo_intento = TimeCurrent();
   Print("[AURUM] Encolado para reintento — cola: ", sz + 1, " eventos");
}

void ProcessRetryQueue() {
   if(ArraySize(g_cola) == 0) return;
   datetime now = TimeCurrent();
   int i = 0;
   while(i < ArraySize(g_cola)) {
      if(now - g_cola[i].ultimo_intento < TimerSegundos) { i++; continue; }
      g_cola[i].reintentos++;
      g_cola[i].ultimo_intento = now;
      Print("[AURUM] Reintento ", g_cola[i].reintentos, "/", MaxReintentos);
      if(DoWebRequest(g_cola[i].json_body)) {
         Print("[AURUM] Reintento OK");
         for(int j = i; j < ArraySize(g_cola) - 1; j++) g_cola[j] = g_cola[j + 1];
         ArrayResize(g_cola, ArraySize(g_cola) - 1);
      } else if(g_cola[i].reintentos >= MaxReintentos) {
         Print("[AURUM] ERROR: descartado tras ", MaxReintentos, " reintentos | ", g_cola[i].json_body);
         for(int j = i; j < ArraySize(g_cola) - 1; j++) g_cola[j] = g_cola[j + 1];
         ArrayResize(g_cola, ArraySize(g_cola) - 1);
      } else {
         i++;
      }
   }
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
//| HANDLERS EN TIEMPO REAL                                           |
//+------------------------------------------------------------------+

void HandleDealOpen(const MqlTradeTransaction &trans) {
   ulong    pos_id     = trans.position;
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

   string json = BuildOpenJson(pos_id, BuildFp(entry_time, pos_id),
                               tipo_str, vol, pe, sl, tp, puntos_sl, entry_time);
   Print("[AURUM] Apertura — pos:", pos_id, " | ", tipo_str,
         " | pe:", DoubleToString(pe, 5),
         " | sl:", DoubleToString(sl, 5),
         " | pts:", DoubleToString(puntos_sl, 2));
   SendEvent(json);
}

void HandleDealClose(const MqlTradeTransaction &trans) {
   ulong    pos_id  = trans.position;
   ulong    deal_id = trans.deal;
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
   } else {
      double beneficio_total = GetBeneficioTotalPos(pos_id);
      string json = BuildCloseJson(pos_id, deal_id, price, beneficio_total, dtime);
      Print("[AURUM] Cierre — pos:", pos_id,
            " | deal:", deal_id,
            " | price:", DoubleToString(price, 5),
            " | ben_total:", DoubleToString(beneficio_total, 2));
      SendEvent(json);
      SlMapRemove(pos_id);
   }
}

void HandlePositionModified(const MqlTradeTransaction &trans) {
   ulong pos_id = trans.position;
   if(!PositionSelectByTicket(pos_id)) return;
   if(!EsXauusd(PositionGetString(POSITION_SYMBOL))) return;

   double sl_nuevo = PositionGetDouble(POSITION_SL);
   double sl_prev  = SlMapGet(pos_id);

   // -1.0 = no estaba en el mapa; registrar y salir sin enviar evento
   if(sl_prev < 0.0) { SlMapSet(pos_id, sl_nuevo); return; }
   // Sin cambio de SL (solo cambió TP u otro campo)
   if(MathAbs(sl_nuevo - sl_prev) < 0.00001) return;

   datetime now  = TimeTradeServer();
   string   json = BuildSlChangeJson(pos_id, sl_prev, sl_nuevo, now);
   Print("[AURUM] SL change — pos:", pos_id,
         " | ", DoubleToString(sl_prev, 5),
         " → ", DoubleToString(sl_nuevo, 5));

   SlMapSet(pos_id, sl_nuevo);
   SendEvent(json);
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

   // Precarga SL de posiciones abiertas (seguro en OnInit, sin WebRequest)
   PopulateSlMap();

   EventSetTimer(5); // Sync inicial en 5 segundos via OnTimer

   Print("══════════════════════════════════════════════════");
   Print("[AURUM] EA_Aurum_Tracker iniciado");
   Print("[AURUM] Cuenta  : ", g_cuenta_numero);
   Print("[AURUM] Email   : ", Email);
   Print("[AURUM] Endpoint: ", EndpointURL);
   Print("[AURUM] ⚠ Añade la URL a la lista blanca si no está:");
   Print("[AURUM]   MT5 → Herramientas → Opciones → Asesores Expertos");
   Print("[AURUM]   → Permitir WebRequest → agregar: https://aurumvelare.com");
   Print("[AURUM] Sincronización inicial en 5 segundos...");
   Print("══════════════════════════════════════════════════");

   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) {
   EventKillTimer();
   Print("[AURUM] EA detenido | razón:", reason,
         " | eventos pendientes: ", ArraySize(g_cola));
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
      SyncOpenPositions();
      SyncHistory48h();
      EventKillTimer();
      EventSetTimer(TimerSegundos); // Cambiar al intervalo normal de reintentos
      return;
   }
   ProcessRetryQueue();
}

// Requerido para que el EA sea válido en cualquier gráfico
void OnTick() {}
