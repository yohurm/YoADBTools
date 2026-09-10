import { describe, expect, it } from "vitest";
import { resolveStatusBarSlots, statusbarHostAttrs } from "./statusbar-policy";

describe("statusbar-policy", () => {
  it("宿主标记 status 角色", () => {
    expect(statusbarHostAttrs()).toEqual({ "data-role": "status" });
  });

  it("左右只读槽按有无内容开闭", () => {
    expect(resolveStatusBarSlots({})).toEqual({ hasLeft: false, hasRight: false });
    expect(resolveStatusBarSlots({ left: true, right: true })).toEqual({
      hasLeft: true,
      hasRight: true,
    });
  });
});
