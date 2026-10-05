/**
 * Spatial Calibrator
 * Converts raw perspective projections and MediaPipe relative landmarks
 * into a consistent, anatomically normalized 3D coordinate space.
 */

import { Vector3 } from './math-utils.js';

export class SpatialCalibrator {
  constructor() {
    // Anatomical averages in centimeters (adult hand reference)
    this.ANATOMICAL_METACARPAL_REF_CM = 9.5; // Distance Landmark 0 (wrist) -> Landmark 9 (middle MCP)
    this.ANATOMICAL_PALM_WIDTH_CM = 8.0;     // Distance Landmark 5 (index MCP) -> Landmark 17 (pinky MCP)
    
    // Baseline calibration (at typical comfortable distance ~50-60cm from camera)
    this.baselineSpanPixels = 180; // Estimated pixel span at comfortable arm position
    this.isCalibrated = false;
    this.calibratedBaseline = null;
    
    // Dynamic running statistics
    this.recentSpans = [];
    this.maxSpanHistory = 60;
  }

  /**
   * Calibrates baseline based on current hand position
   */
  setCalibrationBaseline(landmarks, imageWidth = 1280, imageHeight = 720) {
    if (!landmarks || landmarks.length < 21) return null;
    
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];
    
    const dx = (middleMcp.x - wrist.x) * imageWidth;
    const dy = (middleMcp.y - wrist.y) * imageHeight;
    const spanPx = Math.sqrt(dx * dx + dy * dy);
    
    if (spanPx > 20) {
      this.baselineSpanPixels = spanPx;
      this.isCalibrated = true;
      this.calibratedBaseline = {
        spanPx,
        timestamp: performance.now()
      };
      return this.calibratedBaseline;
    }
    return null;
  }

  /**
   * Resets calibration to auto-adaptive defaults
   */
  resetCalibration() {
    this.isCalibrated = false;
    this.calibratedBaseline = null;
    this.recentSpans = [];
  }

  /**
   * Calculates consistent calibrated spatial depth and anatomical scale
   * @param {Array} landmarks - 21 MediaPipe landmarks
   * @param {number} imageWidth
   * @param {number} imageHeight
   * @returns {Object} { calibratedZ, scaleFactor, handSpanCm, apparentSpanPx }
   */
  computeSpatialMetrics(landmarks, imageWidth = 1280, imageHeight = 720) {
    if (!landmarks || landmarks.length < 21) {
      return {
        calibratedZ: 0,
        depthCm: 50,
        scaleFactor: 1.0,
        handSpanCm: this.ANATOMICAL_METACARPAL_REF_CM,
        apparentSpanPx: this.baselineSpanPixels,
        palmWidthPx: 80
      };
    }

    const wrist = landmarks[0];
    const middleMcp = landmarks[9];
    const indexMcp = landmarks[5];
    const pinkyMcp = landmarks[17];

    // 1. Apparent pixel length of metacarpal bone (wrist -> middle finger MCP)
    const dxMcp = (middleMcp.x - wrist.x) * imageWidth;
    const dyMcp = (middleMcp.y - wrist.y) * imageHeight;
    const apparentSpanPx = Math.sqrt(dxMcp * dxMcp + dyMcp * dyMcp);

    // 2. Apparent pixel width of palm (index MCP -> pinky MCP)
    const dxPalm = (pinkyMcp.x - indexMcp.x) * imageWidth;
    const dyPalm = (pinkyMcp.y - indexMcp.y) * imageHeight;
    const palmWidthPx = Math.sqrt(dxPalm * dxPalm + dyPalm * dyPalm);

    // Keep history for smooth auto-baseline if not manually calibrated
    if (!this.isCalibrated) {
      this.recentSpans.push(apparentSpanPx);
      if (this.recentSpans.length > this.maxSpanHistory) {
        this.recentSpans.shift();
      }
    }

    const refBaseline = this.isCalibrated 
      ? this.baselineSpanPixels 
      : (this.recentSpans.length > 10 
          ? this.recentSpans.reduce((a, b) => a + b, 0) / this.recentSpans.length 
          : this.baselineSpanPixels);

    // 3. Scale factor: Hand size relative to baseline (1.0 at baseline)
    const scaleFactor = Math.max(0.2, apparentSpanPx / Math.max(1, refBaseline));

    // 4. Perspective distance estimation:
    // Physical distance Z is inversely proportional to apparent size on sensor
    // baseline corresponds to nominal 50 cm distance from camera
    const nominalBaselineDistanceCm = 50.0;
    const depthCm = nominalBaselineDistanceCm / Math.max(0.2, scaleFactor);

    // 5. Calibrated relative Z from user's first-person perspective:
    // 0 = at baseline working plane (~50cm from camera)
    // Moving hand toward camera/monitor = extending arm into virtual world (negative Z, recedes deeper, looks smaller)
    // Moving hand away from camera toward chest = pulling hand closer to user (positive Z, comes forward, looks bigger)
    // Range normalized roughly [-1.0, +1.0] for spatial interaction
    const calibratedZ = -(scaleFactor - 1.0) * 1.5;

    return {
      relativeDepth: calibratedZ,       // Normalized relative depth [-1.0, +1.0] for spatial interaction
      cameraDepth: depthCm,             // Relative camera distance index
      calibratedZ,                      // Backwards compatibility alias
      depthCm,                          // Backwards compatibility alias
      scaleFactor,                      // Hand scale multiplier
      apparentSpanPx,                   // Raw pixel size on camera sensor
      palmWidthPx                       // Raw palm width in pixels
    };
  }
}
