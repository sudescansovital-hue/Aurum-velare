## 📋 Balance de verificación (18/07) — 7 de 8 hallazgos ya resueltos

Auditoría completa contra código real el 18/07. Resultado:
- ✅ RESUELTOS: EA→trades, reset cuenta (777 OZT) migra a Externa,
  preguntas.js guarda en Supabase, tablillas.js lee historial real,
  ordenación por hora en Cumplimiento (numérica), orden cronológico en
  getTradesActivos() (commit 4bb633c).
- ✅ RESUELTO (18/07, commit c6fd926): los 12 sitios reales donde el WR se
  mostraba como "0%" en vez de "sin datos" ahora usan null como centinela,
  con "—" o mensajes neutros en el HTML. Cubre gestion.js (buildDashboardHero,
  buildCumplimiento, buildHorarios, buildCicloDots, buildTradeRecord) y
  visitas.js (calcTipos, calcDias, buildCuentaReal). Los sitios ya protegidos
  por filtros previos (t>=3, t>0) se dejaron sin tocar por ser innecesarios.
- ⚠️ PENDIENTE (1): duplicación visitas.js/gestion.js sin unificar — cambio
  de arquitectura mayor, se deja para otra sesión dedicada.

Detalle de cada punto verificado más abajo, en las secciones originales
correspondientes (no se han borrado, quedan como referencia).

# Plan "corazón de datos" — preparado la noche del 02/07, para aplicar el 03/07

No se ha tocado producción ni GitHub. Todo esto está diseñado y verificado
contra el código real del repo, pero sin ejecutar. Revisar con calma antes
de aplicar nada — no es una orden a ciegas, es una propuesta ya trabajada.

## Qué arregla, y por qué cada cosa

## ✅ RESUELTO (confirmado 18/07) — DELETE peligroso en historial.js

**Verificado el 18/07 línea por línea:** guardarTradesIndividuales() ya usa
upsert real (POST con on_conflict=fp,usuario_email + Prefer:
resolution=merge-duplicates), no borra-todo-y-reinserta. Los únicos 2 DELETE
de la función están acotados: uno a trades con cuenta=is.null (huérfanos),
otro a trade_parciales de los fp exactos del archivo subido. Además ya
protege los trades fuente='ea' excluyéndolos del reimport. Este punto no
requiere ninguna acción — se deja el hallazgo original abajo como
referencia histórica.

### 1. El DELETE peligroso en `historial.js` (el hallazgo más grave de hoy)
Antes: cada vez que se importaba un histórico, se borraban TODOS los trades
de esa cuenta primero, y se reinsertaban desde el archivo. Si algún día se
sube un periodo parcial (una semana, un mes) en vez del histórico completo,
esto borraría todo lo demás sin avisar.

Ahora: se sustituye por upsert real basado en `fp` (que ya es único por
trade). Si el trade ya existe, se actualiza; si no, se crea. Nunca se borra
nada que no esté en el archivo nuevo. Requiere una restricción UNIQUE(fp)
en Supabase para que el upsert funcione (ver SQL, paso 4).

Además: antes de subir nada, se consultan los trades marcados `fuente='ea'`
de esa cuenta y se excluyen del lote — un reimport manual JAMÁS pisa un
trade que ya tiene el historial completo de SL capturado por el EA.

### 2. Los trades del EA no llegaban a ningún sitio visible de la web
Confirmado en código: `app.js` y `evalua.js` (que alimentan "Mi Proceso",
Cumplimiento, etc.) leen exclusivamente de la tabla `trades`. El EA
guardaba todo en `ea_trades`/`trade_parciales`, una tabla completamente
aparte que ninguna pantalla consulta. Por eso "Trades totales: 0" para
Roderas aunque el EA llevara todo el día registrando bien.

Ahora: cuando el EA cierra un trade (`api/trade-mt5.js`, `handleClose`),
además de actualizar `ea_trades`, se hace un upsert (mismo mecanismo
seguro por `fp`) hacia `trades`, con `fuente='ea'`. Así aparece
automáticamente en todas las pantallas que ya existen, sin tocar el
frontend.

### 3. Clasificación de Cumplimiento al revés en SL protegidos (tu corrección de hoy)
Antes: un SL que había sido movido a break even o más allá (protegiendo
ganancia) se media por su distancia a la entrada igual que un SL de
riesgo real — así que un trade con 100+ puntos de beneficio protegido
salía marcado como "fuera del método", cuando es exactamente lo
contrario: gestión de riesgo perfecta.

Ahora: se añade el criterio `esSlProtegido` en `gestion.js` (los 3 sitios
donde se calculaba esto, no solo el panel principal) — si el SL terminó
del lado de ganancia según la dirección del trade (sell: sl ≤ entrada;
buy: sl ≥ entrada), se clasifica siempre como dentro del método (EDGE),
sin importar los puntos de distancia.

Esto requiere saber la dirección (`tipo`, buy/sell) de cada trade — dato
que se calculaba en el parser pero nunca se guardaba. Se añade la columna
y se backfillea en los trades existentes de forma determinista (no es una
suposición: se reconstruye matemáticamente a partir de `ganadora` +
`precio_entrada` + `precio_cierre`, que ya existen).

## Archivos de este paquete

- `sql_corazon_datos.sql` — ejecutar en Supabase, PASO A PASO, revisando
  cada resultado antes de seguir (tiene verificaciones incluidas).
- `parser_corazon.js` → reemplaza `parser.js`
- `historial_corazon.js` → reemplaza `historial.js`
- `trade-mt5_corazon.js` → reemplaza `api/trade-mt5.js`
- `gestion_corazon.js` → reemplaza `gestion.js`

## Orden de aplicación recomendado

1. **SQL paso 1** (solo lectura) — confirmar que no hay `fp` duplicados.
   Si los hay, PARAR y decidir manualmente qué hacer con cada uno antes
   de seguir.
2. **SQL pasos 2-3** — añadir columnas `fuente`/`tipo`, backfill de `tipo`.
   Revisar cuántos quedaron sin `tipo` determinable (breakeven exacto,
   debería ser un número pequeño).
3. **SQL paso 4** — añadir el constraint único en `fp`. Solo si el paso 1
   salió limpio.
4. **SQL paso 5** — apuntar los totales actuales (total, por fuente, con
   tipo conocido). Esta es la foto "antes" para comparar después.
5. Aplicar `parser_corazon.js`, `historial_corazon.js`,
   `trade-mt5_corazon.js`, `gestion_corazon.js` vía Claude Code (mismo
   flujo de siempre: diff, confirmar, aplicar, push).
6. **Prueba real antes de dar nada por bueno:**
   - Reimportar el histórico de una cuenta de prueba (Mara/Hormiga, no
     Willian ni Roderas) y confirmar que el número total de trades no
     baja respecto a antes.
   - Cerrar un trade de prueba con el EA y confirmar que aparece en
     "Mi Proceso" de Roderas sin tener que tocar nada más.
   - Buscar el trade de Willian de hoy (1.00 lotes, +3571.52$, el de
     110.5 puntos) y confirmar que ahora sale clasificado como EDGE
     (protegido), no como "fuera del método".
   - Reimportar el histórico de Willian de nuevo (el completo) y
     confirmar que el total de trades sigue igual (ni sube ni baja) y
     que ningún trade del EA de Roderas se ha visto afectado (cuentas
     distintas, pero es la prueba de que el filtro por cuenta funciona).
7. Solo si los 4 puntos de la prueba salen bien, se considera cerrado.
   Si algo falla, no se seguía adelante con más funciones — se para y se
   revisa qué falló, exactamente como se hizo hoy con cada bug.

---

## Hallazgos adicionales de un estudio más profundo (misma noche, después de cerrar lo anterior)

Estudiando `evalua.js`, `admin.js` y la relación completa entre `trades` y
el sistema de etapas/ciclos/OZT, aparecen dos cosas más que no estaban en
el plan inicial y conviene tener en cuenta mañana (no se han tocado):

1. **`ciclosCompletados = Math.floor(totalTrades / 111)`** (gestion.js:1749)
   depende directamente del mismo conteo de `trades` que hoy estaba vacío
   para Roderas. Esto confirma que el problema de hoy no es solo visual
   ("no aparecen los trades") — también bloqueaba el avance real de ciclo
   y el OZT ganado por ciclos completados. Con el fix de `handleClose`
   propuesto arriba, esto se resuelve solo, sin tocar nada más.

2. **Contradicción en la captura de "Mi Proceso" de Roderas de esta noche:**
   mostraba "Trades totales: 0" pero al mismo tiempo "Ciclo actual: Ciclo 1
   · 111/111 trades · 100%". Esos dos números no pueden ser ciertos a la
   vez si ambos vienen del mismo cálculo. Sugiere que el progreso de ciclo
   mostrado ahí puede estar leyendo de un campo estático guardado en
   `usuarios_aurum` en vez de calcularlo en vivo desde `trades` — es decir,
   un tercer sitio con datos "congelados" que no se actualiza solo.
   Pendiente de confirmar mirando bien esa parte de `gestion.js`/`app.js`
   antes de dar el fix de mañana por completo — puede que haga falta un
   paso más de sincronización ahí también.

3. **`evalua.js`, función `cargarYEvaluarDesdeSupabase()` (línea ~375-391):**
   lee los trades guardados usando `t.pe`, `t.pc`, `t.vol` — pero la tabla
   `trades` real guarda esos datos como `precio_entrada`, `precio_cierre`,
   `volumen` (confirmado en el INSERT de historial.js). Esto significa que
   el botón "Evaluar mis trades guardados" en la página de marketing
   probablemente calcula mal (o con NaN) todo lo que depende de precio de
   entrada/cierre — curva de equity, desglose por tipo de operación, etc.
   No es parte del "corazón" crítico de hoy (es una página de marketing,
   no el sistema de proceso del usuario), pero es el mismo tipo de fallo:
   dos partes del código que asumen nombres de campo distintos para el
   mismo dato. Vale la pena revisar si hay más sitios con este mismo
   patrón de desajuste de nombres antes de dar por cerrado el "corazón".

---

## Barrido final de seguridad (misma noche) — sin más hallazgos graves

Revisado el resto del código (`salas.js`, `admin.js`, `tablillas.js`, `visitas.js`, `auth.js`) buscando específicamente otros `DELETE` masivos o peligrosos como el de `historial.js`. Resultado: **no hay ninguno más**. El único otro `DELETE` del sistema (en `admin.js`, borrar un reto) está bien acotado por `id` — solo borra la fila exacta que el admin decide borrar a propósito, no hay riesgo de arrastre.

## Bug de origen confirmado — contradicción "0 trades / Ciclo 111·100%" (RESUELTO EL DIAGNÓSTICO, FIX TRIVIAL PENDIENTE DE APLICAR)

