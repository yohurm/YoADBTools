import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { flattenVisible } from "./tree-model";
import {
  applyTreeKeyIntent,
  isTreeControlled,
  isTreeExpanded,
  resolveTreeKeyAction,
  toggleExpandedSet,
  treeActionIsFocus,
  treeActionIsToggle,
  treeRowAttrs,
} from "./tree-policy";

const TREE = [
  { key: "g", children: [{ key: "a" }, { key: "b" }] },
  { key: "c" },
];

describe("tree-policy", () => {
  it("受控展开跟传入 keys，非受控跟本地 set", () => {
    expect(isTreeControlled(undefined)).toBe(false);
    expect(isTreeControlled(["g"])).toBe(true);
    expect(isTreeExpanded("g", undefined, new Set(["g"]))).toBe(true);
    expect(isTreeExpanded("g", ["g"], new Set())).toBe(true);
    expect(isTreeExpanded("g", new Set(["c"]), new Set(["g"]))).toBe(false);
  });

  it("toggle 按稳定 key 增删", () => {
    const opened = toggleExpandedSet(new Set(), "g");
    expect(opened.has("g")).toBe(true);
    expect(toggleExpandedSet(opened, "g").has("g")).toBe(false);
  });

  it("选中只产出 selected 标志，不另给配方 class", () => {
    expect(treeRowAttrs({
      key: "a",
      selectedKey: "a",
      focusedKey: "a",
      hasChildren: false,
      expanded: false,
    })).toEqual({
      selected: true,
      focused: true,
      tabindex: 0,
      "aria-selected": true,
      "aria-expanded": undefined,
    });
  });

  it("键盘意图收成 focus / toggle / select", () => {
    const rows = flattenVisible(TREE, (key) => key === "g");
    expect(applyTreeKeyIntent({ type: "focus", index: 1 }, rows, "g")).toEqual({ type: "focus", key: "a" });
    expect(applyTreeKeyIntent({ type: "toggle" }, rows, "g")).toEqual({ type: "toggle", key: "g" });
    expect(applyTreeKeyIntent({ type: "select" }, rows, "a")).toEqual({ type: "select", key: "a" });
    expect(applyTreeKeyIntent({ type: "parent" }, rows, "a")).toEqual({ type: "focus", key: "g" });
  });

  it("从按键一次解析到动作", () => {
    const rows = flattenVisible(TREE, (key) => key === "g");
    expect(resolveTreeKeyAction("ArrowDown", rows, "g", null, () => true)?.key).toBe("a");
    expect(resolveTreeKeyAction("Enter", rows, "a", null, () => false)).toEqual({ type: "select", key: "a" });
    expect(resolveTreeKeyAction("Enter", rows, "g", null, () => true)).toEqual({ type: "toggle", key: "g" });
    expect(resolveTreeKeyAction("x", rows, "g", null, () => false)).toBeNull();
  });

  it("焦点与开合各判一次", () => {
    expect(treeActionIsFocus({ type: "focus", key: "a" })).toBe(true);
    expect(treeActionIsToggle({ type: "toggle", key: "g" })).toBe(true);
    expect(treeActionIsFocus({ type: "select", key: "a" })).toBe(false);
    expect(treeActionIsToggle({ type: "focus", key: "a" })).toBe(false);
  });
});

describe("树开合与焦点只在所属层判定", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("视图不再比较动作种类和点击开合", () => {
    for (const name of ["tree-model.ts", "tree-policy.ts", "Tree.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      body = body.replaceAll('return action.type === "focus"', "");
      body = body.replaceAll('return action.type === "toggle"', "");
      body = body.replaceAll('return treeActivateIntent(hasChildren) === "toggle"', "");
      expect(body, name).not.toContain('action.type === "focus"');
      expect(body, name).not.toContain('action.type === "toggle"');
      expect(body, name).not.toContain('action.type === "select"');
      expect(body, name).not.toContain('treeActivateIntent(hasChildren) === "toggle"');
    }
  });
});
