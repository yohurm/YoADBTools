/**
 * 页壳领域模型（L2）。
 * 效率型模块根：页垫 / 间距单源，页眉是第一子节点。
 * 不碰 DOM、不编排转场。
 */

export type YoPageRole = "module";

export const DEFAULT_PAGE_ROLE: YoPageRole = "module";

export interface PageSpec {
  role: YoPageRole;
}

export function resolvePageSpec(): PageSpec {
  return { role: DEFAULT_PAGE_ROLE };
}
