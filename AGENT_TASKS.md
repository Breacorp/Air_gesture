# Agent Tasks

This file tracks project work for coding agents. Epics in this document do not imply that platform support is implemented; check the code and validation evidence before making such claims.

## E1 — Secure global computer control

**Scope:** Let the web app optionally control the local macOS desktop through a hardened loopback bridge. Keep tracking, games, and 3D features available without the bridge. Do not claim Windows support or minimized-browser tracking without a native implementation and verification.

**Constraints:** Work on the existing `main` branch as requested. Do not create another repository or branch. Do not include unrelated local artifacts in commits. Do not transmit camera frames, landmarks, or arbitrary shell commands to the bridge.

### Tasks

- [ ] **T01 — Harden the macOS local bridge:** Inspect the existing Quartz daemon; replace unauthenticated WebSocket access with loopback-only, origin-checked, per-session authenticated connections, strict command allowlisting, bounded input validation, safe disconnect cleanup, and explicit permission/status reporting.
- [ ] **T02 — Add safe global pointer controls:** Extend the existing macOS adapter and gesture pipeline for deliberate activation, absolute pointer movement, click/right-click/double-click, drag, scrolling, command rate limiting, pointer calibration/sensitivity, and emergency stop. Preserve ordinary browser controls when the bridge is unavailable.
- [ ] **T03 — Integrate user-visible status and setup guidance:** Add the Control de computadora UI, real connection and permission status, connect/activate/pause/stop controls, macOS installation and Accessibility instructions, and clear browser-only fallback behavior.
- [ ] **T04 — Verify security and lifecycle behavior:** Add automated tests for authorized and rejected origins/sessions, allowlisted commands, rate/shape validation, held-button release, tracking loss, disconnects, and absent bridge; run all project tests and production build. Record physical desktop and background-camera limitations accurately.

## Platform support evidence

- macOS: an existing Python Quartz/CoreGraphics bridge is present; it must be secured and tested before enabling it for global input.
- Windows: no native integration is present. Support remains unimplemented.
- Minimized/closed web page: browser camera and JavaScript scheduling may be throttled or stopped. Continuous tracking requires a separate local application and is not promised by the web page alone.
