-- post_cierre criterios v8 (05/10): "SI LA HUBIERAS DEJADO CORRER"
-- Para cada trade cerrado A MANO (con o sin TP; incluye el resto de los
-- runners cerrado a mano), se sigue el precio con velas M1 desde el cierre
-- hasta que toca primero el TP o el SL que tenía EN EL MOMENTO DEL CIERRE,
-- con un tope de 5 días de MERCADO (5 × 1.440 = 7.200 velas M1 reales; fines
-- de semana y cortes diarios no cuentan, igual que la ventana de 4 h).
-- Reglas: TP y SL en la misma vela M1 -> cuenta como SL (dejar_correr_ambiguo);
-- hueco de apertura que salta el TP -> salida en el nivel del TP; hueco que
-- salta el SL -> salida al precio de apertura de esa vela, como lo ejecutaría
-- el bróker (dejar_correr_hueco).
-- $ = lotes cerrados en el cierre final × (salida hipotética − cierre real) ×
-- 100, con signo a favor del trade; es lo que habrías ganado DE MÁS (o de
-- menos) frente a lo real. Sin comisiones ni swap. NULL si no se sabe el
-- volumen (trades con parcial anteriores al ~27/08).
-- dejar_correr = NULL en los trades que no aplican (cerrados por SL o TP).
-- Solo añade columnas: no toca datos ni el resto del esquema.

ALTER TABLE post_cierre_analisis
  ADD COLUMN IF NOT EXISTS dejar_correr                 BOOLEAN,      -- TRUE = aplica (cierre a mano)
  ADD COLUMN IF NOT EXISTS dejar_correr_sl              NUMERIC,      -- SL en vigor al cerrar
  ADD COLUMN IF NOT EXISTS dejar_correr_tp              NUMERIC,      -- TP en vigor al cerrar (NULL = sin TP)
  ADD COLUMN IF NOT EXISTS dejar_correr_resultado       TEXT,         -- tp / sl / ninguno / en_curso / sin_datos
  ADD COLUMN IF NOT EXISTS dejar_correr_en              TIMESTAMPTZ,  -- cuándo tocó (o fin del tope)
  ADD COLUMN IF NOT EXISTS dejar_correr_precio          NUMERIC,      -- precio de la salida hipotética
  ADD COLUMN IF NOT EXISTS dejar_correr_pts             NUMERIC,      -- pts de esa salida desde la entrada (+ a favor)
  ADD COLUMN IF NOT EXISTS dejar_correr_min_mercado     INTEGER,      -- minutos de mercado desde el cierre
  ADD COLUMN IF NOT EXISTS dejar_correr_vol             NUMERIC,      -- lotes cerrados en el cierre final
  ADD COLUMN IF NOT EXISTS dejar_correr_usd_extra       NUMERIC,      -- $ de más (+) o de menos (−) frente a lo real
  ADD COLUMN IF NOT EXISTS dejar_correr_ambiguo         BOOLEAN,      -- TP y SL en la misma vela (contado como SL)
  ADD COLUMN IF NOT EXISTS dejar_correr_hueco           BOOLEAN;      -- salida por hueco de apertura

ALTER TABLE post_cierre_analisis
  DROP CONSTRAINT IF EXISTS post_cierre_analisis_dejar_correr_resultado_check;
ALTER TABLE post_cierre_analisis
  ADD CONSTRAINT post_cierre_analisis_dejar_correr_resultado_check
  CHECK (dejar_correr_resultado IS NULL
         OR dejar_correr_resultado IN ('tp', 'sl', 'ninguno', 'en_curso', 'sin_datos'));

NOTIFY pgrst, 'reload schema';

-- Verificación: deben salir 12 filas (columnas) + 1 fila (restricción)
SELECT 'columna' AS tipo, column_name AS nombre, data_type AS detalle
FROM information_schema.columns
WHERE table_name = 'post_cierre_analisis' AND column_name LIKE 'dejar_correr%'
UNION ALL
SELECT 'restriccion', conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'post_cierre_analisis_dejar_correr_resultado_check'
ORDER BY 1, 2;
