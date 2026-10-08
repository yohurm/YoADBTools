/**
 * 可关闭胶囊（L2，对齐 HarmonyOS Chip）。
 * 语义色与 Badge 同一枚举；缺省 accent。
 * 有 onDismiss 才带关闭圆钮。不设 hover 藏钮。不碰 DOM。
 */

import { controlIsBlock } from "../basic/control-busy";
import { hasTextFieldSlot } from "../form/textfield-model";
import type { YoBadgeTone } from "./badge-model";

export const DEFAULT_CHIP_TONE: YoBadgeTone = "accent";

export interface ChipInput {
  text: string;
  tone?: YoBadgeTone;
  leading?: unknown;
  block?: boolean;
}

export interface ChipSpec {
  text: string;
  tone: YoBadgeTone;
  leading: boolean;
  dismiss: boolean;
  block: boolean;
}

export function resolveChipSpec(input: ChipInput & { dismissible?: boolean }): ChipSpec {
  return {
    text: input.text,
    tone: input.tone ?? DEFAULT_CHIP_TONE,
    leading: hasTextFieldSlot(input.leading),
    dismiss: Boolean(input.dismissible),
    block: controlIsBlock(input.block),
  };
}
