import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Pet3DController,
  checkXRSupport,
  type Pet3DControllerOptions,
  type PetState,
  type WebXRSupportStatus,
  type XRMode,
  type XRSessionState,
} from "@codex-pet-3d/core";
import { INITIAL_XR_STATE, XRControls } from "./XRControls";

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
  /** Notifies the parent when a WebXR session starts, changes or ends. */
  onXRStateChange?: (state: XRSessionState) => void;
}

const clampUnit = (value: number) => Math.max(-1, Math.min(1, value));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Mounts a canvas, boots the core Pet3DController on it, and supports switching between
 * cursor-following LookAt preview, interactive OrbitControls framing and immersive WebXR
 * (AR/VR) sessions.
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
  onXRStateChange,
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
  const onXRStateChangeRef = useRef(onXRStateChange);
  onXRStateChangeRef.current = onXRStateChange;

  const [xrSupport, setXrSupport] = useState<WebXRSupportStatus | null>(null);
  const [xrState, setXrState] = useState<XRSessionState>(INITIAL_XR_STATE);
  const [xrBusy, setXrBusy] = useState(false);
  const [xrError, setXrError] = useState<string | null>(null);

  const xrStateRef = useRef(xrState);
  const xrOverlayRef = useRef<HTMLDivElement>(null);

  const applyXRState = useCallback((next: XRSessionState) => {
    xrStateRef.current = next;
    setXrState(next);
    onXRStateChangeRef.current?.(next);
  }, []);

  // Probe device/browser WebXR capability once per mount.
  useEffect(() => {
    let cancelled = false;

    void checkXRSupport()
      .then((status) => {
        if (!cancelled) setXrSupport(status);
      })
      .catch(() => {
        if (!cancelled) {
          setXrSupport({
            available: false,
            secureContext: typeof window !== "undefined" ? window.isSecureContext !== false : true,
            arSupported: false,
            vrSupported: false,
            preferredMode: null,
            reason: "WebXR capability detection failed in this browser.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

    if (xrStateRef.current.active) {
      applyXRState(INITIAL_XR_STATE);
    }

    let mounted = true;

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
      enableXR: true,
      onStateChange: (_from, to) => onStateChangeRef.current?.(to),
      onLoadError: (err) => onLoadErrorRef.current?.(err),
      onXRSessionChange: (next) => {
        if (mounted) applyXRState(next);
      },
      onXRError: (error) => {
        if (mounted) setXrError(error.message);
      },
    });
    controllerRef.current = controller;

    // Attach OrbitControls (enabled only in "orbit" framing mode, and never during XR).
    const camera = controller.getRenderer().getCamera();
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.target.set(
      manifest.camera.target[0],
      manifest.camera.target[1],
      manifest.camera.target[2]
    );
    controls.enabled = cameraModeRef.current === "orbit" && !xrStateRef.current.active;
    controls.update();
    controlsRef.current = controls;

    const handleControlEnd = () => {
      if (cameraModeRef.current !== "orbit" || xrStateRef.current.active) return;
      onCameraCommitRef.current?.({
        position: [round3(camera.position.x), round3(camera.position.y), round3(camera.position.z)],
        target: [round3(controls.target.x), round3(controls.target.y), round3(controls.target.z)],
      });
    };
    controls.addEventListener("end", handleControlEnd);

    // Pointer position -> normalized device coords relative to the canvas (LookAt mode).
    const handlePointerMove = (event: PointerEvent) => {
      if (cameraModeRef.current !== "look-at" || xrStateRef.current.active) return;
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
      mounted = false;
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

  // Toggle OrbitControls vs LookAt mode; OrbitControls stays off during immersive sessions.
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enabled = cameraMode === "orbit" && !xrState.active;
    }
    if (cameraMode === "orbit" && !xrState.active) {
      controllerRef.current?.setLookAtTarget(0, 0);
    }
  }, [cameraMode, xrState.active]);

  // Apply state changes coming from the action bar (and re-apply after a swap).
  useEffect(() => {
    const controller = controllerRef.current;
    if (controller && controller.getState() !== state) {
      controller.playState(state);
    }
  }, [state, modelUrl, rigKey]);

  const handleEnterXR = useCallback((mode: XRMode) => {
    const controller = controllerRef.current;
    if (!controller) return;
    setXrBusy(true);
    setXrError(null);

    void controller
      .enterXR({ mode, domOverlayRoot: xrOverlayRef.current })
      .catch((error: unknown) => {
        setXrError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        setXrBusy(false);
      });
  }, []);

  const handleExitXR = useCallback(() => {
    void controllerRef.current?.exitXR();
  }, []);

  const handleTogglePlacement = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.setXRPlacementMode(!xrStateRef.current.placementActive);
  }, []);

  const handleScaleChange = useCallback((delta: number) => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.setXRScale(xrStateRef.current.xrScale + delta);
  }, []);

  const handleRecenter = useCallback(() => {
    controllerRef.current?.recenterXRPet();
  }, []);

  const handleXRSelectState = useCallback((next: PetState) => {
    controllerRef.current?.playState(next);
  }, []);

  const xrActive = xrState.active;
  const badgeLabel = xrActive
    ? xrState.mode === "immersive-ar"
      ? "Live WebXR · AR"
      : "Live WebXR · VR"
    : "Live WebGL Studio";

  return (
    <section className="viewport-card">
      <div className="canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} className="pet-canvas" aria-label="3D pet preview" />
      </div>
      <span className="viewport-badge">
        <span className="live-dot" /> {badgeLabel}
      </span>
      {!xrActive && onCameraModeChange && (
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
      {!xrActive && (
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
      )}

      <XRControls
        support={xrSupport}
        xrState={xrState}
        busy={xrBusy}
        error={xrError}
        currentState={state}
        overlayRef={xrOverlayRef}
        onEnterXR={handleEnterXR}
        onExitXR={handleExitXR}
        onTogglePlacement={handleTogglePlacement}
        onScaleChange={handleScaleChange}
        onRecenter={handleRecenter}
        onSelectPetState={handleXRSelectState}
        onDismissError={() => setXrError(null)}
      />
    </section>
  );
}
