import { describe, expect, it } from "vitest";

import { motionDurationMs } from "../tokens/motion";
import {
  MENU_TYPEAHEAD_WINDOW_MS,
  firstEnabledIndex,
  menuItemHostAttrs,
  menuKeyIntent,
  nextTypeaheadQuery,
} from "./menu-key-policy";

const ITEMS = [{ label: "复制" }, { label: "删除", disabled: true }, { label: "导出" }];

describe("menu-key-policy", () => {
  it("Esc / Tab 关闭；箭头与 Home/End 移动", () => {
    const input = { focusIndex: 0, items: ITEMS };
    expect(menuKeyIntent("Escape", input)).toEqual({ type: "close", reason: "escape" });
    expect(menuKeyIntent("Tab", input)).toEqual({ type: "close", reason: "tab" });
    expect(menuKeyIntent("ArrowDown", input)).toEqual({ type: "move", index: 2 });
    expect(menuKeyIntent("ArrowUp", input)).toEqual({ type: "move", index: 2 });
    expect(menuKeyIntent("Home", input)).toEqual({ type: "move", index: 0 });
    expect(menuKeyIntent("End", input)).toEqual({ type: "move", index: 2 });
  });

  it("Enter / Space 选中；单字符进 typeahead", () => {
    const input = { focusIndex: 0, items: ITEMS };
    expect(menuKeyIntent("Enter", input)).toEqual({ type: "select" });
    expect(menuKeyIntent(" ", input)).toEqual({ type: "select" });
    expect(menuKeyIntent("a", input)).toEqual({ type: "typeahead", char: "a" });
    expect(menuKeyIntent("ArrowLeft", input)).toBeNull();
  });

  it("修饰键按下时不抢箭头，仍允许 Esc", () => {
    expect(menuKeyIntent("ArrowDown", { focusIndex: 0, items: ITEMS, ctrlKey: true })).toBeNull();
    expect(menuKeyIntent("Escape", { focusIndex: 0, items: ITEMS, ctrlKey: true })).toEqual({
      type: "close",
      reason: "escape",
    });
  });

  it("typeahead 窗口点 MotionDuration.loop", () => {
    expect(MENU_TYPEAHEAD_WINDOW_MS).toBe(motionDurationMs("loop"));
    expect(nextTypeaheadQuery("c", "l", 10)).toBe("cl");
    expect(nextTypeaheadQuery("c", "l", MENU_TYPEAHEAD_WINDOW_MS + 1)).toBe("l");
  });

  it("条目宿主：危险项 data-tone，焦点才进 Tab 序", () => {
    expect(menuItemHostAttrs({ id: "del", label: "删除", danger: true }, true)).toEqual({
      role: "menuitem",
      disabled: false,
      tabindex: 0,
      "data-tone": "danger",
      "data-slot": "item",
    });
    expect(firstEnabledIndex(ITEMS)).toBe(0);
    expect(firstEnabledIndex([{ label: "x", disabled: true }])).toBe(0);
  });
});
