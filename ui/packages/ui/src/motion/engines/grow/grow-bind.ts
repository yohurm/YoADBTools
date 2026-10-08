/**
 * 内容用后高（L4 binder）。
 * 命令式：command() 当拍读锁盒 from、量子盒 to，只写 height px。
 * from = 宿主当前高（插值中即途中高）。to = 槽内 `data-grow-used`，否则第一子盒。
 * 行程走 Web Animations。输入任务里 Animation.startTime 可能为 null，当拍绑 document.timeline。
 * 行程中再 command 取消当前动画、从途中改目标。锁盒不解。禁止 hold / rAF / 观察插值盒。
 */
import { MotionEasing, MotionSpec, motionSpecMs, type MotionSpecName } from "../../../tokens/motion";
import { GROW_SPEC, PRESENCE_EXIT_SAFETY_MS } from "../../spec/recipes";
import { shouldSkipMotion } from "../../reduced";
import { resolveGrow } from "./grow-model";
import { GROW_USED_ATTR, growHostAttrs } from "./grow-policy";

export interface GrowHost {
  enabled: () => boolean;
  spec?: () => MotionSpecName;
  onTraveling?: (traveling: boolean) => void;
}

export interface GrowController {
  snapshot(): void;
  command(): void;
  dispose(): void;
}

function growNodeHeight(node: Element | null): number | undefined {
  return node instanceof HTMLElement ? node.offsetHeight : undefined;
}

/** 内容用后高。不解宿主。优先量标记盒，避免铬铺满锁行后把 to 写成 from。 */
export function measureGrowUsed(el: HTMLElement): number {
  const slot = el.firstElementChild;
  if (!(slot instanceof HTMLElement)) return 0;
  const marked = growNodeHeight(slot.querySelector(`[${GROW_USED_ATTR}]`));
  if (marked !== undefined) return marked;
  return growNodeHeight(slot.firstElementChild) ?? 0;
}

/** 锁盒当前高。插值中是途中值，不是行程起点。 */
export function readGrowLock(el: HTMLElement): number {
  return el.offsetHeight;
}

function growCssPx(value: number): string {
  return `${value}px`;
}

function growKept(primary: number, fallback: number): number {
  return primary > 0 ? primary : fallback;
}

function growNextId(current: number): number {
  return current + 1;
}

export function bindGrow(el: HTMLElement, host: GrowHost): GrowController {
  let prev = 0;
  let safety = 0;
  let trip = false;
  let tripTo = 0;
  let tripId = 0;
  let anim: Animation | undefined;

  const notifyTrip = (next: boolean): void => {
    if (trip === next) return;
    trip = next;
    host.onTraveling?.(next);
  };

  const writeHeight = (px: number): void => {
    el.style.height = growCssPx(px);
  };

  const markUsed = (used: boolean): void => {
    if (used) {
      el.setAttribute("data-grow", growHostAttrs()["data-grow"]);
      notifyTrip(true);
      return;
    }
    el.removeAttribute("data-grow");
    notifyTrip(false);
  };

  const ready = (): void => {
    if (!el.hasAttribute("data-ready")) el.setAttribute("data-ready", "");
  };

  const stopAnim = (): void => {
    if (!anim) return;
    anim.cancel();
    anim = undefined;
  };

  const lock = (used: number): void => {
    stopAnim();
    markUsed(false);
    if (used > 0) writeHeight(used);
    ready();
    prev = used;
  };

  function growSettle(used: number): void {
    tripTo = 0;
    lock(used);
  }

  const clearSafety = (): void => {
    if (safety === 0) return;
    window.clearTimeout(safety);
    safety = 0;
  };

  const finish = (id: number): void => {
    if (id !== tripId) return;
    clearSafety();
    growSettle(growKept(tripTo, prev));
  };

  const snapshot = (): void => {
    notifyTrip(true);
  };

  const command = (): void => {
    if (!host.enabled()) {
      notifyTrip(false);
      return;
    }
    if (shouldSkipMotion()) {
      growSettle(measureGrowUsed(el));
      return;
    }
    const from = readGrowLock(el) || prev;
    const to = measureGrowUsed(el);
    const next = resolveGrow(from, to);
    if (!next) {
      growSettle(growKept(to, from));
      return;
    }
    tripId = growNextId(tripId);
    const id = tripId;
    tripTo = next.to;
    ready();
    stopAnim();
    el.getAnimations().forEach((running) => running.cancel());
    const spec = host.spec?.() ?? GROW_SPEC;
    const easing = MotionEasing[MotionSpec[spec].easing];
    anim = el.animate([{ height: growCssPx(next.from) }, { height: growCssPx(next.to) }], {
      duration: motionSpecMs(spec),
      easing,
      fill: "forwards",
    });
    const timeline = document.timeline?.currentTime;
    if (anim.startTime === null && typeof timeline === "number") {
      anim.startTime = timeline;
    }
    markUsed(true);
    const done = (): void => finish(id);
    anim.addEventListener("finish", done);
    clearSafety();
    safety = window.setTimeout(done, motionSpecMs(spec) + PRESENCE_EXIT_SAFETY_MS);
  };

  return {
    snapshot,
    command,
    dispose: () => {
      tripId = growNextId(tripId);
      clearSafety();
      stopAnim();
    },
  };
}
