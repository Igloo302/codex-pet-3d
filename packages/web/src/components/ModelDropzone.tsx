import { useRef, useState } from "react";

export interface ModelDropzoneProps {
  /** Receives the raw file bytes plus the original file name. */
  onModel: (data: Uint8Array, fileName: string) => void;
  onError?: (message: string) => void;
}

/**
 * Drag-and-drop (and click-to-browse) zone for local `.glb` models.
 *
 * The file is read with FileReader.readAsArrayBuffer and handed to the parent
 * as a portable Uint8Array — no Node Buffer dependency, so the same bytes can
 * be forwarded to the GLTF loader or a Web Worker.
 */
export function ModelDropzone({ onModel, onError }: ModelDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const readFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".glb")) {
      onError?.("Only .glb (glTF 2.0 binary) files are supported.");
      return;
    }

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

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) readFile(file);
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
      <span className="dropzone-title">Drop a .glb model</span>
      <span className="dropzone-sub">
        glTF 2.0 binary with the 9 standard animation clips
      </span>
      <input
        ref={inputRef}
        className="file-input"
        type="file"
        accept=".glb,model/gltf-binary"
        onChange={(event) => {
          handleFiles(event.target.files);
          // Allow picking the same file again after a reset.
          event.target.value = "";
        }}
      />
      <span className="browse-btn" aria-hidden="true">
        Browse files
      </span>
    </div>
  );
}
