/**
 * Spatial Intent - Universal Language of Human Spatial Interaction
 * 
 * "Air Gesture nunca debe aprender cómo funciona una aplicación.
 *  Air Gesture debe entender cómo funciona la interacción humana."
 * 
 * Formal, deterministic data structure describing pure human physical intent,
 * completely independent of any target software, operating system or application profile.
 */

export const IntentType = Object.freeze({
  POINT: 'point',       // ☝️ Intent to indicate a coordinate or target
  TOUCH: 'touch',       // 👆 Intent of direct physical/virtual contact
  CLICK: 'click',       // 🤏 Intent of brief atomic activation/selection
  GRAB: 'grab',         // ✊/🤏 Intent of gripping and taking possession
  DRAG: 'drag',         // 🤏+↔️ Intent of translating a target while possessing it
  RELEASE: 'release',   // 🖐️ Intent of releasing possession
  SCROLL: 'scroll',     // ✌️/✋ Intent of continuous unidirectional flow
  ROTATE: 'rotate',     // 🔄 Intent of spatial angular reorientation
  SCALE: 'scale',       // 👐 Intent of expanding or contracting dimension
  PUSH: 'push',         // 🫸 Intent of applying repulsive or forward impulse
  PULL: 'pull',         // 🫷 Intent of applying attractive or backward impulse
  THROW: 'throw',       // ☄️ Intent of releasing possession with imparted momentum
  PAUSE: 'pause',       // ✋ Intent to temporarily halt interaction
  CANCEL: 'cancel'      // 🛑 Intent to abort/failsafe all active operations
});

export const IntentState = Object.freeze({
  START: 'start',       // Initial transition into intent
  ACTIVE: 'active',     // Ongoing continuous performance of intent
  END: 'end'            // Termination or release of intent
});

let _intentSeq = 0;

export class SpatialIntent {
  /**
   * @param {Object} options
   * @param {string} options.type One of IntentType
   * @param {string} [options.state='active'] One of IntentState
   * @param {string} [options.source='hand_right'] 'hand_right' | 'hand_left' | 'two_hands' | 'body'
   * @param {number} [options.confidence=1.0] [0..1]
   * @param {Object} [options.position] { x, y, z, screenX, screenY }
   * @param {Object} [options.velocity] { vx, vy, vz, speed }
   * @param {Object|number} [options.delta] Delta movement or scalar ratio
   * @param {string} [options.targetId] Optional resolved target entity id
   * @param {Object} [options.payload] Additional metadata (buttons, angles, etc.)
   * @param {number} [options.timestamp] Timestamp in ms
   */
  constructor(options = {}) {
    this.id = `intent-${++_intentSeq}-${Date.now()}`;
    this.type = options.type;
    this.state = options.state || IntentState.ACTIVE;
    this.source = options.source || 'hand_right';
    this.confidence = options.confidence !== undefined ? options.confidence : 1.0;

    this.position = options.position ? { ...options.position } : { x: 0, y: 0, z: 0 };
    this.velocity = options.velocity ? { ...options.velocity } : { vx: 0, vy: 0, vz: 0, speed: 0 };
    this.delta = options.delta !== undefined ? options.delta : null;

    this.targetId = options.targetId || null;
    this.payload = options.payload ? { ...options.payload } : {};
    this.timestamp = options.timestamp || performance.now();
  }

  is(type) {
    return this.type === type;
  }

  toString() {
    return `[SpatialIntent ${this.type.toUpperCase()}:${this.state} source=${this.source} conf=${this.confidence.toFixed(2)}]`;
  }
}
