import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { spaceKey } from "./chord";
import {
  clampListIndex,
  dismissKey,
  enabledIndexes,
  horizontalListDelta,
  itemIsEnabled,
  enterKey,
  listActivateKey,
  listEdgeIndex,
  tabKey,
  listEdgeIsStart,
  listEdgeKey,
  stepWrappedIndex,
  verticalListDelta,
} from "./list-index";

function productionSources(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) {
      out.push(...productionSources(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name) || name.includes(".test.") || name === "list-index.ts") continue;
    out.push(readFileSync(full, "utf8"));
  }
  return out;
}

describe("clampListIndex", () => {
  it("停在两端，空表为 -1", () => {
    expect(clampListIndex(0, 0)).toBe(-1);
    expect(clampListIndex(-3, 5)).toBe(0);
    expect(clampListIndex(9, 5)).toBe(4);
    expect(clampListIndex(2, 5)).toBe(2);
  });

  it("首尾只在 listEdgeIsStart 里比较", () => {
    expect(listEdgeIsStart("start")).toBe(true);
    expect(listEdgeIsStart("end")).toBe(false);
    expect(listEdgeIndex(3, "start")).toBe(0);
    expect(listEdgeIndex(3, "end")).toBe(2);
    expect(listEdgeIndex(0, "end")).toBe(-1);
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    for (const src of productionSources(root)) {
      expect(src).not.toContain('edge === "start"');
      expect(src).not.toContain("from + delta +");
      expect(src).not.toContain("items[i]?.disabled");
      expect(src).not.toContain("item.disabled");
      expect(src).not.toContain("% count");
      expect(src).not.toContain("% items.length");
      expect(src).not.toContain("count - 1");
      expect(src).not.toContain('case "ArrowDown"');
      expect(src).not.toContain('case "ArrowUp"');
      expect(src).not.toContain('case "ArrowLeft"');
      expect(src).not.toContain('case "ArrowRight"');
      expect(src).not.toContain('case "Home"');
      expect(src).not.toContain('case "End"');
      expect(src).not.toContain('key === "ArrowDown"');
      expect(src).not.toContain('key === "ArrowUp"');
      expect(src).not.toContain('key === "ArrowLeft"');
      expect(src).not.toContain('key === "ArrowRight"');
      expect(src).not.toContain('key === "Home"');
      expect(src).not.toContain('key === "End"');
      expect(src).not.toContain('case "Enter"');
      expect(src).not.toContain('case " "');
      expect(src).not.toContain('key === "Escape"');
      expect(src).not.toContain('key !== "Escape"');
      expect(src).not.toContain('key === "Enter"');
      expect(src).not.toContain('key !== "Enter"');
      expect(src).not.toContain('event.key === "Enter" || event.key === " "');
    }
  });

  it("循环步进停在步长里", () => {
    expect(stepWrappedIndex(0, 0, 1)).toBe(-1);
    expect(stepWrappedIndex(3, 2, 1)).toBe(0);
    expect(stepWrappedIndex(3, 0, -1)).toBe(2);
    expect(stepWrappedIndex(3, -1, 1)).toBe(0);
  });

  it("没禁用的下标只在 enabledIndexes 里收集", () => {
    expect(itemIsEnabled(undefined)).toBe(false);
    expect(itemIsEnabled({})).toBe(true);
    expect(itemIsEnabled({ disabled: true })).toBe(false);
    expect(enabledIndexes([{ disabled: true }, {}, { disabled: false }])).toEqual([1, 2]);
    expect(enabledIndexes([])).toEqual([]);
  });

  it("方向键和首尾键只在列表下标里认", () => {
    expect(verticalListDelta("ArrowDown")).toBe(1);
    expect(verticalListDelta("ArrowUp")).toBe(-1);
    expect(verticalListDelta("ArrowRight")).toBeNull();
    expect(horizontalListDelta("ArrowRight")).toBe(1);
    expect(horizontalListDelta("ArrowLeft")).toBe(-1);
    expect(listEdgeKey("Home")).toBe("start");
    expect(listEdgeKey("End")).toBe("end");
    expect(listEdgeKey("PageDown")).toBeNull();
  });

  it("确认键和取消键只在列表下标里认", () => {
    expect(enterKey("Enter")).toBe(true);
    expect(enterKey(" ")).toBe(false);
    expect(spaceKey(" ")).toBe(true);
    expect(spaceKey("Enter")).toBe(false);
    const chord = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "chord.ts"), "utf8").replace(
      'return key === " ";',
      "",
    );
    expect(chord).not.toContain('key === " "');
    const keys = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "list-index.ts"), "utf8");
    expect(keys).not.toContain('key === " "');
    expect(listActivateKey("Enter")).toBe(true);
    expect(listActivateKey(" ")).toBe(true);
    expect(listActivateKey("a")).toBe(false);
    expect(dismissKey("Escape")).toBe(true);
    expect(dismissKey("Enter")).toBe(false);
    expect(tabKey("Tab")).toBe(true);
    expect(tabKey("Enter")).toBe(false);
    const here = dirname(fileURLToPath(import.meta.url));
    const roots = [resolve(here, "../../../workbench/src"), resolve(here, "../../../modules")];
    for (const root of roots) {
      for (const src of productionSources(root)) {
        expect(src).not.toContain('case "Enter"');
        expect(src).not.toContain('case " "');
        expect(src).not.toContain('key === "Escape"');
        expect(src).not.toContain('key !== "Escape"');
        expect(src).not.toContain('key === "Enter"');
        expect(src).not.toContain('key !== "Enter"');
        expect(src).not.toContain('event.key === "Enter" || event.key === " "');
      }
    }
  });

  it("Tab 与 Escape 的否定式只留在列表键", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const root = resolve(here, "..");
    const dirs = [
      "form",
      "basic",
      "overlay",
      "navigation",
      "chrome",
      "feedback",
      "display",
      "container",
      "blank",
      "context-menu",
      "keymap",
      "search",
    ];
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name) || name.includes(".test.")) continue;
        files.push(full);
      }
    };
    for (const dir of dirs) walk(resolve(root, dir));
    for (const full of files) {
      let body = readFileSync(full, "utf8");
      if (full.endsWith("list-index.ts")) body = body.replace('return key === "Tab";', "");
      expect(body, full).not.toContain('key === "Tab"');
      expect(body, full).not.toContain('event.key === "Tab"');
      expect(body, full).not.toContain('case "Tab"');
      expect(body, full).not.toContain('event.key !== "Escape"');
    }
  });
});
