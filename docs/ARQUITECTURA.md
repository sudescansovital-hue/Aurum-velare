# AURUM VELARE — Arquitectura Web
> Documento vivo. Se actualiza con el proyecto.  
> Última actualización: 26 de agosto de 2026  
> Para uso interno — contexto de desarrollo y nuevas sesiones de trabajo.

---

## ⚠️ Nota de continuidad (26/08) — este archivo estuvo 2 meses sin entradas nuevas

Entre el 02/07 y hoy, el trabajo real de cada sesión se documentó en
`PLAN_CORAZON_DATOS.md` (sesiones 12/07 en adelante — Token/ea_password,
cola duplicada, auditorías del 18/07 y 19/07, etc.), no aquí, pese a que la
regla de mantenimiento de arriba dice que este archivo es la única fuente
de verdad. La única excepción fue una rama sin fusionar
(`feature/estrategia-ab`, 09/08) que sí añadió una entrada aquí, pero nunca
llegó a `main` — se recupera parte de ella más abajo. A partir de hoy se
retoma la entrada por sesión aquí; para el detalle técnico completo de
cada una, `PLAN_CORAZON_DATOS.md` sigue siendo el brief de referencia (ver
regla #2 de mantenimiento, arriba) — este archivo se queda como índice/
resumen de alto nivel.

---

## Estado sesión 26 Ago 2026 — EA sin autenticar (Token vacío) + estrategia A/B desplegada

> Detalle completo, paso a paso, en `PLAN_CORAZON_DATOS.md` → "Sesión
> 26/08". Resumen aquí:

**Token/ea_password rotos en producción (3ª+ vez que pasa — ver también
sesiones 01/08, 05/08 y 08/08 en `PLAN_CORAZON_DATOS.md`, mismo patrón
recurrente sin causa raíz confirmada):** el campo `Token` del EA real
llevaba tiempo vacío (todos los eventos rechazados con 401). Como
`EA_SHARED_SECRET` es "Sensitive" en Vercel (irrecuperable — nota: el
01/08 se dejó anotado que se guardó como NO sensible; hoy se comprobó que
sí lo era, discrepancia sin resolver, revisar si vuelve a pasar), se
rotó por uno nuevo y se corrigió además un `ea_password` desincronizado
entre el EA real y Supabase. 34 eventos que se habían quedado atascados en
la cola de reintentos del EA (`aurum_cola_176821.txt`) se reenviaron a
mano vía API (idempotente por `position_id`/`fp`, sin duplicados) en vez
de borrarse como se hizo el 01/08 — no se perdió ningún dato.

**✅ RESUELTO (26/08) — Hallazgo #1 de la auditoría 09/08** (ver entrada
`Estado sesión 09 Ago 2026 (auditoría)` más abajo, recuperada hoy desde
`feature/estrategia-ab`): `ClasificarEstrategia()` ahora también se
ejecuta en `HandleDealOpen`/`SyncOpenPositions`/`SyncHistory48h` cuando el
SL ya viene puesto al abrir (Opción B), no solo cuando llega después. Antes
solo clasificaba en el caso raro; el caso normal del plan de lotaje fijo
se quedaba siempre sin clasificar.

**Verificado end-to-end con trade real:** `position_id 21890309`
(cuenta 176821, roderastrader@gmail.com) — abrió sin SL, clasificó
`estrategia:estructura` vía `original_capture`, cerró con beneficio
144,76€, confirmado con consulta real (service role, no anon key — RLS
bloquea lectura anónima de `ea_trades`/`trades`) el campo `estrategia`
poblado en la fila final de `trades`.

**Commit `980723d` en `main`, desplegado.** Se rescató de
`feature/estrategia-ab` (09/08) solo lo relacionado con estrategia
(`api/trade-mt5.js`, `EA_Aurum_Tracker_FIX.mq5`, `sql_estrategia.sql`) —
se descartó a propósito el resto de esa rama (`admin.js`/`gestion.js`/
`historial.js`), sin relación con el tema y con al menos una reversión de
un fix posterior de `main` (caché de `CUENTAS_AURUM` en `historial.js`).
La rama sigue sin borrar en el remoto, ya superada.

---

## Estado sesión 09 Ago 2026 (auditoría) — Barrido extensivo de código, mismo rigor que 03/07

> Recuperada hoy (26/08) desde `feature/estrategia-ab`, rama que nunca se
> fusionó a `main` — por eso esta entrada no apareció aquí hasta ahora,
> pese a ser del 09/08. Solo se trae el Hallazgo #1 (relevante y ya
> resuelto); el resto de hallazgos de aquella auditoría (#2-#8, admin
> email, código muerto, etc.) quedaron en la rama sin revisar hoy — no se
> asume su estado actual sin verificar contra código real primero.

