-- ============================================================
-- SCHEMA — aurum-3.5
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios_aurum (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  email         TEXT        UNIQUE NOT NULL,
  nombre        TEXT        NOT NULL DEFAULT '',
  etapa         INTEGER     NOT NULL DEFAULT 0 CHECK (etapa >= 0 AND etapa <= 3),
  fecha_entrada TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notas         TEXT        NOT NULL DEFAULT ''
);

-- Índice para búsquedas por email
CREATE INDEX IF NOT EXISTS idx_usuarios_aurum_email ON usuarios_aurum (email);

-- RLS: solo el propio usuario puede leer su fila;
-- el admin (service_role) puede hacer todo sin restricciones.
ALTER TABLE usuarios_aurum ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario_lee_su_fila"
  ON usuarios_aurum FOR SELECT
  USING (auth.email() = email);

CREATE POLICY "service_role_all"
  ON usuarios_aurum FOR ALL
  USING (true)
  WITH CHECK (true);
