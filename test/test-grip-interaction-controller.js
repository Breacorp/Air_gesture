import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Air3DStudio } from '../src/studio/air-3d-studio.js';
import { GripInteractionController, GripState } from '../src/studio/grip-interaction-controller.js';
import { ActionResolver } from '../src/core/interaction/action-resolver.js';
import { IntentState } from '../src/core/interaction/spatial-intent.js';

function makeHand(pinchRatio = 0.8, {
  x = 0,
  y = 0,
  z = 0,
  confidence = 0.9,
  palmWidth = 0.12,
  isPeace = false,
  orientation = {}
} = {}) {
  const screenPoints = Array.from({ length: 21 }, () => ({ u: 0.5, v: 0.5 }));
  screenPoints[4] = { u: 0.4, v: 0.5 };
  screenPoints[8] = { u: 0.4 + pinchRatio * palmWidth, v: 0.5 };
  screenPoints[5] = { u: 0.4, v: 0.5 };
  screenPoints[17] = { u: 0.4 + palmWidth, v: 0.5 };
  const tipWorld = new THREE.Vector3(x, y, z);
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const worldPoints = Array.from({ length: 21 }, () => new THREE.Vector3());
  worldPoints[0].set(x - 0.1, y - 0.1, z);
  worldPoints[8].copy(tipWorld);

  return {
    confidence,
    screenPoints,
    points,
    worldPoints,
    tipWorld,
    palm: { orientation: { roll: 0, pitch: 0, yaw: 0, ...orientation } },
    pose: { isPeace },
    fingers: {}
  };
}

function update(controller, time, hands, canGrab = {}) {
  return controller.update(hands, time, canGrab);
}

function testOpenHandsAndConfidenceNeverGrab() {
  const controller = new GripInteractionController();
  const first = update(controller, 100, { Right: makeHand(0.8) }, { Right: true });
  const moved = update(controller, 180, { Right: makeHand(0.8, { x: 2 }) }, { Right: true });
  assert.equal(first.states.Right.state, GripState.HOVER);
  assert.equal(moved.states.Right.state, GripState.HOVER);
  assert.deepEqual(moved.grabbedHands, [], 'An open hand moving over the model never owns it');

  const lowConfidence = update(
    controller,
    200,
    { Right: makeHand(0.1, { confidence: 0.4 }) },
    { Right: true }
  );
  assert.equal(lowConfidence.states.Right.state, GripState.NO_HAND);
  assert.deepEqual(lowConfidence.grabbedHands, []);
}

function testNormalizedPinchRequiresModelHoverAndConfirmation() {
  const controller = new GripInteractionController();
  const candidate = makeHand(0.2, { palmWidth: 0.12 });
  const differentlyScaledCandidate = makeHand(0.2, { palmWidth: 0.3 });

  update(controller, 100, { Right: candidate });
  const offModel = update(controller, 500, { Right: differentlyScaledCandidate });
  assert.equal(offModel.states.Right.state, GripState.PINCH_CANDIDATE);
  assert.deepEqual(offModel.grabbedHands, [], 'Pinching away from a raycast hit cannot grab');

  const hovering = update(controller, 510, { Right: differentlyScaledCandidate }, { Right: true });
  assert.deepEqual(hovering.grabbedHands, []);
  const confirmed = update(controller, 580, { Right: differentlyScaledCandidate }, { Right: true });
  assert.equal(confirmed.states.Right.state, GripState.GRABBED);
  assert.deepEqual(confirmed.grabbedHands, ['Right']);
  assert.equal(confirmed.events.some((event) => event.type === 'grab-start'), true);
}

function testHysteresisAndConfirmedRelease() {
  const controller = new GripInteractionController();
  update(controller, 100, { Left: makeHand(0.2) }, { Left: true });
  update(controller, 170, { Left: makeHand(0.2) }, { Left: true });

  const neutralBand = update(controller, 190, { Left: makeHand(0.4) }, { Left: true });
  assert.equal(neutralBand.states.Left.state, GripState.GRABBED);
  assert.deepEqual(neutralBand.grabbedHands, ['Left']);

  const releasing = update(controller, 200, { Left: makeHand(0.5) }, { Left: true });
  assert.equal(releasing.states.Left.state, GripState.RELEASING);
  assert.deepEqual(releasing.grabbedHands, ['Left'], 'Release remains pending through its confirmation window');
  assert.equal(controller.isTransforming('Left'), false, 'A releasing hand cannot keep moving the model');

  const stillPending = update(controller, 250, { Left: makeHand(0.5) }, { Left: true });
  assert.deepEqual(stillPending.grabbedHands, ['Left']);
  const released = update(controller, 256, { Left: makeHand(0.5) }, { Left: true });
  assert.deepEqual(released.grabbedHands, []);
  assert.equal(released.states.Left.state, GripState.RELEASED);
}

