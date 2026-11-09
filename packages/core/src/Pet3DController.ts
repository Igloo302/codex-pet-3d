import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Pet3DRenderer } from "./Pet3DRenderer";
import { PetStateMachine, isOneShotState } from "./PetStateMachine";
import { LookAtTracker, calculateAngles } from "./LookAtTracker";
import type {
  PetState,
  Pet3DControllerOptions,
  PetStateMachineOptions,
} from "./types";

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
  private readonly lookAtEnabled: boolean;
  private readonly maxYawRad: number;
  private readonly maxPitchRad: number;
  private readonly onStateChange?: (from: PetState, to: PetState) => void;
  private readonly onAnimationFinished?: (state: PetState) => void;
  private isLoaded = false;
  private animationFrameId: number | null = null;
  private lastTime = 0;

  constructor(options: Pet3DControllerOptions) {
    const {
      modelUrl,
      manifest,
      onStateChange,
      onAnimationFinished,
      ...rendererOptions
    } = options;

    // Initialize renderer
    this.renderer = new Pet3DRenderer(rendererOptions);
    const scene = this.renderer.getScene();

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

    // Create animation mixer
    this.mixer = new THREE.AnimationMixer(this.model);

    // Load model
    this.loadModel(modelUrl, manifest.animations).then(() => {
      this.isLoaded = true;
      // Start render loop
      this.startAnimationLoop();
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

    // Add model to scene
    this.renderer.getScene().add(this.model);
    this.model.add(gltf.scene);

    // Find head bone for look-at
    if (this.lookAtEnabled) {
      this.headBone = this.findBone(gltf.scene, this.headBoneName);
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

    if (this.currentAction) {
      // Cross-fade from current to new action
      this.currentAction.crossFadeTo(newAction, 0.3, true);
    } else {
      newAction.play();
    }

    this.currentAction = newAction;
    newAction.reset().play();

    // If it's a one-shot, set up finished callback
    if (isOneShotState(state)) {
      newAction.clampWhenFinished = true;
      newAction.setLoop(THREE.LoopOnce, 1);
    } else {
      newAction.setLoop(THREE.LoopRepeat, Infinity);
    }
  }

  /**
   * Start the animation loop
   */
  private startAnimationLoop(): void {
    this.lastTime = performance.now();
    const animate = (time: number) => {
      this.animationFrameId = requestAnimationFrame(animate);
      const dt = (time - this.lastTime) / 1000; // seconds
      this.lastTime = time;

      this.update(dt);
      this.renderer.render();
    };
    this.animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Update controller (called each frame)
   */
  update(dt: number): void {
    // Update animation mixer
    this.mixer.update(dt);

    // Update look-at tracker
    if (this.lookAtEnabled && this.headBone) {
      const { yaw, pitch } = this.lookAtTracker.update(dt);
      this.applyLookAt(yaw, pitch);
    }

    // Check for finished one-shot animations
    if (this.currentAction && (this.currentAction as any).loop === THREE.LoopOnce) {
      if (this.currentAction.time >= this.currentAction.getClip().duration) {
        this.stateMachine.onAnimationFinishedHandler();
      }
    }
  }

  /**
   * Apply look-at rotation to head bone
   */
  private applyLookAt(yaw: number, pitch: number): void {
    if (!this.headBone) return;

    // Create quaternion from yaw and pitch
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler(pitch, yaw, 0, "YXZ");
    quat.setFromEuler(euler);

    // Apply to head bone (in local space)
    this.headBone.quaternion.slerp(quat, 0.5);
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
   * Dispose of all resources
   */
  dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Stop all actions
    this.actions.forEach((action) => {
      action.stop();
    });

    // Dispose mixer
    this.mixer.uncacheRoot(this.model);

    // Dispose model
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        } else if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        }
      }
    });

    // Dispose renderer
    this.renderer.dispose();

    // Clear maps
    this.animations.clear();
    this.actions.clear();
  }
}

// Re-export calculateAngles for external use
export { calculateAngles };