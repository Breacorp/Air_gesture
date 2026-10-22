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
http://127.0.0.1:5180/
```

### Landing de Air Gesture

La landing de Moderno Tech está disponible en la raíz del sitio; la aplicación está en `/app/`.
En el subdominio de producción esas rutas corresponden a `air-gesture.moderno.com.ar/` y
`air-gesture.moderno.com.ar/app`.
En iPhone, la cámara requiere abrir la app desde HTTPS y permitir el acceso a la cámara en Safari.
Las direcciones HTTP con una IP local no son un origen seguro para la cámara; para probar desde
otro dispositivo, usá el subdominio HTTPS publicado.
El build de Vite incluye ambas páginas, el logotipo oficial de Moderno Tech y una captura real
de la pantalla de inicio de Air Gesture. La app se puede instalar como PWA en navegadores
compatibles; para usarla offline, abrí la landing con conexión y prepará los modelos locales
(aprox. 50 MB). No hay instaladores nativos publicados. El service worker guarda la app y sus
archivos generados durante el build; el seguimiento utiliza modelos y WASM locales, sin fallbacks a CDN.
El control del cursor de macOS requiere iniciar manualmente el daemon opcional desde la raíz del
proyecto con `python3 server/macos-bridge.py`; la app web no intenta conectarse a ese servicio al
abrirse. Si no está iniciado, el control nativo informa que no está disponible y el resto de la
app continúa funcionando.
Al instalarla en un móvil, Air Gesture se abre como aplicación independiente, con navegación
propia para Control, Juegos, Laboratorios y Diagnóstico, y respeta las áreas seguras de la pantalla.
En el navegador normal, esta navegación de la PWA permanece oculta.
La pantalla inicial explica cómo empezar, resume los gestos del perfil seleccionado y permite
activar la cámara o explorar sin ella. El estado de preparación se anuncia por separado para
lectores de pantalla. En Control, los ajustes de cámara y calibración aparecen al iniciar el seguimiento; el panel de
percepción completo se reserva para Diagnóstico. Los Juegos y Laboratorios se pueden explorar sin
activar la cámara, y el modo de uso está disponible en la barra de la aplicación.
El procesamiento de cámara y gestos es local. La primera visita/preparación sí descarga los
recursos desde el sitio; una vez preparada, la app puede ejecutarse offline sin solicitudes al
servidor durante el uso.
El service worker guarda primero la landing, sin descargar el bundle de la aplicación. El bundle
se descarga y se guarda al abrir `/app/`; los modelos y recursos WASM (aprox. 50 MB) solo se
descargan al usar la app o elegir «Preparar para usar offline». Vercel entrega archivos estáticos:
no recibe video ni realiza inferencias. Los modelos preparados se guardan en un caché local separado
y se conservan al actualizar el shell de la aplicación.

El seguimiento de manos es el único que se carga al iniciar la cámara y permanece como entrada
principal de gestos. El análisis corporal y facial es opcional: se activa desde Diagnóstico avanzado
y sus modelos se inicializan bajo demanda. La visualización Estándar muestra únicamente las manos;
Corporal agrega articulaciones principales y Diagnóstico permite inspeccionar landmarks corporales
y faciales sin dibujar marcadores sobre el rostro en el uso normal. El suavizado de la superposición
es visual y no altera las coordenadas usadas por gestos, juegos o interacciones 3D.

### Air 3D Studio: manipulación por pinza y rotación libre

Los modelos STL, OBJ y los modelos de ejemplo solo se mueven después de confirmar una pinza sobre
el modelo mediante el rayo 3D. La mano libre puede activar la pose de victoria (V) para rotar el
objeto; una mano abierta normal permanece neutral. Con dos pinzas confirmadas se puede escalar y
rotar usando la distancia y orientación tridimensional de las manos. El selector permite priorizar
escala o rotación si el modo combinado resulta difícil de controlar. Otro selector decide si la
rotación afecta al objeto o a la órbita de la cámara. Las transformaciones usan referencias
capturadas al iniciar cada modo, cuaterniones para evitar bloqueos de orientación y un pivote
centrado a partir de los límites geométricos del archivo. Una pérdida breve de seguimiento congela
la transformación; si supera la tolerancia, libera el agarre. El botón «Restablecer vista» devuelve
el modelo y la cámara a su orientación inicial.

### Características de la Fase 1
1. **100% Local y Offline**: Archivos WASM y el modelo `hand_landmarker.task` residen en `public/`, sin dependencias externas.
2. **Calibración de Profundidad $Z$**: Botón "Ajustar" para fijar el plano de trabajo a la distancia actual de la mano.
3. **Rig 3D en Three.js**: Visualización en tiempo real de los 21 nodos, huesos articulados y vector normal de la palma.
4. **Telemetría Biomecánica**: Paneles independientes para mano izquierda (magenta) y derecha (cyan), con barras de flexión por dedo y detección de gestos emergentes.
5. **Inspector de Contrato JSON**: Terminal en vivo para inspeccionar, pausar o copiar el stream de datos crudos.
