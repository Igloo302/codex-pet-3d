import { app, BrowserWindow, screen, ipcMain } from "electron";
import * as path from "path";
import { getWindowOptions } from "./window-config";

let mainWindow: BrowserWindow | null = null;
let cursorPollingInterval: NodeJS.Timeout | null = null;

/**
 * Create the main application window
 */
function createWindow(): void {
  const options = getWindowOptions({ width: 220, height: 240 });

  mainWindow = new BrowserWindow(options);

  // Load the renderer HTML
  const rendererPath = path.join(__dirname, "renderer", "index.html");
  mainWindow.loadFile(rendererPath);

  // Set up cursor polling at 30Hz (~33ms interval)
  startCursorPolling();

  // Handle window closed
  mainWindow.on("closed", () => {
    stopCursorPolling();
    mainWindow = null;
  });
}

/**
 * Start polling cursor position at 30Hz and send to renderer
 */
function startCursorPolling(): void {
  if (cursorPollingInterval) return;

  cursorPollingInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      stopCursorPolling();
      return;
    }

    // Get cursor screen position
    const cursorPoint = screen.getCursorScreenPoint();

    // Get window bounds to calculate relative position
    const bounds = mainWindow.getBounds();
    const windowCenterX = bounds.x + bounds.width / 2;
    const windowCenterY = bounds.y + bounds.height / 2;

    // Calculate offset from window center
    const offsetX = cursorPoint.x - windowCenterX;
    const offsetY = cursorPoint.y - windowCenterY;

    // Normalize to [-1, 1] range based on window dimensions
    // Using half width/height as the normalization factor
    const normalizedX = offsetX / (bounds.width / 2);
    const normalizedY = offsetY / (bounds.height / 2);

    // Clamp to [-1, 1]
    const clampedX = Math.max(-1, Math.min(1, normalizedX));
    const clampedY = Math.max(-1, Math.min(1, normalizedY));

    // Send to renderer
    mainWindow.webContents.send("cursor-update", {
      x: clampedX,
      y: clampedY,
    });
  }, 1000 / 30); // 30Hz = ~33.33ms
}

/**
 * Stop cursor polling
 */
function stopCursorPolling(): void {
  if (cursorPollingInterval) {
    clearInterval(cursorPollingInterval);
    cursorPollingInterval = null;
  }
}

/**
 * IPC handler for setting ignore mouse events (click-through)
 */
ipcMain.on("set-ignore-mouse-events", (_event, ignore: boolean) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

/**
 * IPC handler for dragging the frameless window
 */
ipcMain.on("drag-window", (_event) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.webContents.send("drag-window-start");
  }
});

// App event handlers
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopCursorPolling();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopCursorPolling();
});