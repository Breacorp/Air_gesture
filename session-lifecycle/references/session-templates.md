# Session Templates - Session Lifecycle Reference

Templates para inicio y guardado de sesión.

## Session Start Template

```markdown
## Session Start

**Date:** YYYY-MM-DD HH:mm
**Project:** [project name]
**Objective:** [what we're doing]

### Context
- Last HANDOFF: [link]
- Active branch: [branch]
- Pending tasks: [list]

### Plan
1. [Step 1]
2. [Step 2]
3. [Step 3]
```

## Session End Template

```markdown
## Session End

**Date:** YYYY-MM-DD HH:mm
**Duration:** [time]

### What was done
- [Done 1]
- [Done 2]

### Decisions made
- [Decision 1]
- [Decision 2]

### Files changed
- [File 1]
- [File 2]

### What's next
- [Next 1]
- [Next 2]

### Blockers
- [Blocker 1] (if any)
```

## HANDOFF Template

```markdown
# HANDOFF - [Project Name]

## Session Context
- **Date:** YYYY-MM-DD
- **Objective:**
- **Status:**

## What Was Done
- [ ]

## Key Decisions
- [ ]

## Current State
- Branch:
- Files changed:
- Tests passing: ✅/❌
- Build: ✅/❌

## Next Steps
1. [ ]
2. [ ]

## Open Questions
- [ ]

## Related
- [HANDOFF previous](link)
- [STATUS.md](link)
```

## Related

- [SKILL.md](../SKILL.md) - Workflow principal
- [Task Execution](../../task-execution) - Ejecución de tareas
