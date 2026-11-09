import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { runValidate, formatValidationResult, type ValidationResult, type ValidationError } from "../src/commands/validate.js";
import { Document, WebIO, AccessorType } from "@gltf-transform/core";

const TEST_ASSETS_DIR = resolve(__dirname, "../../../assets");
const CYBER_CAT_DIR = join(TEST_ASSETS_DIR, "cyber-cat");

// Helper to create a temporary test directory
function createTempDir(name: string): string {
  const tempDir = join(__dirname, `tmp-${name}-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

// Helper to clean up temp directory
function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Helper to create a minimal valid GLB with specific properties
async function createTestGlb(options: {
  clips?: string[];
  bones?: string[];
  vertexCount?: number;
  textureDimension?: number;
} = {}): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();

  // Create position accessor with specified vertex count
  const vertices = options.vertexCount ?? 8;
  const positionArray = new Float32Array(vertices * 3);
  for (let i = 0; i < vertices; i++) {
    positionArray[i * 3] = i * 0.1;
    positionArray[i * 3 + 1] = 0;
    positionArray[i * 3 + 2] = 0;
  }

  const position = doc
    .createAccessor("POSITION")
    .setType("VEC3" as AccessorType)
    .setArray(positionArray)
    .setBuffer(buffer);

  const primitive = doc.createPrimitive().setAttribute("POSITION", position);
  const mesh = doc.createMesh("Mesh").addPrimitive(primitive);

  // Add skins/joints for bones
  if (options.bones && options.bones.length > 0) {
    const skin = doc.createSkin("Skin");
    const joints: any[] = [];
    for (const boneName of options.bones) {
      const joint = doc.createNode(boneName);
      joints.push(joint);
    }
    skin.setJoints(joints);
    primitive.setSkin(skin);
  }

  // Add animations
  if (options.clips && options.clips.length > 0) {
    // Just add animation names, not actual keyframes
    for (const clipName of options.clips) {
      doc.createAnimation(clipName);
    }
  }

  // Add texture with specific dimension
  if (options.textureDimension) {
    // Create a minimal PNG header with specified dimensions
    const pngBytes = new Uint8Array(24);
    pngBytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(pngBytes.buffer);
    view.setUint32(16, options.textureDimension, false);
    view.setUint32(20, options.textureDimension, false);

    const texture = doc.createTexture("Texture").setMimeType("image/png").setImage(pngBytes);
    primitive.setMaterial(doc.createMaterial("Material").setBaseColorTexture(texture));
  }

  doc.createScene("Scene").addChild(doc.createNode("Node").setMesh(mesh));
  return await new WebIO().writeBinary(doc);
}

describe("runValidate", () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      cleanupTempDir(dir);
    }
    tempDirs = [];
  });

  describe("Compliant asset", () => {
    it("passes with exitCode 0 for cyber-cat asset", async () => {
      const result = await runValidate(CYBER_CAT_DIR);

      expect(result.valid).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Missing clip", () => {
    it("fails with exitCode 1 and code MISSING_CLIPS", async () => {
      const tempDir = createTempDir("missing-clip");
      tempDirs.push(tempDir);

      // Copy the cyber-cat manifest but modify it to have a missing clip
      const manifest = JSON.parse(readFileSync(join(CYBER_CAT_DIR, "pet-3d.json"), "utf-8"));
      manifest.animations.idle.clip = "NonExistentClip";
      writeFileSync(join(tempDir, "pet-3d.json"), JSON.stringify(manifest, null, 2));

      // Copy the model
      const modelBytes = readFileSync(join(CYBER_CAT_DIR, "model.glb"));
      writeFileSync(join(tempDir, "model.glb"), modelBytes);

      const result = await runValidate(tempDir);

      expect(result.valid).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.errors.some(e => e.code === "MISSING_CLIPS")).toBe(true);
      expect(result.errors.some(e => e.path === "/animations/idle/clip")).toBe(true);
    });
  });

  describe("Non-existent directory", () => {
    it("returns exitCode 2 with FILE_NOT_FOUND", async () => {
      const nonExistentDir = join(__dirname, "this-directory-does-not-exist-12345");

      const result = await runValidate(nonExistentDir);

      expect(result.valid).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.errors.some(e => e.code === "FILE_NOT_FOUND")).toBe(true);
    });
  });

  describe("Missing head bone", () => {
    it("fails with exitCode 1 and code MISSING_HEAD_BONE", async () => {
      const tempDir = createTempDir("missing-head-bone");
      tempDirs.push(tempDir);

      // Copy the cyber-cat manifest but change head_bone to non-existent
      const manifest = JSON.parse(readFileSync(join(CYBER_CAT_DIR, "pet-3d.json"), "utf-8"));
      manifest.look_at.head_bone = "NonExistentHeadBone";
      writeFileSync(join(tempDir, "pet-3d.json"), JSON.stringify(manifest, null, 2));

      // Copy the model
      const modelBytes = readFileSync(join(CYBER_CAT_DIR, "model.glb"));
      writeFileSync(join(tempDir, "model.glb"), modelBytes);

      const result = await runValidate(tempDir);

      expect(result.valid).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.errors.some(e => e.code === "MISSING_HEAD_BONE")).toBe(true);
      expect(result.errors.some(e => e.path === "/look_at/head_bone")).toBe(true);
    });
  });

  describe("Budget exceeded", () => {
    it("fails with exitCode 1 for vertex budget exceeded", async () => {
      const tempDir = createTempDir("vertex-budget");
      tempDirs.push(tempDir);

      // Create a model with too many vertices
      const modelBytes = await createTestGlb({ vertexCount: 30000 });
      writeFileSync(join(tempDir, "model.glb"), Buffer.from(modelBytes));

      // Create a valid manifest
      const manifest = JSON.parse(readFileSync(join(CYBER_CAT_DIR, "pet-3d.json"), "utf-8"));
      writeFileSync(join(tempDir, "pet-3d.json"), JSON.stringify(manifest, null, 2));

      const result = await runValidate(tempDir);

      expect(result.valid).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.errors.some(e => e.code === "VERTEX_BUDGET_EXCEEDED")).toBe(true);
    });

    it("fails with exitCode 1 for texture dimension exceeded", async () => {
      const tempDir = createTempDir("texture-dimension");
      tempDirs.push(tempDir);

      // Create a model with too large texture
      const modelBytes = await createTestGlb({ textureDimension: 2048 });
      writeFileSync(join(tempDir, "model.glb"), Buffer.from(modelBytes));

      // Create a valid manifest
      const manifest = JSON.parse(readFileSync(join(CYBER_CAT_DIR, "pet-3d.json"), "utf-8"));
      writeFileSync(join(tempDir, "pet-3d.json"), JSON.stringify(manifest, null, 2));

      const result = await runValidate(tempDir);

      expect(result.valid).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.errors.some(e => e.code === "TEXTURE_DIMENSION_EXCEEDED")).toBe(true);
    });

    it("fails with exitCode 1 for model file size exceeded", async () => {
      const tempDir = createTempDir("file-size");
      tempDirs.push(tempDir);

      // Create a manifest
      const manifest = JSON.parse(readFileSync(join(CYBER_CAT_DIR, "pet-3d.json"), "utf-8"));
      writeFileSync(join(tempDir, "pet-3d.json"), JSON.stringify(manifest, null, 2));

      // Create a large dummy model file (> 5MB)
      const largeBuffer = Buffer.alloc(5_300_000); // > 5MB
      writeFileSync(join(tempDir, "model.glb"), largeBuffer);

      const result = await runValidate(tempDir);

      expect(result.valid).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.errors.some(e => e.code === "MODEL_FILE_SIZE_EXCEEDED")).toBe(true);
    });
  });

  describe("Additional validation cases", () => {
    it("fails with INVALID_JSON for malformed manifest", async () => {
      const tempDir = createTempDir("invalid-json");
      tempDirs.push(tempDir);

      writeFileSync(join(tempDir, "pet-3d.json"), "{ invalid json }");
      const modelBytes = readFileSync(join(CYBER_CAT_DIR, "model.glb"));
      writeFileSync(join(tempDir, "model.glb"), modelBytes);

      const result = await runValidate(tempDir);

      expect(result.valid).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.errors.some(e => e.code === "INVALID_JSON")).toBe(true);
    });

    it("fails with MODEL_NOT_FOUND when model file is missing", async () => {
      const tempDir = createTempDir("model-not-found");
      tempDirs.push(tempDir);

      const manifest = JSON.parse(readFileSync(join(CYBER_CAT_DIR, "pet-3d.json"), "utf-8"));
      writeFileSync(join(tempDir, "pet-3d.json"), JSON.stringify(manifest, null, 2));
      // Don't create model.glb

      const result = await runValidate(tempDir);

      expect(result.valid).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.errors.some(e => e.code === "MODEL_NOT_FOUND")).toBe(true);
    });

    it("includes warnings from inspection", async () => {
      const tempDir = createTempDir("warnings");
      tempDirs.push(tempDir);

      // Create a model with high triangle count (> 10000)
      const modelBytes = await createTestGlb({ vertexCount: 10001 * 3 }); // Will create ~10001 triangles
      writeFileSync(join(tempDir, "model.glb"), Buffer.from(modelBytes));

      const manifest = JSON.parse(readFileSync(join(CYBER_CAT_DIR, "pet-3d.json"), "utf-8"));
      writeFileSync(join(tempDir, "pet-3d.json"), JSON.stringify(manifest, null, 2));

      const result = await runValidate(tempDir);

      // Validation should fail due to vertex budget error, but still include warning
      expect(result.valid).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.errors.some(e => e.code === "VERTEX_BUDGET_EXCEEDED")).toBe(true);
      expect(result.warnings.some(w => w.includes("High triangle count"))).toBe(true);
    });
  });

  describe("formatValidationResult", () => {
    it("formats valid result correctly", () => {
      const result: ValidationResult = {
        valid: true,
        exitCode: 0,
        errors: [],
        warnings: [],
      };

      const output = formatValidationResult(result, "/test/path");

      expect(output).toContain("Validating: /test/path");
      expect(output).toContain("✓ Validation passed");
    });

    it("formats invalid result with errors correctly", () => {
      const result: ValidationResult = {
        valid: false,
        exitCode: 1,
        errors: [
          { path: "/animations/idle/clip", code: "MISSING_CLIPS", message: "Clip not found in model: MissingClip" },
        ],
        warnings: ["High triangle count: 15000 > 10000 recommended"],
      };

      const output = formatValidationResult(result, "/test/path");

      expect(output).toContain("Validating: /test/path");
      expect(output).toContain("✗ Validation failed");
      expect(output).toContain("[MISSING_CLIPS] /animations/idle/clip: Clip not found in model: MissingClip");
      expect(output).toContain("! High triangle count: 15000 > 10000 recommended");
    });
  });
});