import * as THREE from "three";
import type { Pet3DRendererOptions } from "./types";

/**
 * Pet3DRenderer - sets up Three.js Scene, PerspectiveCamera, WebGLRenderer, and soft 3-point lighting.
 * Accepts injectable canvas (HTMLCanvasElement or OffscreenCanvas), no hard dependency on global window/document.
 */
export class Pet3DRenderer {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly lights: THREE.Light[] = [];
  private readonly width: number;
  private readonly height: number;
  private animationId: number | null = null;
  private renderCallback: (() => void) | null = null;

  constructor(options: Pet3DRendererOptions) {
    const { canvas, width = 800, height = 600, fov = 45, backgroundColor = 0x000000, backgroundAlpha = 0 } = options;

    this.width = width;
    this.height = height;

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    this.camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 100);
    this.camera.position.set(0, 1.2, 2.5);
    this.camera.lookAt(0, 0.4, 0);

    // Create renderer with injected canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas as HTMLCanvasElement,
      antialias: true,
      alpha: backgroundAlpha < 1,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(typeof window !== "undefined" ? window.devicePixelRatio : 1);
    this.renderer.setClearColor(backgroundColor, backgroundAlpha);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Setup 3-point lighting
    this.setupLighting();

    // Handle resize if canvas supports it
    if ("addEventListener" in canvas) {
      (canvas as EventTarget).addEventListener("resize", this.handleResize.bind(this));
    }
  }

  /**
   * Set up soft 3-point lighting (key, fill, rim)
   */
  private setupLighting(): void {
    // Key light - main directional light
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(2, 3, 2);
    keyLight.castShadow = false;
    this.scene.add(keyLight);
    this.lights.push(keyLight);

    // Fill light - softer, opposite side
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-2, 1.5, 1);
    this.scene.add(fillLight);
    this.lights.push(fillLight);

    // Rim light - backlight for edge definition
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
    rimLight.position.set(0, 2, -3);
    this.scene.add(rimLight);
    this.lights.push(rimLight);

    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambientLight);
    this.lights.push(ambientLight);
  }

  /**
   * Get the Three.js scene
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Get the camera
   */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /**
   * Get the WebGL renderer
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  /**
   * Render a single frame
   */
  render(): void {
    this.renderer.render(this.scene, this.camera);
    if (this.renderCallback) {
      this.renderCallback();
    }
  }

  /**
   * Start the render loop
   */
  startRenderLoop(callback?: () => void): void {
    this.renderCallback = callback ?? null;
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      this.render();
    };
    animate();
  }

  /**
   * Stop the render loop
   */
  stopRenderLoop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Resize the renderer and camera
   */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Handle canvas resize event
   */
  private handleResize(): void {
    // This would be called if canvas has resize event
    // The actual resize should be triggered externally with known dimensions
  }

  /**
   * Set background color
   */
  setBackgroundColor(color: number, alpha: number = 1): void {
    this.renderer.setClearColor(color, alpha);
  }

  /**
   * Set camera position and target
   */
  setCameraPosition(position: THREE.Vector3, target: THREE.Vector3): void {
    this.camera.position.copy(position);
    this.camera.lookAt(target);
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stopRenderLoop();

    // Dispose lights
    this.lights.forEach((light) => {
      if (light instanceof THREE.DirectionalLight) {
        light.dispose();
      }
    });

    // Dispose renderer
    this.renderer.dispose();

    // Clear scene
    this.scene.clear();
  }
}