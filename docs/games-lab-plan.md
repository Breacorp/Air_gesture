# Air Games Lab — Plan de menú inicial y expansión (+10 juegos)

## Objetivo
Mostrar un menú de selección al entrar a Air Games Lab, en vez de auto-iniciar Air Pong. Incluir al menos 10 juegos gestuales.

## Arquitectura propuesta
- `AirGamesLab` pasa a estado `MENU` por defecto.
- Nuevo módulo `games/game-menu.js` con grilla de tarjetas (icono, nombre, descripción, dificultad).
- Selección por gesto pinch o pointer; teclado fallback.
- Cada juego implementa interfaz `{ id, name, start, update, stop, dispose }`.
- `AirGamesLab` orquesta spawn/clean del juego activo.

## Juegos (10+)
1. Air Pong (existente)
2. Bubble Pop — pinch para explotar burbujas
3. Target Shooter — fijar mano y disparar a dianas
4. Simon Says — secuencia de gestos
5. Rhythm Clap — seguir ritmo
6. Obstacle Runner — evitar obstáculos moviendo mano
7. Gravity Wells — atraer/repeler objetos
8. Hand Tennis — saques y voleas
9. Color Match — emparejar por color
10. Maze Trace — seguir camino con dedo
11. UFO Defense — destruir naves
12. Finger Draw Race — dibujar forma más rápido

## Integración UI
- Overlay full-screen `games-menu` dentro del lab.
- Botón "Salir al menú" en cada juego.
- Estado `idle` -> muestra menú, `playing`, `paused`, `gameover`.
- Persistencia de high score en localStorage.

## Validación
- Tests `test/test-air-games-menu.js`.
- Build + check.

## Fases
1. Skeleton menu + estado (1 PR)
2. Portar Air Pong a nuevo contrato (1 PR)
3. Agregar 2-3 juegos por PR
4. Pulido visual y sonido