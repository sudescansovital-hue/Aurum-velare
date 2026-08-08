-- FIX post-fase-1 — quitar el FK de trade_eventos.fp -> trades.fp
--
-- Motivo: trades solo recibe fila al CIERRE del trade (ver handleClose en
-- api/trade-mt5.js, upsert a 'trades' linea ~345). Mientras el trade esta
-- abierto solo existe en ea_trades (por position_id). Con el FK puesto,
-- los eventos 'entrada', 'breakeven' y 'parcial' (que se mandan ANTES del
-- cierre) violarian la FK porque trades.fp todavia no existe -> INSERT
-- fallaria siempre para esos 3 tipos de evento.
--
-- Este fix quita el FK. fp se queda como TEXT NOT NULL, sin referencia.
-- El indice unico (fp, tipo_evento, timestamp) y las RLS (que resuelven el
-- dueno via subquery a trades) no cambian.

-- 1) Quitar la constraint (nombre autogenerado por Postgres al crear la
--    tabla con REFERENCES inline: <tabla>_<columna>_fkey)
ALTER TABLE trade_eventos DROP CONSTRAINT IF EXISTS trade_eventos_fp_fkey;

-- 2) Verificacion — no debe aparecer ninguna fila de tipo FOREIGN KEY sobre fp
SELECT conname, contype, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'trade_eventos'::regclass;
