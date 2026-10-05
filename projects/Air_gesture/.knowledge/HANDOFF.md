# HANDOFF - Air_gesture

## Session Context
- **Date:** 2026-10-05 15:25
- **Project:** Air_gesture
- **Milestone:** Rediseño Arquitectónico: Multi-Signal Object Perception & Temporal Tracking Engine
- **Status:** ✓ Completado, Verificado con 32 Tests Unitarios/Integración y Desplegado en GitHub

## Summary
Reemplazo total del enfoque primitivo de "detector de colores HSV" por una arquitectura robusta de **Percepción de Objetos Multiseñal (Appearance + Geometry + Motion)**:
1. **El color como señal auxiliar, no definición:**
   - Detecta cualquier objeto físico (naranja flúor, negro, metálico, rojo, azul, transparente o neutro).
   - Combina luminancia extrema (objetos oscuros/metálicos), contraste cromático, gradientes de bordes y sustracción de piel.
2. **Separación de Tracking vs. Reconocimiento:**
   - Tracking ("¿Dónde está el objeto?") opera de forma autónoma antes de que el objeto sea clasificado ("¿Qué objeto es?").
   - Identidad persistente estandarizada: `object-001`, `object-002`, etc.
3. **Resistencia a Oclusiones Manuales y Dead-Reckoning:**
   - Cuando la mano sostiene el objeto (ej. destornillador), calcula oclusión exacta (ej. `visible: 63%, occluded: 37%, track: ACTIVE`).
   - Si la mano cubre temporalmente el objeto o realiza un barrido rápido, el tracker activa predicción inercial (*dead-reckoning* $p_t = p_{t-1} + v \cdot dt$) y pasa a estado `COASTING` sin perder el ID `object-001`.
4. **Visualización 3D y Rastro de Trayectoria:**
   - Bounding box 3D de alta tecnología con etiqueta flotante billboard (`OBJECT #001 [ACTIVE 94%]`).
   - Contorno de silueta 3D y rastro de migas de pan (*breadcrumb trail* `• • •`) trazado en el espacio 3D.
5. **Panel UI de Percepción Dedicado:**
   - Tarjeta **OBJECT PERCEPTION** en el HUD mostrando: `OBJECT #001`, `Tracking: ACTIVE`, `Confidence: 94%`, `Occlusion: 31% (Vis 69%)`, `Position`, `Velocity`, `Rotation`, `Shape: elongated (screwdriver)`, `Silhouette: detected`, `Depth: estimated`, `Reconstruction: pending`.

## Architecture: Multi-Signal Object Perception

```text
                 OBJECT PERCEPTION
                        │
        ┌───────────────┼────────────────┐
        ↓               ↓                ↓
     Appearance       Geometry        Motion
        │               │                │
    color/texture    shape/edges      tracking
        │               │                │
        └───────────────┼────────────────┘
                        ↓
                 OBJECT TRACK (object-001)
             (Dead-Reckoning on Occlusion)
                        ↓
                  WORLD MODEL
                        │
         ┌──────────────┴──────────────┐
         ▼                             ▼
   HUD PERCEPTION                3D VISUALIZER
 (Telemetry Card)         (Box + Label + Contour + •••)
```

## Files Touched
- `src/core/perception/objects/object-detector.js`: Detección multiseñal (apariencia, bordes/geometría, gradiente de movimiento con frame anterior, agarre manual y porcentaje de oclusión).
- `src/core/perception/objects/object-tracking-engine.js`: Tracking temporal con IDs persistentes `object-001`, ciclo de vida `ACTIVE` $\to$ `OCCLUDED` $\to$ `COASTING`, extrapolación inercial y buffer de trayectoria 3D.
- `src/core/perception/object-tracker.js`: Reemplazo del viejo tracker HSV por el motor multiseñal completo con selector de hint auxiliar.
- `src/core/perception/perception-engine.js`: Despacho de landmarks de manos al ObjectTracker y actualización de telemetría de objetos en stats.
- `src/core/spatial/entity.js`: Almacenamiento directo de `boundingBox`, `contour`, `trajectory` y metadata en `TrackedEntity`.
- `src/render/hand-visualizer-3d.js`: Rig 3D para objetos con bounding box alámbrico, billboard canvas sprite (`OBJECT #001`), contorno 3D y migas de trayectoria (`• • •`).
- `src/ui/telemetry-hud.js`: Tarjeta de telemetría **OBJECT PERCEPTION** con todas las métricas solicitadas.
- `index.html`: Botón de control `🎯 Objetos: ON/OFF`, selector de pistas auxiliares y contenedor estructurado de telemetría.
- `src/main.js`: Exposición de handles de diagnóstico en `window` (`__hud`, `__visualizer`, `__perceptionTracker`).
- `test/test-object-perception.js`: Suite completa de 32 tests automáticos de integración y tracking continuo.

## Verification
- `test/test-object-perception.js`: **32/32 tests pasados exitosamente**:
  - Persistencia de `object-001` a través de frames sucesivos.
  - Cálculo de velocidad cinemática suave.
  - Retención de tracking durante oclusión por agarre de mano (37% occluded, 63% visible).
  - Predicción *dead-reckoning* durante oclusión completa y reasociación limpia.
  - Ingestión completa en `SpatialWorldModel`.
- `npm run build`: Compilación exitosa en 472ms, 0 errores.
- Chrome DevTools MCP Runtime:
  - Ingestión de `object-001` verificada con actualización en vivo del HUD (`OBJECT #001`, `ACTIVE 94%`, `31% Occlusion`) y renderizado del rig 3D con migas de pan.

## Repository
- **GitHub:** [https://github.com/Breacorp/Air_gesture](https://github.com/Breacorp/Air_gesture)
- **Branch:** `main`
- **Latest Commit:** `40d880c`
