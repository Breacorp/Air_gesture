# Air Gesture — Project Instructions

## Project shape

- Air Gesture is a static Vite web application. Vercel serves built files; do not add a server runtime to production hosting.
- Camera inference runs locally in the browser with MediaPipe Tasks Vision and locally bundled models/WASM.
- `src/core/tracker.js` is a compatibility facade over `src/core/perception/perception-engine.js`.
- `src/main.js` connects the perception pipeline, motion engine, interaction engine, input adapters, games, and 3D Studio.
- `src/adapters/` contains browser and operating-system input adapters. The optional macOS Quartz daemon lives in `server/macos-bridge.py`; its WebSocket client is `src/adapters/macos/macos-client-adapter.js`.
- Three.js features live in `src/render/`, `src/studio/`, and `src/physics/`.
- Automated regression tests are standalone Node scripts in `test/test-*.js`.

## Engineering constraints

- Preserve local-first camera and gesture processing. Do not send camera frames or landmarks to a server.
- Keep the static web app useful when an optional native bridge is absent or denied permissions.
- Treat any native input bridge as privileged: bind only to loopback, authenticate each session, validate browser origin, allowlist commands and parameters, release held inputs on timeout/disconnect, and provide an immediate stop path.
- Never execute shell commands received from the browser. Do not claim cross-platform native support unless that platform's implementation and tests exist.
- Keep native operating-system integrations isolated behind adapters and platform-specific bridge modules.
- Avoid adding dependencies unless a verified requirement cannot be met with existing project facilities.
- Preserve unrelated user changes and untracked files. Stage only files in the task scope.
- Use the existing project conventions and keep Spanish user-facing UI text consistent with the application.

## Verification

- Run `npm run build` for production-build validation.
- Run relevant `node test/test-*.js` scripts for changed behavior; the complete suite can be run with:

  ```sh
  for file in test/test-*.js; do node "$file" || exit 1; done
  ```

- Run `node --check` on changed JavaScript and `git diff --check`.
- Clearly distinguish automated tests from camera, Accessibility-permission, and physical desktop tests that require a user's machine.

## Current platform support

- The web application is platform-independent within browser capabilities.
- Native global mouse input currently has a macOS-only Quartz implementation. No Windows native bridge or desktop application/installer is present.
- A browser tab may be throttled or suspended while backgrounded; do not promise camera tracking while minimized unless a separately running local application implements and verifies it.
