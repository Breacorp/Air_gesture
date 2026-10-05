/**
 * SurfaceDetector - Tabletop & Physical Surface Perception Engine
 * 
 * Identifies and models physical surfaces (e.g. desk-001, tabletop plane).
 * Evaluates spatial relationships between surfaces, hands, and physical objects:
 * - 'on_surface': Object rests stably on the table plane
 * - 'lifted': Hand picks up object off the table
 * - 'placed': Hand places object down onto the table
 * - 'sliding': Object pushed or slid horizontally along the table
 * - 'surface:tap': Hand fingertip taps directly on the table surface
 */

export class SurfaceDetector {
  /**
   * @param {Object} [options]
   * @param {number} [options.deskHeight=0.0] - Calibrated Y-level of desk plane
   * @param {number} [options.tolerance=0.06] - Distance threshold for contact with surface
   */
  constructor(options = {}) {
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    this.deskId = options.deskId || 'desk-001';
    this.deskHeight = options.deskHeight !== undefined ? options.deskHeight : 0.0;
    this.tolerance = options.tolerance || 0.06;

    // Physical bounds of desk in normalized world space
    this.deskBounds = options.bounds || {
      minX: -0.6,
      maxX: 0.6,
      minZ: 0.2,
      maxZ: 0.9
    };

    // Tracking state
    this.previousObjectStates = new Map(); // objectId -> { state, time }
    this.objectsOnSurface = new Set();
    this.slidingObjects = new Set();

    // Hand tap detection
    this.lastHandTaps = new Map(); // handId -> timestamp

    // Event listeners
    this.listeners = {
      'surface:object_placed': [],
      'surface:object_lifted': [],
      'surface:object_sliding': [],
      'surface:tap': []
    };
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  _emit(event, data) {
    const list = this.listeners[event];
    if (list) {
      for (const cb of list) {
        cb(data);
      }
    }
  }

  /**
   * Updates desk plane height based on calibration or Desk View homography
   * @param {number} height
   */
  setDeskHeight(height) {
    this.deskHeight = height;
  }

  /**
   * Main surface analysis step
   * @param {Array<Object>} objects - List of active tracked object entities / tracks
   * @param {Array<Object>} hands - List of active hands
   * @param {number} timestamp
   * @returns {Object} Candidate observation for SpatialWorldModel
   */
  update(objects = [], hands = [], timestamp = performance.now()) {
    if (!this.enabled) return null;

    const currentOnSurface = new Set();
    const currentSliding = new Set();

    // 1. Analyze Objects relative to desk plane
    for (const obj of objects) {
      const objId = obj.id || obj.suggestedId || 'object-001';
      const pos = obj.position || obj.centroid || { x: 0, y: 0, z: 0 };
      const vel = obj.velocity || { x: 0, y: 0, z: 0 };

      // Distance to desk horizontal plane
      const distToDesk = Math.abs((pos.y !== undefined ? pos.y : 0) - this.deskHeight);
      const isWithinBounds = (pos.x >= this.deskBounds.minX && pos.x <= this.deskBounds.maxX);

      const horizSpeed = Math.hypot(vel.x || 0, vel.z || 0);
      const vertSpeed = Math.abs(vel.y || 0);

      const isContact = (distToDesk <= this.tolerance) && isWithinBounds;
      const isHeld = obj.isHeld || (obj.relations && obj.relations.heldBy);

      let currentState = 'airborne';

      if (isContact && !isHeld) {
        if (horizSpeed > 0.08) {
          currentState = 'sliding';
          currentSliding.add(objId);
        } else {
          currentState = 'on_surface';
        }
        currentOnSurface.add(objId);
      } else if (isHeld) {
        currentState = 'held';
      }

      // Check state transitions
      const prevRecord = this.previousObjectStates.get(objId);
      const prevState = prevRecord ? prevRecord.state : 'unknown';

      if (prevState !== currentState) {
        // PLACED event: transitioned from held/airborne to on_surface or sliding
        if ((prevState === 'held' || prevState === 'airborne') && (currentState === 'on_surface' || currentState === 'sliding')) {
          this._emit('surface:object_placed', {
            surfaceId: this.deskId,
            objectId: objId,
            position: { ...pos },
            timestamp
          });
        }

        // LIFTED event: transitioned from on_surface/sliding to held or airborne
        if ((prevState === 'on_surface' || prevState === 'sliding') && (currentState === 'held' || currentState === 'airborne')) {
          this._emit('surface:object_lifted', {
            surfaceId: this.deskId,
            objectId: objId,
            heldBy: obj.relations?.heldBy || null,
            position: { ...pos },
            timestamp
          });
        }

        // SLIDING event
        if (currentState === 'sliding') {
          this._emit('surface:object_sliding', {
            surfaceId: this.deskId,
            objectId: objId,
            velocity: { ...vel },
            speed: horizSpeed,
            timestamp
          });
        }
      }

      this.previousObjectStates.set(objId, { state: currentState, time: timestamp });

      // Augment object metadata if it's a TrackedEntity
      if (obj.customProps) {
        obj.customProps.surfaceState = currentState;
        obj.customProps.distToDesk = distToDesk;
        obj.customProps.supportedBy = (currentState === 'on_surface' || currentState === 'sliding') ? this.deskId : null;
      }
    }

    this.objectsOnSurface = currentOnSurface;
    this.slidingObjects = currentSliding;

    // 2. Analyze Hand Contact / Desk Surface Tap
    for (const hand of hands) {
      const handId = hand.id || 'hand-right';
      const indexTip = hand.keypoints?.indexTip || hand.position;
      if (!indexTip) continue;

      const distToDesk = Math.abs((indexTip.y !== undefined ? indexTip.y : 0) - this.deskHeight);
      const velY = hand.velocity?.y || 0;

      // Downward velocity towards surface followed by proximity
      const lastTap = this.lastHandTaps.get(handId) || 0;
      if (distToDesk <= this.tolerance * 0.7 && velY > 0.15 && (timestamp - lastTap > 300)) {
        this.lastHandTaps.set(handId, timestamp);
        this._emit('surface:tap', {
          surfaceId: this.deskId,
          handId,
          position: { ...indexTip },
          timestamp
        });
      }
    }

    // 3. Construct Surface Candidate for SpatialWorldModel
    return {
      suggestedId: this.deskId,
      type: 'surface',
      subType: 'desk',
      coordSpace: 'metric_world',
      confidence: 0.99,
      plane: {
        normal: [0, 1, 0],
        height: this.deskHeight,
        equation: [0, 1, 0, -this.deskHeight]
      },
      bounds: { ...this.deskBounds },
      supportedObjects: Array.from(this.objectsOnSurface),
      customProps: {
        activeObjectsCount: this.objectsOnSurface.size,
        slidingObjectsCount: this.slidingObjects.size,
        supportedObjects: Array.from(this.objectsOnSurface)
      }
    };
  }
}
