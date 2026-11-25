import * as THREE from "three";
import type { Pet3DRenderer } from "./Pet3DRenderer.js";
import { calculateWorldLookAtTarget } from "./LookAtTracker.js";
import type { WebXRSupportStatus, XRMode, XRSessionOptions, XRSessionState } from "./types.js";

const MIN_XR_SCALE = 0.15;
const MAX_XR_SCALE = 2.0;

const VR_BACKGROUND_COLOR = 0x070b14;
const VR_DEFAULT_DISTANCE = 1.5;
const VR_DEFAULT_SCALE = 0.6;
const AR_DEFAULT_DISTANCE = 1.2;
const AR_DEFAULT_SCALE = 0.45;
const AR_PET_HEIGHT = -0.35;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const describeError = (err: unknown): string => {
  if (err instanceof Error) {
    return err.name && err.name !== "Error" ? `${err.name}: ${err.message}` : err.message;
  }
  return String(err);
};

/**
 * Returns the WebXR system when the environment exposes one. Safe in Node where
 * `navigator` may be undefined.
 */
function getXRSystem(): XRSystem | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { xr?: XRSystem };
  return nav.xr ?? null;
}

/**
 * Recursively dispose geometries, materials and textures belonging to an object graph.
 */
function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
      child.geometry?.dispose();
      const material = child.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) {
        material.forEach((mat) => mat.dispose());
      } else if (material) {
        material.dispose();
      }
    }
  });
}

/**
 * Probe the current environment for WebXR immersive session support.
 *
 * Safe to call in Node (no `window`/`navigator` globals required) and tolerant of browsers
 * that expose `navigator.xr` but reject `isSessionSupported` (for example because the page
 * is served over plain HTTP or a permission policy blocks the feature).
 */
export async function checkXRSupport(): Promise<WebXRSupportStatus> {
  const secureContext = typeof window !== "undefined" ? window.isSecureContext !== false : true;
  const xr = getXRSystem();

  if (!xr) {
    return {
      available: false,
      secureContext,
      arSupported: false,
      vrSupported: false,
      preferredMode: null,
      reason: secureContext
        ? "WebXR is not available in this browser. Use a WebXR-capable browser or the Immersive Web Emulator extension."
        : "WebXR requires a secure context. Serve the studio over HTTPS or http://localhost.",
    };
  }

  const reasons: string[] = [];
  let arSupported = false;
  let vrSupported = false;

  try {
    arSupported = await xr.isSessionSupported("immersive-ar");
  } catch (err) {
    reasons.push(`immersive-ar unavailable (${describeError(err)}).`);
  }

  try {
    vrSupported = await xr.isSessionSupported("immersive-vr");
  } catch (err) {
    reasons.push(`immersive-vr unavailable (${describeError(err)}).`);
  }

  if (!secureContext) {
    reasons.push("WebXR requires a secure context. Serve the studio over HTTPS or http://localhost.");
  }

  const preferredMode: XRMode | null = arSupported
    ? "immersive-ar"
    : vrSupported
      ? "immersive-vr"
      : null;

  if (!preferredMode && reasons.length === 0) {
    reasons.push(
      "This device or browser does not support immersive AR or VR sessions. Connect a headset or install the Immersive Web Emulator."
    );
  }

  return {
    available: arSupported || vrSupported,
    secureContext,
    arSupported,
    vrSupported,
    preferredMode,
    reason: reasons.length > 0 ? reasons.join(" ") : undefined,
  };
}

export interface PetXRManagerOptions {
  renderer: Pet3DRenderer;
  petRoot: THREE.Group;
  getHeadWorldPosition: () => THREE.Vector3;
  onLookAtTarget: (x: number, y: number) => void;
  onTriggerReaction: () => void;
  onStateChange?: (state: XRSessionState) => void;
  maxYawRad: number;
  maxPitchRad: number;
  baseScale: number;
}

interface XRSnapshot {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  sceneBackground: THREE.Color | THREE.Texture | THREE.CubeTexture | null;
  clearColor: THREE.Color;
  clearAlpha: number;
  cameraPosition: THREE.Vector3;
  cameraQuaternion: THREE.Quaternion;
  fov: number;
}

/**
 * Coordinates immersive-ar and immersive-vr sessions with a `Pet3DRenderer` and the pet model.
 * Handles the session lifecycle, hit-test surface placement (AR), grounded studio staging (VR),
 * controller interaction, 3D gaze LookAt, scale and recentering.
 */
