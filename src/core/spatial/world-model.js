/**
 * SpatialWorldModel - The Single Source of Truth for Spatial State
 * 
 * Owns, tracks, updates, and correlates all spatial entities (hands, body, objects, props).
 * Decouples raw sensory detection from downstream interaction, physics, and rendering.
 */

import { TrackedEntity } from './entity.js';
import { TrackingFusion } from './tracking-fusion.js';

export class SpatialWorldModel {
  constructor(options = {}) {
    this.entities = new Map();
    this.maxMissingFrames = options.maxMissingFrames || 10;

    // Multimodal Relationship Fusion Engine
    this.fusion = new TrackingFusion(this);

    // Signal-specific filter configurations (applied per entity type)
    this.filterConfigs = {
      hand: {
        minCutoff: 0.8,
        beta: 0.02,
        derivativeCutoff: 1.0
      },
      body: {
        minCutoff: 0.5,
        beta: 0.01,
        derivativeCutoff: 0.8
      },
      object: {
        minCutoff: 1.2,
        beta: 0.04,
        derivativeCutoff: 1.2
      }
    };

    // Observers / Listeners
    this.listeners = {
      onEntitySpawned: [],
      onEntityUpdated: [],
      onEntityLost: []
    };
  }

  /**
   * Ingests a set of candidate observations from the Perception Engine
   * @param {Array<Object>} candidates Raw candidates from all active perception trackers
   * @param {number} timestamp Current frame timestamp
   */
  ingestObservations(candidates = [], timestamp = performance.now()) {
    const matchedEntityIds = new Set();

    // 1. Process candidate observations
    for (const cand of candidates) {
      if (!cand || !cand.type) continue;

      const entityId = cand.suggestedId || `${cand.type}-${cand.subType || 'default'}`;
      let entity = this.entities.get(entityId);

      if (!entity) {
        // Spawn new TrackedEntity
        entity = new TrackedEntity({
          id: entityId,
          type: cand.type,
          subType: cand.subType,
          coordSpace: cand.coordSpace || 'normalized_relative'
        });
        this.entities.set(entityId, entity);
        this._notify('onEntitySpawned', entity);
      }

      // Update observation
      entity.updateObservation(cand, timestamp);
      matchedEntityIds.add(entityId);
      this._notify('onEntityUpdated', entity);
    }

    // 2. Handle missing entities and prune stale ones
    for (const [id, entity] of this.entities.entries()) {
      if (!matchedEntityIds.has(id)) {
        entity.markMissing();

        if (entity.missingFrames > this.maxMissingFrames) {
          this.entities.delete(id);
          this._notify('onEntityLost', entity);
        }
      }
    }

    // 3. Multimodal Spatial Relationship Fusion
    this.fusion.update(timestamp);
  }

  /**
   * Returns human-readable list of active spatial relationships (e.g. 'HAND Right SOSTIENE obj-orange-01')
   */
  getRelationsSummary() {
    return this.fusion.getRelationsSummary();
  }

  /**
   * Returns entity by unique ID
   */
  getEntity(id) {
    return this.entities.get(id) || null;
  }

  /**
   * Returns all active entities of a specific category ('hand', 'body', 'object', etc.)
   */
  getEntitiesByType(type) {
    const result = [];
    for (const entity of this.entities.values()) {
      if (entity.type === type && entity.missingFrames === 0) {
        result.push(entity);
      }
    }
    return result;
  }

  /**
   * Returns all active entities
   */
  getAllActiveEntities() {
    return Array.from(this.entities.values()).filter(e => e.missingFrames === 0);
  }

  /**
   * Convenience: Get Primary Active Hand (prefers Right, falls back to Left)
   */
  getPrimaryHand() {
    const right = this.getEntity('hand-right');
    if (right && right.missingFrames === 0) return right;
    const left = this.getEntity('hand-left');
    if (left && left.missingFrames === 0) return left;
    return null;
  }

  /**
   * Convenience: Get both hands as a structured map { Left, Right }
   */
  getBothHands() {
    const left = this.getEntity('hand-left');
    const right = this.getEntity('hand-right');
    return {
      Left: (left && left.missingFrames === 0) ? left : null,
      Right: (right && right.missingFrames === 0) ? right : null
    };
  }

  // Event Subscription
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  _notify(event, entity) {
    const list = this.listeners[event];
    if (list) {
      for (const cb of list) {
        cb(entity);
      }
    }
  }

  /**
   * Reset world model
   */
  clear() {
    this.entities.clear();
  }
}
