import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import {
  calculateAngles,
  calculateWorldLookAtTarget,
  LookAtTracker,
} from "../src/LookAtTracker";

describe("calculateAngles", () => {
  it("should return zero angles for center target", () => {
    const result = calculateAngles(0, 0, Math.PI / 2, Math.PI / 4);
    expect(result.yaw).toBe(0);
    expect(result.pitch).toBe(0);
  });

  it("should calculate positive yaw for right target", () => {
    const result = calculateAngles(1, 0, Math.PI / 2, Math.PI / 4);
    expect(result.yaw).toBeGreaterThan(0);
    expect(result.pitch).toBe(0);
  });

  it("should calculate negative yaw for left target", () => {
    const result = calculateAngles(-1, 0, Math.PI / 2, Math.PI / 4);
    expect(result.yaw).toBeLessThan(0);
    expect(result.pitch).toBe(0);
  });

  it("should calculate positive pitch for up target", () => {
    const result = calculateAngles(0, -1, Math.PI / 2, Math.PI / 4);
    expect(result.yaw).toBe(0);
    expect(result.pitch).toBeGreaterThan(0);
  });

  it("should calculate negative pitch for down target", () => {
    const result = calculateAngles(0, 1, Math.PI / 2, Math.PI / 4);
    expect(result.yaw).toBe(0);
    expect(result.pitch).toBeLessThan(0);
  });

  it("should clamp yaw to maxYawRad", () => {
    const maxYaw = Math.PI / 4; // 45 degrees
    const result = calculateAngles(100, 0, maxYaw, Math.PI / 4);
    expect(result.yaw).toBe(maxYaw);
  });

  it("should clamp pitch to maxPitchRad", () => {
    const maxPitch = Math.PI / 6; // 30 degrees
    const result = calculateAngles(0, -100, Math.PI / 2, maxPitch);
    expect(result.pitch).toBe(maxPitch);
  });

  it("should clamp negative yaw to -maxYawRad", () => {
    const maxYaw = Math.PI / 4;
    const result = calculateAngles(-100, 0, maxYaw, Math.PI / 4);
    expect(result.yaw).toBe(-maxYaw);
  });

  it("should clamp negative pitch to -maxPitchRad", () => {
    const maxPitch = Math.PI / 6;
    const result = calculateAngles(0, 100, Math.PI / 2, maxPitch);
    expect(result.pitch).toBe(-maxPitch);
  });

  it("should handle diagonal targets", () => {
    const result = calculateAngles(1, -1, Math.PI / 2, Math.PI / 4);
    expect(result.yaw).toBeGreaterThan(0);
    expect(result.pitch).toBeGreaterThan(0);
  });
});

