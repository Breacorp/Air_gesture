/**
 * Context Engine - Spatial Scene & Relationship Evaluator
 * 
 * "Air Gesture nunca debe aprender cómo funciona una aplicación.
 *  Air Gesture debe entender cómo funciona la interacción humana."
 * 
 * Inspects the current spatial world, active virtual layers, and relationships:
 * - What entities exist around the hands? (3D CAD model, physical prop, rigid body, UI button, OS surface)
 * - What are their active spatial relationships? (near, touching, holding, over)
 */

export const ContextTargetType = Object.freeze({
  VIRTUAL_3D_OBJECT: 'virtual_3d_object', // 3D Mesh / CAD model in scene
  PHYSICS_RIGID_BODY: 'physics_rigid_body', // Dynamic rigid body in physics simulation
  PHYSICAL_PROP: 'physical_prop',         // Tracked real physical object
  INTERACTIVE_UI: 'interactive_ui',       // 2D Button or direct touch DOM element
  OS_SURFACE: 'os_surface',               // Default 2D OS Desktop / Screen canvas
  AMBIENT_SYSTEM: 'ambient_system'        // Global ungrounded spatial environment
});

export const SpatialRelationship = Object.freeze({
  HOLDING: 'holding',
  TOUCHING: 'touching',
  NEAR: 'near',
  OVER: 'over',
  NONE: 'none'
});

export class SpatialContext {
  constructor(options = {}) {
    this.targetType = options.targetType || ContextTargetType.OS_SURFACE;
    this.targetEntity = options.targetEntity || null;
    this.targetId = options.targetId || 'os_desktop';
    this.relationship = options.relationship || SpatialRelationship.NONE;
    this.environment = options.environment || 'desktop'; // 'studio' | 'physics' | 'desktop'
    this.metadata = options.metadata || {};
    this.timestamp = options.timestamp || performance.now();
  }

  is3D() {
    return this.targetType === ContextTargetType.VIRTUAL_3D_OBJECT ||
           this.targetType === ContextTargetType.PHYSICS_RIGID_BODY;
  }

  isPhysical() {
    return this.targetType === ContextTargetType.PHYSICAL_PROP;
  }

  isUI() {
    return this.targetType === ContextTargetType.INTERACTIVE_UI;
  }

  isOS() {
    return this.targetType === ContextTargetType.OS_SURFACE;
  }

  toString() {
    return `[SpatialContext target=${this.targetId} (${this.targetType}) rel=${this.relationship} env=${this.environment}]`;
  }
}

export class ContextEngine {
  constructor() {
    // Registry of spatial scene providers
    this.studio = null;
    this.physicsLab = null;
    this.spatialDirectTouch = null;
    this.activeHeldEntity = null; // Sticky hold reference
  }

  /**
   * Register connected scene subsystems
   */
  registerSceneProviders({ studio, physicsLab, spatialDirectTouch }) {
    if (studio) this.studio = studio;
    if (physicsLab) this.physicsLab = physicsLab;
    if (spatialDirectTouch) this.spatialDirectTouch = spatialDirectTouch;
  }

