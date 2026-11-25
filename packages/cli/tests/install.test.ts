import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copy3DCompanionAssets, runInstall } from "../src/commands/install.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CYBER_CAT_DIR = resolve(HERE, "../../../assets/cyber-cat");

describe("runInstall", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "codex-pet-install-"));
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns MANIFEST_NOT_FOUND if asset dir lacks pet-3d.json", async () => {
    const result = await runInstall(tmpDir);
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.errors?.[0].code).toBe("MANIFEST_NOT_FOUND");
  });

  it("fails pre-flight validation gracefully for invalid manifest", async () => {
    const manifestPath = join(tmpDir, "pet-3d.json");
    writeFileSync(manifestPath, JSON.stringify({ invalid: true }));

    const outDir = join(tmpDir, "out");
    const result = await runInstall(tmpDir, { targetDir: outDir });
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(existsSync(outDir)).toBe(false);
  });

  it("rejects path traversal in manifest.id before creating any directory", async () => {
    const manifest = JSON.parse(readFileSync(join(CYBER_CAT_DIR, "pet-3d.json"), "utf-8"));
    manifest.id = "../../escaped-pet";
    writeFileSync(join(tmpDir, "pet-3d.json"), JSON.stringify(manifest, null, 2));
    writeFileSync(join(tmpDir, "model.glb"), readFileSync(join(CYBER_CAT_DIR, "model.glb")));

    const result = await runInstall(tmpDir);
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.installedPath).toBeUndefined();
  });

  it("copies pet-3d.json and model.glb into installed directory for 3D companion discovery", () => {
    const outDir = join(tmpDir, "installed");
    copy3DCompanionAssets(CYBER_CAT_DIR, outDir, "model.glb");

    expect(existsSync(join(outDir, "pet-3d.json"))).toBe(true);
    expect(existsSync(join(outDir, "model.glb"))).toBe(true);
    expect(readFileSync(join(outDir, "pet-3d.json"), "utf-8")).toContain("cyber-cat--jyshen");
  });

  it("blocks path traversal in copy3DCompanionAssets model path", () => {
    const outDir = join(tmpDir, "installed");
    expect(() => copy3DCompanionAssets(CYBER_CAT_DIR, outDir, "../outside.glb")).toThrow();
  });
});
