-- Data fix puntual — fp=2026.08.27_21978908 (ticket real de bróker 21978908)
-- Ver diagnóstico sesión 27/08/2026.
--
-- precio_cierre quedó pisado por el precio de un parcial intermedio (4575.4)
-- cuando el cierre real de MT5 fue 4579.795. El beneficio (80.7) YA es correcto
-- porque se recalcula aparte vía historial — no se toca.
--
-- Correr UNA vez, a mano, tras aplicar sql_trade_eventos_v2_volumen_tipos.sql
-- (o antes, es independiente). Requiere service key / SQL editor de Supabase.

-- 1) ea_trades (fuente de verdad del EA)
UPDATE ea_trades
   SET precio_cierre = 4579.795
 WHERE position_id = 21978908
   AND precio_cierre = 4575.4;

-- 2) trades (copia para Trade Record / gestión)
UPDATE trades
   SET precio_cierre = 4579.795
 WHERE fp = '2026.08.27_21978908'
   AND precio_cierre = 4575.4;

-- 3) OPCIONAL — si además existe una fila de evento 'cierre' con el precio del
--    parcial, corregirla. Revisar antes con el SELECT de abajo; si prefieres,
--    bórrala y deja que el EA la regenere en el próximo SyncHistory48h.
-- UPDATE trade_eventos
--    SET precio = 4579.795, tipo_evento = 'cierre_manual'
--  WHERE fp = '2026.08.27_21978908'
--    AND tipo_evento = 'cierre'
--    AND precio = 4575.4;

-- 4) Verificación
SELECT 'trades' AS tabla, fp, precio_entrada, precio_cierre, beneficio, puntos, sl, tp
  FROM trades WHERE fp = '2026.08.27_21978908'
UNION ALL
SELECT 'ea_trades', fp, precio_entrada, precio_cierre, beneficio, NULL, sl_actual, tp_actual
  FROM ea_trades WHERE position_id = 21978908;

SELECT tipo_evento, precio, volumen_afectado, volumen_restante, beneficio, timestamp
  FROM trade_eventos WHERE fp = '2026.08.27_21978908' ORDER BY timestamp;
