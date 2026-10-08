-- Capturas y nota "Por qué entré" por trade (08/10).
-- Ver ESTADO.md, "Capturas por trade". Sustituye a la zona de pruebas
-- capturas-test.js (carpeta local): todo va a Supabase Storage. Las capturas
-- antiguas de la carpeta local NO se migran.
--
-- Qué crea:
--   trade_capturas  una fila por (usuario, trade, hueco). Hueco = 'entrada',
--                   'gestion' o 'salida': máximo 3 por trade, lo garantiza la
--                   clave primaria. Reemplazar = UPDATE de la fila con la ruta
--                   nueva (la imagen nueva se sube con otro nombre y luego se
--                   borra la vieja). `ruta` es el nombre del objeto en el
--                   bucket: '<auth.uid()>/<nombre>.webp' (o .jpg si el
--                   navegador no sabe codificar WebP, p. ej. Safari).
--   trade_nota      "Por qué entré": una fila por (usuario, trade), máx. 300
--                   caracteres. Sin caducidad.
--   bucket          'capturas-trades', PRIVADO, máx. 2 MB por archivo y solo
--                   image/webp e image/jpeg (lo hace cumplir la API de Storage,
--                   no la base de datos). Se ven con URL firmada.
--   caducidad       capturas_caducidad() = 6 meses (LA CONSTANTE: cambiar aquí
--                   y en el front, CAPTURAS_MESES_CADUCIDAD). Cuenta desde
--                   capturado_en, que se pone al subir y al REEMPLAZAR.
--                   capturas_para_borrar() lista las caducadas y las huérfanas
--                   (archivos del bucket de más de 1 día sin fila: subidas a
--                   medias o reemplazos/borrados que no llegaron a quitar el
--                   archivo). El borrado lo hace api/capturas-caducidad.js (cron
--                   de Vercel, 1 vez al día) con la API de Storage: Supabase no
--                   deja borrar archivos con DELETE en storage.objects desde SQL
--                   (solo quitaría la fila y el archivo seguiría ocupando).
--
-- Permisos (admin por email, como en sql_mis_reglas.sql):
--   - Cada usuario ve, sube, reemplaza y borra SOLO lo suyo (tablas y
--     archivos de su carpeta '<uid>/').
--   - El admin (sudescansovital@gmail.com) VE y BORRA capturas y archivos de
--     todos, y VE las notas. No sube ni edita en nombre de otro.
--   - capturas_para_borrar(): solo service_role (el cron).
--   - El límite por Pack (Senda, Cima, VIP) va en el front (constante); la
--     base de datos no lo comprueba.
--
-- Integridad de trade_capturas (trigger):
--   - ruta con el formato de arriba y, si sube un usuario, dentro de SU
--     carpeta (primer tramo = auth.uid()).
--   - El archivo tiene que existir ya en el bucket (se sube primero y luego
--     se crea/actualiza la fila).
--   - capturado_en no se puede tocar a mano: solo cambia con la ruta (así
--     nadie alarga la caducidad).
--   - fp no tiene FK (igual que trade_modo): los trades viven en varias
--     tablas (ea_trades, trades, post_cierre_analisis).
--
-- Probado en PGlite (Postgres local, con auth.email(), auth.uid(), los roles
-- authenticated / anon / service_role y un esquema storage mínimo simulados)
-- el 08/10: 56 comprobaciones OK — se aplica dos veces sin error y vuelve a
-- dejar el bucket privado y en 2 MB si alguien lo cambió; cada usuario solo
-- sube/ve/borra archivos de su carpeta y solo .webp/.jpg; filas solo suyas,
-- máx. 1 por hueco, imagen subida antes, ruta en su carpeta, 2 MB y 1600 px;
-- reemplazar reinicia la caducidad y nadie puede alargarla a mano; nota de
-- 1 a 300 caracteres, una por trade; el admin ve y borra capturas y archivos
-- de todos y ve las notas, sin crear ni editar; capturas_para_borrar() solo
-- para service_role y devuelve justo las de más de 6 meses y los huérfanos
-- de más de 1 día. Lo que PGlite no puede probar: el
-- límite de 2 MB y los tipos permitidos del bucket (los aplica la API de
-- Storage) y las URL firmadas.
-- NO APLICADO: pendiente de revisión (08/10).

-- 1) Caducidad (la constante)
CREATE OR REPLACE FUNCTION capturas_caducidad() RETURNS interval
LANGUAGE sql IMMUTABLE AS $$ SELECT interval '6 months' $$;

