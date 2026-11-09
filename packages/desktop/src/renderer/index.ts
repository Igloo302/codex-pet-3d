import { Pet3DController } from "@codex-pet-3d/core";
import type { StandardAnimationState } from "@codex-pet-3d/spec";

// Manifest configuration matching the core package expectations
const MANIFEST = {
  scale: 1.0,
  camera: {
    fov: 45,
    position: [0, 1.2, 2.5] as [number, number, number],
    target: [0, 0.4, 0] as [number, number, number],
  },
  lookAt: {
    enabled: true,
    headBone: "head",
    maxYawDeg: 45,
    maxPitchDeg: 30,
  },
  animations: {
    idle: { clip: "idle", loop: true },
    "running-right": { clip: "run", loop: true },
    "running-left": { clip: "run", loop: true },
    waving: { clip: "wave", loop: false },
    jumping: { clip: "jump", loop: false },
    failed: { clip: "idle", loop: false },
    waiting: { clip: "idle", loop: true },
    running: { clip: "run", loop: true },
    review: { clip: "idle", loop: false },
  } as Record<StandardAnimationState, { clip: string; loop: boolean }>,
};

// Model URL - using a placeholder that will work with the core package
const MODEL_URL = "https://raw.githubusercontent.com/khronosgltf/Sample-Models/main/2.0/Box/glTF-Binary/Box.glb";

// Get canvas element
const canvas = document.getElementById("pet-canvas") as HTMLCanvasElement;
if (!canvas) {
  throw new Error("Canvas element not found");
}

// Initialize controller
const controller = new Pet3DController({
  canvas,
  width: 220,
  height: 240,
  modelUrl: MODEL_URL,
  manifest: MANIFEST,
  backgroundColor: 0x000000,
  backgroundAlpha: 0,
});

// IPC cursor tracking
let currentCursorX = 0;
let currentCursorY = 0;

// Listen for cursor updates from main process (30Hz)
if (window.desktopPet) {
  window.desktopPet.onCursorUpdate((payload: { x: number; y: number }) => {
    currentCursorX = payload.x;
    currentCursorY = payload.y;
    controller.setLookAtTarget(currentCursorX, currentCursorY);
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

export { controller };