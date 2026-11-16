import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runInstall } from "../src/commands/install.js";

describe("runInstall", () => {
  const tmpDir = join(__dirname, `tmp-install-test-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
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
});
