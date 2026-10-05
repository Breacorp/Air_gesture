/**
 * Vector and Kinematic Math Utilities for ModernOS Spatial & Motion Engine
 */

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  clone() {
    return new Vector3(this.x, this.y, this.z);
  }

  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  multiplyScalar(s) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  divideScalar(s) {
    if (s !== 0) {
      this.x /= s;
      this.y /= s;
      this.z /= s;
    }
    return this;
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  length() {
    return Math.sqrt(this.lengthSq());
  }

  normalize() {
    const len = this.length();
    if (len > 0.000001) {
      this.divideScalar(len);
    }
    return this;
  }

  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(v) {
    const x = this.y * v.z - this.z * v.y;
    const y = this.z * v.x - this.x * v.z;
    const z = this.x * v.y - this.y * v.x;
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  distanceTo(v) {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const dz = this.z - v.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  distanceToSq(v) {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }

  lerp(v, alpha) {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    this.z += (v.z - this.z) * alpha;
    return this;
  }
}

/**
 * Calculates angle between 3 points: A -> B -> C (angle at joint B)
 * Returns angle in degrees [0, 180]
 */
export function calculateJointAngle(pA, pB, pC) {
  const v1 = new Vector3(pA.x - pB.x, pA.y - pB.y, pA.z - pB.z).normalize();
  const v2 = new Vector3(pC.x - pB.x, pC.y - pB.y, pC.z - pB.z).normalize();
  
  const dot = Math.max(-1, Math.min(1, v1.dot(v2)));
  return Math.acos(dot) * (180 / Math.PI);
}

/**
 * Low-pass filter for real-time jitter reduction (One-Euro Filter implementation)
 */
export class OneEuroFilter {
  constructor(freq = 60, minCutoff = 1.0, beta = 0.007, dcutoff = 1.0) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dcutoff = dcutoff;
    this.xPrev = null;
    this.dxPrev = null;
    this.tPrev = null;
  }

  alpha(rate, cutoff) {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  filter(val, timestamp = performance.now()) {
    if (this.xPrev === null) {
      this.xPrev = val;
      this.dxPrev = 0;
      this.tPrev = timestamp;
      return val;
    }

    const dt = Math.max(1e-4, (timestamp - this.tPrev) / 1000.0);
    const rate = 1.0 / dt;
    this.tPrev = timestamp;

    const dx = (val - this.xPrev) * rate;
    const edx = (this.dxPrev === null) ? dx : this.dxPrev + this.alpha(rate, this.dcutoff) * (dx - this.dxPrev);
    this.dxPrev = edx;

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const a = this.alpha(rate, cutoff);
    const filtered = this.xPrev + a * (val - this.xPrev);
    this.xPrev = filtered;
    return filtered;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = null;
    this.tPrev = null;
  }
}

export class Vector3Filter {
  constructor(freq = 60, minCutoff = 1.2, beta = 0.01) {
    this.filterX = new OneEuroFilter(freq, minCutoff, beta);
    this.filterY = new OneEuroFilter(freq, minCutoff, beta);
    this.filterZ = new OneEuroFilter(freq, minCutoff, beta);
  }

  filter(v, timestamp) {
    return new Vector3(
      this.filterX.filter(v.x, timestamp),
      this.filterY.filter(v.y, timestamp),
      this.filterZ.filter(v.z, timestamp)
    );
  }

  reset() {
    this.filterX.reset();
    this.filterY.reset();
    this.filterZ.reset();
  }
}
