export const GripState = Object.freeze({
  NO_HAND: 'NO_HAND',
  HOVER: 'HOVER',
  PINCH_CANDIDATE: 'PINCH_CANDIDATE',
  GRABBED: 'GRABBED',
  DRAGGING: 'DRAGGING',
  RELEASING: 'RELEASING',
  RELEASED: 'RELEASED'
});

const ACTIVE_STATES = new Set([GripState.GRABBED, GripState.DRAGGING]);
const OWNED_STATES = new Set([...ACTIVE_STATES, GripState.RELEASING]);

export class GripInteractionController {
  constructor({
    minConfidence = 0.55,
    pinchEnterRatio = 0.32,
    pinchReleaseRatio = 0.48,
    grabConfirmMs = 65,
    releaseConfirmMs = 55,
    trackingGraceMs = 110,
    dragThreshold = 0.004
  } = {}) {
    this.minConfidence = minConfidence;
    this.pinchEnterRatio = pinchEnterRatio;
    this.pinchReleaseRatio = pinchReleaseRatio;
    this.grabConfirmMs = grabConfirmMs;
    this.releaseConfirmMs = releaseConfirmMs;
    this.trackingGraceMs = trackingGraceMs;
    this.dragThreshold = dragThreshold;
    this.hands = new Map();
    this.lastEvents = [];
    this.lastUpdateTimestamp = 0;
  }

  reset() {
    this.hands.clear();
    this.lastEvents = [];
    this.lastUpdateTimestamp = 0;
  }

  update(handData = {}, timestamp = performance.now(), canGrab = {}) {
    const now = Number.isFinite(timestamp) ? timestamp : performance.now();
    const deltaTime = this.lastUpdateTimestamp > 0
      ? Math.max(0, now - this.lastUpdateTimestamp)
      : 0;
    this.lastUpdateTimestamp = now;
    const events = [];

    for (const side of ['Left', 'Right']) {
      const record = this._getRecord(side);
      const hand = handData[side];
      const sample = this._readSample(hand);

      if (!sample) {
        this._handleMissing(record, now, events);
        continue;
      }

      const recovered = record.missingSince !== null;
      record.missingSince = null;
      if (recovered) {
        if (record.state === GripState.RELEASING && ACTIVE_STATES.has(record.resumeState)) {
          this._transition(record, record.resumeState, now, 'tracking-recovered');
        }
        events.push({ type: 'reacquired', hand: side, reason: 'tracking-recovered' });
      }

      record.lastSample = sample;
      record.confidence = sample.confidence;
      record.pinchRatio = sample.pinchRatio;
      record.handOpenness = sample.handOpenness;

      this._updateRecord(record, side, sample, now, Boolean(canGrab[side]), events);
    }

    const grabbedHands = ['Left', 'Right'].filter((side) =>
      OWNED_STATES.has(this.hands.get(side).state)
    );

    this.lastEvents = events;
    return {
      states: this.getDiagnostics(),
      events,
      grabbedHands,
      interactionMode: grabbedHands.length > 1
        ? 'two-hand'
        : grabbedHands.length === 1
          ? 'one-hand'
          : 'idle',
      deltaTime
    };
  }

  getDiagnostics() {
    return Object.fromEntries(['Left', 'Right'].map((side) => {
      const record = this._getRecord(side);
      return [side, {
        state: record.state,
        confidence: record.confidence,
        pinchRatio: record.pinchRatio,
        handOpenness: record.handOpenness,
        reason: record.reason
      }];
    }));
  }

  isTransforming(side) {
    return ACTIVE_STATES.has(this._getRecord(side).state);
  }

  _getRecord(side) {
    if (!this.hands.has(side)) {
      this.hands.set(side, {
        state: GripState.NO_HAND,
        closeSince: null,
        releaseSince: null,
        missingSince: null,
        resumeState: null,
        anchorPoint: null,
        lastPoint: null,
        confidence: 0,
        pinchRatio: null,
        handOpenness: null,
        reason: 'no-hand'
      });
    }
    return this.hands.get(side);
  }

  _readSample(hand) {
    const points = hand?.screenPoints;
    const confidence = hand?.confidence;
    if (
      !Array.isArray(points) ||
      points.length < 18 ||
      !Number.isFinite(confidence) ||
      confidence < this.minConfidence
    ) {
      return null;
    }

    const thumb = points[4];
    const index = points[8];
    const indexMcp = points[5];
    const pinkyMcp = points[17];
    const pointer = hand.tipWorld || hand.worldPoints?.[8];
    if (
      !this._isPoint(thumb) ||
      !this._isPoint(index) ||
      !this._isPoint(indexMcp) ||
      !this._isPoint(pinkyMcp) ||
      !this._isPoint(pointer)
    ) {
      return null;
    }

    const palmWidth = Math.hypot(indexMcp.u - pinkyMcp.u, indexMcp.v - pinkyMcp.v);
    if (palmWidth < 0.025) return null;

    const pinchRatio = Math.hypot(thumb.u - index.u, thumb.v - index.v) / palmWidth;
    const extensions = ['index', 'middle', 'ring', 'pinky']
      .map((finger) => hand.fingers?.[finger]?.extension)
      .filter(Number.isFinite);
    const handOpenness = extensions.length
      ? extensions.reduce((total, value) => total + value, 0) / extensions.length
      : null;

    return {
      confidence,
      pinchRatio,
      handOpenness,
      point: pointer.clone?.() || { ...pointer }
    };
  }

