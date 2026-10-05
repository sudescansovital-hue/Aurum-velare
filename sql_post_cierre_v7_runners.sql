-- post_cierre criterios v7 (05/10): RUNNERS
-- Trades con parcial: lo que se dejó abierto tras la PRIMERA parcial.
-- runner = TRUE si el SL protegía la entrada (±1 pt o mejor) al hacer la
-- parcial o en los 15 min siguientes (RUNNER_VENTANA_PROTECCION_MIN en
-- post_cierre.py); FALSE si hubo parcial pero el resto quedó sin proteger;
-- NULL si no hubo parcial.
-- Pts siempre desde la entrada, a favor = positivo. $ = pts × 100 × lotes,
-- sin comisiones ni swap; NULL si la EA no mandó el volumen restante (eventos
-- anteriores al ~27/08).
-- Solo añade columnas: no toca datos ni el resto del esquema.

ALTER TABLE post_cierre_analisis
  ADD COLUMN IF NOT EXISTS runner                   BOOLEAN,
  ADD COLUMN IF NOT EXISTS runner_parcial_en        TIMESTAMPTZ,  -- primera parcial
  ADD COLUMN IF NOT EXISTS runner_parcial_pts       NUMERIC,      -- pts de la primera parcial
  ADD COLUMN IF NOT EXISTS runner_n_parciales       INTEGER,
  ADD COLUMN IF NOT EXISTS runner_vol_resto         NUMERIC,      -- lotes que quedaron tras la primera parcial
  ADD COLUMN IF NOT EXISTS runner_sl_pts            NUMERIC,      -- SL del resto (pts desde la entrada)
  ADD COLUMN IF NOT EXISTS runner_max_pts           NUMERIC,      -- máximo a favor tras la parcial
  ADD COLUMN IF NOT EXISTS runner_max_en            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS runner_salida_pts        NUMERIC,      -- salida media ponderada del resto
  ADD COLUMN IF NOT EXISTS runner_minutos           INTEGER,      -- de la primera parcial al cierre
  ADD COLUMN IF NOT EXISTS runner_usd               NUMERIC,      -- lo que aportó el resto
  ADD COLUMN IF NOT EXISTS runner_usd_todo_parcial  NUMERIC;      -- el resto cerrado en la primera parcial

NOTIFY pgrst, 'reload schema';

-- Verificación: deben salir 12 filas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'post_cierre_analisis' AND column_name LIKE 'runner%'
ORDER BY column_name;
