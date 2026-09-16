/**
 * 描述列表领域模型（L2）。
 * 对照 HarmonyOS 文本层级：term 三级、detail 一级；效率型键值对，不是表单。
 * 不碰 DOM。
 */

export interface YoDescriptionItem {
  term: string;
  detail: string;
}

export interface DescriptionListInput {
  items?: readonly YoDescriptionItem[];
}

export interface DescriptionListSpec {
  items: readonly YoDescriptionItem[];
}

export function resolveDescriptionListSpec(input: DescriptionListInput): DescriptionListSpec {
  const items = (input.items ?? []).filter((item) => item.term.trim().length > 0);
  return { items };
}
