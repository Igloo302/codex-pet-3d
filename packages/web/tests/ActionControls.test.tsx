import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { STANDARD_ANIMATION_STATES } from "@codex-pet-3d/spec";
import { ActionControls, ACTION_LABELS } from "../src/components/ActionControls";

afterEach(cleanup);

describe("ActionControls", () => {
  it("renders a button for all 9 standard states", () => {
    render(<ActionControls currentState="idle" onSelectState={vi.fn()} />);

    expect(screen.getAllByRole("button")).toHaveLength(9);
    for (const state of STANDARD_ANIMATION_STATES) {
      expect(
        screen.getByRole("button", { name: ACTION_LABELS[state] }),
      ).toBeTruthy();
    }
  });

  it("fires onSelectState with the expected state name when clicked", () => {
    const onSelect = vi.fn();
    render(<ActionControls currentState="idle" onSelectState={onSelect} />);

    const jumpBtn = screen.getByRole("button", { name: /jump/i });
    fireEvent.click(jumpBtn);
    expect(onSelect).toHaveBeenCalledWith("jumping");
  });

  it("fires the exact state for every button", () => {
    const onSelect = vi.fn();
    render(<ActionControls currentState="idle" onSelectState={onSelect} />);

    for (const state of STANDARD_ANIMATION_STATES) {
      onSelect.mockClear();
      fireEvent.click(screen.getByRole("button", { name: ACTION_LABELS[state] }));
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(state);
    }
  });

  it("highlights only the active state", () => {
    render(<ActionControls currentState="waving" onSelectState={vi.fn()} />);

    for (const state of STANDARD_ANIMATION_STATES) {
      const button = screen.getByRole("button", { name: ACTION_LABELS[state] });
      expect(button.getAttribute("aria-pressed")).toBe(
        state === "waving" ? "true" : "false",
      );
    }
  });
});
