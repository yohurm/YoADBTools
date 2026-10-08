/**
 * 尺寸行程（L4 binder）。
 * 命令式：command() 在意图当拍量 from/to，直接写 used。
 * 锁盒已在 from，禁止 hold 帧、禁止 rAF 再写 to、禁止观察 DOM。
 * 量盒用 offsetWidth / offsetHeight。关窗 enabled=false 冻锁，卸绑不清尺寸。
 * 只铺满定高祖先（Dialog fill）：解开本轴再读宿主。内容用后高走 YoGrow。
 */
import { motionSpecMs, type MotionSpecName } from "../../../tokens/motion";
import { PRESENCE_EXIT_SAFETY_MS, TRAVEL_SPEC } from "../../spec/recipes";
import { shouldSkipMotion } from "../../reduced";
import { logicalAxesHaveBlock, logicalAxesHaveInline, type LogicalAxis } from "../../../placement/axis";
import { resolveTravelSize, type TravelSize } from "./travel-model";
import { travelHostAttrs, type TravelPaint } from "./travel-policy";

export interface TravelHost {
  enabled: () => boolean;
  axes: () => readonly LogicalAxis[];
  spec?: () => MotionSpecName;
  /** 行程起停。消费者（YoScroller）订这个，禁止再 scrape data-travel。 */
  onTraveling?: (traveling: boolean) => void;
}

export interface TravelController {
  snapshot(): void;
  command(): void;
  dispose(): void;
}

const EMPTY: TravelSize = { block: 0, inline: 0 };

function travelUnlock(el: HTMLElement, prop: "height" | "width", on: boolean): void {
  if (on) el.style[prop] = "";
}

function travelRestore(el: HTMLElement, prop: "height" | "width", value: string): void {
  el.style[prop] = value;
}

function travelSaved(el: HTMLElement, prop: "height" | "width"): string {
  return el.style[prop];
}

function travelFlush(el: HTMLElement): void {
  el.offsetHeight;
}

function travelClearMax(el: HTMLElement, prop: "maxHeight" | "maxWidth"): void {
  el.style[prop] = "";
}

function travelFreeze(el: HTMLElement): void {
  el.style.transition = "none";
}

function travelBox(el: HTMLElement): TravelSize {
  return { block: el.offsetHeight, inline: el.offsetWidth };
}

/**
 * 解开本轴再读宿主布局盒，量完锁回 from 并强制回流。
 * 探测期间关掉过渡，避免 used 被量成 to 后无法起程。
 * 禁止量可视盒。
 */
export function measureTravelUsed(el: HTMLElement, axes: readonly LogicalAxis[]): TravelSize {
  const keepHeight = travelSaved(el, "height");
  const keepWidth = travelSaved(el, "width");
  const keepTransition = el.style.transition;
  travelFreeze(el);
  travelUnlock(el, "height", logicalAxesHaveBlock(axes));
  travelUnlock(el, "width", logicalAxesHaveInline(axes));
  const size = travelBox(el);
  travelRestore(el, "height", keepHeight);
  travelRestore(el, "width", keepWidth);
  travelFlush(el);
  el.style.transition = keepTransition;
  return size;
}

function travelKept(prev: number, measured: number): number {
  return prev > 0 ? prev : measured;
}

function travelHeld(el: HTMLElement, prev: TravelSize): TravelSize {
  return {
    block: travelKept(prev.block, el.offsetHeight),
    inline: travelKept(prev.inline, el.offsetWidth),
  };
}

function travelCssPx(value: number): string {
  return `${value}px`;
}

function travelPinFrom(el: HTMLElement, size: "height" | "width", max: "maxHeight" | "maxWidth", px: number): void {
  el.style[size] = travelCssPx(px);
  el.style[max] = travelCssPx(px);
}

function travelAxisPatch(key: "height" | "width", on: boolean, px: number): { height?: number; width?: number } {
  return on && px > 0 ? { [key]: px } : {};
}

function travelDestPatch(key: "height" | "width", on: boolean, tripTo: number | undefined, measured: number): { height?: number; width?: number } {
  return on ? { [key]: tripTo ?? measured } : {};
}

function travelPaintAxis(el: HTMLElement, prop: "height" | "width", length: number | undefined): void {
  if (length !== undefined) el.style[prop] = travelCssPx(length);
}

