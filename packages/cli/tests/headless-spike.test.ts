import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderHeadlessFrame } from "../src/baker/headless-spike";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = resolve(HERE, "../../../assets/cyber-cat/model.glb");

const WIDTH = 192;
const HEIGHT = 208;

describe("renderHeadlessFrame", () => {
  it("renders the cyber-cat GLB to a transparent RGBA frame", async () => {
    const glbBytes = new Uint8Array(readFileSync(MODEL_PATH));
    const result = await renderHeadlessFrame(glbBytes, WIDTH, HEIGHT);

    expect(result.data.byteLength).toBe(WIDTH * HEIGHT * 4);
    expect(result.width).toBe(WIDTH);
    expect(result.height).toBe(HEIGHT);
    expect(result.hasAlpha).toBe(true);

    let opaquePixels = 0;
    let transparentPixels = 0;
    for (let i = 3; i < result.data.length; i += 4) {
      if (result.data[i] > 0) opaquePixels++;
      else transparentPixels++;
    }
    expect(opaquePixels).toBeGreaterThan(50);
    expect(transparentPixels).toBeGreaterThan(0);
  });
});