describe("calculateWorldLookAtTarget", () => {
  const maxYawRad = Math.PI / 2;
  const maxPitchRad = Math.PI / 4;
  const head = { x: 0, y: 0, z: 0 };
  const identity = { x: 0, y: 0, z: 0, w: 1 };

  it("returns center for a target straight ahead along pet +Z", () => {
    const result = calculateWorldLookAtTarget(head, identity, { x: 0, y: 0, z: 1 }, maxYawRad, maxPitchRad);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it("returns positive x when the target is to the pet's right", () => {
    const result = calculateWorldLookAtTarget(head, identity, { x: 1, y: 0, z: 1 }, maxYawRad, maxPitchRad);
    expect(result.x).toBeCloseTo(0.5, 5);
    expect(result.y).toBe(0);
  });

  it("returns negative x when the target is to the pet's left", () => {
    const result = calculateWorldLookAtTarget(head, identity, { x: -1, y: 0, z: 1 }, maxYawRad, maxPitchRad);
    expect(result.x).toBeCloseTo(-0.5, 5);
    expect(result.y).toBe(0);
  });

  it("returns negative y for an upward target (upward head tilt)", () => {
    const result = calculateWorldLookAtTarget(head, identity, { x: 0, y: 1, z: 1 }, maxYawRad, maxPitchRad);
    expect(result.x).toBe(0);
    expect(result.y).toBeCloseTo(-1, 5);
  });

  it("returns positive y for a downward target", () => {
    const result = calculateWorldLookAtTarget(head, identity, { x: 0, y: -1, z: 1 }, maxYawRad, maxPitchRad);
    expect(result.x).toBe(0);
    expect(result.y).toBeCloseTo(1, 5);
  });

  it("rotates the gaze direction into pet-local space", () => {
    // Pet turned 90 degrees to its left: its local +Z now points along world +X.
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);

    const ahead = calculateWorldLookAtTarget(
      head,
      { x: turn.x, y: turn.y, z: turn.z, w: turn.w },
      { x: 1, y: 0, z: 0 },
      maxYawRad,
      maxPitchRad
    );
    expect(ahead.x).toBeCloseTo(0, 5);
    expect(ahead.y).toBe(0);

    const side = calculateWorldLookAtTarget(
      head,
      { x: turn.x, y: turn.y, z: turn.z, w: turn.w },
      { x: 0, y: 0, z: 1 },
      maxYawRad,
      maxPitchRad
    );
    expect(side.x).toBeCloseTo(-1, 5);
  });

  it("returns zero for a target coincident with the head", () => {
    const result = calculateWorldLookAtTarget(head, identity, { x: 0, y: 0, z: 0 }, maxYawRad, maxPitchRad);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it("clamps yaw and pitch to the unit range", () => {
    const right = calculateWorldLookAtTarget(head, identity, { x: 10, y: 0, z: 0 }, maxYawRad, maxPitchRad);
    expect(right.x).toBe(1);

    const left = calculateWorldLookAtTarget(head, identity, { x: -10, y: 0, z: 0 }, maxYawRad, maxPitchRad);
    expect(left.x).toBe(-1);

    const up = calculateWorldLookAtTarget(head, identity, { x: 0, y: 10, z: 0 }, maxYawRad, maxPitchRad);
    expect(up.y).toBe(-1);

    const down = calculateWorldLookAtTarget(head, identity, { x: 0, y: -10, z: 0 }, maxYawRad, maxPitchRad);
    expect(down.y).toBe(1);
  });

  it("returns neutral values for a non-positive max range", () => {
    const result = calculateWorldLookAtTarget(head, identity, { x: 1, y: 1, z: 1 }, 0, 0);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it("normalizes negative zero to positive zero", () => {
    const result = calculateWorldLookAtTarget(head, identity, { x: 0, y: 0, z: 1 }, maxYawRad, maxPitchRad);
    expect(Object.is(result.x, -0)).toBe(false);
    expect(Object.is(result.y, -0)).toBe(false);
  });
});

describe("LookAtTracker", () => {
  let tracker: LookAtTracker;
  const maxYawRad = Math.PI / 4;
  const maxPitchRad = Math.PI / 6;

  beforeEach(() => {
    tracker = new LookAtTracker({
      maxYawRad,
      maxPitchRad,
      dampingFactor: 0.1,
    });
  });

  it("should start at center (0, 0)", () => {
    const angles = tracker.getAngles();
    expect(angles.yaw).toBe(0);
    expect(angles.pitch).toBe(0);
  });

  it("should update target and smoothly interpolate", () => {
    tracker.setTarget(1, 0);

    // First update - should move towards target
    const angles1 = tracker.update(1/60); // 1 frame at 60fps
    expect(angles1.yaw).toBeGreaterThan(0);
    expect(angles1.yaw).toBeLessThan(maxYawRad);

    // Multiple updates - should approach target
    for (let i = 0; i < 100; i++) {
      tracker.update(1/60);
    }
    const angles2 = tracker.getAngles();
    expect(angles2.yaw).toBeCloseTo(maxYawRad, 1);
  });

  it("should handle pitch updates", () => {
    tracker.setTarget(0, -1);

    for (let i = 0; i < 100; i++) {
      tracker.update(1/60);
    }
    const angles = tracker.getAngles();
    expect(angles.pitch).toBeCloseTo(maxPitchRad, 1);
  });

  it("should reset to center", () => {
    tracker.setTarget(1, -1);
    for (let i = 0; i < 50; i++) {
      tracker.update(1/60);
    }

    tracker.reset();
    const angles = tracker.getAngles();
    expect(angles.yaw).toBe(0);
    expect(angles.pitch).toBe(0);
  });

  it("should immediately set angles with setAngles", () => {
    tracker.setAngles(0.5, -0.3);
    const angles = tracker.getAngles();
    expect(angles.yaw).toBe(0.5);
    expect(angles.pitch).toBe(-0.3);
  });

  it("should clamp setAngles to max ranges", () => {
    tracker.setAngles(10, 10);
    const angles = tracker.getAngles();
    expect(angles.yaw).toBe(maxYawRad);
    expect(angles.pitch).toBe(maxPitchRad);
  });

  it("should smoothly transition between targets", () => {
    tracker.setTarget(1, 0);
    for (let i = 0; i < 50; i++) {
      tracker.update(1/60);
    }

    // Change target to opposite side
    tracker.setTarget(-1, 0);
    for (let i = 0; i < 50; i++) {
      tracker.update(1/60);
    }

    const angles = tracker.getAngles();
    expect(angles.yaw).toBeLessThan(0);
  });

  it("should respect different damping factors", () => {
    const fastTracker = new LookAtTracker({
      maxYawRad,
      maxPitchRad,
      dampingFactor: 0.5,
    });

    const slowTracker = new LookAtTracker({
      maxYawRad,
      maxPitchRad,
      dampingFactor: 0.01,
    });

    fastTracker.setTarget(1, 0);
    slowTracker.setTarget(1, 0);

    for (let i = 0; i < 10; i++) {
      fastTracker.update(1/60);
      slowTracker.update(1/60);
    }

    const fastAngles = fastTracker.getAngles();
    const slowAngles = slowTracker.getAngles();

    expect(fastAngles.yaw).toBeGreaterThan(slowAngles.yaw);
  });
});