/**
 * Pure 1:1 Cursor Engine (Phase 2.1 Stabilization)
 * Stripped of ballistic acceleration, non-linear multipliers, and Z-dependencies.
 * Supports both Pure Absolute positioning and Relative (Trackpad-style) integration.
 */

export class CursorEngine {
  constructor(screenWidth = 1470, screenHeight = 956) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    // Direct cursor coordinates
    this.x = screenWidth / 2;
    this.y = screenHeight / 2;

    this.velocityX = 0;
    this.velocityY = 0;
    this.speed = 0;

    // Small post-filter deadzone (1.2px) only to prevent single-pixel dithering
    this.postDeadzonePx = 1.2;

    // Relative mode sensitivity (pixels of cursor movement per 1.0 of normalized hand travel)
    this.relativeGain = 1.85;

    this.lastTimestamp = performance.now();
  }

  setScreenBounds(width, height) {
    this.screenWidth = width;
    this.screenHeight = height;
  }

  /**
   * Absolute Update: Maps 1:1 to target screen coordinates
   */
  updateAbsolute(targetX, targetY, timestamp = performance.now()) {
    const dt = Math.max(1e-4, (timestamp - this.lastTimestamp) / 1000.0);
    this.lastTimestamp = timestamp;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Minimal post-filter deadzone
    if (dist < this.postDeadzonePx) {
      this.velocityX = 0;
      this.velocityY = 0;
      this.speed = 0;
      return this.getState();
    }

    // Direct 1:1 position (no ballistic acceleration)
    const newX = Math.max(0, Math.min(this.screenWidth, targetX));
    const newY = Math.max(0, Math.min(this.screenHeight, targetY));

    this.velocityX = (newX - this.x) / dt;
    this.velocityY = (newY - this.y) / dt;
    this.speed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);

    this.x = newX;
    this.y = newY;

    return this.getState();
  }

  /**
   * Relative Update (Trackpad mode): Adds displacement delta to current cursor
   */
  updateRelative(deltaNormX, deltaNormY, timestamp = performance.now()) {
    const dt = Math.max(1e-4, (timestamp - this.lastTimestamp) / 1000.0);
    this.lastTimestamp = timestamp;

    // Dead-zone on small hand micro-movement
    const normDist = Math.sqrt(deltaNormX * deltaNormX + deltaNormY * deltaNormY);
    if (normDist < 0.0008) { // ~1.2px equivalent
      this.velocityX = 0;
      this.velocityY = 0;
      this.speed = 0;
      return this.getState();
    }

    // Direct proportional delta
    const deltaPxX = deltaNormX * this.screenWidth * this.relativeGain;
    const deltaPxY = deltaNormY * this.screenHeight * this.relativeGain;

    const newX = Math.max(0, Math.min(this.screenWidth, this.x + deltaPxX));
    const newY = Math.max(0, Math.min(this.screenHeight, this.y + deltaPxY));

    this.velocityX = (newX - this.x) / dt;
    this.velocityY = (newY - this.y) / dt;
    this.speed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);

    this.x = newX;
    this.y = newY;

    return this.getState();
  }

  reset(x = this.screenWidth / 2, y = this.screenHeight / 2) {
    this.x = x;
    this.y = y;
    this.velocityX = 0;
    this.velocityY = 0;
    this.speed = 0;
  }

  getState() {
    return {
      x: Math.round(this.x),
      y: Math.round(this.y),
      floatX: this.x,
      floatY: this.y,
      velocityX: this.velocityX,
      velocityY: this.velocityY,
      speed: this.speed
    };
  }
}
