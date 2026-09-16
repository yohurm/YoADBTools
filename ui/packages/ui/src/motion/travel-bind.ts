/**
 * 尺寸行程（L4 binder）。
 * 命令式：command() 在意图当拍量 from/to，直接写 used。
 * 锁盒已在 from，禁止 hold 帧、禁止 rAF 再写 to、禁止观察 DOM。
 * 量盒用 offsetWidth / offsetHeight。关窗 enabled=false 冻锁，卸绑不清尺寸。
 */
import { motionSpecMs, type MotionSpecName } from "../tokens/motion";
import { PRESENCE_EXIT_SAFETY_MS } from "./recipes";
import { shouldSkipMotion } from "./reduced";
import { resolveTravelSize, type TravelAxis, type TravelSize } from "./travel-model";
import { travelHostAttrs, type TravelPaint } from "./travel-policy";

export interface TravelHost {
  enabled: () => boolean;
  axes: () => readonly TravelAxis[];
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

/**
 * 解开本轴再读布局盒，量完锁回 from 并强制回流。
 * 探测期间关掉过渡，避免 used 被量成 to 后无法起程。
 * 禁止量可视盒。
 */
export function measureTravelUsed(el: HTMLElement, axes: readonly TravelAxis[]): TravelSize {
  const keepHeight = el.style.height;
  const keepWidth = el.style.width;
  const keepTransition = el.style.transition;
  el.style.transition = "none";
  if (axes.includes("block")) el.style.height = "";
  if (axes.includes("inline")) el.style.width = "";
  const size = { block: el.offsetHeight, inline: el.offsetWidth };
  el.style.height = keepHeight;
  el.style.width = keepWidth;
  el.offsetHeight;
  el.style.transition = keepTransition;
  return size;
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

  const axes = (): readonly TravelAxis[] => host.axes();

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
    if (paint.height !== undefined) {
      el.style.height = `${paint.height}px`;
    }
    if (paint.width !== undefined) {
      el.style.width = `${paint.width}px`;
    }
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
      ...(next.includes("block") && used.block > 0 ? { height: used.block } : {}),
      ...(next.includes("inline") && used.inline > 0 ? { width: used.inline } : {}),
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
    lock({
      block: el.offsetHeight,
      inline: el.offsetWidth,
    });
  };

  const onEnd = (event: TransitionEvent): void => {
    if (event.target !== el) return;
    if (!pending.delete(event.propertyName)) return;
    if (pending.size === 0) finish();
  };

  const snapshot = (): void => {
    snapped = {
      block: prev.block > 0 ? prev.block : el.offsetHeight,
      inline: prev.inline > 0 ? prev.inline : el.offsetWidth,
    };
    /* 布局轴即将改：先标行程，避免 Scroller 在 command 前把插值视口当成可滚。 */
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
    const from: TravelSize = snapped ?? {
      block: prev.block > 0 ? prev.block : el.offsetHeight,
      inline: prev.inline > 0 ? prev.inline : el.offsetWidth,
    };
    snapped = undefined;
    const to = measureTravelUsed(el, next);
    const trip = resolveTravelSize({ from, to, axes: next });
    if (!trip) {
      lock(to.block > 0 || to.inline > 0 ? to : from);
      return;
    }
    frozen = true;
    pending = new Set<string>();
    if (trip.block) pending.add("height");
    if (trip.inline) pending.add("width");
    ready();
    el.style.transition = "none";
    if (next.includes("block") && from.block > 0) {
      el.style.height = `${from.block}px`;
      el.style.maxHeight = `${from.block}px`;
    }
    if (next.includes("inline") && from.inline > 0) {
      el.style.width = `${from.inline}px`;
      el.style.maxWidth = `${from.inline}px`;
    }
    el.offsetHeight;
    el.style.maxHeight = "";
    el.style.maxWidth = "";
    el.style.transition = "";
    write({
      travel: "used",
      ...(next.includes("block") ? { height: trip.block?.to ?? to.block } : {}),
      ...(next.includes("inline") ? { width: trip.inline?.to ?? to.inline } : {}),
    });
    clearSafety();
    const spec = host.spec?.() ?? "spatialPanel";
    safety = window.setTimeout(finish, motionSpecMs(spec) + PRESENCE_EXIT_SAFETY_MS);
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
