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
    this._loopGeneration = 0;
    this._processingFrameId = null;
    this._initializationPromise = null;
    this._isInitialized = false;
    this._cameraStartPromise = null;
    this._startingVideoElement = null;
    this._cancelVideoReadyWait = null;
    this.state = 'OFF'; // 'OFF' | 'STARTING_CAMERA' | 'CAMERA_READY' | 'RUNNING'
    this.lastVideoTime = -1;
    this.onFrameCallback = null;
    this._lastTelemetryLogTime = 0;

    // Spatial World Model (Single Source of Truth)
    this.worldModel = options.worldModel || new SpatialWorldModel();

    // Hand tracking is core; body and face inference are opt-in.
    this.handTracker = new HandTracker({
      mirror: options.mirror !== undefined ? options.mirror : true,
      swapHands: options.swapHands || false
    });
    this.bodyTracker = new BodyTracker({ enabled: false });
    this.faceTracker = new FaceTracker({ enabled: false });
    this.genericObjectTracker = new GenericObjectTracker({ enabled: false });
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
      isFaceTrackingActive: false,
      isBodyTrackingActive: false,
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
    this.genericObjectTracker.mirror = val;
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
      this.stats.isBodyTrackingActive = this.bodyTracker.enabled;
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
      this.stats.isFaceTrackingActive = this.faceTracker.enabled;
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
    const isEnabled = this.objectTracker.toggle();
    this.genericObjectTracker.enabled = isEnabled;
    if (!isEnabled) {
      this.genericObjectTracker.disable();
      this.worldModel.removeEntity('object-001');
      const objs = this.worldModel.getEntitiesByType('object');
      for (const o of objs) {
        this.worldModel.removeEntity(o.id);
      }
      this.stats.detectedObjectsCount = 0;
      this.diagnostics.object.detected = false;
      this.diagnostics.object.status = 'DISABLED';
    }
    return isEnabled;
  }

  setObjectColorPreset(preset) {
    return this.objectTracker.setColorPreset(preset);
  }

  /**
   * Initializes the hand model required for core interaction.
   * Body and face models are loaded only when the user enables those trackers.
   */
  async initialize() {
    if (this._isInitialized) return true;
    if (this._initializationPromise) return this._initializationPromise;

    console.log('[PerceptionEngine] Initializing perception models...');
    this._initializationPromise = (async () => {
      try {
        await this.handTracker.initialize();
        this._isInitialized = true;
        this.stats.isFaceTrackingActive = false;
        this.stats.isBodyTrackingActive = false;
        return true;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`No se pudo cargar el modelo local de manos. Comprobá la conexión o prepará los recursos offline y volvé a intentar. ${reason}`);
      } finally {
        this._initializationPromise = null;
      }
    })();
    return this._initializationPromise;
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
      let settled = false;
      const events = ['loadedmetadata', 'loadeddata', 'canplay'];
      const cleanup = () => {
        clearTimeout(timeoutId);
        clearInterval(pollId);
        events.forEach((event) => videoElement.removeEventListener(event, check));
        if (this._cancelVideoReadyWait === cancel) this._cancelVideoReadyWait = null;
      };
      const finish = (ready) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(ready);
      };
      const check = () => {
        if (isReady()) finish(true);
      };
      const cancel = () => finish(false);
      const timeoutId = setTimeout(() => {
        console.warn('[PerceptionEngine] Timeout waiting for video dimensions');
        finish(false);
      }, timeoutMs);
      const pollId = setInterval(check, 50);

      this._cancelVideoReadyWait = cancel;
      events.forEach((event) => videoElement.addEventListener(event, check));
      check();
    });
  }

  /**
   * Starts primary front camera capture using CameraManager
   * @param {HTMLVideoElement} videoElement
   * @param {string} [deviceId]
   */
  async startCamera(videoElement, deviceId = null) {
    if (this._cameraStartPromise) {
      if (this._startingVideoElement === videoElement) return this._cameraStartPromise;
      throw new Error('Ya hay un inicio de cámara en curso.');
    }
    if (this._loopRunning && this.videoElement === videoElement && this.isRunning) {
      return this.cameraManager.sources.get('cam-front');
    }
    if (this._loopRunning || this.state !== 'OFF') this.stop();

    const generation = ++this._loopGeneration;
    this.videoElement = videoElement;
    this.state = 'STARTING_CAMERA';
    this._startingVideoElement = videoElement;

    const startPromise = (async () => {
      let source = null;
      try {
        source = await this.cameraManager.startCamera({
          role: 'front',
          videoElement,
          deviceId
        });
        if (generation !== this._loopGeneration) {
          this.cameraManager.stopCamera(source.id);
          throw new Error('El inicio de la cámara fue cancelado.');
        }

        const videoReady = await this._waitForVideoReady(videoElement);
        if (generation !== this._loopGeneration) {
          this.cameraManager.stopCamera(source.id);
          throw new Error('El inicio de la cámara fue cancelado.');
        }
        if (!videoReady) {
          this.cameraManager.stopCamera(source.id);
          throw new Error('La cámara se autorizó, pero el video no entregó imágenes. Cerrá otras apps que la usen y volvé a intentar.');
        }

        this.state = 'CAMERA_READY';
        this.lastVideoTime = -1;
        this._loopRunning = true;
        this.state = 'RUNNING';
        this._startProcessingLoop();
        return source;
      } catch (error) {
        if (generation === this._loopGeneration) {
          if (source) this.cameraManager.stopCamera(source.id);
          this.state = 'OFF';
          this._loopRunning = false;
        }
        throw error;
      } finally {
        if (this._cameraStartPromise === startPromise) {
          this._cameraStartPromise = null;
          this._startingVideoElement = null;
        }
      }
    })();
    this._cameraStartPromise = startPromise;
    return startPromise;
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
    this._loopGeneration++;
    this._loopRunning = false;
    this.state = 'OFF';
    if (this._processingFrameId !== null) {
      cancelAnimationFrame(this._processingFrameId);
      this._processingFrameId = null;
    }
    this._cancelVideoReadyWait?.();
    this.cameraManager.stopAll();
    if (this.videoElement && this.videoElement.srcObject) {
      const tracks = typeof this.videoElement.srcObject.getTracks === 'function'
        ? this.videoElement.srcObject.getTracks()
        : [];
      tracks.forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }
    this.lastVideoTime = -1;
    for (const side of ['left', 'right']) {
      this.diagnostics.hands[side].detected = false;
      this.diagnostics.hands[side].landmarksCount = 0;
      this.diagnostics.hands[side].confidence = 0;
    }
    this.stats.detectedHandsCount = 0;
    try {
      this.onFrameCallback?.({
        hands: [],
        body: null,
        face: null,
        worldModel: this.worldModel,
        timestamp: performance.now(),
        stats: this.stats,
        diagnostics: this.diagnostics,
        videoWidth: 0,
        videoHeight: 0
      });
    } catch (error) {
      console.error('[PerceptionEngine] Stop callback error:', error);
    }
  }

  setOnFrame(callback) {
    this.onFrameCallback = callback;
  }

  _startProcessingLoop() {
    if (!this._loopRunning || this._processingFrameId !== null) return;
    const generation = this._loopGeneration;
    let frameId = null;
    const schedule = () => {
      if (!this._loopRunning || generation !== this._loopGeneration || this._processingFrameId !== null) return;
      frameId = requestAnimationFrame(() => {
        if (this._processingFrameId === frameId) this._processingFrameId = null;
        process();
      });
      this._processingFrameId = frameId;
    };

    const process = () => {
      if (!this._loopRunning || generation !== this._loopGeneration) return;

      const now = performance.now();

      // Guard: do not run trackers without genuine video dimensions
      const isVideoReady = Boolean(
        this.videoElement &&
        this.videoElement.readyState >= 2 &&
        this.videoElement.videoWidth > 0 &&
        this.videoElement.videoHeight > 0
      );

      if (!isVideoReady) {
        schedule();
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
        } else {
          this.stats.detectedBodiesCount = 0;
          this.diagnostics.body.detected = false;
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
        } else {
          this.stats.detectedFacesCount = 0;
          this.diagnostics.face.detected = false;
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

      schedule();
    };

    schedule();
  }
}
