/**
 * Air Touch - The Flagship Aerial Trackpad Profile
 * 
 * "Quiero que mi mano sea mi trackpad aéreo."
 * 
 * Interactions:
 * - ☝️ INDEX TIP: Smooth, continuous cursor positioning (Absolute / Relative).
 * - 🤏 PINCH (Thumb + Index): Atomic native click (pointer_down -> pointer_up).
 * - 🤏 + MOVE: Drag & Drop (window dragging, text selection, file moving).
 * - 🤏 RIGHT PINCH (Thumb + Middle): Context menu / right click.
 * - ✌️ / ✋ TWO FINGERS / HAND VERTICAL: Smooth continuous scrolling.
 * - 🖐️🖐️ TWO HANDS DISTANCE: Zoom in / Zoom out.
 * - 🙌 GLOBAL BODY GESTURES:
 *     - Ambos brazos arriba -> Mission Control (Ctrl + Up)
 *     - Brazo izquierdo extendido -> Escritorio Anterior (Ctrl + Left)
 *     - Brazo derecho extendido -> Escritorio Siguiente (Ctrl + Right)
 */

export const AirTouchProfile = {
  id: 'air_touch',
  name: 'Air Touch Trackpad',
  description: 'Trackpad espacial aéreo: ☝️ Cursor • 🤏 Click/Drag • ✌️/✋ Scroll • 🖐️🖐️ Zoom • 🙌 Atajos SO.',
  badge: 'AIR TOUCH',

  onActivate(ctx) {
    console.log('[AirTouchProfile] Activated: Aerial trackpad mode with OS shortcuts');
    if (ctx && ctx.interactionEngine) {
      ctx.interactionEngine.enableBodyGestures(true);
    }
  },

  onDeactivate(ctx) {
    if (ctx && ctx.interactionEngine) {
      ctx.interactionEngine.enableBodyGestures(false);
    }
  },

  handlers: {
    pointer_move(e, ctx) {
      ctx.browser.movePointer(e.x, e.y);
      ctx.macos.movePointer(e.x, e.y);
    },

    pointer_down(e, ctx) {
      ctx.browser.pointerDown?.(e.x, e.y, e.button || 'left');
      ctx.macos.pointerDown(e.x, e.y, e.button || 'left');
    },

    pointer_up(e, ctx) {
      ctx.browser.pointerUp?.(e.x, e.y, e.button || 'left');
      ctx.macos.pointerUp(e.x, e.y, e.button || 'left');
    },

    click(e, ctx) {
      ctx.browser.click(e.x, e.y, e.button || 'left');
    },

    drag_start(e, ctx) {
      ctx.browser.dragStart?.(e.x, e.y, e.button || 'left');
      ctx.macos.dragStart?.(e.x, e.y, e.button || 'left');
    },

    drag_move(e, ctx) {
      ctx.browser.dragMove?.(e.x, e.y, e.button || 'left');
      ctx.macos.drag(e.x, e.y, e.button || 'left');
    },

    drag_end(e, ctx) {
      ctx.browser.dragEnd?.(e.x, e.y, e.button || 'left');
      ctx.macos.dragEnd?.(e.x, e.y, e.button || 'left');
    },

    scroll(e, ctx) {
      ctx.macos.scroll(e.deltaX || 0, e.deltaY);
    },

    two_hand_zoom(e, ctx) {
      if (Math.abs(e.distanceDelta) > 0.015) {
        const key = e.distanceDelta > 0 ? 'plus' : 'minus';
        ctx.macos.hotkey(['cmd'], key);
      }
    },

    // Global macOS system shortcuts via body gestures
    system_mission_control(e, ctx) {
      // Ctrl + Up Arrow triggers Mission Control in macOS
      ctx.macos.hotkey(['ctrl'], 'up');
    },

    system_desktop_prev(e, ctx) {
      // Ctrl + Left Arrow triggers Previous Space / Desktop in macOS
      ctx.macos.hotkey(['ctrl'], 'left');
    },

    system_desktop_next(e, ctx) {
      // Ctrl + Right Arrow triggers Next Space / Desktop in macOS
      ctx.macos.hotkey(['ctrl'], 'right');
    }
  }
};
