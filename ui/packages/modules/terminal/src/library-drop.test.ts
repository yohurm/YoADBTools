import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { NativeDragDropEvent } from "@yohu/api";

import { type PointerRect } from "@yohu/ui";

import { dragHitsPane, droppedPaths } from "./library-drop";

const pane: PointerRect = { left: 0, top: 0, right: 100, bottom: 80 };

describe("命令库投放命中", () => {
  it("栏内 over 为热态，栏外与 leave 不是", () => {
    const over = { type: "over", position: { x: 40, y: 20 } } as NativeDragDropEvent;
    expect(dragHitsPane(over, pane, 1)).toBe(true);
    expect(dragHitsPane(over, pane, 2)).toBe(true);
    const outside = { type: "over", position: { x: 400, y: 20 } } as NativeDragDropEvent;
    expect(dragHitsPane(outside, pane, 1)).toBe(false);
    expect(dragHitsPane({ type: "leave" } as NativeDragDropEvent, pane, 1)).toBe(false);
  });

  it("物理点按 scale 换算后才命中", () => {
    const over = { type: "enter", paths: ["a.json"], position: { x: 150, y: 20 } } as NativeDragDropEvent;
    expect(dragHitsPane(over, pane, 2)).toBe(true);
    expect(dragHitsPane(over, pane, 1)).toBe(false);
  });

  it("松手只在栏内交出路径", () => {
    const inside = {
      type: "drop",
      paths: ["C:\\Desktop\\Nori_CommandLibrary.json"],
      position: { x: 10, y: 10 },
    } as NativeDragDropEvent;
    expect(droppedPaths(inside, pane, 1)).toEqual(["C:\\Desktop\\Nori_CommandLibrary.json"]);
    const outside = { ...inside, position: { x: 500, y: 10 } } as NativeDragDropEvent;
    expect(droppedPaths(outside, pane, 1)).toBeUndefined();
  });

  it("点是否在栏内只换算一次", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "library-drop.ts"), "utf8");
    expect(src.match(/cssPointFromPhysical\(/g)?.length ?? 0).toBe(1);
    expect(src.match(/pointInRect\(/g)?.length ?? 0).toBe(1);
  });
});

describe("松手事件只认一次", () => {
  it("event_is_drop_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "library-drop.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("dragEventIsDrop(" + "event)")).toBe(1);
    expect(times("function eventIsDrop")).toBe(1);
    expect(times("export function eventIsDrop")).toBe(0);
    expect(times("eventIsDrop(event)")).toBe(2);
  });
});

describe("没有栏矩形只判一次", () => {
  it("pane_missing_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "library-drop.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("return " + "!rect")).toBe(1);
    expect(times("function paneMissing")).toBe(1);
    expect(times("export function paneMissing")).toBe(0);
    expect(times("paneMissing(rect)")).toBe(2);
  });
});

describe("热态关掉只写一次", () => {
  it("clear_hot_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "library-drop.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("setHot(" + "false)")).toBe(1);
    expect(times("function clearHot")).toBe(1);
    expect(times("export function clearHot")).toBe(0);
    expect(times("clearHot()")).toBe(4);
  });
});
