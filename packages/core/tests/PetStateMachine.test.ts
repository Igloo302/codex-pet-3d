import { describe, it, expect, beforeEach } from "vitest";
import { PetStateMachine, isLoopingState, isOneShotState } from "../src/PetStateMachine";
import type { PetState } from "../src/types";

describe("isLoopingState", () => {
  const loopingStates: PetState[] = ["idle", "running-right", "running-left", "running", "waiting", "review"];
  const oneShotStates: PetState[] = ["waving", "jumping", "failed"];

  it("should return true for looping states", () => {
    loopingStates.forEach((state) => {
      expect(isLoopingState(state)).toBe(true);
    });
  });

  it("should return false for one-shot states", () => {
    oneShotStates.forEach((state) => {
      expect(isLoopingState(state)).toBe(false);
    });
  });
});

describe("isOneShotState", () => {
  const loopingStates: PetState[] = ["idle", "running-right", "running-left", "running", "waiting", "review"];
  const oneShotStates: PetState[] = ["waving", "jumping", "failed"];

  it("should return true for one-shot states", () => {
    oneShotStates.forEach((state) => {
      expect(isOneShotState(state)).toBe(true);
    });
  });

  it("should return false for looping states", () => {
    loopingStates.forEach((state) => {
      expect(isOneShotState(state)).toBe(false);
    });
  });
});

describe("PetStateMachine", () => {
  let stateMachine: PetStateMachine;
  let stateChangeLog: Array<{ from: PetState; to: PetState }> = [];
  let animationFinishedLog: PetState[] = [];

  beforeEach(() => {
    stateChangeLog = [];
    animationFinishedLog = [];
    stateMachine = new PetStateMachine({
      initialState: "idle",
      onStateChange: (from, to) => stateChangeLog.push({ from, to }),
      onAnimationFinished: (state) => animationFinishedLog.push(state),
    });
  });

  it("should start with initial state", () => {
    expect(stateMachine.getState()).toBe("idle");
    expect(stateMachine.getPreviousState()).toBeNull();
    expect(stateMachine.getIsPlaying()).toBe(false);
  });

  it("should allow custom initial state", () => {
    const sm = new PetStateMachine({ initialState: "running" });
    expect(sm.getState()).toBe("running");
  });

  it("should transition to new state immediately", () => {
    stateMachine.playState("running");
    expect(stateMachine.getState()).toBe("running");
    expect(stateMachine.getPreviousState()).toBe("idle");
    expect(stateMachine.getIsPlaying()).toBe(true);
    expect(stateChangeLog).toHaveLength(1);
    expect(stateChangeLog[0]).toEqual({ from: "idle", to: "running" });
  });

  it("should not trigger state change if already in that state and playing", () => {
    stateMachine.playState("running");
    stateChangeLog = [];
    stateMachine.playState("running");
    expect(stateChangeLog).toHaveLength(0);
    expect(stateMachine.getState()).toBe("running");
  });

  it("should interrupt current state with new state", () => {
    stateMachine.playState("running");
    stateChangeLog = [];
    stateMachine.playState("waving");
    expect(stateMachine.getState()).toBe("waving");
    expect(stateMachine.getPreviousState()).toBe("running");
    expect(stateChangeLog).toHaveLength(1);
    expect(stateChangeLog[0]).toEqual({ from: "running", to: "waving" });
  });

  describe("one-shot states", () => {
    const oneShotStates: PetState[] = ["waving", "jumping", "failed"];

    oneShotStates.forEach((state) => {
      it(`should return to idle after ${state} finishes`, () => {
        stateMachine.playState(state);
        expect(stateMachine.getState()).toBe(state);
        expect(stateMachine.getIsPlaying()).toBe(true);

        stateChangeLog = [];
        animationFinishedLog = [];
        stateMachine.onAnimationFinishedHandler();

        expect(stateMachine.getState()).toBe("idle");
        expect(stateMachine.getPreviousState()).toBe(state);
        expect(stateMachine.getIsPlaying()).toBe(false);
        expect(stateChangeLog).toHaveLength(1);
        expect(stateChangeLog[0]).toEqual({ from: state, to: "idle" });
        expect(animationFinishedLog).toContain("idle");
      });
    });
  });

  describe("looping states", () => {
    const loopingStates: PetState[] = ["idle", "running-right", "running-left", "running", "waiting", "review"];

    loopingStates.forEach((state) => {
      it(`should stay in ${state} after animation finishes`, () => {
        stateMachine.playState(state);
        expect(stateMachine.getState()).toBe(state);

        stateChangeLog = [];
        animationFinishedLog = [];
        stateMachine.onAnimationFinishedHandler();

        expect(stateMachine.getState()).toBe(state);
        expect(stateMachine.getIsPlaying()).toBe(false);
        expect(stateChangeLog).toHaveLength(0);
        expect(animationFinishedLog).toContain(state);
      });
    });
  });

  it("should return to idle with returnToIdle()", () => {
    stateMachine.playState("running");
    stateChangeLog = [];
    stateMachine.returnToIdle();

    expect(stateMachine.getState()).toBe("idle");
    expect(stateMachine.getPreviousState()).toBe("running");
    expect(stateMachine.getIsPlaying()).toBe(false);
    expect(stateChangeLog).toHaveLength(1);
    expect(stateChangeLog[0]).toEqual({ from: "running", to: "idle" });
  });

  it("should not trigger returnToIdle if already idle", () => {
    stateMachine.returnToIdle();
    expect(stateChangeLog).toHaveLength(0);
  });

  it("should reset to initial state", () => {
    stateMachine.playState("running");
    stateMachine.playState("waving");
    stateMachine.onAnimationFinishedHandler(); // waving -> idle

    stateMachine.reset("waiting");
    expect(stateMachine.getState()).toBe("waiting");
    expect(stateMachine.getPreviousState()).toBeNull();
    expect(stateMachine.getIsPlaying()).toBe(false);
  });

  it("should handle rapid state changes", () => {
    stateMachine.playState("running");
    stateMachine.playState("running-right");
    stateMachine.playState("running-left");
    stateMachine.playState("waving");

    expect(stateMachine.getState()).toBe("waving");
    expect(stateMachine.getPreviousState()).toBe("running-left");
    expect(stateChangeLog).toHaveLength(4);
  });

  it("should call onAnimationFinished callback with current state after one-shot", () => {
    stateMachine.playState("jumping");
    animationFinishedLog = [];
    stateMachine.onAnimationFinishedHandler();
    expect(animationFinishedLog).toContain("idle");
  });

  it("should call onAnimationFinished callback with current state after looping", () => {
    stateMachine.playState("waiting");
    animationFinishedLog = [];
    stateMachine.onAnimationFinishedHandler();
    expect(animationFinishedLog).toContain("waiting");
  });

  it("should maintain correct previous state through multiple transitions", () => {
    stateMachine.playState("running");
    expect(stateMachine.getPreviousState()).toBe("idle");

    stateMachine.playState("waiting");
    expect(stateMachine.getPreviousState()).toBe("running");

    stateMachine.onAnimationFinishedHandler(); // waiting is looping, stays
    expect(stateMachine.getPreviousState()).toBe("running"); // unchanged

    stateMachine.playState("waving");
    expect(stateMachine.getPreviousState()).toBe("waiting");

    stateMachine.onAnimationFinishedHandler(); // waving -> idle
    expect(stateMachine.getPreviousState()).toBe("waving");
    expect(stateMachine.getState()).toBe("idle");
  });
});