-- Fallo 2 de la EA (05/10): duplicados en ea_sl_changes / ea_tp_changes.
-- PASO 2 — LIMPIEZA.
--
-- Duplicado = misma cuenta_numero, position_id, timestamp y valor nuevo
-- (sl_nuevo / tp_nuevo). De cada grupo se conserva la fila con el id MÁS BAJO
-- (la primera que se insertó) y se borran las demás.
-- Antes de borrar, las filas sobrantes se copian a un esquema aparte
-- (respaldo), que la API de Supabase (PostgREST) no expone: los datos
-- llevan emails y no deben quedar publicados en el esquema public.
-- Todo en una transacción: si algo falla, no se borra nada.
-- Al final devuelve, por tabla: filas copiadas al respaldo, filas borradas,
-- filas que quedan y grupos duplicados restantes (debe ser 0).

begin;

create schema if not exists respaldo;
revoke all on schema respaldo from anon, authenticated;

-- 1. Copia de seguridad de las filas que se van a borrar
create table respaldo.ea_sl_changes_duplicados_20261005 as
select t.*
from ea_sl_changes t
where t.id in (
  select id from (
    select id,
           row_number() over (partition by cuenta_numero, position_id, "timestamp", sl_nuevo
                              order by id) as rn
    from ea_sl_changes
  ) x where x.rn > 1
);

create table respaldo.ea_tp_changes_duplicados_20261005 as
select t.*
from ea_tp_changes t
where t.id in (
  select id from (
    select id,
           row_number() over (partition by cuenta_numero, position_id, "timestamp", tp_nuevo
                              order by id) as rn
    from ea_tp_changes
  ) x where x.rn > 1
);

-- 2. Borrado: exactamente las filas copiadas al respaldo
delete from ea_sl_changes
where id in (select id from respaldo.ea_sl_changes_duplicados_20261005);

delete from ea_tp_changes
where id in (select id from respaldo.ea_tp_changes_duplicados_20261005);

-- 3. Comprobación
select 'ea_sl_changes' as tabla,
       (select count(*) from respaldo.ea_sl_changes_duplicados_20261005) as copiadas_y_borradas,
       (select count(*) from ea_sl_changes) as filas_que_quedan,
       (select count(*) from (select 1 from ea_sl_changes
                              group by cuenta_numero, position_id, "timestamp", sl_nuevo
                              having count(*) > 1) d) as grupos_duplicados_restantes
union all
select 'ea_tp_changes',
       (select count(*) from respaldo.ea_tp_changes_duplicados_20261005),
       (select count(*) from ea_tp_changes),
       (select count(*) from (select 1 from ea_tp_changes
                              group by cuenta_numero, position_id, "timestamp", tp_nuevo
                              having count(*) > 1) d);

commit;
