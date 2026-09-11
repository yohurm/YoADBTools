/**
 * 命令管理快捷键。对话框内 whenList 会因 inDialog 被挡，只认清单且不在输入框。
 */

import { type KeyBinding, type PanelKeyContext } from "@yohu/ui";

export type CommandManagerKeyAction = "select-all";

export const COMMAND_MANAGER_LIST_SELECTOR = ".yohu-cm__list";

const whenManagerList = (ctx: PanelKeyContext): boolean => ctx.inList && !ctx.inEditable;

export const COMMAND_MANAGER_KEY_BINDINGS: readonly KeyBinding<CommandManagerKeyAction>[] = [
  { action: "select-all", key: "a", ctrl: true, when: whenManagerList },
];
