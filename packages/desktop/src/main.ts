import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
} from "electron";
import * as os from "node:os";
import * as path from "node:path";
import { getWindowOptions } from "./window-config";
import { createContextMenuTemplate } from "./context-menu";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type DesktopPreferences,
  type WindowScale,
} from "./preferences";
import {
  discoverPets,
  inspectPetDirectory,
  loadPetPayload,
  type DiscoveredPet,
  type LoadedPetPayload,
} from "./pet-registry";
import { CodexSyncService } from "./codex-sync";

const BASE_PET_WIDTH = 220;
const BASE_PET_HEIGHT = 240;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let cursorPollingInterval: NodeJS.Timeout | null = null;
let savePositionTimer: NodeJS.Timeout | null = null;
let codexSync: CodexSyncService | null = null;

let prefsPath = "";
let prefs: DesktopPreferences = { ...DEFAULT_PREFERENCES, customPetDirs: [] };
let discoveredPets: DiscoveredPet[] = [];
let activePet: DiscoveredPet | null = null;

function getScaledSize(scale: WindowScale): { width: number; height: number } {
  return {
    width: Math.round(BASE_PET_WIDTH * scale),
    height: Math.round(BASE_PET_HEIGHT * scale),
  };
}

function getDefaultWindowPosition(width: number, height: number): { x: number; y: number } {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x: workX, y: workY, width: screenWidth, height: screenHeight } =
    primaryDisplay.workArea;
  return {
    x: Math.max(workX, workX + screenWidth - width - 30),
    y: Math.max(workY, workY + screenHeight - height - 30),
  };
}

function clampPositionToDisplays(
  pos: { x: number; y: number },
  width: number,
  height: number
): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({
    x: pos.x + Math.round(width / 2),
    y: pos.y + Math.round(height / 2),
  });
  const area = display.workArea;
  const maxX = Math.max(area.x, area.x + area.width - width);
  const maxY = Math.max(area.y, area.y + area.height - height);
  return {
    x: Math.max(area.x, Math.min(maxX, Math.round(pos.x))),
    y: Math.max(area.y, Math.min(maxY, Math.round(pos.y))),
  };
}

function persistPreferences(): void {
  if (!prefsPath) return;
  try {
    savePreferences(prefsPath, prefs);
  } catch {
    // Non-fatal if userData directory is temporarily unavailable
  }
}

function scheduleSavePosition(x: number, y: number): void {
  prefs = { ...prefs, windowPosition: { x, y } };
  if (savePositionTimer) {
    clearTimeout(savePositionTimer);
  }
  savePositionTimer = setTimeout(() => {
    savePositionTimer = null;
    persistPreferences();
  }, 400);
}

function refreshPetCatalog(): void {
  const bundledDir = path.join(__dirname, "renderer", "assets");
  const codexPetsDir = path.join(os.homedir(), ".codex", "pets");
  discoveredPets = discoverPets({
    bundledDir,
    codexPetsDir,
    customDirs: prefs.customPetDirs,
  });

  if (prefs.selectedPetId) {
    activePet = discoveredPets.find((p) => p.id === prefs.selectedPetId) ?? null;
  }
  if (!activePet && discoveredPets.length > 0) {
    activePet = discoveredPets[0];
    prefs = { ...prefs, selectedPetId: activePet.id };
  }
  updateTrayMenu();
}

function selectPet(petId: string): void {
  const found = discoveredPets.find((p) => p.id === petId);
  if (!found) return;
  activePet = found;
  prefs = { ...prefs, selectedPetId: found.id };
  persistPreferences();

  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const payload = loadPetPayload(found);
      mainWindow.webContents.send("pet-changed", payload);
    } catch {
      // Ignore transient disk errors
    }
  }
  updateTrayMenu();
}

