/**
 * ModernOS Spatial Motion Engine - Main Bootstrap
 * Coordinates Tracker, Motion Engine, Interaction Engine (FSM),
 * OS Adapters (Browser & macOS Native CoreGraphics), and Telemetry HUD.
 */

import { HandTracker } from './core/tracker.js';
import { MotionEngine } from './core/motion-engine.js';
import { InteractionEngine } from './core/interaction-engine.js';
import { globalEventBus } from './core/event-bus.js';
import { HandVisualizer3D } from './render/hand-visualizer-3d.js';
import { TelemetryHUD } from './ui/telemetry-hud.js';
import { BrowserAdapter } from './adapters/browser/browser-adapter.js';
import { MacOSClientAdapter } from './adapters/macos/macos-client-adapter.js';

// Profiles & Action Routing
import { ProfileManager } from './profiles/profile-manager.js';
import { ActionMapper } from './input/action-mapper.js';
import { AirTouchProfile } from './profiles/air-touch-profile.js';
import { UniversalProfile } from './profiles/universal-profile.js';
import { GoogleEarthProfile } from './profiles/google-earth-profile.js';
import { MediaProfile } from './profiles/media-profile.js';
import { GameProfile } from './profiles/game-profile.js';
import { BlenderProfile } from './profiles/blender-profile.js';

// Holographic Spatial CAD Studio
import { Air3DStudio } from './studio/air-3d-studio.js';
import { SpatialDirectTouch } from './interaction/spatial-direct-touch.js';
import { AirPhysicsLab } from './physics/air-physics-lab.js';
import { AirGameAPI } from './games/air-game-api.js';
import { AirGamesLab } from './games/air-games-lab.js';
import { gameAudio } from './games/air-game-audio.js';

// DOM References
const videoEl = document.getElementById('webcam-video');
const viewportEl = document.getElementById('viewport-3d');
const cameraModal = document.getElementById('camera-modal');
const btnStartCamera = document.getElementById('btn-start-camera');
const initLoader = document.getElementById('init-loader');
const initStatusText = document.getElementById('init-status-text');

// Navigation Controls
const btnToggleAr = document.getElementById('btn-toggle-ar');
const arLabel = document.getElementById('ar-label');
const btnCalibrateZ = document.getElementById('btn-calibrate-z');
const btnToggleMirror = document.getElementById('btn-toggle-mirror');
const btnSwapHands = document.getElementById('btn-swap-hands');
const btnToggleMacos = document.getElementById('btn-toggle-macos');
const macosLabel = document.getElementById('macos-label');
const btnToggleJson = document.getElementById('btn-toggle-json');
const jsonDrawer = document.getElementById('json-drawer');
const btnPauseJson = document.getElementById('btn-pause-json');
const btnCopyJson = document.getElementById('btn-copy-json');
const btnCloseJson = document.getElementById('btn-close-json');

// Interactive Testing Targets
const testBtnClick = document.getElementById('test-btn-click');
const testClickCount = document.getElementById('test-click-count');
const testDragBox = document.getElementById('test-drag-box');
const testScrollContainer = document.getElementById('test-scroll-container');
const dockFsmBadge = document.getElementById('dock-fsm-badge');
const dockIntentBadge = document.getElementById('dock-intent-badge');
const dockContextBadge = document.getElementById('dock-context-badge');

let clickCounter = 0;
let dragBoxOffset = { x: 0, y: 0 };

// Initialize Engines
const motionEngine = new MotionEngine();
const interactionEngine = new InteractionEngine(window.screen.width, window.screen.height);
const tracker = new HandTracker();
const visualizer = new HandVisualizer3D(viewportEl);
const studio = new Air3DStudio(visualizer.scene, visualizer.camera, visualizer.renderer);
const physicsLab = new AirPhysicsLab(visualizer.scene, visualizer.camera, visualizer.renderer);
const spatialDirectTouch = new SpatialDirectTouch();
const hud = new TelemetryHUD({
  fpsCounter: document.getElementById('fps-counter'),
  inferenceTime: document.getElementById('latency-counter'),
  handsBadge: document.getElementById('hands-badge')
});

// Air Games Lab Platform & Universal Game Interaction API
const airGameAPI = new AirGameAPI(tracker.worldModel, interactionEngine);
const gamesCanvasContainer = document.getElementById('games-canvas-container');
const gamesLab = new AirGamesLab(gamesCanvasContainer, airGameAPI);

// Expose Spatial World Model globally for developer inspection
window.__spatialWorld = tracker.worldModel;

// Initialize OS & Input Adapters
const browserAdapter = new BrowserAdapter();
browserAdapter.enable();

const macosAdapter = new MacOSClientAdapter('ws://127.0.0.1:8765');
macosAdapter.connect();

// Connect Adapters & Spatial Scene Providers to Universal Interaction Engine
interactionEngine.setAdapters({ macos: macosAdapter, browser: browserAdapter });
interactionEngine.registerSceneProviders({ studio, physicsLab, spatialDirectTouch });