function travelNoteEnd(pending: Set<string>, leg: object | undefined, prop: "height" | "width"): void {
  if (leg) pending.add(prop);
}

export function bindTravel(el: HTMLElement, host: TravelHost): TravelController {
  let prev = EMPTY;
  let snapped: TravelSize | undefined;
  let frozen = false;
  let dirty = false;
  let safety = 0;
  let pending = new Set<string>();
  let paint: TravelPaint = {};
  let trip = false;

  const axes = (): readonly LogicalAxis[] => host.axes();

  const notifyTrip = (next: boolean): void => {
    if (trip === next) return;
    trip = next;
    host.onTraveling?.(next);
  };

  const write = (patch: TravelPaint): void => {
    paint = { ...paint, ...patch };
    if ("travel" in patch && patch.travel === undefined) {
      delete paint.travel;
    }
    travelPaintAxis(el, "height", paint.height);
    travelPaintAxis(el, "width", paint.width);
    if (paint.travel === "used") {
      el.setAttribute("data-travel", travelHostAttrs(axes())["data-travel"]);
      notifyTrip(true);
    } else {
      el.removeAttribute("data-travel");
      notifyTrip(false);
    }
  };

  const ready = (): void => {
    if (!el.hasAttribute("data-ready")) el.setAttribute("data-ready", "");
  };

  const lock = (used: TravelSize): void => {
    const next = axes();
    write({
      travel: undefined,
      ...travelAxisPatch("height", logicalAxesHaveBlock(next), used.block),
      ...travelAxisPatch("width", logicalAxesHaveInline(next), used.inline),
    });
    ready();
    prev = used;
    frozen = false;
  };

  const clearSafety = (): void => {
    if (safety === 0) return;
    window.clearTimeout(safety);
    safety = 0;
  };

  const finish = (): void => {
    clearSafety();
    pending = new Set();
    frozen = false;
    if (dirty) {
      dirty = false;
      command();
      return;
    }
    lock(travelBox(el));
  };

  const onEnd = (event: TransitionEvent): void => {
    if (event.target !== el) return;
    if (!pending.delete(event.propertyName)) return;
    if (pending.size === 0) finish();
  };

  const snapshot = (): void => {
    snapped = travelHeld(el, prev);
    notifyTrip(true);
  };

  const command = (): void => {
    if (!host.enabled()) {
      notifyTrip(false);
      return;
    }
    const next = axes();
    if (shouldSkipMotion()) {
      snapped = undefined;
      lock(measureTravelUsed(el, next));
      return;
    }
    if (frozen) {
      dirty = true;
      return;
    }
    const from: TravelSize = snapped ?? travelHeld(el, prev);
    snapped = undefined;
    const to = measureTravelUsed(el, next);
    const trip = resolveTravelSize({ from, to, axes: next });
    if (!trip) {
      lock(to.block > 0 || to.inline > 0 ? to : from);
      return;
    }
    frozen = true;
    pending = new Set<string>();
    travelNoteEnd(pending, trip.block, "height");
    travelNoteEnd(pending, trip.inline, "width");
    ready();
    travelFreeze(el);
    if (logicalAxesHaveBlock(next) && from.block > 0) {
      travelPinFrom(el, "height", "maxHeight", from.block);
    }
    if (logicalAxesHaveInline(next) && from.inline > 0) {
      travelPinFrom(el, "width", "maxWidth", from.inline);
    }
    travelFlush(el);
    travelClearMax(el, "maxHeight");
    travelClearMax(el, "maxWidth");
    el.style.transition = "";
    travelFlush(el);
    write({
      travel: "used",
      ...travelDestPatch("height", logicalAxesHaveBlock(next), trip.block?.to, to.block),
      ...travelDestPatch("width", logicalAxesHaveInline(next), trip.inline?.to, to.inline),
    });
    clearSafety();
    safety = window.setTimeout(finish, motionSpecMs(host.spec?.() ?? TRAVEL_SPEC) + PRESENCE_EXIT_SAFETY_MS);
  };

  el.addEventListener("transitionend", onEnd);

  return {
    snapshot,
    command,
    dispose: () => {
      clearSafety();
      el.removeEventListener("transitionend", onEnd);
    },
  };
}