export class PetXRManager {
  private readonly renderer: Pet3DRenderer;
  private readonly petRoot: THREE.Group;
  private readonly getHeadWorldPosition: () => THREE.Vector3;
  private readonly onLookAtTarget: (x: number, y: number) => void;
  private readonly onTriggerReaction: () => void;
  private readonly onStateChange?: (state: XRSessionState) => void;
  private readonly maxYawRad: number;
  private readonly maxPitchRad: number;
  private readonly baseScale: number;

  private session: XRSession | null = null;
  private mode: XRMode | null = null;
  private placementActive = false;
  private surfaceDetected = false;
  private xrScale = 1;
  private placementDistance = VR_DEFAULT_DISTANCE;

  private snapshot: XRSnapshot | null = null;
  private hitTestSource: XRHitTestSource | null = null;

  private vrStage: THREE.Group | null = null;
  private reticle: THREE.Group | null = null;
  private controller0: THREE.Group | null = null;
  private controller1: THREE.Group | null = null;
  private rayLines: THREE.Line[] = [];
  private onSelectHandler: (() => void) | null = null;
  private onSqueezeHandler: (() => void) | null = null;

  private readonly handleSessionEndBound = () => this.handleSessionEnd();

  constructor(options: PetXRManagerOptions) {
    this.renderer = options.renderer;
    this.petRoot = options.petRoot;
    this.getHeadWorldPosition = options.getHeadWorldPosition;
    this.onLookAtTarget = options.onLookAtTarget;
    this.onTriggerReaction = options.onTriggerReaction;
    this.onStateChange = options.onStateChange;
    this.maxYawRad = options.maxYawRad;
    this.maxPitchRad = options.maxPitchRad;
    this.baseScale = options.baseScale;
  }

  /**
   * Enter an immersive WebXR session, resolving the desired mode when not specified.
   */
  async enterXR(options: XRSessionOptions = {}): Promise<XRSessionState> {
    const xrSystem = getXRSystem();
    if (!xrSystem) {
      throw new Error(
        "WebXR is not available in this environment. Use a WebXR-capable browser over HTTPS or http://localhost."
      );
    }

    // Starting a second session while one is active is not allowed; restart cleanly.
    if (this.session) {
      await this.exitXR();
    }

    const support = await checkXRSupport();
    const mode: XRMode | null = options.mode ?? support.preferredMode;
    if (!mode) {
      throw new Error(
        "No immersive WebXR mode is available on this device. Connect a headset or install the Immersive Web Emulator."
      );
    }
    if (mode === "immersive-ar" && !support.arSupported) {
      throw new Error("immersive-ar is not supported by this device or browser.");
    }
    if (mode === "immersive-vr" && !support.vrSupported) {
      throw new Error("immersive-vr is not supported by this device or browser.");
    }

    const wasXREnabled = this.renderer.isXREnabled();
    this.renderer.setXREnabled(true);

    const referenceSpaceType: XRReferenceSpaceType =
      options.referenceSpaceType ?? "local-floor";
    const sessionInit = this.buildSessionInit(mode, options);

    this.snapshot = this.captureSnapshot();

    let session: XRSession;
    try {
      session = await xrSystem.requestSession(mode, sessionInit);
    } catch (err) {
      this.snapshot = null;
      this.renderer.setXREnabled(wasXREnabled);
      throw new Error(`Failed to start an ${mode} session: ${describeError(err)}`);
    }

    this.session = session;
    this.mode = mode;
    this.placementDistance =
      options.placementDistance ?? (mode === "immersive-ar" ? AR_DEFAULT_DISTANCE : VR_DEFAULT_DISTANCE);
    this.xrScale = clamp(
      options.xrScale ?? (mode === "immersive-ar" ? AR_DEFAULT_SCALE : VR_DEFAULT_SCALE),
      MIN_XR_SCALE,
      MAX_XR_SCALE
    );

    try {
      await this.bindSession(session, referenceSpaceType);
      if (mode === "immersive-vr") {
        this.configureVR(this.placementDistance);
      } else {
        this.configureAR(this.placementDistance);
      }
      this.setupControllers(mode);
      session.addEventListener("end", this.handleSessionEndBound);
    } catch (err) {
      this.session = null;
      this.mode = null;
      try {
        void session.end();
      } catch {
        // The session may already be finished.
      }
      this.restoreSnapshot();
      this.renderer.setXREnabled(wasXREnabled);
      throw err instanceof Error ? err : new Error(String(err));
    }

    this.notifyStateChange();
    return this.getState();
  }

