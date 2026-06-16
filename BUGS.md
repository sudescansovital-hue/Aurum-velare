# AURUM VELARE — Estado real del proyecto
> Última actualización: 14 de junio de 2026  
> Generado leyendo el código real del repo

---

## 🎯 OBJETIVO INMEDIATO
Flujo mínimo para abrir a tráfico real:
**Registro → Evalúame (33€) → subir historial → ver informe → CTA comprar Camino**

---

## ✅ HECHO Y FUNCIONA — confirmado en código

| Qué | Dónde | Notas |
|---|---|---|
| Registro (email + nick + animal) | `app.js hacerRegistro()` | Supabase Auth + RPC `registrar_nuevo_usuario` + verificación email obligatoria |
| Login / logout completo | `app.js hacerLogin() / hacerLogout()` | Verifica email_confirmed_at antes de dejar entrar |
| Sesión persistente en localStorage | `auth.js loadStoredSession()` | Token `aurum_session_v12` |
| Onboarding post-registro | `app.js _destinoLogin()` | Si no tiene `animalSala` → va a `onboarding`. Existe la página y `guardarOnboarding()` |
| Bloqueo páginas privadas | `app.js irA()` | `PAGINAS_PRIVADAS = ['dashboard','gestion','admin','onboarding']` — sin sesión → redirige a packs |
| Trade Record completo | `visitas.js + gestion.js` | Global, Maestra, Retos, Prueba — métricas, ciclos, horarios, equity, cumplimiento |
| Badge cuenta en buildGlobal() | `visitas.js línea 260` | `_setBadge()` se llama en `buildGlobal()` para las 3 cuentas a la vez — **FUNCIONA en vista global** |
| Parser MT5 | `parser.js _parsearMT5()` | Detecta por celda "Posiciones", deduplica por posición ID |
| Parser cTrader | `parser.js _parsearCtrader()` | Agrupa cierres parciales por clave apStr+dir+pe |
| Subida historial → carpeta automática | `historial.js histSubir()` | Detecta número → CUENTAS_AURUM → Maestra/Retos/Prueba/Externa |
| OZT calculado dinámicamente | `gestion.js buildDashboardHero()` | Fórmula: ciclos×10 + evaluaciones×50 + etapa×30 + comprados - gastados |
| Etapas array correcto | `gestion.js buildDashboardHero()` | ETAPAS[0-11]: Descubrimiento/Silencio/Umbral/Estructura/Fractura/Claridad/Consistencia/Confianza/Paciencia/Rentabilidad/Vuelo/✦Oro |
| Días en proceso | `gestion.js buildDashboardHero()` | Usa `fecha_entrada` de `usuarios_aurum` — correcto |
| Salas con LiveKit | `salas.js` | Integrado y funcionando. Audio y screen sharing pendiente prueba con usuarios reales |
| Panel admin | `admin.js` | Gestión usuarios, etapas, asignación cuentas |
| Reasignación cuentas admin | `admin.js` | Revocación OK · Asignación con fix de dos pasadas aplicado |
| Flujo Evalúame completo | `evalua.js` | Paso 1 pago → paso 2 código → zona subida → análisis con informe completo |
| Códigos demo para probar sin Stripe | `evalua.js CODIGOS_VALIDOS` | `AURUM-EVAL-DEMO-2026` funciona ahora mismo |
| RLS activado | Supabase | `trades`, `historiales`, `usuarios_aurum` protegidas |

---

## 🔴 BUGS CONFIRMADOS EN CÓDIGO

| # | Dónde | Qué falla | Por qué | Fix |
|---|---|---|---|---|
| B1 | `index.html #page-evalua` | **Cruz para cerrar no existe en HTML** — se añade como parche JS pero se pierde. | `page-evalua` no tiene ningún `✕` en el HTML, solo se añadió via JS en alguna sesión | Añadir como primera línea dentro de `#page-evalua`: `<div onclick="irA('inicio')" style="position:fixed;top:1.2rem;right:2rem;cursor:pointer;color:var(--text-muted);font-size:20px;z-index:200;opacity:.6;">✕</div>` |
| B2 | `evalua.js simularPago()` | **Stripe no conectado** — botón llama a `simularPago()` que muestra modal demo | Nunca se conectó Stripe real | Conectar Stripe Checkout o Payment Link |
| B3 | `visitas.js _setBadge()` | **Badge muestra siempre "Challenge"** en vistas individuales (Maestra/Retos/Prueba) | `_setBadge()` tiene la lógica hardcodeada: solo `maestra` = Real, todo lo demás = Challenge. Retos y Prueba deberían ser Challenge pero el problema es que también aparece en Global antes de que se llame individualmente | Revisar si el badge en vista individual buildCuentaReal() llega bien — parece que sí llama `_setBadge(cuenta)` en línea 171. **Verificar en producción antes de tocar** |
| B4 | `app.js _activarSesion()` | **`pack` y `animal` mezclados** — `animalMap` usa la clave `pack` para asignar el emoji del animal (`umbral→🐝`, `raiz→🌱` etc.) en lugar del campo `animal` real del usuario | Al registrarse se guarda el animal elegido en `usuarios_aurum.animal` pero `_activarSesion` lo ignora y usa `u.pack` para el emoji | Cambiar línea 61: `animal: u.animal || '✦'` en lugar de `animalMap[u.pack]` |
| B5 | `app.js irA()` | **`evalua` no está en PAGINAS_PRIVADAS** pero tampoco tiene control de acceso propio — cualquiera puede ver el Trade Record si llega a `page-evalua` directamente | `PAGINAS_PRIVADAS = ['dashboard','gestion','admin','onboarding']` — evalua no está | Evaluar si el Trade Record en evalúame está separado del Trade Record de gestion (parece que sí, es `evalua.js` independiente) — **verificar qué ve el usuario con código demo** |
| B6 | `tablillas.js init_dashboard()` | **Historial etapas hardcodeado** — fechas y etapas completadas son datos falsos hardcodeados | `etapasCompletadas` tiene fechas fijas de febrero-mayo 2026 que no vienen de Supabase | Conectar a tabla de etapas real o eliminar el bloque hasta que exista la tabla |
| B7 | `app.js irA()` | **`evalua` redirige a `packs` sin sesión** — un visitante que quiere evaluarse necesita registrarse primero aunque la evaluación debería ser pública | `irA('evalua')` no está en PAGINAS_PRIVADAS pero... comprobar si page-evalua aparece sin login | **Verificar en producción** — puede no ser bug si la página es accesible |
| B8 | `utils.js solicitarPack()` | **Ningún Camino tiene pago real** — `solicitarPack()` solo muestra un toast o abre el login | Stripe nunca implementado para Caminos | Pendiente |
| B9 | `admin.js` | **Botón activo/inactivo Mara no funciona** | Reportado en sesión jun 14, no investigado aún | Investigar en próxima sesión |
| B10 | `gestion.js buildCumplimiento()` | **SL en cTrader con valores imposibles** (343 puntos) | Parser cTrader guarda el SL del archivo sin validar si es un precio absoluto o puntos relativos | Validar SL: si `sl > 50` puntos desde precio entrada → descartar |

