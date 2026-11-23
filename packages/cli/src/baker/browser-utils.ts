import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import puppeteer from "puppeteer";

const MAC_CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Both `src/baker` and `dist/baker` sit two levels below the package root.
const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

/**
 * Returns Chromium launch arguments for headless SwiftShader WebGL2 rendering.
 * Only disables the Chromium sandbox in CI / Linux container environments or
 * when explicitly opted in via `PUPPETEER_NO_SANDBOX=1`.
 */
export function getSwiftShaderArgs(): string[] {
  const args = [
    "--disable-dev-shm-usage",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
  ];

  const needsNoSandbox =
    process.env.CI === "true" ||
    process.env.PUPPETEER_NO_SANDBOX === "1" ||
    process.platform === "linux";

  if (needsNoSandbox) {
    args.unshift("--no-sandbox", "--disable-setuid-sandbox");
  }

  return args;
}

/** Resolve a usable Chrome binary for local or CI environments. */
export function resolveExecutablePath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (process.platform === "darwin" && existsSync(MAC_CHROME_PATH)) {
    return MAC_CHROME_PATH;
  }
  try {
    const bundled = puppeteer.executablePath();
    if (bundled && existsSync(bundled)) return bundled;
  } catch {
    // Bundled browser was not downloaded.
  }
  return undefined;
}

/** Bundles an inline browser-side script with Three.js into an IIFE string. */
export async function bundleBrowserScript(
  contents: string,
  sourcefile: string
): Promise<string> {
  const result = await esbuild.build({
    stdin: {
      contents,
      resolveDir: PACKAGE_ROOT,
      sourcefile,
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2020",
    logLevel: "silent",
    nodePaths: [path.join(PACKAGE_ROOT, "node_modules")],
  });
  if (!result.outputFiles || result.outputFiles.length === 0) {
    throw new Error("esbuild produced no browser bundle");
  }
  return result.outputFiles[0].text;
}
