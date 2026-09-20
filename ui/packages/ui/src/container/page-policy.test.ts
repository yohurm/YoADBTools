import { describe, expect, it } from "vitest";
import { pageHostAttrs } from "./page-policy";

describe("page-policy", () => {
  it("缺省只标 module，不写默认垫与列", () => {
    expect(pageHostAttrs()).toEqual({ "data-role": "module" });
  });

  it("设置页写出 margin 垫与阅读列帽", () => {
    expect(pageHostAttrs("settings")).toEqual({
      "data-role": "settings",
      "data-pad": "margin",
      "data-column": "measure",
    });
  });
});
