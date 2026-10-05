/**
 * Universal Desktop Profile
 * Standard macOS desktop navigation: Pointer, Pinch Click, Drag, Peace Scroll, Palm Pause.
 * Controls Finder, Safari, Chrome, system windows and buttons seamlessly.
 */

export const UniversalProfile = {
  id: 'universal',
  name: 'Universal Desktop',
  description: 'Control general de macOS (Finder, Safari, Chrome, ventanas y botones).',
  badge: 'UNIVERSAL',

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
      ctx.macos.dragStart?.(e.x, e.y, 'left');
    },

    drag_move(e, ctx) {
      ctx.browser.dragMove?.(e.x, e.y, e.button || 'left');
      ctx.macos.drag(e.x, e.y, 'left');
    },

    drag_end(e, ctx) {
      ctx.browser.dragEnd?.(e.x, e.y, e.button || 'left');
      ctx.macos.dragEnd?.(e.x, e.y, 'left');
    },

    scroll(e, ctx) {
      ctx.macos.scroll(e.deltaX || 0, e.deltaY);
    },

    two_hand_zoom(e, ctx) {
      // Universal desktop zoom: Cmd + Plus / Minus
      if (Math.abs(e.distanceDelta) > 0.02) {
        const key = e.distanceDelta > 0 ? 'plus' : 'minus';
        ctx.macos.hotkey(['cmd'], key);
      }
    }
  }
};
