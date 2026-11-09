import { STANDARD_ANIMATION_STATES } from "@codex-pet-3d/spec";
import type { PetState } from "@codex-pet-3d/core";

/** Human-readable labels for each of the nine standard animation states. */
export const ACTION_LABELS: Record<PetState, string> = {
  idle: "Idle",
  "running-right": "Run Right",
  "running-left": "Run Left",
  waving: "Wave",
  jumping: "Jump",
  failed: "Failed",
  waiting: "Waiting",
  running: "Running",
  review: "Review",
};

export interface ActionControlsProps {
  currentState: PetState;
  onSelectState: (state: PetState) => void;
}

/**
 * Action bar that exposes every standard pet state as a trigger button and
 * highlights the state that is currently playing.
 */
export function ActionControls({ currentState, onSelectState }: ActionControlsProps) {
  return (
    <div className="action-controls" role="group" aria-label="Pet animation states">
      {STANDARD_ANIMATION_STATES.map((state) => {
        const isActive = state === currentState;
        return (
          <button
            key={state}
            type="button"
            className={`action-btn${isActive ? " active" : ""}`}
            aria-pressed={isActive}
            data-state={state}
            onClick={() => onSelectState(state)}
          >
            <span className="action-dot" aria-hidden="true" />
            {ACTION_LABELS[state]}
          </button>
        );
      })}
    </div>
  );
}
