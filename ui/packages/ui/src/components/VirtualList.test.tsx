import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { YoVirtualList } from "./VirtualList";

// jsdom 未实现 scrollIntoView（键盘导航滚入视野依赖它）
const scrollIntoViewMock = vi.fn();
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  value: scrollIntoViewMock,
  writable: true,
  configurable: true,
});

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
      renderRow={(item) => <span>{item}</span>}
    />
  );
}

function options(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('[role="option"]'));
}

describe("YoVirtualList", () => {
  it("虚拟化：仅渲染可视区（含 overscan）内的行", () => {
    const items = makeItems(100);
    const { container } = render(() => (
      <YoVirtualList items={() => items} itemHeight={22} renderRow={(item) => <span>{item}</span>} />
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
        renderRow={(item) => <span>{item}</span>}
      />
    ));
    expect(container.querySelector(".yohu-virtual-list")?.getAttribute("data-tone")).toBe("list");
  });

  it("默认 CSS 不画行线，只有 tone=list 才画", () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "VirtualList.css"), "utf-8");
    expect(css).toMatch(
      /\.yohu-virtual-list__row \{\s*box-sizing: border-box;\s*overflow: hidden;\s*\}/,
    );
    expect(css).toMatch(/\[data-tone="list"\] \.yohu-virtual-list__row \{\s*border-bottom:/);
    expect(css).toMatch(
      /\[data-tone="document"\]:not\(\[role="listbox"\]\) \{\s*user-select: text;\s*cursor: text;\s*\}/,
    );
    expect(css).toMatch(
      /\[data-tone="document"\]:not\(\[role="listbox"\]\) \.yohu-virtual-list__row \{\s*user-select: text;\s*cursor: text;\s*\}/,
    );
    expect(css).toMatch(/\[role="listbox"\][\s\S]*user-select: none;/);
  });

  it("items 换新数组时相同 key 的行节点保持同一引用", async () => {
    const [items, setItems] = createSignal(["a", "b", "c"]);
    const { container } = render(() => (
      <YoVirtualList
        items={items}
        itemHeight={22}
        getItemKey={(item) => item}
        renderRow={(item) => <span data-text={item}>{item}</span>}
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

  it("getItemKey 写入 data-key", () => {
    const items = makeItems(20);
    const { container } = render(() => (
      <YoVirtualList
        items={() => items}
        itemHeight={22}
        getItemKey={(item) => `key-${item}`}
        renderRow={(item) => <span>{item}</span>}
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
        renderRow={(item) => <span>{item}</span>}
      />
    ));
    const list = container.querySelector(".yohu-virtual-list") as HTMLElement;
    Object.defineProperty(list, "scrollHeight", { value: 22000, configurable: true, writable: true });
    setItems(["a", "b", "c"]);
    await Promise.resolve();
    expect(list.scrollTop).toBe(22000);
  });

  it("离开底部 onAtBottomChange(false)，回到底部时 true", () => {
    const onAtBottom = vi.fn();
    const items = makeItems(100);
    const { container } = render(() => (
      <YoVirtualList
        items={() => items}
        itemHeight={22}
        onAtBottomChange={onAtBottom}
        renderRow={(item) => <span>{item}</span>}
      />
    ));
    const list = container.querySelector(".yohu-virtual-list") as HTMLElement;
    Object.defineProperty(list, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(list, "scrollHeight", { value: 2200, configurable: true });
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
      <YoVirtualList items={() => items} itemHeight={22} renderRow={(item) => <span>{item}</span>} />
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
    expect(rows[0]?.classList.contains("yohu-interactive")).toBe(true);
    expect(rows[0]?.getAttribute("aria-selected")).toBe("false");
    expect(rows[0]?.getAttribute("tabindex")).toBe("0");
    expect(rows[1]?.getAttribute("tabindex")).toBe("-1");
  });

  it("点击行触发 onSelectRow 并更新 aria-selected 与 roving tabindex", async () => {
    const { container } = render(() => <SelectionHarness />);
    const rows = options(container);
    fireEvent.click(rows[2] as HTMLElement);
    await Promise.resolve();
    expect(rows[2]?.getAttribute("aria-selected")).toBe("true");
    expect(rows[2]?.classList.contains("yohu-interactive--selected")).toBe(true);
    expect(rows[2]?.classList.contains("yohu-virtual-list__row--selected")).toBe(false);
    expect(rows[2]?.getAttribute("tabindex")).toBe("0");
    expect(rows[0]?.getAttribute("tabindex")).toBe("-1");
    expect(rows[0]?.getAttribute("aria-selected")).toBe("false");
    expect(container.querySelector(".yohu-virtual-list__inner .yohu-recipe-indicator--fill")).toBeTruthy();
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
    const rows = options(container);
    fireEvent.keyDown(rows[0] as HTMLElement, { key: "End" });
    await Promise.resolve();
    await Promise.resolve();
    const last = container.querySelector('[data-key="59"]');
    expect(last?.getAttribute("aria-selected")).toBe("true");
    expect(scrollIntoViewMock).toHaveBeenCalled();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last as HTMLElement, { key: "Home" });
    await Promise.resolve();
    await Promise.resolve();
    const first = container.querySelector('[data-key="0"]');
    expect(first?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(first);
  });

  it("多选连续行挂 sel-start/mid/end，孤立行不挂", () => {
    const items = makeItems(8);
    const selected = new Set<string | number>(["row-1", "row-2", "row-3", "row-5"]);
    const { container } = render(() => (
      <YoVirtualList
        items={() => items}
        itemHeight={22}
        getItemKey={(item) => item}
        selectedKeys={() => selected}
        onSelectRow={() => undefined}
        renderRow={(item) => <span>{item}</span>}
      />
    ));
    const row = (key: string): HTMLElement | null => container.querySelector(`[data-key="${key}"]`);
    expect(row("row-1")?.classList.contains("yohu-interactive--sel-start")).toBe(true);
    expect(row("row-2")?.classList.contains("yohu-interactive--sel-mid")).toBe(true);
    expect(row("row-3")?.classList.contains("yohu-interactive--sel-end")).toBe(true);
    expect(row("row-5")?.classList.contains("yohu-interactive--selected")).toBe(true);
    expect(row("row-5")?.classList.contains("yohu-interactive--sel-start")).toBe(false);
    expect(row("row-5")?.classList.contains("yohu-interactive--sel-mid")).toBe(false);
    expect(row("row-5")?.classList.contains("yohu-interactive--sel-end")).toBe(false);
    expect(row("row-0")?.classList.contains("yohu-interactive--selected")).toBe(false);
  });
});
