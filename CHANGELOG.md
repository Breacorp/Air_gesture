# Changelog

## [Unreleased]

### Added

- `src/theme-toggle.js` — persistent light/dark theme control for the Air Gesture landing.
- `air-gesture/index.html` — landing page for Air Gesture, presented as a Moderno Tech product.
- `public/manifest.webmanifest` — install metadata for the Air Gesture web app.
- `src/offline-ui.js` — PWA install and offline preparation controls.
- `public/service-worker.js` — app-shell caching and explicit local model preparation.
- `vercel.json` — routes the product landing to the subdomain root and the application to `/app`.
- `air-gesture/landing.css` — responsive landing styles with selectable Moderno Tech light and dark themes.
- `public/moderno-logo.png` — optimized official Moderno Tech logo for the landing.
- `public/moderno-logo-192.png` and `public/moderno-logo-512.png` — PWA icons using the official Moderno Tech mark.
- `public/air-gesture-onboarding.png` — authentic Air Gesture startup screen capture.

### Changed

- `src/core/perception/camera-manager.js` — checks camera support before model initialization and gives Mac users the loopback URL to use when a LAN HTTP address blocks camera access.
- `src/core/perception/perception-engine.js` — stops the camera and reports an error when Safari provides no playable video frames.
- `src/main.js` — checks browser camera access before downloading or initializing perception models.
- `test/test-camera-manager.js` — covers insecure origins, camera permission failures, and Safari inline playback settings.
- `vite.config.js` — separates landing and application assets in the generated offline cache manifest.
- `public/service-worker.js` — caches only the landing on first visit, stores app assets on demand, and preserves prepared models across app updates.
- `README.md` — documents static delivery and local-only processing for both online and offline app use.
- `README.md` — documents the HTTPS requirement for camera access on iPhone and other LAN devices.
- `air-gesture/index.html` — adds a theme control and applies the saved or system theme before rendering.
- `air-gesture/landing.css` — supports explicit light and dark themes and keeps the theme control responsive.
- `air-gesture/index.html` and `air-gesture/landing.css` — explain web and installable PWA modes, offline preparation, requirements, current release limitations, and responsive landing layouts.
- `index.html` — loads the PWA manifest and offline setup script without remote font dependencies.
- `vite.config.js` — builds the landing at `/` and the app at `/app`, versions the offline cache, and includes generated bundles in the service worker precache manifest.
- `src/style.css` — adapts the application controls, overlays, dialogs, and telemetry to mobile and tablet viewports.
- `src/core/perception/hand-tracker.js`, `src/core/perception/body-tracker.js`, and `src/core/perception/face-tracker.js` — load MediaPipe WASM and models only from local paths.
- `src/core/perception/perception-engine.js` — reports hand model initialization errors instead of continuing without hand tracking.
- `README.md` — documents PWA installation and offline preparation.
- `src/core/perception/face-tracker.js` — corrects mirrored face-yaw direction.
- `src/core/perception/generic-object-tracker.js` — adjusts object sampling and tracking defaults.
- `src/core/perception/perception-engine.js` — coordinates object tracker activation and cleanup.
- `src/games/air-game-api.js` — accepts both hand-array and handedness-map input formats.
- `src/games/air-games-lab.js` — updates game controls and hand-pointer feedback.
- `src/render/full-sensor-view.js` — scales hand visualization to apparent hand size.
- `src/render/hand-visualizer-3d.js` — scales 3D bone thickness with hand size.
- `test/test-perception-debug.js` — expects the generic object tracker to be disabled by default.
