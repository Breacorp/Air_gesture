/**
 * Intent Engine - Human Spatial Intent Classifier
 * 
 * "Air Gesture nunca debe aprender cómo funciona una aplicación.
 *  Air Gesture debe entender cómo funciona la interacción humana."
 * 
 * Classifies pure human spatial intentions (POINT, TOUCH, CLICK, GRAB, DRAG,
 * RELEASE, SCROLL, ROTATE, SCALE, PUSH, PULL, THROW, PAUSE, CANCEL)
 * directly from physical hand and body kinematics.
 */

import { IntentType, IntentState, SpatialIntent } from './spatial-intent.js';
import { globalEventBus } from '../event-bus.js';

export class IntentEngine {
  constructor(options = {}) {
    this.dragThresholdPx = options.dragThresholdPx || 16.0;
    this.clickMaxDurationMs = options.clickMaxDurationMs || 380;
    this.throwVelocityThreshold = options.throwVelocityThreshold || 0.45; // Normalized/s

    // Grip & Possession Tracking
    this.isGripping = false;
    this.gripStartTime = 0;
    this.gripStartPosition = { x: 0, y: 0, z: 0, screenX: 0, screenY: 0 };
    this.lastGripPosition = { x: 0, y: 0, z: 0, screenX: 0, screenY: 0 };
    this.isDragging = false;
    this.activeGripHand = 'Right';

    // Velocity window for THROW intent detection
    this.recentVelocityHistory = []; // [{ vx, vy, vz, speed, time }]
    this.historyWindowMs = 120;

    // Dual-hand spatial intents
    this.prevTwoHandDistance = null;
    this.prevTwoHandAngle = null;

    // Failsafe & System intents
    this.isPaused = false;
    this.pauseStartTime = 0;
    this.fistCancelStartTime = 0;

    // Body intents
    this.lastBodyIntentTime = 0;
    this.bodyCooldownMs = 1200;
  }

