/**
 * 设备焦点与模块选择作用域。与 yohu-domain::focus 同一套 testdata。
 */

export type SelectionMode = "none" | "singleRequired" | "multiOptional";

function firstOrNull(items: readonly string[]): string | null {
  return items[0] ?? null;
}

/** 单选模块只认第一台。空列表是没有绑定。 */
export function boundSerial(serials: readonly string[]): string | null {
  return firstOrNull(serials);
}

/** 多选可选。轨的加减选和模块勾选写入都认这一把。执行目标仍由 resolveTargetSerials 分支映射。 */
export function selectionModeIsMulti(mode: SelectionMode | undefined): mode is "multiOptional" {
  return mode === "multiOptional";
}

function serialListed(online: readonly string[], serial: string): boolean {
  return online.includes(serial);
}

function focusListed(focus: string | null, online: readonly string[]): focus is string {
  return focus !== null && serialListed(online, focus);
}

/** 目录刷新后的焦点收敛：仍在线则保持，否则落到第一台在线设备。 */
export function reconcileFocus(focus: string | null, online: readonly string[]): string | null {
  if (focusListed(focus, online)) return focus;
  return firstOrNull(online);
}

/** 解析当前模块的执行目标 serials（仅在线；保序去重）。禁止默认广播全部在线设备。 */
export function resolveTargetSerials(
  mode: SelectionMode,
  focus: string | null,
  selected: readonly string[],
  online: readonly string[],
): string[] {
  switch (mode) {
    case "none":
      return [];
    case "singleRequired":
      return focusListed(focus, online) ? [focus] : [];
    case "multiOptional": {
      const targets: string[] = [];
      for (const serial of selected) {
        if (serialListed(online, serial) && !targets.includes(serial)) targets.push(serial);
      }
      if (targets.length === 0 && focusListed(focus, online)) {
        targets.push(focus);
      }
      return targets;
    }
  }
}
