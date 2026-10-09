//+------------------------------------------------------------------+
//|                                              Aurum_Alertas.mq5   |
//|  Alertas en directo cuando el precio TOCA una media simple        |
//|  (SMA 20 / 40 / 200 / 600 sobre cierre) de cualquier              |
//|  temporalidad (M1 / M5 / M15 / H1 / H4 / D1), desde un panel en   |
//|  el gráfico. Aviso: push al móvil + Alert + sonido.               |
//|                                                                  |
//|  - Alerta de un solo uso: se borra al saltar.                    |
//|  - Las alertas activas se guardan en MQL5\Files\                 |
//|    Aurum_Alertas_<símbolo>.csv y vuelven al reiniciar MT5.       |
//|  - Un solo gráfico del símbolo basta para todas las              |
//|    temporalidades (si lo pones en dos, el segundo no hace nada). |
//|  - NO abre ni cierra operaciones. NO envía nada a Aurum.         |
//+------------------------------------------------------------------+
#property copyright   "Aurum Velare"
#property version     "1.00"
#property description "Alertas cuando el precio toca una SMA 20/40/200/600 (M1-D1). Push al móvil, Alert y sonido. No opera ni envía nada a Aurum."
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

//--- Entradas
input double           InpToleranciaPts = 0;            // Tolerancia en puntos de precio (1 = 1,00 en XAUUSD)
input bool             InpPush          = true;         // Push al móvil (SendNotification)
input bool             InpAlert         = true;         // Ventana Alert
input bool             InpSonido        = true;         // Sonido
input string           InpArchivoSonido = "alert2.wav"; // Sonido (carpeta Sounds de MT5)
input ENUM_BASE_CORNER InpEsquina       = CORNER_RIGHT_UPPER; // Esquina del panel
input int              InpX             = 10;           // Separación horizontal del borde (px)
input int              InpY             = 20;           // Separación vertical del borde (px)
input int              InpPruebaMedia   = 0;            // Solo Probador: crea sola una alerta en esta SMA (0 = no)
input ENUM_TIMEFRAMES  InpPruebaTF      = PERIOD_M1;    // Solo Probador: temporalidad de esa alerta

//--- Constantes
#define PFX        "AurAl_"
#define NOMBRE     "Aurum_Alertas"
#define MAX_ALERTAS 12
#define ANCHO      290

int             MEDIAS[4] = {20, 40, 200, 600};
ENUM_TIMEFRAMES TFS[6]    = {PERIOD_M1, PERIOD_M5, PERIOD_M15, PERIOD_H1, PERIOD_H4, PERIOD_D1};
string          TF_TXT[6] = {"M1", "M5", "M15", "H1", "H4", "D1"};

color C_FONDO   = C'12,14,26';
color C_BORDE   = C'201,168,76';
color C_TEXTO   = C'226,217,200';
color C_APAGADO = C'170,176,196';
color C_BOTON   = C'24,28,44';
color C_ORO     = C'201,168,76';
color C_OSCURO  = C'8,10,18';
color C_VERDE   = C'127,214,160';
color C_ROJO    = C'255,138,122';

//--- Estado
struct Alerta
  {
   int      im;      // índice en MEDIAS
   int      it;      // índice en TFS
   int      lado;    // +1 el precio estaba por encima al crearla, -1 por debajo
   datetime creada;
  };

Alerta g_al[];
int    g_h[4][6];            // handles iMA (se crean al usarlos)
int    g_selM    = 0;        // media elegida
int    g_selT    = 3;        // temporalidad elegida (H1)
bool   g_plegado = false;
bool   g_activo  = true;     // false si ya está en otro gráfico del mismo símbolo
string g_msg     = "";
color  g_msgColor;
bool   g_pruebaHecha = false;
uint   g_ultPanel = 0;
int    g_H = 30;             // alto del panel (para las esquinas de abajo)
string g_forma = "";         // plegado / activo / nº de alertas: si cambia, el cuerpo se rehace

//+------------------------------------------------------------------+
int OnInit()
  {
   IndicatorSetString(INDICATOR_SHORTNAME, NOMBRE);
   for(int i = 0; i < 4; i++)
      for(int j = 0; j < 6; j++)
         g_h[i][j] = INVALID_HANDLE;
   g_msgColor = C_APAGADO;
   if(!MQLInfoInteger(MQL_TESTER) && OtroGrafico())
     {
      g_activo = false;
      g_msg = "Ya está en otro gráfico de " + _Symbol + ": aquí no hace nada.";
      g_msgColor = C_ROJO;
     }
   else
      Cargar();
   Panel();
   EventSetTimer(1);
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   ObjectsDeleteAll(0, PFX);
   for(int i = 0; i < 4; i++)
      for(int j = 0; j < 6; j++)
         if(g_h[i][j] != INVALID_HANDLE)
            IndicatorRelease(g_h[i][j]);
   ChartRedraw();
  }

