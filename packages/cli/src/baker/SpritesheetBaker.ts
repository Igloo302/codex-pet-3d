import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import puppeteer from "puppeteer";
import type { Page } from "puppeteer";
import sharp from "sharp";
import { calculateAngles } from "@codex-pet-3d/core";
import {
  AABBCalculator,
  type Bounds3,
  type CameraConfig,
  type ClipInfo,
  type SampleSpec,
  type Vec3,
} from "./AABBCalculator.js";

/* ------------------------------------------------------------------ *
 * Codex Pet v2 spritesheet geometry (8 cols x 11 rows).
 * ------------------------------------------------------------------ */
export const CELL_WIDTH = 192;
export const CELL_HEIGHT = 208;
export const COLS = 8;
export const ROWS = 11;
export const SHEET_WIDTH = COLS * CELL_WIDTH; // 1536
export const SHEET_HEIGHT = ROWS * CELL_HEIGHT; // 2288
export const SUPERSAMPLE = 2;
export const RENDER_WIDTH = CELL_WIDTH * SUPERSAMPLE; // 384
export const RENDER_HEIGHT = CELL_HEIGHT * SUPERSAMPLE; // 416

/** Structural subset of pet-3d.json needed by the baker. */
export interface BakeManifest {
  id: string;
  display_name: string;
  model?: string;
  camera: {
    fov: number;
    position: [number, number, number];
    target: [number, number, number];
  };
  look_at: {
    enabled: boolean;
    head_bone: string;
    max_yaw_deg: number;
    max_pitch_deg: number;
  };
  animations: Record<string, { clip: string; loop: boolean }>;
}

export interface SpritesheetBakerOptions {
  glbBytes: Uint8Array;
  manifest: BakeManifest;
  outDir: string;
}

export interface BakeOutput {
  spritesheetPath: string;
  petJsonPath: string;
  width: number;
  height: number;
  cells: number;
}

interface RowLayout {
  row: number;
  /** Key in manifest.animations and in pet.json.states. */
  state: string;
  frames: number;
  /** Loop drives both the sampling formula and the pet.json loop flag. */
  loop: boolean;
}

/** Rows 0-8: nine animation states. Row 0 idle has only 7 active frames. */
const ROW_LAYOUT: RowLayout[] = [
  { row: 0, state: "idle", frames: 7, loop: true },
  { row: 1, state: "running-right", frames: 8, loop: true },
  { row: 2, state: "running-left", frames: 8, loop: true },
  { row: 3, state: "waving", frames: 8, loop: false },
  { row: 4, state: "jumping", frames: 8, loop: false },
  { row: 5, state: "failed", frames: 8, loop: false },
  { row: 6, state: "waiting", frames: 8, loop: true },
  { row: 7, state: "running", frames: 8, loop: true },
  { row: 8, state: "review", frames: 8, loop: true },
];

interface HeadAngles {
  yaw: number;
  pitch: number;
}

interface FrameParams {
  clip: string;
  time: number;
  camera: CameraConfig;
  headAngles?: HeadAngles;
}

interface CellJob {
  row: number;
  col: number;
  params: FrameParams;
}

interface SessionWindow {
  __bakeCreate: (
    glbBase64: string,
    width: number,
    height: number,
    headBoneName: string
  ) => Promise<ClipInfo[]>;
  __bakeSession: {
    sampleBounds: (samples: SampleSpec[]) => Bounds3[];
    renderFrame: (params: FrameParams) => string;
  };
}

/**
 * 16 static look-at head orientations, one per 22.5 degrees clockwise from
 * north. Evaluated with the pure `calculateAngles()` from @codex-pet-3d/core
 * (bypassing the runtime's damped lerp).
 */
