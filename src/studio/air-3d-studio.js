/**
 * Air 3D Studio - Holographic Spatial CAD & 3D Model Manipulator
 * Manipulates .STL, .OBJ and procedural holographic models directly with hands:
 * - ☝️ Raycast laser pointer & contact reticle
 * - Pinch-confirmed translation, bimanual scale, and quaternion rotation
 * - A free-hand peace pose rotates the held model or orbits its camera
 * - Auto-centering, Exploded View, CAD Telemetry, and Shading modes
 */

import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GripInteractionController } from './grip-interaction-controller.js';

export class Air3DStudio {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    this.isActive = false;
    this.shadingMode = 'hologram'; // 'hologram' | 'cad' | 'xray' | 'wireframe'
    this.explodedFactor = 0; // 0 to 1
    this.autoRotate = false;

    // Root Group for the loaded 3D model
    this.studioGroup = new THREE.Group();
    this.studioGroup.name = 'air-3d-studio-root';
    this.studioGroup.visible = false;
    this.scene.add(this.studioGroup);

    // Model Container inside studio group (handles centering & relative transformations)
    this.modelContainer = new THREE.Group();
    this.studioGroup.add(this.modelContainer);

    // Holographic Pedestal & Spatial Bounding Cage
    this._setupHolographicStage();

    // Laser Raycast & Reticle
    this._setupLaserRay();

    // Interaction State & Anchors (Anchor-Based relative transforms)
    this.isGrabbing = false;
    this.interactionMode = 'idle'; // 'idle' | 'one-hand' | 'two-hand'
    this.currentPoseLabel = 'LIBRE';
    this.isHoveringModel = false;

    // Smoothed Target Transforms for fluid interpolation
    this.targetPosition = new THREE.Vector3(0, 0, 0);
    this.targetQuaternion = new THREE.Quaternion();
    this.targetScale = 1.0;
    this.baseModelScale = 1.0;
    this.bimanualMode = 'combined';
    this.rotationTarget = 'object';
    this.rotationGestureHoldMs = 100;
    this.rotationGestureCandidates = new Map();
    this.rotationHand = null;
    this.rotationAnchor = null;
    this.currentControlMode = 'idle';
    this.initialCameraPosition = this.camera.position.clone();
    this.initialCameraUp = this.camera.up.clone();
    this.targetCameraPosition = this.camera.position.clone();
    this._targetCameraUp = this.initialCameraUp.clone();

    // Gesture anchors preserve the current transform when a mode changes.
    this.isTwoHandActive = false;
    this.gripController = new GripInteractionController();
    this.grabbedHands = [];
    this.singleHandAnchor = null;
    this.twoHandAnchor = null;
    this.handRayHits = { Left: null, Right: null };
    this.interactionDiagnostics = {
      interactionMode: 'idle',
      grabbedHands: [],
      states: this.gripController.getDiagnostics(),
      events: [],
      updateMs: 0,
      deltaTime: 0,
      fps: 0
    };
    this.rayMat = null;
    this.reticleMat = null;

    // Loaded Model Metadata
    this.modelMetadata = {
      name: 'Sin modelo',
      format: 'None',
      vertices: 0,
      triangles: 0,
      size: { x: 0, y: 0, z: 0 },
      scale: 1.0
    };

    this.onMetadataUpdate = null;
    this.explodedMeshes = [];

