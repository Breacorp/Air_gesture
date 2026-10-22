import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PerceptionEngine } from '../src/core/perception/perception-engine.js';
import { HandTracker } from '../src/core/perception/hand-tracker.js';
import { BodyTracker } from '../src/core/perception/body-tracker.js';
import { FaceTracker } from '../src/core/perception/face-tracker.js';
import { FullSensorView } from '../src/render/full-sensor-view.js';
import { HandVisualizer3D } from '../src/render/hand-visualizer-3d.js';

async function testBodyAndFaceAreOptIn() {
  const engine = Object.create(PerceptionEngine.prototype);
  engine.handTracker = {};
  engine.bodyTracker = new BodyTracker();
  engine.faceTracker = new FaceTracker();
  engine.stats = { isBodyTrackingActive: false, isFaceTrackingActive: false };
  let bodyInitialized = 0;
  let faceInitialized = 0;
  let handInitialized = 0;
  engine.handTracker.initialize = async () => {
    handInitialized++;
    return true;
  };
  engine.bodyTracker.initialize = async () => {
    bodyInitialized++;
    engine.bodyTracker.isInitialized = true;
    return true;
  };
  engine.faceTracker.initialize = async () => {
    faceInitialized++;
    engine.faceTracker.isInitialized = true;
    return true;
  };

  assert.equal(engine.bodyTracker.enabled, false);
  assert.equal(engine.faceTracker.enabled, false);
  await Promise.all([engine.initialize(), engine.initialize()]);
  assert.equal(handInitialized, 1, 'Repeated engine initialization reuses the local hand detector');
  assert.equal(bodyInitialized, 0, 'Normal startup does not load the pose model');
  assert.equal(faceInitialized, 0, 'Normal startup does not load the face model');

  assert.equal(await engine.toggleBodyTracking(), true);
  assert.equal(engine.bodyTracker.enabled, true);
  assert.equal(bodyInitialized, 1);
  assert.equal(await engine.toggleBodyTracking(), false);
  assert.equal(engine.bodyTracker.enabled, false);

  assert.equal(await engine.toggleFaceTracking(), true);
  assert.equal(engine.faceTracker.enabled, true);
  assert.equal(faceInitialized, 1);
  assert.equal(await engine.toggleFaceTracking(), false);
  assert.equal(engine.faceTracker.enabled, false);

  engine.bodyTracker.isInitialized = false;
  engine.bodyTracker.initialize = async () => false;
  await assert.rejects(engine.toggleBodyTracking(), /seguimiento corporal local/);
  assert.equal(engine.bodyTracker.enabled, false, 'Failed initialization never leaves body tracking enabled');

  engine.faceTracker.isInitialized = false;
  engine.faceTracker.initialize = async () => false;
  await assert.rejects(engine.toggleFaceTracking(), /seguimiento facial local/);
  assert.equal(engine.faceTracker.enabled, false, 'Failed initialization never leaves face tracking enabled');
}

function makeRenderer() {
  const renderer = Object.create(FullSensorView.prototype);
  renderer.isActive = true;
  renderer.visualizationMode = 'standard';
  renderer.canvas = { width: 100, height: 100 };
  renderer.ctx = { clearRect() {} };
  renderer.videoRect = { x: 0, y: 0, width: 100, height: 100 };
  renderer._smoothedHands = new Map();
  renderer.resize = () => {};
  renderer.project = (x, y) => ({ x, y });
  return renderer;
}

function makeLandmarks(count, x = 0.2) {
  return Array.from({ length: count }, (_, index) => ({
    x,
    y: 0.25 + index / 1000,
    z: 0,
    visibility: 1
  }));
}

