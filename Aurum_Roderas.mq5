//+------------------------------------------------------------------+
//|                                             Aurum_Roderas.mq5      |
//|  Medias móviles simples (20 azul, 40 roja, 200 dorada, 600 morada) |
//|  + Bandas de Bollinger (20, desv 2.0, sobre Close, Ivory).         |
//|  Gráfico principal. Cada línea es un buffer independiente para    |
//|  que el EA las pueda leer con iCustom(..., "Aurum_Roderas", ...)  |
//+------------------------------------------------------------------+
#property indicator_chart_window
#property indicator_buffers 7
#property indicator_plots   7

//--- MA 1 (20, azul)
#property indicator_label1  "MA20"
#property indicator_type1   DRAW_LINE
#property indicator_color1  clrDodgerBlue
#property indicator_style1  STYLE_SOLID
#property indicator_width1  1

//--- MA 2 (40, roja)
#property indicator_label2  "MA40"
#property indicator_type2   DRAW_LINE
#property indicator_color2  clrRed
#property indicator_style2  STYLE_SOLID
#property indicator_width2  1

//--- MA 3 (200, dorada)
#property indicator_label3  "MA200"
#property indicator_type3   DRAW_LINE
#property indicator_color3  clrGold
#property indicator_style3  STYLE_SOLID
#property indicator_width3  1

//--- MA 4 (600, morada)
#property indicator_label4  "MA600"
#property indicator_type4   DRAW_LINE
#property indicator_color4  clrPurple
#property indicator_style4  STYLE_SOLID
#property indicator_width4  1

//--- Bollinger: banda superior
#property indicator_label5  "BB Superior"
#property indicator_type5   DRAW_LINE
#property indicator_color5  clrIvory
#property indicator_style5  STYLE_SOLID
#property indicator_width5  1

//--- Bollinger: banda media
#property indicator_label6  "BB Media"
#property indicator_type6   DRAW_LINE
#property indicator_color6  clrIvory
#property indicator_style6  STYLE_SOLID
#property indicator_width6  1

//--- Bollinger: banda inferior
#property indicator_label7  "BB Inferior"
#property indicator_type7   DRAW_LINE
#property indicator_color7  clrIvory
#property indicator_style7  STYLE_SOLID
#property indicator_width7  1

//--- Inputs: medias (todas a cierre)
input int    InpPeriodMA1 = 20;   // Período MA1 (azul)
input int    InpPeriodMA2 = 40;   // Período MA2 (roja)
input int    InpPeriodMA3 = 200;  // Período MA3 (dorada)
input int    InpPeriodMA4 = 600;  // Período MA4 (morada)

//--- Inputs: Bollinger, igual que tu configuración actual
input int    InpBBPeriod    = 20;             // Período Bollinger
input double InpBBDeviation = 2.0;            // Desviaciones estándar
input ENUM_APPLIED_PRICE InpBBAppliedPrice = PRICE_CLOSE; // Aplicado a

//--- Buffers
double BufMA1[];
double BufMA2[];
double BufMA3[];
double BufMA4[];
double BufBBUpper[];
double BufBBMiddle[];
double BufBBLower[];

//--- Handles internos
int hMA1, hMA2, hMA3, hMA4, hBB;

//+------------------------------------------------------------------+
int OnInit()
  {
   SetIndexBuffer(0, BufMA1,     INDICATOR_DATA);
   SetIndexBuffer(1, BufMA2,     INDICATOR_DATA);
   SetIndexBuffer(2, BufMA3,     INDICATOR_DATA);
   SetIndexBuffer(3, BufMA4,     INDICATOR_DATA);
   SetIndexBuffer(4, BufBBUpper, INDICATOR_DATA);
   SetIndexBuffer(5, BufBBMiddle,INDICATOR_DATA);
   SetIndexBuffer(6, BufBBLower, INDICATOR_DATA);

   ArraySetAsSeries(BufMA1, true);
   ArraySetAsSeries(BufMA2, true);
   ArraySetAsSeries(BufMA3, true);
   ArraySetAsSeries(BufMA4, true);
   ArraySetAsSeries(BufBBUpper, true);
   ArraySetAsSeries(BufBBMiddle, true);
   ArraySetAsSeries(BufBBLower, true);

   hMA1 = iMA(NULL, 0, InpPeriodMA1, 0, MODE_SMA, PRICE_CLOSE);
   hMA2 = iMA(NULL, 0, InpPeriodMA2, 0, MODE_SMA, PRICE_CLOSE);
   hMA3 = iMA(NULL, 0, InpPeriodMA3, 0, MODE_SMA, PRICE_CLOSE);
   hMA4 = iMA(NULL, 0, InpPeriodMA4, 0, MODE_SMA, PRICE_CLOSE);
   hBB  = iBands(NULL, 0, InpBBPeriod, 0, InpBBDeviation, InpBBAppliedPrice);

   if(hMA1 == INVALID_HANDLE || hMA2 == INVALID_HANDLE || hMA3 == INVALID_HANDLE ||
      hMA4 == INVALID_HANDLE || hBB == INVALID_HANDLE)
     {
      Print("Error creando handles en Aurum_Roderas");
      return(INIT_FAILED);
     }

   IndicatorSetString(INDICATOR_SHORTNAME,
      StringFormat("Aurum Roderas (MA %d/%d/%d/%d + BB %d,%.1f)",
         InpPeriodMA1, InpPeriodMA2, InpPeriodMA3, InpPeriodMA4,
         InpBBPeriod, InpBBDeviation));

   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   IndicatorRelease(hMA1);
   IndicatorRelease(hMA2);
   IndicatorRelease(hMA3);
   IndicatorRelease(hMA4);
   IndicatorRelease(hBB);
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
   int copyCount = rates_total - prev_calculated + 5;
   if(copyCount > rates_total) copyCount = rates_total;
   if(copyCount <= 0) return(rates_total);

   if(CopyBuffer(hMA1, 0, 0, copyCount, BufMA1) <= 0) return(0);
   if(CopyBuffer(hMA2, 0, 0, copyCount, BufMA2) <= 0) return(0);
   if(CopyBuffer(hMA3, 0, 0, copyCount, BufMA3) <= 0) return(0);
   if(CopyBuffer(hMA4, 0, 0, copyCount, BufMA4) <= 0) return(0);

   //--- iBands: buffer 0 = media (BASE_LINE), 1 = superior (UPPER_BAND), 2 = inferior (LOWER_BAND)
   if(CopyBuffer(hBB, 0, 0, copyCount, BufBBMiddle) <= 0) return(0);
   if(CopyBuffer(hBB, 1, 0, copyCount, BufBBUpper)  <= 0) return(0);
   if(CopyBuffer(hBB, 2, 0, copyCount, BufBBLower)  <= 0) return(0);

   return(rates_total);
  }
//+------------------------------------------------------------------+
