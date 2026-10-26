# Air Games Lab — Plan de Rediseño Premium (Moderno Tech Identity)

## Objetivo
Transformar Air Games Lab en una plataforma de entretenimiento por movimiento de alta calidad, con menú inicial, al menos 10 juegos pulidos, efectos visuales elegantes y sonido procedural premium. Sin rastros de estilo cyberpunk/neón; toda la identidad visual debe seguir el estilo de moderno.com.ar (minimalismo, lujo, elegancia, blanco/plata/azul profundo).

## Principios de Diseño
- **Identidad Visual**: Fondos oscuros sofisticados, acentos blancos/plata, superficies glassmorphism, sombras suaves. Cero neones.
- **Audio**: Sintetizador procedural (Web Audio API) con sonidos modernos (bases, pops, chimes). Sin archivos externos.
- **Mecánicas**: Cada juego debe tener una mecánica distintiva (golpear, esquivar, atrapar, apuntar, etc.), controles intuitivos y feedback inmediato.
- **Adictividad**: Rondas cortas, puntuación clara, récords persistentes, dificultad progresiva.

## Arquitectura
- `AirGamesLab` gestiona estados: `MENU`, `PLAYING`, `PAUSED`, `GAMEOVER`.
- Cada juego implementa interfaz: `{ id, name, start, update, stop, dispose }`.
- `GameMenu` (nuevo módulo) renderiza tarjetas elegantes con icono, nombre, descripción y dificultad.
- Selección por gesto pinch o pointer; fallback teclado.
- Persistencia de high scores en `localStorage`.

## Los 10+ Juegos (Mecánicas Distintas)
1. **Air Pong** (existente) — Movimiento continuo, dos palas.
2. **Bubble Blaster** — Pellizco para reventar burbujas, apuntado.
3. **Air Hockey** — Mesa horizontal, empuje 2D, porterías.
4. **Air Archery** — Apuntar con una mano, tensar con la otra, disparo por separación.
5. **Air Boxing** — Golpes rápidos, esquivas laterales, contraataque.
6. **Air Basketball** — Agarrar y lanzar con física, enceste.
7. **Sword Duel** — Ataques direccionales, bloqueo defensivo.
8. **Motion Racer** — Volante con dos manos, turbo por gesto.
9. **Pop Attack** — Reacción rápida, tocar objetivos antes de desaparecer.
10. **Gravity Lab** — Agarrar, mover y rotar objetos 3D para resolver puzzles.
11. **Space Defender** — Mover nave, disparar pinch, habilidad defensiva.
12. **Color Match** — Emparejar por color con pinch.

## Efectos Visuales Premium
- **Sombras Suaves**: Sombras proyectadas que siguen al objeto (depth).
- **Glassmorphism**: Superficies semitransparentes con blur para UI y paneles.
- **Partículas Elegantes**: Explosiones suaves, rastros de movimiento (trails) con desvanecimiento.
- **Transiciones Orgánicas**: Ease-in-out para aparición/desaparición de elementos.
- **Rejilla Animada**: Fondo sutil con líneas finas.

## Audio Procedural Premium
- **Pops/Clicks**: Sweeps de frecuencia corta y limpia.
- **Impactos**: Ruido blanco filtrado con decay rápido.
- **Chimes**: Acorde ascendente suave para goles/logros.
- **Ambiente**: Ruido de fondo muy sutil (opcional).

## Integración UI
- Overlay full-screen `games-menu` dentro del lab.
- Botón "Salir al menú" en cada juego.
- Estados: `idle` → menú, `playing`, `paused`, `gameover`.
- Persistencia de high score en `localStorage`.

## Validación
- Tests `test/test-air-games-menu.js`.
- Build + check.
- Auditoría visual: cero neones, estilo Moderno Tech.

## Fases de Implementación
1. **Skeleton menu + estado** (1 PR) — Menú funcional con tarjetas clickeables.
2. **Portar juegos existentes** (1 PR) — Air Pong, Fruit Ninja, Basketball, Bubble Blaster, Air Hockey adaptados al nuevo contrato.
3. **Agregar 2-3 juegos por PR** — Empezar por Archery, Boxing, Basketball.
4. **Pulido visual y sonido** — Glassmorphism, sombras, audio premium, high scores.