/**
 * 状态点策略（L3）。
 * 有 label 才暴露给辅助技术；否则装饰 hidden。
 */

import { closedAttr } from "../dom/flag";
import {
  resolveStatusDotSpec,
  type StatusDotInput,
  type YoStatusDotTone,
} from "./status-dot-model";

export interface StatusDotHostAttrs {
  "data-tone": YoStatusDotTone;
  "aria-hidden": true | undefined;
  "aria-label": string | undefined;
  role: "img" | undefined;
}

export function statusDotHostAttrs(input: StatusDotInput): StatusDotHostAttrs {
  const spec = resolveStatusDotSpec(input);
  const open = Boolean(spec.label);
  return {
    "data-tone": spec.tone,
    "aria-hidden": closedAttr(open),
    "aria-label": spec.label,
    role: open ? "img" : undefined,
  };
}
