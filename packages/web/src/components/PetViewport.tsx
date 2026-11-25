import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Pet3DController,
  type Pet3DControllerOptions,
  type PetState,
} from "@codex-pet-3d/core";

export type CameraMode = "look-at" | "orbit";

export interface CameraSnapshot {
  position: [number, number, number];
  target: [number, number, number];
}

export interface PetViewportProps {
  /** URL of the .glb to load (sample asset URL or a blob: URL from a drop). */
  modelUrl: string;
  manifest: Pet3DControllerOptions["manifest"];
  state: PetState;
  cameraMode: CameraMode;
  onCameraModeChange?: (mode: CameraMode) => void;
  onCameraCommit?: (snapshot: CameraSnapshot) => void;
  onStateChange?: (state: PetState) => void;
  onLoadError?: (error: Error) => void;
}

const clampUnit = (value: number) => Math.max(-1, Math.min(1, value));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Mounts a canvas, boots the core Pet3DController on it, and supports switching between
 * cursor-following LookAt preview and interactive OrbitControls camera framing.
 */
export function PetViewport({
  modelUrl,
  manifest,
  state,
  cameraMode,
  onCameraModeChange,
  onCameraCommit,
  onStateChange,
  onLoadError,
}: PetViewportProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<Pet3DController | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraModeRef = useRef<CameraMode>(cameraMode);
  cameraModeRef.current = cameraMode;

  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;
  const onCameraCommitRef = useRef(onCameraCommit);
  onCameraCommitRef.current = onCameraCommit;

  // Serialize structural rig/clip dependencies so slider tweaks on camera/fov don't reload the GLB.
  const rigKey = JSON.stringify({
    scale: manifest.scale,
    lookAt: manifest.lookAt,
    animations: manifest.animations,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const measure = () => ({
      width: Math.max(wrap.clientWidth, 1),
      height: Math.max(wrap.clientHeight, 1),
    });
    const { width, height } = measure();

    const controller = new Pet3DController({
      canvas,
      width,
      height,
      modelUrl,
      manifest,
      backgroundColor: 0x070b14,
      backgroundAlpha: 0,
      onStateChange: (_from, to) => onStateChangeRef.current?.(to),
      onLoadError: (err) => onLoadErrorRef.current?.(err),
    });
    controllerRef.current = controller;

    // Attach OrbitControls (enabled only when in "orbit" framing mode)
    const camera = controller.getRenderer().getCamera();
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.target.set(
      manifest.camera.target[0],
      manifest.camera.target[1],
      manifest.camera.target[2]
    );
    controls.enabled = cameraModeRef.current === "orbit";
    controls.update();
    controlsRef.current = controls;

    const handleControlEnd = () => {
      if (cameraModeRef.current !== "orbit") return;
      onCameraCommitRef.current?.({
        position: [round3(camera.position.x), round3(camera.position.y), round3(camera.position.z)],
        target: [round3(controls.target.x), round3(controls.target.y), round3(controls.target.z)],
      });
    };
    controls.addEventListener("end", handleControlEnd);

    // Pointer position -> normalized device coords relative to the canvas (LookAt mode).
    const handlePointerMove = (event: PointerEvent) => {
      if (cameraModeRef.current !== "look-at") return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = clampUnit(((event.clientX - rect.left) / rect.width) * 2 - 1);
      const y = clampUnit(((event.clientY - rect.top) / rect.height) * 2 - 1);
      controller.setLookAtTarget(x, y);
    };
    window.addEventListener("pointermove", handlePointerMove);

    const handleResize = () => {
      const next = measure();
      controller.resize(next.width, next.height);
    };
    window.addEventListener("resize", handleResize);

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(handleResize);
      observer.observe(wrap);
    }

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("resize", handleResize);
      observer?.disconnect();
      controls.removeEventListener("end", handleControlEnd);
      controls.dispose();
      controlsRef.current = null;
      controller.dispose();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, rigKey]);

  // Live-update camera position, target, and FOV without reloading the GLB.
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    const renderer = controller.getRenderer();
    const camera = renderer.getCamera();
    camera.fov = manifest.camera.fov;
    camera.updateProjectionMatrix();
    renderer.setCameraPosition(
      new THREE.Vector3(...manifest.camera.position),
      new THREE.Vector3(...manifest.camera.target)
    );
    if (controlsRef.current) {
      controlsRef.current.target.set(...manifest.camera.target);
      controlsRef.current.update();
    }
  }, [
    manifest.camera.fov,
    manifest.camera.position[0],
    manifest.camera.position[1],
    manifest.camera.position[2],
    manifest.camera.target[0],
    manifest.camera.target[1],
    manifest.camera.target[2],
  ]);

  // Toggle OrbitControls vs LookAt mode
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enabled = cameraMode === "orbit";
    }
    if (cameraMode === "orbit") {
      controllerRef.current?.setLookAtTarget(0, 0);
    }
  }, [cameraMode]);

  // Apply state changes coming from the action bar (and re-apply after a swap).
  useEffect(() => {
    const controller = controllerRef.current;
    if (controller && controller.getState() !== state) {
      controller.playState(state);
    }
  }, [state, modelUrl, rigKey]);

  return (
    <section className="viewport-card">
      <div className="canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} className="pet-canvas" aria-label="3D pet preview" />
      </div>
      <span className="viewport-badge">
        <span className="live-dot" /> Live WebGL Studio
      </span>
      {onCameraModeChange && (
        <div className="mode-toggle" role="group" aria-label="Viewport interaction mode">
          <button
            type="button"
            className={`mode-btn${cameraMode === "look-at" ? " active" : ""}`}
            onClick={() => onCameraModeChange("look-at")}
          >
            LookAt Preview
          </button>
          <button
            type="button"
            className={`mode-btn${cameraMode === "orbit" ? " active" : ""}`}
            onClick={() => onCameraModeChange("orbit")}
          >
            Orbit Framing
          </button>
        </div>
      )}
      <span className="viewport-hint">
        {cameraMode === "look-at" ? (
          <>
            Move your <kbd>cursor</kbd> — the head follows via LookAt damping
          </>
        ) : (
          <>
            <kbd>Drag</kbd> to orbit · <kbd>Scroll</kbd> to zoom · <kbd>Right-drag</kbd> to pan — synced to <kbd>pet-3d.json</kbd>
          </>
        )}
      </span>
    </section>
  );
}
