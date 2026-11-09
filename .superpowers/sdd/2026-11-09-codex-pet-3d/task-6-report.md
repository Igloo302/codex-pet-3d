# Task 6 Report: 2D Spritesheet Baking Pipeline (`packages/cli bake-2d`)

## Summary

Implemented the `codex-pet-3d bake-2d <petDir> --out <outDir>` command that bakes a
3D pet asset into a **Codex Pet v2 compatible 1536×2288 `spritesheet.webp`** plus a
`pet.json`. The pipeline validates the asset first, computes one fixed camera
from the union AABB of every animation pose, renders 87 active cells at 2×
supersampling through headless Chromium/Three.js (SwiftShader), downsamples each
with Lanczos3 via `sharp`, composites them onto a fully-transparent sheet, and
encodes lossless WebP with `alphaQuality: 100`.

All verification gates from the brief pass.

## Files Created / Modified

| File | Status | Purpose |
|---|---|---|
| `packages/cli/src/baker/AABBCalculator.ts` | created | Union AABB + fixed camera framing |
| `packages/cli/src/baker/SpritesheetBaker.ts` | created | Headless rendering, supersampling, WebP/pet.json output |
| `packages/cli/src/commands/bake-2d.ts` | created | `runBake2D` with validation pre-flight |
| `packages/cli/src/cli.ts` | modified | Registers the `bake-2d` command |
| `packages/cli/src/index.ts` | modified | Re-exports `runBake2D` (+ ESM `.js` normalization) |
| `packages/cli/tests/bake-2d.test.ts` | created | Fail-fast, compliant bake, and pure-helper tests |
| `.superpowers/sdd/2026-11-09-codex-pet-3d/task-6-report.md` | created | This report |

## `AABBCalculator.ts` — Union AABB & Fixed Framing

- `computeUnionAABB(boxes)` — pure union of world-space posed bounding boxes;
  ignores non-finite boxes and falls back to a unit cube when none are valid.
