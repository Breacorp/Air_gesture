# Reflection Template - Session Lifecycle Reference

Template de reflexión post-sesión para identificar aprendizajes y patrones.

## Cuándo usarlo

Al final de cada sesión significativa (no sesiones de 5 min). Como parte del cierre, antes del HANDOFF.

## Preguntas guía

### ¿Qué aprendimos?
- ¿Algo nos sorprendió?
- ¿Algo funcionó mejor o peor de lo esperado?
- ¿Hubo algún error que no queremos repetir?

### ¿Qué patrones identificamos?
- ¿Repetimos algún proceso sin pensarlo?
- ¿Podemos extraer un "mega-patrón" que aplique a otros contextos?
- ¿Hay algo que debería ser automático y hoy es manual?

### ¿Es global o de proyecto?
- 🌍 **Global** - aplica a cualquier proyecto, dominio o contexto
- 🏗️ **Proyecto** - específico del AI Engineering OS o del workspace
- 📦 **Contexto** - específico de un proyecto de producto en particular

### ¿Dónde va?
| Si es... | Va a... |
|---|---|
| 🌍 Global | `docs/LEARNINGS.md` + evaluar si merece AGENTS.md/SOUL.md |
| 🏗️ Proyecto | `docs/LEARNINGS.md` |
| 📦 Contexto | `projects/<slug>/.knowledge/LEARNINGS.md` |

## Formato de entrada

```markdown
## YYYY-MM-DD - [Título corto]

### N. [Título de la lección]
[Descripción de 2-4 párrafos]

**Lección:** [una frase que capture la esencia]

**Clasificación:** 🌍 Global / 🏗️ Proyecto / 📦 Contexto
```

## Related

- [SKILL.md](../SKILL.md) - Workflow principal
- [Session Templates](./session-templates.md) - Templates de inicio y cierre