-- 2) Tablas
CREATE TABLE IF NOT EXISTS trade_capturas (
  usuario_email  TEXT NOT NULL DEFAULT auth.email(),
  fp             TEXT NOT NULL CHECK (fp <> '' AND char_length(fp) <= 64),
  hueco          TEXT NOT NULL CHECK (hueco IN ('entrada', 'gestion', 'salida')),
  ruta           TEXT NOT NULL UNIQUE,
  bytes          INTEGER NOT NULL CHECK (bytes > 0 AND bytes <= 2097152),
  ancho          INTEGER NOT NULL CHECK (ancho BETWEEN 1 AND 1600),
  alto           INTEGER NOT NULL CHECK (alto BETWEEN 1 AND 10000),
  capturado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_email, fp, hueco)
);
CREATE INDEX IF NOT EXISTS trade_capturas_capturado_idx ON trade_capturas (capturado_en);

CREATE TABLE IF NOT EXISTS trade_nota (
  usuario_email  TEXT NOT NULL DEFAULT auth.email(),
  fp             TEXT NOT NULL CHECK (fp <> '' AND char_length(fp) <= 64),
  nota           TEXT NOT NULL CHECK (char_length(nota) BETWEEN 1 AND 300),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_email, fp)
);

-- 3) Triggers
CREATE OR REPLACE FUNCTION trade_capturas_antes() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ruta !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,80}\.(webp|jpg)$' THEN
    RAISE EXCEPTION 'Ruta de captura no válida: %', NEW.ruta USING ERRCODE = 'check_violation';
  END IF;
  IF auth.uid() IS NOT NULL AND split_part(NEW.ruta, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'La captura tiene que estar en tu carpeta' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.ruta IS DISTINCT FROM OLD.ruta THEN
    -- Solo se ve el archivo si la RLS de storage.objects lo deja ver: el
    -- usuario, los suyos.
    IF NOT EXISTS (SELECT 1 FROM storage.objects o
                    WHERE o.bucket_id = 'capturas-trades' AND o.name = NEW.ruta) THEN
      RAISE EXCEPTION 'La imagen no está subida: %', NEW.ruta USING ERRCODE = 'foreign_key_violation';
    END IF;
    NEW.capturado_en := now();
  ELSE
    NEW.capturado_en := OLD.capturado_en;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trade_capturas_antes_trg ON trade_capturas;
CREATE TRIGGER trade_capturas_antes_trg BEFORE INSERT OR UPDATE ON trade_capturas
  FOR EACH ROW EXECUTE FUNCTION trade_capturas_antes();

CREATE OR REPLACE FUNCTION trade_nota_antes() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.nota := btrim(NEW.nota);
  IF TG_OP = 'UPDATE' THEN NEW.creado_en := OLD.creado_en; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trade_nota_antes_trg ON trade_nota;
CREATE TRIGGER trade_nota_antes_trg BEFORE INSERT OR UPDATE ON trade_nota
  FOR EACH ROW EXECUTE FUNCTION trade_nota_antes();

-- 4) RLS de las tablas
ALTER TABLE trade_capturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_nota     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tc_user_select   ON trade_capturas;
DROP POLICY IF EXISTS tc_user_insert   ON trade_capturas;
DROP POLICY IF EXISTS tc_user_update   ON trade_capturas;
DROP POLICY IF EXISTS tc_user_delete   ON trade_capturas;
DROP POLICY IF EXISTS tc_admin_select  ON trade_capturas;
DROP POLICY IF EXISTS tc_admin_delete  ON trade_capturas;
DROP POLICY IF EXISTS tn_user_select   ON trade_nota;
DROP POLICY IF EXISTS tn_user_insert   ON trade_nota;
DROP POLICY IF EXISTS tn_user_update   ON trade_nota;
DROP POLICY IF EXISTS tn_user_delete   ON trade_nota;
DROP POLICY IF EXISTS tn_admin_select  ON trade_nota;

CREATE POLICY tc_user_select ON trade_capturas FOR SELECT USING (usuario_email = auth.email());
CREATE POLICY tc_user_insert ON trade_capturas FOR INSERT WITH CHECK (usuario_email = auth.email());
CREATE POLICY tc_user_update ON trade_capturas FOR UPDATE
  USING (usuario_email = auth.email()) WITH CHECK (usuario_email = auth.email());
