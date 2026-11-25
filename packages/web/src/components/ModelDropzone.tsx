import { useRef, useState } from "react";
import type { Pet3DManifest } from "@codex-pet-3d/spec";

export interface ModelDropzoneProps {
  /** Receives the raw GLB file bytes plus the original file name. */
  onModel: (data: Uint8Array, fileName: string) => void;
  /** Optional handler when a companion pet-3d.json file is dropped alongside or separately. */
  onManifestJson?: (manifest: Pet3DManifest, fileName: string) => void;
  onError?: (message: string) => void;
}

/**
 * Drag-and-drop (and click-to-browse) zone for local `.glb` models (and optional `pet-3d.json`).
 */
export function ModelDropzone({ onModel, onManifestJson, onError }: ModelDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const readGlbFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result === null || typeof result === "string") {
        onError?.("Could not read the file as binary data.");
        return;
      }
      onModel(new Uint8Array(result), file.name);
    };
    reader.onerror = () => onError?.("Failed to read the dropped file.");
    reader.readAsArrayBuffer(file);
  };

  const readJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === "string" ? reader.result : "";
        const parsed = JSON.parse(text) as Pet3DManifest;
        if (!parsed || typeof parsed !== "object" || !parsed.animations || !parsed.camera) {
          onError?.(`${file.name} does not look like a valid pet-3d.json manifest.`);
          return;
        }
        onManifestJson?.(parsed, file.name);
      } catch {
        onError?.(`Failed to parse ${file.name} as JSON.`);
      }
    };
    reader.onerror = () => onError?.(`Failed to read ${file.name}.`);
    reader.readAsText(file);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let handledAny = false;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".glb")) {
        readGlbFile(file);
        handledAny = true;
      } else if (lower.endsWith(".json") && onManifestJson) {
        readJsonFile(file);
        handledAny = true;
      }
    }

    if (!handledAny) {
      onError?.("Only .glb (glTF 2.0 binary) files are supported.");
    }
  };

  const openPicker = () => inputRef.current?.click();

  return (
    <div
      className={`dropzone${isDragging ? " is-dragging" : ""}`}
      role="button"
      tabIndex={0}
      aria-label="Drop a .glb model here or browse for one"
      onClick={openPicker}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPicker();
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
    >
      <span className="dropzone-icon" aria-hidden="true">
        ⇧
      </span>
      <span className="dropzone-title">
        {onManifestJson ? "Drop .glb (and optional pet-3d.json)" : "Drop a .glb model"}
      </span>
      <span className="dropzone-sub">
        Auto-inspects skeleton, clips &amp; spec budgets right in your browser
      </span>
      <input
        ref={inputRef}
        className="file-input"
        type="file"
        multiple={Boolean(onManifestJson)}
        accept={onManifestJson ? ".glb,model/gltf-binary,.json,application/json" : ".glb,model/gltf-binary"}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <span className="browse-btn" aria-hidden="true">
        Browse files
      </span>
    </div>
  );
}
