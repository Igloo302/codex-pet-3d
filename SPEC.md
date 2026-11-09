# Codex Pet 3D Specification v1.0

**Version:** 3d-v1.0  
**Status:** Stable  
**Date:** 2026-11-09

---

## 1. Background & Motivation

The Codex Pet ecosystem began as a 2D pixel-art companion format (Codex Pet v1/v2) used by VS Code extensions, TokenTracker, and the Awesome Codex Pet showcase. As 3D tooling matured, the community expressed interest in **interactive 3D pets** while maintaining **100% backwards compatibility** with existing 2D clients.

This specification defines:

1. A **3D asset format** (`pet-3d.json` + `model.glb`) for authoring rigged, animated 3D pets.
2. A **deterministic 2D baking pipeline** that renders a compliant Codex Pet v2 spritesheet (`spritesheet.webp` + `pet.json`) from any valid 3D asset.
3. A **desktop companion protocol** for frameless, transparent window rendering with cursor-following LookAt behavior.

Existing 2D clients (TokenTracker, VS Code Codex Pet, Awesome Codex Pet) continue to consume the baked `pet.json` + `spritesheet.webp` without modification. The 3D format is purely additive.

---

## 2. Directory Structure

```
<pet-directory>/
├── pet-3d.json       # Required: 3D manifest (this spec)
├── model.glb         # Required: glTF 2.0 binary (GLB)
└── preview.png       # Optional: 512×512 PNG for catalog thumbnails
```

- All paths in `pet-3d.json` are **relative** to the directory root.
- The directory name conventionally matches `pet-3d.json`'s `id` field.

---

## 3. Manifest Schema (`pet-3d.json`)

### 3.1 Root Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `$schema` | string | Yes | Must be `"https://codex-pet-3d.net/schemas/pet-3d.schema.json"` |
| `spec_version` | string | Yes | Must be `"3d-v1.0"` |
| `id` | string | Yes | Globally unique slug, e.g. `"cyber-cat--jyshen"` |
| `display_name` | string | Yes | Human-readable name, e.g. `"Cyber Cat"` |
| `author` | string | Yes | Creator handle |
| `description` | string | Yes | One-sentence blurb |
| `model` | string | Yes | Relative path to GLB (usually `"model.glb"`) |
| `scale` | number | Yes | Global scale multiplier (default `1.0`) |
| `camera` | object | Yes | See §3.2 |
| `look_at` | object | Yes | See §3.3 |
| `animations` | object | Yes | See §3.4 |

### 3.2 Camera Configuration

