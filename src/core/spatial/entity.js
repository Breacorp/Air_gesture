/**
 * TrackedEntity - Universal Spatial Entity
 * Represents any tracked physical or virtual entity (hand, body, object, prop)
 * within the Spatial World Model.
 * 
 * Coordinates:
 * - Position defaults to normalized/relative 3D coordinates [0..1] / [-1..1]
 * - Metric position is optional and populated when spatial/WebXR calibration is present.
 */

export class TrackedEntity {
  /**
   * @param {Object} options
   * @param {string} options.id Unique entity identifier (e.g., 'hand-left', 'obj-orange-01')
   * @param {'person' | 'hand' | 'body' | 'object' | 'surface' | 'prop' | 'virtual'} options.type Primary category
   * @param {string} [options.subType] Specific classifier (e.g., 'Left', 'Right', 'wand', 'ball', 'fireball')
   * @param {string} [options.coordSpace='normalized_relative'] Coordinate reference space
   * @param {string} [options.depthSource='default'] Origin of depth value ('apparent_size', 'direct', 'calibrated')
   */
  constructor({ id, type, subType = '', coordSpace = 'normalized_relative', depthSource = 'default' }) {
    this.id = id;
    this.type = type;
    this.subType = subType;
    this.coordSpace = coordSpace;
    this.depthSource = depthSource;

    // Spatial Relationships (populated by TrackingFusion)
    this.relations = {
      near: [],          // Array of entity IDs in proximity
      touching: [],      // Array of entity IDs in contact/intersection
      heldBy: null,      // Entity ID holding this entity (if object/prop)
      holding: null,     // Entity ID held by this entity (if hand)
      attachedTo: null,  // Entity ID this entity belongs to (e.g. hand attachedTo body)
      following: null    // Entity ID this entity is following
    };

    // Interaction State (What is this entity currently doing?)
    this.interactionState = {
      selected: false,
      hovered: false,
      touching: false,
      grabbed: false,
      heldBy: null,
      dragging: false
    };

    // Spatial Transform (Normalized/Relative by default)
    this.position = { x: 0, y: 0, z: 0 };
    this.metricPosition = null; // { x, y, z } in meters when calibrated
    this.rotation = { roll: 0, pitch: 0, yaw: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
    this.scale = { x: 1, y: 1, z: 1, relativeDepth: 0 };

    // Kinematics (derived over temporal sliding window)
    this.velocity = { vx: 0, vy: 0, vz: 0, speed: 0 };
    this.acceleration = { ax: 0, ay: 0, az: 0 };
    this.angularVelocity = { wx: 0, wy: 0, wz: 0 };

    // Geometry & Topologic Data
    this.landmarks = null;       // Array of 3D landmarks (e.g. 21 for hand, 33 for body)
    this.boundingBox = null;     // { minX, minY, minZ, maxX, maxY, maxZ, width, height, depth }
    this.contour = null;         // 2D outline points for segmented objects
    this.centroid = { x: 0, y: 0 };

    // Telemetry & Tracking Quality
    this.confidence = 0.0;
    this.lifetimeFrames = 0;
    this.missingFrames = 0;
    this.firstSeenTimestamp = performance.now();
    this.lastSeenTimestamp = performance.now();

    // Extensible Metadata (poses, color, interaction flags, etc.)
    this.customProps = {};

    // Internal History Buffer for Velocity / Linear Regression (last 8 samples)
    this._history = [];
    this._maxHistory = 8;
  }

  /**
   * Updates entity state with a new sensory candidate observation
   * @param {Object} observation Candidate detection from PerceptionEngine
   * @param {number} timestamp Frame timestamp (ms)
   */
  updateObservation(observation, timestamp = performance.now()) {
    this.lastSeenTimestamp = timestamp;
    this.lifetimeFrames++;
    this.missingFrames = 0;

    if (observation.confidence !== undefined) {
      this.confidence = observation.confidence;
    }
    if (observation.subType) {
      this.subType = observation.subType;
    }

    // Update Landmarks if present
    if (observation.landmarks) {
      this.landmarks = observation.landmarks;
      this._updateBoundingBoxFromLandmarks(observation.landmarks);
    }

    // Update Position
    if (observation.position) {
      const prevPos = { ...this.position };
      this.position = { ...observation.position };

      if (observation.metricPosition) {
        this.metricPosition = { ...observation.metricPosition };
      }

      // Compute Kinematics from History
      this._updateKinematics(prevPos, timestamp);
    }

    // Update Rotation if present
    if (observation.rotation) {
      this.rotation = { ...this.rotation, ...observation.rotation };
    }

    // Update Scale / Relative Depth
    if (observation.scale) {
      this.scale = { ...this.scale, ...observation.scale };
    }

    // Merge custom properties
    if (observation.customProps) {
      Object.assign(this.customProps, observation.customProps);
    }
  }

  /**
   * Called when an entity is missing in the current frame
   */
  markMissing() {
    this.missingFrames++;
    // Velocity dampens when occluded/missing
    this.velocity.vx *= 0.7;
    this.velocity.vy *= 0.7;
    this.velocity.vz *= 0.7;
    this.velocity.speed *= 0.7;
  }

  /**
   * Derives velocity & acceleration over the temporal sliding window
   */
  _updateKinematics(prevPos, timestamp) {
    this._history.push({
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      time: timestamp
    });

    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }

    if (this._history.length < 2) return;

    const oldest = this._history[0];
    const newest = this._history[this._history.length - 1];
    const dt = Math.max(0.01, (newest.time - oldest.time) / 1000);

    const prevVx = this.velocity.vx;
    const prevVy = this.velocity.vy;
    const prevVz = this.velocity.vz;

    // Linear regression / delta velocity
    const vx = (newest.x - oldest.x) / dt;
    const vy = (newest.y - oldest.y) / dt;
    const vz = (newest.z - oldest.z) / dt;
    const speed = Math.hypot(vx, vy, vz);

    this.velocity = { vx, vy, vz, speed };

    // Acceleration
    this.acceleration = {
      ax: (vx - prevVx) / dt,
      ay: (vy - prevVy) / dt,
      az: (vz - prevVz) / dt
    };
  }

  _updateBoundingBoxFromLandmarks(landmarks) {
    if (!landmarks || landmarks.length === 0) return;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const lm of landmarks) {
      if (lm.x < minX) minX = lm.x;
      if (lm.x > maxX) maxX = lm.x;
      if (lm.y < minY) minY = lm.y;
      if (lm.y > maxY) maxY = lm.y;
      if (lm.z !== undefined) {
        if (lm.z < minZ) minZ = lm.z;
        if (lm.z > maxZ) maxZ = lm.z;
      }
    }

    this.boundingBox = {
      minX, minY, minZ: isFinite(minZ) ? minZ : 0,
      maxX, maxY, maxZ: isFinite(maxZ) ? maxZ : 0,
      width: maxX - minX,
      height: maxY - minY,
      depth: isFinite(maxZ - minZ) ? maxZ - minZ : 0
    };

    this.centroid = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2
    };
  }
}
