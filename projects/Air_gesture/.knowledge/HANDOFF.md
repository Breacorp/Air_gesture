# HANDOFF - Air_gesture

## Session Context
- **Date:** 2026-10-05 14:43
- **Project:** Air_gesture
- **Milestone:** Universal Spatial Interaction Engine (Lenguaje Universal sin Perfiles de Aplicación)
- **Status:** ✓ Completado, Verificado y Documentado

## Summary
Transformación radical de la filosofía y arquitectura de Air Gesture: **Air Gesture nunca debe aprender cómo funciona una aplicación; debe entender cómo funciona la interacción humana**.

Se eliminó conceptualmente `ProfileManager` del núcleo operativo del sistema. En su lugar, se implementó el **Universal Interaction Engine**, compuesto por una cadena determinística de tres etapas:
1. **Intent Engine:** Clasifica la intención física del usuario (`POINT`, `TOUCH`, `CLICK`, `GRAB`, `DRAG`, `RELEASE`, `SCROLL`, `ROTATE`, `SCALE`, `PUSH`, `PULL`, `THROW`, `PAUSE`, `CANCEL`).
2. **Context Engine:** Evalúa el entorno espacial y las relaciones (`3D CAD Object`, `Physics Rigid Body`, `Physical Prop`, `Interactive UI`, `OS Desktop Surface`) y el grado de contacto (`holding`, `touching`, `near`, `over`).
3. **Action Resolver:** Determina qué significa esa intención en ese contexto particular y ejecuta la acción adecuada de forma totalmente agnóstica a la aplicación subyacente.

## Architecture & Flow

```text
CÁMARA
  ↓
LANDMARKS & CINEMÁTICA
  ↓
SPATIAL WORLD MODEL (Entidades + TrackingFusion: near, touching, holding)
  ↓
POINTER CONTROLLER (Alta frecuencia ~60-80Hz, One-Euro, anti-jitter, clutch)
  ↓
INTENT ENGINE (Clasifica intenciones espaciales universales puras)
  ↓
CONTEXT ENGINE (Identifica objeto 3D, cuerpo rígido, prop físico, UI o Desktop OS)
  ↓
ACTION RESOLVER (Resuelve y ejecuta la acción sin perfiles de app)
  ↓
DESTINOS
  ├── macOS Quartz / CoreGraphics (Safari, Finder, apps desktop nativas)
  ├── Browser DOM & Virtual Touch (elementos interactivos 2D)
  └── Spatial Virtual World (Air 3D Studio, Air Physics Lab, Digital Twin)
```

### 1. Intent Engine (`src/core/interaction/intent-engine.js`)
- Produce instancias del contrato formal `SpatialIntent` (`src/core/interaction/spatial-intent.js`).
- Detecta intenciones continuas y discretas:
  - `POINT`: Apuntado continuo estabilizado con rayo espacial.
  - `TOUCH` / `CLICK`: Contacto o pellizco rápido sin desplazamiento.
  - `GRAB`: Cierre de agarre (`start`).
  - `DRAG`: Agarre sostenido en traslación (`active`).
  - `RELEASE`: Apertura del agarre (`end`).
  - `THROW`: Liberación con ventana temporal de velocidad que imparte momento lineal y angular.
  - `SCROLL`: Desplazamiento vertical de dos dedos o velocidad de mano.
  - `SCALE`: Variación de distancia bimanual.
  - `ROTATE`: Variación angular bimanual o torsión de muñeca.
  - `PUSH` / `PULL`: Velocidad en el eje Z hacia o desde la escena.
  - `PAUSE` / `CANCEL`: Failsafes (palma inmóvil / doble puño).

