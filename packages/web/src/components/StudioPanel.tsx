import { useState } from "react";
import {
  STANDARD_ANIMATION_STATES,
  type Pet3DManifest,
  type StandardAnimationState,
} from "@codex-pet-3d/spec";
import type { GlbInspectionResult } from "@codex-pet-3d/spec/glb";
import { ACTION_LABELS } from "./ActionControls";
import { ModelDropzone } from "./ModelDropzone";
import {
  formatManifestJson,
  type StudioDiagnostics,
} from "../studio/manifest-studio";

export type StudioTab = "inspect" | "rig" | "export";

export interface StudioPanelProps {
  manifest: Pet3DManifest;
  inspection: GlbInspectionResult | null;
  diagnostics: StudioDiagnostics | null;
  modelName: string;
  isSample: boolean;
  status: string;
  isError: boolean;
  onModelDrop: (data: Uint8Array, fileName: string) => void;
  onManifestDrop: (manifest: Pet3DManifest, fileName: string) => void;
  onDropError: (message: string) => void;
  onResetSample: () => void;
  onManifestChange: (updater: (prev: Pet3DManifest) => Pet3DManifest) => void;
  onResetCamera: () => void;
  onPreviewState: (state: StandardAnimationState) => void;
}

export function StudioPanel({
  manifest,
  inspection,
  diagnostics,
  modelName,
  isSample,
  status,
  isError,
  onModelDrop,
  onManifestDrop,
  onDropError,
  onResetSample,
  onManifestChange,
  onResetCamera,
  onPreviewState,
}: StudioPanelProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>("inspect");
  const [copied, setCopied] = useState(false);

  const jsonOutput = formatManifestJson(manifest);
  const bones = inspection?.bones ?? [];
  const clips = inspection?.clips ?? [];

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onDropError("Clipboard copy failed — select and copy from the JSON box below.");
    }
  };

  const handleDownloadJson = () => {
    const blob = new Blob([jsonOutput], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pet-3d.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="side-panel">
      <div className="studio-tabs" role="tablist" aria-label="Authoring studio panels">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "inspect"}
          className={`studio-tab${activeTab === "inspect" ? " active" : ""}`}
          onClick={() => setActiveTab("inspect")}
        >
          Inspect
          {diagnostics && (
            <span className={`pill-dot ${diagnostics.ready ? "pass" : "fail"}`} />
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "rig"}
          className={`studio-tab${activeTab === "rig" ? " active" : ""}`}
          onClick={() => setActiveTab("rig")}
        >
          Rig &amp; Clips
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "export"}
          className={`studio-tab${activeTab === "export" ? " active" : ""}`}
          onClick={() => setActiveTab("export")}
        >
          Export
        </button>
      </div>

      {activeTab === "inspect" && (
        <>
          <section className="panel-card">
            <h2 className="panel-title">Model Source</h2>
            <p className="panel-desc">
              Drop a local <code>.glb</code> (plus optional <code>pet-3d.json</code>) to inspect
              spec compliance and author its manifest.
            </p>
            <ModelDropzone
              onModel={onModelDrop}
              onManifestJson={onManifestDrop}
              onError={onDropError}
            />
            <button
              type="button"
              className="reset-btn"
              disabled={isSample}
              onClick={onResetSample}
            >
              Reset to official Cyber Cat
            </button>
            <p className={`status-line${isError ? " is-error" : ""}`} role="status">
              {status}
            </p>
          </section>

          <section className="panel-card">
            <div className="panel-title-row">
              <h2 className="panel-title">Spec Budgets &amp; Health</h2>
              {diagnostics && (
                <span className={`status-badge ${diagnostics.ready ? "pass" : "fail"}`}>
                  {diagnostics.ready ? "Spec Ready" : `${diagnostics.errors.length} issue(s)`}
                </span>
              )}
            </div>
            <p className="panel-desc">Active asset: <strong>{modelName}</strong></p>

            {diagnostics ? (
              <>
                <div className="budget-grid">
                  {diagnostics.checks.map((check) => (
                    <div key={check.id} className={`budget-item ${check.status}`}>
                      <span className="budget-label">{check.label}</span>
                      <span className="budget-val">{check.value}</span>
                      <span className="budget-limit">{check.limit}</span>
                    </div>
                  ))}
                </div>
                {diagnostics.errors.length > 0 && (
                  <ul className="diag-list fail">
                    {diagnostics.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
                {diagnostics.warnings.length > 0 && (
                  <ul className="diag-list warn">
                    {diagnostics.warnings.map((warn, i) => (
                      <li key={i}>{warn}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="panel-desc">Inspecting GLB binary…</p>
            )}
          </section>
        </>
      )}

      {activeTab === "rig" && (
        <>
          <section className="panel-card">
            <h2 className="panel-title">LookAt Head Rig</h2>
            <div className="field-stack">
              <label className="toggle-row">
                <span>Enable LookAt Tracking</span>
                <input
                  type="checkbox"
                  checked={manifest.look_at.enabled}
                  onChange={(e) =>
                    onManifestChange((prev) => ({
                      ...prev,
                      look_at: { ...prev.look_at, enabled: e.target.checked },
                    }))
                  }
                />
              </label>

              <label className="field">
                <span className="field-label">Head Bone ({bones.length} joints detected)</span>
                {bones.length > 0 ? (
                  <select
                    className="studio-input"
                    value={manifest.look_at.head_bone}
                    onChange={(e) =>
                      onManifestChange((prev) => ({
                        ...prev,
                        look_at: { ...prev.look_at, head_bone: e.target.value },
                      }))
                    }
                  >
                    {!bones.includes(manifest.look_at.head_bone) && (
                      <option value={manifest.look_at.head_bone}>
                        {manifest.look_at.head_bone} (missing)
                      </option>
                    )}
                    {bones.map((bone) => (
                      <option key={bone} value={bone}>
                        {bone}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="studio-input"
                    type="text"
                    value={manifest.look_at.head_bone}
                    onChange={(e) =>
                      onManifestChange((prev) => ({
                        ...prev,
                        look_at: { ...prev.look_at, head_bone: e.target.value },
                      }))
                    }
                  />
                )}
              </label>

              <label className="field">
                <span className="field-label">
                  Max Yaw: <strong>±{manifest.look_at.max_yaw_deg}°</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={90}
                  step={1}
                  value={manifest.look_at.max_yaw_deg}
                  onChange={(e) =>
                    onManifestChange((prev) => ({
                      ...prev,
                      look_at: { ...prev.look_at, max_yaw_deg: Number(e.target.value) },
                    }))
                  }
                />
              </label>

              <label className="field">
                <span className="field-label">
                  Max Pitch: <strong>±{manifest.look_at.max_pitch_deg}°</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={1}
                  value={manifest.look_at.max_pitch_deg}
                  onChange={(e) =>
                    onManifestChange((prev) => ({
                      ...prev,
                      look_at: { ...prev.look_at, max_pitch_deg: Number(e.target.value) },
                    }))
                  }
                />
              </label>
            </div>
          </section>

          <section className="panel-card">
            <h2 className="panel-title">Animation Clip Mapping</h2>
            <p className="panel-desc">
              Map all 9 canonical states to GLB clips ({clips.length} detected). Click a label to
              preview.
            </p>
            <div className="clip-map-list">
              {STANDARD_ANIMATION_STATES.map((state) => {
                const currentClip = manifest.animations[state]?.clip ?? "";
                const missing = clips.length > 0 && !clips.includes(currentClip);
                return (
                  <div key={state} className="clip-map-row">
                    <button
                      type="button"
                      className="clip-state-btn"
                      title={`Preview ${state}`}
                      onClick={() => onPreviewState(state)}
                    >
                      {ACTION_LABELS[state]}
                    </button>
                    {clips.length > 0 ? (
                      <select
                        className={`studio-input compact${missing ? " is-invalid" : ""}`}
                        aria-label={`Clip for ${state}`}
                        value={currentClip}
                        onChange={(e) =>
                          onManifestChange((prev) => ({
                            ...prev,
                            animations: {
                              ...prev.animations,
                              [state]: { ...prev.animations[state], clip: e.target.value },
                            },
                          }))
                        }
                      >
                        {missing && (
                          <option value={currentClip}>
                            {currentClip || "(unmapped)"} — missing
                          </option>
                        )}
                        {clips.map((clip) => (
                          <option key={clip} value={clip}>
                            {clip}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="studio-input compact"
                        aria-label={`Clip for ${state}`}
                        type="text"
                        value={currentClip}
                        onChange={(e) =>
                          onManifestChange((prev) => ({
                            ...prev,
                            animations: {
                              ...prev.animations,
                              [state]: { ...prev.animations[state], clip: e.target.value },
                            },
                          }))
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {activeTab === "export" && (
        <>
          <section className="panel-card">
            <h2 className="panel-title">Metadata &amp; Camera</h2>
            <div className="field-stack">
              <label className="field">
                <span className="field-label">Pet ID (slug)</span>
                <input
                  className="studio-input"
                  type="text"
                  value={manifest.id}
                  onChange={(e) =>
                    onManifestChange((prev) => ({ ...prev, id: e.target.value }))
                  }
                />
              </label>

              <div className="field-row">
                <label className="field">
                  <span className="field-label">Display Name</span>
                  <input
                    className="studio-input"
                    type="text"
                    value={manifest.display_name}
                    onChange={(e) =>
                      onManifestChange((prev) => ({ ...prev, display_name: e.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">Author</span>
                  <input
                    className="studio-input"
                    type="text"
                    value={manifest.author}
                    onChange={(e) =>
                      onManifestChange((prev) => ({ ...prev, author: e.target.value }))
                    }
                  />
                </label>
              </div>

              <label className="field">
                <span className="field-label">
                  Scale: <strong>{manifest.scale.toFixed(2)}×</strong>
                </span>
                <input
                  type="range"
                  min={0.25}
                  max={2.5}
                  step={0.05}
                  value={manifest.scale}
                  onChange={(e) =>
                    onManifestChange((prev) => ({ ...prev, scale: Number(e.target.value) }))
                  }
                />
              </label>

              <label className="field">
                <span className="field-label">
                  Camera FOV: <strong>{Math.round(manifest.camera.fov)}°</strong>
                </span>
                <input
                  type="range"
                  min={20}
                  max={75}
                  step={1}
                  value={manifest.camera.fov}
                  onChange={(e) =>
                    onManifestChange((prev) => ({
                      ...prev,
                      camera: { ...prev.camera, fov: Number(e.target.value) },
                    }))
                  }
                />
              </label>

              <div className="camera-readout">
                <div>
                  <span className="info-key">Pos:</span>{" "}
                  <code>[{manifest.camera.position.map((v) => v.toFixed(2)).join(", ")}]</code>
                </div>
                <div>
                  <span className="info-key">Target:</span>{" "}
                  <code>[{manifest.camera.target.map((v) => v.toFixed(2)).join(", ")}]</code>
                </div>
                <button type="button" className="reset-btn compact" onClick={onResetCamera}>
                  Reset Camera
                </button>
              </div>
            </div>
          </section>

          <section className="panel-card">
            <div className="panel-title-row">
              <h2 className="panel-title">pet-3d.json</h2>
              <div className="export-actions">
                <button type="button" className="mini-btn" onClick={handleCopyJson}>
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button type="button" className="mini-btn primary" onClick={handleDownloadJson}>
                  Download
                </button>
              </div>
            </div>
            <pre className="json-preview">{jsonOutput}</pre>
          </section>
        </>
      )}
    </aside>
  );
}
