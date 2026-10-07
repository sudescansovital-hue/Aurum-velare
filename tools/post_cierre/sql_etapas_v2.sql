-- Etapas v2 (07/10) — criterios por etapa, editables por el admin.
-- Ver ESTADO.md, "Etapas v2 (propuesta 07/10)".
--
-- Una fila = un criterio que el usuario tiene que cumplir ESTANDO en una etapa
-- para que salga "✦ Listo para revisión" (pasar a la siguiente). Cada etapa
-- lleva sus criterios explícitos (los de las anteriores incluidos), para que
-- el admin pueda cambiar cualquier objetivo de una etapa sin tocar las demás.
-- % de la etapa = media de sus criterios (cada uno topado al 100 %); "listo"
-- solo cuando TODOS están al 100 %. Son AVISOS: nada de esto cambia
-- usuarios_aurum.etapa; el admin sigue decidiendo como hoy (guardar etapa →
-- etapa_historial). Todo se mide desde el último cambio de etapa.
--
-- Etapas (índice de la web, gestion.js / dias-limpios.js):
--   0 Descubrimiento · 1 Silencio · 2 Umbral · 3 Estructura · 4 Fractura ·
--   5 Claridad · 6 Consistencia · 7 Confianza · 8 Paciencia · 9 Rentabilidad ·
--   10 Vuelo · 11 ✦ Oro
--
-- Tipos de criterio (los calcula la web; aquí solo objetivo y parámetros):
--   ea_conectada            usuarios_aurum.tiene_ea                       objetivo 1 (sí/no)
--   reglas_definidas        algún nivel en Mis reglas                     objetivo 1 (sí/no)
--   dias_operados           días con trades                               objetivo = nº de días
--   dias_limpios            días limpios (punto 3, dias-limpios.js)       objetivo = nº de días
--   plan_antes_primer_trade % de días operados con plan del día elegido
--                           antes del primer trade                       objetivo = %   {desde}
--   trades_con_modo         % de trades con modo (plan o corrección)      objetivo = %   {desde}
--   regla_semana_seguidas   semanas seguidas cumpliendo la regla de la
--                           semana ("Tu situación")                       objetivo = nº de semanas
--   pct_dias_limpios        % de días limpios en los últimos N operados   objetivo = %   {ventana}
--   dias_sin_nivel_maximo   días operados seguidos (racha actual) sin
--                           llegar al último nivel de pérdida diaria
--                           («Cierre obligatorio»)                        objetivo = nº de días
--   cuenta_rentable         una cuenta con PF ≥ pf y ≥ objetivo trades en
--                           los últimos ventana_dias                      objetivo = nº de trades {pf, ventana_dias}
--   trimestres_rentables    una misma cuenta con PF ≥ pf en trimestres
--                           naturales seguidos                            objetivo = nº de trimestres {pf}
-- parametros.desde = 'YYYY-MM-DD': el criterio no cuenta nada anterior (plan
-- del día y modos existen desde el 07/10/2026). Si el último cambio de etapa
-- es posterior, manda ese.
--
-- Probado en PGlite (Postgres local, con auth.email() y el rol authenticated
-- simulados) el 07/10: 30 comprobaciones OK — se aplica dos veces sin error ni
-- duplicados (84 criterios: 0:3 1:3 2:4 3:4 4:5 5:7 6:8 7:9 8:9 9:10 10:11
-- 11:11); cualquier usuario con sesión los lee y no puede cambiarlos; sin
-- sesión no se ven; el admin cambia, añade, borra y desactiva, todo queda en el
-- historial (guardar sin cambios no); tipo, etapa, objetivo, porcentaje, sí/no,
-- repetidos, nombre vacío y parámetros no válidos dan error.
-- NO APLICADO: pendiente de revisión (07/10).