function testExplicitBimanualOwnershipAndIndependentSides() {
  const controller = new GripInteractionController();
  update(controller, 100, { Left: makeHand(0.2), Right: makeHand(0.2) }, { Left: true, Right: true });
  const twoOpen = update(
    controller,
    170,
    { Left: makeHand(0.8), Right: makeHand(0.8) },
    { Left: true, Right: true }
  );
  assert.deepEqual(twoOpen.grabbedHands, [], 'Two visible open hands never activate bimanual mode');

  update(controller, 200, { Left: makeHand(0.2), Right: makeHand(0.8) }, { Left: true, Right: true });
  const oneOwner = update(
    controller,
    270,
    { Left: makeHand(0.2), Right: makeHand(0.8, { x: 0.5 }) },
    { Left: true, Right: true }
  );
  assert.deepEqual(oneOwner.grabbedHands, ['Left']);
  assert.equal(oneOwner.interactionMode, 'one-hand');

  update(controller, 300, { Left: makeHand(0.2), Right: makeHand(0.2) }, { Left: true, Right: true });
  const bothOwners = update(
    controller,
    370,
    { Left: makeHand(0.2), Right: makeHand(0.2) },
    { Left: true, Right: true }
  );
  assert.deepEqual(bothOwners.grabbedHands, ['Left', 'Right']);
  assert.equal(bothOwners.interactionMode, 'two-hand');
}

function testTrackingGraceAndReacquisition() {
  const controller = new GripInteractionController();
  update(controller, 100, { Right: makeHand(0.2) }, { Right: true });
  update(controller, 170, { Right: makeHand(0.2) }, { Right: true });

  const missing = update(controller, 200, {});
  assert.equal(missing.states.Right.state, GripState.RELEASING);
  assert.deepEqual(missing.grabbedHands, ['Right']);
  const recovered = update(controller, 250, { Right: makeHand(0.2, { x: 0.4 }) }, { Right: true });
  assert.equal(recovered.grabbedHands.includes('Right'), true);
  assert.equal(recovered.events.some((event) => event.type === 'reacquired'), true);

  update(controller, 260, {});
  const gracePeriod = update(controller, 369, {});
  assert.deepEqual(gracePeriod.grabbedHands, ['Right']);
  const expired = update(controller, 370, {});
  assert.deepEqual(expired.grabbedHands, []);
  assert.equal(expired.events.some((event) => event.type === 'release' && event.reason === 'tracking-lost'), true);
}

function testStudioOpenHandIsInertAndPinchMoves() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.z = 3.2;
  const studio = new Air3DStudio(scene, camera, {});
  studio.setActive(true);
  studio._updateHandTarget = () => true;

  const hand = makeHand(0.8);
  studio.update({ Right: hand, timestamp: 1000 });
  hand.tipWorld.x = 0.8;
  studio.update({ Right: hand, timestamp: 1016 });
  assert.equal(studio.isGrabbing, false);
  assert.ok(studio.modelContainer.position.length() < 1e-9, 'Open-hand motion leaves the model position unchanged');
  assert.ok(studio.modelContainer.quaternion.angleTo(new THREE.Quaternion()) < 1e-9, 'Open-hand motion leaves the model rotation unchanged');
  studio.update({
    Left: makeHand(0.8, { x: -0.6 }),
    Right: makeHand(0.8, { x: 0.8 }),
    timestamp: 1024
  });
  assert.equal(studio.interactionMode, 'idle', 'Two open hands do not start bimanual control');
  assert.equal(studio.modelContainer.position.length(), 0);

  hand.screenPoints[8].u = 0.4 + 0.2 * 0.12;
  studio.update({ Right: hand, timestamp: 1040 });
  studio.update({ Right: hand, timestamp: 1110 });
  assert.equal(studio.isGrabbing, true, 'A confirmed pinch on the model starts a grab');

  hand.tipWorld.x += 0.2;
  studio.update({ Right: hand, timestamp: 1126 });
  assert.ok(studio.targetPosition.x > 0, 'Only a confirmed pinch can translate the model');

  const secondHand = makeHand(0.2, { x: -0.3 });
  studio.update({ Left: secondHand, Right: hand, timestamp: 1142 });
  const beforeBimanualAnchor = studio.targetPosition.clone();
  const scaleBeforeBimanualAnchor = studio.targetScale;
  studio.update({ Left: secondHand, Right: hand, timestamp: 1210 });
  assert.equal(studio.interactionMode, 'two-hand');
  assert.ok(studio.targetPosition.distanceTo(beforeBimanualAnchor) < 1e-9, 'Adding the second confirmed grip re-anchors without changing the target position');
  assert.equal(studio.targetScale, scaleBeforeBimanualAnchor, 'Entering bimanual mode preserves the target scale');

  hand.tipWorld.x += 0.2;
  studio.update({ Left: secondHand, Right: hand, timestamp: 1226 });
  assert.ok(studio.targetScale > scaleBeforeBimanualAnchor, 'Two confirmed pinches can scale the model');

  const beforeTrackingLoss = studio.targetPosition.clone();
  const scaleBeforeTrackingLoss = studio.targetScale;
  studio.update({ Right: hand, timestamp: 1242 });
  assert.deepEqual(studio.grabbedHands, ['Left', 'Right'], 'A short tracking loss retains ownership during its grace period');
  assert.ok(studio.targetPosition.distanceTo(beforeTrackingLoss) < 1e-9, 'Tracking loss freezes the target position');
  assert.equal(studio.targetScale, scaleBeforeTrackingLoss, 'Tracking loss freezes the target scale');

  studio.update({ Right: hand, timestamp: 1352 });
  assert.deepEqual(studio.grabbedHands, ['Right'], 'A timed-out hand releases only its own grip');
  assert.ok(studio.targetPosition.distanceTo(beforeTrackingLoss) < 1e-9, 'Dropping to one owner re-anchors without changing the target position');
  studio.setActive(false);
  assert.equal(studio.isGrabbing, false, 'Closing Studio clears its owners');
  studio._clearModel();
}

