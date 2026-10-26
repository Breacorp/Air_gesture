/**
 * Projects tracked hand landmarks into the Three.js coordinate space for interactions.
 * FullSensorView is the single renderer for hand and body tracking skeletons.
 */

import * as THREE from 'three';

const visualizers = new WeakMap();

export class HandVisualizer3D {
  constructor(containerElement) {
    this.container = containerElement;
    const existing = visualizers.get(this.container);
    if (existing) return existing;
    this.scene = new THREE.Scene();

    // Setup camera
    this.camera = new THREE.PerspectiveCamera(
      55,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0, 3.2);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x78c8ff, 0.8);
    dirLight.position.set(5, 5, 5);
    this.scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0xd8ecfb, 0.45);
    backLight.position.set(-5, -5, 2);
    this.scene.add(backLight);

    // 3D Spatial Grid Floor
    this._setupSpatialGrid();

    // Tracked Physical Object Rigs (Fase 3)
    this.objectRigs = new Map();

    this._resizeHandler = () => this.onWindowResize();
    window.addEventListener('resize', this._resizeHandler);
    this._animationFrameId = null;
    this._disposed = false;
    visualizers.set(this.container, this);
    this._animate();
  }

  _setupSpatialGrid() {
    const grid = new THREE.GridHelper(6, 20, 0xffffff, 0x1f293d);
    grid.position.y = -1.6;
    grid.material.opacity = 0.25;
    grid.material.transparent = true;
    this.scene.add(grid);

    // Depth target plane reference (calibrated working plane Z = 0)
    const planeGeo = new THREE.PlaneGeometry(3.5, 2.2);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      wireframe: true,
      transparent: true,
      opacity: 0.12
    });
    const refPlane = new THREE.Mesh(planeGeo, planeMat);
    refPlane.position.z = 0;
    this.scene.add(refPlane);
  }

  projectHand(kinematicState) {
    if (!kinematicState?.points || kinematicState.points.length < 21) return;

    const worldPoints = kinematicState.points.map((point, index) => {
      const screenPoint = kinematicState.screenPoints?.[index];
      const u = screenPoint ? screenPoint.u : point.x * 0.5 + 0.5;
      const v = screenPoint ? screenPoint.v : -point.y * 0.5 + 0.5;
      return this.unprojectUV(u, v, THREE.MathUtils.clamp(point.z, -1.2, 1.2));
    });
    kinematicState.worldPoints = worldPoints;
    kinematicState.tipWorld = worldPoints[8].clone();
    kinematicState.pinchWorld = new THREE.Vector3()
      .addVectors(worldPoints[8], worldPoints[4])
      .multiplyScalar(0.5);
    kinematicState.palmWorld = new THREE.Vector3()
      .addVectors(worldPoints[0], worldPoints[5])
      .add(worldPoints[17])
      .divideScalar(3);
  }

  unprojectUV(u, v, z = 0) {
    const containerW = this.container.clientWidth || window.innerWidth;
    const containerH = this.container.clientHeight || window.innerHeight;
    const screenAspect = containerW / containerH;

    const camZ = this.camera.position.z;
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const tanHalfFov = Math.tan(fovRad / 2);

    const ndcX = (u - 0.5) * 2.0;
    const ndcY = -(v - 0.5) * 2.0;

    const clampedZ = Math.max(-1.5, Math.min(1.5, z));
    const distFromCam = Math.max(0.6, camZ - clampedZ);

    const halfHeightAtZ = distFromCam * tanHalfFov;
    const halfWidthAtZ = halfHeightAtZ * screenAspect;

    return new THREE.Vector3(
      ndcX * halfWidthAtZ,
      ndcY * halfHeightAtZ,
      clampedZ
    );
  }

  // --- FASE 3: PHYSICAL TRACKED OBJECT RIG ---

  _getOrCreateObjectRig(id, colorHexStr = '#ff6b35') {
    if (this.objectRigs.has(id)) {
      return this.objectRigs.get(id);
    }

    const group = new THREE.Group();
    group.visible = false;
    this.scene.add(group);

    const colorVal = parseInt(colorHexStr.replace('#', '0x'), 16) || 0xff6b35;

    // 1. Central Core: Glowing sphere
    const sphereGeo = new THREE.SphereGeometry(0.06, 20, 20);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: colorVal,
      emissive: colorVal,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.7,
      transparent: true,
      opacity: 0.85
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    group.add(sphere);

    // 2. Orbital target ring
    const ringGeo = new THREE.RingGeometry(0.09, 0.11, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colorVal,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    // 3. 3D Bounding Box Wireframe
    const boxGeo = new THREE.BoxGeometry(1, 1, 0.15);
    const boxEdges = new THREE.EdgesGeometry(boxGeo);
    const boxMat = new THREE.LineBasicMaterial({
      color: colorVal,
      transparent: true,
      opacity: 0.9
    });
    const boxMesh = new THREE.LineSegments(boxEdges, boxMat);
    group.add(boxMesh);

    // 4. Billboard Sprite Label for "OBJECT #001"
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 320;
    labelCanvas.height = 100;
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const spriteMat = new THREE.SpriteMaterial({ map: labelTexture, transparent: true });
    const labelSprite = new THREE.Sprite(spriteMat);
    labelSprite.scale.set(0.7, 0.22, 1.0);
    group.add(labelSprite);

    // 5. 3D Contour Silhouette Line
    const contourGeo = new THREE.BufferGeometry();
    const contourMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85
    });
    const contourMesh = new THREE.LineLoop(contourGeo, contourMat);
    contourMesh.visible = false;
    group.add(contourMesh);

    // 6. Trajectory Breadcrumbs Trail (• • • dots)
    const breadcrumbGroup = new THREE.Group();
    this.scene.add(breadcrumbGroup); // In world scene so it doesn't move with the object
    const breadcrumbDots = [];
    const dotGeo = new THREE.SphereGeometry(0.018, 12, 12);
    for (let i = 0; i < 16; i++) {
      const dotMat = new THREE.MeshBasicMaterial({
        color: colorVal,
        transparent: true,
        opacity: Math.max(0.15, 0.9 - i * 0.05)
      });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.visible = false;
      breadcrumbGroup.add(dot);
      breadcrumbDots.push(dot);
    }

    const rig = {
      group,
      sphere,
      ring,
      boxMesh,
      labelCanvas,
      labelTexture,
      labelSprite,
      contourMesh,
      contourGeo,
      breadcrumbGroup,
      breadcrumbDots,
      lastLabelText: ''
    };

    this.objectRigs.set(id, rig);
    return rig;
  }

  _drawObjectLabel(rig, id, status, confPct, occlusionPct, shapeLabel) {
    const textKey = `${id}-${status}-${confPct}-${occlusionPct}-${shapeLabel}`;
    if (rig.lastLabelText === textKey) return;
    rig.lastLabelText = textKey;

    const ctx = rig.labelCanvas.getContext('2d');
    const w = rig.labelCanvas.width;
    const h = rig.labelCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // High-tech translucent rounded background
    ctx.fillStyle = 'rgba(10, 15, 29, 0.85)';
    ctx.strokeStyle = status === 'OCCLUDED' ? 'rgba(255, 209, 102, 0.85)' : 'rgba(255, 107, 53, 0.9)';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 8);
    ctx.fill();
    ctx.stroke();

    // Top Header: OBJECT ID (e.g. OBJECT #001)
    const formattedId = id.toUpperCase().replace('OBJECT-', 'OBJECT #').replace('TRACK-OBJ-', 'OBJECT #');
    ctx.font = 'bold 26px "Space Grotesk", -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(formattedId, 16, 36);

    // Status Badge
    ctx.font = 'bold 16px "JetBrains Mono", monospace';
    if (status === 'OCCLUDED') {
      ctx.fillStyle = '#ffd166';
      ctx.fillText(`OCCLUDED (${occlusionPct}%)`, w - 170, 34);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(`ACTIVE ${confPct}%`, w - 140, 34);
    }

    // Subtitle: Shape & Kinematics
    ctx.font = '16px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`Shape: ${shapeLabel || 'detected'} • Traj: •••`, 16, 72);

    rig.labelTexture.needsUpdate = true;
  }

  updateObject(objectEntity) {
    if (!objectEntity || objectEntity.missingFrames > 0) return;

    const id = objectEntity.id;
    const colorHex = objectEntity.customProps?.colorHex || '#ff6b35';
    const rig = this._getOrCreateObjectRig(id, colorHex);

    rig.group.visible = true;

    // 1. Unproject normalized center position to 3D world space
    const pos = objectEntity.position;
    const wp = this.unprojectUV(pos.x, pos.y, pos.z || 0);
    rig.group.position.copy(wp);

    // 2. Orbital target ring rotation
    rig.ring.rotation.z += 0.03;
    rig.ring.lookAt(this.camera.position);

    // 3. Compute 3D Bounding Box size
    const bbox = objectEntity.boundingBox || { width: 0.15, height: 0.15 };
    const pMin = this.unprojectUV(pos.x - (bbox.width || 0.15) / 2, pos.y - (bbox.height || 0.15) / 2, pos.z || 0);
    const pMax = this.unprojectUV(pos.x + (bbox.width || 0.15) / 2, pos.y + (bbox.height || 0.15) / 2, pos.z || 0);
    const boxW = Math.max(0.12, Math.abs(pMax.x - pMin.x));
    const boxH = Math.max(0.12, Math.abs(pMax.y - pMin.y));
    const boxD = Math.max(0.08, (boxW + boxH) * 0.25);

    rig.boxMesh.scale.set(boxW, boxH, boxD);

    // 4. Update Billboard Label position & text
    rig.labelSprite.position.set(0, boxH / 2 + 0.18, 0);
    const status = objectEntity.customProps?.status || 'ACTIVE';
    const confPct = Math.round((objectEntity.confidence || 0.85) * 100);
    const occPct = objectEntity.customProps?.occlusionPct || 0;
    const shapeLabel = objectEntity.customProps?.shapeLabel || 'detected';
    this._drawObjectLabel(rig, id, status, confPct, occPct, shapeLabel);

    // 5. Update 3D Contour Outline if present
    const contour = objectEntity.contour || objectEntity.customProps?.contour;
    if (contour && contour.length > 2) {
      const pts3D = [];
      for (const pt of contour) {
        const cw = this.unprojectUV(pt.x, pt.y, pos.z || 0);
        // Relative to group position
        pts3D.push(cw.x - wp.x, cw.y - wp.y, cw.z - wp.z);
      }
      rig.contourGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts3D, 3));
      rig.contourMesh.visible = true;
    } else {
      rig.contourMesh.visible = false;
    }

    // 6. Update 3D Trajectory Breadcrumbs Trail (• • •)
    const trajectory = objectEntity.customProps?.trajectory || [];
    if (trajectory.length > 0) {
      rig.breadcrumbGroup.visible = true;
      for (let i = 0; i < rig.breadcrumbDots.length; i++) {
        const dot = rig.breadcrumbDots[i];
        const trajIdx = trajectory.length - 1 - i;
        if (trajIdx >= 0) {
          const tPoint = trajectory[trajIdx];
          const dotWp = this.unprojectUV(tPoint.x, tPoint.y, tPoint.z || 0);
          dot.position.copy(dotWp);
          dot.visible = true;
        } else {
          dot.visible = false;
        }
      }
    } else {
      rig.breadcrumbGroup.visible = false;
    }
  }

  hideObject(id) {
    if (this.objectRigs.has(id)) {
      this.objectRigs.get(id).group.visible = false;
    }
  }

  /**
   * Updates full spatial scene from SpatialWorldModel
   */
  updateFromWorldModel(worldModel) {
    if (!worldModel) return;

    // Objects
    const objects = worldModel.getEntitiesByType('object');
    const activeObjIds = new Set();
    for (const obj of objects) {
      this.updateObject(obj);
      activeObjIds.add(obj.id);
    }

    // Hide any object rig not present in this frame
    for (const [id, rig] of this.objectRigs.entries()) {
      if (!activeObjIds.has(id)) {
        rig.group.visible = false;
      }
    }
  }

  onWindowResize() {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  _animate() {
    if (this._disposed) return;
    this._animationFrameId = requestAnimationFrame(() => this._animate());
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this._disposed = true;
    if (this._animationFrameId !== null) cancelAnimationFrame(this._animationFrameId);
    window.removeEventListener('resize', this._resizeHandler);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    if (visualizers.get(this.container) === this) visualizers.delete(this.container);
  }
}
