import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const serviceWorker = await readFile(new URL('../dist/service-worker.js', import.meta.url), 'utf8');
const manifestMatch = serviceWorker.match(/const BUILD_ASSETS = (\{.*\});/);

assert.ok(manifestMatch, 'Build injects the offline asset manifest');
assert.ok(!serviceWorker.includes('__AIR_GESTURE_BUILD_ASSETS__'), 'Build replaces the asset marker');

const { landing } = JSON.parse(manifestMatch[1]);
assert.ok(landing.length > 0, 'Landing assets are included in the initial cache');
assert.ok(landing.some((asset) => asset.startsWith('/assets/landing-')), 'Landing bundle is precached');
assert.ok(!landing.some((asset) => asset.startsWith('/assets/app-')), 'App bundle is not downloaded on landing visit');
assert.ok(!landing.some((asset) => asset.endsWith('.html')), 'Duplicate HTML routes are not precached');
assert.ok(!serviceWorker.includes("'/app/index.html'"), 'App HTML is cached only when its route is opened');
assert.ok(serviceWorker.includes("const OFFLINE_CACHE_NAME = 'air-gesture-offline-resources'"), 'Offline resources use a persistent cache');
assert.ok(serviceWorker.includes('await offlineCache.put(resource, response)'), 'Prepared offline resources survive shell cache updates');

console.log('✅ Landing install precaches only landing assets; app assets remain on demand.');
