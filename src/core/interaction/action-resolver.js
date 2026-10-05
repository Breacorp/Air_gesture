/**
 * Action Resolver - Deterministic Intent-to-Action Mapper
 * 
 * "Air Gesture nunca debe aprender cómo funciona una aplicación.
 *  Air Gesture debe entender cómo funciona la interacción humana."
 * 
 * Resolves (SpatialIntent, SpatialContext) into concrete digital executions
 * without hardcoded application profiles:
 * - GRAB + 3D Object       -> Possess and translate 3D entity
 * - GRAB + Physical Prop   -> Sync physical proxy
 * - GRAB + OS Surface      -> pointer_down / drag_start on macOS
 * - SCALE + 3D Object      -> Scale 3D model geometry
 * - SCALE + OS Surface     -> Viewport zoom (Cmd+ / Cmd-)
 * - ROTATE + 3D Object     -> Orbital 3D rotation
 * - THROW + Physics Body   -> Impart linear/angular velocity
 * - SCROLL + OS/UI         -> Native scroll wheel
 * - POINT + OS/UI          -> Cursor navigation
 */

import { IntentType, IntentState } from './spatial-intent.js';
import { ContextTargetType, SpatialRelationship } from './context-engine.js';
import { globalEventBus } from '../event-bus.js';

export class ActionResolver {
  constructor(adapters = {}) {
    this.macos = adapters.macos || null;
    this.browser = adapters.browser || null;
    this.contextEngine = adapters.contextEngine || null;
    this.studio = null;
    this.physicsLab = null;
  }

  setSceneProviders({ studio, physicsLab }) {
    if (studio) this.studio = studio;
    if (physicsLab) this.physicsLab = physicsLab;
  }

  /**
   * Resolve an intent within its spatial context
   * @param {SpatialIntent} intent
   * @param {SpatialContext} context
   */
  resolve(intent, context) {
    if (!intent) return;

    // 1. GLOBAL SYSTEM FAILSAFE INTENTS (Bypass context)
    if (intent.type === IntentType.CANCEL) {
      this._resolveCancel(intent);
      return;
    }

    if (intent.type === IntentType.PAUSE) {
      this._resolvePause(intent);
      return;
    }

    // 2. CONTEXT-DEPENDENT ACTION DISPATCH
    switch (context.targetType) {
      case ContextTargetType.VIRTUAL_3D_OBJECT:
        this._resolve3DObjectAction(intent, context);
        break;

      case ContextTargetType.PHYSICS_RIGID_BODY:
        this._resolvePhysicsAction(intent, context);
        break;

      case ContextTargetType.PHYSICAL_PROP:
        this._resolvePhysicalPropAction(intent, context);
        break;

      case ContextTargetType.INTERACTIVE_UI:
        this._resolveInteractiveUIAction(intent, context);
        break;

      case ContextTargetType.OS_SURFACE:
      default:
        this._resolveOSSurfaceAction(intent, context);
        break;
    }
  }

  // --- 3D VIRTUAL OBJECT ACTIONS (CAD, Studio, Holographic) ---
  _resolve3DObjectAction(intent, context) {
    const studio = context.metadata?.studio || this.studio;
    if (!studio) {
      // Fallback to desktop if studio unavailable
      this._resolveOSSurfaceAction(intent, context);
      return;
    }

    switch (intent.type) {
      case IntentType.POINT:
        // Update laser reticle over model
        studio.isHoveringModel = true;
        break;

      case IntentType.GRAB:
        if (intent.state === IntentState.START) {
          studio.isGrabbing = true;
          studio.interactionMode = 'fine_pinch';
          studio.currentPoseLabel = 'AGARRADO';
          this.contextEngine?.setStickyHold(context.targetType, context.targetEntity, context.targetId, context.environment);
        }
        break;

      case IntentType.DRAG:
        if (studio.modelContainer && intent.delta) {
          // Direct 3D spatial translation
          studio.modelContainer.position.x += (intent.delta.x || 0) * 0.005;
          studio.modelContainer.position.y -= (intent.delta.y || 0) * 0.005;
          if (intent.delta.z) {
            studio.modelContainer.position.z += intent.delta.z * 0.005;
          }
        }
        break;

      case IntentType.RELEASE:
        studio.isGrabbing = false;
        studio.interactionMode = 'idle';
        studio.currentPoseLabel = 'LIBRE';
        this.contextEngine?.clearStickyHold();
        break;

      case IntentType.SCALE:
        if (studio.modelContainer && intent.delta) {
          // Direct geometric scaling
          const factor = 1.0 + (intent.delta > 0 ? 0.04 : -0.04);
          studio.modelContainer.scale.multiplyScalar(factor);
        }
        break;

      case IntentType.ROTATE:
        if (studio.modelContainer && intent.delta) {
          // Direct 3D rotation
          studio.modelContainer.rotation.y += intent.delta * 1.5;
        }
        break;

      case IntentType.PUSH:
      case IntentType.PULL:
        if (studio.modelContainer && intent.velocity) {
          studio.modelContainer.position.z += (intent.type === IntentType.PUSH ? -0.05 : 0.05);
        }
        break;
    }
  }

