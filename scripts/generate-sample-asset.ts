/**
 * Procedurally sculpts the canonical `assets/cyber-cat/model.glb` with
 * @gltf-transform/core (pure JS — no Three.js GLTFExporter / DOM dependency).
 *
 * Crafts a stylized, semi-realistic 3D Cyber Cat with rich silhouette, smooth
 * organic shading, and multi-material PBR lighting response:
 * - Sculpted organic head with chubby cheeks, brow ridge, whisker puffs, and 3D nose
 * - Glossy layered 3D anime-realistic cyan eyes with radial iris depth & catchlights
 * - Curved 3D cat ears with recessed soft pink inner cavities & ear tufts
 * - 3D whiskers, pear-shaped plush body with sculpted chest fur ruff
 * - Glowing cyber-cyan collar with lustrous metallic 3D golden bell
 * - Tapered organic arms & plump paws with sculpted toes and 3D pink toe beans
 * - Plump sitting haunches, rear paws, and graceful S-curved fluffy tail
 * - 5 PBR materials (velvety fur, glossy eyes, soft pink, metallic gold, cyber emissive)
 * - Nine canonical skeletal animation clips (Root, Head, LeftArm, RightArm, Tail)
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

type Vec3 = [number, number, number];
type Vec2 = [number, number];

// ============================================================================
// 1. Procedural PNG Encoding Helpers
// ============================================================================

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

function encodePngRgba(width: number, height: number, pixels: Uint8Array): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowSize = width * 4 + 1;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowSize] = 0; // filter type 0
    raw.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * rowSize + 1);
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Deterministic pseudo-noise for subtle painterly fur grain */
function furGrain(x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/**
 * 512x512 Painterly Stylized Fur Atlas:
 * - Left half (u in [0, 0.5]): Rich slate-navy tuxedo fur with subtle soft
 *   vertical hair streaks, gentle tabby forehead/back stripes, and warm cream
 *   underbelly/cheek blush accents.
 * - Right half (u in [0.5, 1.0]): Soft warm snow-white plush fur (chest bib,
 *   muzzle puffs, mittens, tail tip) with subtle ambient occlusion shading.
 *
 * UV mapping convention for sculpted parts:
 *   - Dark fur parts use u in [0.02, 0.48], v in [0.02, 0.98] (v=0 bottom AO, v=1 top highlight)
 *   - White fur parts use u in [0.52, 0.98], v in [0.02, 0.98]
 *   - Head uses dark fur atlas with subtle blush & forehead cyber-tabby stripes
 */
function createFurTexture(size = 512): Buffer {
  const pixels = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const v = 1 - y / (size - 1); // v=1 top, v=0 bottom
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const idx = (y * size + x) * 4;

      // Directional fine fur brush strokes
      const strand =
        Math.sin(x * 0.45 + Math.sin(y * 0.08) * 2.5) * 0.5 +
        furGrain(Math.floor(x / 2), Math.floor(y / 6)) * 0.5;

      // Soft vertical AO + top light bounce baked subtly into albedo
      const verticalShade = lerp(0.84, 1.08, smoothstep(0.0, 0.92, v));

      let r: number;
      let g: number;
      let b: number;

      if (u < 0.5) {
        // Sleek bluish-charcoal tuxedo cat fur with velvety depth
        const lu = u * 2; // 0..1 within dark quadrant
        const stripe =
          smoothstep(0.7, 1.0, v) *
          Math.pow(Math.abs(Math.sin((lu - 0.5) * Math.PI * 5)), 3) *
          0.12;
        const baseR = lerp(42, 64, v) - stripe * 18 + strand * 4.5;
        const baseG = lerp(47, 72, v) - stripe * 16 + strand * 4.8;
        const baseB = lerp(62, 92, v) - stripe * 10 + strand * 5.5;

        // Subtle rosy cheek blush zone near u ~ 0.25, v ~ 0.35
        const blushDist = Math.hypot((lu - 0.5) * 2.0, (v - 0.34) * 2.4);
        const blush = (1 - smoothstep(0.0, 0.42, blushDist)) * 0.14;

        r = lerp(baseR * verticalShade, 235, blush);
        g = lerp(baseG * verticalShade, 130, blush);
        b = lerp(baseB * verticalShade, 155, blush);
      } else {
        // Warm cream-white plush fur (chest bib, muzzle puffs, paws, tail tip)
        const warmTint = lerp(0.92, 1.0, v);
        r = (244 * warmTint + strand * 3.5) * lerp(0.9, 1.02, v);
        g = (246 * warmTint + strand * 3.5) * lerp(0.9, 1.02, v);
        b = (252 * warmTint + strand * 3.0) * lerp(0.92, 1.02, v);
      }

      pixels[idx] = Math.max(0, Math.min(255, Math.round(r)));
      pixels[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      pixels[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      pixels[idx + 3] = 255;
    }
  }

  return encodePngRgba(size, size, pixels);
}

/**
 * 512x512 Glossy Anime-Realistic Cat Eye Texture:
 * Centered at (0.5, 0.5) for spherical frontal UV projection:
 * - Soft warm sclera ring
 * - Deep sapphire outer limbal ring
 * - Luminous turquoise-to-electric-cyan radial iris with fine fiber striations
 * - Crisp cat-like vertical oval pupil
 * - Dual bright specular catchlights (upper-right main star + lower-left bounce)
 */
function createEyeTexture(size = 512): Buffer {
  const pixels = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const ny = (y / (size - 1)) * 2 - 1; // -1 top, +1 bottom
    for (let x = 0; x < size; x++) {
      const nx = (x / (size - 1)) * 2 - 1;
      const idx = (y * size + x) * 4;

      const dist = Math.hypot(nx, ny);
      const angle = Math.atan2(ny, nx);

      let r = 248;
      let g = 250;
      let b = 255;

      // Subtle sclera shadow at top of eyeball (eyelid AO)
      const topShadow = smoothstep(-0.2, -0.9, ny) * 0.22;
      r *= 1 - topShadow;
      g *= 1 - topShadow;
      b *= 1 - topShadow * 0.6;

      if (dist < 0.72) {
        // Iris region
        const irisT = clamp01(dist / 0.72);
        const fibers =
          0.5 +
          0.5 * Math.sin(angle * 36 + Math.sin(angle * 7) * 1.4) * 0.6 +
          0.2 * Math.sin(angle * 64);

        // Rich gradient: deep ocean top -> glowing electric cyan lower crescent
        const lowerGlow = smoothstep(-0.15, 0.75, ny);
        const innerR = lerp(0, 65, lowerGlow);
        const innerG = lerp(165, 248, lowerGlow);
        const innerB = lerp(235, 255, lowerGlow);

        const outerR = 8;
        const outerG = 42;
        const outerB = 96;

        // Limbal dark ring at outer edge of iris
        const limbal = smoothstep(0.76, 0.98, irisT);
        r = lerp(innerR, outerR, limbal * 0.85) + fibers * 18 * (1 - limbal);
        g = lerp(innerG, outerG, limbal * 0.85) + fibers * 26 * (1 - limbal);
        b = lerp(innerB, outerB, limbal * 0.75) + fibers * 20 * (1 - limbal);

        // Upper iris shadow under eyelid for expressive depth
        const upperShade = smoothstep(0.15, -0.65, ny) * 0.45;
        r *= 1 - upperShade;
        g *= 1 - upperShade * 0.75;
        b *= 1 - upperShade * 0.45;

        // Vertical oval cat pupil
        const pupilDist = Math.hypot(nx / 0.21, ny / 0.36);
        if (pupilDist < 1.0) {
          const edge = smoothstep(0.84, 1.0, pupilDist);
          r = lerp(10, r, edge);
          g = lerp(14, g, edge);
          b = lerp(26, b, edge);
        }

        // Primary upper-right glossy catchlight
        const hl1 = Math.hypot((nx - 0.22) / 0.16, (ny + 0.24) / 0.14);
        if (hl1 < 1.0) {
          const a = 1 - smoothstep(0.55, 1.0, hl1);
          r = lerp(r, 255, a);
          g = lerp(g, 255, a);
          b = lerp(b, 255, a);
        }

        // Secondary lower-left bounce highlight
        const hl2 = Math.hypot((nx + 0.22) / 0.085, (ny - 0.25) / 0.075);
        if (hl2 < 1.0) {
          const a = (1 - smoothstep(0.4, 1.0, hl2)) * 0.9;
          r = lerp(r, 210, a);
          g = lerp(g, 252, a);
          b = lerp(b, 255, a);
        }
      }

      pixels[idx] = Math.max(0, Math.min(255, Math.round(r)));
      pixels[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      pixels[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      pixels[idx + 3] = 255;
    }
  }

  return encodePngRgba(size, size, pixels);
}

// ============================================================================
// 2. Smooth Sculpting Mesh Builder (Multi-Material Primitives)
// ============================================================================

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

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function addVertex(
  mesh: MeshData,
  pos: Vec3,
  norm: Vec3,
  uv: Vec2,
  joint: number,
  weight = 1.0
): number {
  const index = mesh.positions.length / 3;
  const n = normalize3(norm);
  mesh.positions.push(pos[0], pos[1], pos[2]);
  mesh.normals.push(n[0], n[1], n[2]);
  mesh.uvs.push(uv[0], uv[1]);
  mesh.joints.push(joint, 0, 0, 0);
  mesh.weights.push(weight, 0, 0, 0);
  return index;
}

/**
 * Adds a smooth sculpted ellipsoid/sphere with optional organic deformation callback.
 * Computes smooth vertex normals directly from the deformed surface via finite differences.
 */
function addSculptedSphere(
  mesh: MeshData,
  opts: {
    center: Vec3;
    radii: Vec3;
    uSegments: number;
    vSegments: number;
    joint: number;
    uvRange?: [number, number, number, number]; // [u0, u1, v0, v1]
    frontalEyeUv?: boolean;
    deform?: (unitDir: Vec3, localPos: Vec3) => Vec3;
  }
): void {
  const { center, radii, uSegments, vSegments, joint, deform, frontalEyeUv } = opts;
  const [u0, u1, v0, v1] = opts.uvRange ?? [0.02, 0.48, 0.02, 0.98];

  const evalPoint = (theta: number, phi: number): Vec3 => {
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const dir: Vec3 = [sinPhi * sinTheta, cosPhi, sinPhi * cosTheta];
    const base: Vec3 = [dir[0] * radii[0], dir[1] * radii[1], dir[2] * radii[2]];
    const p = deform ? deform(dir, base) : base;
    return [center[0] + p[0], center[1] + p[1], center[2] + p[2]];
  };

  const evalNormal = (theta: number, phi: number): Vec3 => {
    const eps = 1e-3;
    const p0 = evalPoint(theta, Math.max(1e-4, Math.min(Math.PI - 1e-4, phi)));
    const pTheta = evalPoint(theta + eps, Math.max(1e-4, Math.min(Math.PI - 1e-4, phi)));
    const pPhi = evalPoint(theta, Math.min(Math.PI - 1e-4, phi + eps));
    const tU: Vec3 = [pTheta[0] - p0[0], pTheta[1] - p0[1], pTheta[2] - p0[2]];
    const tV: Vec3 = [pPhi[0] - p0[0], pPhi[1] - p0[1], pPhi[2] - p0[2]];
    // Cross product tV x tU points outward
    const nx = tV[1] * tU[2] - tV[2] * tU[1];
    const ny = tV[2] * tU[0] - tV[0] * tU[2];
    const nz = tV[0] * tU[1] - tV[1] * tU[0];
    if (Math.hypot(nx, ny, nz) < 1e-8) {
      return [Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)];
    }
    return normalize3([nx, ny, nz]);
  };

  const grid: number[][] = [];
  for (let iv = 0; iv <= vSegments; iv++) {
    const row: number[] = [];
    const vf = iv / vSegments;
    const phi = vf * Math.PI;
    for (let iu = 0; iu <= uSegments; iu++) {
      const uf = iu / uSegments;
      const theta = uf * Math.PI * 2;
      const pos = evalPoint(theta, phi);
      const norm = evalNormal(theta, phi);

      let uv: Vec2;
      if (frontalEyeUv) {
        // Project +Z hemisphere cleanly onto the eye iris texture
        const lx = (pos[0] - center[0]) / (radii[0] || 1);
        const ly = (pos[1] - center[1]) / (radii[1] || 1);
        uv = [0.5 + lx * 0.48, 0.5 - ly * 0.48];
      } else {
        uv = [lerp(u0, u1, uf), lerp(v1, v0, vf)];
      }
      row.push(addVertex(mesh, pos, norm, uv, joint));
    }
    grid.push(row);
  }

  for (let iv = 0; iv < vSegments; iv++) {
    for (let iu = 0; iu < uSegments; iu++) {
      const a = grid[iv][iu];
      const b = grid[iv + 1][iu];
      const c = grid[iv + 1][iu + 1];
      const d = grid[iv][iu + 1];
      mesh.indices.push(a, b, d);
      mesh.indices.push(b, c, d);
    }
  }
}

/**
 * Adds a smooth swept organic tube along a 3D spine with per-point radius (for tail, limbs, whiskers, collar).
 */
function addSweptTube(
  mesh: MeshData,
  spine: Array<{ p: Vec3; r: number; uv?: Vec2 }>,
  radialSegments: number,
  joint: number,
  opts?: { closedLoop?: boolean; capStart?: boolean; capEnd?: boolean; uvRange?: [number, number, number, number] }
): void {
  const closed = opts?.closedLoop ?? false;
  const [u0, u1, v0, v1] = opts?.uvRange ?? [0.02, 0.48, 0.02, 0.98];
  const n = spine.length;
  if (n < 2) return;

  const rings: number[][] = [];
  for (let i = 0; i < n; i++) {
    const prev = spine[closed ? (i - 1 + n) % n : Math.max(0, i - 1)].p;
    const next = spine[closed ? (i + 1) % n : Math.min(n - 1, i + 1)].p;
    const tangent = normalize3([next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]]);

    const refUp: Vec3 = Math.abs(tangent[1]) < 0.92 ? [0, 1, 0] : [1, 0, 0];
    const right = normalize3([
      tangent[1] * refUp[2] - tangent[2] * refUp[1],
      tangent[2] * refUp[0] - tangent[0] * refUp[2],
      tangent[0] * refUp[1] - tangent[1] * refUp[0],
    ]);
    const up = normalize3([
      right[1] * tangent[2] - right[2] * tangent[1],
      right[2] * tangent[0] - right[0] * tangent[2],
      right[0] * tangent[1] - right[1] * tangent[0],
    ]);

    const ring: number[] = [];
    const { p, r } = spine[i];
    const vf = i / (n - 1);
    for (let s = 0; s <= radialSegments; s++) {
      const angle = (s / radialSegments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const norm: Vec3 = [
        right[0] * cos + up[0] * sin,
        right[1] * cos + up[1] * sin,
        right[2] * cos + up[2] * sin,
      ];
      const pos: Vec3 = [p[0] + norm[0] * r, p[1] + norm[1] * r, p[2] + norm[2] * r];
      const uv: Vec2 = spine[i].uv ?? [lerp(u0, u1, s / radialSegments), lerp(v0, v1, vf)];
      ring.push(addVertex(mesh, pos, norm, uv, joint));
    }
    rings.push(ring);
  }

  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const r0 = rings[i];
    const r1 = rings[(i + 1) % n];
    for (let s = 0; s < radialSegments; s++) {
      mesh.indices.push(r0[s], r0[s + 1], r1[s + 1]);
      mesh.indices.push(r0[s], r1[s + 1], r1[s]);
    }
  }

  if (opts?.capStart && !closed) {
    const p = spine[0].p;
    const next = spine[1].p;
    const capNorm = normalize3([p[0] - next[0], p[1] - next[1], p[2] - next[2]]);
    const centerIdx = addVertex(mesh, p, capNorm, spine[0].uv ?? [u0, v0], joint);
    const r0 = rings[0];
    for (let s = 0; s < radialSegments; s++) {
      mesh.indices.push(centerIdx, r0[s + 1], r0[s]);
    }
  }
  if (opts?.capEnd && !closed) {
    const p = spine[n - 1].p;
    const prev = spine[n - 2].p;
    const capNorm = normalize3([p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]]);
    const centerIdx = addVertex(mesh, p, capNorm, spine[n - 1].uv ?? [u1, v1], joint);
    const rEnd = rings[n - 1];
    for (let s = 0; s < radialSegments; s++) {
      mesh.indices.push(centerIdx, rEnd[s], rEnd[s + 1]);
    }
  }
}

