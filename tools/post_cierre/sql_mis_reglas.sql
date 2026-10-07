-- Mis reglas (06/10, especificación final) — pérdida máxima por trade y niveles
-- de pérdida y de beneficio diarios, por usuario y por cuenta.
-- Todos los niveles son AVISOS: ni Aurum ni la EA cierran el día ni bloquean
-- operaciones; el trader decide. El Diario muestra cuándo se alcanzó cada nivel,
-- si se siguió operando y qué pasó después (en $ y pts).
--
-- Una fila = un nivel de una regla, fijado por alguien, para un ámbito:
--   ambito 'usuario' + ambito_id = email       -> reglas de ese usuario
--   ambito 'reto'    + ambito_id = id del reto -> PREPARADO, sin uso todavía:
--     reglas que el admin fija a todos los participantes de un reto
--   fijada_por 'usuario' | 'admin'
--   cuenta 'todas' | 'maestra' | 'prueba' | 'retos': carpeta a la que se aplica
--     (por carpeta y no por número: el número de una carpeta cambia en el admin
--     y las reglas no deben perderse). Para cada carpeta, una fila de esa carpeta
--     sustituye a la de 'todas' del mismo autor; las cuentas sin carpeta
--     (historial externo) usan 'todas'.
-- Reglas (importes en $, siempre positivos; se miden POR CUENTA y día de
-- servidor, con el P&L realizado en orden de cierre):
--   perdida_trade  nivel 1      un solo trade pierde >= valor
--   perdida_dia    niveles 1-3  el día llega a -valor
--   beneficio_dia  niveles 1-3  el día llega a +valor
--   nombre  etiqueta que pone el usuario ("Límite", "Día bueno"...), opcional
-- Sin fila = ese nivel no se mide (vaciar el campo = borrar la fila).
--
-- Candado del admin: si el admin fija un nivel, manda el valor MÁS ESTRICTO
-- (el menor importe, también en beneficio: avisar antes) y el usuario solo
-- puede bajarlo.
--
-- Sustituye a sql_reglas_disciplina.sql (05/10, nunca aplicado, sin commitear).
-- Admin = ADMIN_EMAIL de app.js, escrito aquí a mano (pendiente en ESTADO.md
-- para cuando haya más de un admin).
-- NO APLICADO: pendiente de revisión (06/10).

CREATE TABLE IF NOT EXISTS reglas_valores (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ambito           TEXT NOT NULL CHECK (ambito IN ('usuario', 'reto')),
  ambito_id        TEXT NOT NULL,                       -- email del usuario o id del reto
  cuenta           TEXT NOT NULL DEFAULT 'todas' CHECK (cuenta IN ('todas', 'maestra', 'prueba', 'retos')),
  regla            TEXT NOT NULL CHECK (regla IN ('perdida_trade', 'perdida_dia', 'beneficio_dia')),
  nivel            SMALLINT NOT NULL CHECK (nivel BETWEEN 1 AND 3),
  fijada_por       TEXT NOT NULL CHECK (fijada_por IN ('usuario', 'admin')),
  valor            NUMERIC NOT NULL CHECK (valor > 0),
  nombre           TEXT CHECK (char_length(nombre) <= 40),
  actualizado_por  TEXT NOT NULL DEFAULT coalesce(auth.email(), 'sql'),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ambito, ambito_id, cuenta, regla, nivel, fijada_por),
  CONSTRAINT reglas_trade_un_nivel   CHECK (regla <> 'perdida_trade' OR nivel = 1),
  CONSTRAINT reglas_reto_solo_admin  CHECK (ambito <> 'reto' OR fijada_por = 'admin')
);

