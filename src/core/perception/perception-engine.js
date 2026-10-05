/**
 * PerceptionEngine - Master Sensory Dispatcher
 * Coordinates Camera/Video ingestion, runs active perception trackers (Hands, Body, Objects),
 * collects spatial candidate observations, and feeds them into the SpatialWorldModel.
 */

import { HandTracker } from './hand-tracker.js';
import { BodyTracker } from './body-tracker.js';
import { ObjectTracker } from './object-tracker.js';
import { DepthEstimator } from './depth-estimator.js';
import { SpatialWorldModel } from '../spatial/world-model.js';

export class PerceptionEngine {
  constructor(options = {}) {
    this.videoElement = null;
    this.isRunning = false;
    this.lastVideoTime = -1;
    this.onFrameCallback = null;

    // Spatial World Model (Single Source of Truth)
    this.worldModel = options.worldModel || new SpatialWorldModel();

    // Sensory Trackers
    this.handTracker = new HandTracker({
      mirror: options.mirror !== undefined ? options.mirror : true,
      swapHands: options.swapHands || false
    });
    this.bodyTracker = new BodyTracker({ enabled: false });
    this.objectTracker = new ObjectTracker({ enabled: false });
    this.depthEstimator = new DepthEstimator({ enabled: false });

    // Performance & Stats
    this.stats = {
      fps: 0,
      frameTimeMs: 0,
      detectedHandsCount: 0,
      activeEntitiesCount: 0
    };

    this._fpsFrames = 0;
    this._fpsLastTime = performance.now();
  }

  get mirror() {
    return this.handTracker.mirror;
  }

  set mirror(val) {
    this.handTracker.mirror = val;
    this.bodyTracker.mirror = val;
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
      return false;
    } else {
      await this.bodyTracker.enable();
      return true;
    }
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
   * Initializes all required WASM models
   */
  async initialize() {
    await this.handTracker.initialize();
    if (this.bodyTracker.enabled) {
      await this.bodyTracker.initialize();
    }
    return true;
  }

  /**
   * Starts camera capture and begins processing loop
   */
  async startCamera(videoElement) {
    this.videoElement = videoElement;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera access API is not supported in this browser.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 60, min: 30 },
        facingMode: 'user'
      },
      audio: false
    });

    this.videoElement.srcObject = stream;
    await new Promise((resolve) => {
      this.videoElement.onloadedmetadata = () => {
        this.videoElement.play();
        resolve();
      };
    });

    this.isRunning = true;
    this._startProcessingLoop();
  }

  stop() {
    this.isRunning = false;
    if (this.videoElement && this.videoElement.srcObject) {
      const tracks = this.videoElement.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }
  }

  setOnFrame(callback) {
    this.onFrameCallback = callback;
  }

  _startProcessingLoop() {
    const process = () => {
      if (!this.isRunning) return;

      const now = performance.now();

      // FPS tracking
      this._fpsFrames++;
      if (now - this._fpsLastTime >= 1000) {
        this.stats.fps = Math.round((this._fpsFrames * 1000) / (now - this._fpsLastTime));
        this._fpsFrames = 0;
        this._fpsLastTime = now;
      }

      if (this.videoElement && this.videoElement.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.videoElement.currentTime;
        const startTime = performance.now();

        // 1. Run Active Perception Trackers
        const allCandidates = [];

        // A. Hand Tracking
        const handResult = this.handTracker.detect(this.videoElement, now);
        let handsData = [];
        if (handResult) {
          handsData = handResult.hands;
          this.stats.detectedHandsCount = handResult.count;
          allCandidates.push(...handResult.candidates);
        } else {
          this.stats.detectedHandsCount = 0;
        }

        // B. Body Tracking (if active)
        if (this.bodyTracker.enabled) {
          const bodyResult = this.bodyTracker.detect(this.videoElement, now);
          if (bodyResult && bodyResult.candidates) {
            allCandidates.push(...bodyResult.candidates);
          }
        }

        // C. Object / Prop Tracking (if active)
        if (this.objectTracker.enabled) {
          const objResult = this.objectTracker.detect(this.videoElement, now);
          if (objResult && objResult.candidates) {
            allCandidates.push(...objResult.candidates);
          }
        }

        // 2. Feed Observations to SpatialWorldModel (Single Source of Truth)
        this.worldModel.ingestObservations(allCandidates, now);
        this.stats.activeEntitiesCount = this.worldModel.getAllActiveEntities().length;

        this.stats.frameTimeMs = Math.round(performance.now() - startTime);

        // 3. Dispatch to Consumers (maintains backwards compatibility for onFrameCallback)
        if (this.onFrameCallback) {
          this.onFrameCallback({
            hands: handsData,
            worldModel: this.worldModel,
            timestamp: now,
            stats: this.stats,
            videoWidth: this.videoElement.videoWidth,
            videoHeight: this.videoElement.videoHeight
          });
        }
      }

      requestAnimationFrame(process);
    };

    requestAnimationFrame(process);
  }
}
