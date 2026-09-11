/**
 * 路径栏交互策略：铬内点哪里进编辑、展开时光标落点、取消是否在输入铬外。
 * 行剩余不是铬。对照资源管理器地址栏；不碰 DOM。
 */

export type AddressClickKind = "vacant" | "crumb" | "field" | "up";

export type AddressCaret = {
  start: number;
  end: number;
};

export type AddressScrollPin = "start" | "end" | "keep";

/** 展开不预选；光标落在末尾。 */
export function addressOpenCaret(value: string): AddressCaret {
  const end = value.length;
  return { start: end, end };
}

/** 全选或光标在开头看槽头；光标在末尾看槽尾；其余不改滚动。 */
export function addressScrollPin(caret: AddressCaret, length: number): AddressScrollPin {
  if (caret.start === 0 && caret.end === 0) return "start";
  if (length > 0 && caret.start === 0 && caret.end === length) return "start";
  if (caret.start === caret.end && caret.end >= length) return "end";
  return "keep";
}

export function addressClickKind(
  target: EventTarget | null,
  path: Element | null,
): AddressClickKind | null {
  if (!(target instanceof Element) || !path?.contains(target)) return null;
  if (target.closest("[data-address='crumb']")) return "crumb";
  if (target.closest("[data-address='field']")) return "field";
  if (target.closest("[data-address='up']")) return "up";
  if (target.closest("[data-address='slot']")) return "vacant";
  return null;
}

export function isAddressVacantClick(target: EventTarget | null, path: Element | null): boolean {
  return addressClickKind(target, path) === "vacant";
}

/** 取消只认输入铬；盒外（含顶栏剩余）不是路径栏。 */
export function addressDismissOutside(target: EventTarget | null, field: Element | null): boolean {
  if (!field || !(target instanceof Node)) return false;
  return !field.contains(target);
}
