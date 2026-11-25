import type { MenuItemConstructorOptions } from "electron";
import type { StandardAnimationState } from "@codex-pet-3d/spec";
import type { PetSummary } from "./pet-registry";
import { ALLOWED_WINDOW_SCALES, type WindowScale } from "./preferences";

export interface ContextMenuOptions {
  isLookAtEnabled: boolean;
  isCodexSyncEnabled?: boolean;
  codexSyncLabel?: string;
  pets?: PetSummary[];
  selectedPetId?: string | null;
  windowScale?: WindowScale;
  onPlayAnimation: (state: StandardAnimationState) => void;
  onToggleLookAt: (enabled: boolean) => void;
  onToggleCodexSync?: (enabled: boolean) => void;
  onSelectPet?: (petId: string) => void;
  onImportPetDirectory?: () => void;
  onRefreshPets?: () => void;
  onChangeScale?: (scale: WindowScale) => void;
  onResetPosition: () => void;
  onQuit: () => void;
}

const SOURCE_BADGES: Record<PetSummary["source"], string> = {
  bundled: "内置",
  codex: "Codex",
  custom: "自定义",
};

const SCALE_LABELS: Record<WindowScale, string> = {
  0.75: "小 (75%)",
  1: "标准 (100%)",
  1.25: "大 (125%)",
  1.5: "特大 (150%)",
};

/**
 * Builds the native context & tray menu template for the desktop companion.
 */
export function createContextMenuTemplate(
  options: ContextMenuOptions
): MenuItemConstructorOptions[] {
  const pets = options.pets ?? [];
  const currentScale = options.windowScale ?? 1;
  const isCodexSyncEnabled = options.isCodexSyncEnabled ?? true;

  const petSubmenu: MenuItemConstructorOptions[] = pets.map((pet) => ({
    label: `${pet.displayName} [${SOURCE_BADGES[pet.source]}]`,
    type: "radio",
    checked: pet.id === options.selectedPetId,
    click: () => options.onSelectPet?.(pet.id),
  }));

  if (petSubmenu.length > 0) {
    petSubmenu.push({ type: "separator" });
  }
  petSubmenu.push(
    {
      label: "📂 导入本地 3D 宠物目录...",
      click: () => options.onImportPetDirectory?.(),
    },
    {
      label: "🔄 重新扫描宠物列表",
      click: () => options.onRefreshPets?.(),
    }
  );

  const scaleSubmenu: MenuItemConstructorOptions[] = ALLOWED_WINDOW_SCALES.map((scale) => ({
    label: SCALE_LABELS[scale],
    type: "radio",
    checked: currentScale === scale,
    click: () => options.onChangeScale?.(scale),
  }));

  const codexLabel = options.codexSyncLabel
    ? `⚡ Codex 状态联动 (${options.codexSyncLabel})`
    : "⚡ Codex 状态联动";

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
        { type: "separator" },
        {
          label: "向右小跑 (Run Right)",
          click: () => options.onPlayAnimation("running-right"),
        },
        {
          label: "向左小跑 (Run Left)",
          click: () => options.onPlayAnimation("running-left"),
        },
      ],
    },
    {
      label: "🐱 切换宠物",
      submenu: petSubmenu,
    },
    { type: "separator" },
    {
      label: codexLabel,
      type: "checkbox",
      checked: isCodexSyncEnabled,
      click: (menuItem) => options.onToggleCodexSync?.(menuItem.checked),
    },
    {
      label: "👀 视线跟随鼠标",
      type: "checkbox",
      checked: options.isLookAtEnabled,
      click: (menuItem) => options.onToggleLookAt(menuItem.checked),
    },
    {
      label: "🔍 窗口缩放",
      submenu: scaleSubmenu,
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
