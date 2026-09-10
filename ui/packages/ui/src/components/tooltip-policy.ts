/**
 * 气泡提示策略（L3）。
 * 密集提示共享一个 popup（Unique 槽），不是每处一棵 Portal。
 * 延迟只收 MotionSpec 名；定时器代际在 destroy 后丢弃。
 */

import type { Accessor } from "solid-js";
import { createSignal } from "solid-js";

import { motionSpecMs, type MotionSpecName } from "../tokens/motion";
import { DEFAULT_TOOLTIP_DELAY, DEFAULT_TOOLTIP_HIDE_DELAY, tooltipIsEmpty } from "./tooltip-model";

export interface TooltipTriggerBox {
  top: number;
  left: number;
  bottom: number;
  width: number;
  height: number;
}

export interface TooltipSession {
  id: string;
  content: string;
  trigger: TooltipTriggerBox;
}

export interface TooltipUnique {
  session: Accessor<TooltipSession | null>;
  requestShow: (tip: TooltipSession, delay?: MotionSpecName) => void;
  requestHide: (id: string, delay?: MotionSpecName) => void;
  dismiss: () => void;
  destroy: () => void;
}

export function resolveTooltipDelay(name?: MotionSpecName): MotionSpecName {
  return name ?? DEFAULT_TOOLTIP_DELAY;
}

export function tooltipCanShow(disabled: boolean | undefined, content: unknown): boolean {
  return !disabled && !tooltipIsEmpty(content);
}

export type TooltipInputModality = "pointer" | "keyboard";

let inputModality: TooltipInputModality = "pointer";

export function tooltipNoteInput(kind: TooltipInputModality): void {
  inputModality = kind;
}

export function tooltipInputModality(): TooltipInputModality {
  return inputModality;
}

/** 焦点出示只认键盘模态。点击后对话框程序首焦仍是 pointer，不得当悬停。 */
export function tooltipCanShowOnFocus(): boolean {
  return inputModality === "keyboard";
}

export function bindTooltipInputModality(doc: Document = document): () => void {
  const onPointer = (): void => {
    inputModality = "pointer";
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta") return;
    inputModality = "keyboard";
  };
  doc.addEventListener("pointerdown", onPointer, true);
  doc.addEventListener("keydown", onKey, true);
  return () => {
    doc.removeEventListener("pointerdown", onPointer, true);
    doc.removeEventListener("keydown", onKey, true);
  };
}

export function createTooltipUnique(): TooltipUnique {
  const [session, setSession] = createSignal<TooltipSession | null>(null);
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let destroyed = false;

  const clearTimers = (): void => {
    if (showTimer !== undefined) {
      clearTimeout(showTimer);
      showTimer = undefined;
    }
    if (hideTimer !== undefined) {
      clearTimeout(hideTimer);
      hideTimer = undefined;
    }
  };

  const requireAlive = (): boolean => !destroyed;

  const dismiss = (): void => {
    if (!requireAlive()) return;
    generation += 1;
    clearTimers();
    setSession(null);
  };

  const requestShow = (tip: TooltipSession, delay?: MotionSpecName): void => {
    if (!requireAlive()) return;
    if (hideTimer !== undefined) {
      clearTimeout(hideTimer);
      hideTimer = undefined;
    }
    const current = session();
    if (current) {
      generation += 1;
      if (showTimer !== undefined) {
        clearTimeout(showTimer);
        showTimer = undefined;
      }
      setSession(tip);
      return;
    }
    generation += 1;
    const gen = generation;
    const ms = motionSpecMs(resolveTooltipDelay(delay));
    if (showTimer !== undefined) clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      if (destroyed || gen !== generation) return;
      showTimer = undefined;
      setSession(tip);
    }, ms);
  };

  const requestHide = (id: string, delay?: MotionSpecName): void => {
    if (!requireAlive()) return;
    if (showTimer !== undefined) {
      clearTimeout(showTimer);
      showTimer = undefined;
    }
    const current = session();
    if (current && current.id !== id) return;
    generation += 1;
    const gen = generation;
    const ms = motionSpecMs(delay ?? DEFAULT_TOOLTIP_HIDE_DELAY);
    if (hideTimer !== undefined) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (destroyed || gen !== generation) return;
      hideTimer = undefined;
      const live = session();
      if (live && live.id === id) setSession(null);
    }, ms);
  };

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    generation += 1;
    clearTimers();
    setSession(null);
  };

  return { session, requestShow, requestHide, dismiss, destroy };
}

/** 缺省 Unique 槽。Host 挂到树上才画；测试可 createTooltipUnique 隔离。 */
export const tooltipUnique = createTooltipUnique();

/** 模态入栈卸缺省 Unique。Host 无独立槽时与生产同一槽。 */
export function dismissTooltipOverlay(): void {
  tooltipUnique.dismiss();
}
