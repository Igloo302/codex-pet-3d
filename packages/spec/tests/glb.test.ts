import { describe, it, expect } from "vitest";
import { Document, WebIO } from "@gltf-transform/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseGlbHeader, inspectGlb } from "../src/glb";
import { GlbFormatError } from "../src/errors";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_TYPE_JSON = 0x4e4f534a;
const CHUNK_TYPE_BIN = 0x004e4942;

const STANDARD_CLIPS = [
  "Idle",
  "Run_Right",
  "Run_Left",
  "Wave",
  "Jump",
  "Failed",
  "Waiting",
  "Work",
  "Review",
];

const MODEL_PATH = resolve(__dirname, "../../../assets/cyber-cat/model.glb");

function readModel(): Uint8Array {
  return new Uint8Array(readFileSync(MODEL_PATH));
}

interface SyntheticChunk {
  /** Value written into the chunkLength field (may differ from actual bytes). */
  length: number;
  type: number;
  /** Number of payload bytes actually appended (defaults to `length`). */
  dataLength?: number;
}

/** Lays out a GLB container byte-for-byte without @gltf-transform/core. */
function buildGlb(options: {
  magic?: number;
  version?: number;
  declaredLength?: number;
  chunks: SyntheticChunk[];
}): Uint8Array {
  const dataLengths = options.chunks.map((chunk) => chunk.dataLength ?? chunk.length);
  const total = 12 + dataLengths.reduce((sum, n) => sum + 8 + n, 0);
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, options.magic ?? GLB_MAGIC, true);
  view.setUint32(4, options.version ?? GLB_VERSION, true);
  view.setUint32(8, options.declaredLength ?? total, true);

  let offset = 12;
  options.chunks.forEach((chunk, index) => {
    view.setUint32(offset, chunk.length, true);
    view.setUint32(offset + 4, chunk.type, true);
    offset += 8 + dataLengths[index];
  });
  return bytes;
}

function expectGlbFormatError(buffer: Uint8Array, code: string): void {
  let thrown: unknown;
  try {
    parseGlbHeader(buffer);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(GlbFormatError);
  expect((thrown as GlbFormatError).code).toBe(code);
}

/** Builds a GLB whose single primitive renders exactly `triangles` triangles. */
async function buildTriangleGlb(triangles: number): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc
    .createAccessor("POSITION")
    .setType("VEC3")
    .setArray(new Float32Array(triangles * 3 * 3))
    .setBuffer(buffer);
  const primitive = doc.createPrimitive().setAttribute("POSITION", position);
  const mesh = doc.createMesh("HighPoly").addPrimitive(primitive);
  doc.createScene("Scene").addChild(doc.createNode("MeshNode").setMesh(mesh));
  return await new WebIO().writeBinary(doc);
}

/** Builds a tiny GLB with one embedded image of the given bytes/mime type. */
async function buildImageGlb(image: Uint8Array, mimeType: string): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc
    .createAccessor("POSITION")
    .setType("VEC3")
    .setArray(new Float32Array(9))
    .setBuffer(buffer);
  const texture = doc.createTexture("Texture").setMimeType(mimeType).setImage(image);
  const primitive = doc
    .createPrimitive()
    .setAttribute("POSITION", position)
    .setMaterial(doc.createMaterial("Material").setBaseColorTexture(texture));
  const mesh = doc.createMesh("Mesh").addPrimitive(primitive);
  doc.createScene("Scene").addChild(doc.createNode("Node").setMesh(mesh));
  return await new WebIO().writeBinary(doc);
}

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

function jpegHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(41);
  bytes[0] = 0xff;
  bytes[1] = 0xd8; // SOI
  bytes[2] = 0xff;
  bytes[3] = 0xe0; // APP0
  bytes[4] = 0x00;
  bytes[5] = 0x10; // APP0 length = 16 (2 + 14 payload bytes 6..19)
  bytes[20] = 0xff;
  bytes[21] = 0xc0; // SOF0
  bytes[22] = 0x00;
  bytes[23] = 0x11; // SOF0 length = 17
  bytes[24] = 0x08; // precision
  const view = new DataView(bytes.buffer);
  view.setUint16(25, height, false);
  view.setUint16(27, width, false);
  bytes[29] = 0x03; // component count
  bytes[39] = 0xff;
  bytes[40] = 0xd9; // EOI
  return bytes;
}

function webpVp8xHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  const writeAscii = (value: string, offset: number) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  writeAscii("RIFF", 0);
  writeAscii("WEBP", 8);
  writeAscii("VP8X", 12);
  bytes[16] = 10; // VP8X chunk payload length
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  bytes[24] = widthMinusOne & 0xff;
  bytes[25] = (widthMinusOne >> 8) & 0xff;
  bytes[26] = (widthMinusOne >> 16) & 0xff;
  bytes[27] = heightMinusOne & 0xff;
  bytes[28] = (heightMinusOne >> 8) & 0xff;
  bytes[29] = (heightMinusOne >> 16) & 0xff;
  return bytes;
}