// Profile Registry (Presets layer for UI feedback & backward compatibility)
const profileManager = new ProfileManager();
profileManager.register(AirTouchProfile);
profileManager.register(UniversalProfile);
profileManager.register(GoogleEarthProfile);
profileManager.register(MediaProfile);
profileManager.register(GameProfile);
profileManager.register(BlenderProfile);
profileManager.setProfile('air_touch');

const actionMapper = new ActionMapper(profileManager, macosAdapter, browserAdapter);
actionMapper.context.interactionEngine = interactionEngine;

// Debugging / Inspection handles
window.__interactionEngine = interactionEngine;
window.__macosAdapter = macosAdapter;
window.__profileManager = profileManager;
window.__globalEventBus = globalEventBus;
window.__hud = hud;
window.__visualizer = visualizer;
window.__perceptionTracker = tracker;
window.__airGameAPI = airGameAPI;
window.__gamesLab = gamesLab;

// When macOS daemon reports actual screen bounds, update interaction engine
macosAdapter.onScreenResolution = (screen) => {
  console.log(`[Main] Calibrated screen mapping to ${screen.width}x${screen.height}`);
  interactionEngine.setScreenResolution(screen.width, screen.height);
};

// Permanent OS Input Status Pill Elements
const systemStatusPill = document.getElementById('system-status-pill');
const statusPillText = document.getElementById('status-pill-text');
const failsafeBanner = document.getElementById('failsafe-banner');
const failsafeText = document.getElementById('failsafe-text');

function updateSystemStatus(state) {
  if (!systemStatusPill || !statusPillText) return;
  systemStatusPill.classList.remove('status-active', 'status-paused', 'status-off');

  if (state === 'active') {
    systemStatusPill.classList.add('status-active');
    statusPillText.textContent = 'AIR GESTURE ACTIVE';
  } else if (state === 'paused') {
    systemStatusPill.classList.add('status-paused');
    statusPillText.textContent = 'AIR GESTURE PAUSED';
  } else {
    systemStatusPill.classList.add('status-off');
    statusPillText.textContent = 'AIR GESTURE OFF';
  }
}

function showFailsafeBanner(text) {
  if (!failsafeBanner || !failsafeText) return;
  failsafeText.textContent = text;
  failsafeBanner.classList.remove('hidden');
  clearTimeout(failsafeBanner._timer);
  failsafeBanner._timer = setTimeout(() => {
    failsafeBanner.classList.add('hidden');
  }, 3200);
}

macosAdapter.onStatusChange = ({ connected }) => {
  if (connected) {
    if (btnToggleMacos && !macosAdapter.isEnabled) {
      macosLabel.textContent = 'Control macOS: Listo';
    }
  } else {
    if (btnToggleMacos) {
      btnToggleMacos.classList.remove('active');
      macosLabel.textContent = 'Control macOS: Off';
      updateSystemStatus('off');
    }
  }
};

// ActionMapper handles OS & Virtual Cursor input dispatching per profile.
// The listeners below update the local in-browser testing targets.
globalEventBus.on('drag_start', () => {
  if (testDragBox) testDragBox.classList.add('dragging');
});

globalEventBus.on('drag_move', (e) => {
  if (testDragBox) {
    dragBoxOffset.x += e.delta.x;
    dragBoxOffset.y += e.delta.y;
    testDragBox.style.transform = `translate3d(${dragBoxOffset.x}px, ${dragBoxOffset.y}px, 0)`;
  }
});

globalEventBus.on('drag_end', () => {
  if (testDragBox) testDragBox.classList.remove('dragging');
});

globalEventBus.on('scroll', (e) => {
  if (testScrollContainer) {
    testScrollContainer.scrollTop += e.deltaY;
  }
});

globalEventBus.on('interaction_state_change', (e) => {
  browserAdapter.setState(e.to);
  if (dockFsmBadge) {
    dockFsmBadge.textContent = e.to;
    dockFsmBadge.className = `badge-fsm state-${e.to.toLowerCase()}`;
  }
});

// Universal Spatial Engine Telemetry (Pure Intent & Context)
globalEventBus.on('spatial_intent', ({ intent, context }) => {
  if (dockIntentBadge && intent) {
    dockIntentBadge.textContent = `INTENT: ${intent.type.toUpperCase()}`;
  }
  if (dockContextBadge && context) {
    const envLabel = context.environment === 'desktop' ? 'DESKTOP' : context.environment.toUpperCase();
    dockContextBadge.textContent = `CTX: ${envLabel}`;
  }
});

// Profile Switcher Controls
const profileButtons = document.querySelectorAll('.btn-profile');
const profileGuideText = document.getElementById('profile-guide-text');
const compactProfileBadge = document.getElementById('compact-profile-badge');
const compactFpsBadge = document.getElementById('compact-fps-badge');
const compactGestureHint = document.getElementById('compact-gesture-hint');

