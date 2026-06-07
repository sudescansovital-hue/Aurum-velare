# AURUM VELARE — Arquitectura Web
> Documento vivo. Se actualiza con el proyecto.  
> Última actualización: 7 de junio de 2026  
> Para uso interno — contexto de desarrollo y nuevas sesiones de trabajo.

---

## Qué es Aurum Velare

Sistema web de acompañamiento para traders de XAU/USD. No es una academia ni un servicio de señales. Es un entorno donde el trader construye su propio proceso con datos reales, en entorno simulado, acompañado de una comunidad organizada por perfiles (animales) y avanzando por etapas ganadas con datos, no con tiempo.

**Stack:** HTML + CSS + JS vanilla · Supabase (auth + base de datos) · Dominio: aurumvelare.com  
**Repo:** sudescansovital-hue/Aurum-velare (rama: main)  
**Local:** C:\Users\boli-\aurum-web-base  
**Supabase:** rsrbxcvlnbwpiyhumqmt.supabase.co  
**Tablas:** trades · historiales · usuarios_aurum

---

## Vocabulario — usar siempre estos términos

| Término | Definición |
|---|---|
| **Camino** | El acceso que compra un usuario. Nunca "pack" ni "membresía". Tipos: Umbral (77€) · Raíz (111€) · Senda (222€) · Cima (333€) |
| **Navegador** | Barra superior con enlaces de sección |
| **Sala** | Espacio de comunidad. Cada animal tiene la suya. Hay salas abiertas y sala privada por invitación del Águila |
| **Historial** | Archivo CSV de operaciones importado desde MT5/cTrader |
| **Trade Record** | Tracker personal del usuario — análisis de sus datos de trading |
| **Carpeta de cuenta** | Cada usuario tiene exactamente 4: Maestra · Retos · Prueba · Externa |
| **Historial Externo** | Carpeta "Externa" — agrupa todos los historiales que no son Maestra/Retos/Prueba |
| **Ciclo 111** | Bloque de 111 trades. Unidad de medida del proceso Aurum |
| **Etapa** | Nivel de progreso del usuario (0 a 11). Se gana con datos reales |
| **Animal** | Perfil de trader: Águila · Hormiga · León · Elefante · Oso · Toro · Lobo |
| **OZT** | Moneda interna. Se gana en retos/ciclos/etapas o se compra. Se usa para resetear cuentas o entrar en retos especiales |
| **Tablillas** | Sección filosófica inspirada en el Camino de Santiago |
| **V1** | Funcionalidad actual o en desarrollo inmediato |
| **V2** | Funcionalidad futura — requiere planificación o coste adicional |

---

## Usuarios del sistema

| Email | Usuario | Rol |
|---|---|---|
| roderastrader@gmail.com | Willian | Admin / Águila |
| sudescansovital@gmail.com | Roderas | León · Etapa 7 · Proceso real |
| boli-al@hotmail.com | Mara | Hormiga · Pruebas |

---

## Tipos de usuario y accesos

| Tipo | Acceso |
|---|---|
| **Visitante** | Sin registro. Ve: Inicio, El Proceso, Tablillas, vista previa de Salas, Evalúame |
| **Usuario con Camino** | Acceso completo a Salas, Trade Record, Mi Proceso, Mi Gestión |
| **Usuario con Camino Cima** | Igual que anterior + todas las salas sin límite de animal |
| **Admin — Águila** | Acceso total. Panel admin, etapas, retos, eventos, salas privadas |

**Bloqueo páginas privadas:** Mi Proceso y Mi Gestión aparecen en el navegador para todos. Sin Camino → mensaje: *"Necesitas un Camino para acceder a esta sección."*

---

## Páginas — índice

1. INICIO — público
2. EL PROCESO — público
3. LAS SALAS — vista previa pública · interior requiere Camino
4. ✦ EVALÚAME — público para evaluación · privado para Trade Record
5. TABLILLAS — público
6. MI PROCESO — privado · requiere Camino
7. MI GESTIÓN — privado · requiere Camino

---

## PÁGINA 1 — INICIO

**Acceso:** Público  
**Estado V1:** Funciona — revisar CTA y nomenclatura

### Bloques de contenido

- **B1 — Hero:** "Trading XAU/USD con proceso real." + subtítulo + 2 botones CTA
- **B2 — Qué es Aurum:** Texto filosófico + cita
- **B3 — Los 7 animales:** Águila · Hormiga · León · Elefante · Oso · Toro · Lobo — cada uno con valores y enlace "Leer su historia"
- **B4 — Las etapas:** 0=Descubrimiento · 1=Silencio · 2=Umbral · 3=Estructura · 4=Fractura · 5=Claridad · 6=Consistencia · 7=Confianza · 8=Paciencia · 9=Rentabilidad · 10=Vuelo · 11=✦Oro
- **B5 — El marco:** Hasta etapa 5 lo define Aurum. A partir de etapa 5 lo construye el trader
- **B6 — Historia de Roderas:** En proceso desde 2018. CTA reflexivo
- **B7 — Acceso por tandas:** Modelo de acceso limitado + formulario "Apuntarme"

