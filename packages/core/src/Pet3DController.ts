import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Pet3DRenderer } from "./Pet3DRenderer.js";
import { PetStateMachine, isOneShotState } from "./PetStateMachine.js";
import { LookAtTracker, calculateAngles } from "./LookAtTracker.js";
import { PetXRManager } from "./WebXRManager.js";
import type {
  PetState,
  Pet3DControllerOptions,
  PetStateMachineOptions,
  XRSessionOptions,
  XRSessionState,
} from "./types.js";

/**
 * Pet3DController - orchestrates Three.js scene, GLTFLoader, AnimationMixer cross-fading,
 * bone look-at rotation, and state machine.
 */
export class Pet3DController {
  private readonly renderer: Pet3DRenderer;
  private readonly stateMachine: PetStateMachine;
  private readonly lookAtTracker: LookAtTracker;
  private readonly mixer: THREE.AnimationMixer;
  private readonly model: THREE.Group;
  private readonly animations: Map<PetState, THREE.AnimationClip> = new Map();
  private readonly actions: Map<PetState, THREE.AnimationAction> = new Map();
  private currentAction: THREE.AnimationAction | null = null;
  private readonly headBoneName: string;
  private headBone: THREE.Bone | null = null;
  private headBaseQuaternion: THREE.Quaternion | null = null;
  private readonly lookAtEnabled: boolean;
  private readonly maxYawRad: number;
  private readonly maxPitchRad: number;
  private readonly onStateChange?: (from: PetState, to: PetState) => void;
  private readonly onAnimationFinished?: (state: PetState) => void;
  private readonly onLoadError?: (error: Error) => void;
  private readonly onXRSessionChange?: (state: XRSessionState) => void;
  private readonly onXRError?: (error: Error) => void;
  private xrManager: PetXRManager | null = null;
  private isLoaded = false;
  private disposed = false;
  private readonly autoStartLoop: boolean;
  private readonly minFrameMs: number;
  private animationFrameId: number | null = null;
  private loopRunning = false;
  private lastTime = 0;
  private readonly xrReactions: PetState[] = ["waving", "jumping", "running", "review"];
  private xrReactionIndex = 0;
  private readonly tmpEuler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly handleMixerFinished: (event: { action: THREE.AnimationAction }) => void;

  constructor(options: Pet3DControllerOptions) {
    const {
      modelUrl,
      manifest,
      onStateChange,
      onAnimationFinished,
      onLoadError,
      onXRSessionChange,
      onXRError,
      autoStartLoop = true,
      maxFps,
      ...rendererOptions
    } = options;

    this.autoStartLoop = autoStartLoop;
    this.minFrameMs = maxFps && maxFps > 0 ? 1000 / maxFps : 0;

    // Initialize renderer
    this.renderer = new Pet3DRenderer(rendererOptions);

    // Set camera from manifest
    const [camX, camY, camZ] = manifest.camera.position;
    const [targetX, targetY, targetZ] = manifest.camera.target;
    this.renderer.setCameraPosition(
      new THREE.Vector3(camX, camY, camZ),
      new THREE.Vector3(targetX, targetY, targetZ)
    );
    this.renderer.getCamera().fov = manifest.camera.fov;
    this.renderer.getCamera().updateProjectionMatrix();

    // Scale from manifest
    this.model = new THREE.Group();
    this.model.scale.setScalar(manifest.scale);

    // Setup look-at
    this.lookAtEnabled = manifest.lookAt.enabled;
    this.headBoneName = manifest.lookAt.headBone;
    this.maxYawRad = THREE.MathUtils.degToRad(manifest.lookAt.maxYawDeg);
    this.maxPitchRad = THREE.MathUtils.degToRad(manifest.lookAt.maxPitchDeg);

    this.lookAtTracker = new LookAtTracker({
      maxYawRad: this.maxYawRad,
      maxPitchRad: this.maxPitchRad,
      dampingFactor: 0.15,
    });

    // Setup state machine
    this.stateMachine = new PetStateMachine({
      initialState: "idle",
      onStateChange: (from, to) => {
        this.onStateChange?.(from, to);
        this.crossFadeToState(to);
      },
      onAnimationFinished: (state) => {
        this.onAnimationFinished?.(state);
      },
    });

    this.onStateChange = onStateChange;
    this.onAnimationFinished = onAnimationFinished;
    this.onLoadError = onLoadError;
    this.onXRSessionChange = onXRSessionChange;
    this.onXRError = onXRError;

    // Integrate the WebXR manager only when the renderer exposes the underlying Three.js
    // renderer (minimal test doubles omit it, so XR stays disabled there).
    const rendererForXR = this.renderer as Partial<Pet3DRenderer>;
    if (typeof rendererForXR.getRenderer === "function") {
      this.xrManager = new PetXRManager({
        renderer: this.renderer,
        petRoot: this.model,
        getHeadWorldPosition: () => this.getHeadWorldPosition(),
        onLookAtTarget: (x, y) => this.setLookAtTarget(x, y),
        onTriggerReaction: () => this.triggerXRReaction(),
        onStateChange: (state) => this.onXRSessionChange?.(state),
        maxYawRad: this.maxYawRad,
        maxPitchRad: this.maxPitchRad,
        baseScale: manifest.scale,
      });
    }

    // Create animation mixer and listen for one-shot completion
    this.mixer = new THREE.AnimationMixer(this.model);
    this.handleMixerFinished = (event) => {
      if (event.action === this.currentAction) {
        this.stateMachine.onAnimationFinishedHandler();
      }
    };
    this.mixer.addEventListener("finished", this.handleMixerFinished);

    // Load model with disposal guard and error handling
    this.loadModel(modelUrl, manifest.animations)
      .then(() => {
        if (this.disposed) return;
        this.isLoaded = true;
        if (this.autoStartLoop) {
          this.startAnimationLoop();
        }
      })
      .catch((error: unknown) => {
        if (this.disposed) return;
        const err = error instanceof Error ? error : new Error(String(error));
        if (this.onLoadError) {
          this.onLoadError(err);
        } else {
          console.error("[Pet3DController] Failed to load model:", err);
        }
      });
  }

