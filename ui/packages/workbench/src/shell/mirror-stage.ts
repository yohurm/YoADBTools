/** 投屏 HWND 开关：只认当前模块是不是投屏，不认 Presence / CSS。 */

import { ModuleId } from "@yohu/api";

export function mirrorPresentShouldBeActive(moduleId: string | undefined): boolean {
  return moduleId === ModuleId.Mirror;
}
