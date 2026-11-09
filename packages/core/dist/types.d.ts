import type { StandardAnimationState } from "@codex-pet-3d/spec";
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
    dampingFactor?: number;
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
        animations: Record<PetState, {
            clip: string;
            loop: boolean;
        }>;
    };
    onStateChange?: (from: PetState, to: PetState) => void;
    onAnimationFinished?: (state: PetState) => void;
}
/**
 * Animation action with cross-fade support
 */
export interface AnimationAction {
    name: PetState;
    action: THREE.AnimationAction;
    loop: boolean;
}
//# sourceMappingURL=types.d.ts.map