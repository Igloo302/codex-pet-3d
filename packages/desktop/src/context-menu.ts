import type { MenuItemConstructorOptions } from "electron";
import type { StandardAnimationState } from "@codex-pet-3d/spec";

export interface ContextMenuOptions {
  isLookAtEnabled: boolean;
  onPlayAnimation: (state: StandardAnimationState) => void;
  onToggleLookAt: (enabled: boolean) => void;
  onResetPosition: () => void;
  onQuit: () => void;
}

/**
 * Builds the native context menu template for the desktop companion
 */
export function createContextMenuTemplate(options: ContextMenuOptions): MenuItemConstructorOptions[] {
  return [
    {
      label: "🐾 动作切换",
      submenu: [
        {
          label: "待机 (Idle)",
          click: () => options.onPlayAnimation("idle"),
        },
        {
          label: "沉浸编码 (Work)",
          click: () => options.onPlayAnimation("running"),
        },
        {
          label: "招手问好 (Wave)",
          click: () => options.onPlayAnimation("waving"),
        },
        {
          label: "开心跳跃 (Jump)",
          click: () => options.onPlayAnimation("jumping"),
        },
        {
          label: "好奇等候 (Waiting)",
          click: () => options.onPlayAnimation("waiting"),
        },
        {
          label: "代码审查 (Review)",
          click: () => options.onPlayAnimation("review"),
        },
        {
          label: "垂头沮丧 (Failed)",
          click: () => options.onPlayAnimation("failed"),
        },
      ],
    },
    { type: "separator" },
    {
      label: "👀 视线跟随鼠标",
      type: "checkbox",
      checked: options.isLookAtEnabled,
      click: (menuItem) => options.onToggleLookAt(menuItem.checked),
    },
    {
      label: "📍 复位到右下角",
      click: () => options.onResetPosition(),
    },
    { type: "separator" },
    {
      label: "❌ 退出桌宠",
      click: () => options.onQuit(),
    },
  ];
}
