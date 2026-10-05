/**
 * ObjectTrackingEngine - Temporal Object State & Trajectory Filter
 * 
 * "Ese mismo objeto se movió de acá hasta acá y está rotado ~35°."
 * 
 * Responsibilities:
 * - Frame-to-frame association (IoU + centroid proximity).
 * - Trajectory smoothing & 3D velocity estimation.
 * - Relative monocular depth estimation via apparent bounding area.
 * - Persistent track lifecycle management (Spawn, Update, Age, Prune).
 */

export class ObjectTrack {
  constructor(id, initialDetection, initialSegmentation) {
    this.id = id;
    this.centroid = { ...initialDetection.centroid };
    this.boundingBox = { ...initialDetection.boundingBox };
    this.confidence = initialDetection.confidence;
    this.segmentation = initialSegmentation;

    // Kinematics & 3D Pose
    this.position = {
      x: this.centroid.x,
      y: this.centroid.y,
      z: this._estimateRelativeZ(this.boundingBox)
    };
    this.rotation = { yaw: 0, pitch: 0, roll: initialSegmentation?.orientationAngle || 0 };
    this.velocity = { vx: 0, vy: 0, vz: 0, speed: 0 };

    this.firstSeenTimestamp = performance.now();
    this.lastSeenTimestamp = performance.now();
    this.missingFrames = 0;
    this.lifetimeFrames = 1;

    // History for smoothing and multi-view reconstruction
    this.samples = [];
  }

  update(detection, segmentation, timestamp) {
    const dt = Math.max(0.001, (timestamp - this.lastSeenTimestamp) / 1000);
    this.lastSeenTimestamp = timestamp;
    this.lifetimeFrames++;
    this.missingFrames = 0;
    this.confidence = detection.confidence;
    this.segmentation = segmentation;

    const newX = detection.centroid.x;
    const newY = detection.centroid.y;
    const newZ = this._estimateRelativeZ(detection.boundingBox);

    // Compute velocity
    this.velocity = {
      vx: (newX - this.position.x) / dt,
      vy: (newY - this.position.y) / dt,
      vz: (newZ - this.position.z) / dt,
      speed: Math.hypot((newX - this.position.x) / dt, (newY - this.position.y) / dt)
    };

    // Low-pass smooth position
    const alpha = 0.45;
    this.position.x = this.position.x * (1 - alpha) + newX * alpha;
    this.position.y = this.position.y * (1 - alpha) + newY * alpha;
    this.position.z = this.position.z * (1 - alpha) + newZ * alpha;

    this.boundingBox = { ...detection.boundingBox };
    this.centroid = { x: this.position.x, y: this.position.y };

    // Record sample for multi-view accumulation
    this.samples.push({
      position: { ...this.position },
      rotation: { ...this.rotation },
      segmentation,
      timestamp
    });

    if (this.samples.length > 30) {
      this.samples.shift();
    }
  }

  markMissing() {
    this.missingFrames++;
  }

  _estimateRelativeZ(bbox) {
    // Monocular apparent size depth model: larger area = closer to camera
    const area = Math.max(0.001, (bbox.width || 0.1) * (bbox.height || 0.1));
    const refArea = 0.08;
    return Math.max(-1.5, Math.min(1.5, Math.log(refArea / area) * 0.45));
  }
}

export class ObjectTrackingEngine {
  constructor(options = {}) {
    this.maxMissingFrames = options.maxMissingFrames || 12;
    this.associationDistanceThreshold = options.associationDistanceThreshold || 0.18;
    this.tracks = new Map(); // trackId -> ObjectTrack
    this._nextTrackId = 1;
  }

  /**
   * Updates tracks with new frame detections and segmentations
   * @param {Array<Object>} detections
   * @param {ObjectSegmenter} segmenter
   * @param {HTMLVideoElement} videoElement
   * @param {number} timestamp
   * @returns {Array<ObjectTrack>} Active tracks
   */
  update(detections = [], segmenter, videoElement, timestamp = performance.now()) {
    const matchedTrackIds = new Set();

    for (const det of detections) {
      // Find nearest existing track
      let bestTrack = null;
      let minDist = Infinity;

      for (const track of this.tracks.values()) {
        const dist = Math.hypot(det.centroid.x - track.centroid.x, det.centroid.y - track.centroid.y);
        if (dist < minDist && dist < this.associationDistanceThreshold) {
          minDist = dist;
          bestTrack = track;
        }
      }

      const seg = segmenter.segment(videoElement, det);

      if (bestTrack) {
        bestTrack.update(det, seg, timestamp);
        matchedTrackIds.add(bestTrack.id);
      } else {
        // Spawn new Track
        const trackId = `track-obj-${this._nextTrackId++}`;
        const newTrack = new ObjectTrack(trackId, det, seg);
        this.tracks.set(trackId, newTrack);
        matchedTrackIds.add(trackId);
      }
    }

    // Prune stale tracks
    for (const [id, track] of this.tracks.entries()) {
      if (!matchedTrackIds.has(id)) {
        track.markMissing();
        if (track.missingFrames > this.maxMissingFrames) {
          this.tracks.delete(id);
        }
      }
    }

    return Array.from(this.tracks.values()).filter(t => t.missingFrames === 0);
  }
}
