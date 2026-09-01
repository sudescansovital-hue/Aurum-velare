//+------------------------------------------------------------------+
//|                                            RSI_Aurum_Dual.mq5      |
//|  RSI 14 (celeste) + RSI 5 (amarillo) + Media sobre RSI14, todo    |
//|  en el mismo panel, como en TradingView.                          |
//+------------------------------------------------------------------+
#property indicator_separate_window
#property indicator_buffers 3
#property indicator_plots   3

//--- Buffer 1: RSI 14 (celeste)
#property indicator_label1  "RSI 14"
#property indicator_type1   DRAW_LINE
#property indicator_color1  clrDeepSkyBlue
#property indicator_style1  STYLE_SOLID
#property indicator_width1  2

//--- Buffer 2: RSI 5 (amarillo)
#property indicator_label2  "RSI 5"
#property indicator_type2   DRAW_LINE
#property indicator_color2  clrYellow
#property indicator_style2  STYLE_SOLID
#property indicator_width2  1

//--- Buffer 3: Media sobre RSI 14
#property indicator_label3  "Media RSI14"
#property indicator_type3   DRAW_LINE
#property indicator_color3  clrOrange
#property indicator_style3  STYLE_SOLID
#property indicator_width3  1

//--- Niveles horizontales por defecto: 19/30/33/45/65/70/90
//    El color individual de cada uno se fija en OnInit() más abajo,
//    porque #property indicator_levelcolor NO admite una lista por nivel
//    en MQL5 (solo un color único) — usarlo así hacía que todos salieran
//    del mismo color.
#property indicator_level1  19
#property indicator_level2  30
#property indicator_level3  33
#property indicator_level4  45
#property indicator_level5  65
#property indicator_level6  70
#property indicator_level7  90
#property indicator_levelstyle STYLE_DOT

#property indicator_minimum 0
#property indicator_maximum 100

//--- Inputs
input int    InpRSI14Period = 14;             // Periodo RSI largo
input int    InpRSI5Period  = 5;              // Periodo RSI corto
input int    InpMAPeriod    = 14;             // Periodo de la media sobre el RSI14
input ENUM_MA_METHOD InpMAMethod = MODE_SMA;  // Método de la media (SMA como en TV)
input ENUM_APPLIED_PRICE InpAppliedPrice = PRICE_CLOSE; // Precio aplicado

//--- Buffers
double BufRSI14[];
double BufRSI5[];
double BufMA[];

//--- Handles de los indicadores internos
int hRSI14, hRSI5;

//+------------------------------------------------------------------+
int OnInit()
  {
   SetIndexBuffer(0, BufRSI14, INDICATOR_DATA);
   SetIndexBuffer(1, BufRSI5,  INDICATOR_DATA);
   SetIndexBuffer(2, BufMA,    INDICATOR_DATA);

   ArraySetAsSeries(BufRSI14, true);
   ArraySetAsSeries(BufRSI5,  true);
   ArraySetAsSeries(BufMA,    true);

   hRSI14 = iRSI(NULL, 0, InpRSI14Period, InpAppliedPrice);
   hRSI5  = iRSI(NULL, 0, InpRSI5Period,  InpAppliedPrice);

   if(hRSI14 == INVALID_HANDLE || hRSI5 == INVALID_HANDLE)
     {
      Print("Error creando handles de RSI");
      return(INIT_FAILED);
     }

   IndicatorSetString(INDICATOR_SHORTNAME, "RSI Aurum Dual (14/5 + MA)");

   //--- Color individual de cada nivel (esto SÍ funciona por nivel en MQL5,
   //    a diferencia de #property indicator_levelcolor que solo admite uno).
   //    Orden: 19-verde, 30-blanco, 33-rojo, 45-naranja, 65-verde, 70-blanco, 90-rojo.
   //    Puedes seguir editándolos a mano desde la pestaña "Niveles"; el cambio
   //    se mantiene mientras no recompiles o vuelvas a insertar el indicador,
   //    momento en el que se reaplican estos valores de fábrica.
   IndicatorSetInteger(INDICATOR_LEVELCOLOR, 0, clrLimeGreen); // 19
   IndicatorSetInteger(INDICATOR_LEVELCOLOR, 1, clrWhite);     // 30
   IndicatorSetInteger(INDICATOR_LEVELCOLOR, 2, clrRed);       // 33
   IndicatorSetInteger(INDICATOR_LEVELCOLOR, 3, clrOrange);    // 45
   IndicatorSetInteger(INDICATOR_LEVELCOLOR, 4, clrLimeGreen); // 65
   IndicatorSetInteger(INDICATOR_LEVELCOLOR, 5, clrWhite);     // 70
   IndicatorSetInteger(INDICATOR_LEVELCOLOR, 6, clrRed);       // 90

   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   IndicatorRelease(hRSI14);
   IndicatorRelease(hRSI5);
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
                 const int &spread[])
  {
   if(rates_total < InpRSI14Period + InpMAPeriod)
      return(0);

   //--- Copiar valores de RSI14 y RSI5
   int copyCount = rates_total - prev_calculated + InpMAPeriod + 5;
   if(copyCount > rates_total) copyCount = rates_total;

   if(CopyBuffer(hRSI14, 0, 0, copyCount, BufRSI14) <= 0) return(0);
   if(CopyBuffer(hRSI5,  0, 0, copyCount, BufRSI5)  <= 0) return(0);

   //--- Calcular la media (SMA) sobre el buffer de RSI14, tal como haría
   //    "Apply to: Previous Indicator's Data" en MT5
   int limit = copyCount - InpMAPeriod;
   for(int i = 0; i < limit; i++)
     {
      double sum = 0;
      for(int j = 0; j < InpMAPeriod; j++)
         sum += BufRSI14[i + j];
      BufMA[i] = sum / InpMAPeriod;
     }

   return(rates_total);
  }
//+------------------------------------------------------------------+
