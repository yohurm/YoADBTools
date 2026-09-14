export { createDeviceStore, type DeviceStoreApi } from "./device-store";
export { resolveTargetSerials } from "./selection";
export { createSettingsStore, type SettingsStoreApi } from "./settings-store";
export { createTaskStore, type TaskStoreApi } from "./task-store";
export { createUpdateStore, type UpdateStoreApi } from "./update-store";
export { createWindowStore, type WindowStoreApi } from "./window-store";
export { createNavStore, type NavStoreApi } from "./nav-store";
export { mirrorPresentShouldBeActive } from "./mirror-present";

import { createDeviceStore } from "./device-store";
import { createNavStore } from "./nav-store";
import { createSettingsStore } from "./settings-store";
import { createTaskStore } from "./task-store";
import { createUpdateStore } from "./update-store";
import { createWindowStore } from "./window-store";

/** 壳级全局 store（应用生命周期单例）。 */
export const deviceStore = createDeviceStore();
export const settingsStore = createSettingsStore();
export const taskStore = createTaskStore();
export const updateStore = createUpdateStore();
export const windowStore = createWindowStore();
export const navStore = createNavStore();
