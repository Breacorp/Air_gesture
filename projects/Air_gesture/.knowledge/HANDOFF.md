# HANDOFF - Air_gesture

## Session Context
- **Date:** 2026-10-05 14:57
- **Project:** Air_gesture
- **Milestone:** Interaction Capability System (Intent + Target Capabilities -> Action)
- **Status:** ✓ Completado, Verificado (5/5 Pruebas Exitosas) y Publicado

## Summary
Evolución conceptual definitiva: el contexto ya no se define por nombres de aplicaciones, sino por **capacidades intrínsecas de interacción** (`TargetCapabilities`). 

En lugar de preguntarle al sistema: *"¿Qué aplicación es?"*, Air Gesture le pregunta al mundo: *"¿Qué puedo hacer con aquello que tengo delante?"*.

El `ActionResolver` fue refactorizado para operar exclusivamente bajo el principio:
```text
Intent + Target Capabilities → Action
```
Comprobado y validado en 5 pruebas determinísticas en runtime a través del mundo físico, el mundo virtual 3D y el sistema operativo macOS.

## Architecture: Interaction Capability System

```text
PERCEPTION (Hands, Body, Objects, Depth)
    ↓
SPATIAL WORLD MODEL (Human, Physical, Virtual)
    ↓
UNIVERSAL INTENT (POINT, TOUCH, CLICK, GRAB, DRAG, RELEASE, SCROLL, ROTATE, SCALE, PUSH, PULL, THROW, PAUSE, CANCEL)
    ↓
CONTEXT & TARGET CAPABILITIES:
    - grabbable: true/false
    - movable: true/false
    - scalable: true/false
    - rotatable: true/false
    - clickable: true/false
    - scrollable: true/false
    - throwable: true/false
    - physical: true/false
    - virtual: true/false
    ↓
ACTION RESOLVER:
    Intent + Target Capabilities → Concrete Action
    ↓
ADAPTERS / DESTINATIONS (macOS Quartz, Browser DOM, 3D Studio CAD, Physics Sandbox)
```

## Matrix of Universal Capabilities

| Entorno / Target | grabbable | movable | scalable | rotatable | clickable | scrollable | throwable | physical | virtual |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Superficie OS (Safari / Finder)** | ✓ (drag ventana) | ✓ (cursor) | ✓ (zoom) | ✗ | ✓ | ✓ | ✗ | ✗ | ✓ |
| **Modelo 3D CAD (Studio / Blender)**| ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| **Cuerpo Rígido (Physics Lab)**     | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ (impulso) | ✗ | ✓ |
| **Prop Físico (Pelota real)**       | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ (inercia) | ✓ | ✗ |
| **UI 2D (Botones / Controles)**     | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ |

## Live Runtime Verification: The 5 Golden Scenarios (100% Passed)

1. **Prueba 1 & 2 — Safari & Finder (Superficie OS Desktop):**
   - Intención: `POINT`, `CLICK`, `DRAG`, `SCROLL`.
   - Capacidades del target: `clickable: true`, `grabbable: true`, `movable: true`, `scrollable: true`, `throwable: false`.
   - Resultado: **PASSED**. Exactamente los mismos gestos en Safari y Finder sin cambiar ningún perfil.
2. **Prueba 3 — Air 3D Studio (Modelo CAD Tridimensional):**
   - Intención: 🤏 + movimiento $\rightarrow$ `GRAB` + `MOVE` (mueve modelo 3D). Dos manos $\rightarrow$ `SCALE`, `ROTATE`.
   - Capacidades del target: `grabbable: true`, `movable: true`, `scalable: true`, `rotatable: true`.
   - Resultado: **PASSED**. Escala geométrica multiplicada de $0.909$ a $0.945$ en 3D directo.
3. **Prueba 4 — Air Physics Lab (Cuerpo Rígido en Simulación):**
   - Intención: `GRAB`, `MOVE`, `RELEASE` con velocidad $\rightarrow$ `THROW`.
   - Capacidades del target: `grabbable: true`, `movable: true`, `throwable: true`.
   - Resultado: **PASSED**. Impulso impartido al cuerpo rígido ($v_x = 6.4, v_y = 4.0, v_z = 1.6$).
4. **Prueba 5 — Objeto Físico (Pelota Naranja Real Trackeada):**
   - Intención: `GRAB` $\rightarrow$ `DRAG` $\rightarrow$ `VirtualProxy`.
   - Capacidades del target: `physical: true`, `virtual: false`, `grabbable: true`, `movable: true`, `throwable: true`.
   - Resultado: **PASSED**. Objeto real detectado en `SpatialWorldModel`, relación `isHeld = true`, y traslación de proxy confirmada.

## Files Touched
- `src/core/interaction/capabilities.js`: Nueva clase `TargetCapabilities` con factories de capacidades.
- `src/core/interaction/context-engine.js`: Integración de `TargetCapabilities` en `SpatialContext`.
- `src/core/spatial/entity.js`: `TrackedEntity` ahora posee `this.capabilities`.
- `src/core/interaction/action-resolver.js`: Resolutor reescrito para operar sobre `caps.can(...)`.
- `index.html` & `src/style.css`: Visualizadores de telemetría de Intent y Contexto en el dock.
- `src/main.js`: Conexión integral de adaptadores y escena.

## Repository Status
- **GitHub:** [https://github.com/Breacorp/Air_gesture](https://github.com/Breacorp/Air_gesture)
- **Branch:** `main` (limpio y sincronizado con origin/main).
