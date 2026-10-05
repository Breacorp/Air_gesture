/**
 * ObjectTracker - Multi-Signal Object Perception & Temporal Tracking Engine
 * 
 * "No quiero que ObjectTracker sea 'detector de colores'. El color puede ser una señal auxiliar.
 *  Deberíamos pasar a:
 *  Appearance (color/texture) + Geometry (shape/edges) + Motion (tracking)
 *  => OBJECT TRACK => WORLD MODEL"
 * 
 * Tracks tools and props (screwdriver, cup, phone, balls) across arbitrary colors
 * (orange, black, metallic, red, blue, etc.), maintaining persistent object-001 identity
 * and inertial dead-reckoning during hand occlusion.
 */

import { ObjectDetector } from './objects/object-detector.js';
import { ObjectTrackingEngine } from './objects/object-tracking-engine.js';
import { ObjectSegmenter } from './objects/object-segmenter.js';

export class ObjectTracker {
  constructor(options = {}) {
    this.enabled = options.enabled || false;
    this.mirror = options.mirror !== undefined ? options.mirror : true;
    this.activePreset = options.preset || 'auto'; // 'auto', 'orange', 'black', 'metallic', 'blue', 'green', 'red'

    this.detector = new ObjectDetector({ colorHint: this.activePreset });
    this.segmenter = new ObjectSegmenter();
    this.trackingEngine = new ObjectTrackingEngine();
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
    this.trackingEngine.reset();
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.trackingEngine.reset();
    }
    return this.enabled;
  }

  setColorPreset(presetName) {
    this.activePreset = presetName || 'auto';
    this.detector.setColorHint(this.activePreset);
    return true;
  }

  /**
   * Runs multi-signal object perception on current frame
   * @param {HTMLVideoElement} videoElement
   * @param {number} timestamp
   * @param {Array<Array<Object>>} handLandmarks
   * @returns {Object|null} { count, tracks, candidates }
   */
  detect(videoElement, timestamp = performance.now(), handLandmarks = []) {
    if (!this.enabled || !videoElement || videoElement.readyState < 2) {
      return null;
    }

    // 1. Detect candidate objects in frame (Appearance + Geometry + Motion + Hand Grasp)
    const detections = this.detector.detect(videoElement, handLandmarks, timestamp);

    // 2. Temporal tracking & Occlusion dead-reckoning
    const tracks = this.trackingEngine.update(detections, this.segmenter, videoElement, timestamp);

    // 3. Format candidate observations for SpatialWorldModel
    const candidates = tracks.map(track => track.toCandidateObservation());

    return {
      count: tracks.length,
      tracks,
      candidates
    };
  }

  /**
   * Returns active tracks currently maintained by the tracking engine
   */
  getActiveTracks() {
    return Array.from(this.trackingEngine.tracks.values());
  }
}