  // --- PHYSICS RIGID BODY ACTIONS ---
  _resolvePhysicsAction(intent, context) {
    const lab = context.metadata?.physicsLab || this.physicsLab;
    if (!lab) {
      this._resolveOSSurfaceAction(intent, context);
      return;
    }

    const body = context.targetEntity;

    switch (intent.type) {
      case IntentType.GRAB:
        if (intent.state === IntentState.START && body) {
          lab.grabbedBody = body;
          this.contextEngine?.setStickyHold(context.targetType, body, context.targetId, context.environment);
        }
        break;

      case IntentType.DRAG:
        if (lab.grabbedBody && intent.position) {
          // Update physics body translation
          lab.grabbedBody.position.x += (intent.delta?.x || 0) * 0.01;
          lab.grabbedBody.position.y -= (intent.delta?.y || 0) * 0.01;
          lab.grabbedBody.velocity.set(0, 0, 0); // cancel inertia during direct manipulation
        }
        break;

      case IntentType.THROW:
        if (lab.grabbedBody && intent.velocity) {
          // Impart linear momentum to rigid body!
          lab.grabbedBody.velocity.set(
            intent.velocity.vx * 8.0,
            -intent.velocity.vy * 8.0,
            intent.velocity.vz * 8.0
          );
          lab.grabbedBody.angularVelocity.set(
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 6
          );
        }
        // Fallthrough to release
      case IntentType.RELEASE:
        lab.grabbedBody = null;
        this.contextEngine?.clearStickyHold();
        break;

      case IntentType.SCALE:
        if (lab.grabbedBody && intent.delta) {
          const factor = 1.0 + (intent.delta > 0 ? 0.05 : -0.05);
          // Scale collision shape and mesh
          if (lab.grabbedBody.shapes?.[0]) {
            lab.grabbedBody.shapes[0].scale?.set(factor, factor, factor);
          }
        }
        break;
    }
  }

  // --- PHYSICAL PROP ACTIONS ---
  _resolvePhysicalPropAction(intent, context) {
    const prop = context.targetEntity;
    if (!prop) return;

    if (intent.type === IntentType.GRAB) {
      prop.relations.isHeld = true;
      this.contextEngine?.setStickyHold(context.targetType, prop, context.targetId, context.environment);
    } else if (intent.type === IntentType.RELEASE) {
      prop.relations.isHeld = false;
      this.contextEngine?.clearStickyHold();
    }
  }

  // --- INTERACTIVE 2D UI ACTIONS ---
  _resolveInteractiveUIAction(intent, context) {
    const el = context.targetEntity;

    if (intent.type === IntentType.CLICK || (intent.type === IntentType.GRAB && intent.state === IntentState.START)) {
      if (el && typeof el.click === 'function') {
        el.click();
      }
    }

    // Also mirror to OS/Browser pointers
    this._resolveOSSurfaceAction(intent, context);
  }

  // --- UNIVERSAL OS SURFACE ACTIONS (macOS, Safari, Finder, Desktop) ---
  _resolveOSSurfaceAction(intent, context) {
    const x = intent.position?.screenX || intent.position?.x || 0;
    const y = intent.position?.screenY || intent.position?.y || 0;
    const button = intent.payload?.button || 'left';

    switch (intent.type) {
      case IntentType.POINT:
        this.browser?.movePointer?.(x, y);
        this.macos?.movePointer?.(x, y);
        break;

      case IntentType.TOUCH:
      case IntentType.CLICK:
        this.browser?.click?.(x, y, button);
        // Atomic OS click: down -> up
        this.macos?.pointerDown?.(x, y, button);
        setTimeout(() => this.macos?.pointerUp?.(x, y, button), 35);
        break;

      case IntentType.GRAB:
        if (intent.state === IntentState.START) {
          this.browser?.pointerDown?.(x, y, button);
          this.macos?.pointerDown?.(x, y, button);
        }
        break;

      case IntentType.DRAG:
        if (intent.state === IntentState.START) {
          this.browser?.dragStart?.(x, y, button);
          this.macos?.dragStart?.(x, y, button);
        } else if (intent.state === IntentState.ACTIVE) {
          this.browser?.dragMove?.(x, y, button);
          this.macos?.drag?.(x, y, button);
        } else if (intent.state === IntentState.END) {
          this.browser?.dragEnd?.(x, y, button);
          this.macos?.dragEnd?.(x, y, button);
        }
        break;

      case IntentType.RELEASE:
        this.browser?.pointerUp?.(x, y, button);
        this.macos?.pointerUp?.(x, y, button);
        break;

      case IntentType.SCROLL:
        if (intent.delta) {
          const deltaX = intent.delta.x || 0;
          const deltaY = intent.delta.y || 0;
          this.macos?.scroll?.(deltaX, deltaY);
        }
        break;

      case IntentType.SCALE:
        // Desktop zoom via Cmd + / Cmd -
        if (Math.abs(intent.delta || 0) > 0.012) {
          const key = intent.delta > 0 ? 'plus' : 'minus';
          this.macos?.hotkey?.(['cmd'], key);
        }
        break;

      case IntentType.PUSH:
        if (intent.payload?.macroAction === 'system_mission_control') {
          this.macos?.hotkey?.(['ctrl'], 'up');
        }
        break;
    }
  }

  // --- FAILSAFE RESOLUTIONS ---
  _resolveCancel(intent) {
    console.warn('[ActionResolver] Emergency Cancel Resolved! Disabling OS Control.');
    if (this.macos) this.macos.isEnabled = false;
    globalEventBus.emit('failsafe:emergency_stop', { reason: intent.payload?.reason, timestamp: intent.timestamp });
  }

  _resolvePause(intent) {
    const isPaused = !!intent.payload?.isPaused;
    console.log(`[ActionResolver] System Pause Resolved: ${isPaused ? 'PAUSED' : 'RESUMED'}`);
    globalEventBus.emit('system_pause', { isPaused, timestamp: intent.timestamp });
  }
}