  /**
   * Load GLTF model and setup animations
   */
  private async loadModel(
    modelUrl: string,
    animationMap: Record<PetState, { clip: string; loop: boolean }>
  ): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(modelUrl);

    if (this.disposed) {
      this.disposeObject3D(gltf.scene);
      return;
    }

    // Add model to scene
    this.renderer.getScene().add(this.model);
    this.model.add(gltf.scene);

    // Find head bone for look-at and preserve its rest rotation
    if (this.lookAtEnabled) {
      this.headBone = this.findBone(gltf.scene, this.headBoneName);
      this.headBaseQuaternion = this.headBone ? this.headBone.quaternion.clone() : null;
    }

    // Store animation clips and create actions
    if (gltf.animations && gltf.animations.length > 0) {
      for (const [state, config] of Object.entries(animationMap)) {
        const clip = gltf.animations.find((c) => c.name === config.clip);
        if (clip) {
          clip.tracks = clip.tracks.filter((track) => {
            // Filter out tracks that might conflict with head bone if look-at is enabled
            if (this.lookAtEnabled && this.headBone) {
              return !track.name.startsWith(this.headBoneName + ".");
            }
            return true;
          });

          this.animations.set(state as PetState, clip);
          const action = this.mixer.clipAction(clip);
          action.loop = config.loop ? THREE.LoopRepeat : THREE.LoopOnce;
          action.clampWhenFinished = !config.loop;
          this.actions.set(state as PetState, action);
        }
      }
    }

