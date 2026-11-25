import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { runBake2D, type Bake2DResult } from "./bake-2d.js";
import { runValidate } from "./validate.js";
import { PathTraversalError, resolveSafeSubpath } from "../utils/path-guard.js";

export interface InstallResult extends Bake2DResult {
  installedPath?: string;
  petId?: string;
}

/**
 * Copies the 3D source manifest and model file into the installed pet directory
 * so both 2D clients and the 3D Desktop Companion can discover the pet from ~/.codex/pets/.
 */
export function copy3DCompanionAssets(
  assetDir: string,
  outDir: string,
  modelRelPath: string
): void {
  const srcManifest = resolveSafeSubpath(assetDir, "pet-3d.json");
  const destManifest = resolveSafeSubpath(outDir, "pet-3d.json");
  const srcModel = resolveSafeSubpath(assetDir, modelRelPath);
  const destModel = resolveSafeSubpath(outDir, modelRelPath);

  mkdirSync(dirname(destManifest), { recursive: true });
  mkdirSync(dirname(destModel), { recursive: true });
  copyFileSync(srcManifest, destManifest);
  copyFileSync(srcModel, destModel);
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

  // Validate before resolving install destination to block untrusted manifest ids/paths.
  const validation = await runValidate(assetDir);
  if (!validation.valid) {
    return {
      success: false,
      exitCode: validation.exitCode,
      errors: validation.errors,
    };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    id: string;
    model: string;
  };
  const petId = manifest.id;

  let outDir: string;
  if (options?.targetDir) {
    outDir = options.targetDir;
  } else {
    const petsRoot = join(homedir(), ".codex", "pets");
    try {
      outDir = resolveSafeSubpath(petsRoot, petId);
    } catch (e) {
      if (e instanceof PathTraversalError) {
        return {
          success: false,
          exitCode: 1,
          errors: [{ path: "/id", code: e.code, message: e.message }],
          petId,
        };
      }
      throw e;
    }
  }

  const result = await runBake2D(assetDir, { out: outDir });
  if (result.success) {
    copy3DCompanionAssets(assetDir, outDir, manifest.model);
  }

  return {
    ...result,
    installedPath: result.success ? outDir : undefined,
    petId,
  };
}
