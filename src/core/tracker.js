/**
 * Tracker Compatibility Facade
 * 
 * Provides 100% backwards compatibility with the existing HandTracker interface
 * while delegating all sensory ingestion and world state management to the
 * PerceptionEngine and SpatialWorldModel.
 */

import { PerceptionEngine } from './perception/perception-engine.js';
import { HandTracker as CoreHandTracker } from './perception/hand-tracker.js';

export class HandTracker {
  constructor(options = {}) {
    this.engine = new PerceptionEngine(options);
  }

  get stats() {
    return this.engine.stats;
  }

  get mirror() {
    return this.engine.mirror;
  }

  set mirror(val) {
    this.engine.mirror = val;
  }

  get swapHands() {
    return this.engine.swapHands;
  }

  set swapHands(val) {
    this.engine.swapHands = val;
  }

  get worldModel() {
    return this.engine.worldModel;
  }

  get perceptionEngine() {
    return this.engine;
  }

  get bodyTracker() {
    return this.engine.bodyTracker;
  }

  get objectTracker() {
    return this.engine.objectTracker;
  }

  get faceTracker() {
    return this.engine.faceTracker;
  }

  get digitalTwinManager() {
    return this.engine.digitalTwinManager;
  }

  async toggleBodyTracking() {
    return this.engine.toggleBodyTracking();
  }

  async toggleFaceTracking() {
    return this.engine.toggleFaceTracking();
  }

  toggleDigitalTwin() {
    return this.engine.toggleDigitalTwin();
  }

  toggleObjectTracking(preset) {
    return this.engine.toggleObjectTracking(preset);
  }

  setObjectColorPreset(preset) {
    return this.engine.setObjectColorPreset(preset);
  }

  async initialize() {
    return this.engine.initialize();
  }

  async startCamera(videoElement) {
    return this.engine.startCamera(videoElement);
  }

  stop() {
    this.engine.stop();
  }

  setOnFrame(callback) {
    this.engine.setOnFrame(callback);
  }
}

export { CoreHandTracker };
