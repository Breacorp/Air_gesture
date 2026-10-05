# HANDOFF - Air_gesture

## Session Context
- **Date:** 2026-10-05 15:08
- **Project:** Air_gesture
- **Milestone:** Percepción Multimodal: FaceTracker & Pipeline Digital Twin
- **Status:** ✓ Completado, Verificado y Documentado

## Summary
Evolución de la capa de percepción monomodal a un **Perception Engine Multimodal** desacoplado, incorporando:
1. **FaceTracker:** Tracking facial de 478 landmarks 3D con estimación de orientación de la cabeza (Pitch, Yaw, Roll), vector de mirada (*gaze*), apertura de boca y parpadeo.
2. **Object Perception Pipeline (Niveles 1 al 7):**
   - **Nivel 1 (Detection):** Detección de objetos físicos independientes del color (`ObjectDetector`), aislando objetos sostenidos en la mano y zonas de alto contraste.
   - **Nivel 2 (Segmentation):** Segmentación de silueta, máscara binaria y contornos (`ObjectSegmenter`).
   - **Nivel 3, 4 y 5 (Tracking & Pose):** Seguimiento espacio-temporal con estimación de velocidad y profundidad relativa monocular (`ObjectTrackingEngine`).
   - **Nivel 6 y 7 (Reconstruction & Digital Twin):** Acumulación temporal de vistas multi-ángulo mientras el objeto gira frente a la cámara, generando la geometría 3D y la textura UV (`MultiViewReconstructor`).
3. **Vínculo Físico-Virtual en SpatialWorldModel:**
   - La entidad física real (`obj-real-001`) declara `capabilities.physical = true` y enlaza `customProps.digitalTwinId = "twin-virtual-001"`.
   - La entidad gemela virtual (`twin-virtual-001`) declara `capabilities.virtual = true`, `capabilities.grabbable = true`, `capabilities.scalable = true`, `capabilities.rotatable = true` y referencia a su fuente física `customProps.physicalSourceId = "obj-real-001"`.

## Architecture: Multimodal Perception & Digital Twin

```text
                    CAMERA
                       │
                       ▼
              PERCEPTION ENGINE
                       │
      ┌────────────────┼─────────────────┐
      │                │                 │
      ▼                ▼                 ▼
     HAND             BODY              FACE (FaceTracker: Head Pose, Gaze, Expressions)
      │                │                 │
      └────────────────┼─────────────────┘
                       │
                       ▼
              OBJECT PERCEPTION
                       │
              ┌────────┼────────┐
              ▼        ▼        ▼
          DETECT     TRACK    SEGMENT
              │        │        │
              └────────┼────────┘
                       ▼
              DEPTH / RECONSTRUCTION (Multi-View Angle Accumulation)
                       │
                       ▼
                DIGITAL TWIN (3D Mesh + UV Canvas Texture + Point Cloud)
                       │
                       ▼
             SPATIAL WORLD MODEL
              [obj-real-01] <──(digitalTwinId)──> [twin-virtual-01]
                       │
                       ▼
             UNIVERSAL INTERACTION ENGINE (Intent + Target Capabilities -> Action)
```

## Files Touched
- `src/core/perception/face-tracker.js`: Tracker facial con MediaPipe FaceLandmarker (478 landmarks, head pose pitch/yaw/roll, gaze vector, mouth open, blink).
- `src/core/perception/objects/object-detector.js`: Detector de objetos físicos por contraste y oclusión de agarre manual independiente de color HSV.
- `src/core/perception/objects/object-segmenter.js`: Extractor de silueta, máscara binaria y parches de textura para materiales 3D.
- `src/core/perception/objects/object-tracking-engine.js`: Motor de tracking temporal, suavizado de trayectoria y profundidad monocular.
- `src/core/perception/objects/multi-view-reconstructor.js`: Acumulador de vistas angulares y generador de geometría 3D procedimental y point cloud.
- `src/core/perception/objects/digital-twin-manager.js`: Coordinador que vincula entidades físicas con sus gemelos virtuales digitales.
- `src/core/perception/perception-engine.js`: Orquestador maestro que integra Hands, Body, Face y DigitalTwin.
- `src/core/tracker.js`: Fachada HandTracker actualizada con accesores a FaceTracker y DigitalTwinManager.

## Verification
- `npm run build`: Compilación exitosa en 405ms, 59 módulos transformados, 0 errores.
- Pruebas sintéticas en runtime vía Chrome DevTools MCP:
  - Inicialización y candidate ingestion de `face-primary`: `headPose: {yaw: -12.4, pitch: 5.2, roll: 1.1}`, `gaze: {x: -0.15, y: 0.05}`, `mouthOpen: 0.22`, `confidence: 0.97`.
  - Ingestion de objeto real `obj-real-cup-01` enlazado con `digitalTwinId = "twin-virtual-cup-01"`.
  - Ingestion de gemelo digital `twin-virtual-cup-01` enlazado con `physicalSourceId = "obj-real-cup-01"`.
  - `linkedCorrectly: true` confirmado dentro de `SpatialWorldModel`.

## Repository
- **GitHub:** [https://github.com/Breacorp/Air_gesture](https://github.com/Breacorp/Air_gesture)
- **Branch:** `main`
