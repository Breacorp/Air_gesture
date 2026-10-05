/**
 * 3D Hand Skeletal Visualizer in Three.js
 * Renders anatomical dual-hand rigs, joint nodes, glowing bone segments,
 * palm normal orientation vectors, and 3D spatial depth cues.
 */

import * as THREE from 'three';

// MediaPipe anatomical bone connections
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
  // Palm base cross
  [5, 9], [9, 13], [13, 17]
];

export class HandVisualizer3D {
  constructor(containerElement) {
    this.container = containerElement;
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

    const dirLight = new THREE.DirectionalLight(0x00f5d4, 1.5);
    dirLight.position.set(5, 5, 5);
    this.scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0x7928ca, 1.2);
    backLight.position.set(-5, -5, 2);
    this.scene.add(backLight);

    // 3D Spatial Grid Floor
    this._setupSpatialGrid();

    // Hand Rigs for Left and Right
    this.handRigs = {
      Left: this._createHandRig(0xff007f, 0xa100ff), // Neon Magenta/Violet
      Right: this._createHandRig(0x00f5d4, 0x00bbf9) // Cyber Teal/Cyan
    };

    // Body Pose Rig (Fase 2)
    this.bodyRig = this._createBodyRig();

    // Tracked Physical Object Rigs (Fase 3)
    this.objectRigs = new Map();

