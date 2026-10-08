/** CSS 逻辑轴。行程、轨槽和滚动条提交都认这一份。滚动器轴是 block | both，不是它。 */
export type LogicalAxis = "block" | "inline";

export function logicalAxisIsBlock(axis: LogicalAxis): boolean {
  return axis === "block";
}

/** 轴列表含块向。行程量盒和轴属性都认这一把。 */
export function logicalAxesHaveBlock(axes: readonly LogicalAxis[]): boolean {
  return axes.some(logicalAxisIsBlock);
}

/** 轴列表含行向。行向是块向的另一支。 */
export function logicalAxesHaveInline(axes: readonly LogicalAxis[]): boolean {
  return axes.some((axis) => !logicalAxisIsBlock(axis));
}
