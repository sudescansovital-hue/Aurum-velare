-- Cierre perdido de la posición 23827187 (cuenta 178497, WSFmarkets), 05/10/2026.
-- El PC se suspendió con MT5 cargado (05:36 → 13:28): el SL saltó a las 08:06:41
-- sin que la EA recibiera OnTradeTransaction, y al reconectar no se reinició
-- (SyncHistory48h solo corre en OnInit).
--
-- Datos leídos de MT5 con history_deals_get(position=23827187), hora de servidor:
--   deal 20703589  04:49:57  IN   sell 1.00 @ 4147.36  comisión -3.00
--   deal 20703971  04:59:15  OUT  buy  0.80 @ 4140.44  +553.60  (parcial, ya en trade_parciales)
--   deal 20707490  08:06:41  OUT  buy  0.20 @ 4147.46  -2.00    reason=SL '[sl 4147.00]'
-- beneficio_total = 553.60 - 2.00 = 551.60 (mismo criterio que la EA:
-- GetBeneficioTotalPos solo suma deals OUT; la comisión de entrada no entra).
--
-- Replica lo que habría hecho api/trade-mt5.js handleClose (ea_trades + upsert a
-- trades con las mismas fórmulas) + el evento 'cierre_sl' de trade_eventos.
-- MFE/MAE quedan NULL (como en todos los trades hoy). Idempotente: si ya está
-- cerrado no toca ea_trades; trades hace upsert; el evento ignora duplicados.

begin;

-- 0. Comprobación previa (debe salir 1 fila con estado 'open')
select position_id, fp, estado, tipo, volumen, precio_entrada, sl_actual, tp_actual,
       fecha_entrada, estrategia, usuario_email, cuenta_numero
from ea_trades where position_id = '23827187';

-- 1. Cerrar en ea_trades
update ea_trades
set estado = 'closed',
    precio_cierre = 4147.46,
    beneficio = 551.60,
    fecha_cierre = '2026-10-05T08:06:41'
where position_id = '23827187' and estado = 'open';

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
       true,
       551.60,
       extract(hour from e.fecha_entrada)::int,
       ((extract(dow from e.fecha_entrada)::int + 6) % 7),
       abs(round((case when e.sl_actual is not null and e.sl_actual <> 0
                            and abs(e.sl_actual - e.precio_entrada) > 0.00001
                       then (case when lower(e.tipo) = 'sell' then e.sl_actual - e.precio_entrada
                                  else e.precio_entrada - e.sl_actual end)
                       else (case when lower(e.tipo) = 'sell' then e.precio_entrada - 4147.46
                                  else 4147.46 - e.precio_entrada end)
                  end)::numeric, 2)),
       e.precio_entrada,
       4147.46,
       greatest(0, round(extract(epoch from ('2026-10-05T08:06:41'::timestamp
                                             - e.fecha_entrada::timestamp)) / 60))::int,
       e.sl_actual,
       e.tp_actual,
       e.volumen,
       lower(e.tipo),
       e.estrategia,
       'ea'
from ea_trades e
join usuarios_aurum u on u.email = e.usuario_email
where e.position_id = '23827187'
on conflict (fp, usuario_email) do update set
  ganadora = excluded.ganadora, beneficio = excluded.beneficio, hora = excluded.hora,
  dia = excluded.dia, puntos = excluded.puntos, precio_entrada = excluded.precio_entrada,
  precio_cierre = excluded.precio_cierre, dur_min = excluded.dur_min, sl = excluded.sl,
  tp = excluded.tp, volumen = excluded.volumen, tipo = excluded.tipo,
  estrategia = excluded.estrategia, fuente = excluded.fuente;

-- 3. Evento de cierre para la línea de tiempo del Diario (como BuildCierreEventoJson)
insert into trade_eventos (fp, tipo_evento, puntos_desde_entrada, precio, volumen_afectado,
                           volumen_restante, beneficio, timestamp)
select fp, 'cierre_sl', null, 4147.46, 0.20, 0, null, '2026-10-05T08:06:41'
from ea_trades where position_id = '23827187'
on conflict (fp, tipo_evento, timestamp) do nothing;

-- 4. Comprobación final
select e.fp, e.estado, e.precio_cierre, e.beneficio, e.fecha_cierre,
       t.beneficio as trades_beneficio, t.puntos, t.dur_min, t.cuenta
from ea_trades e left join trades t on t.fp = e.fp and t.usuario_email = e.usuario_email
where e.position_id = '23827187';

commit;
