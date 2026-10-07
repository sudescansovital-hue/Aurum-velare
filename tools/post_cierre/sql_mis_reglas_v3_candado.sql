-- Mis reglas v3 (07/10) — fase 3: candado del admin.
-- Requiere sql_mis_reglas.sql y sql_mis_reglas_v2_plan.sql (aplicados el 06/10).
--
-- Arregla la limitación anotada en ESTADO.md ("Diario al instante y plan del
-- trader"): con el trigger actual, si el admin fija para un nivel un importe más
-- estricto que el del usuario, CUALQUIER UPDATE de la fila del usuario de ese
-- nivel falla (también cambiar solo el nombre o el plan) hasta bajar el importe.
--
-- Nuevo criterio del candado (solo filas fijadas por el usuario):
--   - INSERT, o UPDATE que cambia el nivel (ámbito, carpeta, regla o nivel):
--     el importe no puede pasar del tope del admin (como hasta ahora).
--   - UPDATE del mismo nivel: solo falla si SUBE el importe por encima del tope.
--     Cambiar nombre o plan, o bajar el importe (aunque siga por encima del
--     tope), se permite: no hace la regla menos estricta, y lo que se aplica
--     sigue siendo el menor de los dos (vista reglas_efectivas, sin cambios).
-- Tope = fila del admin de esa carpeta o, si no hay, la de 'todas' (igual que antes).
--
-- No toca tablas, columnas, policies, la vista, el historial ni datos.
-- El admin ya puede ver y editar las reglas de cualquier usuario (rv_admin_all)
-- y leer todo el historial (rvh_admin_select): el panel no necesita más SQL.
-- Probado en PGlite (ver ESTADO.md, "Mis reglas fase 3").
-- NO APLICADO: pendiente de revisión (07/10).

CREATE OR REPLACE FUNCTION reglas_valores_antes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tope NUMERIC;
  comprobar BOOLEAN;
BEGIN
  NEW.updated_at := now();
  NEW.actualizado_por := coalesce(auth.email(), 'sql');
  NEW.nombre := nullif(btrim(NEW.nombre), '');
  NEW.plan := nullif(btrim(NEW.plan), '');
  IF TG_OP = 'INSERT' THEN
    comprobar := true;
  ELSE
    comprobar := (NEW.ambito, NEW.ambito_id, NEW.cuenta, NEW.regla, NEW.nivel, NEW.fijada_por)
                   IS DISTINCT FROM (OLD.ambito, OLD.ambito_id, OLD.cuenta, OLD.regla, OLD.nivel, OLD.fijada_por)
                 OR NEW.valor > OLD.valor;
  END IF;
  IF NEW.fijada_por = 'usuario' AND comprobar THEN
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

NOTIFY pgrst, 'reload schema';

-- Verificación: candado_v3 = 1 (la función nueva está puesta) · triggers 2
-- (antes y log, sin cambios) · efectivas = las mismas filas que antes de aplicar.
SELECT 'candado_v3' AS que,
       (position('comprobar' IN pg_get_functiondef('reglas_valores_antes'::regproc)) > 0)::int::text AS n
UNION ALL SELECT 'triggers', count(*)::text FROM pg_trigger
  WHERE tgrelid = 'reglas_valores'::regclass AND NOT tgisinternal
UNION ALL SELECT 'efectivas', count(*)::text FROM reglas_efectivas;
