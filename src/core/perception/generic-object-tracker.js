/**
 * GenericObjectTracker - Minimal Robust Generic Object Perception Engine
 * 
 * Replaces hardcoded HSV color-only filtering with multi-cue generic detection:
 * - Hand grasp / tool interaction region detection (detects objects held in hand)
 * - Motion delta & foreground contrast saliency
 * - Persistent object-001 identity tracking with velocity estimation
 */

export class GenericObjectTracker {
  constructor(options = {}) {
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    this.procWidth = 160;
    this.procHeight = 120;
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (this.canvas) {
      this.canvas.width = this.procWidth;
      this.canvas.height = this.procHeight;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    this.prevFrameData = null;
    this.lastDetection = null;
    this.track = {
      id: 'object-001',
      status: 'ACTIVE',
      position: { x: 0.5, y: 0.5, z: 0.5 },
      velocity: { vx: 0, vy: 0, vz: 0, speed: 0 },
      boundingBox: { minX: 0.45, minY: 0.45, maxX: 0.55, maxY: 0.55, width: 0.1, height: 0.1 },
      confidence: 0.85,
      framesMissing: 0,
      subType: 'generic_object'
    };
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

  /**
   * Detects and tracks generic physical objects in the video frame
   * @param {HTMLVideoElement} videoElement
   * @param {number} timestamp
   * @param {Array<Object>} handsData - Kinematic or landmark hand data
   * @returns {{count: number, tracks: Array, candidates: Array}|null}
   */
  detect(videoElement, timestamp = performance.now(), handsData = []) {
    if (!this.enabled || !videoElement || videoElement.readyState < 2 || !this.ctx) {
      return null;
    }

    const w = this.procWidth;
    const h = this.procHeight;

    try {
      this.ctx.drawImage(videoElement, 0, 0, w, h);
      const frameData = this.ctx.getImageData(0, 0, w, h);
      const data = frameData.data;

      let detectedCentroid = null;
      let detectedBox = null;
      let detectedConfidence = 0.8;
      let objectFound = false;

      // Cue 1: Hand interaction zone inspection (Look for objects extending from hands)
      let primaryHand = null;
      if (handsData && handsData.length > 0) {
        primaryHand = handsData[0];
      }

      if (primaryHand && primaryHand.landmarks && primaryHand.landmarks.length >= 21) {
        const lms = primaryHand.landmarks;
        const wrist = lms[0];
        const indexTip = lms[8];
        const thumbTip = lms[4];

        // Object in hand grasp or fingertip zone
        const handBox = {
          minX: Math.min(...lms.map(l => l.x)),
          maxX: Math.max(...lms.map(l => l.x)),
          minY: Math.min(...lms.map(l => l.y)),
          maxY: Math.max(...lms.map(l => l.y))
        };

        // Sample pixels around pinch/grasp zone in the downscaled image
        const sampleCenterX = Math.round(((indexTip.x + thumbTip.x) / 2) * w);
        const sampleCenterY = Math.round(((indexTip.y + thumbTip.y) / 2) * h);
        const radius = Math.round(18);

        let nonSkinCount = 0;
        let totalCount = 0;
        let minX = w, maxX = 0, minY = h, maxY = 0;

        for (let dy = -radius; dy <= radius; dy += 2) {
          const py = sampleCenterY + dy;
          if (py < 0 || py >= h) continue;

          for (let dx = -radius; dx <= radius; dx += 2) {
            const px = sampleCenterX + dx;
            if (px < 0 || px >= w) continue;

            const idx = (py * w + px) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            // Basic skin tone exclusion: skin typically has r > g > b
            const isSkin = (r > 60 && g > 40 && b > 20 && r > g && g > b && (r - g) > 10);

            if (!isSkin) {
              nonSkinCount++;
              if (px < minX) minX = px;
              if (px > maxX) maxX = px;
              if (py < minY) minY = py;
              if (py > maxY) maxY = py;
            }
            totalCount++;
          }
        }

        // If at least 25% of grasp zone is a non-skin object (pen, tool, prop, cup, phone)
        if (totalCount > 0 && (nonSkinCount / totalCount) > 0.25 && maxX > minX && maxY > minY) {
          const uCenter = (minX + maxX) / (2 * w);
          const vCenter = (minY + maxY) / (2 * h);
          detectedCentroid = { x: uCenter, y: vCenter, z: 0.5 };
          detectedBox = {
            minX: minX / w,
            minY: minY / h,
            maxX: maxX / w,
            maxY: maxY / h,
            width: (maxX - minX) / w,
            height: (maxY - minY) / h
          };
          detectedConfidence = Math.min(0.95, 0.7 + (nonSkinCount / totalCount) * 0.25);
          objectFound = true;
        }
      }

      // Cue 2: Motion delta saliency if no object held in hand
      if (!objectFound && this.prevFrameData) {
        let diffXSum = 0;
        let diffYSum = 0;
        let diffCount = 0;
        let bMinX = w, bMaxX = 0, bMinY = h, bMaxY = 0;

        for (let i = 0; i < data.length; i += 16) {
          const diff = Math.abs(data[i] - this.prevFrameData[i]) +
                       Math.abs(data[i + 1] - this.prevFrameData[i + 1]) +
                       Math.abs(data[i + 2] - this.prevFrameData[i + 2]);

          if (diff > 45) {
            const pixelIdx = i / 4;
            const px = pixelIdx % w;
            const py = Math.floor(pixelIdx / w);

            // Ignore bottom 10% (often reflections or table edge)
            if (py < h * 0.9) {
              diffXSum += px;
              diffYSum += py;
              diffCount++;
              if (px < bMinX) bMinX = px;
              if (px > bMaxX) bMaxX = px;
              if (py < bMinY) bMinY = py;
              if (py > bMaxY) bMaxY = py;
            }
          }
        }

        // Motion blob with reasonable area (between 0.8% and 30% of frame)
        const areaPct = diffCount / ((w * h) / 4);
        if (areaPct > 0.008 && areaPct < 0.35 && bMaxX > bMinX) {
          const cX = (diffXSum / diffCount) / w;
          const cY = (diffYSum / diffCount) / h;
          detectedCentroid = { x: cX, y: cY, z: 0.5 };
          detectedBox = {
            minX: bMinX / w,
            minY: bMinY / h,
            maxX: bMaxX / w,
            maxY: bMaxY / h,
            width: (bMaxX - bMinX) / w,
            height: (bMaxY - bMinY) / h
          };
          detectedConfidence = 0.82;
          objectFound = true;
        }
      }

      this.prevFrameData = new Uint8Array(data);

      // Update Track
      if (objectFound && detectedCentroid && detectedBox) {
        const dt = this.lastDetection ? Math.max(0.016, (timestamp - this.lastDetection.time) / 1000) : 0.033;
        const vx = (detectedCentroid.x - this.track.position.x) / dt;
        const vy = (detectedCentroid.y - this.track.position.y) / dt;

        // Smooth position using alpha-blend
        this.track.position.x += (detectedCentroid.x - this.track.position.x) * 0.4;
        this.track.position.y += (detectedCentroid.y - this.track.position.y) * 0.4;
        this.track.position.z = detectedCentroid.z;

        this.track.boundingBox = detectedBox;
        this.track.confidence = detectedConfidence;
        this.track.status = 'ACTIVE';
        this.track.framesMissing = 0;
        this.track.velocity = { vx, vy, vz: 0, speed: Math.hypot(vx, vy) };

        this.lastDetection = { time: timestamp, pos: { ...this.track.position } };
      } else {
        this.track.framesMissing++;
        if (this.track.framesMissing > 15) {
          this.track.status = 'LOST';
          return { count: 0, tracks: [], candidates: [] };
        } else {
          this.track.status = 'COASTING';
        }
      }

      const candidate = {
        suggestedId: this.track.id,
        type: 'object',
        subType: this.track.subType,
        coordSpace: 'normalized_relative',
        position: { ...this.track.position },
        velocity: { ...this.track.velocity },
        boundingBox: { ...this.track.boundingBox },
        confidence: this.track.confidence,
        customProps: {
          status: this.track.status,
          confidence: this.track.confidence,
          framesMissing: this.track.framesMissing,
          subType: this.track.subType
        }
      };

      return {
        count: 1,
        tracks: [this.track],
        candidates: [candidate]
      };
    } catch (err) {
      console.warn('[GenericObjectTracker] Error detecting:', err);
      return null;
    }
  }
}