const PROFILE_GUIDES = {
  air_touch: 'Air Touch: ☝️ Cursor • 🤏 Click/Drag • ✌️/✋ Scroll • 🖐️🖐️ Zoom • 🙌 Atajos SO',
  universal: 'Universal: ☝️ Mover • 🤏 Click / Drag • ✌️ Scroll • ✋ Pausa',
  google_earth: 'Earth 3D: ☝️ Cursor • 🤏 Agarrar Tierra y Pan • ✋✋ Zoom Altitud • ✋↺ Rotación • ✌️ Inclinar',
  media: 'Media: ✋ Mantener = Play/Pausa • 💨 Swipe = Skip Tema • ✌️ Scroll = Volumen • 🤏 Click',
  game: 'Gaming: 🕹️ Mano Izq. Inclinación = WASD / Puño = Salto • 🎯 Mano Der. Apuntar / Disparar',
  blender: 'Blender 3D: ☝️ Mover • 🤏 Seleccionar / Transformar • 🖐️🖐️ Escalar y Rotar órbita • ✌️ Zoom'
};

profileButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const profileId = btn.getAttribute('data-profile');
    const newProfile = profileManager.setProfile(profileId);
    if (newProfile) {
      profileButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const guide = PROFILE_GUIDES[profileId] || newProfile.description;
      if (profileGuideText) profileGuideText.textContent = guide;
      if (compactProfileBadge) compactProfileBadge.textContent = newProfile.name;
      if (compactGestureHint) compactGestureHint.textContent = guide;
    }
  });
});

// Background / Compact Mode Toggle (Minimizes Control Center to run in background)
const btnCompactMode = document.getElementById('btn-compact-mode');
const compactHud = document.getElementById('compact-hud');
const btnRestoreUi = document.getElementById('btn-restore-ui');

if (btnCompactMode && compactHud && btnRestoreUi) {
  btnCompactMode.addEventListener('click', () => {
    document.body.classList.add('mode-compact');
    compactHud.classList.remove('hidden');
  });

  btnRestoreUi.addEventListener('click', () => {
    document.body.classList.remove('mode-compact');
    compactHud.classList.add('hidden');
  });
}

// App State
let isArMode = true;
let isMirror = true;
let lastDetectedHands = { Left: false, Right: false };
let latestRawLandmarksForCalibration = null;

// Tracker Frame Pipeline
tracker.setOnFrame((frameData) => {
  const { hands, worldModel, timestamp, stats, videoWidth, videoHeight } = frameData;

  // 1. Update Telemetry Stats
  hud.updateStats(stats);
  if (compactFpsBadge && stats && stats.fps !== undefined) {
    compactFpsBadge.textContent = `${stats.fps} FPS`;
  }

  const currentFrameHands = { Left: false, Right: false };
  const kinematicData = { Left: null, Right: null, timestamp };
  let primaryRawIndexPoint = null;

  // 2. Process each detected hand through the decoupled Motion Engine
  for (const handData of hands) {
    const { landmarks, handedness, confidence } = handData;
    currentFrameHands[handedness] = true;

    if (handedness === 'Right' || !latestRawLandmarksForCalibration) {
      latestRawLandmarksForCalibration = { landmarks, width: videoWidth, height: videoHeight };
    }

    if (landmarks && landmarks[8]) {
      if (handedness === 'Right' || !primaryRawIndexPoint) {
        primaryRawIndexPoint = { x: landmarks[8].x, y: landmarks[8].y };
      }
    }

    const kinematicState = motionEngine.updateHand(
      landmarks,
      handedness,
      confidence,
      timestamp,
      videoWidth,
      videoHeight
    );

    if (kinematicState) {
      kinematicData[handedness] = kinematicState;

      // Attach full kinematics and emergent poses to SpatialWorldModel Hand Entity
      const handEntity = worldModel.getEntity(`hand-${handedness.toLowerCase()}`);
      if (handEntity) {
        handEntity.kinematics = kinematicState;
        handEntity.pose = kinematicState.pose;
        handEntity.fingers = kinematicState.fingers;
        handEntity.palm = kinematicState.palm;
      }

      // Broadcast kinematic metrics
      globalEventBus.emit(`hand:${handedness}`, kinematicState);

      // Update 3D Skeletal Rig
      visualizer.updateHand(kinematicState);

      // Update DOM Telemetry HUD
      hud.updateHandTelemetry(kinematicState);
    }
  }

  // 3. Natural Hand-Direct Element Interaction (Fingertip hover & pinch-to-click)
  spatialDirectTouch.processFrame(kinematicData);

  // 4. Spatial World Model -> Stabilized Interaction Engine -> OS Input Layer
  interactionEngine.processWorldModel(worldModel, timestamp);

  // 5. Update Air 3D Studio Spatial CAD Manipulator
  if (studio.isActive) {
    studio.update(kinematicData);
    const studioGrabState = document.getElementById('studio-grab-state');
    if (studioGrabState) {
      studioGrabState.textContent = studio.currentPoseLabel || (studio.isGrabbing ? 'AGARRADO' : 'LIBRE');
      const isEngaged = studio.interactionMode && studio.interactionMode !== 'idle';
      studioGrabState.className = `badge-fsm ${isEngaged ? 'state-dragging' : 'state-idle'}`;
    }
  }

  // 6. Update Air Physics Lab Rigid Sandbox & Throw Engine (with VirtualProxy physical controllers)
  if (physicsLab.isActive) {
    physicsLab.update(kinematicData, worldModel);
  }

  // Hide hands that are no longer detected
  for (const side of ['Left', 'Right']) {
    if (!currentFrameHands[side] && lastDetectedHands[side]) {
      visualizer.hideHand(side);
      hud.setHandIdle(side);
      motionEngine.reset(side);
    }
  }

  // 7. Update Spatial World Model Entities (Body Pose & Physical Object Props)
  if (worldModel) {
    visualizer.updateFromWorldModel(worldModel);
    hud.updateWorldModelTelemetry(worldModel);
  }

  // 8. Update Air Games Lab Platform API
  if (gamesLab && gamesLab.isRunning) {
    airGameAPI.update(kinematicData, worldModel, now);
  }

  lastDetectedHands = currentFrameHands;
});

