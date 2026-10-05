/**
 * SpatialTransform - Coordinate transformation matrix and projection utilities
 * Maps coordinates seamlessly across Camera UV, Mirrored Screen Pixels, and 3D Viewport Space.
 */

export class SpatialTransform {
  /**
   * Projects normalized [0..1] camera coordinates to screen pixel coordinates
   * respecting CSS cover scaling and mirror reflection.
   */
  static cameraToScreen(normX, normY, videoWidth, videoHeight, screenWidth, screenHeight, mirror = true) {
    const videoAspect = (videoWidth && videoHeight) ? (videoWidth / videoHeight) : (16 / 9);
    const screenAspect = screenWidth / screenHeight;

    let scale, offX, offY;
    if (screenAspect > videoAspect) {
      // Screen is wider than video (pillarbox top/bottom)
      scale = screenWidth / videoWidth;
      const renderedH = videoHeight * scale;
      offX = 0;
      offY = (screenHeight - renderedH) / 2;
    } else {
      // Screen is taller than video (crop left/right)
      scale = screenHeight / videoHeight;
      const renderedW = videoWidth * scale;
      offX = (screenWidth - renderedW) / 2;
      offY = 0;
    }

    const rawPixelX = normX * videoWidth;
    const rawPixelY = normY * videoHeight;

    const screenX = mirror 
      ? (screenWidth - (offX + rawPixelX * scale))
      : (offX + rawPixelX * scale);
    const screenY = offY + rawPixelY * scale;

    return { x: screenX, y: screenY };
  }

  /**
   * Converts screen pixel coordinates to normalized screen coordinates [0..1]
   */
  static screenToNormalized(screenX, screenY, screenWidth, screenHeight) {
    return {
      u: Math.max(0, Math.min(1, screenX / screenWidth)),
      v: Math.max(0, Math.min(1, screenY / screenHeight))
    };
  }

  /**
   * Unprojects a normalized screen coordinate to 3D Three.js world space
   * matching camera FOV and frustum at depth Z.
   */
  static unprojectToFrustum(normX, normY, depthZ, camera3D) {
    if (!camera3D) {
      return { x: (normX - 0.5) * 3, y: -(normY - 0.5) * 2, z: depthZ };
    }

    const vFOV = (camera3D.fov * Math.PI) / 180;
    const distToCam = camera3D.position.z - depthZ;
    const planeH = 2 * Math.tan(vFOV / 2) * Math.abs(distToCam);
    const planeW = planeH * camera3D.aspect;

    const x3d = (normX - 0.5) * planeW;
    const y3d = -(normY - 0.5) * planeH;

    return { x: x3d, y: y3d, z: depthZ };
  }
}
