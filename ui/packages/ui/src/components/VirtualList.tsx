/**
 * YoVirtualList —— 定高行虚拟列表（L4 视图）。
 * HarmonyOS 对照：长列表虚拟化；背板透明贴合 canvas，行选中走 --yohu-state-*。
 * 受控 API：items / selectedKey / onSelectRow / itemHeight / overscan。
 *
 * 泛型组件：外层滚动容器占满父高，内部以总高度撑起滚动区，
 * 仅绝对定位渲染可见行（含 overscan 缓冲），底部自动跟随滚动。
 * For 按 getItemKey 的原始值做身份（对照 Solid 文档：For 按 value identity）。
 * 禁止把每次新建的 {index,item,key} 包装对象交给 For，否则行重挂、原生 Selection 被清掉。
 *
 * 选择模式：传入 `selectedKey` + `onSelectRow` 时开启单选——
 * roving tabindex、↑/↓/Home/End 移动、Enter/Space 选中、目标行滚入视野并聚焦、
 * `role=listbox/option` + `aria-selected`（对齐 UI设计系统-v6.md §5）。
 * 多选（`selectedKeys`）时按邻接关系挂 `--sel-start/mid/end`，连续选中合成一块圆角。
 * 单选高亮由 YoIndicator 按下标滑动（行本身无 transition）；多选 ≥2 退回每项 ::before。
 * `onReorder` 开启整行按住拖动换位：过臂距后浮层跟指针、源行占位、邻行让位、缝上插条；松手提交 from/to。
 * 未开启选择模式时行不参与焦点序列（日志列表性能优先）。
 * 行铬 `tone` 默认 document（无分割线）；文件清单显式 list。
 *
 * 注意：`itemHeight` / `overscan` / `rowHeight` 为功能性配置项（非主题 token），
 * 由调用方指定，仅用于定位计算；所有配色/字号/间距仍走 tokens。
 */
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { Accessor, JSX } from "solid-js";
import { YoIndicator } from "../motion/indicator";
import type { IndicatorBox } from "../motion/indicator-layout";
import { ReorderBar } from "./ReorderBar";
import { ReorderOverlay } from "./ReorderOverlay";
import {
  insertIndexFromPointerY,
  isReorderArmed,
  overlayOffset,
  reorderBarOffset,
  rowReorderShift,
  rowTopInViewport,
  type ReorderSession,
} from "./reorder-model";
import {
  beginReorderSession,
  canReorderList,
  commitReorderSession,
  isHomeInsert,
  moveReorderSession,
  previewDest,
  resolveReorderKeyDelta,
  shouldAcceptReorderPointer,
  shouldCancelReorder,
} from "./reorder-policy";
import {
  VIRTUAL_DEFAULT_ITEM_HEIGHT,
  VIRTUAL_DEFAULT_OVERSCAN,
  VIRTUAL_FOCUS_RETRY_LIMIT,
  isStuckToBottom,
  isVirtualMulti,
  isVirtualRowSelected,
  isVirtualSelectable,
  isVirtualSelectionEmpty,
  virtualAdjacentSelected,
  virtualIndicatorAnchor,
  virtualIndicatorFollow,
  virtualIndexOfKey,
  virtualRange,
  virtualRowKey,
  virtualRowTop,
  virtualTotalHeight,
  virtualVisibleKeys,
  virtualVisibleRows,
} from "./virtuallist-model";
import {
  isPendingFocusAdopted,
  resolveVirtualListKeyAction,
  shouldEmitAtBottom,
  virtualHostAttrs,
  virtualRowAttrs,
} from "./virtuallist-policy";
import "./VirtualList.css";

export type YoVirtualListTone = "document" | "list";

