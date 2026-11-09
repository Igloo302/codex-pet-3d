# Task 7 Report: Web 3D Inspector & Interactive Showcase (`packages/web`)

## Summary
Implemented `@codex-pet-3d/web` as an interactive Vite + React dashboard that renders the
Cyber Cat sample model in real time through `@codex-pet-3d/core`, exposes all nine standard
animation states as trigger buttons, drives head LookAt from pointer movement, and accepts
local `.glb` files via drag-and-drop as portable `Uint8Array` bytes.

## Files Created

### Configuration & entry point
- `packages/web/tsconfig.json` — extends the monorepo base config; `react-jsx`, DOM libs,
  `noEmit`, and `paths` mappings to the workspace packages' TypeScript sources so
  `tsc` type-checks without requiring prebuilt `dist/` folders.
- `packages/web/vite.config.ts` — React plugin, source aliases for `@codex-pet-3d/core`
  and `@codex-pet-3d/spec`, and `server.fs.allow` so the repository-level sample asset
  can be served in dev.
- `packages/web/vitest.config.ts` — `environment: "jsdom"`, React plugin, the same
  aliases, and `tests/**/*.test.{ts,tsx}` as the test include pattern.
- `packages/web/index.html` — HTML shell plus the full dark-dashboard stylesheet
  (glass panels, WebGL viewport grid, action bar, responsive layout).

`packages/web/package.json` was already present in the workspace and already matched the
brief exactly (name, scripts, dependencies, devDependencies); it was left unchanged.

### Source files
- `packages/web/src/components/ActionControls.tsx` — renders a button for every state in
  `STANDARD_ANIMATION_STATES` (consumed from `@codex-pet-3d/spec`), calls
  `onSelectState(state)` on click, and highlights the active state via `aria-pressed` and
  an `active` class. Exports `ACTION_LABELS` for reuse in tests and the header.
- `packages/web/src/components/PetViewport.tsx` — mounts the `<canvas>`, constructs
  `Pet3DController` with the injected canvas, sample/dropped model URL, manifest and state
  callbacks. Window `pointermove` is converted to normalized `(-1..1)` coordinates
  relative to the canvas rect and forwarded to `controller.setLookAtTarget()`. Window
  resize and a `ResizeObserver` call `controller.resize()`; the controller is disposed on
  model swap / unmount. A separate effect applies `playState()` when the selected state
  changes (and re-applies it after a model swap).
- `packages/web/src/components/ModelDropzone.tsx` — drag-and-drop zone (plus click /
  keyboard browse) for `.glb` files. Uses `FileReader.readAsArrayBuffer` and passes a
  portable `Uint8Array` (no Node `Buffer`) to the parent along with the file name;
  rejects non-`.glb` files and reports read errors.
- `packages/web/src/App.tsx` — dark dashboard assembling the viewport, action bar, model
  dropzone and an "Active Manifest" info panel. Translates the snake_case
  `assets/cyber-cat/pet-3d.json` manifest into the controller's camelCase option shape,
  imports the sample `.glb` with Vite's `?url` handling, turns dropped bytes into a
  `blob:` URL for the loader, revokes superseded/unmounted object URLs, and keeps the
  selected state in sync with the controller's `onStateChange` (so one-shot actions
  automatically return the highlight to Idle).
- `packages/web/src/main.tsx` — `createRoot` bootstrap for `#root`.

### Tests
- `packages/web/tests/ActionControls.test.tsx` — 4 tests: all 9 state buttons are
  rendered, clicking the Jump button fires `onSelectState("jumping")`, every button fires
  its exact state name, and only the current state is highlighted. Explicit `afterEach`
  `cleanup()` is used because Vitest globals are disabled.

## Verification Results

### Tests — `pnpm --filter @codex-pet-3d/web test`
```
RUN  v1.6.1 /Users/jyshen/Projects/codex-pet-3d/packages/web
 ✓ tests/ActionControls.test.tsx  (4 tests)
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### Build — `pnpm --filter @codex-pet-3d/web build`
```
$ tsc && vite build
vite v5.4.21 building for production...
✓ 46 modules transformed.
dist/assets/model-BTaIPe0a.glb    8.65 kB
dist/index.html                  11.98 kB │ gzip:   2.64 kB
dist/assets/index-BvnZf-h5.js   722.72 kB │ gzip: 195.00 kB
✓ built in 900ms
```
`tsc` (type-check) completed with no errors. Vite emits only the informational
"chunk larger than 500 kB" warning, which is expected for a Three.js + React bundle;
there are no build errors or unresolved imports.

### Additional smoke test
Started the Vite dev server programmatically and requested `/`, `/src/main.tsx`,
`/src/App.tsx` and the out-of-root sample asset
`/@fs/.../assets/cyber-cat/model.glb?url` — all returned HTTP 200, with the model served
as `model/gltf-binary`. This confirms `server.fs.allow` and the `?url` import work in dev
as well as in the production build.

## Implementation Notes
- Both workspace packages are aliased to their TypeScript sources at build time, so the
  web package builds directly with `pnpm --filter @codex-pet-3d/web build` even on a
  fresh clone where the gitignored `dist/` folders of core/spec do not exist. The spec
  alias points at `spec/src/types.ts` (pure constants/types) so the Node-oriented
  validator and GLB inspector are not pulled into the browser module graph.
- Dropped models are previewed with the sample manifest (clip names, head bone, camera),
  which is the standard 9-state contract; models exporting the standard clip names will
  animate, while others still render statically without errors.
- `ModelDropzone` validates the `.glb` magic/version in `App` before creating a blob URL,
  and all bytes cross the component boundary as `Uint8Array` for portability to Web
  Workers / Electron renderers.
