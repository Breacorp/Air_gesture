/**
 * PerceptionEngine - Master Multimodal Sensory Dispatcher
 * 
 * Coordinates Camera/Video ingestion, runs active perception trackers:
 * - Hands (HandLandmarker)
 * - Body (PoseLandmarker)
 * - Face (FaceLandmarker, Head pose, Gaze, Expressions)
 * - Objects & Digital Twin (ObjectDetector, Segmenter, TrackingEngine, MultiViewReconstructor)
 * 
 * Ingests all candidate observations into the SpatialWorldModel.
 */

import { HandTracker } from './hand-tracker.js';
import { BodyTracker } from './body-tracker.js';
import { FaceTracker } from './face-tracker.js';
import { ObjectTracker } from './object-tracker.js';
import { DigitalTwinManager } from './objects/digital-twin-manager.js';
import { DepthEstimator } from './depth-estimator.js';
import { GenericObjectTracker } from './generic-object-tracker.js';
import { CameraManager } from './camera-manager.js';
import { SurfaceDetector } from './surface-detector.js';
import { SpatialWorldModel } from '../spatial/world-model.js';

export class PerceptionEngine {
  constructor(options = {}) {
    this.videoElement = null;
    this._loopRunning = false;
    this.state = 'OFF'; // 'OFF' | 'STARTING_CAMERA' | 'CAMERA_READY' | 'RUNNING'
    this.lastVideoTime = -1;
    this.onFrameCallback = null;
    this._lastTelemetryLogTime = 0;

    // Spatial World Model (Single Source of Truth)
    this.worldModel = options.worldModel || new SpatialWorldModel();

    // Multimodal Sensory Trackers - Active by default
    this.handTracker = new HandTracker({
      mirror: options.mirror !== undefined ? options.mirror : true,
      swapHands: options.swapHands || false
    });
    this.bodyTracker = new BodyTracker({ enabled: true });
    this.faceTracker = new FaceTracker({ enabled: true });
    this.genericObjectTracker = new GenericObjectTracker({ enabled: true });
    this.digitalTwinManager = new DigitalTwinManager({ enabled: false });
    this.objectTracker = new ObjectTracker({ enabled: false });
    this.depthEstimator = new DepthEstimator({ enabled: false });

    // Multi-Camera Abstraction Layer & Tabletop Surface Perception
    this.cameraManager = new CameraManager();
    this.surfaceDetector = new SurfaceDetector({ enabled: true });

    // Real-Time Perception Diagnostics
    this.diagnostics = {
      camera: { width: 0, height: 0, fps: 0 },
      hands: {
        left: { detected: false, landmarksCount: 0, confidence: 0, position: { x: 0, y: 0 } },
        right: { detected: false, landmarksCount: 0, confidence: 0, position: { x: 0, y: 0 } }
      },
      face: { detected: false, landmarksCount: 0, pitch: 0, yaw: 0 },
      body: { detected: false, landmarksCount: 0 },
      object: { detected: false, id: 'object-001', confidence: 0, status: 'NONE' },
      worldModel: { entitiesCount: 0, activeIds: [] }
    };

    // Performance & Stats
    this.stats = {
      fps: 0,
      frameTimeMs: 0,
      detectedHandsCount: 0,
      detectedFacesCount: 0,
      detectedBodiesCount: 0,
      detectedObjectsCount: 0,
      activeEntitiesCount: 0,
      isFaceTrackingActive: true,
      isBodyTrackingActive: true,
      isObjectTrackingActive: true
    };

    this._fpsFrames = 0;
    this._fpsLastTime = performance.now();
  }

  get isRunning() {
    const hasActiveStream = Boolean(
      this.videoElement &&
      this.videoElement.srcObject &&
      (this.videoElement.srcObject.active !== false) &&
      (typeof this.videoElement.srcObject.getVideoTracks === 'function' ?
        this.videoElement.srcObject.getVideoTracks().some(t => t.readyState === 'live') : true)
    );
    const isVideoReady = Boolean(
      this.videoElement &&
      this.videoElement.readyState >= 2 &&
      this.videoElement.videoWidth > 0 &&
      this.videoElement.videoHeight > 0
    );
    return Boolean(this._loopRunning && (hasActiveStream || !this.videoElement.srcObject) && isVideoReady);
  }

  set isRunning(val) {
    this._loopRunning = Boolean(val);
  }

  get mirror() {
    return this.handTracker.mirror;
  }

