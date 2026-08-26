# Auditoría de pendientes — Aurum Velare (26/08/2026)

> Auditoría de solo lectura. No se ha tocado código. Metodología: lectura
> completa de `docs/ARQUITECTURA.md`, `docs/BUGS.md` y `PLAN_CORAZON_DATOS.md`
> (1951 líneas), `git log --oneline -60`, y `grep` dirigido contra el código
> real para cada punto de la lista de pendientes conocidos — no se da nada
> por cerrado ni por abierto solo porque lo diga la documentación, se
> contrasta contra el código en disco tal como está hoy.

---

## Tabla resumen

| # | Pendiente | Área | Estado real detectado en código | Impacto | Esfuerzo |
|---|---|---|---|---|---|
| 1 | Días en proceso por cuenta | Web | ✅ **Resuelto** (confirmado 12/07) — dato real desde `usuarios_aurum.fecha_entrada`, no hardcode | — | — |
| 2 | Badge cuenta en Trade Record | Web | ✅ **RETRACTADO (26/08) — no es un bug.** `visitas.js:133-141` (`_setBadge`), implementación independiente, llega a la misma regla fija (Maestra=Real, Retos/Prueba=Challenge) que `gestion.js` — coincide con las definiciones de las 4 carpetas en `docs/ARQUITECTURA.md`. No existe ningún campo por usuario que deba hacerlo variar. Sin cambios | — | — |
| 3 | Mi Gestión sidebar — array de etapas viejo | Web | ✅ **RETRACTADO (26/08) — no es el bug que se pensaba.** `gestion.js:1874` (`ETAPAS`, 12 elementos) y `tablillas.js:105-106` ya coinciden entre sí, y verificado contra un caso real en producción (`PLAN_CORAZON_DATOS.md`: "TU NIVEL: 05 · Claridad" para Roderas = índice 5 del array de 12). El desalineado es `docs/ARQUITECTURA.md` (describe una escala de 10 etapas con medios pasos que no es la implementada) — fix de documentación, no de código, sin hacer todavía. **Bug real encontrado en su lugar y CORREGIDO (commit `32d2200`):** `evalua.js` (página pública Evalúame) tenía `etapaRec` llegando a 6 sobre un array de 6 índices (0-5) — la rejilla nunca resaltaba nada en el mejor caso posible, y el párrafo usaba un offset `-1` que la rejilla no usaba, mostrando dos nombres de etapa distintos en la misma pantalla para el mismo resultado. Corregido: un solo índice, sin desfase | — | — |
| 4 | Retos hardcoded en dashboard principal | Web | ✅ **Resuelto** — `cargarRetosActivos()` (`gestion.js:2254`) es query real contra `retos_participantes`, sistema construido y verificado 12/07 | — | — |
| 5 | Cierre de retos — asignación de OZT al ganador | Web/Admin | ✅ **Resuelto por diseño** — detección automática + entrega **manual** con aprobación admin (commits `bdac1a9`/`b34984d`, 12/07); bug de corte por posición→fecha real corregido (`70ee157`). Pendiente menor sin decidir: si se debe re-evaluar un reto ya marcado `ganador=true` si la condición cambia después | Bajo | — |
| 6 | Parser MT5 partial closes | Web | ✅ **Resuelto** — tabla `trade_parciales` creada, parser extrae parciales de la sección Transacciones (sesión 24/06, `docs/BUGS.md` #19/#20) | — | — |
| 7 | Admin: reasignar cuenta con flujo de 777 OZT | Admin | ✅ **Resuelto** — commit `c7fa5e8` (04/07), confirmado contra código 23/08 | — | — |
| 8 | Admin: contador de OZT por usuario | Admin | ⚠️ **Parcial/sin confirmar** — `ozt_ganados_retos` existe y se actualiza (`admin.js`, entrega de premios), pero no se detecta un contador visible dedicado en el panel — necesita verificación visual, no hay evidencia de bug ni de feature completa | Bajo | S |
| 9 | Admin: notificación al llegar a trade 1111 (evaluación) | Admin | ⚠️ **Parcial** — el cálculo de bonus (`Math.floor(totalTrades/1111)*50` OZT, `gestion.js:1860`) existe y corre en silencio; **no hay ninguna notificación al admin** cuando un usuario cruza el umbral | Medio | S |
| 10 | Admin: toggle activo/inactivo de Mara no funciona | Admin | ⚠️ **No confirmable por código** — el cableado (`admin-edit-activo`, `u.activo` en filtros de tabla y estadísticas) parece correcto; no se detecta bug estático. Requiere reproducir en vivo | — | — |
| 11 | Admin: ajuste manual de profit para fases de challenge | Admin | ❌ **No implementado** — cero resultados en todo el repo | Medio | M |
| 12 | SL mal calculado en cTrader (343 pts en Cumplimiento) | Web/Datos | ⚠️ **Sin evidencia de bug en el código actual** — `parser.js:_parsearCtrader` usa la misma lógica ya corregida que MT5 (`slValido` + fallback a movimiento de precio). Si el caso de 343 puntos viene de un import anterior al fix, es dato histórico, no bug vivo | Bajo | — |
| 13 | cTrader SL NULL en 704 trades de Retos (import previo al fix) | Datos | 🟡 **Probablemente sigue abierto** — coincide con la cuenta `4011477` migrada el 12/07 (704 trades, 0 parciales, la única cuenta con ese conteo exacto en todo el histórico documentado). No hay evidencia de backfill de `sl` ejecutado para esos trades específicamente | Bajo | M |
| 14 | Cumplimiento — cálculo dentro/fuera del método | Web | ✅ **Resuelto** — `_esSlProtegido()` en `gestion.js:86`, aplicado en 8+ sitios (incluye `ea-auditoria.js`), del plan "corazón de datos" | — | — |
| 15 | WR 0% en cuentas con pocos trades (167807) | Web | ✅ **Resuelto** — patrón `null`-centinela confirmado en los sitios revisados de `gestion.js` y `visitas.js` (commits `c6fd926`, `224504d`, `2f0e213`, 18/07) | — | — |
| 16 | Descuento lanzamiento 70% + 5 cupos gratis | Marketing | ❌ **No implementado** — sin rastro en código; feature de marketing/Stripe sin construir | Medio | M |
| 17 | Camino VIP (5º pack) | Marketing | ❌ **No implementado** — `docs/ARQUITECTURA.md` solo documenta 4 Caminos (Umbral/Raíz/Senda/Cima) | Bajo | M |
| 18 | Actualizar ARQUITECTURA.md y BUGS.md | Docs | 🟡 **Parcial** — `ARQUITECTURA.md` se actualizó hoy (26/08); `docs/BUGS.md` sigue parado desde el **24/06**, con varios bugs ahí listados como activos que ya están resueltos según `PLAN_CORAZON_DATOS.md` (nunca se tocó tras esa fecha) | Bajo | S |
| 19 | Toggle tema oscuro/claro | Web | ❌ **No implementado** — cero resultados en el repo | Bajo | M |
| 20 | Trade Record — distribución por tipo mal calculada | Web | ✅ **RESUELTO (commit `32d2200`, 26/08).** "Tipo dominante" (conteo) y "Mejor/Peor WR" (WR aislado) se dejaron tal cual — ninguno era el bug real, eran estadísticas descriptivas distintas, no un ranking mal hecho. Se añadió una tercera tarjeta "Tipo más consistente" en `buildTradeRecord()`, rankeada por esperanza (WR+R/R combinados, misma fórmula ya usada en toda la app vía `calcMetricas()`), reutilizada ahora también en `calcTipos()`/`tm()` (visitas.js) en vez de recalcular a mano | — | — |
| 21 | Mover trades viejos a Cuenta Externa al cambiar nº de cuenta | Admin/Web | ✅ **Resuelto** — `_reasignarCuentaExterna` (admin.js) y `_liberarCuentaAExterna` (gestion.js, flujo de usuario); desde el 23/08 además conserva `cuenta_numero` (commit `5e94cd6`) | — | — |
| 22 | Daily.co para salas con screen sharing (reemplazo Jitsi) | Infra | 🟡 **Decisión de arquitectura distinta, ya en producción** — el reemplazo de Jitsi se hizo con **LiveKit** (`api/livekit-token.js`, `salas.js`), no Daily.co, con fixes de seguridad aplicados y verificados (19/07). Si Daily.co seguía siendo el plan, hay una discrepancia a resolver; si LiveKit ya cubre la necesidad, este punto está de facto resuelto | — | — |
| 23 | Historial Externo — mostrar tipo/número/fechas/duración | Web | ⚠️ **Tab existe y funciona** (`gtab-historial` → `init_historial()`), pero no se confirmó el detalle exacto de qué campos renderiza sin inspección visual — no se marca como bug sin evidencia | — | S |
| 24 | Fase 4 EA: ea_password obligatorio | EA/Seguridad | ✅ **Resuelto** — commit `38cc0a2` (25/07), verificado en logs reales de MT5 | — | — |
| 25 | Panel admin para gestión de ea_password | Admin | ✅ **Resuelto** — commit `b534651` (25/07), verificado en producción | — | — |
| 26 | Resend — falta configurar SPF (MX+TXT en Namecheap) | Infra | 🟡 **Sigue pendiente** — es configuración DNS externa, no verificable ni resoluble por código | Medio | S |
| 27 | Checklist "alta convicción" (Maestra, lote 0.10/Aire, suelo protector) | Web | ❌ **No implementado** — pendiente de hoy (26/08), sin código todavía | Medio | M |
| 28 | Captura automática + vínculo Diario (Fase 2/3) | EA/Web | 🟡 **Parcial** — Fase 1 (tabla `trade_eventos`, endpoint, EA modificado) cerrada 08/08; el vínculo real imagen↔trade en el Diario **no existe**: `diario_entradas` no tiene columnas `fp` ni de imagen, confirmado por SQL el 08/08 | Alto | L |
| 29 | Causa raíz Token/EaPassword desincronizado | EA/Infra | ❌ **Sin causa raíz** — 4ª vez documentada (01/08, 05/08, 08/08, 26/08) sin diagnóstico confirmado | Alto | M |

---

## Posibles bloqueantes no documentados

Encontrados hoy durante el barrido de código, ninguno en la lista de pendientes conocidos ni en `docs/BUGS.md` activo:

1. **`app.js:61` — `animal: animalMap[u.pack] || '✦'`.** El animal mostrado en salas/badges se deriva del **pack comprado**, no del animal elegido de verdad en el onboarding. Dos usuarios con el mismo Camino comparten el mismo animal asignado sin importar su elección real. Documentado en `PLAN_CORAZON_DATOS.md` (19/07) como "sigue roto", confirmado hoy que sigue exactamente igual. **Impacto: medio — afecta identidad de comunidad/salas.**

2. **4 botones muertos en `index.html` sin función real en ningún `.js`** (confirmado hoy con grep en todo el repo):
   - Modal "Agendar disponibilidad": `abrirAgenda()`, `cerrarAgenda()`, `seleccionarSesion()`, `guardarAgenda()`
   - Modal info "Animal": `abrirAnimal()` / `cerrarAnimal()`
   - Modal info "Etapa": `abrirEtapa()` / `cerrarEtapa()`
   - `cerrarJitsi()` — resto muerto de la migración a LiveKit
   Un usuario real puede pulsar cualquiera de estos y no pasa nada, sin aviso. **Impacto: medio — experiencia de usuario rota, silenciosa.**

3. **Tercer array de etapas divergente en `evalua.js:177`.** `['Inicio','Disciplina','Despertar','Simulador','Rentable','✦ Oro']` — 6 nombres que no coinciden ni con el canon de `docs/ARQUITECTURA.md` (10 etapas) ni con el array ya desincronizado de `gestion.js` (punto #3 de la tabla). Hay **tres** listas de etapas distintas conviviendo en el sistema. Esto no estaba documentado como una divergencia de 3 vías en ningún sitio.

4. **`EA_EVENTOS_SECRET` nunca se creó.** `api/trade-evento.js` sigue validando contra `EA_SHARED_SECRET`, el mismo secreto que usa `api/trade-mt5.js` para el flujo de trades — decidido posponer el 08/08, confirmado sin hacer el 23/08. Riesgo: cualquier rotación futura del Token afecta a ambos endpoints a la vez, sin aislamiento.

5. **Trigger `prevenir_cuenta_ajena` y políticas RLS de admin corregidas — sin versionar en el repo.** Aplicadas directamente en Supabase (25/07 y 23/08 respectivamente), sin ningún `.sql` en el repo. Ya causó una pérdida real una vez (el trigger desapareció sin que nadie se enterara entre el 19/07 y el 25/07) — el mismo patrón de riesgo sigue sin corregirse de raíz.

6. **`rr_minimo` (tipo de condición de reto) confirmado sin construir**, y **`wr_minimo` confirmado mal diseñado sin rediseñar** — ambos verificados en 3 sesiones distintas (19/07, 23/08) sin cambios.

7. **Willian con `tiene_ea=true` pero sin `ea_password`** — dato suelto en Supabase, sin decidir si se le desmarca. No bloqueante hoy (su EA no está activo de verdad) pero es exactamente el tipo de discrepancia que ya causó incidentes de autenticación del EA.

---

## Recomendación de orden de trabajo

Priorización propia, razonada por qué bloquea qué — no por el orden en que llegaron los pendientes:

### 1. Causa raíz Token/EaPassword (pendiente #29) — primero de todo
Es el único pendiente que ya ha costado **4 incidentes documentados en producción** con datos reales en riesgo (eventos del EA rechazados, cola de reintentos acumulando credenciales viejas). Cada vez que se repite, hay que rotar secretos, corregir manualmente credenciales y reenviar eventos atascados a mano — trabajo reactivo repetido, no una vez arreglado. Antes de construir nada nuevo sobre el EA (Fase 2/3 del Diario, checklist de alta convicción integrada con datos del EA), vale la pena invertir una sesión dedicada solo a instrumentar el problema (logging de cuándo se vacía el campo `Token`, confirmar de una vez si `EA_SHARED_SECRET` queda o no como "Sensitive" tras guardarlo) en vez de seguir apagando el síntoma cada 2-3 semanas.

### 2. Los 3 bugs de datos ya confirmados y con fix acotado (badge cuenta, sidebar etapas, distribución por tipo)
Los tres (#2, #3, #20 de la tabla) están **confirmados en código, con la línea exacta identificada**, y son fixes pequeños (S/M) sin dependencias entre sí ni con nada más de esta lista. Es el trabajo de "cerrar deuda barata" antes de abrir nada grande — mismo patrón que ya funcionó bien en sesiones anteriores (el barrido del WR ambiguo, 12 sitios en un día). Dentro de este grupo, el sidebar de etapas (#3) es el más urgente de los tres porque además tiene un tercer array divergente en `evalua.js` (hallazgo #3 de bloqueantes) — mejor unificar los tres arrays de una vez que arreglar `gestion.js` y descubrir la discrepancia de `evalua.js` en una sesión aparte más adelante.

### 3. Los 3 pendientes de hoy (26/08), en este orden interno:
   - **Checklist de alta convicción** primero — es la pieza más autocontenida (no depende del EA ni de nada roto), y es lo que más impacta el día a día de trading real de Roderas.
   - **Captura automática + vínculo Diario (Fase 2/3)** después — pero solo si el punto 1 (causa raíz Token) ya está resuelto o al menos monitorizado, porque esta fase depende de que el EA siga mandando eventos de forma fiable a `trade_eventos`. Construir sobre una fuente de datos que se rompe cada 2-3 semanas sin causa conocida es repetir el mismo patrón de riesgo.

### 4. Deuda de infraestructura no versionada (trigger, RLS, `EA_EVENTOS_SECRET`)
Ninguno de estos bloquea trabajo activo hoy, pero **ya causaron una pérdida real una vez** (el trigger perdido sin registro). Es barato de arreglar (dejar los `.sql` ya aplicados versionados en el repo, crear la variable de entorno separada) y reduce directamente el riesgo de que la próxima auditoría tenga que volver a redescubrir lo mismo por tercera vez.

### 5. Los 4 botones muertos del HTML
Bajo impacto real (nadie ha reportado usarlos), pero es la corrección más barata de toda la lista — o se implementan las 3 features (agenda, info-animal, info-etapa) o se borran los botones. Vale la pena resolverlo en la misma sesión que se toque `index.html` por cualquier otro motivo, no como sesión dedicada.

### 6. `docs/BUGS.md` — fusionar/actualizar
Antes de la próxima auditoría completa, vale la pena vaciar `docs/BUGS.md` de todo lo que `PLAN_CORAZON_DATOS.md` ya confirma resuelto y dejarlo con solo lo que sigue vivo — el patrón de "dos documentos de bugs divergentes" ya causó confusión una vez (sesión 19/07) y `BUGS.md` lleva 2 meses sin tocarse mientras el trabajo real seguía documentándose solo en `PLAN_CORAZON_DATOS.md`.

### Todo lo demás (marketing: descuento lanzamiento, Camino VIP, tema oscuro, Daily.co/LiveKit, contador OZT admin, notificación trade 1111, ajuste manual de profit, Resend SPF)
Son features nuevas o de producto/infra sin dependencias técnicas entre sí ni con el resto de la lista — se abordan cuando haya capacidad, en el orden que decida Roderas por prioridad de negocio, no por lo que este barrido pueda opinar técnicamente.

**Nota sobre Daily.co (#22):** antes de tratarlo como pendiente, merece una decisión explícita — ¿se sigue queriendo Daily.co específicamente, o LiveKit (ya en producción, con seguridad verificada) cubre la necesidad y el ítem se puede cerrar de la lista?
