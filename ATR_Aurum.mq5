//+------------------------------------------------------------------+
//|                                              ATR_Aurum.mq5         |
//|  ATR período 14, en su propia ventana. Buffer único para que el   |
//|  EA lo pueda leer con iCustom(..., "ATR_Aurum", 14, 0, 0).        |
//|  La línea de tendencia morada de tu plantilla es un objeto        |
//|  dibujado a mano — sigue haciéndolo igual que siempre encima.     |
//+------------------------------------------------------------------+
#property indicator_separate_window
#property indicator_buffers 1
#property indicator_plots   1

#property indicator_label1  "ATR"
#property indicator_type1   DRAW_LINE
#property indicator_color1  clrDeepSkyBlue
#property indicator_style1  STYLE_SOLID
#property indicator_width1  1

input int InpATRPeriod = 14;   // Período ATR

double BufATR[];
int hATR;

//+------------------------------------------------------------------+
int OnInit()
  {
   SetIndexBuffer(0, BufATR, INDICATOR_DATA);
   ArraySetAsSeries(BufATR, true);

   hATR = iATR(NULL, 0, InpATRPeriod);
   if(hATR == INVALID_HANDLE)
     {
      Print("Error creando handle de ATR");
      return(INIT_FAILED);
     }

   IndicatorSetString(INDICATOR_SHORTNAME, StringFormat("ATR Aurum (%d)", InpATRPeriod));
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   IndicatorRelease(hATR);
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

   if(CopyBuffer(hATR, 0, 0, copyCount, BufATR) <= 0) return(0);

   return(rates_total);
  }
//+------------------------------------------------------------------+
