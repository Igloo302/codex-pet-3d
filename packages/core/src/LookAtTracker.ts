import * as THREE from "three";

/**
 * Pure function to calculate yaw and pitch angles from target coordinates.
 * Clamps within [-maxYawRad, maxYawRad] and [-maxPitchRad, maxPitchRad].
 *
 * Assumes normalized target coordinates where:
 * - targetX: -1 (left) to 1 (right)
 * - targetY: -1 (up) to 1 (down)
 * - (0, 0) is center
 */
export function calculateAngles(
  targetX: number,
  targetY: number,
  maxYawRad: number,
  maxPitchRad: number
): { yaw: number; pitch: number } {
  // Linear mapping: yaw proportional to X, pitch proportional to -Y (screen coords)
  // Clamp to max ranges
  let yaw = Math.max(-maxYawRad, Math.min(maxYawRad, targetX * maxYawRad));
  let pitch = Math.max(-maxPitchRad, Math.min(maxPitchRad, -targetY * maxPitchRad));

  // Normalize -0 to +0
  if (Object.is(yaw, -0)) yaw = 0;
  if (Object.is(pitch, -0)) pitch = 0;

  return { yaw, pitch };
}

/**
 * Pure helper that converts a world-space gaze target into normalized LookAt coordinates
 * relative to the pet's orientation. Used by WebXR so the pet's head can track the headset
 * camera in 3D space.
 *
 * - `headWorldPos` is the pet head bone world position.
 * - `petWorldQuat` is the pet root world quaternion (assumed unit length).
 * - `targetWorldPos` is the world position the pet should look at (e.g. the XR camera).
 *
 * Returns normalized `{ x, y }` in [-1, 1] matching `calculateAngles` semantics:
 * `x > 0` looks right, `y < 0` looks up.
 */
export function calculateWorldLookAtTarget(
  headWorldPos: { x: number; y: number; z: number },
  petWorldQuat: { x: number; y: number; z: number; w: number },
  targetWorldPos: { x: number; y: number; z: number },
  maxYawRad: number,
  maxPitchRad: number
): { x: number; y: number } {
  const direction = new THREE.Vector3(
    targetWorldPos.x - headWorldPos.x,
    targetWorldPos.y - headWorldPos.y,
    targetWorldPos.z - headWorldPos.z
  );

  if (direction.lengthSq() < 1e-8) {
    return { x: 0, y: 0 };
  }

  // Rotate the world direction into the pet's local space using the inverse of the
  // world quaternion (the conjugate for a unit quaternion).
  const inverseQuat = new THREE.Quaternion(
    petWorldQuat.x,
    petWorldQuat.y,
    petWorldQuat.z,
    petWorldQuat.w
  );
  inverseQuat.invert();
  direction.applyQuaternion(inverseQuat);

  // Pet forward is +Z, up is +Y, viewer's right is +X.
  const rawYaw = Math.atan2(direction.x, direction.z);
  const rawPitch = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));

  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  let x = maxYawRad > 0 ? clamp(rawYaw / maxYawRad) : 0;
  let y = maxPitchRad > 0 ? clamp(-rawPitch / maxPitchRad) : 0;

  // Normalize -0 to +0.
  if (Object.is(x, -0)) x = 0;
  if (Object.is(y, -0)) y = 0;

  return { x, y };
}

/**
 * LookAtTracker handles smooth damped interpolation towards target angles using delta time.
 */
export class LookAtTracker {
  private currentYaw = 0;
  private currentPitch = 0;
  private targetYaw = 0;
  private targetPitch = 0;
  private readonly maxYawRad: number;
  private readonly maxPitchRad: number;
  private readonly dampingFactor: number;

  constructor(options: {
    maxYawRad: number;
    maxPitchRad: number;
    dampingFactor?: number;
  }) {
    this.maxYawRad = options.maxYawRad;
    this.maxPitchRad = options.maxPitchRad;
    this.dampingFactor = options.dampingFactor ?? 0.1;
  }

  /**
   * Set the target position (normalized -1 to 1 range for x and y)
   */
  setTarget(targetX: number, targetY: number): void {
    const { yaw, pitch } = calculateAngles(targetX, targetY, this.maxYawRad, this.maxPitchRad);
    this.targetYaw = yaw;
    this.targetPitch = pitch;
  }

  /**
   * Update the tracker with delta time, returns current angles
   */
  update(dt: number): { yaw: number; pitch: number } {
    // Exponential smoothing / damped spring
    const factor = 1 - Math.exp(-this.dampingFactor * dt * 60); // normalize to 60fps

    this.currentYaw += (this.targetYaw - this.currentYaw) * factor;
    this.currentPitch += (this.targetPitch - this.currentPitch) * factor;

    return { yaw: this.currentYaw, pitch: this.currentPitch };
  }

  /**
   * Get current angles without updating
   */
  getAngles(): { yaw: number; pitch: number } {
    return { yaw: this.currentYaw, pitch: this.currentPitch };
  }

  /**
   * Immediately set angles (bypass smoothing)
   */
  setAngles(yaw: number, pitch: number): void {
    this.currentYaw = Math.max(-this.maxYawRad, Math.min(this.maxYawRad, yaw));
    this.currentPitch = Math.max(-this.maxPitchRad, Math.min(this.maxPitchRad, pitch));
    this.targetYaw = this.currentYaw;
    this.targetPitch = this.currentPitch;
  }

  /**
   * Reset to center
   */
  reset(): void {
    this.currentYaw = 0;
    this.currentPitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
  }
}