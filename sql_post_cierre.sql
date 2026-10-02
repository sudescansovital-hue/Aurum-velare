-- FASE 2 — Análisis post-cierre en el Diario de la web
-- Ver: docs/DISENO_POST_CIERRE.md y tools/post_cierre/ESTADO.md
--
-- Dos tablas nuevas, solo aditivo: no toca trades, ea_trades, trade_eventos,
-- ea_sl_changes ni ea_tp_changes.
--   post_cierre_analisis : una fila por trade de la EA analizado (ligera,
--                          se lee entera para la semana / lista)
--   post_cierre_velas    : velas M1 para dibujar el gráfico de un trade sin
--                          volver a MT5 (pesada, se pide solo al pulsarlo)
--
-- Escribe SOLO api/post-cierre.js con la service key (server-side), alimentado
-- por tools/post_cierre/post_cierre.py. El usuario y el admin solo leen: no
-- hay policies de INSERT/UPDATE/DELETE, así que con el JWT del navegador no
-- se puede escribir.
--
-- Clave (usuario_email, fp) y no fp solo: trades usa on_conflict=fp,usuario_email.
-- Sin FK a trades: mismo motivo que sql_trade_eventos_fix_fk.sql.
-- Horas: hora de servidor MT5 etiquetada +00, misma convención que ea_trades.

-- 1) Resultado del análisis por trade
CREATE TABLE IF NOT EXISTS post_cierre_analisis (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_email            TEXT NOT NULL,
  fp                       TEXT NOT NULL,
  position_id              BIGINT NOT NULL,
  cuenta_numero            TEXT NOT NULL,
  estrategia               TEXT,                 -- NULL = sin clasificar
  direccion                TEXT NOT NULL CHECK (direccion IN ('buy','sell')),
  volumen                  NUMERIC,
  fecha_entrada            TIMESTAMPTZ NOT NULL,
  precio_entrada           NUMERIC NOT NULL,
  fecha_cierre             TIMESTAMPTZ NOT NULL,
  precio_cierre            NUMERIC NOT NULL,

  -- Niveles usados (cascada anti-dedazo de post_cierre.py)
  sl_original              NUMERIC,
  sl_original_origen       TEXT,                 -- columna_original | cambio_registrado | no_fiable
  tp_original              NUMERIC,              -- NULL válido (operar sin TP es normal)
  tp_original_origen       TEXT,
  sl_final                 NUMERIC,
  tp_final                 NUMERIC,

  -- Tipo de cierre
  tipo_cierre_guardado     TEXT,
  tipo_cierre_deducido     TEXT,
  tipo_cierre_discrepancia BOOLEAN,
  tipo_cierre_detallado    TEXT NOT NULL CHECK (tipo_cierre_detallado IN
                             ('manual','tp','sl_original_o_ajustado_perdida',
                              'sl_breakeven','sl_beneficio_trailing','desconocido')),

  -- Durante el trade (velas M1)
  mfe_puntos               NUMERIC,
  mfe_en                   TIMESTAMPTZ,
  mae_puntos               NUMERIC,
  mae_en                   TIMESTAMPTZ,

  -- Breakeven real (SL a ±1 pt de la entrada)
  n_be_ea                  INT,
  n_be_reales              INT,
  be_real_en               TIMESTAMPTZ,
  be_real_nivel            NUMERIC,
  be_efecto                TEXT NOT NULL CHECK (be_efecto IN
                             ('na','te_salvo','te_saco_de_un_ganador','sin_efecto')),

  -- Después del cierre (hasta SL original / TP, máximo 4 h de mercado)
  resultado_post_cierre    TEXT NOT NULL CHECK (resultado_post_cierre IN
                             ('fue_a_sl','fue_a_tp','ninguno_en_ventana',
                              'ambiguo_misma_vela','datos_insuficientes')),
  minutos_hasta_resultado  INT,
  favor_post_puntos        NUMERIC,              -- = pts dejados
  contra_post_puntos       NUMERIC,
  favor_1h_puntos          NUMERIC,
  favor_4h_puntos          NUMERIC,
  velas_post_disponibles   INT NOT NULL,
  ventana_completa         BOOLEAN NOT NULL,     -- false -> se re-analiza en la siguiente pasada
  decision_cierre_manual   TEXT NOT NULL CHECK (decision_cierre_manual IN
                             ('na','bien_cerrado','mixto_te_saliste_con_poco',
                              'pronto','correcto','indeterminado')),
  pts_favor_antes_sl       NUMERIC,

  -- Calidad / trazabilidad
  entrada_en_vela          BOOLEAN,
  cierre_en_vela           BOOLEAN,
  notas                    TEXT,
  simbolo_velas            TEXT,
  broker_velas             TEXT,
  criterios_version        INT NOT NULL,         -- si cambian umbrales, sube y se recalcula todo
  calculado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (usuario_email, fp)
);

CREATE INDEX IF NOT EXISTS post_cierre_analisis_email_cierre_idx
  ON post_cierre_analisis (usuario_email, fecha_cierre DESC);

-- 2) Velas para el gráfico del trade
CREATE TABLE IF NOT EXISTS post_cierre_velas (
  usuario_email   TEXT NOT NULL,
  fp              TEXT NOT NULL,
  inicio          TIMESTAMPTZ NOT NULL,   -- time de la primera vela
  velas           JSONB NOT NULL,         -- [[min_desde_inicio, o, h, l, c], ...]
  tf_durante_min  SMALLINT NOT NULL,      -- 1; >1 si el trade fue largo y se agrupó
  idx_entrada     INT NOT NULL,
  idx_cierre      INT NOT NULL,           -- primera vela posterior al cierre
  PRIMARY KEY (usuario_email, fp),
  FOREIGN KEY (usuario_email, fp)
    REFERENCES post_cierre_analisis (usuario_email, fp) ON DELETE CASCADE
);

-- 3) RLS: solo lectura (admin + dueño). Escribe solo la service key.
--    Email de admin hardcodeado igual que en trades / trade_eventos.
ALTER TABLE post_cierre_analisis ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_cierre_velas    ENABLE ROW LEVEL SECURITY;

CREATE POLICY pca_admin_select ON post_cierre_analisis
  FOR SELECT USING (auth.email() = 'roderastrader@gmail.com');
CREATE POLICY pca_user_select ON post_cierre_analisis
  FOR SELECT USING (auth.email() = usuario_email);

CREATE POLICY pcv_admin_select ON post_cierre_velas
  FOR SELECT USING (auth.email() = 'roderastrader@gmail.com');
CREATE POLICY pcv_user_select ON post_cierre_velas
  FOR SELECT USING (auth.email() = usuario_email);

-- 4) Recargar la caché de esquema de PostgREST (evita el PGRST204 del 31/08)
NOTIFY pgrst, 'reload schema';

-- 5) Verificación — deben salir 4 policies, todas SELECT
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('post_cierre_analisis', 'post_cierre_velas')
ORDER BY tablename, policyname;
