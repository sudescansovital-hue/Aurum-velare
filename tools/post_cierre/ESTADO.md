# Estado — análisis post-cierre: FASE 1 (examen de la EA) + FASE 2 (Diario web)

> Actualizado 07/10/2026 (ETAPAS v2 EN PRODUCCIÓN: SQL aplicado por el usuario y web (Mi proceso + admin); antes, revisión 2 del SQL; punto 3 de "Mi proceso" en producción: barra de etapa por días limpios; "Mi proceso" completo; punto 2 en producción: aciertos, errores y regla de la semana; base de los MODOS en producción: plan del día, modo de cada trade y plan frente a realidad; punto 1 de "Mi proceso", "Tu situación", en producción; punto 0 en producción y comprobado; textos "Pack" en la web; idea "Alertas al móvil"; propuesta "Modos, plan del día y tablero en directo", pendiente nº 3). Antes, 06/10/2026, noche (Diario al instante desde `ea_trades`, bloque "Hoy" y plan del trader en producción; **un push a `main` despliega solo**). Antes, 06/10 (cierre de sesión: decisiones y pendientes abajo; "Edge por cuenta"; "Mis reglas"; propuesta "Mi proceso"). Antes: 05/10/2026 (post_cierre automatizado con tarea programada; fallo 5 de la EA). Antes: 02/10/2026. **FASE 2 en producción** (primer deploy `cdede9a` /
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
   fase se enseña antes de desplegar. **HECHO: puntos 0, 1, 2 y 3 en
   producción (07/10).** Queda comprobar el 3 con la sesión del usuario.
3. **Etapas v2 — HECHO (07/10, en producción)**: SQL aplicado y web (Mi
   proceso y admin). Ver "Etapas v2: en producción". Queda que el usuario lo
   compruebe con su sesión.
4. **Modos, plan del día y tablero en directo** (sección "Modos, plan del día
   y tablero en directo (propuesta 07/10)", debajo de la de "Mi proceso").
   **Base hecha y en producción (07/10)**: tablas, plan del día, modo de cada
   trade y plan frente a realidad (ver "Modos: base en producción"). Falta lo
   que depende de la plantilla del usuario: normas por modo (`modo_id` en
   `reglas_valores`), escalado con suelo y tablero; la vista Directo espera
   además la maqueta.
5. **Mis reglas, fase 3:** panel del admin con candado. Ojo: con el trigger
   actual, si el admin fija un nivel más estricto el usuario ya no puede editar
   su fila de ese nivel (ni el nombre ni el plan) sin bajar antes el importe;
   resolverlo al hacer esta fase (ver "Diario al instante y plan del trader").
6. **Frase del runner con cada parcial por separado.**
7. **Punto 4 — velas desde la EA y análisis en el servidor** (sección
   "Siguiente gran paso (02/10)", pasos 3 y 4).
8. **Capturas por trade** en la carpeta local del usuario (ver "Junto a este
   paso" más abajo y "vincular capturas a cada trade" en Siguiente paso).
9. **Rango y recorrido diario en pts.**
10. **Rehacer Evalúame.**
11. **Guía "Cómo funciona Aurum".**
12. **Alertas al móvil** (sección "Alertas al móvil (idea 07/10)", debajo de
   la de "Modos…"). Fase 1 no toca la EA; fases 2 y 3 esperan a fusionar
   `feature/ea-sync`. (Movido casi al final el 07/10, a petición del usuario.)
13. **Modo claro.**

Pendiente menor: el admin se reconoce por email en el SQL de Mis reglas (ver
sección Mis reglas); cambiarlo cuando haya más de un admin.

Pendiente menor: **Mi gestión y Mi proceso no se adaptan a móvil** (Mi
gestión se desplaza de lado; en Mi proceso la columna central queda casi sin
ancho; ya pasaba antes del 07/10). No tocar ahora.

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
  (hoy solo `POST_CIERRE_EMAIL`, pendiente 7); para otros usuarios: "Disponible
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

0. **HECHO (07/10, en producción).** Bugs pequeños de la página: "→ Confianza"
   fijo, "desde el 1 feb 2026" fijo, "real" frente a "simulado", etapa 0
   imposible, subtítulos de retos vacíos. Ver "Punto 0 de Mi proceso (07/10)".
1. **HECHO (07/10, en producción).** "Tu situación" con solo `trades`:
   rentable por cuenta + mes a mes. Ver "Punto 1 de Mi proceso (07/10)".
2. **HECHO (07/10, en producción).** Aciertos, errores y regla de la semana
   (`_daConclusionesTodas()`). Ver "Punto 2 de Mi proceso (07/10)".
3. **HECHO (07/10, en producción).** Barra por días limpios + aviso "listo"
   en el admin. Ver "Punto 3 de Mi proceso (07/10)".

---

## Punto 0 de Mi proceso (07/10) — EN PRODUCCIÓN

Rama `feature/mi-proceso` (`ebc7c41`), merge en `main` `837152c`, deploy
`aurum-velare-8hirm47sc` (desde copia limpia con `git worktree`). Enseñado
antes con capturas antes/después en local (Chrome sin interfaz, sesión y
Supabase simulados con datos inventados, escritorio y móvil). **Comprobado
por el usuario con su sesión en producción (07/10): se ve bien.** Sin cambios de cálculo (trades,
WR, P&L, OZT, % de ciclo) ni de textos de "Pack".

- **"→ etapa siguiente"** del recuadro "Tu nivel" (`dash-nivel-next`): la real
  según `usuarios_aurum.etapa` (antes "→ Confianza" fijo en el HTML).
- **"desde el …"** de Días en proceso (`dash-dias-desde`): misma fecha
  (`fecha_entrada` o `created_at`), p. ej. "desde el 15 mar 2026".
- **P&L acumulado:** debajo solo "N cuentas" (fuera "entorno real/simulado").
- **Etapa 0:** se muestra ("00 · Descubrimiento → Silencio"). `app.js` guarda
  además `usuarioActual.etapa_real`; `usuarioActual.etapa` sigue convirtiendo 0
  en 1 porque la usa el OZT (`etapa × 30`): **un usuario en etapa 0 sigue
  sumando el OZT de la etapa 1**, como antes (no se tocó el cálculo).
- **Retos:** `dash-ozt-retos` y `dash-ozt-widget-sub` cuentan
  `retos_participantes` con `ganador=true` ("2 retos completados"); sin retos
  o si falla la consulta, "Sin retos completados todavía".
- **P&L por signo (verde ≥ 0, rojo < 0):** Mi proceso (`dash-pnl-global`),
  Historial externo (`hist-global-pnl`; las filas por cuenta ya iban bien),
  Ciclo 111 (`ciclo-pnl`) y tarjeta Maestra del Trade Record. Retos, Prueba y
  Global mantienen su color de cuenta (ámbar, azul, dorado).
- **Cabecera fija de Mi gestión / Mi proceso** (comportamiento sin cambiar):
  (1) la franja dorada de aviso no es fija y al hacer scroll dejaba 36 px
  transparentes encima del menú (`top:36px`) por donde asomaba el contenido:
  `nav::before` los tapa con el fondo y la franja va por encima
  (`z-index:101`), así que arriba se ve igual; (2) con sesión el menú mide
  183 px (fila "Bienvenido") y las barras pegajosas (pestañas de Mi gestión y
  `.sidebar`) estaban a `top:147px`, debajo de él: ahora usan
  `var(--nav-bottom, 147px)`, medido del menú real con `ResizeObserver`
  (script en `index.html`). Comprobado a 1440 px y en móvil: pegadas a 183 px.
- Mi gestión no se adapta a móvil (la página se desplaza de lado): es anterior,
  sin tocar (anotado como pendiente menor).
- **Avisos de salas (07/10, `b1497a0`, deploy `aurum-velare-psjtsx4ez`):** los
  7 avisos de las salas en `index.html`, el de `salas.js` y el error 403 de
  `api/livekit-token.js` dicen "Necesitas un Pack…" en vez de "Camino".
- **Resto de textos "Pack" (07/10, `cbc5e7a`, deploy `aurum-velare-af296lnjo`):**
  login ("Pack requerido", "¿Sin Pack?", "Ver los Packs →"), aviso de acceso a
  Mi proceso / Mi gestión y "Pack Umbral / Raíz / Senda" en `valor.html`
  (precios, FAQ y datos estructurados). Quedan con "Camino" solo el Camino de
  Santiago (Tablillas) y "✦ Camino matemático a la Etapa 5" (Equity: es un
  recorrido, no el Pack).

---

## Etapas v2: en producción (07/10)

**SQL** `tools/post_cierre/sql_etapas_v2.sql` (rama `feature/etapas-v2`,
`1ae6793`) **aplicado por el usuario el 07/10**: criterios 102, por etapa 1:3
2:4 3:5 4:7 5:9 6:11 7:12 8:12 9:12 10:13 11:14, policies 5, tamaños 18. La API
ve las tablas (200 con la clave pública). **Nota:** al aplicarlo, la parte de
triggers/RLS se ejecutó DESPUÉS de los inserts iniciales, así que los 102
criterios iniciales **no tienen fila en `etapa_criterios_historial`**; los
cambios a partir de entonces sí quedan registrados.

**Decisiones del usuario sobre la revisión 2 (07/10):** puntos 1–5 y 8, como
estaban; **6: la MISMA cuenta** tiene que cumplir todos los criterios de
resultados de una etapa; **7: los de RESULTADOS van en ventanas móviles**
(últimos N días / meses naturales completos), NO desde el cambio de etapa; los
de disciplina, desde el último cambio de etapa (plan/modos, desde el 07/10).

**Web** (`etapas.js`, `7f86335`, merge `7bb1c3d`, deploy
`aurum-velare-hek5w35u9`, copia limpia). Funciones puras para Mi proceso y
admin; usa `dias-limpios.js` y, para la regla de la semana, el Diario.
- **Mi proceso**: bloque "Para llegar a «X»" (tras "Tu situación") con los
  criterios de la etapa SIGUIENTE en dos columnas, Disciplina y Resultados
  (con la cuenta usada), cada uno con barra, valor actual / objetivo y nota.
  "Tu nivel" (Mi proceso y Mi gestión) y "Nivel actual" pasan a % de la etapa
  = media de los criterios (cada uno topado), "N de M criterios → X", "Ver
  criterios" y "Ver días limpios" (lista del punto 3). "✦ Listo para revisión"
  cuando se cumplen todos. En Oro: "estás en la última etapa".
- **Cuenta de resultados**: entre Maestra / Prueba / Retos (las del tamaño de
  cuenta) la que más criterios cumple y más cerca está; si no tiene ninguna
  asignada, entre todas. (Decidido al probarlo: si no, con los datos reales
  salía la cuenta antigua 152034.)
- **Cómo se mide cada tipo** (disciplina, desde el día siguiente al último
  cambio de etapa): días operados y limpios = punto 3; plan antes del primer
  trade = % de días (por día de entrada) cuyo primer trade tenía plan vigente
  de su carpeta o de `todas`; trades con modo = % con corrección con modo o
  plan vigente; regla de la semana = semanas cerradas seguidas (desde la más
  reciente) sin incumplir la regla de esa semana (la del Diario con los datos
  hasta su lunes; semana sin operar o sin regla (pocos datos) = neutra: ni
  suma ni corta la racha — decidido por el usuario el 07/10; `d995813`,
  deploy `aurum-velare-pxzutos82`);
  % de días limpios = últimos N días operados (hace falta tener N);
  días sin «Cierre obligatorio» = racha de días operados sin que ninguna cuenta
  llegue al último nivel de pérdida diaria. Resultados (por cuenta, hasta
  ahora): racha de días operados de esa cuenta sin llegar al último nivel; PF
  y nº de trades de los cerrados en los últimos `ventana_dias`; meses = P&L
  por mes de cierre de los últimos meses naturales completos (el en curso no
  cuenta; mes sin trades = no positivo); media mensual / tamaño de su carpeta
  (`cuenta_tamanos`, 50.000 por defecto).
- **Admin**: bajo "Etapa N": "% · cumplidos/total" o "✦ listo", "⚠ no mantiene
  «X»" y "criterios" (despliega la fila: criterios de la siguiente etapa, las
  3 últimas semanas de "mantener" con lo que falla, y los 3 tamaños de cuenta
  con "Guardar tamaños"). **Editor** "Criterios de las etapas" (botón "Editar
  criterios" bajo la tabla de usuarios): por etapa, nombre, objetivo,
  parámetros (JSON) y activo; cada cambio, al historial. No añade ni borra
  criterios (se puede desactivar).
- **"⚠ no mantiene «X»"**: en las 3 últimas semanas cerradas (hasta cada
  domingo) no cumplió los criterios de su etapa ACTUAL. Para "mantener" se
  miran solo resultados (ventanas móviles), EA, reglas y los % de disciplina
  (plan, modo y días limpios) en ventana móvil (últimos 30 días operados o 200
  trades) sin el corte del cambio de etapa; los de recuento o racha (días
  operados, días limpios, semanas de la regla, días sin «Cierre obligatorio»)
  NO, porque vuelven a 0 al cambiar de etapa y saldría el aviso siempre al
  empezar una. **Decidido por mí; a confirmar por el usuario.** Nunca cambia
  la etapa. Constante `ET_SEMANAS_AVISO` = 3.
- `dias-limpios.js`: `dlCalcular` añade por día `nivelMax` y `porCuenta`, y
  calcula los días aunque no haya reglas (para "días operados"). Punto 3 sin
  cambios (comprobado: mismas cifras). `app.js`: `tiene_ea` en `usuarioActual`.
- Sin la tabla de criterios (o si falla), se queda la barra del punto 3 en Mi
  proceso y los días limpios en el admin.
- **Con los datos reales** (export del 06/10, perfil simulado en etapa 3
  Estructura con último cambio el 15/09, criterios = los del SQL): para llegar
  a Fractura 72 % · 4 de 7 (EA ✓, reglas ✓, 14 días operados ✓, días limpios
  8/20, plan sin días desde el 07/10; Maestra: 13 de 20 días sin «Cierre
  obligatorio», PF 1,36 con 62 trades en 60 días ✓). "⚠ no mantiene
  «Estructura»": W38–W40 sin 20 días operados seguidos sin llegar a −1.100 $ en
  Maestra ni en Prueba. Regla de la semana: W40 no cumplida (01/10, seguir tras
  −800). Las cifras reales dependen de la etapa y del último cambio reales.

---

## Etapas v2 (propuesta 07/10, revisión 2) — diseño (aplicado: ver la sección de arriba)

Pendiente nº 3. Va **encima del punto 3** (días limpios) sin romperlo: los
días limpios pasan a ser uno de los criterios. Nada de esto cambia
`usuarios_aurum.etapa` ni la forma de asignar/guardar etapas: el admin sigue
decidiendo (guardar etapa → `etapa_historial`). No toca la EA.

**Decidido por el usuario (07/10):**
- Los criterios de una etapa = lo que hace falta para **LLEGAR** a ella. El
  usuario ve los de la etapa SIGUIENTE a la suya, cada uno con su barra; % =
  media de sus criterios; "✦ Listo para revisión" cuando los cumple TODOS.
  Descubrimiento (0) no tiene: es la de entrada.
- **Aviso en el admin "⚠ no mantiene «X»"**: el usuario deja de cumplir los
  criterios de su etapa ACTUAL (los que le hicieron llegar) 3 semanas
  seguidas. Nunca baja la etapa: decide el admin.
- Todo se cuenta desde el último cambio de etapa (`etapa_historial`); plan del
  día y modos, además, solo desde el 07/10/2026.
- Interpretaciones aceptadas: "60/90 días sin «Cierre obligatorio»" = racha de
  días OPERADOS seguidos; trimestres/meses naturales en una misma cuenta;
  semana de la regla cumplida = sin incumplirla y con algún día operado (si no
  se dio la situación, cuenta); ventanas de días desde el cambio de etapa.
- **Tamaño de cuenta** por usuario y carpeta (maestra / prueba / retos), en $,
  por defecto 50.000, editable en el admin (para la media mensual en %).
- Criterios para LLEGAR (disciplina | resultados; cada etapa mantiene lo
  anterior y un valor nuevo del mismo tipo sustituye al anterior):
  - Silencio: EA conectada, reglas definidas, 10 días operados.
  - Umbral: 10 días limpios.
  - Estructura: 20 días limpios | ningún día por debajo del último nivel de
    pérdida («Cierre obligatorio») en los últimos 20 días operados.
  - Fractura: + plan del día antes del primer trade en el 90 % de los días
    (desde 07/10) | PF ≥ 0,9 en 60 días.
  - Claridad: + 80 % de trades con modo (desde 07/10) + 3 semanas seguidas
    cumpliendo la regla de la semana | una cuenta con PF ≥ 1,0 y ≥ 50 trades
    en 60 días.
  - Consistencia: 80 % de días limpios en los últimos 30 operados | PF ≥ 1,0 +
    2 de los últimos 3 meses en positivo.
  - Confianza: + 60 días operados seguidos sin «Cierre obligatorio» | PF ≥ 1,1
    en 90 días + 3 de los últimos 4 meses en positivo.
  - Paciencia: + 90 días seguidos sin «Cierre obligatorio» | PF ≥ 1,1 en 90
    días + 4 de los últimos 5 meses en positivo.
  - Rentabilidad: mantener 80 % de días limpios en 30 | PF ≥ 1,2 con ≥ 100
    trades en 90 días + los 3 últimos meses en positivo.
  - Vuelo: mantener lo anterior | 6 meses seguidos en positivo con media ≥ 3 %
    de la cuenta al mes.
  - Oro: mantener lo anterior | últimos 12 meses: año en positivo, ≥ 10 de 12
    meses en positivo y media ≥ 5 % de la cuenta al mes. Oro = nivel
    profesional: ganar dinero no basta.

**SQL** `tools/post_cierre/sql_etapas_v2.sql` (rama `feature/etapas-v2`,
`1ae6793`, revisión 2; la 1 era `bfd4d30`), **NO aplicado**:
- `etapa_criterios`: una fila por criterio y etapa a la que se llega (1–11),
  con `categoria` (disciplina / resultados), `tipo`, `objetivo`, `parametros`
  (JSON), `nombre` visible, `orden`, `activo`. Tipos de disciplina:
  `ea_conectada`, `reglas_definidas`, `dias_operados`, `dias_limpios`,
  `plan_antes_primer_trade`, `trades_con_modo`, `regla_semana_seguidas`,
  `pct_dias_limpios`, `dias_sin_nivel_maximo`; de resultados:
  `ultimos_dias_sin_nivel_maximo`, `cuenta_rentable` (objetivo = PF;
  `ventana_dias`, `min_trades`), `meses_positivos` (objetivo = n; `de`),
  `media_mensual_pct` (objetivo = %; `meses`), `periodo_positivo` (objetivo
  = meses). Los calcula la web; el SQL guarda objetivos.
- Valores iniciales: cada definición dice desde qué etapa se exige; cada
  etapa toma, por tipo, la más reciente → 102 filas (1:3 2:4 3:5 4:7 5:9 6:11
  7:12 8:12 9:12 10:13 11:14; 26 de resultados). Idempotente.
- `etapa_criterios_historial` (automático, solo admin). RLS: cualquier usuario
  con sesión lee los criterios; solo el admin escribe.
- `cuenta_tamanos` (usuario, carpeta, tamaño, por defecto 50.000): alta de 3
  filas por usuario existente; el usuario lee los suyos, solo el admin escribe.
- Probado en PGlite: 49 comprobaciones OK (ver la cabecera del SQL).

**Decisiones mías al traducirlo (a confirmar al revisar):**
1. Fractura "PF ≥ 0,9 en 60 días": en una cuenta y **sin mínimo de trades**
   (no se dijo).
2. Consistencia "PF ≥ 1,0": se queda el de Claridad (60 días, ≥ 50 trades).
3. Confianza y Paciencia "PF ≥ 1,1 en 90 días": mantienen el mínimo de 50
   trades de Claridad.
4. "Ningún día por debajo de «Cierre obligatorio» en los últimos 20 días"
   (Estructura) se mantiene hasta Oro (ya va implícito en las rachas de 60/90).
5. Vuelo: "6 meses seguidos en positivo" = 6 de los últimos 6, más la media
   ≥ 3 % de esos 6. Oro: el "año en positivo" va como criterio propio
   (`periodo_positivo` 12), aunque la media ≥ 5 % ya lo implica.
6. "Una cuenta": cada criterio de resultados puede cumplirse con cualquiera de
   las cuentas del usuario. A decidir: ¿la misma cuenta para todos los de
   resultados de una etapa?
7. Meses = naturales completos (el mes en curso no cuenta) y, como todo,
   desde el último cambio de etapa: llegar a Vuelo exige 6 meses después de
   llegar a Rentabilidad, y Oro 12 meses después de Vuelo.
8. Tamaño de cuenta sin historial de cambios (sí guarda quién y cuándo).

**Después de aplicarlo (paso 3):** en Mi proceso, los criterios de la
siguiente etapa con su barra (qué falta); en el admin, cada criterio por
usuario + "✦ listo" + "⚠ no mantiene"; editor de criterios y de tamaños de
cuenta en el admin.

---

## Punto 3 de Mi proceso: barra de etapa por días limpios (07/10) — EN PRODUCCIÓN

Rama `feature/dias-limpios` (`11e507b`), merge `1e8105d`, deploy
`aurum-velare-fd3wej9tm` (copia limpia). **Pendiente de que el usuario lo
compruebe con su sesión.** No cambia la forma de asignar ni guardar etapas.

- **Módulo `dias-limpios.js`**; `dlCalcular()` es pura y la usan Mi proceso y
  el admin. Constantes: `DL_OBJETIVO_DIAS` = 20 (v1, igual para todas las
  etapas), `DL_CALIDAD_DIAS` = 10, `DL_CALIDAD_MIN` = 80 %.
- **Día limpio** (decidido 07/10) = día operado en el que, con los niveles de
  Mis reglas que el usuario tiene AHORA (`reglas_efectivas`, carpeta de cada
  cuenta; sin carpeta → `todas`): ningún trade perdió ≥ la pérdida máx. por
  trade; si llegó a un nivel de pérdida diaria no abrió más trades después; si
  llegó al ÚLTIMO nivel de beneficio (el de mayor importe) paró (los
  intermedios no cuentan); y, solo en trades de la EA ya analizados, sin SL
  desprotegido ni TP1 no asegurado. Mismo criterio que los niveles del Diario
  (por cuenta y día de servidor del cierre, P&L en orden de cierre, "después"
  = abiertos desde el cierre que cruza el nivel). Un día es limpio si lo es en
  todas sus cuentas.
- **Datos**: `trades` (cualquier usuario, todas sus cuentas). Horas exactas de
  `ea_trades` si el trade es de la EA; si no, la del fp (cTrader / MT5 con
  hora) o el día + `hora` en punto y cierre = entrada + `dur_min`
  (aproximado). Trades sin fecha (importados antiguos) no cuentan.
- **Barra** = días limpios DESPUÉS del día del último cambio de etapa (última
  fila de `etapa_historial`, pasada a hora de servidor; sin filas, desde la
  fecha de entrada en Aurum, incluida) ÷ 20. Solo sube; un día sucio (también
  con «Cierre obligatorio») no resta. Calidad reciente = limpios de los
  últimos 10 días operados (de todo el histórico). 100 % + calidad ≥ 80 % →
  "✦ Listo para revisión de etapa". Nunca cambia `usuarios_aurum.etapa`.
- **Pantalla**: sustituye el % del ciclo de 111 en el recuadro "Tu nivel" (Mi
  proceso y también la barra lateral de Mi gestión, que es el mismo recuadro)
  y en la tarjeta "Nivel actual" ("8/20 días limpios hacia Fractura"). El % del
  ciclo queda solo en "Ciclo actual" (`gestion.js` ya no lo escribe en el
  nivel). Bajo la barra: "N de 20 días limpios → siguiente etapa", "Últimos 10
  días: x/10 limpios" y "Ver días" (también al pulsar la barra): lista de días
  con ✓/✗ y el motivo de cada uno. Sin reglas: "Define tus reglas en Mis
  reglas para empezar a medir tu progreso".
- **Admin**: bajo "Etapa N" de cada usuario, "8/20 · 60%" o "✦ listo" (carga
  los datos de cada usuario; tarda unos segundos). Al guardar un usuario se
  recalcula.
- **Con los datos reales** (export del 06/10, niveles de Roderas en `todas`):
  204 días operados con fecha, 151 limpios en todo el histórico; últimos 10
  días operados 6/10 limpios (60 %) → no "listo" aunque llegue a 20.
  Días limpios por fecha de último cambio de etapa (contando desde el día
  siguiente): 30/06 → 35 de 67; 31/07 → 22 de 46; 31/08 → 12 de 25; 15/09 → 8
  de 14; 30/09 → 2 de 3. La cifra real sale de `etapa_historial` (no leída
  desde aquí; se ve en Mi proceso → "Etapas completadas").

---

## Punto 2 de Mi proceso: aciertos, errores y regla de la semana (07/10) — EN PRODUCCIÓN

Rama `feature/aciertos-errores` (`482e3e1`), merge `85a35a5`, deploy
`aurum-velare-fp3t81g8c` (copia limpia). **Pendiente de que el usuario lo
compruebe con su sesión.**

- **Diario** (`diario-analisis.js`): `_daConclusionesTodas(filas, porFp)`
  devuelve todas las conclusiones de "Qué te conviene" con `tipo`
  (acierto/error), `clave`, `corta` y `regla` (imperativo). `_daConclusiones`
  = las de dinero > 0, ordenadas, máx. 4: **el Diario no cambia** (comprobado:
  mismo texto en Semana y en Todo el histórico que `main`). Clasificación:
  error = seguidas peor que esperar, vueltas peor que mantener, seguir tras un
  nivel con suma < 0, BE antes de TP1, TP1 no asegurado, runners peor que
  cerrar en la parcial, cerrar a mano peor que dejar correr; el resto, acierto.
- **Carga compartida**: `_daCargar()` devuelve la carga en curso si ya hay una
  (antes salía sin esperar) y guarda `_daDatosEmail`. "Tu situación" reutiliza
  `_daDatos` si ya están cargados; si no, llama a `_daCargar()`. Comprobado:
  1 petición al abrir Mi proceso y 1 más para 3 cargas simultáneas.
- **Mi proceso → "Tu situación"**, debajo del mes a mes: "Lo que haces bien" y
  "Lo que te cuesta" (3 y 3 por dinero; todas las cuentas, todo el histórico,
  solo trades analizados, como el Diario en Global → Todo el histórico; al
  pasar el ratón, la frase completa del Diario). Mínimo 20 trades auditados;
  sin trades de la EA: "Disponible cuando tus trades pasen por la EA".
- **Regla de la semana (Wnn)**: el error que más cuesta con los trades
  cerrados antes del lunes de la semana en curso (hora de servidor MT5, con el
  desfase de `modos.js`): no cambia a mitad de semana. Debajo, "Por qué" y
  cómo vas esta semana (según la regla: días que llegaste al nivel y si
  paraste, entradas seguidas, vueltas, BE antes de TP1, TP1 sin asegurar…).
- **Cifras con los datos reales** (310 trades EA del export del 06/10,
  analizados en seco con criterios v8 a partir de las velas de MT5, sin subir
  nada; coinciden con el "Qué te conviene" del Diario):
  - Bien: cerrar a mano te ahorró 4.987 $ (126); seguir tras +250 «Día bueno»
    +773 $ (11 veces); tras +500 «Oportunidad» +367 $ (5).
  - Te cuesta: seguir tras −800 «Límite» −5.069 $ (7 veces); tras −500 $ en
    un trade −4.706 $ (5); entrar seguido ~3.432 $ menos que esperando (151).
  - Regla W41: «Al llegar a −800 $ «Límite», para.» (301 trades hasta el
    domingo 04/10); esta semana (05–06/10) no se llegó a ese nivel.

---

## Punto 1 de Mi proceso: "Tu situación" (07/10) — EN PRODUCCIÓN

Rama `feature/tu-situacion` (`98df2ae`), merge en `main` `53492fe`, deploy
`aurum-velare-qjyev8ixu` (copia limpia). Enseñado antes en local con los
trades reales del usuario (export de `trades` del 06/10, 1.709 filas, solo
lectura; perfil simulado) y cifras verificadas con un cálculo aparte en
Python. **Pendiente de que el usuario lo compruebe con su sesión.**

- Módulo `tu-situacion.js` (aislado, solo lee `AURUM_TRADES`, `usuarioActual`
  y `_fechaRealTrade`); bloque `#tu-situacion` tras el saludo de Mi proceso;
  `app.js` solo añade la llamada `buildTuSituacion()` tras
  `buildDashboardHero()`. Los 4 números de siempre pasan debajo, más pequeños
  (mismos ids y cálculos).
- Por Maestra / Prueba / Retos, últimos 90 días (`TS_DIAS_VENTANA`): P&L,
  trades, PF, $/trade y veredicto: Rentable = P&L > 0 y PF ≥ 1,1; En
  equilibrio = PF 0,9–1,1; No rentable = resto; menos de 30 trades → "Sin
  trades suficientes (n de 30)". Evolución mes a mes: últimos 6 meses con
  pestaña por cuenta, mes en curso marcado. Pulsar una cuenta abre el Diario
  en esa cuenta.
- **Cuentas:** mismo criterio que las pestañas de Mi gestión
  (`getTradesActivos()`): número del admin (`usuarios_aurum.cuenta_*`) →
  trades con ese `cuenta_numero`; sin número → trades con la carpeta en
  `cuenta`; sin nada → "Sin cuenta asignada".
- Mes = día del trade (`fp` / `fecha`): `trades` no guarda el cierre.
- Con los datos reales (07/10): Maestra +2.351 $ · 72 trades · PF 1,58 →
  Rentable; Prueba −185 $ · 78 · PF 0,98 → En equilibrio; Retos sin cuenta.
- **Retos (aclarado 07/10):** el usuario perdió la 179003 y hoy no tiene
  cuenta de Retos. En el export del 06/10 sus 30 trades están como "Cuenta
  Externa", lo que encaja con que ya se quitó del admin (al vaciar el campo,
  `_reasignarCuentaExterna` pasa los trades de "Cuenta Retos" a Externa). No
  comprobado en Supabase. Si siguiera puesta: Admin → Editar usuario → vaciar
  "Cuenta Retos" → Guardar cambios.
- **Criterios distintos en la web (sin tocar):** las tarjetas de cuenta del
  Trade Record (`buildDashboardHero`, `statsCuenta`) cuentan por la etiqueta
  `cuenta` ("Cuenta Retos"…), no por número; por eso Retos sale "+0 $ · Sin
  trades" aunque el admin tuviera un número. Las pestañas de Mi gestión y "Tu
  situación" usan número y, si no hay, etiqueta; el Diario, solo el número.
  Coinciden mientras el admin y las etiquetas estén al día (el guardado del
  admin reetiqueta los trades).
- En móvil, la columna central de Mi proceso queda casi sin ancho (toda la
  página, anterior a este cambio; pendiente menor de móvil).

---

## Normas por modo (07/10) — fase 1: SQL preparado, SIN APLICAR

Rama `feature/normas-modo`, `tools/post_cierre/sql_normas_modo.sql`. Pedido
del usuario: normas por modo editables por cada usuario en Mis reglas (una
pestaña por modo + "Gestionar modos"), sin plantilla previa. Fase 1 = guardar
y mostrar; la medición (cumplimiento por modo en el Diario, suelo y lote
máximo en vivo) y el tablero, en fases siguientes.

- **Tabla aparte, no `reglas_valores` con `modo_id`** (motivos en la cabecera
  del SQL): las normas son ~40 campos casi todos texto/sí-no/horas/minutos y
  niveles de escalado de 3 números, que no caben en "un importe > 0 por fila";
  `reglas_efectivas` la leen Diario, días limpios y etapas agrupando solo por
  carpeta (las filas por modo se mezclarían); y un formulario = una fila = un
  guardado y una entrada de historial.
- `modo_normas` (PK `modo_id`, FK compuesta a `modos`, `normas` JSONB) +
  `modo_normas_historial` (automático). El trigger limpia (recorta textos,
  quita vacíos) y valida (claves conocidas, tipos, rangos, coherencia:
  TP2 > TP1, suelo < llegar y creciente, "otro" ⇔ %, horario/minutos en pareja).
  Claves y marcas [A] (medible con datos de la EA) en la cabecera del SQL.
- **Candado del admin** también aquí: la pérdida por trade y los niveles de
  pérdida diaria del modo no pueden SUBIR por encima del tope del admin en
  `reglas_valores` (modo de una carpeta: tope de esa carpeta o `todas`; modo
  de `todas`: el más estricto). En la medición: modo > carpeta > todas, y
  además min(modo, tope del admin).
- RLS como `modos`. Borrar un modo sin uso borra sus normas (queda en el
  historial); desactivarlo no las toca.
- Probado en PGlite: 69 comprobaciones OK.
- **Siguiente:** cuando el usuario lo aplique, pantalla en Mis reglas
  (pestañas por modo, "Gestionar modos", marcas [A]).

---

## Modos: base en producción (07/10)

Lo que no depende de las normas de cada modo. No toca la EA ni
`api/trade-mt5.js` ni `reglas_valores`.

**SQL** `tools/post_cierre/sql_modos.sql` (rama `feature/modos`, `7958c96` +
`fcc2cba`), probado en PGlite (47 comprobaciones) y **aplicado por el usuario
el 07/10** (tablas 3, policies 13, usuarios_con_modos 6, modos 18). La API vio
las tablas sin recargar el esquema (comprobado con la clave pública: 200).
- `modos`: por usuario, Scalping / Testeo / Estructura por defecto; se guarda
  el id; no se borra si se usa (se desactiva). `modos_por_defecto()` los crea
  a usuarios nuevos (la web la llama si no tiene ninguno).
- `plan_dia`: carpeta (`todas` / `maestra` / `prueba` / `retos`), fecha y hora
  de servidor MT5, modo, sesgo (`vendiendo` / `comprando` / `sin_sesgo`). Solo
  se añaden filas (el usuario no edita ni borra).
- `trade_modo`: solo correcciones a mano por `fp` (modo NULL = "sin
  clasificar" a mano).
- Plan vigente para un trade = última fila anterior del mismo día de servidor
  de su carpeta; si no hay, la de `todas`; si tampoco, "sin clasificar". Un
  plan de su carpeta manda sobre un `todas` posterior (decidido así).

**Web** (fase B, `021300e`, merge `6333db6`, deploy
`aurum-velare-pucxf45zl`): módulo `modos.js` + enganches en
`diario-analisis.js` (carga, "Hoy", lista, detalle y panel del día).
- **"Hoy"**: panel "Plan del día" (cuenta, modo y sesgo; "Cambiar plan" añade
  fila; "Cambios de hoy" con las horas). Sin plan hoy: aviso para elegirlo. Se
  ve aunque no haya trades hoy (pero solo si el Diario tiene trades de la EA).
- **Hora de servidor MT5** en el navegador: hora real + desfase. Desfase = el
  mayor `timestamp − creado_en` de los 30 eventos más recientes de
  `trade_eventos` (la EA manda la hora de servidor; la llegada solo se
  retrasa), redondeado a la hora. Sin eventos: hora de Europa del Este
  (`Europe/Athens`), marcada "estimada". El panel muestra la hora de servidor
  y el desfase usado (p. ej. "UTC+3").
- **Lista**: insignia "Modo: …" (✎ si está corregido a mano), filtro por modo
  (Todos / cada modo / Sin clasificar); la estrategia de la EA pasa a
  rotularse "Setup (EA)" (chips, fila "Setup: …", tabla "Por setup (EA)").
- **Detalle de un trade** (analizado o pendiente): modo y de dónde sale
  (plan de las HH:MM · cuenta · sesgo, o corregido a mano) y selector para
  corregirlo ("Según el plan" borra la corrección).
- **Panel del día del calendario**: "Plan frente a realidad": planes del día,
  primer trade a favor del sesgo sí/no, trades contra el sesgo con $ y pts
  (beneficio / (100 × lotes)), trades sin plan. "Sin sesgo" no se mide.
- Probado en local con los 310 trades EA reales + 4 de hoy inventados y
  Supabase simulado (guardar plan, corregir, filtrar). Comprobado que el texto
  del Diario es idéntico al de `main` salvo lo añadido y los rótulos.
- **Pendiente de que el usuario lo compruebe con su sesión.**
- Sin hacer (no pedido aún): pantalla para renombrar / añadir / desactivar
  modos (la tabla lo permite); propuesta automática del modo; modo en "Tu
  situación" y en el resumen semanal.

---

## Modos, plan del día y tablero en directo (propuesta 07/10) — PROPUESTA, sin código

Pendiente nº 4, después de "Etapas v2". Lo que no es la base de los modos (ver "Modos: base en producción") no está implementado. Todo
son AVISOS: Aurum no cierra ni bloquea nada; el trader decide.

### A) Modos de operación y plan del día

- **Al empezar el día** (antes del primer trade) el trader elige en Aurum:
  - **Modo:** Scalping, Testeo o Estructura (más adelante, lista editable por
    usuario).
  - **Cómo empieza:** vendiendo, comprando o sin sesgo.
  Una vez al día. Si lo cambia durante el día, queda registrado con la hora.
- **Cada modo tiene sus normas en Mis reglas**, como hoy por carpeta: pérdida
  máx. por trade, niveles de pérdida y de beneficio diario con nombre y "qué
  hago al llegar", lote, SL/TP, parciales, horario y máx. de trades. Con
  historial de cambios. **Prioridad: modo > cuenta > generales ("todas").**
- Cada usuario define sus modos y sus normas; Aurum mide a cada uno contra su
  propio plan (son datos, no código).
- **Trades del día marcados con el modo del día**; sin plan = "sin
  clasificar". En el Diario se puede clasificar o corregir a mano. Más
  adelante el sistema propone el modo (p. ej. lote bajo = Testeo) y el trader
  confirma.
- **El Diario compara plan y realidad:** primer trade a favor del sesgo o no,
  trades contra el sesgo y su resultado, cumplimiento de las normas del modo.
- **Dato que lo justifica** (Diario, todo el histórico, 07/10): 154 de 313
  trades EA "sin clasificar", con −4.829 $.

### B) Escalado con suelo (por modo)

- Al llegar a cada nivel de beneficio, el **"suelo del día"** sube y ya no se
  devuelve. Ejemplo con los niveles de Roderas: +125 → suelo 0 $; +500 →
  suelo +250 $; +1.500 → suelo +1.000 $. Los suelos los define el usuario por
  modo.
- **Riesgo permitido en el siguiente trade = P&L del día − suelo.**
  **Lote máximo = (P&L del día − suelo) ÷ (100 × SL en pts)**, con tope de
  lote máximo absoluto. Opción "uso del margen": todo / la mitad.
- **En pérdida nunca se sube lote.**
- Datos que lo apoyan (Diario, todo el histórico): seguir tras +125 → te
  sirvió 13 de 15 (+1.559 $); seguir tras −300 → −6.545 $, casi toda la
  pérdida histórica.
- **Decidido (07/10): antes del primer nivel de beneficio** (sin suelo, la
  fórmula daría 0): lote = **lote inicial del modo** y riesgo permitido =
  **pérdida máxima por trade del modo**.
- Por decidir al construirlo: de dónde sale el "SL en pts" de la fórmula
  (propuesta: el SL de las normas del modo; si el modo no lo tiene, que el
  trader lo escriba).

### C) Tablero del día (tipo juego de la oca) — dos vistas

- **Vista Diario:** en el bloque "Hoy" del Diario (`_daHtmlHoy`,
  `diario-analisis.js`), pestañas Scalping / Testeo / Estructura; camino de
  casillas del modo y camino de pérdidas aparte; panel **"Ahora mismo"** (P&L,
  suelo, puedes arriesgar, lote máximo, siguiente nivel de beneficio y de
  pérdida); recorrido de hoy y la frase del plan al llegar al nivel.
- **Vista Directo (para emitir en YouTube):** tablero visual de 24 casillas en
  círculo con el **"Jardín"** en el centro (cerrar el día en verde por encima
  del suelo). Casillas especiales:
  - **OCA** = niveles de beneficio (suben el suelo);
  - **POSADA** = no tocar el trade del min 15 al 60 / pausa para revisar;
  - **PUENTE** = cambio de modo;
  - **LABERINTO** = vueltas de posición;
  - **POZO** = primer nivel de pérdida (solo observas);
  - **CÁRCEL** = segundo nivel;
  - **CALAVERA** = cierre obligatorio (vuelta a la salida).
  Ficha del trader que avanza sola con los eventos de la EA (ya llegan cada
  60 s), cartel grande con el último evento y panel lateral con LIVE, modo,
  sesgo, P&L grande, suelo, lote máximo y recorrido.
- **IMPORTANTE:** la vista Directo tiene que caber en la misma pantalla que los
  gráficos de MT5 (formato estrecho/vertical o ventana aparte redimensionable),
  no solo a 1920×1080 a pantalla completa.
- Hay una **maqueta en Claude Design** (no accesible desde aquí): el usuario la
  enseñará con capturas cuando toque implementarlo.
- Las casillas y caminos de cada modo saldrán de una **plantilla que el usuario
  está rellenando**; cuando la tenga, se pasa.

### D) Análisis en solo lectura (07/10): dónde encaja

**Plan del día** — tabla nueva, p. ej. `plan_dia`: una fila por elección
(usuario, día de servidor, carpeta — `todas` por defecto, como Mis reglas —,
modo, sesgo `venta` / `compra` / `sin_sesgo`, `creado_en`). Solo se añaden
filas: el plan vigente a una hora es la última fila anterior, así que los
cambios del día con su hora salen de la propia tabla (no hace falta otra de
historial). RLS como `reglas_valores` (el usuario, lo suyo; el admin, todo).

**Modos** — tabla nueva `modos` (id, usuario, nombre, orden, activo). Se
guarda el **id**, no el nombre, para que renombrar un modo no rompa el
historial. Al crear el usuario (o la primera vez), los tres de partida.

**Normas por modo** — mejor **ampliar `reglas_valores`** que crear otra tabla
(ya tiene historial, candado del admin, plan "qué hago al llegar" y la vista
`reglas_efectivas` que lee el Diario):
- columna `modo_id` (NULL = norma general o de carpeta, como hoy);
- reglas nuevas en el CHECK de `regla`: `lote_max`, `sl_pts`, `tp_pts`,
  `max_trades`, `suelo_dia` (por nivel de beneficio) y horario
  (`hora_desde` / `hora_hasta`). Ojo: hoy `valor > 0` (las 00:00 no caben) y
  `nivel` va de 1 a 3 (la plantilla del tablero puede pedir más niveles):
  habrá que relajar esos CHECK. Parciales: valor por nivel (pts del parcial)
  o texto en `plan`; decidir con la plantilla;
- el UNIQUE debe incluir `modo_id` (con NULL hace falta `NULLS NOT DISTINCT` o
  un índice único con `coalesce(modo_id, 0)`), y también el trigger del candado
  y `reglas_valores_historial`;
- `reglas_efectivas` ganaría la columna `modo_id`, resolviendo por cada
  carpeta y modo: fila del modo > fila de la carpeta > fila de `todas`.
  **Riesgo:** el Diario y Mis reglas leen hoy la vista con `select=*` y agrupan
  solo por carpeta; al añadir filas por modo tienen que filtrar
  `modo_id IS NULL` o se mezclarían niveles. Hacer el SQL y ese filtro a la vez.

**Modo de cada trade** — **no** como columna de `trades`: `historial.js`
reimporta con DELETE + INSERT por cuenta y se perdería; y `ea_trades` la
escribe el endpoint de la EA. Propuesta:
- por defecto se **deduce** (plan vigente a la hora de entrada del trade); sin
  plan → "sin clasificar";
- tabla nueva `trade_modo` (`fp` + usuario, `modo_id`, `origen` manual /
  confirmado / propuesto, `creado_en`) solo para correcciones y
  confirmaciones a mano; manda sobre lo deducido;
- **ojo con la hora:** el plan se elige con la hora del navegador
  (`timestamptz`) y los trades llevan hora de servidor MT5 sin zona. Hace falta
  el desfase del servidor para saber qué plan regía al entrar (el mismo
  problema que ya avisa "Hoy" cerca de medianoche).

**Encaje con `estrategia` de la EA** (`rechazo_rsi` si SL ≤ 9 pts,
`estructura` si ≤ 37,5, si no vacía; `ClasificarEstrategia` en la EA y CHECK en
`sql_estrategia.sql`): son **dos ejes distintos** y no se mezclan.
`estrategia` = lo que la EA mide del trade (distancia del SL); modo = lo que el
trader declara para el día. No se toca el CHECK ni la EA. El Diario puede
cruzarlos (p. ej. modo Scalping con trades de estructura = no seguiste el
plan) y usarlos para la propuesta de modo futura (SL y lote). Ojo con el
nombre: modo "Estructura" y estrategia "estructura" no son lo mismo; en
pantalla, rotular "Modo" y "Setup (EA)" para no confundir. Los "sin
clasificar" de antes del 26/08 no tienen estrategia (no existía) ni tendrán
modo salvo a mano.

**Datos en vivo para el tablero:**
- P&L realizado del día por cuenta: ya lo calcula el Diario (`trades` +
  cerrados de `ea_trades`, refresco cada 60 s, `DA_REFRESCO_MS`).
- Posiciones abiertas: `ea_trades` con `estado='open'` (entrada, volumen,
  `sl_actual`, `tp_actual`, `fecha_entrada`). El Diario hoy solo carga las
  cerradas: habría que leer también las abiertas (la RLS `eat_user_select` ya
  lo permite). Sirve para POSADA (min 15–60 del trade abierto) y para el riesgo
  en curso.
- Eventos para el cartel y la ficha: `trade_eventos` (entrada, sl_protegido,
  breakeven, parcial, cierre_tp/sl/manual). Hoy se leen por `fp` al abrir un
  trade; para el tablero, los del día (comprobar la RLS de lectura de
  `trade_eventos` para el usuario).
- Vueltas (LABERINTO): ya existen en el front (`_daMarcarSecuencias`).
- **No hay** precio actual ni P&L flotante: la EA no manda ticks (MFE/MAE solo
  al cerrar). El tablero avanza con cierres y eventos, no con el flotante.
- Retraso: cola de la EA (60 s) + sondeo del Diario (60 s) → hasta ~2 min.
  Para la vista Directo, sondear cada 10–15 s solo lo de hoy o usar Supabase
  Realtime sobre `ea_trades` / `trade_eventos` (lo que se pueda con la RLS).
- La vista Directo necesita la sesión del usuario. **Decidido (07/10): en OBS
  se captura la VENTANA del navegador** (captura de ventana, no "fuente de
  navegador"), así se usa la sesión normal de Chrome y no hace falta login
  dentro de OBS ni enlace con token.

**Qué NO toca la EA:** todo lo anterior. Modos, plan del día, normas,
clasificación, escalado con suelo y las dos vistas del tablero son tablas
nuevas + SQL de `reglas_valores` + front. Tampoco hace falta tocar
`api/trade-mt5.js`. Solo tocaría la EA un P&L flotante en directo (mandar
precio o P&L de las abiertas), que no forma parte de esta propuesta y quedaría
sujeto a la regla de `feature/ea-sync` (EA sincronizada y confirmada antes).

**Orden sugerido:** (1) SQL `modos` + `plan_dia` + `modo_id` en
`reglas_valores` y filtro en Diario/Mis reglas; (2) selector de plan del día y
normas por modo en Mis reglas; (3) modo en el Diario (deducido + corrección a
mano) y comparación plan/realidad; (4) suelo y lote máximo en "Hoy"; (5)
tablero vista Diario; (6) vista Directo (con capturas de la maqueta y la
plantilla del usuario).

---

## Alertas al móvil (idea 07/10) — IDEA, sin código

Pendiente nº 12. Siguen siendo avisos salvo la fase 3, que exige decisión
expresa del usuario.

- **Fase 1 — Alertas de reglas (no tocan la EA).** Con los eventos que ya
  llegan de la EA, Aurum avisa al móvil del usuario:
  - al llegar a un nivel (p. ej. "−300 «Límite»: solo observas"; "+125
    «escalado»: suelo 0 $, lote máx. 0,11");
  - al abrir contra el sesgo del día (plan del día de "Modos…");
  - tras X pérdidas seguidas.
  Canal para empezar: **bot de Telegram** (cada usuario lo vincula); más
  adelante, notificaciones web.
- **Fase 2 — Alertas de precio** (p. ej. "sell limit cuando el precio toque la
  MA20 en H1"), ligadas al modo y al sesgo. Requiere que la EA o un indicador
  aparte mande precio/medias, o usar las notificaciones push nativas de MT5.
  Aurum guarda cada alerta y qué hizo el precio después, para medir si tiene
  ventaja.
- **Fase 3 — Bot que pone la orden** con el SL/TP del modo, **solo si la fase
  2 demuestra ventaja**. Cambia el principio "Aurum mide y avisa, nunca
  opera": decisión del usuario. Antes, revisar si NEOMAAA y WSF permiten EAs
  que abran operaciones. Hacerlo **aparte de `EA_Aurum_Tracker`** (que solo
  registra).
- **Fases 2 y 3 tocan MT5:** no empezar hasta fusionar `feature/ea-sync` tras
  la observación (pendiente nº 1).

---

## Siguiente gran paso (02/10) — pasos 1 y 2 hechos el 05/10; 3 y 4 = pendiente 7

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
