/**
 * 输入框领域模型（L2）。
 * 盒内缀 / 盒外缀 / Token / status / active / multiline 是不变式；涂装名给视图当 data-paint。active 不进涂装。
 * 写入盒由控件铬高减两侧 hairline 得出；不碰 DOM、不判定 disabled / 清除显隐。
 *
 * Token 与 input 同属写入盒主轴，不是嵌套滚动口。溢出只由控件 clip。
 * input 吃剩余宽（flex 1 1 0% / width auto），禁止 width:100% 把气泡挤出 Windows 横条。
 * multiline 走同一门面，禁止模块再挂 textarea.yohu-text-field__input。
 */

import { Stroke } from "../tokens/layout";

export type YoTextFieldStatus = "none" | "error" | "warning";

export const DEFAULT_TEXT_FIELD_STATUS: YoTextFieldStatus = "none";
/** multiline 时原生 rows 缺省。功能性配置，不是 size 轴。 */
export const DEFAULT_TEXT_FIELD_ROWS = 2;
/** 弱多行抬高帽。超过后写入盒滚动，不再长高。 */
export const DEFAULT_TEXT_FIELD_MAX_ROWS = 6;

export type TextFieldPaintKind = "neutral" | "error" | "warning";

/** 宽度契约。fill=铺满父级宽（不沿栏高 stretch）；number=数字 hug；hug=默认最小宽。不是 size 轴。 */
export type TextFieldWidthKind = "hug" | "fill" | "number";

export interface TextFieldSlotInput {
  prefix?: unknown;
  suffix?: unknown;
  addonBefore?: unknown;
  addonAfter?: unknown;
  tokens?: unknown;
}

export interface TextFieldSlots {
  prefix: boolean;
  suffix: boolean;
  addonBefore: boolean;
  addonAfter: boolean;
  /** 写入盒内、input 之前。气泡是主轴 flex 子项，槽本身无盒。 */
  tokens: boolean;
}

export interface TextFieldSpec {
  status: YoTextFieldStatus;
  slots: TextFieldSlots;
  width: TextFieldWidthKind;
  /** 过滤/内容生效描边。与 status 正交，默认关。 */
  active: boolean;
  multiline: boolean;
  rows: number;
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
    tokens: hasTextFieldSlot(input.tokens),
  };
}

/** 未写或未知值归一成 none。禁止第二套 status 别名。 */
export function resolveTextFieldStatus(status?: string): YoTextFieldStatus {
  if (status === "error" || status === "warning") return status;
  return DEFAULT_TEXT_FIELD_STATUS;
}

/** block 优先于 type。multiline 不当数字槽。原生 input size 不进模型。 */
export function resolveTextFieldWidthKind(input: {
  block?: boolean;
  type?: string;
  multiline?: boolean;
}): TextFieldWidthKind {
  if (input.block) return "fill";
  if (!input.multiline && input.type === "number") return "number";
  return "hug";
}

/** 未写或 falsy 归一成 false。与单行同一门面，不是 YoTextArea。 */
export function resolveTextFieldMultiline(multiline?: boolean): boolean {
  return Boolean(multiline);
}

export function resolveTextFieldRows(input: { multiline?: boolean; rows?: number }): number {
  if (!resolveTextFieldMultiline(input.multiline)) return 1;
  if (typeof input.rows === "number" && Number.isFinite(input.rows) && input.rows >= 1) {
    return Math.floor(input.rows);
  }
  return DEFAULT_TEXT_FIELD_ROWS;
}

/** 硬换行数；空串也是 1 行。不认软折行，禁止读 scrollHeight。 */
export function countTextFieldLines(value: string | undefined): number {
  if (value == null || value.length === 0) return 1;
  let lines = 1;
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) === 10) lines += 1;
  }
  return lines;
}

/** 帽不低于 min rows。未写或小于 min 则走缺省帽。 */
export function resolveTextFieldMaxRows(input: {
  multiline?: boolean;
  rows?: number;
  maxRows?: number;
}): number {
  const minRows = resolveTextFieldRows(input);
  if (!resolveTextFieldMultiline(input.multiline)) return minRows;
  if (typeof input.maxRows === "number" && Number.isFinite(input.maxRows) && input.maxRows >= minRows) {
    return Math.floor(input.maxRows);
  }
  return Math.max(minRows, DEFAULT_TEXT_FIELD_MAX_ROWS);
}

/** 弱多行可见行：min(帽, max(min, 硬换行数))。单行恒为 1。 */
export function resolveTextFieldGrowRows(input: {
  multiline?: boolean;
  rows?: number;
  maxRows?: number;
  value?: string;
}): number {
  const minRows = resolveTextFieldRows(input);
  if (!resolveTextFieldMultiline(input.multiline)) return minRows;
  return Math.min(
    resolveTextFieldMaxRows(input),
    Math.max(minRows, countTextFieldLines(input.value)),
  );
}

/** 未写或 falsy 归一成 false。不是 status，不进涂装。 */
export function resolveTextFieldActive(active?: boolean): boolean {
  return Boolean(active);
}

export function resolveTextFieldSpec(
  input: TextFieldSlotInput & {
    status?: string;
    block?: boolean;
    type?: string;
    active?: boolean;
    multiline?: boolean;
    rows?: number;
  },
): TextFieldSpec {
  const multiline = resolveTextFieldMultiline(input.multiline);
  return {
    status: resolveTextFieldStatus(input.status),
    slots: resolveTextFieldSlots(input),
    width: resolveTextFieldWidthKind({ ...input, multiline }),
    active: resolveTextFieldActive(input.active),
    multiline,
    rows: resolveTextFieldRows({ ...input, multiline }),
  };
}

/**
 * 写入盒（px）：字与 caret 落在铬内，不含描边。
 * L4 映射 `--yohu-text-field-line`。禁止再用 leading-ui 当输入行高。
 */
export function textFieldLineBoxPx(
  controlHeight: number,
  hairline: number = Stroke.Hairline,
): number {
  return controlHeight - hairline * 2;
}

/** CSS 只消费这个名字。disabled 由 L3 另写 data-disabled，不进涂装。 */
export function textFieldPaintKind(status: YoTextFieldStatus): TextFieldPaintKind {
  if (status === "error") return "error";
  if (status === "warning") return "warning";
  return "neutral";
}
