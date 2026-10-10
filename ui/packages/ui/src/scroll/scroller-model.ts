/**
 * 滚动条领域模型（L2）。
 * 对照 OpenHarmony Scroll / ScrollBar：无法滚动则不显示；滑块高 = 视口² / 内容；
 * 条宽 4vp（Spacing.Xs）；Hover/Press 加粗 8vp（官方 unset 宽走 GROW）。
 * 热区 / 侧轨 = 官方 hoverWidth = activeWidth + margin×2（8+4×2=16vp），不是空闲条+边=8。
 * 最短滑块：轨 ≥240vp 用 48vp，短轨 max(轨×20%, 8vp)。BarState.Auto 停滚 2s 后隐藏。
 * 内置条是 overlay；官方 ScrollBar 示例给内容右边距。溢出且未 Off 时
 * 视口 padding-inline-end 让出侧轨，不夺滚动口宽。
 * 电脑轨道点按翻一页，500ms 后再 100ms 连翻。溢出只认 in-flow 盒，不认 abspos 撑的 scrollHeight。
 * traveling 由祖先 YoTravel / YoCollapse / YoGrow / Rail 信号提供；插值中不新出条；收回留 out 直到淡出结束。
 */

import { Layout } from "../tokens/layout";
import { motionDurationMs } from "../tokens/motion";
import { Spacing } from "../tokens/spacing";
import { ratioPercent } from "../display/progress-model";

export type ScrollerPhase = "none" | "in" | "on" | "out";

/** 对照 ArkUI BarState：Auto 滚动时显示，On 常驻，Off 不画条仍可滚。 */
export type ScrollerBarState = "auto" | "on" | "off";

/** 默认只纵滚。both 才开横轴产品条（日志 clip）。 */
export type ScrollerAxis = "block" | "both";

/** end = 块轴末端淡出，避免钉底铬压住末行残影。 */
export type ScrollerFade = "end";

/** 视口溢出。hidden 不画条、不接滚轮。缺省 auto。 */
export type ScrollerOverflow = "auto" | "hidden";

/** 裁切视口。和面板 overflow、内容是否溢出不是同一份事实。 */
export function scrollerOverflowIsHidden(overflow?: string): boolean {
  return overflow === "hidden";
}

export function resolveScrollerFade(fade?: ScrollerFade): ScrollerFade | undefined {
  return fade === "end" ? "end" : undefined;
}

/** 双轴才开横条与横滚。缺省只纵滚。 */
export function scrollerAxisIsBoth(axis?: ScrollerAxis): boolean {
  return axis === "both";
}

/** 没有滚动条。属性、无障碍和手势都认这一把。 */
export function scrollerPhaseIsNone(phase: ScrollerPhase | undefined): phase is "none" {
  return phase === "none";
}

/** 正在淡出。轨道不接指针。 */
export function scrollerPhaseIsOut(phase: ScrollerPhase | undefined): phase is "out" {
  return phase === "out";
}

/** 入场或常显。跳过动效时收成常显。 */
export function scrollerPhaseIsShown(phase: ScrollerPhase | undefined): boolean {
  return phase === "in" || phase === "on";
}

/** 跳过动效：已在场收成常显，否则相位与上一拍都空。纵轴与横轴同一把。 */
export function resolveScrollerReducedPhase(phase: ScrollerPhase): {
  phase: "on" | "none";
  prev: "on" | undefined;
} {
  if (scrollerPhaseIsShown(phase)) return { phase: "on", prev: "on" };
  return { phase: "none", prev: undefined };
}

/** 静置或淡出中不接轨道指针。 */
export function scrollerPhaseAcceptsPointer(phase: ScrollerPhase): boolean {
  return !scrollerPhaseIsNone(phase) && !scrollerPhaseIsOut(phase);
}

export function resolveScrollerAxis(axis?: ScrollerAxis): ScrollerAxis {
  return scrollerAxisIsBoth(axis) ? "both" : "block";
}

function scrollerPad(value: number): number {
  return Math.max(0, value);
}

