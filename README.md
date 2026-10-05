# ModernOS Spatial // Motion Engine

Motor de interacción humana tridimensional en tiempo real, 100% local y determinístico. Convierte la posición anatómica de cada dedo y de ambas manos en un flujo cinemático desacoplado listo para alimentar interfaces espaciales, avatares digitales y control de sistemas operativos.

---

## 🎯 Arquitectura por Fases

```text
[ FASE 1: COMPLETADA ]
Cámara RGB (60 FPS) ──► MediaPipe Local ──► Spatial Calibrator ──► Motion Engine

------------------------------------------------------
[ FASE 2: COMPLETADA ]
Motion Engine ──► Interaction Engine (FSM) ──► Event Bus ──► macOS CoreGraphics Bridge

------------------------------------------------------
[ FASE 2.5: COMPLETADA - PRECISIÓN Y ESTABILIZACIÓN ]
• Pinch Freeze Anchor: Bloqueo de posición del cursor durante el click para evitar desplazamientos involuntarios.
• Separación estricta de Gesto vs. Acción (Pinch Start/Move/End vs. Click/Drag/3D Grab).
• Nomenclatura normalizada: relativeDepth y cameraDepth en lugar de centímetros absolutos.
• Matriz de Calidad en Vivo (Pointer Quality Score: Jitter, Confianza, Estabilidad de Click).
• Modo Relativo (Trackpad) y Absoluto seleccionables en tiempo real.

------------------------------------------------------
[ FASE 3: EN PREPARACIÓN ]
             ┌── ModernOS Desktop Window Manager
Event Bus ───┼── Avatar Mocap 3D Rig
             └── Spatial AR (Manipulación de objetos en profundidad Z real)
```

---

## 📐 Contrato Cinemático Desacoplado (`Motion Engine`)

El `Motion Engine` no depende de MediaPipe ni asume que el $Z$ de la cámara sea profundidad métrica. Emite el siguiente contrato estandarizado:

```json
{
  "timestamp": 1718293021,
  "handedness": "Right",
  "confidence": 0.94,
  "wrist": {
    "position": { "x": 0.24, "y": -0.15, "z": -0.05 },
    "velocity": { "x": 0.02, "y": 0.01, "z": 0.00 },
    "acceleration": { "x": 0.00, "y": 0.00, "z": 0.00 },
    "speed": 0.025
  },
  "palm": {
    "position": { "x": 0.25, "y": -0.05, "z": -0.04 },
    "normal": { "x": 0.02, "y": 0.15, "z": -0.98 },
    "orientation": { "roll": -5, "pitch": 8, "yaw": 2 },
    "isFacingCamera": true
  },
  "scale": {
    "calibratedZ": -0.05,
    "depthCm": 48.2,
    "scaleFactor": 1.04,
    "apparentSpanPx": 185.3
  },
  "fingers": {
    "thumb":  { "extension": 0.88, "flexion": 0.12, "angles": { "mcp": 162, "pip": 170, "dip": 175 } },
    "index":  { "extension": 0.92, "flexion": 0.08, "angles": { "mcp": 175, "pip": 178, "dip": 179 } },
    "middle": { "extension": 0.90, "flexion": 0.10, "angles": { "mcp": 173, "pip": 176, "dip": 177 } },
    "ring":   { "extension": 0.85, "flexion": 0.15, "angles": { "mcp": 170, "pip": 172, "dip": 174 } },
    "pinky":  { "extension": 0.82, "flexion": 0.18, "angles": { "mcp": 168, "pip": 170, "dip": 171 } }
  },
  "distances": {
    "thumbIndex": 0.22,
    "thumbMiddle": 0.26,
    "palmWidth": 0.18,
    "handSpan": 0.38
  },
  "pose": {
    "openness": 0.87,
    "flexion": 0.13,
    "isFist": false,
    "isPointing": false,
    "isPeace": false,
    "isOpenPalm": true,
    "isPinchThumbIndex": false,
    "pinchStrengthThumbIndex": 0.0
  }
}
```

---

## 🚀 Ejecución Local

El servidor de desarrollo ya está corriendo en:
```text
http://127.0.0.1:5173/
```

### Características de la Fase 1
1. **100% Local y Offline**: Archivos WASM y el modelo `hand_landmarker.task` residen en `public/`, sin dependencias externas.
2. **Calibración de Profundidad $Z$**: Botón "Calibrar Z" para fijar el plano de trabajo a la distancia del escritorio.
3. **Rig 3D en Three.js**: Visualización en tiempo real de los 21 nodos, huesos articulados y vector normal de la palma.
4. **Telemetría Biomecánica**: Paneles independientes para mano izquierda (magenta) y derecha (cyan), con barras de flexión por dedo y detección de gestos emergentes.
5. **Inspector de Contrato JSON**: Terminal en vivo para inspeccionar, pausar o copiar el stream de datos crudos.
