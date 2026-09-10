/**
 * 右键菜单领域类型（L2）。
 * 场景 / 会话 / 条目是契约；呈现层仍是 YoContextMenu；页面禁止自挂一份，只 define + open。
 */

export interface YoMenuItem<Action extends string = string> {
  id: Action;
  label: string;
  danger?: boolean;
  disabled?: boolean;
}

export interface ContextMenuScene<Ctx, Action extends string = string> {
  readonly id: string;
  items: (ctx: Ctx) => readonly YoMenuItem<Action>[];
  onSelect: (action: Action, ctx: Ctx) => void;
}

export interface ContextMenuRequest<Ctx> {
  x: number;
  y: number;
  ctx: Ctx;
}

export interface ContextMenuSession {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly items: readonly YoMenuItem[];
  select: (id: string) => void;
}
