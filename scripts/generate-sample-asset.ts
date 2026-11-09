/**
 * Procedurally builds the canonical `assets/cyber-cat/model.glb` with
 * @gltf-transform/core (pure JS — no Three.js GLTFExporter / DOM dependency).
 *
 * Generates an expressive, fully-rigged 3D low-poly Cyber Cat with:
 * - Cute kitten face (big anime cyan eyes, pink nose, :3 mouth, whiskers)
 * - White chest bib with cyber cyan collar & golden bell
 * - Triangular cat ears with pink inner cavities
 * - Front arms/paws with pink toe beans (rigged for waving and typing)
 * - Hind haunches & rear paws
 * - S-curved graceful cat tail
 * - Nine canonical animation clips
 *
 * Run: npx tsx scripts/generate-sample-asset.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const requireFromSpec = createRequire(new URL("../packages/spec/package.json", import.meta.url));
const { Document, NodeIO } = requireFromSpec("@gltf-transform/core");

const OUT_PATH = fileURLToPath(new URL("../assets/cyber-cat/model.glb", import.meta.url));

// --- CRC32 & PNG Chunk Helpers ---
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

/**
 * Creates a high-detail 256x256 RGBA PNG texture with:
 * - Cute anime/cyber cat face (sparkly big cyan eyes, pink nose, :3 mouth, whiskers)
 * - White chest bib with cyber cyan collar & golden bell
 * - Pink inner ears & pink paw pads (toe beans)
 * - Charcoal/slate sleek body fur
 */
