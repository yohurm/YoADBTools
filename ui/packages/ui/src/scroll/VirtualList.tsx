/**
 * YoVirtualList —— 定高行虚拟列表（L4 视图）。
 * 只做槽位池、滚动、选区与换位。行盒铬走独立模块 list-row（YoListRow）。
 * HarmonyOS 对照：长列表虚拟化；背板透明贴合 canvas。
 *
 * 泛型组件：`.yohu-virtual-list` 只裁切；纵滚与产品条内组合 YoScroller
 *（视口 overflow hidden，滚轮改 scrollTop）。`__inner` 只撑总高。
 * 与 YoColFrame 表头共用视口：溢出让出侧轨，禁止 scrollbar-gutter。
 * fill / 投放框宽走视口内容盒（clientWidth 减 gutter padding），不进侧轨。
 * 总高变化后 handle.sync() 再量侧轨，过滤变短必须收回 gutter。
 * For 身份只有槽位 0..poolSize-1。几何走 virtualRowBoxStyle 写进 inline
 *（absolute + translate3d）。行宿主是 YoListRow，不挂 yohu-interactive / focus-ring。
 * 滚动改 transform / data-key / 行 props，不拆行节点。
 * renderRow 是 Component<{item, index}>：同一组件实例就地换绑。禁止函数快照返回新 JSX
 *（Solid 会当新树卸载，文件行 ColTrack 整行重挂，WebView2 闪白）。
 * 禁止按文件名 / seq 把进出窗口的行交给 For。
 *
 * 选择模式：传入 `selectedKey` + `onSelectRow` 时开启单选——
 * roving tabindex、↑/↓/Home/End 移动、Enter/Space 选中、目标行滚入视野并聚焦、
 * `role=listbox/option` + `aria-selected`（对齐 UI设计系统-v6.md §5）。
 * tone=list 行自绘选中底；投放框是 list-frame 叠加层；document 单选才挂 YoIndicator fill。
 * fill 滑块 decorate=false，用 top/left 落在 inner 内容坐标；禁止把 yohu-indicator-host
 * 打在滚轴或超高 inner 上（fill 宿主 overflow:hidden 会吃掉纵滚 / 撑出合成层）。
 * 选中行指针热态写 data-indicator-hot，填色在 indicator.css，禁止 :has list-row。
 * `onReorder` 开启整行按住拖动换位：过臂距后浮层跟指针、源行占位、邻行让位、缝上插条；松手提交 from/to。
 * 未开启选择模式时行不参与焦点序列（日志列表性能优先）。槽位回收时原生 Selection 不跨原点保留。
 * `tone` 默认 document（无分割线）；文件清单显式 list。`hotKey` 是行热态，不是模块 class。
 *
 * 注意：`itemHeight` / `overscan` / `rowHeight` 为功能性配置项（非主题 token），
 * 由调用方指定，仅用于定位计算；所有配色/字号/间距仍走 tokens。
 */
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { Accessor, Component, JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { YoListFrame, listFrameBox } from "../list-frame";
import { YoListRow, isListRowHot, listRowOwnsFill } from "../list-row";
import { YoIndicator } from "../motion/engines/indicator";
import type { IndicatorBox } from "../motion/engines/indicator";
import { ReorderBar } from "./ReorderBar";
import { ReorderOverlay } from "./ReorderOverlay";
import { createReorderBinder } from "./reorder-binder";
import {
  insertIndexFromPointerY,
  overlayOffset,
  reorderBarOffset,
  rowTopInViewport,
  shiftForReorder,
} from "./reorder-model";
import { applyReorderKey, previewDest } from "./reorder-policy";
import { YoScroller, type YoScrollerHandle } from "./Scroller";
import {
  VIRTUAL_DEFAULT_ITEM_HEIGHT,
  VIRTUAL_DEFAULT_OVERSCAN,
  VIRTUAL_FOCUS_RETRY_LIMIT,
  isStuckToBottom,
  isVirtualMulti,
  isVirtualRowSelected,
  isVirtualSelectable,
  isVirtualSelectionEmpty,
  virtualActiveKey,
  virtualContentWidth,
  virtualInnerWidth,
  virtualIndicatorAnchor,
  virtualIndicatorBox,
  virtualIndicatorFollow,
  virtualIndexOfKey,
  virtualNearestScrollTop,
  virtualPoolIndex,
  virtualPoolOrigin,
  virtualPoolSize,
  virtualPoolSlots,
  virtualRowBoxStyle,
  virtualRowKey,
  virtualRowTop,
  virtualTotalHeight,
} from "./virtuallist-model";
import {
  isPendingFocusAdopted,
  resolveVirtualListKeyAction,
  shouldEmitAtBottom,
  virtualHostAttrs,
  virtualRowAttrs,
} from "./virtuallist-policy";
import "./doc-sel.css";
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
  /** 行视图。必须是稳定身份的 Component，读 props.item 就地更新。禁止 (item) => JSX 快照。 */
  renderRow: Component<{ item: T; index: number }>;
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
  /** 滚轴视口（YoScroller view）。投放命中读 scrollTop，禁止模块 querySelector 根类。 */
  hostRef?: (el: HTMLDivElement) => void;
  /**
   * 行铬。默认 document：虚拟化只负责视口，不画格子线。
   * Family B 文件清单显式 tone="list" 才有行间 hairline。
   * 禁止默认画线再让文档列表去关。
   */
  tone?: YoVirtualListTone;
  /**
   * 行热态 key（投放命中目录等）。与选中正交。
   * 行底走 YoListRow fill=hot；框走 YoListFrame 叠加层。禁止模块 --drop。
   */
  hotKey?: Accessor<string | number | null | undefined>;
  /**
   * 提供即开启整行按住拖动换位。点选仍走 onSelectRow；按下移动过臂距才抬起浮层。
   * 松手提交 from/to；原槽或 Escape 不回调。键盘 Ctrl/Meta+↑/↓ 同一入口。
   */
  onReorder?: (from: number, to: number) => void;
  /**
   * 文档行宽（px）。abspos 行不撑 scrollWidth，inner 必须显式宽。
   * >0 时 YoScroller axis=both，溢出才出底轨。0 / 缺省 = 只纵滚。
   */
  contentWidth?: Accessor<number>;
  /** 横滚偏移。表头跟文档一起滑。纵滚贴底不看这个。 */
  onInlineOffset?: (left: number) => void;
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
  const [focusKey, setFocusKey] = createSignal<string | number | null>(null);
  const [barReady, setBarReady] = createSignal(false);
  const [indicatorHot, setIndicatorHot] = createSignal<"hover" | "pressed" | undefined>();
  let container: HTMLDivElement | undefined;
  let indicatorPressed = false;
  let pendingFocusKey: string | number | null = null;
  let focusAttempts = 0;
  let isAutoScrolling = false;
  let autoScrollReset = 0;
  let lastAtBottom = true;
  let slotCache: number[] = [];
  let scrollerHandle: YoScrollerHandle | undefined;

  const selectable = (): boolean =>
    isVirtualSelectable(
      props.selectedKey !== undefined,
      props.selectedKeys !== undefined,
      props.onSelectRow !== undefined,
    );

  const multi = (): boolean => isVirtualMulti(props.selectedKeys !== undefined);

  const selectedKeys = (): ReadonlySet<string | number> | undefined => props.selectedKeys?.();
  const selectedKey = (): string | number | null | undefined => props.selectedKey?.();

  const activeKey = createMemo(() => virtualActiveKey(selectedKeys(), selectedKey(), focusKey()));

  const measureAtBottom = (): boolean => {
    if (!container || !scrollerHandle) return true;
    return isStuckToBottom(totalHeight(), container.clientHeight, scrollerHandle.offset());
  };

  const emitAtBottom = (): void => {
    if (!props.onAtBottomChange) return;
    const atBottom = measureAtBottom();
    if (!shouldEmitAtBottom(isAutoScrolling, atBottom, lastAtBottom)) return;
    lastAtBottom = atBottom;
    props.onAtBottomChange(atBottom);
  };

  const snapToBottom = (): void => {
    if (!scrollerHandle) return;
    isAutoScrolling = true;
    scrollerHandle.scrollToEnd();
    setScrollTop(scrollerHandle.offset());
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

  createEffect(() => {
    void totalHeight();
    void innerWidth();
    const api = scrollerHandle;
    if (!api) return;
    queueMicrotask(() => api.sync());
  });

  createEffect(() => {
    if (scrollerAxis() === "block") {
      props.onInlineOffset?.(0);
    }
  });

  const poolSize = createMemo(() =>
    virtualPoolSize(viewportHeight(), itemHeight(), overscan(), props.items().length),
  );

  const slots = createMemo(() => {
    const size = poolSize();
    if (slotCache.length === size) return slotCache;
    slotCache = virtualPoolSlots(size);
    return slotCache;
  });

  const origin = createMemo(() =>
    virtualPoolOrigin(scrollTop(), itemHeight(), overscan(), props.items().length, poolSize()),
  );

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
    const key = virtualRowKey(item, index, props.getItemKey);
    setFocusKey(key);
    props.onSelectRow(item, key, event);
  };

  const tone = (): YoVirtualListTone => props.tone ?? "document";

  const followKey = (): string | undefined =>
    listRowOwnsFill(tone())
      ? undefined
      : virtualIndicatorFollow(selectable(), selectedKeys(), selectedKey());

  const viewContentWidth = (): number => {
    const el = container;
    if (!el) return 0;
    const style = getComputedStyle(el);
    const pad =
      (Number.parseFloat(style.paddingInlineStart) || 0) +
      (Number.parseFloat(style.paddingInlineEnd) || 0);
    return virtualContentWidth(el.clientWidth, pad);
  };

  const innerWidth = (): number => virtualInnerWidth(props.contentWidth?.() ?? 0, viewContentWidth());

  const scrollerAxis = (): "block" | "both" => (innerWidth() > 0 ? "both" : "block");

  const indicatorAnchor = (): IndicatorBox | null =>
    virtualIndicatorAnchor(
      props.items(),
      followKey(),
      itemHeight(),
      viewContentWidth(),
      props.getItemKey,
    );

  const frameBox = (): ReturnType<typeof listFrameBox> => {
    void scrollTop();
    void viewportHeight();
    const key = props.hotKey?.() ?? null;
    if (key == null || !container) return null;
    const index = virtualIndexOfKey(props.items(), key, props.getItemKey);
    if (index < 0) return null;
    return listFrameBox(virtualIndicatorBox(index, itemHeight(), viewContentWidth()));
  };

  const rowSnapshot = (row: { index: number; key: string | number }) => {
    const selected = isVirtualRowSelected(row.key, selectable(), selectedKeys(), selectedKey());
    return virtualRowAttrs({
      key: row.key,
      selectable: selectable(),
      selected,
      active: activeKey() === row.key,
      selectionEmpty: isVirtualSelectionEmpty(selectedKeys(), selectedKey()),
      isFirstVisible: row.index === origin(),
    });
  };

  const reorder = createReorderBinder({
    enabled: () => props.onReorder !== undefined,
    count: () => props.items().length,
    captureEl: () => container,
    layout: (from) => {
      const el = container;
      if (!el) return null;
      const box = el.getBoundingClientRect();
      const height = itemHeight();
      return {
        listTop: box.top,
        viewportHeight: el.clientHeight,
        sourceTop: rowTopInViewport(box.top, el.scrollTop, from, height),
        sourceHeight: height,
        insertIndex: (clientY) =>
          insertIndexFromPointerY(box.top, el.scrollTop, height, props.items().length, clientY),
        barOffset: (insert) => reorderBarOffset(insert, height),
      };
    },
    overlayOffset,
    onCommit: (from, to) => props.onReorder?.(from, to),
    onArmed: (from, key) => {
      if (!props.onSelectRow) return;
      const item = props.items()[from];
      if (item === undefined) return;
      setFocusKey(key);
      props.onSelectRow(item, key);
    },
  });

  const selectedFillRow = (event: Event): boolean => {
    if (!(event.target instanceof Element)) return false;
    const row = event.target.closest(".yohu-virtual-list__row");
    return row?.getAttribute("aria-selected") === "true";
  };

  const syncIndicatorHot = (event: Event): void => {
    if (followKey() == null || reorder.session() !== null) {
      setIndicatorHot(undefined);
      return;
    }
    if (!selectedFillRow(event)) {
      setIndicatorHot(undefined);
      return;
    }
    setIndicatorHot(indicatorPressed ? "pressed" : "hover");
  };

  const onIndicatorPointerOver = (event: PointerEvent): void => {
    syncIndicatorHot(event);
  };

  const onIndicatorPointerOut = (event: PointerEvent): void => {
    const row = event.target instanceof Element ? event.target.closest(".yohu-virtual-list__row") : null;
    const next = event.relatedTarget;
    if (row instanceof Node && next instanceof Node && row.contains(next)) return;
    if (indicatorPressed) return;
    setIndicatorHot(undefined);
  };

  const onIndicatorPointerDown = (event: PointerEvent): void => {
    indicatorPressed = selectedFillRow(event);
    syncIndicatorHot(event);
  };

  const onIndicatorPointerUp = (event: PointerEvent): void => {
    indicatorPressed = false;
    syncIndicatorHot(event);
  };

  const handleRowClick = (index: number, event: MouseEvent): void => {
    if (reorder.consumeClick()) return;
    if (!selectable()) return;
    pendingFocusKey = null;
    selectAt(index, event);
  };

  const handleRowPointerDown = (index: number, key: string | number, event: PointerEvent): void => {
    reorder.onPointerDown(index, key, event);
  };

  const handleRowKeyDown = (index: number, event: KeyboardEvent): void => {
    if (props.onReorder) {
      const moved = applyReorderKey(event.key, event.ctrlKey || event.metaKey, index, props.items().length);
      if (moved === "noop") return;
      if (moved) {
        event.preventDefault();
        props.onReorder(moved.from, moved.to);
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
    const index = virtualIndexOfKey(props.items(), pending, props.getItemKey);
    if (!container || !scrollerHandle || index < 0 || focusAttempts >= VIRTUAL_FOCUS_RETRY_LIMIT) {
      pendingFocusKey = null;
      return;
    }
    const height = itemHeight();
    const top = virtualNearestScrollTop(
      virtualRowTop(index, height),
      height,
      container.clientHeight,
      scrollerHandle.offset(),
    );
    if (top !== scrollerHandle.offset()) {
      scrollerHandle.scrollTo(top);
      setScrollTop(scrollerHandle.offset());
    }
    const el = findRowElement(pending);
    if (!el) {
      focusAttempts += 1;
      setFocusTick((tick) => tick + 1);
      return;
    }
    el.focus({ preventScroll: true });
    pendingFocusKey = null;
  });

  createEffect(() => {
    void scrollTop();
    void origin();
    if (!selectable() || !container) return;
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !container.contains(focused)) return;
    if (!focused.classList.contains("yohu-virtual-list__row")) return;
    const active = activeKey();
    const key = focused.dataset.key;
    if (active != null && key === String(active)) return;
    if (active == null && focused.tabIndex === 0) return;
    if (active != null) {
      const next = findRowElement(active);
      if (next) {
        next.focus({ preventScroll: true });
        return;
      }
    }
    focused.blur();
  });

  const handleScroll = (): void => {
    if (!container) return;
    setScrollTop(container.scrollTop);
    setViewportHeight(container.clientHeight);
    props.onInlineOffset?.(container.scrollLeft);
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
      reorder.destroy();
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
      reordering: reorder.session() !== null,
    });

  type BoundRow = { index: number; item: T; key: string | number };

  const RowView = (rowProps: { bound: Accessor<BoundRow | undefined> }) => {
    const bound = (): BoundRow | undefined => rowProps.bound();
    const attrs = () => {
      const current = bound();
      return current
        ? rowSnapshot(current)
        : virtualRowAttrs({
            key: "slot",
            selectable: false,
            selected: false,
            active: false,
            selectionEmpty: true,
            isFirstVisible: false,
          });
    };
    return (
      <YoListRow
        class="yohu-virtual-list__row"
        tone={tone()}
        selected={attrs().selected && followKey() == null}
        hot={isListRowHot(attrs()["data-key"], props.hotKey?.() ?? null)}
        selectable={attrs().interactive}
        selectedKeys={selectedKeys()}
        dataKey={attrs()["data-key"]}
        dataReorder={reorder.session()?.key === bound()?.key ? "source" : undefined}
        role={attrs().role}
        ariaSelected={attrs()["aria-selected"]}
        tabIndex={attrs().tabIndex}
        style={(() => {
          const current = bound();
          const drag = reorder.session();
          const shift =
            drag && current ? shiftForReorder(current.index, drag.from, previewDest(drag)) : 0;
          return virtualRowBoxStyle(current?.index ?? 0, itemHeight(), shift, current != null);
        })()}
        onPointerDown={(event) => {
          const current = bound();
          if (current) handleRowPointerDown(current.index, current.key, event);
        }}
        onClick={(event) => {
          const current = bound();
          if (current) handleRowClick(current.index, event);
        }}
        onContextMenu={(event) => {
          const current = bound();
          if (!current || !props.onRowContextMenu) return;
          event.preventDefault();
          event.stopPropagation();
          props.onRowContextMenu(current.item, current.key, event);
        }}
        onKeyDown={(event) => {
          const current = bound();
          if (current) handleRowKeyDown(current.index, event);
        }}
      >
        <Show when={bound()}>
          {(current) => (
            <Dynamic
              component={props.renderRow}
              item={current().item}
              index={current().index}
            />
          )}
        </Show>
      </YoListRow>
    );
  };

  return (
    <div
      class="yohu-virtual-list"
      data-tone={host()["data-tone"]}
      data-reordering={host()["data-reordering"]}
      data-indicator={followKey() != null && reorder.session() === null ? "fill" : undefined}
      data-indicator-hot={
        followKey() != null && reorder.session() === null ? indicatorHot() : undefined
      }
      role={host().role}
      onPointerOver={onIndicatorPointerOver}
      onPointerOut={onIndicatorPointerOut}
      onPointerDown={onIndicatorPointerDown}
      onPointerUp={onIndicatorPointerUp}
      onPointerCancel={onIndicatorPointerUp}
      aria-label={host()["aria-label"]}
      aria-multiselectable={host()["aria-multiselectable"]}
    >
      <YoScroller
        axis={scrollerAxis()}
        handle={(api) => {
          scrollerHandle = api;
        }}
        viewRef={(el) => {
          container = el;
          props.hostRef?.(el);
          el.addEventListener("scroll", handleScroll, { passive: true });
          onCleanup(() => {
            el.removeEventListener("scroll", handleScroll);
          });
        }}
      >
      <div
        class="yohu-virtual-list__inner"
        style={{
          height: `${totalHeight()}px`,
          ...(innerWidth() > 0 ? { width: `${innerWidth()}px`, "min-width": "100%" } : {}),
        }}
      >
        <Show when={followKey() != null && reorder.session() === null}>
          <YoIndicator decorate={false} follow={followKey()} variant="fill" anchor={indicatorAnchor} />
        </Show>
        <Show when={frameBox() != null && reorder.session() === null}>
          <YoListFrame box={frameBox} />
        </Show>
        <Show when={props.onReorder}>
          <ReorderBar
            open={reorder.session() !== null && !reorder.isHome()}
            y={reorder.barY()}
            ready={barReady()}
          />
        </Show>
        <For each={slots()}>
          {(slot) => {
            const bound = createMemo(() => {
              const items = props.items();
              const index = virtualPoolIndex(origin(), slot);
              const item = items[index];
              if (item === undefined) return undefined;
              return { index, item, key: virtualRowKey(item, index, props.getItemKey) };
            });
            return <RowView bound={bound} />;
          }}
        </For>
      </div>
      </YoScroller>
      <Show when={reorder.session()}>
        {(current) => {
          const item = (): T | undefined => props.items()[current().from];
          return (
            <Show when={item()}>
              {(dragged) => (
                <ReorderOverlay
                  open
                  ready={barReady()}
                  y={reorder.overlayY()}
                  height={reorder.overlayHeight()}
                >
                  <Dynamic
                    component={props.renderRow}
                    item={dragged()}
                    index={current().from}
                  />
                </ReorderOverlay>
              )}
            </Show>
          );
        }}
      </Show>
    </div>
  );
}
