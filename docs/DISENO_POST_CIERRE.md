# Diseño — Análisis post-cierre (¿habría tocado SL o TP original?)

> Documento de diseño. Nada de esto está construido ni ejecutado.
> No modifica `EA_Aurum_Tracker_FIX.mq5` (producción), ni `api/trade-mt5.js`,
> ni `api/trade-evento.js`, ni ninguna tabla existente.
>
> Contexto: informe de auditoría de datos de trading (sesión de hoy,
> 28/09/2026) — ver conversación. Verificado contra Supabase real:
> 298 trades cerrados por el EA, 256 válidos para este análisis (37 sin SL
> original recuperable + 5 con SL fuera de rango, excluidos).
>
> Decisión explícita de esta sesión: **NO se arregla el bug de
> `cierre_tp`** (ver hallazgo en el informe — 0 apariciones en
> `trade_eventos` pese a haber cierres reales por TP). Arreglarlo implica
> tocar el EA de producción, y antes hay que resolver que la copia del
> repo y la que corre en MT5 están desincronizadas (pendiente ya
> documentado en `PLAN_CORAZON_DATOS.md`, sesión 27/08). Queda para una
> sesión aparte. Este diseño **no depende** de que se arregle: el tipo de
> cierre se deduce por precio cuando falte o discrepe del evento (igual
> que ya hace `E1`/`E4` del informe).

---

## 0. Qué pregunta responde

Para un trade cerrado **a mano** por el EA (posiblemente antes de tocar su
SL o TP original): si el precio hubiera seguido corriendo sin ese cierre
manual, **¿habría llegado antes al SL original o al TP original?** Y
además, **¿cuánto se movió a favor después del cierre** aunque no llegara
a tocar ninguno de los dos (cuánto se "dejó sobre la mesa")?

No sustituye a MFE/MAE (eso mide el recorrido **mientras el trade estaba
abierto**, ya implementado el 04/09). Esto mide el recorrido **después**
de que Roderas ya había cerrado.

---

## 1. Script/endpoint aparte — diseño

### 1.1 Por qué NO es el EA de producción

`EA_Aurum_Tracker_FIX.mq5` corre 24/7 sobre posiciones **abiertas**, con
`OnTick`/`OnTimer` throttled y una arquitectura de colas ya frágil (RAM +
disco, ver incidentes de agosto). Meter aquí una consulta a
`CopyRates()` sobre trades **ya cerrados** es un problema completamente
distinto (histórico, no tiempo real) y no tiene motivo para compartir
proceso ni código con el EA en vivo. Mezclarlo aumentaría el riesgo sobre
algo que ya ha dado bastantes disgustos (Token, cola, esquema).

**Propuesta: proceso independiente, ejecutado a demanda (o programado),
en la misma máquina Windows donde corre MT5** — porque `CopyRates()` solo
es accesible desde un terminal MT5 con el símbolo/histórico ya
descargado; Vercel no tiene forma de hablar con MT5 directamente.

Dos formas de implementarlo, a decidir en la sesión de construcción (no
aquí):

- **Script MQL5 (`.mq5` tipo Script, no Expert Advisor)** — se adjunta a
  un gráfico manualmente, hace su trabajo una vez y termina solo. Mismo
  lenguaje que el EA, cero dependencias nuevas, pero cada ejecución es
  manual (o vía el Task Scheduler de Windows lanzando el terminal en modo
  script).
- **Script Python con el paquete `MetaTrader5`** (`mt5.copy_rates_range`,
  equivalente a `CopyRates`) — corriendo en la misma máquina, con el
  terminal MT5 abierto. Más cómodo de iterar/depurar/probar en seco sin
  tocar el terminal en vivo, y más fácil de programar con `schedule`/Task
  Scheduler que un script MQL5. **Recomendado** por eso, salvo que se
  prefiera mantener todo en un único lenguaje.

En ambos casos: **proceso nuevo, fichero nuevo, sin tocar el EA
existente.**

### 1.2 Qué pide (entrada)

Los 256 trades válidos, con exactamente los mismos campos que ya calcula
la consulta `E1`/`E4` del informe (reutilizar esa reconstrucción, no
inventar una nueva):