export interface YoVirtualListProps<T> {
  /** 数据源（响应式访问器） */
  items: Accessor<T[]>;
  /** 行高（px），默认 22 */
  itemHeight?: number;
  /** 可视区外的预渲染行数，默认 10 */
  overscan?: number;
  /** 行 key（用于稳定定位与测试），默认取 index */
  getItemKey?: (item: T, index: number) => string | number;
  /** 行渲染函数 */
  renderRow: (item: T, index: number) => JSX.Element;
  /** 是否自动跟随滚动到底部（响应式访问器） */
  autoScrollToBottom?: Accessor<boolean>;
  /**
   * 贴底状态变化（由实时滚动度量驱动，不是镜像状态）。
   * 离开底部 → false；滚回底部（阈值内）→ true。
   * 程序化滚底不会误报离开。
   */
  onAtBottomChange?: (atBottom: boolean) => void;
  /** 当前选中行 key（提供即开启单选选择模式；null = 未选中） */
  selectedKey?: Accessor<string | number | null>;
  /** 多选 key 集（提供则优先于 selectedKey，listbox 为多选） */
  selectedKeys?: Accessor<ReadonlySet<string | number>>;
  /** 选中变化回调（点击/键盘统一入口；由调用方更新 selectedKey） */
  onSelectRow?: (item: T, key: string | number, event?: MouseEvent | KeyboardEvent) => void;
  /** 行右键（统一交给 openContextMenu，页面不要自挂菜单） */
  onRowContextMenu?: (item: T, key: string | number, event: MouseEvent) => void;
  /** 选择模式下 listbox 的无障碍名称 */
  ariaLabel?: string;
  /**
   * 行铬。默认 document：虚拟化只负责视口，不画格子线。
   * Family B 文件清单显式 tone="list" 才有行间 hairline。
   * 禁止默认画线再让文档列表去关。
   */
  tone?: YoVirtualListTone;
  /**
   * 提供即开启整行按住拖动换位。点选仍走 onSelectRow；按下移动过臂距才抬起浮层。
   * 松手提交 from/to；原槽或 Escape 不回调。键盘 Ctrl/Meta+↑/↓ 同一入口。
   */
  onReorder?: (from: number, to: number) => void;
}

/**
 * 渲染一个定高行虚拟列表。
 */
