-- Mis reglas v2 (06/10) — "plan del trader": qué hace el trader al llegar a
-- cada nivel ("Cierro la plataforma", "Solo setups A+ con medio lote"...).
-- Se escribe en Mis reglas junto al importe y el nombre del nivel, y el Diario
-- lo muestra al alcanzarlo ("Día bueno alcanzado: tu plan dice …").
-- Sigue siendo un AVISO: Aurum no bloquea nada.
--
-- Requiere sql_mis_reglas.sql (aplicado el 06/10). Solo aditivo:
--   1) columna plan en reglas_valores (texto libre, opcional, máx. 200)
--   2) trigger "antes": recorta el plan y lo deja en NULL si viene vacío
--   3) historial: el plan entra en antes/despues (cambiar solo el plan queda
--      registrado)
--   4) vista reglas_efectivas: columna plan AL FINAL (CREATE OR REPLACE VIEW
--      solo admite añadir columnas al final). Mismo criterio que nombre: el de
--      quien manda y, si no tiene, el del otro autor.
-- No toca policies, datos ni el candado del admin.
-- NO APLICADO: pendiente de revisión (06/10).

-- 1) Columna
ALTER TABLE reglas_valores ADD COLUMN IF NOT EXISTS plan TEXT;
ALTER TABLE reglas_valores DROP CONSTRAINT IF EXISTS reglas_plan_largo;
ALTER TABLE reglas_valores ADD CONSTRAINT reglas_plan_largo CHECK (char_length(plan) <= 200);

-- 2) Antes de escribir: igual que en sql_mis_reglas.sql + normalizar plan.
CREATE OR REPLACE FUNCTION reglas_valores_antes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tope NUMERIC;
BEGIN
  NEW.updated_at := now();
  NEW.actualizado_por := coalesce(auth.email(), 'sql');
  NEW.nombre := nullif(btrim(NEW.nombre), '');
  NEW.plan := nullif(btrim(NEW.plan), '');
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

-- 3) Historial: igual que en sql_mis_reglas.sql + plan en antes/despues.
--    Las filas antiguas del historial no tienen la clave plan (= sin plan).
CREATE OR REPLACE FUNCTION reglas_valores_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r reglas_valores%ROWTYPE;
  a JSONB;
  d JSONB;
BEGIN
  IF TG_OP <> 'INSERT' THEN a := jsonb_build_object('valor', OLD.valor, 'nombre', OLD.nombre, 'plan', OLD.plan); END IF;
  IF TG_OP <> 'DELETE' THEN d := jsonb_build_object('valor', NEW.valor, 'nombre', NEW.nombre, 'plan', NEW.plan); END IF;
  IF TG_OP = 'UPDATE' AND a = d THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO reglas_valores_historial (ambito, ambito_id, cuenta, regla, nivel, fijada_por, operacion, antes, despues, hecho_por)
  VALUES (r.ambito, r.ambito_id, r.cuenta, r.regla, r.nivel, r.fijada_por, TG_OP, a, d, coalesce(auth.email(), 'sql'));
  RETURN NULL;
END $$;

-- 4) Vista: idéntica a sql_mis_reglas.sql salvo plan (en candidatas y al final).
CREATE OR REPLACE VIEW reglas_efectivas WITH (security_invoker = true) AS
WITH carpetas(carpeta) AS (VALUES ('todas'), ('maestra'), ('prueba'), ('retos')),
candidatas AS (
  SELECT v.ambito_id, c.carpeta, v.regla, v.nivel, v.fijada_por, v.valor, v.nombre, v.plan,
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
       min(valor) FILTER (WHERE fijada_por = 'usuario') OVER w     AS valor_usuario,
       coalesce(plan, max(plan) OVER w)                            AS plan
  FROM por_autor
WINDOW w AS (PARTITION BY ambito_id, carpeta, regla, nivel)
 ORDER BY ambito_id, carpeta, regla, nivel, valor, (fijada_por = 'admin') DESC;

NOTIFY pgrst, 'reload schema';

-- Verificación: plan_columnas 2 (tabla y vista) · efectivas = las mismas filas
-- que antes de aplicar (no cambia con este SQL) · con_plan 0 (nadie lo ha
-- escrito todavía).
SELECT 'plan_columnas' AS que, count(*)::text AS n FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name IN ('reglas_valores', 'reglas_efectivas') AND column_name = 'plan'
UNION ALL SELECT 'efectivas', count(*)::text FROM reglas_efectivas
UNION ALL SELECT 'con_plan', count(*)::text FROM reglas_valores WHERE plan IS NOT NULL;