/**
 * Adds a sculpted curved 3D cat ear (outer dark fur shell + recessed pink inner ear cavity).
 */
function addSculptedCatEar(
  furMesh: MeshData,
  pinkMesh: MeshData,
  side: -1 | 1,
  joint: number
): void {
  const rings = 5;
  const radial = 10;

  // Outer ear curved cone-shell
  const outerGrid: number[][] = [];
  for (let ir = 0; ir <= rings; ir++) {
    const t = ir / rings; // 0 = base, 1 = rounded tip
    const row: number[] = [];

    const cx = side * lerp(0.145, 0.215, Math.pow(t, 0.85));
    const cy = lerp(0.79, 1.045, t);
    const cz = lerp(0.06, 0.085, t) - Math.sin(t * Math.PI) * 0.015;

    const rx = lerp(0.092, 0.012, Math.pow(t, 0.9));
    const rz = lerp(0.072, 0.01, Math.pow(t, 0.9));

    for (let s = 0; s <= radial; s++) {
      const a = (s / radial) * Math.PI * 2;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      // Slightly flatten front face (+Z) of ear
      const zScale = sinA > 0 ? 0.55 : 1.05;
      const lx = cosA * rx;
      const lz = sinA * rz * zScale;

      // Tilt ear slightly outward
      const tilt = side * -0.22;
      const wx = cx + lx * Math.cos(tilt);
      const wy = cy + lx * Math.sin(tilt);
      const wz = cz + lz;

      const norm = normalize3([cosA, 0.25 + t * 0.4, sinA * zScale]);
      const uv: Vec2 = [lerp(0.04, 0.45, s / radial), lerp(0.55, 0.96, t)];
      row.push(addVertex(furMesh, [wx, wy, wz], norm, uv, joint));
    }
    outerGrid.push(row);
  }

  for (let ir = 0; ir < rings; ir++) {
    for (let s = 0; s < radial; s++) {
      const a = outerGrid[ir][s];
      const b = outerGrid[ir][s + 1];
      const c = outerGrid[ir + 1][s + 1];
      const d = outerGrid[ir + 1][s];
      furMesh.indices.push(a, b, c);
      furMesh.indices.push(a, c, d);
    }
  }

  // Soft pink inner ear cushion nested on the front face
  addSculptedSphere(pinkMesh, {
    center: [side * 0.168, 0.895, 0.105],
    radii: [0.048, 0.088, 0.022],
    uSegments: 10,
    vSegments: 8,
    joint,
    deform: (dir, p) => {
      // Taper into a cute triangular leaf shape
      const topTaper = dir[1] > 0 ? 1 - dir[1] * 0.62 : 1.0;
      const tilt = side * 0.22;
      const tx = p[0] * topTaper;
      const ty = p[1];
      return [
        tx * Math.cos(tilt) - ty * Math.sin(tilt),
        tx * Math.sin(tilt) + ty * Math.cos(tilt),
        p[2] * (dir[2] > 0 ? 0.6 : 1.0),
      ];
    },
  });
}

