/**
 * 对话框焦点陷阱（L3）。视图只接线，算法由 dialog-policy 装配。
 */

import { resolveDialogInitial, type YoDialogInitial } from "./dialog-model";

export const DIALOG_FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export const DIALOG_SKIP_ATTR = "data-dialog-skip";
export const DIALOG_INITIAL_ATTR = "data-dialog-initial";

export function isDialogFocusable(el: HTMLElement): boolean {
  return !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true";
}

export function dialogFocusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE)).filter(isDialogFocusable);
}

/** 入场首焦：显式标记 → footer 第一钮 → 第一个未 skip 的可聚焦 → 面板。 */
export function dialogInitialFocus(panel: HTMLElement, initial?: YoDialogInitial): HTMLElement {
  const marked = panel.querySelector<HTMLElement>(`[${DIALOG_INITIAL_ATTR}]`);
  if (marked && isDialogFocusable(marked)) return marked;
  if (resolveDialogInitial(initial) === "footer") {
    const footer = panel.querySelector<HTMLElement>(`.yohu-dialog__footer ${DIALOG_FOCUSABLE}`);
    if (footer && isDialogFocusable(footer)) return footer;
  }
  const items = dialogFocusables(panel);
  return items.find((el) => !el.hasAttribute(DIALOG_SKIP_ATTR)) ?? items[0] ?? panel;
}

/** Tab 循环目标；返回 null 表示交给浏览器默认前进。 */
export function dialogTabTarget(
  items: readonly HTMLElement[],
  panel: HTMLElement,
  active: Element | null,
  shift: boolean,
): HTMLElement | null {
  if (items.length === 0) return null;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const inside = active instanceof Node && panel.contains(active);
  if (shift) {
    return active === first || !inside ? last : null;
  }
  return active === last || !inside ? first : null;
}
