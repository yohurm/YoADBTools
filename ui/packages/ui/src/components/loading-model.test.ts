import { describe, expect, it } from "vitest";
import { resolveLoadingSpec } from "./loading-model";

describe("loading-model", () => {
  it("缺省不铺满、没有描述", () => {
    expect(resolveLoadingSpec({ title: "加载中" })).toEqual({
      title: "加载中",
      description: undefined,
      cover: false,
    });
  });

  it("空字符串描述视为没有描述", () => {
    expect(resolveLoadingSpec({ title: "加载中", description: "" }).description).toBeUndefined();
  });

  it("cover 铺满", () => {
    expect(resolveLoadingSpec({ title: "加载中", description: "请稍候", cover: true })).toEqual({
      title: "加载中",
      description: "请稍候",
      cover: true,
    });
  });
});
