import { WebIO } from "@gltf-transform/core";
import type { Accessor, Primitive } from "@gltf-transform/core";
import { GlbFormatError } from "./errors.js";

const GLB_MAGIC = 0x46546c67; // "glTF" as a little-endian uint32
const GLB_VERSION = 2;
const GLB_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const CHUNK_TYPE_JSON = 0x4e4f534a; // "JSON"
const CHUNK_TYPE_BIN = 0x004e4942; // "BIN\0"

// glTF 2.0 primitive draw modes (§ 4.4.1.3). Only these produce triangles.
const MODE_TRIANGLES = 4;
const MODE_TRIANGLE_STRIP = 5;
const MODE_TRIANGLE_FAN = 6;

export interface GlbInspectionResult {
  vertexCount: number;
  triangleCount: number;
  clips: string[];
  bones: string[];
  maxTextureDimension: number;
  warnings: string[];
}

/**
 * Parses and validates the GLB container header/JSON/BIN chunks using only
 * Uint8Array and DataView, so the same code runs in Node, browsers and
 * Electron renderers (no Node `Buffer` dependency).
 *
 * Throws GlbFormatError for any structural violation.
 */
export function parseGlbHeader(buffer: Uint8Array): {
  byteLength: number;
  jsonChunk: Uint8Array;
  binChunk?: Uint8Array;
} {
  if (buffer.byteLength === 0) {
    throw new GlbFormatError("GLB_EMPTY", "GLB buffer is empty (0 bytes).");
  }
  if (buffer.byteLength < GLB_HEADER_BYTES) {
    throw new GlbFormatError(
      "GLB_TRUNCATED",
      `GLB buffer is ${buffer.byteLength} bytes; a header requires at least ${GLB_HEADER_BYTES} bytes.`
    );
  }

  // Respect byteOffset/byteLength so subarray views are parsed correctly.
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) {
    throw new GlbFormatError(
      "GLB_INVALID_MAGIC",
      `Invalid GLB magic 0x${magic.toString(16)}; expected 0x46546c67 ("glTF").`
    );
  }

  const version = view.getUint32(4, true);
  if (version !== GLB_VERSION) {
    throw new GlbFormatError(
      "GLB_UNSUPPORTED_VERSION",
      `Unsupported GLB version ${version}; expected ${GLB_VERSION}.`
    );
  }

  const byteLength = view.getUint32(8, true);
  if (buffer.byteLength < byteLength) {
    throw new GlbFormatError(
      "GLB_TRUNCATED",
      `GLB buffer is ${buffer.byteLength} bytes but the header declares ${byteLength} bytes.`
    );
  }

  let jsonChunk: Uint8Array = new Uint8Array(0);
  let binChunk: Uint8Array | undefined;

  let offset = GLB_HEADER_BYTES;
  while (offset + CHUNK_HEADER_BYTES <= byteLength) {
    if (offset % 4 !== 0) {
      throw new GlbFormatError(
        "GLB_CHUNK_ALIGNMENT",
        `Chunk at offset ${offset} is not 4-byte aligned.`
      );
    }

    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);

    if (chunkLength % 4 !== 0) {
      throw new GlbFormatError(
        "GLB_CHUNK_ALIGNMENT",
        `Chunk length ${chunkLength} at offset ${offset} is not 4-byte aligned.`
      );
    }
    if (offset + CHUNK_HEADER_BYTES + chunkLength > byteLength) {
      throw new GlbFormatError(
        "GLB_CHUNK_ALIGNMENT",
        `Chunk at offset ${offset} exceeds the declared GLB length ${byteLength}.`
      );
    }

    const data = buffer.subarray(
      offset + CHUNK_HEADER_BYTES,
      offset + CHUNK_HEADER_BYTES + chunkLength
    );
    if (chunkType === CHUNK_TYPE_JSON) {
      jsonChunk = data;
    } else if (chunkType === CHUNK_TYPE_BIN) {
      binChunk = data;
    }

    offset += CHUNK_HEADER_BYTES + chunkLength;
  }

  return { byteLength, jsonChunk, binChunk };
}

function countTriangles(primitive: Primitive): number {
  const mode = primitive.getMode();
  if (mode !== MODE_TRIANGLES && mode !== MODE_TRIANGLE_STRIP && mode !== MODE_TRIANGLE_FAN) {
    return 0;
  }

  const indices = primitive.getIndices();
  const position = primitive.getAttribute("POSITION");
  const elementCount = indices ? indices.getCount() : position ? position.getCount() : 0;

  if (mode === MODE_TRIANGLES) {
    return Math.floor(elementCount / 3);
  }
  // TRIANGLE_STRIP and TRIANGLE_FAN emit (count - 2) triangles.
  return elementCount >= 3 ? elementCount - 2 : 0;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let value = "";
  for (let i = 0; i < length; i++) {
    value += String.fromCharCode(bytes[start + i]);
  }
  return value;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

/** Reads width/height from a baseline JPEG by scanning for a SOF marker. */
function readJpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    // Standalone markers (no length payload): SOI, EOI, RSTn, TEM.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (segmentLength < 2) return null;

    // SOF0..SOF15, excluding DHT (0xC4), JPG (0xC8) and DAC (0xCC).
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      return { width, height };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

/** Reads width/height from VP8 / VP8L / VP8X WebP chunks. */
function readWebPSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fourCC = ascii(bytes, 12, 4);

  if (fourCC === "VP8X") {
    const width = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
    const height = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
    return { width, height };
  }
  if (fourCC === "VP8 ") {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  if (fourCC === "VP8L") {
    if (bytes[20] !== 0x2f) return null;
    const bits = view.getUint32(21, true);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

/** Extracts image dimensions from PNG / JPEG / WebP header bytes. */
function readImageSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (isPng(bytes)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // IHDR width/height are big-endian uint32 at offsets 16 and 20.
    return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
  }
  if (bytes.byteLength >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return readJpegSize(bytes);
  }
  if (bytes.byteLength >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return readWebPSize(bytes);
  }
  return null;
}

/**
 * Inspects a GLB asset: counts vertices/triangles, lists animation clips and
 * skin joint names, and finds the largest embedded texture dimension.
 *
 * Header validation is performed first so malformed containers consistently
 * fail with GlbFormatError before any document parsing is attempted.
 */
export async function inspectGlb(data: Uint8Array): Promise<GlbInspectionResult> {
  parseGlbHeader(data);

  const io = new WebIO();
  const document = await io.readBinary(data);
  const root = document.getRoot();

  const positionAccessors = new Set<Accessor>();
  let triangleCount = 0;
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute("POSITION");
      if (position) positionAccessors.add(position);
      triangleCount += countTriangles(primitive);
    }
  }
  let vertexCount = 0;
  for (const accessor of positionAccessors) {
    vertexCount += accessor.getCount();
  }

  const clips = root.listAnimations().map((animation) => animation.getName());

  const boneNames = new Set<string>();
  for (const skin of root.listSkins()) {
    for (const joint of skin.listJoints()) {
      boneNames.add(joint.getName());
    }
  }

  let maxTextureDimension = 0;
  for (const texture of root.listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const size = readImageSize(image);
    if (!size) continue;
    maxTextureDimension = Math.max(maxTextureDimension, size.width, size.height);
  }

  const warnings: string[] = [];
  if (triangleCount > 10000) {
    warnings.push(`High triangle count: ${triangleCount} > 10000 recommended`);
  }

  return {
    vertexCount,
    triangleCount,
    clips,
    bones: [...boneNames],
    maxTextureDimension,
    warnings,
  };
}
