/**
 * 操作项功能集（L2）。
 * 只描述清单引擎要不要接通某条能力，不画行、不包虚拟列表。
 * 不碰 DOM、不写色值。
 */

export const OPS_FEATURES = ["select", "multi", "reorder", "menu", "rule"] as const;

/** select 单选；multi 多选（含单选）；reorder 整行换位；menu 行菜单；rule 名称间 hairline。 */
export type YoOpsFeature = (typeof OPS_FEATURES)[number];

export interface OpsListSpec {
  select: boolean;
  multi: boolean;
  reorder: boolean;
  menu: boolean;
  rule: boolean;
}

const EMPTY: OpsListSpec = {
  select: false,
  multi: false,
  reorder: false,
  menu: false,
  rule: false,
};

/** 只认闭集。multi 打开时单选通道一并打开，避免两套选区并存。 */
export function resolveOpsFeatures(features?: readonly YoOpsFeature[]): OpsListSpec {
  if (!features || features.length === 0) return EMPTY;
  const set = new Set(features);
  const multi = set.has("multi");
  return {
    select: multi || set.has("select"),
    multi,
    reorder: set.has("reorder"),
    menu: set.has("menu"),
    rule: set.has("rule"),
  };
}
