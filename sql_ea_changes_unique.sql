-- Fallo 2 de la EA (05/10): duplicados en ea_sl_changes / ea_tp_changes.
-- PASO 3 — ÍNDICE ÚNICO. Ejecutar DESPUÉS de la limpieza
-- (sql_ea_changes_dedup_2_limpieza.sql, hecha el 05/10: 403 + 72 filas
-- sobrantes borradas, 0 duplicados restantes).
--
-- Clave = la misma que se usó para limpiar: cuenta_numero, position_id,
-- timestamp y valor nuevo. Con el índice, el endpoint (api/trade-mt5.js)
-- podrá insertar con on_conflict + ignore-duplicates: si la EA reenvía un
-- cambio que ya llegó (reintento tras el timeout de WebRequest), Postgres lo
-- ignora en vez de duplicarlo. Mismo patrón que trade_eventos.
--
-- Si quedara algún duplicado, CREATE UNIQUE INDEX falla y no se crea nada.
-- Tablas pequeñas (812 / 423 filas): el bloqueo dura un instante.

create unique index if not exists ea_sl_changes_cuenta_pos_ts_sl_uniq
  on ea_sl_changes (cuenta_numero, position_id, "timestamp", sl_nuevo);

create unique index if not exists ea_tp_changes_cuenta_pos_ts_tp_uniq
  on ea_tp_changes (cuenta_numero, position_id, "timestamp", tp_nuevo);

notify pgrst, 'reload schema';

-- Comprobación: deben salir 2 filas con UNIQUE INDEX
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in ('ea_sl_changes_cuenta_pos_ts_sl_uniq', 'ea_tp_changes_cuenta_pos_ts_tp_uniq')
order by tablename;
