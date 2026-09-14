/**
 * 壳内建页注册。工作区模块由 apps/shell 登记；设置页不走 modules 包。
 */

import { ModuleId, ModuleTitle } from "@yohu/api";

import { registerModule } from "./registry";
import { SettingsView } from "./settings/SettingsView";

registerModule({
  id: ModuleId.Settings,
  title: ModuleTitle.Settings,
  icon: "settings",
  selectionMode: "none",
  kind: "system",
  Component: SettingsView,
});
