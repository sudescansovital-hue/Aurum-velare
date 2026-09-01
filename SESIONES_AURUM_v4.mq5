//+------------------------------------------------------------------+
//|                                              SESIONES_AURUM.mq5  |
//|                                    © AurumVelare - aurumvelare.com|
//+------------------------------------------------------------------+
#property indicator_chart_window
#property indicator_plots 0

// === OFFSET HORARIO ===
input int    OffsetHoras         = 0;       // Offset global (ej: +1 o -1 si hay desajuste)

// === RENDIMIENTO ===
input int    IntervaloRedibujoSeg = 300;    // Cada cuántos segundos se refrescan sesiones/noticias (el countdown sigue siendo cada segundo)

// === SESIONES PRINCIPALES - ACTIVAR/DESACTIVAR ===
input bool   MostrarAsia        = true;    // Mostrar Asia
input bool   MostrarLondres     = true;    // Mostrar Londres
input bool   MostrarNY          = true;    // Mostrar Nueva York

// === HORARIOS SESIONES PRINCIPALES (acepta medias horas: 1.5 = 01:30) ===
input double Asia_Inicio        = 0.25;    // Asia - hora inicio (0.25 = 00:15)
input double Asia_Fin           = 9.0;     // Asia - hora fin
input double Londres_Inicio     = 7.0;     // Londres - hora inicio
input double Londres_Fin        = 15.5;    // Londres - hora fin
input double NY_Inicio          = 14.5;    // Nueva York - hora inicio
input double NY_Fin             = 17.5;    // Nueva York - hora fin

// === COLORES SESIONES PRINCIPALES ===
input color  Color_Asia         = 0x07071D;   // Color Asia (aún más apagado)
input color  Color_Londres      = 0x171D03;   // Color Londres (aún más apagado)
input color  Color_NY           = 0x1E1001;   // Color Nueva York / "NY tarde" (aún más apagado)

// === SOLAPES AUTOMÁTICOS ENTRE SESIONES ===
input color  Color_SolapeAsiaLondres  = 0x021423;  // Color solape Asia-Londres / "Ant" (aún más apagado)
input color  Color_SolapeLondresNY    = 0x2C1805;  // Color solape Londres-NY / "NY open" (aún más apagado)

// === CIERRE (tramo después de NY) ===
input bool   MostrarCierre      = true;       // Mostrar tramo de cierre tras Nueva York
input double Cierre_Fin         = 22.9167;    // Cierre - hora fin (22.9167 = 22:55)
input color  Color_Cierre       = 0x240505;   // Color cierre (aún más apagado)

// === FRANJAS EXTRA (4 franjas configurables) ===
input bool   MostrarFranja1     = false;   // Mostrar Franja 1
input double Franja1_Inicio     = 6.0;     // Franja 1 - hora inicio
input double Franja1_Fin        = 8.0;     // Franja 1 - hora fin
input color  Color_Franja1      = 0x1A2600;// Color Franja 1

input bool   MostrarFranja2     = false;   // Mostrar Franja 2
input double Franja2_Inicio     = 17.0;    // Franja 2 - hora inicio
input double Franja2_Fin        = 20.0;    // Franja 2 - hora fin
input color  Color_Franja2      = 0x1A0026;// Color Franja 2

input bool   MostrarFranja3     = false;   // Mostrar Franja 3
input double Franja3_Inicio     = 20.0;    // Franja 3 - hora inicio
input double Franja3_Fin        = 24.0;    // Franja 3 - hora fin
input color  Color_Franja3      = 0x1A1A1A;// Color Franja 3

input bool   MostrarFranja4     = false;   // Mostrar Franja 4
input double Franja4_Inicio     = 0.0;     // Franja 4 - hora inicio
input double Franja4_Fin        = 2.0;     // Franja 4 - hora fin
input color  Color_Franja4      = 0x001A1A;// Color Franja 4