### 2. Context Engine (`src/core/interaction/context-engine.js`)
- Consulta dinámicamente el `SpatialWorldModel` y los proveedores de escena registrados (`studio`, `physicsLab`, `spatialDirectTouch`):
  - Si el rayo o la mano intersecta un modelo CAD 3D $\rightarrow$ Contexto: `VIRTUAL_3D_OBJECT`.
  - Si la mano está en proximidad o tocando un cuerpo de física $\rightarrow$ Contexto: `PHYSICS_RIGID_BODY`.
  - Si hay un prop físico real trackeado $\rightarrow$ Contexto: `PHYSICAL_PROP`.
  - Si el cursor está sobre un botón o elemento web $\rightarrow$ Contexto: `INTERACTIVE_UI`.
  - En caso general por defecto $\rightarrow$ Contexto: `OS_SURFACE` (Superficie de escritorio macOS).
- Soporta `setStickyHold` para mantener la posesión continua de un objeto durante el arrastre hasta el `RELEASE`.

### 3. Action Resolver (`src/core/interaction/action-resolver.js`)
- Resuelve `(Intent, Context)` sin consultar ningún perfil de aplicación:
  - `GRAB` + Modelo 3D = Poseer y mover el modelo CAD en 3D.
  - `GRAB` + Cuerpo de física = Poseer cuerpo rígido.
  - `GRAB` + Desktop OS = `pointer_down` / `drag_start` en el WindowServer de macOS.
  - `SCALE` + Modelo 3D = Escala geométrica del objeto en tiempo real.
  - `SCALE` + Desktop OS = Zoom de viewport (`Cmd+` / `Cmd-`).
  - `THROW` + Cuerpo de física = Impartir vector de velocidad e impulso de impacto.
  - `ROTATE` + Modelo 3D = Rotación orbital 3D del modelo.
  - `SCROLL` + Desktop OS = Scroll continuo de ventana en macOS.

## Files Touched
- `src/core/interaction/spatial-intent.js`: Definición de `SpatialIntent`, `IntentType` e `IntentState`.
- `src/core/interaction/intent-engine.js`: Clasificador determinístico de intenciones espaciales humanas.
- `src/core/interaction/context-engine.js`: Evaluador de escena, entidades, objetos físicos/virtuales y relaciones espaciales.
- `src/core/interaction/action-resolver.js`: Resolutor determinístico `(Intent, Context) -> Acción`.
- `src/core/interaction-engine.js`: Coordinador que integra `PointerController`, `IntentEngine`, `ContextEngine` y `ActionResolver`.
- `src/main.js`: Conexión de `macosAdapter`, `browserAdapter`, `studio`, `physicsLab` al motor universal; telemetría de badges `dockIntentBadge` y `dockContextBadge`.
- `index.html`: Badges visuales en el dock de pruebas para telemetría en tiempo real de `INTENT` y `CONTEXT`.
- `src/style.css`: Estilizado premium de `.dock-badges-wrap`, `.badge-intent` y `.badge-context`.

## Verification
- `npm run build`: Compilación exitosa en 296ms, 52 módulos transformados, 0 errores.
- Pruebas sintéticas y runtime vía Chrome DevTools MCP:
  - Inicialización completa de subsistemas (`hasIntentEngine: true`, `hasContextEngine: true`, `hasActionResolver: true`, `hasPointerController: true`, `hasStudioProvider: true`, `hasPhysicsProvider: true`).
  - Extracción de intenciones de prueba (`POINT:active`, `GRAB:start`, `RELEASE:end`) detectadas con precisión.
  - Evaluación contextual (`targetType: "interactive_ui"`, `targetId: "btn-start-camera"`, `environment: "desktop"`, y `os_surface`).
  - Actualización en tiempo real de los badges del dock de telemetría: `INTENT: RELEASE`, `CTX: DESKTOP`.
  - Daemon Python macOS (`server/macos-bridge.py`) escuchando en `ws://127.0.0.1:8765`.

## Next Steps
1. [ ] Validación física en persona activando la cámara ("Permitir Cámara y Comenzar") interactuando de forma simultánea con objetos 3D y con el escritorio de macOS.
2. [ ] Empaquetado nativo (standalone background agent) para prescindir del navegador una vez que la experiencia universal esté completamente calibrada.
