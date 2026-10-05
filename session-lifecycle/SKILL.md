---
name: "session-lifecycle"
metadata:
  category: "Workflow"
  tags:
    - sesion
    - ciclo
    - productividad
description: "Workflow de Session Lifecycle: ciclo de sesión completo. Reemplaza 4 skills de sesión."
user-invocable: false
---

# Workflow: Session Lifecycle

## Skills que reemplaza
- `session-closure`
- `session-closure-ritual`
- `context-management`
- `agent-dispatcher`

## Propósito
Gestión del ciclo de vida completo de una sesión de trabajo con IA.

## Cuándo usarlo
- Al iniciar una sesión de trabajo con IA (cargar contexto + memoria)
- Al cerrar una sesión (escribir HANDOFF, memory, CHANGELOG)
- Para spawnear sub-agentes según la tarea (fork vs isolated)
- Para convertir pendientes en tareas accionables y hacer commit del workspace

## Fases

### 1. Inicio - cargar contexto, memoria, handoff del proyecto activo

El inicio de sesión se activa **solo cuando Jose Luis lo pide explícitamente** ("iniciar sesión", "arrancar", "empezar a trabajar", etc.). No correr el ritual de inicio en consultas sueltas.

**Modos de inicio:**

#### A. Inicio con proyecto explícito

Si Jose Luis dice `"iniciar sesión en a11y-fixer"` o similar:

1. Resolver el proyecto por nombre: `node skills/session-context/commands/resume.mjs <nombre>`.
2. Si no existe, ofrecer `session-context:init`.
3. Si existe, mostrar el briefing de `resume` verbatim.
4. Preguntar por el **Session Goal** de hoy.

#### B. Inicio con auto-detección por cwd

Si Jose Luis dice `"iniciar sesión"` y el `cwd` actual está registrado en `session-context`:

1. Detectar el proyecto con `resume.mjs` sin argumento.
2. Mostrar el briefing.
3. Preguntar: `"¿Seguimos en <proyecto> o querés cambiar de proyecto?"`
4. Si Jose Luis quiere otro proyecto → ir al modo A.
5. Si quiere brainstorming sin proyecto fijo → ir al modo C.

#### C. Inicio sin proyecto definido (brainstorming / triage)

Si Jose Luis dice `"iniciar sesión"`, `"brainstorming"`, `"aún no sé en qué proyecto"`, etc.:

1. No correr `session-context:resume` de ningún proyecto.
2. Cargar memoria general: `MEMORY.md`, `memory/YYYY-MM-DD.md` de hoy, lista de proyectos recientes opcionalmente con `session-context:list`.
3. Preguntar: `"¿En qué proyecto trabajamos? ¿O es una sesión general de planificación/brainstorming?"`
4. Definir un Session Goal temporal. No requiere proyecto fijo.

**En todos los modos:**

- Detectar sesión previa no guardada: si el `session_id` actual no existe en `session-context`, avisar: `"La sesión anterior no fue guardada - ¿querés guardarla antes de arrancar?"`.
- **Session Goal:** definir objetivo explícito de la sesión. ¿Qué queremos lograr? ¿Cuál es el criterio de éxito?
- Si el objetivo es difuso, clarificar antes de avanzar. No arrancar sin dirección.

### 2. Dispatcher - spawnear sub-agentes según la tarea:
- **fork**: cuando el sub-agente necesita el transcript actual (ej: continuar una investigación, analizar una conversación)
- **isolated**: cuando es trabajo independiente (ej: buscar issues, leer docs, hacer tareas paralelas sin contexto compartido)

### 3. Ejecución - trabajo principal, decisiones, archivos tocados
- **Mid-session checkpoint:** a mitad de sesión (o al cambiar de tarea), preguntar: "¿Sigo en el camino correcto hacia el objetivo? ¿Necesito ajustar algo?"
- **Commit & Push en Cambios Grandes (Regla Obligatoria):** Cada vez que se complete un cambio grande o hito relevante (nueva feature, refactor, nueva sección, actualización de arquitectura o datos), ejecutar `git add`, `git commit` y `git push` a GitHub inmediatamente para asegurar el progreso y mantener sincronizado el repositorio.
- Si el checkpoint revela desvío, redefinir objetivo o restricciones antes de seguir.