// === OPACIDAD ===
input int    OpacidadFranjas    = 35;          // Opacidad franjas (0-255)

// === COUNTDOWN VELAS ===
input bool   MostrarCountdown   = true;    // Mostrar countdown cierres de vela
input int    TamanoCountdown    = 16;      // Tamaño texto countdown (más grande)
input color  ColorCountdown     = clrAqua; // Color countdown (celeste)

// === NOTICIAS ===
input bool   MostrarNoticias    = true;    // Activar noticias alto impacto
input int    MinutosAntes       = 5;       // Minutos ANTES de la noticia
input int    MinutosDespues     = 5;       // Minutos DESPUÉS de la noticia
input color  ColorNoticia       = clrRed;  // Color líneas de noticia

// === MARCA DE AGUA ===
input bool   MostrarMarca       = true;    // Mostrar marca AurumVelare
input color  ColorMarca         = clrAqua; // Color marca (celeste)
input int    TamanoMarca        = 18;      // Tamaño marca (grande)

//--- prefijos para objetos
#define PREFIX_SESION   "AV_SES_"
#define PREFIX_NOTICIA  "AV_NOT_"
#define OBJ_CD_M5       "AV_CD_M5"
#define OBJ_CD_M15      "AV_CD_M15"
#define OBJ_CD_H1       "AV_CD_H1"
#define OBJ_CD_H4       "AV_CD_H4"
#define OBJ_MARCA       "AV_MARCA"

struct Sesion {
   string   nombre;
   double   inicio;
   double   fin;
   color    col;
   bool     activa;
};

Sesion sesiones[4]; // 4 franjas extra opcionales (las 6 bandas principales se calculan aparte, sin solaparse)
int    g_timerTick = 0; // contador para no redibujar sesiones/noticias cada segundo

//--- Convierte double hora (ej: 22.9166 = 22:55) a minutos totales del día
int HoraAMinutos(double h) {
   int hr  = (int)MathFloor(h);
   int min = (int)MathRound((h - hr) * 60.0);
   if(min >= 60) { min -= 60; hr += 1; }
   return hr * 60 + min;
}

//+------------------------------------------------------------------+
int OnInit() {
   // Franjas extra (las 6 bandas principales ya no usan este array, se calculan aparte)
   sesiones[0].nombre="Franja1";  sesiones[0].inicio=Franja1_Inicio; sesiones[0].fin=Franja1_Fin;   sesiones[0].col=Color_Franja1;  sesiones[0].activa=MostrarFranja1;
   sesiones[1].nombre="Franja2";  sesiones[1].inicio=Franja2_Inicio; sesiones[1].fin=Franja2_Fin;   sesiones[1].col=Color_Franja2;  sesiones[1].activa=MostrarFranja2;
   sesiones[2].nombre="Franja3";  sesiones[2].inicio=Franja3_Inicio; sesiones[2].fin=Franja3_Fin;   sesiones[2].col=Color_Franja3;  sesiones[2].activa=MostrarFranja3;
   sesiones[3].nombre="Franja4";  sesiones[3].inicio=Franja4_Inicio; sesiones[3].fin=Franja4_Fin;   sesiones[3].col=Color_Franja4;  sesiones[3].activa=MostrarFranja4;

   CrearMarca();
   CrearCountdown();
   EventSetTimer(1); // cada segundo para countdown preciso
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason) {
   EventKillTimer();
   BorrarTodo();
}

//+------------------------------------------------------------------+
int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[]) {
   if(prev_calculated == 0) {
      DibujarSesiones(time, rates_total);
      if(MostrarNoticias) DibujarNoticias();
   }
   ActualizarCountdown();
   return rates_total;
}

//+------------------------------------------------------------------+
void OnTimer() {
   g_timerTick++;
   if(g_timerTick >= IntervaloRedibujoSeg) {
      g_timerTick = 0;
      if(MostrarNoticias) DibujarNoticias(); // las noticias sí cambian, esto se refresca cada rato
   }
   ActualizarCountdown(); // esto sí cada segundo, es solo texto, no pesa
}

