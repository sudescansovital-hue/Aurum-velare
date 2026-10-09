-- trade_eventos: el dueño también puede LEER los eventos de sus trades ABIERTOS.
-- APLICADO por el usuario en Supabase el 09/10/2026 (este archivo es el registro).
--
-- Motivo: la policy te_user_todo (sql_trade_eventos.sql, en la raíz del repo)
-- resuelve el dueño vía trades.usuario_email, y trades solo recibe fila al
-- CIERRE (handleClose en api/trade-mt5.js). Mientras el trade está abierto
-- solo existe en ea_trades, así que un usuario normal veía vacía la línea de
-- tiempo de sus abiertos (entrada, SL movido, parciales). El admin sí la veía
-- por te_admin_select.
--
-- Solo SELECT y solo añade: las 3 policies existentes (te_admin_select,
-- te_admin_todo, te_user_todo) no cambian. Las policies se suman con OR.
-- La subconsulta a ea_trades pasa por la RLS de ea_trades (el usuario solo ve
-- las suyas), que es justo lo que se quiere.

CREATE POLICY te_user_select_ea ON trade_eventos
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM ea_trades e
    WHERE e.fp = trade_eventos.fp
      AND e.usuario_email = auth.email()
  ));

-- Verificación
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'trade_eventos';
