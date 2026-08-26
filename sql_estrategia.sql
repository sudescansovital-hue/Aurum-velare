-- Punto 1 — clasificación automática de estrategia (A/B) por bandas de SL.
-- Fronteras en el punto medio entre categorías (7/11/25/50 -> 9/18/37.5).
-- Ver conversación 09/08/2026.

ALTER TABLE ea_trades ADD COLUMN IF NOT EXISTS estrategia TEXT;
ALTER TABLE trades    ADD COLUMN IF NOT EXISTS estrategia TEXT;

DO $$ BEGIN
  ALTER TABLE ea_trades ADD CONSTRAINT ea_trades_estrategia_check
    CHECK (estrategia IS NULL OR estrategia IN ('rechazo_rsi', 'estructura'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE trades ADD CONSTRAINT trades_estrategia_check
    CHECK (estrategia IS NULL OR estrategia IN ('rechazo_rsi', 'estructura'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

SELECT column_name, data_type FROM information_schema.columns
WHERE table_name IN ('ea_trades','trades') AND column_name = 'estrategia';
