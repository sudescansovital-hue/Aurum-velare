-- Normas por modo (07/10) — fase 1: guardar y mostrar.
-- Ver ESTADO.md, "Modos, plan del día y tablero en directo" (puntos A y B) y
-- "Normas por modo". Requiere sql_modos.sql (aplicado el 07/10) y
-- sql_mis_reglas.sql (aplicado el 06/10; el candado del admin lee reglas_valores).
-- Todo son AVISOS y datos: Aurum no cierra ni bloquea nada. No toca la EA,
-- api/trade-mt5.js, reglas_valores, reglas_efectivas ni modos.
--
-- ¿Por qué tabla aparte y no reglas_valores con modo_id?
--   1. Forma: reglas_valores es UN importe > 0 por fila (regla + nivel 1-3).
--      Las normas de un modo son ~40 campos, la mayoría texto o sí/no, más
--      horas (00:00 no cabe en valor > 0), minutos, porcentajes y niveles de
--      escalado con TRES números cada uno (llegar / suelo / arriesgo). Meterlas
--      ahí obliga a relajar los CHECK de valor y nivel, añadir una docena de
--      reglas nuevas y columnas de texto que solo usan algunas.
--   2. Riesgo: reglas_efectivas la leen hoy el Diario, días limpios y etapas
--      (algunos con select=*) agrupando solo por carpeta. Filas con modo_id
--      se mezclarían con los niveles de la cuenta en las tres pantallas y en
--      las tres habría que filtrar a la vez (riesgo anotado en ESTADO.md).
--      Con tabla aparte, lo que hoy funciona no cambia.
--   3. Guardado: la pantalla es UN formulario por modo. Una fila por modo =
--      un guardado atómico y una entrada de historial por guardado (antes /
--      después completos), en vez de ~40 filas con sus 40 entradas.
--   Lo que se pierde, y cómo se cubre:
--   - Los niveles de pérdida del modo tienen la misma forma que los de Mis
--     reglas: en la fase de medición el Diario resolverá
--     modo > carpeta > todas (si el modo no define un nivel, se usa
--     reglas_efectivas de la cuenta, que no cambia).
--   - El candado del admin (reglas_valores fijada_por = 'admin') se respeta
--     aquí con un trigger: el modo no puede pasar del tope del admin
--     (mismo criterio que sql_mis_reglas_v3_candado.sql: solo frena SUBIR).
--     En la medición se aplicará además min(modo, tope del admin).
--
-- Tablas:
--   modo_normas            una fila por modo: normas (JSONB) del usuario.
--                          FK compuesta a modos(id, usuario_email): solo modos
--                          propios. Borrar un modo borra sus normas (el
--                          historial se queda). Desactivar no las toca.
--   modo_normas_historial  automático (nadie lo escribe a mano): antes/después.
--
-- normas (todo opcional; lo vacío no se guarda y Aurum no lo mide).
-- [A] = Aurum podrá medirlo solo con los datos de la EA (fases siguientes);
-- sin marca = texto para la tablilla y el tablero.
--   cuando        { tipo_dia, objetivo }                                 texto
--   antes         { carpeta [A]: todas|maestra|prueba|retos,
--                   sesgo [A]: vendiendo|comprando|sin_sesgo,
--                   hora_desde [A], hora_hasta [A]: 'HH:MM' hora de servidor MT5
--                     (las dos o ninguna; hasta < desde = cruza medianoche),
--                   max_trades [A]: entero 1-100 }
--   entrada       { condiciones: hasta 3 textos,
--                   lote [A], sl_pts [A], tp_pts [A] }
--   gestion       { tp1_pts [A], tp1_lote [A] (requiere tp1_pts),
--                   tp2_pts [A] (> tp1_pts), tp2_lote [A] (requiere tp2_pts),
--                   runner [A]: sí/no, be_cuando: texto,
--                   be_nunca_antes_tp1 [A]: sí/no,
--                   no_tocar_desde_min [A], no_tocar_hasta_min [A]: minutos
--                     desde la entrada (los dos o ninguno; hasta > desde),
--                   cierre_manual_si: texto }
--   primer_trade  { si_bien, si_mal }                                    texto
--   escalado      { niveles [A]: hasta 3 { nombre, llegar, suelo, arriesgo }
--                     llegar > 0 y creciente; 0 <= suelo < llegar y no baja;
--                     arriesgo opcional,
--                   margen [A]: todo|mitad|otro, margen_pct [A]: 1-100 (solo
--                     y siempre con 'otro'),
--                   lote_max [A] }
--   perdiendo     { trade [A]: pérdida máx. por trade ($),
--                   dia [A]: hasta 3 { importe ($), nombre, plan },
--                   racha_n [A]: entero 1-20, racha_plan: texto (requiere racha_n) }
--   fin           { paro_cuando, apunto }                                texto
--   nunca         hasta 3 textos
--   frase         texto
-- Límites: textos 200 caracteres; nombres de nivel 40; lotes (0, 100];
-- pts (0, 1000]; importes $ (0, 10.000.000]; documento entero 10.000 caracteres.
-- Claves desconocidas = error (evita que una errata se guarde sin medirse).
-- Al guardar se limpian: textos con espacios recortados; vacíos, null, listas
-- y bloques vacíos se quitan.
--
-- Probado en PGlite el 07/10 sobre mis_reglas v1+v2+v3 y modos: 69 comprobaciones
-- OK (se aplica dos veces sin error; limpieza; 35 rechazos de validación;
-- historial; RLS; FK compuesta; candado del admin por carpeta y 'todas';
-- borrar/desactivar modos; reglas_efectivas sin cambios).
-- NO APLICADO: pendiente de revisión (07/10).

