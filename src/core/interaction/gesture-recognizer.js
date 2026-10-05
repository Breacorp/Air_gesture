/**
 * GestureRecognizer - Temporal State Machine & Posture Evaluator
 * 
 * Exclusively responsible for classifying discrete and continuous gestural interactions
 * (Pinch, Drag, Scroll, Zoom, Rotate, Body gestures, and Emergency Failsafes)
 * with hysteresis, hold timers, and debouncing.
 * 
 * Emits clean semantic input events onto globalEventBus.
 */

import { globalEventBus } from '../event-bus.js';

export const GestureState = {
  IDLE: 'IDLE',
  POINTING: 'POINTING',
  PINCH_PENDING: 'PINCH_PENDING',
  DRAGGING: 'DRAGGING',
  SCROLLING: 'SCROLLING',
  PAUSED: 'PAUSED'
};

export class GestureRecognizer {
  constructor(pointerController) {
    this.pointerController = pointerController;

    this.state = GestureState.IDLE;
    this.activeHand = 'Right';

    // Gestures FSM thresholds
    this.dragThresholdPx = 16.0;
    this.clickMaxDurationMs = 380;
    this.minPinchHoldMs = 40;

    // Pinch & Drag tracking
    this.pinchStartTime = 0;
    this.pinchStartPosition = { x: 0, y: 0 };
    this.lastPinchPosition = { x: 0, y: 0 };
    this.isDragging = false;
    this.wasRightPinching = false;

    // Scroll tracking
    this.scrollAnchorY = 0;
    this.lastScrollTime = 0;

    // Dual-hand spatial interaction tracking
    this.prevTwoHandDistance = null;
    this.prevTwoHandAngle = null;

    // Fast dynamic swipe detection
    this.lastSwipeTime = 0;
    this.swipeCooldownMs = 450;
    this.swipeSpeedThreshold = 2.2;

    // Failsafe & Pause tracking
    this.isSystemPaused = false;
    this.pauseHoldStartTime = 0;
    this.fistEmergencyStartTime = 0;

    // Body gestures cooldown (prevent spamming Mission Control)
    this.enableBodyGestures = false;
    this.lastBodyGestureTime = 0;
    this.bodyGestureCooldownMs = 1200;
  }

  /**
   * Process frame kinematics and body observations to classify gestures
   * @param {Object} kinematicData { Left, Right, timestamp }
   * @param {Object} pointerState Current pointer state { x, y, vx, vy, speed }
   * @param {Object} [worldModel] Optional SpatialWorldModel for body postures
   */
  process(kinematicData, pointerState, worldModel = null) {
    const { Left, Right, timestamp = performance.now() } = (kinematicData || {});
    const primaryHand = Right || Left;

    if (!primaryHand) {
      if (this.state !== GestureState.IDLE) {
        this._transitionTo(GestureState.IDLE, timestamp);
      }
      this.pauseHoldStartTime = 0;
      this.fistEmergencyStartTime = 0;
      return { state: this.state, isPaused: this.isSystemPaused };
    }

    this.activeHand = primaryHand.handedness;

    // 1. EVALUATE EMERGENCY FAILSAFE: Double Fists (✊ + ✊ held 1s)
    if (Left && Right && Left.pose?.isFist && Right.pose?.isFist) {
      if (this.fistEmergencyStartTime === 0) {
        this.fistEmergencyStartTime = timestamp;
      } else if (timestamp - this.fistEmergencyStartTime > 1000) {
        this.fistEmergencyStartTime = 0;
        console.warn('[GestureRecognizer] Emergency Double-Fist Failsafe Triggered! Disabling OS Control.');
        globalEventBus.emit('failsafe:emergency_stop', { reason: 'double_fist', timestamp });
        return { state: this.state, isPaused: this.isSystemPaused, emergencyStop: true };
      }
    } else {
      this.fistEmergencyStartTime = 0;
    }

    // 2. EVALUATE PAUSE GESTURE: Open Palm facing camera, stationary for >1s
    if (primaryHand.pose?.isOpenPalm && primaryHand.palm?.isFacingCamera && primaryHand.wrist?.speed < 0.15) {
      if (this.pauseHoldStartTime === 0) {
        this.pauseHoldStartTime = timestamp;
      } else if (timestamp - this.pauseHoldStartTime > 1000) {
        this.pauseHoldStartTime = timestamp + 10000; // debounce
        this.isSystemPaused = !this.isSystemPaused;
        console.log(`[GestureRecognizer] System Pause Toggled: ${this.isSystemPaused ? 'PAUSED' : 'RESUMED'}`);
        globalEventBus.emit('system_pause', { isPaused: this.isSystemPaused, hand: this.activeHand });
        if (this.isSystemPaused) {
          this._transitionTo(GestureState.PAUSED, timestamp);
        } else {
          this._transitionTo(GestureState.POINTING, timestamp);
        }
      }
    } else {
      this.pauseHoldStartTime = 0;
    }

    // If currently paused, bypass further gesture recognition
    if (this.isSystemPaused) {
      return { state: GestureState.PAUSED, isPaused: true };
    }

    // 3. Dual-Hand Zoom & Rotate
    if (Left && Right) {
      this._processTwoHandInteractions(Left, Right, timestamp);
    } else {
      this.prevTwoHandDistance = null;
      this.prevTwoHandAngle = null;
    }

    // 4. Fast Dynamic Swipes
    this._processSwipeGestures(primaryHand, timestamp);

    // 5. Global Body Gestures (Mission Control, Desktop Navigation)
    if (this.enableBodyGestures && worldModel) {
      this._processBodyGestures(worldModel, timestamp);
    }

    // 6. Primary Hand FSM (Point, Pinch, Click, Drag, Scroll)
    this._updateFSM(primaryHand, pointerState, timestamp);

    return {
      state: this.state,
      isPaused: this.isSystemPaused
    };
  }

