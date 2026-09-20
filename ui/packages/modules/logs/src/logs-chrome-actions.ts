/** 日志页眉功能栏身份。进出场由 YoChrome.actions 播出。 */

export type LogsChromeAction = "capture" | "pause" | "clear" | "clear-device" | "export" | "overflow";

export function logsChromeActions(input: { capturing: boolean; overflowed: boolean }): LogsChromeAction[] {
  const items: LogsChromeAction[] = ["capture"];
  if (input.capturing) items.push("pause");
  items.push("clear", "clear-device", "export");
  if (input.overflowed) items.push("overflow");
  return items;
}
