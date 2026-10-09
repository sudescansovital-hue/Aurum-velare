-- Etapas v2 (07/10, revisión 2) — criterios para LLEGAR a cada etapa,
-- editables por el admin, y tamaño de cuenta por usuario y carpeta.
-- Ver ESTADO.md, "Etapas v2 (propuesta 07/10)".
--
-- Una fila = un criterio que hace falta para LLEGAR a una etapa. El usuario ve
-- los criterios de la etapa SIGUIENTE a la suya; "✦ Listo para revisión"
-- cuando cumple TODOS (% de la etapa = media de sus criterios, cada uno topado
-- al 100 %). Aviso "⚠ no mantiene «X»" en el admin: deja de cumplir los
-- criterios de su etapa ACTUAL (los que le hicieron llegar) 3 semanas
-- seguidas. Son AVISOS: nada de esto cambia usuarios_aurum.etapa; el admin
-- sigue decidiendo como hoy (guardar etapa → etapa_historial). Todo se mide
-- desde el último cambio de etapa. Descubrimiento (0) no tiene criterios: es
-- la de entrada.
--
-- Etapas (índice de la web, gestion.js / dias-limpios.js):
--   0 Descubrimiento · 1 Silencio · 2 Umbral · 3 Estructura · 4 Fractura ·
--   5 Claridad · 6 Consistencia · 7 Confianza · 8 Paciencia · 9 Rentabilidad ·
--   10 Vuelo · 11 ✦ Oro
--
-- categoria: 'disciplina' | 'resultados'.
-- Tipos (los calcula la web; aquí solo objetivo y parámetros):
--  disciplina
--   ea_conectada                 usuarios_aurum.tiene_ea                        objetivo 1 (sí/no)
--   reglas_definidas             algún nivel en Mis reglas                      objetivo 1 (sí/no)
--   dias_operados                días con trades                                objetivo = nº de días
--   dias_limpios                 días limpios (punto 3, dias-limpios.js)        objetivo = nº de días
--   plan_antes_primer_trade      % de días operados con plan del día elegido
--                                antes del primer trade                        objetivo = %  {desde}
--   trades_con_modo              % de trades con modo (plan o corrección)       objetivo = %  {desde}
--   regla_semana_seguidas        semanas seguidas cumpliendo la regla de la
--                                semana ("Tu situación"): sin incumplirla y
--                                con algún día operado                         objetivo = nº de semanas
--   pct_dias_limpios             % de días limpios en los últimos N operados    objetivo = %  {ventana}
--   dias_sin_nivel_maximo        racha actual de días OPERADOS seguidos sin
--                                llegar al último nivel de pérdida diaria
--                                («Cierre obligatorio»)                        objetivo = nº de días
--  resultados (por cuenta; "una cuenta" = cualquiera de las del usuario)
--   ultimos_dias_sin_nivel_maximo ningún día por debajo del último nivel de
--                                pérdida en los últimos N días operados        objetivo = N días
--   cuenta_rentable              una cuenta con PF ≥ objetivo en los últimos
--                                ventana_dias (y ≥ min_trades si lo hay)       objetivo = PF  {ventana_dias, min_trades}
--   meses_positivos              n de los últimos `de` meses naturales con
--                                P&L > 0, en una cuenta                        objetivo = n  {de}
--   media_mensual_pct            media del P&L mensual de los últimos `meses`
--                                ≥ objetivo % del tamaño de la cuenta          objetivo = %  {meses}
--   periodo_positivo             P&L de los últimos N meses > 0, en una cuenta  objetivo = N meses
-- parametros.desde = 'YYYY-MM-DD': no cuenta nada anterior (plan del día y
-- modos existen desde el 07/10/2026); si el último cambio de etapa es
-- posterior, manda ese.
--
-- cuenta_tamanos: tamaño de cada cuenta ($) por usuario y carpeta, por defecto
-- 50.000, para media_mensual_pct. Lo cambia el admin; el usuario solo lo lee.
--
-- Probado en PGlite (Postgres local, con auth.email() y el rol authenticated
-- simulados) el 07/10 (revisión 2): 49 comprobaciones OK — se aplica dos veces
-- sin error ni duplicados (102 criterios: 1:3 2:4 3:5 4:7 5:9 6:11 7:12 8:12
-- 9:12 10:13 11:14; 26 de resultados); cada etapa tiene exactamente lo pedido
-- y mantiene la disciplina anterior; una definición nueva del mismo tipo
-- sustituye a la anterior; tamaños de cuenta 3 × 50.000 $ por usuario, el
-- usuario solo ve los suyos y no los cambia; criterios: lectura con sesión,
-- escritura solo admin, historial de cada cambio; valores no válidos (etapa 0
-- o 12, tipo, categoría, objetivo, %, sí/no, meses, repetidos, nombre,
-- parámetros, carpeta, tamaño 0) dan error.
-- NO APLICADO: pendiente de revisión (07/10).

