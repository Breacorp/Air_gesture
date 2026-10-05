/**
 * ObjectTracker - Perception module for Physical Object & Prop Tracking
 * (Fase 3: Physical Objects as XR Controllers)
 * 
 * Tracks real-world colored objects (fluorescent ball, wand, markers) via fast HSV
 * segmentation and produces candidate spatial entities for the SpatialWorldModel.
 */

export class ObjectTracker {
  constructor(options = {}) {
    this.enabled = options.enabled || false;
    this.mirror = options.mirror !== undefined ? options.mirror : true;
    this.activePreset = options.preset || 'orange'; // 'orange', 'green', 'blue', 'magenta'
    this.tolerance = options.tolerance || 1.0; // Multiplier

    // Offscreen Canvas for fast non-blocking downscaled color extraction
    this.procWidth = 160;
    this.procHeight = 120;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.procWidth;
    this.canvas.height = this.procHeight;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    // HSV Color Ranges: [H_min, H_max, S_min, S_max, V_min, V_max]
    // Hue in [0..360], Sat in [0..100], Val in [0..100]
    this.colorPresets = {
      orange: { hMin: 10, hMax: 38, sMin: 55, sMax: 100, vMin: 45, vMax: 100, colorHex: '#ff6b35' },
      green:  { hMin: 85, hMax: 150, sMin: 50, sMax: 100, vMin: 40, vMax: 100, colorHex: '#10b981' },
      blue:   { hMin: 190, hMax: 250, sMin: 50, sMax: 100, vMin: 40, vMax: 100, colorHex: '#00bbf9' },
      magenta:{ hMin: 290, hMax: 345, sMin: 50, sMax: 100, vMin: 45, vMax: 100, colorHex: '#ff007f' }
    };

    // Tracking constraints (in downscaled pixels)
    this.minPixels = 20;
    this.maxPixels = 4000;
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  setColorPreset(presetName) {
    if (this.colorPresets[presetName]) {
      this.activePreset = presetName;
      return true;
    }
    return false;
  }

  /**
   * RGB to HSV converter
   */
  _rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0;
    const s = max === 0 ? 0 : (d / max) * 100;
    const v = max * 100;

    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }

    return [h, s, v];
  }

  /**
   * Detects colored object candidates in the video frame
   * @param {HTMLVideoElement} videoElement
   * @param {number} timestamp
   */
  detect(videoElement, timestamp = performance.now()) {
    if (!this.enabled || !videoElement || videoElement.readyState < 2) {
      return null;
    }

    // Downscale video frame into offscreen canvas
    this.ctx.drawImage(videoElement, 0, 0, this.procWidth, this.procHeight);
    const imgData = this.ctx.getImageData(0, 0, this.procWidth, this.procHeight);
    const data = imgData.data;

    const preset = this.colorPresets[this.activePreset] || this.colorPresets.orange;

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    let minX = this.procWidth;
    let maxX = 0;
    let minY = this.procHeight;
    let maxY = 0;

    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const [h, s, v] = this._rgbToHsv(r, g, b);

      if (h >= preset.hMin && h <= preset.hMax &&
          s >= preset.sMin && s <= preset.sMax &&
          v >= preset.vMin && v <= preset.vMax) {
        
        const pixelIdx = i / 4;
        const px = pixelIdx % this.procWidth;
        const py = Math.floor(pixelIdx / this.procWidth);

        sumX += px;
        sumY += py;
        count++;

        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }

    if (count < this.minPixels || count > this.maxPixels) {
      return { objects: [], candidates: [] };
    }

    // Compute Centroid
    const rawCx = sumX / count;
    const rawCy = sumY / count;

    // Normalize coordinates to [0..1]
    const normX = this.mirror ? (1.0 - (rawCx / this.procWidth)) : (rawCx / this.procWidth);
    const normY = rawCy / this.procHeight;

    const boxW = (maxX - minX) / this.procWidth;
    const boxH = (maxY - minY) / this.procHeight;
    const apparentRadius = Math.max(boxW, boxH) / 2;

    // Depth estimate: baseline radius ~ 0.08 at Z = 0
    // Larger apparent radius -> closer (Z > 0); smaller -> deeper (Z < 0)
    const estZ = Math.max(-0.8, Math.min(0.8, (apparentRadius - 0.08) * 4.0));

    const candidate = {
      suggestedId: `obj-${this.activePreset}-01`,
      type: 'object',
      subType: this.activePreset,
      coordSpace: 'normalized_relative',
      depthSource: 'apparent_size',
      position: { x: normX, y: normY, z: estZ },
      scale: { x: boxW, y: boxH, z: apparentRadius, relativeDepth: estZ },
      boundingBox: {
        minX: this.mirror ? (1.0 - (maxX / this.procWidth)) : (minX / this.procWidth),
        minY: minY / this.procHeight,
        maxX: this.mirror ? (1.0 - (minX / this.procWidth)) : (maxX / this.procWidth),
        maxY: maxY / this.procHeight,
        width: boxW,
        height: boxH
      },
      confidence: Math.min(1.0, count / 200),
      customProps: {
        colorName: this.activePreset,
        colorHex: preset.colorHex,
        pixelCount: count,
        radius: apparentRadius
      }
    };

    return {
      objects: [candidate],
      candidates: [candidate]
    };
  }
}
