import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@solidjs/testing-library";
import type { Component } from "solid-js";
import { YoReorderList } from "./ReorderList";

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
      <YoReorderList items={() => items} getItemKey={(item) => item} onReorder={onReorder} renderRow={TestRow} />
    ));
    const host = container.querySelector(".yohu-reorder-list") as HTMLElement;
    mockBox(host, 0, 144);
    Object.defineProperty(host, "scrollTop", { value: 0, configurable: true, writable: true });
    Object.defineProperty(host, "clientHeight", { value: 144, configurable: true });
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
    expect(css).toMatch(/\.yohu-reorder-list \{[\s\S]*?overflow:\s*auto;/);
    expect(css).toMatch(/\.yohu-reorder-list \{[\s\S]*?scrollbar-width:\s*none;/);
    expect(css).toContain(".yohu-reorder-list::-webkit-scrollbar");
    expect(css).not.toContain("--yohu-motion-spatial-small");
    expect(css).not.toContain("--yohu-state-reorder-source");
    expect(css).not.toContain("cursor: grabbing");
    expect(css).not.toContain("prefers-reduced-motion");
  });

  it("Ctrl/Meta+方向键换位，无常驻手柄", () => {
    const onReorder = vi.fn();
    const { container } = render(() => (
      <YoReorderList items={() => ["a", "b", "c"]} getItemKey={(item) => item} onReorder={onReorder} renderRow={TestRow} />
    ));
    expect(container.querySelector("[data-icon='grip']")).toBeNull();
    const row = container.querySelector('[data-key="a"]') as HTMLElement;
    fireEvent.keyDown(row, { key: "ArrowDown", ctrlKey: true });
    expect(onReorder).toHaveBeenCalledWith(0, 1);
  });
});
