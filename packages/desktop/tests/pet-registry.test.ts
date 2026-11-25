import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { discoverPets, inspectPetDirectory, loadPetPayload } from "../src/pet-registry";

function writeMockPet(
  dir: string,
  overrides: { id: string; display_name: string; model?: string; glbContent?: string }
): void {
  fs.mkdirSync(dir, { recursive: true });
  const modelName = overrides.model ?? "model.glb";
  const manifest = {
    $schema: "https://codex-pet-3d.net/schemas/pet-3d.schema.json",
    spec_version: "3d-v1.0",
    id: overrides.id,
    display_name: overrides.display_name,
    author: "tester",
    description: "test pet",
    model: modelName,
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
  fs.writeFileSync(path.join(dir, "pet-3d.json"), JSON.stringify(manifest, null, 2));
  if (!modelName.includes("..")) {
    const modelFile = path.join(dir, modelName);
    fs.mkdirSync(path.dirname(modelFile), { recursive: true });
    fs.writeFileSync(modelFile, overrides.glbContent ?? "glTF-mock");
  }
}

describe("pet-registry", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-pet-reg-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("discovers pets across bundled, codex, and custom dirs with precedence custom > codex > bundled", () => {
    const bundled = path.join(tmpDir, "bundled");
    const codex = path.join(tmpDir, "codex");
    const customPet = path.join(tmpDir, "custom-dog");

    writeMockPet(path.join(bundled, "cyber-cat"), {
      id: "cyber-cat--jyshen",
      display_name: "Cyber Cat (Bundled)",
    });
    writeMockPet(path.join(codex, "cyber-cat--jyshen"), {
      id: "cyber-cat--jyshen",
      display_name: "Cyber Cat (Codex)",
    });
    writeMockPet(customPet, {
      id: "shiba--demo",
      display_name: "Shiba Inu",
    });

    const pets = discoverPets({
      bundledDir: bundled,
      codexPetsDir: codex,
      customDirs: [customPet],
    });

    expect(pets).toHaveLength(2);
    const cat = pets.find((p) => p.id === "cyber-cat--jyshen");
    const shiba = pets.find((p) => p.id === "shiba--demo");
    expect(cat?.source).toBe("codex");
    expect(cat?.displayName).toBe("Cyber Cat (Codex)");
    expect(shiba?.source).toBe("custom");

    const payload = loadPetPayload(shiba!);
    expect(payload.id).toBe("shiba--demo");
    expect(new TextDecoder().decode(payload.modelBytes)).toBe("glTF-mock");
  });

  it("rejects path traversal in manifest.model", () => {
    const evilDir = path.join(tmpDir, "evil");
    fs.writeFileSync(path.join(tmpDir, "outside.glb"), "secret");
    writeMockPet(evilDir, {
      id: "evil--pet",
      display_name: "Evil",
      model: "../outside.glb",
    });

    expect(inspectPetDirectory(evilDir, "custom")).toBeNull();
  });
});
