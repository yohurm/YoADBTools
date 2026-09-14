import { describe, expect, it } from "vitest";

import { DELETE_PREVIEW_LIMIT, dropDeleteName, visibleDeleteNames } from "./delete-targets";

describe("visibleDeleteNames", () => {
  it("未超上限时全量露出", () => {
    const names = ["a.png", "b.png"];
    expect(visibleDeleteNames(names, false)).toEqual({ shown: names, hidden: 0 });
  });

  it("折叠时只露前几项并回报隐藏数", () => {
    const names = Array.from({ length: DELETE_PREVIEW_LIMIT + 3 }, (_, i) => `f${i}.png`);
    expect(visibleDeleteNames(names, false)).toEqual({
      shown: names.slice(0, DELETE_PREVIEW_LIMIT),
      hidden: 3,
    });
  });

  it("展开后全量露出", () => {
    const names = Array.from({ length: DELETE_PREVIEW_LIMIT + 2 }, (_, i) => `f${i}.png`);
    expect(visibleDeleteNames(names, true)).toEqual({ shown: names, hidden: 0 });
  });
});

describe("dropDeleteName", () => {
  it("按名移除待删对象", () => {
    expect(dropDeleteName(["a.png", "b.png", "c.png"], "b.png")).toEqual(["a.png", "c.png"]);
  });

  it("没有该项时保持原名单", () => {
    expect(dropDeleteName(["a.png"], "missing.png")).toEqual(["a.png"]);
  });
});
