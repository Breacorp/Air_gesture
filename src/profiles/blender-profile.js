/**
 * Blender 3D Suite Interaction Profile
 * Spatial manipulation tailored for Blender:
 * - ☝️ Pointing moves cursor / view
 * - 🤏 Pinch = Select / Confirm (left click)
 * - 🤏 + Move = Transform / Grab (translates object/vertex)
 * - 🖐️🖐️ Two Hands Distance = Scale (S key / zoom)
 * - 🖐️🖐️ Two Hands Rotation = Orbit Rotate View
 * - ✌️ / ✋ Scroll = Zoom View
 */

export const BlenderProfile = {
  id: 'blender',
  name: 'Blender 3D Suite',
  description: 'Control espacial para Blender: 🤏 Seleccionar / Transformar, 🖐️🖐️ Escalar y Rotar órbita.',
  badge: 'BLENDER',

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

    // Two-Hand Scale
    two_hand_zoom(e, ctx) {
      // Map distance delta to smooth viewport zoom / scale
      const zoomIntensity = Math.round(e.distanceDelta * 320);
      if (Math.abs(zoomIntensity) > 4) {
        ctx.macos.scroll(0, zoomIntensity);
      }
    },

    // Two-Hand Orbit Rotate
    two_hand_rotate(e, ctx) {
      // Rotate viewport heading using Numpad 4/6
      if (Math.abs(e.angleDelta) > 2.0) {
        const key = e.angleDelta > 0 ? '6' : '4';
        ctx.macos.keyTap(key);
      }
    },

    scroll(e, ctx) {
      ctx.macos.scroll(e.deltaX || 0, e.deltaY);
    }
  }
};
