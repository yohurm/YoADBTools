/**
 * 下拉开合 / 键盘 / 禁用（L3）。
 * 视图只提交事件并按快照绘制；选中索引与按键解码仍在 select-model。
 */

import {
  edgeIndex,
  selectedIndex,
  selectKeyIntent,
  stepIndex,
  type YoSelectOption,
} from "./select-model";

export interface SelectSession {
  open: boolean;
  activeIndex: number;
}

export function idleSelectSession(): SelectSession {
  return { open: false, activeIndex: -1 };
}

export function selectIsDisabled(disabled?: boolean): boolean {
  return Boolean(disabled);
}

export function openSelect(
  options: readonly YoSelectOption[],
  value: string | null | undefined,
): SelectSession {
  return { open: true, activeIndex: selectedIndex(options, value) };
}

export function closeSelect(): SelectSession {
  return { open: false, activeIndex: -1 };
}

export function toggleSelect(
  wasOpen: boolean,
  options: readonly YoSelectOption[],
  value: string | null | undefined,
  disabled?: boolean,
): SelectSession {
  if (selectIsDisabled(disabled)) return idleSelectSession();
  return wasOpen ? closeSelect() : openSelect(options, value);
}

export type SelectKeyEffect =
  | { type: "none" }
  | { type: "session"; session: SelectSession }
  | { type: "commit"; value: string; session: SelectSession };

/** 把模型按键意图落到开合 / 活动项 / 提交。禁用时全部吞掉。 */
export function applySelectKey(
  key: string,
  session: SelectSession,
  options: readonly YoSelectOption[],
  value: string | null | undefined,
  disabled?: boolean,
): SelectKeyEffect {
  if (selectIsDisabled(disabled)) return { type: "none" };
  const intent = selectKeyIntent(key, session.open);
  if (!intent) return { type: "none" };

  switch (intent.type) {
    case "step":
      if (!session.open) {
        return { type: "session", session: openSelect(options, value) };
      }
      return {
        type: "session",
        session: { open: true, activeIndex: stepIndex(options.length, session.activeIndex, intent.delta) },
      };
    case "edge":
      if (options.length === 0) return { type: "none" };
      return {
        type: "session",
        session: { open: true, activeIndex: edgeIndex(options.length, intent.edge) },
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
  if (selectIsDisabled(disabled) || !open) return null;
  return closeSelect();
}

export function applySelectHover(index: number): number {
  return index;
}

export function selectHostAttrs(input: { disabled?: boolean; block?: boolean }): {
  "data-disabled"?: "";
  "data-block"?: "";
} {
  return {
    "data-disabled": selectIsDisabled(input.disabled) ? "" : undefined,
    "data-block": input.block ? "" : undefined,
  };
}
