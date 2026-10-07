-- Modos de operación y plan del día (07/10) — base, SIN las normas por modo.
-- Ver ESTADO.md, "Modos, plan del día y tablero en directo (propuesta 07/10)".
-- Todo son AVISOS y datos: Aurum no cierra ni bloquea nada. No toca la EA ni
-- api/trade-mt5.js, ni reglas_valores (modo_id irá con las normas, más
-- adelante, cuando llegue la plantilla del usuario).
--
-- Tres tablas nuevas, cada usuario solo lo suyo (admin por email, como en
-- sql_mis_reglas.sql):
--   modos       los modos de cada usuario (por defecto Scalping, Testeo,
--               Estructura). El nombre se puede editar: en el resto de tablas
--               se guarda el id, así renombrar no rompe nada. No se borran si
--               se usan (FK): se desactivan con activo = false.
--   plan_dia    el plan del día: modo + sesgo. Solo se AÑADEN filas: si el
--               trader cambia de plan durante el día, fila nueva; el plan
--               vigente a una hora = la última fila anterior. El usuario no
--               puede editar ni borrar (sin policies de UPDATE/DELETE).
--   trade_modo  SOLO las correcciones a mano del modo de un trade (por fp). Lo
--               normal es deducir el modo del plan vigente al abrir el trade;
--               esta fila manda sobre lo deducido. modo_id NULL = "sin
--               clasificar" puesto a mano.
--
-- Hora: `fecha` y `hora_servidor` son de servidor MT5 (como los trades:
-- ea_trades.fecha_entrada, trade_eventos.timestamp), sin zona. Las calcula el
-- front al guardar (hora del navegador + desfase del servidor). `creado_en`
-- es el instante real (timestamptz) por si hay que recalcular ese desfase.
--
-- Integridad: el modo de plan_dia y trade_modo tiene que ser del MISMO usuario
-- (FK compuesta (modo_id, usuario_email) -> modos(id, usuario_email)).
--
-- Modos por defecto: el paso 5 los crea para los usuarios que ya existen; para
-- los nuevos, el front llama a la función modos_por_defecto() si no tiene
-- ninguno (respeta la RLS: solo crea los de quien la llama).
--
-- Probado en PGlite (Postgres local, con auth.email() y el rol authenticated
-- simulados) el 07/10: 37 comprobaciones OK — se aplica dos veces sin error ni
-- duplicados; cada usuario solo ve/toca lo suyo; plan_dia solo admite añadir
-- (sin editar ni borrar); FK compuesta impide usar modos de otro usuario;
-- borrar un modo en uso falla; nombre repetido o vacío falla; plan vigente =
-- última fila anterior; modos_por_defecto() crea 3 una sola vez y falla sin
-- sesión; el admin ve y corrige todo. Consulta de comprobación al final.
-- NO APLICADO: pendiente de revisión (07/10).

-- 1) Tablas
CREATE TABLE IF NOT EXISTS modos (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_email  TEXT NOT NULL DEFAULT auth.email(),
  nombre         TEXT NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 40),
  orden          SMALLINT NOT NULL DEFAULT 0,
  activo         BOOLEAN NOT NULL DEFAULT true,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, usuario_email)                          -- destino de las FK compuestas
);
-- Sin dos modos con el mismo nombre (sin distinguir mayúsculas) por usuario.
CREATE UNIQUE INDEX IF NOT EXISTS modos_usuario_nombre_uidx
  ON modos (usuario_email, lower(btrim(nombre)));

CREATE TABLE IF NOT EXISTS plan_dia (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_email  TEXT NOT NULL DEFAULT auth.email(),
  fecha          DATE NOT NULL,                       -- día de servidor MT5
  hora_servidor  TIMESTAMP NOT NULL,                  -- hora de servidor MT5 al elegir
  modo_id        BIGINT NOT NULL,
  sesgo          TEXT NOT NULL CHECK (sesgo IN ('vendiendo', 'comprando', 'sin_sesgo')),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),  -- instante real
  CONSTRAINT plan_dia_fecha_hora CHECK (fecha = hora_servidor::date),
  CONSTRAINT plan_dia_modo_fk FOREIGN KEY (modo_id, usuario_email)
    REFERENCES modos (id, usuario_email) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS plan_dia_usuario_hora_idx
  ON plan_dia (usuario_email, hora_servidor);

CREATE TABLE IF NOT EXISTS trade_modo (
  usuario_email  TEXT NOT NULL DEFAULT auth.email(),
  fp             TEXT NOT NULL,                       -- misma clave que trades / ea_trades
  modo_id        BIGINT,                              -- NULL = "sin clasificar" a mano
  origen         TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual')),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_email, fp),
  CONSTRAINT trade_modo_modo_fk FOREIGN KEY (modo_id, usuario_email)
    REFERENCES modos (id, usuario_email) ON DELETE RESTRICT
);
-- origen: hoy solo 'manual'. Cuando el sistema proponga el modo (lote bajo =
-- Testeo...) se ampliará el CHECK con 'propuesto' / 'confirmado'.

-- 2) updated_at y nombre sin espacios sobrantes
CREATE OR REPLACE FUNCTION modos_antes() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.nombre := btrim(NEW.nombre);
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS modos_antes_trg ON modos;
CREATE TRIGGER modos_antes_trg BEFORE INSERT OR UPDATE ON modos
  FOR EACH ROW EXECUTE FUNCTION modos_antes();

