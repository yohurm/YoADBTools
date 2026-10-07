/**
 * 胶囊交互策略（L3）。
 * 关闭由视图绑 onDismiss；本层只组装 data-* 与无障碍名。
 * 禁止原生 title。
 */
import { presenceAttr } from "../dom/flag";

import type { YoBadgeTone } from "./badge-model";
import { resolveChipSpec, type ChipInput } from "./chip-model";

export interface ChipHostAttrs {
  "data-tone": YoBadgeTone;
  "data-dismiss": "" | undefined;
  "data-leading": "" | undefined;
  "data-block": "" | undefined;
  "aria-label": string;
}

export function chipHostAttrs(input: ChipInput & { dismissible?: boolean }): ChipHostAttrs {
  const spec = resolveChipSpec(input);
  return {
    "data-tone": spec.tone,
    "data-dismiss": presenceAttr(spec.dismiss),
    "data-leading": presenceAttr(spec.leading),
    "data-block": presenceAttr(spec.block),
    "aria-label": spec.text,
  };
}