// UI Event Listeners
btnStartCamera.addEventListener('click', async () => {
  try {
    btnStartCamera.style.display = 'none';
    initLoader.classList.remove('hidden');
    initStatusText.textContent = 'Inicializando HandLandmarker (WASM local)...';

    await tracker.initialize();

    initStatusText.textContent = 'Conectando cámara web...';
    await tracker.startCamera(videoEl);

    cameraModal.classList.add('hidden');
  } catch (err) {
    console.error('Initialization error:', err);
    initStatusText.textContent = `Error: ${err.message || err}`;
    btnStartCamera.style.display = 'inline-flex';
    btnStartCamera.textContent = 'Reintentar';
  }
});

// Toggle Native macOS Control
if (btnToggleMacos) {
  btnToggleMacos.addEventListener('click', () => {
    if (!macosAdapter.isConnected) {
      macosAdapter.connect();
    }
    macosAdapter.isEnabled = !macosAdapter.isEnabled;
    btnToggleMacos.classList.toggle('active', macosAdapter.isEnabled);
    macosLabel.textContent = macosAdapter.isEnabled ? 'Control macOS: ACTIVO' : 'Control macOS: Off';
    updateSystemStatus(macosAdapter.isEnabled ? (interactionEngine.isSystemPaused ? 'paused' : 'active') : 'off');
  });
}

// Emergency Failsafe Listener (Double Fists: ✊ + ✊ held 1s)
globalEventBus.on('failsafe:emergency_stop', () => {
  macosAdapter.isEnabled = false;
  if (btnToggleMacos) {
    btnToggleMacos.classList.remove('active');
    macosLabel.textContent = 'Control macOS: Off';
  }
  updateSystemStatus('off');
  showFailsafeBanner('🛑 FAILSAFE: Air Gesture desactivado por doble puño (✊+✊)');
});

// System Pause Listener (Open Palm held 1s facing camera)
globalEventBus.on('system_pause', (e) => {
  if (macosAdapter.isEnabled) {
    updateSystemStatus(e.isPaused ? 'paused' : 'active');
    if (e.isPaused) {
      showFailsafeBanner('✋ AIR GESTURE EN PAUSA (Mano inmóvil)');
    }
  }
});

// Physical Keyboard Failsafe (ESC cancels OS control immediately)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && macosAdapter.isEnabled) {
    macosAdapter.isEnabled = false;
    if (btnToggleMacos) {
      btnToggleMacos.classList.remove('active');
      macosLabel.textContent = 'Control macOS: Off';
    }
    updateSystemStatus('off');
    showFailsafeBanner('🛑 FAILSAFE: Control cancelado con tecla Escape');
  }
});

// Toggle AR Passthrough vs Spatial Void
btnToggleAr.addEventListener('click', () => {
  isArMode = !isArMode;
  if (isArMode) {
    videoEl.classList.remove('hidden-ar');
    btnToggleAr.classList.add('active');
    arLabel.textContent = 'Modo AR';
  } else {
    videoEl.classList.add('hidden-ar');
    btnToggleAr.classList.remove('active');
    arLabel.textContent = 'Modo Vacío 3D';
  }
});

// Calibrate Spatial Baseline Z
btnCalibrateZ.addEventListener('click', () => {
  if (latestRawLandmarksForCalibration) {
    const { landmarks, width, height } = latestRawLandmarksForCalibration;
    const res = motionEngine.calibrator.setCalibrationBaseline(landmarks, width, height);
    if (res) {
      btnCalibrateZ.classList.add('active');
      btnCalibrateZ.querySelector('span').textContent = '¡Calibrado!';
      setTimeout(() => {
        btnCalibrateZ.classList.remove('active');
        btnCalibrateZ.querySelector('span').textContent = 'Calibrar Z';
      }, 1500);
    }
  }
});

