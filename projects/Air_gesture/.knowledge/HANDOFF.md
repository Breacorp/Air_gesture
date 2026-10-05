# HANDOFF - Air_gesture

## Session Context
- **Date:** 2026-10-05 15:36
- **Project:** Air_gesture
- **Milestone:** Plataforma de Juegos Espaciales: AirGameAPI & Air Games Lab (Pong, Fruit Ninja, Basketball)
- **Status:** ✓ Completado, Verificado con 20 Tests Unitarios/Integración y Desplegado en GitHub

## Summary
Transformación arquitectónica de Air Gesture: evolución de una herramienta de gestos a una **Plataforma de Juegos Espaciales Controlados por Cámara**, donde el cuerpo, las manos y los objetos son el joystick físico universal:

1. **Universal Game Interaction API (`AirGameAPI`):**
   - Desacoplamiento total de la lógica de videojuegos respecto a MediaPipe y visión computacional cruda.
   - API unificada orientada a eventos e intenciones cinemáticas:
     - `hand.move`: Posición normalizada, velocidad tridimensional $(v_x, v_y, v_z)$, rapidez e indicador de agarre.
     - `hand.slash`: Detección cinemática de tajos/cortes de espada de alta velocidad ($P_1 \to P_2 \to P_3$) con cálculo geométrico de intersección segmento-círculo.
     - `hand.pinch` / `hand.pinch_release`: Detección precisa de selección o sujeción.
     - `hand.grab` / `hand.release`: Sujeción física y disparo inercial de objetos con impulso cinético real.
     - `body.jump` / `body.crouch` / `body.pose`: Eventos corporales de esquiva, salto y postura.
     - `object.move` / `object.throw`: Seguimiento de controles físicos de juego.
   - Consulta directa del modelo espacial: `world.hands`, `world.body`, `world.objects`, `world.entities`, `world.relations`.
2. **Air Games Lab (`AirGamesLab`):**
   - **🏓 Air Pong:** Tenis de mesa espacial dual-hand o 2 jugadores (Mano Izq = Paleta Izq, Mano Der = Paleta Der o vs IA). Transferencia de momento tangencial según la velocidad vertical de la paleta.
   - **🍉 Air Fruit Ninja:** Tajos aéreos de espada espacial. Frutas generadas con trayectorias parabólicas físicas (Sandías, Naranjas, Manzanas, Plátanos y Bombas). División en mitades con rotación angular, partículas de jugo y combos.
   - **🏀 Air Basketball:** Cancha física con aro, tablero y red. Detección de aproximación de mano $\to$ `GRAB` (pellizco) $\to$ `RELEASE` con vector de velocidad de mano $\to$ parábola gravitacional, rebotes y detección de canasta limpia (*swish*).
3. **Audio Espacial Procedural (`AirGameAudio`):**
   - Generación de efectos sonoros mediante Web Audio API sin dependencias de archivos de audio externos (golpes de paleta, tajos de espada, explosiones, canastas swish y botes).
4. **UI Arcade Moderna:**
   - Botón `🎮 Air Games` en la barra superior.
   - Modal arcade translúcido con pestañas para alternar entre juegos a 60 FPS, botón de reinicio y mute.

## Architecture: Spatial Gaming Platform

```text
                  AIR GESTURE
                       │
                 SPATIAL ENGINE
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
      HAND            BODY          OBJECT
        │              │              │
        └──────────────┼──────────────┘
                       ↓
                UNIVERSAL INTENT
                       ↓
               AIR GAME ENGINE API (AirGameAPI)
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
     Air Pong    Fruit Ninja    Air Basketball
  (Dual Paddle)  (Blade Slash)   (Kinetic Throw)
```

## Files Touched
- `src/games/air-game-api.js`: Universal Game Interaction API con listeners, despachador de cinemática, detector de tajos e intersecciones geométricas.
- `src/games/air-games-lab.js`: Motor de ejecución y renderizado 60 FPS de Air Pong, Air Fruit Ninja y Air Basketball.
- `src/games/air-game-audio.js`: Sintetizador de audio Web Audio API procedural para sonido arcade.
- `src/main.js`: Integración de `airGameAPI`, actualización en frame loop, cableado de modal y exposición en `window`.
- `index.html`: Botón de cabecera `🎮 Air Games` y modal dialog arcade con selector de juegos.
- `src/style.css`: Estilizado futurista con glassmorphism, botones arcade y contenedor responsivo.
- `test/test-air-games.js`: Suite automatizada de 20 tests unitarios y de integración de la plataforma de juegos.

## Verification
- `test/test-air-games.js`: **20/20 tests pasados (100%)**:
  - Emisión de eventos `hand.move` y cálculo cinemático.
  - Detección de tajos de alta velocidad (`hand.slash`) y cálculo de velocidad de corte.
  - Algoritmo de colisión de corte `checkLineCircleIntersection`.
  - Transición fluida entre Pong, Fruit Ninja y Basketball.
  - Físicas de lanzamiento de baloncesto y corte de frutas.
- `test/test-object-perception.js`: **32/32 tests pasados (100%)** (sin regresiones).
- `npm run build`: Compilación exitosa en 299 ms sin advertencias ni errores.
- Chrome DevTools MCP:
  - Apertura interactiva del modal `games-lab-modal` verificada con captura de pantalla.
  - Renderizado en vivo de Air Pong, Fruit Ninja y Basketball.

## Repository
- **GitHub:** [https://github.com/Breacorp/Air_gesture](https://github.com/Breacorp/Air_gesture)
- **Branch:** `main`
- **Latest Commit:** `2723ab7`
