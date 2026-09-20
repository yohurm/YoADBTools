import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

import { createVirtualIndicatorHotBinder } from "./virtuallist-hot";

const dir = dirname(fileURLToPath(import.meta.url));

function fire(target: EventTarget, type: string): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event as PointerEvent;
}

describe("virtuallist-hot", () => {
  const nodes: HTMLElement[] = [];

  afterEach(() => {
    for (const node of nodes) node.remove();
    nodes.length = 0;
  });

  it("binder 只出热态，不画铬、不穿 :has", () => {
    const src = readFileSync(resolve(dir, "virtuallist-hot.ts"), "utf-8");
    expect(src).toContain("resolveVirtualIndicatorHot");
    expect(src).toContain("aria-selected");
    expect(src).not.toContain(":has(");
    expect(src).not.toContain("background");
    expect(src).not.toContain("getComputedStyle");
  });

  it("选中填充行 hover / pressed；未选中清空", () => {
    createRoot((dispose) => {
      const hot = createVirtualIndicatorHotBinder({
        follow: () => true,
        reordering: () => false,
      });
      const row = document.createElement("div");
      row.className = "yohu-virtual-list__row";
      row.setAttribute("aria-selected", "true");
      const other = document.createElement("div");
      other.className = "yohu-virtual-list__row";
      other.setAttribute("aria-selected", "false");
      document.body.append(row, other);
      nodes.push(row, other);

      hot.onPointerOver(fire(row, "pointerover"));
      expect(hot.hot()).toBe("hover");
      hot.onPointerDown(fire(row, "pointerdown"));
      expect(hot.hot()).toBe("pressed");
      hot.onPointerUp(fire(row, "pointerup"));
      expect(hot.hot()).toBe("hover");
      hot.onPointerOver(fire(other, "pointerover"));
      expect(hot.hot()).toBeUndefined();
      dispose();
    });
  });

  it("换位中不写热态", () => {
    createRoot((dispose) => {
      const hot = createVirtualIndicatorHotBinder({
        follow: () => true,
        reordering: () => true,
      });
      const row = document.createElement("div");
      row.className = "yohu-virtual-list__row";
      row.setAttribute("aria-selected", "true");
      document.body.append(row);
      nodes.push(row);
      hot.onPointerOver(fire(row, "pointerover"));
      expect(hot.hot()).toBeUndefined();
      dispose();
    });
  });
});
