/**
 * ModernOS Telemetry HUD
 * Renders real-time biometric metrics, joint angles, finger flexion gauges,
 * calibrated depth sliders, kinematic vectors, and emergent pose signatures.
 */

export class TelemetryHUD {
  constructor(domElements) {
    this.elements = domElements;
    this.isJsonPaused = false;
    this.lastJsonUpdate = 0;
    this.cachedStates = { Left: null, Right: null };
  }

  updateStats(stats) {
    if (this.elements.fpsCounter) {
      this.elements.fpsCounter.textContent = `${stats.fps} FPS`;
    }
    if (this.elements.inferenceTime) {
      this.elements.inferenceTime.textContent = `${stats.frameTimeMs} ms`;
    }
    if (this.elements.handsBadge) {
      this.elements.handsBadge.textContent = `${stats.detectedHandsCount} ${stats.detectedHandsCount === 1 ? 'Mano' : 'Manos'}`;
      this.elements.handsBadge.className = stats.detectedHandsCount > 0 ? 'badge badge-active' : 'badge badge-idle';
    }
  }

  updateHandTelemetry(state) {
    if (!state) return;
    const hand = state.handedness || 'Right';
    this.cachedStates[hand] = state;

    const prefix = hand.toLowerCase();
    const card = document.getElementById(`hand-card-${prefix}`);
    if (!card) return;

    card.classList.remove('hand-idle');
    card.classList.add('hand-active');

    // 1. Confidence & Calibrated Depth (Relative Camera Depth)
    const confEl = document.getElementById(`${prefix}-confidence`);
    if (confEl) confEl.textContent = `${Math.round(state.confidence * 100)}%`;

    const depthRelEl = document.getElementById(`${prefix}-depth-rel`);
    const relVal = state.scale.relativeDepth !== undefined ? state.scale.relativeDepth : state.scale.calibratedZ;
    if (depthRelEl) depthRelEl.textContent = `${relVal >= 0 ? '+' : ''}${relVal.toFixed(2)}`;

    const depthCmEl = document.getElementById(`${prefix}-depth-cm`);
    if (depthCmEl) {
      const hint = Math.abs(relVal) < 0.1 ? 'Neutro' : (relVal < 0 ? 'Fondo ↘' : 'Cerca ↗');
      depthCmEl.textContent = `Z: ${relVal >= 0 ? '+' : ''}${relVal.toFixed(2)} (${hint})`;
    }

    const depthBarEl = document.getElementById(`${prefix}-depth-bar`);
    if (depthBarEl) {
      // Map [-0.8, +0.8] -> [0, 100%]
      const pct = Math.max(0, Math.min(100, ((relVal + 0.8) / 1.6) * 100));
      depthBarEl.style.width = `${pct}%`;
    }

    // 2. Palm Orientation & Normal
    const rollEl = document.getElementById(`${prefix}-roll`);
    if (rollEl) rollEl.textContent = `${Math.round(state.palm.orientation.roll)}°`;

    const pitchEl = document.getElementById(`${prefix}-pitch`);
    if (pitchEl) pitchEl.textContent = `${Math.round(state.palm.orientation.pitch)}°`;

    const yawEl = document.getElementById(`${prefix}-yaw`);
    if (yawEl) yawEl.textContent = `${Math.round(state.palm.orientation.yaw)}°`;

    const facingEl = document.getElementById(`${prefix}-facing`);
    if (facingEl) {
      facingEl.textContent = state.palm.isFacingCamera ? 'Hacia Cámara' : 'Dorso / Lateral';
      facingEl.className = state.palm.isFacingCamera ? 'text-accent' : 'text-muted';
    }

    // 3. Fingers Flexion Bars & Angles
    const fingerNames = ['thumb', 'index', 'middle', 'ring', 'pinky'];
    for (const fName of fingerNames) {
      const finger = state.fingers[fName];
      if (!finger) continue;

      const bar = document.getElementById(`${prefix}-bar-${fName}`);
      const pctEl = document.getElementById(`${prefix}-pct-${fName}`);
      const angleEl = document.getElementById(`${prefix}-angle-${fName}`);

      const flexPct = Math.round(finger.flexion * 100);
      if (bar) bar.style.width = `${flexPct}%`;
      if (pctEl) pctEl.textContent = `${flexPct}%`;
      if (angleEl) angleEl.textContent = `${Math.round(finger.angles.pip)}°`;
    }

    // 4. Kinematics (Speed & Velocity)
    const speedEl = document.getElementById(`${prefix}-speed`);
    if (speedEl) speedEl.textContent = `${state.wrist.speed.toFixed(2)} u/s`;

    // 5. Emergent Poses (Badges)
    this._updateBadge(`${prefix}-badge-palm`, state.pose.isOpenPalm);
    this._updateBadge(`${prefix}-badge-pinch`, state.pose.isPinchThumbIndex);
    this._updateBadge(`${prefix}-badge-point`, state.pose.isPointing);
    this._updateBadge(`${prefix}-badge-fist`, state.pose.isFist);
    this._updateBadge(`${prefix}-badge-peace`, state.pose.isPeace);

    // Pinch Strength Gauge
    const pinchBar = document.getElementById(`${prefix}-pinch-strength-bar`);
    if (pinchBar) {
      pinchBar.style.width = `${Math.round(state.pose.pinchStrengthThumbIndex * 100)}%`;
    }

    // 6. JSON Live Stream View (throttle to ~5 fps for UI smoothness)
    const now = performance.now();
    if (!this.isJsonPaused && now - this.lastJsonUpdate > 200) {
      this.lastJsonUpdate = now;
      this._updateJsonTerminal();
    }
  }