| Campo | Origen |
|---|---|
| `position_id`, `fp`, `cuenta_numero` | `ea_trades` |
| `dir` (`buy`/`sell`) | `ea_trades.tipo` |
| `precio_cierre`, `fecha_cierre` | `ea_trades` |
| `sl_original_recon` | `ea_trades.sl_original` → si falta, primer `ea_sl_changes.sl_anterior` → si falta, primer `sl_nuevo` (misma cascada del informe) |
| `tp_original_recon` | ídem con `ea_tp_changes` (puede ser `NULL` — operar sin TP es normal, confirmado por Roderas) |
| `tipo_cierre` | último `trade_eventos.tipo_evento LIKE 'cierre%'` para ese `fp`; si no hay fila, o si discrepa del precio, se deduce por cercanía a SL/TP (mismo criterio `tipo_cierre_derivado` de `E4`) — **es el único campo donde el bug de `cierre_tp` importa, y ya está cubierto por este fallback** |
| símbolo | de momento **fijo/hardcoded** por cuenta (XAUUSD/GOLD según sufijo del bróker) — hasta que exista la columna `simbolo` recomendada en el informe. Anotado como deuda técnica, no bloqueante |

El proceso pide esto **leyendo Supabase** (mismo patrón de auth ya
existente: service role si corre server-side, o vía un endpoint de
lectura dedicado — a decidir en construcción), nunca escribiendo sobre
`ea_trades`/`trades`.

### 1.3 Ventana de horas tras el cierre

- **Ventana por defecto: 48 horas** desde `fecha_cierre`. Roderas opera
  scalping (<30 min) y swing (4h-24h) — 48h cubre ambos con margen sin
  disparar el volumen de velas a procesar.
- **Parada anticipada**: en cuanto se toca SL o TP (lo que ocurra
  primero), se detiene el recorrido — no hace falta seguir mirando velas
  después del veredicto.
- Si ni SL ni TP se tocan dentro de la ventana: `resultado =
  'ninguno_en_ventana'`, y el recorrido a favor (§1.4) se mide sobre toda
  la ventana igualmente.
- Ventana configurable por ejecución (parámetro), no hardcodeada dentro
  del script — para poder repetir el análisis con otra ventana sin tocar
  código.

### 1.4 Cómo decide qué se tocó primero

Recorrido cronológico vela a vela (M1) desde `fecha_cierre`:

- **Buy**: SL tocado si `low de la vela <= sl_original`; TP tocado si
  `tp_original` existe y `high de la vela >= tp_original`.
- **Sell**: SL tocado si `high de la vela >= sl_original`; TP tocado si
  `tp_original` existe y `low de la vela <= tp_original`.
- Recorrido a favor (`recorrido_max_favor`): el mejor precio alcanzado en
  la dirección favorable al trade dentro de la ventana (o hasta el
  veredicto, lo que sea antes), medido como distancia desde
  `precio_cierre` — **no** desde `precio_entrada` (eso ya lo mide
  MFE/MAE). Se guarda en puntos y en precio, más el instante en que se
  alcanzó.

**Caso ambiguo, tratado con honestidad en vez de adivinar:** una sola
vela M1 solo trae `open/high/low/close` — si esa vela toca SL y TP a la
vez (vela ancha, noticia, gap), **no se puede saber con estos datos cuál
fue primero**. En vez de asumir uno de los dos en silencio, se marca
`resultado = 'ambiguo_misma_vela'` y queda fuera de cualquier estadística
de "cuántos habrían ido a SL vs a TP" hasta que alguien lo revise a mano.
Es preferible un dato marcado como dudoso a una estadística sesgada por
una suposición.

### 1.5 Convención de hora — punto crítico, ya lo advertía el informe

Los timestamps de `ea_trades`/`ea_sl_changes`/`ea_tp_changes` son **hora
de servidor MT5, etiquetada `+00`** (no UTC real — ya confirmado en el
informe y coherente con el fix del 01/09 en `ea-auditoria.js`). Las
velas M1 que devuelve `CopyRates()`/`copy_rates_range()` **también vienen
en hora de servidor del bróker conectado**. Mientras el script corra
contra el **mismo bróker/cuenta** del trade que está analizando, las dos
horas ya coinciden sin necesidad de convertir nada — es la ventaja de no
mezclar con una fuente de precios externa. El riesgo aparece solo si se
analizan trades de una cuenta con las velas de otra (brokers distintos
pueden tener servidores en zonas horarias distintas) — por eso el script
debe agrupar por `cuenta_numero` y pedir las velas al terminal conectado
a esa cuenta concreta, nunca mezclar.

