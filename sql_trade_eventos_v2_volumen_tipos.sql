-- v2 timeline EA — tipos de evento explícitos + volumen restante + beneficio real
-- Ver: brief_diario_linea_tiempo_ea.md, diagnóstico sesión 27/08/2026.
--
-- Contexto del fix:
--   * El EA no llevaba mapa de volumen por posición -> no distinguía "cierre
--     parcial" (volumen baja pero > 0) de "cierre total" (volumen llega a 0),
--     y si PositionSelectByTicket fallaba en la carrera de milisegundos de un
--     deal OUT parcial, archivaba el precio de ESE parcial como precio_cierre
--     de la operación (caso real fp=2026.08.27_21978908: precio_cierre=4575.4
--     cuando el cierre real fue 4579.795).
--   * "breakeven" y "SL protegido" se decidían en el front por el signo del $
--     calculado (frágil). Ahora el tipo llega explícito desde el EA.
--   * El cierre no distinguía TP alcanzado / SL / manual.
--
-- Esta migración es retrocompatible: no rompe el EA ni el front actuales.
-- sql_trade_eventos.sql (fase 1) NO se toca — queda como registro histórico.

-- 1) Ampliar el CHECK de tipo_evento.
--    Constraint creada inline con la tabla -> nombre autogenerado
--    trade_eventos_tipo_evento_check.
ALTER TABLE trade_eventos DROP CONSTRAINT IF EXISTS trade_eventos_tipo_evento_check;
ALTER TABLE trade_eventos ADD CONSTRAINT trade_eventos_tipo_evento_check
  CHECK (tipo_evento IN (
    'entrada',
    'breakeven', 'sl_protegido', 'sl_ajustado',      -- SL movido, 3 subtipos por
                                                     -- distancia CON SIGNO a la entrada:
                                                     --   |d| <= 3 pts    -> breakeven
                                                     --   d  >  3 a favor -> sl_protegido
                                                     --   d  >  3 contra  -> sl_ajustado
    'parcial',
    'cierre',                                         -- se mantiene: fallback de
                                                     -- SyncHistory48h y cierres sin
                                                     -- motivo fiable
    'cierre_tp', 'cierre_sl', 'cierre_manual'         -- cierre total, motivo real
                                                     -- (DEAL_REASON del deal de cierre)
  ));

-- 2) Volumen restante de la posición DESPUÉS del evento.
--    entrada        -> volumen de entrada completo
--    parcial        -> lo que queda abierto tras el parcial (> 0)
--    breakeven/sl_* -> volumen abierto en ese momento
--    cierre*        -> 0
--    NOTA: volumen_afectado se mantiene con su semántica actual = volumen
--    CERRADO en ese parcial. No se reutiliza para "restante".
ALTER TABLE trade_eventos ADD COLUMN IF NOT EXISTS volumen_restante NUMERIC;

-- 3) Beneficio realizado del evento. Solo lo rellena 'parcial' (copiado tal
--    cual del deal por el EA — no se deriva en el front). NULL en el resto.
ALTER TABLE trade_eventos ADD COLUMN IF NOT EXISTS beneficio NUMERIC;

-- 4) El índice único (fp, tipo_evento, timestamp) y las RLS NO cambian.
--    Más valores de tipo_evento solo implican más filas distintas posibles.

-- 5) Verificación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'trade_eventos'
ORDER BY ordinal_position;

SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'trade_eventos'::regclass AND conname LIKE '%tipo_evento%';
