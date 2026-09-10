import { describe, expect, it } from "vitest";
import { loadingHostAttrs } from "./loading-policy";

describe("loading-policy", () => {
  it("默认 status + busy，不铺满", () => {
    expect(loadingHostAttrs({ title: "加载中" })).toEqual({
      role: "status",
      "aria-busy": true,
      "aria-live": "polite",
      "data-cover": undefined,
    });
  });

  it("cover 写入 data-cover", () => {
    expect(loadingHostAttrs({ title: "加载中", cover: true })["data-cover"]).toBe(true);
  });
});