### 4. Guardado - escanear sesión, escribir HANDOFF, memory, CHANGELOG
- Si la sesión tuvo un proyecto asociado, ejecutar `session-context:save` con el resumen de la sesión: `summary`, `leftOff`, `nextSteps`, `decisions`, `blockers`, y `goal` solo si cambió.
- Si fue una sesión sin proyecto (brainstorming/triage), guardar el resumen en `memory/YYYY-MM-DD.md` y no tocar `session-context`.
- Mostrar borrador al usuario para confirmación o edición antes de persistir.
- **Revisar sesiones anteriores del día:** antes de cerrar, leer los archivos `memory/YYYY-MM-DD-*.md` del día para asegurarse de que no hubo sesiones previas que el daily note resumido no capture. No confiar solo en el daily note ni en la memoria.
- **Consolidar archivos sueltos del día:** si hay archivos `memory/YYYY-MM-DD-HHMM.md` (sesiones individuales), moverlos a `memory/archive/`. El daily consolidado `memory/YYYY-MM-DD.md` ya tiene toda la info.
- **Self-reflection obligatoria:** si hubo correcciones de Jose Luis, cambios estructurales, o aprendizajes significativos, registrar en LEARNINGS.md antes de cerrar. No esperar a que Jose Luis pregunte "¿revisamos lecciones?"
- Si se modificó CONTRIBUTING.md, skills, o AGENTS.md, verificar que el cambio esté completo y no falten adaptaciones en skills relacionadas

### 5. Tareas - convertir pendientes en tareas accionables. Crear cron jobs para follow-ups, o escribir en TODO.md del proyecto. No dejar pendientes en el aire

### 6. Commit y Push Final - commit + push del workspace a GitHub (después de HANDOFF y memory, no antes)

## Helper Scripts

Scripts en `skills/session-lifecycle/scripts/`:

| Script | Uso |
|---|---|
| `session-start.sh --project <name> --objective <obj>` | Carga HANDOFF previo y crea/actualiza el log diario en `memory/YYYY-MM-DD.md`. Usar al inicio de sesion con proyecto. |
| `session-end.sh --project <name> --summary <text>` | Genera/actualiza HANDOFF, escribe el guardado en el log diario. Los PRs los revisa Jose Luis manualmente (2026-08-25). Usar al guardar sesion. |

Si la sesion toca scripts de skill del workspace, correr `npm test` antes del commit final.

## Self-Reflection Post-Tarea

Después de tareas significativas (multi-step, debugging, PRs, cambios de config), hacer una pausa rápida de evaluación:

```
CONTEXT: [tipo de tarea]
REFLECTION: [qué noté]
LESSON: [qué haría distinto]
BIASES DETECTED: [sunk cost / anchoring / confirmation / etc. o none]
```

**Cuándo hacerlo:**
- Después de completar una tarea multi-step
- Después de recibir feedback (positivo o negativo)
- Después de fixear un bug
- Cuando notes que tu output podría ser mejor

**Destino:** si es una lección nueva → `docs/LEARNINGS.md`. Si es un patrón que ya existe → actualizar Recurrence-Count.

## WAL Protocol - Write-Ahead Logging
 
**Regla de oro 1 (Memoria):** si es importante recordarlo, ESCRIBILO AHORA - no después. El contexto desaparece. El archivo queda.
**Regla de oro 2 (Sincronización Git & GitHub):** tras cada cambio grande, hito o refactor completado, hacer `git add`, `git commit` descriptivo y `git push origin main` de inmediato. No acumular cambios grandes sin respaldar en GitHub.

