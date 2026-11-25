import { createRef } from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { WebXRSupportStatus, XRSessionState } from "@codex-pet-3d/core";
import { INITIAL_XR_STATE, XRControls, type XRControlsProps } from "../src/components/XRControls";

afterEach(cleanup);

const FULL_SUPPORT: WebXRSupportStatus = {
  available: true,
  secureContext: true,
  arSupported: true,
  vrSupported: true,
  preferredMode: "immersive-ar",
};

const VR_ONLY_SUPPORT: WebXRSupportStatus = {
  available: true,
  secureContext: true,
  arSupported: false,
  vrSupported: true,
  preferredMode: "immersive-vr",
};

const NO_SUPPORT: WebXRSupportStatus = {
  available: false,
  secureContext: true,
  arSupported: false,
  vrSupported: false,
  preferredMode: null,
  reason: "This browser does not expose immersive WebXR sessions.",
};

const AR_ACTIVE: XRSessionState = {
  active: true,
  mode: "immersive-ar",
  placementActive: true,
  surfaceDetected: false,
  xrScale: 0.45,
};

const VR_ACTIVE: XRSessionState = {
  active: true,
  mode: "immersive-vr",
  placementActive: false,
  surfaceDetected: false,
  xrScale: 0.6,
};

function createProps(overrides: Partial<XRControlsProps> = {}): XRControlsProps {
  return {
    support: FULL_SUPPORT,
    xrState: INITIAL_XR_STATE,
    busy: false,
    error: null,
    currentState: "idle",
    overlayRef: createRef<HTMLDivElement>(),
    onEnterXR: vi.fn(),
    onExitXR: vi.fn(),
    onTogglePlacement: vi.fn(),
    onScaleChange: vi.fn(),
    onRecenter: vi.fn(),
    onSelectPetState: vi.fn(),
    ...overrides,
  };
}

function getOverlay(container: HTMLElement): HTMLElement {
  const overlay = container.querySelector(".xr-dom-overlay");
  expect(overlay).toBeInstanceOf(HTMLElement);
  return overlay as HTMLElement;
}

describe("XRControls", () => {
  it("offers Enter AR and Enter VR when both immersive modes are supported", () => {
    const props = createProps();
    render(<XRControls {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Enter AR" }));
    expect(props.onEnterXR).toHaveBeenCalledWith("immersive-ar");

    fireEvent.click(screen.getByRole("button", { name: "Enter VR" }));
    expect(props.onEnterXR).toHaveBeenCalledWith("immersive-vr");
  });

  it("offers only Enter VR when immersive-ar is unsupported", () => {
    render(<XRControls {...createProps({ support: VR_ONLY_SUPPORT })} />);

    expect(screen.getByRole("button", { name: "Enter VR" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enter AR" })).toBeNull();
  });

  it("shows a disabled fallback button with an explanatory tooltip when WebXR is unavailable", () => {
    render(<XRControls {...createProps({ support: NO_SUPPORT })} />);

    const button = screen.getByRole("button", { name: "WebXR Unavailable" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe(NO_SUPPORT.reason);
  });

  it("asks for HTTPS when the page is not a secure context", () => {
    render(
      <XRControls
        {...createProps({ support: { ...NO_SUPPORT, secureContext: false } })}
      />
    );

    const button = screen.getByRole("button", { name: "WebXR Needs HTTPS" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain("secure context");
  });

  it("disables entry buttons while a session request is in flight", () => {
    render(<XRControls {...createProps({ busy: true })} />);

    expect(
      (screen.getByRole("button", { name: "Starting AR…" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Starting VR…" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("shows the active AR session badge and exits through the viewport pill", () => {
    const props = createProps({ xrState: AR_ACTIVE });
    const { container } = render(<XRControls {...props} />);

    expect(screen.getByText("AR session")).toBeTruthy();
    const pill = container.querySelector(".xr-controls") as HTMLElement;
    fireEvent.click(within(pill).getByRole("button", { name: "Exit AR" }));
    expect(props.onExitXR).toHaveBeenCalledTimes(1);
  });

  it("shows Exit VR for an active VR session", () => {
    const props = createProps({ xrState: VR_ACTIVE });
    const { container } = render(<XRControls {...props} />);

    expect(screen.getByText("VR session")).toBeTruthy();
    const pill = container.querySelector(".xr-controls") as HTMLElement;
    fireEvent.click(within(pill).getByRole("button", { name: "Exit VR" }));
    expect(props.onExitXR).toHaveBeenCalledTimes(1);
  });

  it("exposes placement, scale, recenter and animation controls in the AR DOM overlay", () => {
    const props = createProps({ xrState: AR_ACTIVE, currentState: "waving" });
    const { container } = render(<XRControls {...props} />);

    const overlay = getOverlay(container);
    expect(overlay.hidden).toBe(false);

    fireEvent.click(within(overlay).getByRole("button", { name: "Done Placing" }));
    expect(props.onTogglePlacement).toHaveBeenCalledTimes(1);

    fireEvent.click(within(overlay).getByRole("button", { name: "Scale up" }));
    expect(props.onScaleChange).toHaveBeenCalledWith(0.1);

    fireEvent.click(within(overlay).getByRole("button", { name: "Scale down" }));
    expect(props.onScaleChange).toHaveBeenCalledWith(-0.1);

    fireEvent.click(within(overlay).getByRole("button", { name: "Recenter" }));
    expect(props.onRecenter).toHaveBeenCalledTimes(1);

    fireEvent.click(within(overlay).getByRole("button", { name: "Jump" }));
    expect(props.onSelectPetState).toHaveBeenCalledWith("jumping");

    fireEvent.click(within(overlay).getByRole("button", { name: "Wave" }));
    expect(props.onSelectPetState).toHaveBeenCalledWith("waving");

    expect(within(overlay).getByText("45%")).toBeTruthy();
    expect(within(overlay).getByRole("button", { name: "Wave" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
  });

  it("guides the user to scan a surface until the reticle is detected", () => {
    const { container, rerender } = render(<XRControls {...createProps({ xrState: AR_ACTIVE })} />);

    expect(within(getOverlay(container)).getByText(/Scan a surface/)).toBeTruthy();

    rerender(
      <XRControls {...createProps({ xrState: { ...AR_ACTIVE, surfaceDetected: true } })} />
    );
    expect(within(getOverlay(container)).getByText(/Tap the reticle/)).toBeTruthy();
  });

  it("keeps the AR DOM overlay hidden outside immersive-ar sessions", () => {
    const idle = render(<XRControls {...createProps()} />);
    expect(getOverlay(idle.container).hidden).toBe(true);
    idle.unmount();

    const vr = render(<XRControls {...createProps({ xrState: VR_ACTIVE })} />);
    expect(getOverlay(vr.container).hidden).toBe(true);
  });

  it("shows an inline error with a dismiss action", () => {
    const onDismissError = vi.fn();
    render(<XRControls {...createProps({ error: "Permission denied", onDismissError })} />);

    expect(screen.getByRole("alert").textContent).toContain("Permission denied");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss WebXR error" }));
    expect(onDismissError).toHaveBeenCalledTimes(1);
  });

  it("prevents AR overlay taps from triggering underlying XR select events", () => {
    const { container } = render(<XRControls {...createProps({ xrState: AR_ACTIVE })} />);
    const overlayBar = container.querySelector(".xr-overlay-bar") as HTMLElement;

    const event = new Event("beforexrselect", { bubbles: true, cancelable: true });
    overlayBar.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