### Pendiente
- → Cambiar "Ver los Packs" por "Ver los Caminos" en botones CTA
- → Decidir si animales y etapas se quedan aquí o se mueven a El Proceso
- → Inicio es la página más importante para SEO — no eliminar contenido sin valorar impacto

---

## PÁGINA 2 — EL PROCESO

**Acceso:** Público  
**Estado V1:** Base sólida — ampliar contenido

### Bloques de contenido

- **B1 — Cómo funciona:** 4 pasos: Evaluación → Datos → Estructura → Evolución por etapas
- **B2 — Los Caminos:**
  - Umbral · 77€ · 22 días · Al vencer: 24h con 10% descuento en cualquier Camino
  - Raíz · 111€ · Pago único · El inicio real
  - Senda · 222€ · Pago único · Más elegido · Incluye análisis de cumplimiento mensual automático
  - Cima · 333€ · Pago único · Todas las salas sin límite de animal
- **B3 — Sistema OZT:** Cómo se ganan, para qué sirven
- **B4 — CTA Evalúame:** Llamada a evaluación antes de entrar

### Contenido incluido en todos los Caminos
- 3 cuentas MT5 simuladas (Maestra · Retos · Prueba)
- Mi Proceso y Mi Gestión
- Sala de su animal
- Retos con OZT

### Pendiente
- → Cambiar "pack" por "Camino" en todos los textos

---

## PÁGINA 3 — LAS SALAS

**Acceso:** Vista previa pública · Interior requiere Camino  
**Estado V1:** Revisar lógica de acceso

### Lógica de acceso
- **Sin Camino:** Ve todas las salas con estado (En vivo / Cerrada) pero NO puede entrar
- **Con Camino:** Entra a su sala de animal + salas abiertas + extras asignadas por el Águila
- **Con Camino Cima:** Entra a todas las salas sin restricción

### Salas del sistema
| Sala | Estado | Notas |
|---|---|---|
| Hormiga | Cerrada | Disciplina · Repetición |
| Oso | Cerrada | Paciencia · Protección |
| Toro | Cerrada | Expansión · Momentum |
| Elefante | Cerrada | Memoria · Control emocional |
| León | En vivo | Presencia · Convicción |
| Lobo | Cerrada | Instinto · Adaptación |
| Sala Abierta | En vivo | Todos los animales · Todos los Caminos |
| Sala Evento | Cerrada | Convocatorias del Águila con fecha/hora |
| Sala Privada | Por código | Acceso dado por el Águila con código |

### Navegación entre salas
- **Navegador superior LAS SALAS:** muestra todas las salas a cualquier visitante
- **Menú izquierdo Mi sala** (dentro de Mi Proceso): muestra todas las salas + privadas asignadas
- **Botón "Entrar a la sala"** en Mi Proceso: acceso directo a la sala del animal del usuario

### Tecnología
- V1: audio + pantalla compartida
- V2: videollamada completa con cámara (como Zoom pero dentro de Aurum)

---

## PÁGINA 4 — ✦ EVALÚAME

**Acceso:** Público para evaluación · Privado (requiere Camino) para Trade Record  
**Estado V1:** Bugs activos en subida de historiales

### Vista pública — Evaluación 33€
- Mínimo 111 trades en XAU/USD
- Análisis: win rate · R/R · esperanza · horas · lotajes · cumplimiento
- Resultado: etapa Aurum recomendada + veredicto personal
- Los 33€ se descuentan si entra al proceso en las 6h siguientes
- Pago por Stripe · código por email inmediatamente

### Vista privada — Trade Record (usuarios con Camino)

#### Las 4 carpetas fijas por usuario
Cada usuario tiene EXACTAMENTE estas 4 carpetas. El sistema asigna cada historial subido automáticamente:

| Carpeta | Descripción |
|---|---|
| **Maestra** | Cuenta principal del proceso. Una sola |
| **Retos** | Cuenta de retos OZT. Una sola |
| **Prueba** | Cuenta de prueba/challenge. Una sola |
| **Externa** | Agrupa TODOS los historiales externos (challenges anteriores, brokers, cuentas perdidas). Sin límite de archivos pero sin duplicados. Una sola carpeta |

#### Pestañas — comportamiento contextual
Las pestañas NO cambian. Cambian los datos según la cuenta seleccionada. Vista Global = todas las cuentas juntas.