/** client 含 padding；滚动口用内容盒。 */
export function resolveScrollerViewSize(client: number, paddingStart = 0, paddingEnd = 0): number {
  return Math.max(0, client - scrollerPad(paddingStart) - scrollerPad(paddingEnd));
}

/** aria-valuenow：偏移占可滚范围的整数百分比。范围无效时为 0。 */
export function resolveScrollerValueNow(offset: number, range: number): number {
  return Math.round(ratioPercent(offset, range));
}

/** 滑块最小高：鸿蒙滚动条最短 48vp（Layout.IconPreview）。 */
export const SCROLLER_THUMB_MIN = Layout.IconPreview;

/** 对照 ArkUI SMALL_SCROLL_BAR_REGION_THRESHOLD：短于 240vp 用短轨最短。 */
export const SCROLLER_SMALL_REGION = Layout.Preview;

/** 对照 ArkUI SMALL_SCROLL_BAR_MIN_HEIGHT：短轨最短 8vp。 */
export const SCROLLER_THUMB_MIN_SMALL = Spacing.Sm;

/** 对照 ArkUI SMALL_SCROLL_BAR_MIN_SIZE_RATIO。 */
export const SCROLLER_THUMB_MIN_RATIO = 0.2;

/** 对照 ArkUI 默认条宽 4vp；unset 宽才允许 Hover GROW。 */
export const SCROLLER_THUMB = Spacing.Xs;

/** 对照 ArkUI PlayScrollBarGrowAnimation：Hover/Press 加粗到 activeWidth 8vp。 */
export const SCROLLER_THUMB_ACTIVE = Spacing.Sm;

/** 对照 ArkUI padding.Right：滑块距容器外沿 4vp。 */
export const SCROLLER_THUMB_END = Spacing.Xs;

/**
 * 对照 ArkUI SetHoverWidth：hoverWidth = activeWidth + ScrollBarMargin×2。
 * 侧轨与内容让位同一数：静置 [8vp 空][4vp 条][4vp 边]；GROW 仍落在槽内。
 */
export const SCROLLER_LANE = SCROLLER_THUMB_ACTIVE + SCROLLER_THUMB_END * 2;

/** 侧轨让位用 token 尺，禁止热路径 getComputedStyle。 */
export function resolveScrollerViewFromGutter(client: number, gutterOn: boolean): number {
  return resolveScrollerViewSize(client, 0, gutterOn ? SCROLLER_LANE : 0);
}

/** HarmonyOS BarState.Auto：停止滚动后隐藏。 */
export const SCROLLER_AUTO_HIDE_MS = motionDurationMs("barHide");

/** 对照 ArkUI LONG_PRESS_TIME_THRESHOLD_MS：点轨道先翻一页，再等连翻。 */
export const SCROLLER_PAGE_HOLD_MS = 500;

/** HarmonyOS 电脑：轨道长按翻页间隔 = effectsFast（100ms）。 */
export const SCROLLER_PAGE_REPEAT_MS = motionDurationMs("fast");

/** 轨短于 240vp 时最短滑块 = max(轨×20%, 8vp)，否则 48vp。 */
export function resolveScrollerThumbMin(track: number): number {
  if (!(track > 0)) return SCROLLER_THUMB_MIN;
  if (track < SCROLLER_SMALL_REGION) {
    return Math.max(SCROLLER_THUMB_MIN_SMALL, track * SCROLLER_THUMB_MIN_RATIO);
  }
  return SCROLLER_THUMB_MIN;
}

export interface ScrollerThumb {
  top: number;
  height: number;
}

export interface ScrollerFlowBox {
  top: number;
  height: number;
}

/** 调用方声明的内容尺。虚拟列表用总高/行宽，禁止热路径再量 in-flow 子盒。 */
export interface ScrollerExtent {
  block: number;
  inline?: number;
}

/**
 * offset：声明尺，会话数字驱动平面 transform，视口 scrollTop 恒 0。
 * flow：短名单，同一数字写进 scrollTop（in-flow 子盒）。
 */
export type ScrollerDrive = "offset" | "flow";