-- 1) Tablas
CREATE TABLE IF NOT EXISTS modo_normas (
  modo_id          BIGINT PRIMARY KEY,
  usuario_email    TEXT NOT NULL DEFAULT auth.email(),
  normas           JSONB NOT NULL DEFAULT '{}'::jsonb,
  actualizado_por  TEXT NOT NULL DEFAULT coalesce(auth.email(), 'sql'),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT modo_normas_objeto CHECK (jsonb_typeof(normas) = 'object'),
  CONSTRAINT modo_normas_modo_fk FOREIGN KEY (modo_id, usuario_email)
    REFERENCES modos (id, usuario_email) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS modo_normas_usuario_idx ON modo_normas (usuario_email);

CREATE TABLE IF NOT EXISTS modo_normas_historial (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  modo_id        BIGINT NOT NULL,
  usuario_email  TEXT NOT NULL,
  operacion      TEXT NOT NULL,                       -- INSERT | UPDATE | DELETE
  antes          JSONB,                               -- NULL en altas
  despues        JSONB,                               -- NULL en bajas
  hecho_por      TEXT NOT NULL,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS modo_normas_historial_idx
  ON modo_normas_historial (usuario_email, modo_id, creado_en);

-- 2) Limpieza y validación
CREATE OR REPLACE FUNCTION modo_normas_limpiar(j JSONB) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  r JSONB;
BEGIN
  IF j IS NULL THEN RETURN NULL; END IF;
  CASE jsonb_typeof(j)
    WHEN 'object' THEN
      SELECT jsonb_object_agg(e.key, e.v) INTO r
        FROM (SELECT key, modo_normas_limpiar(value) AS v FROM jsonb_each(j)) e
       WHERE e.v IS NOT NULL;
      RETURN r;                                         -- NULL si queda vacío
    WHEN 'array' THEN
      SELECT jsonb_agg(e.v ORDER BY e.n) INTO r
        FROM (SELECT n, modo_normas_limpiar(value) AS v
                FROM jsonb_array_elements(j) WITH ORDINALITY AS a(value, n)) e
       WHERE e.v IS NOT NULL;
      RETURN r;
    WHEN 'string' THEN
      RETURN CASE WHEN btrim(j #>> '{}') = '' THEN NULL ELSE to_jsonb(btrim(j #>> '{}')) END;
    WHEN 'null' THEN
      RETURN NULL;
    ELSE
      RETURN j;
  END CASE;
END $$;

-- Ayudantes: cada uno lanza un error legible ("Normas del modo: …") si no cumple.
CREATE OR REPLACE FUNCTION _mn_error(msg TEXT) RETURNS void
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RAISE EXCEPTION 'Normas del modo: %', msg USING ERRCODE = 'check_violation';
END $$;

CREATE OR REPLACE FUNCTION _mn_claves(o JSONB, permitidas TEXT[], donde TEXT) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k TEXT;
BEGIN
  IF o IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF jsonb_typeof(o) <> 'object' THEN PERFORM _mn_error(donde || ' tiene que ser un bloque'); END IF;
  FOR k IN SELECT jsonb_object_keys(o) LOOP
    IF NOT k = ANY (permitidas) THEN PERFORM _mn_error('campo desconocido ' || donde || '.' || k); END IF;
  END LOOP;
  RETURN o;
END $$;

CREATE OR REPLACE FUNCTION _mn_texto(o JSONB, k TEXT, donde TEXT, largo INT DEFAULT 200) RETURNS void
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF NOT o ? k THEN RETURN; END IF;
  IF jsonb_typeof(o -> k) <> 'string' THEN PERFORM _mn_error(donde || '.' || k || ' tiene que ser texto'); END IF;
  IF char_length(o ->> k) > largo THEN PERFORM _mn_error(donde || '.' || k || ': máximo ' || largo || ' caracteres'); END IF;
END $$;

CREATE OR REPLACE FUNCTION _mn_opcion(o JSONB, k TEXT, donde TEXT, opciones TEXT[]) RETURNS void
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF NOT o ? k THEN RETURN; END IF;
  IF jsonb_typeof(o -> k) <> 'string' OR NOT (o ->> k) = ANY (opciones) THEN
    PERFORM _mn_error(donde || '.' || k || ' tiene que ser ' || array_to_string(opciones, ' / '));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION _mn_si_no(o JSONB, k TEXT, donde TEXT) RETURNS void
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF o ? k AND jsonb_typeof(o -> k) <> 'boolean' THEN PERFORM _mn_error(donde || '.' || k || ' tiene que ser sí/no'); END IF;
END $$;

-- Número en (minimo, maximo] si min_excl, si no en [minimo, maximo]; entero si se pide.
CREATE OR REPLACE FUNCTION _mn_num(o JSONB, k TEXT, donde TEXT, minimo NUMERIC, maximo NUMERIC,
                                   min_excl BOOLEAN DEFAULT true, entero BOOLEAN DEFAULT false) RETURNS NUMERIC
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v NUMERIC;
BEGIN
  IF NOT o ? k THEN RETURN NULL; END IF;
  IF jsonb_typeof(o -> k) <> 'number' THEN PERFORM _mn_error(donde || '.' || k || ' tiene que ser un número'); END IF;
  v := (o ->> k)::numeric;
  IF (min_excl AND v <= minimo) OR (NOT min_excl AND v < minimo) OR v > maximo THEN
    PERFORM _mn_error(donde || '.' || k || ' fuera de rango (' || CASE WHEN min_excl THEN '> ' ELSE '>= ' END
                      || minimo || ' y <= ' || maximo || ')');
  END IF;
  IF entero AND v <> trunc(v) THEN PERFORM _mn_error(donde || '.' || k || ' tiene que ser un número entero'); END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION _mn_lista(o JSONB, k TEXT, donde TEXT, maximo INT) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF NOT o ? k THEN RETURN '[]'::jsonb; END IF;
  IF jsonb_typeof(o -> k) <> 'array' THEN PERFORM _mn_error(donde || '.' || k || ' tiene que ser una lista'); END IF;
  IF jsonb_array_length(o -> k) > maximo THEN PERFORM _mn_error(donde || '.' || k || ': como mucho ' || maximo); END IF;
  RETURN o -> k;
END $$;

CREATE OR REPLACE FUNCTION _mn_hora(o JSONB, k TEXT, donde TEXT) RETURNS void
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF o ? k AND (jsonb_typeof(o -> k) <> 'string' OR (o ->> k) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN
    PERFORM _mn_error(donde || '.' || k || ' tiene que ser una hora HH:MM');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION modo_normas_validar(n JSONB) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  b JSONB; e JSONB; i INT;
  lote CONSTANT NUMERIC := 100; pts CONSTANT NUMERIC := 1000; usd CONSTANT NUMERIC := 10000000;
  v1 NUMERIC; v2 NUMERIC; prev_llegar NUMERIC; prev_suelo NUMERIC; llegar NUMERIC; suelo NUMERIC;
BEGIN
  PERFORM _mn_claves(n, ARRAY['cuando', 'antes', 'entrada', 'gestion', 'primer_trade', 'escalado',
                              'perdiendo', 'fin', 'nunca', 'frase'], 'normas');
  IF char_length(n::text) > 10000 THEN PERFORM _mn_error('demasiado texto (máximo 10.000 caracteres en total)'); END IF;

  b := _mn_claves(n -> 'cuando', ARRAY['tipo_dia', 'objetivo'], 'cuando');
  PERFORM _mn_texto(b, 'tipo_dia', 'cuando'); PERFORM _mn_texto(b, 'objetivo', 'cuando');

  b := _mn_claves(n -> 'antes', ARRAY['carpeta', 'sesgo', 'hora_desde', 'hora_hasta', 'max_trades'], 'antes');
  PERFORM _mn_opcion(b, 'carpeta', 'antes', ARRAY['todas', 'maestra', 'prueba', 'retos']);
  PERFORM _mn_opcion(b, 'sesgo', 'antes', ARRAY['vendiendo', 'comprando', 'sin_sesgo']);
  PERFORM _mn_hora(b, 'hora_desde', 'antes'); PERFORM _mn_hora(b, 'hora_hasta', 'antes');
  IF (b ? 'hora_desde') <> (b ? 'hora_hasta') THEN PERFORM _mn_error('horario: pon la hora de inicio y la de fin, o ninguna'); END IF;
  IF b ? 'hora_desde' AND b ->> 'hora_desde' = b ->> 'hora_hasta' THEN PERFORM _mn_error('horario: inicio y fin no pueden ser la misma hora'); END IF;
  PERFORM _mn_num(b, 'max_trades', 'antes', 1, 100, false, true);

  b := _mn_claves(n -> 'entrada', ARRAY['condiciones', 'lote', 'sl_pts', 'tp_pts'], 'entrada');
  FOR e IN SELECT value FROM jsonb_array_elements(_mn_lista(b, 'condiciones', 'entrada', 3)) LOOP
    IF jsonb_typeof(e) <> 'string' OR char_length(e #>> '{}') > 200 THEN PERFORM _mn_error('entrada.condiciones: textos de hasta 200 caracteres'); END IF;
  END LOOP;
  PERFORM _mn_num(b, 'lote', 'entrada', 0, lote);
  PERFORM _mn_num(b, 'sl_pts', 'entrada', 0, pts);
  PERFORM _mn_num(b, 'tp_pts', 'entrada', 0, pts);

  b := _mn_claves(n -> 'gestion', ARRAY['tp1_pts', 'tp1_lote', 'tp2_pts', 'tp2_lote', 'runner', 'be_cuando',
                                        'be_nunca_antes_tp1', 'no_tocar_desde_min', 'no_tocar_hasta_min',
                                        'cierre_manual_si'], 'gestion');
  v1 := _mn_num(b, 'tp1_pts', 'gestion', 0, pts);
  v2 := _mn_num(b, 'tp2_pts', 'gestion', 0, pts);
  PERFORM _mn_num(b, 'tp1_lote', 'gestion', 0, lote);
  PERFORM _mn_num(b, 'tp2_lote', 'gestion', 0, lote);
  IF b ? 'tp1_lote' AND v1 IS NULL THEN PERFORM _mn_error('gestión: el lote del TP1 necesita los pts del TP1'); END IF;
  IF b ? 'tp2_lote' AND v2 IS NULL THEN PERFORM _mn_error('gestión: el lote del TP2 necesita los pts del TP2'); END IF;
  IF v1 IS NOT NULL AND v2 IS NOT NULL AND v2 <= v1 THEN PERFORM _mn_error('gestión: el TP2 tiene que estar más lejos que el TP1'); END IF;
  PERFORM _mn_si_no(b, 'runner', 'gestion'); PERFORM _mn_si_no(b, 'be_nunca_antes_tp1', 'gestion');
  PERFORM _mn_texto(b, 'be_cuando', 'gestion'); PERFORM _mn_texto(b, 'cierre_manual_si', 'gestion');
  v1 := _mn_num(b, 'no_tocar_desde_min', 'gestion', 0, 1440, false, true);
  v2 := _mn_num(b, 'no_tocar_hasta_min', 'gestion', 0, 1440, false, true);
  IF (v1 IS NULL) <> (v2 IS NULL) THEN PERFORM _mn_error('gestión: "no tocar" necesita el minuto de inicio y el de fin'); END IF;
  IF v1 IS NOT NULL AND v2 <= v1 THEN PERFORM _mn_error('gestión: en "no tocar", el minuto de fin tiene que ser mayor que el de inicio'); END IF;

  b := _mn_claves(n -> 'primer_trade', ARRAY['si_bien', 'si_mal'], 'primer_trade');
  PERFORM _mn_texto(b, 'si_bien', 'primer_trade'); PERFORM _mn_texto(b, 'si_mal', 'primer_trade');

  b := _mn_claves(n -> 'escalado', ARRAY['niveles', 'margen', 'margen_pct', 'lote_max'], 'escalado');
  i := 0;
  FOR e IN SELECT value FROM jsonb_array_elements(_mn_lista(b, 'niveles', 'escalado', 3)) LOOP
    i := i + 1;
    PERFORM _mn_claves(e, ARRAY['nombre', 'llegar', 'suelo', 'arriesgo'], 'escalado.niveles[' || i || ']');
    PERFORM _mn_texto(e, 'nombre', 'escalado.niveles[' || i || ']', 40);
    llegar := _mn_num(e, 'llegar', 'escalado.niveles[' || i || ']', 0, usd);
    suelo  := _mn_num(e, 'suelo',  'escalado.niveles[' || i || ']', 0, usd, false);
    PERFORM _mn_num(e, 'arriesgo', 'escalado.niveles[' || i || ']', 0, usd);
    IF llegar IS NULL OR suelo IS NULL THEN PERFORM _mn_error('escalado: el nivel ' || i || ' necesita "llegar a" y "suelo"'); END IF;
    IF suelo >= llegar THEN PERFORM _mn_error('escalado: en el nivel ' || i || ' el suelo tiene que ser menor que el importe al que llegas'); END IF;
    IF prev_llegar IS NOT NULL AND llegar <= prev_llegar THEN PERFORM _mn_error('escalado: cada nivel tiene que llegar más alto que el anterior'); END IF;
    IF prev_suelo IS NOT NULL AND suelo < prev_suelo THEN PERFORM _mn_error('escalado: el suelo no puede bajar de un nivel al siguiente'); END IF;
    prev_llegar := llegar; prev_suelo := suelo;
  END LOOP;
  PERFORM _mn_opcion(b, 'margen', 'escalado', ARRAY['todo', 'mitad', 'otro']);
  PERFORM _mn_num(b, 'margen_pct', 'escalado', 1, 100, false);
  IF (coalesce(b ->> 'margen', '') = 'otro') <> (b ? 'margen_pct') THEN
    PERFORM _mn_error('escalado: el % de margen va solo, y siempre, con "otro"');
  END IF;
  PERFORM _mn_num(b, 'lote_max', 'escalado', 0, lote);

  b := _mn_claves(n -> 'perdiendo', ARRAY['trade', 'dia', 'racha_n', 'racha_plan'], 'perdiendo');
  PERFORM _mn_num(b, 'trade', 'perdiendo', 0, usd);
  i := 0;
  FOR e IN SELECT value FROM jsonb_array_elements(_mn_lista(b, 'dia', 'perdiendo', 3)) LOOP
    i := i + 1;
    PERFORM _mn_claves(e, ARRAY['importe', 'nombre', 'plan'], 'perdiendo.dia[' || i || ']');
    IF _mn_num(e, 'importe', 'perdiendo.dia[' || i || ']', 0, usd) IS NULL THEN
      PERFORM _mn_error('pérdida diaria: el nivel ' || i || ' necesita un importe');
    END IF;
    PERFORM _mn_texto(e, 'nombre', 'perdiendo.dia[' || i || ']', 40);
    PERFORM _mn_texto(e, 'plan', 'perdiendo.dia[' || i || ']');
  END LOOP;
  PERFORM _mn_num(b, 'racha_n', 'perdiendo', 1, 20, false, true);
  PERFORM _mn_texto(b, 'racha_plan', 'perdiendo');
  IF b ? 'racha_plan' AND NOT b ? 'racha_n' THEN PERFORM _mn_error('pérdidas seguidas: pon tras cuántas pérdidas'); END IF;

  b := _mn_claves(n -> 'fin', ARRAY['paro_cuando', 'apunto'], 'fin');
  PERFORM _mn_texto(b, 'paro_cuando', 'fin'); PERFORM _mn_texto(b, 'apunto', 'fin');

  FOR e IN SELECT value FROM jsonb_array_elements(_mn_lista(n, 'nunca', 'normas', 3)) LOOP
    IF jsonb_typeof(e) <> 'string' OR char_length(e #>> '{}') > 200 THEN PERFORM _mn_error('nunca: textos de hasta 200 caracteres'); END IF;
  END LOOP;
  PERFORM _mn_texto(n, 'frase', 'normas');
END $$;

-- 3) Antes de escribir: limpiar, validar, sello y candado del admin.
--    Tope = fila del admin en reglas_valores para ese nivel: si el modo es de
--    una carpeta, la de esa carpeta o, si no hay, la de 'todas' (como Mis
--    reglas); si el modo es de 'todas' (vale para cualquier cuenta), la más
--    estricta del admin en cualquier carpeta. Solo frena SUBIR un importe
--    por encima del tope (o ponerlo nuevo por encima), como el candado v3.
CREATE OR REPLACE FUNCTION modo_normas_antes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  carpeta TEXT;
  tope NUMERIC;
  nuevo NUMERIC;
  viejo NUMERIC;
  k INT;
BEGIN
  NEW.normas := coalesce(modo_normas_limpiar(NEW.normas), '{}'::jsonb);
  PERFORM modo_normas_validar(NEW.normas);
  NEW.updated_at := now();
  NEW.actualizado_por := coalesce(auth.email(), 'sql');

  carpeta := coalesce(NEW.normas #>> '{antes,carpeta}', 'todas');
  FOR k IN 0..3 LOOP                              -- 0 = pérdida máx. por trade; 1-3 = niveles de pérdida diaria
    IF k = 0 THEN
      nuevo := (NEW.normas #>> '{perdiendo,trade}')::numeric;
      viejo := CASE WHEN TG_OP = 'UPDATE' THEN (OLD.normas #>> '{perdiendo,trade}')::numeric END;
    ELSE
      nuevo := (NEW.normas -> 'perdiendo' -> 'dia' -> (k - 1) ->> 'importe')::numeric;
      viejo := CASE WHEN TG_OP = 'UPDATE' THEN (OLD.normas -> 'perdiendo' -> 'dia' -> (k - 1) ->> 'importe')::numeric END;
    END IF;
    CONTINUE WHEN nuevo IS NULL OR (viejo IS NOT NULL AND nuevo <= viejo);
    IF carpeta = 'todas' THEN
      SELECT min(valor) INTO tope FROM reglas_valores
       WHERE ambito = 'usuario' AND ambito_id = NEW.usuario_email AND fijada_por = 'admin'
         AND regla = CASE WHEN k = 0 THEN 'perdida_trade' ELSE 'perdida_dia' END
         AND reglas_valores.nivel = greatest(k, 1);
    ELSE
      SELECT valor INTO tope FROM reglas_valores
       WHERE ambito = 'usuario' AND ambito_id = NEW.usuario_email AND fijada_por = 'admin'
         AND regla = CASE WHEN k = 0 THEN 'perdida_trade' ELSE 'perdida_dia' END
         AND reglas_valores.nivel = greatest(k, 1) AND cuenta IN (carpeta, 'todas')
       ORDER BY (cuenta = carpeta) DESC LIMIT 1;
    END IF;
    IF tope IS NOT NULL AND nuevo > tope THEN
      RAISE EXCEPTION 'Nivel fijado por el admin: % no puede pasar de % $ (solo puedes hacerlo más estricto)',
        CASE WHEN k = 0 THEN 'la pérdida máxima por trade' ELSE 'la pérdida diaria nivel ' || k END, tope
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS modo_normas_antes_trg ON modo_normas;
CREATE TRIGGER modo_normas_antes_trg BEFORE INSERT OR UPDATE ON modo_normas
  FOR EACH ROW EXECUTE FUNCTION modo_normas_antes();

-- 4) Después de escribir o borrar: historial.
CREATE OR REPLACE FUNCTION modo_normas_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r modo_normas%ROWTYPE; a JSONB; d JSONB;
BEGIN
  IF TG_OP <> 'INSERT' THEN a := OLD.normas; END IF;
  IF TG_OP <> 'DELETE' THEN d := NEW.normas; END IF;
  IF TG_OP = 'UPDATE' AND a = d THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO modo_normas_historial (modo_id, usuario_email, operacion, antes, despues, hecho_por)
  VALUES (r.modo_id, r.usuario_email, TG_OP, a, d, coalesce(auth.email(), 'sql'));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS modo_normas_log_trg ON modo_normas;
CREATE TRIGGER modo_normas_log_trg AFTER INSERT OR UPDATE OR DELETE ON modo_normas
  FOR EACH ROW EXECUTE FUNCTION modo_normas_log();

-- 5) RLS (como modos): el usuario ve, crea, edita y borra las suyas; el admin,
--    todo. Historial: solo lectura (el usuario, el suyo; el admin, todo).
ALTER TABLE modo_normas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE modo_normas_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mn_user_select   ON modo_normas;
DROP POLICY IF EXISTS mn_user_insert   ON modo_normas;
DROP POLICY IF EXISTS mn_user_update   ON modo_normas;
DROP POLICY IF EXISTS mn_user_delete   ON modo_normas;
DROP POLICY IF EXISTS mn_admin_all     ON modo_normas;
DROP POLICY IF EXISTS mnh_user_select  ON modo_normas_historial;
DROP POLICY IF EXISTS mnh_admin_select ON modo_normas_historial;

CREATE POLICY mn_user_select ON modo_normas FOR SELECT USING (usuario_email = auth.email());
CREATE POLICY mn_user_insert ON modo_normas FOR INSERT WITH CHECK (usuario_email = auth.email());
CREATE POLICY mn_user_update ON modo_normas FOR UPDATE
  USING (usuario_email = auth.email()) WITH CHECK (usuario_email = auth.email());
CREATE POLICY mn_user_delete ON modo_normas FOR DELETE USING (usuario_email = auth.email());
CREATE POLICY mn_admin_all ON modo_normas FOR ALL
  USING (auth.email() = 'sudescansovital@gmail.com') WITH CHECK (auth.email() = 'sudescansovital@gmail.com');

CREATE POLICY mnh_user_select ON modo_normas_historial FOR SELECT USING (usuario_email = auth.email());
CREATE POLICY mnh_admin_select ON modo_normas_historial FOR SELECT
  USING (auth.email() = 'sudescansovital@gmail.com');

NOTIFY pgrst, 'reload schema';

-- 6) Comprobación tras aplicarlo (solo lectura):
-- SELECT
--   (SELECT count(*) FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name IN ('modo_normas', 'modo_normas_historial')) AS tablas,  -- 2
--   (SELECT count(*) FROM pg_policies
--     WHERE tablename IN ('modo_normas', 'modo_normas_historial')) AS policies,                            -- 7
--   (SELECT count(*) FROM pg_trigger
--     WHERE tgrelid = 'modo_normas'::regclass AND NOT tgisinternal) AS triggers,                           -- 2
--   (SELECT count(*) FROM modo_normas) AS normas;                                                          -- 0
