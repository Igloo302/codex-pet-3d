import { useCallback, useEffect, useRef, useState } from "react";
import type { Pet3DControllerOptions, PetState } from "@codex-pet-3d/core";
import { STANDARD_ANIMATION_STATES } from "@codex-pet-3d/spec";
import { ActionControls, ACTION_LABELS } from "./components/ActionControls";
import { ModelDropzone } from "./components/ModelDropzone";
import { PetViewport } from "./components/PetViewport";
import sampleManifest from "../../../assets/cyber-cat/pet-3d.json";
import sampleModelUrl from "../../../assets/cyber-cat/model.glb?url";

type ControllerManifest = Pet3DControllerOptions["manifest"];

/** Translate the snake_case spec manifest into the controller's option shape. */
const MANIFEST: ControllerManifest = {
  scale: sampleManifest.scale,
  camera: {
    fov: sampleManifest.camera.fov,
    position: sampleManifest.camera.position as [number, number, number],
    target: sampleManifest.camera.target as [number, number, number],
  },
  lookAt: {
    enabled: sampleManifest.look_at.enabled,
    headBone: sampleManifest.look_at.head_bone,
    maxYawDeg: sampleManifest.look_at.max_yaw_deg,
    maxPitchDeg: sampleManifest.look_at.max_pitch_deg,
  },
  animations: sampleManifest.animations as ControllerManifest["animations"],
};

interface ModelSource {
  url: string;
  name: string;
  isSample: boolean;
  bytes?: number;
}

const SAMPLE_MODEL: ModelSource = {
  url: sampleModelUrl,
  name: "Cyber Cat (sample)",
  isSample: true,
};

const GLB_MAGIC = 0x46546c67; // "glTF" as a little-endian uint32

/** Minimal portable GLB header check before handing bytes to the loader. */
function isGlb(data: Uint8Array): boolean {
  if (data.byteLength < 12) return false;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getUint32(0, true) === GLB_MAGIC && view.getUint32(4, true) === 2;
}

export function App() {
  const [currentState, setCurrentState] = useState<PetState>("idle");
  const [modelSource, setModelSource] = useState<ModelSource>(SAMPLE_MODEL);
  const [status, setStatus] = useState("Official sample model loaded and ready.");
  const [isError, setIsError] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const handleModel = useCallback((data: Uint8Array, fileName: string) => {
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
    setStatus(
      `Loaded ${fileName} (${(data.byteLength / 1024).toFixed(1)} KB) with the standard manifest.`,
    );
    setIsError(false);
  }, []);

  const handleReset = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setModelSource(SAMPLE_MODEL);
    setCurrentState("idle");
    setStatus("Back to the official Cyber Cat sample model.");
    setIsError(false);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            3D
          </div>
          <div>
            <h1 className="brand-title">Codex Pet 3D · Inspector</h1>
            <p className="brand-sub">Real-time WebGL showcase &amp; action controller</p>
          </div>
        </div>
        <div className="header-meta">
          <span className="chip">
            <span className="live-dot" /> State: <strong>{ACTION_LABELS[currentState]}</strong>
          </span>
          <span className="chip">WebGL 2.0</span>
          <span className="chip">{STANDARD_ANIMATION_STATES.length} states</span>
        </div>
      </header>

      <main className="workspace">
        <PetViewport
          modelUrl={modelSource.url}
          manifest={MANIFEST}
          state={currentState}
          onStateChange={setCurrentState}
        />

        <aside className="side-panel">
          <section className="panel-card">
            <h2 className="panel-title">Model Source</h2>
            <p className="panel-desc">
              Drop a local .glb to test it against the standard 9-state controller.
            </p>
            <ModelDropzone
              onModel={handleModel}
              onError={(message) => {
                setStatus(message);
                setIsError(true);
              }}
            />
            <button
              type="button"
              className="reset-btn"
              disabled={modelSource.isSample}
              onClick={handleReset}
            >
              Reset to sample model
            </button>
            <p className={`status-line${isError ? " is-error" : ""}`} role="status">
              {status}
            </p>
          </section>

          <section className="panel-card">
            <h2 className="panel-title">Active Manifest</h2>
            <div className="info-grid">
              <div className="info-row">
                <span className="info-key">Model</span>
                <span className="info-val">{modelSource.name}</span>
              </div>
              <div className="info-row">
                <span className="info-key">Source</span>
                <span className="info-val">
                  {modelSource.isSample
                    ? "Bundled asset"
                    : `Local drop · ${((modelSource.bytes ?? 0) / 1024).toFixed(1)} KB`}
                </span>
              </div>
              <div className="info-row">
                <span className="info-key">Clips</span>
                <span className="info-val">{STANDARD_ANIMATION_STATES.length} standard</span>
              </div>
              <div className="info-row">
                <span className="info-key">Head bone</span>
                <span className="info-val">{MANIFEST.lookAt.headBone}</span>
              </div>
              <div className="info-row">
                <span className="info-key">LookAt limits</span>
                <span className="info-val">
                  yaw ±{MANIFEST.lookAt.maxYawDeg}° / pitch ±{MANIFEST.lookAt.maxPitchDeg}°
                </span>
              </div>
              <div className="info-row">
                <span className="info-key">Camera</span>
                <span className="info-val">FOV {MANIFEST.camera.fov}°</span>
              </div>
            </div>
          </section>
        </aside>
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
