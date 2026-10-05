/**
 * Browser Simulator Adapter
 * Renders an animated virtual on-screen cursor, click ripples, drag trails,
 * and handles dispatching interaction events within the web document.
 */

import { OSAdapter } from '../os-adapter.js';

export class BrowserAdapter extends OSAdapter {
  constructor() {
    super('Browser DOM');
    this.cursorEl = null;
    this.rippleContainer = null;
    this.activeDragElement = null;
    this._createCursorElement();
  }

  _createCursorElement() {
    // Virtual Cursor Container
    const cursor = document.createElement('div');
    cursor.id = 'virtual-cursor';
    cursor.className = 'virtual-cursor';
    cursor.innerHTML = `
      <div class="cursor-dot"></div>
      <div class="cursor-halo"></div>
      <span class="cursor-state-tag" id="cursor-state-tag">POINT</span>
    `;
    document.body.appendChild(cursor);
    this.cursorEl = cursor;

    // Ripple Container for clicks
    const ripples = document.createElement('div');
    ripples.id = 'cursor-ripples';
    document.body.appendChild(ripples);
    this.rippleContainer = ripples;
  }

  movePointer(x, y) {
    if (!this.cursorEl) return;
    // Map screen coordinates proportionally to window dimensions
    const winX = (x / (window.screen.width || window.innerWidth)) * window.innerWidth;
    const winY = (y / (window.screen.height || window.innerHeight)) * window.innerHeight;

    this.cursorEl.style.transform = `translate3d(${winX}px, ${winY}px, 0)`;
  }

  setState(stateName) {
    if (!this.cursorEl) return;
    const tag = document.getElementById('cursor-state-tag');
    if (tag) tag.textContent = stateName;

    this.cursorEl.className = `virtual-cursor state-${stateName.toLowerCase()}`;
  }

  pointerDown(x, y, button = 'left') {
    if (!this.cursorEl) return;
    this.cursorEl.classList.add('cursor-pressed');
    this._createRipple(x, y);
  }

  pointerUp(x, y, button = 'left') {
    if (!this.cursorEl) return;
    this.cursorEl.classList.remove('cursor-pressed');
  }

  dragStart(x, y, button = 'left') {
    if (!this.cursorEl) return;
    this.cursorEl.classList.add('cursor-dragging');
  }

  dragMove(x, y, button = 'left') {
    this.movePointer(x, y);
  }

  dragEnd(x, y, button = 'left') {
    if (!this.cursorEl) return;
    this.cursorEl.classList.remove('cursor-dragging');
  }

  click(x, y, button = 'left') {
    this._createRipple(x, y);
  }

  _createRipple(x, y) {
    if (!this.rippleContainer) return;
    const winX = (x / (window.screen.width || window.innerWidth)) * window.innerWidth;
    const winY = (y / (window.screen.height || window.innerHeight)) * window.innerHeight;

    const rip = document.createElement('div');
    rip.className = 'cursor-ripple';
    rip.style.left = `${winX}px`;
    rip.style.top = `${winY}px`;
    this.rippleContainer.appendChild(rip);
    setTimeout(() => rip.remove(), 600);
  }
}
