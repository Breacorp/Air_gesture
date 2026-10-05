/**
 * Signal Stabilizer & Jitter Profiler
 * Stabilizes the physical human hand landmark directly in normalized camera space [0..1]
 * before any spatial or coordinate mapping takes place.
 * Computes live mathematical jitter variance and handles Neutral Calibration.
 */

import { OneEuroFilter } from './math-utils.js';

export class SignalStabilizer {
  constructor() {
    // One Euro Filter tuned specifically for normalized hand landmarks [0..1]
    // minCutoff = 0.4 Hz: rock-solid stationary hold, kills all resting hand tremor
    // beta = 0.018: instantaneous high-speed bandwidth, eliminates lag on fast gestures
    this.minCutoff = 0.4;
    this.beta = 0.018;
    this.dcutoff = 1.0;

    this.filterX = new OneEuroFilter(60, this.minCutoff, this.beta, this.dcutoff);
    this.filterY = new OneEuroFilter(60, this.minCutoff, this.beta, this.dcutoff);

    // Mode: 'absolute' or 'relative'
    this.mode = 'relative';

    // Neutral Calibration (comfortable resting center)
    this.isCalibrating = false;
    this.calibrationSamples = [];
    this.neutral = { x: 0.5, y: 0.5 };
    this.hasNeutralCalibration = false;

    // Relative mode velocity integrator
    this.relativeSensitivity = 2200; // Screen pixels per 1.0 normalized movement
    this.relativeDeadZoneNorm = 0.0012; // Normalized movement deadzone (~1.5px)

    // Previous filtered positions for velocity & relative deltas
    this.prevFiltered = null;
    this.prevTimestamp = null;

    // Running Jitter History (variance calculation over last 30 frames)
    this.historyLength = 30;
    this.rawHistoryX = [];
    this.rawHistoryY = [];
    this.filteredHistoryX = [];
    this.filteredHistoryY = [];

    this.diagnostics = {
      raw: { x: 0, y: 0 },
      filtered: { x: 0, y: 0 },
      velocity: { vx: 0, vy: 0, speed: 0 },
      jitter: { raw: 0, filtered: 0, reductionPct: 0 }
    };
  }

  setFilterParams(minCutoff, beta) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.filterX = new OneEuroFilter(60, this.minCutoff, this.beta, this.dcutoff);
    this.filterY = new OneEuroFilter(60, this.minCutoff, this.beta, this.dcutoff);
  }

  setMode(mode) {
    if (mode === 'absolute' || mode === 'relative') {
      this.mode = mode;
      this.prevFiltered = null;
    }
  }

  startNeutralCalibration() {
    this.isCalibrating = true;
    this.calibrationSamples = [];
  }

  /**
   * Primary Stabilization Step
   * @param {Object} rawPoint { x: 0..1, y: 0..1 } - Raw landmark directly from MediaPipe
   * @param {number} timestamp - Frame timestamp
   * @returns {Object} Stabilized signal with diagnostics
   */
  process(rawPoint, timestamp = performance.now()) {
    if (!rawPoint) return null;

    const rawX = rawPoint.x;
    const rawY = rawPoint.y;

    // 1. One Euro Filter directly on raw physical signal
    let filteredX = this.filterX.filter(rawX, timestamp);
    let filteredY = this.filterY.filter(rawY, timestamp);

    // 2. Neutral Calibration Collector
    if (this.isCalibrating) {
      this.calibrationSamples.push({ x: rawX, y: rawY });
      if (this.calibrationSamples.length >= 45) { // ~0.75s at 60fps
        const avgX = this.calibrationSamples.reduce((a, b) => a + b.x, 0) / this.calibrationSamples.length;
        const avgY = this.calibrationSamples.reduce((a, b) => a + b.y, 0) / this.calibrationSamples.length;
        this.neutral = { x: avgX, y: avgY };
        this.hasNeutralCalibration = true;
        this.isCalibrating = false;
        this.calibrationSamples = [];
      }
    }

    // 3. Compute Normalized Velocity & Relative Deltas with Micro-Tremor Deadband
    let deltaNormX = 0;
    let deltaNormY = 0;
    let vx = 0;
    let vy = 0;
    let speed = 0;

    if (this.prevFiltered && this.prevTimestamp) {
      const dt = Math.max(1e-4, (timestamp - this.prevTimestamp) / 1000.0);
      deltaNormX = filteredX - this.prevFiltered.x;
      deltaNormY = filteredY - this.prevFiltered.y;

      // Micro-tremor suppression deadband: cancels camera sensor noise while stationary
      const deltaMag = Math.hypot(deltaNormX, deltaNormY);
      if (deltaMag < 0.00065) {
        filteredX = this.prevFiltered.x;
        filteredY = this.prevFiltered.y;
        deltaNormX = 0;
        deltaNormY = 0;
      }

      vx = deltaNormX / dt;
      vy = deltaNormY / dt;
      speed = Math.sqrt(vx * vx + vy * vy);
    }

    this.prevFiltered = { x: filteredX, y: filteredY };
    this.prevTimestamp = timestamp;

    // 4. Jitter Measurement (Standard Deviation)
    this._updateJitterHistory(rawX, rawY, filteredX, filteredY);

    this.diagnostics = {
      raw: { x: rawX, y: rawY },
      filtered: { x: filteredX, y: filteredY },
      neutral: this.neutral,
      velocity: { vx, vy, speed },
      deltaNorm: { x: deltaNormX, y: deltaNormY },
      jitter: this._computeJitterMetrics(),
      mode: this.mode,
      isCalibrating: this.isCalibrating
    };

    return {
      filteredX,
      filteredY,
      deltaNormX,
      deltaNormY,
      diagnostics: this.diagnostics
    };
  }

  _updateJitterHistory(rawX, rawY, filteredX, filteredY) {
    this.rawHistoryX.push(rawX);
    this.rawHistoryY.push(rawY);
    this.filteredHistoryX.push(filteredX);
    this.filteredHistoryY.push(filteredY);

    if (this.rawHistoryX.length > this.historyLength) {
      this.rawHistoryX.shift();
      this.rawHistoryY.shift();
      this.filteredHistoryX.shift();
      this.filteredHistoryY.shift();
    }
  }

  _computeJitterMetrics() {
    if (this.rawHistoryX.length < 5) {
      return { raw: 0, filtered: 0, reductionPct: 0 };
    }

    const calcStd = (arr) => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
      return Math.sqrt(variance);
    };

    const rawStd = (calcStd(this.rawHistoryX) + calcStd(this.rawHistoryY)) / 2;
    const filteredStd = (calcStd(this.filteredHistoryX) + calcStd(this.filteredHistoryY)) / 2;

    const reductionPct = rawStd > 0 ? Math.max(0, Math.min(100, Math.round((1 - filteredStd / rawStd) * 100))) : 0;

    return {
      raw: rawStd,
      filtered: filteredStd,
      reductionPct
    };
  }

  reset() {
    this.prevFiltered = null;
    this.prevTimestamp = null;
    this.filterX.reset();
    this.filterY.reset();
    this.rawHistoryX = [];
    this.rawHistoryY = [];
    this.filteredHistoryX = [];
    this.filteredHistoryY = [];
  }
}
