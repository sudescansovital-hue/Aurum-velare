# Estado — análisis post-cierre: FASE 1 (examen de la EA) + FASE 2 (Diario web)

> Actualizado 06/10/2026, noche (Diario al instante desde `ea_trades`, bloque "Hoy" y plan del trader en producción; **un push a `main` despliega solo**). Antes, 06/10 (cierre de sesión: decisiones y pendientes abajo; "Edge por cuenta"; "Mis reglas"; propuesta "Mi proceso"). Antes: 05/10/2026 (post_cierre automatizado con tarea programada; fallo 5 de la EA). Antes: 02/10/2026. **FASE 2 en producción** (primer deploy `cdede9a` /
> `aurum-velare-cw5la96zd`; el anterior a la FASE 2, para rollback, era
> `aurum-velare-9hp3r9l3q`). Criterios de análisis hoy: **v6**. FASE 1
> terminada el 29/09 (298 trades, en seco).

---

## Decisiones del 06/10

- **El Diario es SOLO para trades auditados por la EA** (`post_cierre_analisis`
  y, desde la noche del 06/10, también los cerrados de `ea_trades` que aún no
  tienen análisis: salen al momento como "Análisis pendiente").
  Los trades importados a mano se quedan en el Trade Record; no entran en el
  Diario ni en sus niveles. Por eso en la Maestra el Diario ve 65 trades (desde
  julio) y el análisis de edge, 242 (desde abril).
- **Todos los niveles de Mis reglas son AVISOS:** ni Aurum ni la EA cierran el
  día ni bloquean operaciones; el trader decide. El Diario solo muestra cuándo
  se llegó a cada nivel, si se siguió operando y qué pasó después ("te sirvió" /
  "error").
- **Regla real de Roderas** (en Mis reglas, carpeta "Todas"): pérdida máxima por
  trade 500 $; día −800 $ «Límite» y −1.100 $ «Cierre obligatorio»; día +250 $
  «Día bueno», +500 $ «Oportunidad» y +1.500 $ «Asegurar».
- **Plan del trader (noche del 06/10):** en Mis reglas, cada nivel puede llevar
  "qué haces al llegar"; el Diario lo recuerda ese día ("Tu plan dice: …").
  También es solo un aviso. Con un nivel de pérdida ya alcanzado, "Hoy" no
  enseña cuánto falta para el de beneficio (sería una invitación a recuperar).

## Pendientes, en orden (06/10)

1. **Semana(s) de observación sin tocar código:** confirmar con trades reales
   MFE/MAE (fallo 1), el breakeven (fallo 3) y los avisos de niveles en el
   Diario. Además, comprobar con la sesión del usuario el Diario al instante y
   el plan (lista en la sección "Diario al instante y plan del trader").
   Después, **fusionar `feature/ea-sync` en `main`**.