| Pestaña | Qué muestra |
|---|---|
| **TRADE RECORD** | Vista global: resumen Global + Maestra + Retos + Prueba. Comparativa por tipo de trade. Patrones comunes. Al clicar en cuenta → las demás pestañas se actualizan |
| **CICLO 111** | Ciclo actual y anterior. Progreso visual trade a trade. WR · P&L · R/R · Esperanza · Cumplimiento · Puntuación C1 · Veredicto Aurum automático |
| **HORARIOS** | Mapa horario con sesiones (Asia/Londres/NY). WR por hora en colores (verde ≥70% · ámbar 50-70% · rojo <50%). Patrones detectados |
| **EQUITY** | Curva de equity acumulada. Desglose mensual |
| **CUMPLIMIENTO** | % trades dentro/fuera del método. Distribución SL (Edge/Aire/Límite/Fuera). Lectura Aurum mensual automática. **Campo de anotación — mantener** |
| **ESTADÍSTICAS** | Racha · Drawdown · Mejor/Peor trade · TP alcanzado · Revenge trading detectado · Veredicto del inversor |
| **DIARIO** | Diario personal del proceso. Solo lo ve el usuario. Nueva entrada + historial de entradas |
| **HISTORIAL EXTERNO** | Lista de todas las cuentas subidas con métricas. Elimina duplicados automáticamente |

#### Pendiente V1
- → Quitar "Nueva entrada" de: Trade Record · Ciclo 111 · Horarios · Equity · Estadísticas · Historial Externo
- → Mantener campo de anotación solo en Cumplimiento
- → Diario: mantener estructura V1 · evaluar servidor dedicado para V2

#### V2 — Diario avanzado
- ⚪ Diario unido al calendario personal del usuario
- ⚪ Anotaciones con imágenes adjuntas
- ⚪ Sistema inteligente que detecta las mejores reflexiones automáticamente
- ⚪ Diferenciación de precio en Caminos para cubrir coste de almacenamiento

---

## PÁGINA 5 — TABLILLAS

**Acceso:** Público — abierto a todos  
**Estado V1:** Funciona — pendiente integración social

### Qué es
Página filosófica inspirada en el Camino de Santiago (~1 km del hogar de Roderas). Preguntas grabadas sin nombre ni respuesta. Separada del proceso de trading — es sobre el proceso de vida que rodea al trading.

### Bloques
- **Hero:** "No buscamos respuestas. Buscamos mejores preguntas."
- **Las que quedaron:** Selección de preguntas publicadas por Aurum
- **Tu pregunta — Digital:** Cualquier visitante envía su pregunta (máx 280 chars). Aurum revisa. Si resuena, la publica. Gratuito. Email opcional para aviso
- **Tu tablilla — Física:** Pregunta grabada en madera con láser. Se lleva al Camino o se queda. Envío incluido

### Lógica
- No se publican todas — solo las seleccionadas por el Águila (moderación manual)
- Las preguntas enviadas se guardan para revisión

### Pendiente
- → Integración con red social (X / Instagram) para difusión automática
- → Precio y proceso de pedido para tablilla física
- → Decidir mecanismo de moderación: ¿email al admin? ¿panel en la web?

---

## PÁGINA 6 — MI PROCESO

**Acceso:** Privado — requiere Camino activo  
**Estado V1:** Funciona — lógica de etapas pendiente

### Dashboard principal
- Bienvenida con nombre + fecha de inicio
- Métricas: Trades totales · Win Rate global · P&L acumulado · Días en proceso
- Nivel actual + % hacia siguiente etapa
- Ciclo actual + trades completados de 111
- OZT acumulados + retos completados
- Sala activa del animal con estado y botón Entrar
- Retos activos (equipo + individuales) con progreso

### Menú izquierdo — navegación interna
| Botón | Destino |
|---|---|
| Mi proceso | Dashboard principal |
| Mi sala | Todas las salas del sistema (puede entrar a las que tiene acceso) |
| Mi gestión | Trade Record completo |
| Calendario | Eventos Aurum + disponibilidad del usuario |
| Retos | Retos activos + completados + ranking de sala |
| OZT | Saldo · usos · tienda |

### Panel derecho
Ranking de sala por OZT — siempre visible

### Etapas
0=Descubrimiento · 1=Silencio · 2=Umbral · 3=Estructura · 4=Fractura · 5=Claridad · 6=Consistencia · 7=Confianza · 8=Paciencia · 9=Rentabilidad · 10=Vuelo · 11=✦Oro

### Pendiente V1
- → Lógica de etapas: contenido diferente según etapa (usuarios en etapas bajas solo ven Trade Record e Historial Externo)
- → Admin debe poder asignar/editar etapa desde panel admin

### V2 — Calendario personal
- ⚪ Calendario personal separado del calendario de Aurum — para registro visual de entradas y sesiones
- ⚪ Unido al Diario del proceso

