/**
 * Test Suite: AirGameAPI & AirGamesLab Spatial Gaming Platform
 * 
 * Verifies:
 * 1. AirGameAPI event dispatch (hand.move, hand.slash, hand.pinch, hand.grab, body.jump, object.throw).
 * 2. Blade slash intersection geometry (AirGameAPI.checkLineCircleIntersection).
 * 3. Air Games Lab runtime state & game switching (Air Pong, Fruit Ninja, Air Basketball).
 * 4. Game physics & collision logic (paddle bounce, fruit slice, basketball throw).
 */

import { AirGameAPI } from '../src/games/air-game-api.js';
import { AirGamesLab } from '../src/games/air-games-lab.js';
import { SpatialWorldModel } from '../src/core/spatial/world-model.js';

console.log('🧪 Starting AirGameAPI & AirGamesLab Spatial Platform Test...\n');

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

// Mock DOM elements for headless Node.js environment
const mockContainer = {
  clientWidth: 800,
  clientHeight: 500,
  getBoundingClientRect: () => ({ width: 800, height: 500 }),
  appendChild: () => {}
};

// ==========================================
// TEST 1: AirGameAPI Event Dispatch & Queries
// ==========================================
console.log('--- Test 1: AirGameAPI Event Dispatch & Queries ---');
const worldModel = new SpatialWorldModel();
const api = new AirGameAPI(worldModel, null);

let handMoveCount = 0;
let slashCount = 0;
let lastSlash = null;

api.on('hand.move', (e) => {
  handMoveCount++;
  assert(e.hand === 'left' || e.hand === 'right', `hand.move has valid hand identifier: ${e.hand}`);
});

api.on('hand.slash', (e) => {
  slashCount++;
  lastSlash = e;
});

// Simulate fast hand movement for blade slash
const t0 = 1000;
api.update([{
  handedness: 'Right',
  wrist: { position: { x: 0.2, y: 0.2 }, velocity: { vx: 0.8, vy: 0.8 }, speed: 1.13 }
}], worldModel, t0);

api.update([{
  handedness: 'Right',
  wrist: { position: { x: 0.35, y: 0.35 }, velocity: { vx: 0.8, vy: 0.8 }, speed: 1.13 }
}], worldModel, t0 + 33);

api.update([{
  handedness: 'Right',
  wrist: { position: { x: 0.55, y: 0.55 }, velocity: { vx: 0.8, vy: 0.8 }, speed: 1.13 }
}], worldModel, t0 + 66);

assert(handMoveCount === 3, `hand.move fired 3 times (got ${handMoveCount})`);
assert(slashCount >= 1, `hand.slash triggered on high-speed sweep (got ${slashCount})`);
assert(lastSlash !== null && lastSlash.speed >= api.minSlashSpeed, `Slash speed calculated correctly: ${lastSlash?.speed.toFixed(2)} u/s`);

// ==========================================
// TEST 2: Geometric Line-Circle Collision for Fruit Ninja
// ==========================================
console.log('\n--- Test 2: Blade Line-Circle Collision ---');
const bladeLine = { x1: 100, y1: 100, x2: 300, y2: 300 };

// Circle directly on line
const targetDirect = { x: 200, y: 200, radius: 25 };
assert(AirGameAPI.checkLineCircleIntersection(bladeLine, targetDirect) === true, 'Line intersects circle centered on segment');

// Circle near line within radius
const targetNear = { x: 210, y: 190, radius: 25 };
assert(AirGameAPI.checkLineCircleIntersection(bladeLine, targetNear) === true, 'Line intersects circle within radius distance');

// Circle far from line
const targetFar = { x: 50, y: 400, radius: 25 };
assert(AirGameAPI.checkLineCircleIntersection(bladeLine, targetFar) === false, 'Line does NOT intersect distant circle');

// ==========================================
// TEST 3: Air Games Lab Runtime & Switching
// ==========================================
console.log('\n--- Test 3: Air Games Lab Runtime & Switching ---');

// Mock HTMLCanvasElement in Node if document is undefined
if (typeof document === 'undefined') {
  global.document = {
    createElement: () => ({
      getContext: () => ({
        clearRect: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        moveTo: () => {},
        lineTo: () => {},
        ellipse: () => {},
        fillText: () => {},
        save: () => {},
        restore: () => {},
        translate: () => {},
        rotate: () => {},
        setLineDash: () => {}
      }),
      style: {}
    })
  };
  global.window = {
    addEventListener: () => {},
    AudioContext: class {
      constructor() { this.currentTime = 0; }
      createOscillator() { return { type: '', frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => {}, start: () => {}, stop: () => {} }; }
      createGain() { return { gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => {} }; }
      createBuffer() { return { getChannelData: () => new Float32Array(100) }; }
      createBufferSource() { return { connect: () => {}, start: () => {} }; }
    }
  };
}

const lab = new AirGamesLab(mockContainer, api);

assert(lab.activeGame === 'pong', 'Initial active game is Air Pong');
lab.setActiveGame('fruit_ninja');
assert(lab.activeGame === 'fruit_ninja', 'Switched to Fruit Ninja');
lab.setActiveGame('basketball');
assert(lab.activeGame === 'basketball', 'Switched to Air Basketball');

// Test Basketball Throw Physics
lab.basketball.ball.isHeld = true;
lab.basketball.ball.heldByHand = 'right';

lab._throwBasketball({
  velocity: { vx: 0.1, vy: -0.4 }
});

assert(lab.basketball.ball.isHeld === false, 'Ball released from hand');
assert(lab.basketball.ball.inFlight === true, 'Ball is now in flight');
assert(lab.basketball.ball.vy < 0, `Ball launched upward with negative vy: ${lab.basketball.ball.vy.toFixed(2)}`);
assert(lab.basketball.shotsTaken === 1, 'shotsTaken incremented to 1');

// Test Fruit Ninja Spawn & Slice
lab.setActiveGame('fruit_ninja');
lab._spawnFruitWave();
assert(lab.fruitNinja.fruits.length >= 1, `Spawned ${lab.fruitNinja.fruits.length} fruit targets`);

const firstFruit = lab.fruitNinja.fruits[0];
lab._handleFruitSlash({
  line: {
    x1: (firstFruit.x - 20) / lab.width,
    y1: (firstFruit.y - 20) / lab.height,
    x2: (firstFruit.x + 20) / lab.width,
    y2: (firstFruit.y + 20) / lab.height
  },
  speed: 1.5
});

assert(firstFruit.sliced === true, 'Target fruit was sliced successfully by hand.slash');
if (firstFruit.type !== 'bomb') {
  assert(lab.fruitNinja.score >= 10, `Score incremented on fruit slice: ${lab.fruitNinja.score}`);
  assert(firstFruit.halves.length === 2, 'Fruit divided into two flying halves');
}

console.log(`\n========================================`);
console.log(`Total Tests: ${testsTotal} | Passed: ${testsPassed} | Failed: ${testsTotal - testsPassed}`);
console.log(`========================================\n`);

if (testsPassed === testsTotal) {
  console.log('🎉 ALL AIR GAMES PLATFORM TESTS PASSED SUCCESSFULLY!');
} else {
  process.exit(1);
}
