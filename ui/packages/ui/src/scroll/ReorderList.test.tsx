import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal, type Component } from "solid-js";
import { YoReorderList } from "./ReorderList";
import {
  contentTopInViewport,
  overlayOffset,
  pointerContentY,
} from "./reorder-model";
import { YoScroller } from "./Scroller";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ReorderList.css"), "utf-8");

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

function mockBox(el: Element, top: number, height: number): void {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    top,
    left: 0,
    bottom: top + height,
    right: 100,
    width: 100,
    height,
    x: 0,
    y: top,
    toJSON() {
      return {};
    },
  });
}

describe("YoReorderList", () => {
  it("过臂距才抬浮层，变高缝插条，松手提交 from/to", () => {
    const onReorder = vi.fn();
    const items = ["a", "b", "c"];
    const { container } = render(() => (
      <YoScroller>
        <YoReorderList items={() => items} getItemKey={(item) => item} onReorder={onReorder} renderRow={TestRow} />
      </YoScroller>
    ));
    const host = container.querySelector(".yohu-reorder-list") as HTMLElement;
    const view = container.querySelector(".yohu-scroller__view") as HTMLElement;
    mockBox(view, 0, 144);
    mockBox(host, 0, 144);
    Object.defineProperty(view, "scrollTop", { value: 0, configurable: true, writable: true });
    Object.defineProperty(view, "clientHeight", { value: 144, configurable: true });
    const rows = [...container.querySelectorAll<HTMLElement>(".yohu-reorder-list__row")];
    mockBox(rows[0]!, 0, 40);
    mockBox(rows[1]!, 40, 80);
    mockBox(rows[2]!, 120, 24);

    const bar = container.querySelector(".yohu-recipe-reorder-bar");
    expect(bar).toBeTruthy();
    firePointer(rows[0]!, "pointerdown", 8);
    firePointer(window, "pointermove", 20);
    expect(host.hasAttribute("data-reordering")).toBe(true);
    expect(rows[0]!.getAttribute("data-reorder")).toBe("source");
    expect(container.querySelector(".yohu-recipe-reorder-overlay")?.hasAttribute("data-open")).toBe(true);
    firePointer(window, "pointermove", 140);
    expect(bar?.hasAttribute("data-open")).toBe(true);
    expect(rows[0]!.style.transform).toBe("");
    expect(rows[1]!.style.transform).toBe("translateY(-40px)");
    expect(rows[2]!.style.transform).toBe("translateY(-40px)");
    firePointer(window, "pointerup", 140);
    expect(onReorder).toHaveBeenCalledWith(0, 2);
    expect(host.hasAttribute("data-reordering")).toBe(false);
  });

  it("行盒相对视口顶 + scrollTop，插缝与条钉内容坐标", () => {
    const onReorder = vi.fn();
    const items = ["a", "b", "c"];
    const { container } = render(() => (
      <YoScroller>
        <YoReorderList items={() => items} getItemKey={(item) => item} onReorder={onReorder} renderRow={TestRow} />
      </YoScroller>
    ));
    const host = container.querySelector(".yohu-reorder-list") as HTMLElement;
    const view = container.querySelector(".yohu-scroller__view") as HTMLElement;
    mockBox(view, 80, 144);
    mockBox(host, 40, 144);
    Object.defineProperty(view, "scrollTop", { value: 40, configurable: true, writable: true });
    Object.defineProperty(view, "clientHeight", { value: 144, configurable: true });
    const rows = [...container.querySelectorAll<HTMLElement>(".yohu-reorder-list__row")];
    mockBox(rows[0]!, 40, 40);
    mockBox(rows[1]!, 80, 80);
    mockBox(rows[2]!, 160, 24);

    const bar = container.querySelector(".yohu-recipe-reorder-bar") as HTMLElement;
    const viewTop = 80;
    const scrollTop = 40;
    const startY = 48;
    const sourceHeight = 40;
    const viewportHeight = 144;
    const sourceContentTop = pointerContentY(viewTop, scrollTop, 40);
    const sourceTopInViewport = contentTopInViewport(viewTop, scrollTop, sourceContentTop);
    const grabOffset = startY - sourceTopInViewport;
    const overlayTopAt = (pointerY: number): { viewport: string; content: string } => ({
      viewport: `${overlayOffset(pointerY, viewTop, grabOffset, sourceHeight, viewportHeight)}px`,
      content: `${pointerContentY(viewTop, scrollTop, pointerY) - grabOffset}px`,
    });

    firePointer(rows[0]!, "pointerdown", startY);
    firePointer(window, "pointermove", 60);
    expect(host.hasAttribute("data-reordering")).toBe(true);
    firePointer(window, "pointermove", 165);
    expect(bar.style.top).toBe("120px");
    const plane = container.querySelector(".yohu-scroller") as HTMLElement;
    const overlay = plane.querySelector(".yohu-recipe-reorder-overlay") as HTMLElement;
    expect(overlay).toBeTruthy();
    expect(host.getBoundingClientRect().top).not.toBe(view.getBoundingClientRect().top);
    expect(view.scrollTop).not.toBe(0);
    expect(view.contains(overlay)).toBe(false);
    expect(plane.contains(overlay)).toBe(true);
    expect(host.contains(overlay)).toBe(false);
    expect(overlay.closest(".yohu-reorder-list")).toBeNull();
    expect(overlay.closest(".yohu-scroller__view")).toBeNull();
    const at165 = overlayTopAt(165);
    expect(at165.viewport).not.toBe(at165.content);
    expect(overlay.style.top).toBe(at165.viewport);
    expect(overlay.style.top).not.toBe(at165.content);
    firePointer(window, "pointermove", 175);
    expect(bar.style.top).toBe("144px");
    const at175 = overlayTopAt(175);
    expect(at175.viewport).not.toBe(at175.content);
    expect(overlay.style.top).toBe(at175.viewport);
    expect(overlay.style.top).not.toBe(at175.content);
    firePointer(window, "pointerup", 175);
    expect(onReorder).toHaveBeenCalledWith(0, 2);
  });

  it("无 Port 时拖不动，不量行盒", () => {
    const onReorder = vi.fn();
    const { container } = render(() => (
      <YoReorderList items={() => ["a", "b", "c"]} getItemKey={(item) => item} onReorder={onReorder} renderRow={TestRow} />
    ));
    const host = container.querySelector(".yohu-reorder-list") as HTMLElement;
    const rows = [...container.querySelectorAll<HTMLElement>(".yohu-reorder-list__row")];
    const rowSpy = vi.spyOn(rows[0]!, "getBoundingClientRect");
    firePointer(rows[0]!, "pointerdown", 8);
    firePointer(window, "pointermove", 80);
    firePointer(window, "pointerup", 80);
    expect(host.hasAttribute("data-reordering")).toBe(false);
    expect(onReorder).not.toHaveBeenCalled();
    expect(rowSpy).not.toHaveBeenCalled();
  });

  it("点输入不开始换位", () => {
    const onReorder = vi.fn();
    const FieldRow: Component<{ item: string; index: number }> = (props) => (
      <input aria-label={`步骤 ${props.index + 1}`} value={props.item} />
    );
    const { container } = render(() => (
      <YoReorderList items={() => ["a", "b"]} onReorder={onReorder} renderRow={FieldRow} />
    ));
    const field = container.querySelector("input") as HTMLInputElement;
    firePointer(field, "pointerdown", 4);
    firePointer(window, "pointermove", 80);
    firePointer(window, "pointerup", 80);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("L4 只留布局，换位行铬不在本文件", () => {
    expect(css).toContain(".yohu-reorder-list__row");
    expect(css).toContain("position: relative");
    expect(css).toMatch(/\.yohu-reorder-list \{[\s\S]*?overflow:\s*hidden;/);
    expect(css).not.toContain("!important");
    expect(css).not.toContain(":has(");
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).not.toMatch(/overflow:\s*auto;/);
    expect(css).not.toMatch(/overflow-y\s*:\s*auto/);
    expect(css).not.toContain("scrollbar-width");
    expect(css).not.toContain("::-webkit-scrollbar");
    expect(css).not.toContain("--yohu-motion-spatial-small");
    expect(css).not.toContain("--yohu-state-reorder-source");
    expect(css).not.toContain("cursor: grabbing");
    expect(css).not.toContain("prefers-reduced-motion");
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ReorderList.tsx"), "utf-8");
    expect(src).toContain("useScrollerPort");
    expect(src).toContain("port.view()");
    expect(src).toContain("port.plane()");
    expect(src).toContain("<Portal mount={port.plane()}");
    expect(src).not.toContain("<Portal mount={port.view()}");
    expect(src).toMatch(/<Portal[\s\S]*<ReorderOverlay/);
    expect(src).toContain("port.scrollTop()");
    expect(src).toContain("pointerContentY(viewTop");
    expect(src).toContain("tabIndex={slot.present ? -1 : undefined}");
    expect(src).toContain("preventScroll");
    expect(src).not.toContain("scrollIntoView");
    expect(src).not.toContain("host.scrollTop");
    expect(src).not.toContain("container.getBoundingClientRect");
    expect(src).not.toContain("onWheel");
    expect(src).not.toContain("resolveScrollerWheelDelta");
    expect(src).not.toContain("container.scrollTop =");
    expect(src).not.toContain("yohu-scroller__view");
    expect(src).toContain("useListPresenceSlots");
    expect(src).not.toContain("list-presence-engine");
    expect(src).toContain('recipe="list"');
    expect(src).toContain("YoPresence");
    expect(src).toContain(":not([data-exiting])");
    expect(src).not.toContain("YoListPresence");
    expect(src).not.toContain("reconcileListPresenceSlots");
  });

  it("增删走行内 Presence list，浮层不套第二份", () => {
    const [items, setItems] = createSignal(["a"]);
    const { container } = render(() => (
      <YoReorderList items={items} getItemKey={(item) => item} onReorder={() => undefined} renderRow={TestRow} />
    ));
    expect(container.querySelectorAll('.yohu-presence[data-recipe="list"]').length).toBe(1);
    setItems(["a", "b"]);
    expect(screen.getByText("b")).toBeTruthy();
    expect(container.querySelectorAll('.yohu-presence[data-recipe="list"]').length).toBe(2);
    setItems(["b"]);
    expect(screen.queryByText("a")).toBeNull();
    expect(screen.getByText("b")).toBeTruthy();
  });

  it("Ctrl/Meta+方向键换位，无常驻手柄", () => {
    const onReorder = vi.fn();
    const { container } = render(() => (
      <YoReorderList items={() => ["a", "b", "c"]} getItemKey={(item) => item} onReorder={onReorder} renderRow={TestRow} />
    ));
    expect(container.querySelector("[data-icon='grip']")).toBeNull();
    const row = container.querySelector('[data-key="a"]') as HTMLElement;
    expect(row.tabIndex).toBe(-1);
    const focus = vi.spyOn(row, "focus");
    firePointer(row, "pointerdown", 8);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    firePointer(window, "pointerup", 8);
    fireEvent.keyDown(row, { key: "ArrowDown", ctrlKey: true });
    expect(onReorder).toHaveBeenCalledWith(0, 1);
  });
});
