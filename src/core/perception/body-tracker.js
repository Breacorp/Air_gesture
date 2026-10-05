/**
 * BodyTracker - Perception module for Full-Body Pose Landmark Detection
 * (Fase 2: Body Pose Tracking via MediaPipe PoseLandmarker)
 * 
 * Tracks 33 skeletal body landmarks (head, shoulders, elbows, wrists, hips, knees, ankles)
 * and generates candidate spatial entities for the SpatialWorldModel.
 */

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

export class BodyTracker {
  constructor(options = {}) {
    this.enabled = options.enabled || false;
    this.isInitialized = false;
    this.isInitializing = false;
    this.poseLandmarker = null;
    this.mirror = options.mirror !== undefined ? options.mirror : true;
    this.confidenceThreshold = options.confidenceThreshold || 0.5;
  }

  /**
   * Initializes MediaPipe PoseLandmarker using local offline assets with fallback
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
        console.warn('[BodyTracker] Local WASM fileset failed, falling back to CDN:', e);
        vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
      }

      let modelAssetPath = '/models/pose_landmarker_lite.task';
      try {
        const resp = await fetch(modelAssetPath, { method: 'HEAD' });
        if (!resp.ok) throw new Error('Local task model not accessible');
      } catch (e) {
        console.warn('[BodyTracker] Local model not found, using Google Storage:', e);
        modelAssetPath = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
      }

      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath,
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: this.confidenceThreshold,
        minPosePresenceConfidence: this.confidenceThreshold,
        minTrackingConfidence: this.confidenceThreshold
      });

      this.isInitialized = true;
      this.isInitializing = false;
      return true;
    } catch (error) {
      this.isInitializing = false;
      console.error('[BodyTracker] Failed to initialize PoseLandmarker:', error);
      return false;
    }
  }

  async enable() {
    this.enabled = true;
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  disable() {
    this.enabled = false;
  }

  toggle() {
    if (this.enabled) {
      this.disable();
    } else {
      this.enable();
    }
    return this.enabled;
  }

  /**
   * Detects body pose in video frame and produces Spatial Entity Candidates
   * @param {HTMLVideoElement} videoElement
   * @param {number} timestamp
   */
  detect(videoElement, timestamp = performance.now()) {
    if (!this.enabled || !this.isInitialized || !this.poseLandmarker || !videoElement) {
      return null;
    }

    const results = this.poseLandmarker.detectForVideo(videoElement, timestamp);
    if (!results || !results.landmarks || results.landmarks.length === 0) {
      return null;
    }

    const rawLandmarks = results.landmarks[0];
    if (!rawLandmarks || rawLandmarks.length < 33) return null;

    // Apply mirror reflection to X coordinates
    const processedLandmarks = rawLandmarks.map(lm => ({
      x: this.mirror ? (1.0 - lm.x) : lm.x,
      y: lm.y,
      z: lm.z || 0,
      visibility: lm.visibility !== undefined ? lm.visibility : 1.0
    }));

    // Extract core anatomical keypoints
    // Landmark index references:
    // 0: nose, 11: left shoulder, 12: right shoulder, 13: left elbow, 14: right elbow
    // 15: left wrist, 16: right wrist, 23: left hip, 24: right hip
    // 25: left knee, 26: right knee, 27: left ankle, 28: right ankle
    const nose = processedLandmarks[0];
    const leftShoulder = processedLandmarks[11];
    const rightShoulder = processedLandmarks[12];
    const leftElbow = processedLandmarks[13];
    const rightElbow = processedLandmarks[14];
    const leftWrist = processedLandmarks[15];
    const rightWrist = processedLandmarks[16];
    const leftHip = processedLandmarks[23];
    const rightHip = processedLandmarks[24];
    const leftKnee = processedLandmarks[25];
    const rightKnee = processedLandmarks[26];
    const leftAnkle = processedLandmarks[27];
    const rightAnkle = processedLandmarks[28];

    // Compute Torso Centroid as primary position
    const torsoX = (leftShoulder.x + rightShoulder.x + leftHip.x + rightHip.x) / 4;
    const torsoY = (leftShoulder.y + rightShoulder.y + leftHip.y + rightHip.y) / 4;
    const torsoZ = (leftShoulder.z + rightShoulder.z + leftHip.z + rightHip.z) / 4;

    const shoulderSpan = Math.hypot(rightShoulder.x - leftShoulder.x, rightShoulder.y - leftShoulder.y);
    const torsoHeight = Math.hypot(
      ((leftShoulder.x + rightShoulder.x)/2) - ((leftHip.x + rightHip.x)/2),
      ((leftShoulder.y + rightShoulder.y)/2) - ((leftHip.y + rightHip.y)/2)
    );

    const candidates = [{
      suggestedId: 'body-primary',
      type: 'body',
      subType: 'human_torso',
      coordSpace: 'normalized_relative',
      position: { x: torsoX, y: torsoY, z: torsoZ },
      scale: { x: shoulderSpan, y: torsoHeight, z: shoulderSpan, relativeDepth: torsoZ },
      landmarks: processedLandmarks,
      confidence: 0.9,
      customProps: {
        keypoints: {
          nose,
          leftShoulder,
          rightShoulder,
          leftElbow,
          rightElbow,
          leftWrist,
          rightWrist,
          leftHip,
          rightHip,
          leftKnee,
          rightKnee,
          leftAnkle,
          rightAnkle
        }
      }
    }];

    return {
      landmarks: processedLandmarks,
      candidates
    };
  }
}
