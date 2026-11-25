import { describe, it, expect } from "vitest";
import type { Pet3DManifest } from "@codex-pet-3d/spec";
import type { GlbInspectionResult } from "@codex-pet-3d/spec/glb";
import {
  autoSuggestManifest,
  detectHeadBone,
  evaluateModelDiagnostics,
  formatManifestJson,
  matchClipForState,
} from "../src/studio/manifest-studio";

const BASE_MANIFEST: Pet3DManifest = {
  $schema: "https://codex-pet-3d.net/schemas/pet-3d.schema.json",
  spec_version: "3d-v1.0",
  id: "cyber-cat--jyshen",
  display_name: "Cyber Cat",
  author: "jyshen",
  description: "Sample cat",
  model: "model.glb",
  scale: 1,
  camera: { fov: 45, position: [0, 1.2, 2.5], target: [0, 0.4, 0] },
  look_at: { enabled: true, head_bone: "Head", max_yaw_deg: 45, max_pitch_deg: 30 },
  animations: {
    idle: { clip: "Idle", loop: true },
    "running-right": { clip: "Run_Right", loop: true },
    "running-left": { clip: "Run_Left", loop: true },
    waving: { clip: "Wave", loop: false },
    jumping: { clip: "Jump", loop: false },
    failed: { clip: "Failed", loop: false },
    waiting: { clip: "Waiting", loop: true },
    running: { clip: "Work", loop: true },
    review: { clip: "Review", loop: true },
  },
};

const HEALTHY_INSPECTION: GlbInspectionResult = {
  vertexCount: 4200,
  triangleCount: 6800,
  clips: ["Idle", "Run_Right", "Run_Left", "Wave", "Jump", "Failed", "Waiting", "Work", "Review"],
  bones: ["Root", "Spine", "Head", "Tail"],
  maxTextureDimension: 512,
  warnings: [],
};

describe("manifest-studio", () => {
  it("detects head bone with sensible fallbacks", () => {
    expect(detectHeadBone(["Root", "mixamorig:Head", "Tail"])).toBe("mixamorig:Head");
    expect(detectHeadBone(["Root", "Neck", "Arm"])).toBe("Neck");
    expect(detectHeadBone(["Pelvis", "Spine"])).toBe("Pelvis");
  });

  it("auto-suggests manifest with fuzzy clip matching and slugified id", () => {
    const inspection: GlbInspectionResult = {
      vertexCount: 3000,
      triangleCount: 4000,
      clips: [
        "idle_breath",
        "walk_right",
        "walk_left",
        "hello_wave",
        "happy_hop",
        "sad_fail",
        "thinking_wait",
        "coding_loop",
        "inspect_review",
      ],
      bones: ["Hips", "mixamorig_Head"],
      maxTextureDimension: 512,
      warnings: [],
    };

    const suggested = autoSuggestManifest("Shiba Inu.glb", inspection, BASE_MANIFEST);
    expect(suggested.id).toBe("shiba-inu--jyshen");
    expect(suggested.display_name).toBe("Shiba Inu");
    expect(suggested.look_at.head_bone).toBe("mixamorig_Head");
    expect(suggested.animations.idle.clip).toBe("idle_breath");
    expect(suggested.animations["running-right"].clip).toBe("walk_right");
    expect(suggested.animations.waving.clip).toBe("hello_wave");
    expect(suggested.animations.running.clip).toBe("coding_loop");
    expect(suggested.animations.review.clip).toBe("inspect_review");
    expect(matchClipForState("jumping", inspection.clips)).toBe("happy_hop");
  });

  it("evaluates spec budgets and flags violations accurately", () => {
    const healthy = evaluateModelDiagnostics(HEALTHY_INSPECTION, 120_000, BASE_MANIFEST);
    expect(healthy.ready).toBe(true);
    expect(healthy.errors).toHaveLength(0);

    const broken = evaluateModelDiagnostics(
      {
        vertexCount: 30_000,
        triangleCount: 15_000,
        clips: ["Idle"],
        bones: ["Root"],
        maxTextureDimension: 2048,
        warnings: ["High triangle count"],
      },
      6 * 1024 * 1024,
      { ...BASE_MANIFEST, id: "Invalid ID!" }
    );
    expect(broken.ready).toBe(false);
    expect(broken.errors.length).toBeGreaterThanOrEqual(5);
    expect(broken.checks.find((c) => c.id === "vertices")?.status).toBe("fail");
    expect(broken.checks.find((c) => c.id === "triangles")?.status).toBe("warn");
    expect(broken.checks.find((c) => c.id === "textures")?.status).toBe("fail");
  });

  it("formats valid rounded pet-3d.json", () => {
    const formatted = formatManifestJson({
      ...BASE_MANIFEST,
      scale: 1.23456,
      camera: { fov: 44.8, position: [0.12345, 1.2, 2.5], target: [0, 0.4, 0] },
    });
    const parsed = JSON.parse(formatted) as Pet3DManifest;
    expect(parsed.scale).toBe(1.235);
    expect(parsed.camera.fov).toBe(45);
    expect(parsed.camera.position[0]).toBe(0.123);
  });
});