    window.addEventListener('resize', () => this.onWindowResize());
    this._animate();
  }

  _setupSpatialGrid() {
    const grid = new THREE.GridHelper(6, 20, 0x00f5d4, 0x1f293d);
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

  _createHandRig(primaryColorHex, secondaryColorHex) {
    const group = new THREE.Group();
    group.visible = false;
    this.scene.add(group);

    // 21 Joint Spheres
    const jointMeshes = [];
    const jointGeo = new THREE.SphereGeometry(0.035, 16, 16);
    const tipGeo = new THREE.SphereGeometry(0.048, 20, 20);

    const standardMat = new THREE.MeshStandardMaterial({
      color: primaryColorHex,
      emissive: primaryColorHex,
      emissiveIntensity: 0.5,
      roughness: 0.2,
      metalness: 0.8
    });

    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: secondaryColorHex,
      emissiveIntensity: 0.9,
      roughness: 0.1,
      metalness: 0.9
    });

    for (let i = 0; i < 21; i++) {
      const isTip = [4, 8, 12, 16, 20].includes(i);
      const mesh = new THREE.Mesh(isTip ? tipGeo : jointGeo, isTip ? tipMat.clone() : standardMat);
      mesh.castShadow = true;
      group.add(mesh);
      jointMeshes.push(mesh);
    }

    // Bone Cylinders / Lines
    const boneMeshes = [];
    const boneMaterial = new THREE.MeshStandardMaterial({
      color: secondaryColorHex,
      emissive: secondaryColorHex,
      emissiveIntensity: 0.35,
      roughness: 0.4,
      metalness: 0.6,
      transparent: true,
      opacity: 0.85
    });

    const boneCylinderGeo = new THREE.CylinderGeometry(0.015, 0.015, 1, 8);
    boneCylinderGeo.translate(0, 0.5, 0);
    boneCylinderGeo.rotateX(Math.PI / 2);

    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      const mesh = new THREE.Mesh(boneCylinderGeo, boneMaterial.clone());
      group.add(mesh);
      boneMeshes.push(mesh);
    }

    // Palm Normal Vector Arrow
    const dir = new THREE.Vector3(0, 0, 1);
    const origin = new THREE.Vector3(0, 0, 0);
    const arrowHelper = new THREE.ArrowHelper(dir, origin, 0.45, primaryColorHex, 0.12, 0.08);
    group.add(arrowHelper);

    // Pinch Halo / Visual Haptic ring on index tip
    const ringGeo = new THREE.RingGeometry(0.06, 0.08, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfff000,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0
    });
    const pinchHalo = new THREE.Mesh(ringGeo, ringMat);
    group.add(pinchHalo);

    return {
      group,
      joints: jointMeshes,
      bones: boneMeshes,
      arrowHelper,
      pinchHalo,
      primaryColorHex,
      secondaryColorHex
    };
  }

  /**
   * Update 3D hand visual from Kinematic Hand State
   */
  updateHand(kinematicState) {
    if (!kinematicState) return;

    const handedness = kinematicState.handedness || 'Right';
    const rig = this.handRigs[handedness];
    if (!rig) return;

    rig.group.visible = true;
    const points = kinematicState.points;
    if (!points || points.length < 21) return;

    // Viewport and Perspective Camera geometry parameters
    const containerW = this.container.clientWidth || window.innerWidth;
    const containerH = this.container.clientHeight || window.innerHeight;
    const screenAspect = containerW / containerH;

    const camZ = this.camera.position.z; // 3.2
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const tanHalfFov = Math.tan(fovRad / 2);

    const worldPoints = [];

    // Map each landmark with exact 1-to-1 projection matching the real physical hand on screen
    for (let i = 0; i < 21; i++) {
      const pt = points[i];
      const sp = kinematicState.screenPoints ? kinematicState.screenPoints[i] : null;

      const u = sp ? sp.u : (pt.x * 0.5 + 0.5);
      const v = sp ? sp.v : (-pt.y * 0.5 + 0.5);

      // Normalized Device Coordinates [-1, 1]
      const ndcX = (u - 0.5) * 2.0;
      const ndcY = -(v - 0.5) * 2.0;

      // 3D Depth: pt.z is calibrated relative depth around baseline Z = 0
      const jointZ = Math.max(-1.2, Math.min(1.2, pt.z));
      const distFromCam = Math.max(0.6, camZ - jointZ);

      // Frustum half dimensions at this exact depth plane
      const halfHeightAtZ = distFromCam * tanHalfFov;
      const halfWidthAtZ = halfHeightAtZ * screenAspect;

      // Exact 3D world position
      const worldX = ndcX * halfWidthAtZ;
      const worldY = ndcY * halfHeightAtZ;
      const worldZ = jointZ;

      const mesh = rig.joints[i];
      mesh.position.set(worldX, worldY, worldZ);
      worldPoints.push(mesh.position.clone());

      // Highlight fingertips on pinch
      if ([4, 8].includes(i)) {
        if (kinematicState.pose.isPinchThumbIndex) {
          mesh.material.emissive.setHex(0xffff00);
          mesh.material.emissiveIntensity = 1.8;
          mesh.scale.set(1.4, 1.4, 1.4);
        } else {
          mesh.material.emissive.setHex(rig.secondaryColorHex);
          mesh.material.emissiveIntensity = 0.8;
          mesh.scale.set(1.0, 1.0, 1.0);
        }
      }
    }

    // Attach true 3D world vectors directly to kinematicState for spatial consumers
    kinematicState.worldPoints = worldPoints;
    kinematicState.tipWorld = rig.joints[8].position.clone();
    kinematicState.pinchWorld = new THREE.Vector3().addVectors(rig.joints[8].position, rig.joints[4].position).multiplyScalar(0.5);
    kinematicState.palmWorld = new THREE.Vector3().addVectors(rig.joints[0].position, rig.joints[5].position).add(rig.joints[17].position).divideScalar(3);

    // Update Bone Cylinders between joints
    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      const [idxA, idxB] = HAND_CONNECTIONS[i];
      const posA = rig.joints[idxA].position;
      const posB = rig.joints[idxB].position;
      const bone = rig.bones[i];

      bone.position.copy(posA);
      bone.lookAt(posB);
      const distance = posA.distanceTo(posB);
      bone.scale.set(1, 1, Math.max(0.001, distance));
    }

    // Update Palm Normal Vector Arrow
    const palm = kinematicState.palm;
    if (palm && rig.arrowHelper) {
      rig.arrowHelper.position.copy(kinematicState.palmWorld);
      const normalVec = new THREE.Vector3(palm.normal.x, palm.normal.y, palm.normal.z).normalize();
      rig.arrowHelper.setDirection(normalVec);
      rig.arrowHelper.setLength(0.45);
    }

    // Update Pinch Halo ring
    if (rig.pinchHalo) {
      rig.pinchHalo.position.copy(kinematicState.pinchWorld);
      rig.pinchHalo.lookAt(this.camera.position);

      if (kinematicState.pose.isPinchThumbIndex) {
        rig.pinchHalo.material.opacity = 0.9;
        rig.pinchHalo.scale.set(1.2, 1.2, 1.2);
      } else {
        rig.pinchHalo.material.opacity = 0.0;
        rig.pinchHalo.scale.set(0.5, 0.5, 0.5);
      }
    }
  }

  hideHand(handedness) {
    if (this.handRigs[handedness]) {
      this.handRigs[handedness].group.visible = false;
    }
  }

  // --- FASE 2: BODY SKELETON RIG ---

  _createBodyRig() {
    const group = new THREE.Group();
    group.visible = false;
    this.scene.add(group);

    const jointGeo = new THREE.SphereGeometry(0.045, 16, 16);
    const headGeo = new THREE.SphereGeometry(0.09, 20, 20);
    const jointMat = new THREE.MeshStandardMaterial({
      color: 0xffd166,
      emissive: 0xffd166,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.7
    });

    // 33 Joint spheres
    const jointMeshes = [];
    for (let i = 0; i < 33; i++) {
      const mesh = new THREE.Mesh(i === 0 ? headGeo : jointGeo, jointMat);
      mesh.visible = false;
      group.add(mesh);
      jointMeshes.push(mesh);
    }

    // Body segments (bones)
    const bonePairs = [
      [11, 12], // shoulders
      [11, 13], [13, 15], // left arm
      [12, 14], [14, 16], // right arm
      [11, 23], [12, 24], // torso sides
      [23, 24], // hips
      [23, 25], [25, 27], // left leg
      [24, 26], [26, 28], // right leg
      [0, 11], [0, 12]    // neck
    ];

    const boneLines = [];
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.75
    });

    for (const [a, b] of bonePairs) {
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 0)
      ]);
      const line = new THREE.Line(geom, lineMat);
      group.add(line);
      boneLines.push({ line, a, b });
    }

    return { group, jointMeshes, boneLines, bonePairs };
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

  updateBody(bodyEntity) {
    if (!this.bodyRig) return;
    if (!bodyEntity || !bodyEntity.landmarks || bodyEntity.missingFrames > 0) {
      this.hideBody();
      return;
    }

    const landmarks = bodyEntity.landmarks;
    this.bodyRig.group.visible = true;

    const worldPoints = [];
    for (let i = 0; i < 33; i++) {
      const lm = landmarks[i];
      if (lm) {
        const wp = this.unprojectUV(lm.x, lm.y, (lm.z || 0) * 0.5);
        worldPoints[i] = wp;
        if (this.bodyRig.jointMeshes[i]) {
          this.bodyRig.jointMeshes[i].position.copy(wp);
          this.bodyRig.jointMeshes[i].visible = (lm.visibility === undefined || lm.visibility > 0.4);
        }
      }
    }

    // Update Bone Lines
    for (const item of this.bodyRig.boneLines) {
      const pA = worldPoints[item.a];
      const pB = worldPoints[item.b];
      if (pA && pB) {
        item.line.geometry.setFromPoints([pA, pB]);
        item.line.visible = true;
      } else {
        item.line.visible = false;
      }
    }
  }

  hideBody() {
    if (this.bodyRig) {
      this.bodyRig.group.visible = false;
    }
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

    // Glowing sphere
    const sphereGeo = new THREE.SphereGeometry(0.1, 24, 24);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: colorVal,
      emissive: colorVal,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.7,
      transparent: true,
      opacity: 0.88
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    group.add(sphere);

    // Orbital target ring
    const ringGeo = new THREE.RingGeometry(0.14, 0.16, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colorVal,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    const rig = { group, sphere, ring, sphereMat, ringMat };
    this.objectRigs.set(id, rig);
    return rig;
  }

  updateObject(objectEntity) {
    if (!objectEntity || objectEntity.missingFrames > 0) return;

    const id = objectEntity.id;
    const colorHex = objectEntity.customProps?.colorHex || '#ff6b35';
    const rig = this._getOrCreateObjectRig(id, colorHex);

    rig.group.visible = true;

    // Unproject normalized X, Y to 3D frustum
    const pos = objectEntity.position;
    const wp = this.unprojectUV(pos.x, pos.y, pos.z || 0);
    rig.group.position.copy(wp);

    // Orbital ring rotation
    rig.ring.rotation.z += 0.03;
    rig.ring.lookAt(this.camera.position);

    // Scale by apparent radius
    const r = Math.max(0.06, Math.min(0.3, objectEntity.scale?.x || 0.1));
    rig.sphere.scale.set(r / 0.1, r / 0.1, r / 0.1);
    rig.ring.scale.set(r / 0.1, r / 0.1, r / 0.1);
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

    // Body
    const body = worldModel.getEntity('body-primary');
    if (body && body.missingFrames === 0) {
      this.updateBody(body);
    } else {
      this.hideBody();
    }

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
    requestAnimationFrame(() => this._animate());
    this.renderer.render(this.scene, this.camera);
  }
}