function createCatTexture(size = 256): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowSize = size * 4 + 1;
  const raw = Buffer.alloc(rowSize * size);

  function setPixel(x: number, y: number, r: number, g: number, b: number, a = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const p = y * rowSize + 1 + x * 4;
    raw[p] = r;
    raw[p + 1] = g;
    raw[p + 2] = b;
    raw[p + 3] = a;
  }

  function fillRect(x0: number, y0: number, w: number, h: number, r: number, g: number, b: number) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        setPixel(x, y, r, g, b);
      }
    }
  }

  function fillCircle(cx: number, cy: number, radius: number, r: number, g: number, b: number) {
    const r2 = radius * radius;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 <= r2) {
          setPixel(x, y, r, g, b);
        }
      }
    }
  }

  function fillEllipse(cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d <= 1) {
          setPixel(x, y, r, g, b);
        }
      }
    }
  }

  for (let y = 0; y < size; y++) {
    raw[y * rowSize] = 0;
  }

  const COLOR_CHARCOAL = [38, 43, 54];
  const COLOR_WHITE = [246, 248, 252];
  const COLOR_PINK = [255, 138, 166];
  const COLOR_CYAN = [0, 240, 255];
  const COLOR_DEEP_CYAN = [0, 110, 220];
  const COLOR_PUPIL = [12, 16, 28];
  const COLOR_GOLD = [255, 215, 0];

  // Base quadrants
  fillRect(0, 0, 64, 128, COLOR_CHARCOAL[0], COLOR_CHARCOAL[1], COLOR_CHARCOAL[2]);
  fillRect(64, 0, 64, 128, COLOR_WHITE[0], COLOR_WHITE[1], COLOR_WHITE[2]);
  fillRect(128, 0, 64, 128, COLOR_PINK[0], COLOR_PINK[1], COLOR_PINK[2]);
  fillCircle(160, 64, 20, 255, 170, 190);

  // Paw Pads
  fillRect(192, 0, 64, 128, COLOR_WHITE[0], COLOR_WHITE[1], COLOR_WHITE[2]);
  fillCircle(224, 70, 14, COLOR_PINK[0], COLOR_PINK[1], COLOR_PINK[2]);
  fillCircle(218, 76, 10, COLOR_PINK[0], COLOR_PINK[1], COLOR_PINK[2]);
  fillCircle(230, 76, 10, COLOR_PINK[0], COLOR_PINK[1], COLOR_PINK[2]);
  fillCircle(210, 48, 6, COLOR_PINK[0], COLOR_PINK[1], COLOR_PINK[2]);
  fillCircle(224, 42, 6, COLOR_PINK[0], COLOR_PINK[1], COLOR_PINK[2]);
  fillCircle(238, 48, 6, COLOR_PINK[0], COLOR_PINK[1], COLOR_PINK[2]);

  // Chest Bib + Collar + Bell
  fillRect(128, 128, 128, 128, COLOR_CHARCOAL[0], COLOR_CHARCOAL[1], COLOR_CHARCOAL[2]);
  fillEllipse(192, 180, 48, 42, COLOR_WHITE[0], COLOR_WHITE[1], COLOR_WHITE[2]);
  fillRect(144, 228, 96, 14, COLOR_CYAN[0], COLOR_CYAN[1], COLOR_CYAN[2]);
  fillCircle(192, 226, 12, COLOR_GOLD[0], COLOR_GOLD[1], COLOR_GOLD[2]);
  fillCircle(192, 224, 4, 180, 140, 0);

  // Cat Face
  fillRect(0, 128, 128, 128, COLOR_CHARCOAL[0], COLOR_CHARCOAL[1], COLOR_CHARCOAL[2]);
  fillEllipse(64, 162, 34, 24, COLOR_WHITE[0], COLOR_WHITE[1], COLOR_WHITE[2]);

  // Pink Nose
  for (let dy = 0; dy <= 7; dy++) {
    const hw = Math.floor((7 - dy) * 0.9);
    for (let dx = -hw; dx <= hw; dx++) {
      setPixel(64 + dx, 172 - dy, COLOR_PINK[0], COLOR_PINK[1], COLOR_PINK[2]);
    }
  }

  // ':3' Mouth
  for (let t = 0; t <= 12; t++) {
    const rad = (t / 12) * Math.PI;
    const lx = Math.round(58 - Math.cos(rad) * 6);
    const ly = Math.round(157 - Math.sin(rad) * 4);
    setPixel(lx, ly, 80, 20, 35);
    setPixel(lx, ly - 1, 80, 20, 35);

    const rx = Math.round(70 + Math.cos(rad) * 6);
    const ry = Math.round(157 - Math.sin(rad) * 4);
    setPixel(rx, ry, 80, 20, 35);
    setPixel(rx, ry - 1, 80, 20, 35);
  }
  for (let y = 160; y <= 165; y++) {
    setPixel(64, y, 80, 20, 35);
  }

  function drawCatEye(cx: number, cy: number, isRight: boolean) {
    fillEllipse(cx, cy, 17, 19, 255, 255, 255);
    for (let y = cy - 16; y <= cy + 16; y++) {
      for (let x = cx - 14; x <= cx + 14; x++) {
        const d = ((x - cx) / 14) ** 2 + ((y - cy) / 16) ** 2;
        if (d <= 1.0) {
          const ratio = (y - (cy - 16)) / 32;
          const r = Math.round(COLOR_CYAN[0] * (1 - ratio * 0.5));
          const g = Math.round(COLOR_CYAN[1] * (1 - ratio * 0.4));
          const b = Math.round(COLOR_CYAN[2] * (1 - ratio * 0.15) + COLOR_DEEP_CYAN[2] * ratio * 0.8);
          setPixel(x, y, r, g, b);
        }
      }
    }
    fillEllipse(cx, cy, 5, 11, COLOR_PUPIL[0], COLOR_PUPIL[1], COLOR_PUPIL[2]);
    fillCircle(cx + (isRight ? 4 : 4), cy + 5, 4, 255, 255, 255);
    fillCircle(cx - 3, cy - 5, 2, 255, 255, 255);
    for (let dx = -16; dx <= 16; dx++) {
      const topY = Math.round(cy + 17 - (dx / 16) ** 2 * 6);
      setPixel(cx + dx, topY, 20, 25, 35);
      setPixel(cx + dx, topY + 1, 20, 25, 35);
    }
  }

  drawCatEye(40, 202, false);
  drawCatEye(88, 202, true);

  function drawLine(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number) {
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + (x1 - x0) * (i / steps));
      const y = Math.round(y0 + (y1 - y0) * (i / steps));
      setPixel(x, y, r, g, b);
    }
  }
  drawLine(34, 168, 6, 175, 250, 250, 255);
  drawLine(32, 163, 4, 163, 250, 250, 255);
  drawLine(34, 158, 8, 151, 250, 250, 255);
  drawLine(94, 168, 122, 175, 250, 250, 255);
  drawLine(96, 163, 124, 163, 250, 250, 255);
  drawLine(94, 158, 120, 151, 250, 250, 255);

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

interface MeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  joints: number[];
  weights: number[];
  indices: number[];
}

function createMeshData(): MeshData {
  return {
    positions: [],
    normals: [],
    uvs: [],
    joints: [],
    weights: [],
    indices: [],
  };
}

function addVertex(
  mesh: MeshData,
  pos: [number, number, number],
  norm: [number, number, number],
  uv: [number, number],
  joint: number,
  weight = 1.0
): number {
  const index = mesh.positions.length / 3;
  mesh.positions.push(...pos);
  mesh.normals.push(...norm);
  mesh.uvs.push(...uv);
  mesh.joints.push(joint, 0, 0, 0);
  mesh.weights.push(weight, 0, 0, 0);
  return index;
}