---

## 2. Tabla de resultados propuesta (texto SQL — NO ejecutado)

```sql
-- DISEÑO, no ejecutar. Mismo patrón de RLS que trade_eventos (fp -> trades.usuario_email).

CREATE TABLE IF NOT EXISTS post_cierre_analisis (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fp                        TEXT NOT NULL REFERENCES trades(fp) ON DELETE CASCADE,
  position_id               BIGINT NOT NULL,
  cuenta_numero             TEXT,

  ventana_horas             INT NOT NULL DEFAULT 48,
  sl_original_usado         NUMERIC,
  tp_original_usado         NUMERIC,          -- NULL válido (operar sin TP es normal)
  tipo_cierre_usado         TEXT,             -- 'cierre_tp' | 'cierre_sl' | 'cierre_manual'
  tipo_cierre_origen        TEXT CHECK (tipo_cierre_origen IN ('evento','derivado_por_precio')),

  resultado                 TEXT NOT NULL CHECK (resultado IN (
                               'fue_a_sl', 'fue_a_tp',
                               'ninguno_en_ventana',
                               'ambiguo_misma_vela',
                               'datos_insuficientes'   -- huecos en el histórico M1
                             )),
  tiempo_hasta_resultado_min INT,              -- NULL si 'ninguno_en_ventana' / 'datos_insuficientes'

  recorrido_max_favor_puntos NUMERIC,          -- siempre calculado si hay velas, sea cual sea 'resultado'
  recorrido_max_favor_precio NUMERIC,
  recorrido_max_favor_en     TIMESTAMPTZ,

  precio_cierre_manual      NUMERIC,           -- copia de conveniencia, evita join constante
  fuente_datos              TEXT NOT NULL DEFAULT 'M1_broker',
  calculado_en              TIMESTAMPTZ NOT NULL DEFAULT now(),
  notas                     TEXT               -- ej. "vela ambigua a las 14:32", "hueco de datos 2h"
);

-- Idempotencia: re-ejecutar el análisis para el mismo trade actualiza la fila,
-- no la duplica. Mismo mecanismo que el upsert de trades (on_conflict).
CREATE UNIQUE INDEX IF NOT EXISTS post_cierre_analisis_fp_uniq
  ON post_cierre_analisis (fp);

CREATE INDEX IF NOT EXISTS post_cierre_analisis_cuenta_idx
  ON post_cierre_analisis (cuenta_numero, calculado_en);

-- RLS: mismo patrón que trade_eventos (sql_trade_eventos.sql), dueño resuelto
-- vía fp -> trades.usuario_email. Tres policies (admin_select, admin_todo, user_todo).
```

---

## 3. Cómo se vería en la web

### 3.1 Dónde — corrección de nombre importante

El sitio natural **no es la pestaña literal "Diario"** (`gtab-diario`,
`diario_entradas` — texto/ánimo libre, sin `fp` ni vínculo a trades,
confirmado por SQL el 08/08 y descartado entonces a propósito para esto
mismo). El sitio real es el bloque que **ya existe** para esto: **"Auditoría
EA · Línea de tiempo por trade"**, dentro de la pestaña **Trade Record**
(`#ea-auditoria-bloque`, `ea-auditoria.js`). Es el mismo bloque que ya
filtra `fuente='ea'` y ya lee `trade_eventos` — es la extensión natural,
no una pantalla nueva. (Uso "Diario" en el resto de este documento en el
sentido coloquial que usa Roderas — Mi Gestión → Trade Record — no la
pestaña literal.)

### 3.2 Por trade — dentro de la fila ya existente

Solo aplica a trades con `tipo_cierre` manual (evento o derivado) — para
los cerrados por SL/TP no hay pregunta que responder. Una línea nueva
dentro del desplegable de cada trade, después de la línea de tiempo de
eventos actual:

```
Post-cierre (48h): habría tocado SL a los 42 min (-11.2 pts) ·
antes de eso llegó a +6.4 pts a favor sin cerrar ahí
```

o, si no tocó nada:

```
Post-cierre (48h): ni SL ni TP tocados · llegaste a dejar +14.2 pts
sin capturar en las siguientes 48h
```