    // Load Default Holographic Model
    this.loadPresetModel('reactor');
  }

  // --- HOLOGRAPHIC STAGE SETUP ---
  _setupHolographicStage() {
    // 1. Holographic Floor Ring / Pedestal
    const ringGeo = new THREE.RingGeometry(1.2, 1.25, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5
    });
    this.pedestalRing = new THREE.Mesh(ringGeo, ringMat);
    this.pedestalRing.rotation.x = Math.PI / 2;
    this.pedestalRing.position.y = -1.1;
    this.studioGroup.add(this.pedestalRing);

    // Inner concentric ring
    const innerRingGeo = new THREE.RingGeometry(0.7, 0.73, 48);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0x7928ca,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4
    });
    this.pedestalInnerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    this.pedestalInnerRing.rotation.x = Math.PI / 2;
    this.pedestalInnerRing.position.y = -1.09;
    this.studioGroup.add(this.pedestalInnerRing);

    // 2. Holographic Bounding Cage (Box Helper)
    this.boxHelper = new THREE.BoxHelper(this.modelContainer, 0x00bbf9);
    this.boxHelper.material.transparent = true;
    this.boxHelper.material.opacity = 0.35;
    this.studioGroup.add(this.boxHelper);
  }

  // --- LASER RAY & RETICLE SETUP ---
  _setupLaserRay() {
    // Holographic laser beam from fingertip
    const rayGeo = new THREE.CylinderGeometry(0.004, 0.004, 1, 8);
    rayGeo.translate(0, 0.5, 0);
    rayGeo.rotateX(Math.PI / 2);
    this.rayMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.65
    });
    this.laserBeam = new THREE.Mesh(rayGeo, this.rayMat);
    this.laserBeam.visible = false;
    this.scene.add(this.laserBeam);

    // Holographic Contact Reticle (target circle on model intersection)
    const reticleGeo = new THREE.RingGeometry(0.035, 0.045, 32);
    this.reticleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    this.reticle = new THREE.Mesh(reticleGeo, this.reticleMat);
    this.reticle.visible = false;
    this.scene.add(this.reticle);

    this.raycaster = new THREE.Raycaster();
  }

  setActive(active) {
    this.isActive = active;
    this.studioGroup.visible = active;
    if (!active) {
      this.laserBeam.visible = false;
      this.reticle.visible = false;
      this._cancelGripInteraction('studio-closed');
    }
  }

  // --- PRESET PROCEDURAL HOLOGRAPHIC MODELS ---
  loadPresetModel(type) {
    this._clearModel();
    let meshGroup = new THREE.Group();

    if (type === 'reactor') {
      meshGroup = this._generateArcReactor();
      this.modelMetadata.name = 'Reactor Arc Cuántico (Mark VII)';
      this.modelMetadata.format = 'Procedural CAD';
    } else if (type === 'turbine') {
      meshGroup = this._generateTurbineEngine();
      this.modelMetadata.name = 'Turbina Aeronáutica Turbofán';
      this.modelMetadata.format = 'Procedural CAD';
    } else { // 'arm'
      meshGroup = this._generateRoboticArm();
      this.modelMetadata.name = 'Brazo Robótico Articulado';
      this.modelMetadata.format = 'Procedural CAD';
    }

    this._installLoadedModel(meshGroup);
  }

  _generateArcReactor() {
    const group = new THREE.Group();
    this.explodedMeshes = [];

    // Outer Housing Ring
    const outerRingGeo = new THREE.TorusGeometry(0.8, 0.08, 24, 64);
    const outerMat = this._createMaterial(0x1a2639, 0.85, 0.2);
    const outerRing = new THREE.Mesh(outerRingGeo, outerMat);
    group.add(outerRing);
    this.explodedMeshes.push({ mesh: outerRing, dir: new THREE.Vector3(0, 0, -0.4) });

    // 10 Copper Electromagnetic Coils
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const coilGeo = new THREE.BoxGeometry(0.12, 0.22, 0.16);
      const coilMat = this._createMaterial(0xd97706, 0.9, 0.3); // Copper
      const coil = new THREE.Mesh(coilGeo, coilMat);
      coil.position.set(Math.cos(angle) * 0.8, Math.sin(angle) * 0.8, 0);
      coil.rotation.z = angle;
      group.add(coil);
      this.explodedMeshes.push({
        mesh: coil,
        dir: new THREE.Vector3(Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0)
      });
    }

    // Inner Luminous Palladium Core
    const coreGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.1, 32);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.8
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.rotation.x = Math.PI / 2;
    group.add(core);
    this.explodedMeshes.push({ mesh: core, dir: new THREE.Vector3(0, 0, 0.4) });

    // Central Triangular Energy Emitter
    const triGeo = new THREE.ConeGeometry(0.25, 0.12, 3);
    const triMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    const tri = new THREE.Mesh(triGeo, triMat);
    tri.rotation.x = Math.PI / 2;
    tri.position.z = 0.06;
    group.add(tri);
    this.explodedMeshes.push({ mesh: tri, dir: new THREE.Vector3(0, 0, 0.7) });

    return group;
  }

  _generateTurbineEngine() {
    const group = new THREE.Group();
    this.explodedMeshes = [];

    // Outer Cylindrical Casing
    const cowlGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.6, 48, 1, true);
    const cowlMat = this._createMaterial(0x334155, 0.8, 0.3);
    const cowl = new THREE.Mesh(cowlGeo, cowlMat);
    cowl.rotation.x = Math.PI / 2;
    group.add(cowl);
    this.explodedMeshes.push({ mesh: cowl, dir: new THREE.Vector3(0, 0, -0.6) });

    // Central Nose Cone
    const coneGeo = new THREE.ConeGeometry(0.3, 0.7, 32);
    const coneMat = this._createMaterial(0x0f172a, 0.95, 0.15);
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.rotation.x = -Math.PI / 2;
    cone.position.z = 0.25;
    group.add(cone);
    this.explodedMeshes.push({ mesh: cone, dir: new THREE.Vector3(0, 0, 0.6) });

    // 16 Titanium Fan Blades
    const rotorHub = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const bladeGeo = new THREE.BoxGeometry(0.08, 0.6, 0.02);
      bladeGeo.translate(0, 0.35, 0);
      const bladeMat = this._createMaterial(0xffffff, 0.9, 0.2);
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.rotation.z = angle;
      blade.rotation.y = 0.45; // Aerodynamic pitch angle
      rotorHub.add(blade);
    }
    group.add(rotorHub);
    this.explodedMeshes.push({ mesh: rotorHub, dir: new THREE.Vector3(0, 0, 0.1) });

    return group;
  }

  _generateRoboticArm() {
    const group = new THREE.Group();
    this.explodedMeshes = [];

    // Base Turntable
    const baseGeo = new THREE.CylinderGeometry(0.6, 0.7, 0.2, 32);
    const baseMat = this._createMaterial(0x1e293b, 0.8, 0.2);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -0.6;
    group.add(base);
    this.explodedMeshes.push({ mesh: base, dir: new THREE.Vector3(0, -0.4, 0) });

    // Lower Arm Link
    const link1Geo = new THREE.BoxGeometry(0.2, 0.8, 0.2);
    link1Geo.translate(0, 0.4, 0);
    const link1Mat = this._createMaterial(0x0284c7, 0.85, 0.25);
    const link1 = new THREE.Mesh(link1Geo, link1Mat);
    link1.position.y = -0.5;
    link1.rotation.z = -0.3;
    group.add(link1);
    this.explodedMeshes.push({ mesh: link1, dir: new THREE.Vector3(-0.3, 0, 0) });

    // Upper Forearm Link
    const link2Geo = new THREE.BoxGeometry(0.16, 0.7, 0.16);
    link2Geo.translate(0, 0.35, 0);
    const link2Mat = this._createMaterial(0xffffff, 0.8, 0.3);
    const link2 = new THREE.Mesh(link2Geo, link2Mat);
    link2.position.set(-0.25, 0.15, 0);
    link2.rotation.z = 0.6;
    group.add(link2);
    this.explodedMeshes.push({ mesh: link2, dir: new THREE.Vector3(0.3, 0.3, 0) });

    return group;
  }

  // --- MATERIAL FACTORY (SHADING MODES) ---
  _createMaterial(baseColorHex = 0xffffff, metalness = 0.8, roughness = 0.25) {
    if (this.shadingMode === 'hologram') {
      return new THREE.MeshStandardMaterial({
        color: baseColorHex,
        emissive: baseColorHex,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.82,
        roughness: 0.3,
        metalness: 0.7,
        wireframe: false
      });
    } else if (this.shadingMode === 'cad') {
      return new THREE.MeshStandardMaterial({
        color: 0xd8e2dc,
        metalness: 0.9,
        roughness: 0.15
      });
    } else if (this.shadingMode === 'xray') {
      return new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.35,
        transmission: 0.7,
        roughness: 0.1,
        metalness: 0.1
      });
    } else { // wireframe
      return new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true
      });
    }
  }

  setShadingMode(mode) {
    this.shadingMode = mode;
    this.modelContainer.traverse((child) => {
      if (child.isMesh) {
        const baseColor = child.material.color ? child.material.color.getHex() : 0xffffff;
        child.material = this._createMaterial(baseColor);
      }
    });
  }

  // --- AUTO-CENTERING & NORMALIZATION ---
  _installLoadedModel(model) {
    // Center from the loaded model's own bounds, not from a previously transformed container.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Center the geometry around its pivot before it enters the transformed container.
    model.position.sub(center);
    this.modelContainer.add(model);

    // Compute dimensions and normalize scale to fit comfortably in holographic stage (~1.6 units)
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const targetScale = 1.6 / maxDim;
    this.modelContainer.scale.setScalar(targetScale);
    this.baseModelScale = targetScale;

    // Count vertices & triangles
    let totalVerts = 0;
    let totalTris = 0;
    this.modelContainer.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const geo = child.geometry;
        totalVerts += geo.attributes.position ? geo.attributes.position.count : 0;
        totalTris += geo.index ? geo.index.count / 3 : (geo.attributes.position ? geo.attributes.position.count / 3 : 0);
      }
    });

    this.modelMetadata.vertices = totalVerts;
    this.modelMetadata.triangles = Math.round(totalTris);
    this.modelMetadata.size = {
      x: Math.round(size.x * 100) / 100,
      y: Math.round(size.y * 100) / 100,
      z: Math.round(size.z * 100) / 100
    };
    this.modelMetadata.scale = Math.round(targetScale * 100) / 100;

    // Reset transformations
    this.modelContainer.position.set(0, 0, 0);
    this.modelContainer.quaternion.identity();
    this.targetPosition.set(0, 0, 0);
    this.targetQuaternion.identity();
    this.targetScale = targetScale;
    this.isGrabbing = false;
    this.isTwoHandActive = false;
    this.interactionMode = 'idle';
    this.isHoveringModel = false;
    this.gripController.reset();
    this.grabbedHands = [];
    this.singleHandAnchor = null;
    this.twoHandAnchor = null;
    this.rotationHand = null;
    this.rotationAnchor = null;
    this.rotationGestureCandidates.clear();
    this.currentControlMode = 'idle';

    // Update Bounding Box Wireframe
    this.boxHelper.update();

    if (this.onMetadataUpdate) {
      this.onMetadataUpdate(this.modelMetadata);
    }
  }

  _clearModel() {
    while (this.modelContainer.children.length > 0) {
      const obj = this.modelContainer.children[0];
      this.modelContainer.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    }
    this.explodedMeshes = [];
  }

  // --- EXTERNAL FILE LOADERS (.STL & .OBJ) ---
  loadSTL(arrayBuffer, fileName = 'Archivo.stl') {
    this._clearModel();
    const loader = new STLLoader();
    const geometry = loader.parse(arrayBuffer);
    geometry.computeVertexNormals();

    const material = this._createMaterial(0xffffff, 0.85, 0.2);
    const mesh = new THREE.Mesh(geometry, material);

    this.modelMetadata.name = fileName;
    this.modelMetadata.format = 'STL (Stereolithography)';
    this._installLoadedModel(mesh);
  }

  loadOBJ(textData, fileName = 'Archivo.obj') {
    this._clearModel();
    const loader = new OBJLoader();
    const group = loader.parse(textData);

    group.traverse((child) => {
      if (child.isMesh) {
        child.material = this._createMaterial(0x00bbf9, 0.85, 0.2);
      }
    });

    this.modelMetadata.name = fileName;
    this.modelMetadata.format = 'OBJ (Wavefront)';
    this._installLoadedModel(group);
  }

  // --- EXPLODED VIEW (DESPIECE HOLOGRÁFICO) ---
  setExplodedView(factor) {
    this.explodedFactor = Math.max(0, Math.min(1, factor));
    for (const item of this.explodedMeshes) {
      if (item.mesh && item.dir) {
        item.mesh.position.copy(item.dir).multiplyScalar(this.explodedFactor * 0.9);
      }
    }
    this.boxHelper.update();
  }

  resetTransform() {
    const s = this.baseModelScale || 1.0;
    this.targetPosition.set(0, 0, 0);
    this.targetQuaternion.identity();
    this.targetScale = s;
    this.modelMetadata.scale = Math.round(s * 100) / 100;
    this.modelContainer.position.set(0, 0, 0);
    this.modelContainer.quaternion.identity();
    this.modelContainer.scale.setScalar(s);
    this.isGrabbing = false;
    this.isTwoHandActive = false;
    this.interactionMode = 'idle';
    this.currentPoseLabel = 'LIBRE';
    this.isHoveringModel = false;
    this.gripController.reset();
    this.grabbedHands = [];
    this.singleHandAnchor = null;
    this.twoHandAnchor = null;
    this.rotationHand = null;
    this.rotationAnchor = null;
    this.rotationGestureCandidates.clear();
    this.currentControlMode = 'idle';
    this.targetCameraPosition.copy(this.initialCameraPosition);
    this.camera.position.copy(this.initialCameraPosition);
    this.camera.up.copy(this.initialCameraUp);
    this._targetCameraUp.copy(this.initialCameraUp);
    this.camera.lookAt(0, 0, 0);
    this.setExplodedView(0);
    this.boxHelper.update();
    this.onMetadataUpdate?.(this.modelMetadata);
  }

  // --- PINCH-CONFIRMED SPATIAL INTERACTION ---
  update(kinematicData, stats = {}) {
    if (!this.isActive) return;
    const frameStarted = performance.now();

    const hands = {
      Left: kinematicData?.Left || null,
      Right: kinematicData?.Right || null
    };
    this._lastHands = hands;
    const canGrab = {
      Left: this._updateHandTarget(hands.Left, 'Left'),
      Right: this._updateHandTarget(hands.Right, 'Right')
    };
    const hoverSide = canGrab.Right ? 'Right' : canGrab.Left ? 'Left' : null;
    this.isHoveringModel = Boolean(hoverSide);
    const result = this.gripController.update(
      hands,
      kinematicData?.timestamp ?? frameStarted,
      canGrab
    );
    const activeHands = result.grabbedHands;
    const mode = result.interactionMode;
    const timestamp = kinematicData?.timestamp ?? frameStarted;
    if (activeHands.length !== 1) this.rotationGestureCandidates.clear();
    const rotationHand = activeHands.length === 1
      ? this._getRotationGestureHand(hands, activeHands, timestamp)
      : null;
    const canTransform = activeHands.every((side) => this.gripController.isTransforming(side));
    const reacquiredHands = result.events
      .filter((event) => event.type === 'reacquired')
      .map((event) => event.hand)
      .filter((side) => activeHands.includes(side));

    if (
      mode !== this.interactionMode ||
      !this._sameHands(activeHands, this.grabbedHands) ||
      reacquiredHands.length > 0 ||
      rotationHand !== this.rotationHand
    ) {
      this.grabbedHands = activeHands;
      this.interactionMode = mode;
      this.isGrabbing = activeHands.length > 0;
      this.isTwoHandActive = activeHands.length === 2;
      this.singleHandAnchor = null;
      this.twoHandAnchor = null;
      this.rotationHand = rotationHand;
      this.rotationAnchor = null;

      if (activeHands.length === 1) {
        if (rotationHand) {
          this._anchorRotationHand(rotationHand, hands[rotationHand]);
          this.currentControlMode = 'rotate';
        } else {
          this._anchorSingleHand(activeHands[0], hands[activeHands[0]]);
          this.currentControlMode = 'translate';
        }
      } else if (activeHands.length === 2) {
        this._anchorTwoHands(hands.Left, hands.Right);
        this.currentControlMode = this.bimanualMode;
      } else {
        this.currentControlMode = 'idle';
      }
    }

    this._updateHoverVisual(hoverSide ? this.handRayHits[hoverSide] : null);
    if (canTransform && activeHands.length === 1 && rotationHand) {
      const hand = hands[rotationHand];
      if (hand && this.rotationAnchor) this._applyRotationGesture(rotationHand, hand);
    } else if (canTransform && activeHands.length === 1) {
      const side = activeHands[0];
      if (hands[side] && this.singleHandAnchor) {
        this._applySingleHandTransform(side, hands[side]);
      }
    } else if (
      canTransform &&
      activeHands.length === 2 &&
      hands.Left &&
      hands.Right &&
      this.twoHandAnchor
    ) {
      this._applyTwoHandTransform(hands.Left, hands.Right);
    }
    if (this.autoRotate && !this.isGrabbing) {
      const dtSeconds = Math.min(result.deltaTime, 50) / 1000;
      this.targetQuaternion.premultiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.48 * dtSeconds)
      );
      this.pedestalRing.rotation.z += 0.3 * dtSeconds;
      this.pedestalInnerRing.rotation.z -= 0.42 * dtSeconds;
    }

    this._dampModelTransform(result.deltaTime);
    this.boxHelper.update();
    this.interactionDiagnostics = {
      interactionMode: mode,
      controlMode: this.currentControlMode,
      rotationTarget: this.rotationTarget,
      bimanualMode: this.bimanualMode,
      grabbedHands: [...activeHands],
      states: result.states,
      events: result.events,
      updateMs: performance.now() - frameStarted,
      deltaTime: result.deltaTime,
      fps: stats?.fps || 0,
      frameTimeMs: stats?.frameTimeMs || 0
    };

    const states = ['Left', 'Right']
      .map((side) => `${side[0]}:${result.states[side].state}`)
      .join(' · ');
    const gripOwner = activeHands.length ? activeHands.join('+') : 'ninguna';
    const targetLabel = this.rotationTarget === 'camera' ? 'órbita cámara' : 'objeto';
    const controlLabel = this.currentControlMode === 'rotate'
      ? `rotar ${targetLabel}`
      : this.currentControlMode === 'combined'
        ? `escala + rotación ${targetLabel}`
        : this.currentControlMode === 'scale'
          ? 'escalar'
          : this.currentControlMode === 'translate'
            ? 'trasladar'
            : 'libre';
    this.currentPoseLabel = `${controlLabel} · agarre: ${gripOwner}`;
  }

  _updateHandTarget(hand, side) {
    if (!hand?.points?.[0] || !hand.points?.[8] || !hand.worldPoints?.[0] || !hand.tipWorld) {
      this.handRayHits[side] = null;
      return false;
    }

    const tip = hand.tipWorld;
    const wrist = hand.worldPoints[0];
    const direction = new THREE.Vector3(
      tip.x - wrist.x,
      tip.y - wrist.y,
      -Math.max(0.4, Math.abs(tip.z - wrist.z))
    ).normalize();

    this.studioGroup.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    this.raycaster.set(tip, direction);
    const intersects = this.raycaster.intersectObjects(this.modelContainer.children, true);
    const hit = intersects[0];

    this.handRayHits[side] = hit
      ? { tip: tip.clone(), direction, hit }
      : null;
    return Boolean(hit);
  }

  _updateHoverVisual(target) {
    if (!target || this.isGrabbing) {
      this.laserBeam.visible = false;
      this.reticle.visible = false;
      return;
    }
    this.laserBeam.position.copy(target.tip);
    this.laserBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), target.direction);
    this.laserBeam.scale.set(1, 1, target.hit.distance);
    this.laserBeam.visible = true;
    this.reticle.position.copy(target.hit.point);
    this.reticle.lookAt(this.camera.position);
    this.reticle.visible = true;
  }

  _anchorSingleHand(side, hand) {
    const point = hand?.tipWorld;
    if (!point) return;
    this.singleHandAnchor = {
      side,
      handPoint: point.clone(),
      modelPosition: this.targetPosition.clone()
    };
    this.currentPoseLabel = `${side}: agarre confirmado`;
  }

  _applySingleHandTransform(side, hand) {
    if (side !== this.singleHandAnchor.side || !hand.tipWorld) return;
    const anchor = this.singleHandAnchor;
    const delta = hand.tipWorld.clone().sub(anchor.handPoint);
    this.targetPosition.set(
      anchor.modelPosition.x + delta.x * 1.5,
      anchor.modelPosition.y + delta.y * 1.5,
      THREE.MathUtils.clamp(anchor.modelPosition.z + delta.z * 0.45, -3.5, 2)
    );
  }

  _anchorRotationHand(side, hand) {
    if (!hand?.tipWorld) return;
    this.rotationAnchor = {
      side,
      handPoint: hand.tipWorld.clone(),
      modelQuaternion: this.targetQuaternion.clone(),
      cameraPosition: this.targetCameraPosition.clone(),
      cameraUp: this._targetCameraUp.clone(),
      cameraCenter: this.targetPosition.clone()
    };
  }

  _applyRotationGesture(side, hand) {
    if (
      side !== this.rotationAnchor?.side ||
      !hand.tipWorld ||
      !this._isRotationGesture(hand)
    ) return;
    const delta = hand.tipWorld.clone().sub(this.rotationAnchor.handPoint);
    const rotationDelta = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-delta.y * 2.4, delta.x * 2.4, delta.z * 2.4, 'XYZ')
    );
    this._applyRotationDelta(rotationDelta, this.rotationAnchor.modelQuaternion, this.rotationAnchor);
  }

  _anchorTwoHands(leftHand, rightHand) {
    if (!leftHand?.tipWorld || !rightHand?.tipWorld) return;
    const left = leftHand.tipWorld;
    const right = rightHand.tipWorld;
    const vector = right.clone().sub(left);
    this.twoHandAnchor = {
      center: left.clone().add(right).multiplyScalar(0.5),
      vector,
      distance: Math.max(0.04, vector.length()),
      leftPalm: this._palmQuaternion(leftHand),
      rightPalm: this._palmQuaternion(rightHand),
      modelPosition: this.targetPosition.clone(),
      modelQuaternion: this.targetQuaternion.clone(),
      modelScale: this.targetScale,
      cameraPosition: this.targetCameraPosition.clone(),
      cameraUp: this._targetCameraUp.clone(),
      cameraCenter: this.targetPosition.clone()
    };
  }

  _applyTwoHandTransform(leftHand, rightHand) {
    const left = leftHand.tipWorld;
    const right = rightHand.tipWorld;
    const vector = right.clone().sub(left);
    const center = left.clone().add(right).multiplyScalar(0.5);
    const distance = Math.max(0.04, vector.length());
    const anchor = this.twoHandAnchor;
    const ratio = THREE.MathUtils.clamp(distance / anchor.distance, 0.25, 4);
    const minimumScale = Math.max(0.001, anchor.modelScale * 0.25);
    const maximumScale = Math.max(minimumScale, anchor.modelScale * 4);

    if (this.bimanualMode !== 'rotate') {
      this.targetScale = THREE.MathUtils.clamp(anchor.modelScale * ratio, minimumScale, maximumScale);
    }
    this.targetPosition.x = anchor.modelPosition.x + (center.x - anchor.center.x) * 1.5;
    this.targetPosition.y = anchor.modelPosition.y + (center.y - anchor.center.y) * 1.5;
    this.targetPosition.z = THREE.MathUtils.clamp(
      anchor.modelPosition.z + (center.z - anchor.center.z) * 0.25,
      -3.5,
      2
    );
    if (this.bimanualMode !== 'scale') {
      const swing = new THREE.Quaternion().setFromUnitVectors(
        anchor.vector.clone().normalize(),
        vector.clone().normalize()
      );
      const leftDelta = this._palmQuaternion(leftHand).multiply(anchor.leftPalm.clone().invert());
      const rightDelta = this._palmQuaternion(rightHand).multiply(anchor.rightPalm.clone().invert());
      const palmDelta = leftDelta.slerp(rightDelta, 0.5);
      this._applyRotationDelta(
        palmDelta.multiply(swing),
        anchor.modelQuaternion,
        anchor
      );
    }
    this.modelMetadata.scale = Math.round(this.targetScale * 100) / 100;
    this.onMetadataUpdate?.(this.modelMetadata);
  }

  _applyRotationDelta(delta, modelQuaternion, anchor) {
    if (this.rotationTarget === 'camera') {
      const offset = anchor.cameraPosition.clone().sub(anchor.cameraCenter);
      this.targetCameraPosition.copy(offset.applyQuaternion(delta).add(anchor.cameraCenter));
      this._targetCameraUp = anchor.cameraUp.clone().applyQuaternion(delta).normalize();
      return;
    }
    this.targetQuaternion.copy(modelQuaternion).premultiply(delta).normalize();
  }

  _palmQuaternion(hand) {
    const orientation = hand?.palm?.orientation || {};
    const toRadians = THREE.MathUtils.degToRad;
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(
      toRadians(orientation.pitch || 0),
      toRadians(orientation.yaw || 0),
      toRadians(orientation.roll || 0),
      'YXZ'
    ));
  }

  _isRotationGesture(hand) {
    return Boolean(
      hand?.pose?.isPeace &&
      Number.isFinite(hand.confidence) &&
      hand.confidence >= 0.65
    );
  }

  _getRotationGestureHand(hands, grabbedHands, timestamp) {
    let activeSide = null;
    for (const side of ['Left', 'Right']) {
      if (grabbedHands.includes(side)) {
        this.rotationGestureCandidates.delete(side);
        continue;
      }
      const hand = hands[side];
      if (!this._isRotationGesture(hand)) {
        this.rotationGestureCandidates.delete(side);
        continue;
      }
      const startedAt = this.rotationGestureCandidates.get(side) ?? timestamp;
      this.rotationGestureCandidates.set(side, startedAt);
      if (timestamp - startedAt >= this.rotationGestureHoldMs && activeSide === null) {
        activeSide = side;
      }
    }
    return activeSide;
  }

  setBimanualMode(mode) {
    if (!['combined', 'scale', 'rotate'].includes(mode)) {
      throw new RangeError(`Unknown bimanual transform mode: ${mode}`);
    }
    if (mode === this.bimanualMode) return;
    this.bimanualMode = mode;
    if (this.grabbedHands.length === 2) {
      this._anchorTwoHands(
        this._lastHands?.Left,
        this._lastHands?.Right
      );
      this.currentControlMode = mode;
    }
  }

  setRotationTarget(target) {
    if (!['object', 'camera'].includes(target)) {
      throw new RangeError(`Unknown rotation target: ${target}`);
    }
    if (target === this.rotationTarget) return;
    this.rotationTarget = target;
    if (this.rotationHand) {
      this._anchorRotationHand(this.rotationHand, this._lastHands?.[this.rotationHand]);
    } else if (this.grabbedHands.length === 2) {
      this._anchorTwoHands(this._lastHands?.Left, this._lastHands?.Right);
    }
  }

  _dampModelTransform(deltaTime) {
    const elapsed = Math.max(0, Math.min(deltaTime, 50));
    const alpha = 1 - Math.exp(-elapsed / 32);
    this.modelContainer.position.lerp(this.targetPosition, alpha);
    this.modelContainer.quaternion.slerp(this.targetQuaternion, alpha);
    const nextScale = this.modelContainer.scale.x +
      (this.targetScale - this.modelContainer.scale.x) * alpha;
    this.modelContainer.scale.setScalar(nextScale);
    this.camera.position.lerp(this.targetCameraPosition, alpha);
    if (
      this.rotationTarget === 'camera' &&
      this.isGrabbing &&
      ['rotate', 'combined'].includes(this.currentControlMode)
    ) {
      const center = this.modelContainer.getWorldPosition(new THREE.Vector3());
      if (this._targetCameraUp) this.camera.up.lerp(this._targetCameraUp, alpha).normalize();
      this.camera.lookAt(center);
    }
  }

  _sameHands(first, second) {
    return first.length === second.length && first.every((side, index) => side === second[index]);
  }

  _cancelGripInteraction(reason) {
    this.gripController.reset();
    this.grabbedHands = [];
    this.singleHandAnchor = null;
    this.twoHandAnchor = null;
    this.rotationHand = null;
    this.rotationAnchor = null;
    this.rotationGestureCandidates.clear();
    this.isGrabbing = false;
    this.isTwoHandActive = false;
    this.interactionMode = 'idle';
    this.currentControlMode = 'idle';
    this.isHoveringModel = false;
    this.interactionDiagnostics = {
      ...this.interactionDiagnostics,
      interactionMode: 'idle',
      controlMode: 'idle',
      grabbedHands: [],
      states: this.gripController.getDiagnostics(),
      events: [{ type: 'release', reason }]
    };
  }

  getInteractionDiagnostics() {
    return this.interactionDiagnostics;
  }


}