### Escaneá cada mensaje en busca de:
- ✏️ **Correcciones** - "Es X, no Y" / "En realidad..." / "No, quise decir..."
- 📍 **Nombres propios** - personas, lugares, empresas, productos
- 🎨 **Preferencias** - colores, estilos, approaches, "me gusta/no me gusta"
- 📋 **Decisiones** - "Hagamos X" / "Vamos con Y" / "Usá Z"
- 📝 **Cambios a drafts** - ediciones a algo que estamos trabajando
- 🔢 **Valores específicos** - números, fechas, IDs, URLs

### El Protocolo

Si APARECE ALGUNO de estos:

1. **STOP** - No empieces a redactar tu respuesta
2. **WRITE** - Actualizá `memory/YYYY-MM-DD.md` o el archivo relevante con el detalle
3. **THEN** - Respondé a Jose Luis

El impulso de responder es el enemigo. El detalle se siente tan claro en contexto que parece innecesario escribirlo. Pero el contexto se va a perder. Escribí primero.

**Ejemplo:**

Jose Luis dice: "Usá el tema azul, no el rojo"

❌ MAL: "Dale, azul!" (parece obvio, para qué escribirlo)
✅ BIEN: Escribir a `memory/YYYY-MM-DD.md`: "Tema: azul (no rojo)" → LUEGO responder

## Working Buffer - Zona de Peligro

Cuando el contexto de sesión llegue al ~60% (verificable con `session_status`), activar el buffer:

1. Crear o limpiar `memory/working-buffer.md`
2. A partir de ese punto, **cada exchange** se loggea: mensaje de Jose Luis + resumen de tu respuesta
3. **Flush ANTES de compactar** (idea de Honcho): cuando se acerque la compactación, asegurar que el buffer esté completo y al día ANTES de perder contexto - no después. Si la sesión está por compactar (cerca del límite), hacer un flush final del buffer con lo último importante.
4. Después de compactación, leer el buffer primero antes de cualquier otra cosa

**Formato:**

```markdown
# Working Buffer
**Status:** ACTIVE
**Started:** 2026-07-22T12:00:00-03:00

---

## 2026-07-22T12:01:00 Jose Luis
[mensaje]

## 2026-07-22T12:01:05 Kanam (resumen)
[1-2 oraciones con detalles clave]
```

### Resumen estructurado de compactación (idea de Session Compact)

Cuando se compacta la sesión (no solo el buffer), generar un **resumen estructurado** en vez de un bloque de texto generico. Al compactar, armar el resumen con estos campos (portado de Session Compact - ClawHub):

```markdown
# Resumen de Compactación
**Scope:** <que se compacto - ej. "35 mensajes de la sesion de desarrollo de X">
**Pending work:** <todos/pendientes en curso - ej. 'terminar U3, revisar U2'>
**Key files:** <archivos importantes tocados - ej. 'src/auth.ts, db/schema.sql'>
**Decisions:** <decisiones clave tomadas que no deben perderse>
**Key timeline:** <3-5 hitos de la conversacion que importan>
**Next step:** <que sigue>
```

- El **Pending work** y **Next step** son los mas criticos - que no se pierdan al compactar.
- Los **Key files** y **Decisions** permiten retomar sin re-descubrir.
- Complementa el working buffer (log crudo) con un resumen accionable post-compactacion.

## Compaction Recovery

Hay **dos mecanismos** que trabajan juntos para recuperar contexto tras una compactación. No son excluyentes - el plugin cubre lo automático, el buffer manual cubre lo que el plugin no ve (decisivo cuando el contexto es largo o la compactación fue agresiva).

### A. Plugin `compaction-context` (automático) - instalado 2026-08-22

El plugin está instalado en `~/.openclaw/extensions/compaction-context/` (instalación local, parcheada) y registrado como hook-only en `plugins.entries.compaction-context`. Hace un snapshot automático:

