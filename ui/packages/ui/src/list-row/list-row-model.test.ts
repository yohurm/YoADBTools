import { describe, expect, it } from "vitest";

import { isListRowHot, listRowOwnsFill, resolveListRowChrome } from "./list-row-model";

describe("list-row-model", () => {
  it("缺省无底，半径恒 0", () => {
    expect(resolveListRowChrome({})).toEqual({ fill: "none", radius: 0 });
  });

  it("选中只填底", () => {
    expect(resolveListRowChrome({ selected: true })).toEqual({
      fill: "selected",
      radius: 0,
    });
  });

  it("热态盖过选中，只改底，不带环", () => {
    expect(resolveListRowChrome({ selected: true, hot: true })).toEqual({
      fill: "hot",
      radius: 0,
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
