import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';

const outputDirectory = fileURLToPath(new URL('./dist/', import.meta.url));

function offlinePrecachePlugin() {
  return {
    name: 'air-gesture-offline-precache',
    apply: 'build',
    async writeBundle(outputOptions, bundle) {
      const directory = outputOptions.dir || outputDirectory;
      const workerPath = resolve(directory, 'service-worker.js');
      const worker = await readFile(workerPath, 'utf8');
      const assets = Object.keys(bundle)
        .filter((file) => /\.(?:html|js|css|png|svg|webmanifest)$/i.test(file))
        .map((file) => `/${file}`);
      const assetMarker = '"__AIR_GESTURE_BUILD_ASSETS__"';
      const versionMarker = '__AIR_GESTURE_CACHE_VERSION__';
      const fingerprintFiles = [
        'index.html',
        'air-gesture/index.html',
        'manifest.webmanifest',
        'moderno-logo.png',
        'moderno-logo-192.png',
        'moderno-logo-512.png',
        'air-gesture-onboarding.png',
        'models/hand_landmarker.task',
        'models/pose_landmarker_lite.task',
        'models/face_landmarker.task',
        'wasm/vision_wasm_internal.js',
        'wasm/vision_wasm_internal.wasm',
        'wasm/vision_wasm_module_internal.js',
        'wasm/vision_wasm_module_internal.wasm',
        'wasm/vision_wasm_nosimd_internal.js',
        'wasm/vision_wasm_nosimd_internal.wasm'
      ];
      const fileMetadata = await Promise.all(fingerprintFiles.map(async (file) => {
        const { size, mtimeMs } = await stat(resolve(directory, file));
        return `${file}:${size}:${mtimeMs}`;
      }));
      const cacheVersion = createHash('sha256')
        .update([...assets, ...fileMetadata].join('\n'))
        .digest('hex')
        .slice(0, 12);

      if (!worker.includes(assetMarker) || !worker.includes(versionMarker)) {
        throw new Error('Could not inject the Air Gesture offline asset manifest.');
      }

      await writeFile(
        workerPath,
        worker
          .replace(assetMarker, JSON.stringify(assets))
          .replace(versionMarker, cacheVersion)
      );
    }
  };
}

export default defineConfig({
  plugins: [offlinePrecachePlugin()],
  build: {
    rolldownOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        landing: fileURLToPath(new URL('./air-gesture/index.html', import.meta.url))
      }
    }
  },
  server: {
    port: 5180,
    strictPort: false
  }
});