async function importPetDirectory(): Promise<void> {
  const openOpts = {
    title: "选择 3D 宠物目录（需包含 pet-3d.json 与 .glb 模型）",
    properties: ["openDirectory" as const],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, openOpts)
    : await dialog.showOpenDialog(openOpts);
  if (result.canceled || result.filePaths.length === 0) return;

  const chosenDir = result.filePaths[0];
  const inspected = inspectPetDirectory(chosenDir, "custom");
  if (!inspected) {
    const msgOpts = {
      type: "warning" as const,
      title: "未找到有效的 3D 宠物",
      message: "所选目录中缺少有效的 pet-3d.json 或模型 .glb 文件。",
    };
    if (mainWindow) {
      await dialog.showMessageBox(mainWindow, msgOpts);
    } else {
      await dialog.showMessageBox(msgOpts);
    }
    return;
  }

  const nextCustomDirs = prefs.customPetDirs.includes(chosenDir)
    ? prefs.customPetDirs
    : [...prefs.customPetDirs, chosenDir];
  prefs = { ...prefs, customPetDirs: nextCustomDirs, selectedPetId: inspected.id };
  persistPreferences();
  refreshPetCatalog();
  selectPet(inspected.id);
}

function applyWindowScale(scale: WindowScale): void {
  prefs = { ...prefs, windowScale: scale };
  persistPreferences();

  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { width, height } = getScaledSize(scale);
  const [curX, curY] = mainWindow.getPosition();
  const clamped = clampPositionToDisplays({ x: curX, y: curY }, width, height);

  mainWindow.setResizable(true);
  mainWindow.setSize(width, height);
  mainWindow.setPosition(clamped.x, clamped.y);
  mainWindow.setResizable(false);
  mainWindow.webContents.send("window-resize", { width, height });
  prefs = { ...prefs, windowPosition: clamped };
  persistPreferences();
  updateTrayMenu();
}

function resetWindowPosition(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { width, height } = getScaledSize(prefs.windowScale);
  const pos = getDefaultWindowPosition(width, height);
  mainWindow.setPosition(pos.x, pos.y);
  prefs = { ...prefs, windowPosition: pos };
  persistPreferences();
}

function buildMenuTemplate() {
  const syncStatus = codexSync?.getStatus();
  const syncLabel = syncStatus
    ? syncStatus.httpPort
      ? `${syncStatus.state} · :${syncStatus.httpPort}`
      : syncStatus.state
    : undefined;

  return createContextMenuTemplate({
    isLookAtEnabled: prefs.isLookAtEnabled,
    isCodexSyncEnabled: prefs.isCodexSyncEnabled,
    codexSyncLabel: syncLabel,
    pets: discoveredPets.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      author: p.author,
      source: p.source,
    })),
    selectedPetId: activePet?.id ?? null,
    windowScale: prefs.windowScale,
    onPlayAnimation: (state) => mainWindow?.webContents.send("play-animation", state),
    onToggleLookAt: (enabled) => {
      prefs = { ...prefs, isLookAtEnabled: enabled };
      persistPreferences();
      mainWindow?.webContents.send("toggle-look-at", enabled);
      updateTrayMenu();
    },
    onToggleCodexSync: (enabled) => {
      prefs = { ...prefs, isCodexSyncEnabled: enabled };
      persistPreferences();
      codexSync?.setEnabled(enabled);
      updateTrayMenu();
    },
    onSelectPet: (petId) => selectPet(petId),
    onImportPetDirectory: () => {
      void importPetDirectory();
    },
    onRefreshPets: () => refreshPetCatalog(),
    onChangeScale: (scale) => applyWindowScale(scale),
    onResetPosition: () => resetWindowPosition(),
    onQuit: () => app.quit(),
  });
}

function updateTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate()));
}

function setupTray(): void {
  try {
    // 16x16 minimal crisp paw SVG icon (embedded so no extra asset files are required)
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' +
      '<circle cx="4" cy="5.5" r="1.8" fill="#4cc9f0"/>' +
      '<circle cx="8" cy="4" r="1.8" fill="#4cc9f0"/>' +
      '<circle cx="12" cy="5.5" r="1.8" fill="#4cc9f0"/>' +
      '<ellipse cx="8" cy="10.5" rx="4.2" ry="3.2" fill="#a78bfa"/>' +
      "</svg>";
    const icon = nativeImage.createFromDataURL(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
    );
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    tray.setToolTip("Codex Pet 3D");
    updateTrayMenu();
  } catch {
    tray = null;
  }
}

