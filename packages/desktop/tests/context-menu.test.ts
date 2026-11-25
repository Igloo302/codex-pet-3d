import { describe, it, expect, vi } from "vitest";
import { createContextMenuTemplate, ContextMenuOptions } from "../src/context-menu";

describe("createContextMenuTemplate", () => {
  it("builds a full context menu with actions, pet switcher, codex sync, lookAt, scale, reset, and quit", () => {
    const onPlayAnimation = vi.fn();
    const onToggleLookAt = vi.fn();
    const onToggleCodexSync = vi.fn();
    const onSelectPet = vi.fn();
    const onImportPetDirectory = vi.fn();
    const onRefreshPets = vi.fn();
    const onChangeScale = vi.fn();
    const onResetPosition = vi.fn();
    const onQuit = vi.fn();

    const options: ContextMenuOptions = {
      isLookAtEnabled: true,
      isCodexSyncEnabled: true,
      codexSyncLabel: "running · :47321",
      pets: [
        { id: "cyber-cat--jyshen", displayName: "Cyber Cat", author: "jyshen", source: "codex" },
        { id: "shiba--demo", displayName: "Shiba", author: "demo", source: "custom" },
      ],
      selectedPetId: "cyber-cat--jyshen",
      windowScale: 1.25,
      onPlayAnimation,
      onToggleLookAt,
      onToggleCodexSync,
      onSelectPet,
      onImportPetDirectory,
      onRefreshPets,
      onChangeScale,
      onResetPosition,
      onQuit,
    };

    const template = createContextMenuTemplate(options);

    // 1. Actions submenu
    const actionItem = template.find((item) => item.label?.includes("动作切换"));
    expect(actionItem).toBeDefined();
    const actionSubmenu = actionItem!.submenu as any[];
    expect(actionSubmenu.length).toBe(10); // 7 primary + separator + 2 directional runs
    actionSubmenu[0].click();
    expect(onPlayAnimation).toHaveBeenCalledWith("idle");
    actionSubmenu[1].click();
    expect(onPlayAnimation).toHaveBeenCalledWith("running");

    // 2. Pet switcher submenu
    const petItem = template.find((item) => item.label?.includes("切换宠物"));
    expect(petItem).toBeDefined();
    const petSubmenu = petItem!.submenu as any[];
    expect(petSubmenu[0].label).toContain("Cyber Cat [Codex]");
    expect(petSubmenu[0].checked).toBe(true);
    petSubmenu[1].click();
    expect(onSelectPet).toHaveBeenCalledWith("shiba--demo");
    const importBtn = petSubmenu.find((item) => item.label?.includes("导入本地"));
    importBtn.click();
    expect(onImportPetDirectory).toHaveBeenCalledTimes(1);
    const refreshBtn = petSubmenu.find((item) => item.label?.includes("重新扫描"));
    refreshBtn.click();
    expect(onRefreshPets).toHaveBeenCalledTimes(1);

    // 3. Codex sync checkbox
    const syncItem = template.find((item) => item.label?.includes("Codex 状态联动"));
    expect(syncItem?.type).toBe("checkbox");
    expect(syncItem?.label).toContain("running · :47321");
    expect(syncItem?.checked).toBe(true);
    syncItem!.click!({ checked: false } as any, undefined as any, undefined as any);
    expect(onToggleCodexSync).toHaveBeenCalledWith(false);

    // 4. LookAt checkbox
    const lookAtItem = template.find((item) => item.label?.includes("视线跟随鼠标"));
    expect(lookAtItem?.type).toBe("checkbox");
    expect(lookAtItem?.checked).toBe(true);
    lookAtItem!.click!({ checked: false } as any, undefined as any, undefined as any);
    expect(onToggleLookAt).toHaveBeenCalledWith(false);

    // 5. Window scale submenu
    const scaleItem = template.find((item) => item.label?.includes("窗口缩放"));
    const scaleSubmenu = scaleItem!.submenu as any[];
    expect(scaleSubmenu.find((item) => item.label.includes("125%")).checked).toBe(true);
    scaleSubmenu.find((item) => item.label.includes("150%")).click();
    expect(onChangeScale).toHaveBeenCalledWith(1.5);

    // 6. Reset position & quit
    template
      .find((item) => item.label?.includes("复位到右下角"))!
      .click!(undefined as any, undefined as any, undefined as any);
    expect(onResetPosition).toHaveBeenCalledTimes(1);

    template
      .find((item) => item.label?.includes("退出桌宠"))!
      .click!(undefined as any, undefined as any, undefined as any);
    expect(onQuit).toHaveBeenCalledTimes(1);
  });
});
