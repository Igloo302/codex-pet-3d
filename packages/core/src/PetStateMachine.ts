import type { PetState, PetStateMachineOptions } from "./types.js";

/**
 * States that loop continuously
 */
const LOOPING_STATES: readonly PetState[] = [
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
const ONE_SHOT_STATES: readonly PetState[] = [
  "waving",
  "jumping",
  "failed",
];

/**
 * Check if a state is a looping state
 */
export function isLoopingState(state: PetState): boolean {
  return LOOPING_STATES.includes(state);
}

/**
 * Check if a state is a one-shot state
 */
export function isOneShotState(state: PetState): boolean {
  return ONE_SHOT_STATES.includes(state);
}

/**
 * Pure state machine tracking the 9 standard pet states.
 * Distinction between looping states and one-shot states with automatic return to idle.
 * New action immediately interrupts running animation.
 */
export class PetStateMachine {
  private currentState: PetState;
  private previousState: PetState | null = null;
  private readonly onStateChange?: (from: PetState, to: PetState) => void;
  private readonly onAnimationFinished?: (state: PetState) => void;
  private isPlaying = false;

  constructor(options: PetStateMachineOptions = {}) {
    this.currentState = options.initialState ?? "idle";
    this.onStateChange = options.onStateChange;
    this.onAnimationFinished = options.onAnimationFinished;
  }

  /**
   * Get the current state
   */
  getState(): PetState {
    return this.currentState;
  }

  /**
   * Get the previous state
   */
  getPreviousState(): PetState | null {
    return this.previousState;
  }

  /**
   * Check if currently playing an animation
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Play a new state, immediately interrupting any running animation
   */
  playState(state: PetState): void {
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
  onAnimationFinishedHandler(): void {
    if (isOneShotState(this.currentState)) {
      const fromState = this.currentState;
      this.previousState = fromState;
      this.currentState = "idle";
      this.isPlaying = false;

      if (this.onStateChange) {
        this.onStateChange(fromState, "idle");
      }
    } else {
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
  returnToIdle(): void {
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
  reset(initialState?: PetState): void {
    this.currentState = initialState ?? "idle";
    this.previousState = null;
    this.isPlaying = false;
  }
}