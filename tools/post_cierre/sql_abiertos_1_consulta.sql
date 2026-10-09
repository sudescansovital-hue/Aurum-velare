-- SOLO LECTURA (09/10). No cambia nada: solo SELECT.
-- Para el SQL Editor de Supabase. Tres consultas; ejecutarlas de una en una.
-- Ver ESTADO.md, "Trades abiertos en el Diario (09/10)".

-- 1) Capturas y notas ya guardadas: a qué fp están enlazadas y si ese fp es
--    de un trade de la EA (y en qué estado). post_cierre_analisis toma el fp
--    de ea_trades (api/post-cierre.js rechaza cualquier fp que no esté en
--    ea_trades), así que si `en_ea_trades` es true, el análisis llegará con
--    ESE MISMO fp y las capturas seguirán enlazadas.
SELECT x.que, x.usuario_email, x.fp, x.hueco, x.cuando,
       e.position_id, e.cuenta_numero, e.estado, e.fecha_entrada, e.fecha_cierre,
       (e.fp IS NOT NULL)  AS en_ea_trades,
       (a.fp IS NOT NULL)  AS ya_analizado
FROM (
  SELECT 'captura' AS que, usuario_email, fp, hueco, capturado_en AS cuando FROM trade_capturas
  UNION ALL
  SELECT 'nota', usuario_email, fp, NULL, updated_at FROM trade_nota
) x
LEFT JOIN ea_trades e            ON e.fp = x.fp AND e.usuario_email = x.usuario_email
LEFT JOIN post_cierre_analisis a ON a.fp = x.fp AND a.usuario_email = x.usuario_email
ORDER BY x.cuando DESC;

-- 2) fp repetidos en ea_trades (deberían ser 0 filas: si hubiera, una captura
--    podría quedar enlazada a dos trades).
SELECT usuario_email, fp, count(*) AS filas, array_agg(position_id) AS posiciones
FROM ea_trades
GROUP BY usuario_email, fp
HAVING count(*) > 1;

-- 3) Todos los trades que ea_trades tiene como 'open', con las pistas de si
--    en realidad están cerrados:
--    - cuenta_activa: la cuenta es hoy Maestra / Prueba / Retos del usuario.
--    - trades_*: el mismo fp está en `trades` (historial importado de MT5 o la
--      propia EA) => ese trade SE CERRÓ, y ahí está su precio de cierre, su
--      beneficio y su duración.
--    - eventos: lo último que mandó la EA de ese trade (trade_eventos).
--    - capturas / notas: lo que el usuario ya ha enlazado (no se pierde con
--      ninguna de las opciones del paso 2).
SELECT e.usuario_email, e.position_id, e.fp, e.cuenta_numero,
       (e.cuenta_numero IN (coalesce(u.cuenta_maestra::text, '-'), coalesce(u.cuenta_prueba::text, '-'),
                            coalesce(u.cuenta_retos::text, '-')))     AS cuenta_activa,
       e.tipo, e.volumen, e.precio_entrada, e.fecha_entrada, e.sl_actual, e.tp_actual,
       now() - e.fecha_entrada::timestamptz                           AS abierto_hace,
       t.fuente        AS trades_fuente,
       t.precio_cierre AS trades_precio_cierre,
       t.beneficio     AS trades_beneficio,
       t.dur_min       AS trades_dur_min,
       (SELECT max(ev.timestamp) FROM trade_eventos ev WHERE ev.fp = e.fp)                         AS ultimo_evento,
       (SELECT string_agg(DISTINCT ev.tipo_evento, ', ') FROM trade_eventos ev WHERE ev.fp = e.fp) AS eventos,
       (SELECT count(*) FROM trade_capturas c WHERE c.fp = e.fp AND c.usuario_email = e.usuario_email) AS capturas,
       (SELECT count(*) FROM trade_nota n     WHERE n.fp = e.fp AND n.usuario_email = e.usuario_email) AS notas
FROM ea_trades e
LEFT JOIN usuarios_aurum u ON u.email = e.usuario_email
LEFT JOIN trades t         ON t.fp = e.fp AND t.usuario_email = e.usuario_email
WHERE e.estado = 'open'
ORDER BY e.usuario_email, e.fecha_entrada;
