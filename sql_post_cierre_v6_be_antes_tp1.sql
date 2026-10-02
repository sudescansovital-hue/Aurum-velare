-- post_cierre criterios v6 (02/10): "BE antes de TP1" (error de regla)
-- El SL se movió a proteger la entrada (±1 pt o mejor) con el trade abierto
-- antes de que el precio llegara a +TP1 desde la entrada (11 pts estructura,
-- 7 rechazo_rsi; TP1_PTS_POR_ESTRATEGIA en post_cierre.py). Si se protege en
-- el mismo minuto en que se alcanza el TP1 no se marca (orden desconocido).
-- Sin clasificar no se evalúa (NULL).
-- be_antes_tp1_favor_pts: máximo a favor antes de proteger; NULL si se
-- protegió dentro del primer minuto ("nada más entrar").
-- Solo añade columnas: no toca datos ni el resto del esquema.

ALTER TABLE post_cierre_analisis
  ADD COLUMN IF NOT EXISTS be_antes_tp1            BOOLEAN,
  ADD COLUMN IF NOT EXISTS be_antes_tp1_en         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS be_antes_tp1_favor_pts  NUMERIC;

NOTIFY pgrst, 'reload schema';

-- Verificación: deben salir 3 filas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'post_cierre_analisis' AND column_name LIKE 'be_antes_tp1%'
ORDER BY column_name;