function testVisualizationModesAndHandSmoothing() {
  const renderer = makeRenderer();
  const calls = [];
  for (const method of [
    '_renderSensorFrame',
    '_renderBodyPose',
    '_renderDiagnosticFace',
    '_renderHand',
    '_renderObject',
    '_renderSensorHUD',
    '_renderPerceptionDebugBox'
  ]) {
    renderer[method] = (...args) => calls.push([method, ...args]);
  }

  const body = { landmarks: makeLandmarks(33), missingFrames: 0 };
  const face = { landmarks: makeLandmarks(478), missingFrames: 0, rotation: { yaw: 4, pitch: -2 } };
  const worldModel = {
    getEntity(id) {
      return id === 'body-primary' ? body : face;
    },
    getEntitiesByType() {
      return [];
    }
  };

  const rawLandmarks = makeLandmarks(21);
  const rawHand = { handedness: 'Right', confidence: 0.95, landmarks: rawLandmarks };
  const frame = { hands: [rawHand], body, face, worldModel };
  renderer.render(frame);

  assert.equal(calls.filter(([method]) => method === '_renderHand').length, 1);
  assert.equal(calls.some(([method]) => method === '_renderBodyPose'), false, 'Standard view hides body');
  assert.equal(calls.some(([method]) => method === '_renderDiagnosticFace'), false, 'Standard view hides face landmarks');
  assert.equal(calls.some(([method]) => method === '_renderSensorFrame'), false, 'Standard view has no diagnostic frame');

  rawHand.landmarks = makeLandmarks(21, 0.3);
  renderer.render(frame);
  const renderedHandCalls = calls.filter(([method]) => method === '_renderHand');
  const smoothed = renderedHandCalls.at(-1)[2];
  assert.ok(smoothed[0].x > 0.2 && smoothed[0].x < 0.3, 'Visual smoothing eases hand motion');
  assert.equal(rawHand.landmarks[0].x, 0.3, 'Visual smoothing does not mutate interaction landmarks');

  renderer.setVisualizationMode('body');
  renderer.render(frame);
  assert.ok(calls.some(([method, , , mode]) => method === '_renderBodyPose' && mode === 'body'));
  assert.equal(calls.some(([method]) => method === '_renderDiagnosticFace'), false);

  renderer.setVisualizationMode('diagnostics');
  renderer.render(frame);
  assert.ok(calls.some(([method, , , mode]) => method === '_renderBodyPose' && mode === 'diagnostics'));
  assert.ok(calls.some(([method]) => method === '_renderDiagnosticFace'));
  assert.ok(calls.some(([method]) => method === '_renderSensorHUD'));
  assert.ok(calls.some(([method]) => method === '_renderPerceptionDebugBox'));

  const beforeMissingBody = calls.filter(([method]) => method === '_renderBodyPose').length;
  const beforeMissingFace = calls.filter(([method]) => method === '_renderDiagnosticFace').length;
  body.missingFrames = 1;
  face.missingFrames = 1;
  renderer.render(frame);
  assert.equal(calls.filter(([method]) => method === '_renderBodyPose').length, beforeMissingBody);
  assert.equal(calls.filter(([method]) => method === '_renderDiagnosticFace').length, beforeMissingFace);

  renderer.render({ ...frame, hands: [] });
  assert.equal(renderer._smoothedHands.size, 0, 'Lost hands clear their visual smoothing state immediately');

  assert.throws(() => renderer.setVisualizationMode('unknown'), RangeError);
}

function testThreeDimensionalBodyVisibilityMode() {
  const visualizer = Object.create(HandVisualizer3D.prototype);
  visualizer.container = { clientWidth: 1000, clientHeight: 500 };
  visualizer.camera = { position: { z: 3.2 }, fov: 55 };
  const kinematicState = {
    points: makeLandmarks(21),
    screenPoints: makeLandmarks(21).map((point) => ({ u: point.x, v: point.y }))
  };
  visualizer.projectHand(kinematicState);

  assert.equal(kinematicState.worldPoints.length, 21, 'All detected landmarks remain available in 3D');
  assert.deepEqual(
    kinematicState.tipWorld.toArray(),
    kinematicState.worldPoints[8].toArray(),
    '3D interactions continue using the projected index fingertip'
  );
  assert.equal('handRigs' in visualizer, false, 'Three.js no longer creates a second visible hand rig');
  assert.equal('bodyRig' in visualizer, false, 'Three.js no longer duplicates the body overlay');
}

function testHandDrawingUsesOneConsistentCanvasStyle() {
  const drawCalls = { strokes: [], arcs: [] };
  const context = {
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {
      drawCalls.strokes.push({ color: this.strokeStyle, width: this.lineWidth });
    },
    fill() {},
    arc(x, y, radius) {
      drawCalls.arcs.push(radius);
    }
  };
  const renderer = Object.create(FullSensorView.prototype);
  renderer.project = (x, y) => ({ x, y });
  renderer._renderHand(context, makeLandmarks(21));

  assert.equal(drawCalls.strokes.length, 23, 'The single renderer draws each of the 23 connections once');
  assert.equal(drawCalls.arcs.length, 6, 'Only wrist and fingertips are marked');
  assert.ok(drawCalls.strokes.every((stroke) => stroke.width === 1.8), 'All bones use a consistent, legible stroke width');
  assert.ok(drawCalls.strokes.every((stroke) => stroke.color === '#78bfff'), 'All hands share the technology-blue stroke');
  assert.deepEqual(drawCalls.arcs.slice(1), Array(5).fill(2), 'Joint dots remain small and uniform');
}