CREATE POLICY tc_user_delete ON trade_capturas FOR DELETE USING (usuario_email = auth.email());
CREATE POLICY tc_admin_select ON trade_capturas FOR SELECT USING (auth.email() = 'sudescansovital@gmail.com');
CREATE POLICY tc_admin_delete ON trade_capturas FOR DELETE USING (auth.email() = 'sudescansovital@gmail.com');

CREATE POLICY tn_user_select ON trade_nota FOR SELECT USING (usuario_email = auth.email());
CREATE POLICY tn_user_insert ON trade_nota FOR INSERT WITH CHECK (usuario_email = auth.email());
CREATE POLICY tn_user_update ON trade_nota FOR UPDATE
  USING (usuario_email = auth.email()) WITH CHECK (usuario_email = auth.email());
CREATE POLICY tn_user_delete ON trade_nota FOR DELETE USING (usuario_email = auth.email());
CREATE POLICY tn_admin_select ON trade_nota FOR SELECT USING (auth.email() = 'sudescansovital@gmail.com');

-- 5) Bucket privado (idempotente: si ya existe, se fuerzan estos valores)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('capturas-trades', 'capturas-trades', false, 2097152, ARRAY['image/webp', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = false,
                               file_size_limit = EXCLUDED.file_size_limit,
                               allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 6) Permisos de los archivos (storage.objects ya tiene la RLS activada en
--    Supabase). Sin UPDATE: cada subida es un archivo nuevo (no upsert).
DROP POLICY IF EXISTS capturas_user_select  ON storage.objects;
DROP POLICY IF EXISTS capturas_user_insert  ON storage.objects;
DROP POLICY IF EXISTS capturas_user_delete  ON storage.objects;
DROP POLICY IF EXISTS capturas_admin_select ON storage.objects;
DROP POLICY IF EXISTS capturas_admin_delete ON storage.objects;

CREATE POLICY capturas_user_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'capturas-trades' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY capturas_user_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'capturas-trades'
              AND (storage.foldername(name))[1] = auth.uid()::text
              AND name ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,80}\.(webp|jpg)$');
CREATE POLICY capturas_user_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'capturas-trades' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY capturas_admin_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'capturas-trades' AND auth.email() = 'sudescansovital@gmail.com');
CREATE POLICY capturas_admin_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'capturas-trades' AND auth.email() = 'sudescansovital@gmail.com');

-- 7) Lo que hay que borrar (lo llama el cron con la service key).
--    'caducada': fila con capturado_en de hace más de capturas_caducidad().
--    'huerfana': archivo del bucket de más de 1 día sin fila que lo use.
--    El cron borra los archivos con la API de Storage y después las filas de
--    las caducadas. Si algo falla a medias, la siguiente pasada lo recoge
--    (fila sin archivo = sigue caducada; archivo sin fila = huérfano).
CREATE OR REPLACE FUNCTION capturas_para_borrar(p_limite integer DEFAULT 500)
RETURNS TABLE (motivo text, ruta text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  (SELECT 'caducada'::text, tc.ruta
     FROM public.trade_capturas tc
    WHERE tc.capturado_en < now() - public.capturas_caducidad()
    ORDER BY tc.capturado_en
    LIMIT p_limite)
  UNION ALL
  (SELECT 'huerfana'::text, o.name
     FROM storage.objects o
    WHERE o.bucket_id = 'capturas-trades'
      AND o.created_at < now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM public.trade_capturas tc WHERE tc.ruta = o.name)
    ORDER BY o.created_at
    LIMIT p_limite)
$$;
REVOKE ALL ON FUNCTION capturas_para_borrar(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION capturas_para_borrar(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION capturas_para_borrar(integer) TO service_role;

NOTIFY pgrst, 'reload schema';

-- 8) Comprobación tras aplicarlo (solo lectura):
-- SELECT
--   (SELECT count(*) FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name IN ('trade_capturas', 'trade_nota')) AS tablas,     -- 2
--   (SELECT count(*) FROM pg_policies
--     WHERE tablename IN ('trade_capturas', 'trade_nota')) AS policies,                               -- 11
--   (SELECT count(*) FROM pg_policies
--     WHERE schemaname = 'storage' AND policyname LIKE 'capturas_%') AS policies_storage,             -- 5
--   (SELECT public::text || ' · ' || file_size_limit || ' · ' || array_to_string(allowed_mime_types, ',')
--      FROM storage.buckets WHERE id = 'capturas-trades') AS bucket,                                  -- false · 2097152 · image/webp,image/jpeg
--   (SELECT capturas_caducidad()::text) AS caducidad;                                                 -- 6 mons