// Toggle Mirror
btnToggleMirror.addEventListener('click', () => {
  isMirror = !isMirror;
  tracker.mirror = isMirror;
  if (isMirror) {
    videoEl.classList.remove('no-mirror');
  } else {
    videoEl.classList.add('no-mirror');
  }
});

// Toggle Swap L/R Hands
if (btnSwapHands) {
  btnSwapHands.addEventListener('click', () => {
    tracker.swapHands = !tracker.swapHands;
    btnSwapHands.classList.toggle('active', tracker.swapHands);
    const label = document.getElementById('swap-hands-label');
    if (label) {
      label.textContent = tracker.swapHands ? 'Invertido (L/R)' : 'Swap L/R';
    }
  });
}

// Perception Trackers Toggles (Fase 1.5 - Body & Object Tracking)
const btnToggleBodyTracker = document.getElementById('btn-toggle-body-tracker');
const lblBodyTrackerState = document.getElementById('lbl-body-tracker-state');
if (btnToggleBodyTracker) {
  btnToggleBodyTracker.addEventListener('click', async () => {
    btnToggleBodyTracker.disabled = true;
    lblBodyTrackerState.textContent = 'CARGANDO...';
    try {
      const isEnabled = await tracker.toggleBodyTracking();
      btnToggleBodyTracker.classList.toggle('active', isEnabled);
      lblBodyTrackerState.textContent = isEnabled ? 'ON' : 'OFF';
      lblBodyTrackerState.className = isEnabled ? 'text-accent' : 'text-muted';
    } catch (e) {
      console.error('Error toggling body tracker:', e);
      lblBodyTrackerState.textContent = 'ERR';
    } finally {
      btnToggleBodyTracker.disabled = false;
    }
  });
}

const btnToggleObjectTracker = document.getElementById('btn-toggle-object-tracker');
const lblObjectTrackerState = document.getElementById('lbl-object-tracker-state');
const selectObjectColor = document.getElementById('select-object-color');

if (btnToggleObjectTracker) {
  btnToggleObjectTracker.addEventListener('click', () => {
    const selectedColor = selectObjectColor ? selectObjectColor.value : 'orange';
    const isEnabled = tracker.toggleObjectTracking(selectedColor);
    btnToggleObjectTracker.classList.toggle('active', isEnabled);
    lblObjectTrackerState.textContent = isEnabled ? 'ON' : 'OFF';
    lblObjectTrackerState.className = isEnabled ? 'text-accent' : 'text-muted';
  });
}

if (selectObjectColor) {
  selectObjectColor.addEventListener('change', (e) => {
    tracker.setObjectColorPreset(e.target.value);
  });
}

// Interactive Test Target click handler
if (testBtnClick) {
  testBtnClick.addEventListener('click', () => {
    clickCounter++;
    if (testClickCount) testClickCount.textContent = clickCounter;
  });
}

// JSON Drawer
btnToggleJson.addEventListener('click', () => {
  jsonDrawer.classList.toggle('hidden');
});

btnCloseJson.addEventListener('click', () => {
  jsonDrawer.classList.add('hidden');
});

btnPauseJson.addEventListener('click', () => {
  hud.isJsonPaused = !hud.isJsonPaused;
  btnPauseJson.textContent = hud.isJsonPaused ? 'Reanudar' : 'Pausar';
});

btnCopyJson.addEventListener('click', async () => {
  const codeEl = document.getElementById('json-stream-code');
  if (codeEl) {
    try {
      await navigator.clipboard.writeText(codeEl.textContent);
      btnCopyJson.textContent = '¡Copiado!';
      setTimeout(() => { btnCopyJson.textContent = 'Copiar JSON'; }, 1500);
    } catch (e) {
      console.warn('Clipboard write failed:', e);
    }
  }
});

// Phase 2.1 Stabilization Diagnostic Listeners
globalEventBus.on('diagnostics:stabilization', (diag) => {
  hud.updateStabilizationDiagnostics(diag);
});

// Mode Toggles (Relative Trackpad vs Absolute vs Auto)
function setPointerMode(mode) {
  interactionEngine.setMode(mode);

  const modeMap = { relative: 'rel', absolute: 'abs', auto: 'auto' };
  const targetShort = modeMap[mode] || 'rel';

  ['rel', 'abs', 'auto'].forEach((m) => {
    const btnNav = document.getElementById(`btn-nav-mode-${m}`);
    const btnDock = document.getElementById(`btn-mode-${m}`);
    if (btnNav) btnNav.classList.toggle('active', m === targetShort);
    if (btnDock) btnDock.classList.toggle('active', m === targetShort);
  });
}

