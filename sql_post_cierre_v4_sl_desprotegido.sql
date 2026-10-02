-- post_cierre criterios v4 (02/10): "SL desprotegido"
-- El SL protegía la entrada (±1 pt o mejor, mismo criterio que el TP1) y un
-- cambio posterior, con el trade abierto, lo alejó sin protegerla. Se guarda el
-- primer episodio y cuántos hubo; sl_protegido_habria_salido = después de
-- desproteger, el precio llegó al nivel protegido antes del cierre (con el SL
-- protegido habría salido en BE o mejor).
-- Solo añade columnas: no toca datos ni el resto del esquema.

ALTER TABLE post_cierre_analisis
  ADD COLUMN IF NOT EXISTS sl_desprotegido             BOOLEAN,
  ADD COLUMN IF NOT EXISTS sl_n_desprotecciones        INT,
  ADD COLUMN IF NOT EXISTS sl_protegido_en             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sl_nivel_protegido          NUMERIC,
  ADD COLUMN IF NOT EXISTS sl_desprotegido_en          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sl_nivel_desprotegido       NUMERIC,
  ADD COLUMN IF NOT EXISTS sl_protegido_habria_salido  BOOLEAN;

NOTIFY pgrst, 'reload schema';

-- Verificación: deben salir 7 filas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'post_cierre_analisis'
  AND column_name IN ('sl_desprotegido', 'sl_n_desprotecciones', 'sl_protegido_en', 'sl_nivel_protegido',
                      'sl_desprotegido_en', 'sl_nivel_desprotegido', 'sl_protegido_habria_salido')
ORDER BY column_name;