CREATE OR REPLACE FUNCTION trade_modo_antes() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trade_modo_antes_trg ON trade_modo;
CREATE TRIGGER trade_modo_antes_trg BEFORE INSERT OR UPDATE ON trade_modo
  FOR EACH ROW EXECUTE FUNCTION trade_modo_antes();

-- 3) RLS
--   modos:      el usuario ve, crea, edita y borra los suyos (borrar falla si
--               el modo se usa: FK); el admin, todo.
--   plan_dia:   el usuario ve y añade los suyos; NO edita ni borra (el plan
--               queda registrado tal cual). El admin, todo.
--   trade_modo: el usuario ve, crea, edita y borra los suyos; el admin, todo.
ALTER TABLE modos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_dia   ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_modo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS modos_user_select ON modos;
DROP POLICY IF EXISTS modos_user_insert ON modos;
DROP POLICY IF EXISTS modos_user_update ON modos;
DROP POLICY IF EXISTS modos_user_delete ON modos;
DROP POLICY IF EXISTS modos_admin_all   ON modos;
DROP POLICY IF EXISTS plan_user_select  ON plan_dia;
DROP POLICY IF EXISTS plan_user_insert  ON plan_dia;
DROP POLICY IF EXISTS plan_admin_all    ON plan_dia;
DROP POLICY IF EXISTS tm_user_select    ON trade_modo;
DROP POLICY IF EXISTS tm_user_insert    ON trade_modo;
DROP POLICY IF EXISTS tm_user_update    ON trade_modo;
DROP POLICY IF EXISTS tm_user_delete    ON trade_modo;
DROP POLICY IF EXISTS tm_admin_all      ON trade_modo;

CREATE POLICY modos_user_select ON modos FOR SELECT USING (usuario_email = auth.email());
CREATE POLICY modos_user_insert ON modos FOR INSERT WITH CHECK (usuario_email = auth.email());
CREATE POLICY modos_user_update ON modos FOR UPDATE
  USING (usuario_email = auth.email()) WITH CHECK (usuario_email = auth.email());
CREATE POLICY modos_user_delete ON modos FOR DELETE USING (usuario_email = auth.email());
CREATE POLICY modos_admin_all ON modos FOR ALL
  USING (auth.email() = 'sudescansovital@gmail.com') WITH CHECK (auth.email() = 'sudescansovital@gmail.com');

CREATE POLICY plan_user_select ON plan_dia FOR SELECT USING (usuario_email = auth.email());
CREATE POLICY plan_user_insert ON plan_dia FOR INSERT WITH CHECK (usuario_email = auth.email());
CREATE POLICY plan_admin_all ON plan_dia FOR ALL
  USING (auth.email() = 'sudescansovital@gmail.com') WITH CHECK (auth.email() = 'sudescansovital@gmail.com');

CREATE POLICY tm_user_select ON trade_modo FOR SELECT USING (usuario_email = auth.email());
CREATE POLICY tm_user_insert ON trade_modo FOR INSERT WITH CHECK (usuario_email = auth.email());
CREATE POLICY tm_user_update ON trade_modo FOR UPDATE
  USING (usuario_email = auth.email()) WITH CHECK (usuario_email = auth.email());
CREATE POLICY tm_user_delete ON trade_modo FOR DELETE USING (usuario_email = auth.email());
CREATE POLICY tm_admin_all ON trade_modo FOR ALL
  USING (auth.email() = 'sudescansovital@gmail.com') WITH CHECK (auth.email() = 'sudescansovital@gmail.com');

-- 4) Modos por defecto para quien llama (si no tiene ninguno). SECURITY
--    INVOKER: pasa por la RLS, así que solo puede crear los suyos. Devuelve
--    los modos del usuario. El front la llama con POST /rest/v1/rpc/modos_por_defecto.
CREATE OR REPLACE FUNCTION modos_por_defecto() RETURNS SETOF modos
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF auth.email() IS NULL THEN
    RAISE EXCEPTION 'Sin sesión' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM modos WHERE usuario_email = auth.email()) THEN
    INSERT INTO modos (usuario_email, nombre, orden) VALUES
      (auth.email(), 'Scalping', 1),
      (auth.email(), 'Testeo', 2),
      (auth.email(), 'Estructura', 3);
  END IF;
  RETURN QUERY SELECT * FROM modos WHERE usuario_email = auth.email() ORDER BY orden, id;
END $$;

-- 5) Modos por defecto para los usuarios que ya existen (idempotente).
INSERT INTO modos (usuario_email, nombre, orden)
SELECT u.email, d.nombre, d.orden
  FROM usuarios_aurum u
 CROSS JOIN (VALUES ('Scalping', 1), ('Testeo', 2), ('Estructura', 3)) AS d(nombre, orden)
 WHERE u.email IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM modos m WHERE m.usuario_email = u.email)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- 6) Comprobación tras aplicarlo (solo lectura):
-- SELECT
--   (SELECT count(*) FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name IN ('modos', 'plan_dia', 'trade_modo')) AS tablas,      -- 3
--   (SELECT count(*) FROM pg_policies
--     WHERE tablename IN ('modos', 'plan_dia', 'trade_modo')) AS policies,                                 -- 13
--   (SELECT count(DISTINCT usuario_email) FROM modos) AS usuarios_con_modos,                               -- = usuarios con email
--   (SELECT count(*) FROM modos) AS modos;                                                                 -- 3 por usuario
