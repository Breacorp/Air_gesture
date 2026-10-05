# Session Lifecycle

Ciclo de vida completo de una sesión de trabajo con IA.

## ¿Para qué sirve?

Para **estructurar cada sesión de trabajo** con IA: inicio (cargar contexto + memoria), dispatcher (spawnear sub-agentes), ejecución, cierre (escribir HANDOFF, memory, CHANGELOG), tareas (convertir pendientes en accionables), y commit del workspace.

## ¿Cuándo usarlo?

- Al iniciar cada sesión de trabajo
- Al cerrar cada sesión
- Cuando necesitás spawnear sub-agentes
- Cuando hay pendientes que convertir en tareas

## ¿Cómo se usa?

### Fases

1. **Inicio** - cargar contexto, memoria, handoff del proyecto activo
2. **Dispatcher** - spawnear sub-agentes: fork (necesita transcript) vs isolated (independiente)
3. **Ejecución** - trabajo principal, decisiones, archivos tocados
4. **Cierre** - escanear sesión, escribir HANDOFF, memory, CHANGELOG
5. **Tareas** - convertir pendientes en accionables (cron jobs o TODO.md)
6. **Commit** - commit + push del workspace

### Scripts útiles

```bash
# Iniciar sesión
./scripts/session-start.sh --project "mi-app" --objective "Implementar auth con Google"

# Guardar sesión
./scripts/session-end.sh --project "mi-app" --summary "Auth implementada, PR abierto"
```

## Referencias

| Archivo | Qué contiene |
|---|---|
| `references/session-templates.md` | Templates: session start, session end, HANDOFF |
| `references/subagent-patterns.md` | Fork vs isolated, patrones comunes, handoff entre sub-agentes |

## Skills relacionadas

- [Task Execution](../task-execution) - Para ejecutar tareas dentro de la sesión
- [Knowledge Management](../knowledge-management) - Para registrar aprendizajes de la sesión
