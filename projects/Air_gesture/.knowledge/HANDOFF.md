# HANDOFF - Air_gesture

## Session Context
- **Date:** 2026-10-05 15:53
- **Project:** Air_gesture
- **Milestone:** Pipeline de Video Sensor Completo (16:9 Nativo Sin Recortes) & Modo `Full Sensor View`
- **Status:** ✓ Completado, Verificado en Chrome DevTools y Construido en Producción

## Summary
Corrección radical del pipeline visual y de tracking para asegurar que la cámara sea **una ventana fija al mundo real sin recortes ni zoom digital**:

1. **Eliminación Total de Crop y Zoom Digital:**
   - Se reemplazó `object-fit: cover` en `#webcam-video` por `object-fit: contain` centrado (`top: 50%; left: 50%; transform: translate(-50%, -50%) scaleX(-1)`).
   - Se eliminaron las compensaciones artificiales de relación de aspecto en `MotionEngine` (`scaleX`/`scaleY`), mapeando directamente los landmarks a coordenadas normalizadas del sensor $UV \in [0..1] \times [0..1]$.
   - Se redujo el scrim oscuro de viñeta a un fondo translúcido no destructivo (`rgba(3, 7, 18, 0.2)`), ofreciendo una visión clara y brillante del entorno completo.
2. **Modo `FULL SENSOR VIEW` (`FullSensorView`):**
   - Nuevo visualizador 2D en canvas de alta definición superpuesto al feed nativo con cálculo de geometría letterbox/pillarbox pixel-perfect (`computeVideoRect`).
   - Proyección 1:1 de entidades espaciales:
     - **Full-Body Pose (33 puntos):** Esqueleto completo conectando cabeza, columna, hombros, codos, muñecas, caja torácica, caderas, rodillas, tobillos y pies.
     - **Dual Hands (21 puntos cada una):** Articulaciones, huesos y anillos dinámicos de pellizco (pinch).
     - **Face & Head Pose:** Cruz de orientación facial, punto nasal y vector de dirección.
     - **Tracked Objects & Tools:** Bounding boxes con esquinas de mira, etiquetas y flechas de vector de velocidad.
     - **Sensor HUD:** Telemetría de resolución del sensor (`1280x720 / 16:9`), cobertura del 100% y marcadores de esquina `[0.0, 0.0]` a `[1.0, 1.0]`.
3. **Plataforma de Juegos Espaciales:**
   - La captura y tracking de cuerpo completo sin recorte permite desplazamientos laterales, agacharse, saltar y jugar con manos/pies y objetos lejanos sin toparse con recortes artificiales de pantalla.

## Architecture: Full Sensor Pipeline

```text
Cámara MacBook (Sensor 16:9)
           ↓
    FULL SENSOR FRAME (100% Sin Recorte / Sin Zoom)
           ├── FaceTracker
           ├── HandTracker
           ├── BodyTracker (Full-Body 33 pts: Cabeza → Pies)
           └── ObjectTracker (Bounding Boxes & Geometría)
           ↓
   SPATIAL WORLD MODEL (Entidades en Espacio Físico Completo)
           ↓
   VISUALIZATION & UI
   ├── Passthrough AR 16:9 (object-fit: contain)
   ├── Full Sensor View (Overlays 1:1 de todas las entidades)
   └── Air Games Lab (Pong, Fruit Ninja, Basketball)
```

## Files Touched
- `src/render/full-sensor-view.js`: Motor de renderizado en canvas para el campo completo del sensor, esqueletos y bounding boxes.
- `src/style.css`: Corrección de `#webcam-video` (`object-fit: contain`), reducción de scrim y estilos del canvas `#full-sensor-view-canvas`.
- `src/core/motion-engine.js`: Eliminación del factor de escala `cover` en la proyección; coordenadas UV normalizadas 1:1 directas.
- `src/main.js`: Instanciación de `FullSensorView`, ciclo de dibujo en `tracker.setOnFrame` y toggle interactivo en UI.
- `index.html`: Botón de cabecera `📐 Full Sensor View`.

## Verification
- `npm run build`: Compilación exitosa en 397 ms sin errores.
- `test/test-air-games.js`: 20/20 tests unitarios pasados.
- `test/test-object-perception.js`: 32/32 tests pasados.
- Chrome DevTools MCP:
  - Verificado `hasFullSensorView: true` y `videoObjectFit: "contain"`.
  - Verificado toggle interactivo del botón `📐 Sensor: ON (16:9)`.
  - Captura de pantalla del estado visual validada.

## Repository
- **GitHub:** [https://github.com/Breacorp/Air_gesture](https://github.com/Breacorp/Air_gesture)
- **Branch:** `main`