//+------------------------------------------------------------------+
int OnCalculate(const int rates_total, const int prev_calculated, const datetime &time[],
                const double &open[], const double &high[], const double &low[], const double &close[],
                const long &tick_volume[], const long &volume[], const int &spread[])
  {
   if(MQLInfoInteger(MQL_TESTER) && InpPruebaMedia > 0 && !g_pruebaHecha)
      CrearPrueba();
   Comprobar();
   if(GetTickCount() - g_ultPanel > 500)
      Panel();
   return(rates_total);
  }

//+------------------------------------------------------------------+
void OnTimer()
  {
   Comprobar();
   Panel();
  }

//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(id != CHARTEVENT_OBJECT_CLICK || StringFind(sparam, PFX) != 0)
      return;
   ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
   if(sparam == PFX + "plegar")
      g_plegado = !g_plegado;
   else
      if(!g_activo)
         return;
      else
         if(StringFind(sparam, PFX + "c_m") == 0)
            g_selM = (int)StringToInteger(StringSubstr(sparam, StringLen(PFX + "c_m")));
         else
            if(StringFind(sparam, PFX + "c_t") == 0)
               g_selT = (int)StringToInteger(StringSubstr(sparam, StringLen(PFX + "c_t")));
            else
               if(sparam == PFX + "c_crear")
                  Crear();
               else
                  if(StringFind(sparam, PFX + "c_x") == 0)
                    {
                     int i = (int)StringToInteger(StringSubstr(sparam, StringLen(PFX + "c_x")));
                     if(i >= 0 && i < ArraySize(g_al))
                       {
                        Mensaje("Borrada: " + Nombre(g_al[i].im, g_al[i].it), C_APAGADO);
                        Quitar(i);
                        Guardar();
                       }
                    }
   Panel();
  }

//==================================================================
//  Alertas
//==================================================================
string Nombre(int im, int it) { return "SMA" + IntegerToString(MEDIAS[im]) + " " + TF_TXT[it]; }

string Fmt(double v)
  {
   string s = DoubleToString(v, _Digits);
   StringReplace(s, ".", ",");
   return s;
  }

void Mensaje(string s, color c) { g_msg = s; g_msgColor = c; }

double Tolerancia() { return MathMax(0.0, InpToleranciaPts); }

int Handle(int im, int it)
  {
   if(g_h[im][it] == INVALID_HANDLE)
      g_h[im][it] = iMA(_Symbol, TFS[it], MEDIAS[im], 0, MODE_SMA, PRICE_CLOSE);
   return g_h[im][it];
  }

// Valor de la media en la vela en curso de esa temporalidad.
bool ValorMA(int im, int it, double &v)
  {
   int h = Handle(im, it);
   if(h == INVALID_HANDLE)
      return false;
   double b[];
   if(CopyBuffer(h, 0, 0, 1, b) != 1)
      return false;
   v = b[0];
   return (v > 0 && v != EMPTY_VALUE);
  }

double Precio() { return SymbolInfoDouble(_Symbol, SYMBOL_BID); }

void Crear()
  {
   if(ArraySize(g_al) >= MAX_ALERTAS)
     {
      Mensaje("Máximo " + IntegerToString(MAX_ALERTAS) + " alertas: borra alguna.", C_ROJO);
      return;
     }
   for(int i = 0; i < ArraySize(g_al); i++)
      if(g_al[i].im == g_selM && g_al[i].it == g_selT)
        {
         Mensaje("Ya tienes la alerta " + Nombre(g_selM, g_selT) + ".", C_ROJO);
         return;
        }
   double ma, p = Precio();
   if(p <= 0 || !ValorMA(g_selM, g_selT, ma))
     {
      Mensaje("Aún sin datos de " + Nombre(g_selM, g_selT) + ": prueba en unos segundos.", C_ROJO);
      return;
     }
   int n = ArraySize(g_al);
   ArrayResize(g_al, n + 1);
   g_al[n].im = g_selM;
   g_al[n].it = g_selT;
   g_al[n].lado = (p >= ma) ? 1 : -1;
   g_al[n].creada = TimeCurrent();
   Guardar();
   Mensaje("Creada: " + Nombre(g_selM, g_selT) + " · " + Fmt(ma) + " (precio por " + (p >= ma ? "encima" : "debajo") + ")", C_VERDE);
   Print(NOMBRE, ": alerta creada ", Nombre(g_selM, g_selT), " · media ", Fmt(ma), " · precio ", Fmt(p),
         " · ", (p >= ma ? "por encima" : "por debajo"), " · activas: ", ArraySize(g_al));
  }

