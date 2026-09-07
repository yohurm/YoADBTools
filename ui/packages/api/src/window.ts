/**
 * 主窗口 chrome（@yohu/api 唯一 Tauri window 入口）。
 * 工作台只收回调，不直连 @tauri-apps/api/window。
 */
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export async function windowMinimize(): Promise<void> {
  await getCurrentWindow().minimize();
}

export async function windowToggleMaximize(): Promise<void> {
  await getCurrentWindow().toggleMaximize();
}

export async function windowClose(): Promise<void> {
  await getCurrentWindow().close();
}

export async function windowIsMaximized(): Promise<boolean> {
  return getCurrentWindow().isMaximized();
}

/** 揭主窗并关掉原生启动小窗。失败由壳 2.5s 超时兜底，不另开 JS show。 */
export async function windowShow(): Promise<void> {
  await invoke("boot.showMain");
}

export async function listenWindowResize(onChange: () => void): Promise<() => void> {
  return getCurrentWindow().onResized(() => {
    onChange();
  });
}