//+------------------------------------------------------------------+
void DibujarSesiones(const datetime &time[], int total) {
   // Borrar franjas anteriores
   for(int i = ObjectsTotal(0) - 1; i >= 0; i--) {
      string name = ObjectName(0, i);
      if(StringFind(name, PREFIX_SESION) == 0)
         ObjectDelete(0, name);
   }

   int diasAtras = 7;      // una semana hacia atrás
   int diasAdelante = 60;  // dos meses hacia adelante, no hace falta redibujar
   datetime ahora = TimeCurrent();
   datetime desde = ahora - diasAtras * 86400;
   datetime hasta = ahora + diasAdelante * 86400;

   // --- Las 6 bandas principales, consecutivas y sin solaparse nunca ---
   // (igual que el mapa horario de la web: cada tramo es un color fijo, no una mezcla)
   if(MostrarAsia)                  DibujarTramo(Asia_Inicio,     Londres_Inicio, Color_Asia,               "Asia",     desde, hasta);
   if(MostrarAsia && MostrarLondres) DibujarTramo(Londres_Inicio,  Asia_Fin,       Color_SolapeAsiaLondres,  "Ant",      desde, hasta);
   if(MostrarLondres)               DibujarTramo(Asia_Fin,        NY_Inicio,      Color_Londres,            "Londres",  desde, hasta);
   if(MostrarLondres && MostrarNY)  DibujarTramo(NY_Inicio,       Londres_Fin,    Color_SolapeLondresNY,    "NYOpen",   desde, hasta);
   if(MostrarNY)                    DibujarTramo(Londres_Fin,     NY_Fin,         Color_NY,                 "NYTarde",  desde, hasta);
   if(MostrarNY && MostrarCierre)   DibujarTramo(NY_Fin,          Cierre_Fin,     Color_Cierre,             "Cierre",   desde, hasta);

   // --- Franjas extra opcionales (si las activas, van encima de las bandas de arriba) ---
   MqlDateTime dt;
   datetime t = desde;
   while(t <= hasta) {
      TimeToStruct(t, dt);

      for(int s = 0; s < 4; s++) {
         if(!sesiones[s].activa) continue;

         int iniMin = HoraAMinutos(sesiones[s].inicio) + OffsetHoras * 60;
         int finMin = HoraAMinutos(sesiones[s].fin)    + OffsetHoras * 60;

         MqlDateTime dini = dt;
         dini.hour = iniMin / 60;
         dini.min  = iniMin % 60;
         dini.sec  = 0;

         MqlDateTime dfin = dt;
         int finH = finMin / 60;
         int finM = finMin % 60;
         if(finH >= 24) { finH = 23; finM = 59; }
         dfin.hour = finH;
         dfin.min  = finM;
         dfin.sec  = (finH == 23 && finM == 59) ? 59 : 0;

         datetime t1 = StructToTime(dini);
         datetime t2 = StructToTime(dfin);

         if(t2 <= t1) { continue; }
         if(t2 < desde || t1 > hasta) { continue; }

         string name = PREFIX_SESION + sesiones[s].nombre + "_" + IntegerToString((int)t1);

         if(ObjectFind(0, name) < 0) {
            ObjectCreate(0, name, OBJ_RECTANGLE, 0, t1, 0, t2, 0);
            ObjectSetInteger(0, name, OBJPROP_COLOR,     sesiones[s].col);
            ObjectSetInteger(0, name, OBJPROP_STYLE,     STYLE_SOLID);
            ObjectSetInteger(0, name, OBJPROP_WIDTH,     1);
            ObjectSetInteger(0, name, OBJPROP_FILL,      true);
            ObjectSetInteger(0, name, OBJPROP_BACK,      true);
            ObjectSetInteger(0, name, OBJPROP_SELECTABLE,false);
            ObjectSetInteger(0, name, OBJPROP_HIDDEN,    true);
            ObjectSetDouble(0,  name, OBJPROP_PRICE, 0, 99999);
            ObjectSetDouble(0,  name, OBJPROP_PRICE, 1, 0);
            ObjectSetInteger(0, name, OBJPROP_ZORDER,   20);
         }
      }
      t += 86400;
   }

   ChartRedraw(0);
}

