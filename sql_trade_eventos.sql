-- FASE 1 - Linea de tiempo de auditoria EA en el Diario
-- Ver: brief_diario_linea_tiempo_ea.md (seccion 1)
--
-- Crea la tabla trade_eventos y su RLS, replicando EXACTAMENTE el patron
-- confirmado en pg_policies para trades:
--   tr_admin_select : SELECT | auth.email() = 'roderastrader@gmail.com'
--   tr_admin_todo   : ALL    | auth.email() = 'roderastrader@gmail.com'
--   tr_user_todo    : ALL    | auth.email() = usuario_email
--
-- trade_eventos NO tiene columna usuario_email (no esta en el brief), asi
-- que la policy de usuario resuelve el dueno via fp -> trades.usuario_email.
--
-- El email de admin queda igual que en trades ahora mismo (roderastrader@gmail.com,
-- hardcodeado). Si algun dia se corrige, es una tarea aparte que toca trades
-- y trade_eventos a la vez, no se toca solo aqui.

-- 1) Tabla (columnas exactas del brief + id/creado_en)
CREATE TABLE IF NOT EXISTS trade_eventos (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fp                    TEXT NOT NULL REFERENCES trades(fp) ON DELETE CASCADE,
  tipo_evento           TEXT NOT NULL CHECK (tipo_evento IN ('entrada', 'breakeven', 'parcial', 'cierre')),
  puntos_desde_entrada  NUMERIC,
  precio                NUMERIC,
  volumen_afectado      NUMERIC,
  timestamp             TIMESTAMPTZ NOT NULL,
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Unicidad para soportar la idempotencia por (fp, tipo_evento, timestamp)
--    que pide la seccion 3 del brief para el futuro endpoint /api/trade-evento
CREATE UNIQUE INDEX IF NOT EXISTS trade_eventos_fp_tipo_ts_uniq
  ON trade_eventos (fp, tipo_evento, timestamp);

-- 3) Indice de apoyo para la query del Diario (seccion 4): por fp, ordenado por timestamp
CREATE INDEX IF NOT EXISTS trade_eventos_fp_idx ON trade_eventos (fp, timestamp);

-- 4) RLS
ALTER TABLE trade_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY te_admin_select ON trade_eventos
  FOR SELECT
  USING (auth.email() = 'roderastrader@gmail.com');

CREATE POLICY te_admin_todo ON trade_eventos
  FOR ALL
  USING (auth.email() = 'roderastrader@gmail.com')
  WITH CHECK (auth.email() = 'roderastrader@gmail.com');

CREATE POLICY te_user_todo ON trade_eventos
  FOR ALL
  USING (
    auth.email() = (SELECT t.usuario_email FROM trades t WHERE t.fp = trade_eventos.fp)
  )
  WITH CHECK (
    auth.email() = (SELECT t.usuario_email FROM trades t WHERE t.fp = trade_eventos.fp)
  );

-- 5) Verificacion - confirmar que quedaron las 3 policies
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'trade_eventos';
