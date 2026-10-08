/**
 * 终端右键场景表。动作经 ctx 注入，本文件不碰 terminalStore。
 */

import { defineContextMenu } from "@yohu/ui";

import { migrateMenuId, migrateMenuTarget } from "./manager/migrate";

export type TerminalCommandMenuAction = "copy" | "delete" | "move" | `move:${string}`;

export interface TerminalCommandDestination {
  id: string;
  name: string;
}

export interface TerminalCommandMenuCtx {
  canCopy: boolean;
  destinations: readonly TerminalCommandDestination[];
  copy: () => void;
  remove: () => void;
  moveTo: (groupId: string) => void;
}

/** 命令管理：选中的命令（可多选）。复制默认就是具体命令行。 */
export const terminalCommandMenu = defineContextMenu<
  TerminalCommandMenuCtx,
  TerminalCommandMenuAction
>({
  id: "terminal.command",
  items: (ctx) => [
    { id: "copy", label: "复制", disabled: !ctx.canCopy },
    ...(ctx.destinations.length === 0
      ? []
      : [
          {
            id: "move" as const,
            label: "移到",
            children: ctx.destinations.map((group) => ({
              id: migrateMenuId(group.id),
              label: group.name,
            })),
          },
        ]),
    { id: "delete" as const, label: "删除", danger: true },
  ],
  onSelect: (id, ctx) => {
    const target = migrateMenuTarget(id);
    if (target) {
      ctx.moveTo(target);
      return;
    }
    if (id === "copy") {
      ctx.copy();
      return;
    }
    if (id === "delete") {
      ctx.remove();
    }
  },
});