  /**
   * Process a frame and return all detected spatial intents
   * @param {Object} kinematicData { Left, Right, timestamp }
   * @param {Object} pointerState Stabilized screen cursor { x, y, vx, vy, speed }
   * @param {Object} [worldModel] SpatialWorldModel
   * @returns {SpatialIntent[]} List of active intents
   */
  process(kinematicData, pointerState, worldModel = null) {
    const intents = [];
    const timestamp = kinematicData?.timestamp || performance.now();
    const { Left, Right } = (kinematicData || {});
    const primaryHand = Right || Left;

    if (!primaryHand) {
      if (this.isGripping) {
        // Hand disappeared while gripping -> emit RELEASE
        intents.push(new SpatialIntent({
          type: IntentType.RELEASE,
          state: IntentState.END,
          source: this.activeGripHand === 'Left' ? 'hand_left' : 'hand_right',
          confidence: 0.8,
          position: { ...this.lastGripPosition },
          timestamp
        }));
        this.isGripping = false;
        this.isDragging = false;
      }
      this.pauseStartTime = 0;
      this.fistCancelStartTime = 0;
      return intents;
    }

    const handSource = primaryHand.handedness === 'Left' ? 'hand_left' : 'hand_right';

    // Track sliding velocity history for throw mechanics
    this._recordVelocity(primaryHand, timestamp);

    // 1. CANCEL INTENT: Double Fists (✊ + ✊ held > 1s)
    if (Left && Right && Left.pose?.isFist && Right.pose?.isFist) {
      if (this.fistCancelStartTime === 0) {
        this.fistCancelStartTime = timestamp;
      } else if (timestamp - this.fistCancelStartTime > 1000) {
        this.fistCancelStartTime = 0;
        intents.push(new SpatialIntent({
          type: IntentType.CANCEL,
          state: IntentState.START,
          source: 'two_hands',
          confidence: 1.0,
          payload: { reason: 'double_fist_failsafe' },
          timestamp
        }));
        return intents;
      }
    } else {
      this.fistCancelStartTime = 0;
    }

    // 2. PAUSE INTENT: Motionless Open Palm (✋) facing camera
    if (primaryHand.pose?.isOpenPalm && primaryHand.palm?.isFacingCamera && primaryHand.wrist?.speed < 0.15) {
      if (this.pauseStartTime === 0) {
        this.pauseStartTime = timestamp;
      } else if (timestamp - this.pauseStartTime > 1000) {
        this.pauseStartTime = timestamp + 10000; // debounce
        this.isPaused = !this.isPaused;
        intents.push(new SpatialIntent({
          type: IntentType.PAUSE,
          state: this.isPaused ? IntentState.START : IntentState.END,
          source: handSource,
          confidence: 0.95,
          payload: { isPaused: this.isPaused },
          timestamp
        }));
      }
    } else {
      this.pauseStartTime = 0;
    }

    if (this.isPaused) {
      return intents; // Suppress operational intents while paused
    }

    // 3. DUAL HAND INTENTS: SCALE & ROTATE
    if (Left && Right) {
      const dualIntents = this._processDualHandIntents(Left, Right, timestamp);
      intents.push(...dualIntents);
    } else {
      this.prevTwoHandDistance = null;
      this.prevTwoHandAngle = null;
    }

    // 4. POINT INTENT: Continuous stabilized pointing
    const isPinching = !!primaryHand.pose?.isPinchThumbIndex;
    const isRightPinching = !!primaryHand.pose?.isPinchThumbMiddle;
    const isFistGrip = !!primaryHand.pose?.isFist;
    const isGripActive = isPinching || isFistGrip;

    const screenPos = {
      x: pointerState.x,
      y: pointerState.y,
      z: primaryHand.wrist?.z || 0,
      screenX: pointerState.x,
      screenY: pointerState.y
    };

    const pointIntent = new SpatialIntent({
      type: IntentType.POINT,
      state: IntentState.ACTIVE,
      source: handSource,
      confidence: primaryHand.confidence || 0.9,
      position: screenPos,
      velocity: {
        vx: pointerState.vx || 0,
        vy: pointerState.vy || 0,
        vz: primaryHand.wrist?.vz || 0,
        speed: pointerState.speed || 0
      },
      payload: {
        handedness: primaryHand.handedness,
        isIndexExtended: !!primaryHand.fingers?.index?.isExtended
      },
      timestamp
    });
    intents.push(pointIntent);

    // 5. TOUCH / CLICK / GRAB / DRAG / RELEASE / THROW INTENTS
    if (isRightPinching) {
      // Secondary Click intent
      intents.push(new SpatialIntent({
        type: IntentType.CLICK,
        state: IntentState.ACTIVE,
        source: handSource,
        confidence: 0.95,
        position: screenPos,
        payload: { button: 'right' },
        timestamp
      }));
    }

    if (isGripActive) {
      if (!this.isGripping) {
        // GRAB START
        this.isGripping = true;
        this.activeGripHand = primaryHand.handedness;
        this.gripStartTime = timestamp;
        this.gripStartPosition = { ...screenPos };
        this.lastGripPosition = { ...screenPos };
        this.isDragging = false;

        intents.push(new SpatialIntent({
          type: IntentType.GRAB,
          state: IntentState.START,
          source: handSource,
          confidence: 0.95,
          position: screenPos,
          payload: { gripType: isFistGrip ? 'fist' : 'pinch', button: 'left' },
          timestamp
        }));
      } else {
        // Ongoing GRIP: Check if threshold crossed for DRAG
        const distMoved = Math.hypot(
          screenPos.x - this.gripStartPosition.x,
          screenPos.y - this.gripStartPosition.y
        );

        const delta = {
          x: screenPos.x - this.lastGripPosition.x,
          y: screenPos.y - this.lastGripPosition.y,
          z: screenPos.z - this.lastGripPosition.z
        };
        this.lastGripPosition = { ...screenPos };

        if (!this.isDragging && distMoved >= this.dragThresholdPx) {
          this.isDragging = true;
          intents.push(new SpatialIntent({
            type: IntentType.DRAG,
            state: IntentState.START,
            source: handSource,
            confidence: 0.95,
            position: screenPos,
            delta,
            payload: { button: 'left' },
            timestamp
          }));
        } else if (this.isDragging) {
          intents.push(new SpatialIntent({
            type: IntentType.DRAG,
            state: IntentState.ACTIVE,
            source: handSource,
            confidence: 0.95,
            position: screenPos,
            delta,
            payload: { button: 'left' },
            timestamp
          }));
        }
      }
    } else {
      if (this.isGripping) {
        // GRIP RELEASED
        const duration = timestamp - this.gripStartTime;
        const distMoved = Math.hypot(
          screenPos.x - this.gripStartPosition.x,
          screenPos.y - this.gripStartPosition.y
        );

        if (this.isDragging) {
          // Conclude DRAG
          intents.push(new SpatialIntent({
            type: IntentType.DRAG,
            state: IntentState.END,
            source: handSource,
            confidence: 0.95,
            position: screenPos,
            payload: { button: 'left' },
            timestamp
          }));

          // Evaluate THROW intent (dynamic release with velocity)
          const avgVelocity = this._computeReleaseVelocity();
          if (avgVelocity.speed > this.throwVelocityThreshold) {
            intents.push(new SpatialIntent({
              type: IntentType.THROW,
              state: IntentState.START,
              source: handSource,
              confidence: 0.9,
              position: screenPos,
              velocity: avgVelocity,
              payload: { speed: avgVelocity.speed },
              timestamp
            }));
          }
        } else if (duration <= this.clickMaxDurationMs && distMoved < this.dragThresholdPx) {
          // Short pinch without translation = CLICK intent
          intents.push(new SpatialIntent({
            type: IntentType.CLICK,
            state: IntentState.ACTIVE,
            source: handSource,
            confidence: 0.98,
            position: this.gripStartPosition,
            payload: { button: 'left' },
            timestamp
          }));
        }

        // Always emit universal RELEASE intent
        intents.push(new SpatialIntent({
          type: IntentType.RELEASE,
          state: IntentState.END,
          source: handSource,
          confidence: 0.95,
          position: screenPos,
          timestamp
        }));

        this.isGripping = false;
        this.isDragging = false;
      }
    }

    // 6. SCROLL INTENT: Two-finger extended or open hand vertical movement
    const isPeaceScroll = !!primaryHand.pose?.isPeace;
    const isOpenPalmScroll = !!primaryHand.pose?.isOpenPalm && !primaryHand.palm?.isFacingCamera && Math.abs(pointerState.vy || 0) > 60;

    if (isPeaceScroll || isOpenPalmScroll) {
      const deltaY = (pointerState.vy || 0) * 0.22;
      const deltaX = (pointerState.vx || 0) * 0.15;
      if (Math.abs(deltaY) > 0.5 || Math.abs(deltaX) > 0.5) {
        intents.push(new SpatialIntent({
          type: IntentType.SCROLL,
          state: IntentState.ACTIVE,
          source: handSource,
          confidence: 0.9,
          position: screenPos,
          delta: { x: deltaX, y: deltaY },
          payload: { deltaX, deltaY, mode: isPeaceScroll ? 'two_fingers' : 'palm_velocity' },
          timestamp
        }));
      }
    }

    // 7. PUSH / PULL INTENTS: Rapid depth displacement towards/away from scene
    const vz = primaryHand.wrist?.vz || 0;
    if (Math.abs(vz) > 0.75) {
      intents.push(new SpatialIntent({
        type: vz < 0 ? IntentType.PUSH : IntentType.PULL,
        state: IntentState.ACTIVE,
        source: handSource,
        confidence: 0.85,
        position: screenPos,
        velocity: { vx: 0, vy: 0, vz, speed: Math.abs(vz) },
        payload: { depthVelocity: vz },
        timestamp
      }));
    }

    // 8. GLOBAL BODY INTENTS
    if (worldModel && timestamp - this.lastBodyIntentTime > this.bodyCooldownMs) {
      const bodyEntity = worldModel.getEntity('body-primary');
      if (bodyEntity && bodyEntity.missingFrames === 0 && bodyEntity.customProps?.posture) {
        const posture = bodyEntity.customProps.posture;
        if (posture === 'hands_raised') {
          this.lastBodyIntentTime = timestamp;
          intents.push(new SpatialIntent({
            type: IntentType.PUSH, // Macro system navigation
            state: IntentState.START,
            source: 'body',
            confidence: 0.95,
            payload: { macroAction: 'system_mission_control' },
            timestamp
          }));
        }
      }
    }

    return intents;
  }

