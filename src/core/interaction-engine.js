/**
 * Universal Interaction Engine - Pure Spatial Human Interaction
 * 
 * "Air Gesture nunca debe aprender cómo funciona una aplicación.
 *  Air Gesture debe entender cómo funciona la interacción humana."
 * 
 * Architecture:
 * 1. PointerController: High-frequency (~60-80Hz) continuous cursor stabilization.
 * 2. IntentEngine: Classifies pure human spatial intentions (POINT, TOUCH, CLICK, GRAB,
 *    DRAG, RELEASE, SCROLL, ROTATE, SCALE, PUSH, PULL, THROW, PAUSE, CANCEL).
 * 3. ContextEngine: Evaluates the spatial environment around the interacting entities
 *    (3D CAD model, physics body, physical prop, UI element, or 2D OS surface).
 * 4. ActionResolver: Maps (SpatialIntent, SpatialContext) into concrete digital executions
 *    without hardcoded application profiles.
 */

import { globalEventBus } from './event-bus.js';
import { PointerController } from './interaction/pointer-controller.js';
import { GestureRecognizer, GestureState } from './interaction/gesture-recognizer.js';
import { IntentEngine } from './interaction/intent-engine.js';
import { ContextEngine } from './interaction/context-engine.js';
import { ActionResolver } from './interaction/action-resolver.js';
import { IntentType, IntentState, SpatialIntent } from './interaction/spatial-intent.js';

export const InteractionState = GestureState;
export { IntentType, IntentState, SpatialIntent };

export class InteractionEngine {
  constructor(screenWidth = 1470, screenHeight = 956, adapters = {}) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    // 1. High-frequency continuous pointer
    this.pointerController = new PointerController(screenWidth, screenHeight);

    // 2. Pure Human Intent Classifier
    this.intentEngine = new IntentEngine();

    // 3. Spatial Scene & Relationship Context Engine
    this.contextEngine = new ContextEngine();

    // 4. Deterministic Action Resolver (Replaces hardcoded application profiles)
    this.actionResolver = new ActionResolver({
      macos: adapters.macos || null,
      browser: adapters.browser || null,
      contextEngine: this.contextEngine
    });

    // 5. Backward compatibility with discrete FSM
    this.gestureRecognizer = new GestureRecognizer(this.pointerController);

    // Backward-compatible delegates
    this.stabilizer = this.pointerController.stabilizer;
    this.mapper = this.pointerController.mapper;
    this.cursor = this.pointerController.cursor;

    // Last evaluated frame state
    this.lastIntents = [];
    this.lastContext = null;
  }

  setAdapters({ macos, browser }) {
    if (macos) this.actionResolver.macos = macos;
    if (browser) this.actionResolver.browser = browser;
  }

  registerSceneProviders({ studio, physicsLab, spatialDirectTouch }) {
    this.contextEngine.registerSceneProviders({ studio, physicsLab, spatialDirectTouch });
    this.actionResolver.setSceneProviders({ studio, physicsLab });
  }

  get state() {
    return this.gestureRecognizer.state;
  }

  get activeHand() {
    return this.pointerController.activeHand;
  }

  get isSystemPaused() {
    return this.intentEngine.isPaused || this.gestureRecognizer.isSystemPaused;
  }

  setScreenResolution(width, height) {
    this.screenWidth = width;
    this.screenHeight = height;
    this.pointerController.setScreenResolution(width, height);
  }

  setMode(mode) {
    this.pointerController.setMode(mode);
  }

  startNeutralCalibration() {
    this.pointerController.startNeutralCalibration();
  }

  enableBodyGestures(enabled = true) {
    this.gestureRecognizer.enableBodyGestures = enabled;
  }

  /**
   * Primary Universal Interaction Pipeline
   * @param {Object} worldModel SpatialWorldModel
   * @param {number} timestamp Frame timestamp (ms)
   */
  processWorldModel(worldModel, timestamp = performance.now()) {
    if (!worldModel) return null;

    const primaryHandEntity = worldModel.getPrimaryHand ? worldModel.getPrimaryHand() : null;
    const bothHands = worldModel.getBothHands ? worldModel.getBothHands() : { Left: null, Right: null };

    let rawIndexPoint = null;
    let confidence = 0.9;
    let handedness = 'Right';

    if (primaryHandEntity) {
      confidence = primaryHandEntity.confidence || 0.9;
      handedness = primaryHandEntity.subType || 'Right';

      if (primaryHandEntity.landmarks && primaryHandEntity.landmarks[8]) {
        rawIndexPoint = {
          x: primaryHandEntity.landmarks[8].x,
          y: primaryHandEntity.landmarks[8].y
        };
      } else if (primaryHandEntity.customProps?.indexTipPos) {
        rawIndexPoint = {
          x: primaryHandEntity.customProps.indexTipPos.x,
          y: primaryHandEntity.customProps.indexTipPos.y
        };
      } else if (primaryHandEntity.position) {
        rawIndexPoint = {
          x: primaryHandEntity.position.x,
          y: primaryHandEntity.position.y
        };
      }
    }

    const kinematicData = {
      Left: bothHands.Left?.kinematics || bothHands.Left?.customProps?.kinematicState || null,
      Right: bothHands.Right?.kinematics || bothHands.Right?.customProps?.kinematicState || null,
      timestamp
    };

    // 1. POINTER CONTROLLER: Update continuous cursor (high frequency, lowest latency)
    const pointerState = this.pointerController.update(rawIndexPoint, confidence, handedness, timestamp);

    // 2. INTENT ENGINE: Extract pure spatial human intentions
    const intents = this.intentEngine.process(kinematicData, pointerState, worldModel);
    this.lastIntents = intents;

    // 3. CONTEXT ENGINE: Evaluate spatial scene & relationships
    const context = this.contextEngine.evaluate(worldModel, pointerState, primaryHandEntity, timestamp);
    this.lastContext = context;

    // 4. ACTION RESOLVER: Universal intent execution without profiles
    for (const intent of intents) {
      intent.targetId = context.targetId;
      this.actionResolver.resolve(intent, context);

      // Broadcast universal intent event for telemetries and HUD
      globalEventBus.emit('spatial_intent', { intent, context });
    }

    // 5. GESTURE RECOGNIZER (Backward compatibility FSM & legacy profiles)
    const gestureResult = this.gestureRecognizer.process(kinematicData, pointerState, worldModel);

    // Broadcast kinematic telemetry
    globalEventBus.emit('kinematic', kinematicData);

    return {
      state: gestureResult.state,
      cursor: pointerState,
      diagnostics: pointerState.diagnostics,
      isPaused: this.isSystemPaused,
      intents,
      context
    };
  }

  processFrame(kinematicData, rawIndexPoint) {
    if (kinematicData && typeof kinematicData.getPrimaryHand === 'function') {
      return this.processWorldModel(kinematicData, rawIndexPoint || performance.now());
    }
    const { Left, Right, timestamp = performance.now() } = (kinematicData || {});
    const primaryHand = Right || Left;
    const confidence = primaryHand ? primaryHand.confidence : 0.9;
    const handedness = primaryHand ? primaryHand.handedness : 'Right';

    const pointerState = this.pointerController.update(rawIndexPoint, confidence, handedness, timestamp);
    const gestureResult = this.gestureRecognizer.process(kinematicData, pointerState, null);

    globalEventBus.emit('kinematic', kinematicData);

    return {
      state: gestureResult.state,
      cursor: pointerState,
      diagnostics: pointerState.diagnostics,
      isPaused: gestureResult.isPaused
    };
  }
}