['rel', 'abs', 'auto'].forEach((m) => {
  const modeKey = m === 'rel' ? 'relative' : (m === 'abs' ? 'absolute' : 'auto');
  document.getElementById(`btn-nav-mode-${m}`)?.addEventListener('click', () => setPointerMode(modeKey));
  document.getElementById(`btn-mode-${m}`)?.addEventListener('click', () => setPointerMode(modeKey));
});

// Neutral Center Calibration
const btnCalibNeutral = document.getElementById('btn-calib-neutral');
if (btnCalibNeutral) {
  btnCalibNeutral.addEventListener('click', () => {
    interactionEngine.startNeutralCalibration();
    btnCalibNeutral.classList.add('active');
    setTimeout(() => btnCalibNeutral.classList.remove('active'), 1000);
  });
}

// Filter Tuning Sliders
const sliderCutoff = document.getElementById('slider-cutoff');
const lblCutoff = document.getElementById('lbl-cutoff');
const sliderBeta = document.getElementById('slider-beta');
const lblBeta = document.getElementById('lbl-beta');

if (sliderCutoff) {
  sliderCutoff.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (lblCutoff) lblCutoff.textContent = `${val.toFixed(1)} Hz`;
    const curBeta = sliderBeta ? parseFloat(sliderBeta.value) : 0.018;
    interactionEngine.stabilizer.setFilterParams(val, curBeta);
  });
}

if (sliderBeta) {
  sliderBeta.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (lblBeta) lblBeta.textContent = val.toFixed(3);
    const curCutoff = sliderCutoff ? parseFloat(sliderCutoff.value) : 0.4;
    interactionEngine.stabilizer.setFilterParams(curCutoff, val);
  });
}

// Toggle Center Diagnostics & Jitter Testing Panel (Hidden by default)
const btnToggleDiagnostics = document.getElementById('btn-toggle-diagnostics');
const centerStage = document.getElementById('center-stage');
const btnCloseDiagnostics = document.getElementById('btn-close-diagnostics');

function toggleDiagnostics(forceState = null) {
  if (!centerStage) return;
  const isHidden = centerStage.classList.contains('hidden-diagnostics');
  const nextVisible = forceState !== null ? forceState : isHidden;
  centerStage.classList.toggle('hidden-diagnostics', !nextVisible);
  if (btnToggleDiagnostics) {
    btnToggleDiagnostics.classList.toggle('active', nextVisible);
  }
}

if (btnToggleDiagnostics) {
  btnToggleDiagnostics.addEventListener('click', () => toggleDiagnostics());
}

if (btnCloseDiagnostics) {
  btnCloseDiagnostics.addEventListener('click', () => toggleDiagnostics(false));
}

// ============================================================
// AIR 3D STUDIO - HOLOGRAPHIC CAD UI BINDINGS
// ============================================================
const btnToggleStudio = document.getElementById('btn-toggle-studio');
const studioHud = document.getElementById('studio-hud');
const btnCloseStudio = document.getElementById('btn-close-studio');

const studioMetaName = document.getElementById('studio-meta-name');
const studioMetaFormat = document.getElementById('studio-meta-format');
const studioMetaTris = document.getElementById('studio-meta-tris');
const studioMetaVerts = document.getElementById('studio-meta-verts');
const studioMetaDims = document.getElementById('studio-meta-dims');
const studioMetaScale = document.getElementById('studio-meta-scale');

// Update Telemetry Display when model changes
studio.onMetadataUpdate = (meta) => {
  if (studioMetaName) studioMetaName.textContent = meta.name;
  if (studioMetaFormat) studioMetaFormat.textContent = meta.format;
  if (studioMetaTris) studioMetaTris.textContent = meta.triangles.toLocaleString();
  if (studioMetaVerts) studioMetaVerts.textContent = meta.vertices.toLocaleString();
  if (studioMetaDims && meta.size) {
    studioMetaDims.textContent = `${meta.size.x} × ${meta.size.y} × ${meta.size.z} mm`;
  }
  if (studioMetaScale) studioMetaScale.textContent = `${meta.scale.toFixed(2)}x`;
};

// Toggle Studio
function toggleStudio(forceState = null) {
  const nextState = forceState !== null ? forceState : !studio.isActive;
  if (nextState && physicsLab.isActive) {
    togglePhysics(false);
  }
  studio.setActive(nextState);
  document.body.classList.toggle('mode-studio', nextState);
  if (studioHud) studioHud.classList.toggle('hidden', !nextState);
  if (btnToggleStudio) btnToggleStudio.classList.toggle('active', nextState);
  const label = document.getElementById('studio-btn-label');
  if (label) label.textContent = nextState ? 'Studio: Activo' : 'Air 3D Studio';
}

if (btnToggleStudio) {
  btnToggleStudio.addEventListener('click', () => toggleStudio());
}

if (btnCloseStudio) {
  btnCloseStudio.addEventListener('click', () => toggleStudio(false));
}

