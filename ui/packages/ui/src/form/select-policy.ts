/**
 * 下拉开合 / 键盘 / 禁用（L3）。
 * 视图只提交事件并按快照绘制；选中索引与按键解码仍在 select-model。
 */
import { presenceAttr } from "../dom/flag";
import { controlIsDisabled, controlIsBlock } from "../basic/control-busy";
import { listEdgeIndex } from "../keymap/list-index";

import {
  selectedIndex,
  selectKeyIntent,
  stepIndex,
  type YoSelectOption,
} from "./select-model";

export interface SelectSession {
  open: boolean;
  activeIndex: number;
  /**
   * 悬停洗。打开时活动项落在选中项上，只作键盘起点，不画洗。
   * 指针移入或方向键离开后才画。选中本身只看勾。
   */
  highlight: boolean;
}

export function idleSelectSession(): SelectSession {
  return { open: false, activeIndex: -1, highlight: false };
}

export function openSelect(
  options: readonly YoSelectOption[],
  value: string | null | undefined,
): SelectSession {
  return { open: true, activeIndex: selectedIndex(options, value), highlight: false };
}

export function closeSelect(): SelectSession {
  return { open: false, activeIndex: -1, highlight: false };
}

/** 指针移到这一项：活动项跟上，并打开悬停洗。 */
export function pointSelect(session: SelectSession, index: number): SelectSession {
  if (!session.open) return session;
  return { open: true, activeIndex: index, highlight: true };
}

/** 悬停洗只在 highlight 之后画到活动项上。 */
export function optionIsHot(session: SelectSession, index: number): boolean {
  return session.highlight && session.activeIndex === index;
}

export function toggleSelect(
  wasOpen: boolean,
  options: readonly YoSelectOption[],
  value: string | null | undefined,
  disabled?: boolean,
): SelectSession {
  if (controlIsDisabled(disabled)) return idleSelectSession();
  return wasOpen ? closeSelect() : openSelect(options, value);
}

export type SelectKeyEffect =
  | { type: "none" }
  | { type: "session"; session: SelectSession }
  | { type: "commit"; value: string; session: SelectSession };

/** 按键不改变开合、活动项或取值。 */
export function selectEffectIsNone(effect: SelectKeyEffect): effect is { type: "none" } {
  return effect.type === "none";
}

/** 提交当前活动项并关闭。 */
export function selectEffectIsCommit(
  effect: SelectKeyEffect,
): effect is Extract<SelectKeyEffect, { type: "commit" }> {
  return effect.type === "commit";
}

/** 把模型按键意图落到开合 / 活动项 / 提交。禁用时全部吞掉。 */
export function applySelectKey(
  key: string,
  session: SelectSession,
  options: readonly YoSelectOption[],
  value: string | null | undefined,
  disabled?: boolean,
): SelectKeyEffect {
  if (controlIsDisabled(disabled)) return { type: "none" };
  const intent = selectKeyIntent(key, session.open);
  if (!intent) return { type: "none" };

  switch (intent.type) {
    case "step":
      if (!session.open) {
        return { type: "session", session: openSelect(options, value) };
      }
      return {
        type: "session",
        session: {
          open: true,
          activeIndex: stepIndex(options.length, session.activeIndex, intent.delta),
          highlight: true,
        },
      };
    case "edge":
      if (options.length === 0) return { type: "none" };
      return {
        type: "session",
        session: {
          open: true,
          activeIndex: listEdgeIndex(options.length, intent.edge),
          highlight: true,
        },
      };
    case "toggle":
      return { type: "session", session: toggleSelect(session.open, options, value, disabled) };
    case "commit":
    case "tabCommit": {
      const option = session.open && session.activeIndex >= 0 ? options[session.activeIndex] : undefined;
      if (!option) return { type: "none" };
      return { type: "commit", value: option.value, session: closeSelect() };
    }
    default:
      return { type: "none" };
  }
}

export function applySelectEscape(open: boolean, disabled?: boolean): SelectSession | null {
  if (controlIsDisabled(disabled) || !open) return null;
  return closeSelect();
}

export function selectHostAttrs(input: { disabled?: boolean; block?: boolean }): {
  "data-disabled"?: "";
  "data-block"?: "";
} {
  return {
    "data-disabled": presenceAttr(controlIsDisabled(input.disabled)),
    "data-block": presenceAttr(controlIsBlock(input.block)),
  };
}