function addTriangle(mesh: MeshData, i0: number, i1: number, i2: number) {
  mesh.indices.push(i0, i1, i2);
}

function addQuad(mesh: MeshData, i0: number, i1: number, i2: number, i3: number) {
  mesh.indices.push(i0, i1, i2, i0, i2, i3);
}

const UV = {
  CHARCOAL: [0.12, 0.25] as [number, number],
  WHITE: [0.37, 0.25] as [number, number],
  PINK: [0.62, 0.25] as [number, number],
  PAW_PAD: [0.87, 0.25] as [number, number],
  CHEST: [0.75, 0.75] as [number, number],
};

function addBox(
  mesh: MeshData,
  center: [number, number, number],
  size: [number, number, number],
  joint: number,
  faceUvs?: {
    front?: [number, number, number, number];
    back?: [number, number];
    top?: [number, number];
    bottom?: [number, number];
    left?: [number, number];
    right?: [number, number];
  }
) {
  const [cx, cy, cz] = center;
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const defaultUv = faceUvs?.back ?? UV.CHARCOAL;

  // Front (+Z)
  if (faceUvs?.front) {
    const [u0, v0, u1, v1] = faceUvs.front;
    const v00 = addVertex(mesh, [cx - hx, cy - hy, cz + hz], [0, 0, 1], [u0, v0], joint);
    const v10 = addVertex(mesh, [cx + hx, cy - hy, cz + hz], [0, 0, 1], [u1, v0], joint);
    const v11 = addVertex(mesh, [cx + hx, cy + hy, cz + hz], [0, 0, 1], [u1, v1], joint);
    const v01 = addVertex(mesh, [cx - hx, cy + hy, cz + hz], [0, 0, 1], [u0, v1], joint);
    addQuad(mesh, v00, v10, v11, v01);
  } else {
    const uv = defaultUv;
    const v00 = addVertex(mesh, [cx - hx, cy - hy, cz + hz], [0, 0, 1], uv, joint);
    const v10 = addVertex(mesh, [cx + hx, cy - hy, cz + hz], [0, 0, 1], uv, joint);
    const v11 = addVertex(mesh, [cx + hx, cy + hy, cz + hz], [0, 0, 1], uv, joint);
    const v01 = addVertex(mesh, [cx - hx, cy + hy, cz + hz], [0, 0, 1], uv, joint);
    addQuad(mesh, v00, v10, v11, v01);
  }

  // Back (-Z)
  {
    const uv = faceUvs?.back ?? defaultUv;
    const v00 = addVertex(mesh, [cx + hx, cy - hy, cz - hz], [0, 0, -1], uv, joint);
    const v10 = addVertex(mesh, [cx - hx, cy - hy, cz - hz], [0, 0, -1], uv, joint);
    const v11 = addVertex(mesh, [cx - hx, cy + hy, cz - hz], [0, 0, -1], uv, joint);
    const v01 = addVertex(mesh, [cx + hx, cy + hy, cz - hz], [0, 0, -1], uv, joint);
    addQuad(mesh, v00, v10, v11, v01);
  }

  // Top (+Y)
  {
    const uv = faceUvs?.top ?? defaultUv;
    const v00 = addVertex(mesh, [cx - hx, cy + hy, cz + hz], [0, 1, 0], uv, joint);
    const v10 = addVertex(mesh, [cx + hx, cy + hy, cz + hz], [0, 1, 0], uv, joint);
    const v11 = addVertex(mesh, [cx + hx, cy + hy, cz - hz], [0, 1, 0], uv, joint);
    const v01 = addVertex(mesh, [cx - hx, cy + hy, cz - hz], [0, 1, 0], uv, joint);
    addQuad(mesh, v00, v10, v11, v01);
  }

  // Bottom (-Y)
  {
    const uv = faceUvs?.bottom ?? defaultUv;
    const v00 = addVertex(mesh, [cx - hx, cy - hy, cz - hz], [0, -1, 0], uv, joint);
    const v10 = addVertex(mesh, [cx + hx, cy - hy, cz - hz], [0, -1, 0], uv, joint);
    const v11 = addVertex(mesh, [cx + hx, cy - hy, cz + hz], [0, -1, 0], uv, joint);
    const v01 = addVertex(mesh, [cx - hx, cy - hy, cz + hz], [0, -1, 0], uv, joint);
    addQuad(mesh, v00, v10, v11, v01);
  }

  // Left (-X)
  {
    const uv = faceUvs?.left ?? defaultUv;
    const v00 = addVertex(mesh, [cx - hx, cy - hy, cz - hz], [-1, 0, 0], uv, joint);
    const v10 = addVertex(mesh, [cx - hx, cy - hy, cz + hz], [-1, 0, 0], uv, joint);
    const v11 = addVertex(mesh, [cx - hx, cy + hy, cz + hz], [-1, 0, 0], uv, joint);
    const v01 = addVertex(mesh, [cx - hx, cy + hy, cz - hz], [-1, 0, 0], uv, joint);
    addQuad(mesh, v00, v10, v11, v01);
  }

  // Right (+X)
  {
    const uv = faceUvs?.right ?? defaultUv;
    const v00 = addVertex(mesh, [cx + hx, cy - hy, cz + hz], [1, 0, 0], uv, joint);
    const v10 = addVertex(mesh, [cx + hx, cy - hy, cz - hz], [1, 0, 0], uv, joint);
    const v11 = addVertex(mesh, [cx + hx, cy + hy, cz - hz], [1, 0, 0], uv, joint);
    const v01 = addVertex(mesh, [cx + hx, cy + hy, cz + hz], [1, 0, 0], uv, joint);
    addQuad(mesh, v00, v10, v11, v01);
  }
}

