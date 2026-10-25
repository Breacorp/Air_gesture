/**
 * macOS Client Adapter (Full Input Engine)
 * Communicates over WebSocket with server/macos-bridge.py
 * Supports full Mouse (L/R/M buttons, Move, Drag, Scroll) and Keyboard (Keys, Hotkeys, Modifiers).
 */

import { OSAdapter } from '../os-adapter.js';

export class MacOSClientAdapter extends OSAdapter {
  constructor(wsUrl = 'ws://127.0.0.1:8765', token = '') {
    super('macOS CoreGraphics Input Engine');
    this.wsUrl = wsUrl;
    this.token = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('airgesture_bridge_token') || '' : '');
    if (!this.token && typeof window !== 'undefined' && typeof window.prompt === 'function') {
      const prompted = window.prompt('Token del daemon macOS (se muestra al iniciar macos-bridge.py):');
      if (prompted) {
        this.token = prompted.trim();
        try { localStorage.setItem('airgesture_bridge_token', this.token); } catch (e) {}
      }
    }
    this.ws = null;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.connectionError = null;
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
      this.connectionError = null;
      this.ws = new WebSocket(this.wsUrl);
      this.onStatusChange?.({ connected: false, connecting: true });

      this.ws.onopen = () => {
        this.isConnected = true;
        this.isAuthenticated = false;
        this.connectionError = null;
        this.onStatusChange?.({ connected: true, connecting: true, authenticated: false });
        console.log('[macOS Input Adapter] Connected to native Quartz daemon; authenticating');
        try {
          this.ws.send(JSON.stringify({ type: 'auth', token: this.token }));
        } catch (e) {
          console.error('[macOS Input Adapter] Auth send failed:', e);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'hello') {
            return;
          }
          if (msg.type === 'handshake_ok' && msg.screen) {
            this.isAuthenticated = true;
            this.connectionError = null;
            this.onStatusChange?.({ connected: true, connecting: false, authenticated: true });
            console.log('[macOS Input Adapter] Display bounds:', msg.screen);
            if (this.onScreenResolution) {
              this.onScreenResolution(msg.screen);
            }
            return;
          }
          if (msg.type === 'error') {
            this.isAuthenticated = false;
            this.connectionError = new Error(msg.error || 'bridge error');
            this.onStatusChange?.({ connected: true, connecting: false, authenticated: false, error: msg.error });
          }
        } catch (e) {
          console.error('[macOS Input Adapter] Parse error:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.isEnabled = false;
        const error = this.connectionError;
        this.connectionError = null;
        this.onStatusChange?.({
          connected: false,
          connecting: false,
          ...(error ? { error } : {})
        });
      };

      this.ws.onerror = (error) => {
        this.isConnected = false;
        this.isEnabled = false;
        this.connectionError = error;
        this.onStatusChange?.({ connected: false, connecting: false, error });
      };
    } catch (error) {
      this.ws = null;
      this.isConnected = false;
      this.isEnabled = false;
      this.connectionError = null;
      this.onStatusChange?.({ connected: false, connecting: false, error });
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