### Hallazgo #1 — 🔴 CRÍTICO — `ClasificarEstrategia()` no se ejecuta en el caso normal de uso — ✅ RESUELTO (26/08)

`EA_Aurum_Tracker_FIX.mq5:1034-1046` (línea de la auditoría original),
causa raíz en `PendienteAgregar()`. La clasificación de estrategia A/B
solo corría dentro de `CheckOriginalesPendientes()`, gateada por
`!g_pend_sl_hecho[i]`. Pero `PendienteAgregar(pos_id, sl != 0.0, ...)`
marca `g_pend_sl_hecho = true` de inmediato si la posición abre **con SL
ya puesto** — que es el caso normal según el plan de lotaje fijo. Ningún
otro punto del EA llamaba a `ClasificarEstrategia()`. Resultado: `estrategia`
se quedaba NULL en prácticamente todos los trades reales, salvo el caso
raro de abrir a mercado sin SL y ponerlo después.

**Fix aplicado y verificado 26/08** (ver entrada de arriba, "Estado sesión
26 Ago 2026"): Opción B — clasificar también en `HandleDealOpen`,
`SyncOpenPositions` y `SyncHistory48h` cuando el SL ya está puesto al
abrir. Detalle técnico completo en `PLAN_CORAZON_DATOS.md` → "Sesión
26/08".

---

## Estado sesión 02 Jul 2026

### Completado en esta sesión

**MT5 — Congelación de terminal (RESUELTO)**
- Diagnóstico: `SESIONES_AURUM_v3.mq5` recreaba TODOS los rectángulos de sesión + noticias cada 1 segundo vía `OnTimer()`, y `EA_Aurum_Tracker.mq5` hacía `WebRequest` síncrono (10s timeout) directamente dentro de `OnTradeTransaction`, bloqueando el terminal en cada apertura/cierre/cambio de SL.
- Fix indicador (`SESIONES_AURUM_v3_FIX.mq5`): las sesiones solo se redibujan cuando cambia el día calendario (comparación de entero, ~gratis). El countdown (M5/M15/H1/H4) sigue actualizándose cada segundo, es barato.
- Fix EA (`EA_Aurum_Tracker_FIX.mq5`):
  - `OnTradeTransaction` ya nunca llama a `WebRequest` directamente — solo encola el evento en memoria (`g_cola`), instantáneo.
  - `OnTimer` procesa la cola completa cada **1 hora** (`IntervaloEnvioSegundos`, input, 3600 por defecto) — no en tiempo real, ya que el objetivo es registro/auditoría, no visualización en vivo en Aurum. **Esto es lo que está corriendo en producción ahora mismo.**
  - Timeout de `WebRequest` bajado de 10s a 4s.
  - Anti-duplicados: guard por firma de evento (`EsEventoDuplicado`) para apertura/cierre/parcial/SL — algunos brokers/cuentas Hedge disparan `OnTradeTransaction` dos veces para la misma transacción real.
  - Guard de doble sincronización: variable global de terminal (`GlobalVariableSet`) evita repetir `SyncHistory48h()` si el EA se recarga dos veces en <30s (p.ej. al recompilar con el chart abierto).
  - ⚠️ **Preparado pero NO aplicado todavía** (queda como versión alternativa lista para cuando se decida usarla): envío a hora fija diaria (`HoraEnvioDiario`, ej. 23h servidor, en vez de "cada hora desde que arranca") + persistencia de la cola en disco (`MQL5\Files\Common\aurum_cola_<cuenta>.txt`, sobrevive a cierres de MT5/PC apagado — importante para swing trades de varios días). Motivo de no aplicarlo aún: se decidió probar primero la versión más simple (cada hora, sin persistencia) antes de sumar más cambios de golpe.
  - ⚠️ Limitación conocida y sin solución posible: MT5 no permite EAs en móvil. Si se gestiona una operación desde el móvil mientras el PC/MT5 de escritorio está apagado, ese cambio no se captura (el EA no está corriendo). Única solución real: VPS (24/7, independiente del PC personal) — pendiente de configurar, candidatos: VPS nativo de MetaQuotes (pestaña "VPS" en MT5) o el que ofrezca el broker/prop firm si aplica.
- Estado de pruebas: EA probado en vivo en cuenta demo Roderas (152034) el mismo día 02/07 — apertura, parcial, SL a break even, todo registrado y sin duplicados tras el fix. Solo unas horas de observación en ese primer día, no una prueba prolongada todavía. Indicador de sesiones corregido pero **aún no probado en el chart** (pendiente). Willian no ha probado el EA en su cuenta — solo se usó su cuenta para verificar el fix del bug de `puntos` en Cumplimiento sobre datos ya importados.

**Admin panel — activación de EA sin SQL manual (COMPLETADO)**
- Añadido checkbox `tiene_ea` en el modal de edición de usuario (`index.html`), junto al de "Activo".
- `admin.js`: carga `tiene_ea` al abrir el editor, lo guarda al hacer submit, y muestra badge "EA ✓" en la tabla de usuarios.
- Columna `tiene_ea` (BOOLEAN DEFAULT false) creada en `usuarios_aurum` vía SQL (`ADD COLUMN IF NOT EXISTS`).
- Activado para `roderastrader@gmail.com` — resolvió los 403 "El usuario no tiene acceso al EA Aurum".
- Desplegado a producción (commit `da7a648`).

**Bug de cálculo de `puntos` en Cumplimiento (PARCIALMENTE RESUELTO)**
- Diagnóstico: en `parser.js` (ambos bloques, MT5 y cTrader), el campo `puntos` (usado por el apartado Cumplimiento para clasificar EDGE/AIRE/LÍMITE/FUERA) se calculaba como `|precio_entrada - precio_cierre|` en vez de `|precio_entrada - sl|`. Esto marcaba trades ganadores que corrieron mucho como si tuvieran un SL excesivo.
- Fix aplicado en `parser.js`: usa `|pe - sl|` cuando el SL es válido (no nulo, no 0, no ≈ precio de entrada); si no, cae al fallback anterior. Desplegado a producción (commit `66a87b6`).
- SQL retroactivo corrido en Supabase: recalculado `puntos` para los 599 trades existentes con SL real registrado (de 1341 totales; 742 sin SL registrado se quedan con el fallback).
- **Limitación de fondo identificada, sin solución posible en datos ya importados**: para trades con gestión activa (break even, trailing), el export del broker solo guarda el **último valor de SL**, no el historial de cómo se fue moviendo. Un trade que empezó con SL de 8 puntos y se movió a break even/ganancia queda registrado con ese último SL, dando una distancia "puntos" grande que no refleja el riesgo real asumido. Verificado con un caso real (Willian, 1.00 lotes, +3571.52$, SL guardado del lado de ganancia → puntos=110.46, dato correcto matemáticamente pero no representativo del riesgo real).
- Este problema **no existe** para trades registrados por el EA en adelante, porque captura cada cambio de SL como evento independiente (histórico completo, no solo la foto final).

**Bug de clave foránea en `trade_parciales` (RESUELTO)**
- Al probar el EA en vivo con Roderas, un cierre parcial falló al guardarse en Supabase con error 500 / código Postgres `23503` (violación de clave foránea).
- Causa: la restricción `trade_parciales_fp_trade_fkey` exigía que `fp_trade` existiera en la tabla `trades` (la de imports manuales). Pero `api/trade-mt5.js` (el endpoint que recibe eventos del EA) construye `fp_trade` a partir de la tabla `ea_trades` (tabla separada para posiciones en vivo, sin histórico importado). Como esa posición nunca se importó a mano, no existía en `trades`, y el INSERT fallaba.
- Fix: `ALTER TABLE trade_parciales DROP CONSTRAINT trade_parciales_fp_trade_fkey;` — se quitó la restricción a nivel de BD porque el código ya valida la integridad en ambos caminos (`historial.js` inserta el trade padre justo antes que sus parciales; `api/trade-mt5.js` ya comprueba que la posición exista en `ea_trades` antes de insertar el parcial).
- Verificado en Supabase tras el fix: el parcial atascado (`deal_id 16053495`) se guardó correctamente en el siguiente reintento automático de la cola.
- Nota de diseño: esto confirma que `ea_trades` y `trades` son estructuras paralelas sin unificar del todo — conecta directamente con el trabajo pendiente del campo `fuente` (ver más abajo).

### Pendiente (decidido posponer, no urgente)

- **Validación extra de SL "del lado equivocado"**: descartar como inválido un SL que esté en el lado de ganancia (por debajo de entrada en sell, por encima en buy) además del caso SL=0, usando el fallback en esos casos también.
- **Campo `fuente` (`'import'` vs `'ea'`) en `trades`**: ya estaba en el backlog de antes, hoy se confirmó su necesidad — permite que trades importados a mano y trades auditados por el EA convivan sin romper continuidad de etapas/ciclos/OZT, con un badge visual distinguiendo el origen. SQL migration y diffs de `historial.js` para esto siguen sin aplicar.
- **VPS para el EA**: pendiente de configurar, para que el registro no dependa de tener el PC encendido. Ver pestaña "VPS" nativa de MT5 como primera opción a explorar.
- **Indicador de sesiones sin probar**: `SESIONES_AURUM_v3_FIX.mq5` está corregido pero no se ha cargado aún en el chart para confirmar que funciona bien en la práctica.
- **Repo `aurum-web-base` con ruido sin resolver**: `node_modules` trackeado en git (debería estar en `.gitignore`), y cambios sin commitear en `preguntas.js`, `notify-registro.js`, `stripe-webhook.js` de sesiones anteriores — revisar si es trabajo en curso a retomar o descartar.

### ⚠️ Nota importante — archivo duplicado detectado hoy
Existían **dos** `ARQUITECTURA.md`: uno en la raíz del repo (desactualizado desde el 7 Jun) y este de `docs/` (el correcto, el que se lee al inicio de cada sesión). La sesión de hoy se documentó por error en el de la raíz primero y tuvo que corregirse/trasladarse aquí. **Siempre editar y verificar `docs/ARQUITECTURA.md`, nunca el de la raíz.** Pendiente: decidir si el `ARQUITECTURA.md` de la raíz se borra (para eliminar la ambigüedad de una vez) o se deja como redirect.

### Estado actual por repo (actualizado)

| Repo | Branch | Último commit relevante |
|---|---|---|
| sudescansovital-hue/Aurum-velare | main | `7161309` docs: actualizar arquitectura — sesión 02/07/2026 |

---

## Estado sesión 24 Jun 2026

### Implementado hoy
- **Umbrales SL personalizables por usuario:** columnas `sl_edge`, `sl_aire`, `sl_limite` añadidas a `usuarios_aurum`. Configurables desde Mi Gestión → Cumplimiento. Defaults: 11 / 25 / 50
- **Fix criterio "dentro del método":** `dentro` ahora = `puntos <= limAire` (antes era `puntos <= 11` por error). Todas las categorías usan variables leídas de `window.usuarioActual`
- **Nuevos campos en `trades`:** `precio_entrada` y `precio_cierre` ahora se guardan al importar historial
- **Estrategia DELETE+INSERT en reimport:** al subir un archivo, se borran todos los trades de esa cuenta (usuario + cuenta + cuenta_numero) y se reinsertan desde el archivo. Garantiza que BD refleja exactamente el archivo subido
- **Cumplimiento de parciales:** bloque "Gestión activa · Parciales" en pestaña Cumplimiento de Mi Gestión. Consulta `trade_parciales` via `supaGet`, agrupa por `fp_trade`, cruza con trades activos por `t.fp`. Muestra ratio trades con gestión activa vs salida única, distribución por zona TP1/TP2/TP3 con % dentro/fuera y detalle de parciales fuera de zona
- **Umbrales TP parciales personalizables:** columnas `tp_parcial1 INT DEFAULT 18`, `tp_parcial2 INT DEFAULT 33`, `tp_parcial3 INT DEFAULT 50` añadidas a `usuarios_aurum`. Configurables desde panel Umbrales en Cumplimiento (misma fila que SL). Guardado via `supaPatch`. Función `guardarConfigTpParciales` en gestion.js

### Pendientes próxima sesión (por orden de prioridad)
1. Cabecera Trade Record P&L incorrecto en Retos — dos cálculos desincronizados
2. Fechas "13 Jun – 13 Jun" en cuentas de Roderas — fp de cTrader sin fecha
3. Badge Challenge/Real incorrecto
4. Admin: mover trades a Externa automáticamente al cambiar número de cuenta
5. OZT: descuento no se aplica al registrarse en reto
6. Nivel sidebar no coincide con Mi Proceso

---

## Estado sesión 13 Jun 2026

### Fixes aplicados
- Parser MT5: filtra filas de "orden" (precio = market) con guard pe===null || pc===null
- Parser MT5: fp ahora incluye fecha real (2026.06.12_posicionId)
- Parser MT5: beneficio suma comisiones y swaps si existen columnas
- Historial y Dashboard: paginación de 1000 en 1000 para superar límite Supabase

### Estado de datos Roderas (sudescansovital@gmail.com) a 13 Jun
- Cuenta Maestra 7747760: 124 trades, +1540$, WR 51.6%
- Cuenta Retos 4011477: 698 trades, -1430$, WR 51.9%
- Cuenta Prueba 7751904: 6 trades, -1239$, WR 0%
- Cuentas Externas: 135146 (107t), 7741924 (131t), 7746279 (75t)

---

## Qué es Aurum Velare

Sistema web de acompañamiento para traders de XAU/USD. No es una academia ni un servicio de señales. Es un entorno donde el trader construye su propio proceso con datos reales, en entorno simulado, acompañado de una comunidad organizada por perfiles (animales) y avanzando por etapas ganadas con datos, no con tiempo.

**Stack:** HTML + CSS + JS vanilla · Supabase (auth + base de datos) · Dominio: aurumvelare.com  
**Repo:** sudescansovital-hue/Aurum-velare (rama: main)  
**Local:** C:\Users\boli-\aurum-web-base  
**Supabase:** rsrbxcvlnbwpiyhumqmt.supabase.co  
**Tablas:** trades · historiales · usuarios_aurum

---

## Vocabulario — usar siempre estos términos

| Término | Definición |
|---|---|
| **Camino** | El acceso que compra un usuario. Nunca "pack" ni "membresía". Tipos: Umbral (77€) · Raíz (111€) · Senda (222€) · Cima (333€) |
| **Navegador** | Barra superior con enlaces de sección |
| **Sala** | Espacio de comunidad. Cada animal tiene la suya. Hay salas abiertas y sala privada por invitación del Águila |
| **Historial** | Archivo CSV de operaciones importado desde MT5/cTrader |
| **Trade Record** | Tracker personal del usuario — análisis de sus datos de trading |
| **Carpeta de cuenta** | Cada usuario tiene exactamente 4: Maestra · Retos · Prueba · Externa |
| **Historial Externo** | Carpeta "Externa" — agrupa todos los historiales que no son Maestra/Retos/Prueba |
| **Ciclo 111** | Bloque de 111 trades. Unidad de medida del proceso Aurum |
| **Etapa** | Nivel de progreso del usuario (0 a 5). Se gana con datos reales |
| **Animal** | Perfil de trader: Águila · Hormiga · León · Elefante · Oso · Toro · Lobo |
| **OZT** | Moneda interna. Se gana en retos/ciclos/etapas o se compra. Se usa para resetear cuentas o entrar en retos especiales |
| **Tablillas** | Sección filosófica inspirada en el Camino de Santiago |
| **V1** | Funcionalidad actual o en desarrollo inmediato |
| **V2** | Funcionalidad futura — requiere planificación o coste adicional |

---

## Usuarios del sistema

| Email | Usuario | Rol |
|---|---|---|
| roderastrader@gmail.com | Willian | Admin / Águila |
| sudescansovital@gmail.com | Roderas | León · Etapa 3 · Proceso real |
| boli-al@hotmail.com | Mara | Hormiga · Pruebas |

---

## Tipos de usuario y accesos

| Tipo | Acceso |
|---|---|
| **Visitante** | Sin registro. Ve: Inicio, El Proceso, Tablillas, vista previa de Salas, Evalúame |
| **Usuario con Camino** | Acceso completo a Salas, Trade Record, Mi Proceso, Mi Gestión |
| **Usuario con Camino Cima** | Igual que anterior + todas las salas sin límite de animal |
| **Admin — Águila** | Acceso total. Panel admin, etapas, retos, eventos, salas privadas |

**Bloqueo páginas privadas:** Mi Proceso y Mi Gestión aparecen en el navegador para todos. Sin Camino → mensaje: *"Necesitas un Camino para acceder a esta sección."*

---

## Páginas — índice

1. INICIO — público
2. EL PROCESO — público
3. LAS SALAS — vista previa pública · interior requiere Camino
4. ✦ EVALÚAME — público para evaluación · privado para Trade Record
5. TABLILLAS — público
6. MI PROCESO — privado · requiere Camino
7. MI GESTIÓN — privado · requiere Camino

---

## PÁGINA 1 — INICIO

**Acceso:** Público  
**Estado V1:** Funciona — revisar CTA y nomenclatura

### Bloques de contenido

- **B1 — Hero:** "Trading XAU/USD con proceso real." + subtítulo + 2 botones CTA
- **B2 — Qué es Aurum:** Texto filosófico + cita
- **B3 — Los 7 animales:** Águila · Hormiga · León · Elefante · Oso · Toro · Lobo — cada uno con valores y enlace "Leer su historia"
- **B4 — Las etapas:** 0=Silencio · 0.5=Umbral · 1=Estructura · 1.5=Fractura · 2=Claridad · 2.5=Consistencia · 3=Confianza · 4=Rentabilidad · 4.5=Vuelo · 5=✦Oro
- **B5 — El marco:** Hasta etapa 2 lo define Aurum. A partir de etapa 2 lo construye el trader
- **B6 — Historia de Roderas:** En proceso desde 2018. CTA reflexivo
- **B7 — Acceso por tandas:** Modelo de acceso limitado + formulario "Apuntarme"

### Pendiente
- → Cambiar "Ver los Packs" por "Ver los Caminos" en botones CTA
- → Decidir si animales y etapas se quedan aquí o se mueven a El Proceso
- → Inicio es la página más importante para SEO — no eliminar contenido sin valorar impacto

---

## PÁGINA 2 — EL PROCESO

**Acceso:** Público  
**Estado V1:** Base sólida — ampliar contenido

### Bloques de contenido

- **B1 — Cómo funciona:** 4 pasos: Evaluación → Datos → Estructura → Evolución por etapas
- **B2 — Los Caminos:**
  - Umbral · 77€ · 22 días · Al vencer: 24h con 10% descuento en cualquier Camino
  - Raíz · 111€ · Pago único · El inicio real
  - Senda · 222€ · Pago único · Más elegido · Incluye análisis de cumplimiento mensual automático
  - Cima · 333€ · Pago único · Todas las salas sin límite de animal
- **B3 — Sistema OZT:** Cómo se ganan, para qué sirven
- **B4 — CTA Evalúame:** Llamada a evaluación antes de entrar

### Contenido incluido en todos los Caminos
- 3 cuentas MT5 simuladas (Maestra · Retos · Prueba)
- Mi Proceso y Mi Gestión
- Sala de su animal
- Retos con OZT

### Pendiente
- → Cambiar "pack" por "Camino" en todos los textos

---

## PÁGINA 3 — LAS SALAS

**Acceso:** Vista previa pública · Interior requiere Camino  
**Estado V1:** Revisar lógica de acceso

### Lógica de acceso
- **Sin Camino:** Ve todas las salas con estado (En vivo / Cerrada) pero NO puede entrar
- **Con Camino:** Entra a su sala de animal + salas abiertas + extras asignadas por el Águila
- **Con Camino Cima:** Entra a todas las salas sin restricción

### Salas del sistema
| Sala | Estado | Notas |
|---|---|---|
| Hormiga | Cerrada | Disciplina · Repetición |
| Oso | Cerrada | Paciencia · Protección |
| Toro | Cerrada | Expansión · Momentum |
| Elefante | Cerrada | Memoria · Control emocional |
| León | En vivo | Presencia · Convicción |
| Lobo | Cerrada | Instinto · Adaptación |
| Sala Abierta | En vivo | Todos los animales · Todos los Caminos |
| Sala Evento | Cerrada | Convocatorias del Águila con fecha/hora |
| Sala Privada | Por código | Acceso dado por el Águila con código |

### Navegación entre salas
- **Navegador superior LAS SALAS:** muestra todas las salas a cualquier visitante
- **Menú izquierdo Mi sala** (dentro de Mi Proceso): muestra todas las salas + privadas asignadas
- **Botón "Entrar a la sala"** en Mi Proceso: acceso directo a la sala del animal del usuario

### Tecnología
- V1: audio + pantalla compartida
- V2: videollamada completa con cámara (como Zoom pero dentro de Aurum)

---

## PÁGINA 4 — ✦ EVALÚAME

**Acceso:** Público para evaluación · Privado (requiere Camino) para Trade Record  
**Estado V1:** Bugs activos en subida de historiales

### Vista pública — Evaluación 33€
- Mínimo 111 trades en XAU/USD
- Análisis: win rate · R/R · esperanza · horas · lotajes · cumplimiento
- Resultado: etapa Aurum recomendada + veredicto personal
- Los 33€ se descuentan si entra al proceso en las 6h siguientes
- Pago por Stripe · código por email inmediatamente

### Vista privada — Trade Record (usuarios con Camino)

#### Las 4 carpetas fijas por usuario
Cada usuario tiene EXACTAMENTE estas 4 carpetas. El sistema asigna cada historial subido automáticamente:

| Carpeta | Descripción |
|---|---|
| **Maestra** | Cuenta principal del proceso. Una sola |
| **Retos** | Cuenta de retos OZT. Una sola |
| **Prueba** | Cuenta de prueba/challenge. Una sola |
| **Externa** | Agrupa TODOS los historiales externos (challenges anteriores, brokers, cuentas perdidas). Sin límite de archivos pero sin duplicados. Una sola carpeta |

#### Pestañas — comportamiento contextual
Las pestañas NO cambian. Cambian los datos según la cuenta seleccionada. Vista Global = todas las cuentas juntas.

| Pestaña | Qué muestra |
|---|---|
| **TRADE RECORD** | Vista global: resumen Global + Maestra + Retos + Prueba. Comparativa por tipo de trade. Patrones comunes. Al clicar en cuenta → las demás pestañas se actualizan |
| **CICLO 111** | Ciclo actual y anterior. Progreso visual trade a trade. WR · P&L · R/R · Esperanza · Cumplimiento · Puntuación C1 · Veredicto Aurum automático |
| **HORARIOS** | Mapa horario con sesiones (Asia/Londres/NY). WR por hora en colores (verde ≥70% · ámbar 50-70% · rojo <50%). Patrones detectados |
| **EQUITY** | Curva de equity acumulada. Desglose mensual |
| **CUMPLIMIENTO** | % trades dentro/fuera del método. Distribución SL (Edge/Aire/Límite/Fuera). Lectura Aurum mensual automática. **Campo de anotación — mantener** |
| **ESTADÍSTICAS** | Racha · Drawdown · Mejor/Peor trade · TP alcanzado · Revenge trading detectado · Veredicto del inversor |
| **DIARIO** | Diario personal del proceso. Solo lo ve el usuario. Nueva entrada + historial de entradas |
| **HISTORIAL EXTERNO** | Lista de todas las cuentas subidas con métricas. Elimina duplicados automáticamente |

#### Pendiente V1
- → Quitar "Nueva entrada" de: Trade Record · Ciclo 111 · Horarios · Equity · Estadísticas · Historial Externo
- → Mantener campo de anotación solo en Cumplimiento
- → Diario: mantener estructura V1 · evaluar servidor dedicado para V2

#### V2 — Diario avanzado
- ⚪ Diario unido al calendario personal del usuario
- ⚪ Anotaciones con imágenes adjuntas
- ⚪ Sistema inteligente que detecta las mejores reflexiones automáticamente
- ⚪ Diferenciación de precio en Caminos para cubrir coste de almacenamiento

---

## PÁGINA 5 — TABLILLAS

**Acceso:** Público — abierto a todos  
**Estado V1:** Funciona — pendiente integración social

### Qué es
Página filosófica inspirada en el Camino de Santiago (~1 km del hogar de Roderas). Preguntas grabadas sin nombre ni respuesta. Separada del proceso de trading — es sobre el proceso de vida que rodea al trading.

### Bloques
- **Hero:** "No buscamos respuestas. Buscamos mejores preguntas."
- **Las que quedaron:** Selección de preguntas publicadas por Aurum
- **Tu pregunta — Digital:** Cualquier visitante envía su pregunta (máx 280 chars). Aurum revisa. Si resuena, la publica. Gratuito. Email opcional para aviso
- **Tu tablilla — Física:** Pregunta grabada en madera con láser. Se lleva al Camino o se queda. Envío incluido

### Lógica
- No se publican todas — solo las seleccionadas por el Águila (moderación manual)
- Las preguntas enviadas se guardan para revisión

### Pendiente
- → Integración con red social (X / Instagram) para difusión automática
- → Precio y proceso de pedido para tablilla física
- → Decidir mecanismo de moderación: ¿email al admin? ¿panel en la web?

---

## PÁGINA 6 — MI PROCESO

**Acceso:** Privado — requiere Camino activo  
**Estado V1:** Funciona — lógica de etapas pendiente

### Dashboard principal
- Bienvenida con nombre + fecha de inicio
- Métricas: Trades totales · Win Rate global · P&L acumulado · Días en proceso
- Nivel actual + % hacia siguiente etapa
- Ciclo actual + trades completados de 111
- OZT acumulados + retos completados
- Sala activa del animal con estado y botón Entrar
- Retos activos (equipo + individuales) con progreso

### Menú izquierdo — navegación interna
| Botón | Destino |
|---|---|
| Mi proceso | Dashboard principal |
| Mi sala | Todas las salas del sistema (puede entrar a las que tiene acceso) |
| Mi gestión | Trade Record completo |
| Calendario | Eventos Aurum + disponibilidad del usuario |
| Retos | Retos activos + completados + ranking de sala |
| OZT | Saldo · usos · tienda |

### Panel derecho
Ranking de sala por OZT — siempre visible

### Etapas
0=Silencio · 0.5=Umbral · 1=Estructura · 1.5=Fractura · 2=Claridad · 2.5=Consistencia · 3=Confianza · 4=Rentabilidad · 4.5=Vuelo · 5=✦Oro

### Pendiente V1
- → Lógica de etapas: contenido diferente según etapa (usuarios en etapas bajas solo ven Trade Record e Historial Externo)
- → Admin debe poder asignar/editar etapa desde panel admin

### V2 — Calendario personal
- ⚪ Calendario personal separado del calendario de Aurum — para registro visual de entradas y sesiones
- ⚪ Unido al Diario del proceso

---

## PÁGINA 7 — MI GESTIÓN

**Acceso:** Privado — requiere Camino activo  
**Nota:** Es el Trade Record completo. Ver documentación detallada en PÁGINA 4 — sección Vista privada.

---

## 🔴 BUGS ACTIVOS

| # | Bug | Impacto |
|---|---|---|
| 1 | Parser cTrader no testeado | No se puede verificar que los historiales se importen bien |
| 2 | Al subir historial aparece Challenge/Demo en lugar de Maestra/Retos/Prueba/Externa | Los datos se asignan a la carpeta incorrecta |
| 3 | Aparece entrada "(sin cuenta)" — el sistema no asigna la carpeta al subir | Datos huérfanos fuera de las 4 carpetas |
| 4 | Saldo OZT muestra 0 disponibles con 247 en histórico | El cálculo disponible = histórico - gastado está roto |
| 5 | Sección Retos no muestra historial completo | El usuario no ve todos sus retos completados |
| 6 | Verificar Ciclo111/Horarios/Equity/Cumplimiento contra historial externo real | Posibles datos incorrectos en el Trade Record |

---

## Prioridades técnicas

### 🔴 Urgente
1. Testear parser cTrader
2. Corregir asignación de carpeta al subir historial (Maestra/Retos/Prueba/Externa)
3. Corregir cálculo saldo OZT disponible
4. Historial completo en sección Retos

### 🟡 Importante
5. Verificar datos Trade Record contra historial real
6. Mensaje de bloqueo correcto en Mi Proceso y Mi Gestión sin Camino
7. Cambiar "pack" → "Camino" y "Ver los Packs" → "Ver los Caminos" en toda la web
8. Quitar "Nueva entrada" de pestañas que no lo necesitan

### ⚪ Backlog
9. Panel admin: gestión de cuentas, numeración, asignación de etapas
10. Lógica de etapas: contenido diferente por etapa
11. Sala privada: acceso por código del Águila
12. Tablillas: integración con red social
13. Tablilla física: proceso de pedido y envío
14. SEO · páginas legales · Stripe/desistimiento
15. Subida de 3 historiales pendientes de Roderas

---

## Datos — Supabase

| Tabla | Qué guarda |
|---|---|
| trades | Operaciones individuales por usuario |
| historiales | Historiales subidos agrupados por carpeta y usuario |
| usuarios_aurum | Perfil: nombre · animal · etapa · Camino · fecha inicio · OZT · umbrales SL |

### Columnas relevantes — trades
| Campo | Tipo | Descripción |
|---|---|---|
| fp | TEXT PK | Fingerprint único del trade (`YYYY.MM.DD_positionId` en MT5) |
| usuario_email | TEXT | Email del usuario propietario |
| cuenta | TEXT | Nombre de la carpeta: Cuenta Maestra / Retos / Prueba / Externa |
| cuenta_numero | TEXT | Número MT5/cTrader de la cuenta (ej: `7747760`) |
| fecha | TEXT | Fecha de apertura `YYYY.MM.DD` |
| ganadora | BOOLEAN | `true` si beneficio > 0 |
| beneficio | NUMERIC | P&L neto (incluye comisiones y swap) |
| puntos | NUMERIC | SL risk en puntos: `abs(pe - sl)` si SL existe, si no `abs(pe - pc)` |
| precio_entrada | NUMERIC | Precio de entrada del trade |
| precio_cierre | NUMERIC | Precio de cierre del trade |
| sl | NUMERIC | Stop Loss de cierre (el que aparece en el historial MT5 al cerrar) |
| tp | NUMERIC | Take Profit |
| hora | INT | Hora de apertura (0–23) |
| dia | INT | Día de semana (0=Lun … 6=Dom) |
| dur_min | INT | Duración en minutos |

### Columnas relevantes — usuarios_aurum
| Campo | Tipo | Descripción |
|---|---|---|
| sl_edge | INT | Umbral SL zona Edge (default 11 puntos) |
| sl_aire | INT | Umbral SL zona Aire (default 25 puntos) |
| sl_limite | INT | Umbral SL zona Límite (default 50 puntos) |

### Qué se guarda y qué no
- ✓ SÍ: trades · historiales · perfil de usuario · OZT · entradas de diario (V2)
- ✓ SÍ: preguntas de Tablillas enviadas para revisión
- ✗ NO: páginas estáticas (Inicio · El Proceso · estructura de Salas)
- ✗ NO (por ahora): tablillas publicadas — son contenido estático gestionado por el admin