export function computeLookAtHeadAngles(
  maxYawDeg: number,
  maxPitchDeg: number
): HeadAngles[] {
  const maxYawRad = (maxYawDeg * Math.PI) / 180;
  const maxPitchRad = (maxPitchDeg * Math.PI) / 180;
  const angles: HeadAngles[] = [];
  for (let k = 0; k < 16; k++) {
    const theta = (k * 22.5 * Math.PI) / 180;
    // Screen-up is north: targetX = sin(theta), targetY = -cos(theta).
    const targetX = Math.sin(theta);
    const targetY = -Math.cos(theta);
    angles.push(calculateAngles(targetX, targetY, maxYawRad, maxPitchRad));
  }
  return angles;
}

/** Sampling times per the v2 spec: loop uses i/N, one-shot uses i/(N-1). */
function samplingTime(
  i: number,
  frames: number,
  duration: number,
  loop: boolean
): number {
  if (frames <= 1) return 0;
  const denominator = loop ? frames : frames - 1;
  return (i / denominator) * duration;
}

/* ------------------------------------------------------------------ *
 * Browser-side Three.js renderer (bundled with esbuild, injected as IIFE).
 * One persistent scene/camera/mixer serves every frame.
 * ------------------------------------------------------------------ */
const BROWSER_SOURCE = `
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

function decodeBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

class BakeSession {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    const canvas = document.getElementById("gl-canvas");
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(3, 4, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-3, 2, -2);
    this.scene.add(fill);

    this.gltf = null;
    this.mixer = null;
    this.actions = {};
    this.headBone = null;
  }

  async init(glbBase64, headBoneName) {
    const bytes = decodeBase64(glbBase64);
    const loader = new GLTFLoader();
    this.gltf = await new Promise((resolve, reject) => {
      loader.parse(bytes.buffer, "", resolve, reject);
    });
    this.scene.add(this.gltf.scene);

    this.mixer = new THREE.AnimationMixer(this.gltf.scene);
    for (const clip of this.gltf.animations) {
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }
    this.gltf.scene.traverse((o) => {
      if (o.name === headBoneName && (!this.headBone || o.isBone)) {
        this.headBone = o;
      }
    });
    return this.getClips();
  }

  getClips() {
    return this.gltf.animations.map((c) => ({ name: c.name, duration: c.duration }));
  }

  // Pose the model at an exact clip time via AnimationMixer. All clips share
  // the same animated channels, so stop-all + play-one is deterministic.
  _pose(clip, time) {
    this.mixer.stopAllAction();
    const action = this.actions[clip];
    if (action) {
      action.reset();
      action.play();
    }
    this.mixer.setTime(time);
    this.scene.updateMatrixWorld(true);
  }

  _bounds() {
    const box = new THREE.Box3().setFromObject(this.scene, true);
    if (box.isEmpty() || !isFinite(box.min.x)) {
      return { min: [0, 0, 0], max: [0, 0, 0] };
    }
    return {
      min: [box.min.x, box.min.y, box.min.z],
      max: [box.max.x, box.max.y, box.max.z],
    };
  }

  sampleBounds(samples) {
    const out = [];
    for (let i = 0; i < samples.length; i++) {
      this._pose(samples[i].clip, samples[i].time);
      out.push(this._bounds());
    }
    return out;
  }

  _setCamera(cam) {
    this.camera.fov = cam.fov;
    this.camera.aspect = this.width / this.height;
    this.camera.near = cam.near;
    this.camera.far = cam.far;
    this.camera.position.set(cam.position[0], cam.position[1], cam.position[2]);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(cam.target[0], cam.target[1], cam.target[2]);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  renderFrame(params) {
    this._setCamera(params.camera);
    this._pose(params.clip, params.headAngles ? 0 : params.time);
    if (params.headAngles && this.headBone) {
      // Base pose is Idle frame 0; apply the static head orientation on top.
      const base = this.headBone.quaternion.clone();
      this.headBone.quaternion.copy(base);
      this.headBone.rotateY(params.headAngles.yaw);
      this.headBone.rotateX(-params.headAngles.pitch);
      this.scene.updateMatrixWorld(true);
    }

    this.renderer.render(this.scene, this.camera);
    const gl = this.renderer.getContext();
    const w = this.width;
    const h = this.height;
    const raw = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);

    // readPixels is bottom-up; flip to a conventional top-down RGBA frame.
    const pixels = new Uint8Array(raw.length);
    const rowBytes = w * 4;
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * rowBytes;
      pixels.set(raw.subarray(src, src + rowBytes), y * rowBytes);
    }
    return encodeBase64(pixels);
  }
}

window.__bakeCreate = async function (glbBase64, width, height, headBoneName) {
  const session = new BakeSession(width, height);
  const clips = await session.init(glbBase64, headBoneName);
  window.__bakeSession = session;
  return clips;
};
`;

