/**
 * Air Physics Lab - Spatial Rigid Body Sandbox & Throw Engine
 * Powered by Cannon-es + Three.js + Air Gesture Kinematics:
 * - 🤏 Single-hand Precision Grab & Physics Throw with Temporal Velocity Window
 * - ✋✋ Two-hand Bimanual Scale & Dual-hand Throw
 * - 🌍 Dynamic Gravity Modes (Earth, Moon, Zero-G, Inverted)
 * - 💥 Real Collisions, Restitution Bounces, and Impact Sparkles
 * - 🧊 Geometric Bodies: Holographic Cubes, Spheres, Cylinders
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { VirtualProxy } from '../core/spatial/virtual-proxy.js';

export class AirPhysicsLab {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    this.isActive = false;

    // Root Three.js Group
    this.labGroup = new THREE.Group();
    this.labGroup.name = 'air-physics-lab-root';
    this.labGroup.visible = false;
    this.scene.add(this.labGroup);

    // Tracked Physical Object Proxies (Fase 3: Real Object Controllers)
    this.proxies = new Map(); // entityId -> VirtualProxy

    // Physics World (Cannon-es)
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 10;

    // Contact Materials
    this.defaultMaterial = new CANNON.Material('default');
    this.contactMaterial = new CANNON.ContactMaterial(
      this.defaultMaterial,
      this.defaultMaterial,
      {
        friction: 0.35,
        restitution: 0.72 // Bouncy & lively
      }
    );
    this.world.addContactMaterial(this.contactMaterial);
    this.world.defaultContactMaterial = this.contactMaterial;

    // Collections
    this.bodies = []; // [{ mesh, body, initialScale }]
    this.grabbedBody = null;
    this.grabHandSide = null;
    this.grabOffset = new CANNON.Vec3();

    // Temporal Velocity Estimator (Sliding Window for realistic, jitter-free throws)
    this.sampleWindow = []; // [{ pos: Vector3, time: number }]
    this.maxWindowDurationMs = 120; // 120ms window for throwing physics

    // Bimanual Grab State
    this.isBimanualGrabbing = false;
    this.bimanualAnchorDist = null;
    this.bimanualInitialScale = 1.0;

    // Stage Setup
    this._setupPhysicsStage();

    // Default Telemetry
    this.stats = {
      bodyCount: 0,
      lastThrowSpeed: 0,
      gravityMode: 'Tierra (9.8 m/s²)',
      heldBody: 'Ninguno'
    };
    this.onStatsUpdate = null;

    // Spawn Initial Objects
    this._spawnDefaultObjects();
  }

  // --- STAGE & BOUNDARIES ---
  _setupPhysicsStage() {
    // 1. Holographic Floor Plane
    const floorGeo = new THREE.BoxGeometry(4.2, 0.1, 4.2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a101f,
      roughness: 0.4,
      metalness: 0.8,
      transparent: true,
      opacity: 0.85
    });
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.position.y = -1.2;
    this.labGroup.add(this.floorMesh);

    // Floor Grid Line Helper
    const grid = new THREE.GridHelper(4.2, 14, 0x00f5d4, 0x1f293d);
    grid.position.y = -1.14;
    this.labGroup.add(grid);

    // Cannon Floor Body
    const floorShape = new CANNON.Box(new CANNON.Vec3(2.1, 0.05, 2.1));
    this.floorBody = new CANNON.Body({ mass: 0, material: this.defaultMaterial });
    this.floorBody.addShape(floorShape);
    this.floorBody.position.set(0, -1.2, 0);
    this.world.addBody(this.floorBody);

    // 2. Invisible Containment Boundary Walls (keeps thrown objects within view)
    const wallThickness = 0.1;
    const wallHeight = 4.0;
    const halfWidth = 2.1;

    const wallConfigs = [
      { pos: [0, 0.8, -halfWidth], size: [halfWidth, wallHeight / 2, wallThickness] }, // Back
      { pos: [0, 0.8, halfWidth], size: [halfWidth, wallHeight / 2, wallThickness] },  // Front
      { pos: [-halfWidth, 0.8, 0], size: [wallThickness, wallHeight / 2, halfWidth] }, // Left
      { pos: [halfWidth, 0.8, 0], size: [wallThickness, wallHeight / 2, halfWidth] },  // Right
      { pos: [0, 2.8, 0], size: [halfWidth, wallThickness, halfWidth] }                // Ceiling
    ];

    for (const w of wallConfigs) {
      const shape = new CANNON.Box(new CANNON.Vec3(...w.size));
      const body = new CANNON.Body({ mass: 0, material: this.defaultMaterial });
      body.addShape(shape);
      body.position.set(...w.pos);
      this.world.addBody(body);
    }
  }

  setActive(active) {
    this.isActive = active;
    this.labGroup.visible = active;
    if (!active && this.grabbedBody) {
      this._releaseBody(null);
    }
  }

  // --- OBJECT SPAWNING ---
  resetScene() {
    this._spawnDefaultObjects();
  }

  _spawnDefaultObjects() {
    this.clearAllObjects();

    // Spawn 2 Cubes, 2 Spheres, 1 Cylinder in an appealing holographic stack
    this.spawnCube(-0.6, -0.4, 0, 0.28, 0x00f5d4);
    this.spawnCube(0.6, -0.4, 0, 0.28, 0x00bbf9);
    this.spawnSphere(0, 0.2, 0, 0.22, 0xff007f);
    this.spawnSphere(-0.4, 0.6, -0.2, 0.18, 0xffd166);
    this.spawnCylinder(0.4, 0.5, 0.2, 0.16, 0.32, 0xa100ff);
  }

  spawnCube(x = 0, y = 0.5, z = 0, size = 0.28, color = 0x00f5d4) {
    const halfSize = size / 2;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = this._createObjectMaterial(color);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    this.labGroup.add(mesh);

    const shape = new CANNON.Box(new CANNON.Vec3(halfSize, halfSize, halfSize));
    const body = new CANNON.Body({
      mass: 1.2,
      material: this.defaultMaterial,
      linearDamping: 0.05,
      angularDamping: 0.1
    });
    body.addShape(shape);
    body.position.set(x, y, z);
    this.world.addBody(body);

    const entry = { mesh, body, type: 'cube', initialScale: 1.0, color };
    this.bodies.push(entry);
    this._updateTelemetry();
    return entry;
  }

  spawnSphere(x = 0, y = 0.5, z = 0, radius = 0.22, color = 0xff007f) {
    const geo = new THREE.SphereGeometry(radius, 24, 24);
    const mat = this._createObjectMaterial(color);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    this.labGroup.add(mesh);

    const shape = new CANNON.Sphere(radius);
    const body = new CANNON.Body({
      mass: 0.9,
      material: this.defaultMaterial,
      linearDamping: 0.03,
      angularDamping: 0.08
    });
    body.addShape(shape);
    body.position.set(x, y, z);
    this.world.addBody(body);

    const entry = { mesh, body, type: 'sphere', initialScale: 1.0, color };
    this.bodies.push(entry);
    this._updateTelemetry();
    return entry;
  }

  spawnCylinder(x = 0, y = 0.5, z = 0, radius = 0.16, height = 0.32, color = 0xa100ff) {
    const geo = new THREE.CylinderGeometry(radius, radius, height, 24);
    const mat = this._createObjectMaterial(color);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    this.labGroup.add(mesh);

    const shape = new CANNON.Cylinder(radius, radius, height, 16);
    const body = new CANNON.Body({
      mass: 1.1,
      material: this.defaultMaterial,
      linearDamping: 0.05,
      angularDamping: 0.1
    });
    // Cannon cylinder orientation alignment
    const q = new CANNON.Quaternion();
    q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
    body.addShape(shape, new CANNON.Vec3(), q);
    body.position.set(x, y, z);
    this.world.addBody(body);

    const entry = { mesh, body, type: 'cylinder', initialScale: 1.0, color };
    this.bodies.push(entry);
    this._updateTelemetry();
    return entry;
  }

  _createObjectMaterial(colorHex) {
    return new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.8,
      transparent: true,
      opacity: 0.92
    });
  }

  clearAllObjects() {
    for (const item of this.bodies) {
      this.labGroup.remove(item.mesh);
      item.mesh.geometry.dispose();
      item.mesh.material.dispose();
      this.world.removeBody(item.body);
    }
    this.bodies = [];
    this.grabbedBody = null;
    this._updateTelemetry();
  }

  // --- GRAVITY PRESETS ---
  setGravity(preset) {
    if (preset === 'moon') {
      this.world.gravity.set(0, -1.62, 0);
      this.stats.gravityMode = '🌙 Luna (1.6 m/s²)';
    } else if (preset === 'zero') {
      this.world.gravity.set(0, 0, 0);
      this.stats.gravityMode = '🪐 Gravedad Cero (0 m/s²)';
    } else if (preset === 'inverted') {
      this.world.gravity.set(0, 9.82, 0);
      this.stats.gravityMode = '🧲 Invertida (-9.8 m/s²)';
    } else { // 'earth'
      this.world.gravity.set(0, -9.82, 0);
      this.stats.gravityMode = '🌍 Tierra (9.8 m/s²)';
    }
    this._updateTelemetry();
  }

  setRestitution(restitution) {
    this.contactMaterial.restitution = Math.max(0.1, Math.min(0.98, restitution));
  }

  // --- MAIN KINEMATIC UPDATE LOOP ---
  update(kinematicData, worldModel) {
    if (!this.isActive) return;

    const dt = 1 / 60;
    this.world.step(dt);

    const { Left, Right } = kinematicData;

    // 1. Process Bimanual Interaction (Scale & 2-Hand Control)
    if (Left && Right) {
      this._handleBimanualInteraction(Left, Right);
    } else {
      this.isBimanualGrabbing = false;
      this.bimanualAnchorDist = null;

      // 2. Process Single-Hand Interaction (Pinch Grab, Move, Temporal Throw)
      const primaryHand = Right || Left;
      if (primaryHand) {
        this._handleSingleHandInteraction(primaryHand);
      } else {
        if (this.grabbedBody) {
          this._releaseBody(null);
        }
      }
    }

    // 3. Process Physical Object Virtual Proxies (Fase 3: Real Object Controller)
    if (worldModel) {
      this._syncProxiesFromWorldModel(worldModel);
    }

    // 4. Sync Three.js Meshes with Cannon.js Rigid Bodies
    for (const item of this.bodies) {
      item.mesh.position.copy(item.body.position);
      item.mesh.quaternion.copy(item.body.quaternion);
    }
  }

  // --- FASE 3: PHYSICAL OBJECT VIRTUAL PROXIES ---
  _syncProxiesFromWorldModel(worldModel) {
    if (!worldModel) return;

    const objects = [
      ...worldModel.getEntitiesByType('object'),
      ...worldModel.getEntitiesByType('prop')
    ];

    const activeIds = new Set();
    const unprojectFn = (u, v, z) => this._unprojectUV(u, v, z);

    for (const obj of objects) {
      if (obj.missingFrames > 0) continue;
      activeIds.add(obj.id);

      let proxy = this.proxies.get(obj.id);
      if (!proxy) {
        proxy = new VirtualProxy({
          entityId: obj.id,
          visualScene: this.labGroup,
          physicsWorld: this.world,
          colorHex: obj.customProps?.colorHex || 0xff6b35,
          radius: obj.customProps?.radius || 0.12
        });
        this.proxies.set(obj.id, proxy);
      }

      // Check if TrackingFusion released this object with throw velocity
      if (obj.customProps?.throwVelocity && proxy.state !== 'dynamic') {
        proxy.launch(obj.customProps.throwVelocity);
        obj.customProps.throwVelocity = null; // Consume event
      } else {
        proxy.syncFromEntity(obj, unprojectFn);
      }

      proxy.render();
    }

    // Clean up proxies for entities that were removed
    for (const [id, proxy] of this.proxies.entries()) {
      if (!activeIds.has(id)) {
        if (proxy.state !== 'dynamic') {
          proxy.dispose();
          this.proxies.delete(id);
        } else {
          // If in dynamic flight, let it render Cannon physics until it settles or falls out
          proxy.render();
          if (proxy.body.position.y < -3.0 || performance.now() - proxy.lastEntitySeenTime > 8000) {
            proxy.dispose();
            this.proxies.delete(id);
          }
        }
      }
    }
  }

  _unprojectUV(u, v, z = 0) {
    const screenAspect = (this.renderer?.domElement?.clientWidth || window.innerWidth) / 
                         (this.renderer?.domElement?.clientHeight || window.innerHeight);
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

  _handleSingleHandInteraction(hand) {
    const rawTip = hand.points && hand.points[8];
    const palm = hand.palm;
    const pose = hand.pose;
    if (!rawTip || !palm || !pose) return;

    // Convert hand to 3D workspace coordinates using exact visualizer world positions
    const tipPos = hand.pinchWorld || hand.tipWorld || (hand.worldPoints ? hand.worldPoints[8] : new THREE.Vector3(rawTip.x, rawTip.y, rawTip.z));
    const now = performance.now();

    // Check if hand is pinching or making a fist
    const isPinch = pose.isPinchThumbIndex;
    const isFist = pose.isFist;
    const isGripActive = isPinch || isFist;

    if (isGripActive) {
      if (!this.grabbedBody) {
        // Find nearest dynamic body within grab reach (< 0.55m)
        let nearestItem = null;
        let minDist = 0.55;

        for (const item of this.bodies) {
          const bodyPos = new THREE.Vector3(item.body.position.x, item.body.position.y, item.body.position.z);
          const d = tipPos.distanceTo(bodyPos);
          if (d < minDist) {
            minDist = d;
            nearestItem = item;
          }
        }

        if (nearestItem) {
          // GRAB INITIATED
          this.grabbedBody = nearestItem;
          this.grabHandSide = hand.handedness;
          this.sampleWindow = [];
          this.stats.heldBody = nearestItem.type.toUpperCase();

          // Freeze body physics dynamics while held
          this.grabbedBody.body.type = CANNON.Body.KINEMATIC;
          this.grabbedBody.body.velocity.set(0, 0, 0);
          this.grabbedBody.body.angularVelocity.set(0, 0, 0);

          // Highlight held body visually
          this.grabbedBody.mesh.material.emissiveIntensity = 0.9;
        }
      } else {
        // CONTINUOUS HOLD & MOVE
        // Smoothly position body towards hand tip
        this.grabbedBody.body.position.set(tipPos.x, tipPos.y, tipPos.z);

        // Record temporal sample into sliding window for momentum throwing
        this.sampleWindow.push({ pos: tipPos.clone(), time: now });

        // Clean out samples older than maxWindowDurationMs (120ms)
        while (this.sampleWindow.length > 0 && now - this.sampleWindow[0].time > this.maxWindowDurationMs) {
          this.sampleWindow.shift();
        }
      }
    } else {
      // RELEASE / THROW
      if (this.grabbedBody) {
        this._releaseBody(hand);
      }
    }
  }

  _releaseBody(hand) {
    if (!this.grabbedBody) return;

    const bodyEntry = this.grabbedBody;
    const body = bodyEntry.body;

    // Restore body to dynamic rigid body
    body.type = CANNON.Body.DYNAMIC;
    bodyEntry.mesh.material.emissiveIntensity = 0.35;

    // Calculate Throw Velocity from Temporal Sliding Window (Weighted Linear Regression)
    let throwVelocity = new THREE.Vector3(0, 0, 0);

    if (this.sampleWindow.length >= 2) {
      const newest = this.sampleWindow[this.sampleWindow.length - 1];
      const oldest = this.sampleWindow[0];
      const dt = Math.max(0.015, (newest.time - oldest.time) / 1000);

      // Raw velocity delta
      throwVelocity.subVectors(newest.pos, oldest.pos).divideScalar(dt);

      // Momentum boost multiplier for satisfying real-feel throwing physics
      const throwSpeed = throwVelocity.length();
      const boost = 2.4;
      throwVelocity.multiplyScalar(boost);

      // Apply linear velocity to Cannon body
      body.velocity.set(throwVelocity.x, throwVelocity.y, throwVelocity.z);

      // Apply realistic angular spin based on wrist orientation delta
      if (hand && hand.wrist && hand.wrist.velocity) {
        body.angularVelocity.set(
          (Math.random() - 0.5) * throwSpeed * 4.0,
          (Math.random() - 0.5) * throwSpeed * 4.0,
          (Math.random() - 0.5) * throwSpeed * 4.0
        );
      }

      this.stats.lastThrowSpeed = Math.round(throwSpeed * boost * 10) / 10;
    }

    this.grabbedBody = null;
    this.grabHandSide = null;
    this.sampleWindow = [];
    this.stats.heldBody = 'Ninguno';
    this._updateTelemetry();
  }

  // --- TWO-HAND INTERACTION (SCALE & DUAL THROW) ---
  _handleBimanualInteraction(leftHand, rightHand) {
    const leftRaw = leftHand.points && leftHand.points[8];
    const rightRaw = rightHand.points && rightHand.points[8];
    if (!leftRaw || !rightRaw) return;

    const leftTip = leftHand.pinchWorld || leftHand.tipWorld || (leftHand.worldPoints ? leftHand.worldPoints[8] : new THREE.Vector3(leftRaw.x, leftRaw.y, leftRaw.z));
    const rightTip = rightHand.pinchWorld || rightHand.tipWorld || (rightHand.worldPoints ? rightHand.worldPoints[8] : new THREE.Vector3(rightRaw.x, rightRaw.y, rightRaw.z));

    const midPoint = new THREE.Vector3().addVectors(leftTip, rightTip).multiplyScalar(0.5);
    const dist = leftTip.distanceTo(rightTip);

    const isLeftGrip = leftHand.pose && (leftHand.pose.isPinchThumbIndex || leftHand.pose.isFist);
    const isRightGrip = rightHand.pose && (rightHand.pose.isPinchThumbIndex || rightHand.pose.isFist);

    if (isLeftGrip && isRightGrip) {
      if (!this.grabbedBody) {
        // Find body nearest to midPoint between both hands
        let nearestItem = null;
        let minDist = 0.7;

        for (const item of this.bodies) {
          const bodyPos = new THREE.Vector3(item.body.position.x, item.body.position.y, item.body.position.z);
          const d = midPoint.distanceTo(bodyPos);
          if (d < minDist) {
            minDist = d;
            nearestItem = item;
          }
        }

        if (nearestItem) {
          this.grabbedBody = nearestItem;
          this.isBimanualGrabbing = true;
          this.bimanualAnchorDist = dist;
          this.bimanualInitialScale = nearestItem.initialScale;
          this.stats.heldBody = `${nearestItem.type.toUpperCase()} (2 MANOS)`;

          this.grabbedBody.body.type = CANNON.Body.KINEMATIC;
          this.grabbedBody.body.velocity.set(0, 0, 0);
          this.grabbedBody.mesh.material.emissiveIntensity = 0.9;
        }
      } else {
        // Continuous Bimanual Hold: Move with midpoint & Scale with hand separation
        this.grabbedBody.body.position.set(midPoint.x, midPoint.y, midPoint.z);

        if (this.bimanualAnchorDist && this.bimanualAnchorDist > 0.05) {
          const scaleRatio = dist / this.bimanualAnchorDist;
          const nextScale = Math.max(0.4, Math.min(3.0, this.bimanualInitialScale * scaleRatio));
          this.grabbedBody.mesh.scale.setScalar(nextScale);
          // Scale collision shape
          if (this.grabbedBody.body.shapes[0]) {
            this.grabbedBody.body.shapes[0].transform = undefined; // trigger update
          }
        }

        // Record midpoint sample
        this.sampleWindow.push({ pos: midPoint.clone(), time: performance.now() });
        while (this.sampleWindow.length > 0 && performance.now() - this.sampleWindow[0].time > this.maxWindowDurationMs) {
          this.sampleWindow.shift();
        }
      }
    } else {
      if (this.grabbedBody && this.isBimanualGrabbing) {
        this._releaseBody(rightHand);
        this.isBimanualGrabbing = false;
      }
    }
  }

  _updateTelemetry() {
    this.stats.bodyCount = this.bodies.length;
    if (this.onStatsUpdate) {
      this.onStatsUpdate(this.stats);
    }
  }
}
