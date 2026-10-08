import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyReorderKey,
  beginReorderSession,
  canReorderList,
  commitReorderSession,
  isHomeInsert,
  moveReorderSession,
  previewDest,
  reorderBarAttrs,
  reorderSlotAttr,
  reorderSourceAttr,
  reorderOverlayAttrs,
  resolveReorderKeyDelta,
  reorderResultIsNoop,
  shouldAcceptReorderPointer,
  shouldBeginReorderFromTarget,
  shouldCancelReorder,
} from "./reorder-policy";

describe("reorder-policy", () => {
  it("两项以上才接受主键拖动", () => {
    expect(canReorderList(1)).toBe(false);
    expect(shouldAcceptReorderPointer(0, 2)).toBe(true);
    expect(shouldAcceptReorderPointer(2, 3)).toBe(false);
  });

  it("会话只在离开原槽时提交", () => {
    const started = beginReorderSession(0, "a");
    expect(started).toEqual({ from: 0, insert: 0, key: "a" });
    expect(isHomeInsert(started)).toBe(true);
    expect(commitReorderSession(started)).toBeNull();
    const neighbor = moveReorderSession(started, 1);
    expect(isHomeInsert(neighbor)).toBe(true);
    expect(commitReorderSession(neighbor)).toBeNull();
    const moved = moveReorderSession(started, 3);
    expect(previewDest(moved)).toBe(2);
    expect(commitReorderSession(moved)).toEqual({ from: 0, to: 2 });
  });

  it("条与浮层 attrs 只在 open 时写 data-open", () => {
    expect(reorderSlotAttr(true)).toBe("placeholder");
    expect(reorderSlotAttr(false)).toBeUndefined();
    expect(reorderSourceAttr(true)).toBe("source");
    expect(reorderSourceAttr(false)).toBeUndefined();
    expect(reorderBarAttrs(true, 64)).toEqual({
      "data-open": "",
      style: { top: "64px" },
    });
    expect(reorderOverlayAttrs(true, 12, 32).style).toEqual({ top: "12px", height: "32px" });
    expect(reorderBarAttrs(false, 64)["data-open"]).toBeUndefined();
  });

  it("换位键只认修饰 + 方向；Escape 取消", () => {
    expect(resolveReorderKeyDelta("ArrowUp", false)).toBeNull();
    expect(resolveReorderKeyDelta("ArrowDown", true)).toBe(1);
    expect(shouldCancelReorder("Escape")).toBe(true);
    expect(shouldCancelReorder("ArrowUp")).toBe(false);
  });

  it("applyReorderKey 夹取两端，一项不换", () => {
    expect(applyReorderKey("ArrowDown", false, 0, 3)).toBeNull();
    expect(applyReorderKey("ArrowUp", true, 0, 3)).toBe("noop");
    expect(applyReorderKey("ArrowDown", true, 2, 3)).toBe("noop");
    expect(applyReorderKey("ArrowDown", true, 0, 1)).toBe("noop");
    expect(applyReorderKey("ArrowDown", true, 0, 3)).toEqual({ from: 0, to: 1 });
    expect(applyReorderKey("ArrowUp", true, 2, 3)).toEqual({ from: 2, to: 1 });
  });

  it("行内输入/按钮不开始换位", () => {
    const input = document.createElement("input");
    const button = document.createElement("button");
    const row = document.createElement("div");
    expect(shouldBeginReorderFromTarget(row)).toBe(true);
    expect(shouldBeginReorderFromTarget(input)).toBe(false);
    expect(shouldBeginReorderFromTarget(button)).toBe(false);
  });

  it("空操作只在 reorderResultIsNoop 里比较", () => {
    expect(reorderResultIsNoop("noop")).toBe(true);
    expect(reorderResultIsNoop(null)).toBe(false);
    expect(reorderResultIsNoop({ from: 0, to: 1 })).toBe(false);
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of readdirSync(dir)) {
      if (!/\.tsx?$/.test(name) || name.includes(".test.") || name === "reorder-policy.ts") continue;
      expect(readFileSync(join(dir, name), "utf8"), name).not.toContain('=== "noop"');
    }
  });
});