  _updateFSM(handState, pointerState, timestamp) {
    const isPinching = !!handState.pose?.isPinchThumbIndex;
    const isRightPinching = !!handState.pose?.isPinchThumbMiddle;
    const isPeaceScroll = !!handState.pose?.isPeace;
    const isOpenPalmScroll = !!handState.pose?.isOpenPalm && !handState.palm?.isFacingCamera && Math.abs(pointerState.velocityY || 0) > 80;
    const isScrollGesture = isPeaceScroll || isOpenPalmScroll;

    // Handle Right Click (Thumb + Middle Finger Pinch)
    if (isRightPinching && !this.wasRightPinching) {
      this.wasRightPinching = true;
      globalEventBus.emit('pointer_down', {
        x: pointerState.x,
        y: pointerState.y,
        button: 'right',
        hand: this.activeHand
      });
    } else if (!isRightPinching && this.wasRightPinching) {
      this.wasRightPinching = false;
      globalEventBus.emit('pointer_up', {
        x: pointerState.x,
        y: pointerState.y,
        button: 'right',
        hand: this.activeHand
      });
      globalEventBus.emit('click', {
        x: pointerState.x,
        y: pointerState.y,
        button: 'right',
        hand: this.activeHand
      });
    }

    switch (this.state) {
      case GestureState.IDLE:
      case GestureState.PAUSED:
        this._transitionTo(GestureState.POINTING, timestamp);
        break;

      case GestureState.POINTING:
        if (isPinching) {
          // Pinch initiated -> immediately anchor pointer position to eliminate click jitter
          this.pinchStartTime = timestamp;
          this.pinchStartPosition = { x: pointerState.x, y: pointerState.y };
          this.lastPinchPosition = { x: pointerState.x, y: pointerState.y };
          this.isDragging = false;

          if (this.pointerController) {
            this.pointerController.setAnchor(this.pinchStartPosition);
          }

          globalEventBus.emit('pointer_down', {
            x: this.pinchStartPosition.x,
            y: this.pinchStartPosition.y,
            button: 'left',
            hand: this.activeHand
          });

          globalEventBus.emit('pinch_start', {
            hand: this.activeHand,
            position: { x: this.pinchStartPosition.x, y: this.pinchStartPosition.y },
            timestamp
          });

          this._transitionTo(GestureState.PINCH_PENDING, timestamp);
        } else if (isScrollGesture) {
          this.scrollAnchorY = pointerState.y;
          this.lastScrollTime = timestamp;
          this._transitionTo(GestureState.SCROLLING, timestamp);
        }
        break;

      case GestureState.PINCH_PENDING:
        if (!isPinching) {
          // Pinch released without exceeding drag threshold -> Clean Click
          const duration = timestamp - this.pinchStartTime;
          const distMoved = Math.hypot(
            pointerState.x - this.pinchStartPosition.x,
            pointerState.y - this.pinchStartPosition.y
          );

          if (this.pointerController) {
            this.pointerController.clearAnchor();
          }

          globalEventBus.emit('pointer_up', {
            x: this.pinchStartPosition.x,
            y: this.pinchStartPosition.y,
            button: 'left',
            hand: this.activeHand
          });

          if (duration <= this.clickMaxDurationMs && distMoved < this.dragThresholdPx) {
            globalEventBus.emit('click', {
              x: this.pinchStartPosition.x,
              y: this.pinchStartPosition.y,
              button: 'left',
              hand: this.activeHand
            });
          }

          globalEventBus.emit('pinch_end', {
            hand: this.activeHand,
            position: { x: pointerState.x, y: pointerState.y },
            duration,
            wasClick: distMoved < this.dragThresholdPx,
            wasDrag: false
          });

          this._transitionTo(GestureState.POINTING, timestamp);
        } else {
          // Pinch continues: check if moved far enough to become a Drag
          const distMoved = Math.hypot(
            pointerState.x - this.pinchStartPosition.x,
            pointerState.y - this.pinchStartPosition.y
          );

          if (distMoved >= this.dragThresholdPx) {
            this.isDragging = true;
            if (this.pointerController) {
              this.pointerController.clearAnchor(); // Unfreeze anchor for fluid drag
            }

            globalEventBus.emit('drag_start', {
              x: pointerState.x,
              y: pointerState.y,
              button: 'left',
              hand: this.activeHand
            });

            this._transitionTo(GestureState.DRAGGING, timestamp);
          } else {
            this.lastPinchPosition = { x: pointerState.x, y: pointerState.y };
          }
        }
        break;

      case GestureState.DRAGGING:
        if (!isPinching) {
          // Drag finished
          if (this.pointerController) {
            this.pointerController.clearAnchor();
          }

          globalEventBus.emit('drag_end', {
            x: pointerState.x,
            y: pointerState.y,
            button: 'left',
            hand: this.activeHand
          });

          globalEventBus.emit('pointer_up', {
            x: pointerState.x,
            y: pointerState.y,
            button: 'left',
            hand: this.activeHand
          });

          globalEventBus.emit('pinch_end', {
            hand: this.activeHand,
            position: { x: pointerState.x, y: pointerState.y },
            duration: timestamp - this.pinchStartTime,
            wasClick: false,
            wasDrag: true
          });

          this.isDragging = false;
          this._transitionTo(GestureState.POINTING, timestamp);
        } else {
          const deltaX = pointerState.x - this.lastPinchPosition.x;
          const deltaY = pointerState.y - this.lastPinchPosition.y;

          globalEventBus.emit('drag_move', {
            x: pointerState.x,
            y: pointerState.y,
            delta: { x: deltaX, y: deltaY },
            button: 'left',
            hand: this.activeHand
          });

          this.lastPinchPosition = { x: pointerState.x, y: pointerState.y };
        }
        break;

      case GestureState.SCROLLING:
        if (!isScrollGesture) {
          this._transitionTo(GestureState.POINTING, timestamp);
        } else {
          const deltaY = pointerState.y - this.scrollAnchorY;
          if (Math.abs(deltaY) > 6) {
            const scrollSpeed = deltaY * 0.45;
            globalEventBus.emit('scroll', {
              deltaY: Math.round(scrollSpeed),
              deltaX: 0,
              hand: this.activeHand
            });
            this.scrollAnchorY += deltaY * 0.35;
          }
        }
        break;
    }
  }