export function resolveScrollerDrive(declared: ScrollerExtent | undefined): ScrollerDrive {
  return declared != null ? "offset" : "flow";
}

/** 短名单把同一数字写进 scrollTop。声明尺走 offset，不进这一把。 */
export function scrollerDriveIsFlow(drive: ScrollerDrive): boolean {
  return drive === "flow";
}

/** 内容平面位移。负号把内容拉进视口；调用方写 DOM transform，不进 Solid。 */
export function scrollerPlaneTransform(block: number, inline = 0): string {
  return `translate3d(${-inline}px, ${-block}px, 0)`;
}

export interface ScrollerMetrics {
  viewBlock: number;
  contentBlock: number;
  viewInline: number;
  contentInline: number;
}

function scrollerExtent(value: number): number {
  return Math.max(0, value);
}

/** 有声明尺则用声明；横轴 0 / 缺省跟视口（不横滚）。 */
export function resolveScrollerContentBox(
  declared: ScrollerExtent | undefined,
  measuredBlock: number,
  measuredInline: number,
  viewInline: number,
): { block: number; inline: number } {
  if (!declared) {
    return { block: measuredBlock, inline: measuredInline };
  }
  return {
    block: scrollerExtent(declared.block),
    inline: declared.inline != null && declared.inline > 0 ? declared.inline : scrollerExtent(viewInline),
  };
}

/** CSS Positioned Layout：absolute / fixed 出流，不进溢出。 */
export function resolveScrollerFlowChild(position: string): boolean {
  return position !== "absolute" && position !== "fixed";
}

/** 直接子级 in-flow 底边。top 相对滚口（滚口须是 offsetParent）。abspos 不进盒。 */
export function resolveScrollerFlowSize(boxes: readonly ScrollerFlowBox[]): number {
  let extent = 0;
  for (const box of boxes) {
    if (!(box.height > 0)) continue;
    extent = Math.max(extent, box.top + box.height);
  }
  return extent;
}

/** 小于条宽的误差不当溢出（锁盒 1–2px / 亚像素）。对照 ArkUI：无法滚动则不显示。 */
export const SCROLLER_OVERFLOW_SLACK = Spacing.Xs;

/** 内容比视口多出一条宽以上才算可滚。 */
export function resolveScrollerOverflow(view: number, all: number): boolean {
  return view > 0 && all > view + SCROLLER_OVERFLOW_SLACK;
}

export function resolveScrollerBarState(state?: ScrollerBarState): ScrollerBarState {
  return state ?? "auto";
}

/** Auto 停滚后隐藏。侧轨让位和相位都认常驻 / 关闭。 */
export function scrollerBarIsAuto(state: ScrollerBarState): boolean {
  return state === "auto";
}

export function scrollerBarIsOn(state: ScrollerBarState): boolean {
  return state === "on";
}

export function scrollerBarIsOff(state: ScrollerBarState): boolean {
  return state === "off";
}

/** enableScrollInteraction：缺省 true；false 仍可用控制器接口。 */
export function resolveScrollerInteractive(interactive?: boolean): boolean {
  return interactive !== false;
}

/** 溢出且未 Off 则让出侧轨。On 即使未溢出也常驻，避免内容涨落改视口宽。Auto 隐条在溢出时留槽。 */
export function resolveScrollerGutter(input: {
  overflowing: boolean;
  barState?: ScrollerBarState;
}): boolean {
  const bar = resolveScrollerBarState(input.barState);
  if (scrollerBarIsOff(bar)) return false;
  if (scrollerBarIsOn(bar)) return true;
  return input.overflowing;
}

export function resolveScrollerPhase(input: {
  overflowing: boolean;
  traveling?: boolean;
  barState?: ScrollerBarState;
  idle?: boolean;
  holding?: boolean;
  prev?: ScrollerPhase;
}): ScrollerPhase {
  const bar = resolveScrollerBarState(input.barState);
  const shown = scrollerPhaseIsShown(input.prev);
  const fading = shown || scrollerPhaseIsOut(input.prev);
  if (!input.overflowing || scrollerBarIsOff(bar)) {
    return fading ? "out" : "none";
  }
  if (input.traveling && !shown) {
    return scrollerPhaseIsOut(input.prev) ? "out" : "none";
  }
  const keep = scrollerBarIsOn(bar) || input.holding === true || input.idle !== true;
  if (keep) return shown ? "on" : "in";
  return fading ? "out" : "none";
}

