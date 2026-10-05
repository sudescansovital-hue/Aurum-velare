-- Fallo 2 de la EA (05/10): duplicados en ea_sl_changes / ea_tp_changes.
-- PASO 1 — SOLO LECTURA. No modifica nada. Una sola consulta (el editor de
-- Supabase solo muestra el último resultado): devuelve en filas el esquema,
-- los índices, el total de filas y los duplicados de las dos tablas.
-- Duplicado = misma cuenta_numero, position_id, timestamp y valor nuevo.

with dup_sl as (
  select cuenta_numero, position_id, "timestamp", sl_nuevo, count(*) as n,
         count(distinct coalesce(sl_anterior, -1)) as anteriores_distintos
  from ea_sl_changes
  group by cuenta_numero, position_id, "timestamp", sl_nuevo
  having count(*) > 1
), dup_tp as (
  select cuenta_numero, position_id, "timestamp", tp_nuevo, count(*) as n,
         count(distinct coalesce(tp_anterior, -1)) as anteriores_distintos
  from ea_tp_changes
  group by cuenta_numero, position_id, "timestamp", tp_nuevo
  having count(*) > 1
)
select '1 columnas' as seccion, table_name::text as tabla,
       ordinal_position::text || '. ' || column_name || ' ' || data_type ||
       case when is_nullable = 'NO' then ' NOT NULL' else '' end as detalle
from information_schema.columns
where table_schema = 'public' and table_name in ('ea_sl_changes', 'ea_tp_changes')
union all
select '2 indices', tablename::text, indexname || ': ' || indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('ea_sl_changes', 'ea_tp_changes')
union all
select '3 total filas', 'ea_sl_changes', count(*)::text from ea_sl_changes
union all
select '3 total filas', 'ea_tp_changes', count(*)::text from ea_tp_changes
union all
select '4 duplicados', 'ea_sl_changes',
       'grupos: ' || count(*) || ' · filas sobrantes: ' || coalesce(sum(n - 1), 0) ||
       ' · máx. copias: ' || coalesce(max(n), 0) ||
       ' · grupos con valor anterior distinto: ' || count(*) filter (where anteriores_distintos > 1)
from dup_sl
union all
select '4 duplicados', 'ea_tp_changes',
       'grupos: ' || count(*) || ' · filas sobrantes: ' || coalesce(sum(n - 1), 0) ||
       ' · máx. copias: ' || coalesce(max(n), 0) ||
       ' · grupos con valor anterior distinto: ' || count(*) filter (where anteriores_distintos > 1)
from dup_tp
union all
select '5 sobrantes por mes', 'ea_sl_changes', to_char("timestamp", 'YYYY-MM') || ': ' || sum(n - 1)
from dup_sl group by to_char("timestamp", 'YYYY-MM')
union all
select '5 sobrantes por mes', 'ea_tp_changes', to_char("timestamp", 'YYYY-MM') || ': ' || sum(n - 1)
from dup_tp group by to_char("timestamp", 'YYYY-MM')
union all
select '6 cuenta_numero nula', 'ea_sl_changes', count(*)::text from ea_sl_changes where cuenta_numero is null
union all
select '6 cuenta_numero nula', 'ea_tp_changes', count(*)::text from ea_tp_changes where cuenta_numero is null
order by 1, 2, 3;
