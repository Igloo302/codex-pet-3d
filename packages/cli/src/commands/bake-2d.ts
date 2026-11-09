import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runValidate } from "./validate.js";
import {
  SpritesheetBaker,
  type BakeManifest,
} from "../baker/SpritesheetBaker.js";

export interface Bake2DResult {
  success: boolean;
  exitCode: number;
  errors?: any[];
}

/**
 * Bakes a 3D pet directory into a Codex Pet v2 compatible 2D spritesheet.
 *
 * A validation pre-flight runs first: if the asset is invalid the function
 * aborts immediately with exitCode 1 and never creates anything inside
 * `options.out`.
 */
export async function runBake2D(
  targetDir: string,
  options: { out: string }
): Promise<Bake2DResult> {
  const validation = await runValidate(targetDir);
  if (!validation.valid) {
    return {
      success: false,
      exitCode: 1,
      errors: validation.errors,
    };
  }

  try {
    const manifest = JSON.parse(
      readFileSync(join(targetDir, "pet-3d.json"), "utf-8")
    ) as BakeManifest;
    const modelFile = manifest.model ?? "model.glb";
    const glbBytes = new Uint8Array(readFileSync(join(targetDir, modelFile)));

    await new SpritesheetBaker({
      glbBytes,
      manifest,
      outDir: options.out,
    }).bake();

    return { success: true, exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      exitCode: 1,
      errors: [{ path: targetDir, code: "BAKE_ERROR", message }],
    };
  }
}
