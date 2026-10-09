/**
 * `system.info.os` 是 `std::env::consts::OS`。
 * 浏览 adb 只在 windows 上滤 `.exe`；标题栏原生按钮和 DMG 文案只认 macos；
 * Linux 安装是打开 `.deb`，不走 NSIS 覆盖重启。
 */

export function hostOsIsWindows(os: string): boolean {
  return os === "windows";
}

export function hostOsIsMacos(os: string): boolean {
  return os === "macos";
}

export function hostOsIsLinux(os: string): boolean {
  return os === "linux";
}
