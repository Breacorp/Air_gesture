/**
 * Spatial Direct Touch - Natural Hand-Direct Element Interaction
 * Allows virtual hands to interact directly with buttons and controls:
 * - Hover / Point: Approaching a button with index fingertip highlights it (.hand-targeted)
 * - Pinch-to-Click: Pinching (thumb + index) while pointing triggers a direct click on that button
 * - Zero Ghost Clicks: Never clicks arbitrary background points when pinching in the air
 */

export class SpatialDirectTouch {
  constructor() {
    this.hoveredElements = { Left: null, Right: null };
    this.wasPinching = { Left: false, Right: false };
    this.targetIndicators = { Left: null, Right: null };

    this._createIndicators();
  }

  _createIndicators() {
    for (const side of ['Left', 'Right']) {
      const ind = document.createElement('div');
      ind.className = 'spatial-finger-target';
      ind.id = `spatial-target-${side.toLowerCase()}`;
      document.body.appendChild(ind);
      this.targetIndicators[side] = ind;
    }
  }

  /**
   * Process frame kinematics for direct finger touch & pinch click
   * @param {Object} kinematicData { Left, Right, timestamp }
   */
  processFrame(kinematicData) {
    const { Left, Right } = kinematicData;

    this._processHand('Right', Right);
    this._processHand('Left', Left);
  }

  _processHand(side, hand) {
    const indicator = this.targetIndicators[side];

    if (!hand || !hand.points || hand.points.length < 21) {
      if (this.hoveredElements[side]) {
        this._unhighlight(side);
      }
      if (indicator) {
        indicator.classList.remove('active', 'clicking');
      }
      this.wasPinching[side] = false;
      return;
    }

    // Index fingertip (landmark 8)
    const sp = hand.screenPoints ? hand.screenPoints[8] : null;
    let screenX, screenY;
    if (sp) {
      screenX = sp.u * window.innerWidth;
      screenY = sp.v * window.innerHeight;
    } else {
      const tip = hand.points[8];
      screenX = (tip.x * 0.5 + 0.5) * window.innerWidth;
      screenY = (-tip.y * 0.5 + 0.5) * window.innerHeight;
    }

    // Position the visual spatial target halo at the exact fingertip screen position
    if (indicator) {
      indicator.style.transform = `translate3d(${screenX}px, ${screenY}px, 0)`;
    }

    // Query DOM element directly under the virtual fingertip
    const rawEl = document.elementFromPoint(screenX, screenY);
    const interactiveTarget = this._findInteractiveElement(rawEl);

    // 1. SEÑALAR (HOVER): Highlight button when virtual fingertip is over it
    if (interactiveTarget) {
      if (this.hoveredElements[side] !== interactiveTarget) {
        this._unhighlight(side);
        this.hoveredElements[side] = interactiveTarget;
        interactiveTarget.classList.add('hand-targeted');
      }
      if (indicator) {
        indicator.classList.add('active');
      }
    } else {
      if (this.hoveredElements[side]) {
        this._unhighlight(side);
      }
      if (indicator) {
        indicator.classList.remove('active');
      }
    }

    // 2. PELLIZCAR ES UN CLICK (PINCH TO CLICK)
    const isPinch = hand.pose && hand.pose.isPinchThumbIndex;
    const isRisingEdge = isPinch && !this.wasPinching[side];

    if (isRisingEdge) {
      const target = this.hoveredElements[side];
      if (target) {
        // Trigger click directly on targeted button
        this._performClick(target, screenX, screenY, indicator);
      }
    }

    if (indicator) {
      if (isPinch && this.hoveredElements[side]) {
        indicator.classList.add('clicking');
      } else {
        indicator.classList.remove('clicking');
      }
    }

    this.wasPinching[side] = !!isPinch;
  }

  _findInteractiveElement(el) {
    if (!el) return null;
    // Don't target fullscreen overlay canvases or background elements
    if (el.id === 'viewport-3d' || el.tagName === 'CANVAS' || el.id === 'webcam-video' || el.id === 'ar-overlay-scrim') {
      return null;
    }
    return el.closest('button, a, input, select, [role="button"], .btn, .btn-studio-preset, .btn-shading, .btn-profile, .btn-close-hud, .test-drag-card');
  }

  _unhighlight(side) {
    if (this.hoveredElements[side]) {
      this.hoveredElements[side].classList.remove('hand-targeted', 'hand-clicked');
      this.hoveredElements[side] = null;
    }
  }

  _performClick(target, x, y, indicator) {
    target.classList.add('hand-clicked');
    if (indicator) indicator.classList.add('clicking');

    // Create tactile visual ripple on the button
    this._createRipple(x, y);

    // Native DOM click
    if (typeof target.click === 'function') {
      target.click();
    }

    setTimeout(() => {
      target.classList.remove('hand-clicked');
      if (indicator) indicator.classList.remove('clicking');
    }, 180);
  }

  _createRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.className = 'click-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.style.borderColor = '#00f5d4';
    document.body.appendChild(ripple);

    setTimeout(() => {
      ripple.remove();
    }, 500);
  }
}