1. **`before_compaction`** - antes de compactar, lee las últimas N mensajes (default 20) del `.jsonl` de la sesión y las escribe en `RECENT.md` del workspace + setea el flag `.compaction-recovery-pending`.
2. **`before_agent_start`** - si el flag existe (recién compactó), lee `RECENT.md` y lo inyecta como `prependContext` dentro de `<compaction_context_recovery>...</compaction_context_recovery>`, y borra el flag.

**Qué significa para mí (el agente):** después de una compactación, NO estoy 100% en blanco. El `prependContext` reinyecta las últimas 20 mensajes. Si no tenés idea de qué pasó, revisar el `prependContext` inyectado ANTES de hacer cualquier pregunta.

**Config actual (defaults):** 20 mensajes × 500 chars/mensaje (~10K chars / ~2.5K tokens, inyectado solo una vez post-compactación). Configurable en `openclaw.json` → `plugins.entries.compaction-context.config`.

**⚠️ Manejo del ensuciamiento del workspace (importante):** el plugin escribe `RECENT.md` y `.compaction-recovery-pending` en `~/.openclaw/workspace/`, que es un repo git (`workspace_openclaw`). Ya están en el `.gitignore` (agregado 2026-08-22), así que no ensucian el `git status`. No commitearlos.

### B. Buffer manual (existing) - `memory/working-buffer.md`

El plugin no captura todo: solo las últimas 20 mensajes truncados a 500 chars, y no guarda decisiones clave a medio contexto. El working-buffer manual sigue siendo fuente para:

- Decisiones tomadas "entre líneas" no evidentes en el snapshot
- Contexto de más de 20 mensajes atrás
- Pendientes que el snapshot truncó

### C. Flujo de recuperación post-compactación (consolidado)

Al despertar sin contexto (compactación, reinicio, o Jose Luis dice "dónde estábamos?"):

1. **Revisar el `prependContext` inyectado** (el plugin ya lo reinyectó). Es la fuente inmediata - las últimas 20 mensajes.
2. **Leer `memory/working-buffer.md`** - exchanges crudos de la zona de peligro que el snapshot no cubre
3. **Leer `memory/YYYY-MM-DD.md`** del día de hoy y ayer
4. **`memory_search()`** por contexto faltante
5. **Extraer** lo importante del buffer a `memory/YYYY-MM-DD.md`
6. **Presentar:** "Recuperado del buffer + snapshot del plugin. Última tarea era X. ¿Continuamos?"

No preguntar "de qué estábamos hablando?" - el buffer tiene la conversación.

---

*Nota de deuda técnica pendiente:* el plugin se instaló local parcheado (el paquete npm del autor viene con `index.ts` sin compilar + bug "hook registration missing name" contra la API 2026.7.1-2). Si el autor publica una versión corregida, migrar a `openclaw plugins install compaction-context`.

## Handoff entre Subagentes

Cuando un subagente pasa trabajo a otro (o devuelve resultados al main), el handoff debe incluir:

- **Qué se hizo** - resumen de cambios/output
- **Dónde están los artifacts** - rutas exactas de archivos
- **Cómo verificar** - comandos de test o criterios de aceptación
- **Issues conocidos** - todo lo que está incompleto o riesgoso
- **Qué sigue** - próxima acción clara para el agente receptor

**Mal handoff:** "Listo, revisá los archivos."
**Buen handoff:** "Construí el módulo de auth en /shared/artifacts/auth/. Corré `npm test auth` para verificar. Issue conocido: rate limiting no implementado todavía. Siguiente: reviewer checkea edge cases de error handling."

**Lección:** un handoff vago genera trabajo duplicado o errores. Ser explícito sobre qué se hizo, dónde está, y qué falta ahorra tiempo a ambos lados.

## Productividad & ADHD - Cómo Trabajamos

Jose Luis tiene ADHD. El sistema de productividad debe adaptarse a eso, no al revés.

### Principios