  set mirror(val) {
    this.handTracker.mirror = val;
    this.bodyTracker.mirror = val;
    this.faceTracker.mirror = val;
    this.objectTracker.mirror = val;
  }

  get swapHands() {
    return this.handTracker.swapHands;
  }

  set swapHands(val) {
    this.handTracker.swapHands = val;
  }

  async toggleBodyTracking() {
    if (this.bodyTracker.enabled) {
      this.bodyTracker.disable();
      this.stats.isBodyTrackingActive = false;
      return false;
    } else {
      await this.bodyTracker.enable();
      this.stats.isBodyTrackingActive = true;
      return true;
    }
  }

  async toggleFaceTracking() {
    if (this.faceTracker.enabled) {
      this.faceTracker.disable();
      this.stats.isFaceTrackingActive = false;
      return false;
    } else {
      await this.faceTracker.enable();
      this.stats.isFaceTrackingActive = true;
      return true;
    }
  }

  toggleDigitalTwin() {
    const active = this.digitalTwinManager.toggle();
    this.stats.isDigitalTwinActive = active;
    return active;
  }

  toggleObjectTracking(preset) {
    if (preset) {
      this.objectTracker.setColorPreset(preset);
    }
    return this.objectTracker.toggle();
  }

  setObjectColorPreset(preset) {
    return this.objectTracker.setColorPreset(preset);
  }

  /**
   * Initializes active perception models (Hands, Face, Body, Objects)
   */
  async initialize() {
    console.log('[PerceptionEngine] Initializing perception models...');
    try {
      await this.handTracker.initialize();
    } catch (e) {
      console.warn('[PerceptionEngine] HandTracker init:', e);
    }
    try {
      await this.bodyTracker.initialize();
    } catch (e) {
      console.warn('[PerceptionEngine] BodyTracker init:', e);
    }
    try {
      await this.faceTracker.initialize();
    } catch (e) {
      console.warn('[PerceptionEngine] FaceTracker init:', e);
    }
    this.stats.isFaceTrackingActive = this.faceTracker.isInitialized;
    this.stats.isBodyTrackingActive = this.bodyTracker.isInitialized;
    return true;
  }

  /**
   * Waits until the video element is genuinely ready with positive dimensions
   */
  async _waitForVideoReady(videoElement, timeoutMs = 8000) {
    if (!videoElement) return false;

    const isReady = () => (
      videoElement.readyState >= 2 &&
      videoElement.videoWidth > 0 &&
      videoElement.videoHeight > 0
    );

    if (isReady()) return true;

    return new Promise((resolve) => {
      const startTime = performance.now();

      const check = () => {
        if (isReady()) {
          resolve(true);
          return;
        }
        if (performance.now() - startTime > timeoutMs) {
          console.warn('[PerceptionEngine] Timeout waiting for video dimensions');
          resolve(false);
          return;
        }
        requestAnimationFrame(check);
      };

      videoElement.addEventListener('loadedmetadata', () => check(), { once: true });
      videoElement.addEventListener('loadeddata', () => check(), { once: true });
      videoElement.addEventListener('canplay', () => check(), { once: true });
      check();
    });
  }

  /**
   * Starts primary front camera capture using CameraManager
   * @param {HTMLVideoElement} videoElement
   * @param {string} [deviceId]
   */
  async startCamera(videoElement, deviceId = null) {
    this.videoElement = videoElement;
    this.state = 'STARTING_CAMERA';

    const source = await this.cameraManager.startCamera({
      role: 'front',
      videoElement,
      deviceId
    });

    // Wait until camera video is playing and has positive dimensions
    await this._waitForVideoReady(videoElement);
    this.state = 'CAMERA_READY';

    this._loopRunning = true;
    this.state = 'RUNNING';
    this._startProcessingLoop();
    return source;
  }

  /**
   * Starts secondary desk view camera (Continuity Camera / overhead view)
   * @param {HTMLVideoElement} videoElement
   * @param {string} [deviceId]
   */
  async startDeskViewCamera(videoElement, deviceId = null) {
    return this.cameraManager.startCamera({
      role: 'desk',
      videoElement,
      deviceId
    });
  }

  /**
   * Discovers system cameras with desk view identification
   */
  async enumerateVideoDevices() {
    return this.cameraManager.enumerateDevices();
  }

  /**
   * Toggles tabletop surface detection on/off
   */
  toggleSurfaceDetection() {
    this.surfaceDetector.enabled = !this.surfaceDetector.enabled;
    return this.surfaceDetector.enabled;
  }

