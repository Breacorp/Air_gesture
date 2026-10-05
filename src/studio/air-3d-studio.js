/**
 * Air 3D Studio - Holographic Spatial CAD & 3D Model Manipulator
 * Manipulates .STL, .OBJ and procedural holographic models directly with hands:
 * - ☝️ Raycast laser pointer & contact reticle
 * - 🤏 Pinch grab & 3D translate (X, Y, Z depth)
 * - ✋✋ Two-hand spatial scale & orbital 360° rotation
 * - Auto-centering, Exploded View, CAD Telemetry, and Shading modes
 */

import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

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
    this.interactionMode = 'idle'; // 'idle' | 'fist_grab' | 'fine_pinch' | 'palm_levitate' | 'peace_explode' | 'palm_freeze' | 'bimanual'
    this.currentPoseLabel = 'LIBRE';
    this.grabAnchorHand = null;
    this.grabAnchorPalm = null;
    this.grabAnchorModelPos = new THREE.Vector3();
    this.grabAnchorModelRot = new THREE.Euler();
    this.grabAnchorHandAngles = null;
    this.grabAnchorPalmAngles = null;
    this.isHoveringModel = false;

    // Smoothed Target Transforms for fluid interpolation
    this.targetPosition = new THREE.Vector3(0, 0, 0);
    this.targetRotation = new THREE.Euler(0, 0, 0);
    this.targetScale = 1.0;

    // Two-hand anchors (Deterministic ratio-based scaling & 3D rotation)
    this.isTwoHandActive = false;
    this.anchorTwoHandDist = null;
    this.anchorTwoHandAngle = null;
    this.anchorTwoHandYaw = null;
    this.anchorTwoHandPitch = null;
    this.anchorTwoHandZ = null;
    this.anchorTwoHandAvgX = null;
    this.anchorTwoHandModelScale = 1.0;
    this.anchorTwoHandModelRot = new THREE.Euler();
    this.anchorTwoHandModelPos = new THREE.Vector3();
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
      color: 0x00f5d4,
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
      color: 0x00f5d4,
      transparent: true,
      opacity: 0.65
    });
    this.laserBeam = new THREE.Mesh(rayGeo, this.rayMat);
    this.laserBeam.visible = false;
    this.scene.add(this.laserBeam);

    // Holographic Contact Reticle (target circle on model intersection)
    const reticleGeo = new THREE.RingGeometry(0.035, 0.045, 32);
    this.reticleMat = new THREE.MeshBasicMaterial({
      color: 0x00f5d4,
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
      color: 0x00f5d4,
      emissive: 0x00f5d4,
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
      const bladeMat = this._createMaterial(0x00f5d4, 0.9, 0.2);
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
    const link2Mat = this._createMaterial(0x00f5d4, 0.8, 0.3);
    const link2 = new THREE.Mesh(link2Geo, link2Mat);
    link2.position.set(-0.25, 0.15, 0);
    link2.rotation.z = 0.6;
    group.add(link2);
    this.explodedMeshes.push({ mesh: link2, dir: new THREE.Vector3(0.3, 0.3, 0) });

    return group;
  }

  // --- MATERIAL FACTORY (SHADING MODES) ---
  _createMaterial(baseColorHex = 0x00f5d4, metalness = 0.8, roughness = 0.25) {
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
        color: 0x00f5d4,
        transparent: true,
        opacity: 0.35,
        transmission: 0.7,
        roughness: 0.1,
        metalness: 0.1
      });
    } else { // wireframe
      return new THREE.MeshBasicMaterial({
        color: 0x00f5d4,
        wireframe: true
      });
    }
  }

  setShadingMode(mode) {
    this.shadingMode = mode;
    this.modelContainer.traverse((child) => {
      if (child.isMesh) {
        const baseColor = child.material.color ? child.material.color.getHex() : 0x00f5d4;
        child.material = this._createMaterial(baseColor);
      }
    });
  }

  // --- AUTO-CENTERING & NORMALIZATION ---
  _installLoadedModel(model) {
    this.modelContainer.add(model);

    // Compute bounding box
    const box = new THREE.Box3().setFromObject(this.modelContainer);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Center model at container origin
    model.position.sub(center);

    // Compute dimensions and normalize scale to fit comfortably in holographic stage (~1.6 units)
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const targetScale = 1.6 / maxDim;
    this.modelContainer.scale.setScalar(targetScale);

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
    this.modelContainer.rotation.set(0, 0, 0);
    this.targetPosition.set(0, 0, 0);
    this.targetRotation.set(0, 0, 0);
    this.targetScale = targetScale;
    this.isGrabbing = false;
    this.grabAnchorHand = null;
    this.grabAnchorHandAngles = null;
    this.isTwoHandActive = false;

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

    const material = this._createMaterial(0x00f5d4, 0.85, 0.2);
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
    const s = this.modelMetadata.scale || 1.0;
    this.targetPosition.set(0, 0, 0);
    this.targetRotation.set(0, 0, 0);
    this.targetScale = s;
    this.modelContainer.position.set(0, 0, 0);
    this.modelContainer.rotation.set(0, 0, 0);
    this.modelContainer.scale.setScalar(s);
    this.isGrabbing = false;
    this.grabAnchorHand = null;
    this.grabAnchorHandAngles = null;
    this.isTwoHandActive = false;
    this.setExplodedView(0);
    this.boxHelper.update();
  }

  // --- TONY STARK SPATIAL GESTURE DRIVER ---
  update(kinematicData) {
    if (!this.isActive) return;

    // Gentle idle rotation if enabled and not grabbing/interacting
    if (this.autoRotate && !this.isGrabbing && !this.isTwoHandActive) {
      this.targetRotation.y += 0.008;
      this.pedestalRing.rotation.z += 0.005;
      this.pedestalInnerRing.rotation.z -= 0.007;
    }

    const { Left, Right } = kinematicData;

    // 1. DUAL-HAND INTERACTION (Two-Hand Scale & 3D Orbital Rotation)
    if (Left && Right) {
      // Disengage single-hand grabbing cleanly to avoid stale anchor snaps
      if (this.isGrabbing) {
        this.isGrabbing = false;
        this.grabAnchorHand = null;
        this.grabAnchorHandAngles = null;
      }
      this._handleTwoHandInteraction(Left, Right);
      this.laserBeam.visible = false;
      this.reticle.visible = false;
    } else {
      // Cleanly reset two-hand interaction anchors when exiting dual-hand mode
      this.isTwoHandActive = false;
      this.anchorTwoHandDist = null;
      this.anchorTwoHandAngle = null;
      this.anchorTwoHandYaw = null;
      this.anchorTwoHandPitch = null;
      this.anchorTwoHandZ = null;
      this.anchorTwoHandAvgX = null;

      // 2. SINGLE HAND INTERACTION (Raycasting, Proximity, Pinch Grab & Translate)
      const primaryHand = Right || Left;
      if (primaryHand) {
        this._handleSingleHandInteraction(primaryHand);
      } else {
        this.isGrabbing = false;
        this.grabAnchorHand = null;
        this.grabAnchorHandAngles = null;
        this.laserBeam.visible = false;
        this.reticle.visible = false;
      }
    }

    // 3. Smooth Damping (Lerp) towards Target Transformations
    // Eliminates micro-tremors and guarantees smooth grab/release transitions
    this.modelContainer.position.lerp(this.targetPosition, 0.35);

    // Smooth rotation damping
    this.modelContainer.rotation.x += (this.targetRotation.x - this.modelContainer.rotation.x) * 0.35;
    this.modelContainer.rotation.y += (this.targetRotation.y - this.modelContainer.rotation.y) * 0.35;
    this.modelContainer.rotation.z += (this.targetRotation.z - this.modelContainer.rotation.z) * 0.35;

    // Smooth scale damping
    const currentScale = this.modelContainer.scale.x;
    const nextScale = currentScale + (this.targetScale - currentScale) * 0.35;
    this.modelContainer.scale.setScalar(nextScale);

    this.boxHelper.update();
  }

  _handleSingleHandInteraction(hand) {
    const rawTip = hand.points && hand.points[8];
    const rawWrist = hand.points && hand.points[0];
    const palm = hand.palm;
    const pose = hand.pose;
    if (!rawTip || !rawWrist || !palm || !pose) return;

    // Use true 3D world positions from visualizer matching screen projection
    const tip = hand.tipWorld || (hand.worldPoints ? hand.worldPoints[8] : new THREE.Vector3(rawTip.x, rawTip.y, rawTip.z));
    const wrist = hand.worldPoints ? hand.worldPoints[0] : new THREE.Vector3(rawWrist.x, rawWrist.y, rawWrist.z);
    const palmPos = hand.palmWorld || (palm ? new THREE.Vector3(palm.position.x, palm.position.y, palm.position.z) : tip);

    // Forward pointing ray from finger into the holographic space (-Z direction)
    const dir = new THREE.Vector3(
      tip.x - wrist.x,
      tip.y - wrist.y,
      -Math.max(0.4, Math.abs(tip.z - wrist.z))
    ).normalize();

    this.laserBeam.position.copy(tip);
    this.laserBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

    // Hide laser during full hand gestures (fist, open palm) for clean immersion
    const hideLaser = pose.isFist || pose.isOpenPalm;
    this.laserBeam.visible = !hideLaser;

    // Raycast intersection test with 3D model
    this.raycaster.set(tip, dir);
    const intersects = this.raycaster.intersectObjects(this.modelContainer.children, true);

    const distToModel = tip.distanceTo(this.modelContainer.position);
    const palmDistToModel = palmPos.distanceTo(this.modelContainer.position);
    const isCloseProximity = distToModel < 1.6 || palmDistToModel < 1.8;

    if (intersects.length > 0) {
      const hit = intersects[0];
      this.reticle.position.copy(hit.point);
      this.reticle.lookAt(this.camera.position);
      this.reticle.visible = !hideLaser;
      this.laserBeam.scale.set(1, 1, hit.distance);
      this.isHoveringModel = true;
    } else {
      this.reticle.visible = false;
      this.laserBeam.scale.set(1, 1, 2.5);
      this.isHoveringModel = isCloseProximity;
    }

    // =========================================================================
    // NATURAL POSE MATRIX - ABSOLUTE DIRECT 3D SPATIAL CONTROL
    // =========================================================================

    // 1. GESTURE: POWER GRAB (FIST / PUÑO CERRADO)
    // Clenching all fingers into a fist grabs the model firmly with 6-DOF direct control
    if (pose.isFist) {
      if (this.interactionMode !== 'fist_grab') {
        if (this.isHoveringModel || this.isGrabbing) {
          this.interactionMode = 'fist_grab';
          this.isGrabbing = true;
          this.grabAnchorPalm = palmPos.clone();
          this.grabAnchorModelPos = this.targetPosition.clone();
          this.grabAnchorModelRot = this.targetRotation.clone();
          this.grabAnchorPalmAngles = { ...palm.orientation };
          this.currentPoseLabel = '✊ PUÑO (AGARRE TOTAL)';
          if (this.rayMat) this.rayMat.color.setHex(0x10b981);
        }
      } else {
        // Direct 6-DOF follow: Position
        const dx = (palmPos.x - this.grabAnchorPalm.x) * 1.5;
        const dy = (palmPos.y - this.grabAnchorPalm.y) * 1.5;
        const dz = (palmPos.z - this.grabAnchorPalm.z) * 2.2;

        this.targetPosition.set(
          this.grabAnchorModelPos.x + dx,
          this.grabAnchorModelPos.y + dy,
          Math.max(-3.5, Math.min(2.0, this.grabAnchorModelPos.z + dz))
        );

        // Direct 6-DOF follow: Orientation from palm roll/pitch/yaw
        if (palm.orientation && this.grabAnchorPalmAngles) {
          const dRoll = palm.orientation.roll - this.grabAnchorPalmAngles.roll;
          const dPitch = palm.orientation.pitch - this.grabAnchorPalmAngles.pitch;
          const dYaw = palm.orientation.yaw - this.grabAnchorPalmAngles.yaw;

          this.targetRotation.z = this.grabAnchorModelRot.z - THREE.MathUtils.degToRad(dRoll);
          this.targetRotation.x = this.grabAnchorModelRot.x - THREE.MathUtils.degToRad(dPitch);
          this.targetRotation.y = this.grabAnchorModelRot.y - THREE.MathUtils.degToRad(dYaw);
        }
      }
      return;
    }

    // 2. GESTURE: PALM LEVITATION (PALMA ABIERTA HACIA ARRIBA)
    // Holding an open palm facing upward causes the 3D model to levitate smoothly directly above your hand
    const isPalmUp = pose.isOpenPalm && palm.normal.y > 0.40;
    if (isPalmUp) {
      this.interactionMode = 'palm_levitate';
      this.isGrabbing = true;
      this.currentPoseLabel = '✋ LEVITANDO EN PALMA';

      // Hover directly above the palm center with a dynamic subtle float
      const hoverHeight = 0.45;
      const hoverFloat = Math.sin(performance.now() * 0.003) * 0.02;
      const targetZ = -(palmPos.z) * 1.8;

      this.targetPosition.set(
        palmPos.x,
        palmPos.y + hoverHeight + hoverFloat,
        Math.max(-3.0, Math.min(1.5, targetZ))
      );

      // Subtle tilt mirroring palm orientation
      if (palm.orientation) {
        this.targetRotation.z = -THREE.MathUtils.degToRad(palm.orientation.roll * 0.4);
        this.targetRotation.x = -THREE.MathUtils.degToRad(palm.orientation.pitch * 0.4);
      }
      return;
    }

    // 3. GESTURE: STOP / FREEZE (PALMA ABIERTA DE FRENTE A LA CÁMARA)
    // Showing an open stop-palm locks the model in space and freezes auto-rotation
    const isStopPalm = pose.isOpenPalm && palm.isFacingCamera;
    if (isStopPalm) {
      this.interactionMode = 'palm_freeze';
      this.isGrabbing = false;
      this.currentPoseLabel = '🛑 ANCLADO / FRENO';
      this.targetPosition.copy(this.modelContainer.position);
      this.targetRotation.copy(this.modelContainer.rotation);
      return;
    }

    // 4. GESTURE: SCISSORS / PEACE (DESPIECE HOLOGRÁFICO)
    // Index + Middle extended (Peace / Scissors) controls Exploded View by spreading or closing the two fingers
    if (pose.isPeace) {
      this.interactionMode = 'peace_explode';
      this.currentPoseLabel = '✌️ DESPIECE CON DOS DEDOS';

      const tipIndex = hand.points[8];
      const tipMiddle = hand.points[12];
      if (tipIndex && tipMiddle) {
        const fingerDist = Math.hypot(tipIndex.x - tipMiddle.x, tipIndex.y - tipMiddle.y);
        // Finger spread between 0.04 (closed) and 0.16 (wide open scissors) maps to 0% - 100% exploded factor
        const explodeFactor = Math.max(0, Math.min(1, (fingerDist - 0.04) / 0.12));
        this.setExplodedView(explodeFactor);

        const slider = document.getElementById('slider-exploded');
        const lbl = document.getElementById('lbl-exploded-pct');
        if (slider) slider.value = explodeFactor;
        if (lbl) lbl.textContent = `${Math.round(explodeFactor * 100)}%`;
      }
      return;
    }

    // 5. GESTURE: PRECISION PINCH (PULGAR + ÍNDICE)
    // Fine pinch for surgical precision positioning
    if (pose.isPinchThumbIndex) {
      if (this.interactionMode !== 'fine_pinch') {
        if (this.isHoveringModel || this.isGrabbing) {
          this.interactionMode = 'fine_pinch';
          this.isGrabbing = true;
          this.grabAnchorHand = tip.clone();
          this.grabAnchorModelPos = this.targetPosition.clone();
          this.grabAnchorModelRot = this.targetRotation.clone();
          this.grabAnchorHandAngles = { ...hand.angles };
          this.currentPoseLabel = '🤏 PINZA (AJUSTE FINO)';
          if (this.rayMat) this.rayMat.color.setHex(0x10b981);
          if (this.reticleMat) this.reticleMat.color.setHex(0x10b981);
        }
      } else {
        const deltaX = (tip.x - this.grabAnchorHand.x) * 1.5;
        const deltaY = (tip.y - this.grabAnchorHand.y) * 1.5;
        const deltaZ = (tip.z - this.grabAnchorHand.z) * 2.2;

        this.targetPosition.set(
          this.grabAnchorModelPos.x + deltaX,
          this.grabAnchorModelPos.y + deltaY,
          Math.max(-3.5, Math.min(2.0, this.grabAnchorModelPos.z + deltaZ))
        );

        if (hand.angles && this.grabAnchorHandAngles) {
          const dRoll = (hand.angles.roll || 0) - this.grabAnchorHandAngles.roll;
          const dPitch = (hand.angles.pitch || 0) - this.grabAnchorHandAngles.pitch;
          const deadzone = 8;
          if (Math.abs(dRoll) > deadzone) {
            this.targetRotation.z = this.grabAnchorModelRot.z - THREE.MathUtils.degToRad(dRoll - Math.sign(dRoll) * deadzone);
          }
          if (Math.abs(dPitch) > deadzone) {
            this.targetRotation.x = this.grabAnchorModelRot.x - THREE.MathUtils.degToRad(dPitch - Math.sign(dPitch) * deadzone);
          }
        }
      }
      return;
    }

    // 6. NO ACTIVE GESTURE / RELEASED
    if (this.isGrabbing) {
      this.isGrabbing = false;
      this.grabAnchorHand = null;
      this.grabAnchorPalm = null;
      this.grabAnchorHandAngles = null;
      this.grabAnchorPalmAngles = null;
    }
    this.interactionMode = 'idle';
    this.currentPoseLabel = 'LIBRE';
    if (this.rayMat) this.rayMat.color.setHex(0x00f5d4);
    if (this.reticleMat) this.reticleMat.color.setHex(0x00f5d4);
  }

  _handleTwoHandInteraction(leftHand, rightHand) {
    this.currentPoseLabel = '✋✋ CONTROL BIMANUAL';

    const leftRaw = leftHand.points && leftHand.points[8] ? leftHand.points[8] : leftHand.palm.center;
    const rightRaw = rightHand.points && rightHand.points[8] ? rightHand.points[8] : rightHand.palm.center;
    if (!leftRaw || !rightRaw) return;

    const leftTip = leftHand.tipWorld || (leftHand.worldPoints ? leftHand.worldPoints[8] : new THREE.Vector3(leftRaw.x, leftRaw.y, leftRaw.z));
    const rightTip = rightHand.tipWorld || (rightHand.worldPoints ? rightHand.worldPoints[8] : new THREE.Vector3(rightRaw.x, rightRaw.y, rightRaw.z));

    const dx = rightTip.x - leftTip.x;
    const dy = rightTip.y - leftTip.y;
    const dz = rightTip.z - leftTip.z; // differential depth

    const currentDist = Math.hypot(dx, dy);
    const currentAngle = Math.atan2(dy, dx);
    const currentAvgZ = (leftTip.z + rightTip.z) / 2;
    const currentAvgY = (leftTip.y + rightTip.y) / 2;
    const currentAvgX = (leftTip.x + rightTip.x) / 2;

    if (!this.isTwoHandActive) {
      // Initialize two-hand anchor
      this.isTwoHandActive = true;
      this.anchorTwoHandDist = Math.max(0.08, currentDist);
      this.anchorTwoHandAngle = currentAngle;
      this.anchorTwoHandYaw = dz;
      this.anchorTwoHandPitch = currentAvgY;
      this.anchorTwoHandZ = currentAvgZ;
      this.anchorTwoHandAvgX = currentAvgX;
      this.anchorTwoHandModelScale = this.targetScale;
      this.anchorTwoHandModelRot = this.targetRotation.clone();
      this.anchorTwoHandModelPos = this.targetPosition.clone();
    } else {
      // 1. Two-Hand Deterministic Scaling (Ratio-based, zero accumulation drift)
      const distRatio = currentDist / this.anchorTwoHandDist;
      const newScale = Math.max(0.15, Math.min(6.0, this.anchorTwoHandModelScale * distRatio));
      this.targetScale = newScale;
      this.modelMetadata.scale = Math.round(newScale * 100) / 100;
      if (this.onMetadataUpdate) this.onMetadataUpdate(this.modelMetadata);

      // 2. Two-Hand Roll Rotation (Steering wheel Z-axis)
      let angleDelta = currentAngle - this.anchorTwoHandAngle;
      while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
      while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
      this.targetRotation.z = this.anchorTwoHandModelRot.z + angleDelta * 1.2;

      // 3. Two-Hand 360° Yaw Rotation (Differential depth around Y-axis)
      // Pushing right hand forward & left hand back rotates model smoothly around vertical axis
      const yawDelta = (dz - this.anchorTwoHandYaw) * 3.5;
      this.targetRotation.y = this.anchorTwoHandModelRot.y - yawDelta;

      // 4. Two-Hand Pitch Rotation (Vertical tilt around X-axis)
      const pitchDelta = (currentAvgY - this.anchorTwoHandPitch) * 2.0;
      this.targetRotation.x = this.anchorTwoHandModelRot.x - pitchDelta;

      // 5. Dual-Hand Depth Translation (Z-axis push/pull)
      // Pushing hands toward camera pushes model deeper into scene (-Z); pulling toward body brings model towards user (+Z)
      const zDelta = (currentAvgZ - this.anchorTwoHandZ) * 2.2;
      this.targetPosition.z = Math.max(-3.5, Math.min(2.0, this.anchorTwoHandModelPos.z + zDelta));

      // 6. Dual-Hand Lateral Translation (X-axis)
      const xDelta = (currentAvgX - this.anchorTwoHandAvgX) * 1.5;
      this.targetPosition.x = this.anchorTwoHandModelPos.x + xDelta;
    }
  }
}