void Quitar(int i)
  {
   int n = ArraySize(g_al);
   for(int k = i; k < n - 1; k++)
      g_al[k] = g_al[k + 1];
   ArrayResize(g_al, n - 1);
  }

// En cada tick: ¿ha llegado el precio a la media? (venía de arriba: precio <= media + tolerancia;
// venía de abajo: precio >= media − tolerancia). Si salta: aviso y se borra.
void Comprobar()
  {
   if(!g_activo || ArraySize(g_al) == 0)
      return;
   double p = Precio();
   if(p <= 0)
      return;
   double tol = Tolerancia();
   bool cambio = false;
   for(int i = ArraySize(g_al) - 1; i >= 0; i--)
     {
      double ma;
      if(!ValorMA(g_al[i].im, g_al[i].it, ma))
         continue;
      bool toca = (g_al[i].lado > 0) ? (p <= ma + tol) : (p >= ma - tol);
      if(!toca)
         continue;
      Disparar(g_al[i], p, ma);
      Quitar(i);
      cambio = true;
     }
   if(cambio)
     {
      Guardar();
      Print(NOMBRE, ": alertas activas: ", ArraySize(g_al));
      Panel();
     }
  }

void Disparar(Alerta &a, double p, double ma)
  {
   string txt = _Symbol + " · toca " + Nombre(a.im, a.it) + " · " + Fmt(p);
   Print(NOMBRE, ": SALTA ", txt, " (media ", Fmt(ma), ")");
   if(InpPush && !MQLInfoInteger(MQL_TESTER))
      if(!SendNotification(txt))
         Print(NOMBRE, ": push NO enviado (error ", GetLastError(),
               "). Actívalo en Herramientas > Opciones > Notificaciones con tu MetaQuotes ID.");
   if(InpAlert)
      Alert(txt);
   if(InpSonido)
      PlaySound(InpArchivoSonido);
   Mensaje("Saltó: " + Nombre(a.im, a.it) + " · " + Fmt(p), C_ORO);
  }

// Solo Probador de Estrategias: crea sola una alerta (los clics del panel no llegan en el Probador).
void CrearPrueba()
  {
   int im = -1, it = -1;
   for(int i = 0; i < 4; i++)
      if(MEDIAS[i] == InpPruebaMedia)
         im = i;
   for(int j = 0; j < 6; j++)
      if(TFS[j] == InpPruebaTF)
         it = j;
   if(im < 0 || it < 0)
     {
      Print(NOMBRE, ": PRUEBA no válida (media 20/40/200/600 y temporalidad M1/M5/M15/H1/H4/D1)");
      g_pruebaHecha = true;
      return;
     }
   int antes = ArraySize(g_al);
   g_selM = im;
   g_selT = it;
   Crear();
   if(ArraySize(g_al) > antes)
     {
      g_pruebaHecha = true;
      Print(NOMBRE, ": PRUEBA ", Nombre(im, it), " creada sola en el Probador");
     }
  }

//==================================================================
//  Guardado (MQL5\Files\Aurum_Alertas_<símbolo>.csv)
//==================================================================
string Archivo() { return "Aurum_Alertas_" + _Symbol + ".csv"; }

