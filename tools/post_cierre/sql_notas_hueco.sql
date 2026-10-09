-- Nota por hueco (Entrada / Gestión / Salida) en cada trade del Diario (09/10).
-- Ver ESTADO.md, "Notas por hueco (09/10)". Requiere sql_capturas.sql (ya
-- aplicado el 08/10): reutiliza su función trade_nota_antes().
--
-- Qué crea:
--   trade_nota_hueco  una fila por (usuario, trade, hueco), máx. 300 caracteres.
--                     Hueco = 'entrada' | 'gestion' | 'salida' (los mismos que
--                     trade_capturas). Se puede escribir aunque el hueco no
--                     tenga captura, y en trades abiertos (fp de ea_trades,
--                     el mismo que tendrá post_cierre_analisis).
--   Migración         cada "Por qué entré" de trade_nota se copia a la nota de
--                     ENTRADA de ese trade. Si ya existe nota de Entrada no se
--                     toca (ON CONFLICT DO NOTHING): se puede volver a ejecutar
--                     sin pisar nada (p. ej. justo después de desplegar la web,
--                     para recoger una nota escrita entre medias con la
--                     pantalla vieja).
--   trade_nota        NO se borra ni se cambia: queda como copia. La web nueva
--                     ya no la lee ni la escribe. Borrarla, más adelante y a
--                     mano, cuando se haya comprobado todo.
--
-- Permisos: igual que trade_nota. Cada usuario ve, crea, edita y borra SOLO lo
-- suyo; el admin (sudescansovital@gmail.com) ve las de todos, sin editar.
-- fp sin FK (como trade_capturas y trade_modo).
--
-- Orden: 1) aplicar este SQL; 2) desplegar la web de la rama
-- feature/notas-hueco; 3) (opcional) volver a ejecutar solo el paso 4.
--
-- Probado en PGlite el 09/10 (ver ESTADO.md). NO APLICADO: pendiente de revisión.

-- 1) Tabla
CREATE TABLE IF NOT EXISTS trade_nota_hueco (
  usuario_email  TEXT NOT NULL DEFAULT auth.email(),
  fp             TEXT NOT NULL CHECK (fp <> '' AND char_length(fp) <= 64),
  hueco          TEXT NOT NULL CHECK (hueco IN ('entrada', 'gestion', 'salida')),
  nota           TEXT NOT NULL CHECK (char_length(nota) BETWEEN 1 AND 300),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_email, fp, hueco)
);

-- 2) Trigger: recorta espacios, conserva creado_en y pone updated_at
--    (la misma función que trade_nota).
DROP TRIGGER IF EXISTS trade_nota_hueco_antes_trg ON trade_nota_hueco;
CREATE TRIGGER trade_nota_hueco_antes_trg BEFORE INSERT OR UPDATE ON trade_nota_hueco
  FOR EACH ROW EXECUTE FUNCTION trade_nota_antes();

-- 3) RLS
ALTER TABLE trade_nota_hueco ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tnh_user_select  ON trade_nota_hueco;
DROP POLICY IF EXISTS tnh_user_insert  ON trade_nota_hueco;
DROP POLICY IF EXISTS tnh_user_update  ON trade_nota_hueco;
DROP POLICY IF EXISTS tnh_user_delete  ON trade_nota_hueco;
DROP POLICY IF EXISTS tnh_admin_select ON trade_nota_hueco;
CREATE POLICY tnh_user_select ON trade_nota_hueco FOR SELECT USING (usuario_email = auth.email());
CREATE POLICY tnh_user_insert ON trade_nota_hueco FOR INSERT WITH CHECK (usuario_email = auth.email());
CREATE POLICY tnh_user_update ON trade_nota_hueco FOR UPDATE
  USING (usuario_email = auth.email()) WITH CHECK (usuario_email = auth.email());
CREATE POLICY tnh_user_delete ON trade_nota_hueco FOR DELETE USING (usuario_email = auth.email());
CREATE POLICY tnh_admin_select ON trade_nota_hueco FOR SELECT USING (auth.email() = 'sudescansovital@gmail.com');

-- 4) Migración: "Por qué entré" (trade_nota) -> nota de Entrada. No pisa nada.
INSERT INTO trade_nota_hueco (usuario_email, fp, hueco, nota, creado_en)
SELECT usuario_email, fp, 'entrada', nota, creado_en FROM trade_nota
ON CONFLICT (usuario_email, fp, hueco) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- 5) Comprobación tras aplicarlo (solo lectura):
-- SELECT
--   (SELECT count(*) FROM pg_policies WHERE tablename = 'trade_nota_hueco')            AS policies,      -- 5
--   (SELECT count(*) FROM trade_nota)                                                   AS notas_viejas,
--   (SELECT count(*) FROM trade_nota_hueco WHERE hueco = 'entrada')                     AS notas_entrada, -- >= notas_viejas
--   (SELECT count(*) FROM trade_nota n WHERE NOT EXISTS (
--      SELECT 1 FROM trade_nota_hueco h
--       WHERE h.usuario_email = n.usuario_email AND h.fp = n.fp AND h.hueco = 'entrada')) AS sin_migrar;    -- 0
