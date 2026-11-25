import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as THREE from "three";
import type { Pet3DRenderer } from "../src/Pet3DRenderer";
import { checkXRSupport, PetXRManager } from "../src/WebXRManager";

const ORIGINAL_NAVIGATOR = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const ORIGINAL_WINDOW = Object.getOwnPropertyDescriptor(globalThis, "window");

function setGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

function restoreGlobals(): void {
  if (ORIGINAL_NAVIGATOR) {
    Object.defineProperty(globalThis, "navigator", ORIGINAL_NAVIGATOR);
  } else {
    delete (globalThis as Record<string, unknown>).navigator;
  }
  if (ORIGINAL_WINDOW) {
    Object.defineProperty(globalThis, "window", ORIGINAL_WINDOW);
  } else {
    delete (globalThis as Record<string, unknown>).window;
  }
}

interface FakeXRSystem {
  isSessionSupported: ReturnType<typeof vi.fn>;
  requestSession: ReturnType<typeof vi.fn>;
}

interface FakeXRSystemOptions {
  ar?: boolean;
  vr?: boolean;
  requestError?: Error;
  supportError?: Error;
}

function createFakeXRSystem(options: FakeXRSystemOptions = {}): FakeXRSystem {
  const { ar = true, vr = true, requestError, supportError } = options;
  return {
    isSessionSupported: vi.fn(async (mode: string) => {
      if (supportError) throw supportError;
      return mode === "immersive-ar" ? ar : vr;
    }),
    requestSession: vi.fn(async () => {
      if (requestError) throw requestError;
      return createFakeSession();
    }),
  };
}

interface FakeSession {
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  requestReferenceSpace: ReturnType<typeof vi.fn>;
  requestHitTestSource: ReturnType<typeof vi.fn>;
  emit: (type: string) => void;
}

function createFakeSession(): FakeSession {
  const listeners = new Map<string, Set<() => void>>();

  const emit = (type: string) => {
    for (const listener of listeners.get(type) ?? []) listener();
  };

  return {
    addEventListener: vi.fn((type: string, callback: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(callback);
    }),
    removeEventListener: vi.fn((type: string, callback: () => void) => {
      listeners.get(type)?.delete(callback);
    }),
    end: vi.fn(async () => {
      emit("end");
    }),
    requestReferenceSpace: vi.fn(async () => ({}) as XRReferenceSpace),
    requestHitTestSource: vi.fn(async () => ({ cancel: vi.fn() }) as unknown as XRHitTestSource),
    emit,
  };
}

interface FakeRenderTarget {
  renderer: Pet3DRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  xrCamera: THREE.PerspectiveCamera;
  controllers: THREE.Group[];
  xr: {
    enabled: boolean;
    isPresenting: boolean;
    referenceSpaceType: string;
    setReferenceSpaceType: ReturnType<typeof vi.fn>;
    setSession: ReturnType<typeof vi.fn>;
    getReferenceSpace: ReturnType<typeof vi.fn>;
    getController: ReturnType<typeof vi.fn>;
    getCamera: ReturnType<typeof vi.fn>;
  };
  clearState: () => { hex: number; alpha: number };
}

function createFakeRenderTarget(): FakeRenderTarget {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 1.2, 2.5);

  const xrCamera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
  xrCamera.position.set(0, 1.6, 0);

  const clearColor = new THREE.Color(0x101010);
  let clearAlpha = 1;

  const controllers = [new THREE.Group(), new THREE.Group()];

  const xr: FakeRenderTarget["xr"] = {
    enabled: false,
    isPresenting: false,
    referenceSpaceType: "local-floor",
    setReferenceSpaceType: vi.fn((type: string) => {
      xr.referenceSpaceType = type;
    }),
    setSession: vi.fn(async () => {
      xr.isPresenting = true;
    }),
    getReferenceSpace: vi.fn(() => ({}) as XRReferenceSpace),
    getController: vi.fn((index: number) => controllers[index]),
    getCamera: vi.fn(() => xrCamera),
  };

  const gl = {
    xr,
    getClearColor: (target: THREE.Color) => target.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor: (color: THREE.ColorRepresentation, alpha = 1) => {
      clearColor.set(color);
      clearAlpha = alpha;
    },
  };

  const renderer = {
    getScene: () => scene,
    getCamera: () => camera,
    getRenderer: () => gl,
    setXREnabled: vi.fn((enabled: boolean) => {
      xr.enabled = enabled;
    }),
    isXREnabled: () => xr.enabled,
    isPresentingXR: () => xr.isPresenting,
  } as unknown as Pet3DRenderer;

  return {
    renderer,
    scene,
    camera,
    xrCamera,
    controllers,
    xr,
    clearState: () => ({ hex: clearColor.getHex(), alpha: clearAlpha }),
  };
}