```json
"camera": {
  "fov": 45,
  "position": [0, 1.2, 2.5],
  "target": [0, 0.4, 0]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `fov` | number | Vertical field of view in degrees (recommended: 45) |
| `position` | `[number, number, number]` | World-space camera position (right-handed, Y-up, Z-forward) |
| `target` | `[number, number, number]` | World-space look-at target |

The camera defines the **authored view direction** used by the baker to compute a fixed framing camera encompassing all animation clips.

### 3.3 LookAt Configuration

```json
"look_at": {
  "enabled": true,
  "head_bone": "Head",
  "max_yaw_deg": 45,
  "max_pitch_deg": 30
}
```

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `enabled` | boolean | — | Master toggle for head-tracking |
| `head_bone` | string | — | Exact bone/node name in the GLB (e.g. `"Head"`, `"head"`, `"HeadBone"`) |
| `max_yaw_deg` | number | 0–90 | Maximum horizontal head rotation |
| `max_pitch_deg` | number | 0–60 | Maximum vertical head rotation |

The baker renders **16 static head orientations** (rows 9–10 of the spritesheet) by evaluating the pure `calculateAngles()` function from `@codex-pet-3d/core` at 22.5° increments clockwise from screen north. Desktop companions apply the same function at runtime with a damped lerp (see §7).

### 3.4 Animations

```json
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
```

Nine **canonical animation states** are required. Each maps to a GLB animation clip by name.

| State | Loop | Typical Use |
|-------|------|-------------|
| `idle` | ✓ | Default resting pose |
| `running-right` | ✓ | Moving right |
| `running-left` | ✓ | Moving left |
| `waving` | ✗ | Greeting / one-shot |
| `jumping` | ✗ | Excitement / one-shot |
| `failed` | ✓ | Error / sad state |
| `waiting` | ✓ | Loading / thinking |
| `running` | ✓ | Generic forward run |
| `review` | ✓ | Code review / focus |

**Sampling formula** (used by baker):
- **Looping clips:** `time = (i / N) * duration` for frame `i ∈ [0, N-1]`
- **One-shot clips:** `time = (i / (N-1)) * duration` for frame `i ∈ [0, N-1]`

---

## 4. 3D Technical Budgets & Constraints

| Budget | Limit | Rationale |
|--------|-------|-----------|
| **Vertices** | ≤ 25,000 | GPU-friendly for integrated graphics; desktop companion 30fps target |
| **Triangles** | ≤ 10,000 (recommended) | Keeps draw calls fast; validation warns above |
| **Texture resolution** | ≤ 1024×1024 | Memory budget; baked spritesheet is 1536×2288 |
| **GLB file size** | ≤ 5 MB (5,242,880 bytes) | Fast download; CI/CD friendly |
| **Coordinate system** | Right-handed, Y-up, Z-forward | glTF standard; matches Three.js |
| **Units** | Meters | glTF standard |

### 4.1 Skeletal Rigging Requirements

- Model **must** be skinned (skeletal animation).
- A bone/node matching `look_at.head_bone` **must** exist for LookAt to function.
- Animation clips **must** be authored on the same skeleton.
- Root bone should be at origin (0, 0, 0) for predictable framing.

### 4.2 Validation Rules

The `@codex-pet-3d/spec` validator enforces:

1. **Schema compliance** (AJV against `pet-3d.schema.json`)
2. **Model exists** and is valid GLB
3. **File size** ≤ 5 MB
4. **Vertex count** ≤ 25,000
5. **Max texture dimension** ≤ 1024
6. **All 9 animation clips** exist in GLB
7. **LookAt head bone** exists in GLB (if enabled)
8. **Triangle count** warning if > 10,000

---

## 5. 2D Baking & Interoperability Contract

The **bake-2d** pipeline (`@codex-pet-3d/cli`) consumes a valid 3D asset directory and emits a **Codex Pet v2** compatible 2D asset.

### 5.1 Output Structure

```
<out-dir>/
├── spritesheet.webp   # 1536×2288 lossless WebP, 8 cols × 11 rows
└── pet.json           # Codex Pet v2 manifest
```

### 5.2 Spritesheet Geometry

| Parameter | Value |
|-----------|-------|
| Cell width | 192 px |
| Cell height | 208 px |
| Columns | 8 |
| Rows | 11 |
| **Total width** | **1536 px** |
| **Total height** | **2288 px** |
| Supersampling | 2× (render 384×416 → downsample Lanczos3) |
| Format | Lossless WebP (alpha channel preserved) |

### 5.3 Row Layout

| Row(s) | Content | Frames per Row |
|--------|---------|----------------|
| 0 | `idle` | 7 (col 7 = transparent) |
| 1 | `running-right` | 8 |
| 2 | `running-left` | 8 |
| 3 | `waving` | 8 |
| 4 | `jumping` | 8 |
| 5 | `failed` | 8 |
| 6 | `waiting` | 8 |
| 7 | `running` | 8 |
| 8 | `review` | 8 |
| 9 | LookAt head angles 0–7 (N → NE) | 8 |
| 10 | LookAt head angles 8–15 (E → NNW) | 8 |

**Total cells used:** 9×8 + 16 = 88 of 88 (fully packed).

### 5.4 Camera Framing (Union AABB)

1. Sample **every clip** at its animation keyframes (via `AnimationMixer`).
2. Compute the **union AABB** of all sampled bounds.
3. Derive a **single fixed camera** targeting the union center, positioned along the authored view direction with a 10% margin (`margin: 1.1`).
4. This camera is used for **all frames** (animation + LookAt), guaranteeing the pet never leaves the cell.

### 5.5 LookAt Head Angles (Rows 9–10)

For each of 16 compass directions (22.5° steps clockwise from screen north):

```
k=0:  North (0°)        k=8:  South (180°)
k=1:  NNE (22.5°)       k=9:  SSW (202.5°)
k=2:  NE (45°)          k=10: SW (225°)
k=3:  ENE (67.5°)       k=11: WSW (247.5°)
k=4:  East (90°)        k=12: West (270°)
k=5:  ESE (112.5°)      k=13: WNW (292.5°)
k=6:  SE (135°)         k=14: NW (315°)
k=7:  SSE (157.5°)      k=15: NNW (337.5°)
```

The baker evaluates the **pure** `calculateAngles(targetX, targetY, maxYawRad, maxPitchRad)` from `@codex-pet-3d/core` (no damping, no lerp) at `time = 0` of the `idle` clip, applying the resulting quaternion to the head bone.

### 5.6 Output `pet.json` (Codex Pet v2)

```json
{
  "id": "cyber-cat--jyshen",
  "name": "Cyber Cat",
  "spriteVersionNumber": 2,
  "spritesheetPath": "spritesheet.webp",
  "frameWidth": 192,
  "frameHeight": 208,
  "states": {
    "idle": { "row": 0, "frames": 7, "loop": true },
    "running-right": { "row": 1, "frames": 8, "loop": true },
    "running-left": { "row": 2, "frames": 8, "loop": true },
    "waving": { "row": 3, "frames": 8, "loop": false },
    "jumping": { "row": 4, "frames": 8, "loop": false },
    "failed": { "row": 5, "frames": 8, "loop": false },
    "waiting": { "row": 6, "frames": 8, "loop": true },
    "running": { "row": 7, "frames": 8, "loop": true },
    "review": { "row": 8, "frames": 8, "loop": true }
  }
}
```

**Note:** LookAt rows (9–10) are **not** exposed in `pet.json.states`. They are consumed only by 3D-aware desktop companions that implement the LookAt protocol (§7).

### 5.7 Backwards Compatibility Guarantee

- The baked `spritesheet.webp` + `pet.json` is **100% compatible** with:
  - **TokenTracker** (reads v2 `pet.json`, renders spritesheet)
  - **VS Code Codex Pet** extension
  - **Awesome Codex Pet** showcase
- No changes required in existing 2D clients.

---

## 6. Desktop Companion Protocol

The `@codex-pet-3d/desktop` package (Electron) provides a reference implementation.

### 6.1 Window Properties

| Property | Value |
|----------|-------|
| Transparent | `true` |
| Frame | `false` (frameless) |
| Always on top | `true` |
| Resizable | `false` |
| Skip taskbar | `true` |
| Background color | `#00000000` (fully transparent) |

