/**
 * PointerController - High-Frequency, Low-Latency Spatial Pointer
 * 
 * Exclusively responsible for converting tracked hand coordinates into
 * stabilized, rock-solid screen cursor positions.
 * 
 * Completely decoupled from gesture recognition to guarantee continuous,
 * zero-lag cursor response.
 */

import { globalEventBus } from '../event-bus.js';
import { SignalStabilizer } from '../stabilizer.js';
import { CoordinateMapper } from '../coordinate-mapper.js';
import { CursorEngine } from '../cursor-engine.js';

export class PointerController {
  constructor(screenWidth = 1470, screenHeight = 956) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    this.stabilizer = new SignalStabilizer();
    this.mapper = new CoordinateMapper(screenWidth, screenHeight);
    this.cursor = new CursorEngine(screenWidth, screenHeight);

    // Modes: 'absolute' | 'relative' | 'auto'
    this.mode = 'relative';

    // Anti-jitter click anchoring
    this.anchor = null;

    // Clutching state (aerial trackpad repositioning)
    this.isClutched = false;
    this.lastHandSeenTime = 0;
    this.clutchTimeoutMs = 150;

    // Active hand
    this.activeHand = 'Right';

    // Ballistic gain for relative mode
    this.relativeSensitivity = 2.2;
  }

  setScreenResolution(width, height) {
    this.screenWidth = width;
    this.screenHeight = height;
    this.mapper.setScreenResolution(width, height);
    this.cursor.setScreenBounds(width, height);
  }

  setMode(mode) {
    if (mode === 'absolute' || mode === 'relative' || mode === 'auto') {
      this.mode = mode;
      this.stabilizer.setMode(mode === 'auto' ? 'relative' : mode);
      console.log(`[PointerController] Mode set to: ${this.mode}`);
    }
  }

  startNeutralCalibration() {
    this.stabilizer.startNeutralCalibration();
  }

  /**
   * Set anchor position to freeze pointer (e.g. during click initiation)
   */
  setAnchor(pos) {
    this.anchor = { x: pos.x, y: pos.y };
  }

  /**
   * Release anchor to allow free movement (e.g. during dragging or after click)
   */
  clearAnchor() {
    this.anchor = null;
  }

  /**
   * Update pointer state with a new observation
   * @param {Object} rawPoint { x: 0..1, y: 0..1 } Normalized landmark (e.g. index tip)
   * @param {number} confidence Tracking confidence [0..1]
   * @param {string} handedness 'Left' | 'Right'
   * @param {number} timestamp Performance timestamp (ms)
   * @returns {Object} Pointer state { x, y, vx, vy, speed, diagnostics }
   */
  update(rawPoint, confidence = 0.9, handedness = 'Right', timestamp = performance.now()) {
    this.activeHand = handedness;

    if (!rawPoint) {
      // Clutch active: hand temporarily missing, hold cursor steady
      this.isClutched = true;
      this.stabilizer.reset();
      return {
        ...this.cursor.getState(),
        diagnostics: null,
        isClutched: true,
        mode: this.mode
      };
    }

    // Hand re-entered: handle clutch recovery to prevent coordinate teleportation
    if (this.isClutched) {
      this.isClutched = false;
      this.stabilizer.reset();
    }
    this.lastHandSeenTime = timestamp;

    // 1. Stabilize physical signal in normalized space [0..1]
    const stabResult = this.stabilizer.process(rawPoint, timestamp);
    const { filteredX, filteredY, deltaNormX, deltaNormY, diagnostics } = stabResult;

    // 2. Cursor Positioning (Absolute or Relative)
    let cursorState = null;
    const effectiveMode = (this.mode === 'auto') ? 'relative' : this.mode;

    if (effectiveMode === 'relative') {
      // Trackpad mode: integrates stabilized delta with micro-deadband
      cursorState = this.cursor.updateRelative(deltaNormX * this.relativeSensitivity, deltaNormY * this.relativeSensitivity, timestamp);
    } else {
      // Absolute Mode: 1:1 direct pointing
      let targetX = 0;
      let targetY = 0;

      if (this.stabilizer.hasNeutralCalibration) {
        const offsetMapped = this.mapper.mapFromNeutral(
          { x: filteredX, y: filteredY },
          this.stabilizer.neutral
        );
        targetX = offsetMapped.screenX;
        targetY = offsetMapped.screenY;
      } else {
        const absMapped = this.mapper.mapAbsolute({ x: filteredX, y: filteredY });
        targetX = absMapped.screenX;
        targetY = absMapped.screenY;
      }

      cursorState = this.cursor.updateAbsolute(targetX, targetY, timestamp);
    }

    // 3. Apply click anchor if active
    let effectiveX = cursorState.x;
    let effectiveY = cursorState.y;

    if (this.anchor) {
      effectiveX = this.anchor.x;
      effectiveY = this.anchor.y;
    }

    // 4. Attach diagnostics & quality metrics
    diagnostics.cursor = { x: effectiveX, y: effectiveY };
    diagnostics.velocity = {
      vx: cursorState.velocityX,
      vy: cursorState.velocityY,
      speed: cursorState.speed
    };
    const rawJitter = diagnostics.jitter ? diagnostics.jitter.filtered : 0.001;
    diagnostics.quality = this._computeQualityScore(confidence, rawJitter);

    // 5. Emit high-frequency POINTER_MOVE
    globalEventBus.emit('pointer_move', {
      x: effectiveX,
      y: effectiveY,
      vx: cursorState.velocityX,
      vy: cursorState.velocityY,
      speed: cursorState.speed,
      hand: this.activeHand,
      mode: this.mode,
      isAnchored: !!this.anchor
    });

    globalEventBus.emit('diagnostics:stabilization', diagnostics);

    return {
      x: effectiveX,
      y: effectiveY,
      vx: cursorState.velocityX,
      vy: cursorState.velocityY,
      speed: cursorState.speed,
      diagnostics,
      isClutched: false,
      mode: this.mode
    };
  }

  _computeQualityScore(confidence, filteredJitter) {
    const jitterPts = Math.max(0, Math.min(40, Math.round((1.0 - Math.min(1.0, filteredJitter / 0.002)) * 40)));
    const confPts = Math.max(0, Math.min(35, Math.round((confidence || 0.9) * 35)));
    const latPts = 25; // 60 FPS baseline

    const total = Math.min(100, jitterPts + confPts + latPts);
    let rating = 'BUENO';
    if (total >= 88) rating = 'EXCELENTE (APTO ESCRITORIO)';
    else if (total < 70) rating = 'REDUCIDO (REVISAR LUZ)';

    return { total, rating };
  }
}
