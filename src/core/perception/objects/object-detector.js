/**
 * ObjectDetector - Multi-Signal Object Perception Engine
 * 
 * "No quiero que ObjectTracker sea 'detector de colores'. El color puede ser una señal auxiliar.
 *  Deberíamos pasar a: Appearance (color/texture) + Geometry (shape/edges) + Motion."
 * 
 * Multi-Signal Object Detection:
 * 1. Appearance:
 *    - Chromatic contrast & vibrancy (orange, red, blue, green, etc.).
 *    - Luminance extremes (dark/black tools, metallic/specular surfaces).
 * 2. Geometry & Edges:
 *    - Bounding contours & outer silhouettes.
 *    - Aspect ratio & shape classification (elongated screwdrivers/pens vs compact props).
 * 3. Motion & Kinematics:
 *    - Frame differencing (optical motion delta) to isolate active manipulated objects.
 * 4. Hand Occlusion & Protrusion:
 *    - Hand grasp zone analysis: skin vs non-skin pixel segmentation.
 *    - Occlusion percentage measurement (e.g. 37% occluded, 63% visible).
 */

export class ObjectDetector {
  constructor(options = {}) {
    this.minObjectArea = options.minObjectArea || 0.002; // 0.2% of frame
    this.maxObjectArea = options.maxObjectArea || 0.45;  // 45% of frame
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.procWidth = 160;
    this.procHeight = 120;
    this.canvas.width = this.procWidth;
    this.canvas.height = this.procHeight;

    this.activeColorHint = options.colorHint || 'auto'; // 'auto', 'orange', 'black', 'metallic', 'blue', 'green', 'red'

    // Previous frame cache for motion delta
    this.prevFrameData = null;
  }

  setColorHint(hint) {
    this.activeColorHint = hint || 'auto';
  }