// ============================================================================
// 3. Build Complete GLB Document
// ============================================================================

async function main(): Promise<void> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const root = doc.getRoot();
  const scene = doc.createScene("CyberCat");
  root.setDefaultScene(scene);

  const accessor = (name: string, type: string, array: Float32Array | Uint16Array | Uint8Array) =>
    doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);

  // --- Skeleton Joints (same canonical hierarchy & names) ---
  const rootJoint = doc.createNode("Root").setTranslation([0, 0, 0]);
  scene.addChild(rootJoint);

  const headJoint = doc.createNode("Head").setTranslation([0, 0.56, 0.06]);
  rootJoint.addChild(headJoint);

  const leftArmJoint = doc.createNode("LeftArm").setTranslation([-0.15, 0.36, 0.13]);
  rootJoint.addChild(leftArmJoint);

  const rightArmJoint = doc.createNode("RightArm").setTranslation([0.15, 0.36, 0.13]);
  rootJoint.addChild(rightArmJoint);

  const tailJoint = doc.createNode("Tail").setTranslation([0, 0.18, -0.22]);
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
        1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, -0.56, -0.06, 1,
        1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0.15, -0.36, -0.13, 1,
        1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  -0.15, -0.36, -0.13, 1,
        1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, -0.18, 0.22, 1,
      ])
    )
  );

  // --- Separate MeshData per PBR Material ---
  const furMesh = createMeshData();
  const eyeMesh = createMeshData();
  const pinkMesh = createMeshData();
  const goldMesh = createMeshData();
  const cyberMesh = createMeshData();

  const DARK_UV: [number, number, number, number] = [0.02, 0.48, 0.04, 0.96];
  const WHITE_UV: [number, number, number, number] = [0.54, 0.96, 0.04, 0.96];

  // --------------------------------------------------------------------------
  // TORSO (Joint 0: Root)
  // --------------------------------------------------------------------------
  addSculptedSphere(furMesh, {
    center: [0, 0.27, -0.02],
    radii: [0.225, 0.255, 0.24],
    uSegments: 20,
    vSegments: 14,
    joint: 0,
    uvRange: DARK_UV,
    deform: (dir, p) => {
      // Pear-shaped sitting kitten torso: fuller lower belly, narrower shoulders
      const pear = lerp(1.12, 0.82, smoothstep(-0.8, 0.85, dir[1]));
      const flatBottom = dir[1] < -0.65 ? lerp(1.0, 0.78, (-dir[1] - 0.65) / 0.35) : 1.0;
      return [p[0] * pear, p[1] * flatBottom, p[2] * pear];
    },
  });

  // Plush White Chest Bib + Fluffy Fur Ruff Tufts
  addSculptedSphere(furMesh, {
    center: [0, 0.31, 0.145],
    radii: [0.135, 0.155, 0.09],
    uSegments: 14,
    vSegments: 10,
    joint: 0,
    uvRange: WHITE_UV,
    deform: (dir, p) => {
      const heart = dir[1] < 0 ? 1 - Math.abs(dir[1]) * 0.32 : 1.0;
      return [p[0] * heart, p[1], p[2]];
    },
  });
  // Three soft chest fur-tuft teardrops
  for (const tuft of [
    { x: 0, y: 0.35, z: 0.22, rx: 0.045, ry: 0.06, rz: 0.032 },
    { x: -0.055, y: 0.37, z: 0.205, rx: 0.038, ry: 0.052, rz: 0.028 },
    { x: 0.055, y: 0.37, z: 0.205, rx: 0.038, ry: 0.052, rz: 0.028 },
  ]) {
    addSculptedSphere(furMesh, {
      center: [tuft.x, tuft.y, tuft.z],
      radii: [tuft.rx, tuft.ry, tuft.rz],
      uSegments: 8,
      vSegments: 6,
      joint: 0,
      uvRange: WHITE_UV,
    });
  }

  // --------------------------------------------------------------------------
  // CYBER COLLAR & METALLIC GOLDEN BELL (Joint 0: Root)
  // --------------------------------------------------------------------------
  const collarPoints: Array<{ p: Vec3; r: number }> = [];
  const collarSegs = 20;
  for (let i = 0; i < collarSegs; i++) {
    const a = (i / collarSegs) * Math.PI * 2;
    collarPoints.push({
      p: [Math.sin(a) * 0.175, 0.465 - Math.cos(a) * 0.028, 0.035 + Math.cos(a) * 0.165],
      r: 0.024,
    });
  }
  addSweptTube(cyberMesh, collarPoints, 8, 0, { closedLoop: true });

  // Metallic Golden Bell hanging at front of collar
  addSculptedSphere(goldMesh, {
    center: [0, 0.405, 0.225],
    radii: [0.042, 0.042, 0.042],
    uSegments: 14,
    vSegments: 10,
    joint: 0,
  });
  // Bell decorative equatorial rim
  const bellRim: Array<{ p: Vec3; r: number }> = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    bellRim.push({
      p: [Math.sin(a) * 0.043, 0.405, 0.225 + Math.cos(a) * 0.043],
      r: 0.006,
    });
  }
  addSweptTube(goldMesh, bellRim, 5, 0, { closedLoop: true });

  // --------------------------------------------------------------------------
  // SCULPTED HEAD (Joint 1: Head)
  // --------------------------------------------------------------------------
  addSculptedSphere(furMesh, {
    center: [0, 0.68, 0.075],
    radii: [0.255, 0.22, 0.225],
    uSegments: 24,
    vSegments: 16,
    joint: 1,
    uvRange: DARK_UV,
    deform: (dir, p) => {
      // Adorable stylized kitten head: chubby lower cheeks, gentle brow, tapered chin
      const cheekPuff =
        smoothstep(-0.55, 0.05, dir[1]) * (1 - smoothstep(0.05, 0.55, dir[1])) * 0.12;
      const chinTaper = dir[1] < -0.35 ? 1 - (-dir[1] - 0.35) * 0.22 : 1.0;
      const frontBrow = dir[2] > 0.3 && dir[1] > 0.15 ? 0.015 : 0;
      return [
        p[0] * (1 + cheekPuff) * chinTaper,
        p[1],
        p[2] + frontBrow,
      ];
    },
  });

  // Fluffy cheek fur tufts on both sides of the face
  for (const side of [-1, 1] as const) {
    addSculptedSphere(furMesh, {
      center: [side * 0.245, 0.625, 0.095],
      radii: [0.058, 0.042, 0.045],
      uSegments: 10,
      vSegments: 8,
      joint: 1,
      uvRange: DARK_UV,
    });
    addSculptedSphere(furMesh, {
      center: [side * 0.225, 0.585, 0.115],
      radii: [0.048, 0.036, 0.038],
      uSegments: 10,
      vSegments: 8,
      joint: 1,
      uvRange: WHITE_UV,
    });
  }

  // Sculpted White Muzzle Whisker Puffs (':3' twin cushions) + Chin
  for (const side of [-1, 1] as const) {
    addSculptedSphere(furMesh, {
      center: [side * 0.044, 0.595, 0.278],
      radii: [0.056, 0.044, 0.046],
      uSegments: 14,
      vSegments: 10,
      joint: 1,
      uvRange: WHITE_UV,
    });
  }
  addSculptedSphere(furMesh, {
    center: [0, 0.562, 0.262],
    radii: [0.055, 0.034, 0.042],
    uSegments: 12,
    vSegments: 10,
    joint: 1,
    uvRange: WHITE_UV,
  });

  // Cute 3D Soft-Pink Cat Nose
  addSculptedSphere(pinkMesh, {
    center: [0, 0.626, 0.312],
    radii: [0.027, 0.02, 0.019],
    uSegments: 12,
    vSegments: 10,
    joint: 1,
    deform: (dir, p) => {
      // Inverted rounded triangle cat nose
      const narrowBottom = dir[1] < 0 ? 1 + dir[1] * 0.45 : 1.05;
      return [p[0] * narrowBottom, p[1], p[2]];
    },
  });

  // Glossy Layered 3D Eyes + Curved Eyelash Rims (Left & Right)
  for (const side of [-1, 1] as const) {
    const ex = side * 0.102;
    const ey = 0.688;
    const ez = 0.258;

    // Glossy spherical eyeball with frontal iris UV mapping
    addSculptedSphere(eyeMesh, {
      center: [ex, ey, ez],
      radii: [0.062, 0.066, 0.042],
      uSegments: 14,
      vSegments: 10,
      joint: 1,
      frontalEyeUv: true,
    });

    // Sculpted upper eyelash / brow arc framing the eye
    const lashPts: Array<{ p: Vec3; r: number }> = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const a = lerp(-0.85, 0.95, t);
      lashPts.push({
        p: [
          ex + side * Math.sin(a) * 0.068,
          ey + Math.cos(a) * 0.062 + 0.008,
          ez + 0.022 + Math.cos(a) * 0.012,
        ],
        r: lerp(0.007, 0.012, Math.sin(t * Math.PI)),
      });
    }
    addSweptTube(furMesh, lashPts, 6, 1, { capStart: true, capEnd: true, uvRange: DARK_UV });
  }

  // Subtle glowing cyber-brow diamond gem on forehead
  addSculptedSphere(cyberMesh, {
    center: [0, 0.785, 0.268],
    radii: [0.022, 0.032, 0.012],
    uSegments: 10,
    vSegments: 8,
    joint: 1,
  });

  // Sculpted 3D Cat Ears (Left & Right)
  addSculptedCatEar(furMesh, pinkMesh, -1, 1);
  addSculptedCatEar(furMesh, pinkMesh, 1, 1);

  // 3D Tapered Whiskers (3 per cheek)
  for (const side of [-1, 1] as const) {
    const whiskerAngles = [0.16, 0.0, -0.18];
    for (let w = 0; w < 3; w++) {
      const dy = whiskerAngles[w];
      addSweptTube(
        furMesh,
        [
          { p: [side * 0.085, 0.602 + dy * 0.06, 0.295], r: 0.0045 },
          { p: [side * 0.195, 0.608 + dy * 0.12, 0.285], r: 0.003 },
          { p: [side * 0.295, 0.596 + dy * 0.19, 0.255], r: 0.0014 },
        ],
        5,
        1,
        { capEnd: true, uvRange: WHITE_UV }
      );
    }
  }

  // --------------------------------------------------------------------------
  // FRONT ARMS & PAWS WITH SCULPTED TOES + TOE BEANS (Joints 2 & 3)
  // --------------------------------------------------------------------------
  for (const { side, joint } of [
    { side: -1 as const, joint: 2 },
    { side: 1 as const, joint: 3 },
  ]) {
    // Smooth tapered arm
    addSweptTube(
      furMesh,
      [
        { p: [side * 0.15, 0.365, 0.125], r: 0.062 },
        { p: [side * 0.152, 0.24, 0.155], r: 0.054 },
        { p: [side * 0.148, 0.125, 0.18], r: 0.048 },
        { p: [side * 0.145, 0.07, 0.195], r: 0.046 },
      ],
      12,
      joint,
      { capStart: true, capEnd: true, uvRange: DARK_UV }
    );

    // Plump white mitten paw
    addSculptedSphere(furMesh, {
      center: [side * 0.145, 0.05, 0.22],
      radii: [0.056, 0.044, 0.068],
      uSegments: 14,
      vSegments: 10,
      joint,
      uvRange: WHITE_UV,
    });

    // 3 sculpted rounded toes + 3D pink toe beans
    for (const toeOffset of [-0.028, 0, 0.028]) {
      addSculptedSphere(furMesh, {
        center: [side * 0.145 + toeOffset, 0.036, 0.272],
        radii: [0.02, 0.022, 0.024],
        uSegments: 8,
        vSegments: 6,
        joint,
        uvRange: WHITE_UV,
      });
      addSculptedSphere(pinkMesh, {
        center: [side * 0.145 + toeOffset, 0.015, 0.258],
        radii: [0.012, 0.008, 0.012],
        uSegments: 6,
        vSegments: 5,
        joint,
      });
    }
    // Main pink metacarpal paw pad
    addSculptedSphere(pinkMesh, {
      center: [side * 0.145, 0.014, 0.22],
      radii: [0.024, 0.009, 0.022],
      uSegments: 8,
      vSegments: 6,
      joint,
    });
  }

  // --------------------------------------------------------------------------
  // HIND HAUNCHES & REAR PAWS (Joint 0: Root)
  // --------------------------------------------------------------------------
  for (const side of [-1, 1] as const) {
    // Plump sitting thigh/haunch
    addSculptedSphere(furMesh, {
      center: [side * 0.195, 0.155, -0.045],
      radii: [0.095, 0.125, 0.145],
      uSegments: 12,
      vSegments: 10,
      joint: 0,
      uvRange: DARK_UV,
    });

    // Cute white rear paw tucked beside body
    addSculptedSphere(furMesh, {
      center: [side * 0.205, 0.045, 0.075],
      radii: [0.054, 0.04, 0.072],
      uSegments: 10,
      vSegments: 8,
      joint: 0,
      uvRange: WHITE_UV,
    });
    addSculptedSphere(pinkMesh, {
      center: [side * 0.205, 0.012, 0.085],
      radii: [0.024, 0.008, 0.024],
      uSegments: 8,
      vSegments: 6,
      joint: 0,
    });
  }

  // --------------------------------------------------------------------------
  // GRACEFUL S-CURVED FLUFFY TAIL (Joint 4: Tail)
  // --------------------------------------------------------------------------
  const tailSpine: Array<{ p: Vec3; r: number; uv?: Vec2 }> = [
    { p: [0, 0.175, -0.21], r: 0.046, uv: [0.25, 0.2] },
    { p: [0, 0.205, -0.31], r: 0.048, uv: [0.25, 0.35] },
    { p: [0.01, 0.285, -0.40], r: 0.052, uv: [0.25, 0.5] },
    { p: [0.015, 0.40, -0.45], r: 0.054, uv: [0.25, 0.65] },
    { p: [0.01, 0.525, -0.455], r: 0.050, uv: [0.25, 0.78] },
    { p: [0, 0.64, -0.415], r: 0.046, uv: [0.75, 0.85] },
    { p: [0, 0.73, -0.345], r: 0.038, uv: [0.75, 0.92] },
    { p: [0, 0.785, -0.28], r: 0.024, uv: [0.75, 0.96] },
  ];
  addSweptTube(furMesh, tailSpine, 12, 4, { capStart: true, capEnd: true });
  // Soft rounded fluffy white tail tip
  addSculptedSphere(furMesh, {
    center: [0, 0.79, -0.275],
    radii: [0.03, 0.03, 0.03],
    uSegments: 10,
    vSegments: 8,
    joint: 4,
    uvRange: WHITE_UV,
  });

  // --------------------------------------------------------------------------
  // PBR MATERIALS & TEXTURES
  // --------------------------------------------------------------------------
  const furTexture = doc
    .createTexture("CyberCatFurTexture")
    .setMimeType("image/png")
    .setImage(new Uint8Array(createFurTexture(512)));

  const eyeTexture = doc
    .createTexture("CyberCatEyeTexture")
    .setMimeType("image/png")
    .setImage(new Uint8Array(createEyeTexture(512)));

  const furMaterial = doc
    .createMaterial("VelvetFurMaterial")
    .setBaseColorTexture(furTexture)
    .setBaseColorFactor([1, 1, 1, 1])
    .setRoughnessFactor(0.78)
    .setMetallicFactor(0.0)
    .setDoubleSided(false);

  const eyeMaterial = doc
    .createMaterial("GlossyEyeMaterial")
    .setBaseColorTexture(eyeTexture)
    .setBaseColorFactor([1, 1, 1, 1])
    .setEmissiveTexture(eyeTexture)
    .setEmissiveFactor([0.14, 0.22, 0.28])
    .setRoughnessFactor(0.05)
    .setMetallicFactor(0.05)
    .setDoubleSided(false);

  const pinkMaterial = doc
    .createMaterial("SoftPinkMaterial")
    .setBaseColorFactor([0.98, 0.56, 0.68, 1.0])
    .setRoughnessFactor(0.45)
    .setMetallicFactor(0.0)
    .setDoubleSided(false);

  const goldMaterial = doc
    .createMaterial("MetallicGoldBellMaterial")
    .setBaseColorFactor([1.0, 0.82, 0.26, 1.0])
    .setRoughnessFactor(0.18)
    .setMetallicFactor(0.92)
    .setDoubleSided(false);

  const cyberMaterial = doc
    .createMaterial("CyberNeonMaterial")
    .setBaseColorFactor([0.08, 0.88, 1.0, 1.0])
    .setEmissiveFactor([0.0, 0.65, 0.92])
    .setRoughnessFactor(0.22)
    .setMetallicFactor(0.35)
    .setDoubleSided(false);

  function buildPrimitive(name: string, data: MeshData, material: unknown) {
    return doc
      .createPrimitive()
      .setAttribute("POSITION", accessor(`${name}_POS`, "VEC3", new Float32Array(data.positions)))
      .setAttribute("NORMAL", accessor(`${name}_NRM`, "VEC3", new Float32Array(data.normals)))
      .setAttribute("TEXCOORD_0", accessor(`${name}_UV`, "VEC2", new Float32Array(data.uvs)))
      .setAttribute("JOINTS_0", accessor(`${name}_JNT`, "VEC4", new Uint8Array(data.joints)))
      .setAttribute("WEIGHTS_0", accessor(`${name}_WGT`, "VEC4", new Float32Array(data.weights)))
      .setIndices(accessor(`${name}_IDX`, "SCALAR", new Uint16Array(data.indices)))
      .setMaterial(material);
  }

  const catMesh = doc
    .createMesh("CyberCatMesh")
    .addPrimitive(buildPrimitive("Fur", furMesh, furMaterial))
    .addPrimitive(buildPrimitive("Eyes", eyeMesh, eyeMaterial))
    .addPrimitive(buildPrimitive("Pink", pinkMesh, pinkMaterial))
    .addPrimitive(buildPrimitive("Gold", goldMesh, goldMaterial))
    .addPrimitive(buildPrimitive("Cyber", cyberMesh, cyberMaterial));

  const catMeshNode = doc.createNode("CyberCatModel").setMesh(catMesh).setSkin(skin);
  scene.addChild(catMeshNode);

  // --------------------------------------------------------------------------
  // NINE CANONICAL ANIMATIONS
  // --------------------------------------------------------------------------
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
    const inputAcc = accessor(`Input_${anim.getName()}_${targetPath}`, "SCALAR", new Float32Array(times));
    const type = targetPath === "rotation" ? "VEC4" : "VEC3";
    const outputAcc = accessor(`Output_${anim.getName()}_${targetPath}`, type, new Float32Array(values));
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

  // 1. Idle (gentle breathing & graceful tail sway)
  {
    const anim = doc.createAnimation("Idle");
    addChannel(anim, rootJoint, "translation", [0, 1.0, 2.0], [0, 0, 0,  0, 0.018, 0,  0, 0, 0]);
    addChannel(
      anim,
      tailJoint,
      "rotation",
      [0, 0.67, 1.33, 2.0],
      [...eulerToQuat(0, 0, 0), ...eulerToQuat(0, 0.3, 0), ...eulerToQuat(0, -0.3, 0), ...eulerToQuat(0, 0, 0)]
    );
  }

  // 2. Wave
  {
    const anim = doc.createAnimation("Wave");
    addChannel(
      anim,
      rightArmJoint,
      "rotation",
      [0, 0.3, 0.6, 0.9, 1.2, 1.5],
      [
        ...eulerToQuat(0, 0, 0),
        ...eulerToQuat(-1.7, 0, 0.35),
        ...eulerToQuat(-1.7, 0, -0.15),
        ...eulerToQuat(-1.7, 0, 0.35),
        ...eulerToQuat(-1.7, 0, -0.15),
        ...eulerToQuat(0, 0, 0),
      ]
    );
    addChannel(
      anim,
      headJoint,
      "rotation",
      [0, 0.3, 1.2, 1.5],
      [...eulerToQuat(0, 0, 0), ...eulerToQuat(0, 0, 0.16), ...eulerToQuat(0, 0, 0.16), ...eulerToQuat(0, 0, 0)]
    );
    addChannel(
      anim,
      tailJoint,
      "rotation",
      [0, 0.4, 0.8, 1.5],
      [...eulerToQuat(0, 0, 0), ...eulerToQuat(0, 0.38, 0.2), ...eulerToQuat(0, -0.38, 0.2), ...eulerToQuat(0, 0, 0)]
    );
  }

  // 3. Jump
  {
    const anim = doc.createAnimation("Jump");
    addChannel(
      anim,
      rootJoint,
      "translation",
      [0, 0.2, 0.5, 0.8, 1.0, 1.2],
      [0, 0, 0,  0, -0.05, 0,  0, 0.32, 0,  0, 0.28, 0,  0, -0.03, 0,  0, 0, 0]
    );
    const jumpArms = [
      ...eulerToQuat(0, 0, 0),
      ...eulerToQuat(0.28, 0, 0),
      ...eulerToQuat(-0.85, 0, 0),
      ...eulerToQuat(-0.6, 0, 0),
      ...eulerToQuat(0, 0, 0),
    ];
    addChannel(anim, leftArmJoint, "rotation", [0, 0.2, 0.5, 0.8, 1.2], jumpArms);
    addChannel(anim, rightArmJoint, "rotation", [0, 0.2, 0.5, 0.8, 1.2], jumpArms);
  }

  // 4. Run_Right
  {
    const anim = doc.createAnimation("Run_Right");
    addChannel(
      anim,
      rootJoint,
      "translation",
      [0, 0.2, 0.4, 0.6, 0.8],
      [0, 0, 0,  0, 0.045, 0,  0, 0, 0,  0, 0.045, 0,  0, 0, 0]
    );
    addChannel(
      anim,
      leftArmJoint,
      "rotation",
      [0, 0.4, 0.8],
      [...eulerToQuat(0.45, 0, 0), ...eulerToQuat(-0.45, 0, 0), ...eulerToQuat(0.45, 0, 0)]
    );
    addChannel(
      anim,
      rightArmJoint,
      "rotation",
      [0, 0.4, 0.8],
      [...eulerToQuat(-0.45, 0, 0), ...eulerToQuat(0.45, 0, 0), ...eulerToQuat(-0.45, 0, 0)]
    );
    addChannel(
      anim,
      tailJoint,
      "rotation",
      [0, 0.4, 0.8],
      [...eulerToQuat(0.2, 0.22, 0), ...eulerToQuat(0.2, -0.22, 0), ...eulerToQuat(0.2, 0.22, 0)]
    );
  }

  // 5. Run_Left
  {
    const anim = doc.createAnimation("Run_Left");
    addChannel(
      anim,
      rootJoint,
      "translation",
      [0, 0.2, 0.4, 0.6, 0.8],
      [0, 0, 0,  0, 0.045, 0,  0, 0, 0,  0, 0.045, 0,  0, 0, 0]
    );
    addChannel(
      anim,
      leftArmJoint,
      "rotation",
      [0, 0.4, 0.8],
      [...eulerToQuat(-0.45, 0, 0), ...eulerToQuat(0.45, 0, 0), ...eulerToQuat(-0.45, 0, 0)]
    );
    addChannel(
      anim,
      rightArmJoint,
      "rotation",
      [0, 0.4, 0.8],
      [...eulerToQuat(0.45, 0, 0), ...eulerToQuat(-0.45, 0, 0), ...eulerToQuat(0.45, 0, 0)]
    );
  }

  // 6. Work (enthusiastic typing paws)
  {
    const anim = doc.createAnimation("Work");
    addChannel(
      anim,
      leftArmJoint,
      "rotation",
      [0, 0.2, 0.4, 0.6, 0.8],
      [
        ...eulerToQuat(-0.8, 0, 0),
        ...eulerToQuat(-0.5, 0, 0),
        ...eulerToQuat(-0.85, 0, 0),
        ...eulerToQuat(-0.5, 0, 0),
        ...eulerToQuat(-0.8, 0, 0),
      ]
    );
    addChannel(
      anim,
      rightArmJoint,
      "rotation",
      [0, 0.2, 0.4, 0.6, 0.8],
      [
        ...eulerToQuat(-0.5, 0, 0),
        ...eulerToQuat(-0.85, 0, 0),
        ...eulerToQuat(-0.5, 0, 0),
        ...eulerToQuat(-0.85, 0, 0),
        ...eulerToQuat(-0.5, 0, 0),
      ]
    );
    addChannel(
      anim,
      headJoint,
      "rotation",
      [0, 0.4, 0.8],
      [...eulerToQuat(0.14, 0, 0), ...eulerToQuat(0.22, 0, 0), ...eulerToQuat(0.14, 0, 0)]
    );
  }

  // 7. Waiting (curious head tilt + gentle tail twitch)
  {
    const anim = doc.createAnimation("Waiting");
    addChannel(
      anim,
      headJoint,
      "rotation",
      [0, 0.8, 1.6, 2.4],
      [...eulerToQuat(0, 0, 0), ...eulerToQuat(0, 0, 0.22), ...eulerToQuat(0, 0, -0.22), ...eulerToQuat(0, 0, 0)]
    );
    addChannel(
      anim,
      tailJoint,
      "rotation",
      [0, 1.2, 2.4],
      [...eulerToQuat(0, -0.2, 0), ...eulerToQuat(0, 0.2, 0), ...eulerToQuat(0, -0.2, 0)]
    );
  }

  // 8. Review (focused nod & scan)
  {
    const anim = doc.createAnimation("Review");
    addChannel(
      anim,
      headJoint,
      "rotation",
      [0, 0.5, 1.0, 1.5, 2.0],
      [
        ...eulerToQuat(0.06, -0.18, 0),
        ...eulerToQuat(0.12, 0.18, 0),
        ...eulerToQuat(0.06, -0.12, 0),
        ...eulerToQuat(0.16, 0.0, 0),
        ...eulerToQuat(0.06, -0.18, 0),
      ]
    );
    addChannel(
      anim,
      rightArmJoint,
      "rotation",
      [0, 1.0, 2.0],
      [...eulerToQuat(-0.45, 0, -0.15), ...eulerToQuat(-0.55, 0, -0.15), ...eulerToQuat(-0.45, 0, -0.15)]
    );
  }

  // 9. Failed (droopy ears/head & slumped posture)
  {
    const anim = doc.createAnimation("Failed");
    addChannel(
      anim,
      rootJoint,
      "translation",
      [0, 0.5, 1.0, 1.5],
      [0, 0, 0,  0, -0.04, 0,  0, -0.04, 0,  0, 0, 0]
    );
    addChannel(
      anim,
      headJoint,
      "rotation",
      [0, 0.4, 1.1, 1.5],
      [...eulerToQuat(0, 0, 0), ...eulerToQuat(0.35, 0, 0.12), ...eulerToQuat(0.35, 0, -0.12), ...eulerToQuat(0, 0, 0)]
    );
    addChannel(
      anim,
      tailJoint,
      "rotation",
      [0, 0.5, 1.5],
      [...eulerToQuat(0, 0, 0), ...eulerToQuat(-0.35, 0, 0), ...eulerToQuat(0, 0, 0)]
    );
  }

  const io = new NodeIO();
  const glb = await io.writeBinary(doc);
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, glb);

  const totalVerts =
    (furMesh.positions.length +
      eyeMesh.positions.length +
      pinkMesh.positions.length +
      goldMesh.positions.length +
      cyberMesh.positions.length) /
    3;
  const totalTris =
    (furMesh.indices.length +
      eyeMesh.indices.length +
      pinkMesh.indices.length +
      goldMesh.indices.length +
      cyberMesh.indices.length) /
    3;

  console.log(
    `Generated ${OUT_PATH}: ${(glb.byteLength / 1024).toFixed(1)} KB, ${totalVerts} vertices, ${totalTris} triangles`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
