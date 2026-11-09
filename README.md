# Codex Pet 3D

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node: >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.x-f69220.svg)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/tested%20with-Vitest-6e9f18.svg)](https://vitest.dev/)

**Codex Pet 3D** extends the [Awesome Codex Pet](https://github.com/legeling/awesome-codex-pet) 2D format into interactive 3D — while guaranteeing **100% backwards compatibility** with existing 2D clients (TokenTracker, VS Code pets, Awesome Codex Pet).

Author a rigged, animated 3D pet once → bake to a standards-compliant 2D spritesheet → run natively as a desktop companion with cursor-following LookAt.

---

## Architecture Overview

```mermaid
graph TB
    subgraph Authoring["Authoring & Validation"]
        A[pet-3d.json + model.glb] --> B[@codex-pet-3d/spec<br/>Validator]
        B -->|valid| C[@codex-pet-3d/cli<br/>bake-2d]
    end

    subgraph Baking["2D Baking Pipeline"]
        C --> D[Puppeteer + Three.js<br/>Headless Renderer]
        D --> E[Union AABB Framing]
        E --> F[2× Supersample + Lanczos3]
        F --> G[spritesheet.webp<br/>1536×2288 lossless]
        F --> H[pet.json<br/>Codex Pet v2]
    end

    subgraph Consumers["Consumers (Zero 3D Deps)"]
        G --> I[TokenTracker]
        G --> J[VS Code Codex Pet]
        G --> K[Awesome Codex Pet]
        H --> I
        H --> J
        H --> K
    end

    subgraph Runtime3D["3D Runtimes (Optional)"]
        A --> L[@codex-pet-3d/web<br/>Three.js Viewer]
        A --> M[@codex-pet-3d/desktop<br/>Electron Companion]
        M --> N[30 Hz Cursor Polling]
        N --> O[calculateAngles + Damped Lerp]
        O --> P[LookAt Head Tracking]
    end

    style A fill:#1e293b,stroke:#38bdf8,color:#fff
    style G fill:#064e3b,stroke:#34d399,color:#fff
    style H fill:#064e3b,stroke:#34d399,color:#fff
    style L fill:#7c3aed,stroke:#a78bfa,color:#fff
    style M fill:#7c3aed,stroke:#a78bfa,color:#fff
```

**Key property:** The 2D baking pipeline (yellow) produces artifacts consumable by **any** existing Codex Pet v2 client. The 3D runtimes (purple) are purely additive.

---

## Package Matrix

| Package | Scope | Purpose | Entry Point |
|---------|-------|---------|-------------|
| `@codex-pet-3d/spec` | `packages/spec` | Schema, types, GLB inspection, validation | `dist/index.js` |
| `@codex-pet-3d/core` | `packages/core` | Pure math: `calculateAngles`, LookAt, state machine | `dist/index.js` |
| `@codex-pet-3d/cli` | `packages/cli` | `validate`, `bake-2d` commands | `dist/cli.js` (bin) |
| `@codex-pet-3d/web` | `packages/web` | Interactive 3D viewer (Vite + React + Three.js) | `index.html` |
| `@codex-pet-3d/desktop` | `packages/desktop` | Electron frameless companion with LookAt | `dist/main.js` |

### Dependency Graph

```mermaid
graph LR
    spec[@codex-pet-3d/spec] --> cli[@codex-pet-3d/cli]
    spec --> core[@codex-pet-3d/core]
    core --> cli
    core --> web[@codex-pet-3d/web]
    core --> desktop[@codex-pet-3d/desktop]
    spec --> web
    spec --> desktop
```

---

## Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- Google Chrome (for `bake-2d` headless rendering)

### Installation

```bash
# Clone & install
git clone https://github.com/Igloo302/codex-pet-3d.git
cd codex-pet-3d
pnpm install

# Build all packages
pnpm run build
```

### Validate a 3D Asset

```bash
# Human-readable output
pnpm run validate assets/cyber-cat

# JSON output (CI-friendly)
pnpm run validate assets/cyber-cat --json
```

**Expected output (JSON):**
```json
{
  "valid": true,
  "exitCode": 0,
  "errors": [],
  "warnings": []
}
```

### Bake to 2D (Codex Pet v2)

```bash
pnpm run bake-2d assets/cyber-cat --out ./dist
```

**Outputs:**
```
dist/
├── spritesheet.webp   # 1536×2288 lossless WebP
└── pet.json           # Codex Pet v2 manifest
```

### Run the Web Viewer

```bash
cd packages/web
pnpm run dev
# Opens http://localhost:5173
```

### Run the Desktop Companion

```bash
cd packages/desktop
pnpm run dev
# Launches frameless Electron window with 3D pet
```

---

## 3D Asset Authoring Guide

### Directory Structure

```
my-pet/
├── pet-3d.json      # Manifest (see SPEC.md §3)
├── model.glb        # glTF 2.0 binary, skinned, animated
└── preview.png      # Optional 512×512 thumbnail
```

### Minimal `pet-3d.json`

```json
{
  "$schema": "https://codex-pet-3d.net/schemas/pet-3d.schema.json",
  "spec_version": "3d-v1.0",
  "id": "my-pet--author",
  "display_name": "My Pet",
  "author": "author",
  "description": "A custom 3D Codex Pet",
  "model": "model.glb",
  "scale": 1.0,
  "camera": {
    "fov": 45,
    "position": [0, 1.2, 2.5],
    "target": [0, 0.4, 0]
  },
  "look_at": {
    "enabled": true,
    "head_bone": "Head",
    "max_yaw_deg": 45,
    "max_pitch_deg": 30
  },
  "animations": {
    "idle": { "clip": "Idle", "loop": true },
    "running-right": { "clip": "Run_Right", "loop": true },
    "running-left": { "clip": "Run_Left", "loop": true },
    "waving": { "clip": "Wave", "loop": false },
    "jumping": { "clip": "Jump", "loop": false },
    "failed": { "clip": "Failed", "loop": true },
    "waiting": { "clip": "Waiting", "loop": true },
    "running": { "clip": "Work", "loop": true },
    "review": { "clip": "Review", "loop": true }
  }
}
```

### GLB Requirements

| Requirement | Detail |
|-------------|--------|
| Format | glTF 2.0 binary (.glb) |
| Animation | Skeletal (skinned mesh) |
| Clips | All 9 canonical names present |
| Bone | `look_at.head_bone` must exist |
| Vertices | ≤ 25,000 |
| Triangles | ≤ 10,000 (recommended) |
| Textures | ≤ 1024×1024 |
| File size | ≤ 5 MB |
| Coordinates | Right-handed, Y-up, Z-forward (glTF default) |

---

## CLI Reference

### `codex-pet-3d validate <targetDir> [--json]`

Validates a pet-3d asset directory.

| Option | Description |
|--------|-------------|
| `<targetDir>` | Path to directory containing `pet-3d.json` |
| `--json` | Output machine-readable JSON |

**Exit codes:**
- `0` — Valid
- `1` — Validation errors (schema, budgets, missing clips/bones)
- `2` — Fatal error (missing manifest, invalid JSON, unexpected exception)

### `codex-pet-3d bake-2d <targetDir> --out <outDir>`

Bakes a validated 3D asset to Codex Pet v2 2D format.

| Option | Description |
|--------|-------------|
| `<targetDir>` | Path to validated pet-3d asset |
| `--out <outDir>` | Output directory (created if needed) |

**Behavior:**
1. Runs validation pre-flight (aborts on failure, writes nothing)
2. Launches headless Chrome (Puppeteer + SwiftShader)
3. Renders 88 frames at 2× supersample (384×416 → 192×208)
4. Composites into 1536×2288 spritesheet
5. Encodes lossless WebP + writes `pet.json`

---

## Compatibility Notes

### TokenTracker

TokenTracker reads the baked `pet.json` + `spritesheet.webp` directly. No changes needed.

```bash
# After baking, point TokenTracker at the dist/ directory
tokentracker add ./dist/pet.json
```

### VS Code Codex Pet Extension

Works out of the box with the baked v2 assets.

### Awesome Codex Pet

The gallery displays baked spritesheets. Submit your `dist/` folder for inclusion.

---

## Development

### Run All Tests

```bash
pnpm run test
```

### Run E2E Tests Only

```bash
pnpm run test:e2e
```

### Type-Check All Packages

```bash
pnpm -r exec tsc --noEmit
```

### Lint (if configured)

```bash
pnpm run lint
```

---

## Specification

The authoritative format specification is **[SPEC.md](./SPEC.md)** (v1.0, `3d-v1.0`).

Covers:
- Manifest schema & required fields
- 3D budgets (vertices, triangles, textures, file size)
- 2D baking contract (spritesheet geometry, union AABB, LookAt rows)
- Desktop companion protocol (30 Hz polling, damped LookAt)
- TokenTracker / ecosystem compatibility

---

## License

MIT © 2026 Codex Pet 3D Contributors

---

## Credits

- [Awesome Codex Pet](https://github.com/legeling/awesome-codex-pet) by legeling
- [TokenTracker](https://github.com/xiufengsun/TokenTracker) by xiufengsun
- [vscode-pets](https://github.com/tonybaloney/vscode-pets) by Anthony Shaw
- glTF / Three.js / Puppeteer / Electron communities