const SWIFTSHADER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
];

const MAC_CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Both src/baker and dist/baker sit two levels below the package root.
const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

function resolveExecutablePath(): string | undefined {
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

async function bundleBrowserScript(): Promise<string> {
  const result = await esbuild.build({
    stdin: {
      contents: BROWSER_SOURCE,
      resolveDir: PACKAGE_ROOT,
      sourcefile: "bake-browser-entry.js",
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

function createSession(
  page: Page,
  glbBase64: string,
  bone: string
): Promise<ClipInfo[]> {
  return page.evaluate(
    (args) =>
      (window as unknown as SessionWindow).__bakeCreate(
        args.g,
        args.w,
        args.h,
        args.b
      ),
    { g: glbBase64, w: RENDER_WIDTH, h: RENDER_HEIGHT, b: bone }
  );
}

function sampleBounds(page: Page, samples: SampleSpec[]): Promise<Bounds3[]> {
  return page.evaluate(
    (s) => (window as unknown as SessionWindow).__bakeSession.sampleBounds(s),
    samples
  );
}

function renderFrame(page: Page, params: FrameParams): Promise<string> {
  return page.evaluate(
    (p) => (window as unknown as SessionWindow).__bakeSession.renderFrame(p),
    params
  );
}

/** Copy one downsampled RGBA cell into its slot in the full-sheet buffer. */
function blitCell(sheet: Buffer, cell: Buffer, col: number, row: number): void {
  const srcStride = CELL_WIDTH * 4;
  const dstStride = SHEET_WIDTH * 4;
  const dstRowStart = row * CELL_HEIGHT * dstStride + col * CELL_WIDTH * 4;
  for (let y = 0; y < CELL_HEIGHT; y++) {
    const src = y * srcStride;
    const dst = dstRowStart + y * dstStride;
    cell.copy(sheet, dst, src, src + srcStride);
  }
}

/** Bakes a 3D pet model into a Codex Pet v2 compatible 2D spritesheet. */
export class SpritesheetBaker {
  private readonly glbBytes: Uint8Array;
  private readonly manifest: BakeManifest;
  private readonly outDir: string;

  constructor(options: SpritesheetBakerOptions) {
    this.glbBytes = options.glbBytes;
    this.manifest = options.manifest;
    this.outDir = options.outDir;
  }

  async bake(): Promise<BakeOutput> {
    mkdirSync(this.outDir, { recursive: true });

    const bundle = await bundleBrowserScript();
    const executablePath = resolveExecutablePath();
    const browser = await puppeteer.launch({
      headless: true,
      args: SWIFTSHADER_ARGS,
      ...(executablePath ? { executablePath } : {}),
    });

    try {
      const page = await browser.newPage();
      await page.setContent(
        '<!doctype html><html><body style="margin:0;padding:0">' +
          `<canvas id="gl-canvas" width="${RENDER_WIDTH}" height="${RENDER_HEIGHT}"></canvas>` +
          "</body></html>"
      );
      await page.addScriptTag({ content: bundle });

      const glbBase64 = Buffer.from(this.glbBytes).toString("base64");
      const clips = await createSession(
        page,
        glbBase64,
        this.manifest.look_at.head_bone
      );
      const durationByClip = new Map(clips.map((c) => [c.name, c.duration]));
      const idleClip = this.manifest.animations["idle"]?.clip ?? clips[0]?.name ?? "Idle";

      // Fixed framing: union AABB over all clips, then one camera for all frames.
      const viewDirection: Vec3 = [
        this.manifest.camera.position[0] - this.manifest.camera.target[0],
        this.manifest.camera.position[1] - this.manifest.camera.target[1],
        this.manifest.camera.position[2] - this.manifest.camera.target[2],
      ];
      const calculator = new AABBCalculator(
        clips,
        (samples) => sampleBounds(page, samples),
        {
          fov: this.manifest.camera.fov,
          viewDirection,
          aspect: CELL_WIDTH / CELL_HEIGHT,
          margin: 1.1,
        }
      );
      const framing = await calculator.compute();

      const jobs = this.buildCellJobs(durationByClip, idleClip, framing.camera);

      // Full sheet starts fully transparent, so any unused cell keeps alpha 0.
      const sheet = Buffer.alloc(SHEET_WIDTH * SHEET_HEIGHT * 4, 0);
      const expectedRaw = RENDER_WIDTH * RENDER_HEIGHT * 4;

      for (const job of jobs) {
        const base64 = await renderFrame(page, job.params);
        const raw = Buffer.from(base64, "base64");
        if (raw.byteLength !== expectedRaw) {
          throw new Error(
            `Expected ${expectedRaw} RGBA bytes for cell (${job.row},${job.col}), received ${raw.byteLength}`
          );
        }
        const cell = await sharp(raw, {
          raw: { width: RENDER_WIDTH, height: RENDER_HEIGHT, channels: 4 },
        })
          .resize(CELL_WIDTH, CELL_HEIGHT, { kernel: "lanczos3" })
          .raw()
          .toBuffer();
        blitCell(sheet, cell, job.col, job.row);
      }

      const spritesheetPath = join(this.outDir, "spritesheet.webp");
      await sharp(sheet, {
        raw: { width: SHEET_WIDTH, height: SHEET_HEIGHT, channels: 4 },
      })
        .webp({ lossless: true, alphaQuality: 100 })
        .toFile(spritesheetPath);

      const petJsonPath = join(this.outDir, "pet.json");
      writeFileSync(petJsonPath, JSON.stringify(this.buildPetJson(), null, 2));

      return {
        spritesheetPath,
        petJsonPath,
        width: SHEET_WIDTH,
        height: SHEET_HEIGHT,
        cells: jobs.length,
      };
    } finally {
      await browser.close();
    }
  }

  private buildCellJobs(
    durationByClip: Map<string, number>,
    idleClip: string,
    camera: CameraConfig
  ): CellJob[] {
    const jobs: CellJob[] = [];

    for (const row of ROW_LAYOUT) {
      const clip = this.manifest.animations[row.state]?.clip ?? row.state;
      const duration = durationByClip.get(clip) ?? 1;
      for (let i = 0; i < row.frames; i++) {
        jobs.push({
          row: row.row,
          col: i,
          params: {
            clip,
            time: samplingTime(i, row.frames, duration, row.loop),
            camera,
          },
        });
      }
    }

    // Rows 9-10: 16 look-at head orientations (8 per row).
    const angles = computeLookAtHeadAngles(
      this.manifest.look_at.max_yaw_deg,
      this.manifest.look_at.max_pitch_deg
    );
    for (let k = 0; k < 16; k++) {
      jobs.push({
        row: 9 + Math.floor(k / 8),
        col: k % 8,
        params: {
          clip: idleClip,
          time: 0,
          camera,
          headAngles: angles[k],
        },
      });
    }

    return jobs;
  }

  private buildPetJson() {
    const states: Record<string, { row: number; frames: number; loop: boolean }> = {};
    for (const row of ROW_LAYOUT) {
      states[row.state] = { row: row.row, frames: row.frames, loop: row.loop };
    }
    return {
      id: this.manifest.id,
      name: this.manifest.display_name,
      spriteVersionNumber: 2,
      spritesheetPath: "spritesheet.webp",
      frameWidth: CELL_WIDTH,
      frameHeight: CELL_HEIGHT,
      states,
    };
  }
}
