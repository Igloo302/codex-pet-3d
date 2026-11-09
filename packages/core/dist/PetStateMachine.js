/**
 * States that loop continuously
 */
const LOOPING_STATES = [
    "idle",
    "running-right",
    "running-left",
    "running",
    "waiting",
    "review",
];
/**
 * States that play once and return to idle
 */
const ONE_SHOT_STATES = [
    "waving",
    "jumping",
    "failed",
];
/**
 * Check if a state is a looping state
 */
export function isLoopingState(state) {
    return LOOPING_STATES.includes(state);
}
/**
 * Check if a state is a one-shot state
 */
export function isOneShotState(state) {
    return ONE_SHOT_STATES.includes(state);
}
/**
 * Pure state machine tracking the 9 standard pet states.
 * Distinction between looping states and one-shot states with automatic return to idle.
 * New action immediately interrupts running animation.
 */
export class PetStateMachine {
    currentState;
    previousState = null;
    onStateChange;
    onAnimationFinished;
    isPlaying = false;
    constructor(options = {}) {
        this.currentState = options.initialState ?? "idle";
        this.onStateChange = options.onStateChange;
        this.onAnimationFinished = options.onAnimationFinished;
    }
    /**
     * Get the current state
     */
    getState() {
        return this.currentState;
    }
    /**
     * Get the previous state
     */
    getPreviousState() {
        return this.previousState;
    }
    /**
     * Check if currently playing an animation
     */
    getIsPlaying() {
        return this.isPlaying;
    }
    /**
     * Play a new state, immediately interrupting any running animation
     */
    playState(state) {
        if (state === this.currentState && this.isPlaying) {
            return; // Already playing this state
        }
        const fromState = this.currentState;
        this.previousState = fromState;
        this.currentState = state;
        this.isPlaying = true;
        if (this.onStateChange) {
            this.onStateChange(fromState, state);
        }
    }
    /**
     * Called when the current animation finishes.
     * For one-shot states, automatically returns to idle.
     * For looping states, stays in the current state.
     */
    onAnimationFinishedHandler() {
        if (isOneShotState(this.currentState)) {
            const fromState = this.currentState;
            this.previousState = fromState;
            this.currentState = "idle";
            this.isPlaying = false;
            if (this.onStateChange) {
                this.onStateChange(fromState, "idle");
            }
        }
        else {
            // Looping states stay in the same state
            this.isPlaying = false;
        }
        if (this.onAnimationFinished) {
            this.onAnimationFinished(this.currentState);
        }
    }
    /**
     * Force return to idle state
     */
    returnToIdle() {
        if (this.currentState !== "idle") {
            const fromState = this.currentState;
            this.previousState = fromState;
            this.currentState = "idle";
            this.isPlaying = false;
            if (this.onStateChange) {
                this.onStateChange(fromState, "idle");
            }
        }
    }
    /**
     * Reset to initial state
     */
    reset(initialState) {
        this.currentState = initialState ?? "idle";
        this.previousState = null;
        this.isPlaying = false;
    }
}
//# sourceMappingURL=PetStateMachine.js.map