/**
 * DigitalTwinManager - Master Coordinator for Real-to-Virtual Object Perception
 * 
 * "OBJETO REAL -> tracking -> DIGITAL TWIN -> geometría, textura y física"
 * 
 * Coordinates:
 * 1. ObjectDetector (Salience & Hand-held object detection)
 * 2. ObjectSegmenter (Silhouette & Texture extraction)
 * 3. ObjectTrackingEngine (Temporal trajectory & 3D pose tracking)
 * 4. MultiViewReconstructor (Multi-angle 3D geometry & material accumulation)
 * 
 * Produces linked physical and virtual entities in SpatialWorldModel:
 *   obj-real-001  <──(digitalTwinId)──>  twin-virtual-001
 */

import { ObjectDetector } from './object-detector.js';
import { ObjectSegmenter } from './object-segmenter.js';
import { ObjectTrackingEngine } from './object-tracking-engine.js';
import { MultiViewReconstructor } from './multi-view-reconstructor.js';
import { TargetCapabilities } from '../../interaction/capabilities.js';

export class DigitalTwinManager {
  constructor(options = {}) {
    this.enabled = options.enabled || false;

    this.detector = new ObjectDetector();
    this.segmenter = new ObjectSegmenter();
    this.tracker = new ObjectTrackingEngine();
    this.reconstructor = new MultiViewReconstructor();
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /**
   * Process a camera frame and hand landmarks, updating tracks and digital twins
   * @param {HTMLVideoElement} videoElement
   * @param {Array<Object>} handLandmarks
   * @param {number} timestamp
   * @returns {Object} { candidates, tracks, twins }
   */
  processFrame(videoElement, handLandmarks = [], timestamp = performance.now()) {
    if (!this.enabled || !videoElement || videoElement.readyState < 2) {
      return { candidates: [], tracks: [], twins: [] };
    }

    // 1. Detect candidate objects in frame (especially items held by hands)
    const detections = this.detector.detect(videoElement, handLandmarks, timestamp);

    // 2. Track & segment candidates across frames
    const activeTracks = this.tracker.update(detections, this.segmenter, videoElement, timestamp);

    const candidates = [];
    const twins = [];

    // 3. For each active physical track, update/reconstruct its Digital Twin
    for (const track of activeTracks) {
      const twin = this.reconstructor.process(track);
      twins.push(twin);

      const twinId = `twin-virtual-${track.id}`;
      const realId = `obj-real-${track.id}`;

      // A. Real Physical Entity candidate
      candidates.push({
        suggestedId: realId,
        type: 'object',
        subType: 'physical_prop',
        coordSpace: 'normalized_relative',
        confidence: track.confidence,
        capabilities: TargetCapabilities.forPhysicalProp(),
        position: { ...track.position },
        rotation: { ...track.rotation },
        boundingBox: { ...track.boundingBox },
        customProps: {
          digitalTwinId: twinId,
          viewsCaptured: twin.viewsCount,
          dimensions3D: twin.dimensions3D,
          colorPalette: track.segmentation?.palette
        }
      });

      // B. Virtual Digital Twin Entity candidate
      candidates.push({
        suggestedId: twinId,
        type: 'virtual',
        subType: 'digital_twin',
        coordSpace: 'normalized_relative',
        confidence: twin.confidence,
        capabilities: TargetCapabilities.for3DVirtualModel(),
        position: { ...track.position },
        rotation: { ...track.rotation },
        boundingBox: { ...track.boundingBox },
        customProps: {
          physicalSourceId: realId,
          isDigitalTwin: true,
          viewsCount: twin.viewsCount,
          dimensions3D: twin.dimensions3D,
          digitalTwinModel: twin
        }
      });
    }

    return {
      candidates,
      tracks: activeTracks,
      twins
    };
  }
}
