import { describe, it, expect, afterEach } from "vitest";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { runBake2D } from "../src/commands/bake-2d.js";
import {
  computeUnionAABB,
  computeFixedCamera,
} from "../src/baker/AABBCalculator.js";
import {
  computeLookAtHeadAngles,
  CELL_WIDTH,
  CELL_HEIGHT,
} from "../src/baker/SpritesheetBaker.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CYBER_CAT_DIR = resolve(HERE, "../../../assets/cyber-cat");

function createTempDir(name: string): string {
  const dir = join(HERE, `tmp-${name}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe("runBake2D", () => {
  it("fails fast with exitCode 1 and writes no spritesheet for an invalid model", async () => {
    const badDir = createTempDir("invalid-model");
    const outDir = createTempDir("invalid-out");
    tempDirs.push(badDir, outDir);

    // Copy the cyber-cat asset but reference a clip that does not exist so
    // validation fails deterministically (MISSING_CLIPS).
    const manifest = JSON.parse(
      readFileSync(join(CYBER_CAT_DIR, "pet-3d.json"), "utf-8")
    );
    manifest.animations.idle.clip = "NonExistentClip";
    writeFileSync(join(badDir, "pet-3d.json"), JSON.stringify(manifest, null, 2));
    writeFileSync(
      join(badDir, "model.glb"),
      readFileSync(join(CYBER_CAT_DIR, "model.glb"))
    );

    const result = await runBake2D(badDir, { out: outDir });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errors && result.errors.length).toBeGreaterThan(0);
    expect(existsSync(join(outDir, "spritesheet.webp"))).toBe(false);
    expect(existsSync(join(outDir, "pet.json"))).toBe(false);
  });

  it("bakes a compliant 1536x2288 WebP spritesheet from assets/cyber-cat", async () => {
    const outDir = createTempDir("bake");
    tempDirs.push(outDir);

    const result = await runBake2D(CYBER_CAT_DIR, { out: outDir });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);

    const sheetPath = join(outDir, "spritesheet.webp");
    expect(existsSync(sheetPath)).toBe(true);

    // RIFF / WEBP magic.
    const bytes = readFileSync(sheetPath);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");

    // Exact Codex Pet v2 dimensions.
    const metadata = await sharp(sheetPath).metadata();
    expect(metadata.width).toBe(1536);
    expect(metadata.height).toBe(2288);

    // Row 0 / Col 7 is the single unused idle cell: alpha must be 0 everywhere.
    const unused = await sharp(sheetPath)
      .extract({
        left: 7 * CELL_WIDTH,
        top: 0,
        width: CELL_WIDTH,
        height: CELL_HEIGHT,
      })
      .ensureAlpha()
      .raw()
      .toBuffer();
    expect(unused.length).toBe(CELL_WIDTH * CELL_HEIGHT * 4);
    let allTransparent = true;
    for (let i = 3; i < unused.length; i += 4) {
      if (unused[i] !== 0) {
        allTransparent = false;
        break;
      }
    }
    expect(allTransparent).toBe(true);

    // An active cell must actually contain the rendered pet (the fixed framing
    // keeps it in view). This guards against a silently empty spritesheet.
    const full = await sharp(sheetPath).ensureAlpha().raw().toBuffer();
    let activeOpaque = 0;
    for (let y = 0; y < CELL_HEIGHT; y++) {
      for (let x = 0; x < CELL_WIDTH; x++) {
        if (full[(y * 1536 + x) * 4 + 3] > 0) activeOpaque++;
      }
    }
    expect(activeOpaque).toBeGreaterThan(50);

    // pet.json v2 metadata.
    const pet = JSON.parse(readFileSync(join(outDir, "pet.json"), "utf-8"));
    expect(pet.spriteVersionNumber).toBe(2);
    expect(pet.spritesheetPath).toBe("spritesheet.webp");
    expect(pet.frameWidth).toBe(192);
    expect(pet.frameHeight).toBe(208);
    expect(pet.states.idle).toEqual({ row: 0, frames: 7, loop: true });
    expect(pet.states.failed).toEqual({ row: 5, frames: 8, loop: false });
  }, 300000);
});

describe("AABBCalculator pure helpers", () => {
  it("unions bounding boxes into a single encompassing AABB", () => {
    const union = computeUnionAABB([
      { min: [-1, 0, -2], max: [1, 2, 0] },
      { min: [0, -3, 1], max: [4, 1, 3] },
    ]);
    expect(union.min).toEqual([-1, -3, -2]);
    expect(union.max).toEqual([4, 2, 3]);
  });

  it("ignores non-finite boxes and falls back to a unit box when empty", () => {
    expect(computeUnionAABB([])).toEqual({
      min: [-0.5, -0.5, -0.5],
      max: [0.5, 0.5, 0.5],
    });
    const union = computeUnionAABB([
      { min: [Infinity, 0, 0], max: [-Infinity, 0, 0] },
      { min: [-2, -2, -2], max: [2, 2, 2] },
    ]);
    expect(union.min).toEqual([-2, -2, -2]);
    expect(union.max).toEqual([2, 2, 2]);
  });

  it("derives one fixed camera targeting the union center with a 10% margin", () => {
    const union = { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };
    const base = {
      fov: 45,
      viewDirection: [0, 0.8, 2.5] as [number, number, number],
      aspect: 192 / 208,
    };
    const camera = computeFixedCamera(union, base);

    expect(camera.fov).toBe(45);
    expect(camera.target).toEqual([0, 0, 0]);
    expect(camera.near).toBeGreaterThan(0);
    expect(camera.far).toBeGreaterThan(camera.near);

    // Camera sits along the authored view direction, beyond the box radius.
    const distance = Math.hypot(
      camera.position[0] - camera.target[0],
      camera.position[1] - camera.target[1],
      camera.position[2] - camera.target[2]
    );
    expect(distance).toBeGreaterThan(Math.sqrt(3) / 2);

    // A larger safety margin must push the camera further away.
    const tighter = computeFixedCamera(union, { ...base, margin: 1.0 });
    const looser = computeFixedCamera(union, { ...base, margin: 1.3 });
    const dTight = Math.hypot(...tighter.position);
    const dLoose = Math.hypot(...looser.position);
    expect(dLoose).toBeGreaterThan(dTight);
  });
});

describe("computeLookAtHeadAngles", () => {
  it("returns 16 distinct, deterministic head orientations via calculateAngles", () => {
    const a = computeLookAtHeadAngles(45, 30);
    expect(a).toHaveLength(16);

    const keys = new Set(a.map((v) => `${v.yaw.toFixed(6)}:${v.pitch.toFixed(6)}`));
    expect(keys.size).toBe(16);

    const b = computeLookAtHeadAngles(45, 30);
    expect(b).toEqual(a);

    // North (k=0): looking up, no yaw. East (k=4): full yaw to the right.
    expect(a[0].yaw).toBeCloseTo(0, 6);
    expect(a[0].pitch).toBeCloseTo((30 * Math.PI) / 180, 6);
    expect(a[4].yaw).toBeCloseTo((45 * Math.PI) / 180, 6);
    expect(a[4].pitch).toBeCloseTo(0, 6);
  });
});
