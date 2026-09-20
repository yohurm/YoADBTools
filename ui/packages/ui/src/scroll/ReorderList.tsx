/**
 * YoReorderList —— 变高列表换位（L4 视图）。
 * 非整虚拟化；行高跟内容。整行按住过臂距后浮层 / 占位 / 让位 / 插缝。
 * 禁止常驻手柄。几何走 L2 行盒；定高清单仍走 YoVirtualList.onReorder。
 * frame = Port.view()，内容坐标在闭包算完再注入。overlay 挂 Port.plane()。
 * 无 Port 不量盒。滚轮单源 YoScroller。行 tabIndex=-1，点行 focus({preventScroll})。
 * 增删与参数描述同一套 reconcile + 配方 list；Presence 在行内，translateY 留在行宿主，避免 clip 吃让位。
 */
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { Accessor, Component, JSX } from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
import { YoPresence, useListPresenceSlots } from "../motion/engines/presence";
import { ReorderBar } from "./ReorderBar";
import { ReorderOverlay } from "./ReorderOverlay";
import { createReorderBinder } from "./reorder-binder";
import {
  contentTopInViewport,
  insertIndexFromRowBoxes,
  overlayOffset,
  pointerContentY,
  reorderBarOffsetFromBoxes,
  reorderRowKey,
  shiftPxForReorder,
  type ReorderRowBox,
} from "./reorder-model";
import { applyReorderKey, shouldBeginReorderFromTarget } from "./reorder-policy";
import { useScrollerPort } from "./scroller-port";
import "./ReorderList.css";

export interface YoReorderListProps<T> {
  items: Accessor<T[]>;
  getItemKey?: (item: T, index: number) => string | number;
  renderRow: Component<{ item: T; index: number }>;
  onReorder: (from: number, to: number) => void;
  ariaLabel?: string;
}

function readRowBoxes(host: HTMLElement, view: HTMLElement, scrollTop: number): ReorderRowBox[] {
  const viewTop = view.getBoundingClientRect().top;
  return [...host.querySelectorAll<HTMLElement>(".yohu-reorder-list__row:not([data-exiting])")].map((el) => {
    const box = el.getBoundingClientRect();
    return { top: pointerContentY(viewTop, scrollTop, box.top), height: box.height };
  });
}

export function YoReorderList<T>(props: YoReorderListProps<T>): JSX.Element {
  const [barReady, setBarReady] = createSignal(false);
  const port = useScrollerPort();
  let container: HTMLDivElement | undefined;
  let boxes: ReorderRowBox[] = [];

  const keyOf = (item: T, index: number): string | number => reorderRowKey(item, index, props.getItemKey);
  const { slots, dismiss } = useListPresenceSlots<T>({
    items: () => props.items(),
    keyOf: (item, index) => String(keyOf(item, index)),
  });

  const liveIndexOf = (key: string): number =>
    props.items().findIndex((item, index) => String(keyOf(item, index)) === key);

  const reorder = createReorderBinder({
    enabled: () => true,
    count: () => props.items().length,
    captureEl: () => container,
    acceptTarget: (event) => shouldBeginReorderFromTarget(event.target),
    layout: (from) => {
      if (!container || !port) return null;
      const view = port.view();
      if (!view) return null;
      const viewTop = view.getBoundingClientRect().top;
      const scrollTop = port.scrollTop();
      const current = boxes.length > 0 ? boxes : readRowBoxes(container, view, scrollTop);
      const source = current[from];
      if (!source) return null;
      return {
        listTop: viewTop,
        viewportHeight: port.clientHeight(),
        sourceTop: contentTopInViewport(viewTop, scrollTop, source.top),
        sourceHeight: source.height,
        insertIndex: (clientY) =>
          insertIndexFromRowBoxes(current, pointerContentY(viewTop, scrollTop, clientY)),
        barOffset: (insert) => reorderBarOffsetFromBoxes(current, insert),
      };
    },
    overlayOffset,
    onCommit: (from, to) => props.onReorder(from, to),
  });

  const snapshotBoxes = (): void => {
    if (!container || !port) return;
    const view = port.view();
    if (!view) return;
    boxes = readRowBoxes(container, view, port.scrollTop());
  };

  const handlePointerDown = (index: number, key: string | number, event: PointerEvent): void => {
    if (shouldBeginReorderFromTarget(event.target)) {
      (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    }
    snapshotBoxes();
    reorder.onPointerDown(index, key, event);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent): void => {
    const moved = applyReorderKey(event.key, event.ctrlKey || event.metaKey, index, props.items().length);
    if (moved === "noop" || moved === null) return;
    event.preventDefault();
    props.onReorder(moved.from, moved.to);
  };

  onMount(() => {
    onCleanup(() => reorder.destroy());
    if (typeof requestAnimationFrame === "function") {
      const readyFrame = requestAnimationFrame(() => setBarReady(true));
      onCleanup(() => cancelAnimationFrame(readyFrame));
    } else {
      setBarReady(true);
    }
  });

  const drag = createMemo(() => reorder.session());
  const sourceHeight = (): number => reorder.overlayHeight();

  return (
    <>
      <div
        ref={(el) => {
          container = el;
        }}
        class="yohu-reorder-list"
        data-reordering={drag() ? "" : undefined}
        aria-label={props.ariaLabel}
      >
        <div class="yohu-reorder-list__inner">
          <ReorderBar open={drag() !== null && !reorder.isHome()} y={reorder.barY()} ready={barReady()} />
          <For each={slots}>
            {(slot) => {
              const liveIndex = (): number => liveIndexOf(slot.key);
              const rowIndex = (): number => {
                const live = liveIndex();
                return live >= 0 ? live : slots.findIndex((entry) => entry.key === slot.key);
              };
              return (
                <div
                  class="yohu-reorder-list__row"
                  data-key={slot.key}
                  data-exiting={slot.present ? undefined : ""}
                  data-reorder={slot.present && drag()?.key === slot.key ? "source" : undefined}
                  tabIndex={slot.present ? -1 : undefined}
                  style={{
                    transform:
                      slot.present && drag() && drag()!.from !== liveIndex()
                        ? `translateY(${shiftPxForReorder(liveIndex(), drag()!.from, reorder.previewDest(), sourceHeight())}px)`
                        : undefined,
                  }}
                  onPointerDown={(event) => {
                    if (!slot.present || liveIndex() < 0) return;
                    handlePointerDown(liveIndex(), slot.key, event);
                  }}
                  onKeyDown={(event) => {
                    if (!slot.present || liveIndex() < 0) return;
                    handleKeyDown(liveIndex(), event);
                  }}
                >
                  <YoPresence
                    when={slot.present}
                    recipe="list"
                    onExitComplete={() => dismiss(slot.key)}
                  >
                    <Dynamic component={props.renderRow} item={slot.item} index={rowIndex()} />
                  </YoPresence>
                </div>
              );
            }}
          </For>
        </div>
      </div>
      <Show when={drag()}>
        {(current) => {
          const item = (): T | undefined => props.items()[current().from];
          return (
            <Show when={item()}>
              {(dragged) =>
                port ? (
                  <Portal mount={port.plane()}>
                    <ReorderOverlay
                      open
                      ready={barReady()}
                      y={reorder.overlayY()}
                      height={sourceHeight()}
                    >
                      <Dynamic component={props.renderRow} item={dragged()} index={current().from} />
                    </ReorderOverlay>
                  </Portal>
                ) : null
              }
            </Show>
          );
        }}
      </Show>
    </>
  );
}
