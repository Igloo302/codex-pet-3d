import { describe, it, expect, vi } from "vitest";
import { createContextMenuTemplate, ContextMenuOptions } from "../src/context-menu";

describe("createContextMenuTemplate", () => {
  it("builds a restrained context menu with actions, lookAt toggle, reset, and quit", () => {
    const onPlayAnimation = vi.fn();
    const onToggleLookAt = vi.fn();
    const onResetPosition = vi.fn();
    const onQuit = vi.fn();

    const options: ContextMenuOptions = {
      isLookAtEnabled: true,
      onPlayAnimation,
      onToggleLookAt,
      onResetPosition,
      onQuit,
    };

    const template = createContextMenuTemplate(options);

    // Verify top-level structure
    expect(template).toHaveLength(6);

    // 1. Actions submenu
    const actionItem = template[0];
    expect(actionItem.label).toContain("动作切换");
    expect(Array.isArray(actionItem.submenu)).toBe(true);
    const submenu = actionItem.submenu as any[];
    expect(submenu.length).toBe(7);

    // Test action clicks
    submenu[0].click();
    expect(onPlayAnimation).toHaveBeenCalledWith("idle");

    submenu[1].click();
    expect(onPlayAnimation).toHaveBeenCalledWith("running");

    submenu[2].click();
    expect(onPlayAnimation).toHaveBeenCalledWith("waving");

    // 2. LookAt toggle
    const lookAtItem = template[2];
    expect(lookAtItem.label).toContain("视线跟随鼠标");
    expect(lookAtItem.type).toBe("checkbox");
    expect(lookAtItem.checked).toBe(true);

    lookAtItem.click!({ checked: false } as any, undefined as any, undefined as any);
    expect(onToggleLookAt).toHaveBeenCalledWith(false);

    // 3. Reset position
    const resetItem = template[3];
    expect(resetItem.label).toContain("复位到右下角");
    resetItem.click!(undefined as any, undefined as any, undefined as any);
    expect(onResetPosition).toHaveBeenCalledTimes(1);

    // 4. Quit
    const quitItem = template[5];
    expect(quitItem.label).toContain("退出桌宠");
    quitItem.click!(undefined as any, undefined as any, undefined as any);
    expect(onQuit).toHaveBeenCalledTimes(1);
  });
});