function addCylinder(
  mesh: MeshData,
  p0: [number, number, number],
  p1: [number, number, number],
  r0: number,
  r1: number,
  segments: number,
  joint: number,
  uv: [number, number]
) {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const dz = p1[2] - p0[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return;

  const dir: [number, number, number] = [dx / len, dy / len, dz / len];
  let up: [number, number, number] = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const dot = dir[0] * up[0] + dir[1] * up[1] + dir[2] * up[2];
  up = [up[0] - dot * dir[0], up[1] - dot * dir[1], up[2] - dot * dir[2]];
  const upLen = Math.hypot(up[0], up[1], up[2]);
  up = [up[0] / upLen, up[1] / upLen, up[2] / upLen];
  const right: [number, number, number] = [
    dir[1] * up[2] - dir[2] * up[1],
    dir[2] * up[0] - dir[0] * up[2],
    dir[0] * up[1] - dir[1] * up[0],
  ];

  const ring0Indices: number[] = [];
  const ring1Indices: number[] = [];

  for (let s = 0; s < segments; s++) {
    const angle = (s / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const nx = right[0] * cos + up[0] * sin;
    const ny = right[1] * cos + up[1] * sin;
    const nz = right[2] * cos + up[2] * sin;

    const x0 = p0[0] + nx * r0;
    const y0 = p0[1] + ny * r0;
    const z0 = p0[2] + nz * r0;
    ring0Indices.push(addVertex(mesh, [x0, y0, z0], [nx, ny, nz], uv, joint));

    const x1 = p1[0] + nx * r1;
    const y1 = p1[1] + ny * r1;
    const z1 = p1[2] + nz * r1;
    ring1Indices.push(addVertex(mesh, [x1, y1, z1], [nx, ny, nz], uv, joint));
  }

  for (let s = 0; s < segments; s++) {
    const next = (s + 1) % segments;
    addQuad(mesh, ring0Indices[s], ring0Indices[next], ring1Indices[next], ring1Indices[s]);
  }
}

function addCatEar(
  mesh: MeshData,
  baseInner: [number, number, number],
  baseOuter: [number, number, number],
  baseBack: [number, number, number],
  tip: [number, number, number],
  joint: number
) {
  // Front face (pink)
  const vFront0 = addVertex(mesh, baseInner, [0, 0.4, 0.9], UV.PINK, joint);
  const vFront1 = addVertex(mesh, baseOuter, [0, 0.4, 0.9], UV.PINK, joint);
  const vFrontTip = addVertex(mesh, tip, [0, 0.4, 0.9], UV.PINK, joint);
  addTriangle(mesh, vFront0, vFront1, vFrontTip);

  // Back face (charcoal)
  const vBack0 = addVertex(mesh, baseOuter, [0, 0.2, -0.9], UV.CHARCOAL, joint);
  const vBack1 = addVertex(mesh, baseInner, [0, 0.2, -0.9], UV.CHARCOAL, joint);
  const vBackTip = addVertex(mesh, tip, [0, 0.2, -0.9], UV.CHARCOAL, joint);
  addTriangle(mesh, vBack0, vBack1, vBackTip);

  // Outer side
  const vSide0 = addVertex(mesh, baseOuter, [0.9, 0.2, 0], UV.CHARCOAL, joint);
  const vSide1 = addVertex(mesh, baseBack, [0.9, 0.2, 0], UV.CHARCOAL, joint);
  const vSideTip = addVertex(mesh, tip, [0.9, 0.2, 0], UV.CHARCOAL, joint);
  addTriangle(mesh, vSide0, vSide1, vSideTip);

  // Inner side
  const vIn0 = addVertex(mesh, baseBack, [-0.9, 0.2, 0], UV.CHARCOAL, joint);
  const vIn1 = addVertex(mesh, baseInner, [-0.9, 0.2, 0], UV.CHARCOAL, joint);
  const vInTip = addVertex(mesh, tip, [-0.9, 0.2, 0], UV.CHARCOAL, joint);
  addTriangle(mesh, vIn0, vIn1, vInTip);
}

async function main(): Promise<void> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const root = doc.getRoot();
  const scene = doc.createScene("CyberCat");
  root.setDefaultScene(scene);

  const accessor = (name: string, type: string, array: Float32Array | Uint16Array | Uint8Array, buf: unknown) =>
    doc.createAccessor(name).setType(type).setArray(array).setBuffer(buf);

  // Joints
  const rootJoint = doc.createNode("Root").setTranslation([0, 0, 0]);
  scene.addChild(rootJoint);

  const headJoint = doc.createNode("Head").setTranslation([0, 0.58, 0.06]);
  rootJoint.addChild(headJoint);

  const leftArmJoint = doc.createNode("LeftArm").setTranslation([-0.14, 0.36, 0.14]);
  rootJoint.addChild(leftArmJoint);

  const rightArmJoint = doc.createNode("RightArm").setTranslation([0.14, 0.36, 0.14]);
  rootJoint.addChild(rightArmJoint);

  const tailJoint = doc.createNode("Tail").setTranslation([0, 0.18, -0.20]);
  rootJoint.addChild(tailJoint);

  const skin = doc
    .createSkin("CyberCatSkin")
    .addJoint(rootJoint)
    .addJoint(headJoint)
    .addJoint(leftArmJoint)
    .addJoint(rightArmJoint)
    .addJoint(tailJoint)
    .setSkeleton(rootJoint);

  skin.setInverseBindMatrices(
    accessor(
      "InverseBindMatrices",
      "MAT4",
      new Float32Array([
        1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1,
        1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, -0.58, -0.06, 1,
        1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0.14, -0.36, -0.14, 1,
        1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  -0.14, -0.36, -0.14, 1,
        1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, -0.18, 0.20, 1,
      ]),
      buffer
    )
  );

  const meshData = createMeshData();

  // Torso
  addBox(meshData, [0, 0.28, -0.04], [0.44, 0.42, 0.46], 0, {
    front: [0.5, 0.5, 1.0, 1.0],
    top: UV.CHARCOAL,
    bottom: UV.CHARCOAL,
    back: UV.CHARCOAL,
    left: UV.CHARCOAL,
    right: UV.CHARCOAL,
  });

  // Head
  addBox(meshData, [0, 0.65, 0.08], [0.46, 0.38, 0.38], 1, {
    front: [0.0, 0.5, 0.5, 1.0],
    top: UV.CHARCOAL,
    bottom: UV.CHARCOAL,
    back: UV.CHARCOAL,
    left: UV.CHARCOAL,
    right: UV.CHARCOAL,
  });

  // 3D Muzzle
  addBox(meshData, [0, 0.58, 0.28], [0.16, 0.10, 0.08], 1, {
    front: UV.WHITE,
    top: UV.PINK,
    bottom: UV.WHITE,
    back: UV.WHITE,
    left: UV.WHITE,
    right: UV.WHITE,
  });

  // Ears
  addCatEar(meshData, [0.07, 0.82, 0.08], [0.21, 0.80, 0.05], [0.14, 0.80, 0.18], [0.18, 0.99, 0.08], 1);
  addCatEar(meshData, [-0.07, 0.82, 0.08], [-0.21, 0.80, 0.05], [-0.14, 0.80, 0.18], [-0.18, 0.99, 0.08], 1);

  // Front Left Arm & Paw
  addCylinder(meshData, [-0.14, 0.36, 0.14], [-0.14, 0.08, 0.18], 0.05, 0.045, 8, 2, UV.WHITE);
  addBox(meshData, [-0.14, 0.04, 0.20], [0.10, 0.08, 0.12], 2, {
    bottom: UV.PAW_PAD,
    front: UV.WHITE,
    top: UV.WHITE,
    back: UV.WHITE,
    left: UV.WHITE,
    right: UV.WHITE,
  });

  // Front Right Arm & Paw
  addCylinder(meshData, [0.14, 0.36, 0.14], [0.14, 0.08, 0.18], 0.05, 0.045, 8, 3, UV.WHITE);
  addBox(meshData, [0.14, 0.04, 0.20], [0.10, 0.08, 0.12], 3, {
    bottom: UV.PAW_PAD,
    front: UV.WHITE,
    top: UV.WHITE,
    back: UV.WHITE,
    left: UV.WHITE,
    right: UV.WHITE,
  });

  // Hind Legs
  addBox(meshData, [-0.20, 0.16, -0.08], [0.10, 0.18, 0.24], 0, {
    left: UV.CHARCOAL,
    front: UV.CHARCOAL,
    back: UV.CHARCOAL,
    top: UV.CHARCOAL,
    bottom: UV.CHARCOAL,
    right: UV.CHARCOAL,
  });
  addBox(meshData, [-0.18, 0.04, 0.06], [0.09, 0.07, 0.12], 0, {
    bottom: UV.PAW_PAD,
    front: UV.WHITE,
    top: UV.WHITE,
    back: UV.WHITE,
    left: UV.WHITE,
    right: UV.WHITE,
  });

  addBox(meshData, [0.20, 0.16, -0.08], [0.10, 0.18, 0.24], 0, {
    right: UV.CHARCOAL,
    front: UV.CHARCOAL,
    back: UV.CHARCOAL,
    top: UV.CHARCOAL,
    bottom: UV.CHARCOAL,
    left: UV.CHARCOAL,
  });
  addBox(meshData, [0.18, 0.04, 0.06], [0.09, 0.07, 0.12], 0, {
    bottom: UV.PAW_PAD,
    front: UV.WHITE,
    top: UV.WHITE,
    back: UV.WHITE,
    left: UV.WHITE,
    right: UV.WHITE,
  });

  // Tail
  const tailSegments = [
    { p: [0, 0.18, -0.20] as [number, number, number], r: 0.045, uv: UV.CHARCOAL },
    { p: [0, 0.24, -0.32] as [number, number, number], r: 0.042, uv: UV.CHARCOAL },
    { p: [0, 0.38, -0.42] as [number, number, number], r: 0.038, uv: UV.CHARCOAL },
    { p: [0, 0.54, -0.44] as [number, number, number], r: 0.034, uv: UV.CHARCOAL },
    { p: [0, 0.68, -0.38] as [number, number, number], r: 0.030, uv: UV.WHITE },
    { p: [0, 0.76, -0.30] as [number, number, number], r: 0.022, uv: UV.WHITE },
  ];
  for (let i = 0; i < tailSegments.length - 1; i++) {
    addCylinder(
      meshData,
      tailSegments[i].p,
      tailSegments[i + 1].p,
      tailSegments[i].r,
      tailSegments[i + 1].r,
      6,
      4,
      tailSegments[i + 1].uv
    );
  }

  const texture = doc
    .createTexture("CyberCatTexture")
    .setMimeType("image/png")
    .setImage(new Uint8Array(createCatTexture(256)));

  const material = doc
    .createMaterial("CyberCatMaterial")
    .setBaseColorTexture(texture)
    .setBaseColorFactor([1, 1, 1, 1])
    .setRoughnessFactor(0.8)
    .setMetallicFactor(0.1)
    .setDoubleSided(false);

  const primitive = doc
    .createPrimitive()
    .setAttribute("POSITION", accessor("POSITION", "VEC3", new Float32Array(meshData.positions), buffer))
    .setAttribute("NORMAL", accessor("NORMAL", "VEC3", new Float32Array(meshData.normals), buffer))
    .setAttribute("TEXCOORD_0", accessor("TEXCOORD_0", "VEC2", new Float32Array(meshData.uvs), buffer))
    .setAttribute("JOINTS_0", accessor("JOINTS_0", "VEC4", new Uint8Array(meshData.joints), buffer))
    .setAttribute("WEIGHTS_0", accessor("WEIGHTS_0", "VEC4", new Float32Array(meshData.weights), buffer))
    .setIndices(accessor("indices", "SCALAR", new Uint16Array(meshData.indices), buffer))
    .setMaterial(material);

  const catMesh = doc.createMesh("CyberCatMesh").addPrimitive(primitive);
  const catMeshNode = doc.createNode("CyberCatModel").setMesh(catMesh).setSkin(skin);
  scene.addChild(catMeshNode);

  // Animations
  function eulerToQuat(x: number, y: number, z: number): number[] {
    const c1 = Math.cos(x / 2);
    const c2 = Math.cos(y / 2);
    const c3 = Math.cos(z / 2);
    const s1 = Math.sin(x / 2);
    const s2 = Math.sin(y / 2);
    const s3 = Math.sin(z / 2);
    return [
      s1 * c2 * c3 + c1 * s2 * s3,
      c1 * s2 * c3 - s1 * c2 * s3,
      c1 * c2 * s3 + s1 * s2 * c3,
      c1 * c2 * c3 - s1 * s2 * s3,
    ];
  }

  function addChannel(
    anim: any,
    targetNode: any,
    targetPath: "translation" | "rotation" | "scale",
    times: number[],
    values: number[]
  ) {
    const inputAcc = accessor(`Input_${anim.getName()}_${targetPath}`, "SCALAR", new Float32Array(times), buffer);
    const type = targetPath === "rotation" ? "VEC4" : "VEC3";
    const outputAcc = accessor(`Output_${anim.getName()}_${targetPath}`, type, new Float32Array(values), buffer);
    const sampler = doc
      .createAnimationSampler()
      .setInput(inputAcc)
      .setOutput(outputAcc)
      .setInterpolation("LINEAR");
    const channel = doc
      .createAnimationChannel()
      .setTargetNode(targetNode)
      .setTargetPath(targetPath)
      .setSampler(sampler);
    anim.addSampler(sampler).addChannel(channel);
  }

  // 1. Idle
  {
    const anim = doc.createAnimation("Idle");
    addChannel(anim, rootJoint, "translation", [0, 1.0, 2.0], [0, 0, 0,  0, 0.015, 0,  0, 0, 0]);
    const tailQuats = [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0, 0.28, 0),
      ...eulerToQuat(0, -0.28, 0),
      ...eulerToQuat(0, 0, 0),
    ];
    addChannel(anim, tailJoint, "rotation", [0, 0.67, 1.33, 2.0], tailQuats);
  }

  // 2. Wave
  {
    const anim = doc.createAnimation("Wave");
    const waveQuats = [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(-1.7, 0, 0.35),
      ...eulerToQuat(-1.7, 0, -0.15),
      ...eulerToQuat(-1.7, 0, 0.35),
      ...eulerToQuat(-1.7, 0, -0.15),
      ...eulerToQuat(0, 0, 0),
    ];
    addChannel(anim, rightArmJoint, "rotation", [0, 0.3, 0.6, 0.9, 1.2, 1.5], waveQuats);
    const headQuats = [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0, 0, 0.15),
      ...eulerToQuat(0, 0, 0.15),
      ...eulerToQuat(0, 0, 0),
    ];
    addChannel(anim, headJoint, "rotation", [0, 0.3, 1.2, 1.5], headQuats);
    const tailQuats = [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0, 0.35, 0.2),
      ...eulerToQuat(0, -0.35, 0.2),
      ...eulerToQuat(0, 0, 0),
    ];
    addChannel(anim, tailJoint, "rotation", [0, 0.4, 0.8, 1.5], tailQuats);
  }

  // 3. Jump
  {
    const anim = doc.createAnimation("Jump");
    addChannel(
      anim,
      rootJoint,
      "translation",
      [0, 0.2, 0.5, 0.8, 1.0, 1.2],
      [0, 0, 0,  0, -0.06, 0,  0, 0.34, 0,  0, 0.30, 0,  0, -0.03, 0,  0, 0, 0]
    );
    const jumpArmQuats = [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0.3, 0, 0),
      ...eulerToQuat(-0.8, 0, 0),
      ...eulerToQuat(-0.6, 0, 0),
      ...eulerToQuat(0, 0, 0),
    ];
    addChannel(anim, leftArmJoint, "rotation", [0, 0.2, 0.5, 0.8, 1.2], jumpArmQuats);
    addChannel(anim, rightArmJoint, "rotation", [0, 0.2, 0.5, 0.8, 1.2], jumpArmQuats);
  }

  // 4. Run_Right
  {
    const anim = doc.createAnimation("Run_Right");
    addChannel(
      anim,
      rootJoint,
      "translation",
      [0, 0.2, 0.4, 0.6, 0.8],
      [0, 0, 0,  0, 0.04, 0,  0, 0, 0,  0, 0.04, 0,  0, 0, 0]
    );
    const leftArmSwing = [
      ...eulerToQuat(0.45, 0, 0),
      ...eulerToQuat(-0.45, 0, 0),
      ...eulerToQuat(0.45, 0, 0),
    ];
    const rightArmSwing = [
      ...eulerToQuat(-0.45, 0, 0),
      ...eulerToQuat(0.45, 0, 0),
      ...eulerToQuat(-0.45, 0, 0),
    ];
    addChannel(anim, leftArmJoint, "rotation", [0, 0.4, 0.8], leftArmSwing);
    addChannel(anim, rightArmJoint, "rotation", [0, 0.4, 0.8], rightArmSwing);
    const tailBounce = [
      ...eulerToQuat(0.2, 0.2, 0),
      ...eulerToQuat(0.2, -0.2, 0),
      ...eulerToQuat(0.2, 0.2, 0),
    ];
    addChannel(anim, tailJoint, "rotation", [0, 0.4, 0.8], tailBounce);
  }

  // 5. Run_Left
  {
    const anim = doc.createAnimation("Run_Left");
    addChannel(
      anim,
      rootJoint,
      "translation",
      [0, 0.2, 0.4, 0.6, 0.8],
      [0, 0, 0,  0, 0.04, 0,  0, 0, 0,  0, 0.04, 0,  0, 0, 0]
    );
    const leftArmSwing = [
      ...eulerToQuat(-0.45, 0, 0),
      ...eulerToQuat(0.45, 0, 0),
      ...eulerToQuat(-0.45, 0, 0),
    ];
    const rightArmSwing = [
      ...eulerToQuat(0.45, 0, 0),
      ...eulerToQuat(-0.45, 0, 0),
      ...eulerToQuat(0.45, 0, 0),
    ];
    addChannel(anim, leftArmJoint, "rotation", [0, 0.4, 0.8], leftArmSwing);
    addChannel(anim, rightArmJoint, "rotation", [0, 0.4, 0.8], rightArmSwing);
  }

  // 6. Work
  {
    const anim = doc.createAnimation("Work");
    const leftTyping = [
      ...eulerToQuat(-0.9, 0, -0.1),
      ...eulerToQuat(-0.6, 0, -0.1),
      ...eulerToQuat(-0.9, 0, -0.1),
    ];
    const rightTyping = [
      ...eulerToQuat(-0.6, 0, 0.1),
      ...eulerToQuat(-0.9, 0, 0.1),
      ...eulerToQuat(-0.6, 0, 0.1),
    ];
    addChannel(anim, leftArmJoint, "rotation", [0, 0.15, 0.3], leftTyping);
    addChannel(anim, rightArmJoint, "rotation", [0, 0.15, 0.3], rightTyping);
    const workHead = [
      ...eulerToQuat(0.08, 0, 0),
      ...eulerToQuat(0.03, 0, 0),
      ...eulerToQuat(0.08, 0, 0),
    ];
    addChannel(anim, headJoint, "rotation", [0, 0.15, 0.3], workHead);
  }

  // 7. Waiting
  {
    const anim = doc.createAnimation("Waiting");
    const waitHead = [
      ...eulerToQuat(0, 0, 0.22),
      ...eulerToQuat(0, 0, 0.22),
    ];
    addChannel(anim, headJoint, "rotation", [0, 2.0], waitHead);
    const waitTail = [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0, 0.4, 0),
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0, 0.4, 0),
      ...eulerToQuat(0, 0, 0),
    ];
    addChannel(anim, tailJoint, "rotation", [0, 0.3, 0.6, 0.9, 2.0], waitTail);
  }

  // 8. Review
  {
    const anim = doc.createAnimation("Review");
    const reviewHead = [
      ...eulerToQuat(0, 0.25, 0),
      ...eulerToQuat(0, -0.25, 0),
      ...eulerToQuat(0.18, 0, 0),
      ...eulerToQuat(-0.05, 0, 0),
      ...eulerToQuat(0.18, 0, 0),
      ...eulerToQuat(0, 0, 0),
    ];
    addChannel(anim, headJoint, "rotation", [0, 0.6, 1.0, 1.3, 1.5, 1.8], reviewHead);
    const reviewArm = [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(-1.2, 0, 0.2),
      ...eulerToQuat(-1.2, 0, 0.2),
      ...eulerToQuat(0, 0, 0),
    ];
    addChannel(anim, rightArmJoint, "rotation", [0, 0.4, 1.4, 1.8], reviewArm);
  }

  // 9. Failed
  {
    const anim = doc.createAnimation("Failed");
    const sadHead = [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0.38, 0, 0),
      ...eulerToQuat(0.35, 0, 0),
    ];
    addChannel(anim, headJoint, "rotation", [0, 0.6, 1.5], sadHead);
    addChannel(
      anim,
      rootJoint,
      "translation",
      [0, 0.6, 1.5],
      [0, 0, 0,  0, -0.04, 0,  0, -0.04, 0]
    );
    const sadTail = [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(-0.35, 0, 0),
      ...eulerToQuat(-0.35, 0, 0),
    ];
    addChannel(anim, tailJoint, "rotation", [0, 0.6, 1.5], sadTail);
  }

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
