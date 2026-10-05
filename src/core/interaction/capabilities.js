/**
 * TargetCapabilities - Interaction Capability System
 * 
 * "En lugar de preguntarle: '¿Qué aplicación es?'
 *  preguntarle al mundo: '¿Qué puedo hacer con aquello que tengo delante?'"
 * 
 * Declares the intrinsic spatial affordances and interaction capabilities
 * of any target (surface, 3D model, rigid body, physical prop, UI element).
 */

export class TargetCapabilities {
  /**
   * @param {Object} options
   * @param {boolean} [options.interactive=true] Can it receive any user interaction?
   * @param {boolean} [options.grabbable=false] Can it be possessed/gripped by hand?
   * @param {boolean} [options.movable=false] Can its spatial position be translated?
   * @param {boolean} [options.scalable=false] Can its dimensions/scale be modified?
   * @param {boolean} [options.rotatable=false] Can its orientation/angles be rotated?
   * @param {boolean} [options.clickable=false] Can it receive discrete selection/clicks?
   * @param {boolean} [options.scrollable=false] Can its content be scrolled?
   * @param {boolean} [options.throwable=false] Can it accept physics velocity/impulse upon release?
   * @param {boolean} [options.physical=false] Is it a real tangible object in the physical room?
   * @param {boolean} [options.virtual=true] Is it a digital/rendered representation?
   */
  constructor(options = {}) {
    this.interactive = options.interactive !== undefined ? !!options.interactive : true;
    this.grabbable = !!options.grabbable;
    this.movable = !!options.movable;
    this.scalable = !!options.scalable;
    this.rotatable = !!options.rotatable;
    this.clickable = !!options.clickable;
    this.scrollable = !!options.scrollable;
    this.throwable = !!options.throwable;
    this.physical = !!options.physical;
    this.virtual = options.virtual !== undefined ? !!options.virtual : true;
  }

  /**
   * Check if the target possesses a specific capability
   * @param {string} capability
   * @returns {boolean}
   */
  can(capability) {
    return !!this[capability];
  }

  /**
   * Factory: Capabilities for 3D Virtual CAD Models (Studio, Blender, Holograms)
   */
  static for3DVirtualModel() {
    return new TargetCapabilities({
      interactive: true,
      grabbable: true,
      movable: true,
      scalable: true,
      rotatable: true,
      clickable: false,
      scrollable: false,
      throwable: false,
      physical: false,
      virtual: true
    });
  }

  /**
   * Factory: Capabilities for Dynamic Physics Rigid Bodies
   */
  static forPhysicsRigidBody() {
    return new TargetCapabilities({
      interactive: true,
      grabbable: true,
      movable: true,
      scalable: true,
      rotatable: true,
      clickable: false,
      scrollable: false,
      throwable: true,
      physical: false,
      virtual: true
    });
  }

  /**
   * Factory: Capabilities for Real Tracked Physical Props (Orange ball, Wand, Pen)
   */
  static forPhysicalProp() {
    return new TargetCapabilities({
      interactive: true,
      grabbable: true,
      movable: true,
      scalable: false,
      rotatable: true,
      clickable: false,
      scrollable: false,
      throwable: true,
      physical: true,
      virtual: false
    });
  }

  /**
   * Factory: Capabilities for 2D Interactive UI Elements (Buttons, inputs, links)
   */
  static forInteractiveUI() {
    return new TargetCapabilities({
      interactive: true,
      grabbable: false,
      movable: false,
      scalable: false,
      rotatable: false,
      clickable: true,
      scrollable: false,
      throwable: false,
      physical: false,
      virtual: true
    });
  }

  /**
   * Factory: Capabilities for OS Desktop Surface (macOS WindowServer, Safari, Finder)
   */
  static forOSSurface() {
    return new TargetCapabilities({
      interactive: true,
      grabbable: true,   // Window drag / text selection
      movable: true,     // Pointer & drag translation
      scalable: true,    // Viewport zoom
      rotatable: false,
      clickable: true,   // Mouse click
      scrollable: true,  // Window scroll
      throwable: false,
      physical: false,
      virtual: true
    });
  }

  toString() {
    const list = Object.keys(this).filter(k => typeof this[k] === 'boolean' && this[k]);
    return `[Capabilities: ${list.join(', ')}]`;
  }
}