// Preset Model Switcher
const presetButtons = document.querySelectorAll('.btn-studio-preset');
presetButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const preset = btn.getAttribute('data-preset');
    presetButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    studio.loadPresetModel(preset);
  });
});

// Shading Mode Switcher
const shadingButtons = document.querySelectorAll('.btn-shading');
shadingButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.getAttribute('data-shading');
    shadingButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    studio.setShadingMode(mode);
  });
});

// Exploded View Slider
const sliderExploded = document.getElementById('slider-exploded');
const lblExplodedPct = document.getElementById('lbl-exploded-pct');
if (sliderExploded) {
  sliderExploded.addEventListener('input', (e) => {
    const factor = parseFloat(e.target.value);
    if (lblExplodedPct) lblExplodedPct.textContent = `${Math.round(factor * 100)}%`;
    studio.setExplodedView(factor);
  });
}

// Auto-Rotate Button
const btnStudioAutoRotate = document.getElementById('btn-studio-autorotate');
if (btnStudioAutoRotate) {
  btnStudioAutoRotate.addEventListener('click', () => {
    studio.autoRotate = !studio.autoRotate;
    btnStudioAutoRotate.classList.toggle('active', studio.autoRotate);
    btnStudioAutoRotate.querySelector('span').textContent = studio.autoRotate ? '🔄 Auto-Giro: On' : '🔄 Auto-Giro: Off';
  });
}

// Reset Transformations
const btnStudioReset = document.getElementById('btn-studio-reset');
if (btnStudioReset) {
  btnStudioReset.addEventListener('click', () => {
    studio.resetTransform();
    if (sliderExploded) sliderExploded.value = 0;
    if (lblExplodedPct) lblExplodedPct.textContent = '0%';
  });
}

// File Upload (.STL and .OBJ)
const btnStudioUpload = document.getElementById('btn-studio-upload');
const studioFileInput = document.getElementById('studio-file-input');
const studioDropzone = document.getElementById('studio-dropzone');

function handleStudioFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const reader = new FileReader();

  if (ext === 'stl') {
    reader.onload = (e) => {
      studio.loadSTL(e.target.result, file.name);
      presetButtons.forEach(b => b.classList.remove('active'));
    };
    reader.readAsArrayBuffer(file);
  } else if (ext === 'obj') {
    reader.onload = (e) => {
      studio.loadOBJ(e.target.result, file.name);
      presetButtons.forEach(b => b.classList.remove('active'));
    };
    reader.readAsText(file);
  } else {
    alert('Formato no soportado. Por favor selecciona un archivo .STL o .OBJ');
  }
}

if (btnStudioUpload && studioFileInput) {
  btnStudioUpload.addEventListener('click', () => studioFileInput.click());

  studioFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    handleStudioFile(file);
  });
}

// Drag & Drop Support for 3D Files anywhere on window
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (studioDropzone) studioDropzone.classList.add('drag-over');
});

window.addEventListener('dragleave', (e) => {
  if (e.target === document.body && studioDropzone) {
    studioDropzone.classList.remove('drag-over');
  }
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (studioDropzone) studioDropzone.classList.remove('drag-over');
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) {
    if (!studio.isActive) toggleStudio(true);
    handleStudioFile(file);
  }
});

// ============================================================
// AIR PHYSICS LAB - SPATIAL RIGID BODY SANDBOX UI BINDINGS
// ============================================================
const btnTogglePhysics = document.getElementById('btn-toggle-physics');
const physicsHud = document.getElementById('physics-hud');
const btnClosePhysics = document.getElementById('btn-close-physics');

const physicsStatCount = document.getElementById('physics-stat-count');
const physicsStatSpeed = document.getElementById('physics-stat-speed');
const physicsStatHeld = document.getElementById('physics-stat-held');
const physicsStatGravity = document.getElementById('physics-stat-gravity');

physicsLab.onStatsUpdate = (stats) => {
  if (physicsStatCount) physicsStatCount.textContent = stats.bodyCount;
  if (physicsStatSpeed) physicsStatSpeed.textContent = `${stats.lastThrowSpeed} m/s`;
  if (physicsStatHeld) physicsStatHeld.textContent = stats.heldBody;
  if (physicsStatGravity) physicsStatGravity.textContent = stats.gravityMode;
};

function togglePhysics(forceState = null) {
  const nextState = forceState !== null ? forceState : !physicsLab.isActive;
  if (nextState && studio.isActive) {
    toggleStudio(false);
  }
  physicsLab.setActive(nextState);
  document.body.classList.toggle('mode-physics', nextState);
  if (physicsHud) physicsHud.classList.toggle('hidden', !nextState);
  if (btnTogglePhysics) {
    btnTogglePhysics.classList.toggle('active', nextState);
    const label = document.getElementById('physics-btn-label');
    if (label) label.textContent = nextState ? 'Physics: Activo' : 'Air Physics Lab';
  }
}

