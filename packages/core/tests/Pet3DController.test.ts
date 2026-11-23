import { describe, it, expect, vi, beforeEach } from "vitest";
import * as THREE from "three";

const loadAsyncMock = vi.fn();
const rendererDisposeMock = vi.fn();

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    loadAsync(url: string) {
      return loadAsyncMock(url);
    }
  },
}));

vi.mock("../src/Pet3DRenderer.js", () => ({
  Pet3DRenderer: class {
    private readonly scene = new THREE.Scene();
    private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    getScene() {
      return this.scene;
    }
    getCamera() {
      return this.camera;
    }
    setCameraPosition() {}
    render() {}
    resize() {}
    dispose() {
      rendererDisposeMock();
    }
  },
}));

import { Pet3DController } from "../src/Pet3DController.js";
import type { Pet3DControllerOptions } from "../src/types.js";

function baseOptions(
  overrides: Partial<Pet3DControllerOptions> = {}
): Pet3DControllerOptions {
  return {
    canvas: {} as HTMLCanvasElement,
    modelUrl: "model.glb",
    autoStartLoop: false,
    manifest: {
      scale: 1,
      camera: { fov: 45, position: [0, 1.2, 2.5], target: [0, 0.4, 0] },
      lookAt: { enabled: true, headBone: "Head", maxYawDeg: 45, maxPitchDeg: 30 },
      animations: {
        idle: { clip: "Idle", loop: true },
        "running-right": { clip: "Run_Right", loop: true },
        "running-left": { clip: "Run_Left", loop: true },
        waving: { clip: "Wave", loop: false },
        jumping: { clip: "Jump", loop: false },
        failed: { clip: "Failed", loop: false },
        waiting: { clip: "Waiting", loop: true },
        running: { clip: "Work", loop: true },
        review: { clip: "Review", loop: true },
      },
    },
    ...overrides,
  };
}

describe("Pet3DController", () => {
  beforeEach(() => {
    loadAsyncMock.mockReset();
    rendererDisposeMock.mockReset();
  });

  it("reports model load errors via onLoadError instead of unhandled rejection", async () => {
    loadAsyncMock.mockRejectedValueOnce(new Error("corrupt glb"));
    const onLoadError = vi.fn();

    new Pet3DController(baseOptions({ onLoadError }));
    await vi.waitFor(() => {
      expect(onLoadError).toHaveBeenCalledTimes(1);
    });
    expect(onLoadError.mock.calls[0][0].message).toBe("corrupt glb");
  });

  it("applies upward pitch (negative X rotation) preserving base bone rotation and disposes textures", async () => {
    const scene = new THREE.Group();
    const headBone = new THREE.Bone();
    headBone.name = "Head";
    headBone.quaternion.setFromEuler(new THREE.Euler(0, 0.1, 0));
    scene.add(headBone);

    const texture = new THREE.Texture();
    const textureDispose = vi.spyOn(texture, "dispose");
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    scene.add(mesh);

    loadAsyncMock.mockResolvedValueOnce({ scene, animations: [] });

    const controller = new Pet3DController(baseOptions());
    await vi.waitFor(() => {
      expect(controller.getRenderer().getScene().children.length).toBeGreaterThan(0);
    });

    // Look up (targetY = -1 -> positive pitch -> negative X rotation in right-handed Y-up)
    controller.setLookAtTarget(0, -1);
    for (let i = 0; i < 60; i++) {
      controller.update(1 / 60);
    }

    const euler = new THREE.Euler().setFromQuaternion(headBone.quaternion, "YXZ");
    expect(euler.x).toBeLessThan(0);
    expect(euler.y).toBeCloseTo(0.1, 1);

    controller.dispose();
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(rendererDisposeMock).toHaveBeenCalledTimes(1);
  });

  it("ignores async model completion if disposed before load resolves", async () => {
    let resolveLoad!: (val: unknown) => void;
    loadAsyncMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveLoad = resolve; })
    );

    const controller = new Pet3DController(baseOptions({ autoStartLoop: true }));
    controller.dispose();

    const scene = new THREE.Group();
    resolveLoad({ scene, animations: [] });
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.getRenderer().getScene().children).toHaveLength(0);
  });
});
