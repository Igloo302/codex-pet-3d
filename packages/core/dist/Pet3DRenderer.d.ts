import * as THREE from "three";
import type { Pet3DRendererOptions } from "./types";
/**
 * Pet3DRenderer - sets up Three.js Scene, PerspectiveCamera, WebGLRenderer, and soft 3-point lighting.
 * Accepts injectable canvas (HTMLCanvasElement or OffscreenCanvas), no hard dependency on global window/document.
 */
export declare class Pet3DRenderer {
    private readonly scene;
    private readonly camera;
    private readonly renderer;
    private readonly lights;
    private readonly width;
    private readonly height;
    private animationId;
    private renderCallback;
    constructor(options: Pet3DRendererOptions);
    /**
     * Set up soft 3-point lighting (key, fill, rim)
     */
    private setupLighting;
    /**
     * Get the Three.js scene
     */
    getScene(): THREE.Scene;
    /**
     * Get the camera
     */
    getCamera(): THREE.PerspectiveCamera;
    /**
     * Get the WebGL renderer
     */
    getRenderer(): THREE.WebGLRenderer;
    /**
     * Render a single frame
     */
    render(): void;
    /**
     * Start the render loop
     */
    startRenderLoop(callback?: () => void): void;
    /**
     * Stop the render loop
     */
    stopRenderLoop(): void;
    /**
     * Resize the renderer and camera
     */
    resize(width: number, height: number): void;
    /**
     * Handle canvas resize event
     */
    private handleResize;
    /**
     * Set background color
     */
    setBackgroundColor(color: number, alpha?: number): void;
    /**
     * Set camera position and target
     */
    setCameraPosition(position: THREE.Vector3, target: THREE.Vector3): void;
    /**
     * Dispose of resources
     */
    dispose(): void;
}
//# sourceMappingURL=Pet3DRenderer.d.ts.map