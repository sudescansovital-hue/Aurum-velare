-- Cierre perdido de la posición 23453924 (cuenta 178497, WSFmarkets), 25/09/2026.
-- La EA se quitó del gráfico a las 18:52 (log del terminal) con la posición
-- abierta; el SL saltó a las 19:09:54 y la EA no volvió a cargarse hasta el
-- 27/09 23:50 (52 h 40 min después), fuera de la ventana de SyncHistory48h.
-- Fallo 5 de la EA (ver tools/post_cierre/ESTADO.md).
--
-- Datos leídos de MT5 con history_deals_get(position=23453924), hora de servidor:
--   deal 20376974  25/09 18:38:57  IN   sell 0.40 @ 4286.43  comisión -1.20
--   deal 20378026  25/09 19:09:54  OUT  buy  0.40 @ 4293.14  -268.40  reason=SL '[sl 4293.00]'
-- Sin parciales. beneficio_total = -268.40 (mismo criterio que la EA:
-- GetBeneficioTotalPos solo suma deals OUT; la comisión de entrada no entra).
--
-- Replica lo que habría hecho api/trade-mt5.js handleClose (ea_trades + upsert a
-- trades con las mismas fórmulas) + el evento 'cierre_sl' de trade_eventos.
-- MFE/MAE quedan NULL. Idempotente: si ya está cerrado no toca ea_trades;
-- trades hace upsert; el evento ignora duplicados.
--
-- IMPORTANTE: el editor de Supabase solo muestra el último resultado. Lo más
-- seguro es ejecutar primero SOLO el select del paso 0: debe devolver 1 fila
-- con estado 'open'. Si devuelve 0 filas, la apertura tampoco llegó a
-- ea_trades: no ejecutes el resto y avisa (hace falta insertar la apertura).
-- Aun así, si se ejecutara entero sin la fila, los pasos 1-3 no harían nada
-- (todos dependen de la fila de ea_trades) y el paso 4 saldría vacío.

begin;

-- 0. Comprobación previa (debe salir 1 fila con estado 'open')
select position_id, fp, estado, tipo, volumen, precio_entrada, sl_original, sl_actual, tp_actual,
       fecha_entrada, estrategia, usuario_email, cuenta_numero
from ea_trades where position_id = '23453924';

-- 1. Cerrar en ea_trades
update ea_trades
set estado = 'closed',
    precio_cierre = 4293.14,
    beneficio = -268.40,
    fecha_cierre = '2026-09-25T19:09:54'
where position_id = '23453924' and estado = 'open';

-- 2. Upsert a trades (fórmulas de handleClose: puntos por distancia entrada→sl_actual,
--    hora/día de la entrada, dur_min redondeado, cuenta por usuarios_aurum)
insert into trades (fp, fecha, usuario_email, cuenta, cuenta_numero, ganadora, beneficio,
                    hora, dia, puntos, precio_entrada, precio_cierre, dur_min, sl, tp,
                    volumen, tipo, estrategia, fuente)
select e.fp,
       to_char(e.fecha_entrada, 'YYYY.MM.DD'),
       e.usuario_email,
       case when u.cuenta_maestra::text = e.cuenta_numero::text then 'Cuenta Maestra'
            when u.cuenta_retos::text   = e.cuenta_numero::text then 'Cuenta Retos'
            when u.cuenta_prueba::text  = e.cuenta_numero::text then 'Cuenta Prueba'
            else 'Cuenta Externa' end,
       e.cuenta_numero,
       false,
       -268.40,
       extract(hour from e.fecha_entrada)::int,
       ((extract(dow from e.fecha_entrada)::int + 6) % 7),
       abs(round((case when e.sl_actual is not null and e.sl_actual <> 0
                            and abs(e.sl_actual - e.precio_entrada) > 0.00001
                       then (case when lower(e.tipo) = 'sell' then e.sl_actual - e.precio_entrada
                                  else e.precio_entrada - e.sl_actual end)
                       else (case when lower(e.tipo) = 'sell' then e.precio_entrada - 4293.14
                                  else 4293.14 - e.precio_entrada end)
                  end)::numeric, 2)),
       e.precio_entrada,
       4293.14,
       greatest(0, round(extract(epoch from ('2026-09-25T19:09:54'::timestamp
                                             - e.fecha_entrada::timestamp)) / 60))::int,
       e.sl_actual,
       e.tp_actual,
       e.volumen,
       lower(e.tipo),
       e.estrategia,
       'ea'
from ea_trades e
join usuarios_aurum u on u.email = e.usuario_email
where e.position_id = '23453924'
on conflict (fp, usuario_email) do update set
  ganadora = excluded.ganadora, beneficio = excluded.beneficio, hora = excluded.hora,
  dia = excluded.dia, puntos = excluded.puntos, precio_entrada = excluded.precio_entrada,
  precio_cierre = excluded.precio_cierre, dur_min = excluded.dur_min, sl = excluded.sl,
  tp = excluded.tp, volumen = excluded.volumen, tipo = excluded.tipo,
  estrategia = excluded.estrategia, fuente = excluded.fuente;

-- 3. Evento de cierre para la línea de tiempo del Diario (como BuildCierreEventoJson)
insert into trade_eventos (fp, tipo_evento, puntos_desde_entrada, precio, volumen_afectado,
                           volumen_restante, beneficio, timestamp)
select fp, 'cierre_sl', null, 4293.14, 0.40, 0, null, '2026-09-25T19:09:54'
from ea_trades where position_id = '23453924'
on conflict (fp, tipo_evento, timestamp) do nothing;

-- 4. Comprobación final (estado 'closed', beneficio -268.40 en las dos tablas)
select e.fp, e.estado, e.precio_cierre, e.beneficio, e.fecha_cierre,
       t.beneficio as trades_beneficio, t.puntos, t.dur_min, t.cuenta
from ea_trades e left join trades t on t.fp = e.fp and t.usuario_email = e.usuario_email
where e.position_id = '23453924';

commit;
