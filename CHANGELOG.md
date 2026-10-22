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

- `src/studio/air-3d-studio.js`, `src/studio/grip-interaction-controller.js`, and `src/core/interaction/action-resolver.js` — require a temporally confirmed, normalized pinch over an actual 3D model raycast before translating, rotating, or scaling it; bimanual changes require two confirmed owners and re-anchor across transitions.
- `src/studio/air-3d-studio.js`, `index.html`, `src/main.js`, `src/style.css`, and `README.md` — add three-axis quaternion rotation with a free-hand peace pose, combined or prioritized bimanual scale/rotation, optional camera orbit, and geometric pivot centering for imported models.
- `index.html`, `src/main.js`, `src/style.css`, and `README.md` — add Studio grip diagnostics and document the pinch-only interaction contract.
- `index.html`, `src/main.js`, `src/style.css`, and `public/manifest.webmanifest` — add an installed mobile app shell with safe-area support, a native-style bottom tab bar, and shortcuts to control, games, labs, and diagnostics.
- `index.html`, `src/main.js`, and `src/style.css` — prioritize a local-processing welcome state, optional camera-free exploration, profile selection, grouped tools, on-demand diagnostics, and unified mobile access to both 3D and physics labs.
- `index.html` and `src/style.css` — remove the floating scene label, stack game instructions on mobile, hide stale modal content after closing, and fit onboarding to short phone screens.
- `index.html` and `src/main.js` — give the welcome card a proper accessible heading and isolated live status, clarify Air Touch gesture instructions, and localize profile summaries.
- `src/main.js` and `src/adapters/macos/macos-client-adapter.js` — make the optional macOS WebSocket connection user-initiated and report unavailable daemon state in the control button instead of logging a failed connection during app startup.
- `src/core/perception/perception-engine.js` — keep hand tracking as the only startup inference and run body/face detectors only when enabled.
- `src/core/perception/body-tracker.js` — report failed local model initialization instead of leaving body tracking enabled.
- `src/core/perception/face-tracker.js` — report failed local model initialization and keep face tracking disabled on failure.
- `src/render/full-sensor-view.js` — add minimal hand-first, body, and diagnostic visualization modes, with visual-only hand smoothing and diagnostic-only face landmarks.
- `src/render/hand-visualizer-3d.js` — reduce 3D hand/body marker intensity and size, and keep the body rig out of standard mode.
- `index.html` — add the tracking visualization selector and accessible body/face controls.
- `src/main.js` — connect tracking display modes to both renderers, pass raw landmarks only to visualization, and add on-demand body/face controls.
- `src/style.css` — style tracking controls and markers for desktop and mobile layouts.
- `README.md` — document opt-in body/face inference and the separation between visual smoothing and interaction coordinates.
- `test/test-tracking-visualization.js` — verify opt-in model initialization, tracking modes, lost-track cleanup, and non-mutating visual smoothing.
- `test/test-grip-interaction-controller.js` — verify pinch confirmation, raycast gating, open-hand no-op behavior, bimanual ownership, release hysteresis, tracking grace, scale baselines, and action-resolver isolation.
- `index.html` and `src/style.css` — simplify the camera onboarding and control header, reduce neon effects, and use clearer, user-facing labels.
- `src/core/perception/camera-manager.js` — checks camera support before model initialization and gives Mac users the loopback URL to use when a LAN HTTP address blocks camera access.
- `src/core/perception/perception-engine.js` — stops the camera and reports an error when Safari provides no playable video frames.
- `src/main.js` — checks browser camera access before downloading or initializing perception models.
- `test/test-camera-manager.js` — covers insecure origins, camera permission failures, and Safari inline playback settings.
- `vite.config.js` — separates landing and application assets in the generated offline cache manifest.
- `public/service-worker.js` — caches only the landing on first visit, stores app assets on demand, and preserves prepared models across app updates.
- `vercel.json` — serves fingerprinted build assets with immutable caching to reduce repeat network requests.
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