- `computeFixedCamera(union, options)` — pure derivation of a single camera:
  - Centers the authored view direction (`camera.position - camera.target`, the
    manifest's 3/4 view) on the union-box center.
  - Uses a **bounding-sphere fit** (half the box diagonal) so the fit is
    orientation-independent and the pet can never leave the frustum in any pose.
  - Applies a **10% safety margin** (`margin: 1.1`, configurable) to the fit
    radius; distance = `radius·margin / sin(min(verticalHalfFov, horizontalHalfFov))`.
  - Returns `{ position, target, fov, near, far }` used verbatim for **every** frame.
- `class AABBCalculator(clips, sampler, options)` — orchestrates the pre-pass:
  `buildSampleSpecs()` samples 24 evenly-spaced times across `[0, duration]` for
  every clip; `compute()` unions the posed boxes (via an injected renderer-agnostic
  `sampleBounds` callback) and produces the one fixed camera. Keeping sampling
  injected keeps the math pure and unit-testable in Node.

## `SpritesheetBaker.ts` — Rendering & Compositing

- **One persistent browser/session** (not one launch per frame): an esbuild-bundled
  IIFE injects a `BakeSession` (Three.js + GLTFLoader) into headless Chromium with
  the proven SwiftShader args and the macOS system-Chrome / bundled-Chrome /
  `PUPPETEER_EXECUTABLE_PATH` fallback from the Task 3 spike. State (scene,
  `PerspectiveCamera`, `AnimationMixer`, cached clip actions, head bone) lives on
  `window.__bakeSession` and is reused for all AABB samples and all 87 cells.
- **Posing**: `_pose(clip, time)` stops all actions, plays the target clip, and calls
  `mixer.setTime(time)` then `scene.updateMatrixWorld(true)`. Boxes are read with
  `Box3.setFromObject(scene, true)` (precise → applies skinned bone transforms), so
  the union AABB reflects every deformed pose.
- **Layout** (8 cols × 11 rows, 192×208 cells → 1536×2288):
  - Rows 0–8: idle (7 frames, col 7 left unused/transparent), running-right,
    running-left, waving, jumping, failed, waiting, running (Work), review.
  - Loop sampling `t_i = (i/N)·T`; one-shot sampling `t_i = (i/(N-1))·T`
    (wave / jump / failed), per the brief.
  - Rows 9–10: 16 look-at head orientations. `computeLookAtHeadAngles()` maps
    `θ_k = k·22.5°` clockwise from north to normalized cursor coords and feeds them
    to the **pure `calculateAngles()` from `@codex-pet-3d/core`** (bypassing the
    runtime's damped lerp). Each renders the Idle frame-0 pose with the head bone
    rotated by the resulting yaw/pitch.
- **2× supersampling**: every cell is rendered at 384×416 RGBA (`gl.readPixels`,
  bottom-up flip), then `sharp(raw).resize(192, 208, { kernel: 'lanczos3' })`.
- **Composite**: a `1536×2288×4` zero buffer (fully transparent by default) receives
  each downsampled cell via a row-wise `Buffer.copy` blit. The single unused idle
  cell is never written, guaranteeing **alpha = 0**.
- **Output**: `sharp(sheet).webp({ lossless: true, alphaQuality: 100 })` →
  `spritesheet.webp`; and `pet.json` with `spriteVersionNumber: 2`,
  `spritesheetPath: "spritesheet.webp"`, `frameWidth/Height`, and the exact 9-state
  `states` map from the brief.

## `bake-2d.ts` — Validation Pre-flight

`runBake2D(targetDir, { out })` runs `runValidate(targetDir)` first. On any
validation failure it returns `{ success: false, exitCode: 1, errors }` **before**
any `mkdir`/write, so `outDir` is left untouched. On success it reads the manifest
and GLB, invokes `SpritesheetBaker.bake()`, and returns `{ success: true, exitCode: 0 }`.
Unexpected errors are caught and surfaced as `exitCode: 1` with a `BAKE_ERROR`.

## `cli.ts` / `index.ts`

- Registered `bake-2d <targetDir>` with a required `--out <outDir>` option and
  exit-code propagation.
- `index.ts` re-exports `runBake2D`/`Bake2DResult`; its two existing relative
  imports were normalized to `.js` to match the monorepo's Node-ESM baseline
  (reviewer commit `5cd3793` had fixed the same pattern in `core`/`spec`).

## Verification Evidence

`pnpm --filter @codex-pet-3d/cli test`:

```
 ✓ tests/validate.test.ts  (12 tests) 88ms
 ✓ tests/headless-spike.test.ts  (1 test) 6894ms
 ✓ tests/bake-2d.test.ts  (6 tests) 9333ms
 Test Files  3 passed (3)
      Tests  19 passed (19)
```

`pnpm --filter @codex-pet-3d/cli build`:

```
$ tsc && chmod +x dist/cli.js
(exit 0, no errors)
```

`packages/cli/tests/bake-2d.test.ts` covers (brief requirements):
- Fail fast with `exitCode 1`, `success false`, errors present, and **no**
  `spritesheet.webp` / `pet.json` written for a model with a missing clip.
- Compliant bake from `assets/cyber-cat`: `RIFF`/`WEBP` magic, metadata
  `1536×2288`, unused Row 0 / Col 7 cell fully `alpha = 0`, `pet.json`
  `spriteVersionNumber: 2` and `spritesheetPath: "spritesheet.webp"`. It also
  asserts an active cell actually contains rendered pixels (guards against a
  silently empty sheet) and spot-checks the v2 `states` map.
- Pure helpers: union AABB (incl. non-finite fallback), fixed-camera invariants
  (centered target, margins push the camera further out), and 16 distinct,
  deterministic `calculateAngles`-based look-at head orientations.

End-to-end run of the **built** binary (`node packages/cli/dist/cli.js bake-2d
assets/cyber-cat --out <tmp>`): exit 0, produces `spritesheet.webp` (≈447 KB) and
`pet.json`; `sharp().metadata()` reports `{ format: 'webp', width: 1536,
height: 2288, hasAlpha: true }` and the file starts with `RIFF` / `WEBP`.

### Content / framing sanity check (one-off, not committed)

Decoding a baked sheet and measuring opaque-pixel bounds per cell confirmed the
goal of the union-AABB framing:

```
idle0  : 7695 opaque, bbox x[47..135] y[67..160]
idle6  : 7739 opaque, bbox x[50..137] y[66..159]
runR0  : 7686 opaque, bbox x[46..135] y[67..160]
runR4  : 7693 opaque, bbox x[56..145] y[63..155]
look0  : 8609 opaque, bbox x[46..135] y[58..160]   (head tilted)
look8  : 8680 opaque, bbox x[51..135] y[50..160]   (head tilted)
unused :    0 opaque
```

The pet stays at a consistent size/position across all animations (no jitter or
scale jumps), look-at frames visibly differ (head rotation takes effect), and the
unused cell is exactly transparent.

## Notes

- The working tree started with an uncommitted Node-ESM baseline (`"type": "module"`
  + `.js` import extensions). During this task the orchestrator committed it as
  `5cd3793`, so this commit contains only Task 6 changes. All new relative imports
  use `.js` extensions accordingly.
- `.superpowers/` is gitignored; as with prior task reports, the report is staged
  with `git add -f`.

## Commit

```
feat(cli): implement 2D bake pipeline with union AABB framing, 2x supersampling, and lossless WebP output
```