-- 1) Criterios por etapa
CREATE TABLE IF NOT EXISTS etapa_criterios (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  etapa            SMALLINT NOT NULL CHECK (etapa BETWEEN 1 AND 11),     -- etapa a la que se LLEGA
  categoria        TEXT NOT NULL CHECK (categoria IN ('disciplina', 'resultados')),
  tipo             TEXT NOT NULL CHECK (tipo IN (
                     'ea_conectada', 'reglas_definidas', 'dias_operados', 'dias_limpios',
                     'plan_antes_primer_trade', 'trades_con_modo', 'regla_semana_seguidas',
                     'pct_dias_limpios', 'dias_sin_nivel_maximo',
                     'ultimos_dias_sin_nivel_maximo', 'cuenta_rentable', 'meses_positivos',
                     'media_mensual_pct', 'periodo_positivo')),
  objetivo         NUMERIC NOT NULL CHECK (objetivo > 0),
  parametros       JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(parametros) = 'object'),
  nombre           TEXT NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 160),  -- lo que ve el usuario
  orden            SMALLINT NOT NULL DEFAULT 0,
  activo           BOOLEAN NOT NULL DEFAULT true,
  actualizado_por  TEXT NOT NULL DEFAULT coalesce(auth.email(), 'sql'),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (etapa, tipo),
  CONSTRAINT etapa_crit_categoria CHECK (
    (categoria = 'disciplina' AND tipo IN ('ea_conectada', 'reglas_definidas', 'dias_operados', 'dias_limpios',
      'plan_antes_primer_trade', 'trades_con_modo', 'regla_semana_seguidas', 'pct_dias_limpios', 'dias_sin_nivel_maximo'))
    OR (categoria = 'resultados' AND tipo IN ('ultimos_dias_sin_nivel_maximo', 'cuenta_rentable', 'meses_positivos',
      'media_mensual_pct', 'periodo_positivo'))),
  CONSTRAINT etapa_crit_si_no CHECK (tipo NOT IN ('ea_conectada', 'reglas_definidas') OR objetivo = 1),
  CONSTRAINT etapa_crit_pct   CHECK (tipo NOT IN ('plan_antes_primer_trade', 'trades_con_modo', 'pct_dias_limpios', 'media_mensual_pct') OR objetivo <= 100),
  CONSTRAINT etapa_crit_meses CHECK (tipo <> 'meses_positivos' OR (parametros ? 'de' AND (parametros->>'de')::numeric >= objetivo))
);

CREATE TABLE IF NOT EXISTS etapa_criterios_historial (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  etapa       SMALLINT NOT NULL,
  tipo        TEXT NOT NULL,
  operacion   TEXT NOT NULL,                          -- INSERT | UPDATE | DELETE
  antes       JSONB,                                  -- NULL en altas
  despues     JSONB,                                  -- NULL en bajas
  hecho_por   TEXT NOT NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS etapa_criterios_historial_idx ON etapa_criterios_historial (etapa, creado_en);

-- 2) Tamaño de cuenta por usuario y carpeta (para media_mensual_pct)
CREATE TABLE IF NOT EXISTS cuenta_tamanos (
  usuario_email    TEXT NOT NULL,
  carpeta          TEXT NOT NULL CHECK (carpeta IN ('maestra', 'prueba', 'retos')),
  tamano           NUMERIC NOT NULL DEFAULT 50000 CHECK (tamano > 0),
  actualizado_por  TEXT NOT NULL DEFAULT coalesce(auth.email(), 'sql'),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_email, carpeta)
);

-- 3) Triggers: sello de quién/cuándo; historial de criterios (nadie lo escribe a mano)
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
  IF TG_OP <> 'INSERT' THEN a := jsonb_build_object('categoria', OLD.categoria, 'objetivo', OLD.objetivo, 'parametros', OLD.parametros, 'nombre', OLD.nombre, 'orden', OLD.orden, 'activo', OLD.activo); END IF;
  IF TG_OP <> 'DELETE' THEN d := jsonb_build_object('categoria', NEW.categoria, 'objetivo', NEW.objetivo, 'parametros', NEW.parametros, 'nombre', NEW.nombre, 'orden', NEW.orden, 'activo', NEW.activo); END IF;
  IF TG_OP = 'UPDATE' AND a = d THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO etapa_criterios_historial (etapa, tipo, operacion, antes, despues, hecho_por)
  VALUES (r.etapa, r.tipo, TG_OP, a, d, coalesce(auth.email(), 'sql'));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS etapa_criterios_log_trg ON etapa_criterios;
