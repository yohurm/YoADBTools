/**
 * 下拉选择领域模型（L2）。
 * 视图只消费这些纯函数，禁止在 TSX 里再写一套选中 / 键盘索引算法。
 * 菜单落点的盒 / 高度估计只放数据，不碰 DOM。
 */

import { listActivateKey, listEdgeKey, stepWrappedIndex, tabKey, verticalListDelta, type ListEdge } from "../keymap/list-index";
import type { PopoverPlacement } from "../placement/side";

export interface YoSelectOption {
  /** 选项值 */
  value: string;
  /** 选项显示文本 */
  label: string;
  /** 次文案（型号旁的短号 / 连接）。空串不算。 */
  description?: string;
}

/** 去掉空白后的次文案；空则无。 */
export function optionDescription(option: YoSelectOption | undefined): string | undefined {
  const text = option?.description?.trim();
  return text ? text : undefined;
}

/** 菜单高度估计输入：实测高、选项行数、文案（用来把短钮撑开）。 */
export interface SelectMenuMeasure {
  optionCount: number;
  scrollHeight: number;
  labels?: readonly string[];
  descriptions?: readonly string[];
}

/** L3 落点写回视图的快照。 */
export interface SelectMenuLayout {
  placement: PopoverPlacement;
  overflowY: boolean;
  style: Record<string, string>;
}

/** 空字符串 value（如级别「全部」）不能生成 `yohu-option-` 这种残缺 id。 */
export const optionDomId = (value: string): string => `yohu-option-${value === "" ? "empty" : value}`;

/** 这一项就是当前值。查找与描选中都认这一把。 */
export function optionIsSelected(
  option: { value: string },
  value: string | null | undefined,
): boolean {
  return option.value === value;
}

export function findOption(
  options: readonly YoSelectOption[],
  value: string | null | undefined,
): YoSelectOption | undefined {
  return options.find((option) => optionIsSelected(option, value));
}

export function selectedIndex(
  options: readonly YoSelectOption[],
  value: string | null | undefined,
): number {
  return options.findIndex((option) => optionIsSelected(option, value));
}

/** 菜单一行。选中、分割线在这里定，视图只绑。 */
export interface SelectMenuRow {
  id: string;
  value: string;
  label: string;
  description?: string;
  selected: boolean;
  /** 除末项外画分割线。 */
  rule: boolean;
}

/** 选项投影成菜单行。末项不带分割线。 */
export function selectMenuRows(
  options: readonly YoSelectOption[],
  value: string | null | undefined,
): SelectMenuRow[] {
  const last = options.length - 1;
  return options.map((option, index) => ({
    id: optionDomId(option.value),
    value: option.value,
    label: option.label,
    description: optionDescription(option),
    selected: optionIsSelected(option, value),
    rule: index < last,
  }));
}

export function stepIndex(count: number, current: number, delta: number): number {
  const from = current >= 0 ? current : 0;
  return stepWrappedIndex(count, from, delta);
}

export type SelectKeyIntent =
  | { type: "step"; delta: number }
  | { type: "edge"; edge: ListEdge }
  | { type: "commit" }
  | { type: "toggle" }
  | { type: "tabCommit" };

/** 触发钮键盘意图；未识别返回 null（视图不 preventDefault）。 */
export function selectKeyIntent(key: string, isOpen: boolean): SelectKeyIntent | null {
  const delta = verticalListDelta(key);
  if (delta !== null) return { type: "step", delta };
  const edge = listEdgeKey(key);
  if (edge) return isOpen ? { type: "edge", edge } : null;
  if (listActivateKey(key)) return isOpen ? { type: "commit" } : { type: "toggle" };
  if (tabKey(key)) return isOpen ? { type: "tabCommit" } : null;
  return null;
}