Encontrada la causa exacta de la contradicción vista anoche en la captura de Roderas. En `gestion.js`, función `buildDashboardHero` (la que alimenta el panel "Trades totales / Ciclo actual / OZT" de Mi Proceso), línea 1751:

```javascript
var enCurso = totalTrades % 111 || 111;
```

Es el fallo clásico de JavaScript con `|| N`: la intención era que si `totalTrades` es múltiplo exacto de 111 (ej. 222), `222 % 111 = 0`, y para mostrar "111/111 · 100%" (ciclo recién completado) en vez de "0/111 · 0%", usan el truco `|| 111`. **Pero si `totalTrades` es 0 (cero trades reales), `0 % 111` también da 0, y el mismo truco lo convierte en 111** — mostrando "Ciclo 1 · 111/111 trades · 100%" cuando en realidad no hay ningún trade.

**Verificación importante — este mismo patrón aparece en OTRO sitio (línea 350, función `buildCicloDots`) pero ahí NO es un bug real**, porque esa función tiene un guard en la línea 338 (`if (trades.length < 5) return`) que corta la ejecución antes de llegar al cálculo cuando hay 0-4 trades. Solo `buildDashboardHero` carece de ese guard equivalente.

**Fix (trivial, una vez aplicado el resto de cambios del EA→trades):**
```javascript
var enCurso = totalTrades === 0 ? 0 : (totalTrades % 111 || 111);
var pctCiclo = totalTrades === 0 ? 0 : Math.round(enCurso / 111 * 100);
```

Con esto, y con el fix de `handleClose` que conecta el EA a `trades`, en cuanto Roderas tenga su primer trade real contado, ambos números (Trades totales y Ciclo actual) van a coincidir de verdad, sin contradicción.

## Confirmación precisa del backlog #5 (reasignar cuenta con reset de 777 OZT) — CORREGIDO tras revisar admin.js completo

**Corrección importante respecto a lo que anoté antes esta noche:** dije que "no existe ningún código para mover trades a Cuenta Externa al reasignar". Eso era incompleto — sí existe, y está bien hecho: `admin.js`, función `_reasignarCuentaExterna` (línea 299). Cuando el admin revoca un número de un hueco (`cuenta_maestra`, etc.), mueve todos los trades de esa etiqueta a `"Cuenta Externa"` con `cuenta_numero: null`; cuando asigna un número nuevo, recupera de `"Cuenta Externa"` específicamente los trades que coinciden con ese número exacto y los mueve a la etiqueta nueva. Es un diseño de dos fases (revocar → asignar) que evita la mezcla que yo había predicho.

**El hueco real, más preciso:** `resetCuenta()` en `gestion.js` (la función que el USUARIO dispara pagando 777 OZT desde su propio panel) **no llama a `_reasignarCuentaExterna` ni a nada equivalente** — solo pone a `null` el número de cuenta y cobra el OZT. Son dos caminos completamente separados:
- **Admin reasignando manualmente** → sí migra los trades correctamente.
- **Usuario reseteando su propia cuenta (777 OZT)** → no migra nada, los trades quedan con la etiqueta vieja para siempre, y si luego se asigna un número nuevo a ese hueco (sea el usuario o el admin quien lo haga), no hay garantía de que se recuperen igual de bien porque el flujo de reset del usuario nunca los marcó como "Cuenta Externa" primero.

**Fix (más simple de lo que pensaba antes):** no hay que construir nada nuevo — solo hacer que `resetCuenta()` en `gestion.js` llame a la misma lógica que ya usa `_reasignarCuentaExterna` en `admin.js` (movería el número viejo a "Cuenta Externa" antes de ponerlo a null), reutilizando código en vez de duplicarlo.

## Bug sistémico confirmado — WR "0%" ambiguo entre "sin datos" y "0% real" (backlog: "WR 0% en cuentas con pocos trades")

Localizado el patrón exacto detrás de este bug ya anotado en el backlog. Se repite **13 veces** en `gestion.js`, siempre con la misma forma:

```javascript
wr: arr.length > 0 ? Math.round(w / arr.length * 1000) / 10 : 0
```

Cuando un grupo de trades está vacío (`arr.length === 0`), el WR se pone a `0` por defecto — pero en la pantalla eso es **indistinguible** de "tuviste trades ahí y perdiste todos". No hay ningún indicador de "sin datos" en ninguno de los 13 sitios.

**Las dos ubicaciones donde esto es más grave y visible (confirmado con capturas reales de anoche):**

1. **`buildTradeRecord`, línea 63** — el desglose por tipo de operación (Scalping/Intradía/Swing/Multi-día). En una cuenta con pocos trades, casi todas las categorías salen vacías y muestran "0t · 0% WR · +0$", indistinguible de "0% de acierto real".
2. **`buildCumplimiento`, línea 690** — es exactamente el `WR DENTRO DEL MÉTODO` / `WR FUERA DEL MÉTODO` que se ve en la web (captura de Willian de anoche: 51.9% / 49.1%). Si `fuera.length === 0` (cuenta con pocos trades, todos dentro del método), `wrFuera` mostraría "0%" — leyéndose como "cuando te sales del método, siempre pierdes", cuando en realidad es que no hay datos.

**Fix (mismo patrón en los 13 sitios, o al menos en estos dos primero):** en vez de devolver `0` cuando `arr.length === 0`, devolver `null` y que el HTML muestre `"—"` o `"sin datos"` en vez de `"0%"`. Ejemplo:
```javascript
function wr(arr) {
  if (arr.length === 0) return null; // sin datos, no es 0% real
  return Math.round(arr.filter(t => t.ganadora).length / arr.length * 1000) / 10;
}
// al pintar: wrDentro === null ? 'Sin datos' : wrDentro + '%'
```

No se ha tocado el código de los 13 sitios esta noche — se documenta el patrón exacto y las dos ubicaciones más urgentes, para decidir mañana con calma si se arreglan los 13 de golpe o solo los 2 más visibles primero.

## Bug de orden cronológico — racha y drawdown pueden estar calculados sobre el orden equivocado (posiblemente el hallazgo más importante de esta noche)

`app.js` (línea 267), la función que carga todos los trades para toda la web, pide a Supabase el orden así:

```javascript
var params = 'usuario_email=eq.' + emailActual + '&order=created_at.asc';
```

**`created_at` es la fecha en que la fila se insertó en Supabase, no la fecha real en que ocurrió el trade en MT5.** Si Willian importa hoy un histórico de hace 6 meses, esos trades reciben `created_at` = hoy — así que en el array global, un trade de hace medio año puede aparecer "al final" (como si fuera el más reciente) simplemente porque se importó hoy.

**`buildEquity` (la curva de resultados) ya está protegida** — tiene código explícito (línea 498-518) que reordena por la fecha real extraída de `fp` antes de dibujar la curva, con `created_at` solo como último recurso si `fp` no se puede leer. Esa función está bien.

**`buildEstadisticasAvanzadas` NO tiene esa misma protección — y afecta a 4 métricas, no solo a 2.** Tiene una función `fechaDesdeFp()` definida (línea 1070) que sí sabe calcular la fecha real — pero **solo se usa para una cosa muy concreta** (detectar revenge trading, línea 1147-1148, comparando huecos de tiempo entre trades consecutivos). Nunca se usa para reordenar `trades` antes de:
- **Racha actual** (línea ~1089): itera desde `trades[trades.length-1]` hacia atrás asumiendo que ese es el trade más reciente — puede no serlo.
- **Drawdown máximo** (línea ~1099): acumula el P&L en el orden del array para encontrar el pico y la caída máxima — si el orden no es cronológico real, el drawdown calculado puede no corresponder a ninguna secuencia real de trading.
- **Revenge trading** (línea ~1142): recorre `trades[i-1]` y `trades[i]` buscando si abriste un trade nuevo <5 min después de una pérdida. Aunque usa `fechaDesdeFp` para calcular el hueco de tiempo ENTRE esos dos trades concretos, **nunca comprueba que `trades[i-1]` sea realmente el trade anterior cronológico a `trades[i]`** — si el array no está en orden real, puede estar comparando dos trades que no son consecutivos de verdad.
- **Lotaje tras pérdida** (línea ~1178): mismo patrón, compara `trades[i-1].volumen` con `trades[i].volumen` sin garantía de que sean consecutivos cronológicamente.

Las cuatro métricas comparten la misma causa raíz y se arreglan con el mismo fix, aplicado una sola vez al principio de la función.

**Fix:** al principio de `buildEstadisticasAvanzadas`, antes de calcular cualquiera de las 4 métricas, aplicar el mismo patrón de reordenación que ya usa `buildEquity` (reutilizar esa misma lógica, quizás extrayéndola a una función compartida en vez de tenerla duplicada en dos sitios).

**Quinta instancia confirmada, la más visible de todas:** línea ~1493, sección "Últimos 30 trades vs histórico":
```javascript
var ult30 = trades.slice(-30);
```
Asume que los últimos 30 elementos del array son los 30 trades más recientes de verdad. Si el orden viene mal por `created_at`, este comparador (que le dice al usuario si está "mejorando" o "empeorando" recientemente) puede estar comparando contra un grupo de 30 trades que no son en absoluto los más recientes — dando una lectura de tendencia completamente falsa.

**Recomendación para mañana:** dada la cantidad de sitios afectados (al menos 5 confirmados dentro de una sola función), lo más eficiente es extraer una única función `ordenarTradesPorFechaReal(trades)` (reutilizando la lógica ya correcta de `buildEquity`) y llamarla **una sola vez, al principio de `getTradesActivos()`** — así todas las funciones que la consumen (`buildDashboardHero`, `buildEstadisticasAvanzadas`, `buildTradeRecord`, etc.) reciben automáticamente el array ya bien ordenado, sin tener que acordarse de reordenar en cada sitio nuevo que se escriba en el futuro.

**Sexta instancia confirmada — "Lotajes del ciclo actual" (Roderas señaló esto explícitamente, yo me lo había saltado):** en `buildCicloDots` (línea 363): `var ultimos = trades.slice(-enCurso);`, y más abajo (línea 450-484) esto alimenta el bloque "Lotajes del ciclo actual" (mín/más usado/máx), conectado correctamente a `<div id="ciclo-lotajes">` en `index.html` línea 1825 — **el código NO está borrado, existe completo y bien conectado (confirmado JS + HTML).**

Lo que está pasando de verdad es una combinación de dos cosas:
1. **Mismo bug de orden que las otras 5 instancias** — `slice(-enCurso)` puede no coger los trades realmente más recientes del ciclo si el array no está en orden cronológico real.
2. **Efecto directo del bug #2 de esta noche** (trades del EA sin conectar a `trades`) — con `totalTrades` en 0 o muy bajo, la condición `vols.length < 3` se cumple y se muestra "Sin datos de lotaje en este ciclo", que se percibe como "esto ha desaparecido" aunque el código siga intacto.