void Guardar()
  {
   int f = FileOpen(Archivo(), FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(f == INVALID_HANDLE)
     {
      Print(NOMBRE, ": no se pudo guardar ", Archivo(), " (error ", GetLastError(), ")");
      return;
     }
   FileWriteString(f, "# Aurum_Alertas: media;temporalidad;lado (1 = precio encima, -1 = debajo);creada\r\n");
   for(int i = 0; i < ArraySize(g_al); i++)
      FileWriteString(f, IntegerToString(MEDIAS[g_al[i].im]) + ";" + TF_TXT[g_al[i].it] + ";" +
                      IntegerToString(g_al[i].lado) + ";" + IntegerToString((long)g_al[i].creada) + "\r\n");
   FileClose(f);
  }

void Cargar()
  {
   ArrayResize(g_al, 0);
   if(!FileIsExist(Archivo()))
      return;
   int f = FileOpen(Archivo(), FILE_READ | FILE_TXT | FILE_ANSI);
   if(f == INVALID_HANDLE)
     {
      Print(NOMBRE, ": no se pudo leer ", Archivo(), " (error ", GetLastError(), ")");
      return;
     }
   while(!FileIsEnding(f) && ArraySize(g_al) < MAX_ALERTAS)
     {
      string l = FileReadString(f);
      StringTrimLeft(l);
      StringTrimRight(l);
      if(l == "" || StringGetCharacter(l, 0) == '#')
         continue;
      string p[];
      if(StringSplit(l, ';', p) < 3)
         continue;
      int im = -1, it = -1, lado = (int)StringToInteger(p[2]);
      for(int i = 0; i < 4; i++)
         if(IntegerToString(MEDIAS[i]) == p[0])
            im = i;
      for(int j = 0; j < 6; j++)
         if(TF_TXT[j] == p[1])
            it = j;
      if(im < 0 || it < 0 || (lado != 1 && lado != -1))
         continue;
      int n = ArraySize(g_al);
      ArrayResize(g_al, n + 1);
      g_al[n].im = im;
      g_al[n].it = it;
      g_al[n].lado = lado;
      g_al[n].creada = ArraySize(p) > 3 ? (datetime)StringToInteger(p[3]) : TimeCurrent();
     }
   FileClose(f);
   if(ArraySize(g_al) > 0)
      Print(NOMBRE, ": ", ArraySize(g_al), " alertas recuperadas de ", Archivo());
  }

// ¿Está ya en otro gráfico del mismo símbolo? (dos copias = dos avisos por
// alerta). Manda el gráfico con el id más bajo, así al reiniciar MT5 con dos
// copias sigue funcionando una.
bool OtroGrafico()
  {
   long yo = ChartID();
   for(long c = ChartFirst(); c >= 0; c = ChartNext(c))
     {
      if(c >= yo || ChartSymbol(c) != _Symbol)
         continue;
      int ventanas = (int)ChartGetInteger(c, CHART_WINDOWS_TOTAL);
      for(int w = 0; w < ventanas; w++)
         for(int k = ChartIndicatorsTotal(c, w) - 1; k >= 0; k--)
            if(ChartIndicatorName(c, w, k) == NOMBRE)
               return true;
     }
   return false;
  }

//==================================================================
//  Panel
//==================================================================
// Coordenadas dentro del panel (x, y desde su esquina de arriba a la
// izquierda) → distancias a la esquina elegida del gráfico. Los botones y
// etiquetas se anclan siempre por arriba a la izquierda.
void Pos(string n, int x, int y)
  {
   bool der = (InpEsquina == CORNER_RIGHT_UPPER || InpEsquina == CORNER_RIGHT_LOWER);
   bool aba = (InpEsquina == CORNER_LEFT_LOWER || InpEsquina == CORNER_RIGHT_LOWER);
   ObjectSetInteger(0, n, OBJPROP_CORNER, InpEsquina);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, der ? InpX + ANCHO - x : InpX + x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, aba ? InpY + g_H - y : InpY + y);
  }

void Comunes(string n)
  {
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, n, OBJPROP_BACK, false);
  }

void Rect(string n, int x, int y, int w, int h, color fondo, color borde)
  {
   if(ObjectFind(0, n) < 0)
     {
      ObjectCreate(0, n, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      Comunes(n);
      ObjectSetInteger(0, n, OBJPROP_BORDER_TYPE, BORDER_FLAT);
     }
   Pos(n, x, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, fondo);
   ObjectSetInteger(0, n, OBJPROP_COLOR, borde);
  }

void Texto(string n, int x, int y, string t, color c, int tam = 8)
  {
   if(ObjectFind(0, n) < 0)
     {
      ObjectCreate(0, n, OBJ_LABEL, 0, 0, 0);
      Comunes(n);
      ObjectSetInteger(0, n, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
      ObjectSetString(0, n, OBJPROP_FONT, "Arial");
     }
   Pos(n, x, y);
   ObjectSetString(0, n, OBJPROP_TEXT, t);
   ObjectSetInteger(0, n, OBJPROP_COLOR, c);
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, tam);
  }

void Boton(string n, int x, int y, int w, int h, string t, color fondo, color letra)
  {
   if(ObjectFind(0, n) < 0)
     {
      ObjectCreate(0, n, OBJ_BUTTON, 0, 0, 0);
      Comunes(n);
      ObjectSetString(0, n, OBJPROP_FONT, "Arial");
      ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 8);
     }
   Pos(n, x, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetString(0, n, OBJPROP_TEXT, t);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, fondo);
   ObjectSetInteger(0, n, OBJPROP_COLOR, letra);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, C_BORDE);
   ObjectSetInteger(0, n, OBJPROP_STATE, false);
  }

