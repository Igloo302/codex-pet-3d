import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { StandardAnimationState } from "@codex-pet-3d/spec";

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

/**
 * Exposed API for the renderer process
 */
interface DesktopPetAPI {
  /**
   * Listen for cursor position updates from main process (30Hz polling)
   */
  onCursorUpdate: (callback: (payload: CursorUpdatePayload) => void) => () => void;

  /**
   * Request to set mouse event ignore state (for click-through)
   */
  setIgnoreMouseEvents: (ignore: boolean) => void;

  /**
   * Request window drag to start moving the frameless window
   */
  dragWindow: () => void;

  /**
   * Move window by relative offset
   */
  moveWindow: (offset: { x: number; y: number }) => void;

  /**
   * Request native context menu
   */
  showContextMenu: () => void;

  /**
   * Listen for action state change request from context menu
   */
  onPlayAnimation: (callback: (state: StandardAnimationState) => void) => () => void;

  /**
   * Listen for lookAt toggle from context menu
   */
  onToggleLookAt: (callback: (enabled: boolean) => void) => () => void;
}

const api: DesktopPetAPI = {
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

  dragWindow: () => {
    ipcRenderer.send("drag-window");
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
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld("desktopPet", api);

// Type declaration for the global window object
declare global {
  interface Window {
    desktopPet: DesktopPetAPI;
  }
}