CREATE TRIGGER etapa_criterios_log_trg AFTER INSERT OR UPDATE OR DELETE ON etapa_criterios
  FOR EACH ROW EXECUTE FUNCTION etapa_criterios_log();

CREATE OR REPLACE FUNCTION cuenta_tamanos_antes() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.actualizado_por := coalesce(auth.email(), 'sql');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cuenta_tamanos_antes_trg ON cuenta_tamanos;
CREATE TRIGGER cuenta_tamanos_antes_trg BEFORE INSERT OR UPDATE ON cuenta_tamanos
  FOR EACH ROW EXECUTE FUNCTION cuenta_tamanos_antes();

-- 4) RLS
--   etapa_criterios: cualquier usuario con sesión los lee (son los mismos para
--     todos); solo el admin crea, cambia o borra. Historial: solo el admin.
--   cuenta_tamanos: el usuario lee los suyos; solo el admin escribe.
ALTER TABLE etapa_criterios           ENABLE ROW LEVEL SECURITY;
ALTER TABLE etapa_criterios_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuenta_tamanos            ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ec_select        ON etapa_criterios;
DROP POLICY IF EXISTS ec_admin_all     ON etapa_criterios;
DROP POLICY IF EXISTS ech_admin_select ON etapa_criterios_historial;
DROP POLICY IF EXISTS ct_user_select   ON cuenta_tamanos;
DROP POLICY IF EXISTS ct_admin_all     ON cuenta_tamanos;

CREATE POLICY ec_select ON etapa_criterios FOR SELECT USING (auth.email() IS NOT NULL);
CREATE POLICY ec_admin_all ON etapa_criterios FOR ALL
  USING (auth.email() = 'sudescansovital@gmail.com') WITH CHECK (auth.email() = 'sudescansovital@gmail.com');
CREATE POLICY ech_admin_select ON etapa_criterios_historial FOR SELECT
  USING (auth.email() = 'sudescansovital@gmail.com');
CREATE POLICY ct_user_select ON cuenta_tamanos FOR SELECT USING (usuario_email = auth.email());
CREATE POLICY ct_admin_all ON cuenta_tamanos FOR ALL
  USING (auth.email() = 'sudescansovital@gmail.com') WITH CHECK (auth.email() = 'sudescansovital@gmail.com');

