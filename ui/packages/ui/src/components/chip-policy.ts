/**
 * 气泡交互策略（L3）。
 * dismiss 由视图绑 onDismiss；本层只组装 data-* 与无障碍名。
 */

import { resolveChipSpec, type ChipInput, type YoChipTone } from "./chip-model";

export interface ChipHostAttrs {
  "data-tone": YoChipTone;
  "data-dismiss": true | undefined;
  "aria-label": string;
}

export function chipHostAttrs(input: ChipInput & { dismissible?: boolean }): ChipHostAttrs {
  const spec = resolveChipSpec(input);
  return {
    "data-tone": spec.tone,
    "data-dismiss": input.dismissible ? true : undefined,
    "aria-label": spec.text,
  };
}
