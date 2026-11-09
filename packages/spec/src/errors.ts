export type GlbFormatErrorCode =
  | "GLB_EMPTY"
  | "GLB_TRUNCATED"
  | "GLB_INVALID_MAGIC"
  | "GLB_UNSUPPORTED_VERSION"
  | "GLB_CHUNK_ALIGNMENT";

/**
 * Raised when a GLB container cannot be parsed. `code` is a stable, machine
 * readable identifier so callers can branch on the failure without matching
 * on human-readable message strings.
 */
export class GlbFormatError extends Error {
  readonly code: string;

  constructor(code: GlbFormatErrorCode, message: string) {
    super(message);
    this.name = "GlbFormatError";
    this.code = code;
  }
}