CREATE TABLE IF NOT EXISTS reglas_valores_historial (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ambito          TEXT NOT NULL,
  ambito_id       TEXT NOT NULL,
  cuenta          TEXT NOT NULL,
  regla           TEXT NOT NULL,
  nivel           SMALLINT NOT NULL,
  fijada_por      TEXT NOT NULL,
  operacion       TEXT NOT NULL,                        -- INSERT | UPDATE | DELETE
  antes           JSONB,                                -- {valor, nombre}; NULL en altas
  despues         JSONB,                                -- NULL = se dejó de medir
  hecho_por       TEXT NOT NULL,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reglas_valores_historial_ambito_idx
  ON reglas_valores_historial (ambito, ambito_id, creado_en);

-- 1) Antes de escribir: sello de quién/cuándo y candado del admin (el valor del
--    usuario no puede pasar del que el admin fijó para ese nivel y esa carpeta,
--    o para 'todas' si el admin no fijó uno propio de la carpeta).
CREATE OR REPLACE FUNCTION reglas_valores_antes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tope NUMERIC;
BEGIN
  NEW.updated_at := now();
  NEW.actualizado_por := coalesce(auth.email(), 'sql');
  NEW.nombre := nullif(btrim(NEW.nombre), '');
  IF NEW.fijada_por = 'usuario' THEN
    SELECT valor INTO tope FROM reglas_valores
     WHERE ambito = NEW.ambito AND ambito_id = NEW.ambito_id AND regla = NEW.regla
       AND nivel = NEW.nivel AND fijada_por = 'admin' AND cuenta IN (NEW.cuenta, 'todas')
     ORDER BY (cuenta = NEW.cuenta) DESC LIMIT 1;
    IF tope IS NOT NULL AND NEW.valor > tope THEN
      RAISE EXCEPTION 'Nivel fijado por el admin: % nivel % (%) no puede pasar de % $ (solo puedes hacerlo más estricto)',
        NEW.regla, NEW.nivel, NEW.cuenta, tope USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reglas_valores_antes_trg ON reglas_valores;
CREATE TRIGGER reglas_valores_antes_trg
  BEFORE INSERT OR UPDATE ON reglas_valores
  FOR EACH ROW EXECUTE FUNCTION reglas_valores_antes();

-- 2) Después de escribir o borrar: historial (nadie puede escribirlo a mano).
CREATE OR REPLACE FUNCTION reglas_valores_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r reglas_valores%ROWTYPE;
  a JSONB;
  d JSONB;
BEGIN
  IF TG_OP <> 'INSERT' THEN a := jsonb_build_object('valor', OLD.valor, 'nombre', OLD.nombre); END IF;
  IF TG_OP <> 'DELETE' THEN d := jsonb_build_object('valor', NEW.valor, 'nombre', NEW.nombre); END IF;
  IF TG_OP = 'UPDATE' AND a = d THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO reglas_valores_historial (ambito, ambito_id, cuenta, regla, nivel, fijada_por, operacion, antes, despues, hecho_por)
  VALUES (r.ambito, r.ambito_id, r.cuenta, r.regla, r.nivel, r.fijada_por, TG_OP, a, d, coalesce(auth.email(), 'sql'));
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS reglas_valores_log_trg ON reglas_valores;
CREATE TRIGGER reglas_valores_log_trg
  AFTER INSERT OR UPDATE OR DELETE ON reglas_valores
  FOR EACH ROW EXECUTE FUNCTION reglas_valores_log();

-- 3) RLS
--   Usuario: ve todos los niveles de su ámbito (los suyos y los del admin);
--            crea/edita/borra solo los fijados por él.
--   Admin: todo (ver y editar los de cualquier usuario, y los de retos).
--   Historial: solo lectura (el usuario, el suyo; el admin, todo).
--   Retos: cuando se construya, añadir una policy SELECT para que cada
--   participante vea las reglas de sus retos (vía retos_participantes).
ALTER TABLE reglas_valores           ENABLE ROW LEVEL SECURITY;
ALTER TABLE reglas_valores_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rv_user_select   ON reglas_valores;
DROP POLICY IF EXISTS rv_user_insert   ON reglas_valores;
DROP POLICY IF EXISTS rv_user_update   ON reglas_valores;
DROP POLICY IF EXISTS rv_user_delete   ON reglas_valores;
DROP POLICY IF EXISTS rv_admin_all     ON reglas_valores;
DROP POLICY IF EXISTS rvh_user_select  ON reglas_valores_historial;
DROP POLICY IF EXISTS rvh_admin_select ON reglas_valores_historial;

CREATE POLICY rv_user_select ON reglas_valores FOR SELECT
  USING (ambito = 'usuario' AND ambito_id = auth.email());
CREATE POLICY rv_user_insert ON reglas_valores FOR INSERT
  WITH CHECK (ambito = 'usuario' AND ambito_id = auth.email() AND fijada_por = 'usuario');
CREATE POLICY rv_user_update ON reglas_valores FOR UPDATE
  USING      (ambito = 'usuario' AND ambito_id = auth.email() AND fijada_por = 'usuario')
  WITH CHECK (ambito = 'usuario' AND ambito_id = auth.email() AND fijada_por = 'usuario');
CREATE POLICY rv_user_delete ON reglas_valores FOR DELETE
  USING (ambito = 'usuario' AND ambito_id = auth.email() AND fijada_por = 'usuario');
