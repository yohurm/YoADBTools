import { describe, expect, it } from "vitest";

import {
  applySelectEscape,
  applySelectKey,
  closeSelect,
  idleSelectSession,
  openSelect,
  selectHostAttrs,
  selectIsDisabled,
  toggleSelect,
} from "./select-policy";

const OPTIONS = [
  { value: "a", label: "A" },
  { value: "b", label: "B" },
  { value: "c", label: "C" },
];

describe("select-policy", () => {
  it("禁用同时关掉开合", () => {
    expect(selectIsDisabled(true)).toBe(true);
    expect(toggleSelect(false, OPTIONS, "a", true)).toEqual(idleSelectSession());
    expect(applySelectKey("ArrowDown", idleSelectSession(), OPTIONS, "a", true)).toEqual({
      type: "none",
    });
    expect(applySelectEscape(true, true)).toBeNull();
  });

  it("点击开合：打开时活动项落到选中；再点关闭", () => {
    expect(openSelect(OPTIONS, "b")).toEqual({ open: true, activeIndex: 1 });
    expect(toggleSelect(false, OPTIONS, "c")).toEqual({ open: true, activeIndex: 2 });
    expect(toggleSelect(true, OPTIONS, "c")).toEqual(closeSelect());
  });

  it("闭合态方向键只展开，不步进", () => {
    expect(applySelectKey("ArrowDown", idleSelectSession(), OPTIONS, "a")).toEqual({
      type: "session",
      session: { open: true, activeIndex: 0 },
    });
  });

  it("展开态方向键步进；Home/End 到首尾", () => {
    const open = { open: true, activeIndex: 0 };
    expect(applySelectKey("ArrowDown", open, OPTIONS, "a")).toEqual({
      type: "session",
      session: { open: true, activeIndex: 1 },
    });
    expect(applySelectKey("End", open, OPTIONS, "a")).toEqual({
      type: "session",
      session: { open: true, activeIndex: 2 },
    });
    expect(applySelectKey("Home", { open: true, activeIndex: 2 }, OPTIONS, "a")).toEqual({
      type: "session",
      session: { open: true, activeIndex: 0 },
    });
  });

  it("Enter/Space 闭合态开合，展开态提交活动项", () => {
    expect(applySelectKey("Enter", idleSelectSession(), OPTIONS, "a")).toEqual({
      type: "session",
      session: { open: true, activeIndex: 0 },
    });
    expect(applySelectKey(" ", { open: true, activeIndex: 1 }, OPTIONS, "a")).toEqual({
      type: "commit",
      value: "b",
      session: closeSelect(),
    });
  });

  it("Tab 提交活动项并关闭", () => {
    expect(applySelectKey("Tab", { open: true, activeIndex: 2 }, OPTIONS, "a")).toEqual({
      type: "commit",
      value: "c",
      session: closeSelect(),
    });
    expect(applySelectKey("Tab", idleSelectSession(), OPTIONS, "a")).toEqual({ type: "none" });
  });

  it("Esc 只在展开且未禁用时关闭", () => {
    expect(applySelectEscape(true)).toEqual(closeSelect());
    expect(applySelectEscape(false)).toBeNull();
  });

  it("宿主只写 data-disabled / data-block", () => {
    expect(selectHostAttrs({})).toEqual({
      "data-disabled": undefined,
      "data-block": undefined,
    });
    expect(selectHostAttrs({ disabled: true, block: true })).toEqual({
      "data-disabled": "",
      "data-block": "",
    });
  });
});