if (btnTogglePhysics) {
  btnTogglePhysics.addEventListener('click', () => togglePhysics());
}

if (btnClosePhysics) {
  btnClosePhysics.addEventListener('click', () => togglePhysics(false));
}

// Spawner Buttons
const btnSpawnCube = document.getElementById('btn-spawn-cube');
if (btnSpawnCube) {
  btnSpawnCube.addEventListener('click', () => {
    physicsLab.spawnCube((Math.random() - 0.5) * 0.8, 0.8, (Math.random() - 0.5) * 0.4);
  });
}

const btnSpawnSphere = document.getElementById('btn-spawn-sphere');
if (btnSpawnSphere) {
  btnSpawnSphere.addEventListener('click', () => {
    physicsLab.spawnSphere((Math.random() - 0.5) * 0.8, 0.8, (Math.random() - 0.5) * 0.4);
  });
}

const btnSpawnCylinder = document.getElementById('btn-spawn-cylinder');
if (btnSpawnCylinder) {
  btnSpawnCylinder.addEventListener('click', () => {
    physicsLab.spawnCylinder((Math.random() - 0.5) * 0.8, 0.8, (Math.random() - 0.5) * 0.4);
  });
}

// Gravity Presets
const gravityButtons = document.querySelectorAll('.btn-physics-gravity');
gravityButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const grav = btn.getAttribute('data-gravity');
    gravityButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    physicsLab.setGravity(grav);
  });
});

// Restitution Slider
const sliderRestitution = document.getElementById('slider-restitution');
const lblRestitutionVal = document.getElementById('lbl-restitution-val');
if (sliderRestitution) {
  sliderRestitution.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (lblRestitutionVal) lblRestitutionVal.textContent = `${Math.round(val * 100)}%`;
    physicsLab.setRestitution(val);
  });
}

// Arena Actions (Reset & Clear)
const btnPhysicsReset = document.getElementById('btn-physics-reset');
if (btnPhysicsReset) {
  btnPhysicsReset.addEventListener('click', () => {
    physicsLab.resetScene();
  });
}

const btnPhysicsClear = document.getElementById('btn-physics-clear');
if (btnPhysicsClear) {
  btnPhysicsClear.addEventListener('click', () => {
    physicsLab.clearAllObjects();
  });
}

// ============================================================
// AIR GAMES LAB - SPATIAL GAMING PLATFORM UI BINDINGS
// ============================================================
const btnToggleGamesLab = document.getElementById('btn-toggle-games-lab');
const gamesLabModal = document.getElementById('games-lab-modal');
const btnCloseGames = document.getElementById('btn-close-games');
const btnGamesSound = document.getElementById('btn-games-sound');
const btnGamesReset = document.getElementById('btn-games-reset');
const gamesTabGroup = document.getElementById('games-tab-group');
const gamesGuideText = document.getElementById('games-guide-text');

const gameGuides = {
  pong: '🏓 Air Pong: Mano Izquierda = Paleta Izq • Mano Derecha = Paleta Der (o vs IA)',
  fruit_ninja: '🍉 Fruit Ninja: Mueve tu mano a alta velocidad para cortar frutas con el filo espacial • ¡Evita las bombas!',
  basketball: '🏀 Air Basketball: Acerca la mano a la pelota y pellizca (🤏) para agarrar • Lanza hacia el aro'
};

function toggleGamesLab(forceState = null) {
  if (!gamesLabModal) return;
  const isHidden = gamesLabModal.classList.contains('hidden');
  const nextState = forceState !== null ? forceState : isHidden;

  gamesLabModal.classList.toggle('hidden', !nextState);
  if (btnToggleGamesLab) {
    btnToggleGamesLab.classList.toggle('active', nextState);
    const label = document.getElementById('games-btn-label');
    if (label) label.textContent = nextState ? 'Games: Activo' : 'Air Games';
  }

  if (nextState) {
    gamesLab.start();
  } else {
    gamesLab.stop();
  }
}

if (btnToggleGamesLab) {
  btnToggleGamesLab.addEventListener('click', () => toggleGamesLab());
}

if (btnCloseGames) {
  btnCloseGames.addEventListener('click', () => toggleGamesLab(false));
}

if (btnGamesSound) {
  btnGamesSound.addEventListener('click', () => {
    const isMuted = gameAudio.toggleMute();
    btnGamesSound.textContent = isMuted ? '🔇' : '🔊';
  });
}

if (btnGamesReset) {
  btnGamesReset.addEventListener('click', () => {
    gamesLab.resetCurrentGame();
  });
}

if (gamesTabGroup) {
  gamesTabGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-game-tab');
    if (!btn) return;
    const game = btn.dataset.game;
    gamesTabGroup.querySelectorAll('.btn-game-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    gamesLab.setActiveGame(game);
    if (gamesGuideText && gameGuides[game]) {
      gamesGuideText.textContent = gameGuides[game];
    }
  });
}

