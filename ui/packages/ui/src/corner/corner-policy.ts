/**
 * 圆角绘制策略（L3）。
 * 角色半径与描边宽从模型/token 取；本文件只装配宿主与内容槽契约。
 */
import { Stroke } from "../tokens/layout";
import { cornerRadiusForRole, type CornerRole } from "./corner-model";

export type YoCornerMode = "host" | "paint";
export type YoCornerFlex = "fill" | "hug";
export type YoCornerOverflow = "visible" | "hidden" | "auto";
export type YoCornerPad = "none" | "xs" | "sm" | "inline-sm" | "block-xs";
export type YoCornerDirection = "column" | "row";
export type YoCornerAlign = "stretch" | "center";
export type YoCornerJustify = "start" | "center";
export type YoCornerGap = "none" | "xs" | "sm";

export interface CornerHostInput {
  role?: CornerRole;
  radius?: number;
  stroke?: boolean;
  clip?: boolean;
  mode?: YoCornerMode;
}

export interface CornerHostSpec {
  role: CornerRole;
  radius: number;
  stroke: number;
  clip: boolean;
  mode: YoCornerMode;
}

export interface CornerContentInput {
  direction?: YoCornerDirection;
  align?: YoCornerAlign;
  justify?: YoCornerJustify;
  overflow?: YoCornerOverflow;
  pad?: YoCornerPad;
  gap?: YoCornerGap;
}

export interface CornerContentSpec {
  direction: YoCornerDirection;
  align: YoCornerAlign;
  justify: YoCornerJustify;
  overflow: YoCornerOverflow;
  pad: YoCornerPad;
  gap: YoCornerGap;
}

const DEFAULT_CORNER_ROLE: CornerRole = "card";
const DEFAULT_CORNER_MODE: YoCornerMode = "host";
const DEFAULT_CORNER_DIRECTION: YoCornerDirection = "column";
const DEFAULT_CORNER_ALIGN: YoCornerAlign = "stretch";
const DEFAULT_CORNER_JUSTIFY: YoCornerJustify = "start";
const DEFAULT_CORNER_OVERFLOW: YoCornerOverflow = "visible";
const DEFAULT_CORNER_PAD: YoCornerPad = "none";
const DEFAULT_CORNER_GAP: YoCornerGap = "none";

const CORNER_DIRECTIONS = new Set<YoCornerDirection>(["column", "row"]);
const CORNER_ALIGNS = new Set<YoCornerAlign>(["stretch", "center"]);
const CORNER_JUSTIFIES = new Set<YoCornerJustify>(["start", "center"]);
const CORNER_OVERFLOWS = new Set<YoCornerOverflow>(["visible", "hidden", "auto"]);
const CORNER_PADS = new Set<YoCornerPad>(["none", "xs", "sm", "inline-sm", "block-xs"]);
const CORNER_GAPS = new Set<YoCornerGap>(["none", "xs", "sm"]);

function pick<T extends string>(value: T | undefined, allowed: Set<T>, fallback: T): T {
  return value !== undefined && allowed.has(value) ? value : fallback;
}

/** host 默认画描边并裁内容；paint 只铺在已有宿主上，默认不描边。 */
export function resolveCornerHostSpec(input: CornerHostInput): CornerHostSpec {
  const role = input.role ?? DEFAULT_CORNER_ROLE;
  const mode = input.mode ?? DEFAULT_CORNER_MODE;
  const strokeOn = input.stroke ?? mode === "host";
  return {
    role,
    radius: input.radius ?? cornerRadiusForRole(role),
    stroke: strokeOn ? Stroke.Hairline : 0,
    clip: input.clip ?? mode === "host",
    mode,
  };
}

/** 内容槽公开轴。缺省 / 未知值归一，禁止消费方再点 `__content`。 */
export function resolveCornerContentSpec(input: CornerContentInput = {}): CornerContentSpec {
  return {
    direction: pick(input.direction, CORNER_DIRECTIONS, DEFAULT_CORNER_DIRECTION),
    align: pick(input.align, CORNER_ALIGNS, DEFAULT_CORNER_ALIGN),
    justify: pick(input.justify, CORNER_JUSTIFIES, DEFAULT_CORNER_JUSTIFY),
    overflow: pick(input.overflow, CORNER_OVERFLOWS, DEFAULT_CORNER_OVERFLOW),
    pad: pick(input.pad, CORNER_PADS, DEFAULT_CORNER_PAD),
    gap: pick(input.gap, CORNER_GAPS, DEFAULT_CORNER_GAP),
  };
}
