import { describe, it, expect } from "vitest";
import { validatePet3DManifest } from "../src/validator";

describe("validatePet3DManifest", () => {
  const validManifest = {
    $schema: "https://codex-pet-3d.net/schemas/pet-3d.schema.json",
    spec_version: "3d-v1.0",
    id: "cyber-cat--jyshen",
    display_name: "Cyber Cat",
    author: "jyshen",
    description: "A futuristic low-poly 3D companion for Codex.",
    model: "model.glb",
    scale: 1.0,
    camera: {
      fov: 45,
      position: [0, 1.2, 2.5],
      target: [0, 0.4, 0]
    },
    look_at: {
      enabled: true,
      head_bone: "Head",
      max_yaw_deg: 45,
      max_pitch_deg: 30
    },
    animations: {
      idle: { clip: "Idle", loop: true },
      "running-right": { clip: "Run_Right", loop: true },
      "running-left": { clip: "Run_Left", loop: true },
      waving: { clip: "Wave", loop: false },
      jumping: { clip: "Jump", loop: false },
      failed: { clip: "Failed", loop: true },
      waiting: { clip: "Waiting", loop: true },
      running: { clip: "Work", loop: true },
      review: { clip: "Review", loop: true }
    }
  };

  it("validates a compliant pet-3d.json", () => {
    const result = validatePet3DManifest(validManifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails and includes property paths when yaw/pitch are out of bounds", () => {
    const invalid = {
      ...validManifest,
      look_at: {
        ...validManifest.look_at,
        max_yaw_deg: 180 // Max allowed is 90
      }
    };
    const result = validatePet3DManifest(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === "/look_at/max_yaw_deg")).toBe(true);
  });

  it("fails when unexpected properties are injected (additionalProperties: false)", () => {
    const invalid = { ...validManifest, malicious_extra: "unexpected" };
    const result = validatePet3DManifest(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === "additionalProperties")).toBe(true);
  });

  it("fails when a required root property is missing", () => {
    const invalid = { ...validManifest };
    delete (invalid as Record<string, unknown>).id;
    const result = validatePet3DManifest(invalid);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(e => e.path === "/id" && e.code === "required")
    ).toBe(true);
  });

  it("fails when a required standard animation is missing", () => {
    const invalid = { ...validManifest, animations: { ...validManifest.animations } };
    delete (invalid.animations as Record<string, unknown>).idle;
    const result = validatePet3DManifest(invalid);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(e => e.path === "/animations/idle" && e.code === "required")
    ).toBe(true);
  });
});
