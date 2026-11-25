import type { Pet3DManifest, StandardAnimationState } from "@codex-pet-3d/spec";

/**
 * Pet state machine types
 */
export type PetState = StandardAnimationState;

export interface PetStateMachineOptions {
  initialState?: PetState;
  onStateChange?: (from: PetState, to: PetState) => void;
  onAnimationFinished?: (state: PetState) => void;
}

/**
 * LookAt tracker configuration
 */
export interface LookAtTrackerOptions {
  maxYawRad: number;
  maxPitchRad: number;
  dampingFactor?: number; // 0-1, higher = more damping (slower)
}

/**
 * Three.js canvas options for renderer
 */
export interface CanvasOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width?: number;
  height?: number;
}

/**
 * Pet3DRenderer configuration
 */
export interface Pet3DRendererOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width?: number;
  height?: number;
  fov?: number;
  backgroundColor?: number;
  backgroundAlpha?: number;
  enableXR?: boolean;
}

/**
 * WebXR immersive session mode.
 */
export type XRMode = "immersive-ar" | "immersive-vr";

/**
 * Capability probe result for WebXR support in the current environment.
 */
export interface WebXRSupportStatus {
  /** True when a WebXR system is present and at least one immersive mode is supported. */
  available: boolean;
  /** True when the page is running in a secure context (HTTPS or localhost). */
  secureContext: boolean;
  arSupported: boolean;
  vrSupported: boolean;
  preferredMode: XRMode | null;
  /** Human-readable explanation when support is unavailable or degraded. */
  reason?: string;
}

/**
 * Options for entering an immersive WebXR session.
 */
export interface XRSessionOptions {
  mode?: XRMode;
  domOverlayRoot?: HTMLElement | null;
  xrScale?: number;
  placementDistance?: number;
  referenceSpaceType?: XRReferenceSpaceType;
}

/**
 * Live state of an active (or idle) WebXR session.
 */
export interface XRSessionState {
  active: boolean;
  mode: XRMode | null;
  placementActive: boolean;
  surfaceDetected: boolean;
  xrScale: number;
}

/**
 * Pet3DController configuration
 */
export interface Pet3DControllerOptions extends Pet3DRendererOptions {
  modelUrl: string;
  manifest: {
    scale: number;
    camera: {
      fov: number;
      position: [number, number, number];
      target: [number, number, number];
    };
    lookAt: {
      enabled: boolean;
      headBone: string;
      maxYawDeg: number;
      maxPitchDeg: number;
    };
    animations: Record<PetState, { clip: string; loop: boolean }>;
  };
  onStateChange?: (from: PetState, to: PetState) => void;
  onAnimationFinished?: (state: PetState) => void;
  onLoadError?: (error: Error) => void;
  onXRSessionChange?: (state: XRSessionState) => void;
  onXRError?: (error: Error) => void;
  autoStartLoop?: boolean;
  maxFps?: number;
}

/**
 * Converts a canonical snake_case `Pet3DManifest` into `Pet3DControllerOptions["manifest"]`.
 */
export function toControllerManifest(
  specManifest: Pet3DManifest
): Pet3DControllerOptions["manifest"] {
  return {
    scale: specManifest.scale,
    camera: {
      fov: specManifest.camera.fov,
      position: specManifest.camera.position,
      target: specManifest.camera.target,
    },
    lookAt: {
      enabled: specManifest.look_at.enabled,
      headBone: specManifest.look_at.head_bone,
      maxYawDeg: specManifest.look_at.max_yaw_deg,
      maxPitchDeg: specManifest.look_at.max_pitch_deg,
    },
    animations: specManifest.animations,
  };
}

/**
 * Animation action with cross-fade support
 */
export interface AnimationAction {
  name: PetState;
  action: THREE.AnimationAction;
  loop: boolean;
}