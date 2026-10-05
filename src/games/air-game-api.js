/**
 * AirGameAPI - Universal Spatial Game Interaction API
 * 
 * "El juego no detecta manos. El juego recibe:
 *  hand.position, hand.velocity, hand.pinch, hand.grab, hand.slash,
 *  body.pose, body.velocity, object.position, object.velocity, interaction events."
 * 
 * Sits directly between the Spatial World Model / Intent Engine and downstream games.
 * Decouples game logic completely from MediaPipe, WebCam, or raw computer vision.
 */

export class AirGameAPI {
  constructor(worldModel, interactionEngine) {
    this.worldModel = worldModel;
    this.interactionEngine = interactionEngine;

    this.listeners = new Map(); // eventName -> Set<callback>

    // Trajectory buffers for high-speed blade / slash detection
    this.slashBuffers = {
      left: [],  // [{ x, y, z, time }]
      right: []
    };
    this.minSlashSpeed = 0.32; // normalized units / second for slash trigger

    // Previous state cache for edge triggers
    this.prevState = {
      leftPinching: false,
      rightPinching: false,
      isJumping: false,
      isCrouching: false
    };

    // Public World Proxy
    this.world = {
      hands: { left: null, right: null, count: 0 },
      body: null,
      objects: [],
      entities: [],
      relations: []
    };
  }

  // --- EVENT SUBSCRIPTION ---