-- 1) Tabla
CREATE TABLE IF NOT EXISTS etapa_criterios (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  etapa            SMALLINT NOT NULL CHECK (etapa BETWEEN 0 AND 11),
  tipo             TEXT NOT NULL CHECK (tipo IN (
                     'ea_conectada', 'reglas_definidas', 'dias_operados', 'dias_limpios',
                     'plan_antes_primer_trade', 'trades_con_modo', 'regla_semana_seguidas',
                     'pct_dias_limpios', 'dias_sin_nivel_maximo', 'cuenta_rentable',
                     'trimestres_rentables')),
  objetivo         NUMERIC NOT NULL CHECK (objetivo > 0),
  parametros       JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(parametros) = 'object'),
  nombre           TEXT NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 120),  -- lo que ve el usuario
  orden            SMALLINT NOT NULL DEFAULT 0,
  activo           BOOLEAN NOT NULL DEFAULT true,
  actualizado_por  TEXT NOT NULL DEFAULT coalesce(auth.email(), 'sql'),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (etapa, tipo),
  -- sí/no: objetivo 1; porcentajes: hasta 100
  CONSTRAINT etapa_crit_si_no CHECK (tipo NOT IN ('ea_conectada', 'reglas_definidas') OR objetivo = 1),
  CONSTRAINT etapa_crit_pct   CHECK (tipo NOT IN ('plan_antes_primer_trade', 'trades_con_modo', 'pct_dias_limpios') OR objetivo <= 100)
);

CREATE TABLE IF NOT EXISTS etapa_criterios_historial (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  etapa       SMALLINT NOT NULL,
  tipo        TEXT NOT NULL,
  operacion   TEXT NOT NULL,                          -- INSERT | UPDATE | DELETE
  antes       JSONB,                                  -- {objetivo, parametros, nombre, orden, activo}; NULL en altas
  despues     JSONB,                                  -- NULL en bajas
  hecho_por   TEXT NOT NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS etapa_criterios_historial_idx ON etapa_criterios_historial (etapa, creado_en);

-- 2) Triggers: sello de quién/cuándo e historial (nadie lo escribe a mano)
CREATE OR REPLACE FUNCTION etapa_criterios_antes() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.nombre := btrim(NEW.nombre);
  NEW.updated_at := now();
  NEW.actualizado_por := coalesce(auth.email(), 'sql');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS etapa_criterios_antes_trg ON etapa_criterios;
CREATE TRIGGER etapa_criterios_antes_trg BEFORE INSERT OR UPDATE ON etapa_criterios
  FOR EACH ROW EXECUTE FUNCTION etapa_criterios_antes();

CREATE OR REPLACE FUNCTION etapa_criterios_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a JSONB; d JSONB; r etapa_criterios%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN a := jsonb_build_object('objetivo', OLD.objetivo, 'parametros', OLD.parametros, 'nombre', OLD.nombre, 'orden', OLD.orden, 'activo', OLD.activo); END IF;
  IF TG_OP <> 'DELETE' THEN d := jsonb_build_object('objetivo', NEW.objetivo, 'parametros', NEW.parametros, 'nombre', NEW.nombre, 'orden', NEW.orden, 'activo', NEW.activo); END IF;
  IF TG_OP = 'UPDATE' AND a = d THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO etapa_criterios_historial (etapa, tipo, operacion, antes, despues, hecho_por)
  VALUES (r.etapa, r.tipo, TG_OP, a, d, coalesce(auth.email(), 'sql'));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS etapa_criterios_log_trg ON etapa_criterios;
CREATE TRIGGER etapa_criterios_log_trg AFTER INSERT OR UPDATE OR DELETE ON etapa_criterios
  FOR EACH ROW EXECUTE FUNCTION etapa_criterios_log();

-- 3) RLS: cualquier usuario con sesión lee los criterios (son los mismos para
--    todos); solo el admin los crea, cambia o borra. El historial, solo el admin.
ALTER TABLE etapa_criterios           ENABLE ROW LEVEL SECURITY;
ALTER TABLE etapa_criterios_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ec_select       ON etapa_criterios;
DROP POLICY IF EXISTS ec_admin_all    ON etapa_criterios;
DROP POLICY IF EXISTS ech_admin_select ON etapa_criterios_historial;

