/**
 * Procedurally builds the canonical `assets/cyber-cat/model.glb` with
 * @gltf-transform/core (pure JS — no Three.js GLTFExporter / DOM dependency).
 *
 * Run: npx tsx scripts/generate-sample-asset.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

// @gltf-transform/core is declared as a dependency of packages/spec. pnpm's
// isolated node_modules does not expose it at the repository root, so resolve
// it from the spec package instead of duplicating the declaration here.
const requireFromSpec = createRequire(new URL("../packages/spec/package.json", import.meta.url));
const { Document, NodeIO } = requireFromSpec("@gltf-transform/core");

const CLIP_NAMES = [
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

const OUT_PATH = fileURLToPath(new URL("../assets/cyber-cat/model.glb", import.meta.url));

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, Buffer.from(data)])), 0);
  return Buffer.concat([length, typeBytes, Buffer.from(data), crc]);
}

/** Generates a valid 64x64 RGBA PNG entirely from Node built-ins. */
function createTexturePng(size: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowSize = size * 4 + 1;
  const raw = Buffer.alloc(rowSize * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const p = rowStart + 1 + x * 4;
      const neon = ((x >> 3) + (y >> 3)) & 1;
      raw[p] = neon ? 0x2a : 0x8a;
      raw[p + 1] = neon ? 0xd0 : 0x2a;
      raw[p + 2] = neon ? 0xe0 : 0xd0;
      raw[p + 3] = 0xff;
    }
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

async function main(): Promise<void> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const root = doc.getRoot();
  const scene = doc.createScene("CyberCat");
  root.setDefaultScene(scene);

  const accessor = (name: string, type: string, array: Float32Array | Uint16Array | Uint8Array, buf: unknown) =>
    doc.createAccessor(name).setType(type).setArray(array).setBuffer(buf);

  // --- Skeleton: Root -> Head, both registered as skin joints -------------
  const rootJoint = doc.createNode("Root");
  const headJoint = doc.createNode("Head").setTranslation([0, 0.6, 0]);
  rootJoint.addChild(headJoint);
  scene.addChild(rootJoint);

  const skin = doc
    .createSkin("CyberCatSkin")
    .addJoint(rootJoint)
    .addJoint(headJoint)
    .setSkeleton(rootJoint);
  skin.setInverseBindMatrices(
    accessor(
      "InverseBindMatrices",
      "MAT4",
      new Float32Array([
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, // Root
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -0.6, 0, 1, // Head
      ]),
      buffer
    )
  );

  // --- Low-poly cube body --------------------------------------------------
  const positions = new Float32Array([
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
  ]);
  const uvs = new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
  ]);
  const indices = new Uint16Array([
    0, 2, 1, 0, 3, 2, // back
    4, 5, 6, 4, 6, 7, // front
    0, 4, 7, 0, 7, 3, // left
    1, 2, 6, 1, 6, 5, // right
    0, 1, 5, 0, 5, 4, // bottom
    3, 7, 6, 3, 6, 2, // top
  ]);

  // Skinning weights: upper vertices follow Head, lower vertices follow Root.
  const joints = new Uint8Array(8 * 4);
  const weights = new Float32Array(8 * 4);
  for (let i = 0; i < 8; i++) {
    joints[i * 4] = positions[i * 3 + 1] > 0 ? 1 : 0;
    weights[i * 4] = 1;
  }

  const texture = doc
    .createTexture("CyberPattern")
    .setMimeType("image/png")
    .setImage(new Uint8Array(createTexturePng(64)));

  const material = doc
    .createMaterial("CyberMaterial")
    .setBaseColorTexture(texture)
    .setBaseColorFactor([1, 1, 1, 1])
    .setDoubleSided(true);

  const primitive = doc
    .createPrimitive()
    .setAttribute("POSITION", accessor("POSITION", "VEC3", positions, buffer))
    .setAttribute("TEXCOORD_0", accessor("TEXCOORD_0", "VEC2", uvs, buffer))
    .setAttribute("JOINTS_0", accessor("JOINTS_0", "VEC4", joints, buffer))
    .setAttribute("WEIGHTS_0", accessor("WEIGHTS_0", "VEC4", weights, buffer))
    .setIndices(accessor("indices", "SCALAR", indices, buffer))
    .setMaterial(material);

  const mesh = doc.createMesh("CatBody").addPrimitive(primitive);
  scene.addChild(doc.createNode("CatBodyMesh").setMesh(mesh).setSkin(skin));

  // --- Nine standard animation clips --------------------------------------
  CLIP_NAMES.forEach((name, index) => {
    const times = new Float32Array([0, 0.5, 1]);
    const amplitude = 0.15 + (index / CLIP_NAMES.length) * 0.4;
    const quat = (angle: number): number[] => [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
    const rotations = new Float32Array([
      ...quat(-amplitude),
      ...quat(amplitude),
      ...quat(-amplitude),
    ]);
    const bounce = 0.05 + (index / CLIP_NAMES.length) * 0.15;
    const translations = new Float32Array([0, 0, 0, 0, bounce, 0, 0, 0, 0]);

    const input = accessor(`Input_${name}`, "SCALAR", times, buffer);
    const rotationOutput = accessor(`Rotation_${name}`, "VEC4", rotations, buffer);
    const translationOutput = accessor(`Translation_${name}`, "VEC3", translations, buffer);

    const rotationSampler = doc
      .createAnimationSampler()
      .setInput(input)
      .setOutput(rotationOutput)
      .setInterpolation("LINEAR");
    const translationSampler = doc
      .createAnimationSampler()
      .setInput(input)
      .setOutput(translationOutput)
      .setInterpolation("LINEAR");

    const rotationChannel = doc
      .createAnimationChannel()
      .setTargetNode(headJoint)
      .setTargetPath("rotation")
      .setSampler(rotationSampler);
    const translationChannel = doc
      .createAnimationChannel()
      .setTargetNode(rootJoint)
      .setTargetPath("translation")
      .setSampler(translationSampler);

    doc
      .createAnimation(name)
      .addSampler(rotationSampler)
      .addSampler(translationSampler)
      .addChannel(rotationChannel)
      .addChannel(translationChannel);
  });

  const io = new NodeIO();
  const glb = await io.writeBinary(doc);
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, glb);
  console.log(`Wrote ${OUT_PATH} (${glb.byteLength} bytes)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
