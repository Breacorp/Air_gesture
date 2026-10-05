/**
 * Action Resolver - Deterministic Capability-Based Action Mapper
 * 
 * "En lugar de preguntarle: '¿Qué aplicación es?'
 *  preguntarle al mundo: '¿Qué puedo hacer con aquello que tengo delante?'"
 * 
 * Architecture:
 * Intent + Target Capabilities -> Action
 * 
 * Resolves (SpatialIntent, SpatialContext) into concrete digital executions
 * without any hardcoded application names or profiles:
 * - GRAB    + grabbable  -> Possess entity (3D, physics, physical prop, or OS pointer_down)
 * - DRAG    + movable    -> Translate entity (3D space, physics body, or OS drag_move)
 * - THROW   + throwable  -> Impart physics momentum & velocity window
 * - SCALE   + scalable   -> Scale 3D geometry or zoom OS viewport
 * - ROTATE  + rotatable  -> Orbital 3D rotation or canvas orientation
 * - SCROLL  + scrollable -> Smooth continuous scroll wheel
 * - CLICK   + clickable  -> Atomic selection / trigger
 * - POINT   + (any)      -> Reticle / pointer navigation
 */

import { IntentType, IntentState } from './spatial-intent.js';
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
   * Resolve an intent against the target's interaction capabilities
   * @param {SpatialIntent} intent
   * @param {SpatialContext} context
   */
  resolve(intent, context) {
    if (!intent || !context) return;
    const caps = context.capabilities;
    if (!caps || !caps.interactive) return;

    // 1. GLOBAL SYSTEM FAILSAFE INTENTS (Bypass capabilities)
    if (intent.type === IntentType.CANCEL) {
      this._resolveCancel(intent);
      return;
    }

    if (intent.type === IntentType.PAUSE) {
      this._resolvePause(intent);
      return;
    }

    // 2. CAPABILITY-DRIVEN INTENT DISPATCH: Intent + Capabilities -> Action
    switch (intent.type) {
      case IntentType.POINT:
        this._resolvePoint(intent, context, caps);
        break;

      case IntentType.CLICK:
      case IntentType.TOUCH:
        if (caps.can('clickable')) {
          this._resolveClick(intent, context, caps);
        }
        break;

      case IntentType.GRAB:
        if (caps.can('grabbable')) {
          this._resolveGrab(intent, context, caps);
        }
        break;

      case IntentType.DRAG:
        if (caps.can('movable')) {
          this._resolveDrag(intent, context, caps);
        }
        break;

      case IntentType.RELEASE:
        this._resolveRelease(intent, context, caps);
        break;

      case IntentType.THROW:
        if (caps.can('throwable')) {
          this._resolveThrow(intent, context, caps);
        } else {
          // If target is not throwable, fallback to regular clean release
          this._resolveRelease(intent, context, caps);
        }
        break;

      case IntentType.SCALE:
        if (caps.can('scalable')) {
          this._resolveScale(intent, context, caps);
        }
        break;

      case IntentType.ROTATE:
        if (caps.can('rotatable')) {
          this._resolveRotate(intent, context, caps);
        }
        break;

      case IntentType.SCROLL:
        if (caps.can('scrollable')) {
          this._resolveScroll(intent, context, caps);
        }
        break;

      case IntentType.PUSH:
      case IntentType.PULL:
        this._resolvePushPull(intent, context, caps);
        break;
    }
  }

  // --- CAPABILITY HANDLERS ---

  _resolvePoint(intent, context, caps) {
    const x = intent.position?.screenX || intent.position?.x || 0;
    const y = intent.position?.screenY || intent.position?.y || 0;

    if (context.is3D()) {
      const studio = context.metadata?.studio || this.studio;
      if (studio) studio.isHoveringModel = true;
    }

    // Always keep pointer coordinates synchronized
    this.browser?.movePointer?.(x, y);
    this.macos?.movePointer?.(x, y);
  }

  _resolveClick(intent, context, caps) {
    const x = intent.position?.screenX || intent.position?.x || 0;
    const y = intent.position?.screenY || intent.position?.y || 0;
    const button = intent.payload?.button || 'left';

    if (context.isUI() && context.targetEntity?.click) {
      context.targetEntity.click();
    }

    this.browser?.click?.(x, y, button);

    // Atomic OS click: pointer_down -> pointer_up
    this.macos?.pointerDown?.(x, y, button);
    setTimeout(() => this.macos?.pointerUp?.(x, y, button), 35);
  }

  _resolveGrab(intent, context, caps) {
    if (intent.state !== IntentState.START) return;
    const x = intent.position?.screenX || intent.position?.x || 0;
    const y = intent.position?.screenY || intent.position?.y || 0;
    const button = intent.payload?.button || 'left';

    // 1. If target is a 3D Virtual Object
    if (context.is3D()) {
      const studio = context.metadata?.studio || this.studio;
      const physicsLab = context.metadata?.physicsLab || this.physicsLab;

      if (physicsLab && context.targetType === 'physics_rigid_body' && context.targetEntity) {
        physicsLab.grabbedBody = context.targetEntity;
        this.contextEngine?.setStickyHold(context.targetType, context.targetEntity, context.targetId, context.environment, caps);
        return;
      }

      if (studio && studio.modelContainer) {
        studio.isGrabbing = true;
        studio.interactionMode = 'fine_pinch';
        studio.currentPoseLabel = 'AGARRADO';
        this.contextEngine?.setStickyHold(context.targetType, context.targetEntity, context.targetId, context.environment, caps);
        return;
      }
    }

    // 2. If target is a Physical Prop
    if (context.isPhysical() && context.targetEntity) {
      context.targetEntity.relations.isHeld = true;
      this.contextEngine?.setStickyHold(context.targetType, context.targetEntity, context.targetId, context.environment, caps);
      return;
    }

    // 3. Fallback: Surface Grab (OS window drag, text selection, DOM drag)
    this.browser?.pointerDown?.(x, y, button);
    this.macos?.pointerDown?.(x, y, button);
  }

  _resolveDrag(intent, context, caps) {
    const x = intent.position?.screenX || intent.position?.x || 0;
    const y = intent.position?.screenY || intent.position?.y || 0;
    const button = intent.payload?.button || 'left';
    const delta = intent.delta || { x: 0, y: 0, z: 0 };

    // 1. If target is 3D Virtual Object
    if (context.is3D()) {
      const studio = context.metadata?.studio || this.studio;
      const physicsLab = context.metadata?.physicsLab || this.physicsLab;

      if (physicsLab && physicsLab.grabbedBody) {
        physicsLab.grabbedBody.position.x += delta.x * 0.01;
        physicsLab.grabbedBody.position.y -= delta.y * 0.01;
        physicsLab.grabbedBody.velocity.set(0, 0, 0);
        return;
      }

      if (studio && studio.modelContainer) {
        studio.modelContainer.position.x += delta.x * 0.005;
        studio.modelContainer.position.y -= delta.y * 0.005;
        if (delta.z) studio.modelContainer.position.z += delta.z * 0.005;
        return;
      }
    }

    // 2. If target is Physical Prop
    if (context.isPhysical() && context.targetEntity) {
      context.targetEntity.position.x += delta.x * 0.001;
      context.targetEntity.position.y += delta.y * 0.001;
      return;
    }

    // 3. Fallback: OS Desktop Surface Drag
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
  }

  _resolveThrow(intent, context, caps) {
    const physicsLab = context.metadata?.physicsLab || this.physicsLab;
    const body = physicsLab?.grabbedBody || context.targetEntity;
    const velocity = intent.velocity || { vx: 0, vy: 0, vz: 0, speed: 0 };

    if (body && typeof body.velocity?.set === 'function') {
      // Impart real linear & angular momentum
      body.velocity.set(
        velocity.vx * 8.0,
        -velocity.vy * 8.0,
        (velocity.vz || 0) * 8.0
      );
      if (typeof body.angularVelocity?.set === 'function') {
        body.angularVelocity.set(
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 6
        );
      }
    }

    this._resolveRelease(intent, context, caps);
  }

  _resolveRelease(intent, context, caps) {
    const x = intent.position?.screenX || intent.position?.x || 0;
    const y = intent.position?.screenY || intent.position?.y || 0;
    const button = intent.payload?.button || 'left';

    if (context.is3D()) {
      const studio = context.metadata?.studio || this.studio;
      const physicsLab = context.metadata?.physicsLab || this.physicsLab;

      if (physicsLab) physicsLab.grabbedBody = null;
      if (studio) {
        studio.isGrabbing = false;
        studio.interactionMode = 'idle';
        studio.currentPoseLabel = 'LIBRE';
      }
    }

    if (context.isPhysical() && context.targetEntity) {
      context.targetEntity.relations.isHeld = false;
    }

    this.contextEngine?.clearStickyHold();

    // Release pointer in browser and macOS
    this.browser?.pointerUp?.(x, y, button);
    this.macos?.pointerUp?.(x, y, button);
  }

  _resolveScale(intent, context, caps) {
    const delta = typeof intent.delta === 'number' ? intent.delta : (intent.payload?.distanceDelta || 0);

    // 1. If 3D entity: scale geometry directly
    if (context.is3D()) {
      const studio = context.metadata?.studio || this.studio;
      const physicsLab = context.metadata?.physicsLab || this.physicsLab;

      if (studio && studio.modelContainer) {
        const factor = 1.0 + (delta > 0 ? 0.04 : -0.04);
        studio.modelContainer.scale.multiplyScalar(factor);
        return;
      }

      if (physicsLab && physicsLab.grabbedBody) {
        const factor = 1.0 + (delta > 0 ? 0.05 : -0.05);
        if (physicsLab.grabbedBody.shapes?.[0]?.scale) {
          physicsLab.grabbedBody.shapes[0].scale.multiplyScalar(factor);
        }
        return;
      }
    }

    // 2. If OS surface: viewport zoom via native hotkey Cmd + / Cmd -
    if (Math.abs(delta) > 0.012) {
      const key = delta > 0 ? 'plus' : 'minus';
      this.macos?.hotkey?.(['cmd'], key);
    }
  }

  _resolveRotate(intent, context, caps) {
    const angleDelta = typeof intent.delta === 'number' ? intent.delta : (intent.payload?.angleDeltaRad || 0);

    // 1. If 3D entity: rotate orientation
    if (context.is3D()) {
      const studio = context.metadata?.studio || this.studio;
      if (studio && studio.modelContainer) {
        studio.modelContainer.rotation.y += angleDelta * 1.5;
        return;
      }
    }

    // 2. If OS surface: horizontal scroll or custom gesture
    if (Math.abs(angleDelta) > 0.05) {
      this.macos?.scroll?.(angleDelta > 0 ? 12 : -12, 0);
    }
  }

  _resolveScroll(intent, context, caps) {
    if (intent.delta) {
      const deltaX = intent.delta.x || 0;
      const deltaY = intent.delta.y || 0;
      this.macos?.scroll?.(deltaX, deltaY);
    }
  }

  _resolvePushPull(intent, context, caps) {
    if (intent.payload?.macroAction === 'system_mission_control') {
      this.macos?.hotkey?.(['ctrl'], 'up');
      return;
    }

    if (context.is3D()) {
      const studio = context.metadata?.studio || this.studio;
      if (studio && studio.modelContainer && intent.velocity) {
        studio.modelContainer.position.z += (intent.type === IntentType.PUSH ? -0.05 : 0.05);
      }
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
