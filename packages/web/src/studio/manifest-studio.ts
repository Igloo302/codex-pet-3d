import {
  STANDARD_ANIMATION_STATES,
  type Pet3DManifest,
  type StandardAnimationState,
} from "@codex-pet-3d/spec";
import type { GlbInspectionResult } from "@codex-pet-3d/spec/glb";

export const MAX_GLB_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_VERTICES = 25_000;
export const RECOMMENDED_TRIANGLES = 10_000;
export const MAX_TEXTURE_DIM = 1024;

export type CheckStatus = "pass" | "warn" | "fail";

export interface BudgetCheck {
  id: string;
  label: string;
  value: string;
  limit: string;
  status: CheckStatus;
}

export interface StudioDiagnostics {
  ready: boolean;
  errors: string[];
  warnings: string[];
  checks: BudgetCheck[];
}

const DEFAULT_LOOPS: Record<StandardAnimationState, boolean> = {
  idle: true,
  "running-right": true,
  "running-left": true,
  waving: false,
  jumping: false,
  failed: false,
  waiting: true,
  running: true,
  review: true,
};

const STATE_CLIP_HINTS: Record<StandardAnimationState, string[]> = {
  idle: ["idle", "rest", "stand", "breath"],
  "running-right": ["run_right", "runright", "walk_right", "right"],
  "running-left": ["run_left", "runleft", "walk_left", "left"],
  waving: ["wave", "waving", "greet", "hello"],
  jumping: ["jump", "jumping", "hop", "happy", "celebrate"],
  failed: ["fail", "failed", "sad", "error", "lose"],
  waiting: ["wait", "waiting", "think", "curious"],
  running: ["work", "running", "run", "coding", "type", "walk"],
  review: ["review", "inspect", "read", "focus"],
};

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function slugify(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/\.glb$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "custom-pet";
}

function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.glb$/i, "").replace(/[-_]+/g, " ").trim();
  if (!base) return "Custom Pet";
  return base.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Picks the most likely head bone from a GLB skeleton for LookAt head tracking.
 */
export function detectHeadBone(bones: string[], fallback = "Head"): string {
  if (bones.length === 0) return fallback;
  const exact = bones.find((b) => b === "Head" || b.toLowerCase() === "head");
  if (exact) return exact;
  const headLike = bones.find((b) => normalizeToken(b).includes("head"));
  if (headLike) return headLike;
  const neckLike = bones.find((b) => normalizeToken(b).includes("neck"));
  if (neckLike) return neckLike;
  return bones[0];
}

/**
 * Picks the best matching animation clip for a canonical pet state.
 */
export function matchClipForState(
  state: StandardAnimationState,
  clips: string[],
  currentClip?: string
): string {
  if (currentClip && clips.includes(currentClip)) {
    return currentClip;
  }
  if (clips.length === 0) {
    return currentClip ?? "";
  }

  const hints = STATE_CLIP_HINTS[state];
  // 1. Exact case-insensitive match on hints
  for (const hint of hints) {
    const exact = clips.find((c) => c.toLowerCase() === hint);
    if (exact) return exact;
  }
  // 2. Normalized substring match
  for (const hint of hints) {
    const normalizedHint = normalizeToken(hint);
    const partial = clips.find((c) => normalizeToken(c).includes(normalizedHint));
    if (partial) return partial;
  }

  return clips[0];
}

/**
 * Produces a ready-to-edit Pet3DManifest from a dropped GLB inspection result.
 */
export function autoSuggestManifest(
  fileName: string,
  inspection: GlbInspectionResult,
  baseManifest: Pet3DManifest
): Pet3DManifest {
  const slug = slugify(fileName);
  const author = slugify(baseManifest.author || "author");
  const animations = {} as Pet3DManifest["animations"];

  for (const state of STANDARD_ANIMATION_STATES) {
    animations[state] = {
      clip: matchClipForState(state, inspection.clips, baseManifest.animations[state]?.clip),
      loop: DEFAULT_LOOPS[state],
    };
  }

  const headBone = detectHeadBone(inspection.bones, baseManifest.look_at.head_bone);

  return {
    $schema: "https://codex-pet-3d.net/schemas/pet-3d.schema.json",
    spec_version: "3d-v1.0",
    id: `${slug}--${author}`,
    display_name: titleFromFileName(fileName),
    author,
    description: `Custom 3D Codex Pet authored from ${fileName}`,
    model: fileName.endsWith(".glb") ? fileName : "model.glb",
    scale: 1.0,
    camera: {
      fov: baseManifest.camera.fov,
      position: [...baseManifest.camera.position] as [number, number, number],
      target: [...baseManifest.camera.target] as [number, number, number],
    },
    look_at: {
      enabled: inspection.bones.length > 0,
      head_bone: headBone,
      max_yaw_deg: baseManifest.look_at.max_yaw_deg,
      max_pitch_deg: baseManifest.look_at.max_pitch_deg,
    },
    animations,
  };
}

const VALID_ID_PATTERN = /^[a-z0-9][a-z0-9-]*(--[a-z0-9][a-z0-9-]*)?$/;

