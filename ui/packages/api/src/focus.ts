/**
 * 设备焦点与模块选择作用域。与 yohu-domain::focus 同一套 testdata。
 */

export type SelectionMode = "none" | "singleRequired" | "multiOptional";

/** 目录刷新后的焦点收敛：仍在线则保持，否则落到第一台在线设备。 */
export function reconcileFocus(focus: string | null, online: readonly string[]): string | null {
  if (focus !== null && online.includes(focus)) return focus;
  return online[0] ?? null;
}

/** 解析当前模块的执行目标 serials（仅在线；保序去重）。禁止默认广播全部在线设备。 */
export function resolveTargetSerials(
  mode: SelectionMode,
  focus: string | null,
  selected: readonly string[],
  online: readonly string[],
): string[] {
  const isOnline = (serial: string): boolean => online.includes(serial);
  switch (mode) {
    case "none":
      return [];
    case "singleRequired":
      return focus !== null && isOnline(focus) ? [focus] : [];
    case "multiOptional": {
      const targets: string[] = [];
      for (const serial of selected) {
        if (isOnline(serial) && !targets.includes(serial)) targets.push(serial);
      }
      if (targets.length === 0 && focus !== null && isOnline(focus)) {
        targets.push(focus);
      }
      return targets;
    }
  }
}
