/**
 * 气泡交互策略（L3）。
 * dismiss 由视图绑 onDismiss；本层只组装 data-* 与无障碍名。
 * 禁止原生 title。
 */

import {
  resolveChipSpec,
  type ChipInput,
  type YoChipDismiss,
  type YoChipTone,
} from "./chip-model";

export interface ChipHostAttrs {
  "data-tone": YoChipTone;
  "data-dismiss": YoChipDismiss | undefined;
  "data-leading": true | undefined;
  "aria-label": string;
}

export function chipHostAttrs(input: ChipInput & { dismissible?: boolean }): ChipHostAttrs {
  const spec = resolveChipSpec(input);
  return {
    "data-tone": spec.tone,
    "data-dismiss": spec.dismiss ?? undefined,
    "data-leading": spec.leading ? true : undefined,
    "aria-label": spec.text,
  };
}
