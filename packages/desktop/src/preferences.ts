import * as fs from "node:fs";
import * as path from "node:path";

export const ALLOWED_WINDOW_SCALES = [0.75, 1, 1.25, 1.5] as const;
export type WindowScale = (typeof ALLOWED_WINDOW_SCALES)[number];

export interface WindowPosition {
  x: number;
  y: number;
}

export interface DesktopPreferences {
  selectedPetId: string | null;
  windowPosition: WindowPosition | null;
  windowScale: WindowScale;
  isLookAtEnabled: boolean;
  isCodexSyncEnabled: boolean;
  customPetDirs: string[];
}

export const DEFAULT_PREFERENCES: DesktopPreferences = {
  selectedPetId: null,
  windowPosition: null,
  windowScale: 1,
  isLookAtEnabled: true,
  isCodexSyncEnabled: true,
  customPetDirs: [],
};

function normalizeScale(value: unknown): WindowScale {
  if (
    typeof value === "number" &&
    (ALLOWED_WINDOW_SCALES as readonly number[]).includes(value)
  ) {
    return value as WindowScale;
  }
  return DEFAULT_PREFERENCES.windowScale;
}

function normalizePosition(value: unknown): WindowPosition | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { x?: unknown; y?: unknown };
  if (
    typeof candidate.x === "number" &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.y)
  ) {
    return { x: Math.round(candidate.x), y: Math.round(candidate.y) };
  }
  return null;
}

function normalizeCustomDirs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim().length > 0) {
      const normalized = path.resolve(item.trim());
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    }
  }
  return result;
}

/**
 * Loads desktop preferences from disk, falling back to safe defaults on missing or corrupt data.
 */
export function loadPreferences(filePath: string): DesktopPreferences {
  try {
    if (!fs.existsSync(filePath)) {
      return { ...DEFAULT_PREFERENCES, customPetDirs: [] };
    }
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") {
      return { ...DEFAULT_PREFERENCES, customPetDirs: [] };
    }

    return {
      selectedPetId:
        typeof raw.selectedPetId === "string" && raw.selectedPetId.trim().length > 0
          ? raw.selectedPetId.trim()
          : null,
      windowPosition: normalizePosition(raw.windowPosition),
      windowScale: normalizeScale(raw.windowScale),
      isLookAtEnabled:
        typeof raw.isLookAtEnabled === "boolean"
          ? raw.isLookAtEnabled
          : DEFAULT_PREFERENCES.isLookAtEnabled,
      isCodexSyncEnabled:
        typeof raw.isCodexSyncEnabled === "boolean"
          ? raw.isCodexSyncEnabled
          : DEFAULT_PREFERENCES.isCodexSyncEnabled,
      customPetDirs: normalizeCustomDirs(raw.customPetDirs),
    };
  } catch {
    return { ...DEFAULT_PREFERENCES, customPetDirs: [] };
  }
}

/**
 * Persists desktop preferences atomically to disk.
 */
export function savePreferences(filePath: string, prefs: DesktopPreferences): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(prefs, null, 2) + "\n", "utf-8");
  fs.renameSync(tempPath, filePath);
}
