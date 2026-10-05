/**
 * CameraSource - Abstraction of a physical or logical camera stream
 * 
 * Supports:
 * - Front camera (user facing, body/face/aerial hands)
 * - Desk View camera (Continuity Camera / overhead / inclined tabletop view)
 * - Secondary / USB / external webcams
 * - Perspective calibration & homography unwarping for planar desk coordinates
 */

export class CameraSource {
  /**
   * @param {Object} config
   * @param {string} config.id - Unique ID ('cam-front', 'cam-desk', etc.)
   * @param {string} [config.name] - Human-readable label
   * @param {'front'|'desk'|'secondary'|'environment'} [config.role='front']
   * @param {HTMLVideoElement} [config.videoElement]
   * @param {MediaStream} [config.stream]
   * @param {Object} [config.calibration]
   */
  constructor(config = {}) {
    this.id = config.id || `cam-${Math.random().toString(36).substr(2, 6)}`;
    this.name = config.name || (config.role === 'desk' ? 'Desk View Camera' : 'Front FaceTime Camera');
    this.role = config.role || 'front';
    this.videoElement = config.videoElement || null;
    this.stream = config.stream || null;
    this.isActive = false;

    // Stream resolution & aspect
    this.resolution = {
      width: 1280,
      height: 720,
      aspect: 16 / 9
    };

    // Camera Extrinsics / Intrinsics calibration
    this.calibration = {
      fovDegrees: config.calibration?.fovDegrees || 70,
      pitchDegrees: config.calibration?.pitchDegrees || (this.role === 'desk' ? 60 : 0), // 60° downward for Desk View
      heightMeters: config.calibration?.heightMeters || (this.role === 'desk' ? 0.45 : 0.6),
      opticalCenter: config.calibration?.opticalCenter || { u: 0.5, v: 0.5 }
    };

    // Perspective Homography Matrix (3x3) for Tabletop unwarping
    // Maps normalized sensor UV [0..1] x [0..1] -> planar metric desk coordinates (x, z)
    this.homographyMatrix = this._computeDefaultHomography();
  }

  /**
   * Computes an initial perspective transformation based on pitch angle and height
   */
  _computeDefaultHomography() {
    if (this.role !== 'desk') {
      // Identity 1:1 mapping for front camera
      return [
        1, 0, 0,
        0, 1, 0,
        0, 0, 1
      ];
    }

    // Desk View perspective trapezoid compensation:
    // When looking down at 60°, the top of the frame is further away than the bottom.
    // Keystone correction scales the top outward to restore rectangular desktop proportions.
    const pitchRad = (this.calibration.pitchDegrees * Math.PI) / 180;
    const keystoneFactor = Math.sin(pitchRad);

    return [
      1.0, 0.0, 0.0,
      0.0, Math.cos(pitchRad) || 0.5, 0.0,
      0.0, keystoneFactor * 0.4, 1.0
    ];
  }

  /**
   * Sets custom 3x3 homography calibration matrix for exact desk calibration
   * @param {number[]} matrix - 9 elements array
   */
  setHomography(matrix) {
    if (Array.isArray(matrix) && matrix.length === 9) {
      this.homographyMatrix = [...matrix];
    }
  }

  /**
   * Transforms normalized sensor coordinates (u, v) in [0..1] to desk coordinates (x, z)
   * @param {number} u
   * @param {number} v
   * @returns {{x: number, z: number}}
   */
  unwarpToDesk(u, v) {
    const H = this.homographyMatrix;
    // Homogeneous transformation: [x', y', w']^T = H * [u, v, 1]^T
    const xPrim = H[0] * u + H[1] * v + H[2];
    const yPrim = H[3] * u + H[4] * v + H[5];
    const wPrim = H[6] * u + H[7] * v + H[8];

    const w = wPrim !== 0 ? wPrim : 1.0;
    // Map to centered desk metric bounds (x: [-0.5, 0.5] meters, z: [0.1, 0.7] meters)
    return {
      x: (xPrim / w - 0.5),
      z: (yPrim / w) * 0.6 + 0.1
    };
  }

  /**
   * Inversely maps desk coordinates (x, z) back to normalized sensor UV
   * @param {number} x
   * @param {number} z
   * @returns {{u: number, v: number}}
   */
  projectFromDesk(x, z) {
    // Reverse normalized offset
    const u = x + 0.5;
    const v = (z - 0.1) / 0.6;
    return {
      u: Math.max(0, Math.min(1, u)),
      v: Math.max(0, Math.min(1, v))
    };
  }

  /**
   * Updates resolution from loaded video element metadata
   */
  updateResolution() {
    if (this.videoElement && this.videoElement.videoWidth && this.videoElement.videoHeight) {
      this.resolution.width = this.videoElement.videoWidth;
      this.resolution.height = this.videoElement.videoHeight;
      this.resolution.aspect = this.resolution.width / this.resolution.height;
    }
  }

  /**
   * Stops video tracks and cleans up
   */
  stop() {
    this.isActive = false;
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }
}
