/**
 * YoReorderList —— 变高列表换位（L4 视图）。
 * 非整虚拟化；行高跟内容。整行按住过臂距后浮层 / 占位 / 让位 / 插缝。
 * 禁止常驻手柄。几何走 L2 行盒；定高清单仍走 YoVirtualList.onReorder。
 */
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { Accessor, Component, JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { ReorderBar } from "./ReorderBar";
import { ReorderOverlay } from "./ReorderOverlay";
import { createReorderBinder } from "./reorder-binder";
import {
  insertIndexFromRowBoxes,
  overlayOffset,
  pointerContentY,
  reorderBarOffsetFromBoxes,
  reorderRowKey,
  shiftPxForReorder,
  type ReorderRowBox,
} from "./reorder-model";
import { applyReorderKey, shouldBeginReorderFromTarget } from "./reorder-policy";
import "./ReorderList.css";

export interface YoReorderListProps<T> {
  items: Accessor<T[]>;
  getItemKey?: (item: T, index: number) => string | number;
  renderRow: Component<{ item: T; index: number }>;
  onReorder: (from: number, to: number) => void;
  ariaLabel?: string;
}

function readRowBoxes(host: HTMLElement): ReorderRowBox[] {
  const frame = host.getBoundingClientRect();
  return [...host.querySelectorAll<HTMLElement>(".yohu-reorder-list__row")].map((el) => {
    const box = el.getBoundingClientRect();
    return { top: box.top - frame.top + host.scrollTop, height: box.height };
  });
}

export function YoReorderList<T>(props: YoReorderListProps<T>): JSX.Element {
  const [barReady, setBarReady] = createSignal(false);
  let container: HTMLDivElement | undefined;
  let boxes: ReorderRowBox[] = [];

  const keyOf = (item: T, index: number): string | number => reorderRowKey(item, index, props.getItemKey);

  const reorder = createReorderBinder({
    enabled: () => true,
    count: () => props.items().length,
    captureEl: () => container,
    acceptTarget: (event) => shouldBeginReorderFromTarget(event.target),
    layout: (from) => {
      if (!container) return null;
      const frame = container.getBoundingClientRect();
      const source = boxes[from] ?? readRowBoxes(container)[from];
      if (!source) return null;
      const current = boxes.length > 0 ? boxes : readRowBoxes(container);
      return {
        listTop: frame.top,
        scrollTop: container.scrollTop,
        viewportHeight: container.clientHeight,
        sourceTop: frame.top + source.top - container.scrollTop,
        sourceHeight: source.height,
        insertIndex: (clientY) =>
          insertIndexFromRowBoxes(current, pointerContentY(frame.top, container!.scrollTop, clientY)),
        barOffset: (insert) => reorderBarOffsetFromBoxes(current, insert),
      };
    },
    overlayOffset,
    onCommit: (from, to) => props.onReorder(from, to),
  });

  const snapshotBoxes = (): void => {
    if (!container) return;
    boxes = readRowBoxes(container);
  };

  const handlePointerDown = (index: number, key: string | number, event: PointerEvent): void => {
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
                tabIndex={0}
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
      <Show when={drag()}>
        {(current) => {
          const item = (): T | undefined => props.items()[current().from];
          return (
            <Show when={item()}>
              {(dragged) => (
                <ReorderOverlay
                  open
                  ready={barReady()}
                  y={reorder.overlayY()}
                  height={sourceHeight()}
                >
                  <Dynamic component={props.renderRow} item={dragged()} index={current().from} />
                </ReorderOverlay>
              )}
            </Show>
          );
        }}
      </Show>
    </div>
  );
}
