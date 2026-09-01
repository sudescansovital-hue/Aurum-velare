# BRIEF: Línea de tiempo de auditoría EA integrada en Diario

**Repo:** sudescansovital-hue/Aurum-velare
**Local:** C:\Users\boli-\aurum-web-base

## CONTEXTO

El Diario ya existe (por-usuario, Supabase, vinculado a trades vía `fp`/`position_id`,
con imagen + texto + tipo + fecha, privado por defecto). El EA ya manda trades a
`/api/trade-mt5` con `fp` como identificador único. Falta que el EA reporte también
los eventos intermedios de gestión (breakeven, parciales) para poder mostrarlos
junto a la captura guardada en el Diario.

**Confirmado en Supabase (07/08/2026):** una parte de los trades con `fuente='ea'`
tienen `sl` y `tp` a `NULL`. Se confirmó que corresponde a sesiones donde hubo
desconexión (cierre de PC, cambio a móvil, etc.) mientras el EA operaba — no es
un bug del código, es una limitación esperada mientras no exista el VPS de
operación 24/7 (ya pendiente en el proceso general de Aurum Velare). Este brief
NO intenta resolver esas desconexiones — solo debe tolerar los huecos que dejan.

## OBJETIVO

Cuando el usuario abra una entrada del Diario vinculada a un trade auditado por EA
**con sesión estable (sl y tp no nulos)**, debe ver: la captura de pantalla que ya
guarda + una línea de tiempo de lo que hizo el EA en ese trade (entrada,
movimientos de SL/breakeven, parciales, cierre final), con veredicto de
Cumplimiento (dentro/fuera de método) ya calculado.

## 1. NUEVA TABLA SUPABASE: `trade_eventos`

- `id` (PK)
- `fp` (FK -> trades.fp)
- `tipo_evento` (enum: `entrada`, `breakeven`, `parcial`, `cierre`)
- `puntos_desde_entrada` (numeric)
- `precio` (numeric)
- `volumen_afectado` (numeric, para parciales)
- `timestamp` (timestamptz)
- `creado_en` (timestamptz default now())

RLS: mismo patrón que `trades` (usuario solo ve sus propios eventos, admin ve todos).

## 2. EA (Aurum_Guardian.mq5 o el EA principal que gestione la posición)

Añadir un `WebRequest` a un nuevo endpoint `/api/trade-evento` cada vez que:

- Se abre la posición (`tipo_evento='entrada'`)
- El EA mueve el SL por breakeven escalonado (`tipo_evento='breakeven'`,
  `puntos_desde_entrada` = nivel alcanzado)
- Se ejecuta un cierre parcial (`tipo_evento='parcial'`, `volumen_afectado`)
- Se cierra la posición completa (`tipo_evento='cierre'`)

Reutilizar la misma autenticación `ea_password` que ya usa `/api/trade-mt5`.

## 3. ENDPOINT: `/api/trade-evento`

Vercel serverless, mismo patrón que `/api/trade-mt5`.

- Valida `ea_password` del usuario
- Inserta fila en `trade_eventos`
- Idempotente por `(fp, tipo_evento, timestamp)` para evitar duplicados si el EA
  reintenta el `WebRequest`

## 4. FRONTEND: Diario (diario.js / diario.html)

Al renderizar una entrada del Diario cuyo `fp` coincide con un trade de
`fuente='ea'`:

- **Solo si `sl IS NOT NULL` y `tp IS NOT NULL`**, añadir debajo de la captura
  existente un bloque de línea de tiempo:
  - Query a `trade_eventos` filtrando por ese `fp`, ordenado por `timestamp`
  - Renderizar cada evento como fila: hora | tipo | detalle (puntos/precio)
  - Badge de veredicto arriba (reutilizar la misma lógica de Cumplimiento que
    ya existe en cumplimiento.js: dentro/fuera de método según Edge/Aire/Límite)
- **Si `sl` o `tp` son NULL** (sesión con corte/desconexión) o el trade no es de
  `fuente='ea'`: la entrada del Diario se muestra igual que ahora (solo captura +
  texto), sin línea de tiempo, sin veredicto de Cumplimiento, y **sin mensaje de
  error ni aviso** — el bloque simplemente no se activa.

## ORDEN DE IMPLEMENTACIÓN SUGERIDO

1. Tabla `trade_eventos` + RLS
2. Endpoint `/api/trade-evento`
3. Modificar el EA para mandar los 4 tipos de evento
4. Probar en cuenta Prueba unos días, confirmando en Supabase que llegan los
   eventos correctamente
5. Solo entonces, añadir el bloque de línea de tiempo al frontend del Diario,
   con la condición de `sl`/`tp` no nulos aplicada

## NO TOCAR

- La lógica de Cumplimiento existente (Edge/Aire/Límite) — solo reutilizarla,
  no reescribirla
- El endpoint `/api/trade-mt5` actual — el evento de entrada/cierre en
  `trade_eventos` es adicional, no sustituye el registro del trade en la
  tabla `trades`
- No intentar resolver aquí el problema de SL/TP nulos por desconexión — eso
  depende del VPS, que es un proyecto aparte
