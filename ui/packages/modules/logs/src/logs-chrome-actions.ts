/** 日志页眉功能栏身份。进出场由 YoChrome.actions 播出。 */

export type LogsChromeAction = "capture" | "pause" | "clear" | "clear-device" | "export" | "overflow";

/** 页眉按钮身份。快捷键里的 pause / clear 是另一份类型。overflow 是其余分支。 */
export function logsChromeIsCapture(id: LogsChromeAction): boolean {
  return id === "capture";
}

export function logsChromeIsPause(id: LogsChromeAction): boolean {
  return id === "pause";
}

export function logsChromeIsClear(id: LogsChromeAction): boolean {
  return id === "clear";
}

export function logsChromeIsClearDevice(id: LogsChromeAction): boolean {
  return id === "clear-device";
}

export function logsChromeIsExport(id: LogsChromeAction): boolean {
  return id === "export";
}

export function logsChromeActions(input: { capturing: boolean; overflowed: boolean }): LogsChromeAction[] {
  const items: LogsChromeAction[] = ["capture"];
  if (input.capturing) items.push("pause");
  items.push("clear", "clear-device", "export");
  if (input.overflowed) items.push("overflow");
  return items;
}
