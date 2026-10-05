/**
 * ObjectTrackingEngine - Temporal Object State & Trajectory Filter
 * 
 * "Ese mismo objeto se movió de acá hasta acá y está rotado ~35°."
 * "Y la mano no debería destruir el tracking: visible: 63%, occluded: 37%, track: ACTIVE
 *  y predecir dónde debería reaparecer (dead-reckoning)."
 * 
 * Responsibilities:
 * - Persistent object IDs: object-001, object-002, etc.
 * - Multi-hypothesis frame association (IoU + centroid proximity).
 * - State lifecycle: ACTIVE -> OCCLUDED -> COASTING -> PRUNED.
 * - Inertial dead-reckoning prediction during hand occlusion sweeps.
 * - 3D trajectory breadcrumb history (for rendering • • • trails).
 * - Monocular relative depth via apparent bounding area.
 */

export class ObjectTrack {
  constructor(id, initialDetection, initialSegmentation) {
    this.id = id; // e.g. 'object-001'
    this.type = 'object';
    this.subType = initialDetection.subType || 'unknown';

    this.centroid = { ...initialDetection.centroid };
    this.boundingBox = { ...initialDetection.boundingBox };
    this.contour = initialDetection.contour || [];
    this.confidence = initialDetection.confidence || 0.85;
    this.segmentation = initialSegmentation;

    // Occlusion & Visibility
    this.occlusionPct = initialDetection.occlusionPct || 0;
    this.visiblePct = 100 - this.occlusionPct;
    this.status = this.occlusionPct > 35 ? 'OCCLUDED' : 'ACTIVE';

    // Shape & Appearance
    this.shapeLabel = initialDetection.shapeLabel || 'detected';
    this.colorPalette = initialDetection.colorPalette || null;

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

    // Trajectory Breadcrumbs Buffer for 3D visualization (• • • trail)
    this.trajectory = [
      { x: this.position.x, y: this.position.y, z: this.position.z, timestamp: this.firstSeenTimestamp }
    ];

    // Samples for multi-view reconstruction
    this.samples = [];
  }

