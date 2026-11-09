import { readFileSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  validatePet3DManifest,
  inspectGlb,
  GlbFormatError,
} from "@codex-pet-3d/spec";
import type { ValidationError, Pet3DManifest } from "@codex-pet-3d/spec";
export type { ValidationError };

/**
 * Represents a single validation error with a machine-readable code.
 */
/**
 * Result of the validation operation.
 */
export interface ValidationResult {
  valid: boolean;
  exitCode: number;
  errors: ValidationError[];
  warnings: string[];
}

const MAX_MODEL_SIZE_BYTES = 5_242_880; // 5 MB
const MAX_VERTEX_COUNT = 25_000;
const MAX_TEXTURE_DIMENSION = 1024;
const DEFAULT_MODEL_FILE = "model.glb";

/**
 * Validates a pet-3d asset directory.
 *
 * @param targetDir - Path to the directory containing pet-3d.json and model.glb
 * @param options - Optional flags, currently only `json` for JSON output
 * @returns ValidationResult with validation status and any errors/warnings
 */
export async function runValidate(
  targetDir: string,
  options?: { json?: boolean }
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // 1. Check directory exists and contains pet-3d.json
  const manifestPath = join(targetDir, "pet-3d.json");
  if (!existsSync(manifestPath)) {
    return {
      valid: false,
      exitCode: 2,
      errors: [
        {
          path: targetDir,
          code: "FILE_NOT_FOUND",
          message: `Manifest file not found: ${manifestPath}`,
        },
      ],
      warnings: [],
    };
  }

  // 2. Read and parse pet-3d.json
  let manifest: Pet3DManifest;
  try {
    const manifestContent = readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(manifestContent) as Pet3DManifest;
  } catch (e) {
    if (e instanceof SyntaxError) {
      return {
        valid: false,
        exitCode: 1,
        errors: [
          {
            path: manifestPath,
            code: "INVALID_JSON",
            message: `Invalid JSON in manifest: ${e.message}`,
          },
        ],
        warnings: [],
      };
    }
    throw e;
  }

  // 3. Validate manifest schema
  const schemaResult = validatePet3DManifest(manifest);
  if (!schemaResult.valid) {
    errors.push(...schemaResult.errors);
  }

  // 4. Locate model file
  const modelFile = manifest.model ?? DEFAULT_MODEL_FILE;
  const modelPath = join(targetDir, modelFile);

  if (!existsSync(modelPath)) {
    errors.push({
      path: modelPath,
      code: "MODEL_NOT_FOUND",
      message: `Model file not found: ${modelPath}`,
    });
  } else {
    // 5. Check model file size
    const modelStats = statSync(modelPath);
    if (modelStats.size > MAX_MODEL_SIZE_BYTES) {
      errors.push({
        path: modelPath,
        code: "MODEL_FILE_SIZE_EXCEEDED",
        message: `Model file size ${modelStats.size} bytes exceeds maximum of ${MAX_MODEL_SIZE_BYTES} bytes (5 MB)`,
      });
    }

    // 6. Run GLB inspection
    if (errors.length === 0) {
      try {
        const modelBytes = new Uint8Array(readFileSync(modelPath));
        const inspection = await inspectGlb(modelBytes);

        // Check vertex budget
        if (inspection.vertexCount > MAX_VERTEX_COUNT) {
          errors.push({
            path: "/model",
            code: "VERTEX_BUDGET_EXCEEDED",
            message: `Vertex count ${inspection.vertexCount} exceeds maximum of ${MAX_VERTEX_COUNT}`,
          });
        }

        // Check texture dimension
        if (inspection.maxTextureDimension > MAX_TEXTURE_DIMENSION) {
          errors.push({
            path: "/model",
            code: "TEXTURE_DIMENSION_EXCEEDED",
            message: `Max texture dimension ${inspection.maxTextureDimension} exceeds maximum of ${MAX_TEXTURE_DIMENSION}`,
          });
        }

        // Add warnings from inspection
        warnings.push(...inspection.warnings);

        // Cross-check animation clips
        if (manifest.animations) {
          for (const [state, animation] of Object.entries(manifest.animations)) {
            if (animation.clip && !inspection.clips.includes(animation.clip)) {
              errors.push({
                path: `/animations/${state}/clip`,
                code: "MISSING_CLIPS",
                message: `Clip not found in model: ${animation.clip}`,
              });
            }
          }
        }

        // Cross-check look_at head_bone
        if (
          manifest.look_at?.enabled &&
          manifest.look_at?.head_bone &&
          !inspection.bones.includes(manifest.look_at.head_bone)
        ) {
          errors.push({
            path: "/look_at/head_bone",
            code: "MISSING_HEAD_BONE",
            message: `Bone not found in model: ${manifest.look_at.head_bone}`,
          });
        }
      } catch (e) {
        if (e instanceof GlbFormatError) {
          errors.push({
            path: modelPath,
            code: "GLB_FORMAT_ERROR",
            message: `GLB format error (${e.code}): ${e.message}`,
          });
        } else {
          throw e;
        }
      }
    }
  }

  // Determine final result
  const valid = errors.length === 0;
  const exitCode = valid ? 0 : 1;

  return { valid, exitCode, errors, warnings };
}

/**
 * Formats validation result for human-readable output.
 */
export function formatValidationResult(
  result: ValidationResult,
  targetDir: string
): string {
  const lines: string[] = [];
  lines.push(`Validating: ${targetDir}`);
  lines.push("");

  if (result.valid) {
    lines.push("✓ Validation passed");
  } else {
    lines.push("✗ Validation failed");
  }

  if (result.errors.length > 0) {
    lines.push("");
    lines.push("Errors:");
    for (const error of result.errors) {
      lines.push(`  [${error.code}] ${error.path}: ${error.message}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of result.warnings) {
      lines.push(`  ! ${warning}`);
    }
  }

  return lines.join("\n");
}