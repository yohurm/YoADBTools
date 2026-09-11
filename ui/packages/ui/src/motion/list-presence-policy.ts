/**
 * 短列表 Presence 宿主身份（L3）。
 * 只装配 first；L4 写成 data-first。不写配方过渡。
 */

export interface ListPresenceHostAttrs {
  first: boolean;
}

/** 当前树上第一槽（含出场中）标 first。 */
export function listPresenceHostAttrs(
  firstKey: string | undefined,
  key: string,
): ListPresenceHostAttrs {
  return { first: firstKey === key };
}