CREATE POLICY ec_select ON etapa_criterios FOR SELECT USING (auth.email() IS NOT NULL);
CREATE POLICY ec_admin_all ON etapa_criterios FOR ALL
  USING (auth.email() = 'sudescansovital@gmail.com') WITH CHECK (auth.email() = 'sudescansovital@gmail.com');
CREATE POLICY ech_admin_select ON etapa_criterios_historial FOR SELECT
  USING (auth.email() = 'sudescansovital@gmail.com');

-- 4) Valores iniciales (07/10). Cada criterio se escribe una vez con la etapa
--    desde la que se exige y se copia a esa y a todas las siguientes ("cada
--    etapa mantiene lo de las anteriores"). Idempotente: no pisa lo que el
--    admin haya cambiado.
WITH criterios(desde_etapa, orden, tipo, objetivo, parametros, nombre) AS (VALUES
  (0,  1, 'ea_conectada',            1,   '{}'::jsonb,                                  'EA conectada a tu cuenta'),
  (0,  2, 'reglas_definidas',        1,   '{}'::jsonb,                                  'Reglas definidas en Mis reglas'),
  (0,  3, 'dias_operados',           10,  '{}'::jsonb,                                  'Días operados'),
  (2,  4, 'dias_limpios',            20,  '{}'::jsonb,                                  'Días limpios'),
  (4,  5, 'plan_antes_primer_trade', 90,  '{"desde": "2026-10-07"}'::jsonb,             'Plan del día elegido antes del primer trade (% de días operados)'),
  (5,  6, 'trades_con_modo',         80,  '{"desde": "2026-10-07"}'::jsonb,             'Trades con modo (% de trades)'),
  (5,  7, 'regla_semana_seguidas',   3,   '{}'::jsonb,                                  'Semanas seguidas cumpliendo la regla de la semana'),
  (6,  8, 'pct_dias_limpios',        80,  '{"ventana": 30}'::jsonb,                     'Días limpios en los últimos 30 días operados (%)'),
  (7,  9, 'dias_sin_nivel_maximo',   60,  '{}'::jsonb,                                  'Días operados seguidos sin llegar a tu último nivel de pérdida'),
  (9,  10, 'cuenta_rentable',        100, '{"pf": 1.1, "ventana_dias": 90}'::jsonb,     'Una cuenta con PF ≥ 1,1 y al menos 100 trades en 90 días'),
  (10, 11, 'trimestres_rentables',   3,   '{"pf": 1.1}'::jsonb,                         'Trimestres seguidos rentables (PF ≥ 1,1) en una misma cuenta')
)
INSERT INTO etapa_criterios (etapa, tipo, objetivo, parametros, nombre, orden)
SELECT e.etapa, c.tipo, c.objetivo, c.parametros, c.nombre, c.orden
  FROM criterios c
  JOIN generate_series(0, 11) AS e(etapa) ON e.etapa >= c.desde_etapa
ON CONFLICT (etapa, tipo) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- 5) Comprobación tras aplicarlo (solo lectura):
-- SELECT
--   (SELECT count(*) FROM etapa_criterios) AS criterios,                                   -- 84
--   (SELECT count(*) FROM pg_policies
--     WHERE tablename IN ('etapa_criterios', 'etapa_criterios_historial')) AS policies,     -- 3
--   (SELECT string_agg(etapa || ':' || n, ' ' ORDER BY etapa)
--      FROM (SELECT etapa, count(*) n FROM etapa_criterios GROUP BY etapa) x) AS por_etapa;
--   -- 0:3 1:3 2:4 3:4 4:5 5:7 6:8 7:9 8:9 9:10 10:11 11:11
