/**
 * HandTracker - Perception module for Hand Landmark Detection
 * Wraps MediaPipe HandLandmarker locally, performs coordinate normalization,
 * and produces candidate observations for the Spatial World Model.
 */

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export class HandTracker {
  constructor(options = {}) {
    this.handLandmarker = null;
    this.isInitialized = false;
    this.mirror = options.mirror !== undefined ? options.mirror : true;
    this.swapHands = options.swapHands || false;
    this.numHands = options.numHands || 2;
    this.pinchStates = {
      left: { smoothDist: 0.1, active: false },
      right: { smoothDist: 0.1, active: false }
    };

    this._initializationPromise = null;
  }

  /**
   * Initializes MediaPipe HandLandmarker using bundled local assets.
   */
  async initialize() {
    if (this.handLandmarker) return true;
    if (this._initializationPromise) return this._initializationPromise;

    this._initializationPromise = (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks('/wasm');
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/hand_landmarker.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: this.numHands,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        this.handLandmarker = landmarker;
        this.isInitialized = true;
        return true;
      } catch (error) {
        console.error('[HandTracker] Failed to initialize:', error);
        throw error;
      } finally {
        this._initializationPromise = null;
      }
    })();
    return this._initializationPromise;
  }

  close() {
    this.handLandmarker?.close();
    this.handLandmarker = null;
    this.isInitialized = false;
  }

  /**
   * Processes a video frame and produces both raw hand data and Spatial Entity Candidates
   * @param {HTMLVideoElement} videoElement
   * @param {number} timestamp
   */
  detect(videoElement, timestamp = performance.now()) {
    if (!this.handLandmarker || !videoElement || videoElement.readyState < 2 || videoElement.videoWidth === 0) {
      return null;
    }

    try {
      const results = this.handLandmarker.detectForVideo(videoElement, timestamp);
      if (!results) return null;

    const handsData = [];
    const candidates = [];
    const count = results.landmarks ? results.landmarks.length : 0;

    for (let i = 0; i < count; i++) {
      const rawLandmarks = results.landmarks[i];
      const handednessInfo = results.handednesses && results.handednesses[i] && results.handednesses[i][0];

      // Mirror horizontally if enabled
      const processedLandmarks = rawLandmarks.map(lm => ({
        x: this.mirror ? (1.0 - lm.x) : lm.x,
        y: lm.y,
        z: lm.z
      }));

      // MediaPipe HandLandmarker categoryName directly indicates 'Left' or 'Right'
      let handedness = handednessInfo 
        ? handednessInfo.categoryName 
        : (processedLandmarks[0].x < 0.5 ? 'Left' : 'Right');

      if (this.swapHands) {
        handedness = (handedness === 'Left') ? 'Right' : 'Left';
      }

      const confidence = handednessInfo ? handednessInfo.score : 0.9;

      handsData.push({
        landmarks: processedLandmarks,
        handedness,
        confidence
      });
    }

    // Dual-hand spatial consistency check in mirror mode
    if (handsData.length === 2) {
      const x0 = handsData[0].landmarks[0].x;
      const x1 = handsData[1].landmarks[0].x;
      const needsCorrection = 
        handsData[0].handedness === handsData[1].handedness ||
        (x0 < x1 && handsData[0].handedness !== 'Left') ||
        (x0 > x1 && handsData[0].handedness !== 'Right');

      if (needsCorrection) {
        if (x0 < x1) {
          handsData[0].handedness = 'Left';
          handsData[1].handedness = 'Right';
        } else {
          handsData[0].handedness = 'Right';
          handsData[1].handedness = 'Left';
        }
      }

      if (this.swapHands) {
        handsData[0].handedness = (handsData[0].handedness === 'Left') ? 'Right' : 'Left';
        handsData[1].handedness = (handsData[1].handedness === 'Left') ? 'Right' : 'Left';
      }
    }

    // Generate Universal Candidate Observations for SpatialWorldModel
    for (const hand of handsData) {
      const wrist = hand.landmarks[0];
      const middleMcp = hand.landmarks[9];
      const indexTip = hand.landmarks[8];
      const thumbTip = hand.landmarks[4];

      // Precision Pinch Detection: Manual Euclidean Distance between Thumb and Index Tips

      const dx = indexTip.x - thumbTip.x;
      const dy = indexTip.y - thumbTip.y;
      const dz = indexTip.z - thumbTip.z;
      const rawDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      // 1. Normalize distance by hand size (Wrist to Middle MCP) to handle depth/size
      const handSize = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y);
      const normDist = rawDist / (handSize || 0.1);
      
      // 2. Exponential Moving Average (EMA) to remove jitter
      const side = hand.handedness.toLowerCase();
      const state = this.pinchStates[side] || { smoothDist: normDist, active: false };
      state.smoothDist = (normDist * 0.4) + (state.smoothDist * 0.6);
      
      // 3. Hysteresis: Different thresholds for activation and release
      if (!state.active && state.smoothDist < 0.4) {
        state.active = true;
      } else if (state.active && state.smoothDist > 0.6) {
        state.active = false;
      }
      this.pinchStates[side] = state;
      
      const isPinching = state.active;
      const pinchDist = rawDist; // Keep for telemetry


      candidates.push({
        suggestedId: `hand-${hand.handedness.toLowerCase()}`,
        type: 'hand',
        subType: hand.handedness,
        coordSpace: 'normalized_relative',
        position: { x: wrist.x, y: wrist.y, z: wrist.z || 0 },
        landmarks: hand.landmarks,
        confidence: hand.confidence,
        customProps: {
          handedness: hand.handedness,
          wristPos: wrist,
          middleMcpPos: middleMcp,
          indexTipPos: indexTip,
          pinchDist: pinchDist,
          isPinching: isPinching
        }
      });
    }

    return {
      hands: handsData,
      candidates,
      count: handsData.length
    };
  } catch (err) {
    console.warn('[HandTracker] detect exception caught:', err);
    return null;
  }
}
}