  /**
   * Subscribe to spatial game events
   * @param {string} eventName
   * @param {Function} callback
   */
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(callback);
    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName).delete(callback);
    }
  }

  emit(eventName, data) {
    const handlers = this.listeners.get(eventName);
    if (handlers) {
      for (const cb of handlers) {
        try {
          cb(data);
        } catch (err) {
          console.error(`[AirGameAPI] Error in listener for '${eventName}':`, err);
        }
      }
    }
  }

  // --- FRAME UPDATE & DISPATCH ---

  /**
   * Dispatches current spatial state from WorldModel and kinematic data
   * @param {Object} kinematicData Hands data from HandTracker
   * @param {SpatialWorldModel} worldModel Single Source of Truth
   * @param {number} timestamp
   */
  update(kinematicData = [], worldModel, timestamp = performance.now()) {
    if (worldModel) this.worldModel = worldModel;
    if (!this.worldModel) return;

    // 1. Refresh Public World State
    this._refreshWorldState(timestamp);

    // 2. Process Hand Events (Move, Pinch, Grab, Release, Slash)
    this._processHands(kinematicData, timestamp);

    // 3. Process Body Events (Jump, Crouch, Pose)
    this._processBody(timestamp);

    // 4. Process Physical Objects & Props (Move, Grab, Throw)
    this._processObjects(timestamp);
  }

  _refreshWorldState(timestamp) {
    const handLeft = this.worldModel.getEntity('hand-left');
    const handRight = this.worldModel.getEntity('hand-right');
    const body = this.worldModel.getEntity('body-primary');
    const objects = this.worldModel.getEntitiesByType('object');

    this.world.hands.left = handLeft && handLeft.missingFrames === 0 ? handLeft : null;
    this.world.hands.right = handRight && handRight.missingFrames === 0 ? handRight : null;
    this.world.hands.count = (this.world.hands.left ? 1 : 0) + (this.world.hands.right ? 1 : 0);

    this.world.body = body && body.missingFrames === 0 ? body : null;
    this.world.objects = objects;
    this.world.entities = this.worldModel.getAllActiveEntities();
    this.world.relations = this.worldModel.getRelationsSummary ? this.worldModel.getRelationsSummary() : [];
  }

  _processHands(kinematicData, timestamp) {
    for (const hand of kinematicData) {
      const side = (hand.handedness || 'right').toLowerCase();
      const pos = {
        x: hand.palm?.center?.x || hand.wrist?.position?.x || 0.5,
        y: hand.palm?.center?.y || hand.wrist?.position?.y || 0.5,
        z: hand.scale?.relativeDepth || hand.scale?.calibratedZ || 0
      };

      const vel = {
        vx: hand.wrist?.velocity?.vx || 0,
        vy: hand.wrist?.velocity?.vy || 0,
        vz: hand.wrist?.velocity?.vz || 0,
        speed: hand.wrist?.speed || Math.hypot(hand.wrist?.velocity?.vx || 0, hand.wrist?.velocity?.vy || 0)
      };

      const isPinching = !!hand.pose?.isPinchThumbIndex;
      const pinchStrength = hand.pose?.pinchStrengthThumbIndex || 0;
      const isGrabbed = !!hand.pose?.isFist || pinchStrength > 0.8;

      // Event: hand.move
      this.emit('hand.move', {
        hand: side,
        position: pos,
        velocity: vel,
        isPinching,
        isGrabbed,
        timestamp
      });

      // Event: hand.pinch / hand.pinch_release
      const prevPinch = side === 'left' ? this.prevState.leftPinching : this.prevState.rightPinching;
      if (isPinching && !prevPinch) {
        this.emit('hand.pinch', { hand: side, position: pos, strength: pinchStrength, timestamp });
      } else if (!isPinching && prevPinch) {
        this.emit('hand.pinch_release', { hand: side, position: pos, timestamp });
      }

      if (side === 'left') this.prevState.leftPinching = isPinching;
      else this.prevState.rightPinching = isPinching;

      // Event: hand.grab / hand.release
      if (isGrabbed) {
        this.emit('hand.grab', { hand: side, position: pos, velocity: vel, timestamp });
      } else if (prevPinch || vel.speed > 0.25) {
        this.emit('hand.release', { hand: side, position: pos, velocity: vel, timestamp });
      }

      // Event: hand.slash (High-speed blade trajectory slice)
      this._detectSlash(side, pos, vel, timestamp);
    }
  }

  _detectSlash(side, pos, vel, timestamp) {
    const buffer = this.slashBuffers[side];
    buffer.push({ x: pos.x, y: pos.y, z: pos.z, time: timestamp });

    // Keep last 140ms
    while (buffer.length > 0 && timestamp - buffer[0].time > 140) {
      buffer.shift();
    }

    if (buffer.length < 3) return;

    const pOld = buffer[0];
    const pNew = buffer[buffer.length - 1];
    const dt = Math.max(0.01, (pNew.time - pOld.time) / 1000);
    const dist = Math.hypot(pNew.x - pOld.x, pNew.y - pOld.y);
    const speed = dist / dt;

    if (speed >= this.minSlashSpeed) {
      const angle = Math.atan2(pNew.y - pOld.y, pNew.x - pOld.x);
      this.emit('hand.slash', {
        hand: side,
        speed,
        angle,
        p1: { x: pOld.x, y: pOld.y, z: pOld.z },
        p2: { x: pNew.x, y: pNew.y, z: pNew.z },
        line: { x1: pOld.x, y1: pOld.y, x2: pNew.x, y2: pNew.y },
        timestamp
      });
    }
  }

  _processBody(timestamp) {
    const body = this.world.body;
    if (!body) return;

    const vy = body.velocity?.vy || 0;
    const posY = body.position.y;

    // Jumping: high upward velocity
    const isJumping = vy < -0.35; // Screen Y is inverted (up is negative Y)
    if (isJumping && !this.prevState.isJumping) {
      this.emit('body.jump', { velocity: vy, height: posY, timestamp });
    }
    this.prevState.isJumping = isJumping;

    // Crouching: position drops downwards
    const isCrouching = posY > 0.65;
    if (isCrouching && !this.prevState.isCrouching) {
      this.emit('body.crouch', { depth: posY, timestamp });
    }
    this.prevState.isCrouching = isCrouching;

    this.emit('body.pose', {
      position: body.position,
      velocity: body.velocity,
      scale: body.scale,
      timestamp
    });
  }

  _processObjects(timestamp) {
    for (const obj of this.world.objects) {
      this.emit('object.move', {
        id: obj.id,
        subType: obj.subType,
        position: obj.position,
        velocity: obj.velocity,
        status: obj.customProps?.status || 'ACTIVE',
        shape: obj.customProps?.shapeLabel || 'detected',
        timestamp
      });

      if (obj.velocity.speed > 0.6 && obj.missingFrames === 0) {
        this.emit('object.throw', {
          id: obj.id,
          position: obj.position,
          velocity: obj.velocity,
          timestamp
        });
      }
    }
  }

  // --- GEOMETRIC COLLISION UTILITIES FOR GAMES ---

  /**
   * Tests whether a 2D line segment (e.g. blade slash) intersects a circle (fruit/target)
   * @param {{x1, y1, x2, y2}} line
   * @param {{x, y, radius}} circle
   * @returns {boolean}
   */
  static checkLineCircleIntersection(line, circle) {
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      return Math.hypot(circle.x - line.x1, circle.y - line.y1) <= circle.radius;
    }

    // Project circle center onto segment, clamped between 0 and 1
    const t = Math.max(0, Math.min(1, ((circle.x - line.x1) * dx + (circle.y - line.y1) * dy) / lenSq));
    const nearestX = line.x1 + t * dx;
    const nearestY = line.y1 + t * dy;

    const dist = Math.hypot(circle.x - nearestX, circle.y - nearestY);
    return dist <= circle.radius;
  }
}