### 6.2 Rendering Loop

- **Target FPS:** 30 (GPU throttled via `requestAnimationFrame` + timer)
- **Visibility pause:** `document.hidden` or window minimized → stop render loop
- **Canvas:** WebGL2 via Three.js, alpha `true`, preserveDrawingBuffer `true`

### 6.3 Cursor Polling IPC

- **Interval:** 30 Hz (~33 ms)
- **Main process:** `screen.getCursorScreenPoint()` → sends `{ x, y }` to renderer
- **Renderer:** Converts screen coords → normalized device coords → `calculateAngles()`
- **Damping:** Lerp factor `0.15` per frame for smooth head motion

### 6.4 LookAt Runtime (Desktop)

```
targetX = (cursorX - petCenterX) / (petWidth / 2)
targetY = -(cursorY - petCenterY) / (petHeight / 2)
clamp targetX/Y to [-1, 1]
headAngles = calculateAngles(targetX, targetY, maxYawRad, maxPitchRad)
currentQuat.slerp(targetQuat, 0.15)
```

This matches the baked LookAt orientations at the extremes while providing fluid interpolation.

---

## 7. TokenTracker & Ecosystem Compatibility

| Consumer | Format Consumed | Notes |
|----------|-----------------|-------|
| **TokenTracker** | `pet.json` + `spritesheet.webp` (v2) | Reads baked 2D output directly |
| **VS Code Codex Pet** | `pet.json` + `spritesheet.webp` (v2) | No 3D support needed |
| **Awesome Codex Pet** | `pet.json` + `spritesheet.webp` (v2) | Gallery displays baked sprites |
| **codex-pet-3d CLI** | `pet-3d.json` + `model.glb` | Authoring & validation only |
| **codex-pet-3d Web** | `pet-3d.json` + `model.glb` | Interactive 3D viewer (Three.js) |
| **codex-pet-3d Desktop** | `pet-3d.json` + `model.glb` | Native 3D companion with LookAt |

**No runtime dependency on 3D** for existing 2D consumers. The 3D format is an **authoring-time** enhancement.

---

## 8. Schema Reference (`pet-3d.schema.json`)

The authoritative JSON Schema is published at:
`https://codex-pet-3d.net/schemas/pet-3d.schema.json`

Key constraints encoded:
- `spec_version` enum: `["3d-v1.0"]`
- `animations` requires exactly the 9 canonical keys
- `look_at.max_yaw_deg`: 0–90, `max_pitch_deg`: 0–60
- `camera.fov`: 1–179
- `scale`: > 0

---

## 9. Versioning Policy

| Version | Meaning |
|---------|---------|
| `3d-v1.0` | Current stable |
| `3d-v1.x` | Backwards-compatible additions (optional fields) |
| `3d-v2.0` | Breaking changes (new baking contract, schema changes) |

Baking output (`pet.json` v2) **never** changes within a major 3D version.

---

## 10. Quick Reference: CLI Commands

```bash
# Validate a 3D asset directory
codex-pet-3d validate ./my-pet --json

# Bake to 2D Codex Pet v2
codex-pet-3d bake-2d ./my-pet --out ./dist

# Outputs: ./dist/spritesheet.webp + ./dist/pet.json
```

---

*End of Specification*