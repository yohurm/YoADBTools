/**
 * `system.info.os` 是 `std::env::consts::OS`。
 * 浏览 adb 只认 windows；标题栏原生按钮和安装文案只认 macos。
 */

export function hostOsIsWindows(os: string): boolean {
  return os === "windows";
}

export function hostOsIsMacos(os: string): boolean {
  return os === "macos";
}