  stop() {
    this._loopRunning = false;
    this.state = 'OFF';
    this.cameraManager.stopAll();
    if (this.videoElement && this.videoElement.srcObject) {
      const tracks = typeof this.videoElement.srcObject.getTracks === 'function'
        ? this.videoElement.srcObject.getTracks()
        : [];
      tracks.forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }
  }

  setOnFrame(callback) {
    this.onFrameCallback = callback;
  }

  _startProcessingLoop() {
    const process = () => {
      if (!this._loopRunning) return;

      const now = performance.now();

      // Guard: do not run trackers without genuine video dimensions
      const isVideoReady = Boolean(
        this.videoElement &&
        this.videoElement.readyState >= 2 &&
        this.videoElement.videoWidth > 0 &&
        this.videoElement.videoHeight > 0
      );

      if (!isVideoReady) {
        requestAnimationFrame(process);
        return;
      }

      // FPS tracking
      this._fpsFrames++;
      if (now - this._fpsLastTime >= 1000) {
        this.stats.fps = Math.round((this._fpsFrames * 1000) / (now - this._fpsLastTime));
        this._fpsFrames = 0;
        this._fpsLastTime = now;
      }

      if (this.videoElement.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.videoElement.currentTime;
        const startTime = performance.now();

        // 1. Run Active Multimodal Perception Trackers (with isolated error boundaries)
        const allCandidates = [];

        // A. Hand Tracking (Core)
        let handsData = [];
        let rawHandLandmarks = [];
        try {
          const handResult = this.handTracker.detect(this.videoElement, now);
          if (handResult) {
            handsData = handResult.hands || [];
            rawHandLandmarks = handsData.map(h => h.landmarks);
            this.stats.detectedHandsCount = handResult.count || handsData.length;
            if (handResult.candidates) {
              allCandidates.push(...handResult.candidates);
            }
          } else {
            this.stats.detectedHandsCount = 0;
          }
        } catch (err) {
          console.warn('[PerceptionEngine] HandTracker error:', err);
          this.stats.detectedHandsCount = 0;
        }

        // Diagnostics: Hands
        this.diagnostics.hands.left.detected = false;
        this.diagnostics.hands.right.detected = false;
        for (const h of handsData) {
          const side = (h.handedness || 'Right').toLowerCase();
          const target = side === 'left' ? this.diagnostics.hands.left : this.diagnostics.hands.right;
          target.detected = true;
          target.landmarksCount = h.landmarks ? h.landmarks.length : 21;
          target.confidence = h.confidence || 0.9;
          target.position = h.landmarks ? { x: Number(h.landmarks[0].x.toFixed(2)), y: Number(h.landmarks[0].y.toFixed(2)) } : { x: 0.5, y: 0.5 };
        }

        // B. Body Tracking (Full-Body Pose)
        let bodyResult = null;
        if (this.bodyTracker.enabled && this.bodyTracker.isInitialized) {
          try {
            bodyResult = this.bodyTracker.detect(this.videoElement, now);
            if (bodyResult && bodyResult.candidates) {
              allCandidates.push(...bodyResult.candidates);
              this.stats.detectedBodiesCount = 1;
              this.diagnostics.body.detected = true;
              this.diagnostics.body.landmarksCount = bodyResult.landmarks ? bodyResult.landmarks.length : 33;
            } else {
              this.stats.detectedBodiesCount = 0;
              this.diagnostics.body.detected = false;
            }
          } catch (err) {
            console.warn('[PerceptionEngine] BodyTracker error:', err);
            this.stats.detectedBodiesCount = 0;
            this.diagnostics.body.detected = false;
          }
        }

        // C. Face Tracking (Head Pose, Gaze, Expressions)
        let faceResult = null;
        if (this.faceTracker.enabled && this.faceTracker.isInitialized) {
          try {
            faceResult = this.faceTracker.detect(this.videoElement, now);
            if (faceResult && faceResult.candidates) {
              allCandidates.push(...faceResult.candidates);
              this.stats.detectedFacesCount = 1;
              this.diagnostics.face.detected = true;
              this.diagnostics.face.landmarksCount = faceResult.landmarks ? faceResult.landmarks.length : 468;
              this.diagnostics.face.pitch = faceResult.headPose ? Math.round(faceResult.headPose.pitch) : 0;
              this.diagnostics.face.yaw = faceResult.headPose ? Math.round(faceResult.headPose.yaw) : 0;
            } else {
              this.stats.detectedFacesCount = 0;
              this.diagnostics.face.detected = false;
            }
          } catch (err) {
            console.warn('[PerceptionEngine] FaceTracker error:', err);
            this.stats.detectedFacesCount = 0;
            this.diagnostics.face.detected = false;
          }
        }

        // D. Digital Twin & Multi-View Object Reconstruction (Real -> Virtual)
        if (this.digitalTwinManager.enabled) {
          try {
            const dtResult = this.digitalTwinManager.processFrame(this.videoElement, rawHandLandmarks, now);
            if (dtResult && dtResult.candidates) {
              allCandidates.push(...dtResult.candidates);
            }
          } catch (err) {
            console.warn('[PerceptionEngine] DigitalTwin error:', err);
          }
        }

        // E. Generic Object Tracker (Robust & Color-Agnostic)
        if (this.genericObjectTracker.enabled) {
          try {
            const genericResult = this.genericObjectTracker.detect(this.videoElement, now, handsData);
            if (genericResult && genericResult.candidates && genericResult.count > 0) {
              allCandidates.push(...genericResult.candidates);
              this.stats.detectedObjectsCount = genericResult.count;
              const t = genericResult.tracks[0];
              this.diagnostics.object.detected = true;
              this.diagnostics.object.id = t.id;
              this.diagnostics.object.confidence = Number(t.confidence.toFixed(2));
              this.diagnostics.object.status = t.status;
            } else {
              this.stats.detectedObjectsCount = 0;
              this.diagnostics.object.detected = false;
              this.diagnostics.object.status = 'NOT DETECTED';
            }
          } catch (err) {
            console.warn('[PerceptionEngine] GenericObjectTracker error:', err);
            this.stats.detectedObjectsCount = 0;
            this.diagnostics.object.detected = false;
          }
        }

        // F. Surface & Desk Perception Engine (Desk View & Tabletop Surface Support)
        if (this.surfaceDetector.enabled) {
          try {
            const activeObjects = this.worldModel.getEntitiesByType('object');
            const activeHands = this.worldModel.getEntitiesByType('hand');
            const surfaceCandidate = this.surfaceDetector.update(activeObjects, activeHands, now);
            if (surfaceCandidate) {
              allCandidates.push(surfaceCandidate);
            }
          } catch (err) {
            console.warn('[PerceptionEngine] SurfaceDetector error:', err);
          }
        }

        // 2. Feed All Observations to SpatialWorldModel (Single Source of Truth)
        try {
          this.worldModel.ingestObservations(allCandidates, now);
          const activeEntities = this.worldModel.getAllActiveEntities();
          this.stats.activeEntitiesCount = activeEntities.length;
          this.diagnostics.worldModel.entitiesCount = activeEntities.length;
          this.diagnostics.worldModel.activeIds = activeEntities.map(e => e.id);
        } catch (err) {
          console.warn('[PerceptionEngine] WorldModel ingestion error:', err);
        }

        this.diagnostics.camera.width = this.videoElement.videoWidth;
        this.diagnostics.camera.height = this.videoElement.videoHeight;
        this.diagnostics.camera.fps = this.stats.fps;

        this.stats.frameTimeMs = Math.round(performance.now() - startTime);

        // 3. Periodic Telemetry Logging (every ~500ms)
        if (!this._lastTelemetryLogTime || now - this._lastTelemetryLogTime >= 500) {
          this._lastTelemetryLogTime = now;
          console.log(
            `[PerceptionEngine] CAMERA: ${this.videoElement.videoWidth}x${this.videoElement.videoHeight} (${this.stats.fps}fps) | ` +
            `FRAME: ${Math.round(now)} | ` +
            `HANDS: ${handsData.length} | ` +
            `FACE: ${this.stats.detectedFacesCount} | ` +
            `BODY: ${this.stats.detectedBodiesCount} | ` +
            `OBJECT: ${this.stats.detectedObjectsCount}`
          );
        }

        // 4. Dispatch to Consumers (Protected against callback exceptions)
        if (this.onFrameCallback) {
          try {
            this.onFrameCallback({
              hands: handsData,
              body: bodyResult,
              face: faceResult,
              worldModel: this.worldModel,
              timestamp: now,
              stats: this.stats,
              diagnostics: this.diagnostics,
              videoWidth: this.videoElement.videoWidth,
              videoHeight: this.videoElement.videoHeight
            });
          } catch (err) {
            console.error('[PerceptionEngine] onFrameCallback error:', err);
          }
        }
      }

      requestAnimationFrame(process);
    };

    requestAnimationFrame(process);
  }
}
