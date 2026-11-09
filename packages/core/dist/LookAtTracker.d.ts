/**
 * Pure function to calculate yaw and pitch angles from target coordinates.
 * Clamps within [-maxYawRad, maxYawRad] and [-maxPitchRad, maxPitchRad].
 *
 * Assumes normalized target coordinates where:
 * - targetX: -1 (left) to 1 (right)
 * - targetY: -1 (up) to 1 (down)
 * - (0, 0) is center
 */
export declare function calculateAngles(targetX: number, targetY: number, maxYawRad: number, maxPitchRad: number): {
    yaw: number;
    pitch: number;
};
/**
 * LookAtTracker handles smooth damped interpolation towards target angles using delta time.
 */
export declare class LookAtTracker {
    private currentYaw;
    private currentPitch;
    private targetYaw;
    private targetPitch;
    private readonly maxYawRad;
    private readonly maxPitchRad;
    private readonly dampingFactor;
    constructor(options: {
        maxYawRad: number;
        maxPitchRad: number;
        dampingFactor?: number;
    });
    /**
     * Set the target position (normalized -1 to 1 range for x and y)
     */
    setTarget(targetX: number, targetY: number): void;
    /**
     * Update the tracker with delta time, returns current angles
     */
    update(dt: number): {
        yaw: number;
        pitch: number;
    };
    /**
     * Get current angles without updating
     */
    getAngles(): {
        yaw: number;
        pitch: number;
    };
    /**
     * Immediately set angles (bypass smoothing)
     */
    setAngles(yaw: number, pitch: number): void;
    /**
     * Reset to center
     */
    reset(): void;
}
//# sourceMappingURL=LookAtTracker.d.ts.map