  /**
   * Per-frame update driven by the renderer animation loop.
   */
  onXRFrame(frame?: XRFrame): void {
    if (!this.session) return;

    this.updateLookAt();

    if (this.mode !== "immersive-ar" || !this.hitTestSource || !this.placementActive || !frame) {
      return;
    }

    const referenceSpace = this.renderer.getRenderer().xr.getReferenceSpace();
    if (!referenceSpace) return;

    const results = frame.getHitTestResults(this.hitTestSource);
    if (results.length > 0) {
      const pose = results[0].getPose(referenceSpace);
      if (pose && this.reticle) {
        const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
        matrix.decompose(this.reticle.position, this.reticle.quaternion, this.reticle.scale);
        this.reticle.visible = true;
        if (!this.surfaceDetected) {
          this.surfaceDetected = true;
          this.notifyStateChange();
        }
      }
    } else if (this.surfaceDetected) {
      this.surfaceDetected = false;
      if (this.reticle) this.reticle.visible = false;
      this.notifyStateChange();
    }
  }

  /**
   * Toggle AR placement mode. Only meaningful while in an immersive-ar session; in other
   * modes the request is ignored.
   */
  setPlacementMode(enabled: boolean): void {
    this.placementActive = enabled && this.mode === "immersive-ar";
    if (this.reticle) {
      this.reticle.visible = this.placementActive && this.surfaceDetected;
    }
    this.notifyStateChange();
  }

  /**
   * Set the XR scale multiplier, clamped to [0.15, 2.0].
   */
  setXRScale(scale: number): void {
    this.xrScale = clamp(scale, MIN_XR_SCALE, MAX_XR_SCALE);
    if (this.session) {
      this.petRoot.scale.setScalar(this.baseScale * this.xrScale);
    }
    this.notifyStateChange();
  }

