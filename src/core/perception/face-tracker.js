/**
 * FaceTracker - Perception module for High-Fidelity Facial Landmark & Pose Tracking
 * Powered by MediaPipe FaceLandmarker:
 * - 478 3D facial landmarks (Face Mesh + Left/Right Iris)
 * - Head orientation: Pitch, Yaw, Roll
 * - Gaze direction estimation
 * - Facial expressions / metrics (Mouth open ratio, Blink detection, Smile)
 * - Emits candidate observations into the SpatialWorldModel
 */

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

export class FaceTracker {
  constructor(options = {}) {
    this.enabled = options.enabled || false;
    this.isInitialized = false;
    this.isInitializing = false;
    this.faceLandmarker = null;
    this.mirror = options.mirror !== undefined ? options.mirror : true;
    this.confidenceThreshold = options.confidenceThreshold || 0.5;
  }

  /**
   * Initializes MediaPipe FaceLandmarker with robust offline/online asset resolution
   */
  async initialize() {
    if (this.isInitialized) return true;
    if (this.isInitializing) return false;

    this.isInitializing = true;
    try {
      let vision = null;
      try {
        vision = await FilesetResolver.forVisionTasks('/wasm');
      } catch (e) {
        console.warn('[FaceTracker] Local WASM fileset failed, falling back to CDN:', e);
        vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
      }

      let modelAssetPath = '/models/face_landmarker.task';
      try {
        const resp = await fetch(modelAssetPath, { method: 'HEAD' });
        if (!resp.ok) throw new Error('Local task model not accessible');
      } catch (e) {
        // Fallback to Google MediaPipe Cloud Storage
        modelAssetPath = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
      }

      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath,
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: this.confidenceThreshold,
        minFacePresenceConfidence: this.confidenceThreshold,
        minTrackingConfidence: this.confidenceThreshold,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true
      });