describe("parseGlbHeader", () => {
  it("rejects a 0-byte buffer (GLB_EMPTY)", () => {
    expectGlbFormatError(new Uint8Array(0), "GLB_EMPTY");
  });

  it("rejects a buffer shorter than the 12-byte header (GLB_TRUNCATED)", () => {
    expectGlbFormatError(new Uint8Array(8), "GLB_TRUNCATED");
  });

  it("rejects a buffer smaller than the declared length (GLB_TRUNCATED)", () => {
    expectGlbFormatError(readModel().slice(0, 16), "GLB_TRUNCATED");
  });

  it("rejects an invalid magic (GLB_INVALID_MAGIC)", () => {
    const glb = buildGlb({ magic: 0x12345678, chunks: [{ length: 8, type: CHUNK_TYPE_JSON }] });
    expectGlbFormatError(glb, "GLB_INVALID_MAGIC");
  });

  it("rejects an unsupported version (GLB_UNSUPPORTED_VERSION)", () => {
    const glb = buildGlb({ version: 1, chunks: [{ length: 8, type: CHUNK_TYPE_JSON }] });
    expectGlbFormatError(glb, "GLB_UNSUPPORTED_VERSION");
  });

  it("rejects a chunk length that is not 4-byte aligned (GLB_CHUNK_ALIGNMENT)", () => {
    const glb = buildGlb({ chunks: [{ length: 5, type: CHUNK_TYPE_JSON }] });
    expectGlbFormatError(glb, "GLB_CHUNK_ALIGNMENT");
  });

  it("rejects a chunk that overruns the declared length (GLB_CHUNK_ALIGNMENT)", () => {
    const glb = buildGlb({ chunks: [{ length: 40, type: CHUNK_TYPE_JSON, dataLength: 8 }] });
    expectGlbFormatError(glb, "GLB_CHUNK_ALIGNMENT");
  });

  it("routes JSON and BIN chunks correctly", () => {
    const glb = buildGlb({
      chunks: [
        { length: 8, type: CHUNK_TYPE_JSON },
        { length: 4, type: CHUNK_TYPE_BIN },
      ],
    });
    const header = parseGlbHeader(glb);
    expect(header.byteLength).toBe(glb.byteLength);
    expect(header.jsonChunk.byteLength).toBe(8);
    expect(header.binChunk?.byteLength).toBe(4);
  });

  it("returns the declared length and JSON/BIN chunk payloads for a valid GLB", () => {
    const bytes = readModel();
    const header = parseGlbHeader(bytes);
    expect(header.byteLength).toBe(bytes.byteLength);
    expect(header.jsonChunk.byteLength).toBeGreaterThan(0);
    expect(header.jsonChunk[0]).toBe(0x7b); // '{' — JSON chunk
    expect(header.binChunk).toBeDefined();
    expect(header.binChunk!.byteLength).toBeGreaterThan(0);
    expect(header.jsonChunk.byteLength % 4).toBe(0);
  });
});

describe("inspectGlb", () => {
  it("rejects a malformed container with GlbFormatError", async () => {
    await expect(inspectGlb(new Uint8Array(0))).rejects.toBeInstanceOf(GlbFormatError);
  });

  it("inspects the canonical sample model", async () => {
    const result = await inspectGlb(readModel());

    expect(result.clips).toEqual(expect.arrayContaining(STANDARD_CLIPS));
    expect(result.clips).toHaveLength(9);
    expect(result.bones).toContain("Head");
    expect(result.bones).toContain("Root");

    expect(result.vertexCount).toBe(8);
    expect(result.triangleCount).toBe(12);
    expect(result.maxTextureDimension).toBe(64);

    expect(result.vertexCount).toBeLessThanOrEqual(25000);
    expect(result.maxTextureDimension).toBeLessThanOrEqual(1024);
    expect(result.warnings).toEqual([]);
  });

  it("warns when the triangle count exceeds 10000", async () => {
    const result = await inspectGlb(await buildTriangleGlb(10001));
    expect(result.triangleCount).toBe(10001);
    expect(result.warnings).toContain("High triangle count: 10001 > 10000 recommended");
  });

  it("reads PNG, JPEG and WebP embedded texture dimensions", async () => {
    expect((await inspectGlb(await buildImageGlb(pngHeader(128, 64), "image/png"))).maxTextureDimension).toBe(128);
    expect((await inspectGlb(await buildImageGlb(jpegHeader(256, 128), "image/jpeg"))).maxTextureDimension).toBe(256);
    expect((await inspectGlb(await buildImageGlb(webpVp8xHeader(256, 128), "image/webp"))).maxTextureDimension).toBe(256);
  });
});