**Corrección importante para mí mismo:** cuando revisé `buildCicloDots` antes esta noche, solo miré hasta la línea 360 y no vi el resto de la función (hasta la 485) — me perdí esta sección por completo. Roderas tenía razón en desconfiar y pedirme que revisara todo de nuevo.

## ⚠️ Hallazgo grave — funciones que fingen guardar datos pero no guardan nada

**`preguntas.js`** — las funciones `enviarPregunta()` y `avisarTablilla()` tienen el comentario literal `// En producción: guardar en Supabase...` — **nunca se implementó el guardado real.** Cuando un usuario manda una pregunta (para Tablillas) o se apunta a la lista de espera, ve el mensaje de éxito ("✓ Recibida", "✓ Anotado"), pero el dato **no se guarda en ningún sitio** — se pierde en cuanto se recarga la página.

**Esto contradice directamente `docs/ARQUITECTURA.md`**, que dice explícitamente en la sección "Qué se guarda y qué no": *"✓ SÍ: preguntas de Tablillas enviadas para revisión"*. La documentación afirma que se guarda; el código real no lo hace. Cualquier usuario que haya mandado una pregunta hasta ahora, esa pregunta nunca llegó a ningún sitio donde Roderas pudiera verla.

**`tablillas.js`, función `init_dashboard()`** — el bloque "Historial de etapas" (línea ~40) es un array **hardcodeado con fechas de ejemplo** (`"01 Feb 2026"`, etc.), todas marcadas como validadas. Todos los usuarios ven el mismo historial falso, no el suyo real — parece que quedó ahí como placeholder de una fase temprana de desarrollo y nunca se conectó a datos reales.

**Fix:**
1. `enviarPregunta()` / `avisarTablilla()` — implementar el `POST` real a Supabase (tabla a definir, quizás `preguntas_tablillas` o similar) que hoy solo está comentado.
2. `init_dashboard()` — sustituir el array hardcodeado por una consulta real al historial de etapas del usuario (probablemente necesita una tabla nueva que registre cada vez que se sube de etapa, con fecha real, ya que hoy `usuarios_aurum.etapa` solo guarda el número actual, no el historial de cuándo se alcanzó cada una).

## Duplicación de código confirmada — `visitas.js` repite la lógica de `gestion.js` (con los mismos bugs, por duplicado)

Confirmado que `visitas.js` tiene su propia copia casi idéntica de la lógica de estadísticas de `gestion.js` — no es código muerto ni de un experimento viejo: **está activamente conectado a los botones principales de cambio de cuenta** del dashboard (Global / Maestra / Retos / Prueba, en `index.html`), a través de `verCuenta()` → `buildCuentaReal()` / `buildGlobal()`, llamados desde `gestion.js` cada vez que el usuario cambia de pestaña de cuenta.

Esto significa que **el bug de "WR 0% ambiguo" (ya documentado arriba) está duplicado aquí también** (línea 94 de `visitas.js`, mismo patrón exacto `arr.length>0?...:0`). Arreglarlo solo en `gestion.js` no bastaría — cualquier usuario que cambie de pestaña de cuenta seguiría viendo el bug a través de esta copia paralela.

**No he tenido tiempo esta noche de comparar función por función cuáles otras discrepancias hay entre las dos copias** (pueden haberse ido separando con el tiempo, con fixes aplicados en una pero no en la otra). Esto es en sí mismo un riesgo — cada vez que se arregla algo en `gestion.js` sin acordarse de `visitas.js` (o viceversa), se genera una inconsistencia nueva entre "lo que ves en Mi Gestión" y "lo que ves al cambiar de cuenta en el dashboard".

**Recomendación fuerte para mañana, antes que nada:** decidir si esto se unifica en un solo sitio (lo correcto a medio plazo) o si de verdad hace falta que sean dos copias separadas por algún motivo de diseño que no es evidente desde el código. Si se decide unificar, es un cambio de arquitectura, no un parche — hay que hacerlo con cuidado para no romper ninguna de las dos pantallas que dependen de esto.

## Barrido de la carpeta raíz completa — cosas nunca revisadas hasta que Roderas insistió en repasarlo todo literalmente

### `aurum-3.5/` — carpeta muerta, confirmado
Versión antigua y mucho más simple de toda la plataforma (420 líneas de `index.html` frente a las 3126 actuales), con su propio `schema.sql` desactualizado (`usuarios_aurum` con solo 5 columnas y `CHECK etapa <= 3`, cuando el sistema real ya va de 0 a 11). Confirmado que `vercel.json` no la referencia y nada del sitio en vivo la usa — es basura segura de borrar, sin riesgo.

### Dos `BUGS.md` divergentes, nunca consolidados
`BUGS.md` (raíz, 14 jun) y `docs/BUGS.md` (24 jun) son **documentos distintos con distinto contenido**, no una copia desactualizada de la otra como pasó con `ARQUITECTURA.md`. Esto ha causado que bugs de hace 3 semanas sigan sin arreglar porque nadie los volvió a mirar, y que otros ya arreglados sigan documentados como pendientes:

- **Confirmado que sigue roto, 3 semanas después:** `app.js` línea 61, `animal: animalMap[u.pack] || '✦'` — el animal mostrado (León, Hormiga, etc., usado en salas y badges) se calcula a partir de qué **pack** compró el usuario, no del animal que eligió de verdad en el onboarding. Dos usuarios con el mismo pack tendrían el mismo animal asignado sin importar su elección real.
- **Confirmado que sigue roto (en su momento):** el hardcodeo de historial de etapas en `tablillas.js` (ya documentado arriba, encontrado independientemente esta noche — coincide exactamente con el bug B6 de hace 3 semanas). **ACTUALIZACIÓN sesión 12/07 (ver abajo): esto ya está resuelto de verdad — confirmado con datos reales en producción, no solo en código.** No confundir con "sigue pendiente" en lecturas futuras de este documento.
- **Desmentido / desactualizado:** la nota "Stripe no conectado" (B2/B8). Revisado `api/stripe-webhook.js` completo — está implementado y parece sólido (verifica firma de Stripe, genera código, guarda en Supabase, envía email al cliente y notificación al admin). Los packs Umbral y Raíz tienen links de pago reales de Stripe (confirmado en `utils.js`); solo Senda y Cima siguen sin implementar. La documentación vieja no se actualizó cuando esto se conectó.
- **Sin verificar en producción, según el propio `docs/BUGS.md`:** la función `_reasignarCuentaExterna` que documenté antes como "bien diseñada" — el fix se aplicó pero el propio archivo de bugs dice que quedó pendiente de confirmar en producción el 24 de junio. Mi lectura del código dice que la lógica es correcta, pero nadie ha confirmado nunca que funcione de verdad con datos reales.

**Recomendación para mañana:** fusionar los dos `BUGS.md` en uno solo, y usarlo de verdad como lista viva (marcar lo resuelto, no dejar que se acumule sin revisar durante semanas otra vez).

## Barrido estructural de `index.html` (3126 líneas) — botones que llaman a funciones que no existen

No he leído las 3126 líneas de HTML/CSS de corrido prosa por prosa (eso no encuentra bugs de lógica, es visualmente inspeccionable por ti mismo abriendo la web). En su lugar, comprobé **todos los `onclick="..."` del HTML contra las funciones reales del JS**, para encontrar botones que llaman a algo que no existe. Encontrados 9, agrupados por función rota:

1. **Modal "Agendar disponibilidad"** (línea ~1376-1399): `abrirAgenda()`, `cerrarAgenda()`, `seleccionarSesion()`, `guardarAgenda()` — **las 4 funciones que mueven este modal entero no existen en ningún archivo JS.** Si un usuario hace click en "+ Agendar disponibilidad", no pasa absolutamente nada (error silencioso en consola del navegador).
2. **Modal de información de "Animal"** (línea ~420, parece ser una página pública tipo "El Proceso"): `abrirAnimal()` / `cerrarAnimal()` — rotos igual.
3. **Modal de información de "Etapa"** (línea ~273): `abrirEtapa()` / `cerrarEtapa()` — rotos igual.
4. **`cerrarJitsi()`** (línea 1006) — confirma un resto literal de la migración de Jitsi a LiveKit que ya sabíamos que había pasado. El botón sigue en el HTML pero la función que cerraba el video de Jitsi ya no existe en ningún sitio.

**Fix:** o se implementan las funciones que faltan (si esas 3 features — agenda, info-animal, info-etapa — se quieren de verdad), o se borran los botones del HTML si son restos de una idea abandonada. Lo que no puede quedarse es a medias, porque ahora mismo un usuario real puede encontrarse con estos botones y que no hagan nada, sin ningún aviso.

**Lo que NO he hecho:** una lectura literal línea por línea de las 3126 líneas de `index.html` buscando problemas puramente visuales/de maquetación (CSS mal puesto, textos con errata, etc.) — eso es algo que se detecta mirando la web con tus propios ojos, no rastreando código, y no aporta el mismo tipo de valor que encontrar lógica rota. Si quieres que además revise maquetación/CSS específico, dime qué páginas te preocupan y las miro con detalle.

## ✅ RESUELTO (confirmado 18/07) — `.gitignore` incompleto

**Verificado el 18/07:** el `.gitignore` ya contiene `.vercel`, `.env*` y
`node_modules` (3 líneas). Confirmado con `git ls-files | grep -i env` y
`git ls-files | grep -c node_modules` que ningún archivo `.env` ni
`node_modules` está trackeado en el repo. Este punto ya no requiere ninguna
acción — se deja el hallazgo original abajo como referencia histórica de
por qué importaba.

## ⚠️ Hallazgo urgente de seguridad — `.gitignore` incompleto (histórico, ya resuelto arriba)

El `.gitignore` completo del repo es esto, una sola línea:
```
.vercel
```

**Ni `node_modules` ni los archivos `.env` (`.env.local`, `.env.production.local`, que contienen tus claves de Supabase, Stripe, Resend, LiveKit, Daily) están excluidos.**

- **`node_modules`:** esto explica el "ruido" de miles de archivos marcados como eliminados que ha aparecido en todos los `git status` de esta noche — confirma que sí está trackeado en git por error, desde hace tiempo.
- **Los `.env`:** comprobado el historial COMPLETO de git (todos los commits, todas las ramas) — **nunca se han subido, ni una vez.** No ha habido ninguna fuga de claves hasta ahora. Pero es suerte, no protección: basta un `git add .` sin fijarse en algún momento futuro para que esas claves queden expuestas en GitHub para siempre (borrar el archivo después no borra el historial).