-- 5) Criterios iniciales (07/10). Cada definición dice desde qué etapa se
--    exige; cada etapa toma, por tipo, la definición más reciente que le
--    corresponda: lo de las anteriores se mantiene y una definición nueva del
--    mismo tipo lo sustituye (p. ej. días limpios 10 en Umbral → 20 desde
--    Estructura; PF 0,9 en Fractura → 1,0 en Claridad…). Filas explícitas por
--    etapa: el admin puede cambiar una etapa sin tocar las demás.
--    Idempotente: no pisa lo que el admin haya cambiado.
WITH def(desde, orden, categoria, tipo, objetivo, parametros, nombre) AS (VALUES
  -- Disciplina
  (1,  1, 'disciplina', 'ea_conectada',            1,    '{}'::jsonb,                                         'EA conectada a tu cuenta'),
  (1,  2, 'disciplina', 'reglas_definidas',        1,    '{}'::jsonb,                                         'Reglas definidas en Mis reglas'),
  (1,  3, 'disciplina', 'dias_operados',           10,   '{}'::jsonb,                                         'Días operados'),
  (2,  4, 'disciplina', 'dias_limpios',            10,   '{}'::jsonb,                                         'Días limpios'),
  (3,  4, 'disciplina', 'dias_limpios',            20,   '{}'::jsonb,                                         'Días limpios'),
  (4,  5, 'disciplina', 'plan_antes_primer_trade', 90,   '{"desde": "2026-10-07"}'::jsonb,                    'Plan del día elegido antes del primer trade (% de días operados)'),
  (5,  6, 'disciplina', 'trades_con_modo',         80,   '{"desde": "2026-10-07"}'::jsonb,                    'Trades con modo (% de trades)'),
  (5,  7, 'disciplina', 'regla_semana_seguidas',   3,    '{}'::jsonb,                                         'Semanas seguidas cumpliendo la regla de la semana'),
  (6,  8, 'disciplina', 'pct_dias_limpios',        80,   '{"ventana": 30}'::jsonb,                            'Días limpios en los últimos 30 días operados (%)'),
  (7,  9, 'disciplina', 'dias_sin_nivel_maximo',   60,   '{}'::jsonb,                                         'Días operados seguidos sin llegar a tu último nivel de pérdida'),
  (8,  9, 'disciplina', 'dias_sin_nivel_maximo',   90,   '{}'::jsonb,                                         'Días operados seguidos sin llegar a tu último nivel de pérdida'),
  -- Resultados
  (3,  20, 'resultados', 'ultimos_dias_sin_nivel_maximo', 20, '{}'::jsonb,                                    'Ningún día por debajo de tu último nivel de pérdida en los últimos 20 días operados'),
  (4,  21, 'resultados', 'cuenta_rentable',        0.9,  '{"ventana_dias": 60}'::jsonb,                       'PF ≥ 0,9 en 60 días (una cuenta)'),
  (5,  21, 'resultados', 'cuenta_rentable',        1.0,  '{"ventana_dias": 60, "min_trades": 50}'::jsonb,     'Una cuenta con PF ≥ 1,0 y al menos 50 trades en 60 días'),
  (7,  21, 'resultados', 'cuenta_rentable',        1.1,  '{"ventana_dias": 90, "min_trades": 50}'::jsonb,     'Una cuenta con PF ≥ 1,1 y al menos 50 trades en 90 días'),
  (9,  21, 'resultados', 'cuenta_rentable',        1.2,  '{"ventana_dias": 90, "min_trades": 100}'::jsonb,    'Una cuenta con PF ≥ 1,2 y al menos 100 trades en 90 días'),
  (6,  22, 'resultados', 'meses_positivos',        2,    '{"de": 3}'::jsonb,                                  '2 de los últimos 3 meses en positivo'),
  (7,  22, 'resultados', 'meses_positivos',        3,    '{"de": 4}'::jsonb,                                  '3 de los últimos 4 meses en positivo'),
  (8,  22, 'resultados', 'meses_positivos',        4,    '{"de": 5}'::jsonb,                                  '4 de los últimos 5 meses en positivo'),
  (9,  22, 'resultados', 'meses_positivos',        3,    '{"de": 3}'::jsonb,                                  'Los 3 últimos meses en positivo'),
  (10, 22, 'resultados', 'meses_positivos',        6,    '{"de": 6}'::jsonb,                                  '6 meses seguidos en positivo'),
  (11, 22, 'resultados', 'meses_positivos',        10,   '{"de": 12}'::jsonb,                                 'Al menos 10 de los últimos 12 meses en positivo'),
  (10, 23, 'resultados', 'media_mensual_pct',      3,    '{"meses": 6}'::jsonb,                               'Media mensual ≥ 3 % de la cuenta (últimos 6 meses)'),
  (11, 23, 'resultados', 'media_mensual_pct',      5,    '{"meses": 12}'::jsonb,                              'Media mensual ≥ 5 % de la cuenta (últimos 12 meses)'),
  (11, 24, 'resultados', 'periodo_positivo',       12,   '{}'::jsonb,                                         'Últimos 12 meses en positivo (el año)')
)
INSERT INTO etapa_criterios (etapa, categoria, tipo, objetivo, parametros, nombre, orden)
SELECT DISTINCT ON (e.etapa, d.tipo) e.etapa, d.categoria, d.tipo, d.objetivo, d.parametros, d.nombre, d.orden
  FROM def d
  JOIN generate_series(1, 11) AS e(etapa) ON e.etapa >= d.desde
 ORDER BY e.etapa, d.tipo, d.desde DESC
ON CONFLICT (etapa, tipo) DO NOTHING;

-- 6) Tamaño de cuenta de partida (50.000 $) para los usuarios que ya existen.
INSERT INTO cuenta_tamanos (usuario_email, carpeta)
SELECT u.email, c.carpeta
  FROM usuarios_aurum u
 CROSS JOIN (VALUES ('maestra'), ('prueba'), ('retos')) AS c(carpeta)
 WHERE u.email IS NOT NULL
ON CONFLICT (usuario_email, carpeta) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- 7) Comprobación tras aplicarlo (solo lectura):
-- SELECT
--   (SELECT count(*) FROM etapa_criterios) AS criterios,                                   -- 102
--   (SELECT string_agg(etapa || ':' || n, ' ' ORDER BY etapa)
--      FROM (SELECT etapa, count(*) n FROM etapa_criterios GROUP BY etapa) x) AS por_etapa,
--   -- 1:3 2:4 3:5 4:7 5:9 6:11 7:12 8:12 9:12 10:13 11:14
--   (SELECT count(*) FROM pg_policies
--     WHERE tablename IN ('etapa_criterios', 'etapa_criterios_historial', 'cuenta_tamanos')) AS policies,  -- 5
--   (SELECT count(*) FROM cuenta_tamanos) AS tamanos;                                       -- 3 por usuario con email