    // Play initial idle state
    const idleAction = this.actions.get("idle");
    if (idleAction) {
      idleAction.play();
      this.currentAction = idleAction;
    }
  }

  /**
   * Find a bone by name in the scene graph
   */
  private findBone(object: THREE.Object3D, name: string): THREE.Bone | null {
    let result: THREE.Bone | null = null;
    object.traverse((child) => {
      if (child instanceof THREE.Bone && child.name === name) {
        result = child;
      }
    });
    return result;
  }

  /**
   * Cross-fade to a new state
   */
  private crossFadeToState(state: PetState): void {
    const newAction = this.actions.get(state);
    if (!newAction || newAction === this.currentAction) {
      return;
    }

    // Configure loop mode before playing
    if (isOneShotState(state)) {
      newAction.clampWhenFinished = true;
      newAction.setLoop(THREE.LoopOnce, 1);
    } else {
      newAction.setLoop(THREE.LoopRepeat, Infinity);
    }

    newAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();

    if (this.currentAction) {
      this.currentAction.crossFadeTo(newAction, 0.3, true);
    }

    this.currentAction = newAction;
  }

  /**
   * Start the animation loop
   */
  startAnimationLoop(): void {
    if (this.loopRunning || this.disposed) return;
    this.loopRunning = true;
    this.lastTime = performance.now();

    const animate = (time: number, xrFrame?: XRFrame) => {
      if (this.disposed) {
        this.loopRunning = false;
        return;
      }
      const presenting = this.renderer.isPresentingXR?.() ?? false;
      const elapsedMs = time - this.lastTime;
      if (!presenting && this.minFrameMs > 0 && elapsedMs < this.minFrameMs) {
        return; // Throttle; keep lastTime so elapsed time accumulates.
      }
      const dt = Math.min(Math.max(elapsedMs / 1000, 0), 0.1);
      this.lastTime = time;

      // Feed the 3D headset LookAt before updating so it lands on the same frame.
      this.xrManager?.onXRFrame(xrFrame);
      this.update(dt);
      this.renderer.render();
    };

    if (typeof (this.renderer as Partial<Pet3DRenderer>).setAnimationLoop === "function") {
      this.renderer.setAnimationLoop(animate);
    } else {
      const rafLoop = (time: number) => {
        this.animationFrameId = requestAnimationFrame(rafLoop);
        animate(time);
      };
      this.animationFrameId = requestAnimationFrame(rafLoop);
    }
  }

  /**
   * Stop the animation loop
   */
  stopAnimationLoop(): void {
    this.loopRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (typeof (this.renderer as Partial<Pet3DRenderer>).setAnimationLoop === "function") {
      this.renderer.setAnimationLoop(null);
    }
  }

  /**
   * Update controller (called each frame)
   */
  update(dt: number): void {
    if (this.disposed) return;

    // Update animation mixer
    this.mixer.update(dt);

    // Update look-at tracker
    if (this.lookAtEnabled && this.headBone) {
      const { yaw, pitch } = this.lookAtTracker.update(dt);
      this.applyLookAt(yaw, pitch);
    }
  }

  /**
   * Apply look-at rotation to head bone (pitch > 0 tilts head up, matching SpritesheetBaker)
   */
  private applyLookAt(yaw: number, pitch: number): void {
    if (!this.headBone) return;

    this.tmpEuler.set(-pitch, yaw, 0, "YXZ");
    this.tmpQuat.setFromEuler(this.tmpEuler);

    if (this.headBaseQuaternion) {
      this.headBone.quaternion.copy(this.headBaseQuaternion).multiply(this.tmpQuat);
    } else {
      this.headBone.quaternion.copy(this.tmpQuat);
    }
  }

  /**
   * Set look-at target (normalized -1 to 1)
   */
  setLookAtTarget(x: number, y: number): void {
    if (this.lookAtEnabled) {
      this.lookAtTracker.setTarget(x, y);
    }
  }

  /**
   * Play a specific state
   */
  playState(state: PetState): void {
    this.stateMachine.playState(state);
  }

  /**
   * Get current state
   */
  getState(): PetState {
    return this.stateMachine.getState();
  }

  /**
   * Get the renderer
   */
  getRenderer(): Pet3DRenderer {
    return this.renderer;
  }

  /**
   * Enter an immersive WebXR session (immersive-ar or immersive-vr).
   */
  async enterXR(options?: XRSessionOptions): Promise<XRSessionState> {
    if (!this.xrManager) {
      throw new Error("WebXR is not available with this renderer.");
    }
    try {
      return await this.xrManager.enterXR(options);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onXRError?.(err);
      throw err;
    }
  }

  /**
   * Exit the active WebXR session, if any.
   */
  exitXR(): Promise<void> {
    return this.xrManager ? this.xrManager.exitXR() : Promise.resolve();
  }

  /**
   * Current WebXR session state.
   */
  getXRState(): XRSessionState {
    return this.xrManager?.getState() ?? {
      active: false,
      mode: null,
      placementActive: false,
      surfaceDetected: false,
      xrScale: 1,
    };
  }

  /**
   * Toggle AR surface placement mode while in an immersive-ar session.
   */
  setXRPlacementMode(enabled: boolean): void {
    this.xrManager?.setPlacementMode(enabled);
  }

  /**
   * Set the XR scale multiplier (clamped to [0.15, 2.0]).
   */
  setXRScale(scale: number): void {
    this.xrManager?.setXRScale(scale);
  }

  /**
   * Recenter the pet in front of the current XR camera.
   */
  recenterXRPet(): void {
    this.xrManager?.recenterPet();
  }

  /**
   * World position of the head bone (falls back to the model root before load).
   */
  private getHeadWorldPosition(): THREE.Vector3 {
    const position = new THREE.Vector3();
    if (this.headBone) {
      this.headBone.getWorldPosition(position);
    } else {
      this.model.getWorldPosition(position);
    }
    return position;
  }

  /**
   * Cycle a playful reaction state on XR tap/trigger.
   */
  private triggerXRReaction(): void {
    const state = this.xrReactions[this.xrReactionIndex % this.xrReactions.length];
    this.xrReactionIndex += 1;
    this.playState(state);
  }

  /**
   * Resize the renderer
   */
  resize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }

  /**
   * Dispose of a loaded Object3D's geometries, materials, and textures
   */
  private disposeObject3D(root: THREE.Object3D): void {
    const disposeMaterial = (material: THREE.Material) => {
      const mat = material as unknown as Record<string, unknown>;
      for (const value of Object.values(mat)) {
        if (value instanceof THREE.Texture) {
          value.dispose();
        }
      }
      material.dispose();
    };

    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          disposeMaterial(child.material);
        } else if (Array.isArray(child.material)) {
          child.material.forEach(disposeMaterial);
        }
      }
    });
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.stopAnimationLoop();
    this.xrManager?.dispose();
    this.xrManager = null;
    this.mixer.removeEventListener("finished", this.handleMixerFinished);

    // Stop all actions
    this.actions.forEach((action) => {
      action.stop();
    });

    // Dispose mixer
    this.mixer.uncacheRoot(this.model);

    // Dispose model geometries, materials, and textures
    this.disposeObject3D(this.model);

    // Dispose renderer
    this.renderer.dispose();

    // Clear maps
    this.animations.clear();
    this.actions.clear();
    this.headBone = null;
    this.headBaseQuaternion = null;
  }
}

// Re-export calculateAngles for external use
export { calculateAngles };