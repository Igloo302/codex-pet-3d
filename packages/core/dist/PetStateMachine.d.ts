import type { PetState, PetStateMachineOptions } from "./types";
/**
 * Check if a state is a looping state
 */
export declare function isLoopingState(state: PetState): boolean;
/**
 * Check if a state is a one-shot state
 */
export declare function isOneShotState(state: PetState): boolean;
/**
 * Pure state machine tracking the 9 standard pet states.
 * Distinction between looping states and one-shot states with automatic return to idle.
 * New action immediately interrupts running animation.
 */
export declare class PetStateMachine {
    private currentState;
    private previousState;
    private readonly onStateChange?;
    private readonly onAnimationFinished?;
    private isPlaying;
    constructor(options?: PetStateMachineOptions);
    /**
     * Get the current state
     */
    getState(): PetState;
    /**
     * Get the previous state
     */
    getPreviousState(): PetState | null;
    /**
     * Check if currently playing an animation
     */
    getIsPlaying(): boolean;
    /**
     * Play a new state, immediately interrupting any running animation
     */
    playState(state: PetState): void;
    /**
     * Called when the current animation finishes.
     * For one-shot states, automatically returns to idle.
     * For looping states, stays in the current state.
     */
    onAnimationFinishedHandler(): void;
    /**
     * Force return to idle state
     */
    returnToIdle(): void;
    /**
     * Reset to initial state
     */
    reset(initialState?: PetState): void;
}
//# sourceMappingURL=PetStateMachine.d.ts.map