  /**
   * Detects candidate objects in video frame using multi-signal analysis
   * @param {HTMLVideoElement} videoElement
   * @param {Array<Object>} handLandmarks Array of detected hand landmark arrays
   * @param {number} timestamp
   * @returns {Array<Object>} Candidate object detections
   */
  detect(videoElement, handLandmarks = [], timestamp = performance.now()) {
    if (!videoElement || videoElement.readyState < 2) return [];

    const candidates = [];
    const width = this.procWidth;
    const height = this.procHeight;

    // 1. Draw downscaled frame
    this.ctx.drawImage(videoElement, 0, 0, width, height);
    const frameData = this.ctx.getImageData(0, 0, width, height);
    const data = frameData.data;

    // 2. SIGNAL 1: Hand-Held Protruding & Grasped Objects (e.g. screwdriver, prop)
    for (let h = 0; h < handLandmarks.length; h++) {
      const landmarks = handLandmarks[h];
      if (!landmarks || landmarks.length < 21) continue;

      const handBBox = this._getHandBBox(landmarks);
      // Protrusion search zone: expand around palm, fingers & grip direction
      const searchRegion = {
        minX: Math.max(0, handBBox.minX - 0.15),
        maxX: Math.min(1.0, handBBox.maxX + 0.15),
        minY: Math.max(0, handBBox.minY - 0.22), // tools often extend upwards/forward from grip
        maxY: Math.min(1.0, handBBox.maxY + 0.15)
      };

      const handGripStats = this._analyzeHandHeldObject(data, width, height, landmarks, searchRegion);
      if (handGripStats && handGripStats.areaRatio >= this.minObjectArea) {
        candidates.push({
          id: `cand-held-hand-${h}`,
          detectionType: 'hand_held_object',
          confidence: Math.min(0.96, 0.70 + handGripStats.contrast * 0.26),
          boundingBox: handGripStats.bbox,
          centroid: handGripStats.centroid,
          contour: handGripStats.contour,
          colorPalette: handGripStats.palette,
          aspectRatio: handGripStats.aspectRatio,
          shapeLabel: handGripStats.shapeLabel,
          subType: handGripStats.suggestedSubType,
          occlusionPct: handGripStats.occlusionPct,
          visiblePct: 100 - handGripStats.occlusionPct,
          handIndex: h,
          timestamp
        });
      }
    }

    // 3. SIGNAL 2: Motion Difference & Salient Center Foreground Object
    if (candidates.length === 0) {
      const movingOrSalientObj = this._detectSalientOrMovingObject(data, width, height, handLandmarks);
      if (movingOrSalientObj) {
        candidates.push({
          id: 'cand-salient-foreground',
          detectionType: 'salient_object',
          confidence: movingOrSalientObj.confidence,
          boundingBox: movingOrSalientObj.bbox,
          centroid: movingOrSalientObj.centroid,
          contour: movingOrSalientObj.contour,
          colorPalette: movingOrSalientObj.palette,
          aspectRatio: movingOrSalientObj.aspectRatio,
          shapeLabel: movingOrSalientObj.shapeLabel,
          subType: movingOrSalientObj.suggestedSubType,
          occlusionPct: 0,
          visiblePct: 100,
          timestamp
        });
      }
    }

    // Store frame for motion delta analysis in next frame
    if (!this.prevFrameData || this.prevFrameData.length !== data.length) {
      this.prevFrameData = new Uint8ClampedArray(data);
    } else {
      this.prevFrameData.set(data);
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
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  _isSkinPixel(r, g, b) {
    // Robust skin detection accommodating varied lighting & tones
    return (r > 75 && g > 35 && b > 20 &&
           (Math.max(r, g, b) - Math.min(r, g, b) > 12) &&
           Math.abs(r - g) > 8 && r > g && r > b);
  }

  _matchesColorCriteria(r, g, b, luminance) {
    const hint = this.activeColorHint;
    if (hint === 'orange') {
      return (r > 120 && g > 45 && g < 180 && b < 80 && r > g * 1.15);
    }
    if (hint === 'black') {
      return (luminance < 60);
    }
    if (hint === 'metallic') {
      return (luminance > 185 && Math.abs(r - g) < 25 && Math.abs(g - b) < 25);
    }
    if (hint === 'blue') {
      return (b > 110 && b > r * 1.15 && b > g);
    }
    if (hint === 'green') {
      return (g > 100 && g > r * 1.1 && g > b);
    }
    if (hint === 'red') {
      return (r > 120 && r > g * 1.4 && r > b * 1.4);
    }

    // Default 'auto' criteria: Accept chromatic, dark, metallic, or vibrant
    const maxVal = Math.max(r, g, b);
    const minVal = Math.min(r, g, b);
    const saturation = maxVal > 0 ? (maxVal - minVal) / maxVal : 0;

    const isSaturated = saturation > 0.35 && maxVal > 75;
    const isDark = luminance < 55;
    const isSpecularMetallic = luminance > 205;
    const isOrangeOrFluorescent = (r > 130 && g > 50 && b < 90);

    return isSaturated || isDark || isSpecularMetallic || isOrangeOrFluorescent;
  }

  _analyzeHandHeldObject(data, width, height, handLandmarks, region) {
    const x0 = Math.floor(region.minX * width);
    const x1 = Math.floor(region.maxX * width);
    const y0 = Math.floor(region.minY * height);
    const y1 = Math.floor(region.maxY * height);

    let nonSkinPixels = 0;
    let skinPixels = 0;
    let sumX = 0, sumY = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let rSum = 0, gSum = 0, bSum = 0;
    const contour = [];

    for (let y = y0; y < y1; y++) {
      let firstX = -1, lastX = -1;
      for (let x = x0; x < x1; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        if (this._isSkinPixel(r, g, b)) {
          skinPixels++;
        } else {
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          if (this._matchesColorCriteria(r, g, b, luminance)) {
            nonSkinPixels++;
            sumX += x;
            sumY += y;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;

            rSum += r;
            gSum += g;
            bSum += b;

            if (firstX === -1) firstX = x;
            lastX = x;
          }
        }
      }

      if (firstX !== -1 && y % 2 === 0) {
        contour.push({ x: firstX / width, y: y / height });
        if (lastX !== firstX) contour.push({ x: lastX / width, y: y / height });
      }
    }

    if (nonSkinPixels < 18) return null;

    const bboxW = (maxX - minX) / width;
    const bboxH = (maxY - minY) / height;
    const aspectRatio = bboxH > 0 ? (bboxH / Math.max(0.01, bboxW)) : 1.0;

    // Classification heuristics
    let shapeLabel = 'compact';
    let suggestedSubType = 'unknown';

    if (aspectRatio > 1.6 || (bboxW / Math.max(0.01, bboxH)) > 1.6) {
      shapeLabel = 'elongated';
      suggestedSubType = 'screwdriver'; // Tool / screwdriver candidate
    } else if (Math.abs(bboxW - bboxH) < 0.06) {
      shapeLabel = 'compact_spherical';
      suggestedSubType = 'ball';
    } else {
      shapeLabel = 'detected';
    }

    // Estimate hand occlusion: percentage of the grip zone covered by hand skin
    const totalGripZone = nonSkinPixels + skinPixels;
    const occlusionPct = Math.min(85, Math.max(5, Math.round((skinPixels / Math.max(1, totalGripZone)) * 100)));

    const avgR = Math.round(rSum / nonSkinPixels);
    const avgG = Math.round(gSum / nonSkinPixels);
    const avgB = Math.round(bSum / nonSkinPixels);

    return {
      areaRatio: nonSkinPixels / (width * height),
      contrast: Math.min(1.0, nonSkinPixels / 350),
      centroid: { x: (sumX / nonSkinPixels) / width, y: (sumY / nonSkinPixels) / height },
      bbox: { minX: minX / width, minY: minY / height, maxX: maxX / width, maxY: maxY / height, width: bboxW, height: bboxH },
      contour,
      aspectRatio,
      shapeLabel,
      suggestedSubType,
      occlusionPct,
      palette: { r: avgR, g: avgG, b: avgB, hex: `#${avgR.toString(16).padStart(2,'0')}${avgG.toString(16).padStart(2,'0')}${avgB.toString(16).padStart(2,'0')}` }
    };
  }

  _detectSalientOrMovingObject(data, width, height, handLandmarks) {
    const x0 = Math.floor(width * 0.15);
    const x1 = Math.floor(width * 0.85);
    const y0 = Math.floor(height * 0.15);
    const y1 = Math.floor(height * 0.85);

    let matchCount = 0;
    let sumX = 0, sumY = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let rSum = 0, gSum = 0, bSum = 0;
    const contour = [];

    const hasPrev = this.prevFrameData !== null && this.prevFrameData.length === data.length;

    for (let y = y0; y < y1; y++) {
      let firstX = -1, lastX = -1;
      for (let x = x0; x < x1; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        if (!this._isSkinPixel(r, g, b)) {
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          const matchesColor = this._matchesColorCriteria(r, g, b, luminance);

          let hasMotion = false;
          if (hasPrev) {
            const pr = this.prevFrameData[idx];
            const pg = this.prevFrameData[idx + 1];
            const pb = this.prevFrameData[idx + 2];
            const diff = Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);
            if (diff > 45) hasMotion = true;
          }

          if (matchesColor || hasMotion) {
            matchCount++;
            sumX += x;
            sumY += y;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;

            rSum += r;
            gSum += g;
            bSum += b;

            if (firstX === -1) firstX = x;
            lastX = x;
          }
        }
      }

      if (firstX !== -1 && y % 2 === 0) {
        contour.push({ x: firstX / width, y: y / height });
        if (lastX !== firstX) contour.push({ x: lastX / width, y: y / height });
      }
    }

    if (matchCount < 25) return null;

    const bboxW = (maxX - minX) / width;
    const bboxH = (maxY - minY) / height;
    const aspectRatio = bboxH / Math.max(0.01, bboxW);

    const avgR = Math.round(rSum / matchCount);
    const avgG = Math.round(gSum / matchCount);
    const avgB = Math.round(bSum / matchCount);

    return {
      confidence: 0.89,
      bbox: { minX: minX / width, minY: minY / height, maxX: maxX / width, maxY: maxY / height, width: bboxW, height: bboxH },
      centroid: { x: (sumX / matchCount) / width, y: (sumY / matchCount) / height },
      contour,
      aspectRatio,
      shapeLabel: aspectRatio > 1.6 ? 'elongated' : 'compact',
      suggestedSubType: aspectRatio > 1.6 ? 'screwdriver' : 'unknown',
      palette: { r: avgR, g: avgG, b: avgB, hex: `#${avgR.toString(16).padStart(2,'0')}${avgG.toString(16).padStart(2,'0')}${avgB.toString(16).padStart(2,'0')}` }
    };
  }
}