//+------------------------------------------------------------------+
// Dibuja un tramo horario fijo cada día con un color dado (se reutiliza
// tanto para los solapes entre sesiones como para el tramo de cierre).
void DibujarTramo(double ini, double fin, color col, string tag,
                   datetime desde, datetime hasta) {
   if(fin <= ini) return;

   MqlDateTime dt;
   datetime t = desde;

   while(t <= hasta) {
      TimeToStruct(t, dt);

      int iniMin = HoraAMinutos(ini) + OffsetHoras * 60;
      int finMin = HoraAMinutos(fin) + OffsetHoras * 60;

      MqlDateTime dini = dt;
      dini.hour = iniMin / 60; dini.min = iniMin % 60; dini.sec = 0;

      MqlDateTime dfin = dt;
      int finH = finMin / 60, finM = finMin % 60;
      if(finH >= 24) { finH = 23; finM = 59; }
      dfin.hour = finH; dfin.min = finM; dfin.sec = (finH == 23 && finM == 59) ? 59 : 0;

      datetime t1 = StructToTime(dini);
      datetime t2 = StructToTime(dfin);

      if(t2 > t1 && !(t2 < desde || t1 > hasta)) {
         string name = PREFIX_SESION + tag + "_" + IntegerToString((int)t1);
         if(ObjectFind(0, name) < 0) {
            ObjectCreate(0, name, OBJ_RECTANGLE, 0, t1, 0, t2, 0);
            ObjectSetInteger(0, name, OBJPROP_COLOR,     col);
            ObjectSetInteger(0, name, OBJPROP_STYLE,     STYLE_SOLID);
            ObjectSetInteger(0, name, OBJPROP_WIDTH,     1);
            ObjectSetInteger(0, name, OBJPROP_FILL,      true);
            ObjectSetInteger(0, name, OBJPROP_BACK,      true);
            ObjectSetInteger(0, name, OBJPROP_SELECTABLE,false);
            ObjectSetInteger(0, name, OBJPROP_HIDDEN,    true);
            ObjectSetDouble(0,  name, OBJPROP_PRICE, 0, 99999);
            ObjectSetDouble(0,  name, OBJPROP_PRICE, 1, 0);
            ObjectSetInteger(0, name, OBJPROP_ZORDER,   10); // por encima de las sesiones base
         }
      }
      t += 86400;
   }
}

