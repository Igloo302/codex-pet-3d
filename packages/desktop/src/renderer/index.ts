import { Pet3DController, toControllerManifest } from "@codex-pet-3d/core";
import type { Pet3DManifest, StandardAnimationState } from "@codex-pet-3d/spec";

// Fallback manifest matching assets/cyber-cat/pet-3d.json in case fetch fails
const FALLBACK_MANIFEST: Pet3DManifest = {
  $schema: "https://codex-pet-3d.net/schemas/pet-3d.schema.json",
  spec_version: "3d-v1.0",
  id: "cyber-cat--jyshen",
  display_name: "Cyber Cat",
  author: "jyshen",
  description: "A charming, richly detailed stylized cyber cat companion for Codex.",
  model: "model.glb",
  scale: 1.0,
  camera: {
    fov: 45,
    position: [0, 1.2, 2.5],
    target: [0, 0.4, 0],
  },
  look_at: {
    enabled: true,
    head_bone: "Head",
    max_yaw_deg: 45,
    max_pitch_deg: 30,
  },
  animations: {
    idle: { clip: "Idle", loop: true },
    "running-right": { clip: "Run_Right", loop: true },
    "running-left": { clip: "Run_Left", loop: true },
    waving: { clip: "Wave", loop: false },
    jumping: { clip: "Jump", loop: false },
    failed: { clip: "Failed", loop: false },
    waiting: { clip: "Waiting", loop: true },
    running: { clip: "Work", loop: true },
    review: { clip: "Review", loop: true },
  },
};

async function loadManifest(): Promise<Pet3DManifest> {
  try {
    const res = await fetch("./assets/cyber-cat/pet-3d.json");
    if (res.ok) {
      return (await res.json()) as Pet3DManifest;
    }
  } catch {
    // Fall back to embedded canonical manifest when local fetch is unavailable
  }
  return FALLBACK_MANIFEST;
}

let controllerInstance: Pet3DController | null = null;

async function bootstrap(): Promise<void> {
  const specManifest = await loadManifest();
  const MANIFEST = toControllerManifest(specManifest);

  // Model URL - relative to renderer/index.html with local bundled asset
  const MODEL_URL = `./assets/cyber-cat/${specManifest.model}`;

  // Get canvas element
  const canvas = document.getElementById("pet-canvas") as HTMLCanvasElement;
  if (!canvas) {
    throw new Error("Canvas element not found");
  }

  // Initialize controller with autoStartLoop: false to avoid dual render loops
  const controller = new Pet3DController({
    canvas,
    width: 220,
    height: 240,
    modelUrl: MODEL_URL,
    manifest: MANIFEST,
    backgroundColor: 0x000000,
    backgroundAlpha: 0,
    autoStartLoop: false,
  });
  controllerInstance = controller;

// IPC cursor tracking
let currentCursorX = 0;
let currentCursorY = 0;
let isLookAtEnabled = true;

// Listen for updates from main process
if (window.desktopPet) {
  window.desktopPet.onCursorUpdate((payload: { x: number; y: number }) => {
    if (isLookAtEnabled) {
      currentCursorX = payload.x;
      currentCursorY = payload.y;
      controller.setLookAtTarget(currentCursorX, currentCursorY);
    }
  });

  window.desktopPet.onPlayAnimation((state: StandardAnimationState) => {
    controller.playState(state);
  });

  window.desktopPet.onToggleLookAt((enabled: boolean) => {
    isLookAtEnabled = enabled;
    if (!enabled) {
      controller.setLookAtTarget(0, 0);
    }
  });
}

// Rendering throttle - 30 FPS
const TARGET_FPS = 30;
const FRAME_TIME = 1000 / TARGET_FPS;
let lastFrameTime = 0;
let animationFrameId: number | null = null;
let isVisible = true;

/**
 * Throttled render loop at 30 FPS
 */
function renderLoop(timestamp: number): void {
  // Check visibility
  if (document.visibilityState === "hidden") {
    isVisible = false;
    animationFrameId = requestAnimationFrame(renderLoop);
    return;
  }

  if (!isVisible) {
    isVisible = true;
    lastFrameTime = timestamp;
  }

  // Throttle to 30 FPS
  const elapsed = timestamp - lastFrameTime;
  if (elapsed >= FRAME_TIME) {
    lastFrameTime = timestamp - (elapsed % FRAME_TIME);

    // Update controller with delta time
    const dt = elapsed / 1000; // Convert to seconds
    controller.update(dt);
    controller.getRenderer().render();
  }

  animationFrameId = requestAnimationFrame(renderLoop);
}

// Handle visibility change
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    // Pause rendering when hidden
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  } else {
    // Resume rendering when visible
    lastFrameTime = performance.now();
    animationFrameId = requestAnimationFrame(renderLoop);
  }
});

// Start render loop
animationFrameId = requestAnimationFrame(renderLoop);

// Handle window resize (though window is fixed size)
window.addEventListener("resize", () => {
  // Window is fixed size, but handle just in case
  controller.resize(220, 240);
});

// Cleanup on unload
window.addEventListener("beforeunload", () => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
  }
  controller.dispose();
});

// Click-through hit-testing and dragging state
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let lastHitTestTime = 0;
let lastIgnoreMouseEvents: boolean | null = null;
const HIT_TEST_INTERVAL_MS = 33; // ~30Hz throttle to avoid GPU readPixels stalls
const hitTestPixel = new Uint8Array(4);

function setClickThrough(ignore: boolean): void {
  if (lastIgnoreMouseEvents === ignore) return;
  lastIgnoreMouseEvents = ignore;
  window.desktopPet?.setIgnoreMouseEvents(ignore);
}

window.addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    isDragging = true;
    dragStartX = e.screenX;
    dragStartY = e.screenY;
  }
});

window.addEventListener("mousemove", (e) => {
  if (isDragging) {
    const dx = e.screenX - dragStartX;
    const dy = e.screenY - dragStartY;
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    window.desktopPet?.moveWindow({ x: dx, y: dy });
    return;
  }

  const now = performance.now();
  if (now - lastHitTestTime < HIT_TEST_INTERVAL_MS) return;
  lastHitTestTime = now;

  // Pixel alpha hit-testing: ignore mouse events on transparent background so windows beneath can be clicked
  try {
    const gl = controller.getRenderer().getRenderer().getContext() as WebGLRenderingContext | WebGL2RenderingContext;
    if (gl) {
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
      const y = Math.floor((rect.bottom - e.clientY) * (canvas.height / rect.height));
      if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, hitTestPixel);
        const isOpaque = hitTestPixel[3] > 10;
        setClickThrough(!isOpaque);
      } else {
        setClickThrough(true);
      }
    }
  } catch {
    // ignore
  }
});

window.addEventListener("mouseup", () => {
  isDragging = false;
});

window.addEventListener("mouseleave", () => {
  if (!isDragging) {
    setClickThrough(true);
  }
});

// Interactive reactions when clicking on the pet (left click)
window.addEventListener("click", (e) => {
  if (!isDragging && e.button === 0) {
    const states: StandardAnimationState[] = ["waving", "jumping", "review", "running"];
    const nextState = states[Math.floor(Math.random() * states.length)];
    controller.playState(nextState);
  }
});

// Right click context menu
window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  window.desktopPet?.showContextMenu();
});
}

void bootstrap();

export { controllerInstance as controller };