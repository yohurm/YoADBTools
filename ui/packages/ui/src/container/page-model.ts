/**
 * 页壳领域模型（L2）。
 * 效率型 / 设置页共用根：页垫、列帽由角色解析，页眉是第一子节点。
 * 不碰 DOM、不编排转场。
 */

export type YoPageRole = "module" | "settings";
export type YoPagePad = "inset" | "margin";
export type YoPageColumn = "fill" | "measure";

export const DEFAULT_PAGE_ROLE: YoPageRole = "module";
export const DEFAULT_PAGE_PAD: YoPagePad = "inset";
export const DEFAULT_PAGE_COLUMN: YoPageColumn = "fill";

export interface PageSpec {
  role: YoPageRole;
  pad: YoPagePad;
  column: YoPageColumn;
}

/** 设置页。页垫和列帽都认这一把。 */
export function pageRoleIsSettings(role?: string): boolean {
  return role === "settings";
}

/** 左右 page-margin。缺省 inset 不写 data-pad。 */
export function pagePadIsMargin(pad?: string): boolean {
  return pad === "margin";
}

/** 阅读列帽。缺省 fill 不写 data-column。 */
export function pageColumnIsMeasure(column?: string): boolean {
  return column === "measure";
}

export function resolvePageRole(role?: YoPageRole): YoPageRole {
  return pageRoleIsSettings(role) ? "settings" : DEFAULT_PAGE_ROLE;
}

/** 设置页 PC 左右 40vp；效率型贴边 12vp。 */
export function pagePadForRole(role: YoPageRole): YoPagePad {
  return pageRoleIsSettings(role) ? "margin" : DEFAULT_PAGE_PAD;
}

/**
 * 设置页阅读列帽 SettingsMax，超出居中留白。
 * 全屏适配是居中，不是把表单拉满栅格（栅格帽是窗口 12 列）。
 */
export function pageColumnForRole(role: YoPageRole): YoPageColumn {
  return pageRoleIsSettings(role) ? "measure" : DEFAULT_PAGE_COLUMN;
}

export function resolvePageSpec(role?: YoPageRole): PageSpec {
  const resolved = resolvePageRole(role);
  return {
    role: resolved,
    pad: pagePadForRole(resolved),
    column: pageColumnForRole(resolved),
  };
}
