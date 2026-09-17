/**
 * 内容用后高策略（L3）。
 * used = 本拍起程。没有 hold 相。落定不留 data-grow。
 * 量子盒可点 `data-grow-used`；未点则量槽内第一子盒。
 */

export type GrowAttr = "used";

export const GROW_USED_ATTR = "data-grow-used";

export interface GrowHostAttrs {
  "data-grow": GrowAttr;
}

export function growHostAttrs(): GrowHostAttrs {
  return { "data-grow": "used" };
}

export function growUsedAttrs(): { [GROW_USED_ATTR]: "used" } {
  return { [GROW_USED_ATTR]: "used" };
}
