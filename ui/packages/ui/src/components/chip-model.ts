/**
 * 可关闭气泡（L2）。
 * 语义色与 Badge 同一枚举；缺省 accent（过滤 Token）。
 * 不碰 DOM、不判定 dismiss。
 * 关闭钮在流内（右上对齐），计入固有宽；禁止 absolute 画到写入盒 clip 外。
 */

import type { YoBadgeTone } from "./badge-model";

export type YoChipTone = YoBadgeTone;

export const DEFAULT_CHIP_TONE: YoChipTone = "accent";

export interface ChipInput {
  text: string;
  tone?: YoChipTone;
}

export interface ChipSpec {
  text: string;
  tone: YoChipTone;
}

export function resolveChipSpec(input: ChipInput): ChipSpec {
  return {
    text: input.text,
    tone: input.tone ?? DEFAULT_CHIP_TONE,
  };
}
