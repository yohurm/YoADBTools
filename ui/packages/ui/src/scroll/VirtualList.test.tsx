import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { createSignal, type Component } from "solid-js";
import { overlayOffset, pointerContentY, rowTopInViewport } from "./reorder-model";
import { YoVirtualList } from "./VirtualList";
import { virtualNearestScrollTop } from "./virtuallist-model";

Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
  value: () => undefined,
  writable: true,
  configurable: true,
});
Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
  value: () => undefined,
  writable: true,
  configurable: true,
});

const TestRow: Component<{ item: string; index: number }> = (props) => (
  <span data-text={props.item}>{props.item}</span>
);

function makeItems(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `row-${i}`);
}

/** 选择模式测试载体：selectedKey 由父级信号驱动（与真实调用方一致）。 */
function SelectionHarness(props: { count?: number }) {
  const [selected, setSelected] = createSignal<string | number | null>(null);
  const items = makeItems(props.count ?? 60);
  return (
    <YoVirtualList
      items={() => items}
      itemHeight={22}
      ariaLabel="测试列表"
      selectedKey={selected}
      onSelectRow={(_, key) => setSelected(key)}
      renderRow={TestRow}
    />
  );
}

function options(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('[role="option"]'));
}

function scroller(container: HTMLElement): HTMLElement {
  return container.querySelector(".yohu-scroller__view") as HTMLElement;
}

/** jsdom 无 PointerEvent；clientY / pointerId 直接写到 Event 上。 */
function firePointer(
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup",
  clientY: number,
  pointerId = 1,
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clientY", { configurable: true, value: clientY });
  Object.defineProperty(event, "button", { configurable: true, value: 0 });
  Object.defineProperty(event, "pointerId", { configurable: true, value: pointerId });
  target.dispatchEvent(event);
}

