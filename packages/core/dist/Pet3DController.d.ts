import { Pet3DRenderer } from "./Pet3DRenderer";
import { calculateAngles } from "./LookAtTracker";
import type { PetState, Pet3DControllerOptions } from "./types";
/**
 * Pet3DController - orchestrates Three.js scene, GLTFLoader, AnimationMixer cross-fading,
 * bone look-at rotation, and state machine.
 */
export declare class Pet3DController {
    private readonly renderer;
    private readonly stateMachine;
    private readonly lookAtTracker;
    private readonly mixer;
    private readonly model;
    private readonly animations;
    private readonly actions;
    private currentAction;
    private readonly headBoneName;
    private headBone;
    private readonly lookAtEnabled;
    private readonly maxYawRad;
    private readonly maxPitchRad;
    private readonly onStateChange?;
    private readonly onAnimationFinished?;
    private isLoaded;
    private animationFrameId;
    private lastTime;
    constructor(options: Pet3DControllerOptions);
    /**
     * Load GLTF model and setup animations
     */
    private loadModel;
    /**
     * Find a bone by name in the scene graph
     */
    private findBone;
    /**
     * Cross-fade to a new state
     */
    private crossFadeToState;
    /**
     * Start the animation loop
     */
    private startAnimationLoop;
    /**
     * Update controller (called each frame)
     */
    update(dt: number): void;
    /**
     * Apply look-at rotation to head bone
     */
    private applyLookAt;
    /**
     * Set look-at target (normalized -1 to 1)
     */
    setLookAtTarget(x: number, y: number): void;
    /**
     * Play a specific state
     */
    playState(state: PetState): void;
    /**
     * Get current state
     */
    getState(): PetState;
    /**
     * Get the renderer
     */
    getRenderer(): Pet3DRenderer;
    /**
     * Resize the renderer
     */
    resize(width: number, height: number): void;
    /**
     * Dispose of all resources
     */
    dispose(): void;
}
export { calculateAngles };
//# sourceMappingURL=Pet3DController.d.ts.map