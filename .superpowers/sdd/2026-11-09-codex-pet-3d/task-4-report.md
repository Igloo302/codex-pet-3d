# Task 4 Report: Core 3D Pet Engine (`packages/core`)

## Summary
Successfully implemented the `@codex-pet-3d/core` package providing the core 3D pet rendering engine with decoupled state machine and pure look-at calculations.

## Files Created

### Package Configuration
- `packages/core/package.json` - Package definition with dependencies on `@codex-pet-3d/spec` and `three`
- `packages/core/tsconfig.json` - TypeScript configuration extending base config
- `packages/core/vitest.config.ts` - Vitest configuration with node environment

### Source Files
- `packages/core/src/types.ts` - Type definitions for PetState, LookAtTrackerOptions, Pet3DRendererOptions, Pet3DControllerOptions, AnimationAction
- `packages/core/src/LookAtTracker.ts` - Pure `calculateAngles` function and `LookAtTracker` class with smooth damped interpolation
- `packages/core/src/PetStateMachine.ts` - Pure state machine for 9 standard pet states with looping vs one-shot distinction and automatic return to idle
- `packages/core/src/Pet3DRenderer.ts` - Three.js renderer with injectable canvas (HTMLCanvasElement/OffscreenCanvas), 3-point lighting, no global window/document dependency
- `packages/core/src/Pet3DController.ts` - Main controller orchestrating GLTFLoader, AnimationMixer cross-fading, bone look-at rotation, and state machine
- `packages/core/src/index.ts` - Public exports

### Tests
- `packages/core/tests/LookAtTracker.test.ts` - 18 tests covering calculateAngles and LookAtTracker
- `packages/core/tests/PetStateMachine.test.ts` - 25 tests covering state transitions, one-shot/looping behavior, interruptions

## Verification Results

### Tests
```
✓ tests/LookAtTracker.test.ts  (18 tests)
✓ tests/PetStateMachine.test.ts  (25 tests)
Test Files  2 passed (2)
Tests  43 passed (43)
```

### Build
```
$ tsc
# Exit code 0 - successful compilation
```

## Implementation Details

### calculateAngles (Pure Function)
- Linear mapping from normalized target coordinates (-1 to 1) to yaw/pitch angles
- Clamps within `[-maxYawRad, maxYawRad]` and `[-maxPitchRad, maxPitchRad]`
- Handles -0 normalization to +0 for consistent comparison

### LookAtTracker Class
- Smooth damped interpolation using exponential smoothing
- Configurable damping factor (default 0.1)
- Methods: `setTarget()`, `update(dt)`, `getAngles()`, `setAngles()`, `reset()`

### PetStateMachine Class
- 9 standard states: `idle`, `running-right`, `running-left`, `waving`, `jumping`, `failed`, `waiting`, `running`, `review`
- Looping states: `idle`, `running-right`, `running-left`, `running`, `waiting`, `review`
- One-shot states: `waving`, `jumping`, `failed` (auto-return to idle on finish)
- Immediate interruption of running animations on new `playState()` call
- Callbacks: `onStateChange`, `onAnimationFinished`

### Pet3DRenderer Class
- Accepts injectable canvas (HTMLCanvasElement or OffscreenCanvas)
- Sets up Scene, PerspectiveCamera, WebGLRenderer with SRGB color space
- Soft 3-point lighting (key, fill, rim + ambient)
- No hard dependency on global `window`/`document`
- Methods: `render()`, `resize()`, `dispose()`, `startRenderLoop()`, `stopRenderLoop()`

### Pet3DController Class
- Loads GLTF model via GLTFLoader
- Creates AnimationMixer with cross-fading actions (0.3s transition)
- Filters head bone tracks when look-at enabled to avoid conflicts
- Drives head bone rotation via LookAtTracker (YXZ Euler order)
- Integrates PetStateMachine for state transitions

## Next Steps
This core package is ready for integration with:
- `@codex-pet-3d/web` - Web 3D viewer
- `@codex-pet-3d/cli` - CLI preview and bake-2d commands
- `@codex-pet-3d/desktop` - Electron desktop pet