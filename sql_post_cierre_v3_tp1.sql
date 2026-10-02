-- post_cierre criterios v3 (02/10): "TP1 no asegurado"
-- El precio llegó a +TP1 desde la entrada (11 pts estructura, 7 rechazo_rsi;
-- configurable en TP1_PTS_POR_ESTRATEGIA de post_cierre.py) y después volvió a
-- la entrada sin parcial y con el SL sin proteger la entrada en ese momento.
-- Estrategias sin TP1 (sin clasificar) quedan con las 5 columnas a NULL.
-- Solo añade columnas: no toca datos ni el resto del esquema.

ALTER TABLE post_cierre_analisis
  ADD COLUMN IF NOT EXISTS tp1_pts           NUMERIC,      -- TP1 usado (pts desde la entrada)
  ADD COLUMN IF NOT EXISTS tp1_alcanzado     BOOLEAN,
  ADD COLUMN IF NOT EXISTS tp1_alcanzado_en  TIMESTAMPTZ,  -- primera vela M1 que llegó a +TP1
  ADD COLUMN IF NOT EXISTS tp1_volvio_en     TIMESTAMPTZ,  -- primera vela posterior que volvió a la entrada
  ADD COLUMN IF NOT EXISTS tp1_no_asegurado  BOOLEAN;

NOTIFY pgrst, 'reload schema';

-- Verificación: deben salir 5 filas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'post_cierre_analisis' AND column_name LIKE 'tp1%'
ORDER BY column_name;
