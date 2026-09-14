/**
 * 模块导航 store：活动模块身份；投屏 HWND 开关跟身份走。
 * View 只交 navigate / setMirrorPresent。
 */

import { createSignal } from "solid-js";

import { ModuleId, mirrorPresentSetActive } from "@yohu/api";
import { closeContextMenu } from "@yohu/ui";

import { mirrorPresentShouldBeActive } from "./mirror-present";

export function createNavStore() {
  const [activeModuleId, setActiveModuleId] = createSignal<string>(ModuleId.Terminal);

  function navigate(id: string): void {
    setActiveModuleId(id);
    closeContextMenu();
  }

  async function setMirrorPresent(moduleId: string | undefined): Promise<void> {
    await mirrorPresentSetActive(mirrorPresentShouldBeActive(moduleId));
  }

  return { activeModuleId, navigate, setMirrorPresent };
}

export type NavStoreApi = ReturnType<typeof createNavStore>;