CREATE POLICY rv_admin_all ON reglas_valores FOR ALL
  USING (auth.email() = 'sudescansovital@gmail.com') WITH CHECK (auth.email() = 'sudescansovital@gmail.com');

CREATE POLICY rvh_user_select ON reglas_valores_historial FOR SELECT
  USING (ambito = 'usuario' AND ambito_id = auth.email());
CREATE POLICY rvh_admin_select ON reglas_valores_historial FOR SELECT
  USING (auth.email() = 'sudescansovital@gmail.com');

-- 4) Lo que se aplica a cada usuario, por carpeta y nivel. Para cada autor
--    (usuario / admin) la fila de la carpeta sustituye a la de 'todas'; entre
--    autores manda el importe más estricto (el menor). Nombre: el de quien manda
--    (si no tiene, el del otro).
--    carpeta 'todas' = lo que se aplica a cuentas sin carpeta (historial externo).
--    security_invoker: respeta la RLS de quien consulta.
--    (Con retos: añadir aquí los niveles de los retos en los que participa.)
CREATE OR REPLACE VIEW reglas_efectivas WITH (security_invoker = true) AS
WITH carpetas(carpeta) AS (VALUES ('todas'), ('maestra'), ('prueba'), ('retos')),
candidatas AS (
  SELECT v.ambito_id, c.carpeta, v.regla, v.nivel, v.fijada_por, v.valor, v.nombre,
         row_number() OVER (PARTITION BY v.ambito_id, c.carpeta, v.regla, v.nivel, v.fijada_por
                            ORDER BY (v.cuenta = c.carpeta) DESC) AS rk
    FROM reglas_valores v
    JOIN carpetas c ON v.cuenta IN (c.carpeta, 'todas')
   WHERE v.ambito = 'usuario'
),
por_autor AS (SELECT * FROM candidatas WHERE rk = 1)
SELECT DISTINCT ON (ambito_id, carpeta, regla, nivel)
       ambito_id                                                   AS usuario_email,
       carpeta,
       regla,
       nivel,
       valor,
       coalesce(nombre, max(nombre) OVER w)                        AS nombre,
       fijada_por                                                  AS manda,
       bool_or(fijada_por = 'admin') OVER w                        AS fijada_por_admin,
       min(valor) FILTER (WHERE fijada_por = 'admin') OVER w       AS valor_admin,
       min(valor) FILTER (WHERE fijada_por = 'usuario') OVER w     AS valor_usuario
  FROM por_autor
WINDOW w AS (PARTITION BY ambito_id, carpeta, regla, nivel)
 ORDER BY ambito_id, carpeta, regla, nivel, valor, (fijada_por = 'admin') DESC;

-- 5) Valores de partida de Roderas (especificación del 06/10), fijados por él
--    mismo (no por el admin), para todas sus cuentas. El Diario carga con este
--    email. El 3.er nivel de pérdida queda vacío (sin fila).
INSERT INTO reglas_valores (ambito, ambito_id, regla, nivel, fijada_por, valor, nombre) VALUES
  ('usuario', 'roderastrader@gmail.com', 'perdida_trade', 1, 'usuario',  500, NULL),
  ('usuario', 'roderastrader@gmail.com', 'perdida_dia',   1, 'usuario',  800, 'Límite'),
  ('usuario', 'roderastrader@gmail.com', 'perdida_dia',   2, 'usuario', 1100, 'Cierre obligatorio'),
  ('usuario', 'roderastrader@gmail.com', 'beneficio_dia', 1, 'usuario',  250, 'Día bueno'),
  ('usuario', 'roderastrader@gmail.com', 'beneficio_dia', 2, 'usuario',  500, 'Oportunidad'),
  ('usuario', 'roderastrader@gmail.com', 'beneficio_dia', 3, 'usuario', 1500, 'Asegurar')
ON CONFLICT (ambito, ambito_id, cuenta, regla, nivel, fijada_por) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- Verificación: niveles 6 · historial 6 · policies 7 · efectivas 24 (6 × 4 carpetas)
SELECT 'niveles' AS que, count(*)::text AS n FROM reglas_valores
UNION ALL SELECT 'historial', count(*)::text FROM reglas_valores_historial
UNION ALL SELECT 'policies', count(*)::text FROM pg_policies
  WHERE tablename IN ('reglas_valores', 'reglas_valores_historial')
UNION ALL SELECT 'efectivas', count(*)::text FROM reglas_efectivas;