---

## ⚠️ PENDIENTE DE IMPLEMENTAR — no existe en código

| Qué | Estado |
|---|---|
| Stripe real para evaluación 33€ | Solo `simularPago()` — modal demo |
| Stripe para Caminos (Umbral/Raíz/Senda/Cima) | Solo toast "en producción..." |
| Pantalla post-registro con contexto | El usuario ve el onboarding de animal pero luego aterriza en dashboard sin explicación |
| Modo evaluación limitado (sin Trade Record completo) | Evalúame usa su propio `evalua.js` — parece separado, pero no verificado |
| Panel OZT admin por usuario | No existe |
| Notificación al llegar al trade 1111 | No existe |
| Flujo reasignación 777 OZT | No existe |
| Retos activos desde Supabase en dashboard | `tablillas.js` llama `cargarRetosActivos()` pero los 2 retos del dashboard principal pueden estar hardcodeados |
| SEO (meta tags, robots.txt, sitemap) | No existe |
| Páginas legales | No existen |
| Descuento 70% lanzamiento | No implementado |
| Campo ajuste manual profit fases challenge (admin) | No existe |

---

## 📋 ORDEN DE TRABAJO — por prioridad real

### Para poder abrir (flujo mínimo)
1. **B1** — Cruz cerrar evalúame en HTML (5 min, instrucción lista arriba)
2. **B4** — Fix animal emoji en `_activarSesion()` (1 línea)
3. Probar flujo completo con código demo `AURUM-EVAL-DEMO-2026`
4. Conectar Stripe evaluación 33€
5. Verificar qué ve usuario con código eval — ¿solo informe o Trade Record completo?

### Estabilidad
6. **B6** — Quitar historial etapas hardcodeado de `tablillas.js`
7. **B10** — Fix SL cTrader
8. **B9** — Investigar botón activo/inactivo Mara
9. Retos desde Supabase en dashboard

### Negocio
10. Stripe Caminos
11. SEO y legales
12. Panel OZT admin
13. Flujo reasignación 777 OZT

---

## 🔧 REFERENCIA RÁPIDA

**Archivos clave:**
- `app.js` — auth, login, registro, navegación, `irA()`, `_activarSesion()`
- `auth.js` — SESSION, signIn, signOut, loadStoredSession, getToken
- `visitas.js` — Trade Record visitante/sin pack, `_setBadge()`, `buildGlobal()`, `buildCuentaReal()`
- `gestion.js` — Trade Record completo, dashboard hero, ciclos, OZT, retos, diario
- `evalua.js` — flujo evaluación 33€ completo e independiente
- `historial.js` — subida y parseo de historiales
- `parser.js` — MT5 y cTrader, lógica de detección y agrupación
- `admin.js` — panel admin, reasignación cuentas
- `salas.js` — LiveKit, chat sala
- `supabase.js` — cliente fetch nativo, supaGet/Post/Patch/Delete
- `index.html` — toda la estructura, modales, páginas

**Código demo evalúame:** `AURUM-EVAL-DEMO-2026`

**Deploy:** `npx vercel --prod` desde `C:\Users\boli-\aurum-web-base`  
**vercel.json** — tiene cleanUrls y headers de seguridad, no rompe el deploy  
**GitHub token** caduca cada 7 días

---

## 🧪 CUENTAS

| Email | Usuario | Rol | Estado |
|---|---|---|---|
| roderastrader@gmail.com | Willian | Admin / Águila | Producción |
| sudescansovital@gmail.com | Roderas | León · Etapa 3 | 537 trades reales |
| boli-al@hotmail.com | Mara | Hormiga | Testing |
