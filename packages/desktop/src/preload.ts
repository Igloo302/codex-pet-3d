import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { StandardAnimationState } from "@codex-pet-3d/spec";
import type { LoadedPetPayload } from "./pet-registry";

/**
 * Cursor update payload received from main process
 */
export interface CursorUpdatePayload {
  x: number;
  y: number;
}

/**
 * Window drag payload
 */
export interface DragWindowPayload {
  x: number;
  y: number;
}

export interface WindowSizePayload {
  width: number;
  height: number;
}

export interface InitialDesktopState {
  pet: LoadedPetPayload | null;
  isLookAtEnabled: boolean;
  width: number;
  height: number;
}

/**
 * Exposed API for the renderer process
 */
interface DesktopPetAPI {
  /**
   * Fetch initial pet payload, lookAt state, and scaled window size.
   */
  getInitialState: () => Promise<InitialDesktopState>;

  /**
   * Listen for cursor position updates from main process (30Hz polling)
   */
  onCursorUpdate: (callback: (payload: CursorUpdatePayload) => void) => () => void;

  /**
   * Request to set mouse event ignore state (for click-through)
   */
  setIgnoreMouseEvents: (ignore: boolean) => void;

  /**
   * Move window by relative offset
   */
  moveWindow: (offset: { x: number; y: number }) => void;

  /**
   * Request native context menu
   */
  showContextMenu: () => void;

  /**
   * Listen for action state change request from context menu or Codex sync
   */
  onPlayAnimation: (callback: (state: StandardAnimationState) => void) => () => void;

  /**
   * Listen for lookAt toggle from context menu
   */
  onToggleLookAt: (callback: (enabled: boolean) => void) => () => void;

  /**
   * Listen for pet switches from context/tray menu
   */
  onPetChanged: (callback: (payload: LoadedPetPayload) => void) => () => void;

  /**
   * Listen for window scale resize updates from main process
   */
  onWindowResize: (callback: (size: WindowSizePayload) => void) => () => void;
}

const api: DesktopPetAPI = {
  getInitialState: () => ipcRenderer.invoke("get-initial-state") as Promise<InitialDesktopState>,

  onCursorUpdate: (callback: (payload: CursorUpdatePayload) => void) => {
    const listener = (_event: IpcRendererEvent, payload: CursorUpdatePayload) => {
      callback(payload);
    };
    ipcRenderer.on("cursor-update", listener);
    return () => ipcRenderer.removeListener("cursor-update", listener);
  },

  setIgnoreMouseEvents: (ignore: boolean) => {
    ipcRenderer.send("set-ignore-mouse-events", ignore);
  },

  moveWindow: (offset: { x: number; y: number }) => {
    ipcRenderer.send("move-window", offset);
  },

  showContextMenu: () => {
    ipcRenderer.send("show-context-menu");
  },

  onPlayAnimation: (callback: (state: StandardAnimationState) => void) => {
    const listener = (_event: IpcRendererEvent, state: StandardAnimationState) => {
      callback(state);
    };
    ipcRenderer.on("play-animation", listener);
    return () => ipcRenderer.removeListener("play-animation", listener);
  },

  onToggleLookAt: (callback: (enabled: boolean) => void) => {
    const listener = (_event: IpcRendererEvent, enabled: boolean) => {
      callback(enabled);
    };
    ipcRenderer.on("toggle-look-at", listener);
    return () => ipcRenderer.removeListener("toggle-look-at", listener);
  },

  onPetChanged: (callback: (payload: LoadedPetPayload) => void) => {
    const listener = (_event: IpcRendererEvent, payload: LoadedPetPayload) => {
      callback(payload);
    };
    ipcRenderer.on("pet-changed", listener);
    return () => ipcRenderer.removeListener("pet-changed", listener);
  },

  onWindowResize: (callback: (size: WindowSizePayload) => void) => {
    const listener = (_event: IpcRendererEvent, size: WindowSizePayload) => {
      callback(size);
    };
    ipcRenderer.on("window-resize", listener);
    return () => ipcRenderer.removeListener("window-resize", listener);
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld("desktopPet", api);

// Type declaration for the global window object
declare global {
  interface Window {
    desktopPet: DesktopPetAPI;
  }
}