  /**
   * Place the pet a comfortable distance in front of the current XR camera, facing the user.
   */
  recenterPet(): void {
    if (!this.session) return;

    const camera = this.renderer.getRenderer().xr.getCamera();
    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      camera.getWorldQuaternion(new THREE.Quaternion())
    );
    forward.y = 0;
    if (forward.lengthSq() < 1e-4) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }
    const target = cameraPosition
      .clone()
      .add(forward.multiplyScalar(this.placementDistance));
    target.y = this.mode === "immersive-ar" ? AR_PET_HEIGHT : 0;

    this.petRoot.position.copy(target);
    this.petRoot.quaternion.setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.atan2(cameraPosition.x - target.x, cameraPosition.z - target.z)
    );

    this.notifyStateChange();
  }

  /**
   * End the active session, if any.
   */
  async exitXR(): Promise<void> {
    const session = this.session;
    if (!session) return;
    try {
      await session.end();
    } catch {
      // The session may have already ended.
    }
    if (this.session) {
      this.handleSessionEnd();
    }
  }

  /**
   * Current XR session state.
   */
  getState(): XRSessionState {
    return {
      active: this.session != null,
      mode: this.mode,
      placementActive: this.placementActive,
      surfaceDetected: this.surfaceDetected,
      xrScale: this.xrScale,
    };
  }

  /**
   * End any active session and release every XR helper, controller and listener.
   */
  dispose(): void {
    const session = this.session;
    if (session) {
      try {
        void session.end();
      } catch {
        // Cleanup below is idempotent even if the session rejects.
      }
    }
    this.handleSessionEnd();
    this.cleanupSceneHelpers();
    this.removeControllerListeners();
  }

  private buildSessionInit(mode: XRMode, options: XRSessionOptions): XRSessionInit {
    if (mode === "immersive-ar") {
      const sessionInit: XRSessionInit = {
        optionalFeatures: [
          "local-floor",
          "bounded-floor",
          "hit-test",
          "dom-overlay",
          "hand-tracking",
          "layers",
        ],
      };
      if (options.domOverlayRoot) {
        sessionInit.domOverlay = { root: options.domOverlayRoot };
      }
      return sessionInit;
    }

    return {
      optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking", "layers"],
    };
  }

  private async bindSession(
    session: XRSession,
    referenceSpaceType: XRReferenceSpaceType
  ): Promise<void> {
    const xr = this.renderer.getRenderer().xr;
    xr.setReferenceSpaceType(referenceSpaceType);
    try {
      await xr.setSession(session);
    } catch (err) {
      if (referenceSpaceType === "local") {
        throw err;
      }
      // Some runtimes only expose a plain "local" space; retry before giving up.
      xr.setReferenceSpaceType("local");
      await xr.setSession(session);
    }
  }

  private notifyStateChange(): void {
    this.onStateChange?.(this.getState());
  }

  private captureSnapshot(): XRSnapshot {
    const renderer = this.renderer.getRenderer();
    const camera = this.renderer.getCamera();
    return {
      position: this.petRoot.position.clone(),
      quaternion: this.petRoot.quaternion.clone(),
      scale: this.petRoot.scale.clone(),
      sceneBackground: this.renderer.getScene().background,
      clearColor: renderer.getClearColor(new THREE.Color()),
      clearAlpha: renderer.getClearAlpha(),
      cameraPosition: camera.position.clone(),
      cameraQuaternion: camera.quaternion.clone(),
      fov: camera.fov,
    };
  }

  private restoreSnapshot(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;

    this.petRoot.position.copy(snapshot.position);
    this.petRoot.quaternion.copy(snapshot.quaternion);
    this.petRoot.scale.copy(snapshot.scale);

    this.renderer.getScene().background = snapshot.sceneBackground;
    const renderer = this.renderer.getRenderer();
    renderer.setClearColor(snapshot.clearColor, snapshot.clearAlpha);

    const camera = this.renderer.getCamera();
    camera.position.copy(snapshot.cameraPosition);
    camera.quaternion.copy(snapshot.cameraQuaternion);
    camera.fov = snapshot.fov;
    camera.updateProjectionMatrix();

    this.snapshot = null;
  }

  private configureVR(placementDistance: number): void {
    const scene = this.renderer.getScene();
    const renderer = this.renderer.getRenderer();

    scene.background = new THREE.Color(VR_BACKGROUND_COLOR);
    renderer.setClearColor(VR_BACKGROUND_COLOR, 1);

    this.petRoot.position.set(0, 0, -placementDistance);
    this.petRoot.quaternion.identity();
    this.petRoot.scale.setScalar(this.baseScale * this.xrScale);

    const stage = new THREE.Group();
    stage.name = "XRStage";

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.02, 16, 96),
      new THREE.MeshStandardMaterial({
        color: 0x4cc9f0,
        emissive: 0x0e3a4a,
        roughness: 0.4,
        metalness: 0.35,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.01, -placementDistance);
    stage.add(ring);

    const grid = new THREE.GridHelper(4, 24, 0x2a3550, 0x141b2a);
    grid.position.set(0, 0, -placementDistance);
    stage.add(grid);

    scene.add(stage);
    this.vrStage = stage;
  }

  private configureAR(placementDistance: number): void {
    const scene = this.renderer.getScene();
    const renderer = this.renderer.getRenderer();

    // Transparent passthrough: keep the camera feed visible behind the pet.
    scene.background = null;
    renderer.setClearColor(0x000000, 0);

    this.petRoot.position.set(0, AR_PET_HEIGHT, -placementDistance);
    this.petRoot.quaternion.identity();
    this.petRoot.scale.setScalar(this.baseScale * this.xrScale);

    this.placementActive = true;
    this.surfaceDetected = false;

    const reticle = new THREE.Group();
    reticle.name = "XRPlacementReticle";

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.16, 48),
      new THREE.MeshBasicMaterial({
        color: 0x4cc9f0,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    reticle.add(ring);

    reticle.visible = false;
    scene.add(reticle);
    this.reticle = reticle;

    const session = this.session;
    if (session) {
      void this.initializeHitTest(session);
    }
  }

  private async initializeHitTest(session: XRSession): Promise<void> {
    if (typeof session.requestHitTestSource !== "function") return;
    try {
      const viewerSpace = await session.requestReferenceSpace("viewer");
      const source = await session.requestHitTestSource({ space: viewerSpace });
      if (!source) return;
      if (this.session !== session) {
        // The session ended while the hit-test request was in flight.
        try {
          source.cancel();
        } catch {
          // Ignore cancellation failures on a finished session.
        }
        return;
      }
      this.hitTestSource = source;
    } catch {
      this.hitTestSource = null;
    }
  }

  private setupControllers(mode: XRMode): void {
    const scene = this.renderer.getScene();
    const xr = this.renderer.getRenderer().xr;

    this.controller0 = xr.getController(0);
    this.controller1 = xr.getController(1);
    scene.add(this.controller0);
    scene.add(this.controller1);

    if (mode === "immersive-vr") {
      const ray0 = this.createRayLine();
      const ray1 = this.createRayLine();
      this.controller0.add(ray0);
      this.controller1.add(ray1);
      this.rayLines.push(ray0, ray1);
    }

    this.onSelectHandler = () => this.handleControllerSelect();
    this.onSqueezeHandler = () => {
      this.recenterPet();
      this.onTriggerReaction();
    };

    this.controller0.addEventListener("select", this.onSelectHandler);
    this.controller1.addEventListener("select", this.onSelectHandler);
    this.controller0.addEventListener("squeeze", this.onSqueezeHandler);
    this.controller1.addEventListener("squeeze", this.onSqueezeHandler);
  }

  private createRayLine(): THREE.Line {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -2),
    ]);
    const material = new THREE.LineBasicMaterial({
      color: 0x4cc9f0,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    return new THREE.Line(geometry, material);
  }

  private handleControllerSelect(): void {
    if (!this.session) return;

    if (this.mode === "immersive-ar" && this.placementActive && this.reticle?.visible) {
      this.petRoot.position.copy(this.reticle.position);

      const cameraPosition = new THREE.Vector3();
      this.renderer.getRenderer().xr.getCamera().getWorldPosition(cameraPosition);
      this.petRoot.quaternion.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.atan2(cameraPosition.x - this.petRoot.position.x, cameraPosition.z - this.petRoot.position.z)
      );

      this.placementActive = false;
      this.reticle.visible = false;
      this.notifyStateChange();
    }

    this.onTriggerReaction();
  }

  private updateLookAt(): void {
    const cameraPosition = new THREE.Vector3();
    this.renderer.getRenderer().xr.getCamera().getWorldPosition(cameraPosition);

    const headPosition = this.getHeadWorldPosition();
    const petQuaternion = this.petRoot.getWorldQuaternion(new THREE.Quaternion());
    const target = calculateWorldLookAtTarget(
      headPosition,
      petQuaternion,
      cameraPosition,
      this.maxYawRad,
      this.maxPitchRad
    );
    this.onLookAtTarget(target.x, target.y);
  }

  private cleanupSceneHelpers(): void {
    const scene = this.renderer.getScene();

    if (this.vrStage) {
      scene.remove(this.vrStage);
      disposeObject3D(this.vrStage);
      this.vrStage = null;
    }
    if (this.reticle) {
      scene.remove(this.reticle);
      disposeObject3D(this.reticle);
      this.reticle = null;
    }
    for (const line of this.rayLines) {
      line.removeFromParent();
      disposeObject3D(line);
    }
    this.rayLines = [];
  }

  private removeControllerListeners(): void {
    for (const controller of [this.controller0, this.controller1]) {
      if (!controller) continue;
      if (this.onSelectHandler) controller.removeEventListener("select", this.onSelectHandler);
      if (this.onSqueezeHandler) controller.removeEventListener("squeeze", this.onSqueezeHandler);
      controller.removeFromParent();
    }
    this.controller0 = null;
    this.controller1 = null;
    this.onSelectHandler = null;
    this.onSqueezeHandler = null;
  }

  private handleSessionEnd(): void {
    const session = this.session;
    if (!session && !this.snapshot) return;
    this.session = null;

    if (session) {
      session.removeEventListener("end", this.handleSessionEndBound);
    }

    if (this.hitTestSource) {
      try {
        this.hitTestSource.cancel();
      } catch {
        // The runtime may have already released the hit-test source.
      }
      this.hitTestSource = null;
    }

    this.cleanupSceneHelpers();
    this.removeControllerListeners();
    this.restoreSnapshot();

    this.mode = null;
    this.placementActive = false;
    this.surfaceDetected = false;
    this.placementDistance = VR_DEFAULT_DISTANCE;

    this.onLookAtTarget(0, 0);
    this.notifyStateChange();
  }
}