      this.isInitialized = true;
      this.isInitializing = false;
      console.log('[FaceTracker] FaceLandmarker initialized successfully');
      return true;
    } catch (err) {
      this.isInitializing = false;
      console.warn('[FaceTracker] Initialization failed, will use geometric fallback:', err);
      return false;
    }
  }

  enable() {
    this.enabled = true;
    if (!this.isInitialized && !this.isInitializing) {
      this.initialize().catch(console.error);
    }
  }

  disable() {
    this.enabled = false;
  }

  toggle() {
    if (this.enabled) {
      this.disable();
      return false;
    } else {
      this.enable();
      return true;
    }
  }

  /**
   * Detects facial landmarks and pose in the current video frame
   * @param {HTMLVideoElement} videoElement
   * @param {number} timestamp
   * @returns {Object|null} Detection results with SpatialWorldModel candidate
   */
  detect(videoElement, timestamp = performance.now()) {
    if (!this.enabled || !videoElement || videoElement.readyState < 2 || videoElement.videoWidth === 0 || !this.faceLandmarker) {
      return null;
    }

    try {
      const results = this.faceLandmarker.detectForVideo(videoElement, timestamp);
      if (!results || !results.faceLandmarks || results.faceLandmarks.length === 0) {
        return { count: 0, candidates: [] };
      }

      const rawLandmarks = results.faceLandmarks[0];
      const transformedLandmarks = rawLandmarks.map((pt) => ({
        x: this.mirror ? 1.0 - pt.x : pt.x,
        y: pt.y,
        z: pt.z !== undefined ? pt.z : 0
      }));

      // 1. Calculate Head Pose (Pitch, Yaw, Roll)
      const headPose = this._computeHeadPose(transformedLandmarks);

      // 2. Calculate Gaze Direction
      const gaze = this._computeGaze(transformedLandmarks);

      // 3. Calculate Facial Metrics (Mouth opening, Blinking)
      const metrics = this._computeFacialMetrics(transformedLandmarks);

      // 4. Bounding Box & 3D Center
      const bbox = this._computeBoundingBox(transformedLandmarks);
      const center = {
        x: (bbox.minX + bbox.maxX) / 2,
        y: (bbox.minY + bbox.maxY) / 2,
        z: transformedLandmarks[1]?.z || 0 // Nose tip depth
      };

      const candidate = {
        suggestedId: 'face-primary',
        type: 'person',
        subType: 'face',
        coordSpace: 'normalized_relative',
        confidence: 0.95,
        position: center,
        rotation: headPose,
        boundingBox: bbox,
        landmarks: transformedLandmarks,
        customProps: {
          headPose,
          gaze,
          mouthOpen: metrics.mouthOpen,
          blinkLeft: metrics.blinkLeft,
          blinkRight: metrics.blinkRight,
          smile: metrics.smile,
          distanceToCamera: Math.max(0.2, 1.0 - bbox.width)
        }
      };

      return {
        count: 1,
        candidates: [candidate],
        rawResults: results
      };
    } catch (e) {
      return null;
    }
  }

  _computeHeadPose(lm) {
    if (!lm || lm.length < 468) return { pitch: 0, yaw: 0, roll: 0 };

    // Key anatomical landmarks:
    // 1: Nose tip
    // 152: Chin
    // 10: Forehead top
    // 234: Right ear tragus / cheek
    // 454: Left ear tragus / cheek
    // 33: Left eye outer corner
    // 263: Right eye outer corner

    const nose = lm[1];
    const leftCheek = lm[234];
    const rightCheek = lm[454];
    const chin = lm[152];
    const forehead = lm[10];

    // Yaw (Left/Right rotation)
    const midX = (leftCheek.x + rightCheek.x) / 2;
    const cheekWidth = Math.abs(rightCheek.x - leftCheek.x) || 0.001;
    const yaw = ((nose.x - midX) / (cheekWidth * 0.5)) * 45; // Approx degrees [-45..45]

    // Pitch (Up/Down tilt)
    const midY = (forehead.y + chin.y) / 2;
    const faceHeight = Math.abs(chin.y - forehead.y) || 0.001;
    const pitch = ((midY - nose.y) / (faceHeight * 0.5)) * 45;

    // Roll (Lateral head tilt)
    const rollRad = Math.atan2(rightCheek.y - leftCheek.y, rightCheek.x - leftCheek.x);
    const roll = (rollRad * 180) / Math.PI;

    return {
      pitch: Math.round(pitch * 10) / 10,
      yaw: Math.round(yaw * 10) / 10,
      roll: Math.round(roll * 10) / 10
    };
  }

  _computeGaze(lm) {
    if (!lm || lm.length < 478) return { x: 0, y: 0 };

    // Left Iris: 468, Right Iris: 473
    const leftIris = lm[468] || lm[469];
    const rightIris = lm[473] || lm[474];

    // Left eye corners: 33 (outer), 133 (inner)
    // Right eye corners: 362 (inner), 263 (outer)
    if (!leftIris || !rightIris || !lm[33] || !lm[133] || !lm[362] || !lm[263]) {
      return { x: 0, y: 0 };
    }

    const leftEyeMidX = (lm[33].x + lm[133].x) / 2;
    const rightEyeMidX = (lm[362].x + lm[263].x) / 2;

    const gazeX = ((leftIris.x - leftEyeMidX) + (rightIris.x - rightEyeMidX)) * 10;
    const gazeY = ((leftIris.y - (lm[33].y + lm[133].y) / 2)) * 10;

    return {
      x: Math.max(-1, Math.min(1, Math.round(gazeX * 100) / 100)),
      y: Math.max(-1, Math.min(1, Math.round(gazeY * 100) / 100))
    };
  }

  _computeFacialMetrics(lm) {
    if (!lm || lm.length < 468) {
      return { mouthOpen: 0, blinkLeft: false, blinkRight: false, smile: 0 };
    }

    // Mouth: 13 (upper lip inner), 14 (lower lip inner)
    // Chin to forehead: 152 to 10
    const lipDist = Math.hypot(lm[14].x - lm[13].x, lm[14].y - lm[13].y);
    const faceHeight = Math.hypot(lm[152].x - lm[10].x, lm[152].y - lm[10].y) || 0.001;
    const mouthOpen = Math.min(1.0, Math.round((lipDist / (faceHeight * 0.25)) * 100) / 100);

    // Left Eye Aperture: 159 (top), 145 (bottom)
    const leftAperture = Math.hypot(lm[159].x - lm[145].x, lm[159].y - lm[145].y);
    // Right Eye Aperture: 386 (top), 374 (bottom)
    const rightAperture = Math.hypot(lm[386].x - lm[374].x, lm[386].y - lm[374].y);

    const blinkLeft = leftAperture / faceHeight < 0.022;
    const blinkRight = rightAperture / faceHeight < 0.022;

    // Smile: mouth corners (61, 291) width vs jaw width
    const mouthWidth = Math.hypot(lm[291].x - lm[61].x, lm[291].y - lm[61].y);
    const smile = Math.min(1.0, Math.max(0, (mouthWidth / (faceHeight * 0.45) - 0.7) * 2.0));

    return {
      mouthOpen,
      blinkLeft,
      blinkRight,
      smile: Math.round(smile * 100) / 100
    };
  }

  _computeBoundingBox(lm) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (let i = 0; i < lm.length; i++) {
      const pt = lm[i];
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }

    return {
      minX: Math.max(0, minX),
      minY: Math.max(0, minY),
      maxX: Math.min(1, maxX),
      maxY: Math.min(1, maxY),
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY)
    };
  }
}
