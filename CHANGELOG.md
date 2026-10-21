# Changelog

## [Unreleased]

### Added

- `air-gesture/index.html` — landing page for Air Gesture, presented as a Moderno Tech product.
- `air-gesture/landing.css` — responsive landing styles with Moderno Tech light and dark themes.
- `public/moderno-logo.png` — optimized official Moderno Tech logo for the landing.
- `public/air-gesture-onboarding.png` — authentic Air Gesture startup screen capture.

### Changed

- `README.md` — documents the landing route and its publication assets.
- `vite.config.js` — builds the application and landing as separate pages.
- `src/core/perception/face-tracker.js` — corrects mirrored face-yaw direction.
- `src/core/perception/generic-object-tracker.js` — adjusts object sampling and tracking defaults.
- `src/core/perception/perception-engine.js` — coordinates object tracker activation and cleanup.
- `src/games/air-game-api.js` — accepts both hand-array and handedness-map input formats.
- `src/games/air-games-lab.js` — updates game controls and hand-pointer feedback.
- `src/render/full-sensor-view.js` — scales hand visualization to apparent hand size.
- `src/render/hand-visualizer-3d.js` — scales 3D bone thickness with hand size.
