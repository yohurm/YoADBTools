/** 终端页眉功能栏身份。进出场由 YoChrome.actions 播出。 */

export type TerminalChromeAction = "clear" | "cancel" | "library";

/** 页眉按钮身份。视图只按身份取节点，不再比较字面量。 */
export function terminalChromeIsClear(id: TerminalChromeAction): boolean {
  return id === "clear";
}

export function terminalChromeIsCancel(id: TerminalChromeAction): boolean {
  return id === "cancel";
}

export function terminalChromeIsLibrary(id: TerminalChromeAction): boolean {
  return id === "library";
}

/** 有在跑的组才有取消。清屏与命令管理常驻。 */
export function terminalChromeActions(input: { cancellable: boolean }): TerminalChromeAction[] {
  const items: TerminalChromeAction[] = ["clear"];
  if (input.cancellable) items.push("cancel");
  items.push("library");
  return items;
}
