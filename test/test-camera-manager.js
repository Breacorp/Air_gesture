import assert from 'node:assert/strict';
import { CameraManager } from '../src/core/perception/camera-manager.js';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value
  });
}

try {
  console.log('🧪 Testing camera startup requirements...\n');

  setGlobal('navigator', { mediaDevices: undefined });
  setGlobal('window', { isSecureContext: false });
  const insecureManager = new CameraManager();
  assert.throws(() => insecureManager.assertSupported(), /HTTPS|conexión segura|HTTP/i);
  await assert.rejects(insecureManager.startCamera(), /HTTPS|conexión segura|HTTP/i);
  console.log('  ✅ Insecure origins fail with an HTTPS camera requirement');

  let deniedRequestCount = 0;
  setGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => {
        deniedRequestCount++;
        throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
      }
    }
  });
  setGlobal('window', { isSecureContext: true });

  await assert.rejects(
    new CameraManager().startCamera(),
    /No se permitió el acceso a la cámara/
  );
  assert.equal(deniedRequestCount, 1, 'Permission denial is not retried with generic constraints');
  console.log('  ✅ Permission denial is surfaced without a misleading retry');

  let constraintRequestCount = 0;
  const stream = { getTracks: () => [] };
  setGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => {
        constraintRequestCount++;
        if (constraintRequestCount === 1) {
          throw Object.assign(new Error('Unsupported constraints'), { name: 'OverconstrainedError' });
        }
        return stream;
      }
    }
  });

  const video = {
    muted: false,
    playsInline: false,
    srcObject: null,
    videoWidth: 1280,
    videoHeight: 720,
    play: async () => {}
  };
  const source = await new CameraManager().startCamera({ videoElement: video });

  assert.equal(constraintRequestCount, 2, 'Unsupported camera constraints retry once');
  assert.equal(source.stream, stream, 'Successful fallback returns the camera stream');
  assert.equal(video.muted, true, 'Camera preview is muted for Safari autoplay');
  assert.equal(video.playsInline, true, 'Camera preview is configured for inline iOS playback');
  console.log('  ✅ Unsupported constraints retry and Safari video settings are applied');
} finally {
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator);
  } else {
    delete globalThis.navigator;
  }
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow);
  } else {
    delete globalThis.window;
  }
}
