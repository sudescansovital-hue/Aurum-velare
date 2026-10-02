-- post_cierre criterios v5 (02/10): precio al final de la ventana post-cierre
-- Cierre de la última vela M1 de la ventana post-cierre (máx. 4 h de mercado).
-- Lo usa el Diario para "vuelta de posición": qué habría pasado manteniendo el
-- primer trade hasta su SL o TP original; si no toca ninguno en la ventana, se
-- cierra a este precio. El resto (vueltas, entradas seguidas, los 15 min) se
-- calcula en el front con columnas que ya existen.
-- Solo añade una columna: no toca datos ni el resto del esquema.

ALTER TABLE post_cierre_analisis
  ADD COLUMN IF NOT EXISTS precio_fin_ventana NUMERIC;

NOTIFY pgrst, 'reload schema';

-- Verificación: debe salir 1 fila
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'post_cierre_analisis' AND column_name = 'precio_fin_ventana';
