import { describe, expect, it } from "vitest";

import {
  isListRowHot,
  listRowOwnsFill,
  resolveListRowChrome,
  resolveListRowRadius,
} from "./list-row-model";

describe("list-row-model", () => {
  it("缺省无底，半径 none", () => {
    expect(resolveListRowChrome({})).toEqual({ fill: "none", radius: "none" });
  });

  it("选中只填底", () => {
    expect(resolveListRowChrome({ selected: true })).toEqual({
      fill: "selected",
      radius: "none",
    });
  });

  it("热态盖过选中，只改底，不带环", () => {
    expect(resolveListRowChrome({ selected: true, hot: true })).toEqual({
      fill: "hot",
      radius: "none",
    });
  });

  it("document 可选单选：半径 chip，跟 fill 滑块同一族", () => {
    expect(resolveListRowRadius({ selectable: true })).toBe("chip");
    expect(resolveListRowChrome({ selectable: true, selected: true })).toEqual({
      fill: "selected",
      radius: "chip",
    });
    expect(resolveListRowRadius({ selectable: true, selectedKeys: new Set(["only"]) })).toBe("chip");
  });

  it("list 或 document 多选块：直角通栏", () => {
    expect(resolveListRowRadius({ tone: "list", selectable: true })).toBe("none");
    expect(resolveListRowRadius({ selectable: true, selectedKeys: new Set(["a", "b"]) })).toBe(
      "none",
    );
    expect(resolveListRowChrome({ tone: "list", selectable: true, selected: true })).toEqual({
      fill: "selected",
      radius: "none",
    });
  });

  it("热态按 key 精确命中", () => {
    expect(isListRowHot("docs", "docs")).toBe(true);
    expect(isListRowHot("docs", "other")).toBe(false);
    expect(isListRowHot("docs", null)).toBe(false);
    expect(isListRowHot("docs", undefined)).toBe(false);
    expect(isListRowHot(2, 2)).toBe(true);
    expect(isListRowHot(2, "2")).toBe(false);
  });

  it("只有 list 行自绘选中底", () => {
    expect(listRowOwnsFill("list")).toBe(true);
    expect(listRowOwnsFill("document")).toBe(false);
    expect(listRowOwnsFill()).toBe(false);
  });
});
