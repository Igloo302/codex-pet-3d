import * as THREE from "three";
/**
 * Pet3DRenderer - sets up Three.js Scene, PerspectiveCamera, WebGLRenderer, and soft 3-point lighting.
 * Accepts injectable canvas (HTMLCanvasElement or OffscreenCanvas), no hard dependency on global window/document.
 */
export class Pet3DRenderer {
    scene;
    camera;
    renderer;
    lights = [];
    width;
    height;
    animationId = null;
    renderCallback = null;
    constructor(options) {
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
            canvas: canvas,
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
            canvas.addEventListener("resize", this.handleResize.bind(this));
        }
    }
    /**
     * Set up soft 3-point lighting (key, fill, rim)
     */
    setupLighting() {
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
    getScene() {
        return this.scene;
    }
    /**
     * Get the camera
     */
    getCamera() {
        return this.camera;
    }
    /**
     * Get the WebGL renderer
     */
    getRenderer() {
        return this.renderer;
    }
    /**
     * Render a single frame
     */
    render() {
        this.renderer.render(this.scene, this.camera);
        if (this.renderCallback) {
            this.renderCallback();
        }
    }
    /**
     * Start the render loop
     */
    startRenderLoop(callback) {
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
    stopRenderLoop() {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    /**
     * Resize the renderer and camera
     */
    resize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    /**
     * Handle canvas resize event
     */
    handleResize() {
        // This would be called if canvas has resize event
        // The actual resize should be triggered externally with known dimensions
    }
    /**
     * Set background color
     */
    setBackgroundColor(color, alpha = 1) {
        this.renderer.setClearColor(color, alpha);
    }
    /**
     * Set camera position and target
     */
    setCameraPosition(position, target) {
        this.camera.position.copy(position);
        this.camera.lookAt(target);
    }
    /**
     * Dispose of resources
     */
    dispose() {
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
//# sourceMappingURL=Pet3DRenderer.js.map