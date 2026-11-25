import * as fs from "node:fs";
import * as path from "node:path";
import type { Pet3DManifest } from "@codex-pet-3d/spec";

export type PetSourceKind = "bundled" | "codex" | "custom";

export interface DiscoveredPet {
  id: string;
  displayName: string;
  author: string;
  source: PetSourceKind;
  dir: string;
  modelPath: string;
  manifest: Pet3DManifest;
}

export interface PetSummary {
  id: string;
  displayName: string;
  author: string;
  source: PetSourceKind;
}

export interface LoadedPetPayload {
  id: string;
  displayName: string;
  source: PetSourceKind;
  manifest: Pet3DManifest;
  modelBytes: Uint8Array;
}

const REQUIRED_ANIMATION_STATES = [
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review",
] as const;

function resolveContainedPath(baseDir: string, relativePath: string): string | null {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("\0")) {
    return null;
  }
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, relativePath);
  const rel = path.relative(resolvedBase, resolvedTarget);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  return resolvedTarget;
}

function isValidManifestShape(value: unknown): value is Pet3DManifest {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  if (
    typeof m.id !== "string" ||
    m.id.trim().length === 0 ||
    typeof m.display_name !== "string" ||
    typeof m.model !== "string" ||
    typeof m.scale !== "number" ||
    !Number.isFinite(m.scale) ||
    m.scale <= 0
  ) {
    return false;
  }

  const camera = m.camera as Record<string, unknown> | undefined;
  if (
    !camera ||
    typeof camera !== "object" ||
    typeof camera.fov !== "number" ||
    !Array.isArray(camera.position) ||
    camera.position.length !== 3 ||
    !Array.isArray(camera.target) ||
    camera.target.length !== 3
  ) {
    return false;
  }

  const lookAt = m.look_at as Record<string, unknown> | undefined;
  if (
    !lookAt ||
    typeof lookAt !== "object" ||
    typeof lookAt.enabled !== "boolean" ||
    typeof lookAt.head_bone !== "string" ||
    typeof lookAt.max_yaw_deg !== "number" ||
    typeof lookAt.max_pitch_deg !== "number"
  ) {
    return false;
  }

  const animations = m.animations as Record<string, unknown> | undefined;
  if (!animations || typeof animations !== "object") return false;
  for (const state of REQUIRED_ANIMATION_STATES) {
    const entry = animations[state] as Record<string, unknown> | undefined;
    if (!entry || typeof entry !== "object" || typeof entry.clip !== "string") {
      return false;
    }
  }

  return true;
}

/**
 * Inspects a single directory for a valid 3D pet (`pet-3d.json` + contained GLB file).
 */
export function inspectPetDirectory(
  dir: string,
  source: PetSourceKind
): DiscoveredPet | null {
  const manifestPath = path.join(dir, "pet-3d.json");
  if (!fs.existsSync(manifestPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as unknown;
    if (!isValidManifestShape(parsed)) return null;

    const modelPath = resolveContainedPath(dir, parsed.model);
    if (!modelPath || !fs.existsSync(modelPath) || !fs.statSync(modelPath).isFile()) {
      return null;
    }

    return {
      id: parsed.id,
      displayName: parsed.display_name,
      author: typeof parsed.author === "string" ? parsed.author : "unknown",
      source,
      dir: path.resolve(dir),
      modelPath,
      manifest: parsed,
    };
  } catch {
    return null;
  }
}

function scanParentDirectory(parentDir: string, source: PetSourceKind): DiscoveredPet[] {
  if (!fs.existsSync(parentDir)) return [];
  const discovered: DiscoveredPet[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(parentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pet = inspectPetDirectory(path.join(parentDir, entry.name), source);
    if (pet) discovered.push(pet);
  }
  return discovered;
}

export interface DiscoverPetsOptions {
  bundledDir?: string;
  codexPetsDir?: string;
  customDirs?: string[];
}

/**
 * Discovers all valid 3D pets across bundled assets, ~/.codex/pets/, and user custom directories.
 * Later sources take precedence on duplicate IDs: custom > codex > bundled.
 */
export function discoverPets(options: DiscoverPetsOptions): DiscoveredPet[] {
  const byId = new Map<string, DiscoveredPet>();

  const register = (pet: DiscoveredPet) => {
    byId.set(pet.id, pet);
  };

  if (options.bundledDir) {
    for (const pet of scanParentDirectory(options.bundledDir, "bundled")) {
      register(pet);
    }
  }

  if (options.codexPetsDir) {
    for (const pet of scanParentDirectory(options.codexPetsDir, "codex")) {
      register(pet);
    }
  }

  for (const customDir of options.customDirs ?? []) {
    if (!fs.existsSync(customDir)) continue;
    const direct = inspectPetDirectory(customDir, "custom");
    if (direct) {
      register(direct);
    } else {
      for (const pet of scanParentDirectory(customDir, "custom")) {
        register(pet);
      }
    }
  }

  return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Reads a discovered pet's GLB bytes for safe transfer into a sandboxed renderer via IPC.
 */
export function loadPetPayload(pet: DiscoveredPet): LoadedPetPayload {
  const raw = fs.readFileSync(pet.modelPath);
  return {
    id: pet.id,
    displayName: pet.displayName,
    source: pet.source,
    manifest: pet.manifest,
    modelBytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength),
  };
}
