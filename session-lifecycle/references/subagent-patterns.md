# Sub-agent Patterns - Session Lifecycle Reference

Patrones para spawnear sub-agentes.

## Fork vs Isolated

| Mode | When | Context |
|---|---|---|
| **fork** | Sub-agent needs current transcript | Continuing investigation, analyzing conversation |
| **isolated** | Independent work | Searching issues, reading docs, parallel tasks |

## Common Patterns

### Parallel Research

```
Main session: planning
  ├── isolated: search for solutions
  ├── isolated: read documentation
  └── isolated: check existing code
Main session: synthesize results
```

### Investigation Chain

```
Main session: bug report
  └── fork: investigate with full context
      └── fork: deep dive into specific area
Main session: receive DEBUG_REPORT
```

### Batch Processing

```
Main session: multiple files to process
  ├── isolated: process file A
  ├── isolated: process file B
  └── isolated: process file C
Main session: merge results
```

## Handoff Between Sub-agents

```markdown
## Handoff

**From:** [sub-agent name]
**To:** [next agent / main session]

### What was done
[summary]

### Artifacts
- [file paths]

### How to verify
[verification steps]

### Known issues
[issues]

### What's next
[next steps]
```

## Related

- [SKILL.md](../SKILL.md) - Workflow principal
- [Session Templates](./session-templates.md) - Templates de sesión
