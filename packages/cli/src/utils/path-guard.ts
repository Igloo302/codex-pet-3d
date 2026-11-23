import { isAbsolute, relative, resolve } from "node:path";

export class PathTraversalError extends Error {
  readonly code = "PATH_TRAVERSAL";

  constructor(message: string) {
    super(message);
    this.name = "PathTraversalError";
  }
}

/**
 * Resolves `candidate` under `baseDir` and ensures the result stays strictly
 * inside `baseDir`, preventing path traversal (`..`, absolute paths, null bytes).
 */
export function resolveSafeSubpath(baseDir: string, candidate: string): string {
  if (!candidate || candidate.includes("\0")) {
    throw new PathTraversalError(`Invalid relative path: "${candidate}"`);
  }
  const resolvedBase = resolve(baseDir);
  const resolvedTarget = resolve(resolvedBase, candidate);
  const rel = relative(resolvedBase, resolvedTarget);
  if (rel === "" || rel === ".." || rel.startsWith("..") || isAbsolute(rel)) {
    throw new PathTraversalError(
      `Path "${candidate}" escapes base directory "${baseDir}"`
    );
  }
  return resolvedTarget;
}
