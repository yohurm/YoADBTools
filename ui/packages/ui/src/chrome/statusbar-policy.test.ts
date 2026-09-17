import { describe, expect, it } from "vitest";
import { statusbarHostAttrs } from "./statusbar-policy";

describe("statusbar-policy", () => {
  it("宿主标记 status 角色", () => {
    expect(statusbarHostAttrs()).toEqual({ "data-role": "status" });
  });
});