function testAnchoredPeaceGestureRotatesOnAllThreeAxes() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const studio = new Air3DStudio(scene, camera, {});
  const hand = makeHand(0.8, { isPeace: true });
  studio._anchorRotationHand('Right', hand);

  hand.tipWorld.set(0.3, -0.2, 0.25);
  studio._applyRotationGesture('Right', hand);
  const target = studio.targetQuaternion.clone();
  assert.ok(target.angleTo(new THREE.Quaternion()) > 0.2, 'Peace-hand movement rotates the model');

  const delta = hand.tipWorld.clone().sub(studio.rotationAnchor.handPoint);
  const expected = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-delta.y * 2.4, delta.x * 2.4, delta.z * 2.4, 'XYZ')
  );
  assert.ok(target.angleTo(expected) < 1e-9, 'X, Y, and Z hand movement combine into a free quaternion rotation');

  hand.pose.isPeace = false;
  const frozen = studio.targetQuaternion.clone();
  hand.tipWorld.x += 1;
  studio._applyRotationGesture('Right', hand);
  assert.ok(studio.targetQuaternion.angleTo(frozen) < 1e-9, 'Releasing the V pose stops rotation immediately');
  studio._clearModel();
}

function testPeaceGestureCanReachAFullHorizontalTurn() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const studio = new Air3DStudio(scene, camera, {});
  const hand = makeHand(0.8, { x: -1.31, isPeace: true });
  studio._anchorRotationHand('Left', hand);
  hand.tipWorld.x = 1.31;
  studio._applyRotationGesture('Left', hand);
  assert.ok(
    studio.targetQuaternion.angleTo(new THREE.Quaternion()) < 0.02,
    'A full horizontal sweep can complete a 360-degree turn without an imposed angle clamp'
  );
  studio._clearModel();
}

