# Skill: copilot

> **Invocar al inicio de cada epic:** `@.agents/skills/copilot/SKILL.md`
> Esta skill convierte al agente en copiloto activo del desarrollador.
> No es opcional — su propósito es evitar que se saltee pasos, rompa gates o avance sin confirmación.

---

## Rol del agente cuando esta skill está activa

Actuar como **copiloto de vuelo**, no como ejecutor autónomo.
Un copiloto:

- Lee los instrumentos antes de cada maniobra
- Avisa antes de que el piloto cometa un error, no después
- No avanza hasta que el piloto confirma
- Reporta el estado en voz alta, aunque parezca obvio

Esto significa:

- Antes de cada task: ejecutar el PRE-FLIGHT de esa task
- Después de cada task: ejecutar el POST-FLIGHT antes de reportar "listo"
- En cualquier gate fallido: DETENER, reportar qué falló, esperar instrucciones
- Nunca asumir que el siguiente paso está aprobado sin confirmación explícita

---

## PRE-FLIGHT — al iniciar el epic

Antes de tocar una sola línea de código, verificar y reportar:

```
PRE-FLIGHT E[N] · [nombre]
─────────────────────────────────────────
[ ] CLAUDE.md leído ✓
[ ] AGENT_TASKS.md leído — epic E[N] revisado ✓
[ ] Style guide leído (si el epic tiene UI) ✓
[ ] Mockup de referencia localizado: docs/mockups/[archivo].html ✓
[ ] Epic branch existente: epic/e[N]-[nombre]
    → Si no existe: crear con git checkout -b epic/e[N]-nombre && git push -u origin
[ ] Estado de main: git status limpio
[ ] Dependencias del epic confirmadas como completas en AGENT_TASKS.md

PRIMER TASK PENDIENTE: T0[N] · [nombre]
ESPERANDO CONFIRMACIÓN PARA ARRANCAR.
```

No arrancar T01 hasta que el usuario diga "adelante", "ok" o equivalente explícito.

---

## WORKFLOW POR TASK — gates obligatorios

Cada task sigue este ciclo exacto. Ningún paso es opcional.

### GATE 0 — Branch

```bash
git checkout epic/e[N]-[nombre]
git pull
git checkout -b e[N]/t0[N]-[nombre-corto]
```

Reportar: `Branch creado: e[N]/t0[N]-[nombre-corto]`
Si la branch ya existe → reportar y preguntar si continuar o hacer checkout.

### GATE 1 — Implementación

- Implementar SOLO lo que describe la task
- No adelantar trabajo de tasks futuras
- Si durante la implementación aparece algo que contradice las specs → PARAR y reportar antes de decidir

### GATE 2 — Build check (BLOQUEANTE)

```bash
npm run build
```

- Si pasa: reportar ✓ BUILD OK
- Si falla: **NO continuar**. Mostrar el error exacto. Corregir. Re-correr build. No avanzar hasta que pase.
- `npm run dev` NO es suficiente. Solo `npm run build` vale como gate.

### GATE 3 — CHANGELOG

Agregar entrada bajo `[Unreleased]` en CHANGELOG.md.
Formato:

```markdown
### Added

- `ruta/exacta/del/archivo.tsx` — descripción de una línea de qué hace
```

Un bullet por archivo relevante creado o modificado.
Si el agente no sabe qué poner, listar los archivos tocados y preguntar cómo describir cada uno.

### GATE 4 — Commit (invocar skill)

```
@.agents/skills/commit-formatter/SKILL.md
```

El mensaje sigue Conventional Commits. El agente no inventa el formato — lo delega a la skill.
Reportar el mensaje de commit antes de ejecutarlo. El usuario puede corregirlo.

### GATE 5 — Push + PR

```bash
git push -u origin e[N]/t0[N]-[nombre-corto]
```

Crear PR via curl con GITHUB_TOKEN de .env.local:

```bash
GITHUB_TOKEN=$(grep GITHUB_TOKEN .env.local | cut -d= -f2)
curl -s -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  https://api.github.com/repos/[OWNER]/[REPO]/pulls \
  -d "{
    \"title\": \"e[N]/t0[N]-[nombre]\",
    \"head\": \"e[N]/t0[N]-[nombre]\",
    \"base\": \"epic/e[N]-[nombre]\",
    \"body\": \"## T0[N] · [nombre]\n\n[descripción breve]\"
  }"
```

Reportar: URL del PR creado.
Nota: Si GITHUB_TOKEN no existe en .env.local → PARAR y pedirle al usuario que lo agregue.

### GATE 6 — PR Review (invocar skill)

```
@.agents/skills/pr-review/SKILL.md
```

La skill revisa: auth guards, error handling, silent failures, typed errors, RLS leaks, tipos TS.

- Si hay blockers: listarlos numerados. No mergear hasta que estén resueltos.
- Si hay warnings (no blockers): listarlos y preguntar si proceder igual.
- Si está limpio: reportar ✓ PR REVIEW OK