void Panel()
  {
   g_ultPanel = GetTickCount();
   int n = ArraySize(g_al);
   int filaY = 214;
   g_H = g_plegado ? 30 : (g_activo ? filaY + MathMax(1, n) * 22 + 6 : 56);

   Rect(PFX + "fondo", 0, 0, ANCHO, g_H, C_FONDO, C_BORDE);
   Texto(PFX + "titulo", 10, 8, "AURUM · ALERTAS" + (n > 0 ? "  (" + IntegerToString(n) + ")" : ""), C_ORO, 9);
   Boton(PFX + "plegar", ANCHO - 30, 5, 22, 20, g_plegado ? "+" : "–", C_BOTON, C_TEXTO);

   string forma = (g_plegado ? "p" : "d") + (g_activo ? "a" : "i") + IntegerToString(n);
   if(forma != g_forma)
     {
      ObjectsDeleteAll(0, PFX + "c_");   // cambia la estructura: se rehace; si no, se actualiza en su sitio
      g_forma = forma;
     }
   if(g_plegado)
     {
      ChartRedraw();
      return;
     }
   if(!g_activo)
     {
      Texto(PFX + "c_aviso", 10, 32, g_msg, g_msgColor);
      ChartRedraw();
      return;
     }

   Texto(PFX + "c_lm", 10, 32, "Media (simple, sobre cierre)", C_APAGADO);
   for(int i = 0; i < 4; i++)
      Boton(PFX + "c_m" + IntegerToString(i), 10 + i * 68, 48, 64, 22, "SMA " + IntegerToString(MEDIAS[i]),
            i == g_selM ? C_ORO : C_BOTON, i == g_selM ? C_OSCURO : C_TEXTO);

   Texto(PFX + "c_lt", 10, 78, "Temporalidad", C_APAGADO);
   for(int j = 0; j < 6; j++)
      Boton(PFX + "c_t" + IntegerToString(j), 10 + j * 45, 94, 42, 22, TF_TXT[j],
            j == g_selT ? C_ORO : C_BOTON, j == g_selT ? C_OSCURO : C_TEXTO);

   double p = Precio(), ma;
   string ahora = "Ahora " + Nombre(g_selM, g_selT) + ": sin datos todavía";
   if(ValorMA(g_selM, g_selT, ma) && p > 0)
      ahora = Nombre(g_selM, g_selT) + " = " + Fmt(ma) + " · precio " + Fmt(p) + (p >= ma ? " (encima)" : " (debajo)");
   Texto(PFX + "c_ahora", 10, 124, ahora, C_TEXTO);

   Boton(PFX + "c_crear", 10, 144, ANCHO - 20, 24, "Crear alerta", C_ORO, C_OSCURO);
   Texto(PFX + "c_msg", 10, 174, g_msg, g_msgColor);

   Texto(PFX + "c_la", 10, 194, "Alertas activas" + (InpToleranciaPts > 0 ? " · tolerancia " + Fmt(InpToleranciaPts) + " pts" : ""), C_APAGADO);
   if(n == 0)
      Texto(PFX + "c_ninguna", 10, filaY, "Ninguna", C_APAGADO);
   for(int k = 0; k < n; k++)
     {
      double v;
      string t = Nombre(g_al[k].im, g_al[k].it) + " · " +
                 (ValorMA(g_al[k].im, g_al[k].it, v) ? Fmt(v) + " ahora" : "sin datos") +
                 (g_al[k].lado > 0 ? " · desde arriba" : " · desde abajo");
      Texto(PFX + "c_f" + IntegerToString(k), 10, filaY + k * 22 + 3, t, C_TEXTO);
      Boton(PFX + "c_x" + IntegerToString(k), ANCHO - 32, filaY + k * 22, 22, 18, "X", C_BOTON, C_ROJO);
     }
   ChartRedraw();
  }
//+------------------------------------------------------------------+
