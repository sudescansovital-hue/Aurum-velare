# Estado — FASE 1 "Examen de la EA" + análisis post-cierre (en seco)

> Rama `feature/post-cierre` (no se ha tocado `main`). Actualizado 29/09/2026.
> FASE 1 **terminada**: análisis ejecutado sobre los 298 trades.

---

## Cómo se ejecuta

```
cd tools\post_cierre
.venv\Scripts\python.exe post_cierre.py            # todos los trades
.venv\Scripts\python.exe post_cierre.py --limit 5  # prueba
.venv\Scripts\python.exe post_cierre.py --cuenta 178497
```

- Requiere MT5 abierto a mano. `mt5.initialize()` usa la ruta fija
  `MT5_TERMINAL_PATH` (`C:\Users\boli-\AppData\Roaming\MetaTrader 5\terminal64.exe`,
  el único terminal que se abre a mano) con `timeout=60s` y sin reintentos,
  para no lanzar nunca otro MT5 de los instalados.
- Las velas XAUUSD de ese terminal (hoy WSFmarkets, cuenta 178497) se usan
  para los trades de **todas** las cuentas. No hay separación por bróker:
  todas las cuentas cuentan igual. El encaje precio guardado ↔ vela M1 es de
  296/298 entradas y 297/298 cierres, así que las velas valen para todas.
- Solo lectura: nada se escribe en Supabase ni en el EA. Salidas en
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
  nunca por tiempo. Tras salida en BE: si luego toca SL original →
  `te_salvo`; si va a favor > 0.5× distancia entrada→SL → `te_saco_de_un_ganador`.
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

- Breakeven real (85 trades): te_salvo 32 · te_saco_de_un_ganador 12 · sin_efecto 41.
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

**Llevar el análisis post-cierre a la web**, con la misma lógica que el
resumen: vista global de todas las cuentas como principal + desglose por
cuenta. Diseño de partida en `docs/DISENO_POST_CIERRE.md` (dónde va en la
web). Por decidir: cómo se alimenta (el cálculo necesita velas M1, que hoy
salen del terminal MT5 local) y si los resultados se suben a Supabase.

Pendiente menor del script: desglose "¿cambia tu gestión con el lote?" en
`resumen.md` (el volumen ya viaja en `resultados.csv`, falta agregarlo).