function createWindow(): void {
  const { width, height } = getScaledSize(prefs.windowScale);
  const initialPos = prefs.windowPosition
    ? clampPositionToDisplays(prefs.windowPosition, width, height)
    : getDefaultWindowPosition(width, height);

  const options = getWindowOptions({ width, height });
  options.x = initialPos.x;
  options.y = initialPos.y;

  mainWindow = new BrowserWindow(options);

  // Set click-through on transparent areas by default
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Load the renderer HTML
  const rendererPath = path.join(__dirname, "renderer", "index.html");
  void mainWindow.loadFile(rendererPath);

  // Set up cursor polling at 30Hz (~33ms interval)
  startCursorPolling();

  // Handle window closed
  mainWindow.on("closed", () => {
    stopCursorPolling();
    mainWindow = null;
  });
}

function startCursorPolling(): void {
  if (cursorPollingInterval) return;

  cursorPollingInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      stopCursorPolling();
      return;
    }

    const cursorPoint = screen.getCursorScreenPoint();
    const bounds = mainWindow.getBounds();
    const windowCenterX = bounds.x + bounds.width / 2;
    const windowCenterY = bounds.y + bounds.height / 2;

    const offsetX = cursorPoint.x - windowCenterX;
    const offsetY = cursorPoint.y - windowCenterY;

    const display = screen.getDisplayNearestPoint(cursorPoint);
    const displayBounds = display.bounds;
    const rangeX = Math.max(displayBounds.width / 2, 400);
    const rangeY = Math.max(displayBounds.height / 2, 300);

    const normalizedX = offsetX / rangeX;
    const normalizedY = offsetY / rangeY;

    const clampedX = Math.max(-1, Math.min(1, normalizedX));
    const clampedY = Math.max(-1, Math.min(1, normalizedY));

    mainWindow.webContents.send("cursor-update", {
      x: clampedX,
      y: clampedY,
    });
  }, 1000 / 30);
}

function stopCursorPolling(): void {
  if (cursorPollingInterval) {
    clearInterval(cursorPollingInterval);
    cursorPollingInterval = null;
  }
}

function startCodexSync(): void {
  const codexHome = path.join(os.homedir(), ".codex");
  const stateFilePath = path.join(codexHome, "pet-3d-state.json");
  const envPort = process.env.CODEX_PET_3D_PORT
    ? Number(process.env.CODEX_PET_3D_PORT)
    : 47321;
  const httpPort = Number.isInteger(envPort) && envPort >= 0 ? envPort : 47321;

  codexSync = new CodexSyncService({
    stateFilePath,
    codexHomeDir: codexHome,
    httpPort,
    enabled: prefs.isCodexSyncEnabled,
    onStateChange: (event) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("play-animation", event.state);
      }
      updateTrayMenu();
    },
  });

  void codexSync.start().then(() => updateTrayMenu());
}

// IPC: initial state for renderer bootstrap
ipcMain.handle("get-initial-state", (): {
  pet: LoadedPetPayload | null;
  isLookAtEnabled: boolean;
  width: number;
  height: number;
} => {
  const { width, height } = getScaledSize(prefs.windowScale);
  let pet: LoadedPetPayload | null = null;
  if (activePet) {
    try {
      pet = loadPetPayload(activePet);
    } catch {
      pet = null;
    }
  }
  return {
    pet,
    isLookAtEnabled: prefs.isLookAtEnabled,
    width,
    height,
  };
});

// IPC: click-through toggling
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

// IPC: move frameless window and persist position
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
    const nextX = Math.round(x + dx);
    const nextY = Math.round(y + dy);
    mainWindow.setPosition(nextX, nextY);
    scheduleSavePosition(nextX, nextY);
  }
});

// IPC: show native context menu
ipcMain.on("show-context-menu", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const menu = Menu.buildFromTemplate(buildMenuTemplate());
  menu.popup({ window: mainWindow });
});

app.whenReady().then(() => {
  prefsPath = path.join(app.getPath("userData"), "preferences.json");
  prefs = loadPreferences(prefsPath);
  refreshPetCatalog();
  createWindow();
  setupTray();
  startCodexSync();

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
  if (savePositionTimer) {
    clearTimeout(savePositionTimer);
    savePositionTimer = null;
    persistPreferences();
  }
  void codexSync?.stop();
  tray?.destroy();
  tray = null;
});
