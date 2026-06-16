# AURUM VELARE — Bugs y Prioridades
> Archivo de referencia rápida. Ver ARQUITECTURA.md para contexto completo.  
> Última actualización: 10 de junio de 2026

---

## ✅ Resueltos — 10/06/2026

| # | Dónde | Qué era | Solución aplicada |
|---|---|---|---|
| — | Supabase | RLS no activado en ninguna tabla | RLS activado en `trades`, `historiales`, `usuarios_aurum`. Políticas por rol: admin acceso total, usuario solo sus filas |
| — | admin.js | 4 queries sin JWT (usaban anon key silenciosamente) | Añadido `getToken()` en `cargarUsuariosAdmin`, `adminGuardarUsuario` (x2) y `adminGuardarCodigo` |
| — | app.js | Registro de usuario fallaba con RLS activo | Reemplazado INSERT directo por RPC `registrar_nuevo_usuario` (SECURITY DEFINER) — no necesita token |
| — | historial.js | `histSubir()` asignaba carpeta por desplegable + safety net opaco | Simplificado a 3 líneas: detectar número → `CUENTAS_AURUM[num]` o `'Cuenta Externa'`. El desplegable ya no influye |
| — | gestion.js / app.js | Días en proceso mostraba 101 en lugar del valor correcto | Corregido: usa `fecha_entrada` de `usuarios_aurum` (añadida a `usuarioActual`). Antes derivaba la fecha del campo `fp` de los trades |
| — | historial.js / trades | Trades sin referencia al número MT5 de origen | Añadida columna `cuenta_numero TEXT` a `trades` (SQL: `ALTER TABLE trades ADD COLUMN IF NOT EXISTS cuenta_numero TEXT`). Se guarda al insertar desde `histSubir()` |
| — | admin.js | Reasignación desde admin — revocación | Al quitar número de cuenta, los trades de esa carpeta vuelven a `Cuenta Externa` y se actualiza `historiales`. **Funciona.** |

---

## 🔴 Activo — 10/06/2026

| # | Dónde | Qué falla | Estado |
|---|---|---|---|
| 17 | admin.js · `_reasignarCuentaExterna` | Asignación (poner número nuevo): no encuentra trades si hubo una revocación previa en el mismo guardado | Fix aplicado (dos pasadas: primero todas las revocaciones, luego todas las asignaciones). **Pendiente verificar en producción** |

---

## ✅ Resueltos hoy — 07/06/2026

| # | Dónde | Qué era | Solución aplicada |
|---|---|---|---|
| 2 | Mi Gestión · subida | Tipo de cuenta aparecía como Challenge/Demo | Asignación directa por desplegable `hist-tipo` sin preguntar. Safety net: desplegable gana sobre detección automática si hay conflicto |
| 3 | Mi Gestión · subida | Aparecía entrada "(sin cuenta)" huérfana | Detección de número de cuenta desde filename → lookup en `CUENTAS_AURUM`. Si no coincide → Externa. Nunca huérfana |
| — | Mi Gestión · subida | Duplicados al subir el mismo archivo | check-then-PATCH-or-INSERT por `user_id` + `nombre_archivo` antes de cada INSERT |
| — | Las Salas | Visitante sin sesión podía intentar entrar a sala | `entrarSala()` bloqueada para visitantes. Guard en botón principal y en todos los `onclick` de sala |
| — | Auth | Solo había login, sin registro | Tabs login/registro en el mismo modal. Verificación de email obligatoria al registrarse (Supabase) |

---

## 🔴 Urgente — rompe el sistema

| # | Dónde | Qué falla | Qué debe pasar |
|---|---|---|---|
| 1 | Mi Gestión · subida | Parser cTrader no testeado | Verificar que importa operaciones correctamente |
| 4 | OZT | Saldo disponible = 0 con histórico = 247 | Disponible = histórico total - OZT gastados |
| 5 | Retos | Historial de retos completados incompleto | Mostrar todos los retos completados del usuario |

---

## 🟡 Importante — afecta experiencia

| # | Dónde | Qué hacer |
|---|---|---|
| 6 | Mi Gestión | Verificar Ciclo111 · Horarios · Equity · Cumplimiento contra historial externo real de Roderas |
| 7 | Mi Proceso · Mi Gestión | Sin Camino → mostrar mensaje "Necesitas un Camino para acceder" |
| 8 | Toda la web | Cambiar "pack" → "Camino" y "Ver los Packs" → "Ver los Caminos" |
| 9 | Mi Gestión · pestañas | Quitar "Nueva entrada" de: Trade Record · Ciclo 111 · Horarios · Equity · Estadísticas · Historial Externo. Mantener solo en Cumplimiento y Diario |

---

## ⚪ Backlog — cuando el sistema esté estable

| # | Qué |
|---|---|
| 10 | Panel admin: gestión de cuentas — reasignación asignación pendiente verificar (ver bug #17) · asignación de etapas OK |
| 11 | Lógica de etapas: usuarios en etapas bajas ven solo Trade Record e Historial Externo |
| 12 | Sala privada: acceso por código dado por el Águila |
| 13 | Tablillas: botón compartir en X / Instagram |
| 14 | Tablilla física: proceso de pedido y envío |
| 15 | SEO · páginas legales · Stripe / desistimiento |
| 16 | Subir 3 historiales pendientes de Roderas |

---

## Pendientes urgentes post-sesión 13 Jun 2026
- Cabecera Trade Record muestra P&L incorrecto en Retos (+336$ en cabecera vs -1430$ en detalle) — dos cálculos distintos desincronizados
- Fechas "13 Jun – 13 Jun" en todas las cuentas de Roderas — trades con fp sin fecha (cTrader format)
- Badge Challenge/Real incorrecto en Retos y Prueba
- Admin: mover trades a Externa automáticamente al cambiar número de cuenta — bug conocido, requiere lógica en el save del admin
- Nivel sidebar muestra etapa 03 cuando Mi Proceso puede mostrar diferente

---

## Cuentas del sistema para pruebas

| Email | Usuario | Rol |
|---|---|---|
| roderastrader@gmail.com | Willian | Admin / Águila |
| sudescansovital@gmail.com | Roderas | León · Etapa 3 · proceso real |
| boli-al@hotmail.com | Mara | Hormiga · pruebas |