o, si quedó ambiguo:

```
Post-cierre: dato ambiguo (SL y TP en la misma vela) — revisar a mano
```

Reutiliza el mismo estilo visual de la línea de tiempo actual (mismo
`font-size:13px`, misma paleta `var(--text-dim)`/`var(--gold-dim)`) —
cero elementos nuevos de diseño, solo una fila más dentro del contenedor
que ya existe.

### 3.3 Resumen semanal — bloque nuevo, no sustituye nada

Un bloque pequeño **por encima** de la lista de trades individuales
(mismo `<div class="cell">` que ya usan otras secciones de Cumplimiento),
agregando por semana natural:

```
Semana 22–28 sep · cerraste a mano 14 trades
→ 9 habrían ido a SL (evitaste esa pérdida)
→ 3 habrían ido a TP (recortaste la ganancia antes de tiempo)
→ 2 sin resolver en 48h
→ dejaste una media de +5.8 pts sin capturar en los cierres que no llegaron a TP
```

Puramente descriptivo — sin veredicto de "bien/mal hecho", coherente con
cómo está redactado el resto de Cumplimiento hoy (datos, no juicios).

### 3.4 Qué NO se toca

- **`capturas-test.js`** y su DOM (`IndexedDB`, `showDirectoryPicker`,
  flujo de capturas por trade) — funcionalidad completamente aparte, no
  se referencia ni se modifica.
- El resto de `ea-auditoria.js` (`_eaAuditoriaCrearFila`,
  `_eaAuditoriaDolaresEvento`, etc.) — se **añade** una función nueva que
  consulta `post_cierre_analisis` y pinta la línea extra, no se edita la
  lógica existente de eventos/timeline.
- `gestTab()`, la navegación de pestañas, y el resto de bloques de
  Cumplimiento/Estadísticas.

---

## 4. Riesgos y qué NO se toca (resumen)

**No se toca:**
- `EA_Aurum_Tracker_FIX.mq5` (producción, ni la copia del repo ni la que
  corre en MT5)
- `api/trade-mt5.js`, `api/trade-evento.js`
- `ea_trades`, `trades`, `trade_eventos`, `ea_sl_changes`, `ea_tp_changes`,
  `trade_parciales` — solo lectura
- `capturas-test.js`
- El bug de `cierre_tp` — deliberadamente pospuesto (ver cabecera)

**Riesgos a tener en cuenta antes de construir:**

1. **Profundidad de histórico M1 depende del bróker.** Si el bróker no
   conserva M1 tan atrás como el trade más antiguo de los 256, esos
   trades quedan en `datos_insuficientes`. Hay que comprobarlo en seco
   antes de prometer cobertura del 86% completo.
2. **Cuenta ≠ bróker único.** Roderas opera en varios brokers/servidores
   (WSFmarkets, el de Maestra, etc.) — el script tiene que agrupar por
   cuenta y pedir velas al terminal conectado a esa cuenta exacta, nunca
   mezclar fuentes de precio entre cuentas (spreads/horarios de servidor
   distintos invalidarían el resultado).
3. **Símbolo no está en el esquema todavía.** Se resuelve con un mapeo
   fijo por cuenta mientras tanto; si se abre otro instrumento sin
   actualizar ese mapeo, el resultado sería silenciosamente incorrecto —
   por eso el script debería loguear el símbolo usado por cada cuenta en
   cada corrida, no darlo por hecho.
4. **Vela ambigua (SL y TP en la misma vela M1).** Tratado como dato
   explícitamente dudoso (§1.4), no como un veredicto forzado — evita
   sesgar las estadísticas semanales con una suposición.
5. **Este proceso es manual/local, no un endpoint de Vercel.** Necesita
   el terminal MT5 abierto en la máquina de Roderas — no es "siempre al
   día" como el resto del sistema; hay que decidir cadencia (¿bajo
   demanda? ¿tarea programada semanal?) en la sesión de construcción.
6. **Reutiliza la reconstrucción de SL/TP original del informe**, con las
   mismas limitaciones ya documentadas (`sl_original NULL` por
   `SyncHistory48h`, `sl`/`tp` NULL por desconexión) — este diseño no las
   resuelve, hereda el 86% de cobertura ya medido, no el 100%.
