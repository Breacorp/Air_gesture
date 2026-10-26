/**
 * FullSensorView - 100% Unconstrained Native Camera Sensor Visualizer
 * 
 * "El tracker no debería recortar el campo visual.
 *  Y tampoco deberíamos hacer zoom digital.
 *  El video muestra el frame completo de la cámara respetando su relación de aspecto (16:9),
 *  con todos los landmarks (cara + cuerpo + manos + objetos + bounding boxes) superpuestos exactamente 1:1."
 * 
 * The standard view keeps interaction cues focused on hands. Body and face
 * landmarks are available only in their opt-in visualization modes.
 */

// MediaPipe anatomical Pose connections (33 landmarks)
const POSE_CONNECTIONS = [
  // Face / Head
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  // Shoulders & Torso Box
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Arms
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  // Legs
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32]
];

// MediaPipe Hand connections (21 landmarks)
const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm Base
  [5, 9], [9, 13], [13, 17]
];

export const HAND_TRACKING_STYLE = Object.freeze({
  stroke: '#78bfff',
  joint: '#e4f2ff',
  opacity: 0.9,
  lineWidth: 1.8,
  jointRadius: 2,
  wristRadius: 2.4,
  pinchRing: '#ffffff',
  pinchRingWidth: 1.2,
  pinchRingRadius: 5
});

const sensorViews = new WeakMap();

