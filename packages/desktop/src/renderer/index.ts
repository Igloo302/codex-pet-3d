import { Pet3DController } from "@codex-pet-3d/core";
import type { StandardAnimationState } from "@codex-pet-3d/spec";

// Manifest configuration matching the cyber-cat sample asset
const MANIFEST = {
  scale: 1.0,
  camera: {
    fov: 45,
    position: [0, 0, 3] as [number, number, number],
    target: [0, 0, 0] as [number, number, number],
  },
  lookAt: {
    enabled: true,
    headBone: "Head",
    maxYawDeg: 45,
    maxPitchDeg: 30,
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
    review: { clip: "Review", loop: false },
  } as Record<StandardAnimationState, { clip: string; loop: boolean }>,
};

// Model URL - relative to renderer/index.html with local bundled asset
const MODEL_URL = "./assets/cyber-cat/model.glb";

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

// Click-through hit-testing and dragging state
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

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

  // Pixel alpha hit-testing: ignore mouse events on transparent background so windows beneath can be clicked
  try {
    const gl = controller.getRenderer().getRenderer().getContext() as WebGLRenderingContext | WebGL2RenderingContext;
    if (gl) {
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
      const y = Math.floor((rect.bottom - e.clientY) * (canvas.height / rect.height));
      if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
        const pixel = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const isOpaque = pixel[3] > 10;
        window.desktopPet?.setIgnoreMouseEvents(!isOpaque);
      } else {
        window.desktopPet?.setIgnoreMouseEvents(true);
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
    window.desktopPet?.setIgnoreMouseEvents(true);
  }
});

// Interactive reactions when clicking on the pet
window.addEventListener("click", () => {
  if (!isDragging) {
    const states: StandardAnimationState[] = ["waving", "jumping", "review", "running"];
    const nextState = states[Math.floor(Math.random() * states.length)];
    controller.playState(nextState);
  }
});

export { controller };