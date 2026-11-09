import { useEffect, useRef } from "react";
import {
  Pet3DController,
  type Pet3DControllerOptions,
  type PetState,
} from "@codex-pet-3d/core";

export interface PetViewportProps {
  /** URL of the .glb to load (sample asset URL or a blob: URL from a drop). */
  modelUrl: string;
  manifest: Pet3DControllerOptions["manifest"];
  state: PetState;
  onStateChange?: (state: PetState) => void;
}

const clampUnit = (value: number) => Math.max(-1, Math.min(1, value));

/**
 * Mounts a canvas, boots the core Pet3DController on it, and drives the
 * LookAt target from pointer movement expressed in normalized (-1..1) coords.
 */
export function PetViewport({
  modelUrl,
  manifest,
  state,
  onStateChange,
}: PetViewportProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<Pet3DController | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

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
    });
    controllerRef.current = controller;

    // Pointer position -> normalized device coords relative to the canvas.
    const handlePointerMove = (event: PointerEvent) => {
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
      controller.dispose();
      controllerRef.current = null;
    };
  }, [modelUrl, manifest]);

  // Apply state changes coming from the action bar (and re-apply after a swap).
  useEffect(() => {
    const controller = controllerRef.current;
    if (controller && controller.getState() !== state) {
      controller.playState(state);
    }
  }, [state, modelUrl]);

  return (
    <section className="viewport-card">
      <div className="canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} className="pet-canvas" aria-label="3D pet preview" />
      </div>
      <span className="viewport-badge">
        <span className="live-dot" /> Live WebGL preview
      </span>
      <span className="viewport-hint">
        Move your <kbd>cursor</kbd> — the head follows via LookAt damping
      </span>
    </section>
  );
}
