/**
 * 常驻图标轨时序（动画系统-v6.md 配方 rail）。
 *
 * 点开合当拍：列宽跟意图，文案流跟相位。展开 / 展开行程开流；
 * 收起当拍关流。宽、槽、卡高、字同一拍，禁止先水平再垂直。
 */

export type RailIntent = "expanded" | "icons";

export type RailPhase = "expanded" | "collapsing" | "icons" | "expanding";

/** 点开合后的相位。减动效则当拍落到意图。 */
export function railPhaseOnIntentChange(next: RailIntent, skipMotion: boolean): RailPhase {
  if (skipMotion) return next === "expanded" ? "expanded" : "icons";
  return next === "expanded" ? "expanding" : "collapsing";
}

export function railPhaseAfterWidthSettle(intent: RailIntent): RailPhase {
  return intent === "expanded" ? "expanded" : "icons";
}

/** 列宽跟用户意图，当拍起程。 */
export function railWidthIntent(phase: RailPhase): RailIntent {
  return phase === "collapsing" || phase === "icons" ? "icons" : "expanded";
}

/** 文案流、槽、卡高同一拍。展开与展开行程开流。 */
export function railStreamOpen(phase: RailPhase): boolean {
  return phase === "expanded" || phase === "expanding";
}

/** `data-stream` 取值：开流 open，关流 closed。 */
export function railStreamAttr(phase: RailPhase): "open" | "closed" {
  return railStreamOpen(phase) ? "open" : "closed";
}

/** 槽跟文案流同一拍（0fr / 1fr）。 */
export function railSlotOpen(phase: RailPhase): boolean {
  return railStreamOpen(phase);
}

/** 列宽/卡高插值中：YoScroller 不新出条。 */
export function railTraveling(phase: RailPhase): boolean {
  return phase === "expanding" || phase === "collapsing";
}

/** 文案关流后标题不可读，开气泡。 */
export function railTooltipEnabled(phase: RailPhase): boolean {
  return !railStreamOpen(phase);
}

export function railWidthMatchesIntent(
  usedPx: number,
  expanded: boolean,
  shellNav: string,
  shellNavIcons: string,
): boolean {
  const expected = Number.parseFloat((expanded ? shellNav : shellNavIcons).trim());
  if (!Number.isFinite(expected)) return false;
  return Math.round(usedPx) === Math.round(expected);
}
