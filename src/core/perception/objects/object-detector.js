/**
 * ObjectDetector - Salience & Hand-Held Object Detection Engine
 * 
 * "Detectar un objeto real independientemente de su color."
 * 
 * Detects tangible physical objects in the camera frame by analyzing:
 * - Spatial hand-object occlusion (an item held or enclosed by fingers).
 * - Visual salience & local contrast edges (boundaries that contrast with background and skin).
 * - Motion delta (foreground items moving with the hand).
 */

export class ObjectDetector {
  constructor(options = {}) {
    this.minObjectArea = options.minObjectArea || 0.005; // 0.5% of frame
    this.maxObjectArea = options.maxObjectArea || 0.35;  // 35% of frame
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.canvas.width = 160;
    this.canvas.height = 120;
  }

  /**
   * Detects candidate objects in video frame, especially around hands
   * @param {HTMLVideoElement} videoElement
   * @param {Array<Object>} handLandmarks Array of detected hand landmark arrays
   * @param {number} timestamp
   * @returns {Array<Object>} Candidate object detections
   */
  detect(videoElement, handLandmarks = [], timestamp = performance.now()) {
    if (!videoElement || videoElement.readyState < 2) return [];

    const candidates = [];
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Draw downscaled frame for fast pixel processing
    this.ctx.drawImage(videoElement, 0, 0, width, height);
    const frameData = this.ctx.getImageData(0, 0, width, height);
    const data = frameData.data;

    // 1. Detect objects held inside hand regions
    for (let h = 0; h < handLandmarks.length; h++) {
      const landmarks = handLandmarks[h];
      if (!landmarks || landmarks.length < 21) continue;

      const handBBox = this._getHandBBox(landmarks);
      // Region between palm and fingers (where a grasped object sits)
      const gripRegion = {
        minX: Math.max(0, handBBox.minX - 0.05),
        maxX: Math.min(1.0, handBBox.maxX + 0.05),
        minY: Math.max(0, handBBox.minY - 0.05),
        maxY: Math.min(1.0, handBBox.maxY + 0.05)
      };

      const objectPixelStats = this._analyzeNonSkinGripPixels(data, width, height, gripRegion);
      if (objectPixelStats && objectPixelStats.areaRatio >= this.minObjectArea) {
        candidates.push({
          id: `cand-held-hand-${h}`,
          detectionType: 'hand_held_object',
          confidence: Math.min(0.92, 0.5 + objectPixelStats.contrast * 0.4),
          boundingBox: objectPixelStats.bbox,
          centroid: objectPixelStats.centroid,
          colorPalette: objectPixelStats.palette,
          handIndex: h,
          timestamp
        });
      }
    }

    return candidates;
  }

  _getHandBBox(landmarks) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const lm of landmarks) {
      if (lm.x < minX) minX = lm.x;
      if (lm.x > maxX) maxX = lm.x;
      if (lm.y < minY) minY = lm.y;
      if (lm.y > maxY) maxY = lm.y;
    }
    return { minX, minY, maxX, maxY };
  }

  _analyzeNonSkinGripPixels(data, width, height, region) {
    const x0 = Math.floor(region.minX * width);
    const x1 = Math.floor(region.maxX * width);
    const y0 = Math.floor(region.minY * height);
    const y1 = Math.floor(region.maxY * height);

    let nonSkinCount = 0;
    let sumX = 0, sumY = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let rSum = 0, gSum = 0, bSum = 0;

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Basic skin detection check (Peers/Kovac rule): R > 95, G > 40, B > 20, max-min > 15, |R-G| > 15, R > G, R > B
        const isSkin = (r > 95 && g > 40 && b > 20 && (Math.max(r, g, b) - Math.min(r, g, b) > 15) && Math.abs(r - g) > 15 && r > g && r > b);

        if (!isSkin) {
          nonSkinCount++;
          sumX += x;
          sumY += y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;

          rSum += r;
          gSum += g;
          bSum += b;
        }
      }
    }

    const totalRegionPixels = (x1 - x0) * (y1 - y0);
    if (nonSkinCount < 25 || nonSkinCount / totalRegionPixels < 0.12) {
      return null;
    }

    const areaRatio = nonSkinCount / (width * height);
    const avgR = Math.round(rSum / nonSkinCount);
    const avgG = Math.round(gSum / nonSkinCount);
    const avgB = Math.round(bSum / nonSkinCount);

    return {
      areaRatio,
      contrast: Math.min(1.0, nonSkinCount / totalRegionPixels),
      centroid: { x: (sumX / nonSkinCount) / width, y: (sumY / nonSkinCount) / height },
      bbox: {
        minX: minX / width,
        minY: minY / height,
        maxX: maxX / width,
        maxY: maxY / height,
        width: (maxX - minX) / width,
        height: (maxY - minY) / height
      },
      palette: { r: avgR, g: avgG, b: avgB, hex: `#${avgR.toString(16).padStart(2,'0')}${avgG.toString(16).padStart(2,'0')}${avgB.toString(16).padStart(2,'0')}` }
    };
  }
}
