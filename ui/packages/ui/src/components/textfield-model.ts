/**
 * 输入框领域模型（L2）。
 * 盒内缀 / 盒外缀 / status / active 是不变式；涂装名给视图当 data-paint。active 不进涂装。
 * 不碰 DOM、不判定 disabled / 清除显隐。
 */

export type YoTextFieldStatus = "none" | "error" | "warning";

export const TEXT_FIELD_STATUSES = ["none", "error", "warning"] as const;
export const DEFAULT_TEXT_FIELD_STATUS: YoTextFieldStatus = "none";

export type TextFieldPaintKind = "neutral" | "error" | "warning";

/** 宽度契约。fill=铺满父级；number=数字 hug；hug=默认最小宽。不是 size 轴。 */
export type TextFieldWidthKind = "hug" | "fill" | "number";

export interface TextFieldSlotInput {
  prefix?: unknown;
  suffix?: unknown;
  addonBefore?: unknown;
  addonAfter?: unknown;
}

export interface TextFieldSlots {
  prefix: boolean;
  suffix: boolean;
  addonBefore: boolean;
  addonAfter: boolean;
}

export interface TextFieldSpec {
  status: YoTextFieldStatus;
  slots: TextFieldSlots;
  width: TextFieldWidthKind;
  /** 过滤/内容生效描边。与 status 正交，默认关。 */
  active: boolean;
}

/** 空串 / null / false 不算占槽。JSX 与非空图标名算占槽。 */
export function hasTextFieldSlot(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "string") return value.length > 0;
  return true;
}

export function resolveTextFieldSlots(input: TextFieldSlotInput): TextFieldSlots {
  return {
    prefix: hasTextFieldSlot(input.prefix),
    suffix: hasTextFieldSlot(input.suffix),
    addonBefore: hasTextFieldSlot(input.addonBefore),
    addonAfter: hasTextFieldSlot(input.addonAfter),
  };
}

/** 未写或未知值归一成 none。禁止第二套 status 别名。 */
export function resolveTextFieldStatus(status?: string): YoTextFieldStatus {
  if (status === "error" || status === "warning") return status;
  return DEFAULT_TEXT_FIELD_STATUS;
}

/** block 优先于 type。原生 input size 不进模型。 */
export function resolveTextFieldWidthKind(input: {
  block?: boolean;
  type?: string;
}): TextFieldWidthKind {
  if (input.block) return "fill";
  if (input.type === "number") return "number";
  return "hug";
}

/** 未写或 falsy 归一成 false。不是 status，不进涂装。 */
export function resolveTextFieldActive(active?: boolean): boolean {
  return Boolean(active);
}

export function resolveTextFieldSpec(
  input: TextFieldSlotInput & { status?: string; block?: boolean; type?: string; active?: boolean },
): TextFieldSpec {
  return {
    status: resolveTextFieldStatus(input.status),
    slots: resolveTextFieldSlots(input),
    width: resolveTextFieldWidthKind(input),
    active: resolveTextFieldActive(input.active),
  };
}

/** CSS 只消费这个名字。disabled 由 L3 另写 data-disabled，不进涂装。 */
export function textFieldPaintKind(status: YoTextFieldStatus): TextFieldPaintKind {
  if (status === "error") return "error";
  if (status === "warning") return "warning";
  return "neutral";
}
