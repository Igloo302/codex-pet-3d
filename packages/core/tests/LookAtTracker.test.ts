import { describe, it, expect, beforeEach } from "vitest";
import { calculateAngles, LookAtTracker } from "../src/LookAtTracker";

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