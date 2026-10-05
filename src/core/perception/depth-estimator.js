/**
 * DepthEstimator - Perception module for Relative Monocular Depth Estimation
 * (Fase 4: Depth Estimation & Segmented 3D Surfaces)
 */

export class DepthEstimator {
  constructor(options = {}) {
    this.enabled = options.enabled || false;
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  estimate(videoElement) {
    if (!this.enabled) return null;
    return null;
  }
}