/**
 * Evaluates a GLB + manifest draft against SPEC.md v1.0 budgets and requirements.
 */
export function evaluateModelDiagnostics(
  inspection: GlbInspectionResult,
  fileBytes: number,
  manifest: Pet3DManifest
): StudioDiagnostics {
  const errors: string[] = [];
  const warnings: string[] = [...inspection.warnings];

  const sizeMb = fileBytes / (1024 * 1024);
  const sizeOk = fileBytes <= MAX_GLB_BYTES;
  if (!sizeOk) {
    errors.push(`GLB file size ${sizeMb.toFixed(2)} MB exceeds the 5 MB limit.`);
  }

  const vertsOk = inspection.vertexCount <= MAX_VERTICES;
  if (!vertsOk) {
    errors.push(`Vertex count ${inspection.vertexCount.toLocaleString()} exceeds 25,000 limit.`);
  }

  const trisStatus: CheckStatus =
    inspection.triangleCount <= RECOMMENDED_TRIANGLES ? "pass" : "warn";

  const texOk = inspection.maxTextureDimension <= MAX_TEXTURE_DIM;
  if (!texOk) {
    errors.push(`Texture dimension ${inspection.maxTextureDimension}px exceeds 1024px limit.`);
  }

  const bonesOk = inspection.bones.length > 0;
  if (!bonesOk) {
    errors.push("Model has no skinned skeleton joints (skeletal animation required by spec).");
  }

  const headBoneFound =
    !manifest.look_at.enabled || inspection.bones.includes(manifest.look_at.head_bone);
  if (manifest.look_at.enabled && !headBoneFound) {
    errors.push(`LookAt head_bone "${manifest.look_at.head_bone}" was not found in GLB skeleton.`);
  }

  const clipSet = new Set(inspection.clips);
  const missingStates: string[] = [];
  for (const state of STANDARD_ANIMATION_STATES) {
    const clipName = manifest.animations[state]?.clip;
    if (!clipName || !clipSet.has(clipName)) {
      missingStates.push(state);
    }
  }
  if (missingStates.length > 0) {
    errors.push(`Unmapped or missing animation clips for: ${missingStates.join(", ")}.`);
  }

  if (!VALID_ID_PATTERN.test(manifest.id)) {
    errors.push(`Manifest id "${manifest.id}" should be lowercase slug format (e.g. my-pet--author).`);
  }

  const checks: BudgetCheck[] = [
    {
      id: "size",
      label: "File Size",
      value: fileBytes < 1024 * 1024 ? `${(fileBytes / 1024).toFixed(1)} KB` : `${sizeMb.toFixed(2)} MB`,
      limit: "≤ 5 MB",
      status: sizeOk ? "pass" : "fail",
    },
    {
      id: "vertices",
      label: "Vertices",
      value: inspection.vertexCount.toLocaleString(),
      limit: "≤ 25,000",
      status: vertsOk ? "pass" : "fail",
    },
    {
      id: "triangles",
      label: "Triangles",
      value: inspection.triangleCount.toLocaleString(),
      limit: "≤ 10,000 rec.",
      status: trisStatus,
    },
    {
      id: "textures",
      label: "Max Texture",
      value: inspection.maxTextureDimension > 0 ? `${inspection.maxTextureDimension} px` : "None",
      limit: "≤ 1024 px",
      status: texOk ? "pass" : "fail",
    },
    {
      id: "bones",
      label: "Skeleton",
      value: `${inspection.bones.length} joints`,
      limit: manifest.look_at.enabled ? `Head: ${manifest.look_at.head_bone || "—"}` : "LookAt off",
      status: bonesOk && headBoneFound ? "pass" : "fail",
    },
    {
      id: "clips",
      label: "Clips Mapped",
      value: `${STANDARD_ANIMATION_STATES.length - missingStates.length}/${STANDARD_ANIMATION_STATES.length}`,
      limit: `${inspection.clips.length} in GLB`,
      status: missingStates.length === 0 ? "pass" : "fail",
    },
  ];

  return {
    ready: errors.length === 0,
    errors,
    warnings,
    checks,
  };
}

/**
 * Serializes a Pet3DManifest to a clean, rounded, spec-compliant JSON string.
 */
export function formatManifestJson(manifest: Pet3DManifest): string {
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  const clean: Pet3DManifest = {
    $schema: "https://codex-pet-3d.net/schemas/pet-3d.schema.json",
    spec_version: "3d-v1.0",
    id: manifest.id,
    display_name: manifest.display_name,
    author: manifest.author,
    description: manifest.description,
    model: manifest.model,
    scale: round3(manifest.scale),
    camera: {
      fov: Math.round(manifest.camera.fov),
      position: manifest.camera.position.map(round3) as [number, number, number],
      target: manifest.camera.target.map(round3) as [number, number, number],
    },
    look_at: {
      enabled: manifest.look_at.enabled,
      head_bone: manifest.look_at.head_bone,
      max_yaw_deg: Math.round(manifest.look_at.max_yaw_deg),
      max_pitch_deg: Math.round(manifest.look_at.max_pitch_deg),
    },
    animations: manifest.animations,
  };
  return JSON.stringify(clean, null, 2) + "\n";
}
