/**
 * 常驻图标轨时序（动画系统-v6.md 配方 rail）。
 *
 * 点开合当拍：列宽跟意图，文案流跟相位。展开 / 展开行程开流；
 * 收起当拍关流。宽、槽、卡高、字同一拍，禁止先水平再垂直。
 */

import { Layout } from "../../../tokens/layout";

export type RailIntent = "expanded" | "icons";

export type RailPhase = "expanded" | "collapsing" | "icons" | "expanding";

/** 展开意图。相位、列宽和壳开合都认这一把。 */
export function railIntentIsExpanded(intent: RailIntent): boolean {
  return intent === "expanded";
}

/** 在展开与图标之间对调。 */
export function railToggleIntent(intent: RailIntent): RailIntent {
  return railIntentIsExpanded(intent) ? "icons" : "expanded";
}

/** 宽度落地后的休息相位。减动效和初次挂载也落在这里。 */
export function railPhaseAfterWidthSettle(intent: RailIntent): RailPhase {
  return railIntentIsExpanded(intent) ? "expanded" : "icons";
}

/** 点开合后的相位。减动效则当拍落到休息相位。 */
export function railPhaseOnIntentChange(next: RailIntent, skipMotion: boolean): RailPhase {
  if (skipMotion) return railPhaseAfterWidthSettle(next);
  return railIntentIsExpanded(next) ? "expanding" : "collapsing";
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

function railPx(value: number): number {
  return Math.round(value);
}

/** 列宽对照 `Layout` 侧栏尺。 */
export function railWidthMatchesIntent(usedPx: number, expanded: boolean): boolean {
  const expected = expanded ? Layout.ShellNav : Layout.ShellNavIcons;
  return railPx(usedPx) === railPx(expected);
}