**Fix (5 minutos, cero riesgo):**
```
node_modules
.env
.env.local
.env.production.local
.env*.local
```
Añadir esto al `.gitignore`, y además ejecutar una vez `git rm -r --cached node_modules` para sacarlo de git sin borrarlo del disco (limpia el ruido de una vez por todas).

## ⚠️⚠️ El hallazgo más importante de toda la noche — no existe historial de git de los primeros ~2 meses de trabajo

Todo el historial de git del repositorio son **11 commits**. El primero, `5716ba3`, no tiene padre — es literalmente el commit fundacional — y está fechado el **28 de junio de 2026**. Ese único commit metió **4068 archivos y 530.428 líneas de golpe**, sin ningún desglose.

**Esto significa que todo el trabajo hecho antes del 28 de junio** — la capa de seguridad inicial, el RLS, la integración de LiveKit, los primeros arreglos del parser MT5/cTrader, el sistema de etapas, todo lo documentado en las sesiones de `ARQUITECTURA.md` de principios/mediados de junio — **se hizo directamente sobre los archivos locales, sesión a sesión, sin pasar nunca por git hasta ese único volcado final.** No hay ningún punto intermedio al que se pueda volver, ningún commit que diga "esto se veía así el 10 de junio antes de tocar X" — nada. Es una foto final sin ninguna foto anterior con la que compararla.

**Por qué esto importa de verdad, más allá de lo técnico:** explica gran parte de la sensación de esta noche de "¿esto se ha borrado o no?". Con git normal, comprobar si algo se perdió es tan simple como mirar el historial. Aquí, para todo lo anterior al 28 de junio, **es imposible saberlo con certeza** — no porque el código esté mal, sino porque nunca hubo una red de seguridad real durante la mayor parte del desarrollo.

**Desde el 28 de junio hasta hoy** ha habido 10 commits más, la mayoría de esta misma noche. Es una mejora, pero sigue siendo muy poco frecuente para dos meses de trabajo activo — la mayor parte del día a día sigue pasando en sesiones de Claude Code que pueden o no acabar subiéndose a git.

**Recomendación fuerte, la más importante de todas para mañana:** a partir de ahora, cada sesión de trabajo con Claude Code debería terminar con un commit — aunque sea pequeño, aunque sea "WIP". No hace falta que sea perfecto ni bien organizado, solo que exista. Con eso, la próxima vez que haya dudas de "¿esto se ha perdido?", la respuesta se puede comprobar con certeza en vez de con miedo.

**Alcance más amplio a confirmar mañana:** dado que esto viene de cómo `app.js` carga los datos para TODA la web, conviene revisar si hay más funciones en `gestion.js` (aparte de las dos ya identificadas) que asuman orden cronológico del array sin reordenar — el patrón de riesgo es cualquier función que use `trades[i-1]`/`trades[trades.length-1]` o acumule algo "en orden" sin haber llamado antes a algo como `fechaTrade`/`fechaDesdeFp` + `.sort()`.

## Bug de ordenación por texto en vez de número — parciales evaluados contra la zona TP equivocada

En `buildCumplimientoParciales` (línea 909):

```javascript
grupo.sort(function(a, b) { return String(a.hora || '').localeCompare(String(b.hora || '')); });
```

El campo `hora` se guarda como número entero (0-23), no como texto con ceros a la izquierda (confirmado en `api/trade-mt5.js`: `hora: ts.getUTCHours()`, y en `historial.js`: `hora: p.hora`). Al convertirlo a texto y comparar como string, **"14" ordena antes que "8"** (comparación de caracteres: `'1' < '8'`), aunque cronológicamente las 8:00 sean antes que las 14:00.

**Por qué importa de verdad:** justo después (línea 924), el orden resultante decide contra qué zona TP se evalúa cada parcial — el primero cronológico contra TP1, el segundo contra TP2, etc. Si el orden está mal por este bug, en cualquier trade cuyos parciales crucen la frontera de una cifra a dos cifras de hora (ej. un parcial a las 9:xx y otro a las 14:xx), el sistema evalúa el parcial equivocado contra la zona equivocada, dando un veredicto de cumplimiento que no corresponde a lo que realmente pasó.

**Fix (una línea):**
```javascript
grupo.sort(function(a, b) { return (parseInt(a.hora) || 0) - (parseInt(b.hora) || 0); });
```
(Ojo: esto solo ordena por hora entera, no por minuto/segundo exacto — si dos parciales caen en la misma hora, el orden entre ellos seguiría siendo ambiguo. Si se quiere precisión total, habría que usar el campo `timestamp` completo si existe en `trade_parciales`, no solo `hora`.)

---

# Sesión 12/07 — Migración de cuentas Willian→Roderas + bug de fechas cTrader

## Contexto
Roderas identificó que varias cuentas mostradas bajo el admin Willian
(`sudescansovital@gmail.com`) eran en realidad su propio proceso de
trading (Roderas), importado por error bajo la sesión equivocada en
algún momento del pasado. El histórico original en local ya no existe
(archivos perdidos del ordenador), así que la única fuente de verdad
era lo que ya estaba en Supabase.

## Migración de cuentas — CERRADA, verificada, sin pérdida de datos

Movidas de `sudescansovital@gmail.com` → `roderastrader@gmail.com`,
todas verificadas por SQL (conteo antes/después + comprobación de
duplicados por `fp`/`fp_trade` antes de mover nada):

| Cuenta origen (Willian) | Trades | Parciales | Destino final en Roderas |
|---|---|---|---|
| Retos 4011477 | 704 | 0 | Cuenta Externa · 4011477 |
| Prueba 7751904 | 29 | 10 | Cuenta Externa · 7751904 |
| Externa 135146 | 107 | 0 | Cuenta Externa · 135146 |
| Externa 7741924 | 131 | 0 | Cuenta Externa · 7741924 |
| Externa 7746279 | 75 | 0 | Cuenta Externa · 7746279 |
| Externa 7751048 | 20 | 0 | Cuenta Externa · 7751048 |
| **Total** | **1066** | **10** | |

Además, **101 registros de `trade_parciales`** bajo el email de Willian
con `cuenta_numero = 7747760` (la Maestra de Roderas) resultaron ser
**duplicados exactos** (100% coincidencia por `fp_trade` con parciales
que Roderas ya tenía) — se **borraron**, no se movieron, porque mover
un duplicado habría creado un registro repetido.

**Pasos técnicos que costó encontrar (para la próxima vez que se
reasigne una cuenta):**
1. El trigger `prevenir_cuenta_ajena` (ya existente en `trades` y
   `usuarios_aurum`) bloquea el `UPDATE usuario_email` mientras el
   número de cuenta siga asignado al usuario origen en
   `usuarios_aurum`. Hay que liberar el campo (`cuenta_maestra` /
   `cuenta_retos` / `cuenta_prueba` = NULL) en `usuarios_aurum` ANTES
   del UPDATE en `trades`, y hacerlo por SQL directo — nunca desde el
   botón "deseleccionar" del panel admin, porque ese botón dispara
   `_reasignarCuentaExterna()` en `admin.js`, que pone
   `cuenta_numero = null` en los trades liberados. Si no tienes el
   archivo original para reimportar, esto pierde la referencia de
   cuenta para siempre.
2. `cuenta_numero` **no tiene el mismo tipo de dato en todas las
   tablas**: en `trades` es texto pero se comporta de forma
   inconsistente según la cuenta; en `trade_parciales` es texto puro
   (usar comillas simples siempre en el WHERE). Comprobar con
   `information_schema.columns` antes de asumir.
3. El editor SQL de Supabase **solo muestra el resultado de la última
   query** si se pegan varias `SELECT` seguidas en el mismo script —
   parecía que salían "0 filas" cuando en realidad solo se veía el
   resultado de la tercera consulta. Ejecutar una query a la vez si
   hay dudas.
4. **`trade_parciales` no tiene el trigger `prevenir_cuenta_ajena`**
   que sí protege a `trades` y `usuarios_aurum` — por eso ha podido
   colarse contaminación cruzada dos veces (Willian→Mara documentado
   antes, y ahora Willian→Roderas con los 101 registros). **Pendiente
   para una sesión futura:** replicar el mismo trigger en
   `trade_parciales`.

## Bug de fechas cTrader en `historial.js` — CERRADO, 3 commits aplicados

**Síntoma:** las cuentas Externa (todas cTrader) mostraban como
"periodo" la fecha de subida del archivo, no las fechas reales de
operación — parecía que la cuenta llevaba "1 día activa" cuando en
realidad llevaba meses.

**Causa raíz:** el cálculo del periodo mostrado (dos sitios idénticos
en `historial.js`) solo reconocía fechas en formato MT5
(`AAAA.MM.DD`) dentro del campo `fp`. El `fp` de cTrader usa formato
`DD/MM/AAAA HH:MM:SS|dirección|precio`, así que nunca hacía match y
caía siempre al fallback `created_at` (fecha de subida).

**3 commits aplicados hoy, en este orden:**
1. `c27cbb0` — nueva función `_fechaDesdeFp()` que reconoce MT5,
   cTrader e ISO (misma lógica de 3 formatos que ya usaba
   `_parseDate()` en `parser.js` al importar, pero que nunca se
   guardaba de forma reutilizable). Reemplaza el regex solo-MT5 en
   los dos sitios de `historial.js`.
2. `c774974` — eliminado el fallback a `created_at`. Se descubrió que
   ~172 de 704 trades de la cuenta 4011477 no tienen NINGUNA fecha
   guardada en `fp` (el archivo de origen no la traía) — dato perdido
   sin remedio, no recuperable. Antes esos 172 arrastraban la fecha de
   subida y ensuciaban el rango mostrado; ahora simplemente no
   participan en el cálculo del periodo (pero sí siguen contando en
   total de trades, WR y P&L).
