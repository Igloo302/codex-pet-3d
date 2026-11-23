import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Pet3DRenderer } from "./Pet3DRenderer.js";
import { PetStateMachine, isOneShotState } from "./PetStateMachine.js";
import { LookAtTracker, calculateAngles } from "./LookAtTracker.js";
import type {
  PetState,
  Pet3DControllerOptions,
  PetStateMachineOptions,
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
  private isLoaded = false;
  private disposed = false;
  private readonly autoStartLoop: boolean;
  private readonly minFrameMs: number;
  private animationFrameId: number | null = null;
  private lastTime = 0;
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
    if (this.animationFrameId !== null || this.disposed) return;
    this.lastTime = performance.now();
    const animate = (time: number) => {
      if (this.disposed) return;
      this.animationFrameId = requestAnimationFrame(animate);
      const elapsedMs = time - this.lastTime;
      if (this.minFrameMs > 0 && elapsedMs < this.minFrameMs) {
        return;
      }
      const dt = elapsedMs / 1000; // seconds
      this.lastTime = time;

      this.update(dt);
      this.renderer.render();
    };
    this.animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Stop the animation loop
   */
  stopAnimationLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
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