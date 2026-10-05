/**
 * Action Mapper
 * Translates abstract interaction events (pinch, zoom, rotate, gestures)
 * into concrete OS input commands based on the currently active application profile.
 */

import { globalEventBus } from '../core/event-bus.js';

export class ActionMapper {
  constructor(profileManager, macosAdapter, browserAdapter) {
    this.profileManager = profileManager;
    this.macosAdapter = macosAdapter;
    this.browserAdapter = browserAdapter;
    this.context = {
      macos: this.macosAdapter,
      browser: this.browserAdapter,
      bus: globalEventBus
    };
    this.profileManager.setContext(this.context);
    this.initListeners();
  }

  initListeners() {
    globalEventBus.on('pointer_move', (e) => this._handleEvent('pointer_move', e));
    globalEventBus.on('pointer_down', (e) => this._handleEvent('pointer_down', e));
    globalEventBus.on('pointer_up', (e) => this._handleEvent('pointer_up', e));
    globalEventBus.on('click', (e) => this._handleEvent('click', e));
    globalEventBus.on('pinch_start', (e) => this._handleEvent('pinch_start', e));
    globalEventBus.on('pinch_move', (e) => this._handleEvent('pinch_move', e));
    globalEventBus.on('pinch_end', (e) => this._handleEvent('pinch_end', e));
    globalEventBus.on('drag_start', (e) => this._handleEvent('drag_start', e));
    globalEventBus.on('drag_move', (e) => this._handleEvent('drag_move', e));
    globalEventBus.on('drag_end', (e) => this._handleEvent('drag_end', e));
    globalEventBus.on('scroll', (e) => this._handleEvent('scroll', e));
    globalEventBus.on('two_hand_zoom', (e) => this._handleEvent('two_hand_zoom', e));
    globalEventBus.on('two_hand_rotate', (e) => this._handleEvent('two_hand_rotate', e));
    globalEventBus.on('swipe', (e) => this._handleEvent('swipe', e));
    globalEventBus.on('system_pause', (e) => this._handleEvent('system_pause', e));
    globalEventBus.on('kinematic', (e) => this._handleEvent('kinematic', e));
    globalEventBus.on('telemetry:kinematic', (e) => this._handleEvent('kinematic', e));
  }

  _handleEvent(eventName, payload) {
    const profile = this.profileManager.getActive();
    if (!profile) return;

    const handler = profile.handlers && profile.handlers[eventName];
    if (typeof handler === 'function') {
      handler(payload, this.context);
    }
  }
}