interface Harness {
  target: FakeRenderTarget;
  manager: PetXRManager;
  petRoot: THREE.Group;
  onLookAtTarget: ReturnType<typeof vi.fn>;
  onTriggerReaction: ReturnType<typeof vi.fn>;
  onStateChange: ReturnType<typeof vi.fn>;
}

function createHarness(): Harness {
  const target = createFakeRenderTarget();
  const petRoot = new THREE.Group();
  petRoot.position.set(0.3, 0, 0.4);
  petRoot.rotation.y = 0.2;
  petRoot.scale.setScalar(1.4);
  target.scene.add(petRoot);

  const onLookAtTarget = vi.fn();
  const onTriggerReaction = vi.fn();
  const onStateChange = vi.fn();

  const manager = new PetXRManager({
    renderer: target.renderer,
    petRoot,
    getHeadWorldPosition: () => new THREE.Vector3(0, 1, 0),
    onLookAtTarget,
    onTriggerReaction,
    onStateChange,
    maxYawRad: Math.PI / 4,
    maxPitchRad: Math.PI / 6,
    baseScale: 1,
  });

  return { target, manager, petRoot, onLookAtTarget, onTriggerReaction, onStateChange };
}

function installSecureNavigator(xrSystem: FakeXRSystem | null): void {
  setGlobal("navigator", xrSystem ? { xr: xrSystem } : {});
  setGlobal("window", { isSecureContext: true });
}

describe("checkXRSupport", () => {
  afterEach(() => {
    restoreGlobals();
  });

  it("reports WebXR as unavailable when navigator has no xr system", async () => {
    setGlobal("navigator", {});
    const status = await checkXRSupport();

    expect(status.available).toBe(false);
    expect(status.arSupported).toBe(false);
    expect(status.vrSupported).toBe(false);
    expect(status.preferredMode).toBeNull();
    expect(status.secureContext).toBe(true);
    expect(status.reason).toContain("WebXR is not available");
  });

  it("reports WebXR as unavailable in Node without browser globals", async () => {
    delete (globalThis as Record<string, unknown>).navigator;
    delete (globalThis as Record<string, unknown>).window;

    const status = await checkXRSupport();
    expect(status.available).toBe(false);
    expect(status.secureContext).toBe(true);
  });

  it("prefers immersive-ar when both modes are supported", async () => {
    installSecureNavigator(createFakeXRSystem({ ar: true, vr: true }));
    const status = await checkXRSupport();

    expect(status.available).toBe(true);
    expect(status.arSupported).toBe(true);
    expect(status.vrSupported).toBe(true);
    expect(status.preferredMode).toBe("immersive-ar");
    expect(status.reason).toBeUndefined();
  });

  it("falls back to immersive-vr when only VR is supported", async () => {
    installSecureNavigator(createFakeXRSystem({ ar: false, vr: true }));
    const status = await checkXRSupport();

    expect(status.available).toBe(true);
    expect(status.preferredMode).toBe("immersive-vr");
  });

  it("flags an insecure context while still reporting device capability", async () => {
    setGlobal("navigator", { xr: createFakeXRSystem({ ar: false, vr: true }) });
    setGlobal("window", { isSecureContext: false });

    const status = await checkXRSupport();
    expect(status.secureContext).toBe(false);
    expect(status.available).toBe(true);
    expect(status.reason).toContain("secure context");
  });

  it("handles isSessionSupported rejections without throwing", async () => {
    const error = new Error("blocked by permissions policy");
    error.name = "SecurityError";
    installSecureNavigator(createFakeXRSystem({ supportError: error }));

    const status = await checkXRSupport();
    expect(status.available).toBe(false);
    expect(status.reason).toContain("SecurityError");
  });
});