  setHandIdle(handedness) {
    const prefix = (handedness || 'right').toLowerCase();
    const card = document.getElementById(`hand-card-${prefix}`);
    if (card) {
      card.classList.remove('hand-active');
      card.classList.add('hand-idle');
    }
    this.cachedStates[handedness] = null;
  }

  _updateBadge(elementId, isActive) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (isActive) {
      el.classList.add('badge-pose-active');
    } else {
      el.classList.remove('badge-pose-active');
    }
  }

  _updateJsonTerminal() {
    const terminalEl = document.getElementById('json-stream-code');
    if (!terminalEl) return;

    const exportState = {
      timestamp: Math.round(performance.now()),
      hands: {}
    };

    if (this.cachedStates.Right) {
      const r = this.cachedStates.Right;
      exportState.hands.Right = {
        wrist: {
          pos: { x: +r.wrist.position.x.toFixed(3), y: +r.wrist.position.y.toFixed(3), z: +r.wrist.position.z.toFixed(3) },
          speed: +r.wrist.speed.toFixed(3)
        },
        palm: {
          normal: { x: +r.palm.normal.x.toFixed(3), y: +r.palm.normal.y.toFixed(3), z: +r.palm.normal.z.toFixed(3) },
          orientation: { roll: Math.round(r.palm.orientation.roll), pitch: Math.round(r.palm.orientation.pitch), yaw: Math.round(r.palm.orientation.yaw) }
        },
        scale: { depthCm: Math.round(r.scale.depthCm), calibratedZ: +r.scale.calibratedZ.toFixed(3) },
        pose: {
          openness: +r.pose.openness.toFixed(2),
          isPinch: r.pose.isPinchThumbIndex,
          isPointing: r.pose.isPointing,
          isFist: r.pose.isFist,
          isPalmFacing: r.palm.isFacingCamera
        }
      };
    }

    if (this.cachedStates.Left) {
      const l = this.cachedStates.Left;
      exportState.hands.Left = {
        wrist: {
          pos: { x: +l.wrist.position.x.toFixed(3), y: +l.wrist.position.y.toFixed(3), z: +l.wrist.position.z.toFixed(3) },
          speed: +l.wrist.speed.toFixed(3)
        },
        palm: {
          normal: { x: +l.palm.normal.x.toFixed(3), y: +l.palm.normal.y.toFixed(3), z: +l.palm.normal.z.toFixed(3) },
          orientation: { roll: Math.round(l.palm.orientation.roll), pitch: Math.round(l.palm.orientation.pitch), yaw: Math.round(l.palm.orientation.yaw) }
        },
        scale: { depthCm: Math.round(l.scale.depthCm), calibratedZ: +l.scale.calibratedZ.toFixed(3) },
        pose: {
          openness: +l.pose.openness.toFixed(2),
          isPinch: l.pose.isPinchThumbIndex,
          isPointing: l.pose.isPointing,
          isFist: l.pose.isFist,
          isPalmFacing: l.palm.isFacingCamera
        }
      };
    }

    terminalEl.textContent = JSON.stringify(exportState, null, 2);
  }

  updateStabilizationDiagnostics(diag) {
    if (!diag) return;

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('diag-raw-x', diag.raw.x.toFixed(4));
    setTxt('diag-raw-y', diag.raw.y.toFixed(4));

    setTxt('diag-filt-x', diag.filtered.x.toFixed(4));
    setTxt('diag-filt-y', diag.filtered.y.toFixed(4));

    if (diag.cursor) {
      setTxt('diag-cursor-x', `${diag.cursor.x}px`);
      setTxt('diag-cursor-y', `${diag.cursor.y}px`);
    }

    if (diag.velocity) {
      setTxt('diag-vel-x', diag.velocity.vx.toFixed(1));
      setTxt('diag-vel-y', diag.velocity.vy.toFixed(1));
      setTxt('diag-speed', `${Math.round(diag.velocity.speed)} px/s`);
    }

    if (diag.jitter) {
      setTxt('diag-jitter-raw', diag.jitter.raw.toFixed(5));
      setTxt('diag-jitter-filt', diag.jitter.filtered.toFixed(5));
      setTxt('diag-jitter-pct', `-${diag.jitter.reductionPct}%`);
    }

    if (diag.isCalibrating) {
      setTxt('diag-calib-status', 'Calibrando centro neutral...');
    } else if (diag.neutral) {
      setTxt('diag-calib-status', `Neutral: (${diag.neutral.x.toFixed(3)}, ${diag.neutral.y.toFixed(3)})`);
    }

    if (diag.quality) {
      setTxt('diag-quality-score', `${diag.quality.total}%`);
      setTxt('diag-quality-rating', diag.quality.rating);
      const bar = document.getElementById('diag-quality-bar');
      if (bar) bar.style.width = `${diag.quality.total}%`;
    }
  }

  /**
   * Updates Live Spatial World Model Telemetry
   * @param {SpatialWorldModel} worldModel
   */
  updateWorldModelTelemetry(worldModel) {
    if (!worldModel) return;

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    const activeEntities = worldModel.getAllActiveEntities();
    setTxt('world-entities-count', `${activeEntities.length} ${activeEntities.length === 1 ? 'ENTIDAD' : 'ENTIDADES'}`);

    // 1. Hand Left
    const handLeft = worldModel.getEntity('hand-left');
    const leftActive = handLeft && handLeft.missingFrames === 0;
    const statusLeft = document.getElementById('entity-status-hand-left');
    if (statusLeft) {
      statusLeft.textContent = leftActive ? 'ACTIVO' : 'INACTIVO';
      statusLeft.style.color = leftActive ? 'var(--accent-magenta)' : 'var(--text-muted)';
    }
    if (leftActive) {
      setTxt('entity-pos-hand-left', `${handLeft.position.x.toFixed(2)}, ${handLeft.position.y.toFixed(2)}, ${handLeft.position.z.toFixed(2)}`);
      setTxt('entity-vel-hand-left', `${handLeft.velocity.speed.toFixed(2)} u/s`);
      setTxt('entity-acc-hand-left', `${Math.hypot(handLeft.acceleration.ax, handLeft.acceleration.ay).toFixed(1)} u/s²`);
      setTxt('entity-meta-hand-left', `${Math.round(handLeft.confidence * 100)}% / ${handLeft.lifetimeFrames}f`);
    } else {
      setTxt('entity-pos-hand-left', '--');
      setTxt('entity-vel-hand-left', '--');
      setTxt('entity-acc-hand-left', '--');
      setTxt('entity-meta-hand-left', '--');
    }

    // 2. Hand Right
    const handRight = worldModel.getEntity('hand-right');
    const rightActive = handRight && handRight.missingFrames === 0;
    const statusRight = document.getElementById('entity-status-hand-right');
    if (statusRight) {
      statusRight.textContent = rightActive ? 'ACTIVO' : 'INACTIVO';
      statusRight.style.color = rightActive ? 'var(--accent-cyan)' : 'var(--text-muted)';
    }
    if (rightActive) {
      setTxt('entity-pos-hand-right', `${handRight.position.x.toFixed(2)}, ${handRight.position.y.toFixed(2)}, ${handRight.position.z.toFixed(2)}`);
      setTxt('entity-vel-hand-right', `${handRight.velocity.speed.toFixed(2)} u/s`);
      setTxt('entity-acc-hand-right', `${Math.hypot(handRight.acceleration.ax, handRight.acceleration.ay).toFixed(1)} u/s²`);
      setTxt('entity-meta-hand-right', `${Math.round(handRight.confidence * 100)}% / ${handRight.lifetimeFrames}f`);
    } else {
      setTxt('entity-pos-hand-right', '--');
      setTxt('entity-vel-hand-right', '--');
      setTxt('entity-acc-hand-right', '--');
      setTxt('entity-meta-hand-right', '--');
    }

    // 3. Body Pose
    const body = worldModel.getEntity('body-primary');
    const bodyActive = body && body.missingFrames === 0;
    const statusBody = document.getElementById('entity-status-body');
    if (statusBody) {
      statusBody.textContent = bodyActive ? 'ACTIVO' : 'DISABLED';
      statusBody.style.color = bodyActive ? 'var(--accent-yellow)' : 'var(--text-muted)';
    }
    if (bodyActive) {
      setTxt('entity-pos-body', `${body.position.x.toFixed(2)}, ${body.position.y.toFixed(2)}, ${body.position.z.toFixed(2)}`);
      setTxt('entity-vel-body', `${body.velocity.speed.toFixed(2)} u/s`);
      setTxt('entity-scale-body', `${(body.scale.x * 100).toFixed(0)}% span`);
      setTxt('entity-meta-body', `33 pts (${Math.round(body.confidence * 100)}%)`);
    } else {
      setTxt('entity-pos-body', '--');
      setTxt('entity-vel-body', '--');
      setTxt('entity-scale-body', '--');
      setTxt('entity-meta-body', '33 pts');
    }

    // 4. Object Perception & Temporal Tracking Engine
    const objects = worldModel.getEntitiesByType('object');
    const objActive = objects.length > 0 && objects[0].missingFrames === 0;
    const statusObj = document.getElementById('entity-status-object');
    const countBadge = document.getElementById('obj-perception-count');

    if (countBadge) {
      countBadge.textContent = `Objects: ${objects.length}`;
      countBadge.style.color = objects.length > 0 ? '#00f5d4' : '#ff9e79';
    }

    if (statusObj) {
      if (objActive) {
        const trackStatus = objects[0].customProps?.status || 'ACTIVE';
        statusObj.textContent = trackStatus;
        statusObj.style.color = trackStatus === 'OCCLUDED' ? 'var(--accent-yellow)' : 'var(--accent-cyan)';
      } else {
        statusObj.textContent = objects.length > 0 ? 'COASTING' : 'SEARCHING';
        statusObj.style.color = 'var(--text-muted)';
      }
    }

    if (objects.length > 0) {
      const obj = objects[0];
      const trackStatus = obj.customProps?.status || (obj.missingFrames === 0 ? 'ACTIVE' : 'COASTING');
      const formattedId = obj.id.toUpperCase().replace('OBJECT-', 'OBJECT #').replace('TRACK-OBJ-', 'OBJECT #');

      setTxt('obj-perception-id', formattedId);
      const trackBadge = document.getElementById('obj-perception-track-badge');
      if (trackBadge) {
        trackBadge.textContent = `Tracking: ${trackStatus}`;
        trackBadge.style.color = trackStatus === 'OCCLUDED' ? '#ffd166' : (trackStatus === 'ACTIVE' ? '#00f5d4' : '#94a3b8');
        trackBadge.style.borderColor = trackStatus === 'OCCLUDED' ? '#ffd16666' : '#00f5d466';
      }

      setTxt('obj-confidence', `${Math.round((obj.confidence || 0.85) * 100)}%`);
      const occPct = obj.customProps?.occlusionPct || 0;
      const visPct = obj.customProps?.visiblePct !== undefined ? obj.customProps.visiblePct : (100 - occPct);
      setTxt('obj-occlusion', `${occPct}% (Vis ${visPct}%)`);
      setTxt('obj-depth-status', `estimated`);

      setTxt('entity-pos-object', `${obj.position.x.toFixed(2)}, ${obj.position.y.toFixed(2)}, ${obj.position.z.toFixed(2)}`);
      setTxt('entity-vel-object', `${obj.velocity.speed.toFixed(2)} u/s`);
      setTxt('obj-rotation', `${Math.round(obj.rotation?.pitch || 0)}°, ${Math.round(obj.rotation?.roll || 0)}°`);

      const shapeLabel = obj.customProps?.shapeLabel || (obj.subType !== 'unknown' ? obj.subType : 'detected');
      setTxt('obj-shape', shapeLabel);
      setTxt('obj-silhouette', 'detected');
      setTxt('obj-reconstruction', obj.customProps?.reconstructionStatus || 'pending');
    } else {
      setTxt('obj-perception-id', 'OBJECT --');
      setTxt('obj-perception-track-badge', 'Tracking: IDLE');
      setTxt('obj-confidence', '--');
      setTxt('obj-occlusion', '--');
      setTxt('obj-depth-status', 'estimated');
      setTxt('entity-pos-object', '--');
      setTxt('entity-vel-object', '--');
      setTxt('obj-rotation', '--');
      setTxt('obj-shape', '--');
      setTxt('obj-silhouette', '--');
      setTxt('obj-reconstruction', 'pending');
    }

    // 5. Multimodal Spatial Relationships Chip
    const relationsChip = document.getElementById('world-relations-chip');
    if (relationsChip) {
      const summaries = worldModel.getRelationsSummary ? worldModel.getRelationsSummary() : [];
      if (summaries && summaries.length > 0) {
        relationsChip.innerHTML = summaries.map(rel => {
          let badgeColor = '#00f5d4';
          if (rel.includes('SOSTIENE') || rel.includes('LANZADO')) badgeColor = '#ffd166';
          if (rel.includes('CRUZADOS') || rel.includes('ELEVADOS')) badgeColor = '#a100ff';
          return `<span style="background:${badgeColor}22; border:1px solid ${badgeColor}66; color:${badgeColor}; border-radius:4px; padding:1px 6px; font-weight:600;">${rel}</span>`;
        }).join('');
      } else {
        relationsChip.innerHTML = `<span class="text-muted text-xs">Sin relaciones activas</span>`;
      }
    }
  }
}