export function scrollerThumbRoom(view: number, thumb: number): number {
  return Math.max(0, view - thumb);
}

function scrollerOffset(value: number): number {
  return Math.max(0, value);
}

export function resolveScrollerThumb(input: {
  view: number;
  all: number;
  top: number;
  min?: number;
}): ScrollerThumb | undefined {
  const view = input.view;
  const all = input.all;
  const min = input.min ?? resolveScrollerThumbMin(view);
  if (!resolveScrollerOverflow(view, all)) return undefined;
  const height = Math.min(view, Math.max(min, (view / all) * view));
  const room = scrollerThumbRoom(view, height);
  const range = all - view;
  const top = range > 0 ? (scrollerOffset(input.top) / range) * room : 0;
  return { top, height };
}

/** 钉底：in-flow 底边对齐视口底。禁止用 scrollHeight。 */
export function resolveScrollerScrollEnd(view: number, all: number): number {
  return Math.max(0, all - view);
}

/** 滑块位移 → 会话 block 偏移。room=0 不滚。 */
export function resolveScrollerScrollTop(input: {
  view: number;
  all: number;
  thumbHeight: number;
  thumbTop: number;
}): number {
  const range = input.all - input.view;
  const room = scrollerThumbRoom(input.view, input.thumbHeight);
  if (!(range > 0) || !(room > 0)) return 0;
  const ratio = Math.min(1, Math.max(0, input.thumbTop / room));
  return ratio * range;
}

/** 指针相对轨道 → 滑块 top，夹在 [0, room]。 */
export function resolveScrollerThumbTop(input: {
  pointerY: number;
  trackTop: number;
  grab: number;
  room: number;
}): number {
  return Math.min(input.room, Math.max(0, input.pointerY - input.trackTop - input.grab));
}

/** WheelEvent.deltaMode：0 像素 / 1 行 / 2 页。行高走 Spacing.Lg。 */
export function resolveScrollerWheelDelta(input: {
  deltaY: number;
  deltaMode: number;
  lineHeight?: number;
  pageHeight: number;
}): number {
  if (input.deltaMode === 1) return input.deltaY * (input.lineHeight ?? Spacing.Lg);
  if (input.deltaMode === 2) return input.deltaY * input.pageHeight;
  return input.deltaY;
}

/** 滚轮/程序改 top：夹在 [0, 可滚距离]。 */
export function resolveScrollerClampedTop(input: {
  top: number;
  view: number;
  all: number;
}): number {
  return Math.min(resolveScrollerScrollEnd(input.view, input.all), scrollerOffset(input.top));
}

/** 对照 Scroller.scrollPage：一页 = 视口高。 */
export function resolveScrollerPageTop(input: {
  view: number;
  all: number;
  top: number;
  next: boolean;
}): number {
  return resolveScrollerClampedTop({
    top: input.top + (input.next ? input.view : -input.view),
    view: input.view,
    all: input.all,
  });
}

/** 电脑点轨道：指针在滑块上方翻上页，下方翻下页。 */
export function resolveScrollerPageTowardPointer(input: {
  pointerY: number;
  trackTop: number;
  thumbTop: number;
  thumbHeight: number;
}): boolean | undefined {
  const pointer = input.pointerY - input.trackTop;
  if (pointer < input.thumbTop) return false;
  if (pointer > input.thumbTop + input.thumbHeight) return true;
  return undefined;
}

/** 滑块已盖住指针时停止连翻。 */
export function resolveScrollerThumbCoversPointer(input: {
  pointerY: number;
  trackTop: number;
  thumbTop: number;
  thumbHeight: number;
}): boolean {
  return resolveScrollerPageTowardPointer(input) === undefined;
}
