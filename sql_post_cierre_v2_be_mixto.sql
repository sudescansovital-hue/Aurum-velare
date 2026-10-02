-- post_cierre criterios v2 (02/10): nuevo be_efecto 'mixto_te_saco_de_un_recorrido'
-- Tras salir en breakeven, si el precio fue 5+ pts a favor y DESPUÉS tocó el SL
-- original. Los pts a favor antes del SL se guardan en pts_favor_antes_sl
-- (misma columna que los cierres a mano 'mixto').
--
-- El CHECK se creó inline en sql_post_cierre.sql, así que Postgres lo llamó
-- post_cierre_analisis_be_efecto_check. La verificación final debe devolver
-- UNA sola fila con el valor nuevo; si salen dos, el DROP no encontró el
-- nombre y el CHECK viejo seguiría rechazando el valor nuevo.

ALTER TABLE post_cierre_analisis DROP CONSTRAINT IF EXISTS post_cierre_analisis_be_efecto_check;

ALTER TABLE post_cierre_analisis ADD CONSTRAINT post_cierre_analisis_be_efecto_check
  CHECK (be_efecto IN ('na', 'te_salvo', 'mixto_te_saco_de_un_recorrido',
                       'te_saco_de_un_ganador', 'sin_efecto'));

NOTIFY pgrst, 'reload schema';

-- Verificación: una sola fila, con mixto_te_saco_de_un_recorrido en la definición
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'post_cierre_analisis'::regclass
  AND pg_get_constraintdef(oid) LIKE '%be_efecto%';