//+------------------------------------------------------------------+
void DibujarNoticias() {
   // Borrar noticias anteriores
   for(int i = ObjectsTotal(0) - 1; i >= 0; i--) {
      string name = ObjectName(0, i);
      if(StringFind(name, PREFIX_NOTICIA) == 0)
         ObjectDelete(0, name);
   }

   datetime desde = TimeCurrent() - 3 * 86400;
   datetime hasta = TimeCurrent() + 2 * 86400;

   MqlCalendarValue valores[];
   if(CalendarValueHistory(valores, desde, hasta, "USD") <= 0) return;

   // CalendarValueHistory devuelve tiempos en UTC.
   // El chart usa server time → convertir: t_server = t_utc + offset
   long serverOffset = (long)(TimeCurrent() - TimeGMT());

   for(int i = 0; i < ArraySize(valores); i++) {
      MqlCalendarEvent evento;
      if(!CalendarEventById(valores[i].event_id, evento)) continue;

      if(evento.importance == CALENDAR_IMPORTANCE_NONE ||
         evento.importance == CALENDAR_IMPORTANCE_LOW) continue;

      // Convertir UTC → server time para alinear con el chart
      datetime t_noticia = (datetime)(valores[i].time + serverOffset);
      datetime t_antes   = t_noticia - MinutosAntes   * 60;
      datetime t_despues = t_noticia + MinutosDespues * 60;

      string id = IntegerToString((int)t_noticia) + "_" + IntegerToString((int)valores[i].event_id);

      // Línea ANTES (punteada)
      string nameA = PREFIX_NOTICIA + "A_" + id;
      if(ObjectFind(0, nameA) < 0) {
         ObjectCreate(0, nameA, OBJ_VLINE, 0, t_antes, 0);
         ObjectSetInteger(0, nameA, OBJPROP_COLOR,      ColorNoticia);
         ObjectSetInteger(0, nameA, OBJPROP_STYLE,      STYLE_DASH);
         ObjectSetInteger(0, nameA, OBJPROP_WIDTH,      1);
         ObjectSetInteger(0, nameA, OBJPROP_BACK,       false);
         ObjectSetInteger(0, nameA, OBJPROP_SELECTABLE, false);
         ObjectSetInteger(0, nameA, OBJPROP_HIDDEN,     true);
      }

      // Línea DESPUÉS (punteada)
      string nameD = PREFIX_NOTICIA + "D_" + id;
      if(ObjectFind(0, nameD) < 0) {
         ObjectCreate(0, nameD, OBJ_VLINE, 0, t_despues, 0);
         ObjectSetInteger(0, nameD, OBJPROP_COLOR,      ColorNoticia);
         ObjectSetInteger(0, nameD, OBJPROP_STYLE,      STYLE_DASH);
         ObjectSetInteger(0, nameD, OBJPROP_WIDTH,      1);
         ObjectSetInteger(0, nameD, OBJPROP_BACK,       false);
         ObjectSetInteger(0, nameD, OBJPROP_SELECTABLE, false);
         ObjectSetInteger(0, nameD, OBJPROP_HIDDEN,     true);
      }

      // Línea exacta (sólida)
      string nameN = PREFIX_NOTICIA + "N_" + id;
      if(ObjectFind(0, nameN) < 0) {
         ObjectCreate(0, nameN, OBJ_VLINE, 0, t_noticia, 0);
         ObjectSetInteger(0, nameN, OBJPROP_COLOR,      ColorNoticia);
         ObjectSetInteger(0, nameN, OBJPROP_STYLE,      STYLE_SOLID);
         ObjectSetInteger(0, nameN, OBJPROP_WIDTH,      2);
         ObjectSetInteger(0, nameN, OBJPROP_BACK,       false);
         ObjectSetInteger(0, nameN, OBJPROP_SELECTABLE, false);
         ObjectSetInteger(0, nameN, OBJPROP_HIDDEN,     true);
         ObjectSetString(0,  nameN, OBJPROP_TEXT,       evento.name);
      }
   }
   ChartRedraw(0);
}

//+------------------------------------------------------------------+
// Countdown de cierre de vela: formato H:MM o M:SS según tiempo restante
string CountdownTF(ENUM_TIMEFRAMES tf, string label) {
   datetime ahora = TimeCurrent();
   int secs = PeriodSeconds(tf);
   if(secs <= 0) return "";
   int resto = secs - (int)(ahora % secs);
   int h = resto / 3600;
   int m = (resto % 3600) / 60;
   int s = resto % 60;
   string pad_m = (m < 10) ? "0" : "";
   string pad_s = (s < 10) ? "0" : "";
   string tiempo;
   if(h > 0)
      tiempo = (string)h + ":" + pad_m + (string)m + ":" + pad_s + (string)s;
   else
      tiempo = (string)m + ":" + pad_s + (string)s;
   return label + " " + tiempo;
}