export function YoVirtualList<T>(props: YoVirtualListProps<T>): JSX.Element {
  const itemHeight = (): number => props.itemHeight ?? VIRTUAL_DEFAULT_ITEM_HEIGHT;
  const overscan = (): number => props.overscan ?? VIRTUAL_DEFAULT_OVERSCAN;

  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(0);
  const [focusTick, setFocusTick] = createSignal(0);
  const [session, setSession] = createSignal<ReorderSession | null>(null);
  const [barY, setBarY] = createSignal(0);
  const [overlayY, setOverlayY] = createSignal(0);
  const [barReady, setBarReady] = createSignal(false);
  let container: HTMLDivElement | undefined;
  let pendingFocusKey: string | number | null = null;
  let focusAttempts = 0;
  let isAutoScrolling = false;
  let autoScrollReset = 0;
  let lastAtBottom = true;
  let pendingReorder:
    | { pointerId: number; from: number; key: string | number; startY: number }
    | null = null;
  let grabOffset = 0;
  let suppressClick = false;

  const selectable = (): boolean =>
    isVirtualSelectable(
      props.selectedKey !== undefined,
      props.selectedKeys !== undefined,
      props.onSelectRow !== undefined,
    );

  const multi = (): boolean => isVirtualMulti(props.selectedKeys !== undefined);

  const selectedKeys = (): ReadonlySet<string | number> | undefined => props.selectedKeys?.();
  const selectedKey = (): string | number | null | undefined => props.selectedKey?.();

  const measureAtBottom = (): boolean => {
    if (!container) return true;
    return isStuckToBottom(container.scrollHeight, container.clientHeight, container.scrollTop);
  };

  const emitAtBottom = (): void => {
    if (!props.onAtBottomChange) return;
    const atBottom = measureAtBottom();
    if (!shouldEmitAtBottom(isAutoScrolling, atBottom, lastAtBottom)) return;
    lastAtBottom = atBottom;
    props.onAtBottomChange(atBottom);
  };

  const snapToBottom = (): void => {
    if (!container) return;
    isAutoScrolling = true;
    container.scrollTop = container.scrollHeight;
    setScrollTop(container.scrollTop);
    if (typeof requestAnimationFrame === "function") {
      if (autoScrollReset !== 0) cancelAnimationFrame(autoScrollReset);
      autoScrollReset = requestAnimationFrame(() => {
        autoScrollReset = 0;
        isAutoScrolling = false;
      });
    } else {
      isAutoScrolling = false;
    }
  };

  const totalHeight = (): number => virtualTotalHeight(props.items().length, itemHeight());

  const visibleRows = () => {
    const items = props.items();
    const range = virtualRange(scrollTop(), viewportHeight(), itemHeight(), items.length, overscan());
    return virtualVisibleRows(items, range.start, range.end, props.getItemKey);
  };

  const visibleKeys = createMemo(() => virtualVisibleKeys(visibleRows()));
  const rowByKey = createMemo(() => {
    const map = new Map<string | number, ReturnType<typeof visibleRows>[number]>();
    for (const row of visibleRows()) {
      map.set(row.key, row);
    }
    return map;
  });

  const findRowElement = (key: string | number): HTMLElement | null => {
    if (!container) return null;
    for (const el of container.querySelectorAll<HTMLElement>(".yohu-virtual-list__row")) {
      if (el.dataset.key === String(key)) return el;
    }
    return null;
  };

  const selectAt = (index: number, event?: MouseEvent | KeyboardEvent): void => {
    const item = props.items()[index];
    if (item === undefined || !props.onSelectRow) return;
    props.onSelectRow(item, virtualRowKey(item, index, props.getItemKey), event);
  };

  const followKey = (): string | undefined =>
    virtualIndicatorFollow(selectable(), selectedKeys(), selectedKey());

  const indicatorAnchor = (): IndicatorBox | null =>
    virtualIndicatorAnchor(props.items(), followKey(), itemHeight(), container?.clientWidth ?? 0, props.getItemKey);

  const rowSnapshot = (row: { index: number; key: string | number }) => {
    const items = props.items();
    const selected = isVirtualRowSelected(row.key, selectable(), selectedKeys(), selectedKey());
    const adjacent = virtualAdjacentSelected(
      items,
      row.index,
      selectable(),
      selectedKeys(),
      selectedKey(),
      props.getItemKey,
    );
    const first = visibleRows()[0];
    return virtualRowAttrs({
      key: row.key,
      selectable: selectable(),
      selected,
      prevSelected: adjacent.prev,
      nextSelected: adjacent.next,
      selectionEmpty: isVirtualSelectionEmpty(selectedKeys(), selectedKey()),
      isFirstVisible: first?.key === row.key,
    });
  };

  const handleRowClick = (index: number, event: MouseEvent): void => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (!selectable()) return;
    pendingFocusKey = null;
    selectAt(index, event);
  };

  const unbindReorderPointer = (): void => {
    window.removeEventListener("pointermove", onReorderPointerMove);
    window.removeEventListener("pointerup", onReorderPointerUp);
    window.removeEventListener("pointercancel", onReorderPointerUp);
    window.removeEventListener("keydown", onReorderKeyDown, true);
  };

  const applyReorderGeometry = (current: ReorderSession, clientY: number): void => {
    if (!container) return;
    const box = container.getBoundingClientRect();
    const height = itemHeight();
    const insert = insertIndexFromPointerY(
      box.top,
      container.scrollTop,
      height,
      props.items().length,
      clientY,
    );
    const moved = moveReorderSession(current, insert);
    setSession(moved);
    setBarY(reorderBarOffset(moved.insert, height));
    setOverlayY(overlayOffset(clientY, box.top, grabOffset, height, container.clientHeight));
  };

  const endReorder = (commit: boolean): void => {
    const current = session();
    const pending = pendingReorder;
    pendingReorder = null;
    setSession(null);
    unbindReorderPointer();
    if (container && pending && typeof container.releasePointerCapture === "function") {
      try {
        container.releasePointerCapture(pending.pointerId);
      } catch {
        /* jsdom */
      }
    }
    if (!commit || !current || !props.onReorder) return;
    const result = commitReorderSession(current);
    if (result) props.onReorder(result.from, result.to);
  };

  const onReorderPointerMove = (event: PointerEvent): void => {
    const pending = pendingReorder;
    if (!pending || event.pointerId !== pending.pointerId) return;
    let current = session();
    if (!current) {
      if (!isReorderArmed(pending.startY, event.clientY)) return;
      if (container && typeof container.setPointerCapture === "function") {
        try {
          container.setPointerCapture(event.pointerId);
        } catch {
          /* jsdom */
        }
      }
      if (container) {
        grabOffset =
          pending.startY -
          rowTopInViewport(container.getBoundingClientRect().top, container.scrollTop, pending.from, itemHeight());
      }
      current = beginReorderSession(pending.from, pending.key);
      setSession(current);
      suppressClick = true;
      if (props.onSelectRow) {
        const item = props.items()[pending.from];
        if (item !== undefined) props.onSelectRow(item, pending.key);
      }
    }
    applyReorderGeometry(current, event.clientY);
  };

  const onReorderPointerUp = (event: PointerEvent): void => {
    const pending = pendingReorder;
    if (!pending || event.pointerId !== pending.pointerId) return;
    endReorder(true);
  };

  const onReorderKeyDown = (event: KeyboardEvent): void => {
    if (!session() || !shouldCancelReorder(event.key)) return;
    event.preventDefault();
    endReorder(false);
  };

  const handleRowPointerDown = (index: number, key: string | number, event: PointerEvent): void => {
    if (!props.onReorder) return;
    if (!shouldAcceptReorderPointer(event.button, props.items().length)) return;
    pendingReorder = { pointerId: event.pointerId, from: index, key, startY: event.clientY };
    window.addEventListener("pointermove", onReorderPointerMove);
    window.addEventListener("pointerup", onReorderPointerUp);
    window.addEventListener("pointercancel", onReorderPointerUp);
    window.addEventListener("keydown", onReorderKeyDown, true);
  };

  const handleRowKeyDown = (index: number, event: KeyboardEvent): void => {
    if (props.onReorder) {
      const delta = resolveReorderKeyDelta(event.key, event.ctrlKey || event.metaKey);
      if (delta !== null) {
        const count = props.items().length;
        if (!canReorderList(count)) return;
        const to = Math.max(0, Math.min(count - 1, index + delta));
        if (to === index) return;
        event.preventDefault();
        props.onReorder(index, to);
        return;
      }
    }
    if (!selectable()) return;
    const action = resolveVirtualListKeyAction(event.key, index, props.items().length);
    if (!action) return;
    event.preventDefault();
    if (action.type === "commit") {
      selectAt(index);
      return;
    }
    if (action.index === index) return;
    const item = props.items()[action.index];
    if (item === undefined) return;
    pendingFocusKey = virtualRowKey(item, action.index, props.getItemKey);
    focusAttempts = 0;
    selectAt(action.index);
  };

  createEffect(() => {
    if (!selectable()) return;
    void focusTick();
    const single = selectedKey() ?? null;
    const keys = selectedKeys() ?? null;
    const pending = pendingFocusKey;
    if (pending === null || !isPendingFocusAdopted(pending, multi(), single, keys)) {
      pendingFocusKey = null;
      return;
    }
    const el = findRowElement(pending);
    if (!el) {
      const index = virtualIndexOfKey(props.items(), pending, props.getItemKey);
      if (!container || index < 0 || focusAttempts >= VIRTUAL_FOCUS_RETRY_LIMIT) {
        pendingFocusKey = null;
        return;
      }
      focusAttempts += 1;
      const top = Math.max(0, virtualRowTop(index, itemHeight()));
      container.scrollTop = top;
      setScrollTop(top);
      setFocusTick((tick) => tick + 1);
      return;
    }
    el.scrollIntoView({ block: "nearest" });
    el.focus();
    pendingFocusKey = null;
  });

  const handleScroll = (): void => {
    if (!container) return;
    setScrollTop(container.scrollTop);
    setViewportHeight(container.clientHeight);
    emitAtBottom();
  };

  onMount(() => {
    if (container) {
      setViewportHeight(container.clientHeight);
      if (props.autoScrollToBottom?.()) {
        snapToBottom();
      }
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(() => {
          if (container) {
            setViewportHeight(container.clientHeight);
            if (props.autoScrollToBottom?.()) snapToBottom();
          }
        });
        observer.observe(container);
        onCleanup(() => observer.disconnect());
      }
    }
    onCleanup(() => {
      unbindReorderPointer();
      pendingReorder = null;
      if (autoScrollReset !== 0 && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(autoScrollReset);
      }
    });
    if (typeof requestAnimationFrame === "function") {
      const readyFrame = requestAnimationFrame(() => setBarReady(true));
      onCleanup(() => cancelAnimationFrame(readyFrame));
    } else {
      setBarReady(true);
    }
  });

  createEffect(() => {
    const length = props.items().length;
    if (container && props.autoScrollToBottom?.() && length >= 0) {
      snapToBottom();
    }
  });

  const host = () =>
    virtualHostAttrs({
      selectable: selectable(),
      multi: multi(),
      tone: props.tone,
      ariaLabel: props.ariaLabel,
      reordering: session() !== null,
    });

  return (
    <div
      ref={(el) => (container = el)}
      class="yohu-virtual-list"
      data-tone={host()["data-tone"]}
      data-reordering={host()["data-reordering"]}
      role={host().role}
      aria-label={host()["aria-label"]}
      aria-multiselectable={host()["aria-multiselectable"]}
      onScroll={handleScroll}
    >
      <div class="yohu-virtual-list__inner" style={{ height: `${totalHeight()}px` }}>
        <Show when={selectable() && session() === null}>
          <YoIndicator follow={followKey()} variant="fill" anchor={indicatorAnchor} />
        </Show>
        <Show when={props.onReorder}>
          <ReorderBar
            open={session() !== null && !isHomeInsert(session()!)}
            y={barY()}
            ready={barReady()}
          />
        </Show>
        <For each={visibleKeys()}>
          {(key) => {
            const row = createMemo(() => rowByKey().get(key));
            const attrs = () => {
              const current = row();
              return current ? rowSnapshot(current) : rowSnapshot({ index: 0, key });
            };
            return (
              <div
                class="yohu-virtual-list__row"
                classList={{
                  "yohu-interactive": attrs().interactive,
                  "yohu-interactive--selected": attrs().selected,
                  "yohu-interactive--sel-start": attrs().selStart,
                  "yohu-interactive--sel-mid": attrs().selMid,
                  "yohu-interactive--sel-end": attrs().selEnd,
                  "yohu-focus-ring--inset": attrs().interactive,
                }}
                style={{
                  position: "absolute",
                  top: `${virtualRowTop(row()?.index ?? 0, itemHeight())}px`,
                  left: "0",
                  right: "0",
                  height: `${itemHeight()}px`,
                  transform: (() => {
                    const current = session();
                    const index = row()?.index ?? 0;
                    if (!current) return undefined;
                    const shift = rowReorderShift(index, current.from, previewDest(current));
                    return shift === 0 ? undefined : `translateY(${shift * itemHeight()}px)`;
                  })(),
                }}
                data-key={attrs()["data-key"]}
                data-reorder={session()?.key === key ? "source" : undefined}
                role={attrs().role}
                aria-selected={attrs()["aria-selected"]}
                tabIndex={attrs().tabIndex}
                onPointerDown={(event) => {
                  const current = row();
                  if (current) handleRowPointerDown(current.index, current.key, event);
                }}
                onClick={(event) => {
                  const current = row();
                  if (current) handleRowClick(current.index, event);
                }}
                onContextMenu={(event) => {
                  const current = row();
                  if (!current || !props.onRowContextMenu) return;
                  event.preventDefault();
                  event.stopPropagation();
                  props.onRowContextMenu(current.item, current.key, event);
                }}
                onKeyDown={(event) => {
                  const current = row();
                  if (current) handleRowKeyDown(current.index, event);
                }}
              >
                <Show when={row()?.item} keyed>
                  {(item) => props.renderRow(item, row()!.index)}
                </Show>
              </div>
            );
          }}
        </For>
      </div>
      <Show when={session()}>
        {(current) => {
          const item = (): T | undefined => props.items()[current().from];
          return (
            <Show when={item()}>
              {(dragged) => (
                <ReorderOverlay
                  open
                  ready={barReady()}
                  y={overlayY()}
                  height={itemHeight()}
                >
                  {props.renderRow(dragged(), current().from)}
                </ReorderOverlay>
              )}
            </Show>
          );
        }}
      </Show>
    </div>
  );
}