  /**
   * Evaluate the spatial context for an intent and interaction state
   * @param {Object} worldModel SpatialWorldModel
   * @param {Object} pointerState Stabilized screen cursor
   * @param {Object} [primaryHand] Primary hand entity or kinematics
   * @param {number} [timestamp]
   * @returns {SpatialContext}
   */
  evaluate(worldModel, pointerState, primaryHand = null, timestamp = performance.now()) {
    // If an entity is already actively held, sticky maintain context until release
    if (this.activeHeldEntity) {
      return new SpatialContext({
        targetType: this.activeHeldEntity.targetType,
        targetEntity: this.activeHeldEntity.targetEntity,
        targetId: this.activeHeldEntity.targetId,
        relationship: SpatialRelationship.HOLDING,
        environment: this.activeHeldEntity.environment,
        metadata: { heldSince: this.activeHeldEntity.heldSince },
        timestamp
      });
    }

    // 1. Check if hovering/pointing at a 3D CAD Model (Air 3D Studio)
    if (this.studio && this.studio.isActive && this.studio.modelContainer) {
      if (this.studio.isHoveringModel || this.studio.isGrabbing) {
        return new SpatialContext({
          targetType: ContextTargetType.VIRTUAL_3D_OBJECT,
          targetEntity: this.studio.modelContainer,
          targetId: 'cad_model_root',
          relationship: this.studio.isGrabbing ? SpatialRelationship.HOLDING : SpatialRelationship.OVER,
          environment: 'studio',
          metadata: { studio: this.studio },
          timestamp
        });
      }
    }

    // 2. Check if near/touching an Air Physics Lab rigid body
    if (this.physicsLab && this.physicsLab.isActive && this.physicsLab.bodies?.length > 0) {
      if (this.physicsLab.grabbedBody) {
        return new SpatialContext({
          targetType: ContextTargetType.PHYSICS_RIGID_BODY,
          targetEntity: this.physicsLab.grabbedBody,
          targetId: `physics_body_${this.physicsLab.grabbedBody.id || 'current'}`,
          relationship: SpatialRelationship.HOLDING,
          environment: 'physics',
          metadata: { physicsLab: this.physicsLab },
          timestamp
        });
      }

      // Check spatial proximity to any body
      const nearestBody = this._findNearestPhysicsBody(primaryHand);
      if (nearestBody && nearestBody.distance < 0.25) {
        return new SpatialContext({
          targetType: ContextTargetType.PHYSICS_RIGID_BODY,
          targetEntity: nearestBody.body,
          targetId: `physics_body_${nearestBody.body.id || 'nearest'}`,
          relationship: nearestBody.distance < 0.12 ? SpatialRelationship.TOUCHING : SpatialRelationship.NEAR,
          environment: 'physics',
          metadata: { physicsLab: this.physicsLab, distance: nearestBody.distance },
          timestamp
        });
      }
    }

    // 3. Check tracked physical objects in SpatialWorldModel
    if (worldModel) {
      const physicalObjects = worldModel.getEntitiesByType('object');
      for (const obj of physicalObjects) {
        if (obj.relations?.isHeld) {
          return new SpatialContext({
            targetType: ContextTargetType.PHYSICAL_PROP,
            targetEntity: obj,
            targetId: obj.id,
            relationship: SpatialRelationship.HOLDING,
            environment: 'physical_world',
            timestamp
          });
        }
        if (obj.relations?.touching?.length > 0) {
          return new SpatialContext({
            targetType: ContextTargetType.PHYSICAL_PROP,
            targetEntity: obj,
            targetId: obj.id,
            relationship: SpatialRelationship.TOUCHING,
            environment: 'physical_world',
            timestamp
          });
        }
        if (obj.relations?.near?.length > 0) {
          return new SpatialContext({
            targetType: ContextTargetType.PHYSICAL_PROP,
            targetEntity: obj,
            targetId: obj.id,
            relationship: SpatialRelationship.NEAR,
            environment: 'physical_world',
            timestamp
          });
        }
      }
    }

    // 4. Check Direct-Touch Interactive 2D UI elements
    if (pointerState) {
      const hoveredElement = document.elementFromPoint(pointerState.x, pointerState.y);
      const interactiveEl = hoveredElement?.closest('button, input, select, a, [role="button"], .interactive-target');
      if (interactiveEl) {
        return new SpatialContext({
          targetType: ContextTargetType.INTERACTIVE_UI,
          targetEntity: interactiveEl,
          targetId: interactiveEl.id || interactiveEl.className || 'ui_button',
          relationship: SpatialRelationship.OVER,
          environment: 'desktop',
          metadata: { element: interactiveEl },
          timestamp
        });
      }
    }

    // 5. Default Fallback: The 2D OS Desktop Surface
    return new SpatialContext({
      targetType: ContextTargetType.OS_SURFACE,
      targetEntity: null,
      targetId: 'os_desktop',
      relationship: SpatialRelationship.OVER,
      environment: 'desktop',
      metadata: { screen: { width: window.screen.width, height: window.screen.height } },
      timestamp
    });
  }

  setStickyHold(targetType, targetEntity, targetId, environment) {
    this.activeHeldEntity = {
      targetType,
      targetEntity,
      targetId,
      environment,
      heldSince: performance.now()
    };
  }

  clearStickyHold() {
    this.activeHeldEntity = null;
  }

  _findNearestPhysicsBody(primaryHand) {
    if (!this.physicsLab || !primaryHand) return null;
    let closest = null;
    let minDist = Infinity;
    const handPos = primaryHand.wrist || { x: 0.5, y: 0.5, z: 0 };

    for (const item of this.physicsLab.bodies) {
      const bPos = item.body.position;
      // Convert Cannon coords to normalized space
      const dist = Math.hypot(handPos.x - (bPos.x + 0.5), handPos.y - (bPos.y + 0.5));
      if (dist < minDist) {
        minDist = dist;
        closest = { body: item.body, distance: dist };
      }
    }
    return closest;
  }
}
