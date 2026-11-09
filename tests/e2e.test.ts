import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import sharp from "sharp";

// Project root is two levels up from tests/
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI_PATH = resolve(PROJECT_ROOT, "packages/cli/dist/cli.js");
const CYBER_CAT_DIR = resolve(PROJECT_ROOT, "assets/cyber-cat");

function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn("node", [CLI_PATH, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: PROJECT_ROOT,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

describe("E2E: validate & bake-2d integration", () => {
  let tmpOutDir: string;

  beforeAll(() => {
    // Create a temporary output directory for bake-2d
    tmpOutDir = mkdtempSync(join(tmpdir(), "codex-pet-e2e-"));
  });

  afterAll(() => {
    // Clean up the temporary output directory
    if (existsSync(tmpOutDir)) {
      rmSync(tmpOutDir, { recursive: true, force: true });
    }
  });

  it("validate returns { valid: true } for cyber-cat with --json", async () => {
    const result = await runCli(["validate", CYBER_CAT_DIR, "--json"]);

    expect(result.code).toBe(0);

    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.valid).toBe(true);
    expect(parsed.exitCode).toBe(0);
    expect(parsed.errors).toEqual([]);
  });

  it("bake-2d produces spritesheet.webp and pet.json", async () => {
    const result = await runCli(["bake-2d", CYBER_CAT_DIR, "--out", tmpOutDir]);

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toContain(`Baked 2D spritesheet to ${tmpOutDir}`);

    // Check spritesheet.webp exists
    const sheetPath = join(tmpOutDir, "spritesheet.webp");
    expect(existsSync(sheetPath)).toBe(true);

    // Check pet.json exists
    const petJsonPath = join(tmpOutDir, "pet.json");
    expect(existsSync(petJsonPath)).toBe(true);
  });

  it("spritesheet.webp starts with RIFF/WEBP magic bytes", async () => {
    const sheetPath = join(tmpOutDir, "spritesheet.webp");
    const bytes = readFileSync(sheetPath);

    // RIFF header
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    // WEBP format
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });

  it("spritesheet.webp has correct dimensions 1536x2288", async () => {
    const sheetPath = join(tmpOutDir, "spritesheet.webp");
    const metadata = await sharp(sheetPath).metadata();

    expect(metadata.width).toBe(1536);
    expect(metadata.height).toBe(2288);
  });

  it("pet.json has correct v2 structure with all 9 animation states", async () => {
    const petJsonPath = join(tmpOutDir, "pet.json");
    const pet = JSON.parse(readFileSync(petJsonPath, "utf-8"));

    expect(pet.spriteVersionNumber).toBe(2);
    expect(pet.spritesheetPath).toBe("spritesheet.webp");
    expect(pet.frameWidth).toBe(192);
    expect(pet.frameHeight).toBe(208);

    // All 9 canonical animation states
    const expectedStates = [
      "idle",
      "running-right",
      "running-left",
      "waving",
      "jumping",
      "failed",
      "waiting",
      "running",
      "review",
    ];

    for (const state of expectedStates) {
      expect(pet.states).toHaveProperty(state);
      expect(pet.states[state]).toHaveProperty("row");
      expect(pet.states[state]).toHaveProperty("frames");
      expect(pet.states[state]).toHaveProperty("loop");
    }

    // Verify specific state properties
    expect(pet.states.idle).toEqual({ row: 0, frames: 7, loop: true });
    expect(pet.states["running-right"]).toEqual({ row: 1, frames: 8, loop: true });
    expect(pet.states["running-left"]).toEqual({ row: 2, frames: 8, loop: true });
    expect(pet.states.waving).toEqual({ row: 3, frames: 8, loop: false });
    expect(pet.states.jumping).toEqual({ row: 4, frames: 8, loop: false });
    expect(pet.states.failed).toEqual({ row: 5, frames: 8, loop: false });
    expect(pet.states.waiting).toEqual({ row: 6, frames: 8, loop: true });
    expect(pet.states.running).toEqual({ row: 7, frames: 8, loop: true });
    expect(pet.states.review).toEqual({ row: 8, frames: 8, loop: true });
  });
});