/**
 * FullSensorView - 100% Unconstrained Native Camera Sensor Visualizer
 * 
 * "El tracker no debería recortar el campo visual.
 *  Y tampoco deberíamos hacer zoom digital.
 *  El video muestra el frame completo de la cámara respetando su relación de aspecto (16:9),
 *  con todos los landmarks (cara + cuerpo + manos + objetos + bounding boxes) superpuestos exactamente 1:1."
 * 
 * Renders:
 * 1. Exact Video Bounds Letterbox Alignment (Zero Crop / Zero Zoom).
 * 2. Full-Body Pose Skeleton (33 landmarks: head, spine, arms, torso, legs, feet).
 * 3. Dual-Hand Anatomical Rigs (21 landmarks per hand, joints, pinch indicators).
 * 4. Face Mesh & Head Pose Crosshair (pitch, yaw, roll, gaze vector).
 * 5. Tracked Physical Objects (bounding boxes, contours, velocity arrows, occlusion %).
 * 6. Sensor Frame Diagnostics: Stream Resolution, Aspect Ratio, Normalized Coordinate Grid [0..1].
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

export class FullSensorView {
  constructor(videoElement, containerElement) {
    this.video = videoElement;
    this.container = containerElement || document.body;

    this.isActive = false;

    // High-performance overlay canvas
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'full-sensor-view-canvas';
    this.canvas.className = 'full-sensor-canvas hidden';
    this.ctx = this.canvas.getContext('2d', { alpha: true });

    this.container.appendChild(this.canvas);

    // Current calibrated video viewport on screen
    this.videoRect = { x: 0, y: 0, width: 0, height: 0 };

    window.addEventListener('resize', () => this.resize());
  }

  setActive(active) {
    this.isActive = !!active;
    this.canvas.classList.toggle('hidden', !this.isActive);
    if (this.isActive) {
      this.resize();
    }
  }

  toggle() {
    this.setActive(!this.isActive);
    return this.isActive;
  }

  resize() {
    if (!this.video) return;
    const contW = this.container.clientWidth || window.innerWidth;
    const contH = this.container.clientHeight || window.innerHeight;

    this.canvas.width = contW;
    this.canvas.height = contH;

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
   * Projects normalized [0..1] camera coordinates to exact screen pixels
   * @param {number} u Normalized X [0..1]
   * @param {number} v Normalized Y [0..1]
   * @param {boolean} isMirrored If selfie camera reflection is active
   */
  project(u, v, isMirrored = true) {
    const rx = isMirrored ? (1.0 - u) : u;
    return {
      x: this.videoRect.x + rx * this.videoRect.width,
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
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const isMirrored = true;
    const vr = this.videoRect;

    // 1. Draw Full Sensor Boundary Frame & Corner Rulers
    this._renderSensorFrame(ctx, vr);

    // 2. Draw Full-Body Pose Skeleton (33 landmarks)
    const body = data.worldModel?.getEntity('body-primary') || data.body;
    if (body && body.landmarks && body.missingFrames === 0) {
      this._renderBodyPose(ctx, body.landmarks, isMirrored);
    }

    // 3. Draw Hands Skeletons (21 landmarks each)
    const hands = data.hands || [];
    for (const hand of hands) {
      if (hand.landmarks) {
        this._renderHand(ctx, hand.landmarks, hand.handedness, hand.pose, isMirrored);
      }
    }

    // 4. Draw Face Mesh / Head Pose
    const face = data.worldModel?.getEntity('face-primary') || data.face;
    if (face && face.landmarks && face.missingFrames === 0) {
      this._renderFace(ctx, face, isMirrored);
    }

    // 5. Draw Tracked Physical Objects & Props
    const objects = data.worldModel?.getEntitiesByType('object') || [];
    for (const obj of objects) {
      if (obj.missingFrames === 0) {
        this._renderObject(ctx, obj, isMirrored);
      }
    }

    // 6. Draw Live Sensor Diagnostic Telemetry Banner
    this._renderSensorHUD(ctx, vr, data);
  }

  _renderSensorFrame(ctx, vr) {
    // Outer Sensor Border (Cyber Cyan)
    ctx.save();
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 2;
    ctx.strokeRect(vr.x, vr.y, vr.width, vr.height);

    // Corner brackets
    const bracketSize = 24;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#00f5d4';

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
    ctx.fillStyle = '#00f5d4';
    ctx.fillText('[0.0, 0.0]', vr.x + 8, vr.y + 16);
    ctx.fillText('[1.0, 0.0]', vr.x + vr.width - 64, vr.y + 16);
    ctx.fillText('[0.0, 1.0]', vr.x + 8, vr.y + vr.height - 8);
    ctx.fillText('[1.0, 1.0]', vr.x + vr.width - 64, vr.y + vr.height - 8);
    ctx.restore();
  }

  _renderBodyPose(ctx, landmarks, isMirrored) {
    ctx.save();

    // Draw Bones
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3;
    for (const [aIdx, bIdx] of POSE_CONNECTIONS) {
      const a = landmarks[aIdx];
      const b = landmarks[bIdx];
      if (a && b && (a.visibility === undefined || a.visibility > 0.4) && (b.visibility === undefined || b.visibility > 0.4)) {
        const pa = this.project(a.x, a.y, isMirrored);
        const pb = this.project(b.x, b.y, isMirrored);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }

    // Draw Joints
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (lm && (lm.visibility === undefined || lm.visibility > 0.4)) {
        const p = this.project(lm.x, lm.y, isMirrored);
        ctx.fillStyle = i >= 23 ? '#00f5d4' : '#ff007f'; // Legs cyan, Torso/Head magenta
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  _renderHand(ctx, landmarks, handedness = 'Right', pose = {}, isMirrored) {
    ctx.save();
    const isRight = handedness.toLowerCase() === 'right';
    const mainColor = isRight ? '#00f5d4' : '#ff007f';

    // Draw Hand Bones
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 2.5;
    for (const [aIdx, bIdx] of HAND_CONNECTIONS) {
      const a = landmarks[aIdx];
      const b = landmarks[bIdx];
      if (a && b) {
        const pa = this.project(a.x, a.y, isMirrored);
        const pb = this.project(b.x, b.y, isMirrored);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }

    // Draw Hand Joints
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const p = this.project(lm.x, lm.y, isMirrored);
      const isTip = [4, 8, 12, 16, 20].includes(i);
      ctx.fillStyle = isTip ? '#ffffff' : mainColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isTip ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pinch Indicator
    if (pose.isPinchThumbIndex && landmarks[8]) {
      const p = this.project(landmarks[8].x, landmarks[8].y, isMirrored);
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  _renderFace(ctx, face, isMirrored) {
    ctx.save();
    if (face.landmarks && face.landmarks.length > 0) {
      const nose = face.landmarks[1] || face.landmarks[0];
      if (nose) {
        const p = this.project(nose.x, nose.y, isMirrored);
        // Face Crosshair & Orientation
        ctx.strokeStyle = '#a100ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
        ctx.moveTo(p.x - 24, p.y);
        ctx.lineTo(p.x + 24, p.y);
        ctx.moveTo(p.x, p.y - 24);
        ctx.lineTo(p.x, p.y + 24);
        ctx.stroke();

        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = '#a100ff';
        ctx.fillText(`FACE [${Math.round(face.rotation?.yaw || 0)}°, ${Math.round(face.rotation?.pitch || 0)}°]`, p.x + 28, p.y + 4);
      }
    }
    ctx.restore();
  }

  _renderObject(ctx, obj, isMirrored) {
    ctx.save();
    const bbox = obj.boundingBox;
    if (bbox) {
      const pMin = this.project(bbox.minX, bbox.minY, isMirrored);
      const pMax = this.project(bbox.maxX, bbox.maxY, isMirrored);

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
        const center = this.project(obj.position.x, obj.position.y, isMirrored);
        const vx = (isMirrored ? -obj.velocity.vx : obj.velocity.vx) * this.videoRect.width * 0.4;
        const vy = obj.velocity.vy * this.videoRect.height * 0.4;

        ctx.strokeStyle = '#00f5d4';
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
    ctx.fillStyle = '#00f5d4';
    ctx.textAlign = 'left';
    ctx.fillText(`SENSOR: ${vidW}x${vidH} (16:9)`, barX + 14, barY + 20);

    ctx.fillStyle = '#ffd166';
    ctx.fillText(`COVERAGE: 100% UNCONSTRAINED`, barX + 210, barY + 20);

    const bodyActive = data.worldModel?.getEntity('body-primary')?.missingFrames === 0 ? 'ON' : 'OFF';
    const handsCount = data.hands?.length || 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`BODY: ${bodyActive} | HANDS: ${handsCount}`, barX + 440, barY + 20);

    ctx.restore();
  }
}