3. `2baf3d7` — la fecha de inicio del periodo ahora incluye el año
   (antes solo la fecha de fin lo tenía, lo que hacía parecer
   ilógicos rangos que cruzaban de un año a otro, ej. "15 Jul – 12 Jun
   2026" en vez de "15 Jul 2025 – 12 Jun 2026"). Y cuando NINGÚN trade
   de una cuenta tiene fecha recuperable (caso real: cuentas 135146,
   7741924, 7746279, 7751048 — el `fp` ahí es solo un ID numérico sin
   fecha, columna `fecha` también NULL), se muestra "Sin fecha
   registrada" en vez de la fecha de hoy (que era engañosa).

**Pendiente, sin decidir todavía:** para las 4 cuentas sin ninguna
fecha recuperable, ¿existe algún otro campo o archivo de origen que sí
la tenga y que se podría reimportar/backfillear? No investigado hoy —
se optó por el mensaje honesto como solución inmediata.

## Lección operativa más importante de la sesión — Project Knowledge desactualizado casi causa un commit erróneo

Al preparar el primer fix, edité una copia de `historial.js` obtenida
de Project Knowledge en vez de pedir el archivo real del repo desde el
principio (violación directa de una regla ya escrita más arriba en
este documento). Claude Code detectó correctamente 3 diferencias que
no tenían nada que ver con el fix (`on_conflict=fp` vs
`fp,usuario_email`, comentario `UNIQUE(fp)` vs `UNIQUE(fp,
usuario_email)`, y la desaparición del campo `tipo` en el insert) y
**no comiteó hasta que se aclarara** — así se evitó un cambio de
comportamiento no intencionado (afecta a qué se considera trade
"duplicado" en el upsert). Se resolvió recuperando el original real
con `git show HEAD:historial.js`, aplicando el fix limpio sobre esa
base, y confirmando con `git diff` antes de cada commit.

**Regla reforzada para todas las sesiones futuras:** JAMÁS editar una
copia de Project Knowledge cuando el cambio se va a aplicar al código
real. Project Knowledge sirve solo para contexto/orientación general.
Para cualquier edición real, pedir el archivo desde el repo (subida
directa del usuario, o `git show HEAD:archivo` si ya se sobrescribió
por error localmente) antes de tocar una sola línea.

---

# Sesión 12/07 (tarde) — Historial de etapas: confirmado que YA NO es un bug, es feature completa y funcionando

## Contexto
Roderas preguntó por qué el contador "Días en proceso" (dashboard) no
parecía coincidir con la fecha en que "Claridad" apareció marcada como
alcanzada. Esto llevó a revisar dos cosas que resultaron ser
independientes entre sí.

## 1. "Días en proceso" — confirmado que es dato real, no hardcodeado

`gestion.js` calcula este contador desde
`usuarioActual.fecha_entrada || usuarioActual.created_at` (columna real
de `usuarios_aurum`, confirmado por SQL contra `information_schema.columns`).
No hay ningún hardcode aquí — cambiar el número de días es tan simple
como editar `fecha_entrada` en Supabase.

**Por decisión de Roderas (narrativa de marca, no fix técnico):**
`fecha_entrada` de `roderastrader@gmail.com` se cambió de forma manual
por SQL de "01/02/2026" a **"2024-04-03"**, para que el proceso mostrado
represente el tiempo real que lleva construyendo Aurum Velare, no solo
desde que se activó la cuenta en la plataforma. Verificado antes/después
por SQL, cambio confirmado en Supabase.

## 2. Historial de etapas (`etapa_historial`) — la nota de "sigue roto" en este documento (línea ~267, sesión anterior) QUEDA DESMENTIDA hoy

Al investigar, se encontró que el Project Knowledge tenía una copia
vieja de `admin.js`/`tablillas.js` sin esta feature — pero **el código
real en producción (subido hoy por Roderas) ya la tiene completa e
implementada correctamente en los dos lados:**

- **`admin.js`, `adminGuardarUsuario()`:** al guardar el modal de
  edición de usuario, compara `etapa` anterior vs. nueva. Si cambió,
  hace `INSERT` en `etapa_historial` (`usuario_email`, `etapa`, y
  `created_at` — que toma del campo opcional "Fecha real del cambio de
  etapa" del modal si se rellena, o el `now()` de Supabase por defecto
  si se deja vacío). Esto es justo lo que Roderas pidió hace tiempo:
  poder reconstruir historial pasado con fechas reales, no solo la
  fecha de cuando se toca el admin.
- **`tablillas.js`, `cargarEtapaHistorial()`:** lee `etapa_historial`
  filtrado por email, ordenado por `created_at`, y pinta el resultado
  real en `#dash-etapas-historial` (sidebar del dashboard, bajo "TU
  NIVEL"). Ya no usa el array hardcodeado de la sesión anterior.

**Confirmado visualmente con captura real del dashboard de Roderas:**
se ven las 3 etapas reales con sus fechas (Silencio, Claridad,
Fractura), leídas en vivo desde Supabase. **No hizo falta tocar ni una
línea de código hoy** — la única razón por la que Roderas no lo veía
antes es que la sección queda más abajo del scroll del sidebar
izquierdo, fuera de la primera pantalla visible.

**Único dato suelto encontrado (no bug, dato mal metido a mano):** la
fila de etapa 1 ("Silencio") tenía el año **2001** en vez de 2026/2024
(typo de cuando se insertó de prueba por SQL). Roderas decidió que
ajustará esa fecha (y las demás fechas de cada etapa de su propio
historial) él mismo, directamente desde el campo de fecha manual del
admin, según la línea temporal de marca que quiere construir (coherente
con el nuevo `fecha_entrada` de abril 2024). No es una tarea pendiente
de código — es edición de contenido/narrativa que hace él mismo.

## Cerrado — nada pendiente de código de esta sesión

Los dos sistemas (contador de días y historial de etapas) están
confirmados funcionando correctamente de punta a punta. Lo único que
queda es que Roderas termine de rellenar/ajustar las fechas de cada
etapa desde el panel admin, a su ritmo — trabajo de datos/contenido,
no de desarrollo.

---

# Sesión 12/07 (noche) — Sistema de "premios pendientes" en Retos: construido, probado, y un bug de fondo encontrado en la propia prueba

## Contexto
Roderas preguntó cómo sabía el sistema si un usuario había cumplido un
reto y ganado el premio. Respuesta corta: no lo sabía — `calcularProgreso()`
en `gestion.js` ya calculaba el progreso en vivo (real, no decorativo),
pero nada marcaba nunca "esto se cumplió" ni pagaba el premio. Las
columnas `progreso` y `ganador` en `retos_participantes` ya existían en
la BD (mismo patrón que `etapa_historial` antes de hoy: infraestructura
preparada, nunca conectada).

## Construido y desplegado — 3 archivos, 2 commits

**Commit `bdac1a9` — `gestion.js`:** dentro de `cargarRetosActivos()`,
cuando `prog.actual >= prog.requeridos` y la participación aún no está
marcada, se hace `PATCH` a `retos_participantes` (`progreso`, `ganador:
true`, `completado_at: now()`). **No paga el OZT automáticamente** — solo
detecta y marca. El usuario ve el badge "✦ Reto cumplido — premio
pendiente de aprobación" en vez de la barra de progreso.

**Commit `b34984d` — `admin.js` + `index.html` juntos (misma feature):**
nueva sección "Premios pendientes de entregar" junto a "Gestión de
Retos" en el panel admin, con badge dorado mostrando el número de
premios sin entregar. `adminCargarPremiosPendientes()` lista los
`retos_participantes` con `ganador=true AND premio_entregado=false`;
botón "Entregar" (`adminEntregarPremio()`) suma el `premio_ozt` del
reto a `ozt_ganados_retos` del usuario y marca `premio_entregado = true`.
**La entrega es siempre manual, con confirmación** — decisión explícita
de Roderas: detección automática sí, pago automático no.

Columnas nuevas en `retos_participantes` (SQL ejecutado por Roderas,
verificado antes/después): `completado_at TIMESTAMPTZ`, `premio_entregado
BOOLEAN DEFAULT false`.

## Bug de fondo encontrado — durante la primera prueba real, no en teoría

Primer caso de prueba real: reto "NO mas de 0,40" (`33 operaciones con
lote ≤ 0.40`), Roderas participando desde el 04/07/2026
(`trades_al_inicio = 197`). El sistema lo marcó `ganador = true` con
`progreso = 33`. Antes de pulsar "Entregar", Roderas dudó de si esos 33
trades eran reales — decisión correcta, porque no lo eran.

**Causa raíz confirmada por SQL, no por sospecha:**
- El corte "trades después de apuntarte al reto" se hace por **posición
  en el array** (`window._userTrades.slice(trades_al_inicio)`), no por
  fecha real del trade.
- El array se ordena por `created_at` (fecha de inserción en Supabase),
  bug ya documentado arriba en este mismo plan (sección "Bug de orden
  cronológico").
- Existe un bloque de ~40 trades con `created_at` **idéntico al
  milisegundo** (`2026-06-13 11:07:18.427932+00`) — restos de la
  migración masiva Willian→Roderas de la sesión de esta tarde. Todos
  tienen `volumen = 0` (dato corrupto, mismo patrón que los 1.037 trades
  de Willian ya documentados como pendientes de limpieza) y `fp` sin
  fecha recuperable (formato cTrader solo-ID).
- Postgres no garantiza orden estable entre filas con `created_at`
  exactamente igual. Contando por posición: 40 candidatos con
  `volumen=0` que cumplen `<=0.40` trivialmente → 33 contados para el
  reto. **Contando por fecha real** (`created_at > fecha de registro en
  el reto`): solo **14** trades, y ninguno con `volumen=0` — el número
  correcto, y no llega a los 33 requeridos.

**Verificado con SQL, no revertido "por si acaso":** se confirmó primero
que `premio_entregado` seguía en `false` (nada se había pagado — Roderas
no había pulsado "Entregar" antes de dudar), y solo entonces se corrigió:

```sql
UPDATE retos_participantes
SET ganador = false, completado_at = NULL, progreso = 14
WHERE id = 'c75a132b-1c23-4225-a33c-ed05d7da69cb';
```

Confirmado el estado final por SQL después del UPDATE: `ganador=false,
completado_at=NULL, progreso=14`.

## Estado del bug de fondo — NO corregido en código, documentado para más adelante

**No urgente mientras la entrega siga siendo manual con revisión humana**
(que es como quedó diseñado desde el principio, precisamente por esto).
El riesgo real solo existiría si en el futuro se automatizara también el
pago del premio sin revisión — motivo de más para no automatizar eso
sin arreglar primero el cálculo de progreso.

**Fix real pendiente (para cuando se aborde la limpieza de trades
corruptos de Willian, es la misma familia de problema):** cambiar el
corte de "trades desde que empezó el reto" de posición en array a
comparación de fecha real extraída de `fp` (reutilizar `_fechaDesdeFp()`
si ya existe como función compartida tras el bug de fechas cTrader de
esta tarde, o el mismo patrón). Alcance más amplio a confirmar: revisar
si `calcularProgreso()` tiene el mismo problema en sus otros tipos de
condición (`wr_minimo`, `trades_sin_revenge`, `pnl_minimo`), todos
dependen del mismo array `tradesReto` mal cortado.

## Nota aparte — reto "NO mas de 0,40" quedó con `condicion=NULL` corregida a mano

Recordatorio de contexto para no repetir el diagnóstico: este mismo reto
se creó originalmente sin la parte estructurada de `condicion` (solo
título + descripción en texto libre) — se corrigió a mano por SQL en
esta misma sesión, antes de encontrar el bug de arriba. Pendiente sin
decidir: si se añade una validación en `adminCrearReto()` que avise si
se crea un reto sin condición medible.

## Fix de fondo aplicado y verificado en la misma noche — commit `70ee157`

El bug de "corte por posición en vez de por fecha real" descrito arriba
no se dejó pendiente — se corrigió esa misma noche, porque se descubrió
que el problema no era puntual: **el falso positivo se volvía a marcar
solo cada vez que se recargaba la página**, sobrescribiendo cualquier
corrección manual por SQL. Con la entrega aún pendiente de aprobar, no
había riesgo económico, pero sí ruido constante en el panel de admin.

**Cambio aplicado en `gestion.js`:**
- Nueva función `_fechaRealTrade(t)` (mismo patrón de 3 formatos —
  MT5, cTrader, fallback `created_at` — que la función local `_parseFecha()`
  que ya existía en el archivo pero encerrada dentro de otra función, no
  reutilizable).
- Dentro de `cargarRetosActivos()`: `todosUser.slice(trades_al_inicio)`
  sustituido por `todosUser.filter(t => _fechaRealTrade(t) >=
  participacion.created_at)`. Fallback al método antiguo solo si no hay
  `created_at` en la participación.

**Hueco de diseño encontrado DURANTE la propia verificación (no es el
mismo bug, es uno nuevo):** el código solo dispara el cálculo cuando
`participacion.ganador` es `false` — si ya estaba en `true` de una
detección anterior (aunque fuera un falso positivo), nunca se vuelve a
evaluar, sin importar que el cálculo de fondo ya esté arreglado. La fila
de prueba se quedó "atascada" en `ganador=true` de la ronda anterior
hasta que se hizo un `UPDATE` manual una vez más (esta vez con el fix de
fecha ya desplegado):
```sql
UPDATE retos_participantes SET ganador = false, completado_at = NULL, progreso = 0
WHERE id = 'c75a132b-1c23-4225-a33c-ed05d7da69cb';
```
Tras el reset y con el fix de fecha activo, se confirmó visualmente
(barra "14 / 33 operaciones") y por SQL que ya no se vuelve a marcar
solo — **el fix es correcto y estable**, el reset manual solo hacía
falta esa vez, para limpiar el estado que había quedado de las pruebas
anteriores al fix.

**Pendiente sin decidir, no urgente:** ¿debería el sistema re-evaluar
retos ya marcados `ganador=true` pero `premio_entregado=false` por si
la condición cambia (ej. el admin corrige la condición del reto, o se
limpian trades corruptos)? Hoy no lo hace — una vez marcado, se queda
así hasta que el admin lo entregue o alguien lo resetee a mano. Es
razonable dejarlo así (evita recalcular constantemente), pero merece
una decisión consciente en algún momento, no es un descuido de esta
sesión.

## Cerrado de verdad — sesión de Retos completa

Los 4 archivos de esta noche (`gestion.js` con 2 commits — badge +
fix de fecha —, `admin.js`, `index.html`) están en producción y
verificados con datos reales, incluyendo el caso límite que se coló en
la primera prueba. Nada queda pendiente de código de esta sesión.

## Pendientes para la próxima sesión (anotados, sin tocar código esta noche)

1. **Faltan tipos de condición en `calcularProgreso()`.** Hoy solo
   existen 4: `lote_maximo`, `wr_minimo`, `trades_sin_revenge`,
   `pnl_minimo`. El reto "mide tu agilidad para leer mercado" (111
   trades, ratio riesgo/beneficio 1:1) no tiene ningún tipo que lo
   represente — hace falta programar uno nuevo, `rr_minimo` (comparar
   ganancia media vs. pérdida media del conjunto de trades contra el
   ratio pedido). Cada reto con una regla distinta a las 4 ya existentes
   va a chocar con esto — no hay forma de que el sistema "interprete"
   una descripción en texto libre; cada regla nueva es una función de
   cálculo nueva que hay que programar.
2. **Decisión de diseño sin resolver:** ¿deberían los retos contar solo
   trades con `fuente='ea'` (excluyendo reimportaciones manuales de
   histórico), o seguir contando todos los trades del rango de fecha
   como ahora? Cambio pequeño en código (un filtro más en
   `cargarRetosActivos()`), pero con una consecuencia grande: un usuario
   sin el EA activo (`tiene_ea=false`, como Willian ahora mismo) nunca
   podría completar ningún reto si se exige `fuente='ea'` de forma
   general. A decidir si es una regla global o configurable por reto
   individual.
3. **Cualquier tipo de condición nuevo (como `rr_minimo`) tiene que
   añadirse en 3 sitios a la vez, o no sirve de nada:** la opción en el
   `<select id="admin-reto-condicion-tipo">` de `index.html` (para poder
   elegirla al crear el reto), el objeto `condicion` que ya arma
   `adminCrearReto()` genéricamente en `admin.js` (no necesita cambio,
   ya es genérico), y el bloque `else if` nuevo en `calcularProgreso()`
   en `gestion.js` (el cálculo real). Confirmado por Roderas — así es
   como lo tenía pensado.
4. **Revisar los 4 tipos de condición ya existentes antes de añadir
   ninguno nuevo — uno de ellos parece mal diseñado.** Repasados en
   detalle con Roderas:
   - `lote_maximo` — cuenta trades con volumen ≤ valor. Correcto, funciona
     como se espera (es el que usa "NO más de 0,40").
   - `wr_minimo` — **posible mal diseño.** No cuenta racha de trades
     ganadores; calcula el WR acumulado desde el inicio de la
     participación trade a trade, y resetea el contador entero a 0 en
     cuanto ese acumulado cae por debajo del umbral. Contraintuitivo
     frente a lo que el nombre sugiere ("WR mínimo 60%, 30 trades").
     Roderas de acuerdo en que probablemente haya que replantearlo —
     alternativa propuesta a valorar: racha de ganadores consecutivos,
     o WR sobre una ventana de los últimos N trades en vez de todo el
     histórico acumulado.
   - `trades_sin_revenge` — racha sin aumentar lote tras una pérdida.
     Bien diseñado, mide revenge trading de verdad.
   - `pnl_minimo` — cuenta trades individuales con beneficio ≥ valor
     (en $, no acumulado). Correcto, pero ojo con valores en 0 o
     negativos (casi trivial de cumplir).
   
   **Para la próxima sesión:** decidir si se replantea `wr_minimo` antes
   o junto con añadir `rr_minimo` (ratio riesgo/beneficio, pendiente del
   punto 1).

## ✅ Verificado (18/07) — "TP alcanzado" en 0% en cuenta Maestra: dato real, no bug

Comprobado con SQL directo sobre 5 trades ganadores reales de Maestra con tp
registrado: precio_entrada, precio_cierre y tp están en la misma unidad
(precio real, ~4000-4200), sin desajuste. Las distancias reales al TP
(29-390 puntos) confirman que Roderas cierra manualmente casi siempre antes
de tocar el TP en su cuenta Maestra — el 0% es un reflejo fiel de su
comportamiento real de trading, no un fallo de cálculo. El margen de 0.5
puntos en el código (buildEstadisticasAvanzadas) es correcto. No requiere
ninguna acción.

---

## 🔧 Para otra sesión — Unificar visitas.js y gestion.js (no es urgente)

**Qué es:** verCuenta() (el selector Global/Maestra/Retos/Prueba de Mi
Gestión) vive en visitas.js, y llama a buildCuentaReal()/buildGlobal() ahí
mismo, con sus propias copias de calcMetricas(), calcTipos(), calcDias().
gestion.js tiene sus propias versiones de cálculos muy similares
(buildDashboardHero, buildTradeRecord, etc.) que leen la misma variable
global (window.cuentaActivaGestion) pero recalculan todo por su cuenta.

**Por qué importa:** cualquier bug o mejora en estos cálculos (ya pasó hoy
con el WR ambiguo) hay que aplicarlo dos veces, en dos archivos, o queda
inconsistente entre pantallas.

**Cómo abordarlo, con seguridad (no es un cambio urgente ni arriesgado si
se hace paso a paso):**
1. Primero, listar TODAS las funciones duplicadas entre ambos archivos
(calcMetricas, calcTipos, calcDias, y cualquier otra que calcule lo mismo
dos veces) — comparando función por función cuál versión es más completa/
correcta hoy.
2. Elegir UNA sola copia de cada función (la más completa/correcta) y
moverla a un sitio compartido — puede ser un archivo nuevo (ej. utils-
calculos.js) cargado antes que gestion.js y visitas.js, o dejarla en uno
de los dos y que el otro la reutilice.
3. Cambiar las llamadas de un archivo primero (el que tenga menos riesgo,
probablemente visitas.js ya que tiene menos funciones), verificar en
pantalla que nada cambia visualmente, y solo entonces tocar el otro.
4. Un archivo/función a la vez, con verificación visual en pantalla entre
cada uno — igual que se hizo con los 12 puntos del WR ambiguo hoy.

**Punto de partida sugerido:** empezar por calcMetricas(), es la función
más compartida (6 llamadas) y ya se auditó a fondo hoy (18/07) — se sabe
exactamente dónde está y quién la usa.

---

## ✅ CERRADO (18/07) — WR 0% ambiguo en calcMetricas()

**Commit `224504d`, desplegado 18/07.** `calcMetricas()` (visitas.js:74)
devolvía `wr:0` cuando no había trades válidos que calcular — indistinguible
de un 0% de acierto real. Ahora devuelve `wr:null` en ese caso (mismo
patrón que ya tenía `calcTipos()`).

Actualizados los 5 puntos que consumen ese valor, para pintar `'—'` (o
excluir la cuenta del ranking) en vez de mostrar "null%":
- `buildGlobal()`, línea 306 (visitas.js).
- `buildCuentaReal()`, línea 190 (visitas.js).
- "Patrones comunes" en `buildGlobal()` (visitas.js) — excluye
  `wr===null` antes de ordenar, para que no pueda ganar como "cuenta más
  limpia".
- `statsCuenta()` dentro de `buildDashboardHero()` (gestion.js).

Verificado visualmente en la cuenta de Willian. No requiere ninguna
acción más.

## ✅ CERRADO (18/07) — Datos de sesión anterior pegados al cambiar de usuario sin F5

**Commit `df2a678`, desplegado 18/07.** Bug encontrado durante la
verificación del fix anterior: al entrar como Willian justo después de
haber estado como Roderas (sin recargar la página por completo), se veían
datos de la cuenta 152034 de Roderas (Cuenta Prueba) en la pantalla de
Willian.

Confirmado con SQL directo que **no era un problema de datos** —
`usuarios_aurum` y `trades` estaban correctos en Supabase (Willian con
`NULL` en las 3 cuentas, las 58 filas de `cuenta_numero=152034` todas bajo
`roderastrader@gmail.com`) — era caché de variables JS pegado en el
navegador entre sesiones.

**Fix:** `hacerLogout()` (app.js) simplificado a solo `signOut()` +
`location.reload()`, eliminando el reseteo manual de 9 variables que era
frágil (dependía de acordarse de añadir cada variable global nueva a la
lista cada vez que se creaba una — ya se habían quedado fuera 7:
`window.cuentaActivaGestion`, `yaBuiltGestion`, `_totalTrades`,
`_userTrades`, `AURUM_OZT`, `_agendaCache`, `_retosCache`). La recarga
completa reinicializa todo de golpe y reconstruye el DOM desde cero, sin
depender de mantener esa lista sincronizada.

Verificado en producción: sesión Roderas → Salir → sesión Willian, sin
rastro de datos anteriores. No requiere ninguna acción más.

## ✅ CERRADO (18/07) — 313 trades de Roderas con precio_entrada=0/precio_cierre=0 en 3 cuentas antiguas, copia duplicada bajo boli-al@hotmail.com

Encontrado durante la verificación del fix de logout, al ver que Mara
mostraba datos que no debería tener.

**Causa raíz:** la migración Willian→Roderas del 12/07 movió las cuentas
`7741924`, `135146` y `7746279` (etiquetadas "Externa", sin protección del
trigger `prevenir_cuenta_ajena` a diferencia de las cuentas Maestra/Retos/
Prueba), pero los precios quedaron a `0` del lado de Roderas, mientras una
copia completa con los datos correctos quedó bajo el email de Mara desde
una fase de pruebas anterior.

**Fix aplicado en 2 pasos vía SQL directo en Supabase** (con pre-check y
post-check en cada paso, sin script versionado en el repo):
1. `UPDATE` restaurando `precio_entrada`, `precio_cierre` y `puntos` en las
   313 filas de Roderas desde las filas equivalentes de Mara (emparejadas
   por `id_posicion` extraído del `fp`, ya que el `fp` completo no
   coincidía en formato entre los dos lados). `beneficio` no se tocó
   porque ya coincidía correctamente en ambos lados.
2. `DELETE` de las 313 filas bajo `boli-al@hotmail.com` para esas 3
   cuentas — Mara no debe tener trades de cuentas ajenas.

**Verificado:** Roderas conserva 75/131/107 filas por cuenta (313 total),
0 filas rotas restantes. Mara: 0 filas de esas cuentas.

**Nota para el futuro:** revisar si `trade_parciales` tiene el mismo
problema para estas 3 cuentas — no se comprobó en esta ronda, el trigger
`prevenir_cuenta_ajena` no cubre esa tabla (ya documentado con el caso
Willian→Mara del 04/07).

---

# Sesión 19/07 — Auditoría completa de integridad (Bloques A-E) + 2 fixes de seguridad en LiveKit, aplicados y verificados en producción

## Parte 1 — Auditoría de integridad de datos, verificada con SQL real

Auditoría en modo solo lectura sobre 5 bloques (fugas de datos entre
usuarios, valores 0/null engañosos, caché de sesión, duplicados de `fp`,
cobertura del trigger `prevenir_cuenta_ajena`). El informe inicial (basado
en código + incidentes documentados en este mismo archivo) marcó 3
hallazgos como críticos a nivel de base de datos. Verificados después con
SQL real ejecutado por Roderas, **los 3 eran falsos positivos:**

- **`trade_parciales` SÍ tiene el trigger `prevenir_cuenta_ajena`**
  (confirmado con SQL: existe `trg_prevenir_cuenta_ajena_parciales`). El
  informe se apoyó en el incidente Willian→Mara del 04/07 y en la nota
  de la sesión del 12/07 (línea ~902 de este mismo documento, "el trigger
  no cubre esa tabla") sin volver a comprobar el estado actual — el
  trigger se añadió en algún momento posterior y esa nota quedó
  desactualizada. **Corrección respecto a lo anotado arriba en este
  documento: sí está cubierta.**
- **No hay fuga de emails vía anon key** en `tablilla_avisos` /
  `lista_espera`. Confirmado revisando `pg_policies`: esas tablas solo
  tienen políticas `INSERT`, ninguna `SELECT` pública — la anon key
  (pública por diseño, embebida en el JS) no puede leerlas.
- **No hay riesgo real de duplicados por `fp` de formato mixto.**
  Confirmado con SQL contra toda la base de datos: 0 casos del formato
  peligroso (fallback `fecha_pe_vol`, dos guiones bajos, el que podía
  colisionar entre trades reales distintos). El `UNIQUE(fp,
  usuario_email)` existe como constraint real en `trades`, no solo como
  comentario.

**Lección para no reabrir estos 3 sin motivo nuevo:** no hay incidente
real asociado a ninguno de los tres hoy. Si en el futuro aparece un caso
concreto (fuga, duplicado, cruce de cuentas) que apunte de nuevo a
cualquiera de estos, sí merece revisarse otra vez — pero no como
suposición de auditoría sin datos.



**Pendiente de menor prioridad, sin incidente real todavía:**
`ea_trades`, `ea_sl_changes` y `ea_tp_changes` no tienen el trigger
`prevenir_cuenta_ajena` (solo `trades` y `trade_parciales` lo tienen,
confirmado). Riesgo teórico, no materializado: si algún día se reasigna
entre usuarios una cuenta con EA activo, estas 3 tablas quedarían
expuestas al mismo tipo de cruce que ya pasó con `trade_parciales` en
04/07 y 12/07. No urgente mientras no se reasignen cuentas con EA.

## Parte 2 — Fixes reales aplicados y verificados hoy

**1. `api/livekit-token.js` (commit `ca1afed`) — endpoint sin ningún
control de acceso, corregido.**
El endpoint generaba un token de LiveKit con `canPublish`/`canSubscribe`
para cualquier `room_name` pedido, sin comprobar sesión ni pertenencia a
la sala — cualquiera, incluso sin login, podía entrar a audio/vídeo de
cualquier sala, incluida la del Águila, solo con conocer el nombre
(hardcodeado y visible en `salas.js`). Fix: el endpoint ahora exige un
JWT válido de Supabase (validado contra `/auth/v1/user`) y comprueba que
la sala pedida corresponda al animal del usuario — traduciendo emoji→slug
con un mapa `ANIMAL_SLUG`, porque `usuarios_aurum.animal` se guarda como
emoji (🦁, 🐝...) y no como slug (`leon`, `hormiga`...) — o que el usuario
sea el admin. Whitelist cerrada a las 7 salas reales (6 de animal +
`sala-aguila`); `sala-abierta` queda en el whitelist preparada pero
inactiva, porque el frontend hoy no la llama (`LIVEKIT_ROOMS` en
`salas.js` no tiene esa entrada) — activarla es una decisión de producto
aparte, no de este fix. **Verificado en producción** con `curl` directo
(401 sin token) y con la consola del navegador (403 "No tienes acceso a
esta sala" al intentar entrar con la cuenta de Roderas, no admin, a Sala
Toro).

**2. `salas.js` (commit `6238496`) — UI de sala vacía tras rechazo,
corregido.**
Tras el fix anterior, apareció un bug de percepción (confirmado con la
consola del navegador, no era el fix de seguridad fallando): `entrarSala()`
mostraba el panel de "sala interior" (chat, cabecera, botones) antes de
saber si el servidor iba a conceder el token — así que durante unos
segundos, tras un rechazo, la pantalla parecía "haber entrado" cuando en
realidad el acceso real (audio/vídeo) estaba siendo bloqueado, con solo
un toast transitorio como aviso. Fix: si `_conectarLiveKit()` recibe
`!token`, ahora revierte la UI a la lista de salas (`salas-lista` visible,
`sala-interior` oculta) además de mostrar un mensaje claro ("No tienes
acceso a esta sala.") en vez de dejar la pantalla de sala vacía.

## Pendiente para la próxima sesión

**`api/trade-mt5.js` acepta eventos del EA sin validar identidad del
emisor** — solo comprueba `email` + `cuenta_numero` en texto plano contra
`usuarios_aurum.tiene_ea`, sin JWT ni ningún secreto por usuario. Riesgo:
suplantación de escritura — alguien que conozca el email y número de
cuenta de un usuario con `tiene_ea=true` podría inyectar eventos de
trade falsos (open/close/sl_change/tp_change) a su nombre. No abordado
en esta sesión, queda como el siguiente fix de seguridad a diseñar.

**✅ ACTUALIZACIÓN (misma noche, segunda mitad de la sesión 19/07):** este
hallazgo se abordó y las fases 1-3 ya están cerradas y verificadas en
producción. Ver sección "Autenticación de eventos del EA" más abajo. Solo
queda pendiente la fase 4 (hacerlo obligatorio) y el panel admin de
gestión de contraseñas.

## Nota de proceso, para futuras sesiones

El informe de auditoría de hoy mostró en sus propios 3 hallazgos de base
de datos que apoyarse solo en el código y en incidentes ya documentados
en este archivo, sin verificar el estado *actual* con una consulta real,
lleva a falsas alarmas — el trigger de `trade_parciales`, en concreto, se
había corregido en algún momento sin que este documento se actualizara.
**Regla ya aplicada hoy y a mantener:** todo hallazgo de "riesgo" a nivel
de base de datos debe confirmarse con SQL real antes de proponer un fix,
no basta con el histórico de este documento.

---

# Sesión 19/07 (segunda mitad) — Autenticación de eventos del EA (api/trade-mt5.js)

## PARTE NUEVA — Autenticación de eventos del EA

**Hallazgo:** el endpoint aceptaba eventos del EA validando solo `email` +
`tiene_ea`, sin ninguna prueba de que la petición viniera realmente del
EA de ese usuario — cualquiera con el email podía falsificar un POST.

**Mecanismo aplicado:** contraseña única por usuario (columna
`ea_password` en `usuarios_aurum`), enviada por el EA en cada evento y
comprobada por el servidor.

**Estado real, fase a fase:**

- **FASE 1 (cerrada, desplegada):** servidor con columna `ea_password`
  creada, contraseña de Roderas generada, validación NO bloqueante —
  compara si llega, pero nunca rechaza el evento todavía, solo logs.
  Commit `351be58`.
- **Repo sincronizado con el `.mq5` real:** el `EA_Aurum_Tracker.mq5` que
  había en el repo estaba obsoleto (sin cola persistida, sin tracking de
  TP, con descarte de eventos tras 3 reintentos). Se sustituyó por el
  `EA_Aurum_Tracker_FIX.mq5` real que corre en la terminal MT5 de
  Roderas. Commit `c8a211c`.
- **FASE 2 (cerrada):** input `EaPassword` añadido al EA, mandado en los
  seis `BuildXxxJson()` (open, sl_change, tp_change, original_capture,
  partial_close, close). Commit `812d5a5`.
- **FASE 3 (cerrada, verificada con datos reales):** Roderas reconfiguró
  su EA en MT5 (cuenta 152034) con la contraseña, confirmado en logs de
  Vercel: `"ea_password: OK para roderastrader@gmail.com"`. Funcionando
  en producción.
- **FASE 4 (PENDIENTE, siguiente paso):** hacer la contraseña obligatoria
  en el servidor — rechazar cualquier evento sin `ea_password` o que no
  coincida. Antes de aplicar esto hay que confirmar que TODOS los
  usuarios con `tiene_ea=true` tienen ya su contraseña generada y
  configurada en su EA (ahora mismo solo Roderas la tiene puesta), si no
  se les bloquearía sin avisar.

## PENDIENTE NUEVO A AÑADIR — Panel admin: gestión de ea_password

Roderas señaló que ahora mismo generar y consultar la contraseña de un
usuario requiere SQL manual en Supabase — no es sostenible con más de un
usuario con EA. Falta en `admin.js`/`index.html`, junto al interruptor
existente de activar/desactivar EA por usuario:

- Mostrar la contraseña actual del usuario (o "sin generar" si no tiene).
- Botón para generar una nueva (rotación si se filtra o el usuario la
  pierde) — considerar si generar automáticamente al activar el
  interruptor de EA por primera vez, para ahorrar un paso.
- Botón de copiar al portapapeles, para pasársela al usuario.

**Orden recomendado para cuando se retome:**
1. Completar el panel admin (para poder generar y repartir contraseñas a
   otros usuarios como Willian sin tirar de SQL).
2. Confirmar que todos los usuarios con `tiene_ea=true` tienen ya su
   contraseña puesta en su EA real.
3. Solo entonces aplicar la fase 4 (bloqueo obligatorio) — así no se
   corre el riesgo de bloquear a un usuario que aún no tiene contraseña
   configurada.

---

# Sesión 20/07 — Cuenta Retos 167807: bug crítico de cola duplicada en el EA + ajustes de import

## HALLAZGO 1 (crítico) — `g_cola` se duplicaba en cada reinicio del EA

`g_cola` (la cola de eventos pendientes del EA) era una variable global
que nunca se reseteaba en `OnInit()`. En MQL5, un reinicio por
`REASON_PARAMETERS` (cambiar Inputs y aceptar Propiedades) no limpia las
variables globales — solo llama a `OnDeinit()`+`OnInit()` sobre la misma
instancia. `CargarColaPersistida()` sumaba el contenido del archivo de
disco sobre lo que ya había en memoria en cada reinicio, duplicando la
cola exponencialmente.

Confirmado en producción: la cuenta 167807 llegó a **440.555 eventos
"pendientes" (105,7 MB)** partiendo de solo 3 trades reales, tras los
reinicios normales de configurar Email/EaPassword/IntervaloEnvioSegundos
tanto ayer como hoy. Verificado en logs de Vercel que **NO** llegó a
dispararse el envío masivo contra el servidor — se detectó a tiempo (solo
4 peticiones reales a `/api/trade-mt5` en 24h, todas de un único
`position_id` legítimo).

**FIX aplicado:** `ArrayResize(g_cola, 0)` al inicio de
`CargarColaPersistida()`, antes de leer el archivo — así cada reinicio
parte de cero y solo carga lo que hay legítimamente en disco (que
`PersistirCola()` sí sobrescribe entero en cada cambio, así que es
seguro). Un solo punto de cambio. Commit `c63fd20`.

Archivo de cola corrupto de la 167807
(`aurum_cola_167807.txt`, `Common\Files`) borrado a mano tras confirmar
que MT5 ya no lo tenía bloqueado (se quitó el EA del gráfico primero).
Verificado tras el fix: reinicio limpio, log del EA mostrando solo "2
eventos pendientes" (los legítimos).

**Importante para el futuro:** cualquier reconfiguración del EA (Email,
EaPassword, intervalos) implica reinicios por `REASON_PARAMETERS` — antes
del fix esto era peligroso en cadena, ahora ya no. Si algún día se ve un
archivo `aurum_cola_<cuenta>.txt` anormalmente grande o un "eventos
pendientes" muy alto en el log de MT5, **este es el patrón a revisar
primero**.

## HALLAZGO 2 (menor) — mínimo de 5 trades bloqueaba importar cuentas nuevas

`historial.js` exigía un mínimo de 5 trades para permitir la importación
manual, lo que impedía importar cuentas nuevas con pocos trades — el
mensaje de error ("no se encontraron trades XAU/USD suficientes") además
era confuso, sonaba a fallo de detección del parser cuando en realidad
funcionaba bien. Bajado el mínimo a 1 (solo bloquea si `trades.length ===
0`) y mensaje corregido a "No se encontraron trades XAU/USD en el
archivo". Commit `1d960a0`, desplegado a producción.

## Resultado

Cuenta Retos 167807 operativa — EA sincronizando correctamente y datos
visibles en Trade Record.

---

# Sesión 24/07 — Token compartido para el EA + fix visual de ciclo dots

## ✅ CERRADO — Fix visual de `buildCicloDots` (gestion.js)

Cuando `completados === 0` (ningún ciclo de 111 trades cerrado todavía),
el bloque que actualiza `#ciclo-completado-label` y
`#ciclo-completado-trades` estaba detrás de un `if (completados > 0)`
sin rama `else` — se quedaba visible el texto de plantilla de
`index.html` (`"Ciclo 1 — completado"` / `"111 / 111 trades"`), aunque
fuera mentira. Ahora, con `completados === 0`, se muestra "Aún sin
ciclos completados" y el bloque de trades queda vacío. Commit `a1c689f`,
desplegado y en producción.

## ✅ CERRADO — Token compartido para autenticar al EA (capa nueva, independiente de `ea_password`)

**Hallazgo confirmado contra código real:** `api/trade-mt5.js` no
validaba ningún secreto — solo comprobaba `email` + `tiene_ea`, así que
cualquiera con el email de un usuario con EA activo podía falsificar
eventos. Además, si `cuenta_numero` no coincidía con
`cuenta_maestra`/`cuenta_retos`/`cuenta_prueba` del usuario, el endpoint
lo etiquetaba "Cuenta Externa" y seguía aceptándolo sin más (este segundo
punto queda sin tocar, ver pendientes abajo).

**Mecanismo aplicado (solo el primero de los dos):** input `Token` nuevo
en el EA (`EA_Aurum_Tracker_FIX.mq5`), mandado en los seis eventos
(open/sl_change/tp_change/original_capture/partial_close/close),
validado en `api/trade-mt5.js` contra la variable de entorno
`EA_SHARED_SECRET` — rechazo `401` si no coincide o falta. Es una capa
**independiente** del mecanismo `ea_password` por usuario (que sigue en
fase 1 de 4, sin tocar — ver fase 4 pendiente abajo): `Token` = "es un
EA legítimo", `ea_password` = "es la cuenta correcta" (pendiente).

Commit `fce8eb8`. Desplegado y **ACTIVO en producción** — el 401 ya está
en vigor. `EA_SHARED_SECRET` confirmada como configurada en Vercel
(Production + Preview) antes del deploy.

## ⚠️ PENDIENTE — URGENTE, primero de todo en la próxima sesión

El EA real en MT5 (carpeta `MQL5\Experts`, **no** el `.mq5` del repo)
todavía tiene la versión vieja sin el campo `Token`. Como el rechazo 401
ya está activo en producción, **el EA puede estar fallando en silencio
ahora mismo en cada evento** hasta que se reemplace.

**Pasos:** copiar el `.mq5` actualizado del repo a `MQL5\Experts`,
compilar, recargar el EA en el gráfico, y pegar el Token en Entradas.
Revisar el log de "Expertos" en MT5 para confirmar si ha habido
rechazos 401 mientras tanto (y, si los hubo, cuántos eventos se han
perdido — la cola de reintentos del EA los reintendrá en cuanto el
Token esté puesto, así que probablemente no haya pérdida real, pero hay
que confirmarlo, no asumirlo).

## Pendiente — sin empezar

1. **✅ CERRADO (25/07)** — Cambio #2 de seguridad: rechazar con `403`
   en `api/trade-mt5.js` si `cuenta_numero` no pertenece al usuario.
   Ver sección "Sesión 25/07" más abajo.
2. **Fase 4 de `ea_password`** (hacerlo obligatorio) — ahora mismo solo
   avisa por log, nunca rechaza. Ver detalle de fases 1-3 más arriba
   (sesión 19/07, segunda mitad).
3. **✅ CERRADO (25/07)** — Columna `fecha` vacía en trades
   `fuente='import'` de MT5. Ver sección "Sesión 25/07" más abajo.
4. **Dos ítems de diseño de producto**, arrastrados de sesiones
   anteriores: bloqueo de parámetros de Cumplimiento, y rediseño de
   packs (Raíz/Umbral/Senda/Cima/VIP).

---

# Sesión 25/07 — Cierre de los dos pendientes de seguridad/datos de la sesión anterior

## ✅ CERRADO — Cambio #2 de seguridad: rechazo `403` en `api/trade-mt5.js`

Segunda capa tras el `401` por `Token` (sesión 24/07): si el
`cuenta_numero` que manda el EA no coincide con `cuenta_maestra`,
`cuenta_retos` ni `cuenta_prueba` del usuario, el endpoint ya no lo
etiqueta "Cuenta Externa" y lo acepta — ahora responde `403`. Commit
`c19860b`.

**No afecta a `historial.js` ni a la importación manual de "Historial
Externo"** — código separado, sigue aceptando cualquier `cuenta_numero`
como hasta ahora, sin cambios.

## ✅ CERRADO — Fecha vacía en imports MT5 (`_parsearMT5`)

Confirmado: `_parsearMT5` nunca calculaba ni incluía un campo `fecha`
en el objeto de cada trade (solo `hora` y `dia`), así que en
`historial.js` la línea `fecha: t.fecha || ''` siempre guardaba vacío
para trades `fuente='import'`. Fix: `_parsearMT5` ahora añade
`fecha: fechaStr` en el `trades.push`, reutilizando el mismo `fechaStr`
que ya se calculaba para construir el `fp` de cada trade. Commit
`aa29cc7`.

**Backfill ejecutado en Supabase por SQL** (no por este fix, que solo
aplica a futuras importaciones): de 1284 trades `fuente='import'` con
`fecha=''`, **247 recuperados** (extrayendo la fecha del propio `fp`,
que ya la traía delante). Quedan **1037 trades con fecha irrecuperable
por este método** (el `fp` tampoco tenía fecha en origen) — pendiente
para otra sesión si se quiere investigar más a fondo (posible origen:
mismo patrón de `fp` sin fecha ya documentado para varias cuentas
Externa de cTrader en la sesión 12/07).
