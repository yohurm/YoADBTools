/**
 * 换位指针会话（L3 开合 + L4 窗口监听对称释放）。
 * 几何由调用方注入：定高 VirtualList 与变高 YoReorderList 共用一套动词。
 * destroy 卸监听，幂等。不画铬。
 */

import { createSignal, type Accessor } from "solid-js";
import { isReorderArmed, type ReorderSession } from "./reorder-model";
import {
  beginReorderSession,
  commitReorderSession,
  isHomeInsert,
  moveReorderSession,
  previewDest,
  shouldAcceptReorderPointer,
  shouldCancelReorder,
} from "./reorder-policy";

export interface ReorderPointerLayout {
  listTop: number;
  scrollTop: number;
  viewportHeight: number;
  sourceTop: number;
  sourceHeight: number;
  insertIndex: (clientY: number) => number;
  barOffset: (insert: number) => number;
}

export interface ReorderBinder {
  session: Accessor<ReorderSession | null>;
  barY: Accessor<number>;
  overlayY: Accessor<number>;
  overlayHeight: Accessor<number>;
  previewDest: Accessor<number>;
  isHome: Accessor<boolean>;
  onPointerDown: (index: number, key: string | number, event: PointerEvent) => void;
  consumeClick: () => boolean;
  destroy: () => void;
}

export function createReorderBinder(input: {
  enabled: () => boolean;
  count: () => number;
  layout: (from: number) => ReorderPointerLayout | null;
  overlayOffset: (
    clientY: number,
    listTop: number,
    grabOffset: number,
    height: number,
    viewportHeight: number,
  ) => number;
  onCommit: (from: number, to: number) => void;
  onArmed?: (from: number, key: string | number) => void;
  captureEl?: () => HTMLElement | undefined;
  acceptTarget?: (event: PointerEvent) => boolean;
}): ReorderBinder {
  const [session, setSession] = createSignal<ReorderSession | null>(null);
  const [barY, setBarY] = createSignal(0);
  const [overlayY, setOverlayY] = createSignal(0);
  const [overlayHeight, setOverlayHeight] = createSignal(0);

  let pending: { pointerId: number; from: number; key: string | number; startY: number } | null = null;
  let grabOffset = 0;
  let suppressClick = false;
  let captureId: number | null = null;

  const unbind = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    window.removeEventListener("keydown", onKey, true);
  };

  const releaseCapture = (): void => {
    const el = input.captureEl?.();
    const id = captureId;
    captureId = null;
    if (el && id !== null) el.releasePointerCapture(id);
  };

  const apply = (current: ReorderSession, clientY: number): void => {
    const layout = input.layout(current.from);
    if (!layout) return;
    const moved = moveReorderSession(current, layout.insertIndex(clientY));
    setSession(moved);
    setBarY(layout.barOffset(moved.insert));
    setOverlayHeight(layout.sourceHeight);
    setOverlayY(
      input.overlayOffset(clientY, layout.listTop, grabOffset, layout.sourceHeight, layout.viewportHeight),
    );
  };

  const end = (commit: boolean): void => {
    const current = session();
    const held = pending;
    pending = null;
    setSession(null);
    unbind();
    if (held) releaseCapture();
    if (!commit || !current) return;
    const result = commitReorderSession(current);
    if (result) input.onCommit(result.from, result.to);
  };

  const onMove = (event: PointerEvent): void => {
    if (!pending || event.pointerId !== pending.pointerId) return;
    let current = session();
    if (!current) {
      if (!isReorderArmed(pending.startY, event.clientY)) return;
      const layout = input.layout(pending.from);
      if (!layout) return;
      grabOffset = pending.startY - layout.sourceTop;
      setOverlayHeight(layout.sourceHeight);
      const el = input.captureEl?.();
      if (el) {
        el.setPointerCapture(event.pointerId);
        captureId = event.pointerId;
      }
      current = beginReorderSession(pending.from, pending.key);
      setSession(current);
      suppressClick = true;
      input.onArmed?.(pending.from, pending.key);
    }
    apply(current, event.clientY);
  };

  const onUp = (event: PointerEvent): void => {
    if (!pending || event.pointerId !== pending.pointerId) return;
    end(true);
  };

  const onKey = (event: KeyboardEvent): void => {
    if (!session() || !shouldCancelReorder(event.key)) return;
    event.preventDefault();
    end(false);
  };

  const onPointerDown = (index: number, key: string | number, event: PointerEvent): void => {
    if (!input.enabled()) return;
    if (!shouldAcceptReorderPointer(event.button, input.count())) return;
    if (input.acceptTarget && !input.acceptTarget(event)) return;
    pending = { pointerId: event.pointerId, from: index, key, startY: event.clientY };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey, true);
  };

  const consumeClick = (): boolean => {
    if (!suppressClick) return false;
    suppressClick = false;
    return true;
  };

  const destroy = (): void => {
    unbind();
    pending = null;
    suppressClick = false;
    grabOffset = 0;
    releaseCapture();
    setSession(null);
  };

  return {
    session,
    barY,
    overlayY,
    overlayHeight,
    previewDest: () => {
      const current = session();
      return current ? previewDest(current) : 0;
    },
    isHome: () => {
      const current = session();
      return current ? isHomeInsert(current) : true;
    },
    onPointerDown,
    consumeClick,
    destroy,
  };
}
