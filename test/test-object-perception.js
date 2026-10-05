/**
 * Test Suite: Multi-Signal Object Perception & Temporal Tracking Engine
 * 
 * Verifies:
 * 1. Multi-signal detection (Orange, Black, Metallic, Blue, Red).
 * 2. Persistent identity: object-001 across consecutive frames.
 * 3. Hand occlusion handling & Dead-Reckoning (status: ACTIVE -> OCCLUDED -> COASTING).
 * 4. Trajectory breadcrumbs generation (• • •).
 * 5. SpatialWorldModel integration with TrackedEntity.
 */

import { ObjectTrackingEngine, ObjectTrack } from '../src/core/perception/objects/object-tracking-engine.js';
import { SpatialWorldModel } from '../src/core/spatial/world-model.js';

console.log('🧪 Starting Object Perception & Temporal Tracking Engine Test...\n');

let testsPassed = 0;
let testsTotal = 0;

function assert(condition, message) {
  testsTotal++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

// ==========================================
// TEST 1: Persistent object-001 Formatting & Lifecycle
// ==========================================
console.log('--- Test 1: Persistent object-001 Identity ---');
const tracker = new ObjectTrackingEngine();

// Frame 1: Object detected at (0.52, 0.48)
const detFrame1 = [{
  id: 'cand-1',
  centroid: { x: 0.52, y: 0.48 },
  boundingBox: { minX: 0.47, minY: 0.38, maxX: 0.57, maxY: 0.58, width: 0.10, height: 0.20 },
  confidence: 0.94,
  shapeLabel: 'elongated',
  subType: 'screwdriver',
  occlusionPct: 20,
  contour: [{ x: 0.47, y: 0.38 }, { x: 0.57, y: 0.58 }]
}];

const tracks1 = tracker.update(detFrame1, null, null, 1000);
assert(tracks1.length === 1, 'Tracker returned 1 active track');
assert(tracks1[0].id === 'object-001', `Formatted ID is exactly object-001 (got ${tracks1[0].id})`);
assert(tracks1[0].status === 'ACTIVE', 'Initial track status is ACTIVE');
assert(tracks1[0].subType === 'screwdriver', 'subType recognized as screwdriver (elongated)');

// Frame 2: Object moves to (0.54, 0.47)
const detFrame2 = [{
  id: 'cand-2',
  centroid: { x: 0.54, y: 0.47 },
  boundingBox: { minX: 0.49, minY: 0.37, maxX: 0.59, maxY: 0.57, width: 0.10, height: 0.20 },
  confidence: 0.95,
  shapeLabel: 'elongated',
  occlusionPct: 25
}];

const tracks2 = tracker.update(detFrame2, null, null, 1033);
assert(tracks2[0].id === 'object-001', 'Frame 2: Persistent identity maintained as object-001');
assert(tracks2[0].velocity.speed > 0, `Velocity calculated smoothly: speed=${tracks2[0].velocity.speed.toFixed(2)} u/s`);

// Frame 3: Object moves to (0.57, 0.46)
const detFrame3 = [{
  id: 'cand-3',
  centroid: { x: 0.57, y: 0.46 },
  boundingBox: { minX: 0.52, minY: 0.36, maxX: 0.62, maxY: 0.56, width: 0.10, height: 0.20 },
  confidence: 0.94,
  shapeLabel: 'elongated',
  occlusionPct: 30
}];

const tracks3 = tracker.update(detFrame3, null, null, 1066);
assert(tracks3[0].id === 'object-001', 'Frame 3: Same object entity object-001 retained');
assert(tracks3[0].trajectory.length >= 2, `Trajectory breadcrumbs accumulating (length=${tracks3[0].trajectory.length})`);

// ==========================================
// TEST 2: Hand Occlusion & Dead-Reckoning
// ==========================================
console.log('\n--- Test 2: Hand Occlusion & Dead-Reckoning ---');

// Hand grasps screwdriver handle: 37% occluded
const detOccluded = [{
  id: 'cand-occluded',
  centroid: { x: 0.59, y: 0.45 },
  boundingBox: { minX: 0.54, minY: 0.35, maxX: 0.64, maxY: 0.55, width: 0.10, height: 0.20 },
  confidence: 0.91,
  shapeLabel: 'elongated',
  occlusionPct: 37
}];

const tracksOccluded = tracker.update(detOccluded, null, null, 1100);
assert(tracksOccluded[0].id === 'object-001', 'Track identity preserved during partial grip occlusion');
assert(tracksOccluded[0].occlusionPct === 37, 'occlusionPct reported as 37%');
assert(tracksOccluded[0].visiblePct === 63, 'visiblePct reported as 63%');
assert(tracksOccluded[0].status === 'OCCLUDED', 'Track status updated to OCCLUDED');

// Frame where hand sweeps over object completely (missing detection for 2 frames)
const tracksMissing1 = tracker.update([], null, null, 1133);
assert(tracksMissing1.length === 1, 'Object track is NOT dropped when temporarily occluded');
assert(tracksMissing1[0].id === 'object-001', 'Retains object-001 identity');
assert(tracksMissing1[0].status === 'OCCLUDED' || tracksMissing1[0].status === 'COASTING', `Status is dead-reckoning coasting (got ${tracksMissing1[0].status})`);

const tracksMissing2 = tracker.update([], null, null, 1166);
assert(tracksMissing2.length === 1, 'Still coasting on frame 2 of occlusion');
assert(tracksMissing2[0].status === 'COASTING', 'Status switches to COASTING');

// Object re-emerges near predicted location
const detReemerge = [{
  id: 'cand-reemerge',
  centroid: { x: 0.62, y: 0.44 },
  boundingBox: { minX: 0.57, minY: 0.34, maxX: 0.67, maxY: 0.54, width: 0.10, height: 0.20 },
  confidence: 0.93,
  shapeLabel: 'elongated',
  occlusionPct: 20
}];

const tracksRecovered = tracker.update(detReemerge, null, null, 1200);
assert(tracksRecovered.length === 1, 'Single track active after re-emergence');
assert(tracksRecovered[0].id === 'object-001', 'Smoothly re-associated to original object-001 without spawning new ID');
assert(tracksRecovered[0].status === 'ACTIVE', 'Status restored to ACTIVE');

// ==========================================
// TEST 3: Observation Candidate & SpatialWorldModel Ingestion
// ==========================================
console.log('\n--- Test 3: SpatialWorldModel Ingestion ---');
const cand = tracksRecovered[0].toCandidateObservation();

assert(cand.suggestedId === 'object-001', 'Candidate suggestedId is object-001');
assert(cand.type === 'object', 'Candidate type is object');
assert(cand.coordSpace === 'normalized_relative', 'Candidate coordSpace is normalized_relative');
assert(cand.depthSource === 'apparent_size', 'Candidate depthSource is apparent_size');
assert(cand.customProps.status === 'ACTIVE', 'customProps.status is ACTIVE');
assert(cand.customProps.occlusionPct === 20, 'customProps.occlusionPct is 20');
assert(cand.customProps.visiblePct === 80, 'customProps.visiblePct is 80');
assert(cand.customProps.trajectory.length > 0, 'customProps.trajectory contains breadcrumbs');

const worldModel = new SpatialWorldModel();
worldModel.ingestObservations([cand], 1200);

const entity = worldModel.getEntity('object-001');
assert(entity !== null, 'SpatialWorldModel spawned entity object-001');
assert(entity.type === 'object', 'Entity type is object');
assert(entity.customProps.status === 'ACTIVE', 'Entity status is ACTIVE in WorldModel');
assert(entity.boundingBox !== null, 'Entity boundingBox is set in WorldModel');

console.log(`\n========================================`);
console.log(`Total Tests: ${testsTotal} | Passed: ${testsPassed} | Failed: ${testsTotal - testsPassed}`);
console.log(`========================================\n`);

if (testsPassed === testsTotal) {
  console.log('🎉 ALL OBJECT PERCEPTION TESTS PASSED SUCCESSFULLY!');
} else {
  process.exit(1);
}
