/**
 * WebView 原生菜单守卫。
 * 清单/空白已由模块 preventDefault；这里挡住漏到 Chromium 的「返回/另存为/检查」。
 * 单行 input / textarea 仍走系统剪切板菜单。
 */
export function allowNativeContextMenu(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("input, textarea"));
}
