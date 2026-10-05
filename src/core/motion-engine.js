/**
 * Motion Engine - Decoupled 3D Kinematics and Human Hand State Engine
 * 
 * Transforms raw 21 landmark sets into a complete, mathematically grounded,
 * frame-rate-independent kinematic model with velocities, joint angles,
 * palm normal vectors, calibrated depth, and emergent pose metrics.
 */

import { Vector3, calculateJointAngle, Vector3Filter, OneEuroFilter } from './math-utils.js';
import { SpatialCalibrator } from './spatial-calibrator.js';

export class MotionEngine {
  constructor() {
    this.calibrator = new SpatialCalibrator();

    // Independent temporal state buffers for Left and Right hands
    this.handStates = {
      Left: this._createHandBuffer(),
      Right: this._createHandBuffer()
    };
  }

  _createHandBuffer() {
    return {
      prevTimestamp: null,
      prevWristPos: null,
      prevWristVel: new Vector3(0, 0, 0),
      landmarkFilters: Array.from({ length: 21 }, () => new Vector3Filter(60, 0.9, 0.012)),
      wristFilter: new Vector3Filter(60, 1.2, 0.015),
      palmFilter: new Vector3Filter(60, 1.0, 0.01),
      velocityFilter: new Vector3Filter(60, 2.0, 0.02),
      confidenceFilter: new OneEuroFilter(60, 0.8, 0.01),
      isPinchingThumbIndex: false,
      isPinchingThumbMiddle: false,
      kinematicState: null
    };
  }

  /**
   * Reset tracking state for one or both hands
   */
  reset(handedness = null) {
    if (handedness && this.handStates[handedness]) {
      this.handStates[handedness] = this._createHandBuffer();
    } else {
      this.handStates.Left = this._createHandBuffer();
      this.handStates.Right = this._createHandBuffer();
      this.calibrator.resetCalibration();
    }
  }