//+------------------------------------------------------------------+
void ActualizarCountdown() {
   if(!MostrarCountdown) return;

   ObjectSetString(0, OBJ_CD_M5,  OBJPROP_TEXT, CountdownTF(PERIOD_M5,  "M5"));
   ObjectSetString(0, OBJ_CD_M15, OBJPROP_TEXT, CountdownTF(PERIOD_M15, "M15"));
   ObjectSetString(0, OBJ_CD_H1,  OBJPROP_TEXT, CountdownTF(PERIOD_H1,  "H1"));
   ObjectSetString(0, OBJ_CD_H4,  OBJPROP_TEXT, CountdownTF(PERIOD_H4,  "H4"));

   ChartRedraw(0);
}

//+------------------------------------------------------------------+
void _CrearLabelCD(string name, int xDist) {
   if(ObjectFind(0, name) >= 0) ObjectDelete(0, name);
   ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   // Esquina inferior izquierda, en fila propia debajo de la marca de agua
   ObjectSetInteger(0, name, OBJPROP_CORNER,    CORNER_LEFT_LOWER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, xDist);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, 40);  // sobre las velas de volumen
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE,  TamanoCountdown);
   ObjectSetInteger(0, name, OBJPROP_COLOR,     ColorCountdown);
   ObjectSetString(0,  name, OBJPROP_FONT,      "Arial Bold");
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE,false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN,    true);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR,    ANCHOR_LEFT_LOWER);
}

void CrearCountdown() {
   if(!MostrarCountdown) return;
   // Separados horizontalmente, de izquierda a derecha: M5 | M15 | H1 | H4
   _CrearLabelCD(OBJ_CD_M5,  10);
   _CrearLabelCD(OBJ_CD_M15, 140);
   _CrearLabelCD(OBJ_CD_H1,  270);
   _CrearLabelCD(OBJ_CD_H4,  400);
}

//+------------------------------------------------------------------+
void CrearMarca() {
   if(!MostrarMarca) return;
   if(ObjectFind(0, OBJ_MARCA) >= 0) ObjectDelete(0, OBJ_MARCA);
   ObjectCreate(0, OBJ_MARCA, OBJ_LABEL, 0, 0, 0);
   // Esquina inferior izquierda — zona bajo los botones sell/buy
   ObjectSetInteger(0, OBJ_MARCA, OBJPROP_CORNER,    CORNER_LEFT_LOWER);
   ObjectSetInteger(0, OBJ_MARCA, OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, OBJ_MARCA, OBJPROP_YDISTANCE, 80);  // debajo del panel de trading
   ObjectSetInteger(0, OBJ_MARCA, OBJPROP_FONTSIZE,  TamanoMarca);
   ObjectSetInteger(0, OBJ_MARCA, OBJPROP_COLOR,     ColorMarca);
   ObjectSetString(0,  OBJ_MARCA, OBJPROP_FONT,      "Arial Bold");
   ObjectSetString(0,  OBJ_MARCA, OBJPROP_TEXT,      "✦ aurumvelare.com");
   ObjectSetInteger(0, OBJ_MARCA, OBJPROP_SELECTABLE,false);
   ObjectSetInteger(0, OBJ_MARCA, OBJPROP_HIDDEN,    true);
   ObjectSetInteger(0, OBJ_MARCA, OBJPROP_ANCHOR,    ANCHOR_LEFT_LOWER);
}

//+------------------------------------------------------------------+
void BorrarTodo() {
   for(int i = ObjectsTotal(0) - 1; i >= 0; i--) {
      string name = ObjectName(0, i);
      if(StringFind(name, PREFIX_SESION)  == 0 ||
         StringFind(name, PREFIX_NOTICIA) == 0)
         ObjectDelete(0, name);
   }
   ObjectDelete(0, OBJ_CD_M5);
   ObjectDelete(0, OBJ_CD_M15);
   ObjectDelete(0, OBJ_CD_H1);
   ObjectDelete(0, OBJ_CD_H4);
   ObjectDelete(0, OBJ_MARCA);
}