---

## PÁGINA 7 — MI GESTIÓN

**Acceso:** Privado — requiere Camino activo  
**Nota:** Es el Trade Record completo. Ver documentación detallada en PÁGINA 4 — sección Vista privada.

---

## 🔴 BUGS ACTIVOS

| # | Bug | Impacto |
|---|---|---|
| 1 | Parser cTrader no testeado | No se puede verificar que los historiales se importen bien |
| 2 | Al subir historial aparece Challenge/Demo en lugar de Maestra/Retos/Prueba/Externa | Los datos se asignan a la carpeta incorrecta |
| 3 | ~~Aparece entrada "(sin cuenta)" — el sistema no asigna la carpeta al subir~~ **✅ RESUELTA** | — |
| 4 | Saldo OZT muestra 0 disponibles con 247 en histórico | El cálculo disponible = histórico - gastado está roto |
| 5 | Sección Retos no muestra historial completo | El usuario no ve todos sus retos completados |
| 6 | Verificar Ciclo111/Horarios/Equity/Cumplimiento contra historial externo real | Posibles datos incorrectos en el Trade Record |

---

## Prioridades técnicas

### 🔴 Urgente
1. Testear parser cTrader
2. Corregir asignación de carpeta al subir historial (Maestra/Retos/Prueba/Externa)
3. Corregir cálculo saldo OZT disponible
4. Historial completo en sección Retos

### 🟡 Importante
5. Verificar datos Trade Record contra historial real
6. Mensaje de bloqueo correcto en Mi Proceso y Mi Gestión sin Camino
7. Cambiar "pack" → "Camino" y "Ver los Packs" → "Ver los Caminos" en toda la web
8. Quitar "Nueva entrada" de pestañas que no lo necesitan
9. Actualizar lógica interna que use claves de etapa antiguas (e0,e05,e1...e5) a nuevas (e0-e11)

### ⚪ Backlog
10. Panel admin: gestión de cuentas, numeración, asignación de etapas
11. Lógica de etapas: contenido diferente por etapa (ahora 12 etapas, 0–11)
12. Sala privada: acceso por código del Águila
13. Tablillas: integración con red social
14. Tablilla física: proceso de pedido y envío
15. SEO · páginas legales · Stripe/desistimiento
16. Subida de 3 historiales pendientes de Roderas

---

## ESTADO HOY — 07/06/2026

### Completado en esta sesión

**Sistema de etapas — migración a integers (e0–e11)**
- Grid de etapas rediseñado en `index.html` (ambos repos):
  - Fila superior full-width: **0 — Descubrimiento**
  - Dos filas de 5 columnas: e1–e5 · e6–e10
  - Fila inferior full-width: **11 — ✦ Oro**
  - Añadida etapa **8 — Paciencia** entre Confianza y Rentabilidad
- `ETAPAS_DATA` actualizado en `aurum-web-base/index.html`, `aurum-web-v1/index.html` y `aurum-web-v1/js/datos.js`:
  - Claves antiguas (e0,e05,e1,e15,e2,e25,e3,e7,e4,e45,e5) → claves nuevas (e0–e11)
  - Nums enteros 0–11 (antes decimales 0–5)
  - Contenido (body/cita) preservado y reasignado correctamente
  - Cita de Oro actualizada: "cinco" → "once"
- `select#admin-edit-etapa` actualizado a las 12 etapas enteras (0–11)
- Bug #3 resuelto: entrada "(sin cuenta)" corregida

**Estructura repos**
- `aurum-web-v1`: módulos JS migrados desde base y organizados en `pages/` y `js/`
- Rutas `<script src>` en `index.html` actualizadas para estructura v1
- Ambos repos pusheados a GitHub (main)

### Estado actual por repo

| Repo | Branch | Último commit |
|---|---|---|
| sudescansovital-hue/Aurum-velare | main | feat: actualizar ETAPAS_DATA a claves e0-e11 |
| sudescansovital-hue/aurum-web-v1 | main | feat: actualizar ETAPAS_DATA a claves e0-e11 |

---

## Datos — Supabase

| Tabla | Qué guarda |
|---|---|
| trades | Operaciones individuales por usuario |
| historiales | Historiales subidos agrupados por carpeta y usuario |
| usuarios_aurum | Perfil: nombre · animal · etapa · Camino · fecha inicio · OZT |

### Qué se guarda y qué no
- ✓ SÍ: trades · historiales · perfil de usuario · OZT · entradas de diario (V2)
- ✓ SÍ: preguntas de Tablillas enviadas para revisión
- ✗ NO: páginas estáticas (Inicio · El Proceso · estructura de Salas)
- ✗ NO (por ahora): tablillas publicadas — son contenido estático gestionado por el admin