  _isPoint(point) {
    return Boolean(
      point &&
      Number.isFinite(point.u ?? point.x) &&
      Number.isFinite(point.v ?? point.y)
    );
  }

  _handleMissing(record, now, events) {
    record.closeSince = null;
    record.releaseSince = null;
    if (!ACTIVE_STATES.has(record.state) && record.state !== GripState.RELEASING) {
      if (record.state !== GripState.NO_HAND) {
        this._transition(record, GripState.NO_HAND, now, 'tracking-lost');
      }
      record.missingSince = now;
      record.lastSample = null;
      record.confidence = 0;
      record.pinchRatio = null;
      record.handOpenness = null;
      return;
    }

    if (record.missingSince === null) record.missingSince = now;
    if (ACTIVE_STATES.has(record.state)) {
      record.resumeState = record.state;
      this._transition(record, GripState.RELEASING, now, 'tracking-lost-pending');
    }

    if (now - record.missingSince >= this.trackingGraceMs) {
      this._transition(record, GripState.RELEASED, now, 'tracking-lost');
      events.push({ type: 'release', hand: record.side, reason: 'tracking-lost' });
      record.state = GripState.NO_HAND;
      record.resumeState = null;
      record.lastSample = null;
      record.anchorPoint = null;
      record.lastPoint = null;
      record.confidence = 0;
      record.pinchRatio = null;
      record.handOpenness = null;
      record.reason = 'tracking-lost';
    }
  }

  _updateRecord(record, side, sample, now, canGrab, events) {
    record.side = side;
    const isPinched = sample.pinchRatio <= this.pinchEnterRatio;
    const isReleased = sample.pinchRatio >= this.pinchReleaseRatio;

    if (record.state === GripState.NO_HAND || record.state === GripState.RELEASED) {
      if (!isPinched) {
        this._transition(record, GripState.HOVER, now, 'hand-visible-open');
        record.anchorPoint = null;
        record.closeSince = null;
      } else {
        this._transition(record, GripState.PINCH_CANDIDATE, now, 'pinch-detected');
        record.closeSince = canGrab ? now : null;
      }
      return;
    }

    if (record.state === GripState.HOVER) {
      if (isPinched) {
        record.closeSince = now;
        this._transition(record, GripState.PINCH_CANDIDATE, now, 'pinch-detected');
      }
      return;
    }

    if (record.state === GripState.PINCH_CANDIDATE) {
      if (isReleased) {
        record.closeSince = null;
        this._transition(record, GripState.HOVER, now, 'pinch-cancelled');
        return;
      }
      if (!canGrab) {
        record.closeSince = null;
        record.reason = 'pinch-not-over-model';
        return;
      }
      if (record.closeSince === null) {
        record.closeSince = now;
        return;
      }
      if (now - record.closeSince >= this.grabConfirmMs) {
        record.anchorPoint = sample.point.clone?.() || { ...sample.point };
        record.lastPoint = sample.point.clone?.() || { ...sample.point };
        record.releaseSince = null;
        this._transition(record, GripState.GRABBED, now, 'pinch-confirmed-on-model');
        events.push({ type: 'grab-start', hand: side, point: sample.point, reason: record.reason });
      }
      return;
    }

    if (record.state === GripState.RELEASING) {
      if (!isReleased) {
        record.releaseSince = null;
        this._transition(record, record.resumeState || GripState.GRABBED, now, 'pinch-maintained');
      } else if (record.releaseSince !== null && now - record.releaseSince >= this.releaseConfirmMs) {
        this._transition(record, GripState.RELEASED, now, 'pinch-open-confirmed');
        events.push({ type: 'release', hand: side, reason: 'pinch-open-confirmed' });
        record.anchorPoint = null;
        record.lastPoint = null;
        record.resumeState = null;
      }
      return;
    }

    if (ACTIVE_STATES.has(record.state)) {
      if (isReleased) {
        record.releaseSince = now;
        record.resumeState = record.state;
        this._transition(record, GripState.RELEASING, now, 'pinch-opening');
        return;
      }
      const moved = this._distance(record.anchorPoint, sample.point) >= this.dragThreshold;
      if (moved && record.state === GripState.GRABBED) {
        this._transition(record, GripState.DRAGGING, now, 'confirmed-grip-moving');
      }
      record.lastPoint = sample.point.clone?.() || { ...sample.point };
      events.push({
        type: 'drag',
        hand: side,
        point: sample.point,
        state: record.state,
        reason: record.reason
      });
    }
  }

  _transition(record, nextState, timestamp, reason) {
    if (record.state === nextState) {
      record.reason = reason;
      return;
    }
    record.state = nextState;
    record.stateSince = timestamp;
    record.reason = reason;
  }

  _distance(a, b) {
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
  }
}