function testBimanualScaleAndQuaternionRotationModes() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.z = 3.2;
  const studio = new Air3DStudio(scene, camera, {});
  const left = makeHand(0.2, { x: -0.3 });
  const right = makeHand(0.2, { x: 0.3 });

  studio.modelContainer.scale.setScalar(1);
  studio.bimanualMode = 'combined';
  studio._anchorTwoHands(left, right);
  left.tipWorld.set(-0.4, -0.2, 0.15);
  right.tipWorld.set(0.4, 0.2, -0.15);
  left.palm.orientation = { roll: 20, pitch: 15, yaw: 35 };
  right.palm.orientation = { roll: -15, pitch: -10, yaw: -25 };
  studio._applyTwoHandTransform(left, right);
  assert.ok(studio.targetScale > 1, 'Combined mode scales by changing hand distance');
  assert.ok(studio.targetQuaternion.angleTo(new THREE.Quaternion()) > 0.2, 'Combined mode rotates from 3D hand orientation');

  studio.modelContainer.scale.setScalar(1);
  studio.bimanualMode = 'scale';
  studio._anchorTwoHands(left, right);
  const scaleOnlyRotation = studio.targetQuaternion.clone();
  right.tipWorld.x += 0.25;
  studio._applyTwoHandTransform(left, right);
  assert.ok(studio.targetScale > 1, 'Scale-priority mode changes scale');
  assert.ok(studio.targetQuaternion.angleTo(scaleOnlyRotation) < 1e-6, 'Scale-priority mode does not rotate');

  studio.modelContainer.scale.setScalar(1);
  studio.bimanualMode = 'rotate';
  studio._anchorTwoHands(left, right);
  const rotateOnlyScale = studio.targetScale;
  right.tipWorld.set(0.2, -0.35, 0.2);
  left.tipWorld.set(-0.2, 0.35, -0.2);
  studio._applyTwoHandTransform(left, right);
  assert.ok(studio.targetQuaternion.angleTo(new THREE.Quaternion()) > 0.2, 'Rotation-priority mode rotates in 3D');
  assert.equal(studio.targetScale, rotateOnlyScale, 'Rotation-priority mode preserves scale');
  studio._clearModel();
}

function testCameraOrbitIsIndependentFromObjectRotation() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.z = 3.2;
  const studio = new Air3DStudio(scene, camera, {});
  studio.rotationTarget = 'camera';
  const left = makeHand(0.2, { x: -0.3 });
  const right = makeHand(0.2, { x: 0.3 });
  studio._anchorTwoHands(left, right);
  const modelRotation = studio.modelContainer.quaternion.clone();
  left.tipWorld.set(-0.4, -0.2, 0.15);
  right.tipWorld.set(0.4, 0.2, -0.15);
  left.palm.orientation = { roll: 20, pitch: 15, yaw: 35 };
  right.palm.orientation = { roll: -15, pitch: -10, yaw: -25 };
  studio._applyTwoHandTransform(left, right);
  assert.ok(studio.targetCameraPosition.distanceTo(camera.position) > 0.1, 'Orbit mode moves the camera around the model');
  assert.ok(studio.targetQuaternion.angleTo(modelRotation) < 1e-6, 'Camera orbit leaves the object orientation unchanged');
  studio._clearModel();
}

function testLoadedModelsAreCenteredIndependentOfPreviousTransforms() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const studio = new Air3DStudio(scene, camera, {});
  studio.modelContainer.position.set(4, -3, 2);
  studio.modelContainer.rotation.set(0.3, 0.4, -0.2);

  const geometry = new THREE.BoxGeometry(2, 4, 6);
  geometry.translate(8, -3, 5);
  const model = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  studio._installLoadedModel(model);
  studio.modelContainer.updateMatrixWorld(true);
  const centeredBounds = new THREE.Box3().setFromObject(model);
  const center = centeredBounds.getCenter(new THREE.Vector3());
  const size = centeredBounds.getSize(new THREE.Vector3());
  assert.ok(center.length() < 1e-6, 'An off-origin model is centered on its geometric pivot');
  assert.ok(Math.abs(Math.max(size.x, size.y, size.z) - 1.6) < 1e-6, 'Centered geometry is normalized to the workspace');
  assert.equal(studio.modelContainer.position.length(), 0, 'Import resets previous translation');
  assert.ok(studio.modelContainer.quaternion.angleTo(new THREE.Quaternion()) < 1e-9, 'Import resets previous rotation');
  studio._clearModel();
}

function testGestureModeChangesPreserveTransformAndRejectOpenHand() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.z = 3.2;
  const studio = new Air3DStudio(scene, camera, {});
  studio.setActive(true);
  studio._updateHandTarget = () => true;
  const owner = makeHand(0.2, { x: -0.2 });
  const free = makeHand(0.8, { x: 0.2, isPeace: true });

  studio.update({ Left: owner, Right: free, timestamp: 1000 });
  studio.update({ Left: owner, Right: free, timestamp: 1070 });
  assert.deepEqual(studio.grabbedHands, ['Left'], 'Only the confirmed pinch owns the model');
  studio.update({ Left: owner, Right: free, timestamp: 1180 });
  assert.equal(studio.currentControlMode, 'rotate', 'The held V pose activates free-hand rotation');
  const beforeMove = studio.targetQuaternion.clone();
  free.tipWorld.x += 0.2;
  studio.update({ Left: owner, Right: free, timestamp: 1196 });
  assert.ok(studio.targetQuaternion.angleTo(beforeMove) > 0.1, 'The free hand rotates the held model');

  const transform = {
    position: studio.targetPosition.clone(),
    rotation: studio.targetQuaternion.clone(),
    scale: studio.targetScale
  };
  studio.setBimanualMode('scale');
  studio.setRotationTarget('camera');
  assert.ok(studio.targetPosition.distanceTo(transform.position) < 1e-9, 'Changing operation modes preserves translation');
  assert.ok(studio.targetQuaternion.angleTo(transform.rotation) < 1e-9, 'Changing operation modes preserves rotation');
  assert.equal(studio.targetScale, transform.scale, 'Changing operation modes preserves scale');
  assert.throws(() => studio.setBimanualMode('unknown'), RangeError);
  assert.throws(() => studio.setRotationTarget('unknown'), RangeError);
  studio._clearModel();
}

