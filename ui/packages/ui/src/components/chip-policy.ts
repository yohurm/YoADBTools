/**
 * 胶囊交互策略（L3）。
 * 关闭由视图绑 onDismiss；本层只组装 data-* 与无障碍名。
 * 禁止原生 title。
 */

import { resolveChipSpec, type ChipInput, type YoChipTone } from "./chip-model";

export interface ChipHostAttrs {
  "data-tone": YoChipTone;
  "data-dismiss": true | undefined;
  "data-leading": true | undefined;
  "data-block": true | undefined;
  "aria-label": string;
}

export function chipHostAttrs(input: ChipInput & { dismissible?: boolean }): ChipHostAttrs {
  const spec = resolveChipSpec(input);
  return {
    "data-tone": spec.tone,
    "data-dismiss": spec.dismiss ? true : undefined,
    "data-leading": spec.leading ? true : undefined,
    "data-block": spec.block ? true : undefined,
    "aria-label": spec.text,
  };
}
