/**
 * VirtualProxy - Bridge between Physical Tracked Entities and 3D Virtual / Physics Worlds
 * 
 * Creates and maintains a live synchronized virtual counterpart (Three.js Mesh + Cannon-es RigidBody)
 * for a physical entity (such as obj-orange-01).
 * 
 * Modes:
 * - KINEMATIC / FOLLOWING: Follows real-world object position in real time. Collides with virtual objects!
 * - HELD: Follows hand grip position.
 * - DYNAMIC: When released/thrown, transitions to full physics simulation with realistic momentum and gravity!
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class VirtualProxy {
  /**
   * @param {Object} options
   * @param {string} options.entityId Identifier of physical entity (e.g. 'obj-orange-01')
   * @param {THREE.Scene} options.visualScene Three.js scene
   * @param {CANNON.World} options.physicsWorld Cannon-es physics world
   * @param {string} [options.shapeType='sphere'] 'sphere' | 'box' | 'cylinder'
   * @param {number|string} [options.colorHex=0xff6b35] Base color
   * @param {number} [options.radius=0.12] Physical radius
   */
  constructor(options) {
    this.entityId = options.entityId;
    this.visualScene = options.visualScene;
    this.physicsWorld = options.physicsWorld;
    this.shapeType = options.shapeType || 'sphere';
    this.radius = options.radius || 0.12;

    const colorVal = typeof options.colorHex === 'string'
      ? parseInt(options.colorHex.replace('#', '0x'), 16)
      : (options.colorHex || 0xff6b35);
    this.colorVal = colorVal;

    // State: 'following' | 'held' | 'dynamic' | 'idle'
    this.state = 'following';
    this.lastEntitySeenTime = performance.now();

    // 1. Create Three.js Visual Mesh
    this._createMesh();

    // 2. Create Cannon-es Physics RigidBody
    this._createRigidBody();
  }

  _createMesh() {
    this.meshGroup = new THREE.Group();
    this.meshGroup.name = `virtual-proxy-${this.entityId}`;

    // Physical Proxy Core Sphere
    const sphereGeo = new THREE.SphereGeometry(this.radius, 24, 24);
    this.sphereMat = new THREE.MeshStandardMaterial({
      color: this.colorVal,
      emissive: this.colorVal,
      emissiveIntensity: 0.65,
      roughness: 0.25,
      metalness: 0.7,
      transparent: true,
      opacity: 0.92
    });
    this.coreMesh = new THREE.Mesh(sphereGeo, this.sphereMat);
    this.coreMesh.castShadow = true;
    this.meshGroup.add(this.coreMesh);

    // Glowing Holographic Orbit Rings
    const ringGeo = new THREE.RingGeometry(this.radius * 1.25, this.radius * 1.4, 32);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: this.colorVal,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    this.ringMesh = new THREE.Mesh(ringGeo, this.ringMat);
    this.meshGroup.add(this.ringMesh);

    if (this.visualScene) {
      this.visualScene.add(this.meshGroup);
    }
  }

  _createRigidBody() {
    const shape = new CANNON.Sphere(this.radius);
    this.body = new CANNON.Body({
      mass: 1.2,
      shape: shape,
      material: this.physicsWorld?.defaultMaterial
    });

    // Start in Kinematic mode to follow real camera tracking
    this.body.type = CANNON.Body.KINEMATIC;
    this.body.position.set(0, 0, 0);

    if (this.physicsWorld) {
      this.physicsWorld.addBody(this.body);
    }
  }

  /**
   * Synchronizes the virtual proxy with the real-world TrackedEntity
   * @param {TrackedEntity} entity Physical entity in SpatialWorldModel
   * @param {Function} unprojectFn Coordinate unprojector (u, v, z) -> THREE.Vector3
   */
  syncFromEntity(entity, unprojectFn) {
    if (!entity || !unprojectFn) return;

    this.lastEntitySeenTime = performance.now();
    const isHeld = entity.interactionState.grabbed || entity.customProps?.isHeld;

    // If released / launched into dynamic physics
    if (this.state === 'dynamic') {
      // Allow dynamic physics to take over trajectory
      // If the real physical ball is picked up again or comes into close proximity, re-bind
      if (isHeld) {
        this.state = 'held';
        this.body.type = CANNON.Body.KINEMATIC;
      }
      return;
    }

    // Normal tracking & follow mode (Kinematic)
    this.body.type = CANNON.Body.KINEMATIC;
    this.state = isHeld ? 'held' : 'following';

    // Unproject normalized X, Y, Z to 3D world space
    const target3D = unprojectFn(
      entity.position.x,
      entity.position.y,
      entity.position.z || 0
    );

    // Update Cannon body position
    this.body.position.set(target3D.x, target3D.y, target3D.z);

    // Sync kinematic velocity to allow collision impulses with other objects
    if (entity.velocity) {
      this.body.velocity.set(
        entity.velocity.vx * 2.5,
        entity.velocity.vy * 2.5,
        entity.velocity.vz * 2.5
      );
    }

    // Visual pulse if held
    if (isHeld) {
      this.sphereMat.emissiveIntensity = 0.95;
      this.ringMesh.rotation.z += 0.08;
    } else {
      this.sphereMat.emissiveIntensity = 0.65;
      this.ringMesh.rotation.z += 0.02;
    }
  }

  /**
   * Launches the proxy into dynamic physics simulation mode (e.g. on throw)
   * @param {THREE.Vector3|Object} throwVelocity Velocity vector
   */
  launch(throwVelocity) {
    this.state = 'dynamic';
    this.body.type = CANNON.Body.DYNAMIC;

    const vx = throwVelocity?.vx || throwVelocity?.x || 0;
    const vy = throwVelocity?.vy || throwVelocity?.y || 0;
    const vz = throwVelocity?.vz || throwVelocity?.z || 0;

    const boost = 3.2; // Satisfying physics throw boost
    this.body.velocity.set(vx * boost, vy * boost, vz * boost);

    // Add dynamic tumble angular spin
    this.body.angularVelocity.set(
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6
    );

    this.sphereMat.emissiveIntensity = 1.0;
  }

  /**
   * Resets the proxy back to following the physical entity
   */
  resetToFollow() {
    this.state = 'following';
    this.body.type = CANNON.Body.KINEMATIC;
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
  }

  /**
   * Syncs visual Three.js mesh with Cannon.js body
   */
  render() {
    if (!this.meshGroup || !this.body) return;

    this.meshGroup.position.copy(this.body.position);
    this.meshGroup.quaternion.copy(this.body.quaternion);
  }

  dispose() {
    if (this.physicsWorld && this.body) {
      this.physicsWorld.removeBody(this.body);
    }
    if (this.visualScene && this.meshGroup) {
      this.visualScene.remove(this.meshGroup);
    }
    if (this.coreMesh) {
      this.coreMesh.geometry.dispose();
      this.sphereMat.dispose();
    }
    if (this.ringMesh) {
      this.ringMesh.geometry.dispose();
      this.ringMat.dispose();
    }
  }
}
