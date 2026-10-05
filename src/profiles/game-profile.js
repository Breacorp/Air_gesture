/**
 * Gaming Profile (Virtual WASD + Mouse Look)
 * Translates hand poses into keyboard (WASD, Space) and mouse inputs for games.
 * Left hand: Virtual Joystick (tilt forward/back/left/right for WASD, fist for Space).
 * Right hand: Crosshair / Aim (pointer movement) + Pinch to Fire (Left Click) / Aim (Right Click).
 */

export const GameProfile = {
  id: 'game',
  name: 'Gaming (Virtual WASD)',
  description: 'Control para juegos: Mano Izquierda joystick WASD por inclinación, Mano Derecha apuntar y disparar.',
  badge: 'GAMING',

  // Active key states for WASD
  _keysDown: {
    w: false,
    a: false,
    s: false,
    d: false,
    space: false
  },

  onActivate(ctx) {
    this._resetKeys(ctx);
    console.log('[GameProfile] Virtual WASD controller activated');
  },

  onDeactivate(ctx) {
    this._resetKeys(ctx);
    console.log('[GameProfile] Virtual WASD controller deactivated');
  },

  _resetKeys(ctx) {
    if (!ctx || !ctx.macos) return;
    for (const key of ['w', 'a', 's', 'd', 'space']) {
      if (this._keysDown[key]) {
        ctx.macos.keyUp(key);
        this._keysDown[key] = false;
      }
    }
  },

  handlers: {
    pointer_move(e, ctx) {
      // Right hand mouse look / aim
      ctx.browser.movePointer(e.x, e.y);
      ctx.macos.movePointer(e.x, e.y);
    },

    // Right Hand Primary Fire (Pinch Index)
    pinch_start(e, ctx) {
      ctx.macos.pointerDown(e.position.x, e.position.y, 'left');
    },

    pinch_end(e, ctx) {
      ctx.macos.pointerUp(e.position.x, e.position.y, 'left');
    },

    click(e, ctx) {
      if (e.button === 'right') {
        // Alt Fire / Aim Down Sights
        ctx.macos.click(e.x, e.y, 'right');
      }
    },

    // Continuous Kinematic Analysis for Left Hand Joystick
    kinematic(e, ctx) {
      const leftHand = e.Left;
      if (!leftHand) {
        // If left hand was removed from camera, release WASD keys
        for (const key of ['w', 'a', 's', 'd']) {
          if (GameProfile._keysDown[key]) {
            ctx.macos.keyUp(key);
            GameProfile._keysDown[key] = false;
          }
        }
        return;
      }

      const { angles, palm, pose } = leftHand;
      const pitch = angles ? angles.pitch : 0;
      const roll = angles ? angles.roll : 0;

      // Pitch: Forward (> 22 deg) = W, Backward (< -22 deg) = S
      const wantW = pitch > 22;
      const wantS = pitch < -22;

      // Roll: Left (< -20 deg) = A, Right (> 20 deg) = D
      const wantA = roll < -20;
      const wantD = roll > 20;

      // Jump (Space): Fist or Thumb up
      const wantSpace = pose ? pose.isFist : false;

      // Update Key W
      if (wantW && !GameProfile._keysDown.w) {
        ctx.macos.keyDown('w');
        GameProfile._keysDown.w = true;
      } else if (!wantW && GameProfile._keysDown.w) {
        ctx.macos.keyUp('w');
        GameProfile._keysDown.w = false;
      }

      // Update Key S
      if (wantS && !GameProfile._keysDown.s) {
        ctx.macos.keyDown('s');
        GameProfile._keysDown.s = true;
      } else if (!wantS && GameProfile._keysDown.s) {
        ctx.macos.keyUp('s');
        GameProfile._keysDown.s = false;
      }

      // Update Key A
      if (wantA && !GameProfile._keysDown.a) {
        ctx.macos.keyDown('a');
        GameProfile._keysDown.a = true;
      } else if (!wantA && GameProfile._keysDown.a) {
        ctx.macos.keyUp('a');
        GameProfile._keysDown.a = false;
      }

      // Update Key D
      if (wantD && !GameProfile._keysDown.d) {
        ctx.macos.keyDown('d');
        GameProfile._keysDown.d = true;
      } else if (!wantD && GameProfile._keysDown.d) {
        ctx.macos.keyUp('d');
        GameProfile._keysDown.d = false;
      }

      // Update Space
      if (wantSpace && !GameProfile._keysDown.space) {
        ctx.macos.keyTap('space');
        GameProfile._keysDown.space = true;
      } else if (!wantSpace) {
        GameProfile._keysDown.space = false;
      }
    }
  }
};
