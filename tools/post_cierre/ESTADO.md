# Estado — análisis post-cierre: FASE 1 (examen de la EA) + FASE 2 (Diario web)

> Actualizado 02/10/2026. **FASE 2 en producción** (`main` = `cdede9a`,
> deploy `aurum-velare-cw5la96zd`; el anterior, para rollback, era
> `aurum-velare-9hp3r9l3q`). FASE 1 terminada el 29/09 (298 trades, en seco).

---

## FASE 2 — Diario de análisis en la web (02/10)

Se acabaron los CSV a mano. Flujo:

1. `post_cierre.py` pide a `api/post-cierre.js` (`GET ?accion=pendientes`) los
   trades de la EA cerrados sin análisis, con `ventana_completa=false` o con
   `criterios_version` menor que `CRITERIOS_VERSION` (hoy 2, desde el 02/10).
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

**Si cambian umbrales o criterios:** subir `CRITERIOS_VERSION` en
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

## Fallos de la EA — para arreglar en OTRA sesión

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

Menores (no son de la EA): 5 SL y 6 TP originales con dedazo de tecleo
(sección 4 del examen); 3 precios fuera de su vela M1 (sección 6);
162 trades sin `estrategia` (casi todos antes del 26/08).

---

## Siguiente paso

FASE 2 hecha (ver arriba). Pendiente:

- **Revisión visual del Diario en producción con sesión iniciada** (02/10 solo
  se pudo verificar por HTTP: archivos, sintaxis de los 15 scripts, endpoint y
  colocación en el DOM; sin navegador no se pudo entrar con la cuenta).
- **Siguiente mejora del Diario — "Todo el histórico":** junto a las flechas
  ‹ › de semana, una opción "Todo el histórico" que muestre los KPIs, los
  bloques "Tus decisiones de gestión" y la tabla por estrategia con TODOS los
  trades analizados juntos, tanto en Global como por cuenta (respetando los
  chips de cuenta). Pedido el 02/10, sin hacer todavía.
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
- **Mejora futura — detectar "vuelta de posición":** un trade en dirección
  contraria abierto en la misma cuenta dentro de los X minutos siguientes
  (p. ej. 15) a cerrar otro con pérdida o a mano. Marcarlo en los dos trades
  (el cerrado y el nuevo) y mostrar en "Tu semana" cuántas vueltas hubo y su
  resultado conjunto (P&L de los dos trades juntos). Umbral X por decidir.
  Pedido el 02/10, sin hacer todavía.
  Notas para construirlo: no necesita velas ni MT5. Sale de cruzar
  `fecha_cierre` del primero con `fecha_entrada` del siguiente, más
  `direccion` y `cuenta_numero`, todo ya en `post_cierre_analisis`. El P&L sale
  de `trades`, como el resto del Diario. Se puede calcular en el front
  (`diario-analisis.js`) sin tocar el script ni subir `CRITERIOS_VERSION`.
  "Con pérdida o a mano" = `tipo_cierre_detallado` en
  (`sl_original_o_ajustado_perdida`, `manual`), o P&L < 0 en `trades`.
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
- Siguientes versiones: incubadora de estrategias e informe diario.
- Pendiente menor del script: desglose "¿cambia tu gestión con el lote?" en
`resumen.md` (el volumen ya viaja en `resultados.csv`, falta agregarlo).
