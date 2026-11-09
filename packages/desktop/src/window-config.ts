import * as path from "path";
import type { BrowserWindowConstructorOptions } from "electron";

export interface WindowSize {
  width: number;
  height: number;
}

/**
 * Get Electron BrowserWindow constructor options for the desktop pet window.
 * Creates a frameless, transparent, always-on-top window suitable for a floating desktop companion.
 */
export function getWindowOptions(
  size: WindowSize = { width: 220, height: 240 }
): BrowserWindowConstructorOptions {
  return {
    width: size.width,
    height: size.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  };
}