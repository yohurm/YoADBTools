/**
 * 终端右键场景表。动作经 ctx 注入，本文件不碰 terminalStore。
 */

import { defineContextMenu } from "@yohu/ui";

export type TerminalCommandMenuAction = "copy" | "delete";

export interface TerminalCommandMenuCtx {
  canCopy: boolean;
  copy: () => void;
  remove: () => void;
}

/** 命令管理：选中的命令（可多选）。复制默认就是具体命令行。 */
export const terminalCommandMenu = defineContextMenu<
  TerminalCommandMenuCtx,
  TerminalCommandMenuAction
>({
  id: "terminal.command",
  items: (ctx) => [
    { id: "copy", label: "复制", disabled: !ctx.canCopy },
    { id: "delete", label: "删除", danger: true },
  ],
  onSelect: (id, ctx) => {
    switch (id) {
      case "copy":
        ctx.copy();
        return;
      case "delete":
        ctx.remove();
        return;
      default: {
        const _gone: never = id;
        return _gone;
      }
    }
  },
});
