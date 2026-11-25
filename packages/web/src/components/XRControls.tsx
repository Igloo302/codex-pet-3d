import { useEffect, useRef, type RefObject } from "react";
import type {
  PetState,
  WebXRSupportStatus,
  XRMode,
  XRSessionState,
} from "@codex-pet-3d/core";

/** Idle XR state shared by the viewport, the controls and the header chips. */
export const INITIAL_XR_STATE: XRSessionState = {
  active: false,
  mode: null,
  placementActive: false,
  surfaceDetected: false,
  xrScale: 1,
};

const AR_QUICK_STATES: Array<{ state: PetState; label: string }> = [
  { state: "idle", label: "Idle" },
  { state: "waving", label: "Wave" },
  { state: "jumping", label: "Jump" },
  { state: "running", label: "Running" },
  { state: "review", label: "Review" },
];

export interface XRControlsProps {
  support: WebXRSupportStatus | null;
  xrState: XRSessionState;
  busy: boolean;
  error: string | null;
  currentState: PetState;
  overlayRef?: RefObject<HTMLDivElement>;
  onEnterXR: (mode: XRMode) => void;
  onExitXR: () => void;
  onTogglePlacement: () => void;
  onScaleChange: (delta: number) => void;
  onRecenter: () => void;
  onSelectPetState: (state: PetState) => void;
  onDismissError?: () => void;
}

function unavailableTitle(support: WebXRSupportStatus | null): string {
  if (!support) {
    return "Checking WebXR support for this browser…";
  }
  if (!support.secureContext) {
    return "WebXR requires a secure context. Open the studio over HTTPS or http://localhost.";
  }
  return (
    support.reason ??
    "Use a WebXR-capable headset browser or install the Immersive Web Emulator extension."
  );
}

/**
 * WebXR entry points for the viewport: immersive session buttons, an inline error hint and
 * the DOM overlay HUD that is shown inside an immersive-ar session.
 */
export function XRControls({
  support,
  xrState,
  busy,
  error,
  currentState,
  overlayRef,
  onEnterXR,
  onExitXR,
  onTogglePlacement,
  onScaleChange,
  onRecenter,
  onSelectPetState,
  onDismissError,
}: XRControlsProps) {
  const overlayBarRef = useRef<HTMLDivElement>(null);
  const hasImmersiveMode = Boolean(support?.arSupported || support?.vrSupported);
  const needsHttps = Boolean(support && !support.secureContext);

  useEffect(() => {
    const bar = overlayBarRef.current;
    if (!bar) return;

    const handleBeforeXRSelect = (event: Event) => {
      event.preventDefault();
    };

    bar.addEventListener("beforexrselect", handleBeforeXRSelect);
    return () => {
      bar.removeEventListener("beforexrselect", handleBeforeXRSelect);
    };
  }, []);

  return (
    <>
      <div className="xr-controls" role="group" aria-label="WebXR">
        {xrState.active ? (
          <>
            <span className="xr-badge">
              {xrState.mode === "immersive-ar" ? "AR session" : "VR session"}
            </span>
            <button type="button" className="xr-btn active" onClick={onExitXR}>
              {xrState.mode === "immersive-ar" ? "Exit AR" : "Exit VR"}
            </button>
          </>
        ) : hasImmersiveMode ? (
          <>
            {support?.arSupported && (
              <button
                type="button"
                className="xr-btn"
                disabled={busy}
                onClick={() => onEnterXR("immersive-ar")}
              >
                {busy ? "Starting AR…" : "Enter AR"}
              </button>
            )}
            {support?.vrSupported && (
              <button
                type="button"
                className="xr-btn"
                disabled={busy}
                onClick={() => onEnterXR("immersive-vr")}
              >
                {busy ? "Starting VR…" : "Enter VR"}
              </button>
            )}
          </>
        ) : (
          <button type="button" className="xr-btn" disabled title={unavailableTitle(support)}>
            {needsHttps ? "WebXR Needs HTTPS" : "WebXR Unavailable"}
          </button>
        )}

        {error && (
          <div className="xr-error" role="alert">
            <span>{error}</span>
            {onDismissError && (
              <button
                type="button"
                className="xr-error-dismiss"
                aria-label="Dismiss WebXR error"
                onClick={onDismissError}
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      <div
        ref={overlayRef}
        className="xr-dom-overlay"
        hidden={!xrState.active || xrState.mode !== "immersive-ar"}
      >
        <div ref={overlayBarRef} className="xr-overlay-bar">
          <button type="button" className="xr-btn" onClick={onExitXR}>
            Exit AR
          </button>
          <button
            type="button"
            className={`xr-btn${xrState.placementActive ? " active" : ""}`}
            aria-pressed={xrState.placementActive}
            onClick={onTogglePlacement}
          >
            {xrState.placementActive ? "Done Placing" : "Move Pet"}
          </button>
          <span className="xr-overlay-hint">
            {xrState.placementActive
              ? xrState.surfaceDetected
                ? "Tap the reticle to place the pet"
                : "Scan a surface to place the pet"
              : "Pet placed — use the controls below"}
          </span>

          <div className="xr-overlay-actions">
            <button
              type="button"
              className="xr-btn"
              aria-label="Scale down"
              onClick={() => onScaleChange(-0.1)}
            >
              −
            </button>
            <span className="xr-scale-readout">{Math.round(xrState.xrScale * 100)}%</span>
            <button
              type="button"
              className="xr-btn"
              aria-label="Scale up"
              onClick={() => onScaleChange(0.1)}
            >
              +
            </button>
            <button type="button" className="xr-btn" onClick={onRecenter}>
              Recenter
            </button>

            {AR_QUICK_STATES.map(({ state, label }) => {
              const isActive = currentState === state;
              return (
                <button
                  key={state}
                  type="button"
                  className={`xr-btn${isActive ? " active" : ""}`}
                  aria-pressed={isActive}
                  data-state={state}
                  onClick={() => onSelectPetState(state)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
