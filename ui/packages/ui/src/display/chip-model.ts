/**
 * 可关闭胶囊（L2，对齐 HarmonyOS Chip）。
 * 语义色与 Badge 同一枚举；缺省 accent。
 * 有 onDismiss 才带关闭圆钮。不设 hover 藏钮。不碰 DOM。
 */

import type { YoBadgeTone } from "./badge-model";

export type YoChipTone = YoBadgeTone;

export const DEFAULT_CHIP_TONE: YoChipTone = "accent";

export interface ChipInput {
  text: string;
  tone?: YoChipTone;
  leading?: unknown;
  block?: boolean;
}

export interface ChipSpec {
  text: string;
  tone: YoChipTone;
  leading: boolean;
  dismiss: boolean;
  block: boolean;
}

/** 空串 / null / false 不算占槽。 */
export function hasChipLeading(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "string") return value.length > 0;
  return true;
}

export function resolveChipBlock(block?: boolean): boolean {
  return Boolean(block);
}

export function resolveChipSpec(input: ChipInput & { dismissible?: boolean }): ChipSpec {
  return {
    text: input.text,
    tone: input.tone ?? DEFAULT_CHIP_TONE,
    leading: hasChipLeading(input.leading),
    dismiss: Boolean(input.dismissible),
    block: resolveChipBlock(input.block),
  };
}