describe("YoVirtualList", () => {
  it("虚拟化：仅渲染可视区（含 overscan）内的行", () => {
    const items = makeItems(100);
    const { container } = render(() => (
      <YoVirtualList items={() => items} itemHeight={22} renderRow={TestRow} />
    ));
    const rows = container.querySelectorAll(".yohu-virtual-list__row");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(100);
    expect(screen.getByText("row-0")).toBeTruthy();
    expect(screen.queryByText("row-50")).toBeNull();
    expect(container.querySelector(".yohu-virtual-list")?.getAttribute("data-tone")).toBe("document");
  });

  it("文件清单显式 tone=list 才画行间线", () => {
    const items = makeItems(8);
    const { container } = render(() => (
      <YoVirtualList
        items={() => items}
        itemHeight={22}
        tone="list"
        renderRow={TestRow}
      />
    ));
    expect(container.querySelector(".yohu-virtual-list")?.getAttribute("data-tone")).toBe("list");
  });

  it("自持 YoScroller：产品条在清单内，宿主不是滚口", () => {
    const { container } = render(() => (
      <YoVirtualList items={() => makeItems(8)} itemHeight={22} renderRow={TestRow} />
    ));
    expect(container.querySelector(".yohu-virtual-list .yohu-scroller")).not.toBeNull();
    expect(container.querySelector(".yohu-scroller__thumb")?.getAttribute("role")).toBe("scrollbar");
    expect(container.querySelector(".yohu-virtual-list")?.classList.contains("yohu-scroller")).toBe(false);
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "VirtualList.tsx"), "utf-8");
    expect(src).toContain("from \"./Scroller\"");
    expect(src).not.toContain('state="on"');
    expect(src).not.toContain("onWheel");
    expect(src).not.toContain("resolveScrollerWheelDelta");
    expect(src).not.toContain("scrollHeight");
    expect(src).not.toContain("container.scrollTop =");
    expect(src).toContain("scrollToEnd");
    expect(src).toContain("scrollTo(");
    expect(src).toContain("virtualNearestScrollTop");
    expect(src).toContain("virtualContentWidth");
    expect(src).toContain("queueMicrotask(() => api.sync())");
    expect(src).toContain("preventScroll: true");
    expect(src).not.toContain("scrollIntoView");
  });

  it("VirtualList.css 只管槽位几何，行铬不在本文件", () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "VirtualList.css"), "utf-8");
    expect(css).toMatch(/\.yohu-virtual-list__row \{\s*position: absolute;\s*top: 0;\s*left: 0;\s*right: 0;\s*\}/);
    expect(css).toMatch(
      /\[data-tone="document"\]:not\(\[role="listbox"\]\):not\(\[data-reordering\]\) \{\s*user-select: text;\s*cursor: text;\s*\}/,
    );
    expect(css).toMatch(
      /\[data-tone="document"\]:not\(\[role="listbox"\]\):not\(\[data-reordering\]\) \.yohu-virtual-list__row \{\s*user-select: text;\s*cursor: text;\s*\}/,
    );
    expect(css).toMatch(/\[role="listbox"\]:not\(\[data-reordering\]\) \{\s*user-select: none;/);
    expect(css).toMatch(/\.yohu-virtual-list \{[\s\S]*?overflow:\s*hidden;/);
    expect(css).not.toContain("!important");
    expect(css).not.toContain(":has(.yohu-list-row");
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).not.toMatch(/overflow-y\s*:\s*auto/);
    expect(css).not.toContain("scrollbar-width");
    expect(css).not.toContain("::-webkit-scrollbar");
    expect(css).not.toContain("scrollbar-gutter");
    expect(css.match(/\.yohu-virtual-list__inner\s*\{[^}]*\}/)?.[0] ?? "").not.toContain("overflow");
    expect(css).not.toMatch(/\.yohu-virtual-list \{[\s\S]*?overflow:\s*auto;/);
    expect(css).not.toContain("yohu-virtual-list__scroll");
    expect(css).not.toContain("--yohu-motion-spatial-small");
    expect(css).not.toContain("--yohu-state-reorder-source");
    expect(css).not.toContain("cursor: grabbing");
    expect(css).not.toContain("yohu-focus-ring");
    expect(css).not.toContain("yohu-interactive");
    expect(css).not.toContain("border-radius");
    expect(css).not.toContain("border-bottom");
    expect(css).not.toContain("[data-tone=\"list\"]");
  });

  it("槽位行 inline 绝对定位，Y 走 translate3d", () => {
    const { container } = render(() => <SelectionHarness count={8} />);
    const row = container.querySelector(".yohu-virtual-list__row") as HTMLElement;
    expect(row.style.position).toBe("absolute");
    expect(row.style.top).toBe("0px");
    expect(row.style.transform).toBe("translate3d(0, 0px, 0)");
    expect(row.classList.contains("yohu-list-row")).toBe(true);
    expect(row.classList.contains("yohu-interactive")).toBe(false);
    expect(row.classList.contains("yohu-focus-ring--inset")).toBe(false);
  });

  it("items 换新数组时相同 key 的行节点保持同一引用", async () => {
    const [items, setItems] = createSignal(["a", "b", "c"]);
    const { container } = render(() => (
      <YoVirtualList
        items={items}
        itemHeight={22}
        getItemKey={(item) => item}
        renderRow={TestRow}
      />
    ));
    const before = container.querySelector('[data-key="b"]');
    const textNode = before?.querySelector("span")?.firstChild;
    expect(before).toBeTruthy();
    setItems(["a", "b", "c", "d"]);
    await Promise.resolve();
    const after = container.querySelector('[data-key="b"]');
    expect(after).toBe(before);
    expect(after?.querySelector("span")?.firstChild).toBe(textNode);
  });

  it("滚动时槽位行节点保持同一引用，只改 data-key", async () => {
    const items = makeItems(80);
    const selected = new Set<string | number>(items);
    const { container } = render(() => (
      <YoVirtualList
        items={() => items}
        itemHeight={20}
        overscan={2}
        getItemKey={(item) => item}
        selectedKeys={() => selected}
        onSelectRow={() => undefined}
        renderRow={TestRow}
      />
    ));
    const list = scroller(container);
    Object.defineProperty(list, "clientHeight", { value: 100, configurable: true });
    fireEvent.scroll(list);
    await Promise.resolve();
    const slot0 = container.querySelector(".yohu-virtual-list__row") as HTMLElement;
    const beforeKey = slot0.getAttribute("data-key");
    const inner = slot0.querySelector("span") as HTMLElement;
    const textNode = inner.firstChild;
    expect(beforeKey).toBe("row-0");
    Object.defineProperty(list, "scrollTop", { value: 80, configurable: true, writable: true });
    fireEvent.scroll(list);
    await Promise.resolve();
    const after = container.querySelector(".yohu-virtual-list__row") as HTMLElement;
    expect(after).toBe(slot0);
    expect(after.getAttribute("data-key")).not.toBe(beforeKey);
    expect(after.querySelector("span")).toBe(inner);
    expect(inner.firstChild).toBe(textNode);
  });

  it("getItemKey 写入 data-key", () => {
    const items = makeItems(20);
    const { container } = render(() => (
      <YoVirtualList
        items={() => items}
        itemHeight={22}
        getItemKey={(item) => `key-${item}`}
        renderRow={TestRow}
      />
    ));
    const first = container.querySelector(".yohu-virtual-list__row");
    expect(first?.getAttribute("data-key")).toBe("key-row-0");
  });

  it("autoScrollToBottom 时追加数据自动滚底", async () => {
    const [items, setItems] = createSignal<string[]>(["a"]);
    const { container } = render(() => (
      <YoVirtualList
        items={items}
        itemHeight={22}
        autoScrollToBottom={() => true}
        renderRow={TestRow}
      />
    ));
    const list = scroller(container);
    const inner = container.querySelector(".yohu-virtual-list__inner") as HTMLElement;
    Object.defineProperty(list, "clientHeight", { value: 20, configurable: true });
    Object.defineProperty(inner, "offsetHeight", { value: 66, configurable: true });
    setItems(["a", "b", "c"]);
    await Promise.resolve();
    expect(list.scrollTop).toBe(46);
  });

  it("离开底部 onAtBottomChange(false)，回到底部时 true", () => {
    const onAtBottom = vi.fn();
    const items = makeItems(100);
    const { container } = render(() => (
      <YoVirtualList
        items={() => items}
        itemHeight={22}
        onAtBottomChange={onAtBottom}
        renderRow={TestRow}
      />
    ));
    const list = scroller(container);
    Object.defineProperty(list, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(list, "scrollTop", { value: 0, configurable: true, writable: true });
    fireEvent.scroll(list);
    expect(onAtBottom).toHaveBeenCalledWith(false);

    Object.defineProperty(list, "scrollTop", { value: 2000, configurable: true, writable: true });
    fireEvent.scroll(list);
    expect(onAtBottom).toHaveBeenCalledWith(true);
  });

  it("未开启选择模式时无 listbox 语义、行不参与焦点序列", () => {
    const items = makeItems(30);
    const { container } = render(() => (
      <YoVirtualList items={() => items} itemHeight={22} renderRow={TestRow} />
    ));
    expect(container.querySelector(".yohu-virtual-list")?.getAttribute("role")).toBeNull();
    expect(container.querySelector(".yohu-virtual-list__row")?.hasAttribute("tabindex")).toBe(false);
  });

  it("选择模式：listbox/option 语义 + roving tabindex（未选中时首可视行可聚焦）", () => {
    const { container } = render(() => <SelectionHarness />);
    expect(container.querySelector(".yohu-virtual-list")?.getAttribute("role")).toBe("listbox");
    expect(container.querySelector(".yohu-virtual-list")?.getAttribute("aria-label")).toBe("测试列表");
    const rows = options(container);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.getAttribute("role")).toBe("option");
    expect(rows[0]?.classList.contains("yohu-list-row")).toBe(true);
    expect(rows[0]?.classList.contains("yohu-interactive")).toBe(false);
    expect(rows[0]?.classList.contains("yohu-focus-ring--inset")).toBe(false);
    expect(rows[0]?.getAttribute("aria-selected")).toBe("false");
    expect(rows[0]?.getAttribute("data-radius")).toBe("chip");
    expect(rows[0]?.getAttribute("tabindex")).toBe("0");
    expect(rows[1]?.getAttribute("tabindex")).toBe("-1");
  });

  it("点击行触发 onSelectRow 并更新 aria-selected 与 roving tabindex", async () => {
    const { container } = render(() => <SelectionHarness />);
    const rows = options(container);
    fireEvent.click(rows[2] as HTMLElement);
    await Promise.resolve();
    expect(rows[2]?.getAttribute("aria-selected")).toBe("true");
    expect(rows[2]?.classList.contains("yohu-list-row")).toBe(true);
    expect(rows[2]?.hasAttribute("data-fill")).toBe(false);
    expect(rows[2]?.classList.contains("yohu-interactive--selected")).toBe(false);
    expect(rows[2]?.classList.contains("yohu-virtual-list__row--selected")).toBe(false);
    expect(rows[2]?.getAttribute("tabindex")).toBe("0");
    expect(rows[0]?.getAttribute("tabindex")).toBe("-1");
    expect(rows[0]?.getAttribute("aria-selected")).toBe("false");
    expect(container.querySelector(".yohu-virtual-list .yohu-recipe-indicator--fill")).toBeTruthy();
    expect(container.querySelector(".yohu-virtual-list")?.getAttribute("data-indicator")).toBe("fill");
    expect(container.querySelector(".yohu-virtual-list")?.hasAttribute("data-indicator-hot")).toBe(false);
    expect(container.querySelector(".yohu-virtual-list")?.classList.contains("yohu-indicator-host")).toBe(false);
    expect(container.querySelector(".yohu-virtual-list__inner")?.classList.contains("yohu-indicator-host")).toBe(
      false,
    );
  });

  it("键盘 ArrowDown/ArrowUp 移动选中并聚焦目标行", async () => {
    const { container } = render(() => <SelectionHarness />);
    const rows = options(container);
    fireEvent.keyDown(rows[0] as HTMLElement, { key: "ArrowDown" });
    await Promise.resolve();
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
    expect(rows[1]?.getAttribute("tabindex")).toBe("0");
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1] as HTMLElement, { key: "ArrowUp" });
    await Promise.resolve();
    expect(rows[0]?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(rows[0]);
  });

  it("Enter/Space 选中当前行", async () => {
    const { container } = render(() => <SelectionHarness />);
    const rows = options(container);
    fireEvent.keyDown(rows[0] as HTMLElement, { key: "Enter" });
    await Promise.resolve();
    expect(rows[0]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(rows[1] as HTMLElement, { key: " " });
    await Promise.resolve();
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
  });

  it("Home/End 跳到首尾行：目标行在虚拟化外时滚动渲染后聚焦", async () => {
    const { container } = render(() => <SelectionHarness count={60} />);
    const list = scroller(container);
    const inner = container.querySelector(".yohu-virtual-list__inner") as HTMLElement;
    Object.defineProperty(list, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(inner, "offsetHeight", { value: 60 * 22, configurable: true });
    const rows = options(container);
    fireEvent.keyDown(rows[0] as HTMLElement, { key: "End" });
    await Promise.resolve();
    await Promise.resolve();
    const last = container.querySelector('[data-key="59"]');
    expect(last?.getAttribute("aria-selected")).toBe("true");
    expect(list.scrollTop).toBe(virtualNearestScrollTop(59 * 22, 22, 200, 0));
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last as HTMLElement, { key: "Home" });
    await Promise.resolve();
    await Promise.resolve();
    const first = container.querySelector('[data-key="0"]');
    expect(first?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(first);
  });

  it("中间视口键盘落到视口外：已滚过再 nearest，且无 scrollIntoView", async () => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: () => undefined,
      writable: true,
      configurable: true,
    });
    const intoView = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    const { container } = render(() => <SelectionHarness count={60} />);
    const list = scroller(container);
    const inner = container.querySelector(".yohu-virtual-list__inner") as HTMLElement;
    const itemHeight = 22;
    const view = 200;
    const mid = 20 * itemHeight;
    Object.defineProperty(list, "clientHeight", { value: view, configurable: true });
    Object.defineProperty(inner, "offsetHeight", { value: 60 * itemHeight, configurable: true });
    Object.defineProperty(list, "scrollTop", { value: mid, configurable: true, writable: true });
    fireEvent.scroll(list);
    await Promise.resolve();
    const inView = container.querySelector('[data-key="20"]') as HTMLElement;
    fireEvent.click(inView);
    await Promise.resolve();
    expect(inView.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(inView, { key: "ArrowUp" });
    await Promise.resolve();
    await Promise.resolve();
    const above = container.querySelector('[data-key="19"]');
    const expected = virtualNearestScrollTop(19 * itemHeight, itemHeight, view, mid);
    expect(expected).not.toBe(virtualNearestScrollTop(19 * itemHeight, itemHeight, view, 0));
    expect(list.scrollTop).toBe(expected);
    expect(above?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(above);
    expect(intoView).not.toHaveBeenCalled();
    intoView.mockRestore();
  });

  it("多选行自绘直角底，不挂 chip 邻接 class，也不挂滑块", () => {
    const items = makeItems(8);
    const selected = new Set<string | number>(["row-1", "row-2", "row-3", "row-5"]);
    const { container } = render(() => (
      <YoVirtualList
        items={() => items}
        itemHeight={22}
        getItemKey={(item) => item}
        selectedKeys={() => selected}
        onSelectRow={() => undefined}
        renderRow={TestRow}
      />
    ));
    const row = (key: string): HTMLElement | null => container.querySelector(`[data-key="${key}"]`);
    expect(row("row-1")?.getAttribute("data-fill")).toBe("selected");
    expect(row("row-5")?.getAttribute("data-fill")).toBe("selected");
    expect(row("row-0")?.hasAttribute("data-fill")).toBe(false);
    expect(row("row-1")?.hasAttribute("data-radius")).toBe(false);
    expect(row("row-1")?.classList.contains("yohu-interactive--sel-start")).toBe(false);
    expect(row("row-1")?.classList.contains("yohu-focus-ring--inset")).toBe(false);
    expect(container.querySelector(".yohu-recipe-indicator")).toBeNull();
    expect(container.querySelector(".yohu-virtual-list")?.classList.contains("yohu-indicator-host")).toBe(false);
    expect(container.querySelector(".yohu-virtual-list__inner")?.classList.contains("yohu-indicator-host")).toBe(
      false,
    );
  });

  it("tone=list 自绘选中底，hotKey 走 list-frame 叠加层", () => {
    const items = makeItems(4);
    const selected = new Set<string | number>(["row-1"]);
    const { container } = render(() => (
      <YoVirtualList
        items={() => items}
        itemHeight={22}
        tone="list"
        getItemKey={(item) => item}
        selectedKeys={() => selected}
        hotKey={() => "row-2"}
        onSelectRow={() => undefined}
        renderRow={TestRow}
      />
    ));
    const list = scroller(container);
    Object.defineProperty(list, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(list, "clientHeight", { value: 200, configurable: true });
    fireEvent.scroll(list);
    const row = (key: string): HTMLElement | null => container.querySelector(`[data-key="${key}"]`);
    expect(row("row-1")?.getAttribute("data-fill")).toBe("selected");
    expect(row("row-1")?.hasAttribute("data-radius")).toBe(false);
    expect(row("row-2")?.getAttribute("data-fill")).toBe("hot");
    expect(row("row-2")?.hasAttribute("data-ring")).toBe(false);
    expect(container.querySelector(".yohu-list-frame")).toBeTruthy();
    expect(container.querySelector(".yohu-recipe-indicator--fill")).toBeNull();
    expect(container.querySelector(".yohu-virtual-list")?.getAttribute("data-indicator")).toBeNull();
  });

  it("选中行指针热态写 data-indicator-hot，不穿 :has list-row", async () => {
    const indicatorCss = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../motion/engines/indicator/indicator.css"),
      "utf-8",
    );
    expect(indicatorCss).toContain('[data-indicator-hot="hover"] .yohu-recipe-indicator--fill');
    expect(indicatorCss).toContain('[data-indicator-hot="pressed"] .yohu-recipe-indicator--fill');
    expect(indicatorCss).not.toContain(":has(.yohu-list-row");

    const { container } = render(() => <SelectionHarness />);
    const rows = options(container);
    fireEvent.click(rows[2] as HTMLElement);
    await Promise.resolve();
    const host = container.querySelector(".yohu-virtual-list") as HTMLElement;
    fireEvent.pointerOver(rows[2] as HTMLElement);
    expect(host.getAttribute("data-indicator-hot")).toBe("hover");
    fireEvent.pointerOver(rows[0] as HTMLElement);
    expect(host.hasAttribute("data-indicator-hot")).toBe(false);
    fireEvent.pointerOver(rows[2] as HTMLElement);
    fireEvent.pointerDown(rows[2] as HTMLElement);
    expect(host.getAttribute("data-indicator-hot")).toBe("pressed");
    fireEvent.pointerUp(rows[2] as HTMLElement);
    expect(host.getAttribute("data-indicator-hot")).toBe("hover");
    fireEvent.pointerOut(rows[2] as HTMLElement);
    expect(host.hasAttribute("data-indicator-hot")).toBe(false);
  });

  it("未提供 onReorder 时不挂拖拽条", () => {
    const items = makeItems(4);
    const { container } = render(() => (
      <YoVirtualList items={() => items} itemHeight={22} renderRow={TestRow} />
    ));
    expect(container.querySelector(".yohu-recipe-reorder-bar")).toBeNull();
  });

  it("onReorder：过臂距才抬浮层，缝间插条，松手提交 from/to", () => {
    const onReorder = vi.fn();
    const items = ["a", "b", "c"];
    const { container } = render(() => (
      <YoVirtualList
        items={() => items}
        itemHeight={22}
        getItemKey={(item) => item}
        selectedKey={() => "a"}
        onSelectRow={() => undefined}
        onReorder={onReorder}
        renderRow={TestRow}
      />
    ));
    const host = container.querySelector(".yohu-virtual-list") as HTMLElement;
    const list = scroller(container);
    vi.spyOn(list, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      bottom: 66,
      right: 100,
      width: 100,
      height: 66,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    });
    Object.defineProperty(list, "scrollTop", { value: 0, configurable: true, writable: true });
    const bar = container.querySelector(".yohu-recipe-reorder-bar");
    expect(bar).toBeTruthy();
    expect(bar?.hasAttribute("data-open")).toBe(false);
    const row = container.querySelector('[data-key="a"]') as HTMLElement;
    firePointer(row, "pointerdown", 4);
    expect(bar?.hasAttribute("data-open")).toBe(false);
    firePointer(window, "pointermove", 12);
    expect(host.hasAttribute("data-reordering")).toBe(true);
    expect(row.getAttribute("data-reorder")).toBe("source");
    expect(container.querySelector(".yohu-recipe-reorder-overlay")?.hasAttribute("data-open")).toBe(
      true,
    );
    expect(bar?.hasAttribute("data-open")).toBe(false);
    firePointer(window, "pointermove", 60);
    expect(bar?.hasAttribute("data-open")).toBe(true);
    expect(row.style.transform).toBe("translate3d(0, 0px, 0)");
    expect((container.querySelector('[data-key="b"]') as HTMLElement).style.transform).toBe(
      "translate3d(0, 0px, 0)",
    );
    expect((container.querySelector('[data-key="c"]') as HTMLElement).style.transform).toBe(
      "translate3d(0, 22px, 0)",
    );
    firePointer(window, "pointerup", 60);
    expect(onReorder).toHaveBeenCalledWith(0, 2);
    expect(host.hasAttribute("data-reordering")).toBe(false);
    expect(bar?.hasAttribute("data-open")).toBe(false);
    expect(container.querySelector(".yohu-recipe-reorder-overlay")).toBeNull();
  });

  it("换位：viewTop≠0 / scrollTop≠0 时插缝与 overlay 走视口代数", () => {
    const onReorder = vi.fn();
    const items = ["a", "b", "c"];
    const { container } = render(() => (
      <YoVirtualList
        items={() => items}
        itemHeight={22}
        getItemKey={(item) => item}
        selectedKey={() => "a"}
        onSelectRow={() => undefined}
        onReorder={onReorder}
        renderRow={TestRow}
      />
    ));
    const host = container.querySelector(".yohu-virtual-list") as HTMLElement;
    const list = scroller(container);
    vi.spyOn(list, "getBoundingClientRect").mockReturnValue({
      top: 80,
      left: 0,
      bottom: 146,
      right: 100,
      width: 100,
      height: 66,
      x: 0,
      y: 80,
      toJSON() {
        return {};
      },
    });
    Object.defineProperty(list, "scrollTop", { value: 40, configurable: true, writable: true });
    Object.defineProperty(list, "clientHeight", { value: 66, configurable: true });
    const bar = container.querySelector(".yohu-recipe-reorder-bar") as HTMLElement;
    const row = container.querySelector('[data-key="a"]') as HTMLElement;
    firePointer(row, "pointerdown", 44);
    firePointer(window, "pointermove", 52);
    expect(host.hasAttribute("data-reordering")).toBe(true);
    firePointer(window, "pointermove", 100);
    const overlay = container.querySelector(".yohu-recipe-reorder-overlay") as HTMLElement;
    const viewTop = 80;
    const scrollTop = 40;
    const itemHeight = 22;
    const viewportHeight = 66;
    const startY = 44;
    const grabOffset = startY - rowTopInViewport(viewTop, scrollTop, 0, itemHeight);
    const overlayTopAt = (pointerY: number): { viewport: string; content: string } => ({
      viewport: `${overlayOffset(pointerY, viewTop, grabOffset, itemHeight, viewportHeight)}px`,
      content: `${pointerContentY(viewTop, scrollTop, pointerY) - grabOffset}px`,
    });
    expect(overlay.closest(".yohu-scroller__view")).toBeNull();
    expect(overlay.closest(".yohu-virtual-list")).toBe(host);
    expect(bar.hasAttribute("data-open")).toBe(true);
    expect(bar.style.top).toBe("66px");
    const at100 = overlayTopAt(100);
    expect(at100.viewport).not.toBe(at100.content);
    expect(overlay.style.top).toBe(at100.viewport);
    expect(overlay.style.top).not.toBe(at100.content);
    firePointer(window, "pointerup", 100);
    expect(onReorder).toHaveBeenCalledWith(0, 2);
  });

  it("未过臂距不换位，点击仍选中", async () => {
    const onReorder = vi.fn();
    const onSelect = vi.fn();
    const items = ["a", "b", "c"];
    const { container } = render(() => (
      <YoVirtualList
        items={() => items}
        itemHeight={22}
        getItemKey={(item) => item}
        selectedKey={() => null}
        onSelectRow={(_, key) => onSelect(key)}
        onReorder={onReorder}
        renderRow={TestRow}
      />
    ));
    const row = container.querySelector('[data-key="b"]') as HTMLElement;
    firePointer(row, "pointerdown", 30, 2);
    firePointer(window, "pointermove", 33, 2);
    firePointer(window, "pointerup", 33, 2);
    fireEvent.click(row);
    await Promise.resolve();
    expect(onReorder).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("Ctrl/Meta+方向键换位，不抢普通方向键选区", () => {
    const onReorder = vi.fn();
    const { container } = render(() => (
      <YoVirtualList
        items={() => ["a", "b", "c"]}
        itemHeight={22}
        getItemKey={(item) => item}
        selectedKey={() => "a"}
        onSelectRow={() => undefined}
        onReorder={onReorder}
        renderRow={TestRow}
      />
    ));
    const row = container.querySelector('[data-key="a"]') as HTMLElement;
    fireEvent.keyDown(row, { key: "ArrowDown" });
    expect(onReorder).not.toHaveBeenCalled();
    fireEvent.keyDown(row, { key: "ArrowDown", ctrlKey: true });
    expect(onReorder).toHaveBeenCalledWith(0, 1);
    const next = container.querySelector('[data-key="b"]') as HTMLElement;
    fireEvent.keyDown(next, { key: "ArrowUp", metaKey: true });
    expect(onReorder).toHaveBeenCalledWith(1, 0);
  });

  it("Escape 取消换位", () => {
    const onReorder = vi.fn();
    const { container } = render(() => (
      <YoVirtualList
        items={() => ["a", "b", "c"]}
        itemHeight={22}
        getItemKey={(item) => item}
        selectedKey={() => "a"}
        onSelectRow={() => undefined}
        onReorder={onReorder}
        renderRow={TestRow}
      />
    ));
    const host = container.querySelector(".yohu-virtual-list") as HTMLElement;
    const list = scroller(container);
    vi.spyOn(list, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      bottom: 66,
      right: 100,
      width: 100,
      height: 66,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    });
    const row = container.querySelector('[data-key="a"]') as HTMLElement;
    firePointer(row, "pointerdown", 4);
    firePointer(window, "pointermove", 60);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onReorder).not.toHaveBeenCalled();
    expect(host.hasAttribute("data-reordering")).toBe(false);
  });
});
