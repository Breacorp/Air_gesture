/**
 * macOS Client Adapter (Full Input Engine)
 * Communicates over WebSocket with server/macos-bridge.py
 * Supports full Mouse (L/R/M buttons, Move, Drag, Scroll) and Keyboard (Keys, Hotkeys, Modifiers).
 */

import { OSAdapter } from '../os-adapter.js';

export class MacOSClientAdapter extends OSAdapter {
  constructor(wsUrl = 'ws://127.0.0.1:8765') {
    super('macOS CoreGraphics Input Engine');
    this.wsUrl = wsUrl;
    this.ws = null;
    this.isConnected = false;
    this.onStatusChange = null;
    this.onScreenResolution = null;

    // Movement throttle (~80Hz) to prevent socket congestion
    this.lastSentTime = 0;
    this.minIntervalMs = 12;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        if (this.onStatusChange) this.onStatusChange({ connected: true });
        console.log('[macOS Input Adapter] Connected to native Quartz daemon');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'handshake_ok' && msg.screen) {
            console.log('[macOS Input Adapter] Display bounds:', msg.screen);
            if (this.onScreenResolution) {
              this.onScreenResolution(msg.screen);
            }
          }
        } catch (e) {
          console.error('[macOS Input Adapter] Parse error:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        if (this.onStatusChange) this.onStatusChange({ connected: false });
        console.log('[macOS Input Adapter] Daemon disconnected');
      };

      this.ws.onerror = (err) => {
        this.isConnected = false;
        if (this.onStatusChange) this.onStatusChange({ connected: false, error: err });
      };
    } catch (e) {
      console.warn('[macOS Input Adapter] Connection failed:', e);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  _send(payload) {
    if (this.isEnabled && this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  // --- MOUSE METHODS ---
  movePointer(x, y) {
    const now = performance.now();
    if (now - this.lastSentTime < this.minIntervalMs) return;
    this.lastSentTime = now;
    this._send({ type: 'move', x, y });
  }

  pointerDown(x, y, button = 'left') {
    this._send({ type: 'mouse_down', x, y, button });
  }

  pointerUp(x, y, button = 'left') {
    this._send({ type: 'mouse_up', x, y, button });
  }

  click(x, y, button = 'left') {
    this._send({ type: 'click', x, y, button });
  }

  dragStart(x, y, button = 'left') {
    this._send({ type: 'drag_start', x, y, button });
  }

  drag(x, y, button = 'left') {
    const now = performance.now();
    if (now - this.lastSentTime < this.minIntervalMs) return;
    this.lastSentTime = now;
    this._send({ type: 'drag_move', x, y, button });
  }

  dragMove(x, y, button = 'left') {
    this.drag(x, y, button);
  }

  dragEnd(x, y, button = 'left') {
    this._send({ type: 'drag_end', x, y, button });
  }

  scroll(deltaX, deltaY) {
    this._send({ type: 'scroll', deltaX, deltaY });
  }

  // --- KEYBOARD & HOTKEY METHODS ---
  keyDown(key) {
    this._send({ type: 'key_down', key });
  }

  keyUp(key) {
    this._send({ type: 'key_up', key });
  }

  keyTap(key) {
    this._send({ type: 'key_tap', key });
  }

  hotkey(modifiers, key) {
    this._send({ type: 'hotkey', modifiers, key });
  }
}