function testBothHandsRenderOnceAndOverlayMountsOnce() {
  const drawCalls = { strokes: 0, arcs: 0 };
  const context = {
    save() {},
    restore() {},
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() { drawCalls.strokes++; },
    fill() {},
    arc() { drawCalls.arcs++; }
  };
  const renderer = Object.create(FullSensorView.prototype);
  renderer.isActive = true;
  renderer.visualizationMode = 'standard';
  renderer.canvas = { width: 800, height: 600 };
  renderer.ctx = context;
  renderer._canvasSize = { width: 800, height: 600 };
  renderer._smoothedHands = new Map();
  renderer.videoRect = { x: 0, y: 0, width: 800, height: 600 };
  renderer.resize = () => {};
  renderer.project = (x, y) => ({ x, y });
  const worldModel = { getEntity: () => null };

  renderer.render({
    hands: [
      { handedness: 'Left', landmarks: makeLandmarks(21), confidence: 0.9 },
      { handedness: 'Right', landmarks: makeLandmarks(21, 0.7), confidence: 0.9 }
    ],
    worldModel
  });
  assert.equal(drawCalls.strokes, 46, 'Two hands draw exactly 23 connections apiece');
  assert.equal(drawCalls.arcs, 12, 'Two hands draw only six small joint markers apiece');

  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  const appended = [];
  let resizeListenersAdded = 0;
  let resizeListenersRemoved = 0;
  globalThis.document = {
    body: {},
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        classList: { toggle() {} },
        getContext: () => context,
        remove() {}
      };
    }
  };
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener(event) {
      if (event === 'resize') resizeListenersAdded++;
    },
    removeEventListener(event) {
      if (event === 'resize') resizeListenersRemoved++;
    }
  };

  try {
    const container = {
      clientWidth: 800,
      clientHeight: 600,
      appendChild(element) { appended.push(element); }
    };
    const video = { videoWidth: 640, videoHeight: 480 };
    const first = new FullSensorView(video, container);
    const second = new FullSensorView(video, container);
    assert.equal(first, second, 'Repeated overlay construction returns the same renderer');
    assert.equal(appended.length, 1, 'Only one tracking canvas is mounted');
    assert.equal(resizeListenersAdded, 1, 'Only one resize listener is registered');
    first.destroy();
    assert.equal(resizeListenersRemoved, 1, 'Destroy removes the resize listener');

    const remounted = new FullSensorView(video, container);
    assert.notEqual(remounted, first, 'A destroyed renderer can be mounted again');
    assert.equal(appended.length, 2, 'Remounting creates exactly one new canvas');
    assert.equal(resizeListenersAdded, 2, 'Remounting registers one fresh resize listener');
    remounted.destroy();
    assert.equal(resizeListenersRemoved, 2, 'Destroying the remount removes its listener');
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
}

async function testHandTrackerInitializationIsIdempotentAfterSuccess() {
  const tracker = Object.create(HandTracker.prototype);
  tracker.handLandmarker = { close() {} };
  tracker.isInitialized = true;
  tracker._initializationPromise = null;
  assert.equal(await tracker.initialize(), true);
}

