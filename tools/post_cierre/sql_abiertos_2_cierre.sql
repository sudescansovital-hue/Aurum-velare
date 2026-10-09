-- PROPUESTA (09/10), NO APLICADA: marcar como cerrados los trades que
-- ea_trades tiene como 'open' pero que en realidad se cerraron (EA anterior a
-- la 1.04, cuentas que ya no se usan). Ver ESTADO.md, "Abiertos falsos".
--
-- ANTES: ejecutar sql_abiertos_1_consulta.sql (consulta 3) y revisar la lista.
-- No se borra nada: el paso 0 guarda una copia de todas las filas 'open' y el
-- paso 3 lo deshace. Capturas, notas y eventos van por fp y no se tocan.
--
-- Qué ve cada pantalla (todas piden estado = 'closed' Y fecha_cierre no nula:
-- Diario, Etapas, días limpios, análisis post-cierre):
--   Opción A (cierre con datos de `trades`): el trade pasa a cerrado CON su
--     precio, beneficio y hora de cierre => entra en el Diario como "Pendiente
--     de análisis", en las Etapas/días limpios de su fecha, y post_cierre.py
--     lo analizará en la siguiente pasada (necesita las velas de MT5 de esa
--     fecha; hay desde el 25/06). Si la cuenta ya no es tuya, saldrá en la
--     pestaña Global del Diario.
--   Opción B (cierre sin datos): estado = 'closed' con fecha_cierre NULL =>
--     deja de salir como abierto y NO entra en ninguna pantalla ni en el
--     análisis. Para los que no tienen cierre en `trades` o son de cuentas
--     que ya no usas.
-- Se pueden usar las dos: A primero (los que tienen pruebas) y B para el resto.

-- 0) Copia de seguridad de TODAS las filas 'open' (solo la primera vez: si la
--    tabla ya existe, no se vuelve a crear y se conserva la copia original).
CREATE TABLE IF NOT EXISTS ea_trades_abiertos_bak_20261009 AS
  SELECT * FROM ea_trades WHERE estado = 'open';

-- 1) Opción A — vista previa (solo lectura): los 'open' cuyo fp está en
--    `trades` con precio de cierre.
SELECT e.usuario_email, e.position_id, e.fp, e.cuenta_numero, e.fecha_entrada,
       t.precio_cierre, t.beneficio, t.dur_min,
       e.fecha_entrada::timestamptz + make_interval(mins => coalesce(t.dur_min, 0)) AS fecha_cierre_nueva
FROM ea_trades e
JOIN trades t ON t.fp = e.fp AND t.usuario_email = e.usuario_email
WHERE e.estado = 'open' AND t.precio_cierre IS NOT NULL
ORDER BY e.fecha_entrada;

-- 1b) Opción A — aplicar (quitar los "-- " de delante para ejecutarlo):
-- UPDATE ea_trades e
--    SET estado        = 'closed',
--        precio_cierre = t.precio_cierre,
--        beneficio     = t.beneficio,
--        fecha_cierre  = e.fecha_entrada::timestamptz + make_interval(mins => coalesce(t.dur_min, 0))
--   FROM trades t
--  WHERE t.fp = e.fp AND t.usuario_email = e.usuario_email
--    AND e.estado = 'open' AND t.precio_cierre IS NOT NULL;

-- 2) Opción B — vista previa (solo lectura): los 'open' que siguen abiertos y
--    son de una cuenta que ya no es Maestra / Prueba / Retos del usuario, o
--    de antes del 05/10/2026 (despliegue de la EA 1.04, que ya reconcilia
--    cierres). CAMBIAR la fecha o añadir "AND e.position_id IN (...)" si en la
--    consulta 3 sale alguno que de verdad siga abierto.
SELECT e.usuario_email, e.position_id, e.fp, e.cuenta_numero, e.fecha_entrada
FROM ea_trades e
LEFT JOIN usuarios_aurum u ON u.email = e.usuario_email
WHERE e.estado = 'open'
  AND (e.cuenta_numero NOT IN (coalesce(u.cuenta_maestra::text, '-'), coalesce(u.cuenta_prueba::text, '-'),
                               coalesce(u.cuenta_retos::text, '-'))
       OR e.fecha_entrada::timestamptz < timestamptz '2026-10-05 00:00+00')
ORDER BY e.fecha_entrada;

-- 2b) Opción B — aplicar (quitar los "-- "; mismas condiciones que la vista previa):
-- UPDATE ea_trades e
--    SET estado = 'closed'
--   FROM usuarios_aurum u
--  WHERE u.email = e.usuario_email
--    AND e.estado = 'open'
--    AND (e.cuenta_numero NOT IN (coalesce(u.cuenta_maestra::text, '-'), coalesce(u.cuenta_prueba::text, '-'),
--                                 coalesce(u.cuenta_retos::text, '-'))
--         OR e.fecha_entrada::timestamptz < timestamptz '2026-10-05 00:00+00');

-- 3) DESHACER (A y/o B): devuelve estado y datos de cierre a como estaban en
--    la copia del paso 0. Solo afecta a filas de la copia.
-- UPDATE ea_trades e
--    SET estado = b.estado, precio_cierre = b.precio_cierre, beneficio = b.beneficio, fecha_cierre = b.fecha_cierre
--   FROM ea_trades_abiertos_bak_20261009 b
--  WHERE e.position_id = b.position_id;

-- 4) Comprobación (solo lectura): cuántos 'open' quedan y cuántos hay en la copia.
-- SELECT (SELECT count(*) FROM ea_trades WHERE estado = 'open') AS abiertos_ahora,
--        (SELECT count(*) FROM ea_trades_abiertos_bak_20261009) AS en_la_copia;
