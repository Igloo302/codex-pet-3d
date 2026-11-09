/**
 * Union AABB computation and fixed-camera framing for the 2D bake pipeline.
 *
 * The camera derived here is computed ONCE from the union of every sampled
 * animation pose and then reused verbatim for all 88 spritesheet cells. That is
 * what guarantees the pet never jitters, changes scale, or leaves the frame
 * between frames/animations.
 */

export type Vec3 = [number, number, number];

export interface Bounds3 {
  min: Vec3;
  max: Vec3;
}

export interface ClipInfo {
  name: string;
  duration: number;
}

/** Camera parameters (degrees for fov) shared by every rendered frame. */
export interface CameraConfig {
  position: Vec3;
  target: Vec3;
  fov: number;
  near: number;
  far: number;
}

export interface FramingOptions {
  /** Vertical field of view, in degrees (from pet-3d.json). */
  fov: number;
  /** Direction from the target toward the camera (authored 3/4 view). */
  viewDirection: Vec3;
  /** Frame aspect ratio (frameWidth / frameHeight). */
  aspect: number;
  /** Safety multiplier applied to the fit radius. Defaults to 1.1 (10%). */
  margin?: number;
}

export interface SampleSpec {
  clip: string;
  time: number;
}

/** Callback that returns a world-space posed bounding box per sample. */
export type BoundsSampler = (samples: SampleSpec[]) => Promise<Bounds3[]>;

export interface FramingResult {
  union: Bounds3;
  camera: CameraConfig;
  boxes: Bounds3[];
}

/** Number of uniformly-sampled keyframe times per clip for the union pass. */
export const AABB_SAMPLES_PER_CLIP = 24;

const DEFAULT_MARGIN = 1.1;

/** Union of many world-space bounding boxes. Non-finite boxes are ignored. */
export function computeUnionAABB(boxes: Bounds3[]): Bounds3 {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let found = false;

  for (const box of boxes) {
    const values = [
      box.min[0], box.min[1], box.min[2],
      box.max[0], box.max[1], box.max[2],
    ];
    if (!values.every(Number.isFinite)) continue;
    found = true;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], box.min[k]);
      max[k] = Math.max(max[k], box.max[k]);
    }
  }

  // Graceful fallback keeps the pipeline usable even if a model reports no
  // finite geometry (e.g. an empty skinned mesh).
  if (!found) {
    return { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };
  }
  return { min, max };
}

/**
 * Derive a single fixed camera that frames the union AABB from the authored
 * view direction. A bounding-sphere fit (half the box diagonal) is used because
 * it is orientation-independent: it guarantees the whole pet stays inside the
 * frustum for every pose. A 10% margin is applied on top.
 */
export function computeFixedCamera(
  union: Bounds3,
  options: FramingOptions
): CameraConfig {
  const margin = options.margin ?? DEFAULT_MARGIN;

  const center: Vec3 = [
    (union.min[0] + union.max[0]) / 2,
    (union.min[1] + union.max[1]) / 2,
    (union.min[2] + union.max[2]) / 2,
  ];
  const size: Vec3 = [
    union.max[0] - union.min[0],
    union.max[1] - union.min[1],
    union.max[2] - union.min[2],
  ];

  const radius = 0.5 * Math.hypot(size[0], size[1], size[2]) || 0.5;
  const fov = options.fov > 0 ? options.fov : 45;

  const halfV = (fov * Math.PI) / 180 / 2;
  const halfH = Math.atan(Math.tan(halfV) * options.aspect);
  const half = Math.min(halfV, halfH);
  const sinHalf = Math.sin(half) || 0.1;

  const fitRadius = radius * margin;
  const distance = fitRadius / sinHalf;

  // Keep the authored camera direction; fall back to a mild front-above view.
  let dx = options.viewDirection[0];
  let dy = options.viewDirection[1];
  let dz = options.viewDirection[2];
  let len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) {
    dx = 0; dy = 0.3; dz = 1;
    len = Math.hypot(dx, dy, dz);
  }
  const dir: Vec3 = [dx / len, dy / len, dz / len];

  const position: Vec3 = [
    center[0] + dir[0] * distance,
    center[1] + dir[1] * distance,
    center[2] + dir[2] * distance,
  ];

  const near = Math.max(0.01, distance - 2 * radius);
  const far = distance + 2 * radius + 1;

  return { position, target: center, fov, near, far };
}

/**
 * Orchestrates the union-AABB pre-pass: samples every animation clip across its
 * full duration, unions all posed bounding boxes, then computes one fixed
 * camera. The renderer-specific sampling is injected as a callback so this
 * class stays renderer-agnostic and unit-testable.
 */
export class AABBCalculator {
  constructor(
    private readonly clips: ClipInfo[],
    private readonly sampler: BoundsSampler,
    private readonly options: FramingOptions
  ) {}

  /** Uniform sample times covering [0, duration] for every clip. */
  buildSampleSpecs(): SampleSpec[] {
    const specs: SampleSpec[] = [];
    for (const clip of this.clips) {
      const duration = clip.duration > 0 ? clip.duration : 0;
      for (let i = 0; i < AABB_SAMPLES_PER_CLIP; i++) {
        const time =
          AABB_SAMPLES_PER_CLIP > 1
            ? (i / (AABB_SAMPLES_PER_CLIP - 1)) * duration
            : 0;
        specs.push({ clip: clip.name, time });
      }
    }
    return specs;
  }

  async compute(): Promise<FramingResult> {
    const specs = this.buildSampleSpecs();
    const boxes = specs.length > 0 ? await this.sampler(specs) : [];
    const union = computeUnionAABB(boxes);
    const camera = computeFixedCamera(union, this.options);
    return { union, camera, boxes };
  }
}
