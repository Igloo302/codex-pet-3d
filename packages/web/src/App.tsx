import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  toControllerManifest,
  type PetState,
  type XRSessionState,
} from "@codex-pet-3d/core";
import { STANDARD_ANIMATION_STATES, type Pet3DManifest } from "@codex-pet-3d/spec";
import { inspectGlb, type GlbInspectionResult } from "@codex-pet-3d/spec/glb";
import { ActionControls, ACTION_LABELS } from "./components/ActionControls";
import {
  PetViewport,
  type CameraMode,
  type CameraSnapshot,
} from "./components/PetViewport";
import { StudioPanel } from "./components/StudioPanel";
import {
  autoSuggestManifest,
  evaluateModelDiagnostics,
} from "./studio/manifest-studio";
import sampleManifestJson from "../../../assets/cyber-cat/pet-3d.json";
import sampleModelUrl from "../../../assets/cyber-cat/model.glb?url";

const SAMPLE_MANIFEST = sampleManifestJson as unknown as Pet3DManifest;

interface ModelSource {
  url: string;
  name: string;
  isSample: boolean;
  bytes: number;
}

const SAMPLE_MODEL: ModelSource = {
  url: sampleModelUrl,
  name: "Cyber Cat (official sample)",
  isSample: true,
  bytes: 0,
};

const GLB_MAGIC = 0x46546c67; // "glTF" as a little-endian uint32

function isGlb(data: Uint8Array): boolean {
  if (data.byteLength < 12) return false;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getUint32(0, true) === GLB_MAGIC && view.getUint32(4, true) === 2;
}

export function App() {
  const [currentState, setCurrentState] = useState<PetState>("idle");
  const [cameraMode, setCameraMode] = useState<CameraMode>("look-at");
  const [modelSource, setModelSource] = useState<ModelSource>(SAMPLE_MODEL);
  const [manifest, setManifest] = useState<Pet3DManifest>(SAMPLE_MANIFEST);
  const [inspection, setInspection] = useState<GlbInspectionResult | null>(null);
  const [status, setStatus] = useState("Official Cyber Cat loaded and inspected.");
  const [isError, setIsError] = useState(false);
  const [xrState, setXrState] = useState<XRSessionState | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const inspectSample = useCallback(async () => {
    try {
      const response = await fetch(sampleModelUrl);
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const result = await inspectGlb(bytes);
      setModelSource((prev) => (prev.isSample ? { ...prev, bytes: bytes.byteLength } : prev));
      setInspection(result);
    } catch {
      // Sample inspection can fail silently in test environments without fetch
    }
  }, []);

  useEffect(() => {
    void inspectSample();
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [inspectSample]);

  const handleModel = useCallback(async (data: Uint8Array, fileName: string) => {
    if (!isGlb(data)) {
      setStatus(`${fileName} is not a valid glTF 2.0 binary (.glb) file.`);
      setIsError(true);
      return;
    }

    const url = URL.createObjectURL(
      new Blob([new Uint8Array(data)], { type: "model/gltf-binary" }),
    );
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = url;

    setModelSource({
      url,
      name: fileName,
      isSample: false,
      bytes: data.byteLength,
    });
    setCurrentState("idle");

    try {
      const inspected = await inspectGlb(data);
      setInspection(inspected);
      setManifest((prev) => autoSuggestManifest(fileName, inspected, prev));
      setStatus(
        `Inspected ${fileName} (${(data.byteLength / 1024).toFixed(1)} KB · ${inspected.bones.length} joints · ${inspected.clips.length} clips).`,
      );
      setIsError(false);
    } catch (error) {
      setInspection(null);
      setStatus(
        `Loaded ${fileName}, but GLB inspection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      setIsError(true);
    }
  }, []);

  const handleManifestDrop = useCallback((loaded: Pet3DManifest, fileName: string) => {
    setManifest(loaded);
    setStatus(`Applied manifest from ${fileName}.`);
    setIsError(false);
  }, []);

  const handleReset = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setModelSource(SAMPLE_MODEL);
    setManifest(SAMPLE_MANIFEST);
    setCurrentState("idle");
    setCameraMode("look-at");
    setStatus("Back to the official Cyber Cat sample model.");
    setIsError(false);
    void inspectSample();
  }, [inspectSample]);

  const handleCameraCommit = useCallback((snapshot: CameraSnapshot) => {
    setManifest((prev) => ({
      ...prev,
      camera: {
        ...prev.camera,
        position: snapshot.position,
        target: snapshot.target,
      },
    }));
  }, []);

  const handleResetCamera = useCallback(() => {
    setManifest((prev) => ({
      ...prev,
      camera: {
        fov: SAMPLE_MANIFEST.camera.fov,
        position: [...SAMPLE_MANIFEST.camera.position] as [number, number, number],
        target: [...SAMPLE_MANIFEST.camera.target] as [number, number, number],
      },
    }));
  }, []);

  const controllerManifest = useMemo(() => toControllerManifest(manifest), [manifest]);
  const diagnostics = useMemo(
    () =>
      inspection ? evaluateModelDiagnostics(inspection, modelSource.bytes, manifest) : null,
    [inspection, modelSource.bytes, manifest],
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            3D
          </div>
          <div>
            <h1 className="brand-title">Codex Pet 3D · Authoring Studio</h1>
            <p className="brand-sub">Real-time WebGL inspector, budget validator &amp; manifest builder</p>
          </div>
        </div>
        <div className="header-meta">
          <span className="chip">
            <span className="live-dot" /> State: <strong>{ACTION_LABELS[currentState]}</strong>
          </span>
          {xrState?.active && (
            <span className="chip chip-xr">
              <span className="live-dot" /> WebXR ·{" "}
              <strong>{xrState.mode === "immersive-ar" ? "AR" : "VR"}</strong>
            </span>
          )}
          {diagnostics && (
            <span className={`chip ${diagnostics.ready ? "chip-pass" : "chip-fail"}`}>
              {diagnostics.ready ? "Spec Ready" : `${diagnostics.errors.length} Spec Issue(s)`}
            </span>
          )}
          <span className="chip">{STANDARD_ANIMATION_STATES.length} states</span>
        </div>
      </header>

      <main className="workspace">
        <PetViewport
          modelUrl={modelSource.url}
          manifest={controllerManifest}
          state={currentState}
          cameraMode={cameraMode}
          onCameraModeChange={setCameraMode}
          onCameraCommit={handleCameraCommit}
          onStateChange={setCurrentState}
          onXRStateChange={setXrState}
          onLoadError={(err) => {
            setStatus(`Failed to load model: ${err.message}`);
            setIsError(true);
          }}
        />

        <StudioPanel
          manifest={manifest}
          inspection={inspection}
          diagnostics={diagnostics}
          modelName={modelSource.name}
          isSample={modelSource.isSample}
          status={status}
          isError={isError}
          onModelDrop={(data, fileName) => {
            void handleModel(data, fileName);
          }}
          onManifestDrop={handleManifestDrop}
          onDropError={(message) => {
            setStatus(message);
            setIsError(true);
          }}
          onResetSample={handleReset}
          onManifestChange={setManifest}
          onResetCamera={handleResetCamera}
          onPreviewState={setCurrentState}
        />
      </main>

      <footer className="action-bar">
        <div className="action-bar-head">
          <span className="action-bar-title">Action Controller</span>
          <span className="action-bar-sub">
            Trigger any state · one-shot actions return to idle automatically
          </span>
        </div>
        <ActionControls currentState={currentState} onSelectState={setCurrentState} />
      </footer>
    </div>
  );
}