export class FullSensorView {
  constructor(videoElement, containerElement) {
    this.video = videoElement;
    this.container = containerElement || document.body;
    const existing = sensorViews.get(this.container);
    if (existing) return existing;

    this.isActive = true;
    this.visualizationMode = 'standard';
    this._smoothedHands = new Map();
    this._pixelRatio = 1;
    this._canvasSize = { width: 0, height: 0 };

    // High-performance overlay canvas
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'full-sensor-view-canvas';
    this.canvas.className = 'full-sensor-canvas';
    this.ctx = this.canvas.getContext('2d', { alpha: true });

    this.container.appendChild(this.canvas);
    sensorViews.set(this.container, this);

    // Current calibrated video viewport on screen
    this.videoRect = { x: 0, y: 0, width: 0, height: 0 };

    this._resizeHandler = () => this.resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  get isEnabled() {
    return this.isActive;
  }

  setActive(active) {
    this.isActive = !!active;
    this.canvas.classList.toggle('hidden', !this.isActive);
    if (this.isActive) {
      this.resize();
    } else {
      this.clear();
      this._smoothedHands.clear();
    }
  }

  toggle() {
    this.setActive(!this.isActive);
    return this.isActive;
  }

  setVisualizationMode(mode) {
    if (!['standard', 'body', 'diagnostics'].includes(mode)) {
      throw new RangeError(`Unknown tracking visualization mode: ${mode}`);
    }
    this.visualizationMode = mode;
    this._smoothedHands.clear();
  }

  resize() {
    if (!this.video) return;
    const contW = this.container.clientWidth || window.innerWidth;
    const contH = this.container.clientHeight || window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    if (
      this._canvasSize.width !== contW ||
      this._canvasSize.height !== contH ||
      this._pixelRatio !== pixelRatio
    ) {
      this.canvas.width = Math.round(contW * pixelRatio);
      this.canvas.height = Math.round(contH * pixelRatio);
      this._canvasSize = { width: contW, height: contH };
      this._pixelRatio = pixelRatio;
      this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }

    // Compute letterbox/pillarbox destination rect of object-fit: contain video
    const vidW = this.video.videoWidth || 1280;
    const vidH = this.video.videoHeight || 720;
    const videoAspect = vidW / vidH;
    const containerAspect = contW / contH;

    let destW, destH, destX, destY;

    if (containerAspect > videoAspect) {
      // Container is wider than video: Pillarbox (black bars on sides)
      destH = contH;
      destW = contH * videoAspect;
      destX = (contW - destW) / 2;
      destY = 0;
    } else {
      // Container is taller than video: Letterbox (bars top/bottom)
      destW = contW;
      destH = contW / videoAspect;
      destX = 0;
      destY = (contH - destH) / 2;
    }

    this.videoRect = { x: destX, y: destY, width: destW, height: destH, aspect: videoAspect };
  }

  /**
   * Projects normalized [0..1] camera coordinates to exact screen pixels.
   * Coordinates in SpatialWorldModel are already mirrored to match the screen display,
   * so no additional horizontal flipping is applied.
   * @param {number} u Normalized X [0..1]
   * @param {number} v Normalized Y [0..1]
   */
  project(u, v) {
    return {
      x: this.videoRect.x + u * this.videoRect.width,
      y: this.videoRect.y + v * this.videoRect.height
    };
  }

  /**
   * Main render method called on every camera frame
   * @param {Object} data Sensory candidates, entities and worldModel
   */
  render(data = {}) {
    if (!this.isActive) return;

    this.resize();
    const ctx = this.ctx;
    this.clear();

    const vr = this.videoRect;
    const mode = this.visualizationMode;

    if (mode === 'diagnostics') {
      this._renderSensorFrame(ctx, vr);
    }

    // Render body and face only in the explicitly selected view.
    const face = data.worldModel?.getEntity('face-primary') || data.face;
    const body = data.worldModel?.getEntity('body-primary') || data.body;
    const hasFace = this._isCurrentDetection(face);
    const hasBody = this._isCurrentDetection(body);

    if (hasBody && mode === 'body') {
      this._renderBodyPose(ctx, body.landmarks, 'body');
    } else if (hasBody && mode === 'diagnostics') {
      this._renderBodyPose(ctx, body.landmarks, 'diagnostics');
    }

    // Hands use raw detector coordinates. Visual smoothing never changes the
    // landmarks or kinematics consumed by gesture and interaction systems.
    const handsList = Array.isArray(data.hands)
      ? data.hands
      : (data.hands ? Object.values(data.hands).filter(Boolean) : []);
    const activeHands = new Set();
    for (const hand of handsList) {
      if (hand?.landmarks?.length >= 21 && (hand.confidence === undefined || hand.confidence >= 0.3)) {
        const side = hand.handedness || 'Right';
        const key = side.toLowerCase();
        activeHands.add(key);
        const landmarks = this._smoothLandmarks(key, hand.landmarks);
        this._renderHand(ctx, landmarks, hand.pose || {});
      }
    }
    for (const key of this._smoothedHands.keys()) {
      if (!activeHands.has(key)) this._smoothedHands.delete(key);
    }

    if (hasFace && mode === 'diagnostics') {
      this._renderDiagnosticFace(ctx, face);
    }

    if (mode === 'diagnostics') {
      const objects = data.worldModel?.getEntitiesByType('object') || [];
      for (const obj of objects) {
        if (obj.missingFrames === 0) {
          this._renderObject(ctx, obj);
        }
      }
      this._renderSensorHUD(ctx, vr, data);
      this._renderPerceptionDebugBox(ctx, vr, data);
    }
  }

  clear() {
    if (!this.ctx) return;
    const width = this._canvasSize?.width ?? this.canvas.width;
    const height = this._canvasSize?.height ?? this.canvas.height;
    this.ctx.clearRect(0, 0, width, height);
  }

  destroy() {
    window.removeEventListener('resize', this._resizeHandler);
    this._smoothedHands.clear();
    this.clear();
    this.canvas.remove();
    this.isActive = false;
    if (sensorViews.get(this.container) === this) sensorViews.delete(this.container);
  }

  _isCurrentDetection(entity) {
    return Boolean(
      entity &&
      entity.landmarks?.length &&
      (entity.missingFrames === undefined || entity.missingFrames === 0)
    );
  }

  _smoothLandmarks(key, landmarks) {
    const previous = this._smoothedHands.get(key);
    const smoothed = landmarks.map((point, index) => {
      const oldPoint = previous?.[index];
      if (!oldPoint) return { x: point.x, y: point.y, z: point.z || 0 };

      const distance = Math.hypot(point.x - oldPoint.x, point.y - oldPoint.y);
      const alpha = Math.min(0.92, 0.58 + distance * 2.2);
      return {
        x: oldPoint.x + (point.x - oldPoint.x) * alpha,
        y: oldPoint.y + (point.y - oldPoint.y) * alpha,
        z: oldPoint.z + ((point.z || 0) - oldPoint.z) * alpha
      };
    });
    this._smoothedHands.set(key, smoothed);
    return smoothed;
  }

  _renderSensorFrame(ctx, vr) {
    // Outer Sensor Border (Moderno Cyan)
    ctx.save();
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vr.x, vr.y, vr.width, vr.height);

    // Corner brackets
    const bracketSize = 24;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.72)';

    // Top-Left [0.0, 0.0]
    ctx.beginPath();
    ctx.moveTo(vr.x, vr.y + bracketSize);
    ctx.lineTo(vr.x, vr.y);
    ctx.lineTo(vr.x + bracketSize, vr.y);
    ctx.stroke();

    // Top-Right [1.0, 0.0]
    ctx.beginPath();
    ctx.moveTo(vr.x + vr.width - bracketSize, vr.y);
    ctx.lineTo(vr.x + vr.width, vr.y);
    ctx.lineTo(vr.x + vr.width, vr.y + bracketSize);
    ctx.stroke();

