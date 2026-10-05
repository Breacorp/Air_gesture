/**
 * Google Earth & 3D Spatial Maps Profile
 * Natural spatial navigation for Google Earth, Maps 3D, and Blender viewports.
 * Two-hand zoom, globe grabbing, orbital rotation, and pitch tilt.
 */

export const GoogleEarthProfile = {
  id: 'google_earth',
  name: 'Google Earth & 3D Maps',
  description: 'Navegación espacial 3D: Agarrar la Tierra con pinch, Zoom a 2 manos y Rotación orbital.',
  badge: 'EARTH 3D',

  handlers: {
    pointer_move(e, ctx) {
      ctx.browser.movePointer(e.x, e.y);
      ctx.macos.movePointer(e.x, e.y);
    },

    // Grab Globe & Pan
    pinch_start(e, ctx) {
      ctx.macos.pointerDown(e.position.x, e.position.y, 'left');
    },

    drag_move(e, ctx) {
      ctx.macos.drag(e.x, e.y, 'left');
    },

    pinch_end(e, ctx) {
      ctx.macos.pointerUp(e.position.x, e.position.y, 'left');
    },

    // Two-Hand Altitude Zoom (Natural Earth Zoom)
    two_hand_zoom(e, ctx) {
      // Map distance delta directly to smooth mouse scroll wheel
      // Distance increasing = zoom in (positive scroll)
      // Distance decreasing = zoom out (negative scroll)
      const zoomIntensity = Math.round(e.distanceDelta * 380);
      if (Math.abs(zoomIntensity) > 5) {
        ctx.macos.scroll(0, zoomIntensity);
      }
    },

    // Two-Hand Orbital Heading / Azimuth Rotation
    two_hand_rotate(e, ctx) {
      // Rotate camera azimuth using Shift + Left/Right arrow keys
      if (Math.abs(e.angleDelta) > 2.5) {
        const key = e.angleDelta > 0 ? 'right' : 'left';
        ctx.macos.hotkey(['shift'], key);
      }
    },

    // Two Fingers (Peace) = Tilt Horizon / Camera Pitch
    scroll(e, ctx) {
      // Shift + Up/Down tilts camera angle in Google Earth
      if (Math.abs(e.deltaY) > 10) {
        const key = e.deltaY > 0 ? 'down' : 'up';
        ctx.macos.hotkey(['shift'], key);
      }
    }
  }
};