  _processDualHandIntents(leftHand, rightHand, timestamp) {
    const intents = [];
    const p1 = leftHand.wrist || { x: 0.3, y: 0.5, z: 0 };
    const p2 = rightHand.wrist || { x: 0.7, y: 0.5, z: 0 };

    const currentDist = Math.hypot(p2.x - p1.x, p2.y - p1.y, (p2.z || 0) - (p1.z || 0));
    const currentAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

    if (this.prevTwoHandDistance !== null && this.prevTwoHandAngle !== null) {
      const distanceDelta = currentDist - this.prevTwoHandDistance;
      let angleDelta = currentAngle - this.prevTwoHandAngle;

      // Wrap angle delta [-pi, pi]
      if (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
      if (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;

      // SCALE intent
      if (Math.abs(distanceDelta) > 0.008) {
        const scaleRatio = currentDist / Math.max(0.01, this.prevTwoHandDistance);
        intents.push(new SpatialIntent({
          type: IntentType.SCALE,
          state: IntentState.ACTIVE,
          source: 'two_hands',
          confidence: 0.92,
          delta: distanceDelta,
          payload: { scaleRatio, distanceDelta },
          timestamp
        }));
      }

      // ROTATE intent
      if (Math.abs(angleDelta) > 0.02) {
        intents.push(new SpatialIntent({
          type: IntentType.ROTATE,
          state: IntentState.ACTIVE,
          source: 'two_hands',
          confidence: 0.9,
          delta: angleDelta,
          payload: { angleDeltaRad: angleDelta, angleDeltaDeg: (angleDelta * 180) / Math.PI },
          timestamp
        }));
      }
    }

    this.prevTwoHandDistance = currentDist;
    this.prevTwoHandAngle = currentAngle;
    return intents;
  }

  _recordVelocity(hand, timestamp) {
    const v = hand.wrist?.velocity || { vx: 0, vy: 0, vz: 0, speed: 0 };
    this.recentVelocityHistory.push({
      vx: v.vx || 0,
      vy: v.vy || 0,
      vz: v.vz || 0,
      speed: v.speed || Math.hypot(v.vx || 0, v.vy || 0, v.vz || 0),
      time: timestamp
    });

    // Prune entries older than historyWindowMs
    const cutoff = timestamp - this.historyWindowMs;
    while (this.recentVelocityHistory.length > 0 && this.recentVelocityHistory[0].time < cutoff) {
      this.recentVelocityHistory.shift();
    }
  }

  _computeReleaseVelocity() {
    if (this.recentVelocityHistory.length === 0) {
      return { vx: 0, vy: 0, vz: 0, speed: 0 };
    }
    let sumVx = 0, sumVy = 0, sumVz = 0, sumSpeed = 0;
    for (const item of this.recentVelocityHistory) {
      sumVx += item.vx;
      sumVy += item.vy;
      sumVz += item.vz;
      sumSpeed += item.speed;
    }
    const count = this.recentVelocityHistory.length;
    return {
      vx: sumVx / count,
      vy: sumVy / count,
      vz: sumVz / count,
      speed: sumSpeed / count
    };
  }
}