  /**
   * Process a single hand's 21 landmarks into the full Kinematic State Contract
   * @param {Array} rawLandmarks - 21 normalized landmarks [{x, y, z}]
   * @param {string} handedness - 'Left' | 'Right'
   * @param {number} confidence - Tracking confidence [0, 1]
   * @param {number} timestamp - Performance timestamp in ms
   * @param {number} width - Video/viewport width
   * @param {number} height - Video/viewport height
   * @returns {Object} Full decoupled Kinematic Hand State
   */
  updateHand(rawLandmarks, handedness = 'Right', confidence = 0.9, timestamp = performance.now(), width = 1280, height = 720) {
    if (!rawLandmarks || rawLandmarks.length < 21) {
      return null;
    }

    const buffer = this.handStates[handedness] || this.handStates.Right;

    // 1. Spatial Depth & Metric Scale Calibration
    const spatialMetrics = this.calibrator.computeSpatialMetrics(rawLandmarks, width, height);

    // Unconstrained Full Sensor Projection (Zero Digital Zoom / Zero Crop)
    const screenPoints = rawLandmarks.map((lm) => ({
      u: lm.x,
      v: lm.y
    }));

    // Convert raw landmarks into calibrated 3D Vector3 array with per-joint temporal stabilization
    // This eliminates skeletal tremor while preserving instantaneous response
    const points = rawLandmarks.map((lm, idx) => {
      const x = (lm.x - 0.5) * 2.0; // [-1, 1]
      const y = -(lm.y - 0.5) * 2.0; // [-1, 1], Y-up
      const z = spatialMetrics.calibratedZ + (lm.z || 0) * 1.5;
      const rawVec = new Vector3(x, y, z);
      return buffer.landmarkFilters[idx].filter(rawVec, timestamp);
    });

    // 2. Wrist Position, Velocity and Acceleration
    const rawWrist = points[0];
    const wristPos = buffer.wristFilter.filter(rawWrist, timestamp);

    let wristVel = new Vector3(0, 0, 0);
    let wristAcc = new Vector3(0, 0, 0);

    if (buffer.prevTimestamp && buffer.prevWristPos) {
      const dt = Math.max(1e-4, (timestamp - buffer.prevTimestamp) / 1000.0);
      const rawVel = new Vector3(
        (wristPos.x - buffer.prevWristPos.x) / dt,
        (wristPos.y - buffer.prevWristPos.y) / dt,
        (wristPos.z - buffer.prevWristPos.z) / dt
      );
      wristVel = buffer.velocityFilter.filter(rawVel, timestamp);

      wristAcc = new Vector3(
        (wristVel.x - buffer.prevWristVel.x) / dt,
        (wristVel.y - buffer.prevWristVel.y) / dt,
        (wristVel.z - buffer.prevWristVel.z) / dt
      );
    }

    buffer.prevTimestamp = timestamp;
    buffer.prevWristPos = wristPos.clone();
    buffer.prevWristVel = wristVel.clone();

    // 3. Palm Center, Normal Vector and 3D Orientation
    // Palm center: centroid of wrist (0), index MCP (5), and pinky MCP (17)
    const palmCenter = new Vector3(
      (points[0].x + points[5].x + points[17].x) / 3,
      (points[0].y + points[5].y + points[17].y) / 3,
      (points[0].z + points[5].z + points[17].z) / 3
    );

    // Longitudinal vector: wrist -> middle MCP (9)
    const vLong = new Vector3(
      points[9].x - points[0].x,
      points[9].y - points[0].y,
      points[9].z - points[0].z
    ).normalize();

    // Transverse vector: pinky MCP (17) -> index MCP (5)
    const vTrans = new Vector3(
      points[5].x - points[17].x,
      points[5].y - points[17].y,
      points[5].z - points[17].z
    ).normalize();

    // Palm normal: Cross product (adjusted for handedness so it always points OUT of the palm)
    let palmNormal = (handedness === 'Right') 
      ? vTrans.cross(vLong).normalize()
      : vLong.cross(vTrans).normalize();

    // Orientation angles (Roll, Pitch, Yaw in degrees)
    // Roll: tilt around longitudinal axis
    const roll = Math.atan2(vTrans.y, vTrans.x) * (180 / Math.PI);
    // Pitch: elevation of longitudinal axis
    const pitch = Math.asin(Math.max(-1, Math.min(1, vLong.y))) * (180 / Math.PI);
    // Yaw: azimuth in X-Z plane
    const yaw = Math.atan2(vLong.x, vLong.z) * (180 / Math.PI);

    // 4. Detailed Joint Extraction and Angles per Finger
    const fingerIndices = {
      thumb:  [1, 2, 3, 4],     // CMC, MCP, IP, TIP
      index:  [5, 6, 7, 8],     // MCP, PIP, DIP, TIP
      middle: [9, 10, 11, 12],  // MCP, PIP, DIP, TIP
      ring:   [13, 14, 15, 16], // MCP, PIP, DIP, TIP
      pinky:  [17, 18, 19, 20]  // MCP, PIP, DIP, TIP
    };

    const fingers = {};
    const joints = {
      mcp: {},
      pip: {},
      dip: {},
      tip: {}
    };

    let totalFlexion = 0;
    let totalExtension = 0;

    for (const [fingerName, idxs] of Object.entries(fingerIndices)) {
      const pWrist = points[0];
      const pMcp = points[idxs[0]];
      const pPip = points[idxs[1]];
      const pDip = points[idxs[2]];
      const pTip = points[idxs[3]];

      joints.mcp[fingerName] = pMcp;
      joints.pip[fingerName] = pPip;
      joints.dip[fingerName] = pDip;
      joints.tip[fingerName] = pTip;

      // Joint angles
      const angleMcp = calculateJointAngle(pWrist, pMcp, pPip);
      const anglePip = calculateJointAngle(pMcp, pPip, pDip);
      const angleDip = calculateJointAngle(pPip, pDip, pTip);

      // Distance from TIP to Wrist normalized by sum of bone segments
      const boneSegmentsLen = pWrist.distanceTo(pMcp) + pMcp.distanceTo(pPip) + pPip.distanceTo(pDip) + pDip.distanceTo(pTip);
      const actualTipDistance = pWrist.distanceTo(pTip);
      const extensionRatio = Math.max(0, Math.min(1, (actualTipDistance / Math.max(0.01, boneSegmentsLen) - 0.25) / 0.65));
      const flexionRatio = 1.0 - extensionRatio;

      totalFlexion += flexionRatio;
      totalExtension += extensionRatio;

      // Finger pointing direction vector (MCP -> TIP)
      const direction = new Vector3(
        pTip.x - pMcp.x,
        pTip.y - pMcp.y,
        pTip.z - pMcp.z
      ).normalize();

      fingers[fingerName] = {
        tip: pTip,
        dip: pDip,
        pip: pPip,
        mcp: pMcp,
        angles: {
          mcp: angleMcp,
          pip: anglePip,
          dip: angleDip
        },
        extension: extensionRatio,
        flexion: flexionRatio,
        direction,
        isExtended: extensionRatio > 0.65,
        isCurled: flexionRatio > 0.70
      };
    }

    const meanOpenness = totalExtension / 5.0;
    const meanFlexion = totalFlexion / 5.0;

    // 5. Critical Euclidean Metric Distances (in calibrated space & relative)
    const tipThumb = points[4];
    const tipIndex = points[8];
    const tipMiddle = points[12];
    const tipRing = points[16];
    const tipPinky = points[20];

    const thumbIndexDist = tipThumb.distanceTo(tipIndex);
    const thumbMiddleDist = tipThumb.distanceTo(tipMiddle);
    const thumbPinkyDist = tipThumb.distanceTo(tipPinky);
    const indexMiddleDist = tipIndex.distanceTo(tipMiddle);
    const palmWidthDist = points[5].distanceTo(points[17]);
    const handSpanDist = tipThumb.distanceTo(tipPinky);

    // Dynamic pinch threshold based on hand scale with dual-threshold hysteresis
    // Enter pinch at tighter threshold, release at wider threshold to eliminate boundary chatter
    const basePinch = 0.12 * spatialMetrics.scaleFactor;
    const enterPinch = basePinch * 0.95;
    const exitPinch = basePinch * 1.25;

    let isPinchThumbIndex = buffer.isPinchingThumbIndex;
    if (!isPinchThumbIndex && thumbIndexDist < enterPinch) {
      isPinchThumbIndex = true;
    } else if (isPinchThumbIndex && thumbIndexDist > exitPinch) {
      isPinchThumbIndex = false;
    }
    buffer.isPinchingThumbIndex = isPinchThumbIndex;

    let isPinchThumbMiddle = buffer.isPinchingThumbMiddle;
    if (!isPinchThumbMiddle && thumbMiddleDist < enterPinch) {
      isPinchThumbMiddle = true;
    } else if (isPinchThumbMiddle && thumbMiddleDist > exitPinch) {
      isPinchThumbMiddle = false;
    }
    buffer.isPinchingThumbMiddle = isPinchThumbMiddle;

    // 6. Emergent Gestural Signatures (Mathematical, not hardcoded if/elses)
    // Pointing: Index is strongly extended, middle/ring/pinky are curled
    const isPointing = fingers.index.extension > 0.75 && 
                       fingers.middle.flexion > 0.60 && 
                       fingers.ring.flexion > 0.60 && 
                       fingers.pinky.flexion > 0.60;

    // Fist / Grab: All 4 non-thumb fingers strongly curled
    const isFist = fingers.index.flexion > 0.70 && 
                   fingers.middle.flexion > 0.70 && 
                   fingers.ring.flexion > 0.70 && 
                   fingers.pinky.flexion > 0.70;

    // Peace / Victory: Index and Middle extended, Ring and Pinky curled
    const isPeace = fingers.index.extension > 0.70 && 
                    fingers.middle.extension > 0.70 && 
                    fingers.ring.flexion > 0.65 && 
                    fingers.pinky.flexion > 0.65;

    // Open Palm: High general openness and facing camera
    const isPalmFacingCamera = palmNormal.z < -0.3; // In standard camera view, facing forward
    const isOpenPalm = meanOpenness > 0.75;

    // 7. Full Kinematic State Object (Completely Decoupled)
    const kinematicState = {
      timestamp,
      handedness,
      confidence: buffer.confidenceFilter.filter(confidence, timestamp),

      wrist: {
        position: { x: wristPos.x, y: wristPos.y, z: wristPos.z },
        velocity: { x: wristVel.x, y: wristVel.y, z: wristVel.z },
        acceleration: { x: wristAcc.x, y: wristAcc.y, z: wristAcc.z },
        speed: wristVel.length()
      },

      palm: {
        position: { x: palmCenter.x, y: palmCenter.y, z: palmCenter.z },
        normal: { x: palmNormal.x, y: palmNormal.y, z: palmNormal.z },
        orientation: { roll, pitch, yaw },
        isFacingCamera: isPalmFacingCamera
      },

      scale: {
        calibratedZ: spatialMetrics.calibratedZ,
        depthCm: spatialMetrics.depthCm,
        scaleFactor: spatialMetrics.scaleFactor,
        apparentSpanPx: spatialMetrics.apparentSpanPx,
        palmWidthPx: spatialMetrics.palmWidthPx
      },

      fingers,
      joints,

      distances: {
        thumbIndex: thumbIndexDist,
        thumbMiddle: thumbMiddleDist,
        thumbPinky: thumbPinkyDist,
        indexMiddle: indexMiddleDist,
        palmWidth: palmWidthDist,
        handSpan: handSpanDist
      },

      pose: {
        openness: meanOpenness,
        flexion: meanFlexion,
        isFist,
        isPointing,
        isPeace,
        isOpenPalm,
        isPinchThumbIndex,
        isPinchThumbMiddle,
        pinchStrengthThumbIndex: Math.max(0, Math.min(1, 1.0 - thumbIndexDist / (basePinch * 2)))
      },

      // Raw reference points for 3D visualizer
      points,

      // Exact pixel-aligned screen mapping
      screenPoints,
      videoWidth: width,
      videoHeight: height,
      screenWidth: screenW,
      screenHeight: screenH
    };

    buffer.kinematicState = kinematicState;
    return kinematicState;
  }
}
