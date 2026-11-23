import { app, BrowserWindow, screen, ipcMain, Menu } from "electron";
import * as path from "path";
import { getWindowOptions } from "./window-config";
import { createContextMenuTemplate } from "./context-menu";

let mainWindow: BrowserWindow | null = null;
let cursorPollingInterval: NodeJS.Timeout | null = null;
let isLookAtEnabled = true;

/**
 * Reset window position to the bottom-right corner of the work area
 */
function resetWindowPosition(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const petWidth = 220;
  const petHeight = 240;
  const x = Math.max(0, screenWidth - petWidth - 30);
  const y = Math.max(0, screenHeight - petHeight - 30);
  mainWindow.setPosition(x, y);
}

/**
 * Create the main application window
 */
function createWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const petWidth = 220;
  const petHeight = 240;

  const options = getWindowOptions({ width: petWidth, height: petHeight });
  options.x = Math.max(0, screenWidth - petWidth - 30);
  options.y = Math.max(0, screenHeight - petHeight - 30);

  mainWindow = new BrowserWindow(options);

  // Set click-through on transparent areas by default
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

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

    // Normalize relative to the active display bounds so the pet tracks across the entire screen
    const display = screen.getDisplayNearestPoint(cursorPoint);
    const displayBounds = display.bounds;
    const rangeX = Math.max(displayBounds.width / 2, 400);
    const rangeY = Math.max(displayBounds.height / 2, 300);

    const normalizedX = offsetX / rangeX;
    const normalizedY = offsetY / rangeY;

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
ipcMain.on("set-ignore-mouse-events", (_event, ignore: unknown) => {
  if (typeof ignore !== "boolean") return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (ignore) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      mainWindow.setIgnoreMouseEvents(false);
    }
  }
});

/**
 * IPC handler for moving the frameless window
 */
ipcMain.on("move-window", (_event, offset: unknown) => {
  if (
    !offset ||
    typeof offset !== "object" ||
    typeof (offset as { x?: unknown }).x !== "number" ||
    typeof (offset as { y?: unknown }).y !== "number"
  ) {
    return;
  }
  const { x: dx, y: dy } = offset as { x: number; y: number };
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(Math.round(x + dx), Math.round(y + dy));
  }
});

/**
 * IPC handler for showing the native context menu
 */
ipcMain.on("show-context-menu", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const template = createContextMenuTemplate({
    isLookAtEnabled,
    onPlayAnimation: (state) => mainWindow?.webContents.send("play-animation", state),
    onToggleLookAt: (enabled) => {
      isLookAtEnabled = enabled;
      mainWindow?.webContents.send("toggle-look-at", isLookAtEnabled);
    },
    onResetPosition: () => resetWindowPosition(),
    onQuit: () => app.quit(),
  });

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow });
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