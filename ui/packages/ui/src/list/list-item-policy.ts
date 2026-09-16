/**
 * 列表项策略（L3）。
 * 组装 data-* / ARIA；不写色值、不画铬。
 */

import {
  resolveListItemSpec,
  type ListItemInput,
  type YoListItemRing,
  type YoListItemRole,
  type YoListItemSize,
} from "./list-item-model";

export interface ListItemHostAttrs {
  role: YoListItemRole;
  "data-size": YoListItemSize;
  "data-ring": YoListItemRing;
  "data-selected": true | undefined;
  "aria-selected": boolean | undefined;
  "aria-current": "page" | undefined;
}

export function listItemHostAttrs(input: ListItemInput): ListItemHostAttrs {
  const spec = resolveListItemSpec(input);
  return {
    role: spec.role,
    "data-size": spec.size,
    "data-ring": spec.ring,
    "data-selected": spec.selected ? true : undefined,
    "aria-selected": spec.role === "option" ? spec.selected : undefined,
    "aria-current": spec.role === "button" && spec.current ? "page" : undefined,
  };
}
