/**
 * YoReorderList —— 变高列表换位（L4 视图）。
 * 非整虚拟化；行高跟内容。整行按住过臂距后浮层 / 占位 / 让位 / 插缝。
 * 禁止常驻手柄。几何走 L2 行盒；定高清单仍走 YoVirtualList.onReorder。
 * frame = Port.view()，内容坐标在闭包算完再注入。overlay 挂 Port.plane()。
 * 无 Port 不量盒。滚轮单源 YoScroller。行 tabIndex=-1，点行 focus({preventScroll})。
 */
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { Accessor, Component, JSX } from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
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
  return [...host.querySelectorAll<HTMLElement>(".yohu-reorder-list__row")].map((el) => {
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
          <For each={props.items()}>
            {(item, index) => {
              const key = () => keyOf(item, index());
              return (
                <div
                  class="yohu-reorder-list__row"
                  data-key={key()}
                  data-reorder={drag()?.key === key() ? "source" : undefined}
                  tabIndex={-1}
                  style={{
                    transform:
                      drag() && drag()!.from !== index()
                        ? `translateY(${shiftPxForReorder(index(), drag()!.from, reorder.previewDest(), sourceHeight())}px)`
                        : undefined,
                  }}
                  onPointerDown={(event) => handlePointerDown(index(), key(), event)}
                  onKeyDown={(event) => handleKeyDown(index(), event)}
                >
                  <Dynamic component={props.renderRow} item={item} index={index()} />
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
