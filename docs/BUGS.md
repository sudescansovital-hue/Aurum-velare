# AURUM VELARE — Bugs y Prioridades
> Archivo de referencia rápida. Ver ARQUITECTURA.md para contexto completo.  
> Última actualización: 7 de junio de 2026

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
| 10 | Panel admin: gestión de cuentas, numeración, asignación de etapas por usuario |
| 11 | Lógica de etapas: usuarios en etapas bajas ven solo Trade Record e Historial Externo |
| 12 | Sala privada: acceso por código dado por el Águila |
| 13 | Tablillas: botón compartir en X / Instagram |
| 14 | Tablilla física: proceso de pedido y envío |
| 15 | SEO · páginas legales · Stripe / desistimiento |
| 16 | Subir 3 historiales pendientes de Roderas |

---

## Cuentas del sistema para pruebas

| Email | Usuario | Rol |
|---|---|---|
| roderastrader@gmail.com | Willian | Admin / Águila |
| sudescansovital@gmail.com | Roderas | León · Etapa 3 · proceso real |
| boli-al@hotmail.com | Mara | Hormiga · pruebas |