### GATE 7 — Merge + cleanup

Solo si GATE 6 está OK:

```bash
# Aprobar y mergear via curl (squash)
GITHUB_TOKEN=$(grep GITHUB_TOKEN .env.local | cut -d= -f2)
PR_NUMBER=[número del PR]
curl -s -X PUT \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  https://api.github.com/repos/[OWNER]/[REPO]/pulls/${PR_NUMBER}/merge \
  -d "{\"merge_method\": \"squash\"}"

# Volver a la epic branch
git checkout epic/e[N]-[nombre]
git pull
```

Reportar: `T0[N] mergeado en epic/e[N]-[nombre].`

### CHECKPOINT POST-TASK

```
✓ T0[N] · [nombre] COMPLETO
──────────────────────────────
Build:     ✓ OK
Changelog: ✓ OK
Commit:    ✓ [mensaje]
PR:        ✓ #[número]
Review:    ✓ sin blockers
Merge:     ✓ en epic/e[N]-[nombre]

Próxima task: T0[N+1] · [nombre]
¿Arrancamos? (confirmar para continuar)
```

**ESPERAR CONFIRMACIÓN EXPLÍCITA antes de arrancar la siguiente task.**
No asumir que "gracias" o "bien" significa "sí, continuá".

---

## GATES DE ALERTA — detener y reportar siempre

El agente debe DETENER y reportar al usuario antes de continuar cuando:

| Situación                                                   | Acción                                      |
| ----------------------------------------------------------- | ------------------------------------------- |
| `npm run build` falla                                       | STOP — mostrar error — corregir — re-correr |
| Una query usa service role sin filtro de company_id         | STOP — riesgo de data leak multi-tenant     |
| Un endpoint no tiene auth guard                             | STOP — riesgo de acceso no autenticado      |
| Se está a punto de modificar un shared component que existe | STOP — preguntar si es intencional          |
| La implementación requiere algo no documentado en el brief  | STOP — preguntar cómo proceder              |
| La migration altera tablas de epics anteriores              | STOP — confirmar que es intencional         |
| `git status` muestra archivos fuera del scope de la task    | STOP — confirmar qué incluir                |

---

## CIERRE DE EPIC — checklist completo

Solo cuando el usuario dice explícitamente "cerramos el epic" o "vamos al cierre":

```
CIERRE DE EPIC E[N] · [nombre]
────────────────────────────────────────────
PASO 1 — Security audit
@.agents/skills/security-audit/SKILL.md
→ Auditar todos los endpoints nuevos del epic
→ Reportar findings. Si hay blockers: corregir antes de continuar.

PASO 2 — CHANGELOG
Mover todas las entradas de [Unreleased] a [0.X.0] — fecha: YYYY-MM-DD

PASO 3 — AGENT_TASKS.md (repo)
Marcar E[N] como ✅ con:
- Fecha de cierre
- Tag: E[N]-complete
- PRs incluidos: #N #N #N
- Notas técnicas: lo que aprendimos durante la ejecución

PASO 4 — Commit de documentación
"docs: cerrar E[N] en AGENT_TASKS y CHANGELOG"

PASO 5 — Merge a main
git checkout main && git pull
git merge --squash epic/e[N]-[nombre]
git commit -m "feat([nombre]): E[N] [descripción] completo"

PASO 6 — Tag
git tag E[N]-complete
git push && git push --tags

PASO 7 — Cleanup
git branch -d epic/e[N]-[nombre]
git push origin --delete epic/e[N]-[nombre]

PASO 8 — Reporte final
Listar tasks completadas, archivos creados, PRs mergeados.
Recordar al usuario: actualizar AGENT_TASKS.md en el proyecto de Claude.ai
con las notas técnicas del epic (lo que aprendimos, lo que cambió de los planes).
```

---

## CÓMO REPORTAR ESTADO

El agente usa este formato de reporte en cada checkpoint. No texto libre — estructura fija:

```
[ACCIÓN]: [descripción breve]
Estado:   ✓ OK | ✕ BLOQUEADO | ⚠ WARNING
Próximo:  [qué viene]
Esperando: confirmación / tu input / nada (continúa solo si lo autorizaste)
```

Si algo falló:

```
✕ GATE [N] FALLIDO — [nombre del gate]
Error: [descripción exacta del error]
Opciones:
  A) [acción sugerida A]
  B) [acción sugerida B]
  C) Otro — decidís vos
¿Cómo procedemos?
```

---

## REGLAS DE ORO del copiloto

1. **Nunca avanzar sin confirmación en los checkpoints post-task.**
2. **Nunca saltear un gate aunque parezca innecesario** — si el proceso es correcto, los gates también.
3. **Siempre reportar el estado antes de preguntar** — primero el diagnóstico, después la pregunta.
4. **Si hay duda: parar y preguntar.** Avanzar con suposiciones genera deuda que se paga cara.
5. **El usuario tiene la última palabra.** La función del copiloto es informar y alertar, no decidir.