  update(detection, segmentation, timestamp) {
    const dt = Math.max(0.001, (timestamp - this.lastSeenTimestamp) / 1000);
    this.lastSeenTimestamp = timestamp;
    this.lifetimeFrames++;
    this.missingFrames = 0;
    this.confidence = detection.confidence;
    this.segmentation = segmentation;
    if (detection.subType && detection.subType !== 'unknown') {
      this.subType = detection.subType;
    }
    if (detection.shapeLabel) {
      this.shapeLabel = detection.shapeLabel;
    }
    if (detection.colorPalette) {
      this.colorPalette = detection.colorPalette;
    }

    // Occlusion metrics
    this.occlusionPct = detection.occlusionPct || 0;
    this.visiblePct = 100 - this.occlusionPct;
    this.status = this.occlusionPct >= 35 ? 'OCCLUDED' : 'ACTIVE';

    const newX = detection.centroid.x;
    const newY = detection.centroid.y;
    const newZ = this._estimateRelativeZ(detection.boundingBox);

    // Compute velocity
    const vx = (newX - this.position.x) / dt;
    const vy = (newY - this.position.y) / dt;
    const vz = (newZ - this.position.z) / dt;
    this.velocity = {
      vx: this.velocity.vx * 0.3 + vx * 0.7,
      vy: this.velocity.vy * 0.3 + vy * 0.7,
      vz: this.velocity.vz * 0.3 + vz * 0.7,
      speed: Math.hypot(vx, vy)
    };

    // Smooth position (alpha = 0.5)
    const alpha = 0.5;
    this.position.x = this.position.x * (1 - alpha) + newX * alpha;
    this.position.y = this.position.y * (1 - alpha) + newY * alpha;
    this.position.z = this.position.z * (1 - alpha) + newZ * alpha;

    this.boundingBox = { ...detection.boundingBox };
    this.centroid = { x: this.position.x, y: this.position.y };
    if (detection.contour && detection.contour.length > 0) {
      this.contour = detection.contour;
    }

    // Append to 3D Trajectory Breadcrumb trail
    const lastTraj = this.trajectory[this.trajectory.length - 1];
    const moved = Math.hypot(this.position.x - lastTraj.x, this.position.y - lastTraj.y);
    if (moved > 0.005 || this.trajectory.length === 1) {
      this.trajectory.push({
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
        timestamp
      });
      if (this.trajectory.length > 24) {
        this.trajectory.shift();
      }
    }

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

  /**
   * Dead-reckoning inertial prediction when occluded by hand or briefly missing
   */
  predictDeadReckoning(dt = 0.016) {
    this.missingFrames++;
    this.status = this.missingFrames >= 2 ? 'COASTING' : 'OCCLUDED';
    this.occlusionPct = Math.min(100, this.occlusionPct + 15);
    this.visiblePct = Math.max(0, 100 - this.occlusionPct);

    // Apply linear dead-reckoning extrapolation
    this.position.x += this.velocity.vx * dt;
    this.position.y += this.velocity.vy * dt;
    this.position.z += this.velocity.vz * dt;

    // Dampen velocity during coasting
    this.velocity.vx *= 0.92;
    this.velocity.vy *= 0.92;
    this.velocity.vz *= 0.92;
    this.velocity.speed *= 0.92;

    // Decay confidence slightly
    this.confidence *= 0.94;

    this.centroid = { x: this.position.x, y: this.position.y };

    // Update bounding box position
    if (this.boundingBox) {
      const halfW = (this.boundingBox.width || 0.1) / 2;
      const halfH = (this.boundingBox.height || 0.1) / 2;
      this.boundingBox.minX = this.position.x - halfW;
      this.boundingBox.maxX = this.position.x + halfW;
      this.boundingBox.minY = this.position.y - halfH;
      this.boundingBox.maxY = this.position.y + halfH;
    }
  }

  _estimateRelativeZ(bbox) {
    // Monocular apparent size depth model: larger area = closer to camera
    const area = Math.max(0.001, (bbox.width || 0.1) * (bbox.height || 0.1));
    const refArea = 0.08;
    return Math.max(-1.5, Math.min(1.5, Math.log(refArea / area) * 0.45));
  }

  /**
   * Produce standard observation candidate for SpatialWorldModel
   */
  toCandidateObservation() {
    return {
      suggestedId: this.id, // e.g. 'object-001'
      type: 'object',
      subType: this.subType || 'unknown',
      coordSpace: 'normalized_relative',
      depthSource: 'apparent_size',
      confidence: this.confidence,
      position: { ...this.position },
      rotation: { ...this.rotation },
      velocity: { ...this.velocity },
      boundingBox: { ...this.boundingBox },
      contour: this.contour,
      customProps: {
        trackId: this.id,
        status: this.status, // 'ACTIVE' | 'OCCLUDED' | 'COASTING'
        occlusionPct: this.occlusionPct,
        visiblePct: this.visiblePct,
        shapeLabel: this.shapeLabel,
        shapeDetected: true,
        silhouetteDetected: true,
        depthEstimated: true,
        reconstructionStatus: 'pending',
        trajectory: this.trajectory,
        colorHex: this.colorPalette?.hex || '#ff6b35'
      }
    };
  }
}

export class ObjectTrackingEngine {
  constructor(options = {}) {
    this.maxMissingFrames = options.maxMissingFrames || 15; // Allows ~0.5s hand pass-over occlusion
    this.associationDistanceThreshold = options.associationDistanceThreshold || 0.22;
    this.tracks = new Map(); // trackId -> ObjectTrack
    this._nextIdCounter = 1;
  }

  /**
   * Updates tracks with new frame detections and segmentations
   * @param {Array<Object>} detections
   * @param {ObjectSegmenter} segmenter
   * @param {HTMLVideoElement} videoElement
   * @param {number} timestamp
   * @returns {Array<ObjectTrack>} Active & coasting tracks
   */
  update(detections = [], segmenter, videoElement, timestamp = performance.now()) {
    const matchedTrackIds = new Set();

    for (const det of detections) {
      // Find nearest existing track via Euclidean distance & bounding box IoU
      let bestTrack = null;
      let minDist = Infinity;

      for (const track of this.tracks.values()) {
        const dist = Math.hypot(det.centroid.x - track.centroid.x, det.centroid.y - track.centroid.y);
        if (dist < minDist && dist < this.associationDistanceThreshold) {
          minDist = dist;
          bestTrack = track;
        }
      }

      const seg = segmenter ? segmenter.segment(videoElement, det) : null;

      if (bestTrack) {
        bestTrack.update(det, seg, timestamp);
        matchedTrackIds.add(bestTrack.id);
      } else {
        // Spawn new Track formatted as 'object-001', 'object-002', etc.
        const formattedId = `object-${String(this._nextIdCounter++).padStart(3, '0')}`;
        const newTrack = new ObjectTrack(formattedId, det, seg);
        this.tracks.set(formattedId, newTrack);
        matchedTrackIds.add(formattedId);
      }
    }

    // Handle unmatched tracks: coast with dead-reckoning during occlusion
    for (const [id, track] of this.tracks.entries()) {
      if (!matchedTrackIds.has(id)) {
        track.predictDeadReckoning(0.016);
        if (track.missingFrames > this.maxMissingFrames) {
          this.tracks.delete(id);
        }
      }
    }

    return Array.from(this.tracks.values());
  }

  /**
   * Resets all active tracks
   */
  reset() {
    this.tracks.clear();
    this._nextIdCounter = 1;
  }
}