async function testCameraStartIsIdempotentForAnActiveSession() {
  const video = { readyState: 2, videoWidth: 640, videoHeight: 480, srcObject: null };
  const source = { id: 'cam-front' };
  let startCalls = 0;
  let loopStarts = 0;
  const engine = Object.create(PerceptionEngine.prototype);
  engine._loopRunning = false;
  engine._loopGeneration = 0;
  engine._processingFrameId = null;
  engine._cameraStartPromise = null;
  engine._startingVideoElement = null;
  engine._cancelVideoReadyWait = null;
  engine.state = 'OFF';
  engine.cameraManager = {
    sources: new Map(),
    async startCamera() {
      startCalls++;
      video.srcObject = { active: true, getVideoTracks: () => [{ readyState: 'live' }] };
      this.sources.set(source.id, source);
      return source;
    },
    stopCamera() {},
    stopAll() {
      video.srcObject = null;
      this.sources.clear();
    }
  };
  engine.diagnostics = {
    hands: {
      left: { detected: false, landmarksCount: 0, confidence: 0 },
      right: { detected: false, landmarksCount: 0, confidence: 0 }
    }
  };
  engine.stats = { detectedHandsCount: 0 };
  engine._waitForVideoReady = async () => true;
  engine._startProcessingLoop = () => { loopStarts++; };

  const [first, concurrent] = await Promise.all([
    engine.startCamera(video),
    engine.startCamera(video)
  ]);
  const second = await engine.startCamera(video);
  assert.equal(first, source);
  assert.equal(concurrent, source);
  assert.equal(second, source);
  assert.equal(startCalls, 1, 'Concurrent and repeated starts reuse the active camera');
  assert.equal(loopStarts, 1, 'An active camera owns one processing loop');

  engine.stop();
  assert.equal(video.srcObject, null, 'Stopping releases the active camera stream');
  const reopened = await engine.startCamera(video);
  assert.equal(reopened, source);
  assert.equal(startCalls, 2, 'Reopening acquires one new camera session');
  assert.equal(loopStarts, 2, 'Reopening creates exactly one new processing loop');
}

function testProcessingLoopIsSingleAndOldCallbacksCannotRestartIt() {
  const oldRequestAnimationFrame = globalThis.requestAnimationFrame;
  const oldCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const queuedFrames = new Map();
  let nextFrameId = 0;
  globalThis.requestAnimationFrame = (callback) => {
    const id = ++nextFrameId;
    queuedFrames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => queuedFrames.delete(id);

  try {
    const engine = Object.create(PerceptionEngine.prototype);
    engine._loopRunning = true;
    engine._loopGeneration = 1;
    engine._processingFrameId = null;
    engine.videoElement = { readyState: 0, videoWidth: 0, videoHeight: 0, srcObject: null };
    engine.cameraManager = { stopAll() {} };
    engine.diagnostics = {
      hands: {
        left: { detected: true, landmarksCount: 21, confidence: 0.9 },
        right: { detected: false, landmarksCount: 0, confidence: 0 }
      }
    };
    engine.stats = { detectedHandsCount: 1 };
    let emptyFrames = 0;
    engine.onFrameCallback = ({ hands }) => {
      if (hands.length === 0) emptyFrames++;
    };

    engine._startProcessingLoop();
    engine._startProcessingLoop();
    assert.equal(queuedFrames.size, 1, 'Repeated starts schedule only one processing frame');
    const staleCallback = [...queuedFrames.values()][0];
    const firstId = engine._processingFrameId;
    queuedFrames.delete(firstId);
    staleCallback();
    assert.equal(queuedFrames.size, 1, 'The active processing callback schedules one successor');

    engine.stop();
    assert.equal(queuedFrames.size, 0, 'Stopping cancels the pending processing callback');
    assert.equal(emptyFrames, 1, 'Stopping emits one empty frame to clear visual hand state');
    assert.equal(engine.diagnostics.hands.left.detected, false);

    engine._loopRunning = true;
    engine.state = 'RUNNING';
    engine._startProcessingLoop();
    assert.equal(queuedFrames.size, 1, 'Restarting schedules a single new loop');
    staleCallback();
    assert.equal(queuedFrames.size, 1, 'A stale callback from the previous session cannot add a loop');
    engine.stop();
  } finally {
    if (oldRequestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = oldRequestAnimationFrame;
    if (oldCancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = oldCancelAnimationFrame;
  }
}

await testBodyAndFaceAreOptIn();
testVisualizationModesAndHandSmoothing();
testThreeDimensionalBodyVisibilityMode();
testHandDrawingUsesOneConsistentCanvasStyle();
testBothHandsRenderOnceAndOverlayMountsOnce();
await testHandTrackerInitializationIsIdempotentAfterSuccess();
await testCameraStartIsIdempotentForAnActiveSession();
testProcessingLoopIsSingleAndOldCallbacksCannotRestartIt();
console.log('✅ One skeleton renderer, stable tracking lifecycle, and independent interaction coordinates');