2. **Siguiente gran paso: rehacer "Mi proceso"** (sección "Mi proceso: Tu
   situación y barra por días limpios", justo debajo). Orden 0-1-2-3; cada
   fase se enseña antes de desplegar.
3. **Mis reglas, fase 3:** panel del admin con candado. Ojo: con el trigger
   actual, si el admin fija un nivel más estricto el usuario ya no puede editar
   su fila de ese nivel (ni el nombre ni el plan) sin bajar antes el importe;
   resolverlo al hacer esta fase (ver "Diario al instante y plan del trader").
4. **Frase del runner con cada parcial por separado.**
5. **Punto 4 — velas desde la EA y análisis en el servidor** (sección
   "Siguiente gran paso (02/10)", pasos 3 y 4).
6. **Capturas por trade** en la carpeta local del usuario (ver "Junto a este
   paso" más abajo y "vincular capturas a cada trade" en Siguiente paso).
7. **Rango y recorrido diario en pts.**
8. **Rehacer Evalúame.**
9. **Guía "Cómo funciona Aurum".**
10. **Modo claro.**

Pendiente menor: el admin se reconoce por email en el SQL de Mis reglas (ver
sección Mis reglas); cambiarlo cuando haya más de un admin.

---

## Mi proceso: Tu situación y barra por días limpios (06/10) — PROPUESTA, sin código

Pendiente nº 2, después de las semanas de observación. Análisis hecho sobre
`main` el 06/10 (solo lectura). Nada de esto está implementado.

### Análisis: qué hay hoy en "Mi proceso"

Casi todo sale de `buildDashboardHero()` (`gestion.js`). Los trades son
`AURUM_TRADES.todos` = **todas las filas de `trades` del usuario**
(`actualizarDashboard()`, `app.js`): todas las cuentas mezcladas (Maestra,
Prueba, Retos y antiguas), importadas a mano y de la EA, sin filtro.

| Bloque | Cálculo | Problemas |
|---|---|---|
| Trades totales | `todos.length` | Incluye Prueba, cuentas antiguas y las filas rotas de junio (precio 0), que Cumplimiento sí filtra. |
| Win rate global | ganadoras / total (1 decimal); ganadora = `beneficio > 0` (`parser.js`) | Los BE cuentan como perdedoras. Mezcla cuentas. |
| P&L acumulado | Σ `beneficio` | Suma Prueba con Maestra: no dice si eres rentable. HTML "entorno simulado", JS lo cambia a "entorno real". |
| Días en proceso | `fecha_entrada` o `created_at` → hoy | Subtítulo "desde el 1 feb 2026" fijo en el HTML. |
| Nivel actual | `usuarios_aurum.etapa` → lista de 12 nombres; solo lo cambia el admin (`admin.js`, guarda en `etapa_historial`) | `etapa ? etapa : 1` → la etapa 0 (Descubrimiento) nunca se muestra. |
| **% de etapa/nivel** | **Es el % del ciclo de 111 trades:** `(trades % 111) / 111` | No mide nada de la etapa. Vuelve a ~1% cada 111 trades. El "→ Confianza" del recuadro izquierdo está fijo en el HTML (sin id). |
| Ciclo actual | `floor(trades/111)+1` + trades del ciclo en curso | Mismo conteo mezclado. |
| OZT | `ciclos×10 + floor(trades/1111)×50 + etapa×30 + ganados retos + comprados − gastados` | No se guarda: se recalcula y se infla con Prueba/duplicados. "0 retos completados" (`dash-ozt-retos`) y `dash-ozt-widget-sub` no los rellena nadie. |
| Recuadro "Tu nivel" | Mismo nivel; barra = % del ciclo | Ver arriba. |
| Etapas completadas | `etapa_historial` (`tablillas.js`) | Bien. |
| Ranking / Sala | Solo el propio usuario; "Sala León" fijo | — |

### Propuesta A — sección "Tu situación"

Arriba del panel de inicio, tras el saludo; los 4 números pasan a una línea
pequeña. Módulo nuevo y aislado `tu-situacion.js` (mismo patrón que
`diario-analisis.js` y `mis-reglas.js`: solo lee globales y pinta en su
bloque). Cada frase enlaza al Diario.

Ejemplo (cifras inventadas):

```
TU SITUACIÓN · actualizado hoy 09:12
 MAESTRA · 167807        ✓ RENTABLE
 Últimos 90 días: +2.340 $ · 118 trades · PF 1,34 · +19,8 $/trade
 PRUEBA · 7747760        ✗ NO RENTABLE
 Últimos 90 días: −410 $ · 64 trades · PF 0,88
 RETOS · —               Sin trades suficientes (mín. 30)

 EVOLUCIÓN MES A MES · Maestra   [Maestra] [Prueba] [Retos]
   may    jun    jul    ago    sep    oct
  −320   +180   +910   −140  +1.210  +360 (en curso)

 ✓ LO QUE HACES BIEN                    ✗ LO QUE TE CUESTA
 1. Dejar runners: +640 $               1. Seguir tras «Límite»: 7 veces, −1.180 $
 2. Esperar 15 min tras cerrar          2. TP1 no asegurado: ~870 $
 3. Parar en «Día bueno»: 11 de 14      3. Vueltas de posición: 6, −420 $

 ◆ REGLA DE LA SEMANA (W41)
   «Al llegar a −800 $, para.»
   Esta semana: cumplida 2 de 2 días en que llegaste al nivel.

 Base: 182 trades de trades · 65 auditados por la EA (Diario)
```

- **Rentable por cuenta:** `AURUM_TRADES` por número de cuenta (criterio de
  `getTradesActivos()`). Rentable = > 0 $ y PF ≥ 1,1; En equilibrio = PF
  0,9–1,1; No rentable = resto. Mínimo 30 trades en 90 días, si no "Sin datos
  suficientes". Vale para cualquier usuario, con EA o sin ella.
- **Mes a mes:** `AURUM_TRADES`, P&L por mes de cierre y cuenta, últimos 6 meses.
- **3 aciertos / 3 errores:** de "Qué te conviene" (`_daConclusiones`,
  `diario-analisis.js`). Cambio pequeño: separar `_daConclusionesTodas()` que
  devuelve todas con marca acierto/error; `_daConclusiones` sigue devolviendo
  lo mismo (el Diario no cambia). Si hay menos de 3, se muestran las que haya.
- **Regla de la semana:** el error que más dinero cuesta, calculado con datos
  hasta el domingo anterior (no cambia a mitad de semana); debajo, cómo vas esta
  semana. Sin tabla nueva. Más adelante el admin podría fijarla (fase 3 de Mis
  reglas).
- **Ojo:** aciertos/errores/regla solo existen con trades auditados por la EA
  (hoy solo `POST_CIERRE_EMAIL`, pendiente 5); para otros usuarios: "Disponible
  cuando tus trades pasen por la EA". Y `_daCargar()` sale sin esperar si ya está
  cargando: compartir la carga con el Diario, no duplicarla.

### Propuesta B — barra de etapa por días limpios

Se mide con los niveles de Mis reglas (`reglas_efectivas`) sobre `trades`
(vale para cualquier usuario). Siguen siendo avisos; se mide si se respetaron.

**Día limpio** = día operado en el que:
- ningún trade pasó la pérdida máxima por trade;
- si llegó a un nivel de pérdida diaria, no abrió más trades después;
- si llegó al último nivel de beneficio («Asegurar»), paró. Los niveles
  intermedios de beneficio no cuentan como incumplimiento (a confirmar).
- Extra solo con EA: sin errores graves del Diario (SL desprotegido, TP1 no
  asegurado).

**Barra = días limpios desde el último cambio de etapa ÷ objetivo de la etapa**
(p. ej. 20). Solo sube: un día sucio no suma ni resta. Inicio = última fila de
`etapa_historial`. Segunda línea: calidad reciente (% días limpios de los
últimos 10 operados).

```
TU NIVEL                              ████████████████████  100%
  03 · Umbral                         ✦ Listo para revisión de etapa
  ███████████████░░░░░  74%           El Águila revisará tu paso a Estructura.
  15 de 20 días limpios → Estructura
  Últimos 10 días: 8/10 limpios
```

- **El admin sigue decidiendo:** la barra nunca cambia `usuarios_aurum.etapa`.
  Al 100% con calidad reciente ≥ 80% → "Listo para revisión". En el panel del
  admin, junto a la etapa: "15/20 · 80%" o "✦ listo". El cambio se hace como
  hoy (guardar etapa → `etapa_historial`), lo que pone la barra a 0.
- Objetivo de días por etapa: fijo en el código (v1) o columna editable por el
  admin (v2).
- El conteo por trades se queda en la tarjeta "Ciclo actual".
- Sin reglas: "Define tus reglas en Mis reglas para empezar a medir tu progreso".
- Por decidir: si un día que llega a «Cierre obligatorio» debería además restar
  días (recomendación: no).

### Orden

0. Bugs pequeños de la página: "→ Confianza" fijo, "desde el 1 feb 2026" fijo,
   "real" frente a "simulado", etapa 0 imposible, subtítulos de retos vacíos.
1. "Tu situación" con solo `trades`: rentable por cuenta + mes a mes.
2. Aciertos, errores y regla de la semana (`_daConclusionesTodas()`).
3. Barra por días limpios + aviso "listo" en el admin.

---

## Siguiente gran paso (02/10) — pasos 1 y 2 hechos el 05/10; 3 y 4 = pendiente 5

**Que el análisis post-cierre funcione para cualquier usuario solo con la
EA**, sin depender de `post_cierre.py` en el PC de Roderas con MT5 abierto
(hoy el endpoint solo trabaja con `POST_CIERRE_EMAIL` y las velas salen del
terminal local). Pedido el 02/10, sin hacer. Orden:

1. **Sincronizar la EA real de MT5 con la del repo** (`EA_Aurum_Tracker_FIX.mq5`):
   la copia del repo y la que corre en los terminales están desincronizadas
   (ya anotado en `PLAN_CORAZON_DATOS.md`, 27/08). Nada de lo siguiente se
   toca antes de esto.
2. **Arreglar sus 5 fallos conocidos** (sección "Fallos de la EA" más abajo):
   MFE/MAE nulos, duplicados en `ea_sl_changes`/`ea_tp_changes`, 'breakeven'
   mal etiquetado, clasificación `cierre_tp`/`cierre_sl` y reconciliar al
   arrancar/reconectar los cierres ocurridos con el PC o MT5 apagado (05/10).
3. **Que la EA envíe, tras cada cierre y pasada la ventana post-cierre (4 h de
   mercado), las velas M1 del trade al endpoint** (desde la vela de entrada
   hasta el fin de la ventana; mismo formato/criterio de hora de servidor que
   usa hoy el script).
4. **Mover el análisis de `post_cierre.py` al servidor** (que el endpoint, al
   recibir las velas, calcule y guarde `post_cierre_analisis` /
   `post_cierre_velas` con los mismos criterios v6), para cualquier usuario con
   EA, no solo `POST_CIERRE_EMAIL`. Validar con regresión contra lo que hoy da
   el script (300 trades).

**Junto a este paso (misma condición: EA sincronizada y arreglada antes de
tocarla) — capturas automáticas desde la EA.** Pedido el 02/10, sin hacer. Al
abrir y al cerrar cada trade, la EA guarda una captura del gráfico
(`ChartScreenShot`) con nombre basado en el fp (p. ej.
`2026.10.01_23703381_entrada.png` / `_cierre.png`) para que el Diario la asocie
sola al trade. Por valorar cómo llegan al Diario:
- **Leerlas de la carpeta local:** `ChartScreenShot` solo escribe dentro de la
  carpeta de datos del terminal (`MQL5\Files\…`, sandbox de MT5); el Diario las
  leería con la File System Access API si el usuario elige esa carpeta (como
  hoy en la zona de capturas). Sin coste de almacenamiento, pero solo en ese PC
  y con el permiso de carpeta.
- **Subirlas:** p. ej. Supabase Storage. Tamaño orientativo 100–300 KB por PNG
  (según resolución del gráfico) × 2 por trade; con unos 300 trades, del orden
  de 60–180 MB. Subir binarios desde la EA por `WebRequest` es más delicado
  (tamaño del cuerpo, reintentos, la cola en RAM ya ha dado problemas): mejor
  un endpoint aparte que no comparta la cola de eventos del trade. Valorar
  JPEG / menor resolución para reducir tamaño.

---

## Sincronización de la EA (05/10) — paso 1 del siguiente gran paso

Inventario en solo lectura de `%APPDATA%\MetaQuotes\Terminal\<id>\MQL5\Experts`
(solo 3 terminales tienen la EA) + logs del terminal y de MetaEditor:

| Terminal | Cuentas (última vez en logs) | Archivos | Qué corre | Eventos línea de tiempo | MFE/MAE | En uso |
|---|---|---|---|---|---|---|
| `BD8B1008…` (`AppData\Roaming\MetaTrader 5`, el de `MT5_TERMINAL_PATH`) | 178497 (hoy), 7747760 (28/09), 179003 (10/09), 176821 (31/08) | `.mq5` 03/09 00:03 (v1.02) · `.ex5` 04/09 18:36 | v1.02: el `.ex5` del 04/09 se compiló desde ese mismo `.mq5` (metaeditor.log); el log de la EA no lleva `mfe_pts` | Activos | **No** | **Sí** |
| `D0E8209F…` (`Program Files\MetaTrader 5`) | 176821, 174645 (02/09, la EA falló al iniciar con 174645) | `.mq5` + `.ex5` 29/08 00:26 (compilado desde el repo de ese día) | v1.02 con los 4 `SendTradeEvento` comentados + guard de 30 s | Apagados | No | No |
| `4264CCB9…` (`Program Files\WSFmarkets MT5 Terminal`) | — (logs hasta 19/07) | solo `.ex5` 19/07, sin fuente | obsoleto | — | — | No |
| Repo `EA_Aurum_Tracker_FIX.mq5` (main) | — | v1.03 (04/09) | nunca desplegada | Comentados (`3cad1a5` los copió de D0E8209F…) | Sí | — |

**Causa del fallo 1 (MFE/MAE nulos):** el código de MFE/MAE (v1.03, 04/09) solo
existe en el repo; la EA en uso es v1.02 y nunca lo ha ejecutado. Se espera
que se resuelva al desplegar la versión sincronizada — confirmar con un trade real.

**Cuentas** (archivos de `Common\Files`; tokens no consultados):
`aurum_auth_` existe para **178497, 179003 y 7747760** (no para 176821 ni
7751904); `aurum_cola_`/`aurum_cola_eventos_` para 178497, 179003 y 7747760
(vacías) y restos antiguos de 152034, 167807 y 176821 (`.bak` del 27/08).
- 178497 — WSFmarkets-Server, **REAL** según `account_info().trade_mode` (05/10).
- 179003 — WSFmarkets-Server; tipo no comprobado (no está conectada).
- 7747760 — Neomaaa-global; tipo no comprobado (no está conectada).
- 7751904 — Neomaaa-global, solo en logs del 11/06 al 28/06; sin archivos de la EA.
- **Ojo:** según el usuario (05/10), la cuenta Prueba es la **7751904**, no la
  178497. El Diario rotula las pestañas con `usuarios_aurum.cuenta_maestra /
  cuenta_prueba / cuenta_retos` (en el admin), que el 02/10 tenía
  `cuenta_prueba = 178497`: revisar esa asignación en el admin.

**Decisión (05/10):** partir del repo v1.03, reactivar los 4 `SendTradeEvento`
y **mantener el guard de 30 s** de la sincronización inicial (estaba en el repo
desde el 19/07; `3cad1a5` lo quitó solo para igualar con BD8B1008…, sin motivo
funcional documentado). Resultado: **v1.04** en la rama `feature/ea-sync`.
Frente a la EA en uso solo añade MFE/MAE + el guard. Copias de seguridad en
`BD8B1008…\MQL5\Experts\EA_Aurum_Tracker_FIX.{mq5,ex5}.bak_20261005_pre_ea_sync`.
D0E8209F… y 4264CCB9… no se tocan.

### Despliegue de la 1.04 en BD8B1008… (05/10, 23:27:31) — HECHO

Durante la pausa diaria del mercado (último tick 22:59:59 hora de servidor,
confirmado en MT5 en solo lectura), con UNA posición abierta en 178497
(23847966, venta 0,2, SL 4155,5, TP 4017).

**Cómo se hizo (y cómo NO):**
- 1.er intento, 23:11: copia del `.mq5` 1.04 a `MQL5\Experts` + compilación por
  línea de comandos (`metaeditor64.exe /compile:…`): 0 errores, pero **MT5 no
  recargó la EA del gráfico** (no apareció `aurum_abiertas_178497.txt`); se
  restauró la copia de seguridad. **Compilar desde línea de comandos no avisa al
  terminal: no usarlo para desplegar.** (Al restaurar, MT5 sí recargó la 1.02 a
  las 23:21 y 23:22; luego el `.ex5` desapareció de la carpeta antes del 2.º
  intento, sin causa clara — el F7 lo regeneró.)
- 2.º intento (el bueno): copia del `.mq5` 1.04 (rama `feature/ea-sync`, línea 7
  `version "1.04"`) a `BD8B1008…\MQL5\Experts` **sin compilar**, y el usuario
  compiló con **F7 desde MetaEditor abierto desde MT5** (0 errores): MT5 recargó
  la EA del gráfico XAUUSD H4 con sus mismos inputs (`removed` / `loaded
  successfully` 23:27:31).
- Copias de seguridad de la 1.02 siguen en
  `EA_Aurum_Tracker_FIX.{mq5,ex5}.bak_20261005_pre_ea_sync`.

**Comprobaciones (log de la EA y del terminal, Common\Files, Supabase):**
- Arranque: `23:27:32 EA_Aurum_Tracker iniciado · Cuenta 178497`, credenciales
  del archivo local.
- Posición abierta: `23:27:37 Posición abierta (SL=valor actual) — pos:23847966`,
  `Posiciones abiertas sincronizadas: 1`; `aurum_abiertas_178497.txt` = `23847966`.
- `SyncHistory48h`: **`posiciones procesadas: 7`** (la 1.02 decía siempre 1), con
  `[AURUM RECONCILIA] (sync48h) Cierre recuperado` para los 7 trades del 05/10
  (23827187: 2 salidas, 4147,46, motivo SL, 551,60 $).
- Cola: `23:28:37 Procesando cola — 16` y `23:28:58 [AURUM EVENTO] … — 8`;
  **0 errores HTTP** desde las 23:20; `aurum_cola_178497.txt` y
  `aurum_cola_eventos_178497.txt` a 0 bytes.
- Supabase frente a una foto previa al despliegue (7 trades cerrados desde el
  03/10): mismos eventos (27), cambios de SL (12) y de TP (7), **0 duplicados**,
  mismos precios de cierre y beneficios.

**Pendiente (no fusionar `feature/ea-sync` en `main` hasta confirmarlo):**
- Fallo 1: en el próximo cierre real, la línea `[AURUM] Cierre` debe llevar
  `mfe_pts` / `mae_pts` y `ea_trades.mfe_*` / `mae_*` llegar con valor.
- Fallo 3: en el próximo movimiento de SL, 'breakeven' solo a ±1 pt de la entrada
  (y nunca al poner el primer SL).
- Fallo 5: ver en el log una `[AURUM RECONCILIA] (reconexion|periodica)` real tras
  una desconexión o suspensión.
- Prueba en producción del `sl_change` duplicado: sin hacer (requiere las
  credenciales de la EA, que no se leen).
- Para futuros despliegues de la EA: mismo procedimiento (copiar el `.mq5` y F7
  desde MetaEditor de MT5), en la pausa o sin posiciones.

---

## Edge por cuenta, 06/10

Solo lectura (nada tocado en web, Supabase ni EA). Fuentes: tabla `trades`
exportada por el usuario (CSV de Table Editor, 1.715 filas; se leyeron solo las
de `roderastrader@gmail.com` — de `sudescansovital@gmail.com` no hay ninguna),
trades EA por `GET ?accion=trades` (310, con eventos y SL original) y velas M1
XAUUSD del MT5 local (solo lectura, hay desde el 25/06). Scripts en
`tools/post_cierre/edge/` (orden de ejecución en `edge/datos.py`); datos en
`tools/post_cierre/data/edge/` (ignorado por git: `trades_mios.csv` con solo tus
filas, `ea.json`, `m1.npy` y las salidas `.txt`). El CSV completo de Descargas
se borró el 06/10.

**Calidad de datos (1.709 filas tuyas → 672 analizadas):**
- 704 de la 4011477: fuera (pedido, cuenta perdida).
- 333 importados antiguos (135146: 107, 7741924: 131, 7746279: 75, 7751048: 20)
  sin fecha, sin lote y sin dirección: fuera (sin eso no hay pts/trade ni orden).
- Duplicados EA↔importado: **0** (ni por position_id ni por cuenta+fecha+precio
  ±0,5). Los 5 trades EA que faltaban en `trades` están ahí como importados con
  el mismo position_id (la tabla ya se deduplicó sola).
- Sin lote / sin precios / pts imposibles: 0. pts = beneficio / (100 × lote):
  cuadra con el movimiento de precio (ratio mediano 1,00 en todas las cuentas).
- Cuentas mal asignadas: ninguna (cada número tiene una sola carpeta).
  7751904 (que el 05/10 se dijo que era la Prueba) va en "Resto"; la Prueba
  analizada es la 178497, como se pidió.
- Hora: los importados solo traen la hora; el minuto de entrada se reconstruyó
  con velas M1 (probado con los trades EA: error mediano 1 min) cuando se pudo.
  Antes del 25/06 no hay velas: en la Maestra 161 de 242 trades tienen solo la
  hora, así que "espera" y "vuelta" son inciertas en su primera parte.

**Resumen por cuenta (pts/trade con IC95):**

| Cuenta | Trades | Periodo | P&L | WR | pts/trade | $/trade |
|---|---|---|---|---|---|---|
| Maestra 7747760 | 242 (177 import + 65 EA) | 13/04 → 06/10 | +6.138 $ | 54% | +0,06 [−1,4, +1,5] | +25 |
| Prueba 178497 | 78 (todos EA) | 10/09 → 05/10 | −185 $ | 45% | −1,33 [−3,5, +0,9] | −2 |
| Resto (6 cuentas) | 352 | 12/06 → 10/09 | −10.624 $ | 54% | −1,26 [−2,2, −0,3] | −30 |

Resto por cuenta: 152034 +4.070 $ (133), 167807 −6.493 $ (89), 174645
−2.968 $ (24), 176821 +2.151 $ (47), 179003 −3.380 $ (30), 7751904 −4.005 $ (29).
Maestra: el P&L sale del lote, no de los puntos (con lote fijo 0,2 los mismos
trades darían +278 $).

**Método:** variables al entrar (sesión en hora de servidor, día, dirección,
lote frente a la mediana de la cuenta, resultado del anterior del día, espera
desde el cierre anterior, vuelta, nº de trade del día, si el día iba en
pérdida, tanteo = 1.º del día con lote < mediana / segunda tras tanteo) +
duración (no se sabe al entrar) + solo EA: estrategia, MA200 M1 a favor/en
contra, distancia del SL original. Segmentos de 1 o 2 variables. Primer 60% de
cada cuenta (por fecha) para buscar, último 40% para validar; mínimo 30 casos
en la primera parte; IC95 por bootstrap. "Se sostiene" = media > 0 fuera de
muestra con ≥15 casos; "fiable" = IC95 fuera de muestra > 0.
Segmentos evaluados: Maestra 69, Prueba 4, Resto 137. Ninguno tuvo IC95 > 0 ya
en la primera parte en Maestra ni en Prueba (en Resto, 3, y fallaron fuera).

**Ventaja de verdad:**
- **Maestra — NY 15–19 h (servidor):** 66 trades, +3,96 pts/trade [+0,76,
  +7,58], WR 68%. Primera parte +1,53 (37, no significativo); fuera de muestra
  **+7,06 [+2,85, +11,84]** (29). Positivo en 6 de 7 meses (35 días distintos);
  sin los 5 mejores trades, +1,25. **No se repite en la Prueba** (30 trades,
  −1,42) y en el Resto queda en +0,14 (111): es de cómo operas la Maestra, no
  del mercado.
- "Duración 60+ min" también se sostiene en la Maestra (+6,93 fuera), pero no
  sirve de regla: al entrar no sabes cuánto durará.
- Prueba: **ninguna**. Con 78 trades solo 4 segmentos llegan a 30 casos en la
  primera parte; nada validable. Resto: ninguna.

**Parecía edge y no se sostuvo:** Resto "duración < 5 min" (+1,33 [+0,30,
+2,48] en la primera parte → −1,63 fuera), "compra con el día en pérdida"
(+2,42 → −2,06), "NY 15–19" en Resto (+0,80 → −0,44), "compra" (+1,36 →
−2,15), "MA200 a favor" (+0,84 → −2,75). Maestra "compra tras pérdida" (+0,73 →
−1,60), "lote > mediana en el 4.º+ trade del día" (+0,71 → −0,65).
Variables EA: ninguna se sostiene; MA200 a favor da +3,01 en la Maestra (45),
pero −1,50 en la Prueba (56) y −1,81 en el Resto (106).

**Dónde pierdes siempre:**
- **Trades que duran 15–59 min, en las 3 cuentas:** Maestra −3,29 [−4,99,
  −1,60] (66; primera parte −3,20, fuera −3,37, las dos con IC < 0), Prueba
  −3,30 [−6,34, −0,37] (29), Resto −2,47 [−3,99, −0,91] (110). 58% perdedores.
  Es el patrón más fiable del análisis, pero es un resultado, no una condición
  de entrada (en la Prueba: 17 por SL y 11 a mano).
- Maestra, Londres 09–14: −2,72 [−5,12, −0,22] (45; primera parte −2,87 con
  IC < 0; fuera solo 6, porque desde julio casi no operas Londres → no
  verificable).
- Resto: "Asia 00–08 + venta" −4,27 → −3,80 (IC < 0 en las dos partes),
  "lunes sin vuelta" −2,83 → −2,84, primer trade del día −3,72 (73), tanteo
  −5,05 (40). En la Maestra, en cambio, "Asia + venta" da +1,27 (45).

**Maestra vs Prueba (cómo operas):**

| | Maestra (todo / desde 25/06) | Prueba |
|---|---|---|
| Sesiones | Asia 36% / 56%, Londres 19% / 6%, NY 27% / 29%, NY tarde 19% / 9% | Asia 44%, Londres 12%, NY 38%, NY tarde 6% |
| Lote | mediana 0,2; ≥ 0,4 en el 32% | mediana 0,2; ≥ 0,4 en el **44%** |
| Trades/día | media 3,7 (mediana 2); días con 5+: 29% | media **4,6 (mediana 4)**; días con 5+: **47%** |
| Seguidas < 15 min (no primeros; Maestra solo desde 25/06) | 52% | **70%** |
| Vueltas (no primeros; Maestra solo desde 25/06) | 30% | **54%** |
| Duración | mediana 24 min; 60+ el 32% | mediana 30 min; 60+ el 37% |
| Ventas | 50% | 59% |
| Sube lote tras pérdida / tras ganancia | 54% / 20% | 59% / 9% |
| Cuándo paras | tras ganar 49 de 65 días; días en pérdida 23% | tras ganar 13 de 17; días en pérdida **41%** |
| Días que rompen −500 $ (por cierre) | 13 de 69 (31 trades abiertos después: −424 $) | 5 de 18 (21 trades después: −393 $) |

Desde el 10/09 la Maestra casi no se opera (9 trades, lote mediano 0,11): la
actividad se ha pasado a la Prueba.

**Límite de −500 $ — corregido el 06/10 (la primera versión de esta sección
estaba mal).** Decía que los trades hechos después de tocar −500 $ eran
positivos (Maestra +2,91 pts / +5.959 $ en 42, Prueba +1.735 $ en 22). Error de
cálculo: acumulaba el P&L del día en orden de **entrada**, así que sumaba trades
aún abiertos y ponía mal el momento de la ruptura. El marcador del Diario sí lo
hace bien (P&L realizado por cuenta, en orden de cierre). `edge/limite.py`
reproduce todas las versiones:

| Versión | Trades | $ | Días |
|---|---|---|---|
| Diario (solo EA analizados, todas las cuentas; "después" = cerrados después) | 52 | −6.617 | 13 |
| Ídem el 05/10 antes de las 20:00 (sin 23453924, −268,40 $: su cierre se completó con `sql_fix_cierre_23453924.sql` y su análisis entró a las 20:00) | **51** | **−6.349** | 13 |
| Análisis de edge, primera versión (orden de entrada) — **erróneo** | 142 | +5.777 | 37 |
| **Bueno para la regla:** todos los trades (EA + importados), orden de cierre, "después" = **abiertos** después del cierre que rompe | **116** | **−5.111** | 30 |

Por grupo (versión buena): Maestra 31 trades, −424 $, +0,12 pts [−1,94, +2,72];
Prueba 21, −393 $, −1,64 pts [−4,84, +2,01], WR 33%; Resto 64, −4.294 $, −1,31
pts. Parar en −500 $ habría ahorrado 5.111 $ en total, sobre todo en el Resto
(167807: −2.822 $). En la Maestra el efecto es casi nulo. Ningún IC excluye el 0:
es una regla de riesgo que además ahorra dinero, no una ventaja estadística.
La única diferencia entre el Diario y la versión buena son los importados (64
trades más en días rotos): con solo trades EA, contar "cerrados después" o
"abiertos después" da lo mismo (52 / −6.617 $). El dato del Diario es correcto
para lo que mide (trades de la EA).

**Pero ninguna de esas cifras mide la regla real (aclarado 06/10).** La regla es
por cuenta y tiene 3 niveles: N1 un solo trade pierde 500 $ → ese día se cierra;
N2 el día suma −800 $ → límite; N3 −1.100 $ → cierre obligatorio. El −500 $
acumulado (`DA_LIMITE_PERDIDA_DIA` en `diario-analisis.js`) no es ninguno de
los tres. Con la regla real (`edge/limite_niveles.py -v`, todos los trades, día
de servidor por cierre, "después" = abiertos después del cierre que rompe):

| Cuenta | Nivel | Días | Trades después | $ | pts/trade [IC95] | WR |
|---|---|---|---|---|---|---|
| Maestra | N1 trade ≤ −500 | 4 | 7 | −985 | −2,41 [−4,24, −0,59] | 43% |
| Maestra | N2 día ≤ −800 | 5 | 11 | −1.593 | −2,91 [−4,55, −1,30] | 18% |
| Maestra | N3 día ≤ −1.100 | 5 | 5 | −528 | −2,40 [−4,24, −0,56] | 20% |
| Maestra | el primero que salte | 7 | 14 | −1.573 | −2,27 [−3,76, −0,92] | 36% |
| Prueba | N1 | 1 | 1 | +398 | +3,98 | 100% |
| Prueba | N2 | 4 | 9 | +115 | +0,19 [−5,28, +6,73] | 33% |
| Prueba | N3 | 1 | 0 | 0 | — | — |
| Prueba | el primero que salte | 4 | 9 | +115 | +0,19 | 33% |

Maestra: seguir después de cualquier nivel pierde (−1.573 $ en 14 trades, IC
< 0; 6 de esos 14 son importados de abril–junio con hora sin minuto). Prueba:
pocos casos (9 trades en 4 días; el 25/09 hizo 8 trades tras −800 $ y terminó
en −1.137 $); no se puede concluir. Días: 17/04, 13/05, 16/06, 26/06, 29/06,
17/08 y 24/08 (Maestra); 10/09, 24/09, 25/09 y 01/10 (Prueba).

**Lotaje, fuera de muestra (reglas sacadas solo de la primera parte):**

| Maestra, últimos 97 trades | $ | $/trade | Máx. DD | Peor racha | Peor día |
|---|---|---|---|---|---|
| Lote fijo 0,2 | +1.570 | +16 | 1.938 | 5 | −900 |
| **0,4 en NY 15–19, 0,2 el resto** | **+5.667** | +58 | 1.836 | 5 | −900 |
| Solo NY 15–19 a 0,2 (29 trades) | +4.097 | +141 | 398 | 3 | −125 |
| No operar los segmentos malos de la 1.ª parte | +850 | +12 | 1.989 | 5 | −900 |
| Real (tus lotes) | +2.916 | +30 | 2.362 | 5 | −1.434 |

La misma regla aplicada a la Prueba (prueba independiente, 78 trades) **pierde**:
fijo 0,2 −2.081 $; 0,4 en NY −2.931 $; solo NY −850 $; real −185 $. En el Resto
(141 fuera de muestra), todas las variantes pierden (fijo 0,4: −7.357 $; no
operar los 23 segmentos malos deja 13 trades y −2.344 $).

**Reglas que salen (para decidir; no aplicadas en ninguna parte):**
1. **Maestra: lote base 0,2 y 0,4 solo en NY 15–19 (servidor).** 66 casos; 29
   fuera de muestra con IC95 > 0. Fiabilidad media: se sostiene en la Maestra,
   pero no se transfiere a la Prueba.
2. **Entre el minuto 15 y el 60 de un trade, nada a mano (ni cerrar, ni
   añadir, ni girar): deciden el SL y el TP.** 205 casos en las 3 cuentas, todos
   con IC < 0. El patrón es de fiabilidad alta; la regla en sí está sin probar
   (habría que simularla con velas, como `optimizador.py`).
3. **Prueba: lote fijo 0,2, sin subir tras pérdidas y sin copiar la regla de NY
   de la Maestra.** 78 casos, −1,33 pts/trade [−3,47, +0,89]: no hay ventaja
   demostrable, así que más lote solo añade varianza. Fiabilidad de "no hay
   edge todavía": alta; se necesitan unos 150 trades más para validar
   segmentos de 30.

**Límites:** se probaron ~210 segmentos (se esperan falsos positivos; por eso
solo cuenta lo validado fuera de muestra); la primera parte de la Maestra es
abril–junio con hora sin minuto; la hora es la del servidor de cada bróker;
comisiones y swap van dentro del beneficio de los importados.

---

## Diario al instante y plan del trader (06/10, noche) — EN PRODUCCIÓN

**Problema:** el Diario solo leía `post_cierre_analisis`, así que un trade
recién cerrado no salía hasta que `post_cierre.py` (cada hora) lo analizaba,
aunque la EA ya lo hubiera mandado a `ea_trades`. Además el P&L salía de
`AURUM_TRADES`, que se carga al entrar en la web: los trades cerrados después
salían con P&L "—" hasta recargar.

**En producción:** commit `723e6d0` en `main`, deploy `aurum-velare-1quaszrb4`
(06/10). SQL del plan `a23bbe7`. Enseñado antes con una vista previa local
(datos inventados) + 25 pruebas jsdom. **Pendiente de que el usuario lo
compruebe con su sesión.**

**SQL aplicado por el usuario el 06/10:**
- RLS de lectura en `ea_trades` (no había ninguna para el navegador):
  `eat_user_select` (`auth.email() = usuario_email`) y `eat_admin_select`
  (`sudescansovital@gmail.com`). Escrito y aplicado a mano en Supabase, sin
  archivo en el repo. Verificado: 2 policies, RLS activado.
- `tools/post_cierre/sql_mis_reglas_v2_plan.sql`: columna `plan` (máx. 200) en
  `reglas_valores`, el trigger la recorta, el historial la registra y
  `reglas_efectivas` la expone al final. Verificado: plan_columnas 2,
  efectivas 24, con_plan 0. Probado antes en PGlite sobre
  `sql_mis_reglas.sql` (12 comprobaciones). Ese v1 solo está en la rama
  `feature/ea-sync`; el v2 está en `main`.

**Cómo funciona (`diario-analisis.js`):**
- Carga `post_cierre_analisis`, `reglas_efectivas` (`select=*`, funciona con y
  sin `plan`) y los cerrados de `ea_trades`, **paginado** de 1000 en 1000
  (max-rows de Supabase; antes `limit=5000` se quedaba en 1000 sin avisar).
- **Sin duplicados:** clave `fp` en las dos tablas (la misma que usa
  `post_cierre.py`). Cada `fp` de `ea_trades` sin análisis es una fila
  provisional (`_pendiente`); cuando llega el análisis, en la siguiente carga
  ya no se crea.
- **P&L:** `trades` sigue siendo la fuente de verdad; si el `fp` no está en
  `AURUM_TRADES`, se usa el `beneficio` de `ea_trades` (es el mismo que la EA
  escribe en `trades`).
- **Con pendientes:** calendario, panel del día, listas, P&L, win rate, avisos
  de Mis reglas ("Tus niveles", LÍM / ▲ / !, "Tras «nivel»"), vueltas y
  entradas seguidas. **Solo analizados:** veredictos, cierres a mano, BE, TP1,
  SL desprotegido, runners, "Qué te conviene" y la evolución de % pronto. El
  "Análisis del día" avisa si hay pendientes en vez de decir "sin errores".
- **Detalle de un pendiente:** aviso, entrada, cierre, pts, P&L y línea de
  tiempo (`trade_eventos`), sin gráfico.
- **Refresco:** con la pestaña del navegador y el Diario visibles, cada 60 s
  (`DA_REFRESCO_MS`) mira los últimos 20 cierres de `ea_trades` y los últimos
  20 análisis (`calculado_en`); solo si cambian recarga y repinta.
- **Bloque "Hoy"** (arriba, antes del calendario; solo si hoy hay trades): una
  tarjeta por cuenta con P&L, "N sin analizar", el último nivel de pérdida y el
  último de beneficio alcanzados con **"Tu plan dice: «…»"** (o enlace a Mis
  reglas si no hay plan), lo abierto después y el siguiente nivel. "Hoy" =
  fecha del navegador (las horas son de servidor MT5: cerca de medianoche puede
  no coincidir; el calendario es la referencia). El plan también sale en la
  frase del panel del día ("tu plan: «…»").

**Mis reglas (`mis-reglas.js`):** campo "Qué haces al llegar" bajo cada nivel;
plan sin importe da error, igual que el nombre. Lee `plan` explícitamente: sin
el SQL v2 la pestaña no cargaría.

**Limitación conocida (del trigger de `sql_mis_reglas.sql`, no del v2):** si el
admin fija para un nivel un importe más estricto que el del usuario, cualquier
UPDATE de la fila del usuario de ese nivel falla (también cambiar solo el
nombre o el plan) hasta que baje el importe. Hoy no hay niveles del admin, así
que no afecta; resolverlo en la fase 3 (p. ej. comprobar el tope solo si cambia
el importe).

**Qué comprobar con la sesión del usuario:**
1. Mis reglas: escribir un plan, guardar y recargar (se mantiene); plan sin
   importe → error.
2. Cerrar un trade con la EA y abrir el Diario sin esperar a la tarea: sale en
   el calendario de hoy, en "Trades del día" y en la semana con "Análisis
   pendiente" y su P&L; al desplegarlo, aviso + línea de tiempo.
3. Con el Diario abierto, un trade nuevo aparece solo en ≤ 1 min.
4. Tras la tarea horaria, el mismo trade sale una sola vez, ya con veredicto.
5. "Hoy": P&L por cuenta, nivel alcanzado con "Tu plan dice", y sin objetivo de
   beneficio si ya se alcanzó uno de pérdida.
6. Semanas y meses anteriores, igual que antes.

---

## Mis reglas (06/10) — fases 1 y 2 en producción; fase 3 pendiente

El límite fijo `DA_LIMITE_PERDIDA_DIA` del Diario pasa a ser configurable por
usuario. SQL: `tools/post_cierre/sql_mis_reglas.sql`, **aplicado en Supabase el
06/10** por el usuario (en dos partes; verificado: niveles 6, historial 6,
policies 7, efectivas 24). Antes se probó en un Postgres local (PGlite) con 19
comprobaciones de RLS, candado e historial. Sustituye a
`sql_reglas_disciplina.sql` (raíz, del 05/10, sin commitear, nunca aplicado).

**Estado de las fases:**
- **Fase 1 — EN PRODUCCIÓN (06/10):** pestaña "Mis reglas" en Mi gestión
  (`mis-reglas.js`, commit `499d65d` en `main`, deploy
  `aurum-velare-2nyp03hqp`). Comprobada por el usuario con su sesión: salen sus
  6 niveles, guarda y se mantiene al recargar. Importes en formato español
  ("1.100", "999,5"); campo de texto y no `type=number` (con coma, un input
  numérico puede devolver '' y borraría el nivel).
- **Fase 2 — EN PRODUCCIÓN (06/10):** el Diario usa los niveles (commit
  `404183e` en `main`, deploy `aurum-velare-ab4k1h1zt`; enseñada antes con
  capturas; pendiente de que el usuario la compruebe con su sesión). Verificada con los trades
  EA reales contra un cálculo independiente en Python (6 niveles, Maestra y
  Prueba) + 14 pruebas jsdom + la prueba anterior del Diario. Detalle abajo.
- **Fase 3 — pendiente:** panel del admin y candado en la pantalla.
- **Plan del trader — EN PRODUCCIÓN (06/10, noche):** columna `plan` por nivel
  (`sql_mis_reglas_v2_plan.sql`) y bloque "Hoy" en el Diario. Ver la sección
  "Diario al instante y plan del trader".

- **Reglas** (todas opcionales; vacío = no se mide), por usuario y por carpeta
  (`todas` por defecto, o `maestra` / `prueba` / `retos`: por carpeta y no por
  número, porque el número cambia desde el admin):
  pérdida máxima por trade; hasta 3 niveles de pérdida diaria y hasta 3 de
  beneficio diario, cada uno con importe y nombre.
  Roderas: trade 500; día −800 "Límite", −1.100 "Cierre obligatorio"; +250
  "Día bueno", +500 "Oportunidad", +1.500 "Asegurar".
- **Todos los niveles son avisos:** ni Aurum ni la EA cierran el día ni bloquean
  operaciones; el trader decide.
- **Tablas:** `reglas_valores` (una fila por nivel: ámbito usuario/reto,
  carpeta, regla, nivel, importe, nombre, `fijada_por` usuario/admin),
  `reglas_valores_historial` (automático, solo lectura) y la vista
  `reglas_efectivas` (lo que se aplica por carpeta y nivel).
- **Admin y candado:** el admin ve y edita las reglas de cada usuario. Si fija
  un nivel, manda el importe más estricto (el menor, también en beneficio) y el
  usuario solo puede bajarlo (lo impide un trigger, no solo la pantalla).
- **Retos:** la tabla admite reglas por reto fijadas por el admin; sin
  construir (faltará la policy de lectura vía `retos_participantes` y
  aplicarlas a la cuenta de retos de cada participante).
- **Fases** (cada una se enseña antes de desplegar):
  1. Aplicar el SQL + pestaña "Mis reglas" en Mi gestión.
  2. El Diario usa las reglas por cuenta en lugar de `DA_LIMITE_PERDIDA_DIA`.
     Por nivel: días en que se alcanzó, si se siguió operando y qué pasó
     después (trades abiertos después, en $ y pts; en beneficio, cuánto se
     devolvió o se ganó de más). **Veredicto** cuando se sigue operando tras
     alcanzar un nivel: "te sirvió" si los trades posteriores suman positivo,
     "error" si suman negativo, con $ y pts. En el día, una frase ("Llegaste a
     +250 Día bueno y seguiste: 3 trades, devolviste 180 $ → error"). En
     semana, mes e histórico, resumen por nivel: veces que sirvió y veces que
     fue error, con el total de cada lado.
  3. Panel del admin y candado en la pantalla.
- **Fase 2, cómo funciona** (`diario-analisis.js`, sección "Mis reglas en el
  Diario"): lee `reglas_efectivas` junto con `post_cierre_analisis`; cada cuenta
  usa los niveles de su carpeta (las cuentas sin carpeta, los de `todas`). Por
  cuenta y día de cierre, con el P&L realizado en orden de cierre, se llega a un
  nivel en el cierre del trade que lo cruza; "después" = trades de esa cuenta
  abiertos a partir de ese momento y cerrados ese día. Calendario: LÍM (pérdida),
  ▲ (beneficio), ! (siguió y fue error). Panel del día: una frase por nivel.
  Semana, mes e histórico: bloque "Tus niveles". "Qué te conviene": una frase por
  nivel con 5+ veces seguidas. Insignia "Tras «nivel»" en los trades abiertos
  después (aviso: no cuenta para "Solo con errores"). `DA_LIMITE_PERDIDA_DIA`
  pasa a `DA_ESCALA_COLOR_DIA` (solo intensidad del color del calendario).
  Importes de 4 cifras sin punto de miles ("−1100 $"), como el resto del Diario.
- **Pendiente — admin por email:** el SQL reconoce al admin por
  `auth.email() = 'sudescansovital@gmail.com'` (igual que `ADMIN_EMAIL` en
  `app.js` y otras tablas). Cuando haya más de un admin, pasar a un rol o una
  tabla de admins y cambiarlo en los dos sitios.

---

## FASE 2 — Diario de análisis en la web (02/10)

Se acabaron los CSV a mano. Flujo:

1. `post_cierre.py` pide a `api/post-cierre.js` (`GET ?accion=pendientes`) los
   trades de la EA cerrados sin análisis, con `ventana_completa=false` o con
   `criterios_version` menor que `CRITERIOS_VERSION` (hoy 6, desde el 02/10).
2. Los analiza con velas M1 del MT5 local con **los mismos criterios** de abajo.
3. Con `--subir`, manda análisis + velas del gráfico (`POST ?accion=resultados`,
   lotes de 25) a `post_cierre_analisis` / `post_cierre_velas` (`sql_post_cierre.sql`,
   aplicado en Supabase el 02/10; RLS solo SELECT, escribe solo el endpoint).
4. El Diario (Mi gestión → Diario, `diario-analisis.js`) lee esas tablas con el
   JWT del usuario: "Tu semana" (KPIs, decisiones de gestión, por estrategia,
   % "pronto" semana a semana) + "Trades" (filtros cuenta/estrategia; al pulsar,
   gráfico durante + 4 h después, frase del veredicto, MFE/MAE, línea de tiempo
   de `trade_eventos`). Vista global + por cuenta; semana lunes–domingo en hora
   de servidor MT5. Las frases se generan en el front (no se guardan).

**Rutina:** con MT5 abierto, `.venv\Scripts\python.exe post_cierre.py --subir`.
Una pasada sin nada nuevo dice "0 pendientes · Nada que analizar".

**Automatizado (05/10):** tarea programada de Windows **`\Aurum\post_cierre automatico`**
(definición en `tarea_post_cierre.xml`). Se lanza cada hora en punto, 3 min
después de iniciar sesión y 3 min después de volver de suspensión
(evento 1 de Power-Troubleshooter); si el PC estaba apagado a la hora, corre en
cuanto puede (`StartWhenAvailable`); nunca dos a la vez; límite 30 min. Acción:
`wscript lanzar_oculto.vbs` → `auto_post_cierre.ps1` (sin ventana). El `.ps1`
solo ejecuta `post_cierre.py --subir` si el `terminal64.exe` de
`MT5_TERMINAL_PATH` ya está abierto; si no, apunta "MT5 cerrado" y sale sin
abrir MT5. Log en `salida\auto.log` (rota a `auto.log.1` a partir de 2 MB).
Los fallos de red (`WinError 10060`) ya no requieren repetir a mano: la
siguiente hora lo vuelve a intentar. Desactivar: Programador de tareas →
Aurum → clic derecho → Deshabilitar (o `Disable-ScheduledTask -TaskPath '\Aurum\'
-TaskName 'post_cierre automatico'`). Volver a crearla:
`Register-ScheduledTask -TaskPath '\Aurum\' -TaskName 'post_cierre automatico'
-Xml (Get-Content -Raw tarea_post_cierre.xml)`. Probada el 05/10: con MT5
abierto, código 0; con una ruta de MT5 cerrada, "no se hace nada" y no abre MT5.

**Qué se publica en aurumvelare.com (05/10):** `.vercelignore` en la raíz deja
fuera `tools/`, `docs/`, `*.md`, `*.sql`, `*.mq5`, `*.py`, `*.ps1`, `*.vbs`,
`.env*`, `.post_cierre_token` y `*.log`. Hasta entonces `tools/post_cierre/ESTADO.md`
(y el resto de `.md`/`.sql`/EA) se servía en público; el token nunca (404).
Desde `974e421` el deploy sube 33 archivos (antes 64) y todo eso da 404;
verificado que la web, el Diario y la API siguen respondiendo. Si algún día la
web necesita servir un archivo de esos tipos, añadir una excepción `!ruta`.
Desplegar desde una copia limpia del commit (`git worktree add --detach <tmp> HEAD`
+ copiar `.vercel/` + `npx vercel --prod --yes`) para no publicar cambios sin
commitear.

**Ojo (verificado el 06/10 con `vercel ls --prod`): un `git push` a `main`
también despliega a producción solo** (integración Git de Vercel), además del
deploy manual. No subir a `main` código que no deba estar ya en la web: usar
otra rama hasta que esté aprobado. Subir solo `.sql`/`.md`/`tools/` no cambia
la web (lo excluye `.vercelignore`), pero igualmente genera un deploy.

**Auth del endpoint:** token propio `POST_CIERRE_TOKEN` (Vercel, sensible,
Production + Preview de la rama `feature/post-cierre`) en cabecera
`Authorization: Bearer`; email fijo `POST_CIERRE_EMAIL` (roderastrader@gmail.com),
nunca viene del cliente. En local: `tools/post_cierre/.post_cierre_token`
(ignorado por git), líneas `token=` y `bypass=`. `bypass=` es el secreto
"Protection Bypass for Automation" del proyecto (lo creó `vercel curl` el
02/10), solo hace falta contra previews (`--base-url <url del preview>`); el
dominio aurumvelare.com no está protegido. El script nunca imprime ninguno.
Rotar: `openssl rand -hex 32` → `vercel env rm` + `vercel env add ... --sensitive`
(Preview exige la rama como 3er argumento con la CLI v54) → reescribir el archivo.

**Si cambian umbrales o criterios:** (hoy v8, dejar correr, 05/10) subir `CRITERIOS_VERSION` en
`post_cierre.py` y ejecutar `--subir`: todo se recalcula y se sobrescribe (upsert).

**Verificado 02/10:** regresión `--fuente web` vs `--fuente csv` idéntica en
todas las columnas de `resultados.csv` en los 290 trades comunes (y el CSV de
hoy = FASE 1 del 29/09). Subidos 300/300 sin rechazos; segunda pasada 0
pendientes. Producción: mismos JS byte a byte salvo `index.html` (notas
movidas dentro de `gpanel-diario` + contenedor nuevo) y `diario-analisis.js`.

**Diferencias con FASE 1:** la web devuelve 300 trades (10 nuevos del 29/09 al
01/10, cuenta 178497) y no devuelve 8 del CSV (6 de la 7754620 del 03–05/08 y
2 del 30/06 de 152034 y 7747760): sin análisis, decidido dejarlos así.

**Criterios v2 del breakeven (02/10):** CHECK ampliado con
`sql_post_cierre_v2_be_mixto.sql` (ejecutado por el usuario), `CRITERIOS_VERSION`
2, 300/300 recalculados y subidos a producción, segunda pasada 0 pendientes.
Solo cambia `be_efecto` (y `pts_favor_antes_sl` en los mixtos de BE); el resto de
columnas, idénticas a v1. Antes → después, 89 trades con BE real (300 trades):

| Vista | te_salvo | mixto_te_saco_de_un_recorrido | te_saco_de_un_ganador | sin_efecto |
|---|---|---|---|---|
| Todo | 35 → 19 | 0 → 16 (media 8,4 pts antes del SL) | 13 → 14 | 41 → 40 |
| Solo sept (+oct) | 19 → 12 | 0 → 7 | 7 → 8 | 23 → 22 |

16 pasan de `te_salvo` a mixto y 1 de `sin_efecto` a `te_saco_de_un_ganador`
(15/09 02:17, 178497, +5,83 pts: con v1 no llegaba al 0,5× de la distancia al SL).
En la primera subida un lote recibió un 500 de la plataforma Vercel (no del
endpoint); se completó repitiendo y el script ahora reintenta solo los 5xx
(hasta 2 veces, el upsert es idempotente).

**"Todo el histórico" (02/10, hecho):** junto a las flechas de semana, chips
"Semana" / "Todo el histórico". En histórico, los KPIs, los bloques de decisiones
y la tabla por estrategia usan todos los trades analizados de la cuenta elegida
(Global o una cuenta); las barras del % "pronto" abarcan todas las semanas con
datos; la lista de trades sigue siendo semanal (aviso para volver a Semana).
Probado en Node con los 300 resultados v2: Global 300 trades · 160 a mano ·
47% pronto · 89 BE (19 te salvó, 16 mixto); 178497: 69 · 29 · 31% · 28 (8, 4),
igual que el cálculo independiente en Python.

**Pestañas de cuenta del Diario (02/10):** solo Global, Maestra, Prueba y
Retos, como el resto de Mi gestión. El número de cada una sale de
`usuarioActual.cuenta_maestra / cuenta_prueba / cuenta_retos` (lo que se
configura en el admin, `usuarios_aurum`), resuelto en cada pintado: si cambia la
cuenta en el admin, el Diario la sigue sin tocar código. Una pestaña sin cuenta
asignada no aparece. Las demás cuentas (historial) no tienen pestaña pero
cuentan en Global. Hoy: Maestra 7747760 (64 trades), Prueba 178497 (69),
Retos 179003 (29), Global 300.

**Criterios v3 (02/10): "TP1 no asegurado" + fix de horas del gráfico.**
- TP1 por estrategia en `TP1_PTS_POR_ESTRATEGIA` (estructura 11, rechazo_rsi 7;
  sin clasificar no se evalúa). Se marca si el precio llega a +TP1 desde la
  entrada y después vuelve a la entrada sin parcial y con un SL que en ese
  momento no protege la entrada (±1 pt o mejor). Se mira el SL en vigor al
  volver, no si hubo algún BE (01/10 12:36, 178497: SL protegido a las 10:43,
  devuelto a 4176,5 a las 11:08, llegó a +11 a las 10:20 y volvió a las 12:26
  → marcado). Cuenta aunque el trade acabe cerrando en BE (decidido 02/10).
  Columnas `tp1_*` (`sql_post_cierre_v3_tp1.sql`, ejecutado). En el Diario:
  frase del veredicto, insignia, bloque en Tu semana / Todo el histórico y
  columna en la tabla por estrategia. Histórico: 146 evaluados, 49 llegan a
  TP1, 8 no asegurados (estructura 2 de 22, rechazo_rsi 6 de 27).
- Fix de horas: el paquete `MetaTrader5` toma los `datetime` naive como hora
  local del PC (UTC+2) → `copy_rates_range` devolvía velas 2 h antes y el
  gráfico metía esas 2 h como "durante el trade" (gráfico desde 07:58 con
  entrada real 10:07). La hora buena siempre fue la de `ea_trades` /
  `trade_eventos` (hora de servidor MT5, confirmada con `history_deals_get`).
  Ahora `obtener_velas_m1` pasa las fechas como UTC (= epoch de las velas) y
  "durante" se filtra desde la vela de entrada. El análisis no estaba
  afectado (filtraba por hora real): regresión idéntica en los 300 trades.
- 300/300 recalculados y subidos (velas del gráfico regeneradas), segunda
  pasada 0 pendientes.

**Criterios v4 (02/10): "SL desprotegido" (hecho).** El SL protegía la
entrada (±1 pt o mejor, mismo criterio que el TP1) y un cambio posterior, con
el trade abierto, lo alejó sin protegerla. Se guarda el primer episodio
(`sl_protegido_en` / `sl_nivel_protegido` → `sl_desprotegido_en` /
`sl_nivel_desprotegido`), el número de episodios y
`sl_protegido_habria_salido` (tras desproteger, el precio llegó al nivel
protegido antes del cierre). `sql_post_cierre_v4_sl_desprotegido.sql`
ejecutado. En el Diario: frase del veredicto, insignia, bloque en Tu semana /
Todo el histórico (con P&L de esos trades) y columna por estrategia.
Histórico: 26 trades, en 21 habría saltado el SL protegido, 4 con más de un
episodio (estructura 7, rechazo_rsi 4, sin clasificar 15). Ejemplo 01/10
12:36, 178497: protegido 4165,15 a las 10:43 → 4176,5 a las 11:08, habría
salido. 300/300 recalculados, segunda pasada 0 pendientes.

**Insignias y errores de la lista (02/10, hecho).** El veredicto de cierre es
una insignia neutra "Cierre: bien / pronto / BE, te salvó…" (solo habla del
momento de cerrar). Los errores van delante: TP1 no asegurado y SL desprotegido
en rojo, Vuelta en naranja; si hay alguno, la fila lleva una marca roja a la
izquierda (`_daErrores` en `diario-analisis.js`; "Vuelta" cuenta como error).
Filtro "Solo con errores" junto a los de estrategia (se combinan). Filas en
flex con wrap: en móvil las insignias y el P&L bajan a una segunda línea.

**Vueltas y entradas seguidas (02/10, hecho; criterios v5).** Se calculan en
el front sobre todos los trades cargados (`_daMarcarSecuencias`), parámetro
`DA_MINUTOS_SECUENCIA = 15`. El "anterior" de un trade es el que cerró más
tarde antes de su entrada, en la misma cuenta.
- Entrada seguida: abierta < 15 min tras cerrar el anterior. Se compara con
  las abiertas tras esperar ≥ 15 min (WR, $ medio, esperanza en pts =
  beneficio / (100 × lotes)); los primeros trades de cada cuenta, fuera.
- Vuelta: seguida + dirección contraria + el anterior cerró a mano o con
  pérdida (pts reales < 0). Insignia naranja en los dos. Real = P&L de los
  dos trades; "si hubieras mantenido el primero" = desde su cierre hasta su
  SL o TP original en la ventana post-cierre (4 h de mercado), y si no toca
  ninguno, a `precio_fin_ventana` (columna nueva v5,
  `sql_post_cierre_v5_fin_ventana.sql`, ejecutado); vela ambigua → SL; si ya
  cerró en su SL original, = lo real. $ con el volumen inicial del primero
  (sin descontar parciales). Cada trade solo es "primero" de una vuelta.
- Histórico 02/10: 92 vueltas (59 abiertas en < 1 min): real −16.846 $ vs
  mantener el primero −14.768 $ → −2.078 $ (Maestra +120, Prueba +784,
  Retos −2.782). Entradas seguidas 144 (WR 49%, −38 $/trade, −0,96 pts) vs
  esperando 149 (WR 55%, −9 $/trade, −0,72 pts).
- 300/300 recalculados con v5, segunda pasada 0 pendientes.

**Criterios v6 (02/10): "BE antes de TP1" (hecho), error de regla.** El SL se
movió a proteger la entrada (±1 pt o mejor) con el trade abierto antes de que
el precio llegara a +TP1 (`TP1_PTS_POR_ESTRATEGIA`: estructura 11,
rechazo_rsi 7; sin clasificar no se evalúa). Mismo minuto que el TP1 → no se
marca (orden desconocido); si el trade nació con el SL protegido, tampoco.
Columnas `be_antes_tp1`, `be_antes_tp1_en`, `be_antes_tp1_favor_pts` (máximo a
favor antes de proteger; NULL = protegido en el primer minuto, "nada más
entrar") — `sql_post_cierre_v6_be_antes_tp1.sql`, ejecutado. En el Diario:
insignia roja (cuenta como error para la marca de fila y el filtro), frase en
el veredicto, sección en el bloque "Reglas del TP1" (junto a TP1 no asegurado)
y columna por estrategia. Histórico: 49 de 146 evaluados (estructura 34 de
91, rechazo_rsi 15 de 55); de esos 49, 22 salieron en BE y en 25 el precio
llegó después al TP1; media +4,7 pts a favor al proteger, 7 nada más entrar.
300/300 recalculados, 0 pendientes. En la subida hubo dos timeouts de red
(`WinError 10060`, sin respuesta de aurumvelare.com) que cortaron el script a
mitad; repetir `--subir` completó los 150 restantes sin duplicar (upsert).
Ojo: el reintento automático solo cubre HTTP 5xx, no los fallos de conexión.

**Zona de capturas (02/10, hecho, `capturas-test.js`).** La carpeta no se
perdía al cerrar sesión (`signOut` no toca IndexedDB): al recargar, Chrome
conserva el handle pero el permiso vuelve a "prompt" y solo se puede pedir con
un clic, y la zona lo mostraba como "Permiso denegado, vuelve a elegir".
Ahora: "Carpeta «X» recordada" + botón **Reconectar** (`requestPermission`);
"denegado" solo si lo está de verdad; carpeta y ruta guardadas **por usuario**
en IndexedDB (`carpeta:<email>`, `ruta:<email>`; migra la clave antigua
`carpeta`, común a todo el navegador); valor guardado corrupto → "Sin carpeta".
Campo **"Ruta en mi PC"** a mano (el navegador no expone la ruta completa): solo
en este navegador, va al JSON de cada captura (`ruta_pc`, `carpeta`) y al aviso
"Guardado en …". Probado en Chrome sin interfaz (migración, 4 estados,
Reconectar, ruta tras reabrir el navegador); falta probar a mano el diálogo
real de permiso con una carpeta de verdad.

**Criterios v8 (05/10): "SI LA HUBIERAS DEJADO CORRER".** `evaluar_dejar_correr`
en `post_cierre.py`. Solo **cierres a mano con SL al cerrar** (con o sin TP; incluye
el resto de los runners cerrado a mano). Desde la primera vela M1 posterior al
cierre, qué toca primero: el TP o el SL **en vigor al cerrar** (`sl_actual` /
`tp_actual`; si faltan, reconstruidos con los cambios). Tope **5 días de mercado**
= `DEJAR_CORRER_VELAS` = 5 × 1.440 velas M1 reales (se piden a MT5
`DEJAR_CORRER_BUSQUEDA_DIAS` = 12 días de calendario desde el cierre; el gráfico
no cambia, sigue con su ventana de 4 h). Reglas: TP y SL en la misma vela → SL
(`dejar_correr_ambiguo`); **hueco de apertura** (solo si la vela llega tras un corte
de mercado: fin de semana, pausa diaria o minutos sin cotizar) que salta el SL →
salida al open de esa vela, que salta el TP → salida en el TP
(`dejar_correr_hueco`); sin corte, una apertura ya pasada del nivel se ejecuta en el
nivel. $ extra = lotes del cierre final × (salida − cierre real) × 100, a favor del
trade, sin comisiones (NULL si no se sabe el volumen: parciales antes del ~27/08).
Resultado `tp` / `sl` / `ninguno` / `en_curso` (no han pasado los 5 días: el trade
se re-analiza en cada pasada, `ventana_completa=false`) / `sin_datos`. **Sin SL al
cerrar → `dejar_correr=false`** (no simulable: seguir 5 días sin stop solo mide el
movimiento del oro; 35 trades, casi todos de julio/agosto, con ±350 pts que
deformaban el total). Columnas en `sql_post_cierre_v8_dejar_correr.sql`
(ejecutado 05/10). En el Diario: frase "Si la hubieras dejado…" en el veredicto de
cada cierre a mano y conclusión en "Qué te conviene" (semana, mes, histórico).
**Histórico 05/10:** 128 simulables · 111 al SL, 13 al TP, 4 a ninguno · 1 hueco ·
con $ y resueltos 125: real −3.567 $ vs dejándolas correr −8.542 $ → cerrar a mano
te ahorró 4.974 $. Verificado a mano con velas de MT5 un caso TP (14/07, pico de
4028 a 4087 en la vela de las 14:30) y el hueco (martes 14/07 00:00, reapertura
diaria). 308/308 subidos con v8, segunda pasada 0 pendientes.

**Criterios v7 (05/10): RUNNERS.** `evaluar_runner` en `post_cierre.py`. Trade
con parcial (eventos `parcial` de `trade_eventos`, con precio y
`volumen_restante`): el resto tras la **primera** parcial es runner si el SL
protege la entrada (`_sl_protege`, ±1 pt o mejor) al hacer la parcial o hasta
`RUNNER_VENTANA_PROTECCION_MIN` (15) después; si no, `runner=false` (parcial con
el resto sin proteger); sin parcial, NULL. Se guarda: pts de la parcial, lotes
restantes, SL del resto, máximo a favor desde la entrada tras el minuto de la
parcial (velas M1), salida media ponderada del resto (parciales posteriores +
cierre), minutos parcial→cierre, `runner_usd` (pts × 100 × lotes de cada salida)
y `runner_usd_todo_parcial` (resto cerrado en la primera parcial). Sin
comisiones ni swap. Antes del ~27/08 la EA no mandaba `volumen_restante`: esos
runners tienen niveles pero `runner_usd` NULL. Columnas en
`sql_post_cierre_v7_runners.sql` (ejecutado 05/10). Comprobado contra MT5:
23827187, resto 0,2 a −0,1 pts = −2,00 $ (deal real −2,00).
En el Diario: bloque "Runners" en Tu semana / Todo el histórico (niveles
`DA_RUNNER_NIVELES` = +33/+50/+100: volvió al BE, salió con algo, llegó a +33,
+50, +100 o más; mediana de tiempo; $ total y por runner vs todo en la parcial;
por estrategia), frase en el veredicto e insignia "Runner: +X".

**"Qué te conviene" (05/10, solo front).** `_daConclusiones` en
`diario-analisis.js`, en Tu semana, en el mes del calendario y en Todo el
histórico: hasta 4 frases por reglas, ordenadas por dinero en juego, cada una
con su nº de trades. Comparaciones: esperar 15 min vs seguidas (diferencia de
$ medio × nº de seguidas), vueltas (real vs mantener el primero), parar en el
límite diario (P&L de los trades hechos después de superarlo), BE antes de TP1
(salidas en BE tras las que el precio llegó al TP1: TP1 × 100 × lotes), TP1 no
asegurado (cerrar en TP1 vs real) y runners (vs todo en la parcial). Mínimos:
`DA_MIN_TRADES_CONVIENE` = 20 trades en el periodo y `DA_MIN_GRUPO_CONVIENE` =
5 casos por comparación; con menos, lo dice en vez de concluir. Verificado con
los 307 trades contra un cálculo independiente en Python.

**Calendario mensual (05/10, hecho, solo front, sin SQL).** Encima de "Tu
semana" y con la misma pestaña de cuenta. Cuadrícula lunes–domingo en hora de
servidor; cada trade va al día de su **cierre**. Por día: nº de trades
analizados y P&L (de `trades`), fondo verde/rojo con intensidad proporcional al
importe (satura en el límite). Marcas: barra roja + "LÍM" si alguna cuenta
llegó a −`DA_LIMITE_PERDIDA_DIA` (500 $, P&L realizado acumulado del día por
cuenta, trade a trade por hora de cierre; en móvil solo la barra) y "↺N" con
`DA_VUELTAS_AVISO` (3) o más vueltas (cuenta el día del primer trade de la
vuelta). Al pulsar un día: panel con "Análisis del día" por reglas
(`_daAnalisisDia`: trades/P&L/ganadores, vueltas y seguidas, errores de regla,
trade en que se rompió el límite y lo hecho después, espera vs seguidas) y la
lista de trades con las mismas filas/insignias (`_daHtmlTrades(..., 'd', false)`;
los ids llevan prefijo `w:`/`d:` para no chocar con la semana). Debajo de la
cuadrícula: P&L del mes, días verdes/rojos, mejor/peor día, días con límite
roto (+ días con 3+ vueltas). Constantes al principio de `diario-analisis.js`.
Verificado con los 307 trades reales (fixture en seco): septiembre Global 124
trades, −1.762 $, 14 verdes / 8 rojos, mejor 11/09 +930, peor 10/09 −2.375,
límite roto 5 días — idéntico a un cálculo independiente en Python. Probado en
Chrome sin interfaz en escritorio y a 358 px.
Ojo: los trades aún sin análisis (cerrados hace menos de una pasada de la
tarea programada) no salen en el calendario, igual que en la semana.

**Fuera de esta versión:** incubadora de estrategias e informe diario.

---

## Cómo se ejecuta

```
cd tools\post_cierre
.venv\Scripts\python.exe post_cierre.py --subir     # pendientes de la web -> analizar -> subir
.venv\Scripts\python.exe post_cierre.py             # igual, en seco (solo salida/)
.venv\Scripts\python.exe post_cierre.py --limit 5   # prueba
.venv\Scripts\python.exe post_cierre.py --cuenta 178497
.venv\Scripts\python.exe post_cierre.py --fuente csv  # FASE 1, CSVs de data/ (regresión)
```

- Requiere MT5 abierto a mano. `mt5.initialize()` usa la ruta fija
  `MT5_TERMINAL_PATH` (`C:\Users\boli-\AppData\Roaming\MetaTrader 5\terminal64.exe`,
  el único terminal que se abre a mano) con `timeout=60s` y sin reintentos,
  para no lanzar nunca otro MT5 de los instalados.
- Las velas XAUUSD de ese terminal (hoy WSFmarkets, cuenta 178497) se usan
  para los trades de **todas** las cuentas. No hay separación por bróker:
  todas las cuentas cuentan igual. El encaje precio guardado ↔ vela M1 es de
  296/298 entradas y 297/298 cierres, así que las velas valen para todas.
- MT5 siempre en solo lectura. Sin `--subir` nada se escribe en Supabase;
  con `--subir`, solo vía el endpoint y solo en `post_cierre_*`. Salidas en
  `salida/` (no va a git).

## Criterios en vigor (decididos en sesión 29/09)

- **Ventana post-cierre principal:** desde el cierre hasta tocar SL original
  o TP, máximo **4 h de mercado** = 240 velas M1 reales
  (`VENTANA_POST_CIERRE_MIN_MERCADO`). Fines de semana y cortes diarios no
  cuentan: un cierre el viernes 22:30 sigue el lunes 00:00 (verificado).
  24 h se descartó por irreal para esta operativa.
- Columnas aparte: recorrido a favor en 1 h y 4 h fijas (sin cortar en SL/TP).
- **Veredicto de cierre a mano** (umbral `UMBRAL_FAVOR_MANUAL_PTS = 5.0`):
  - toca SL sin haber ido 5 pts a favor → `bien_cerrado`
  - toca SL tras ir 5+ pts a favor → `mixto_te_saliste_con_poco`
    (pts en `pts_favor_antes_sl`)
  - toca TP primero, o 5+ pts a favor sin tocar SL → `pronto`
  - resto → `correcto`; SL y TP en la misma vela → `indeterminado`
- **Breakeven:** real si SL a ±1 pt de la entrada (`puntos_desde_entrada`),
  nunca por tiempo. **Criterios v2 (02/10)** — tras salir en BE, misma lógica
  que los cierres a mano (umbral `UMBRAL_FAVOR_MANUAL_PTS` = 5 pts, misma ventana):
  - toca SL original sin haber ido 5+ pts a favor desde la salida → `te_salvo`
  - toca SL original tras ir 5+ pts a favor → `mixto_te_saco_de_un_recorrido`
    (pts en `pts_favor_antes_sl`, la misma columna que los cierres a mano mixtos)
  - 5+ pts a favor sin tocar SL, o toca TP → `te_saco_de_un_ganador`
  - resto → `sin_efecto`
  - Con BE real pero salida distinta de BE no cambia: `te_salvo` si el SL
    original se habría tocado durante el trade tras el BE, si no `sin_efecto`.
  - (v1, hasta el 02/10: toca SL → `te_salvo` siempre; > 0.5× distancia
    entrada→SL a favor → `te_saco_de_un_ganador`. Ejemplo que lo motivó:
    01/10 13:01, compra 178497, salió en BE, fue +15,2 y luego tocó el SL 4165:
    v1 decía `te_salvo`, v2 dice mixto.)
- **Resumen como en la web:** vista GLOBAL (todas las cuentas, también las
  que ya no se usan) como principal + desglose por cuenta con los mismos bloques.
- Periodos: septiembre = fiable; agosto = secundario; junio/julio entran en
  "todo el histórico" pero casi sin veredicto (datos NULL).

## Resultados de hoy (29/09) — vista global

298 trades de 8 cuentas (152034, 167807, 174645, 176821, 178497, 179003,
7747760, 7754620). Velas disponibles para los 298 (ventana post-cierre
completa en todos).

| Cierres a mano | Todo (161) | Sept+ago (127) | Solo sept (50) |
|---|---|---|---|
| bien_cerrado | 56 | 52 | 22 |
| mixto_te_saliste_con_poco | 21 (media 8,2 pts antes del SL) | 17 | 8 |
| pronto | 76 (media 23,0 pts dejados, mediana 18,7; total 1744) | 52 | 17 (media 18,7) |
| correcto | 8 | 6 | 3 |

- Breakeven real (85 trades): te_salvo 32 · te_saco_de_un_ganador 12 · sin_efecto 41
  (criterios v1; los números v2 están en la sección FASE 2).
- Salidas por SL: pérdida 50 · breakeven 53 · beneficio (trailing) 31.
- Tendencia: los `pronto` bajan en septiembre, sobre todo desde W38
  (W39: 9 bien_cerrado, 2 pronto).
- Resultado post-cierre de todos los trades: fue_a_sl 171 · ninguno en 4 h 92 · fue_a_tp 35.

Detalle completo en `salida/resumen.md` (global + por cuenta),
`salida/resultados.csv` (fila por trade) y `salida/examen_ea.md`.

---

## Fallos de la EA — estado al 05/10 (rama `feature/ea-sync`, EA v1.04)

Análisis y arreglos del 05/10. **EA 1.04 desplegada en BD8B1008… el 05/10 a las
23:27:31** (ver "Despliegue de la 1.04" arriba); la rama aún sin fusionar en
`main` hasta confirmar los fallos 1 y 3 con trades reales. Resumen; el detalle original de
cada fallo sigue debajo.

| # | Fallo | Causa encontrada | Arreglo | Estado |
|---|---|---|---|---|
| 1 | MFE/MAE nulos | (a) el código MFE/MAE (v1.03) nunca se desplegó: la EA en uso es v1.02; (b) **`handleClose` pisaba MFE/MAE con null** cada vez que `SyncHistory48h` reenviaba el `close` | (a) va en v1.04; (b) `api/trade-mt5.js`: solo escribe MFE/MAE si vienen (probado con mock) | (b) **en producción, `172a3da`**; (a) EA 1.04 desplegada 05/10: **pendiente de confirmar con el próximo cierre real** |
| 2 | Duplicados `ea_sl_changes` / `ea_tp_changes` | Casi todos de julio (bug de la cola, cerrado 20/07: grupos de 16–128). Desde agosto, parejas por reintento: timeout `WebRequest` de 4 s (`HTTP:1003 / error 5203` a ~4,2 s, log 29/09) con el servidor ya habiendo insertado; el endpoint hacía POST sin idempotencia | Limpieza (403 + 72 filas a `respaldo.*`), índices únicos `(cuenta_numero, position_id, timestamp, valor nuevo)`, endpoint con `on_conflict` + `ignore-duplicates` (**en producción, `9f468b7`**); EA: `TimeoutWebRequestMs` = 15 s y cada pasada de la cola se corta en el primer fallo de red (no en errores HTTP, para que un evento rechazado no bloquee la cola) | Servidor hecho; EA 1.04 desplegada 05/10 (sync con 0 duplicados y 0 errores HTTP). Prueba en producción del duplicado no hecha (requiere las credenciales de la EA; no se leen) |
| 3 | 'breakeven' mal etiquetado | Umbral de 3 pts (`HandlePositionModified`) frente a 1 pt del análisis; además, poner el primer SL a < 3 pts contaba como BE. Desde el 28/08: 24 de 88 falsos (1,03–2,96 pts) | Input `BeToleranciaPts` = 1.0; primer SL (`sl_prev == 0`) nunca es BE: `sl_protegido` si protege la entrada, si no `sl_ajustado`. Simulado sobre los datos reales: 64 BE reales se quedan, 24 falsos pasan a `sl_protegido` (18) / `sl_ajustado` (6) | EA 1.04 desplegada 05/10: **pendiente de confirmar con el próximo movimiento de SL**. Reetiquetar históricos en `trade_eventos`: opcional, sin decidir |
| 4 | `cierre_tp` / `cierre_sl` | **No es un fallo de la EA.** 178497: 75/76 cierres coinciden con `DEAL_REASON` de MT5 (32 manual, 43 SL), 0 cierres por TP en MT5. Las "discrepancias" son del examen de `post_cierre.py` (SL con 1,5–2 pts de deslizamiento o `sl_actual` NULL; tolerancia 1 pt) y ya se usa el tipo de la EA. Falta 1 evento de cierre (22819382, 15/09) | Ninguno en la EA | Cerrado (falso positivo) |
| 5 | Cierres no reconciliados | `SyncHistory48h` solo al arrancar y solo 48 h; nada al reconectar. Casos: 23827187 (PC suspendido) y **23453924** (25/09: EA quitada 17 min antes del SL, recargada 52 h 40 min después; arreglado con `sql_fix_cierre_23453924.sql` el 05/10). **Además, `SyncHistory48h` solo procesaba 1 posición por arranque** (tras `HistorySelectByPosition` los demás tickets no se pueden leer; logs: siempre "procesadas: 1") | `aurum_abiertas_<cuenta>.txt` con las posiciones vistas abiertas; `ReconciliarPosicion` (parciales + close + evento con `DEAL_REASON`, MFE/MAE null) al arrancar, al reconectar (+30 s) y cada `ReconciliarCadaMin` (15); `SyncHistory48h` reescrita (recoge primero los position_id) y usa la misma función | EA 1.04 desplegada 05/10: posición abierta apuntada en `aurum_abiertas_178497.txt`, `SyncHistory48h` procesó 7 (antes 1). Falta ver una reconciliación real tras reconexión |

## Fallos de la EA — detalle original (29/09)

Ninguno se ha tocado. Implican EA de producción y/o `api/trade-mt5.js`;
antes hay que sincronizar la copia del repo con la que corre en MT5.

1. **MFE/MAE nulos** — `mfe_price/mfe_puntos/mae_price/mae_puntos` a NULL
   en 298/298, pese a `ActualizarExtremosAbiertas` (`1a16f57`) y
   `api/trade-mt5.js` (`0817b5a`) desplegados desde el 04/09. Con velas M1
   se calculan en 298/298, así que el dato existe: falla el envío o el guardado.
2. **Duplicados en `ea_sl_changes` / `ea_tp_changes`** — 475 de 1661 filas
   son duplicados exactos. Sin idempotencia en `api/trade-mt5.js`: cada
   reintento de `ProcessRetryQueue()` reinserta. Falta UNIQUE +
   ignore-duplicates como en `trade_eventos`.
3. **'breakeven' mal etiquetado** — 184 de 288 eventos 'breakeven' son
   falsos (SL a más de 1 pt de la entrada). Sobre todo en **agosto: 163 de
   210 falsos**; septiembre 21 de 78. La EA debe exigir |puntos_desde_entrada| ≤ 1.
4. **Clasificación `cierre_tp` / `cierre_sl`** — 0 `cierre_tp` guardados en
   298. 6 discrepancias con lo deducido por precio: 5 guardados `cierre_sl`
   que por precio son cierre manual (6523428, 22655382, 6481001, 6421549,
   6407739) y 1 `cierre_manual` que por precio es SL (23329398). Revisar
   `DEAL_REASON_*` y el desempate por precio en `HandleDealClose`.

5. **Cierres perdidos con el PC suspendido / MT5 apagado (05/10)** — Caso
   23827187 (178497, venta 1,00 @ 4147,36 a las 04:49:57; parcial 0,80 @
   4140,44 a las 04:59, grabado): el PC se **suspendió** con MT5 cargado
   (05:36 → 13:28), el resto 0,20 saltó por SL a las **08:06:41 @ 4147,46**
   (`[sl 4147.00]`, −2 $; total 551,60 $) y la EA nunca lo grabó: al reconectar
   MT5 no dispara `OnTradeTransaction` por deals ocurridos mientras estaba
   desconectado, y la EA no se reinició, así que `SyncHistory48h` (solo en
   `OnInit`/primer `OnTimer`) no corrió. La posición quedó `estado='open'` en
   `ea_trades` y fuera del Diario. Completado a mano con
   `sql_fix_cierre_23827187.sql` (ejecutar en Supabase; replica `handleClose`
   + evento `cierre_sl`). **Arreglo en la EA:** al arrancar **y también al
   recuperar la conexión** (transición de `TERMINAL_CONNECTED` a true, mirada en
   `OnTimer`) **y cada X min como red de seguridad**, reconciliar: pedir a
   Supabase (endpoint nuevo de solo lectura, p. ej. `?accion=abiertas` con las
   credenciales de la EA) las posiciones de esa cuenta que siguen `open`, y para
   cada una que ya no esté en `PositionSelectByTicket`, leer
   `HistorySelectByPosition` y mandar lo que falte: `partial_close` por cada
   deal OUT no grabado (idempotente por `deal_id`), `close` con el último deal
   (precio, `DEAL_TIME`, beneficio = suma de deals OUT, como
   `GetBeneficioTotalPos`) y el evento `cierre_tp`/`cierre_sl`/`cierre_manual`
   según `DEAL_REASON`. Sin límite de 48 h (lo que diga Supabase que sigue
   abierto). Hoy `SyncHistory48h` además manda solo el `close` y el evento
   genérico `cierre`, sin parciales: unificar las dos rutas.

Menores (no son de la EA): 5 SL y 6 TP originales con dedazo de tecleo
(sección 4 del examen); 3 precios fuera de su vela M1 (sección 6);
162 trades sin `estrategia` (casi todos antes del 26/08).

---

## Siguiente paso

FASE 2 hecha (ver arriba). Pendiente:

- **Revisión visual del Diario en producción con sesión iniciada** (02/10 solo
  se pudo verificar por HTTP: archivos, sintaxis de los 15 scripts, endpoint y
  colocación en el DOM; sin navegador no se pudo entrar con la cuenta).
- **Siguiente mejora — detectar "entrada prematura":** en trades cerrados con
  pérdida o en breakeven, comprobar si en las horas siguientes al cierre el
  precio llegó a ir a favor de la dirección del trade una distancia relevante
  medida desde la entrada. Umbrales por decidir: ventana (p. ej. 8 h de
  mercado) y distancia (p. ej. ≥ 1R o ≥ 10 pts). Mostrarlo en el veredicto de
  cada trade y como bloque nuevo en "Tu semana" ("la idea era buena, la
  entrada fue pronto"). Pedido el 02/10, sin hacer todavía.
  Notas para construirlo: la ventana post-cierre actual es de 4 h (240 velas M1
  en `post_cierre_velas`), así que hará falta ampliar el análisis (el script ya
  pide 5 días de calendario a MT5, de sobra para 8 h de mercado), añadir
  columnas a `post_cierre_analisis` y subir `CRITERIOS_VERSION` para
  recalcular todo. La distancia se mide desde la **entrada**, no desde el
  cierre como el resto del post-cierre.
- **Mejora futura — "ganador devuelto":** trades con MFE durante el trade
  ≥ 10 pts que terminaron en pérdida o en breakeven. Mostrarlo en el veredicto
  del trade ("llegaste a ir +X a favor") y contarlo en "Tu semana". Pedido el
  02/10, sin hacer todavía.
  Notas para construirlo: `mfe_puntos` ya está en `post_cierre_analisis`, así
  que se puede hacer solo en el front, sin script ni `CRITERIOS_VERSION`.
  "Pérdida o breakeven" = `tipo_cierre_detallado` en
  (`sl_original_o_ajustado_perdida`, `sl_breakeven`) o P&L ≤ 0 en `trades`
  (para incluir cierres a mano en pérdida). Umbral de 10 pts como constante.
- **Mejora futura — simulador de gestión:** re-simular TODOS los trades con
  reglas alternativas y comparar resultado total (pts y $), win rate y peor
  racha: (a) gestión real, (b) BE a +5 / +10 / +15, (c) parcial 50% a +10 y el
  resto con BE, (d) SL 11 / TP 33 fijos sin intervenir. Tabla global y por
  estrategia. El informe debe avisar de que es una simulación con velas M1.
  Pedido el 02/10, sin hacer todavía.
  Notas para construirlo:
  - Mejor en `post_cierre.py` con velas M1 de MT5 que con `post_cierre_velas`:
    las velas guardadas se agrupan cuando el trade dura > 240 min
    (`tf_durante_min` > 1) y solo cubren 4 h tras el cierre, y con SL/TP fijos
    o BE el trade simulado puede seguir vivo después del cierre real. Hará
    falta una ventana máxima por trade (p. ej. hasta tocar SL/TP o fin de sesión).
  - Vela M1 que toca a la vez el nivel de BE/parcial y el SL: no se sabe el
    orden. Elegir criterio conservador (primero el SL) y contar cuántos casos
    hay, igual que `ambiguo_misma_vela`.
  - $ = pts × 100 × volumen (`VALOR_PUNTO_XAUUSD`); la parcial necesita el
    volumen del trade (ya viene en `volumen`). Win rate y peor racha por orden
    de `fecha_entrada`; global y por estrategia, y si se quiere, por cuenta.
  - Resultado como informe aparte (p. ej. `salida/simulador.md`) y/o tabla nueva
    en Supabase si se quiere ver en el Diario.
- **Optimizador de SL/TP — HECHO (02/10):** `tools/post_cierre/optimizador.py`
  (con MT5 abierto: `.venv\Scripts\python.exe optimizador.py`; opciones
  `--hasta`, `--riesgo-eur`, `--eurusd`). Lee todos los trades por
  `GET ?accion=trades` (nuevo, solo lectura; el payload trae ahora `beneficio`),
  re-simula con velas M1 y deja `salida/optimizador.md` (informe) y
  `salida/optimizador_rejilla.csv` (toda la rejilla, en y fuera de muestra).
  Supuestos (constantes al principio del archivo): rejilla SL 7–25 × TP 7–50 de
  1 en 1 × 5 gestiones (sin gestión, BE +5/+10/+15, parcial 50% a +10 + BE);
  entrada real; hasta 24 h de mercado y si no toca nada, cierre a mercado; vela
  que toca dos niveles → lo peor (primero SL; tras BE, salida en BE); sin
  spread ni comisión; riesgo fijo 126 € al EUR/USD de MT5 (`EURUSDc`); "día
  que rompe 500 $" = una cuenta pierde ≥ 500 $ ese día; se elige por esperanza
  con riesgo fijo en muestra (≥ 8 trades). Gestión real = `beneficio` real.
  Verificado: 9 casos sintéticos OK; los 20 trades que cerraron en su SL
  original, simulados con ese SL, lo tocan en el mismo minuto que el cierre real.
  **Primer resultado (02/10, en muestra hasta 31/08: 171 trades; fuera: 129):**
  - Global: la mejor en muestra (SL 7 / TP 31 sin gestión, +20 $/trade con
    riesgo fijo) **no aguanta fuera de muestra** (−16 $/trade, puesto 2.843 de
    3.857): sobreajuste. La gestión real pierde en los dos periodos (−8 y
    −18 $/trade). SL 11 / TP 33 pierde en muestra (−12) y gana fuera (+21):
    ninguna regla fija es mejor en los dos periodos.
  - rechazo_rsi: SL 9 / TP 50 sin gestión, elegida con solo 13 trades, aguanta
    fuera (+107 $/trade, 42 trades, puesto 10; gestión real −23), pero con WR
    29% y 6 pérdidas seguidas. Prometedor, muestra pequeña.
  - estructura: 11 trades en muestra; la elegida falla fuera de muestra.
  - Las estrategias solo existen desde el 26/08: en muestra casi todo es "sin
    clasificar". Repetir cuando haya más meses clasificados (p. ej. optimizar
    sept, validar oct–nov con `--hasta`).
- **Mejora futura — vista "Tu día" en el Diario:** pedido el 05/10, sin hacer
  (solo anotado).
  - Gráfico del día completo (M5/M15) con todas las entradas y salidas marcadas.
  - Sesgo del día calculado de forma objetiva: precio respecto a una media en
    H1/H4 y dirección del día.
  - Trades del día clasificados a favor o en contra del sesgo, con su resultado.
  - Resumen del día: P&L, vueltas, errores y distancia al límite de 500 $.
  - En el histórico: win rate y $ de los trades a favor vs en contra del sesgo.
- **Mejora futura — vincular capturas a cada trade del Diario:** en el detalle de
  cada trade, mostrar sus capturas; el botón "Capturar pantalla" debe asociar la
  captura al trade seleccionado (por fp), y poder adjuntar una captura que ya
  esté en la carpeta a un trade. Pedido el 02/10, sin hacer.
  Notas para construirlo: hoy `capturas-test.js` guarda `captura_<ts>.jpg` +
  `.json` (nota, fecha, carpeta, ruta_pc) en la carpeta local, sin vínculo a
  ningún trade y fuera del detalle del trade. Opción sin Supabase: añadir `fp`
  al JSON (o nombrar `<fp>_<ts>.jpg`) y, al abrir el detalle, listar la carpeta
  (`handle.values()`, requiere el permiso / Reconectar) filtrando por fp.
  Adjuntar una existente = `showOpenFilePicker` sobre la carpeta y escribir o
  actualizar su JSON con el fp. Las imágenes siguen solo en el PC del usuario;
  si se quieren ver desde otro dispositivo habría que subirlas (ver capturas
  automáticas desde la EA, arriba). La zona de capturas solo está activa para
  los packs senda / cima / vip.
- Siguientes versiones: incubadora de estrategias e informe diario.
- Pendiente menor del script: desglose "¿cambia tu gestión con el lote?" en
`resumen.md` (el volumen ya viaja en `resultados.csv`, falta agregarlo).