    // Bottom-Left [0.0, 1.0]
    ctx.beginPath();
    ctx.moveTo(vr.x, vr.y + vr.height - bracketSize);
    ctx.lineTo(vr.x, vr.y + vr.height);
    ctx.lineTo(vr.x + bracketSize, vr.y + vr.height);
    ctx.stroke();

    // Bottom-Right [1.0, 1.0]
    ctx.beginPath();
    ctx.moveTo(vr.x + vr.width - bracketSize, vr.y + vr.height);
    ctx.lineTo(vr.x + vr.width, vr.y + vr.height);
    ctx.lineTo(vr.x + vr.width, vr.y + vr.height - bracketSize);
    ctx.stroke();

    // Coordinate markers
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#b5dcff';
    ctx.fillText('[0.0, 0.0]', vr.x + 8, vr.y + 16);
    ctx.fillText('[1.0, 0.0]', vr.x + vr.width - 64, vr.y + 16);
    ctx.fillText('[0.0, 1.0]', vr.x + 8, vr.y + vr.height - 8);
    ctx.fillText('[1.0, 1.0]', vr.x + vr.width - 64, vr.y + vr.height - 8);
    ctx.restore();
  }

  _renderBodyPose(ctx, landmarks, mode = 'body') {
    ctx.save();
    const diagnostic = mode === 'diagnostics';
    const bodyConnections = diagnostic
      ? POSE_CONNECTIONS.filter(([a, b]) => a >= 11 && b >= 11)
      : [
          [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
          [11, 23], [12, 24], [23, 24],
          [23, 25], [25, 27], [24, 26], [26, 28]
        ];
    ctx.strokeStyle = diagnostic ? 'rgba(104, 186, 255, 0.7)' : 'rgba(104, 186, 255, 0.58)';
    ctx.lineWidth = diagnostic ? 1.15 : 1.5;
    ctx.lineCap = 'round';

    for (const [aIdx, bIdx] of bodyConnections) {
      const a = landmarks[aIdx];
      const b = landmarks[bIdx];
      if (this._isVisibleLandmark(a) && this._isVisibleLandmark(b)) {
        const pa = this.project(a.x, a.y);
        const pb = this.project(b.x, b.y);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }

    const keypoints = diagnostic
      ? landmarks.map((_, index) => index).filter(index => index >= 11)
      : [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
    for (const i of keypoints) {
      const lm = landmarks[i];
      if (this._isVisibleLandmark(lm)) {
        const p = this.project(lm.x, lm.y);
        ctx.fillStyle = diagnostic ? 'rgba(205, 233, 255, 0.82)' : '#b5dcff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, diagnostic ? 1.8 : 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  _isVisibleLandmark(point) {
    return Boolean(
      point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      (point.visibility === undefined || point.visibility >= 0.45)
    );
  }

  _renderHand(ctx, landmarks, pose = {}) {
    ctx.save();
    ctx.globalAlpha = HAND_TRACKING_STYLE.opacity;
    ctx.strokeStyle = HAND_TRACKING_STYLE.stroke;
    ctx.lineWidth = HAND_TRACKING_STYLE.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const [aIdx, bIdx] of HAND_CONNECTIONS) {
      const a = landmarks[aIdx];
      const b = landmarks[bIdx];
      if (this._isVisibleLandmark(a) && this._isVisibleLandmark(b)) {
        const pa = this.project(a.x, a.y);
        const pb = this.project(b.x, b.y);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }

    for (const i of [0, 4, 8, 12, 16, 20]) {
      const lm = landmarks[i];
      if (!this._isVisibleLandmark(lm)) continue;
      const p = this.project(lm.x, lm.y);
      ctx.fillStyle = HAND_TRACKING_STYLE.joint;
      ctx.beginPath();
      ctx.arc(
        p.x,
        p.y,
        i === 0 ? HAND_TRACKING_STYLE.wristRadius : HAND_TRACKING_STYLE.jointRadius,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    if (pose.isPinchThumbIndex && this._isVisibleLandmark(landmarks[8])) {
      const p = this.project(landmarks[8].x, landmarks[8].y);
      ctx.strokeStyle = HAND_TRACKING_STYLE.pinchRing;
      ctx.lineWidth = HAND_TRACKING_STYLE.pinchRingWidth;
      ctx.beginPath();
      ctx.arc(p.x, p.y, HAND_TRACKING_STYLE.pinchRingRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  _renderDiagnosticFace(ctx, face) {
    ctx.save();
    const landmarks = face.landmarks || [];
    ctx.fillStyle = 'rgba(181, 220, 255, 0.48)';
    for (const landmark of landmarks) {
      if (!this._isVisibleLandmark(landmark)) continue;
      const point = this.project(landmark.x, landmark.y);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    if (landmarks.length) {
      const faceBox = face.boundingBox;
      const labelPoint = faceBox
        ? this.project(faceBox.minX, faceBox.minY)
        : this.project(landmarks[0].x, landmarks[0].y);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#d8ecfb';
      ctx.fillText(
        `DIAGNÓSTICO FACIAL · ${landmarks.length} puntos · yaw ${Math.round(face.rotation?.yaw || 0)}° · pitch ${Math.round(face.rotation?.pitch || 0)}°`,
        labelPoint.x,
        Math.max(this.videoRect.y + 14, labelPoint.y - 7)
      );
    }
    ctx.restore();
  }

  _renderObject(ctx, obj) {
    ctx.save();
    const bbox = obj.boundingBox;
    if (bbox) {
      const pMin = this.project(bbox.minX, bbox.minY);
      const pMax = this.project(bbox.maxX, bbox.maxY);

      const left = Math.min(pMin.x, pMax.x);
      const top = Math.min(pMin.y, pMax.y);
      const width = Math.abs(pMax.x - pMin.x);
      const height = Math.abs(pMax.y - pMin.y);

      // Box
      ctx.strokeStyle = '#ff6b35';
      ctx.lineWidth = 2;
      ctx.strokeRect(left, top, width, height);

      // Label Tag
      ctx.fillStyle = 'rgba(10, 15, 29, 0.85)';
      ctx.fillRect(left, top - 24, 120, 22);
      ctx.font = 'bold 11px "Space Grotesk", sans-serif';
      ctx.fillStyle = '#ff6b35';
      const label = obj.id.toUpperCase().replace('OBJECT-', 'OBJ #');
      ctx.fillText(`${label} (${obj.subType || 'unknown'})`, left + 6, top - 8);

      // Velocity Vector Arrow
      if (obj.velocity && obj.velocity.speed > 0.02) {
        const center = this.project(obj.position.x, obj.position.y);
        const vx = obj.velocity.vx * this.videoRect.width * 0.4;
        const vy = obj.velocity.vy * this.videoRect.height * 0.4;

        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(center.x + vx, center.y + vy);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _renderSensorHUD(ctx, vr, data) {
    ctx.save();
    const vidW = this.video.videoWidth || 1280;
    const vidH = this.video.videoHeight || 720;

    // Top Sensor Telemetry Pill
    const barW = Math.min(620, vr.width - 40);
    const barH = 32;
    const barX = vr.x + (vr.width - barW) / 2;
    const barY = vr.y + 12;

    ctx.fillStyle = 'rgba(7, 10, 19, 0.88)';
    ctx.strokeStyle = 'rgba(0, 245, 212, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#b5dcff';
    ctx.textAlign = 'left';
    ctx.fillText(`SENSOR: ${vidW}x${vidH} (16:9)`, barX + 14, barY + 20);

    ctx.fillStyle = '#d7e9f8';
    ctx.fillText(`COVERAGE: 100% UNCONSTRAINED`, barX + 210, barY + 20);

    const bodyActive = data.worldModel?.getEntity('body-primary')?.missingFrames === 0 ? 'ON' : 'OFF';
    const handsCount = data.hands?.length || 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`BODY: ${bodyActive} | HANDS: ${handsCount}`, barX + 440, barY + 20);

    ctx.restore();
  }

  /**
   * Renders the brutal, minimalist AIR GESTURE - PERCEPTION DEBUG HUD box
   */
  _renderPerceptionDebugBox(ctx, vr, data) {
    ctx.save();

    const boxW = 320;
    const boxH = 430;
    const boxX = vr.x + 20;
    const boxY = vr.y + 56;

    // Semi-transparent dark glass background
    ctx.fillStyle = 'rgba(7, 10, 19, 0.92)';
    ctx.strokeStyle = 'rgba(0, 245, 212, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 10);
    ctx.fill();
    ctx.stroke();

    // Header: AIR GESTURE — PERCEPTION DEBUG
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('AIR GESTURE — PERCEPTION DEBUG', boxX + 16, boxY + 24);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(boxX + 16, boxY + 34);
    ctx.lineTo(boxX + boxW - 16, boxY + 34);
    ctx.stroke();

    let curY = boxY + 54;
    const lineSpacing = 16;

    // CAMERA SECTION
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText('CAMERA', boxX + 16, curY);
    curY += lineSpacing;

    const vidW = this.video.videoWidth || 1280;
    const vidH = this.video.videoHeight || 720;
    const fps = data.stats?.fps || 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(`${vidW} × ${vidH}       FPS: ${fps}`, boxX + 16, curY);
    curY += lineSpacing * 1.5;

    // HAND SECTION
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText('HAND', boxX + 16, curY);
    curY += lineSpacing;

    const handsList = Array.isArray(data.hands)
      ? data.hands
      : (data.hands ? Object.values(data.hands).filter(Boolean) : []);
    let leftHand = null;
    let rightHand = null;
    for (const h of handsList) {
      if (!h) continue;
      if ((h.handedness || '').toLowerCase() === 'left') leftHand = h;
      else rightHand = h;
    }

    // Left Hand
    if (leftHand) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const conf = Math.round((leftHand.confidence || 0.9) * 100);
      const pos = leftHand.landmarks ? `(${leftHand.landmarks[0].x.toFixed(2)}, ${leftHand.landmarks[0].y.toFixed(2)})` : '';
      ctx.fillText(`Left:  DETECTED  conf: ${conf}% ${pos}`, boxX + 16, curY);
    } else {
      ctx.fillStyle = '#64748b';
      ctx.fillText('Left:  NOT DETECTED', boxX + 16, curY);
    }
    curY += lineSpacing;

    // Right Hand
    if (rightHand) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const conf = Math.round((rightHand.confidence || 0.9) * 100);
      const pos = rightHand.landmarks ? `(${rightHand.landmarks[0].x.toFixed(2)}, ${rightHand.landmarks[0].y.toFixed(2)})` : '';
      ctx.fillText(`Right: DETECTED  conf: ${conf}% ${pos}`, boxX + 16, curY);
    } else {
      ctx.fillStyle = '#64748b';
      ctx.fillText('Right: NOT DETECTED', boxX + 16, curY);
    }
    curY += lineSpacing * 1.5;

    // FACE SECTION
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText('FACE', boxX + 16, curY);
    curY += lineSpacing;

    const face = data.worldModel?.getEntity('face-primary') || data.face;
    if (face && face.missingFrames === 0) {
      ctx.fillStyle = '#b5dcff';
      const yaw = Math.round(face.rotation?.yaw || 0);
      const pitch = Math.round(face.rotation?.pitch || 0);
      ctx.fillText(`Face 001: DETECTED (pitch: ${pitch}°, yaw: ${yaw}°)`, boxX + 16, curY);
    } else {
      ctx.fillStyle = '#64748b';
      ctx.fillText('Face 001: NOT DETECTED', boxX + 16, curY);
    }
    curY += lineSpacing * 1.5;

    // BODY SECTION
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText('BODY', boxX + 16, curY);
    curY += lineSpacing;

    const body = data.worldModel?.getEntity('body-primary') || data.body;
    if (body && body.missingFrames === 0) {
      ctx.fillStyle = '#b5dcff';
      const pts = body.landmarks ? body.landmarks.length : 33;
      ctx.fillText(`Body 001: DETECTED (${pts} landmarks)`, boxX + 16, curY);
    } else {
      ctx.fillStyle = '#64748b';
      ctx.fillText('Body 001: NOT DETECTED', boxX + 16, curY);
    }
    curY += lineSpacing * 1.5;

    // OBJECT SECTION
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText('OBJECT', boxX + 16, curY);
    curY += lineSpacing;

    const objects = data.worldModel?.getEntitiesByType('object') || [];
    const activeObj = objects.find(o => o.missingFrames === 0);
    if (activeObj) {
      ctx.fillStyle = '#ff6b35';
      const conf = Math.round((activeObj.confidence || 0.8) * 100);
      ctx.fillText(`Object 001: DETECTED (conf: ${conf}%, ${activeObj.subType || 'prop'})`, boxX + 16, curY);
    } else {
      ctx.fillStyle = '#64748b';
      ctx.fillText('Object 001: NOT DETECTED', boxX + 16, curY);
    }
    curY += lineSpacing * 1.5;

    // WORLD MODEL SECTION
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText('WORLD MODEL', boxX + 16, curY);
    curY += lineSpacing;

    const totalEntities = data.worldModel?.getAllActiveEntities ? data.worldModel.getAllActiveEntities().length : 0;
    ctx.fillStyle = totalEntities > 0 ? 'rgba(255,255,255,0.85)' : '#ffffff';
    ctx.fillText(`Entities: ${totalEntities} active in 3D scene`, boxX + 16, curY);

    ctx.restore();
  }
}