  _processTwoHandInteractions(leftHand, rightHand, timestamp) {
    const leftPt = leftHand.points?.[8] || leftHand.palm?.center;
    const rightPt = rightHand.points?.[8] || rightHand.palm?.center;
    if (!leftPt || !rightPt) return;

    const dx = rightPt.x - leftPt.x;
    const dy = rightPt.y - leftPt.y;
    const currentDist = Math.hypot(dx, dy);

    if (this.prevTwoHandDistance !== null) {
      const distanceDelta = currentDist - this.prevTwoHandDistance;
      if (Math.abs(distanceDelta) > 0.005) {
        globalEventBus.emit('two_hand_zoom', {
          distance: currentDist,
          distanceDelta,
          factor: currentDist / (this.prevTwoHandDistance || 1),
          timestamp
        });
      }
    }
    this.prevTwoHandDistance = currentDist;

    const currentAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (this.prevTwoHandAngle !== null) {
      let angleDelta = currentAngle - this.prevTwoHandAngle;
      if (angleDelta > 180) angleDelta -= 360;
      if (angleDelta < -180) angleDelta += 360;

      if (Math.abs(angleDelta) > 1.0) {
        globalEventBus.emit('two_hand_rotate', {
          angle: currentAngle,
          angleDelta,
          timestamp
        });
      }
    }
    this.prevTwoHandAngle = currentAngle;
  }

