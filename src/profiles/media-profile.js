/**
 * Media & Music Profile
 * Effortless spatial control for media apps: Spotify, Apple Music, YouTube, VLC, Netflix.
 * Hand gestures for Play/Pause, Volume, and Track skipping.
 */

export const MediaProfile = {
  id: 'media',
  name: 'Media & Reproducción',
  description: 'Control de medios (Spotify, VLC, YouTube): Play/Pausa con palma, volumen con scroll y skip con swipe.',
  badge: 'MEDIA',

  handlers: {
    pointer_move(e, ctx) {
      ctx.browser.movePointer(e.x, e.y);
      ctx.macos.movePointer(e.x, e.y);
    },

    click(e, ctx) {
      ctx.browser.click(e.x, e.y, e.button);
      ctx.macos.click(e.x, e.y, e.button);
    },

    pinch_start(e, ctx) {
      ctx.macos.pointerDown(e.position.x, e.position.y, 'left');
    },

    drag_move(e, ctx) {
      ctx.macos.drag(e.x, e.y, 'left');
    },

    pinch_end(e, ctx) {
      ctx.macos.pointerUp(e.position.x, e.position.y, 'left');
    },

    // Hold Palm still facing camera = Toggle Play / Pause (Spacebar)
    system_pause(e, ctx) {
      if (e.isPaused) {
        ctx.macos.keyTap('space');
        console.log('[MediaProfile] Play/Pause toggled (Space)');
      }
    },

    // Two Fingers (Peace) = Volume Up / Down
    scroll(e, ctx) {
      if (Math.abs(e.deltaY) > 8) {
        // Delta > 0 = Volume down, Delta < 0 = Volume up
        const key = e.deltaY > 0 ? 'down' : 'up';
        ctx.macos.keyTap(key);
      }
    },

    // Fast horizontal swipes = Next / Previous track
    swipe(e, ctx) {
      if (e.direction === 'right') {
        // Next track (Cmd + Right arrow)
        ctx.macos.hotkey(['cmd'], 'right');
        console.log('[MediaProfile] Next track (Cmd+Right)');
      } else if (e.direction === 'left') {
        // Previous track (Cmd + Left arrow)
        ctx.macos.hotkey(['cmd'], 'left');
        console.log('[MediaProfile] Previous track (Cmd+Left)');
      }
    }
  }
};
