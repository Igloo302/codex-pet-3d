import { Pet3DController, toControllerManifest } from "@codex-pet-3d/core";
import type { Pet3DManifest, StandardAnimationState } from "@codex-pet-3d/spec";
import type { LoadedPetPayload } from "../pet-registry";

// Fallback manifest matching assets/cyber-cat/pet-3d.json in case IPC/fetch is unavailable
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

async function loadFallbackManifest(): Promise<Pet3DManifest> {
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
let currentBlobUrl: string | null = null;

function revokeCurrentBlobUrl(): void {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
}

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById("pet-canvas") as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error("Canvas element not found");
  }

  let viewportWidth = 220;
  let viewportHeight = 240;
  let isLookAtEnabled = true;
  let currentCursorX = 0;
  let currentCursorY = 0;

  function mountController(modelUrl: string, specManifest: Pet3DManifest): Pet3DController {
    if (controllerInstance) {
      controllerInstance.dispose();
      controllerInstance = null;
    }

    const controller = new Pet3DController({
      canvas: canvas!,
      width: viewportWidth,
      height: viewportHeight,
      modelUrl,
      manifest: toControllerManifest(specManifest),
      backgroundColor: 0x000000,
      backgroundAlpha: 0,
      autoStartLoop: false,
    });
    if (isLookAtEnabled) {
      controller.setLookAtTarget(currentCursorX, currentCursorY);
    }
    controllerInstance = controller;
    return controller;
  }

  function mountFromPayload(payload: LoadedPetPayload): void {
    const bytesCopy = new Uint8Array(payload.modelBytes);
    const nextUrl = URL.createObjectURL(
      new Blob([bytesCopy], { type: "model/gltf-binary" })
    );
    revokeCurrentBlobUrl();
    currentBlobUrl = nextUrl;
    mountController(nextUrl, payload.manifest);
  }

  // Load initial pet + preferences from main process if available
  const initialState = window.desktopPet
    ? await window.desktopPet.getInitialState()
    : null;

  if (initialState) {
    viewportWidth = initialState.width;
    viewportHeight = initialState.height;
    isLookAtEnabled = initialState.isLookAtEnabled;
  }

  if (initialState?.pet) {
    mountFromPayload(initialState.pet);
  } else {
    const specManifest = await loadFallbackManifest();
    mountController(`./assets/cyber-cat/${specManifest.model}`, specManifest);
  }

  // Subscribe to IPC updates from main process
  if (window.desktopPet) {
    window.desktopPet.onCursorUpdate((payload: { x: number; y: number }) => {
      if (isLookAtEnabled && controllerInstance) {
        currentCursorX = payload.x;
        currentCursorY = payload.y;
        controllerInstance.setLookAtTarget(currentCursorX, currentCursorY);
      }
    });

    window.desktopPet.onPlayAnimation((state: StandardAnimationState) => {
      controllerInstance?.playState(state);
    });

    window.desktopPet.onToggleLookAt((enabled: boolean) => {
      isLookAtEnabled = enabled;
      if (!enabled) {
        controllerInstance?.setLookAtTarget(0, 0);
      }
    });

    window.desktopPet.onPetChanged((payload: LoadedPetPayload) => {
      mountFromPayload(payload);
    });

    window.desktopPet.onWindowResize(({ width, height }) => {
      viewportWidth = width;
      viewportHeight = height;
      controllerInstance?.resize(width, height);
    });
  }

  // Rendering throttle - 30 FPS
  const TARGET_FPS = 30;
  const FRAME_TIME = 1000 / TARGET_FPS;
  let lastFrameTime = 0;
  let animationFrameId: number | null = null;
  let isVisible = true;

  function renderLoop(timestamp: number): void {
    if (document.visibilityState === "hidden") {
      isVisible = false;
      animationFrameId = requestAnimationFrame(renderLoop);
      return;
    }

    if (!isVisible) {
      isVisible = true;
      lastFrameTime = timestamp;
    }

    const elapsed = timestamp - lastFrameTime;
    if (elapsed >= FRAME_TIME) {
      lastFrameTime = timestamp - (elapsed % FRAME_TIME);
      if (controllerInstance) {
        const dt = elapsed / 1000;
        controllerInstance.update(dt);
        controllerInstance.getRenderer().render();
      }
    }

    animationFrameId = requestAnimationFrame(renderLoop);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    } else {
      lastFrameTime = performance.now();
      animationFrameId = requestAnimationFrame(renderLoop);
    }
  });

  animationFrameId = requestAnimationFrame(renderLoop);

  window.addEventListener("resize", () => {
    controllerInstance?.resize(viewportWidth, viewportHeight);
  });

  window.addEventListener("beforeunload", () => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }
    controllerInstance?.dispose();
    controllerInstance = null;
    revokeCurrentBlobUrl();
  });

  // Click-through hit-testing and dragging state
  let isDragging = false;
  let didDrag = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragTotalDist = 0;
  let lastHitTestTime = 0;
  let lastIgnoreMouseEvents: boolean | null = null;
  const HIT_TEST_INTERVAL_MS = 33;
  const hitTestPixel = new Uint8Array(4);

  function setClickThrough(ignore: boolean): void {
    if (lastIgnoreMouseEvents === ignore) return;
    lastIgnoreMouseEvents = ignore;
    window.desktopPet?.setIgnoreMouseEvents(ignore);
  }

  window.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      isDragging = true;
      didDrag = false;
      dragTotalDist = 0;
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
      dragTotalDist += Math.hypot(dx, dy);
      if (dragTotalDist > 4) {
        didDrag = true;
      }
      window.desktopPet?.moveWindow({ x: dx, y: dy });
      return;
    }

    const now = performance.now();
    if (now - lastHitTestTime < HIT_TEST_INTERVAL_MS) return;
    lastHitTestTime = now;

    try {
      const gl = controllerInstance
        ?.getRenderer()
        .getRenderer()
        .getContext() as WebGLRenderingContext | WebGL2RenderingContext | undefined;
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
      // ignore WebGL readPixels failures during context switch
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

  // Interactive reactions when clicking (not dragging) on the pet
  window.addEventListener("click", (e) => {
    if (!didDrag && e.button === 0 && controllerInstance) {
      const states: StandardAnimationState[] = ["waving", "jumping", "review", "running"];
      const nextState = states[Math.floor(Math.random() * states.length)];
      controllerInstance.playState(nextState);
    }
    didDrag = false;
  });

  window.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    window.desktopPet?.showContextMenu();
  });
}

void bootstrap();

export { controllerInstance as controller };