- **Una cosa a la vez.** No mezclar proyectos en una misma sesión. Cada sesión de OpenClaw = un proyecto.
- **Inbox capture.** Si a Jose Luis se le ocurre algo mientras trabajamos en otra cosa, lo atrapo en `inbox.md` y sigo con lo que estábamos.
- **Overload triage.** Si hay demasiadas cosas abiertas, parar y priorizar antes de seguir. Preguntar: "¿Qué es lo más importante AHORA?"
- **Rutinas de inicio.** Al arrancar una sesión, revisar qué quedó pendiente de la sesión anterior antes de meter cosas nuevas.
- **Rutinas de guardado.** Al terminar una sesión, dejar claro qué sigue para la próxima. Así Jose Luis no pierde 10 min retomando.
- **Focus > multitasking.** Una sesión enfocada de 2h vale más que 4h de contexto switching.
- **Sin culpa por lo no hecho.** Si algo quedó sin terminar, se retoma. No hay "debería haber hecho más".
- **NUNCA usar ni sugerir localhost.** El entorno es 100% cloud en la nube (GitHub + Vercel). Jose Luis no corre el sitio en local; todo se compila, verifica y despliega en la web / producción directamente.

### Pausa Deliberada - Leer, Procesar, Responder

Jose Luis pide que nuestras respuestas tengan una **demora deliberada** entre leer el mensaje y actuar. No responder con la primera reacción.

El flujo es: **LEER → PROCESAR → (pausa reflexiva) → RESPONDER**.

- **LEER** - Leer el mensaje completo, sin saltar a la conclusión. Identificar qué pide realmente, no qué parece pedir.
- **PROCESAR** - Hacer la tarea con las herramientas disponibles. Reunir evidencia antes de opinar.
- **PAUSA REFLEXIVA** - Antes de responder, preguntar: ¿entendí el pedido? ¿verifiqué lo mutable? ¿hay un supuesto que estoy dando por hecho? ¿esto es lo que mejor responde a lo que pidió, o es la respuesta más fácil?
- **RESPONDER** - Recién ahí, emitir la respuesta.

**Reglas de oro:**
- No responder a medio leer. Si el mensaje es largo o ambiguo, parafrasear el pedido antes de ejecutar.
- **Cero localhost:** No sugerir `localhost`, `npm run dev` local ni servidores locales; la operación es 100% GitHub + Vercel.
- Las tareas que tocan el mundo exterior (pushear, publicar, enviar) merecen doble pausa: verificar antes de accionar.
- Si Jose Luis pide algo que cambia el curso de lo que estábamos haciendo (ej. "no pushees"), incorporar esa restricción y seguir, no abandonar.

### Señales de sobrecarga

Si detecto alguna de estas, paro y pregunto antes de seguir:
- Jose Luis menciona 3+ proyectos diferentes en la misma conversación
- Hay tareas abiertas de sesiones anteriores sin resolver
- El daily log del día tiene entradas de 3+ temas distintos
- Jose Luis dice "estoy en mil cosas" o similar

### Cómo Ayudo

- **Recordatorio suave:** "Antes de arrancar con esto, acordate que tenías X pendiente de ayer. ¿Seguimos con eso o arrancamos nuevo?"
- **Triage rápido:** "Tenés 4 cosas abiertas. ¿Cuál es la prioritaria ahora?"
- **Guardado explícito:** Al final de cada sesión, dejo un resumen de qué se hizo y qué sigue.
- **Sin presión:** Si Jose Luis quiere cambiar de tema, cambiamos. El sistema se adapta.

## Outputs
- `.data/session-context.db` (proyectos, sesiones, decisiones)
- `projects/<slug>/.knowledge/HANDOFF.md`
- `memory/YYYY-MM-DD.md`
- Tareas creadas en el sistema (cron jobs o TODO.md)
- Workspace commiteado y pusheado

## Related Skills

- [Task Execution](../task-execution): Para ejecutar tareas dentro de la sesión
- [Knowledge Management](../knowledge-management): Para registrar aprendizajes de la sesión
- [session-context](../session-context): Para persistencia estructurada de contexto por proyecto
