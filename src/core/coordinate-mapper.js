/**
 * Coordinate Mapper
 * Maps stabilized coordinates [0.0..1.0] to screen pixels [0..width, 0..height]
 * Supports both Wide Active Area (10% - 90%) and Neutral Offset Mapping.
 */

export class CoordinateMapper {
  constructor(screenWidth = 1470, screenHeight = 956) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    // Generous Active Area [0.10 - 0.90] to avoid artificial amplification
    this.activeArea = {
      minX: 0.10,
      maxX: 0.90,
      minY: 0.12,
      maxY: 0.88
    };

    this.invertX = false;
    this.invertY = false;
  }

  setScreenResolution(width, height) {
    this.screenWidth = width;
    this.screenHeight = height;
  }

  setActiveArea(minX, maxX, minY, maxY) {
    this.activeArea.minX = Math.max(0.02, Math.min(minX, 0.40));
    this.activeArea.maxX = Math.min(0.98, Math.max(maxX, 0.60));
    this.activeArea.minY = Math.max(0.02, Math.min(minY, 0.40));
    this.activeArea.maxY = Math.min(0.98, Math.max(maxY, 0.60));
  }

  /**
   * Absolute Mapping: Maps normalized filtered coordinate [0..1] to full screen
   */
  mapAbsolute(filteredPoint) {
    const rawX = this.invertX ? (1.0 - filteredPoint.x) : filteredPoint.x;
    const rawY = this.invertY ? (1.0 - filteredPoint.y) : filteredPoint.y;

    const rangeX = this.activeArea.maxX - this.activeArea.minX;
    const rangeY = this.activeArea.maxY - this.activeArea.minY;

    // Linear mapping through active area
    const relX = (rawX - this.activeArea.minX) / Math.max(0.01, rangeX);
    const relY = (rawY - this.activeArea.minY) / Math.max(0.01, rangeY);

    // Clamping to screen boundaries [0, 1]
    const clampedX = Math.max(0, Math.min(1.0, relX));
    const clampedY = Math.max(0, Math.min(1.0, relY));

    const screenX = Math.round(clampedX * this.screenWidth);
    const screenY = Math.round(clampedY * this.screenHeight);

    return { screenX, screenY, normX: clampedX, normY: clampedY };
  }

  /**
   * Neutral Offset Mapping: Maps displacement from calibrated resting center
   */
  mapFromNeutral(filteredPoint, neutralPoint, gain = 1.3) {
    const dx = (filteredPoint.x - neutralPoint.x) * gain;
    const dy = (filteredPoint.y - neutralPoint.y) * gain;

    const centerX = this.screenWidth / 2;
    const centerY = this.screenHeight / 2;

    const screenX = Math.round(Math.max(0, Math.min(this.screenWidth, centerX + (dx * this.screenWidth))));
    const screenY = Math.round(Math.max(0, Math.min(this.screenHeight, centerY + (dy * this.screenHeight))));

    return { screenX, screenY };
  }
}
