/**
 * 输入框领域模型（L2）。
 * 盒内缀 / 盒外缀 / Token / status / active / multiline 是不变式；涂装名给视图当 data-paint。active 不进涂装。
 * 写入盒由控件铬高减两侧 hairline 得出；不碰 DOM、不判定 disabled / 清除显隐。
 *
 * Token 与 input 同属写入盒主轴，不是嵌套滚动口。溢出只由控件 clip。
 * input 吃剩余宽（flex 1 1 0% / width auto），禁止 width:100% 把气泡挤出 Windows 横条。
 * multiline 走同一门面，禁止模块再挂 textarea.yohu-text-field__input。
 * 弱多行用后高是 UA 排版（field-sizing），L2 只给 rows 下限与 maxRows 帽。
 * 禁止从字符串数 `\n` 冒充可见行。
 * type=number 步进（加减 / 夹取 / 触边）在本文件；L4 只画柱，不重算。
 */

import { Stroke } from "../tokens/layout";

export type YoTextFieldStatus = "none" | "error" | "warning";

export const DEFAULT_TEXT_FIELD_STATUS: YoTextFieldStatus = "none";
/** multiline 时原生 rows 缺省。功能性配置，不是 size 轴。 */
export const DEFAULT_TEXT_FIELD_ROWS = 2;
/** 弱多行抬高帽。超过后写入盒滚动，不再长高。 */
export const DEFAULT_TEXT_FIELD_MAX_ROWS = 6;
/** type=number 步进缺省。功能性配置，不是 size 轴。 */
export const DEFAULT_TEXT_FIELD_STEP = 1;

export type TextFieldPaintKind = "neutral" | "error" | "warning";
export type TextFieldStepDirection = 1 | -1;

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

/** 未写或 falsy 归一成 false。不是 status，不进涂装。 */
export function resolveTextFieldActive(active?: boolean): boolean {
  return Boolean(active);
}

/** 单行 type=number 才画步进柱。multiline 不当数字槽。 */
export function resolveTextFieldStepper(input: { type?: string; multiline?: boolean }): boolean {
  return !resolveTextFieldMultiline(input.multiline) && input.type === "number";
}

export function resolveTextFieldStep(step?: number): number {
  if (typeof step === "number" && Number.isFinite(step) && step > 0) return step;
  return DEFAULT_TEXT_FIELD_STEP;
}

/** 未写或非有限数不算边界。 */
export function resolveTextFieldBound(value?: number): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

/** 空串 / 非数字不算当前值。步进时当 0。 */
export function parseTextFieldNumber(value?: string): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function textFieldStepPlaces(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  if (dot === -1) return 0;
  return text.length - dot - 1;
}

function formatTextFieldNumber(value: number, step: number): string {
  const places = textFieldStepPlaces(step);
  if (places <= 0) return String(value);
  return value.toFixed(places).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/** 空值当 0 再加减。触边夹取，不循环。 */
export function stepTextFieldNumber(input: {
  value?: string;
  direction: TextFieldStepDirection;
  min?: number;
  max?: number;
  step?: number;
}): string {
  const step = resolveTextFieldStep(input.step);
  const min = resolveTextFieldBound(input.min);
  const max = resolveTextFieldBound(input.max);
  const current = parseTextFieldNumber(input.value) ?? 0;
  let next = current + input.direction * step;
  if (min !== undefined) next = Math.max(next, min);
  if (max !== undefined) next = Math.min(next, max);
  const places = textFieldStepPlaces(step);
  if (places > 0) {
    const factor = 10 ** places;
    next = Math.round(next * factor) / factor;
  }
  return formatTextFieldNumber(next, step);
}

/** 已在上/下界则对应方向不可点。空值可往两边走（再由 step 夹取）。 */
export function canStepTextFieldNumber(input: {
  value?: string;
  direction: TextFieldStepDirection;
  min?: number;
  max?: number;
}): boolean {
  const current = parseTextFieldNumber(input.value);
  if (current === undefined) return true;
  const min = resolveTextFieldBound(input.min);
  const max = resolveTextFieldBound(input.max);
  if (input.direction > 0 && max !== undefined && current >= max) return false;
  if (input.direction < 0 && min !== undefined && current <= min) return false;
  return true;
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
