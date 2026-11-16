import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { runBake2D, type Bake2DResult } from "./bake-2d.js";

export interface InstallResult extends Bake2DResult {
  installedPath?: string;
  petId?: string;
}

/**
 * Bakes a 3D pet asset directly into the local Codex pets directory
 * (~/.codex/pets/<pet-id>/) so it can be used immediately by Codex,
 * Codex Desktop, and TokenTracker.
 */
export async function runInstall(
  assetDir: string,
  options?: { targetDir?: string }
): Promise<InstallResult> {
  const manifestPath = join(assetDir, "pet-3d.json");
  if (!existsSync(manifestPath)) {
    return {
      success: false,
      exitCode: 2,
      errors: [
        {
          path: manifestPath,
          code: "MANIFEST_NOT_FOUND",
          message: `Cannot find pet-3d.json in ${assetDir}`,
        },
      ],
    };
  }

  let petId = "custom-pet";
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    if (manifest.id) {
      petId = manifest.id;
    }
  } catch {
    // If JSON parsing fails, runBake2D pre-flight validation will handle and report it.
  }

  const outDir = options?.targetDir || join(homedir(), ".codex", "pets", petId);

  const result = await runBake2D(assetDir, { out: outDir });

  return {
    ...result,
    installedPath: result.success ? outDir : undefined,
    petId,
  };
}