  _processSwipeGestures(primaryHand, timestamp) {
    if (!primaryHand.wrist?.velocity) return;
    const speed = primaryHand.wrist.speed || 0;
    if (speed > this.swipeSpeedThreshold && (timestamp - this.lastSwipeTime > this.swipeCooldownMs)) {
      const vel = primaryHand.wrist.velocity;
      let direction = null;
      if (Math.abs(vel.x) > Math.abs(vel.y)) {
        direction = vel.x > 0 ? 'right' : 'left';
      } else {
        direction = vel.y > 0 ? 'up' : 'down';
      }

      if (direction) {
        this.lastSwipeTime = timestamp;
        globalEventBus.emit('swipe', {
          direction,
          speed,
          hand: primaryHand.handedness,
          timestamp
        });
      }
    }
  }

  _processBodyGestures(worldModel, timestamp) {
    if (timestamp - this.lastBodyGestureTime < this.bodyGestureCooldownMs) return;

    const bodyEntity = worldModel.getEntity?.('body-primary');
    if (!bodyEntity || bodyEntity.missingFrames > 0 || !bodyEntity.landmarks) return;

    const lm = bodyEntity.landmarks;
    // Landmark references (MediaPipe Pose):
    // 0: nose, 11: left shoulder, 12: right shoulder, 15: left wrist, 16: right wrist
    const nose = lm[0];
    const leftWrist = lm[15];
    const rightWrist = lm[16];
    const leftShoulder = lm[11];
    const rightShoulder = lm[12];

    if (!nose || !leftWrist || !rightWrist) return;

    // 1. Both Arms Raised (Mission Control) 🙌
    if (leftWrist.y < nose.y && rightWrist.y < nose.y) {
      this.lastBodyGestureTime = timestamp;
      console.log('[GestureRecognizer] Body Gesture: Both Arms Raised -> Mission Control');
      globalEventBus.emit('system_mission_control', { timestamp });
      return;
    }

    // 2. Left Arm Extended Outward (Desktop Prev) 👈
    if (leftShoulder && leftWrist.x < leftShoulder.x - 0.25 && Math.abs(leftWrist.y - leftShoulder.y) < 0.20) {
      this.lastBodyGestureTime = timestamp;
      console.log('[GestureRecognizer] Body Gesture: Left Arm Extended -> Desktop Prev');
      globalEventBus.emit('system_desktop_prev', { timestamp });
      return;
    }

    // 3. Right Arm Extended Outward (Desktop Next) 👉
    if (rightShoulder && rightWrist.x > rightShoulder.x + 0.25 && Math.abs(rightWrist.y - rightShoulder.y) < 0.20) {
      this.lastBodyGestureTime = timestamp;
      console.log('[GestureRecognizer] Body Gesture: Right Arm Extended -> Desktop Next');
      globalEventBus.emit('system_desktop_next', { timestamp });
      return;
    }
  }

  _transitionTo(newState, timestamp) {
    const oldState = this.state;
    this.state = newState;
    globalEventBus.emit('interaction_state_change', {
      from: oldState,
      to: newState,
      timestamp,
      hand: this.activeHand
    });
  }
}