function testBimanualScaleUsesAndResetsToModelBaseline() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const studio = new Air3DStudio(scene, camera, {});
  const left = makeHand(0.2, { x: -0.2 });
  const right = makeHand(0.2, { x: 0.2 });
  for (const baseline of [0.02, 0.2, 2]) {
    studio.modelContainer.scale.setScalar(baseline);
    studio.targetScale = baseline;
    right.tipWorld.x = 0.2;
    studio._anchorTwoHands(left, right);
    right.tipWorld.x = 0.4;
    studio._applyTwoHandTransform(left, right);
    assert.ok(
      Math.abs(studio.targetScale - baseline * 1.5) < 1e-9,
      `Two-hand scaling is relative to the anchored model scale (${baseline})`
    );
    assert.equal(studio.twoHandAnchor.modelScale, baseline);
  }

  studio.modelContainer.scale.setScalar(9);
  studio.resetTransform();
  assert.equal(studio.modelContainer.scale.x, studio.baseModelScale, 'Reset uses the model import baseline');
  studio._clearModel();
}

function testGenericActionsCannotBypassPinchInActiveStudio() {
  const studio = {
    isActive: true,
    isGrabbing: true,
    interactionMode: 'one-hand',
    currentPoseLabel: 'GRABBED',
    isHoveringModel: false,
    modelContainer: {
      position: new THREE.Vector3(),
      rotation: new THREE.Euler(),
      scale: new THREE.Vector3(1, 1, 1)
    }
  };
  const resolver = new ActionResolver();
  resolver.setSceneProviders({ studio });
  const context = {
    is3D: () => true,
    isPhysical: () => false,
    capabilities: { interactive: true },
    targetType: 'studio_model'
  };
  const before = {
    position: studio.modelContainer.position.clone(),
    rotation: studio.modelContainer.rotation.clone(),
    scale: studio.modelContainer.scale.clone()
  };

  resolver._resolveGrab({ state: IntentState.START }, context, {});
  resolver._resolvePoint({}, context, {});
  resolver._resolveDrag({ delta: { x: 20, y: 20, z: 20 } }, context, {});
  resolver._resolveScale({ delta: 1 }, context, {});
  resolver._resolveRotate({ delta: 1 }, context, {});
  resolver._resolvePushPull({ velocity: { z: 1 } }, context, {});
  resolver._resolveRelease({}, context, {});

  assert.deepEqual(studio.modelContainer.position.toArray(), before.position.toArray());
  assert.deepEqual(studio.modelContainer.rotation.toArray(), before.rotation.toArray());
  assert.deepEqual(studio.modelContainer.scale.toArray(), before.scale.toArray());
  assert.equal(studio.isGrabbing, true, 'Generic release cannot reset the pinch interaction state');
  assert.equal(studio.isHoveringModel, false, 'Generic pointer events cannot fabricate a model raycast hit');
}

testOpenHandsAndConfidenceNeverGrab();
testNormalizedPinchRequiresModelHoverAndConfirmation();
testHysteresisAndConfirmedRelease();
testExplicitBimanualOwnershipAndIndependentSides();
testTrackingGraceAndReacquisition();
testStudioOpenHandIsInertAndPinchMoves();
testAnchoredPeaceGestureRotatesOnAllThreeAxes();
testPeaceGestureCanReachAFullHorizontalTurn();
testBimanualScaleAndQuaternionRotationModes();
testCameraOrbitIsIndependentFromObjectRotation();
testLoadedModelsAreCenteredIndependentOfPreviousTransforms();
testGestureModeChangesPreserveTransformAndRejectOpenHand();
testBimanualScaleUsesAndResetsToModelBaseline();
testGenericActionsCannotBypassPinchInActiveStudio();
console.log('✅ Air 3D Studio manipulation requires a confirmed pinch on a raycast model hit');
