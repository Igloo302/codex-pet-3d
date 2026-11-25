import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type DesktopPreferences,
} from "../src/preferences";

describe("desktop preferences", () => {
  let tmpDir: string;
  let prefsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-pet-prefs-"));
    prefsPath = path.join(tmpDir, "preferences.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when preferences file does not exist", () => {
    expect(loadPreferences(prefsPath)).toEqual(DEFAULT_PREFERENCES);
  });

  it("round-trips valid preferences through savePreferences and loadPreferences", () => {
    const customDir = path.join(tmpDir, "my-pet");
    const prefs: DesktopPreferences = {
      selectedPetId: "cyber-cat--jyshen",
      windowPosition: { x: 420, y: 310 },
      windowScale: 1.25,
      isLookAtEnabled: false,
      isCodexSyncEnabled: true,
      customPetDirs: [customDir, customDir],
    };

    savePreferences(prefsPath, prefs);
    const loaded = loadPreferences(prefsPath);

    expect(loaded).toEqual({
      ...prefs,
      customPetDirs: [path.resolve(customDir)],
    });
  });

  it("sanitizes invalid scale, position, and corrupt JSON gracefully", () => {
    fs.writeFileSync(
      prefsPath,
      JSON.stringify({
        selectedPetId: "  ",
        windowPosition: { x: "bad", y: 10 },
        windowScale: 99,
        isLookAtEnabled: "yes",
        isCodexSyncEnabled: false,
        customPetDirs: [123, "", "/tmp/pet-a"],
      })
    );

    const loaded = loadPreferences(prefsPath);
    expect(loaded.selectedPetId).toBeNull();
    expect(loaded.windowPosition).toBeNull();
    expect(loaded.windowScale).toBe(1);
    expect(loaded.isLookAtEnabled).toBe(true);
    expect(loaded.isCodexSyncEnabled).toBe(false);
    expect(loaded.customPetDirs).toEqual([path.resolve("/tmp/pet-a")]);

    fs.writeFileSync(prefsPath, "{not valid json");
    expect(loadPreferences(prefsPath)).toEqual(DEFAULT_PREFERENCES);
  });
});
