/**
 * TrackingFusion - Spatial Relationship & Multimodal Correlation Engine
 * 
 * Sits directly on top of the SpatialWorldModel.
 * Evaluates spatial geometry, proximity, and postures across all active entities
 * (Hand <-> Object, Hand <-> Body, Body Posture) and manages relational states
 * (isHeld, heldBy, attachedTo, near, touching, handsCrossed, handsRaised).
 */

export class TrackingFusion {
  constructor(worldModel) {
    this.worldModel = worldModel;

    // Proximity thresholds in normalized spatial coordinates
    this.NEAR_THRESHOLD = 0.22;
    this.TOUCH_THRESHOLD = 0.12;

    // Event listeners
    this.listeners = {
      'object:grabbed': [],
      'object:released': [],
      'hand:near_object': [],
      'body:posture_changed': []
    };

    // Tracking state cache for edge transitions
    this._previouslyHeld = new Map(); // objectId -> handId
    this._activeRelationsSummary = [];
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
   * Returns a concise human-readable summary of all active spatial relationships
   * @returns {string[]}
   */
  getRelationsSummary() {
    return this._activeRelationsSummary;
  }

  /**
   * Main fusion cycle called every frame after world model updates
   * @param {number} timestamp
   */
  update(timestamp = performance.now()) {
    if (!this.worldModel) return;

    this._activeRelationsSummary = [];

    const hands = this.worldModel.getEntitiesByType('hand');
    const objects = [
      ...this.worldModel.getEntitiesByType('object'),
      ...this.worldModel.getEntitiesByType('prop'),
      ...this.worldModel.getEntitiesByType('virtual')
    ];
    const body = this.worldModel.getEntity('body-primary');

    // 1. Reset dynamic relations for this frame
    for (const hand of hands) {
      hand.relations.near = [];
      hand.relations.touching = [];
      hand.relations.holding = null;
      hand.customProps.distToTorso = null;
      hand.customProps.isRaisedAboveHead = false;
    }

    for (const obj of objects) {
      obj.relations.near = [];
      obj.relations.touching = [];
    }

    // 2. Hand <-> Object Fusion (Proximity, Touch & Grip)
    this._fuseHandsAndObjects(hands, objects, timestamp);

    // 3. Hand <-> Body Fusion (Attached wrists, Posture, Raised hands, Crossing)
    if (body && body.missingFrames === 0) {
      this._fuseHandsAndBody(hands, body, timestamp);
    }

    // 4. Surface <-> Object & Surface <-> Hand Fusion (Desk View & Tabletop Support)
    const surfaces = this.worldModel.getEntitiesByType('surface');
    if (surfaces.length > 0) {
      this._fuseSurfacesAndEntities(surfaces, objects, hands, timestamp);
    }
  }

  /**
   * Evaluates Hand <-> Object spatial interactions using geometry-aware multi-landmark contact
   */
  _fuseHandsAndObjects(hands, objects, timestamp) {
    const currentlyHeldObjIds = new Set();

    for (const obj of objects) {
      if (obj.missingFrames > 0) continue;

      let closestHand = null;
      let minSurfaceDist = Infinity;
      const objRadius = obj.customProps?.radius || (obj.scale?.x ? obj.scale.x / 2 : 0.08);

      for (const hand of hands) {
        if (hand.missingFrames > 0) continue;

        // Multi-point contact evaluation: check all 5 fingertips + palm center
        // Landmark indices: 4 (thumb), 8 (index), 12 (middle), 16 (ring), 20 (pinky)
        const contactCandidates = [];
        if (hand.landmarks && hand.landmarks.length >= 21) {
          contactCandidates.push(hand.landmarks[4]);  // Thumb tip
          contactCandidates.push(hand.landmarks[8]);  // Index tip
          contactCandidates.push(hand.landmarks[12]); // Middle tip
          contactCandidates.push(hand.landmarks[16]); // Ring tip
          contactCandidates.push(hand.landmarks[20]); // Pinky tip
          // Palm center
          contactCandidates.push({
            x: (hand.landmarks[0].x + hand.landmarks[9].x) / 2,
            y: (hand.landmarks[0].y + hand.landmarks[9].y) / 2,
            z: ((hand.landmarks[0].z || 0) + (hand.landmarks[9].z || 0)) / 2
          });
        } else {
          contactCandidates.push(hand.position);
        }

        // Find minimum distance between any fingertip/palm and object surface
        let handMinDist = Infinity;
        for (const pt of contactCandidates) {
          const dx = pt.x - obj.position.x;
          const dy = pt.y - obj.position.y;
          const dz = ((pt.z || 0) - (obj.position.z || 0)) * 0.5;
          const centerDist = Math.hypot(dx, dy, dz);
          const surfaceDist = Math.max(0, centerDist - objRadius);

          if (surfaceDist < handMinDist) {
            handMinDist = surfaceDist;
          }
        }

        if (handMinDist < minSurfaceDist) {
          minSurfaceDist = handMinDist;
          closestHand = hand;
        }

        const isNear = handMinDist < this.NEAR_THRESHOLD;
        const isTouching = handMinDist < this.TOUCH_THRESHOLD;

        // Update Hand interactionState
        hand.interactionState.hovered = hand.interactionState.hovered || isNear;
        hand.interactionState.touching = hand.interactionState.touching || isTouching;

        // Check Proximity (NEAR)
        if (isNear) {
          hand.relations.near.push(obj.id);
          obj.relations.near.push(hand.id);
          obj.interactionState.hovered = true;

          this._emit('hand:near_object', { handId: hand.id, objectId: obj.id, distance: handMinDist, timestamp });
          this._activeRelationsSummary.push(`${hand.subType} CERCA DE ${obj.id}`);
        }

        // Check Contact (TOUCHING)
        if (isTouching) {
          hand.relations.touching.push(obj.id);
          obj.relations.touching.push(hand.id);
          obj.interactionState.touching = true;
        }
      }

      // Check Grip / Hold Condition
      if (closestHand && minSurfaceDist < this.TOUCH_THRESHOLD) {
        const isHandGripping = this._isHandPinchingOrGripping(closestHand);

        if (isHandGripping) {
          // Object is actively HELD by hand
          obj.relations.heldBy = closestHand.id;
          closestHand.relations.holding = obj.id;
          
          obj.interactionState.grabbed = true;
          obj.interactionState.heldBy = closestHand.id;
          obj.interactionState.dragging = true;

          closestHand.interactionState.grabbed = true;
          closestHand.interactionState.dragging = true;

          obj.customProps.isHeld = true;
          obj.customProps.heldBy = closestHand.id;
          currentlyHeldObjIds.add(obj.id);

          this._activeRelationsSummary.push(`🖐️ ${closestHand.subType} SOSTIENE ${obj.id}`);

          // Edge detection: Transition to GRABBED
          if (this._previouslyHeld.get(obj.id) !== closestHand.id) {
            this._previouslyHeld.set(obj.id, closestHand.id);
            this._emit('object:grabbed', {
              objectId: obj.id,
              handId: closestHand.id,
              handPosition: closestHand.position,
              timestamp
            });
          }
        }
      }

      // Edge detection: Transition from HELD to RELEASED
      const prevHolder = this._previouslyHeld.get(obj.id);
      if (prevHolder && !currentlyHeldObjIds.has(obj.id)) {
        const releasingHand = this.worldModel.getEntity(prevHolder);
        const throwVelocity = releasingHand ? { ...releasingHand.velocity } : { ...obj.velocity };

        obj.interactionState.grabbed = false;
        obj.interactionState.heldBy = null;
        obj.interactionState.dragging = false;

        if (releasingHand) {
          releasingHand.interactionState.grabbed = false;
          releasingHand.interactionState.dragging = false;
        }

        obj.customProps.isHeld = false;
        obj.customProps.heldBy = null;
        obj.customProps.throwVelocity = throwVelocity;
        obj.relations.heldBy = null;

        this._previouslyHeld.delete(obj.id);

        this._emit('object:released', {
          objectId: obj.id,
          releasedBy: prevHolder,
          throwVelocity,
          timestamp
        });

        this._activeRelationsSummary.push(`🚀 ${obj.id} LANZADO por ${prevHolder} (${throwVelocity.speed.toFixed(1)} u/s)`);
      }
    }
  }

  /**
   * Determines if a hand entity is pinching or closing fingers into a grip
   */
  _isHandPinchingOrGripping(hand) {
    if (!hand) return false;

    // 1. Direct gesture state if already provided by pose recognizer
    if (hand.customProps?.isPinch || hand.customProps?.isFist) {
      return true;
    }

    // 2. Landmark distance between Thumb Tip (4) and Index Tip (8)
    if (hand.landmarks && hand.landmarks[4] && hand.landmarks[8]) {
      const t = hand.landmarks[4];
      const i = hand.landmarks[8];
      const pinchDist = Math.hypot(t.x - i.x, t.y - i.y, (t.z - i.z) * 0.5);
      if (pinchDist < 0.08) return true;
    }

    return false;
  }

  /**
   * Evaluates Hand <-> Body anatomical and postural relationships
   */
  _fuseHandsAndBody(hands, body, timestamp) {
    body.customProps.handsCrossed = false;
    body.customProps.bothHandsRaised = false;
    body.customProps.isTPose = false;

    const kp = body.customProps?.keypoints;
    const nose = kp?.nose || (body.landmarks && body.landmarks[0]);
    const torsoCentroid = body.position;

    const handLeft = this.worldModel.getEntity('hand-left');
    const handRight = this.worldModel.getEntity('hand-right');

    for (const hand of hands) {
      if (hand.missingFrames > 0) continue;
      hand.relations.attachedTo = body.id;

      // Distance to Torso
      const dTorso = Math.hypot(hand.position.x - torsoCentroid.x, hand.position.y - torsoCentroid.y);
      hand.customProps.distToTorso = dTorso;

      // Raised above head (in screen coords Y = 0 is top, so smaller Y is higher)
      if (nose && hand.position.y < (nose.y - 0.05)) {
        hand.customProps.isRaisedAboveHead = true;
        this._activeRelationsSummary.push(`${hand.subType} ELEVADA`);
      }
    }

    // Check Both Hands Raised
    if (handLeft && handRight && handLeft.customProps.isRaisedAboveHead && handRight.customProps.isRaisedAboveHead) {
      body.customProps.bothHandsRaised = true;
      this._activeRelationsSummary.push(`🙌 AMBOS BRAZOS ELEVADOS`);
      this._emit('body:posture_changed', { posture: 'hands_raised', timestamp });
    }

    // Check Hands Crossed
    // In mirror mode: Left hand is normally on the left (smaller X), Right hand on right (larger X)
    if (handLeft && handRight && handLeft.missingFrames === 0 && handRight.missingFrames === 0) {
      if (handLeft.position.x > (handRight.position.x + 0.08)) {
        body.customProps.handsCrossed = true;
        this._activeRelationsSummary.push(`⚔️ BRAZOS CRUZADOS`);
        this._emit('body:posture_changed', { posture: 'hands_crossed', timestamp });
      }

      // Check T-Pose (Arms extended horizontally at shoulder height)
      if (kp?.leftShoulder && kp?.rightShoulder) {
        const leftArmSpan = Math.abs(handLeft.position.x - kp.leftShoulder.x);
        const rightArmSpan = Math.abs(handRight.position.x - kp.rightShoulder.x);
        const leftArmLevel = Math.abs(handLeft.position.y - kp.leftShoulder.y);
        const rightArmLevel = Math.abs(handRight.position.y - kp.rightShoulder.y);

        if (leftArmSpan > 0.25 && rightArmSpan > 0.25 && leftArmLevel < 0.12 && rightArmLevel < 0.12) {
          body.customProps.isTPose = true;
          this._activeRelationsSummary.push(`🧘 T-POSE ESPACIAL`);
          this._emit('body:posture_changed', { posture: 't_pose', timestamp });
        }
      }
    }
  }

  /**
   * Evaluates Surface <-> Object and Surface <-> Hand spatial relations (e.g. Desk View)
   */
  _fuseSurfacesAndEntities(surfaces, objects, hands, timestamp) {
    for (const surface of surfaces) {
      if (surface.missingFrames > 0) continue;

      const supportedObjects = [];
      const deskY = surface.customProps?.plane?.height ?? (surface.position?.y || 0.0);

      for (const obj of objects) {
        if (obj.missingFrames > 0) continue;

        const isHeld = obj.relations?.heldBy !== null && obj.relations?.heldBy !== undefined;
        const objY = obj.position?.y !== undefined ? obj.position.y : 0;
        const distToPlane = Math.abs(objY - deskY);

        if (!isHeld && distToPlane <= 0.08) {
          supportedObjects.push(obj.id);
          obj.customProps.supportedBy = surface.id;

          const speed = Math.hypot(obj.velocity?.x || 0, obj.velocity?.z || 0);
          if (speed > 0.06) {
            obj.customProps.surfaceState = 'sliding';
            this._activeRelationsSummary.push(`🏄 ${obj.id} DESLIZANDO sobre ${surface.id}`);
          } else {
            obj.customProps.surfaceState = 'on_surface';
            this._activeRelationsSummary.push(`🪑 ${surface.id} SOSTIENE ${obj.id}`);
          }
        } else if (isHeld) {
          obj.customProps.surfaceState = 'held';
          obj.customProps.supportedBy = null;
        } else {
          obj.customProps.surfaceState = 'airborne';
          obj.customProps.supportedBy = null;
        }
      }

      surface.customProps.supportedObjects = supportedObjects;
      surface.customProps.activeObjectsCount = supportedObjects.length;
    }
  }
}