describe("PetXRManager", () => {
  beforeEach(() => {
    installSecureNavigator(createFakeXRSystem({ ar: true, vr: true }));
  });

  afterEach(() => {
    restoreGlobals();
  });

  it("enters immersive-vr with a grounded studio stage and restores everything on exit", async () => {
    const { target, manager, petRoot, onLookAtTarget, onStateChange } = createHarness();
    const originalBackground = target.scene.background;
    const { hex, alpha } = target.clearState();

    const state = await manager.enterXR({ mode: "immersive-vr" });

    expect(state.active).toBe(true);
    expect(state.mode).toBe("immersive-vr");
    expect(target.xr.enabled).toBe(true);
    expect(target.xr.referenceSpaceType).toBe("local-floor");
    expect(target.xr.setSession).toHaveBeenCalledTimes(1);
    expect(target.scene.background).toBeInstanceOf(THREE.Color);
    expect((target.scene.background as THREE.Color).getHex()).toBe(0x070b14);
    expect(target.clearState()).toEqual({ hex: 0x070b14, alpha: 1 });
    expect(petRoot.position.toArray()).toEqual([0, 0, -1.5]);
    expect(petRoot.scale.x).toBeCloseTo(0.6, 5);
    expect(target.scene.getObjectByName("XRStage")).toBeTruthy();
    expect(petRoot.parent).toBe(target.scene);
    expect(target.scene.children).toContain(target.controllers[0]);
    expect(target.scene.children).toContain(target.controllers[1]);

    await manager.exitXR();

    expect(manager.getState().active).toBe(false);
    expect(manager.getState().mode).toBeNull();
    expect(target.scene.background).toBe(originalBackground);
    expect(target.clearState()).toEqual({ hex, alpha });
    expect(petRoot.position.toArray()).toEqual([0.3, 0, 0.4]);
    expect(petRoot.scale.x).toBeCloseTo(1.4, 5);
    expect(target.scene.getObjectByName("XRStage")).toBeUndefined();
    expect(onLookAtTarget).toHaveBeenLastCalledWith(0, 0);
    expect(onStateChange.mock.calls.at(-1)?.[0].active).toBe(false);
  });

  it("enters immersive-ar with transparent passthrough, DOM overlay and a hit-test reticle", async () => {
    const { target, manager } = createHarness();
    const root = { id: "overlay" } as unknown as HTMLElement;
    const session = createFakeSession();
    (globalThis.navigator as { xr: FakeXRSystem }).xr.requestSession.mockResolvedValueOnce(session);

    const state = await manager.enterXR({ mode: "immersive-ar", domOverlayRoot: root });

    const init = (globalThis.navigator as { xr: FakeXRSystem }).xr.requestSession.mock.calls[0][1];
    expect(init.optionalFeatures).toEqual(
      expect.arrayContaining(["hit-test", "dom-overlay", "local-floor"])
    );
    expect(init.domOverlay).toEqual({ root });

    expect(state.active).toBe(true);
    expect(state.mode).toBe("immersive-ar");
    expect(state.placementActive).toBe(true);
    expect(state.surfaceDetected).toBe(false);
    expect(target.scene.background).toBeNull();
    expect(target.clearState()).toEqual({ hex: 0x000000, alpha: 0 });
    expect(target.scene.getObjectByName("XRPlacementReticle")).toBeTruthy();
    // Hit-test wiring is initialized asynchronously after the session is bound.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session.requestHitTestSource).toHaveBeenCalledTimes(1);
  });

  it("shows the reticle on hit-test results and places the pet on controller select", async () => {
    const harness = createHarness();
    const { target, manager, petRoot, onTriggerReaction, onStateChange } = harness;
    await manager.enterXR({ mode: "immersive-ar" });
    // Allow the asynchronous hit-test source request to settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const matrix = new THREE.Matrix4().makeTranslation(0.8, 0, -2.2);
    const frame = {
      getHitTestResults: () => [
        { getPose: () => ({ transform: { matrix: matrix.toArray() } }) },
      ],
    } as unknown as XRFrame;

    manager.onXRFrame(frame);

    const reticle = target.scene.getObjectByName("XRPlacementReticle");
    expect(reticle?.visible).toBe(true);
    expect(manager.getState().surfaceDetected).toBe(true);
    expect(onStateChange).toHaveBeenCalled();

    target.controllers[0].dispatchEvent({ type: "select" } as unknown as THREE.Event);

    expect(manager.getState().placementActive).toBe(false);
    expect(petRoot.position.x).toBeCloseTo(0.8, 5);
    expect(petRoot.position.z).toBeCloseTo(-2.2, 5);
    expect(reticle?.visible).toBe(false);
    expect(onTriggerReaction).toHaveBeenCalledTimes(1);
  });

  it("falls back from local-floor to local when the runtime rejects the reference space", async () => {
    const { target, manager } = createHarness();
    target.xr.setSession.mockRejectedValueOnce(new Error("local-floor unsupported"));

    const state = await manager.enterXR({ mode: "immersive-vr" });

    expect(state.active).toBe(true);
    expect(target.xr.setReferenceSpaceType).toHaveBeenNthCalledWith(1, "local-floor");
    expect(target.xr.setReferenceSpaceType).toHaveBeenNthCalledWith(2, "local");
    expect(target.xr.referenceSpaceType).toBe("local");
    expect(target.xr.setSession).toHaveBeenCalledTimes(2);
  });

  it("surfaces a descriptive error and restores the renderer when requestSession fails", async () => {
    const { target, manager, petRoot } = createHarness();
    (globalThis.navigator as { xr: FakeXRSystem }).xr.requestSession.mockRejectedValueOnce(
      new Error("user gesture required")
    );

    await expect(manager.enterXR({ mode: "immersive-vr" })).rejects.toThrow(
      /Failed to start an immersive-vr session/
    );

    expect(manager.getState().active).toBe(false);
    expect(target.xr.enabled).toBe(false);
    expect(petRoot.position.toArray()).toEqual([0.3, 0, 0.4]);
    expect(target.scene.getObjectByName("XRStage")).toBeUndefined();
  });

  it("rejects entering a mode the device does not support", async () => {
    installSecureNavigator(createFakeXRSystem({ ar: false, vr: true }));
    const { manager } = createHarness();

    await expect(manager.enterXR({ mode: "immersive-ar" })).rejects.toThrow(
      /immersive-ar is not supported/
    );
  });

  it("rejects when no immersive mode is available", async () => {
    installSecureNavigator(createFakeXRSystem({ ar: false, vr: false }));
    const { manager } = createHarness();

    await expect(manager.enterXR()).rejects.toThrow(/No immersive WebXR mode is available/);
  });

  it("rejects when WebXR is missing entirely", async () => {
    installSecureNavigator(null);
    const { manager } = createHarness();

    await expect(manager.enterXR()).rejects.toThrow(/WebXR is not available/);
  });

  it("updates the 3D LookAt from the XR camera each frame", async () => {
    const { target, manager, onLookAtTarget, petRoot } = createHarness();
    await manager.enterXR({ mode: "immersive-vr" });

    petRoot.position.set(0, 0, 0);
    petRoot.rotation.set(0, 0, 0);
    target.xrCamera.position.set(1, 1, 2);

    manager.onXRFrame();

    expect(onLookAtTarget).toHaveBeenCalled();
    const [x, y] = onLookAtTarget.mock.calls.at(-1) as [number, number];
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThanOrEqual(1);
    expect(Math.abs(y)).toBeLessThan(1e-6);
  });

  it("clamps scale changes and immediately resizes the pet", async () => {
    const { manager, petRoot, onStateChange } = createHarness();
    await manager.enterXR({ mode: "immersive-vr" });

    manager.setXRScale(5);
    expect(manager.getState().xrScale).toBe(2);
    expect(petRoot.scale.x).toBeCloseTo(2, 5);

    manager.setXRScale(0);
    expect(manager.getState().xrScale).toBe(0.15);
    expect(petRoot.scale.x).toBeCloseTo(0.15, 5);
    expect(onStateChange).toHaveBeenCalled();
  });

  it("recenters the pet in front of the XR camera and faces the user", async () => {
    const { target, manager, petRoot } = createHarness();
    await manager.enterXR({ mode: "immersive-vr" });

    target.xrCamera.position.set(0, 1.6, 3);
    target.xrCamera.quaternion.identity();
    manager.recenterPet();

    expect(petRoot.position.z).toBeCloseTo(1.5, 5);
    expect(petRoot.position.y).toBeCloseTo(0, 5);

    const euler = new THREE.Euler().setFromQuaternion(petRoot.quaternion, "YXZ");
    expect(euler.y).toBeCloseTo(0, 5);
  });

  it("resets pet quaternion on XR entry, keeps horizontal recenter distance when pitched down, and restores rotation on exit", async () => {
    const { target, manager, petRoot } = createHarness();
    await manager.enterXR({ mode: "immersive-vr" });

    // Original rotation (0.2 rad around Y) is reset to face +Z during XR.
    expect(petRoot.quaternion.equals(new THREE.Quaternion())).toBe(true);

    // Pitch camera 60 degrees downward; horizontal placement distance should remain 1.5m.
    target.xrCamera.position.set(0, 1.6, 3);
    target.xrCamera.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 3, 0, 0));
    manager.recenterPet();

    expect(petRoot.position.x).toBeCloseTo(0, 5);
    expect(petRoot.position.y).toBeCloseTo(0, 5);
    expect(petRoot.position.z).toBeCloseTo(1.5, 5);

    await manager.exitXR();
    const restoredEuler = new THREE.Euler().setFromQuaternion(petRoot.quaternion, "YXZ");
    expect(restoredEuler.y).toBeCloseTo(0.2, 5);
  });

  it("exits cleanly when the runtime ends the session itself", async () => {
    const harness = createHarness();
    const { target, manager, onLookAtTarget } = harness;
    const session = createFakeSession();
    (globalThis.navigator as { xr: FakeXRSystem }).xr.requestSession.mockResolvedValueOnce(session);

    await manager.enterXR({ mode: "immersive-vr" });
    session.emit("end");

    expect(manager.getState().active).toBe(false);
    expect(target.scene.getObjectByName("XRStage")).toBeUndefined();
    expect(target.scene.children).not.toContain(target.controllers[0]);
    expect(onLookAtTarget).toHaveBeenLastCalledWith(0, 0);
  });

  it("disposes an active session, helpers and controller listeners", async () => {
    const harness = createHarness();
    const { target, manager, onTriggerReaction } = harness;
    const session = createFakeSession();
    (globalThis.navigator as { xr: FakeXRSystem }).xr.requestSession.mockResolvedValueOnce(session);

    await manager.enterXR({ mode: "immersive-vr" });
    const controller = target.controllers[0];
    manager.dispose();

    expect(session.end).toHaveBeenCalledTimes(1);
    expect(manager.getState().active).toBe(false);
    expect(target.scene.getObjectByName("XRStage")).toBeUndefined();

    controller.dispatchEvent({ type: "select" } as unknown as THREE.Event);
    expect(onTriggerReaction).not.toHaveBeenCalled();
  });

  it("toggles AR placement mode and reports it in the state", async () => {
    const { manager } = createHarness();
    await manager.enterXR({ mode: "immersive-ar" });

    manager.setPlacementMode(false);
    expect(manager.getState().placementActive).toBe(false);

    manager.setPlacementMode(true);
    expect(manager.getState().placementActive).toBe(true);
  });
});
